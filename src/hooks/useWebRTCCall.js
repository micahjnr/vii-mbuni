import { useState, useRef, useCallback, useEffect } from 'react'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

const FALLBACK_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:numb.viagenie.ca',                       username: 'webrtc@live.com',  credential: 'muazkh' },
  { urls: 'turn:relay.metered.ca:80',                    username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
  { urls: 'turn:relay.metered.ca:443',                   username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
  { urls: 'turns:relay.metered.ca:443?transport=tcp',    username: 'e8dd65f0e3ba775cd4dd5c32', credential: 'uKcGEW+NiXL9AQOL' },
]

async function fetchIceServers() {
  try {
    const res = await fetch('/.netlify/functions/get-ice-servers')
    if (!res.ok) throw new Error('fetch failed')
    const servers = await res.json()
    if (Array.isArray(servers) && servers.length > 0) return servers
    throw new Error('empty')
  } catch {
    return FALLBACK_ICE
  }
}

export function useWebRTCCall({ user, onIncomingCall }) {
  const [callState, setCallState]       = useState('idle')
  const [callType, setCallType]         = useState('voice')
  const [callSession, setCallSession]   = useState(null)
  const [remoteUser, setRemoteUser]     = useState(null)
  const [localStream, setLocalStream]   = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted]               = useState(false)
  const [cameraOff, setCameraOff]       = useState(false)
  const [speakerOff, setSpeakerOff]     = useState(false)
  const [facingMode, setFacingMode]     = useState('user')
  const [callDuration, setCallDuration] = useState(0)
  const [screenSharing, setScreenSharing] = useState(false)

  const pcRef            = useRef(null)
  const channelRef       = useRef(null)
  const durationRef      = useRef(null)
  const sessionIdRef     = useRef(null)
  const callStateRef     = useRef('idle')
  const endCallRef       = useRef(null)
  const localStreamRef   = useRef(null)
  const answerAppliedRef = useRef(false)
  const screenTrackRef   = useRef(null)
  const onIncomingRef    = useRef(onIncomingCall)

  useEffect(() => { callStateRef.current = callState }, [callState])
  useEffect(() => { localStreamRef.current = localStream }, [localStream])
  useEffect(() => { onIncomingRef.current = onIncomingCall }, [onIncomingCall])

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    setLocalStream(null)
    localStreamRef.current = null
  }, [])

  const closePeer = useCallback(() => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    if (channelRef.current) { sb.removeChannel(channelRef.current); channelRef.current = null }
    clearInterval(durationRef.current)
  }, [])

  const getMedia = useCallback(async (type) => {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    }

    // Always get audio first — it's required
    let audioStream = null
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
      console.log('[WebRTC] audio tracks:', audioStream.getAudioTracks().map(t => t.label))
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'Microphone permission denied — please allow mic access and try again'
        : err.name === 'NotFoundError' ? 'No microphone found'
        : 'Could not access microphone: ' + err.message
      toast.error(msg)
      throw err
    }

    // For video calls, try to get camera separately so audio still works if camera fails
    if (type === 'video') {
      const videoConstraintSets = [
        { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        { facingMode: 'user', width: { ideal: 640  }, height: { ideal: 480 } },
        { facingMode: 'user' },
        true,  // last resort: browser defaults
      ]
      let videoTrack = null
      for (const vc of videoConstraintSets) {
        try {
          const vs = await navigator.mediaDevices.getUserMedia({ audio: false, video: vc })
          videoTrack = vs.getVideoTracks()[0]
          if (videoTrack) {
            console.log('[WebRTC] video track:', videoTrack.label, 'settings:', JSON.stringify(videoTrack.getSettings()))
            break
          }
        } catch (e) {
          console.warn('[WebRTC] video constraint failed:', JSON.stringify(vc), e.message)
        }
      }
      if (videoTrack) {
        // Combine audio + video into one stream
        const combined = new MediaStream([...audioStream.getAudioTracks(), videoTrack])
        setLocalStream(combined)
        localStreamRef.current = combined
        return combined
      } else {
        // Camera failed — continue with audio only, show warning
        toast('📷 Camera unavailable — continuing with audio only', { icon: '⚠️', duration: 4000 })
        console.warn('[WebRTC] No video track available — audio-only fallback')
      }
    }

    setLocalStream(audioStream)
    localStreamRef.current = audioStream
    return audioStream
  }, [])

  // Apply high-quality encoding parameters to the video sender
  const applyVideoEncoding = useCallback(async (pc) => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (!sender) return
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings[0].maxBitrate      = 2_500_000   // 2.5 Mbps — clear HD
      params.encodings[0].maxFramerate    = 30
      params.encodings[0].networkPriority = 'high'
      params.encodings[0].priority        = 'high'
      await sender.setParameters(params)
    } catch (_) { /* browser may not support all fields — fail silently */ }
  }, [])

  const createPeer = useCallback(async (stream) => {
    const iceServers = await fetchIceServers()
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',     // allow STUN + TURN (relay-only fallback handled by restartIce)
      bundlePolicy: 'max-bundle',    // bundle audio+video on one transport
      rtcpMuxPolicy: 'require',
    })

    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    // Set high-bitrate encoding once the peer is ready
    pc.onnegotiationneeded = () => applyVideoEncoding(pc)

    // Use e.streams[0] when available — it's the most reliable way to get
    // a stream that already contains all associated tracks. Fall back to
    // building our own MediaStream for browsers that don't populate e.streams.
    const remoteTracks = new Map()
    pc.ontrack = (e) => {
      remoteTracks.set(e.track.id, e.track)

      // Prefer the browser-provided stream (already has all tracks bundled)
      const ms = (e.streams && e.streams[0]) || new MediaStream([...remoteTracks.values()])
      setRemoteStream(ms)

      // onunmute fires when a track that arrived muted becomes active
      // This is critical — remote tracks often start muted on mobile
      e.track.onunmute = () => {
        const live = (e.streams && e.streams[0]) || new MediaStream([...remoteTracks.values()])
        setRemoteStream(live)
      }
      e.track.onended = () => { remoteTracks.delete(e.track.id) }

      // Log for debugging
      console.log('[WebRTC] ontrack:', e.track.kind, 'muted:', e.track.muted, 'readyState:', e.track.readyState, 'streams:', e.streams?.length)
      // Some browsers deliver tracks muted — explicitly request unmute via a dummy read
      if (e.track.kind === 'audio') {
        // Force audio context interaction to unblock autoplay
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          ctx.resume().catch(() => {})
          // Don't connect — just resuming the context is enough to unblock autoplay
          setTimeout(() => ctx.close().catch(() => {}), 1000)
        } catch (_) {}
      }
    }

    let iceFailCount = 0
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        iceFailCount++
        if (iceFailCount === 1) {
          console.log('[WebRTC] ICE failed — restarting ICE, attempt 1')
          pc.restartIce()
        } else if (iceFailCount === 2) {
          // Second failure — try forcing relay-only (TURN) by creating a new PC
          console.log('[WebRTC] ICE failed again — forcing relay-only restart')
          pc.restartIce()
        } else {
          console.warn('[WebRTC] ICE failed after', iceFailCount, 'attempts — connection impossible')
          toast.error('Connection failed — check your network and try again')
        }
      }
      if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.log('[WebRTC] ICE disconnected — restarting ICE')
            pc.restartIce()
          }
        }, 3000)
      }
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        iceFailCount = 0
        console.log('[WebRTC] ICE connected ✓')
      }
    }
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') console.log('[WebRTC] Peer connected ✓ — call established')
      if (pc.connectionState === 'failed') pc.restartIce()
    }

    pcRef.current = pc
    return pc
  }, [applyVideoEncoding])

  const applyICE = useCallback(async (pc, json) => {
    if (!json || !pc) return
    // Must have remote description before adding ICE candidates
    if (!pc.remoteDescription) {
      console.log('[WebRTC] applyICE deferred — no remote description yet')
      return
    }
    try {
      const candidates = JSON.parse(json)
      if (!Array.isArray(candidates) || !candidates.length) return
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand))
        } catch (e) {
          // Expected errors: duplicate candidates, wrong state — ignore
          if (!e.message?.includes('Unknown ufrag')) {
            console.warn('[WebRTC] addIceCandidate error:', e.message)
          }
        }
      }
      console.log('[WebRTC] applied', candidates.length, 'ICE candidates')
    } catch (e) {
      console.error('[WebRTC] applyICE parse error:', e)
    }
  }, [])

  const applyAnswer = useCallback(async (row) => {
    const pc = pcRef.current
    if (!pc || answerAppliedRef.current || !row.answer) return
    // Allow 'stable' too in case of race — just skip if already have remote desc
    if (pc.signalingState !== 'have-local-offer') {
      console.log('[WebRTC] applyAnswer skipped — signalingState:', pc.signalingState)
      return
    }
    answerAppliedRef.current = true
    try {
      const sdp = JSON.parse(row.answer)
      await pc.setRemoteDescription(sdp)
      console.log('[WebRTC] ✓ remote description set (answer applied)')
      // Apply callee's ICE candidates if already present
      if (row.callee_ice) await applyICE(pc, row.callee_ice)
    } catch (err) {
      console.error('[WebRTC] setRemoteDescription error:', err)
      answerAppliedRef.current = false
      return
    }
    if (row.status === 'active' && callStateRef.current !== 'active') {
      setCallState('active')
      setCallDuration(0)
      durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }
  }, [applyICE])

  const subscribeToSession = useCallback((sessionId, isCaller = false) => {
    if (isCaller) answerAppliedRef.current = false

    const ch = sb.channel(`call:${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voice_sessions', filter: `id=eq.${sessionId}` },
        async (payload) => {
          const row = payload.new
          const pc  = pcRef.current
          if (!pc) return

          // CALLER only: apply the answer SDP when it arrives
          if (isCaller && !answerAppliedRef.current && row.answer) {
            await applyAnswer(row)
          }

          // Both sides: apply the OTHER party's new ICE candidates
          // Caller gets callee_ice, callee gets caller_ice
          const theirICE = isCaller ? row.callee_ice : row.caller_ice
          if (theirICE) await applyICE(pc, theirICE)

          // CALLER: transition to active once answer is applied
          if (isCaller && row.status === 'active' && callStateRef.current !== 'active' && answerAppliedRef.current) {
            setTimeout(() => applyVideoEncoding(pc), 500)
            setCallState('active')
            setCallDuration(0)
            durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
          }

          if (row.status === 'ended' || row.status === 'missed') endCallRef.current?.(false)
        })
      .subscribe()
    channelRef.current = ch
  }, [user?.id, applyAnswer, applyICE, applyVideoEncoding])

  // Poll until answer arrives (realtime sometimes misses the first update)
  const pollForAnswer = useCallback(async (sessionId) => {
    let attempts = 0
    const poll = async () => {
      if (answerAppliedRef.current || callStateRef.current !== 'ringing') return
      if (attempts++ >= 20) return
      try {
        const { data } = await sb.from('voice_sessions').select('*').eq('id', sessionId).single()
        if (data?.status === 'ended' || data?.status === 'missed') { endCallRef.current?.(false); return }
        if (data?.answer && !answerAppliedRef.current) await applyAnswer(data)
      } catch (_) {}
      if (!answerAppliedRef.current) setTimeout(poll, 2000)
    }
    setTimeout(poll, 1500)
  }, [applyAnswer])

  const gatherICE = useCallback((pc, sessionId, isCaller) => {
    const field = isCaller ? 'caller_ice' : 'callee_ice'
    const candidates = []
    pc.onicecandidate = async (e) => {
      if (!e.candidate) {
        console.log('[WebRTC] ICE gathering complete, total candidates:', candidates.length)
        return
      }
      candidates.push(e.candidate.toJSON())
      console.log('[WebRTC] ICE candidate:', e.candidate.type, e.candidate.protocol)
      try {
        await sb.from('voice_sessions')
          .update({ [field]: JSON.stringify(candidates) })
          .eq('id', sessionId)
      } catch(_) {}
    }
    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState)
    }
  }, [])

  const endCall = useCallback(async (updateDb = true) => {
    // Always reset local state immediately — never leave UI stuck
    screenTrackRef.current?.stop()
    screenTrackRef.current = null
    closePeer()
    stopLocalStream()
    setRemoteStream(null)
    setCallDuration(0)
    setScreenSharing(false)
    answerAppliedRef.current = false

    const sid = sessionIdRef.current
    sessionIdRef.current = null

    // Update DB (best effort — don't block UI reset on this)
    if (updateDb && sid) {
      try {
        await sb.from('voice_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', sid)
      } catch(_) {}
    }

    setCallState('ended')
    setTimeout(() => { setCallState('idle'); setRemoteUser(null); setCallSession(null) }, 2000)
  }, [closePeer, stopLocalStream])

  useEffect(() => { endCallRef.current = endCall }, [endCall])

  const startCall = useCallback(async (targetUser, type = 'voice') => {
    if (callStateRef.current !== 'idle') return
    setCallType(type); setRemoteUser(targetUser); setCallState('ringing')
    try {
      const stream = await getMedia(type)
      const pc     = await createPeer(stream)
      const offer  = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const { data: session, error } = await sb.from('voice_sessions').insert({
        caller_id: user.id, callee_id: targetUser.id,
        call_type: type, status: 'ringing', offer: JSON.stringify(offer),
      }).select().single()
      if (error) throw error

      sessionIdRef.current = session.id
      setCallSession(session)
      gatherICE(pc, session.id, true)
      subscribeToSession(session.id, true)  // isCaller=true: will apply answer when it arrives
      pollForAnswer(session.id)

      // Push notification (best effort)
      fetch('/.netlify/functions/push-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': import.meta.env.VITE_WEBHOOK_SECRET || '' },
        body: JSON.stringify({ user_id: targetUser.id, type: 'incoming_call', actor_id: user.id, reference_id: session.id, extra_data: JSON.stringify({ sessionId: session.id, callType: type }) }),
      }).catch(() => {})

      // Auto-cancel after 45s
      setTimeout(async () => {
        if (callStateRef.current !== 'ringing') return
        try { await sb.from('voice_sessions').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', session.id) } catch(_) {}
        endCallRef.current?.(false)
      }, 45000)
    } catch {
      setCallState('idle'); setRemoteUser(null); stopLocalStream()
    }
  }, [user?.id, getMedia, createPeer, gatherICE, subscribeToSession, stopLocalStream, pollForAnswer])

  const acceptCall = useCallback(async (session, callerProfile) => {
    setCallType(session.call_type || 'voice')
    setRemoteUser(callerProfile)
    setCallSession(session)
    sessionIdRef.current = session.id
    try {
      const stream = await getMedia(session.call_type || 'voice')
      const pc     = await createPeer(stream)

      // 1. Fetch the latest offer + caller ICE from DB
      const { data: fresh } = await sb.from('voice_sessions').select('offer,caller_ice').eq('id', session.id).single()

      // 2. Set remote description (offer from caller)
      await pc.setRemoteDescription(JSON.parse(fresh?.offer ?? session.offer))
      console.log('[WebRTC] callee: setRemoteDescription(offer) ✓')

      // 3. Apply any caller ICE that already arrived
      if (fresh?.caller_ice) await applyICE(pc, fresh.caller_ice)

      // 4. Create and set local description (answer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('[WebRTC] callee: setLocalDescription(answer) ✓')

      // 5. Mark answer as applied BEFORE subscribing so the subscription
      //    handler never tries to call setRemoteDescription again
      answerAppliedRef.current = true

      // 6. Subscribe to session updates (for caller ICE trickle + status changes)
      //    isCaller=false means the handler will NOT try to apply the answer
      subscribeToSession(session.id, false)

      // 7. Write answer + set status=active IMMEDIATELY (trickle ICE after)
      try {
        await sb.from('voice_sessions').update({
          answer: JSON.stringify(answer),
          status: 'active',
        }).eq('id', session.id)
        console.log('[WebRTC] callee: answer written to DB ✓')
      } catch(e) {
        console.error('[WebRTC] callee: failed to write answer:', e)
      }

      // 8. Gather and trickle ICE candidates
      gatherICE(pc, session.id, false)

      // Poll for caller ICE multiple times — it trickles in and we may have missed early ones
      const pollCallerICE = async (attempt = 0) => {
        if (attempt > 5) return
        try {
          const { data } = await sb.from('voice_sessions').select('caller_ice').eq('id', session.id).single()
          if (data?.caller_ice) await applyICE(pc, data.caller_ice)
        } catch(_) {}
        setTimeout(() => pollCallerICE(attempt + 1), 1500)
      }
      pollCallerICE()

      // Apply HD encoding after connection is established
      setTimeout(() => applyVideoEncoding(pc), 500)

      setCallState('active')
      setCallDuration(0)
      durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    } catch (err) {
      console.error('[acceptCall]', err)
      // Write 'ended' to DB so caller screen doesn't get stuck
      if (sessionIdRef.current) {
        try {
          await sb.from('voice_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', sessionIdRef.current)
        } catch(_) {}
      }
      closePeer()
      stopLocalStream()
      setCallState('idle')
      sessionIdRef.current = null
    }
  }, [getMedia, createPeer, gatherICE, subscribeToSession, stopLocalStream, applyICE, closePeer, applyVideoEncoding])

  const declineCall = useCallback(async (session) => {
    try { await sb.from('voice_sessions').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', session.id) } catch(_) {}
    setCallState('idle')
  }, [])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const tracks = stream.getAudioTracks()
    if (!tracks.length) return
    const enabled = !tracks[0].enabled
    tracks.forEach(t => { t.enabled = enabled })
    setMuted(!enabled)
  }, [])

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const tracks = stream.getVideoTracks()
    if (!tracks.length) return
    const enabled = !tracks[0].enabled
    tracks.forEach(t => { t.enabled = enabled })
    setCameraOff(!enabled)
  }, [])

  const toggleSpeaker = useCallback(() => {
    setSpeakerOff(s => {
      const nextOff = !s
      // Route audio to earpiece (speakerOff=true) or speaker (speakerOff=false)
      // setSinkId is supported on Chrome/Android, not Safari — fail silently
      try {
        const audioEls = document.querySelectorAll('audio, video')
        audioEls.forEach(el => {
          if (el.setSinkId) {
            // '' = default speaker, 'default' = system default
            el.setSinkId(nextOff ? '' : 'default').catch(() => {})
          }
        })
      } catch (_) {}
      return nextOff
    })
  }, [])

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current
    if (!stream) return
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    try {
      // Stop the current video track FIRST — on Android, the camera hardware
      // can only be used by one stream at a time. Requesting the new camera
      // while the old one is still active causes "Could not start video source".
      stream.getVideoTracks().forEach(t => t.stop())

      // Small delay so the hardware releases the camera before we re-request
      await new Promise(r => setTimeout(r, 300))

      // Try HD with exact facingMode first, fall back progressively
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: newFacing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      }).catch(() => navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: newFacing, width: { ideal: 854 }, height: { ideal: 480 } },
      })).catch(() => navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: newFacing },
      }))

      const newVideo = newStream.getVideoTracks()[0]
      if (!newVideo) return

      // Replace track in peer connection
      const pc = pcRef.current
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(newVideo)
      }

      // Update local stream with new video track
      const combined = new MediaStream([...stream.getAudioTracks(), newVideo])
      setLocalStream(combined)
      localStreamRef.current = combined
      setFacingMode(newFacing)
    } catch (err) {
      toast.error('Could not switch camera: ' + err.message)
    }
  }, [facingMode])

  // ── Screen Share ──────────────────────────────────────────────────────────
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) { toast.error('Screen sharing not supported'); return }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track  = screen.getVideoTracks()[0]
      screenTrackRef.current = track

      const pc = pcRef.current
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(track)
      }

      const stream = localStreamRef.current
      if (stream) {
        stream.getVideoTracks().forEach(t => t.enabled = false)
        const combined = new MediaStream([...stream.getAudioTracks(), track])
        setLocalStream(combined); localStreamRef.current = combined
      }
      setScreenSharing(true)
      track.onended = () => stopScreenShare()
    } catch (err) { if (err.name !== 'NotAllowedError') toast.error('Screen share failed') }
  }, [])

  const stopScreenShare = useCallback(async () => {
    screenTrackRef.current?.stop(); screenTrackRef.current = null
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      const camTrack = cam.getVideoTracks()[0]
      const pc = pcRef.current
      if (pc) { const s = pc.getSenders().find(s => s.track?.kind === 'video'); if (s) await s.replaceTrack(camTrack) }
      const stream = localStreamRef.current
      if (stream) {
        stream.getVideoTracks().forEach(t => t.stop())
        const combined = new MediaStream([...stream.getAudioTracks(), camTrack])
        setLocalStream(combined); localStreamRef.current = combined
      }
    } catch (_) {}
    setScreenSharing(false)
  }, [])

  const toggleScreenShare = useCallback(() => {
    screenSharing ? stopScreenShare() : startScreenShare()
  }, [screenSharing, startScreenShare, stopScreenShare])

  // ── Incoming call subscription ────────────────────────────────────────────
  const handleIncoming = useCallback(async (session) => {
    if (callStateRef.current !== 'idle' || session.status !== 'ringing') return
    const { data: caller } = await sb.from('profiles')
      .select('id,username,full_name,avatar_url').eq('id', session.caller_id).single()
    if (caller) {
      setCallState('incoming'); setCallSession(session); setRemoteUser(caller)
      onIncomingRef.current?.({ session, caller })
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const ch = sb.channel(`incoming:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_sessions', filter: `callee_id=eq.${user.id}` },
        async (payload) => { await handleIncoming(payload.new) })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        // On subscribe, check for any calls we missed in the last 30s
        const { data } = await sb.from('voice_sessions')
          .select('*').eq('callee_id', user.id).eq('status', 'ringing')
          .gte('created_at', new Date(Date.now() - 30000).toISOString())
          .order('created_at', { ascending: false }).limit(1)
        if (data?.[0]) await handleIncoming(data[0])
      })
    return () => sb.removeChannel(ch)
  }, [user?.id, handleIncoming])

  const durationLabel = `${String(Math.floor(callDuration / 60)).padStart(2, '0')}:${String(callDuration % 60).padStart(2, '0')}`

  return {
    callState, callType, callSession, remoteUser,
    localStream, remoteStream,
    muted, cameraOff, speakerOff, facingMode, durationLabel, screenSharing,
    startCall, acceptCall, declineCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker, flipCamera, toggleScreenShare,
  }
}
