import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Upload, Trash2, Eye, Heart, Music, Scissors, Play, Pause, Loader2, Send, Camera, Video as VideoIcon } from 'lucide-react'
import { processVideo, MAX_DURATION_SECS } from '@/lib/videoUtils'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
  })
}

// ── Read a File → ArrayBuffer (FileReader fallback for Android WebView / iOS) ──
function fileToArrayBuffer(file) {
  // file.arrayBuffer() is not available on all mobile browsers — use FileReader universally
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read audio file'))
    reader.readAsArrayBuffer(file)
  })
}



// ── Encode an AudioBuffer slice → WAV Blob (near-instant, no JS CPU crunch) ──
// WAV = raw PCM with a header. No compression = no encoding delay.
// A 30s mono 44.1kHz clip = ~2.6MB — well within Supabase's limits.
// We downsample to 22.05kHz mono to keep it under ~1.3MB and speed up writes.
function encodeAudioBlob(audioBuffer) {
  const TARGET_SR = 22050
  const numFrames = audioBuffer.length
  const srcSr = audioBuffer.sampleRate
  // Mix down to mono
  const srcData = audioBuffer.getChannelData(0)
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null
  // Downsample ratio
  const ratio = srcSr / TARGET_SR
  const outLen = Math.floor(numFrames / ratio)
  const pcm = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcIdx = Math.min(Math.floor(i * ratio), numFrames - 1)
    const s = right
      ? (srcData[srcIdx] + right[srcIdx]) / 2
      : srcData[srcIdx]
    pcm[i] = Math.max(-32768, Math.min(32767, s < 0 ? s * 0x8000 : s * 0x7FFF))
  }
  // Build WAV header
  const dataLen = pcm.byteLength
  const buf = new ArrayBuffer(44 + dataLen)
  const v = new DataView(buf)
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  str(0,  'RIFF'); v.setUint32(4,  36 + dataLen, true)
  str(8,  'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true)       // PCM chunk size
  v.setUint16(20, 1,  true)       // PCM format
  v.setUint16(22, 1,  true)       // mono
  v.setUint32(24, TARGET_SR, true)
  v.setUint32(28, TARGET_SR * 2,  true) // byte rate
  v.setUint16(32, 2,  true)       // block align
  v.setUint16(34, 16, true)       // bits per sample
  str(36, 'data'); v.setUint32(40, dataLen, true)
  new Int16Array(buf, 44).set(pcm)
  return new Blob([buf], { type: 'audio/wav' })
}

// ── Decode a File → AudioBuffer ────────────────────────────────
// Uses FileReader (not file.arrayBuffer) for full mobile compat.
// Explicitly resumes AudioContext so iOS doesn't silently suspend it.
async function decodeAudioFile(file) {
  const arrayBuffer = await fileToArrayBuffer(file)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  // iOS Safari creates AudioContext in 'suspended' state — must resume before decoding
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume()
  }
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    return decoded
  } finally {
    // Always close the context to free resources — we don't need it after decoding
    audioCtx.close()
  }
}

// ── Trim audio to 30s from startTime, return MP3 Blob ──────────
async function trimAudioTo30s(file, startTime = 0) {
  const arrayBuffer = await fileToArrayBuffer(file)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') await audioCtx.resume()

  let decoded
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    audioCtx.close()
  }

  const CLIP = 30
  const sr = decoded.sampleRate
  const startFrame = Math.floor(startTime * sr)
  const frames = Math.floor(Math.min(CLIP, decoded.duration - startTime) * sr)

  // Slice the decoded buffer directly — no OfflineAudioContext needed,
  // Slice the decoded PCM directly and encode as WAV
  const sliced = {
    numberOfChannels: decoded.numberOfChannels,
    sampleRate: sr,
    length: frames,
    getChannelData: (ch) => decoded.getChannelData(ch).subarray(startFrame, startFrame + frames),
  }

  return encodeAudioBlob(sliced)
}

