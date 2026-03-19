import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Phone, Video, Send, Sparkles, Loader2, Mic, Square, X, Play, Pause, Trash2, MoreVertical, ImageIcon, Smile, Reply, Pencil, Check, Camera } from 'lucide-react'
import { useAuthStore, useUIStore, useNotifStore } from '@/store'
import sb from '@/lib/supabase'
import { useCall } from '@/lib/CallContext'
import Avatar from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/PageLoader'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Rewrite Supabase Storage audio URLs through our CORS proxy ─
function proxyAudioUrl(url) {
  if (!url) return url
  if (url.includes('/.netlify/functions/') || url.startsWith('blob:')) return url
  const match = url.match(/\/storage\/v1\/object\/public\/voice\/(.+)$/)
  if (!match) return url
  return `/.netlify/functions/voice-proxy?path=${encodeURIComponent(match[1])}`
}

// ── Voice Recorder Hook ───────────────────────────────────────
// Supports Chrome/Firefox (webm/opus) AND iOS Safari (mp4/aac)
function useVoiceRecorder() {
  const [state, setState] = useState('idle')
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [waveform, setWaveform] = useState([])
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const animFrameRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)

  // Detect best mime type for this browser
  // iOS Safari only supports audio/mp4, Chrome prefers audio/webm;codecs=opus
  const getBestMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
    ]
    return types.find(t => {
      try { return MediaRecorder.isTypeSupported(t) } catch { return false }
    }) || ''
  }

  const startWaveform = useCallback((stream) => {
    try {
      // Resume/create AudioContext — must happen inside user gesture on iOS
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') ctx.resume()
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser

      const draw = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteTimeDomainData(data) // time-domain is more reliable than frequency
        const bars = Array.from({ length: 20 }, (_, i) => {
          const idx = Math.floor(i * data.length / 20)
          // Convert from 0-255 (128=silence) to 0-100 amplitude
          return Math.round(Math.abs(data[idx] - 128) / 128 * 100)
        })
        setWaveform(bars)
        animFrameRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch (err) {
      console.warn('Waveform failed:', err)
      // Fallback: animated fake waveform so UI still looks alive
      let t = 0
      const fake = () => {
        t += 0.15
        setWaveform(Array.from({ length: 20 }, (_, i) =>
          Math.round(Math.abs(Math.sin(t + i * 0.4)) * 60 + 10)
        ))
        animFrameRef.current = requestAnimationFrame(fake)
      }
      fake()
    }
  }, [])

  const start = useCallback(async () => {
    try {
      // Request mic with explicit constraints for best quality
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      })
      streamRef.current = stream

      const mimeType = getBestMimeType()
      let mediaRecorder
      try {
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      } catch {
        // Fallback: no options (browser picks its own format)
        mediaRecorder = new MediaRecorder(stream)
      }
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        cancelAnimationFrame(animFrameRef.current)
        // Close AudioContext
        audioCtxRef.current?.close().catch(() => {})
        audioCtxRef.current = null
        analyserRef.current = null
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop())

        if (chunksRef.current.length === 0) {
          toast.error('No audio captured — try again')
          setState('idle')
          return
        }

        // Use the actual mimeType the recorder used (may differ from requested)
        const actualMime = mediaRecorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualMime })

        if (blob.size < 500) {
          toast.error('Recording too short')
          setState('idle')
          return
        }

        const url = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setState('preview')
      }

      mediaRecorder.onerror = (e) => {
        toast.error('Recording error: ' + e.error?.message)
        setState('idle')
      }

      // Start with 250ms timeslice — gives reliable chunks on all browsers
      mediaRecorder.start(250)
      setState('recording')
      setDuration(0)
      setWaveform(Array(20).fill(5))
      startWaveform(stream)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)

    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        toast.error('Microphone permission denied')
      } else if (e.name === 'NotFoundError') {
        toast.error('No microphone found')
      } else {
        toast.error('Could not start recording: ' + e.message)
      }
    }
  }, [startWaveform])

  const stop = useCallback(() => {
    clearInterval(timerRef.current)
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return
    // Request any buffered data before stopping
    try { mr.requestData() } catch (_) {}
    // Give 300ms for final chunk to arrive, then stop
    setTimeout(() => {
      try {
        if (mr.state !== 'inactive') mr.stop()
      } catch (_) {}
    }, 300)
  }, [])

  // audioUrlRef must be declared before cancel/reset callbacks that reference it
  const audioUrlRef = useRef(null)
  useEffect(() => {
    audioUrlRef.current = audioUrl
  }, [audioUrl])

  const cancel = useCallback(() => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animFrameRef.current)
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
    const mr = mediaRecorderRef.current
    if (mr) {
      // Null out handlers BEFORE calling stop() — on iOS Safari, stop() can
      // fire onstop synchronously before returning, so if we null after we
      // miss the window and the blob/url get set, leaking an object URL.
      mr.ondataavailable = null
      mr.onstop = null
      mr.onerror = null
      try { if (mr.state !== 'inactive') mr.stop() } catch (_) {}
    }
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    // Revoke using ref — safe even if audioUrlRef.current is null
    try {
      if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current) }
    } catch (_) {}
    audioUrlRef.current = null
    setAudioBlob(null); setAudioUrl(null)
    setDuration(0); setWaveform([]); setState('idle')
  }, [])

  const reset = useCallback(() => {
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null }
    setAudioBlob(null); setAudioUrl(null)
    setDuration(0); setWaveform([]); setState('idle')
  }, [])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animFrameRef.current)
    audioCtxRef.current?.close().catch(() => {})
    // Only revoke on true unmount
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
  }, []) // empty deps = unmount only

  return { state, duration, audioBlob, audioUrl, waveform, start, stop, cancel, reset }
}

