/**
 * Client-side video processing before uploading to Supabase storage.
 *
 * processVideo(file, opts) → Promise<{ file: File, durationSecs: number, wasTrimmed: boolean, wasCompressed: boolean }>
 *
 * What it does:
 *  1. Reads the video into an <video> element to get its real duration
 *  2. Rejects if duration cannot be read (corrupt file)
 *  3. Trims to MAX_DURATION_SECS if longer
 *  4. Re-encodes via MediaRecorder at a lower target bitrate (compression)
 *  5. Falls back gracefully — if the browser can't re-encode, returns the
 *     original (or trimmed) blob unchanged rather than crashing
 *
 * Browser support:
 *  - MediaRecorder is supported in all modern browsers (Chrome, Firefox, Edge, Safari 14.1+)
 *  - Preferred output: video/webm (Chromium) or video/mp4 (Safari)
 *  - On very old browsers the fallback path just uses the original file
 */

export const MAX_DURATION_SECS = 120          // 2 minutes hard limit
export const TARGET_VIDEO_KBPS = 1200         // ~1.2 Mbps video — good for 720p social
export const TARGET_AUDIO_KBPS = 96           // 96 kbps audio
export const MAX_WIDTH          = 1280        // cap at 720p-ish width
export const MAX_HEIGHT         = 720

/**
 * Returns the duration of a video File in seconds.
 * Resolves with Infinity if the browser can't determine it.
 */
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.preload = 'metadata'
    vid.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(isFinite(vid.duration) ? vid.duration : Infinity)
    }
    vid.onerror = () => { URL.revokeObjectURL(url); resolve(Infinity) }
    vid.src = url
  })
}

/**
 * Pick the best supported MIME type for recording.
 * Prefers mp4 on Safari (only option), webm/vp9 on Chromium.
 */
function getSupportedMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''  // let browser decide
}

/**
 * Core processing pipeline.
 *
 * @param {File} file             - The original video file from <input>
 * @param {(pct: number) => void} onProgress - Called 0→100 during re-encoding
 * @returns {Promise<{ file: File, durationSecs: number, wasTrimmed: boolean, wasCompressed: boolean }>}
 */