// ── Format seconds → m:ss ─────────────────────────────────────
function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ── Audio Scrubber ─────────────────────────────────────────────
// Draggable 30s window over the full song timeline.
// Fully compatible: mouse + touch, iOS Safari + Android Chrome.
function AudioScrubber({ duration, startTime, onChange, previewUrl }) {
  const CLIP = 30
  const trackRef = useRef(null)
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartTime = useRef(0)
  // Stable ref so global listeners never go stale between renders
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const windowPct = Math.min(100, (CLIP / duration) * 100)
  const leftPct = duration > 0 ? (startTime / duration) * 100 : 0

  const onDragStart = useCallback((clientX) => {
    dragging.current = true
    dragStartX.current = clientX
    dragStartTime.current = startTime
  }, [startTime])

  const onDragMove = useCallback((clientX) => {
    if (!dragging.current) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const deltaPx = clientX - dragStartX.current
    const deltaTime = (deltaPx / rect.width) * duration
    const next = Math.max(0, Math.min(Math.max(0, duration - CLIP), dragStartTime.current + deltaTime))
    onChangeRef.current(next)
  }, [duration])

  const onDragEnd = useCallback(() => { dragging.current = false }, [])

  const onTrackClick = useCallback((e) => {
    if (dragging.current) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const ratio = (clientX - rect.left) / rect.width
    const next = Math.max(0, Math.min(Math.max(0, duration - CLIP), ratio * duration - CLIP / 2))
    onChangeRef.current(next)
  }, [duration])

  // Global listeners — touchmove MUST be non-passive to call preventDefault (blocks page scroll)
  useEffect(() => {
    const onMouseMove = (e) => onDragMove(e.clientX)
    const onTouchMove = (e) => {
      if (!dragging.current) return
      e.preventDefault()
      onDragMove(e.touches[0].clientX)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onDragEnd)
    window.addEventListener('touchcancel', onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onDragEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onDragEnd)
      window.removeEventListener('touchcancel', onDragEnd)
    }
  }, [onDragMove, onDragEnd])

  // Seek audio when not playing and window moves
  useEffect(() => {
    const a = audioRef.current
    if (!a || playing) return
    a.currentTime = startTime
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-stop when playhead exits the 30s window
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTimeUpdate = () => {
      if (a.currentTime >= startTime + CLIP) {
        a.pause()
        a.currentTime = startTime
      }
    }
    a.addEventListener('timeupdate', onTimeUpdate)
    return () => a.removeEventListener('timeupdate', onTimeUpdate)
  }, [startTime])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
    } else {
      a.currentTime = startTime
      a.play().catch(() => {})
    }
  }

  return (
    <div className="space-y-2">
      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 cursor-pointer select-none overflow-hidden"
        onClick={onTrackClick}
      >
        {/* Decorative waveform bars */}
        <div className="absolute inset-0 flex items-center px-1 gap-px pointer-events-none">
          {Array.from({ length: 60 }, (_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full bg-purple-200 dark:bg-purple-700/50"
              style={{ height: `${25 + Math.sin(i * 0.7) * 15 + Math.sin(i * 1.3) * 10}%` }}
            />
          ))}
        </div>

        {/* Dimmed regions outside selection */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-black/30 pointer-events-none rounded-l-lg"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/30 pointer-events-none rounded-r-lg"
          style={{ width: `${Math.max(0, 100 - leftPct - windowPct)}%` }}
        />

        {/* Draggable 30s window — touchAction:none prevents browser pan-zoom interfering */}
        <div
          className="absolute top-0 bottom-0 border-2 border-purple-500 rounded-lg"
          style={{ left: `${leftPct}%`, width: `${windowPct}%`, cursor: 'grab', touchAction: 'none' }}
          onMouseDown={(e) => { e.stopPropagation(); onDragStart(e.clientX) }}
          onTouchStart={(e) => { e.stopPropagation(); onDragStart(e.touches[0].clientX) }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center">
            <div className="w-1 h-5 rounded-full bg-purple-500" />
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center">
            <div className="w-1 h-5 rounded-full bg-purple-500" />
          </div>
        </div>
      </div>

      {/* Time labels + preview button */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-0.5">
        <span>{fmtTime(startTime)}</span>
        <button
          type="button"
          onClick={togglePlay}
          className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
        >
          {playing ? <Pause size={10} /> : <Play size={10} fill="white" />}
          {playing ? 'Pause' : 'Preview'}
        </button>
        <span>{fmtTime(Math.min(startTime + CLIP, duration))}</span>
      </div>

      <audio
        ref={audioRef}
        src={previewUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}


// ── Story Viewer (fullscreen, Instagram/Facebook style) ────────
function StoryViewer({ grouped, initialGroup, initialStory, onClose, user, qc }) {
  const [gIdx, setGIdx] = useState(initialGroup)
  const [sIdx, setSIdx] = useState(initialStory)
  const [showViewers, setShowViewers] = useState(false)
  const [reaction, setReaction] = useState(null)
  const [showReactions, setShowReactions] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [replyText, setReplyText] = useState('')
  const timerRef = useRef(null)
  const progressRef = useRef(null)
  const audioRef = useRef(null)
  const videoRef = useRef(null)
  const DURATION = 30000 // 30s per image story

  const group = grouped[gIdx]
  const story = group?.stories[sIdx]
  const isOwn = story?.user_id === user?.id
  const isVideoStory = story?.media_type === 'video'

  const goNext = useCallback(() => {
    if (!group) return
    setProgress(0)
    if (sIdx < group.stories.length - 1) {
      setSIdx(s => s + 1)
    } else if (gIdx < grouped.length - 1) {
      setGIdx(g => g + 1); setSIdx(0)
    } else {
      onClose()
    }
  }, [group, sIdx, gIdx, grouped, onClose])

  const goPrev = useCallback(() => {
    setProgress(0)
    if (sIdx > 0) {
      setSIdx(s => s - 1)
    } else if (gIdx > 0) {
      const prev = grouped[gIdx - 1]
      setGIdx(g => g - 1); setSIdx(prev.stories.length - 1)
    }
  }, [sIdx, gIdx, grouped])

  // Progress bar ticker — image stories: fixed 30s clock; video stories: follow video.currentTime
  useEffect(() => {
    if (paused) {
      if (isVideoStory && videoRef.current) videoRef.current.pause()
      return
    }
    setProgress(0)

    if (isVideoStory) {
      // Let the video drive progress
      const vid = videoRef.current
      if (!vid) return
      vid.currentTime = 0
      vid.play().catch(() => {})
      const tick = setInterval(() => {
        if (!vid.duration || vid.paused) return
        const pct = Math.min((vid.currentTime / vid.duration) * 100, 100)
        setProgress(pct)
        if (pct >= 100) { clearInterval(tick); goNext() }
      }, 100)
      progressRef.current = tick
      const onEnded = () => { clearInterval(tick); goNext() }
      vid.addEventListener('ended', onEnded)
      return () => { clearInterval(tick); vid.removeEventListener('ended', onEnded); vid.pause() }
    } else {
      const start = Date.now()
      progressRef.current = setInterval(() => {
        const elapsed = Date.now() - start
        const pct = Math.min((elapsed / DURATION) * 100, 100)
        setProgress(pct)
        if (pct >= 100) { clearInterval(progressRef.current); goNext() }
      }, 50)
      return () => clearInterval(progressRef.current)
    }
  }, [gIdx, sIdx, paused, isVideoStory, goNext])

  // Auto-play music
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (story?.music_url) {
      audio.src = story.music_url
      audio.currentTime = 0
      audio.play().then(() => setMusicPlaying(true)).catch(() => {})
    } else { audio.pause(); audio.src = ''; setMusicPlaying(false) }
    return () => { audio.pause() }
  }, [story?.id])

  // Record view
  useEffect(() => {
    if (!story?.id || !user?.id || isOwn) return
    sb.from('story_views').upsert({ story_id: story.id, viewer_id: user.id }, { onConflict: 'story_id,viewer_id' }).then(() => {})
  }, [story?.id, user?.id, isOwn])

  const { data: viewers = [] } = useQuery({
    queryKey: ['story-views', story?.id],
    queryFn: async () => {
      const { data } = await sb
        .from('story_views')
        .select('viewer:viewer_id(id, full_name, avatar_url)')
        .eq('story_id', story.id)
        .limit(50)
      return (data || []).map(r => r.viewer).filter(Boolean)
    },
    enabled: !!story?.id && isOwn && showViewers,
  })

  const deleteMutation = useMutation({
    mutationFn: () => sb.from('stories').delete().eq('id', story.id),
    onSuccess: () => { qc.invalidateQueries(['stories']); toast.success('Story deleted'); onClose() },
    onError: () => toast.error('Failed to delete story'),
  })

  const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏']

  const sendReaction = (emoji) => {
    setReaction(emoji)
    setShowReactions(false)
    if (!isOwn && story?.user_id) {
      sb.from('messages').insert({
        sender_id: user.id, receiver_id: story.user_id,
        content: `${emoji} reacted to your story`,
      }).then(() => {})
      // Also fire a push notification
      sb.from('notifications').insert({
        user_id: story.user_id, actor_id: user.id,
        type: 'story_like', reference_id: story.id,
        is_read: false, extra_data: { emoji },
      }).then(() => {}).catch(() => {})
    }
    setTimeout(() => setReaction(null), 2000)
  }

  const sendReply = () => {
    const msg = replyText.trim()
    if (!msg || !story?.user_id) return
    sb.from('messages').insert({
      sender_id: user.id,
      receiver_id: story.user_id,
      content: `↩️ ${msg}`,
    }).then(() => {
      toast.success('Reply sent!')
      setReplyText('')
      setPaused(false)
      // Also fire a push notification for story comment/reply
      if (!isOwn) {
        sb.from('notifications').insert({
          user_id: story.user_id, actor_id: user.id,
          type: 'story_comment', reference_id: story.id,
          is_read: false, extra_data: { preview: msg.slice(0, 60) },
        }).then(() => {}).catch(() => {})
      }
    }).catch(() => toast.error('Failed to send reply'))
  }

  if (!story) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" onClick={onClose}>
      <audio ref={audioRef} loop={false} onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)} />

      {/* Blurred background fill — image stories only */}
      {story.media_url && !isVideoStory && (
        <div
          className="absolute inset-0 scale-110"
          style={{ backgroundImage: `url(${story.media_url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(24px) brightness(0.35)' }}
        />
      )}
      {isVideoStory && <div className="absolute inset-0 bg-black" />}

      {/* Story card — portrait, centered, max 9:16 */}
      <div
        className="relative z-10 flex flex-col w-full h-full max-w-sm mx-auto"
        style={{ maxHeight: '100dvh' }}
        onClick={e => e.stopPropagation()}
        onPointerDown={() => { setPaused(true); clearInterval(progressRef.current) }}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* ── Progress bars ── */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{ width: i < sIdx ? '100%' : i === sIdx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* ── Header ── */}
        <div className="absolute top-8 left-3 right-3 z-20 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full ring-2 ring-white/80 overflow-hidden flex-shrink-0">
            <Avatar src={group.profile?.avatar_url} name={group.profile?.full_name} size={36} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-sm drop-shadow">{group.profile?.full_name}</div>
            <div className="text-white/60 text-[11px]">
              {new Date(story.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          {story.music_url && (
            <button
              onClick={() => { const a = audioRef.current; if (!a) return; musicPlaying ? a.pause() : a.play().catch(() => {}) }}
              className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 text-white text-[11px] mr-1"
            >
              <Music size={11} className={musicPlaying ? 'text-green-400 animate-pulse' : 'text-white/60'} />
              <span className="max-w-[80px] truncate">{story.music_title || 'Music'}</span>
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-red-500/70 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Media ── */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          {story.media_url
            ? isVideoStory
              ? <video
                  ref={videoRef}
                  src={story.media_url}
                  className="w-full h-full"
                  style={{ objectFit: 'contain', maxHeight: '100dvh' }}
                  playsInline
                  muted={!!story.music_url}
                  preload="auto"
                />
              : <img
                  src={story.media_url}
                  alt=""
                  className="w-full h-full"
                  style={{ objectFit: 'contain', maxHeight: '100dvh' }}
                />
            : <div className="w-full h-full gradient-brand flex items-center justify-center p-10">
                <p className="text-white text-2xl font-bold text-center leading-relaxed">{story.caption || ''}</p>
                {/* Render saved text overlays */}
                {story.text_overlays && JSON.parse(story.text_overlays).map(ov => (
                  <div key={ov.id} className="absolute z-20 pointer-events-none"
                    style={{ left: `${ov.x}%`, top: `${ov.y}%`, transform: 'translate(-50%,-50%)' }}>
                    <p className="font-extrabold"
                      style={{ color: ov.color, fontSize: ov.size, textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
                      {ov.text}
                    </p>
                  </div>
                ))}
                {/* Render saved stickers */}
                {story.stickers && JSON.parse(story.stickers).map(s => (
                  <div key={s.id} className="absolute z-20 text-3xl pointer-events-none"
                    style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                    {s.emoji}
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Gradient overlays */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
        </div>

        {/* ── Caption ── */}
        {story.caption && story.media_url && (
          <div className="absolute bottom-20 left-4 right-4 z-20 text-center">
            <p className="text-white text-sm font-semibold drop-shadow-lg leading-relaxed bg-black/20 backdrop-blur-sm rounded-xl px-3 py-2">
              {story.caption}
            </p>
          </div>
        )}

        {/* ── Bottom bar ── */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center gap-2">
          {isOwn ? (
            <button
              onClick={() => setShowViewers(v => !v)}
              className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2.5 text-white text-sm font-medium hover:bg-black/60 transition-colors"
            >
              <Eye size={15} />
              <span>{viewers.length > 0 ? `${viewers.length} viewer${viewers.length !== 1 ? 's' : ''}` : 'No viewers yet'}</span>
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-2">
              {/* Reaction emoji picker */}
              {showReactions && (
                <div className="absolute bottom-14 left-0 flex gap-2 bg-black/70 backdrop-blur-md rounded-2xl p-3 shadow-2xl">
                  {REACTIONS.map(emoji => (
                    <button key={emoji} onClick={() => sendReaction(emoji)}
                      className="text-2xl hover:scale-130 active:scale-95 transition-transform">{emoji}</button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowReactions(v => !v)}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <Heart size={18} className={showReactions ? 'text-red-400 fill-red-400' : ''} />
              </button>
              {/* Reply input */}
              <div className="flex-1 flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2.5 border border-white/20">
                <input
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Reply to ${group.profile?.full_name?.split(' ')[0]}...`}
                  className="flex-1 bg-transparent text-white text-sm placeholder-white/50 outline-none"
                  onFocus={() => clearInterval(progressRef.current)}
                  onBlur={() => { if (!replyText.trim()) setPaused(false) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && replyText.trim()) sendReply()
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim()}
                  className="flex-shrink-0 disabled:opacity-30 active:scale-90 transition-transform"
                >
                  <Send size={16} className="text-white" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Viewers panel ── */}
        {showViewers && isOwn && (
          <div
            className="absolute bottom-16 left-4 right-4 z-30 bg-black/85 backdrop-blur-md rounded-2xl p-4 max-h-52 overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <Eye size={14} /> {viewers.length} Viewer{viewers.length !== 1 ? 's' : ''}
            </div>
            {viewers.length === 0
              ? <p className="text-white/50 text-xs text-center py-3">No one has viewed this yet</p>
              : <div className="space-y-2.5">
                  {viewers.map(v => (
                    <div key={v.id} className="flex items-center gap-3">
                      <Avatar src={v.avatar_url} name={v.full_name} size={30} />
                      <span className="text-white text-sm font-medium">{v.full_name}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── Reaction animation ── */}
        {reaction && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="text-8xl animate-bounce drop-shadow-2xl">{reaction}</div>
          </div>
        )}

        {/* Tap zones: left third = prev, right third = next */}
        <button onClick={goPrev} className="absolute left-0 top-0 bottom-0 w-1/3 z-10" aria-label="Previous" />
        <button onClick={goNext} className="absolute right-0 top-0 bottom-0 w-1/3 z-10" aria-label="Next" />
      </div>
    </div>
  )
}

// ── Main StoriesBar ────────────────────────────────────────────
export default function StoriesBar() {
  const { user, profile } = useAuthStore()
  const qc = useQueryClient()
  const [viewing, setViewing] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data: stories, isLoading } = useQuery({
    queryKey: ['stories'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await sb
        .from('stories')
        .select('*, profiles:user_id(id, username, full_name, avatar_url)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    staleTime: 1000 * 60 * 10, // 10 min cache for stories
  })

  if (isLoading) return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <Skeleton className="w-16 h-16 rounded-full" />
          <Skeleton className="w-12 h-2.5" />
        </div>
      ))}
    </div>
  )

  const byUser = {}
  stories?.forEach(s => {
    if (!byUser[s.user_id]) byUser[s.user_id] = { profile: s.profiles, stories: [] }
    byUser[s.user_id].stories.push(s)
  })
  const ownEntry = byUser[user?.id]
  const others = Object.values(byUser).filter(g => g.profile?.id !== user?.id)
  // grouped keeps own first for the viewer index to work correctly
  const grouped = ownEntry ? [ownEntry, ...others] : others

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {/* ── "Your Story" add / view button ── */}
        <button
          onClick={() => ownEntry ? setViewing({ groupIndex: 0, storyIndex: 0 }) : setCreating(true)}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div className="w-16 h-16 rounded-full relative overflow-hidden flex items-center justify-center bg-brand-50 dark:bg-brand-900/20 hover:opacity-90 transition-opacity">
            {/* Ring: gradient if has story, dashed if not */}
            <div className={`absolute inset-0 rounded-full ${ownEntry ? 'p-0.5 gradient-brand' : 'border-2 border-dashed border-brand-300 dark:border-brand-600'}`} />
            <div className="absolute inset-[3px] rounded-full overflow-hidden bg-gray-200 dark:bg-surface-700">
              {ownEntry?.stories[0]?.media_url
                ? ownEntry.stories[0].media_type === 'video'
                  ? <div className="w-full h-full bg-black flex items-center justify-center">
                      <VideoIcon size={20} className="text-white/70" />
                    </div>
                  : <img src={ownEntry.stories[0].media_url} alt="Your story" className="w-full h-full object-cover" />
                : <Avatar src={profile?.avatar_url} name={profile?.full_name} size={52} />
              }
            </div>
            {/* Always show the + button so they can add another story */}
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center border-2 border-white dark:border-surface-900 z-10"
              onClick={e => { e.stopPropagation(); setCreating(true) }}
            >
              <Plus size={10} className="text-white" />
            </div>
          </div>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-16 text-center truncate">Your Story</span>
        </button>

        {/* ── Other users' stories — show actual story image, not avatar ── */}
        {others.map(({ profile: p, stories: s }) => {
          // groupIndex in `grouped` is offset by 1 if ownEntry exists
          const groupIndex = grouped.findIndex(g => g.profile?.id === p?.id)
          const thumbUrl = s[0]?.media_url
          return (
            <button
              key={p?.id}
              onClick={() => setViewing({ groupIndex, storyIndex: 0 })}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div className="w-16 h-16 rounded-full p-0.5 gradient-brand">
                <div className="w-full h-full rounded-full border-2 border-white dark:border-surface-900 overflow-hidden bg-gray-200 dark:bg-surface-700">
                  {thumbUrl
                    ? s[0]?.media_type === 'video'
                      ? <div className="w-full h-full bg-black flex items-center justify-center">
                          <VideoIcon size={18} className="text-white/70" />
                        </div>
                      : <img src={thumbUrl} alt={p?.full_name} className="w-full h-full object-cover" />
                    : <Avatar src={p?.avatar_url} name={p?.full_name} size={56} />
                  }
                </div>
              </div>
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 w-16 text-center truncate">
                {p?.full_name?.split(' ')[0] ?? 'User'}
              </span>
            </button>
          )
        })}
      </div>

      {viewing !== null && grouped[viewing.groupIndex] && (
        <StoryViewer
          grouped={grouped}
          initialGroup={viewing.groupIndex}
          initialStory={viewing.storyIndex}
          onClose={() => setViewing(null)}
          user={user}
          qc={qc}
        />
      )}

      {creating && <CreateStoryModal onClose={() => setCreating(false)} user={user} qc={qc} />}
    </>
  )
}

// ── Create Story Modal ─────────────────────────────────────────
function CreateStoryModal({ onClose, user, qc }) {
  const [caption, setCaption] = useState('')
  const [textOverlays, setTextOverlays] = useState([])   // [{id, text, x, y, color, size}]
  const [stickers, setStickers] = useState([])           // [{id, emoji, x, y}]
  const [addingText, setAddingText] = useState(false)
  const [newTextVal, setNewTextVal] = useState('')
  const [newTextColor, setNewTextColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState(null)           // text-only story bg
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [isVideo, setIsVideo] = useState(false)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoInputRef = useRef()

  // Music state
  const [musicFile, setMusicFile] = useState(null)       // raw File from picker
  const [musicBlob, setMusicBlob] = useState(null)       // final trimmed WAV Blob
  const [musicTitle, setMusicTitle] = useState('')
  const [musicLoading, setMusicLoading] = useState(false)

  // Scrubber state — set once the file is decoded, before trimming
  const [scrubbing, setScrubbing] = useState(false)      // true = scrubber visible
  const [fullAudioUrl, setFullAudioUrl] = useState(null) // blob URL of original file for preview
  const [fullDuration, setFullDuration] = useState(0)    // total seconds of the uploaded file
  const [scrubStart, setScrubStart] = useState(0)        // current window start in seconds
  const [trimLoading, setTrimLoading] = useState(false)  // true while trimming on confirm

  // Confirmed clip state
  const [clipUrl, setClipUrl] = useState(null)           // blob URL of the trimmed 30s clip
  const [clipDuration, setClipDuration] = useState(null)

  const musicInputRef = useRef(null)
  const fileRef = useRef(null)

  // Cleanup blob URLs on unmount
  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    if (fullAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(fullAudioUrl)
    if (clipUrl?.startsWith('blob:')) URL.revokeObjectURL(clipUrl)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1: file picked → decode → show scrubber
  const handleMusicFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('audio/')) { toast.error('Please select an audio file'); return }
    if (f.size > 20 * 1024 * 1024) { toast.error('Audio file must be under 20MB'); return }

    setMusicLoading(true)
    setMusicFile(f)
    setMusicTitle(f.name.replace(/\.[^.]+$/, ''))

    try {
      // Decode just to get duration (don't trim yet)
      const decoded = await decodeAudioFile(f)
      const dur = decoded.duration

      // Full-file blob URL for scrubber preview playback
      if (fullAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(fullAudioUrl)
      const url = URL.createObjectURL(f)
      setFullAudioUrl(url)
      setFullDuration(dur)
      setScrubStart(0)
      setScrubbing(true)
    } catch (err) {
      console.error(err)
      toast.error('Could not read audio file')
      setMusicFile(null)
    } finally {
      setMusicLoading(false)
    }
  }

  // Phase 2: user happy with position → trim from scrubStart
  const confirmScrub = async () => {
    if (!musicFile) return
    setTrimLoading(true)
    try {
      const trimmed = await trimAudioTo30s(musicFile, scrubStart)
      if (clipUrl?.startsWith('blob:')) URL.revokeObjectURL(clipUrl)
      const url = URL.createObjectURL(trimmed)
      setMusicBlob(trimmed)
      setClipUrl(url)

      // Get actual duration of the clip
      const audio = new Audio(url)
      audio.onloadedmetadata = () => setClipDuration(Math.round(audio.duration))

      setScrubbing(false)
    } catch (err) {
      console.error(err)
      toast.error('Could not trim audio')
    } finally {
      setTrimLoading(false)
    }
  }

  // Cancel scrubber — go back to file picker
  const cancelScrub = () => {
    if (fullAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(fullAudioUrl)
    setFullAudioUrl(null)
    setMusicFile(null)
    setScrubbing(false)
    setScrubStart(0)
    setFullDuration(0)
    // Reset input so same file can be re-picked
    if (musicInputRef.current) musicInputRef.current.value = ''
  }

  const removeMusic = () => {
    if (fullAudioUrl?.startsWith('blob:')) URL.revokeObjectURL(fullAudioUrl)
    if (clipUrl?.startsWith('blob:')) URL.revokeObjectURL(clipUrl)
    setMusicFile(null); setMusicBlob(null); setClipUrl(null)
    setMusicTitle(''); setClipDuration(null)
    setFullAudioUrl(null); setScrubbing(false); setScrubStart(0)
    if (musicInputRef.current) musicInputRef.current.value = ''
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please select an image or video')
      setUploading(true)
      let media_url = null
      let music_url = null

      try {
        if (isVideo) {
          // Video story — upload to videos bucket
          const ext = (file.name?.split('.').pop() || 'mp4').toLowerCase()
          const path = `stories/${user.id}/${Date.now()}.${ext}`
          const { error: upErr } = await sb.storage.from('videos').upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          })
          if (upErr) throw new Error(upErr.message || 'Video upload failed')
          const { data } = sb.storage.from('videos').getPublicUrl(path)
          media_url = data.publicUrl
        } else {
          // Image / GIF story
          const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
          const path = `stories/${user.id}/${Date.now()}.${ext}`
          const { error: upErr } = await sb.storage.from('images').upload(path, file, { cacheControl: '3600', upsert: false })
          if (upErr) {
            if (upErr.message?.includes('Payload too large') || upErr.statusCode === 413)
              throw new Error('Image too large — please use a photo under 5MB')
            if (upErr.message?.includes('not found') || upErr.statusCode === 404)
              throw new Error('Storage not configured — contact support')
            throw new Error(upErr.message || 'Image upload failed')
          }
          const { data } = sb.storage.from('images').getPublicUrl(path)
          media_url = data.publicUrl

          // Upload music clip if present (images only — no music on video stories)
          if (musicBlob) {
            const musicPath = `voice/${user.id}/story-music-${Date.now()}.wav`
            const { error: musicErr } = await sb.storage.from('voice').upload(musicPath, musicBlob, {
              cacheControl: '3600', upsert: false, contentType: 'audio/wav',
            })
            if (musicErr) throw new Error(musicErr.message || 'Music upload failed')
            const { data: musicData } = sb.storage.from('voice').getPublicUrl(musicPath)
            music_url = musicData.publicUrl
          }
        }
      } finally {
        setUploading(false)
      }

      const { error } = await sb.from('stories').insert({
        user_id: user.id,
        media_url,
        media_type: isVideo ? 'video' : 'image',
        caption: caption.trim() || null,
          text_overlays: textOverlays.length ? JSON.stringify(textOverlays) : null,
          stickers: stickers.length ? JSON.stringify(stickers) : null,
        music_url: isVideo ? null : (music_url || null),
        music_title: (!isVideo && music_url) ? (musicTitle.trim() || null) : null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['stories']); toast.success('Story posted! 🎉'); onClose() },
    onError: (e) => { setUploading(false); toast.error(e.message || 'Failed to post story') },
  })

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Please select an image or GIF file'); return }
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB'); return }
    setIsVideo(false)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleVideoFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 500 * 1024 * 1024) { toast.error('Video too large — pick something under 500 MB'); return }
    // Clear any existing image
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setIsVideo(true)
    setVideoProcessing(true)
    setVideoProgress(0)
    const originalUrl = URL.createObjectURL(f)
    setPreview(originalUrl)
    try {
      const result = await processVideo(f, pct => setVideoProgress(pct))
      URL.revokeObjectURL(originalUrl)
      setPreview(URL.createObjectURL(result.file))
      setFile(result.file)
      if (result.wasTrimmed) toast(`✂️ Trimmed to ${MAX_DURATION_SECS / 60} min`, { icon: '⏱️' })
      if (result.wasCompressed) {
        const saved = Math.round(100 - (result.file.size / f.size) * 100)
        toast.success(`Video compressed — saved ${saved}%`)
      }
    } catch {
      toast('Video ready (compression unavailable)', { icon: '⚠️' })
      setFile(f)
    } finally {
      setVideoProcessing(false)
      setVideoProgress(0)
      if (e.target) e.target.value = ''
    }
  }

  const clearMedia = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setIsVideo(false)
    setVideoProcessing(false)
    setVideoProgress(0)
  }

  const isPending = mutation.isPending || uploading || videoProcessing

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-white/10">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white">Add to Story</h2>
          <button onClick={onClose} className="btn-icon text-gray-400"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Media picker / preview */}
          {preview ? (
            <div className="relative w-40 mx-auto">
              <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-black shadow-xl">
                {isVideo ? (
                  <>
                    <video
                      src={preview}
                      className="w-full h-full object-contain bg-black"
                      controls={!videoProcessing}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ opacity: videoProcessing ? 0.4 : 1 }}
                    />
                    {videoProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                        <Loader2 size={22} className="animate-spin text-purple-400" />
                        <div className="text-white text-[10px] font-bold">Processing…</div>
                        <div className="w-24 h-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full transition-all duration-300" style={{ width: `${videoProgress}%` }} />
                        </div>
                      </div>
                    )}
                    {!videoProcessing && (
                      <div className="absolute top-2 left-2 bg-purple-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <VideoIcon size={9} /> Video
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <img src={preview} alt="" className="w-full h-full object-contain bg-black" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />
                    {caption.trim() && (
                      <div className="absolute bottom-6 left-2 right-2 z-10">
                        <p className="text-white text-[10px] font-medium text-center drop-shadow line-clamp-2">{caption}</p>
                      </div>
                    )}
                    {/* Text overlays */}
                    {textOverlays.map(ov => (
                      <div key={ov.id} className="absolute z-20 cursor-move select-none"
                        style={{ left: `${ov.x}%`, top: `${ov.y}%`, transform: 'translate(-50%,-50%)' }}>
                        <p className="font-extrabold drop-shadow-lg whitespace-nowrap"
                          style={{ color: ov.color, fontSize: ov.size, textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
                          {ov.text}
                        </p>
                        <button onClick={() => setTextOverlays(t => t.filter(x => x.id !== ov.id))}
                          className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    ))}
                    {/* Stickers */}
                    {stickers.map(s => (
                      <div key={s.id} className="absolute z-20 cursor-move select-none text-3xl"
                        style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}>
                        {s.emoji}
                        <button onClick={() => setStickers(st => st.filter(x => x.id !== s.id))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    ))}
                  </>
                )}
                <button
                  onClick={clearMedia}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-500/80 transition-colors z-10"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="text-center text-[10px] text-gray-400 mt-2">Preview</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Four media source buttons */}
              <div className="grid grid-cols-2 gap-2">
                {/* Camera */}
                <label className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-brand-50 dark:bg-brand-900/20 border-2 border-brand-200 dark:border-brand-700 cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center">
                    <Camera size={20} className="text-white" />
                  </div>
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">Camera</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                </label>

                {/* GIF */}
                <label className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-700 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
                    <span className="text-white font-black text-[11px]">GIF</span>
                  </div>
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">GIF</span>
                  <input type="file" accept="image/gif" className="hidden" onChange={handleFile} />
                </label>

                {/* Photo upload */}
                <label className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-surface-100 dark:bg-white/5 border-2 border-surface-200 dark:border-white/10 cursor-pointer hover:bg-surface-200 dark:hover:bg-white/10 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center">
                    <Upload size={18} className="text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Photo</span>
                  <input ref={fileRef} type="file" accept="image/*,image/gif" className="hidden" onChange={handleFile} />
                </label>

                {/* Video upload */}
                <label className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-200 dark:border-rose-700 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center">
                    <VideoIcon size={18} className="text-white" />
                  </div>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Video</span>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />
                </label>
              </div>
              <p className="text-center text-[10px] text-gray-400">Images & GIFs · max 10 MB &nbsp;|&nbsp; Video · max 2 min, auto-compressed</p>
            </div>
          )}

          {/* Caption */}
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Add a caption... (optional)" className="input text-sm" />

          {/* Stories 2.0 — text overlays + stickers */}
          {preview && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button onClick={() => setAddingText(v => !v)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors"
                  style={addingText ? { background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' } : { borderColor: 'rgba(124,58,237,0.4)', color: '#7c3aed' }}>
                  🔤 Add Text
                </button>
                <div className="flex-1 flex items-center justify-center gap-1 rounded-xl border py-2"
                  style={{ borderColor: 'rgba(236,72,153,0.4)' }}>
                  <span className="text-xs font-semibold text-pink-500 mr-1">🎨 Stickers</span>
                  {['😂','🔥','❤️','✨','🎉','👑','🌍','💪'].map(em => (
                    <button key={em} className="text-lg hover:scale-125 transition-transform"
                      onClick={() => setStickers(s => [...s, { id: Date.now()+Math.random(), emoji: em, x: 20+Math.random()*60, y: 20+Math.random()*60 }])}>
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              {addingText && (
                <div className="flex gap-2 items-center animate-fade-in">
                  <input value={newTextVal} onChange={e => setNewTextVal(e.target.value)}
                    placeholder="Type your text..." className="input text-sm flex-1" />
                  <div className="flex gap-1">
                    {['#ffffff','#ffdd00','#ff4444','#44ff88','#4488ff'].map(col => (
                      <button key={col} onClick={() => setNewTextColor(col)}
                        className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ background: col, borderColor: newTextColor === col ? '#000' : 'transparent' }} />
                    ))}
                  </div>
                  <button onClick={() => {
                    if (!newTextVal.trim()) return
                    setTextOverlays(t => [...t, { id: Date.now(), text: newTextVal.trim(), x: 50, y: 30+t.length*15, color: newTextColor, size: '18px' }])
                    setNewTextVal(''); setAddingText(false)
                  }} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#7c3aed' }}>
                    Add
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Music section — images only ── */}
          {!isVideo && <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Music size={13} /> Add Music <span className="text-gray-400 font-normal">(30 sec clip)</span>
            </div>

            {/* Phase A: no file chosen yet */}
            {!musicFile && !scrubbing && (
              <label className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-dashed border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20 cursor-pointer transition-colors">
                {musicLoading
                  ? <Loader2 size={18} className="text-purple-400 animate-spin flex-shrink-0" />
                  : <Music size={18} className="text-purple-400 flex-shrink-0" />
                }
                <div>
                  <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    {musicLoading ? 'Reading file...' : 'Choose Audio File'}
                  </div>
                  <div className="text-xs text-gray-400">MP3, AAC, WAV · pick your 30s clip</div>
                </div>
                <input
                  ref={musicInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleMusicFile}
                  disabled={musicLoading}
                />
              </label>
            )}

            {/* Phase B: scrubber — user picks where the 30s window starts */}
            {scrubbing && fullDuration > 0 && (
              <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-xl p-3 space-y-3">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <Music size={13} className="text-purple-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate flex-1">{musicTitle}</span>
                  <button onClick={cancelScrub} className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={14} />
                  </button>
                </div>

                {/* Instruction */}
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Drag the highlighted window to pick which 30s plays in your story.
                </p>

                {/* The scrubber */}
                <AudioScrubber
                  duration={fullDuration}
                  startTime={scrubStart}
                  onChange={setScrubStart}
                  previewUrl={fullAudioUrl}
                />

                {/* Confirm button */}
                <button
                  onClick={confirmScrub}
                  disabled={trimLoading}
                  className="w-full flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
                >
                  {trimLoading
                    ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Trimming...</>
                    : <><Scissors size={13} /> Use this clip</>
                  }
                </button>
              </div>
            )}

            {/* Phase C: clip confirmed — show it with option to re-pick */}
            {musicBlob && !scrubbing && (
              <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <Music size={13} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      value={musicTitle}
                      onChange={e => setMusicTitle(e.target.value)}
                      placeholder="Music title (optional)"
                      className="w-full text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 font-medium truncate"
                    />
                    <div className="flex items-center gap-1 text-[10px] text-purple-500 mt-0.5">
                      <Scissors size={9} />
                      <span>{clipDuration ?? 30}s clip · starts at {fmtTime(scrubStart)}</span>
                    </div>
                  </div>
                  {/* Re-pick: go back to scrubber */}
                  <button
                    onClick={() => { setScrubbing(true); setMusicBlob(null); setClipUrl(null) }}
                    className="text-purple-400 hover:text-purple-600 transition-colors text-[10px] font-semibold px-1"
                    title="Re-pick clip"
                  >
                    Edit
                  </button>
                  <button onClick={removeMusic} className="text-gray-400 hover:text-red-500 transition-colors ml-1">
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>}

          <button onClick={() => mutation.mutate()} disabled={!file || isPending} className="btn-primary w-full py-2.5">
            {videoProcessing
              ? <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing video {videoProgress}%</span>
              : isPending
                ? <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{uploading ? 'Uploading...' : 'Posting...'}</span>
                : isVideo ? '🎬 Share Video Story' : 'Share Story'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