// ── Inline Audio Player ───────────────────────────────────────
function AudioPlayer({ src, isMe }) {
  const [playing, setPlaying]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [dur, setDur]           = useState(0)
  const [loaded, setLoaded]     = useState(false)
  // errored = true when the audio src failed to load.
  // We do NOT toast on silent preload errors — only when the user presses Play.
  // This prevents N stacked toasts when N voice messages are visible at once.
  const [errored, setErrored]   = useState(false)
  const audioRef                = useRef(null)

  // Guard against Infinity (streaming audio before Content-Length is known)
  // and NaN (metadata not yet parsed). Show '--:--' in both cases.
  const fmt = s => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '--:--'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  const toggle = () => {
    if (errored) {
      // User pressed play on a broken audio — show exactly one toast
      toast.error('Could not play audio', { id: 'audio-play-error' })
      return
    }
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else {
      a.play().catch(err => {
        setPlaying(false)
        setErrored(true)
        // id deduplication: even if called multiple times, only one toast shows
        toast.error('Could not play audio', { id: 'audio-play-error' })
        console.warn('[AudioPlayer] play() failed:', err.message)
      })
      setPlaying(true)
    }
  }

  return (
    <div className={clsx('flex items-center gap-2.5 w-full', isMe && 'flex-row-reverse')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={e => {
          const d = e.target.duration
          setErrored(false)
          // Only mark loaded once we have a finite, valid duration.
          // Browsers can fire onLoadedMetadata with Infinity for streaming
          // audio before the full file is buffered via the proxy.
          if (isFinite(d) && d > 0) { setDur(d); setLoaded(true) }
        }}
        onDurationChange={e => {
          // Fires again once the browser knows the real duration.
          // Catches the case where onLoadedMetadata gave us Infinity.
          const d = e.target.duration
          if (isFinite(d) && d > 0) { setDur(d); setLoaded(true) }
        }}
        onTimeUpdate={e => {
          const d = e.target.duration
          if (d && isFinite(d) && d > 0) setProgress((e.target.currentTime / d) * 100)
        }}
        onEnded={() => { setPlaying(false); setProgress(0) }}
        onError={() => {
          // Silent failure — just update state. No toast here.
          // The toast fires only when the user actively presses Play (see toggle()).
          setPlaying(false)
          setLoaded(false)
          setErrored(true)
        }}
      />
      <button
        onClick={toggle}
        title={errored ? 'Audio unavailable' : undefined}
        className={clsx(
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95',
          errored
            ? 'bg-gray-400 dark:bg-white/20 cursor-not-allowed opacity-60'
            : isMe ? 'bg-white/25 hover:bg-white/35' : 'bg-brand-500 hover:bg-brand-600'
        )}
      >
        {playing
          ? <Pause size={14} className="text-white" />
          : <Play size={14} className="text-white" fill="white" />
        }
      </button>
      <div className="flex-1 space-y-1 min-w-0">
        {/* Waveform-style progress bar with dots */}
        <div
          className={clsx('relative w-full h-5 flex items-center gap-px cursor-pointer')}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            if (audioRef.current) {
              audioRef.current.currentTime = pct * audioRef.current.duration
            }
          }}
        >
          {Array.from({ length: 28 }, (_, i) => {
            const h = [4,6,8,5,9,7,10,6,8,5,7,9,6,8,10,7,5,8,6,9,7,5,8,6,10,7,5,6][i] * 1.5
            // When isMe, the flex row is reversed so bar index 0 is on the right.
            // Mirror the fill comparison so progress still advances left-to-right visually.
            const visualIndex = isMe ? 27 - i : i
            const filled = (visualIndex / 28) * 100 <= progress
            return (
              <div
                key={i}
                className={clsx(
                  'flex-1 rounded-full transition-all duration-100',
                  filled
                    ? isMe ? 'bg-white' : 'bg-brand-500'
                    : isMe ? 'bg-white/30' : 'bg-gray-300 dark:bg-white/20'
                )}
                style={{ height: `${h}px` }}
              />
            )
          })}
        </div>
        <div className={clsx('text-[10px] font-mono', isMe ? 'text-brand-100' : 'text-gray-400')}>
          {loaded ? fmt(dur) : '--:--'}
        </div>
      </div>
    </div>
  )
}