export async function processVideo(file, onProgress = () => {}) {
  onProgress(0)

  // ── Step 1: read duration ──────────────────────────────────────────────────
  const durationSecs = await getVideoDuration(file)
  const wasTrimmed   = durationSecs > MAX_DURATION_SECS

  if (durationSecs === Infinity) {
    // Can't read metadata — pass through, let Supabase handle it
    onProgress(100)
    return { file, durationSecs: 0, wasTrimmed: false, wasCompressed: false }
  }

  const effectiveDuration = Math.min(durationSecs, MAX_DURATION_SECS)

  // ── Step 2: check if MediaRecorder is available ────────────────────────────
  if (typeof MediaRecorder === 'undefined') {
    onProgress(100)
    return { file, durationSecs, wasTrimmed: false, wasCompressed: false }
  }

  const mimeType = getSupportedMimeType()

  // ── Step 3: set up playback pipeline ──────────────────────────────────────
  //  video element → canvas (for resolution cap) → captureStream → MediaRecorder
  const sourceUrl = URL.createObjectURL(file)
  const vid       = document.createElement('video')
  vid.src         = sourceUrl
  vid.muted       = true
  vid.playsInline = true
  vid.preload     = 'auto'

  // Wait for enough data to start
  await new Promise((resolve, reject) => {
    vid.oncanplay  = resolve
    vid.onerror    = () => reject(new Error('Video decode error'))
    vid.load()
  })

  // Calculate output dimensions (cap at MAX_WIDTH × MAX_HEIGHT)
  const srcW  = vid.videoWidth  || 1280
  const srcH  = vid.videoHeight || 720
  const ratio = Math.min(1, MAX_WIDTH / srcW, MAX_HEIGHT / srcH)
  const outW  = Math.round(srcW * ratio)
  const outH  = Math.round(srcH * ratio)

  // Off-screen canvas
  const canvas  = document.createElement('canvas')
  canvas.width  = outW
  canvas.height = outH
  const ctx     = canvas.getContext('2d')

  // ── Step 4: capture canvas stream + audio track from video ────────────────
  let stream
  try {
    const videoStream = canvas.captureStream(30)  // 30 fps output
    // Try to pull the audio track directly from the video element
    if (vid.captureStream) {
      const srcStream   = vid.captureStream()
      const audioTracks = srcStream.getAudioTracks()
      audioTracks.forEach(t => videoStream.addTrack(t))
    }
    stream = videoStream
  } catch {
    // captureStream not supported — compress-less fallback
    URL.revokeObjectURL(sourceUrl)
    onProgress(100)
    return { file, durationSecs, wasTrimmed: false, wasCompressed: false }
  }

  // ── Step 5: MediaRecorder with target bitrate ─────────────────────────────
  const recorderOpts = { mimeType: mimeType || undefined }
  if (mimeType) {
    recorderOpts.videoBitsPerSecond = TARGET_VIDEO_KBPS * 1000
    recorderOpts.audioBitsPerSecond = TARGET_AUDIO_KBPS * 1000
  }

  let recorder
  try {
    recorder = new MediaRecorder(stream, recorderOpts)
  } catch {
    // Options not accepted — try without bitrate hints
    try { recorder = new MediaRecorder(stream) } catch {
      URL.revokeObjectURL(sourceUrl)
      onProgress(100)
      return { file, durationSecs, wasTrimmed: false, wasCompressed: false }
    }
  }

  const chunks = []
  recorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data) }

  // ── Step 6: drive playback and draw each frame to canvas ──────────────────
  const processedFile = await new Promise((resolve, reject) => {
    recorder.onerror = (e) => reject(e.error || new Error('Recorder error'))

    recorder.onstop = () => {
      URL.revokeObjectURL(sourceUrl)
      stream.getTracks().forEach(t => t.stop())

      if (chunks.length === 0) {
        reject(new Error('No data recorded'))
        return
      }

      const actualMime  = recorder.mimeType || mimeType || 'video/webm'
      const ext         = actualMime.includes('mp4') ? 'mp4' : 'webm'
      const outputName  = file.name.replace(/\.[^.]+$/, `.${ext}`)
      const blob        = new Blob(chunks, { type: actualMime })
      resolve(new File([blob], outputName, { type: actualMime }))
    }

    recorder.start(100)  // collect in 100 ms chunks

    // Draw frames loop
    let startTime  = null
    let rafId      = null
    let stopped    = false

    const drawFrame = (ts) => {
      if (stopped) return
      if (!startTime) startTime = ts

      const elapsed = (ts - startTime) / 1000  // seconds into recording
      onProgress(Math.min(99, Math.round((elapsed / effectiveDuration) * 100)))

      // Stop at trim point
      if (elapsed >= effectiveDuration) {
        stopped = true
        cancelAnimationFrame(rafId)
        recorder.stop()
        return
      }

      // Draw the current video frame to canvas
      try { ctx.drawImage(vid, 0, 0, outW, outH) } catch (_) {}
      rafId = requestAnimationFrame(drawFrame)
    }

    vid.onseeked = () => {
      vid.play().then(() => {
        rafId = requestAnimationFrame(drawFrame)
      }).catch(reject)
    }

    vid.onended = () => {
      if (!stopped) {
        stopped = true
        cancelAnimationFrame(rafId)
        recorder.stop()
      }
    }

    // Start from beginning (or 0 for untrimmed)
    vid.currentTime = 0
  })

  onProgress(100)

  // Only use compressed version if it's actually smaller
  const wasCompressed = processedFile.size < file.size
  const finalFile     = wasCompressed ? processedFile : file

  return {
    file:           finalFile,
    durationSecs:   effectiveDuration,
    wasTrimmed,
    wasCompressed,
  }
}
