/**
 * CallScreen — full-screen overlay for voice & video calls
 * v2.1 — Fixed: audio for video calls, proper srcObject updates
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import {
  PhoneOff, Mic, MicOff, Video, VideoOff, Phone,
  Volume2, VolumeX, RotateCcw, Maximize2, Minimize2,
  Camera, FlipHorizontal2, Eye, EyeOff, Smile, FileText, X, Monitor, MonitorOff,
} from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import clsx from 'clsx'

// ── Attach a MediaStream to a <video> or <audio> element safely ─────────────
// Called both on mount (ref callback) and on every stream change (useEffect).
function attachStream(el, stream, muted = false) {
  if (!el) return
  el.muted = muted
  if (el.srcObject !== stream) {
    el.srcObject = stream ?? null
  }
  if (stream) {
    // Ensure element is not paused — retry up to 3 times on failure
    const tryPlay = (attempts = 0) => {
      const p = el.play()
      if (p) {
        p.catch(err => {
          // NotAllowedError = autoplay blocked by browser policy
          // NotSupportedError = srcObject not set yet
          if (err.name === 'NotAllowedError' && attempts < 3) {
            setTimeout(() => tryPlay(attempts + 1), 500)
          }
          // Other errors are expected (e.g. element unmounted) — ignore
        })
      }
    }
    tryPlay()
  }
}

// ── Media ref hook ──────────────────────────────────────────────────────────
function useMediaRef(stream, muted = false) {
  const nodeRef = useRef(null)
  const streamRef = useRef(stream)
  const mutedRef  = useRef(muted)

  // Keep refs in sync
  useEffect(() => { streamRef.current = stream }, [stream])
  useEffect(() => { mutedRef.current  = muted  }, [muted])

  // Ref callback — fires when element mounts. Also re-runs when stream changes
  // because we pass stream as a dep so React re-creates the callback
  const ref = useCallback((node) => {
    nodeRef.current = node
    if (node) attachStream(node, streamRef.current, mutedRef.current)
  }, [stream, muted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect — re-attach whenever stream or muted changes
  useEffect(() => {
    attachStream(nodeRef.current, stream, muted)
  }, [stream, muted])

  // Retry loop — poll every 300ms for 6s after stream arrives to catch
  // timing races where the DOM element isn't ready when stream first fires
  useEffect(() => {
    if (!stream) return
    let attempts = 0
    const retry = setInterval(() => {
      const node = nodeRef.current
      if (!node) return
      if (!node.srcObject || node.srcObject !== stream) {
        attachStream(node, stream, muted)
      }
      if (node.paused && node.srcObject) {
        node.play().catch(() => {})
      }
      if (++attempts >= 20) clearInterval(retry)
    }, 300)
    return () => clearInterval(retry)
  }, [stream]) // eslint-disable-line react-hooks/exhaustive-deps

  // Unlock autoplay on user gesture (required on iOS/Android)
  useEffect(() => {
    const h = () => {
      const node = nodeRef.current
      if (node && node.paused && node.srcObject) {
        node.play().catch(() => {})
      }
    }
    document.addEventListener('click', h, { passive: true })
    document.addEventListener('touchstart', h, { passive: true })
    document.addEventListener('touchend', h, { passive: true })
    return () => {
      document.removeEventListener('click', h)
      document.removeEventListener('touchstart', h)
      document.removeEventListener('touchend', h)
    }
  }, [])

  return ref
}

// ── Signal bars ─────────────────────────────────────────────────────────────
function SignalBars({ quality }) {
  const active = quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'poor' ? 1 : 0
  const color  = quality === 'good' ? 'bg-green-400' : quality === 'fair' ? 'bg-yellow-400' : 'bg-red-400'
  const label  = quality === 'good' ? 'Good' : quality === 'fair' ? 'Fair' : quality === 'poor' ? 'Poor' : '…'
  return (
    <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
      <div className="flex items-end gap-[2px] h-3">
        {[1,2,3].map(b => (
          <div key={b}
            className={clsx('w-[3px] rounded-sm transition-all', b <= active ? color : 'bg-white/20')}
            style={{ height: `${b * 33}%` }}
          />
        ))}
      </div>
      <span className="text-[10px] text-white/60 font-medium">{label}</span>
    </div>
  )
}

// ── Audio Waveform ────────────────────────────────────────────────────────────
function Waveform({ active }) {
  return (
    <div className="flex items-center gap-[3px] h-5">
      <style>{`
        @keyframes wave0 { 0%,100%{height:20%} 50%{height:80%} }
        @keyframes wave1 { 0%,100%{height:40%} 50%{height:95%} }
        @keyframes wave2 { 0%,100%{height:30%} 50%{height:70%} }
        @keyframes wave3 { 0%,100%{height:60%} 50%{height:30%} }
        @keyframes wave4 { 0%,100%{height:25%} 50%{height:90%} }
        @keyframes wave5 { 0%,100%{height:50%} 50%{height:20%} }
        @keyframes wave6 { 0%,100%{height:35%} 50%{height:75%} }
      `}</style>
      {[...Array(7)].map((_, i) => (
        <div
          key={i}
          className={clsx('w-[3px] rounded-full transition-all', active ? 'bg-green-400' : 'bg-white/20')}
          style={{
            height: '30%',
            animation: active ? `wave${i} 0.6s ease-in-out ${i * 0.08}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ── Emoji Reaction Burst ──────────────────────────────────────────────────────
function EmojiReaction({ emoji, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <>
      <style>{`@keyframes floatUp{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-130px) scale(1.4)}}`}</style>
      <div
        className="absolute left-1/2 bottom-44 z-50 text-5xl pointer-events-none"
        style={{ animation: 'floatUp 2.2s ease-out forwards' }}
      >
        {emoji}
      </div>
    </>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function CallScreen({
  callState, callType, remoteUser,
  localStream, remoteStream,
  muted, cameraOff, speakerOff, facingMode, durationLabel,
  screenSharing,
  onAccept, onDecline, onEnd,
  onToggleMute, onToggleCamera, onToggleSpeaker, onFlipCamera, onToggleScreenShare,
}) {
  const isVideo    = callType === 'video'
  const isActive   = callState === 'active'
  const isRinging  = callState === 'ringing'
  const isIncoming = callState === 'incoming'
  const isEnded    = callState === 'ended'

  const [controlsVisible, setControlsVisible] = useState(true)
  const [pipExpanded, setPipExpanded]         = useState(false)
  const [signalQuality, setSignalQuality]     = useState(null)
  const [pipPos, setPipPos]                   = useState({ x: null, y: null })
  const [dragging, setDragging]               = useState(false)
  const [showReactions, setShowReactions]     = useState(false)
  const [activeReaction, setActiveReaction]   = useState(null)
  const [showNotes, setShowNotes]             = useState(false)
  const [notes, setNotes]                     = useState('')
  const [blurBg, setBlurBg]                   = useState(false)
  const [speaking, setSpeaking]               = useState(false)
  const [hdMode, setHdMode]                   = useState(false)

  const controlsTimer = useRef(null)
  const dragStart     = useRef(null)
  const speakingRaf   = useRef(null)

  // Auto-hide controls during active video call
  useEffect(() => {
    if (!isVideo || !isActive) { setControlsVisible(true); return }
    const reset = () => {
      setControlsVisible(true)
      clearTimeout(controlsTimer.current)
      controlsTimer.current = setTimeout(() => setControlsVisible(false), 4000)
    }
    reset()
    document.addEventListener('pointerdown', reset)
    return () => { document.removeEventListener('pointerdown', reset); clearTimeout(controlsTimer.current) }
  }, [isVideo, isActive])

  // Signal quality check
  useEffect(() => {
    if (!remoteStream || !isActive) return
    const check = () => {
      const track = remoteStream.getTracks()[0]
      setSignalQuality(!track || track.readyState === 'ended' ? 'poor' : 'good')
    }
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [remoteStream, isActive])

  // Speaking detection
  useEffect(() => {
    if (!localStream || muted || !isActive) { setSpeaking(false); return }
    let ctx, stopped = false
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      ctx = new AudioCtx()
      const analyser = ctx.createAnalyser()
      ctx.createMediaStreamSource(localStream).connect(analyser)
      analyser.fftSize = 256
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (stopped) return
        analyser.getByteFrequencyData(data)
        setSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 14)
        speakingRaf.current = requestAnimationFrame(tick)
      }
      speakingRaf.current = requestAnimationFrame(tick)
    } catch { /* ignore */ }
    return () => {
      stopped = true
      cancelAnimationFrame(speakingRaf.current)
      ctx?.close().catch(() => {})
      setSpeaking(false)
    }
  }, [localStream, muted, isActive])

  // ── Media refs ─────────────────────────────────────────────────────────
  // Remote video (carries both video + audio tracks for video calls)
  const remoteVideoRef = useMediaRef(isVideo ? remoteStream : null, false)
  // Remote audio for voice-only calls
  const remoteAudioRef = useMediaRef(!isVideo ? remoteStream : null, false)
  // Local video preview (muted — never play your own audio back)
  const localVideoRef  = useMediaRef(localStream, true)

  // ALWAYS attach remoteStream to a hidden audio element — for both voice AND video calls.
  // This guarantees audio plays even if the <video> element has issues with autoplay.
  const remoteAudioAlwaysRef = useRef(null)
  useEffect(() => {
    if (!remoteAudioAlwaysRef.current) {
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.playsInline = true
      audio.volume = 1.0
      audio.style.display = 'none'
      audio.setAttribute('playsinline', '')
      audio.setAttribute('webkit-playsinline', '')
      document.body.appendChild(audio)
      remoteAudioAlwaysRef.current = audio
    }
    const audio = remoteAudioAlwaysRef.current
    if (remoteStream && audio.srcObject !== remoteStream) {
      audio.srcObject = remoteStream
      audio.muted = speakerOff
      // Try playing immediately
      const tryPlay = () => audio.play().catch(e => {
        // Retry on NotAllowedError (autoplay policy)
        if (e.name === 'NotAllowedError') setTimeout(tryPlay, 600)
      })
      tryPlay()
    }
  }, [remoteStream, speakerOff])

  // Cleanup persistent audio element on call end
  useEffect(() => {
    if (callState === 'idle' || callState === 'ended') {
      if (remoteAudioAlwaysRef.current) {
        remoteAudioAlwaysRef.current.srcObject = null
        remoteAudioAlwaysRef.current.remove()
        remoteAudioAlwaysRef.current = null
      }
    }
  }, [callState])

  // SpeakerOff — actually mute/unmute the audio elements
  useEffect(() => {
    if (remoteAudioAlwaysRef.current) remoteAudioAlwaysRef.current.muted = speakerOff
  }, [speakerOff])

  // PiP drag
  const onPipPointerDown = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
    dragStart.current = { px: e.clientX, py: e.clientY, ox: pipPos.x ?? 0, oy: pipPos.y ?? 0 }
    const onMove = (me) => setPipPos({
      x: dragStart.current.ox + me.clientX - dragStart.current.px,
      y: dragStart.current.oy + me.clientY - dragStart.current.py,
    })
    const onUp = () => { setDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [pipPos])

  // Ring tone
  // Lock to portrait during calls on mobile (unlock on end)
  useEffect(() => {
    if (callState === 'idle') return
    if (screen?.orientation?.lock) {
      screen.orientation.lock('portrait').catch(() => {})
    }
    return () => {
      if (screen?.orientation?.unlock) {
        screen.orientation.unlock()
      }
    }
  }, [callState])

  const ringTimer = useRef(null)
  useEffect(() => {
    if (callState !== 'ringing') return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx(); let stopped = false
    const play = () => {
      if (stopped) return
      const osc = ctx.createOscillator(); const g = ctx.createGain()
      osc.connect(g); g.connect(ctx.destination); osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      g.gain.setValueAtTime(0.3, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8)
      if (!stopped) ringTimer.current = setTimeout(play, 1500)
    }
    play()
    return () => { stopped = true; clearTimeout(ringTimer.current); ctx.close().catch(() => {}) }
  }, [callState])

  const sendReaction = (emoji) => { setActiveReaction(emoji); setShowReactions(false) }

  if (callState === 'idle') return null

  // PiP position: draggable on mobile, fixed sidebar slot on desktop
  const pipStyle = pipPos.x !== null
    ? { position: 'fixed', left: pipPos.x, top: pipPos.y, right: 'auto', bottom: 'auto' }
    : { position: 'absolute', top: 72, right: 16 }

  const isRearCamera  = facingMode === 'environment'
  const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0
  const hasLocalVideo  = localStream  && localStream.getVideoTracks().length > 0

  return (
    <div className="fixed inset-0 z-[100] flex bg-gray-950 text-white overflow-hidden select-none no-select"
      style={{ flexDirection: 'column', height: '100dvh', height: '100vh' }}>

      {/* ── BACKGROUND ─────────────────────────────────────────────── */}
      <div className={clsx(
        'absolute inset-0 z-0 transition-opacity duration-700',
        isVideo && isActive && hasRemoteVideo ? 'opacity-0' : 'opacity-100'
      )}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-black" />
        <div className="absolute inset-0 opacity-30" style={{
          background: isIncoming
            ? 'radial-gradient(ellipse at 30% 40%, rgba(59,130,246,0.5) 0%, transparent 60%)'
            : isRinging
            ? 'radial-gradient(ellipse at 70% 30%, rgba(139,92,246,0.5) 0%, transparent 60%)'
            : isActive
            ? 'radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.25) 0%, transparent 60%)'
            : 'none'
        }} />
      </div>

      {/* ── DESKTOP LAYOUT: side-by-side panels ─────────────────────── */}
      {/* Mobile: stacked (default). Desktop (md+): two-column grid      */}
      <div className="relative z-10 flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* ── VIDEO AREA ─────────────────────────────────────────────── */}
        {isVideo && (
          <div className={clsx(
            'relative overflow-hidden bg-black',
            // Mobile: fixed height when active, full height when not
            isActive
              ? 'flex-1 md:flex-1'
              : 'flex-1',
            // Desktop: take more space
            'md:rounded-2xl md:m-3'
          )}>
            {/* Remote video fills the frame */}
            <video ref={remoteVideoRef} autoPlay playsInline
              className={clsx(
                'absolute inset-0 w-full h-full z-0 transition-all duration-700',
                // object-contain on desktop so nothing is cropped, cover on mobile
                'object-cover md:object-contain',
                hasRemoteVideo && isActive ? 'opacity-100' : 'opacity-0',
                blurBg && 'blur-md scale-110'
              )}
              style={{ imageRendering: 'auto', background: '#000' }}
            />

            {/* No remote video state */}
            {isActive && !hasRemoteVideo && (
              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3">
                <div className={clsx('rounded-full overflow-hidden ring-4 ring-green-400/50')}>
                  <Avatar src={remoteUser?.avatar_url} name={remoteUser?.full_name} size={80} />
                </div>
                <p className="text-white/50 text-sm font-medium">Camera off</p>
              </div>
            )}

            {/* Local PiP — draggable on mobile, fixed corner on desktop */}
            {isActive && (
              <div
                style={pipStyle}
                className={clsx(
                  // Mobile: small corner PiP
                  'w-28 md:w-36',
                  'aspect-video z-30 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl border',
                  'cursor-grab active:cursor-grabbing transition-all duration-200',
                  speaking && !muted ? 'border-green-400/70' : 'border-white/20',
                  dragging && 'scale-105 z-40'
                )}
                onPointerDown={onPipPointerDown}
              >
                {cameraOff || !hasLocalVideo
                  ? <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center gap-1">
                      <VideoOff size={14} className={hasLocalVideo ? 'text-white/40' : 'text-orange-400'} />
                      {!hasLocalVideo && <span className="text-[9px] text-orange-400">No cam</span>}
                    </div>
                  : <video ref={localVideoRef} autoPlay playsInline muted
                      className="w-full h-full object-cover"
                      style={{ transform: !isRearCamera ? 'scaleX(-1)' : 'none' }}
                    />
                }
                <div className="absolute top-1 left-1 flex items-center gap-0.5 text-[9px] text-white/70 bg-black/50 rounded px-1.5 py-0.5 pointer-events-none">
                  {isRearCamera ? <><Camera size={7} className="inline" /> Rear</> : <><FlipHorizontal2 size={7} className="inline" /> Front</>}
                </div>
                {speaking && !muted && (
                  <div className="absolute bottom-1 left-1 pointer-events-none"><Waveform active /></div>
                )}
              </div>
            )}

            {/* Video overlay: top bar inside video frame */}
            <div className={clsx(
              'absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 pt-3 pb-2',
              'bg-gradient-to-b from-black/50 to-transparent',
              'transition-opacity duration-300',
              isActive && !controlsVisible ? 'opacity-0' : 'opacity-100'
            )}>
              <div className="flex items-center gap-2">
                {isActive && <SignalBars quality={signalQuality} />}
              </div>
              <div className="flex items-center gap-2">
                {isActive && (
                  <button onClick={() => setHdMode(v => !v)}
                    className={clsx('text-[10px] font-bold px-2 py-0.5 rounded border transition-all',
                      hdMode ? 'bg-blue-500/30 border-blue-400/50 text-blue-300' : 'bg-black/30 border-white/15 text-white/35'
                    )}>HD</button>
                )}
                {isActive && (
                  <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-mono font-semibold tracking-widest">{durationLabel}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── VOICE CALL + INFO PANEL ─────────────────────────────────── */}
        {/* On video calls: shown above controls. On voice: takes full space */}
        <div className={clsx(
          'flex flex-col items-center justify-center gap-4 px-6 pointer-events-none',
          isVideo
            ? 'hidden md:flex md:w-72 md:flex-shrink-0'  // desktop sidebar for video
            : 'flex-1 z-10',                               // full area for voice
          'transition-opacity duration-300',
          isVideo && isActive && hasRemoteVideo && !controlsVisible ? 'opacity-0' : 'opacity-100'
        )}>

          {/* Top bar for voice / non-video screens */}
          {!isVideo && isActive && (
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
              <SignalBars quality={signalQuality} />
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-mono font-semibold tracking-widest">{durationLabel}</span>
              </div>
            </div>
          )}

          {/* Avatar */}
          {(!isVideo || !isActive) && (
            <div className="relative">
              {isIncoming && (
                <>
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" style={{ transform: 'scale(1.8)' }} />
                  <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping" style={{ transform: 'scale(2.4)', animationDelay: '0.3s' }} />
                </>
              )}
              <div className={clsx('rounded-full overflow-hidden ring-4 transition-all duration-1000',
                isActive ? 'ring-green-400/70' : isIncoming ? 'ring-blue-400/80' : isRinging ? 'ring-purple-400/60' : 'ring-white/20'
              )}>
                <Avatar src={remoteUser?.avatar_url} name={remoteUser?.full_name} size={isVideo ? 72 : 100} />
              </div>
            </div>
          )}

          {/* Name + status */}
          <div className="text-center">
            <div className="text-xl md:text-2xl font-bold text-white drop-shadow-lg">{remoteUser?.full_name || 'Unknown'}</div>
            <div className="text-sm text-white/50 mt-0.5">@{remoteUser?.username}</div>
          </div>

          <div className={clsx('text-xs font-semibold px-4 py-1.5 rounded-full backdrop-blur-sm border transition-all',
            isActive ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : isRinging ? 'bg-purple-500/20 text-purple-200 border-purple-500/20 animate-pulse'
            : isIncoming ? 'bg-blue-500/20 text-blue-200 border-blue-500/20 animate-pulse'
            : isEnded ? 'bg-red-500/20 text-red-300 border-red-500/20' : 'border-transparent'
          )}>
            {isActive && `${isVideo ? '📹' : '📞'} Connected`}
            {isRinging && `Calling${isVideo ? ' (video)' : ''}…`}
            {isIncoming && `Incoming ${isVideo ? 'video' : 'voice'} call`}
            {isEnded && 'Call ended'}
          </div>

          {isActive && (muted || cameraOff || speakerOff) && (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {muted && <Pill icon={MicOff} label="Muted" />}
              {cameraOff && isVideo && <Pill icon={VideoOff} label="Cam off" />}
              {speakerOff && <Pill icon={VolumeX} label="Speaker off" />}
            </div>
          )}

          {!isVideo && isActive && <div className="pointer-events-none"><Waveform active={speaking && !muted} /></div>}
        </div>
      </div>

      {/* ── CONTROLS BAR ────────────────────────────────────────────── */}
      <div className={clsx(
        'relative z-20 pointer-events-auto transition-opacity duration-300',
        // Mobile: fixed bottom bar with safe area. Desktop: part of flow
        'pb-safe',
        isVideo && isActive && !controlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}>
        {/* Reaction picker */}
        {showReactions && (
          <div className="flex items-center justify-center px-4 pb-3">
            <div className="bg-black/85 backdrop-blur-xl rounded-2xl px-4 py-3 flex gap-3 border border-white/10 shadow-2xl">
              {['👍','❤️','😂','😮','👏','🔥','💯','🎉'].map(e => (
                <button key={e} onClick={() => sendReaction(e)} className="text-xl md:text-2xl active:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </div>
        )}

        {/* Notes panel */}
        {showNotes && (
          <div className="mx-4 mb-3 bg-black/90 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-white/50 font-semibold uppercase tracking-wider">📝 Call Notes</span>
              <button onClick={() => setShowNotes(false)}><X size={14} className="text-white/40" /></button>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Jot down notes during the call…"
              className="w-full bg-white/5 rounded-xl p-3 text-sm text-white placeholder-white/20 resize-none outline-none border border-white/10 focus:border-white/30 transition-colors"
              rows={3} autoFocus />
          </div>
        )}

        {/* Active call controls */}
        {isActive && (
          <div className="px-4 pb-6 pt-3 space-y-3 bg-gradient-to-t from-black/70 to-transparent">
            {/* Secondary actions row */}
            <div className="flex items-center justify-center gap-4 md:gap-8">
              {isVideo && (
                <SmallBtn icon={blurBg ? EyeOff : Eye} label={blurBg ? 'Unblur' : 'Blur bg'}
                  onClick={() => { setBlurBg(v => !v); setShowReactions(false); setShowNotes(false) }} active={blurBg} />
              )}
              {isVideo && onToggleScreenShare && (
                <SmallBtn icon={screenSharing ? MonitorOff : Monitor} label={screenSharing ? 'Stop' : 'Share'}
                  onClick={onToggleScreenShare} active={screenSharing} />
              )}
              <SmallBtn icon={Smile} label="React"
                onClick={() => { setShowReactions(v => !v); setShowNotes(false) }} active={showReactions} />
              <SmallBtn icon={FileText} label={notes ? 'Notes ●' : 'Notes'}
                onClick={() => { setShowNotes(v => !v); setShowReactions(false) }} active={showNotes} />
            </div>

            {/* Primary actions row */}
            <div className="flex items-center justify-center gap-3 md:gap-5">
              <Btn icon={muted ? MicOff : Mic} label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute} active={muted} />
              {isVideo && (
                <Btn icon={cameraOff ? VideoOff : Video} label={cameraOff ? 'Cam on' : 'Cam off'} onClick={onToggleCamera} active={cameraOff} />
              )}
              {isVideo && onFlipCamera && (
                <Btn icon={RotateCcw} label={isRearCamera ? '→ Front' : '→ Rear'} sublabel={isRearCamera ? 'Now: Rear' : 'Now: Front'} onClick={onFlipCamera} />
              )}
              {onToggleSpeaker && (
                <Btn icon={speakerOff ? VolumeX : Volume2} label="Speaker" onClick={onToggleSpeaker} active={speakerOff} />
              )}
              <Btn icon={PhoneOff} label="End" onClick={onEnd} color="bg-red-500 hover:bg-red-600" size="lg" />
            </div>
          </div>
        )}

        {isRinging && (
          <div className="flex justify-center pb-10">
            <Btn icon={PhoneOff} label="Cancel" onClick={onEnd} color="bg-red-500 hover:bg-red-600" size="lg" />
          </div>
        )}

        {isIncoming && (
          <div className="pb-10">
            <SwipeAnswer isVideo={isVideo} onAccept={onAccept} onDecline={onDecline} />
          </div>
        )}

        {isEnded && (
          <div className="flex justify-center pb-10">
            <p className="text-white/40 text-sm">Returning to chat…</p>
          </div>
        )}
      </div>

      {activeReaction && <EmojiReaction emoji={activeReaction} onDone={() => setActiveReaction(null)} />}

      {/* Audio for voice-only calls */}
      {!isVideo && <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />}
    </div>
  )
}

// ── Swipe to Answer / Decline ─────────────────────────────────────────────
function SwipeAnswer({ isVideo, onAccept, onDecline }) {
  const [dragX, setDragX]       = useState(0)
  const [dragging, setDragging] = useState(false)
  const [triggered, setTriggered] = useState(false)
  const trackRef  = useRef(null)
  const startXRef = useRef(0)
  const TRACK_W   = 280   // total track width px
  const THUMB_W   = 64    // thumb diameter px
  const MAX_DRAG  = TRACK_W - THUMB_W - 8  // max pixels thumb can travel
  const THRESHOLD = MAX_DRAG * 0.72        // 72% = trigger

  const onStart = (clientX) => {
    if (triggered) return
    setDragging(true)
    startXRef.current = clientX - dragX
  }
  const onMove = (clientX) => {
    if (!dragging || triggered) return
    const newX = Math.max(0, Math.min(MAX_DRAG, clientX - startXRef.current))
    setDragX(newX)
  }
  const onEnd = () => {
    if (!dragging || triggered) return
    setDragging(false)
    if (dragX >= THRESHOLD) {
      setTriggered(true)
      setDragX(MAX_DRAG)
      setTimeout(onAccept, 200)
    } else {
      setDragX(0)  // snap back
    }
  }

  // progress 0→1
  const progress = dragX / MAX_DRAG
  // Interpolate label opacity: "Slide to answer" fades out as thumb moves right
  const labelOpacity = Math.max(0, 1 - progress * 2.5)
  // Green fills in from left as thumb moves right
  const fillWidth = THUMB_W / 2 + dragX + (THUMB_W / 2)

  return (
    <div className="flex flex-col items-center gap-5 pb-2">
      {/* Swipe track */}
      <div
        ref={trackRef}
        style={{ width: TRACK_W, touchAction: 'none', userSelect: 'none' }}
        className="relative h-16 rounded-full bg-white/10 border border-white/15 overflow-hidden"
        onMouseDown={e => onStart(e.clientX)}
        onMouseMove={e => onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        onTouchStart={e => onStart(e.touches[0].clientX)}
        onTouchMove={e => { e.preventDefault(); onMove(e.touches[0].clientX) }}
        onTouchEnd={onEnd}
      >
        {/* Green fill */}
        <div
          className="absolute inset-y-0 left-0 bg-green-500/30 transition-none"
          style={{ width: fillWidth, borderRadius: 'inherit' }}
        />

        {/* Label */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: labelOpacity, transition: dragging ? 'none' : 'opacity 0.3s' }}
        >
          <span className="text-sm font-semibold text-white/60 tracking-wide pl-10">
            Slide to answer →
          </span>
        </div>

        {/* Thumb */}
        <div
          className="absolute top-1 bottom-1 left-1 flex items-center justify-center rounded-full shadow-lg"
          style={{
            width: THUMB_W,
            background: triggered ? '#22c55e' : `hsl(${142 * progress}, 70%, ${45 + 10 * progress}%)`,
            transform: `translateX(${dragX}px)`,
            transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(.34,1.56,.64,1), background 0.2s',
            boxShadow: `0 0 ${8 + progress * 20}px rgba(34,197,94,${0.3 + progress * 0.5})`,
          }}
        >
          {isVideo
            ? <Video size={24} className="text-white" />
            : <Phone size={24} className="text-white" />
          }
        </div>
      </div>

      {/* Decline button below */}
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={onDecline}
          className="w-14 h-14 rounded-full bg-red-500/80 hover:bg-red-500 active:scale-90 flex items-center justify-center shadow-lg transition-all border border-red-400/30"
        >
          <PhoneOff size={22} className="text-white" />
        </button>
        <span className="text-xs text-white/40 font-medium">Decline</span>
      </div>
    </div>
  )
}

function Pill({ icon: Icon, label }) {
  return (
    <span className="flex items-center gap-1 text-[11px] bg-black/50 backdrop-blur-sm text-white/60 px-2.5 py-1 rounded-full border border-white/10">
      <Icon size={10} /> {label}
    </span>
  )
}

function Btn({ icon: Icon, label, onClick, active = false, color = 'bg-white/15 hover:bg-white/25', size = 'md', sublabel }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 transition-all active:scale-90 cursor-pointer min-w-[52px]">
      <div className={clsx('rounded-full flex items-center justify-center shadow-lg transition-all',
        size === 'lg' ? 'w-16 h-16' : 'w-[52px] h-[52px]',
        active ? 'bg-red-500/80 hover:bg-red-500 ring-2 ring-red-400/30' : color,
      )}>
        <Icon size={size === 'lg' ? 26 : 22} className="text-white" />
      </div>
      <span className="text-[11px] text-white/60 font-medium leading-tight text-center">{label}</span>
      {sublabel && <span className="text-[9px] text-white/25 -mt-0.5">{sublabel}</span>}
    </button>
  )
}

function SmallBtn({ icon: Icon, label, onClick, active = false }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 transition-all active:scale-90">
      <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center border transition-all',
        active ? 'bg-white/25 border-white/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
      )}>
        <Icon size={16} className={active ? 'text-white' : 'text-white/50'} />
      </div>
      <span className="text-[10px] text-white/40 font-medium">{label}</span>
    </button>
  )
}