// ── Live Recording UI ─────────────────────────────────────────
function RecordingBar({ duration, waveform }) {
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-3 flex-1 bg-red-50 dark:bg-red-950/30 rounded-2xl px-3 py-2">
      {/* Red pulsing dot */}
      <div className="relative flex-shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
      </div>

      {/* Live waveform bars */}
      <div className="flex items-center gap-px flex-1 h-8">
        {waveform.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-full bg-red-400 dark:bg-red-400 transition-all duration-75"
            style={{ height: `${Math.max(3, (v / 100) * 28)}px` }}
          />
        ))}
      </div>

      {/* Timer */}
      <span className="text-sm font-mono text-red-600 dark:text-red-400 font-bold flex-shrink-0 tabular-nums">
        {fmt(duration)}
      </span>
    </div>
  )
}

// ── Convert blob to base64 ────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function Chat() {
  const { userId } = useParams()
  const { user } = useAuthStore()
  const { setMsgCount } = useNotifStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [smartReplies, setSmartReplies] = useState([])
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartVisible, setSmartVisible] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  // Edit / delete / reply state
  const [editingMsg, setEditingMsg] = useState(null)   // { id, content }
  const [editText, setEditText] = useState('')
  const [replyTo, setReplyTo] = useState(null)          // message being replied to
  const [ctxMenu, setCtxMenu] = useState(null)          // { msg, x, y }

  // ── Call context (WebRTC lives in Layout so calls work from any page) ──
  const call = useCall()

  // ── Refs ──
  const lastAutoReplyMsgId  = useRef(null)
  const typingTimeoutRef    = useRef(null)
  const typingChannelRef    = useRef(null)
  const bottomRef           = useRef()
  const inputRef            = useRef()
  const channelRef          = useRef(null)


  const voice = useVoiceRecorder()

  const { data: other } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await sb.from('profiles').select('id, username, full_name, avatar_url, bio, last_active, xp').eq('id', userId).single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', user?.id, userId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('messages')
        .select('id, sender_id, receiver_id, content, image_url, audio_url, is_read, is_edited, reply_to_id, reply_to_content, reply_to_sender, created_at')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return data || []
    },
    enabled: !!user && !!userId,
  })

  useEffect(() => {
    if (!user?.id || !userId) return
    if (document.visibilityState !== 'visible') return
    // Optimistically clear the unread badge immediately so it feels instant
    sb.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('is_read', false)
      .neq('sender_id', userId)  // messages from OTHER conversations still unread
      .then(({ count }) => setMsgCount(count ?? 0))
    sb.from('messages')
      .update({ is_read: true })
      .eq('sender_id', userId)
      .eq('receiver_id', user.id)
      .eq('is_read', false)
      .then(({ error }) => { if (error) console.warn('mark-read:', error.message) })
  }, [user?.id, userId, messages.length])

  useEffect(() => {
    if (!user?.id || !userId) return
    const name = `chat:${[user.id, userId].sort().join(':')}`
    channelRef.current = sb.channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['messages', user.id, userId] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['messages', user.id, userId] })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['messages', user.id, userId] })
      })
      .subscribe()
    return () => { if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null } }
  }, [user?.id, userId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Typing indicator via Supabase Presence ────────────────
  useEffect(() => {
    if (!user?.id || !userId) return
    const name = `typing:${[user.id, userId].sort().join(':')}`
    typingChannelRef.current = sb.channel(name, { config: { presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannelRef.current.presenceState()
        const othersTyping = Object.keys(state).filter(k => k !== user.id)
        setOtherTyping(othersTyping.length > 0)
      })
      .subscribe()
    return () => {
      clearTimeout(typingTimeoutRef.current)
      if (typingChannelRef.current) { sb.removeChannel(typingChannelRef.current); typingChannelRef.current = null }
    }
  }, [user?.id, userId])

  // Broadcast typing state when user types
  const broadcastTyping = useCallback(() => {
    if (!typingChannelRef.current) return
    typingChannelRef.current.track({ typing: true })
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      typingChannelRef.current?.untrack()
    }, 2000) // stop showing after 2s of inactivity
  }, [])

  const sendMutation = useMutation({
    mutationFn: async (payload) => {
      const { data: msgData, error } = await sb.from('messages').insert({ sender_id: user.id, receiver_id: userId, ...payload }).select('id').single()
      if (error) throw error
      // reference_id = sender's user.id so deep-link opens /messages/:senderId
      sb.from('notifications').insert({
        user_id: userId, actor_id: user.id,
        type: 'message', reference_id: user.id, is_read: false,
        extra_data: { preview: (payload.content || '').slice(0, 80) || '📎 Attachment' },
      }).then(() => {}).catch(() => {})
    },
    onSuccess: () => {
      setText(''); setSmartReplies([]); setSmartVisible(false); voice.reset(); setReplyTo(null)
      qc.invalidateQueries({ queryKey: ['messages', user.id, userId] })
      inputRef.current?.focus()
    },
    onError: () => toast.error('Failed to send message'),
  })

  const editMutation = useMutation({
    mutationFn: async ({ id, content }) => {
      const { error } = await sb.from('messages')
        .update({ content, is_edited: true })
        .eq('id', id)
        .eq('sender_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingMsg(null); setEditText('')
      qc.invalidateQueries({ queryKey: ['messages', user.id, userId] })
    },
    onError: () => toast.error('Failed to edit message'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await sb.from('messages')
        .delete()
        .eq('id', id)
        .eq('sender_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', user.id, userId] }),
    onError: () => toast.error('Failed to delete message'),
  })

  const sendVoice = useCallback(async () => {
    if (!voice.audioBlob || sendingVoice) return
    setSendingVoice(true)
    try {
      const mimeType = voice.audioBlob.type || 'audio/webm'
      // Determine correct file extension from actual recorded mime type
      let ext = 'webm'
      if (mimeType.includes('mp4')) ext = 'mp4'
      else if (mimeType.includes('ogg')) ext = 'ogg'
      else if (mimeType.includes('mpeg')) ext = 'mp3'
      const path = `${user.id}/${Date.now()}.${ext}`

      const audioBase64 = await blobToBase64(voice.audioBlob)
      const { data: { session } } = await sb.auth.getSession()

      const res = await fetch('/.netlify/functions/upload-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType, path, userToken: session?.access_token }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Upload failed')
      if (!result.publicUrl) throw new Error('No public URL returned')

      sendMutation.mutate({ content: '🎤 Voice message', audio_url: result.publicUrl })
    } catch (e) {
      toast.error('Voice send failed: ' + (e?.message || String(e)))
    } finally {
      setSendingVoice(false)
    }
  }, [voice.audioBlob, user.id, sendMutation, sendingVoice])

  const handleSend = useCallback(() => {
    if (editingMsg) {
      if (editText.trim()) editMutation.mutate({ id: editingMsg.id, content: editText.trim() })
      return
    }
    if (text.trim()) sendMutation.mutate({
      content: text.trim(),
      ...(replyTo ? { reply_to_id: replyTo.id, reply_to_content: replyTo.content, reply_to_sender: replyTo.sender_id === user.id ? 'You' : other?.full_name?.split(' ')[0] } : {}),
    })
  }, [text, editingMsg, editText, replyTo, sendMutation, editMutation, other, user.id])

  const handleKeyDown = (e) => {
    // Enter always inserts a new line on both mobile and desktop
    // Only Ctrl+Enter or Cmd+Enter sends the message
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleSend() }
      // else: default textarea behaviour = new line on all devices
    }
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  const fetchSmartReplies = async ({ silent = false } = {}) => {
    if (!messages.length || smartLoading) return
    // Only auto-suggest when last message is from the other person
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.sender_id === user?.id) return

    setSmartLoading(true)
    try {
      const context = messages.slice(-6).map(m =>
        `${m.sender_id === user.id ? 'Me' : (other?.full_name?.split(' ')[0] ?? 'Them')}: ${m.content}`
      ).join('\n')
      const res = await fetch('/.netlify/functions/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Chat:\n${context}\n\nSuggest 3 short replies I could send next.` }],
          system: 'Return ONLY a JSON array of 3 short, natural, conversational reply strings (max 8 words each). Match the tone of the conversation. No markdown, no numbering, just the array.',
          max_tokens: 150,
        }),
      })
      if (!res.ok) throw new Error('AI unavailable')
      const data = await res.json()
      const raw = (data.content?.[0]?.text ?? '[]').replace(/```json|```/gi, '').trim()
      const replies = JSON.parse(raw)
      if (Array.isArray(replies) && replies.length) {
        setSmartReplies(replies.slice(0, 3))
        setSmartVisible(true)
      }
    } catch {
      // Silent fail for auto-trigger; show toast only when user manually tapped
      if (!silent) toast.error('Smart replies unavailable')
    }
    finally { setSmartLoading(false) }
  }

  // Auto-trigger suggestions whenever a new message arrives from the other person
  useEffect(() => {
    if (!messages.length) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.sender_id === user?.id) return
    if (lastMsg.audio_url) return // skip voice messages
    if (lastMsg.id === lastAutoReplyMsgId.current) return // already suggested for this msg
    lastAutoReplyMsgId.current = lastMsg.id
    // Small delay so the message renders first
    const t = setTimeout(() => fetchSmartReplies({ silent: true }), 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])


  const messagesByDate = messages.reduce((acc, msg) => {
    const ts = msg.created_at ? new Date(msg.created_at) : null
    const date = ts && !isNaN(ts) ? ts.toLocaleDateString() : 'Unknown'
    if (!acc[date]) acc[date] = []
    acc[date].push(msg)
    return acc
  }, {})

  const formatDateDivider = (dateStr) => {
    if (dateStr === 'Unknown') return ''
    const d = new Date(dateStr)
    if (!d || isNaN(d)) return ''
    if (isToday(d)) return 'Today'
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'EEEE, MMM d')
  }

  const { onlineUsers } = useUIStore()
  const isOnline = onlineUsers.includes(userId)
  const lastSeenText = () => {
    if (isOnline) return 'Online now'
    if (!other?.last_active) return null
    const diff = Date.now() - new Date(other.last_active).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 2) return 'Just now'
    if (m < 60) return `Active ${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `Active ${h}h ago`
    return `Active ${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="flex flex-col -m-4 lg:-m-6 overflow-x-hidden animate-fade-in" style={{ height: "calc(100dvh - 120px)" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 py-3 flex-shrink-0 bg-white dark:bg-surface-900 border-b border-surface-100 dark:border-white/5 shadow-sm">
        <button
          onClick={() => navigate('/messages')}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </button>

        <div className="relative flex-shrink-0">
          {isOnline ? (
            <div className="w-[42px] h-[42px] rounded-full p-[2px] gradient-brand">
              <div className="w-full h-full rounded-full border-2 border-white dark:border-surface-900 overflow-hidden">
                <Avatar src={other?.avatar_url} name={other?.full_name} size={36} />
              </div>
            </div>
          ) : (
            <Avatar src={other?.avatar_url} name={other?.full_name} size={42} />
          )}
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] text-gray-900 dark:text-white truncate leading-tight">
            {other?.full_name ?? '...'}
          </div>
          {lastSeenText() && (
            <div className={`text-[11px] font-medium leading-tight ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
              {lastSeenText()}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => other && call.startCall(other, 'voice')}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-500 transition-colors"
            title="Voice call"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => other && call.startCall(other, 'video')}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-500 transition-colors"
            title="Video call"
          >
            <Video size={18} />
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-100 dark:hover:bg-white/10 text-gray-400 transition-colors">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        {isLoading ? (
          <div className="space-y-4 pt-4">
            {[1,2,3,4].map(i => (
              <div key={i} className={clsx('flex gap-2 items-end', i % 2 === 0 ? 'flex-row-reverse' : '')}>
                {i % 2 !== 0 && <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />}
                <Skeleton className={`h-11 rounded-2xl ${i % 2 === 0 ? 'w-36' : 'w-52'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="w-16 h-16 rounded-full gradient-brand flex items-center justify-center shadow-glow">
              <span className="text-2xl">👋</span>
            </div>
            <div>
              <p className="font-bold text-gray-800 dark:text-white">Say hi to {other?.full_name?.split(' ')[0]}!</p>
              <p className="text-xs text-gray-400 mt-1">Start your conversation</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(messagesByDate).map(([date, msgs]) => (
              <div key={date} className="space-y-1">
                {/* Date divider */}
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-surface-200 dark:bg-white/10" />
                  <span className="text-[11px] text-gray-400 font-semibold bg-white dark:bg-surface-900 px-2 rounded-full border border-surface-200 dark:border-white/10">
                    {formatDateDivider(date)}
                  </span>
                  <div className="flex-1 h-px bg-surface-200 dark:bg-white/10" />
                </div>

                {msgs.map((msg, msgIdx) => {
                  const isMe = msg.sender_id === user.id
                  const prevMsg = msgs[msgIdx - 1]
                  const nextMsg = msgs[msgIdx + 1]
                  const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id
                  const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id
                  const isLastMyRead = isMe && msg.is_read &&
                    msgs.slice(msgIdx + 1).every(m => m.sender_id !== user.id)
                  const _msgDate = msg.created_at ? new Date(msg.created_at) : null
                  const msgTime = _msgDate && !isNaN(_msgDate) ? format(_msgDate, 'h:mm a') : ''

                  // Long-press for mobile
                  let pressTimer = null
                  const onTouchStart = (e) => {
                    pressTimer = setTimeout(() => {
                      const t = e.touches[0]
                      setCtxMenu({ msg, x: t.clientX, y: t.clientY })
                    }, 500)
                  }
                  const onTouchEnd = () => clearTimeout(pressTimer)

                  return (
                    <div key={msg.id} className={clsx('flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row', isLastInGroup ? 'mb-2' : 'mb-0.5')}>
                      {/* Avatar slot */}
                      <div className="w-7 flex-shrink-0 flex items-end">
                        {!isMe && isLastInGroup && (
                          <Avatar src={other?.avatar_url} name={other?.full_name} size={26} />
                        )}
                      </div>

                      <div className={clsx('flex flex-col max-w-[72%]', isMe ? 'items-end' : 'items-start')}>
                        {/* Reply preview banner */}
                        {msg.reply_to_content && (
                          <div className={clsx(
                            'text-[11px] px-3 py-1.5 rounded-t-xl mb-0.5 max-w-full truncate border-l-2 border-brand-400 bg-black/10 dark:bg-white/10 text-gray-500 dark:text-gray-300',
                          )}>
                            <span className="font-semibold text-brand-400">{msg.reply_to_sender}</span>
                            {': '}{msg.reply_to_content}
                          </div>
                        )}

                        {/* Bubble */}
                        <div
                          className={clsx(
                            'px-4 py-2.5 text-sm leading-relaxed shadow-sm cursor-pointer select-none',
                            isMe
                              ? 'gradient-brand text-white'
                              : 'bg-white dark:bg-white/10 text-gray-800 dark:text-gray-100 border border-surface-200 dark:border-white/8',
                            isMe && isFirstInGroup && isLastInGroup && 'rounded-2xl',
                            isMe && isFirstInGroup && !isLastInGroup && 'rounded-t-2xl rounded-bl-2xl rounded-br-md',
                            isMe && !isFirstInGroup && isLastInGroup && 'rounded-t-md rounded-bl-2xl rounded-br-2xl',
                            isMe && !isFirstInGroup && !isLastInGroup && 'rounded-l-2xl rounded-r-md',
                            !isMe && isFirstInGroup && isLastInGroup && 'rounded-2xl',
                            !isMe && isFirstInGroup && !isLastInGroup && 'rounded-t-2xl rounded-br-2xl rounded-bl-md',
                            !isMe && !isFirstInGroup && isLastInGroup && 'rounded-t-md rounded-br-2xl rounded-bl-2xl',
                            !isMe && !isFirstInGroup && !isLastInGroup && 'rounded-r-2xl rounded-l-md',
                          )}
                          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ msg, x: e.clientX, y: e.clientY }) }}
                          onTouchStart={onTouchStart}
                          onTouchEnd={onTouchEnd}
                          onTouchMove={onTouchEnd}
                        >
                          {msg.content === '🎤 Voice message' && msg.audio_url
                            ? <AudioPlayer src={proxyAudioUrl(msg.audio_url)} isMe={isMe} />
                            : msg.image_url
                              ? <div className="overflow-hidden rounded-xl -mx-1 -my-0.5">
                                  <img
                                    src={msg.image_url}
                                    alt="Photo"
                                    className="max-w-[220px] max-h-[280px] object-cover rounded-xl"
                                    loading="lazy"
                                  />
                                </div>
                            : <p className="break-words whitespace-pre-wrap">{msg.content}{msg.is_edited && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}</p>
                          }
                        </div>

                        {/* Timestamp on last in group */}
                        {isLastInGroup && (
                          <div className={clsx('flex items-center gap-1 mt-1 px-1', isMe ? 'flex-row-reverse' : 'flex-row')}>
                            <span className="text-[10px] text-gray-400 tabular-nums">{msgTime}</span>
                            {isMe && (
                              msg.is_read
                                ? <span className="text-[10px] text-brand-400 font-bold">✓✓</span>
                                : <span className="text-[10px] text-gray-300">✓</span>
                            )}
                          </div>
                        )}

                        {/* Seen with avatar + time */}
                        {isLastMyRead && (
                          <div className="flex items-center gap-1 px-1">
                            <Avatar src={other?.avatar_url} name={other?.full_name} size={14} />
                            <span className="text-[10px] text-brand-400 font-semibold">Seen {msgTime}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Typing indicator ── */}
      {otherTyping && voice.state === 'idle' && (
        <div className="flex items-center gap-2 px-4 pb-1 pt-0.5 flex-shrink-0 animate-fade-in">
          <Avatar src={other?.avatar_url} name={other?.full_name} size={22} />
          <div className="flex items-center gap-1 bg-white dark:bg-white/10 border border-surface-100 dark:border-white/10 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Smart replies ── */}
      {smartVisible && smartReplies.length > 0 && voice.state === 'idle' && (
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide flex-shrink-0 bg-white dark:bg-surface-900 border-t border-surface-100 dark:border-white/5 animate-fade-in">
          <Sparkles size={13} className="text-brand-400 flex-shrink-0" />
          {smartReplies.map((r, i) => (
            <button
              key={i}
              onClick={() => { setText(r); setSmartReplies([]); setSmartVisible(false); inputRef.current?.focus() }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-brand-300 dark:border-brand-500/40 text-brand-600 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 whitespace-nowrap transition-colors"
            >
              {r}
            </button>
          ))}
          <button onClick={() => setSmartVisible(false)} className="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Context menu (right-click / long-press) ── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-white/10 py-1 min-w-[160px] animate-fade-in"
          style={{ top: Math.min(ctxMenu.y, window.innerHeight - 160), left: Math.min(ctxMenu.x, window.innerWidth - 180) }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { setReplyTo(ctxMenu.msg); setCtxMenu(null); inputRef.current?.focus() }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
          >
            <Reply size={15} /> Reply
          </button>
          {ctxMenu.msg.sender_id === user.id && !ctxMenu.msg.audio_url && (
            <button
              onClick={() => { setEditingMsg(ctxMenu.msg); setEditText(ctxMenu.msg.content); setCtxMenu(null); setTimeout(() => inputRef.current?.focus(), 50) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
            >
              <Pencil size={15} /> Edit
            </button>
          )}
          {ctxMenu.msg.sender_id === user.id && (
            <button
              onClick={() => { deleteMutation.mutate(ctxMenu.msg.id); setCtxMenu(null) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      )}

      {/* ── Reply banner ── */}
      {replyTo && !editingMsg && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-50 dark:bg-surface-800 border-t border-surface-100 dark:border-white/5 flex-shrink-0 animate-fade-in">
          <Reply size={14} className="text-brand-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-brand-400">{replyTo.sender_id === user.id ? 'You' : other?.full_name?.split(' ')[0]}</span>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{replyTo.content}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* ── Edit banner ── */}
      {editingMsg && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-500/20 flex-shrink-0 animate-fade-in">
          <Pencil size={14} className="text-amber-500 flex-shrink-0" />
          <p className="flex-1 text-[11px] text-amber-600 dark:text-amber-400 truncate">Editing: {editingMsg.content}</p>
          <button onClick={() => { setEditingMsg(null); setEditText('') }} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex items-end gap-1.5 px-2 py-2.5 bg-white dark:bg-surface-900 border-t border-surface-100 dark:border-white/5 flex-shrink-0">

        {/* RECORDING */}
        {voice.state === 'recording' && (
          <>
            <button onClick={voice.cancel} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 flex-shrink-0 transition-colors">
              <Trash2 size={17} />
            </button>
            <RecordingBar duration={voice.duration} waveform={voice.waveform} />
            <button onClick={voice.stop} className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center text-white flex-shrink-0 transition-all shadow-lg">
              <Square size={13} fill="white" />
            </button>
          </>
        )}

        {/* PREVIEW */}
        {voice.state === 'preview' && (
          <>
            <button onClick={voice.cancel} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 flex-shrink-0 transition-colors">
              <Trash2 size={17} />
            </button>
            <div className="flex-1 bg-surface-50 dark:bg-white/5 rounded-2xl px-3 py-2">
              <AudioPlayer src={voice.audioUrl} isMe={false} />
            </div>
            <button onClick={sendVoice} disabled={sendingVoice} className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white flex-shrink-0 shadow-glow-sm active:scale-95 disabled:opacity-60 transition-all">
              {sendingVoice ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
            </button>
          </>
        )}

        {/* IDLE */}
        {voice.state === 'idle' && (
          <>
            {/* Camera */}
            <label className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-400 transition-colors flex-shrink-0 cursor-pointer active:scale-90">
              <Camera size={18} />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return }
                  try {
                    const path = `posts/${user.id}/${Date.now()}.${f.name.split('.').pop() || 'jpg'}`
                    const { error } = await sb.storage.from('images').upload(path, f, { upsert: true })
                    if (error) throw error
                    const { data } = sb.storage.from('images').getPublicUrl(path)
                    sendMutation.mutate({ content: '📷 Photo', image_url: data.publicUrl })
                  } catch { toast.error('Failed to send photo') }
                }}
              />
            </label>

            {/* GIF */}
            <label className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors flex-shrink-0 cursor-pointer active:scale-90">
              <div className="w-7 h-5 rounded-md bg-purple-500 flex items-center justify-center">
                <span className="text-white font-black text-[9px] leading-none">GIF</span>
              </div>
              <input
                type="file"
                accept="image/gif"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { toast.error('GIF must be under 10MB'); return }
                  try {
                    const path = `posts/${user.id}/${Date.now()}.gif`
                    const { error } = await sb.storage.from('images').upload(path, f, { upsert: true, contentType: 'image/gif' })
                    if (error) throw error
                    const { data } = sb.storage.from('images').getPublicUrl(path)
                    sendMutation.mutate({ content: '🎞️ GIF', image_url: data.publicUrl })
                  } catch { toast.error('Failed to send GIF') }
                }}
              />
            </label>

            {/* Mic */}
            <button
              onClick={voice.start}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-brand-50 dark:hover:bg-brand-500/10 text-brand-400 transition-colors flex-shrink-0 active:scale-90"
            >
              <Mic size={18} />
            </button>

            {/* Expandable textarea pill */}
            <div className="flex-1 flex items-end gap-1.5 bg-surface-100 dark:bg-surface-800 rounded-3xl px-3 py-2 min-h-[38px] min-w-0">
              <textarea
                ref={inputRef}
                value={editingMsg ? editText : text}
                onChange={e => {
                  if (editingMsg) {
                    setEditText(e.target.value)
                  } else {
                    setText(e.target.value)
                    if (e.target.value) setSmartVisible(false)
                    broadcastTyping()
                  }
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                }}
                onKeyDown={handleKeyDown}
                placeholder={editingMsg ? 'Edit message...' : 'Message... (Ctrl+Enter to send)'}
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 caret-gray-800 dark:caret-white resize-none outline-none leading-relaxed py-0.5 min-w-0"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
              />
              {/* Emoji / AI smart replies */}
              <button
                onClick={() => smartReplies.length && !smartLoading ? setSmartVisible(v => !v) : fetchSmartReplies()}
                disabled={smartLoading || !messages.length}
                title="AI smart replies"
                className="text-amber-400 disabled:opacity-30 hover:text-amber-500 transition-colors flex-shrink-0 pb-0.5"
              >
                {smartLoading ? <Loader2 size={15} className="animate-spin" /> : <Smile size={15} />}
              </button>
            </div>

            {/* Send / Confirm-edit */}
            <button
              onClick={handleSend}
              disabled={(sendMutation.isPending || editMutation.isPending) || (!text.trim() && !editingMsg)}
              className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white flex-shrink-0 shadow-glow-sm active:scale-95 disabled:opacity-40 transition-all"
            >
              {(sendMutation.isPending || editMutation.isPending)
                ? <Loader2 size={15} className="animate-spin" />
                : editingMsg ? <Check size={14} /> : <Send size={14} />
              }
            </button>
          </>
        )}
      </div>
    </div>
  )
}
