/**
 * CallDiag — WebRTC diagnostics page
 * Visit /call-diag while logged in to run a full connectivity test.
 * Shows exactly where the call setup is failing.
 */
import { useState, useRef } from 'react'
import sb from '@/lib/supabase'
import { useAuthStore } from '@/store'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

function Log({ entries }) {
  return (
    <div className="bg-black rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
      {entries.map((e, i) => (
        <div key={i} className={
          e.type === 'ok'   ? 'text-green-400' :
          e.type === 'err'  ? 'text-red-400' :
          e.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'
        }>
          [{e.time}] {e.msg}
        </div>
      ))}
      {entries.length === 0 && <div className="text-gray-600">Press a test button to start...</div>}
    </div>
  )
}

export default function CallDiag() {
  const { user } = useAuthStore()
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)
  const pcRef = useRef(null)

  const push = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('en', { hour12: false })
    setLog(l => [...l, { time, msg, type }])
  }

  const clear = () => setLog([])

  // ── Test 1: Microphone ────────────────────────────────────────────────────
  async function testMic() {
    clear(); setRunning(true)
    push('Testing microphone access...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const tracks = stream.getAudioTracks()
      push(`✅ Microphone OK — track: "${tracks[0]?.label}"`, 'ok')
      push(`   enabled=${tracks[0]?.enabled}, muted=${tracks[0]?.muted}`, 'ok')
      stream.getTracks().forEach(t => t.stop())
    } catch (e) {
      push(`❌ Microphone FAILED: ${e.name} — ${e.message}`, 'err')
      push('   Check browser permissions (🔒 in address bar)', 'err')
    }
    setRunning(false)
  }

  // ── Test 2: STUN/TURN ICE gathering ──────────────────────────────────────
  async function testICE() {
    clear(); setRunning(true)
    push('Testing ICE candidate gathering (STUN + TURN)...')
    push('This checks if your network can reach the relay servers.')

    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch (e) { push(`❌ Need mic for ICE test: ${e.message}`, 'err'); setRunning(false); return }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pcRef.current = pc

    const candidates = []
    let resolved = false

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const c = e.candidate
        const type = c.type === 'relay' ? '🔵 TURN relay' : c.type === 'srflx' ? '🟡 STUN srflx' : '🟢 host'
        push(`   ${type}: ${c.address ?? c.candidate.split(' ')[4]} (${c.protocol})`)
        candidates.push(c)
      } else {
        push(`ICE gathering complete — ${candidates.length} candidates found`, candidates.length > 0 ? 'ok' : 'err')
        const hasRelay = candidates.some(c => c.type === 'relay')
        const hasSrflx = candidates.some(c => c.type === 'srflx')
        if (hasRelay) push('✅ TURN relay candidates found — calls will work across NAT/4G', 'ok')
        else if (hasSrflx) push('⚠️ Only STUN candidates found — may fail on mobile 4G', 'warn')
        else push('❌ No STUN/TURN candidates — calls will definitely fail', 'err')
        if (!resolved) { resolved = true; cleanup() }
      }
    }

    pc.onicegatheringstatechange = () => {
      push(`ICE gathering state: ${pc.iceGatheringState}`)
      if (pc.iceGatheringState === 'complete' && !resolved) {
        resolved = true; cleanup()
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Timeout after 10s
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        push(`⚠️ ICE gathering timed out after 10s with ${candidates.length} candidates`, 'warn')
        cleanup()
      }
    }, 10000)

    function cleanup() {
      pc.close(); pcRef.current = null
      stream.getTracks().forEach(t => t.stop())
      setRunning(false)
    }
  }

  // ── Test 3: Supabase realtime ─────────────────────────────────────────────
  async function testRealtime() {
    clear(); setRunning(true)
    push('Testing Supabase realtime connection...')

    const testId = 'diag-' + Date.now()
    let received = false

    const ch = sb.channel(testId)
      .on('broadcast', { event: 'ping' }, (payload) => {
        received = true
        push(`✅ Realtime working — round trip: ${Date.now() - payload.payload.t}ms`, 'ok')
        sb.removeChannel(ch)
        setRunning(false)
      })
      .subscribe(async (status) => {
        push(`Channel status: ${status}`)
        if (status === 'SUBSCRIBED') {
          push('Sending broadcast ping...')
          await ch.send({ type: 'broadcast', event: 'ping', payload: { t: Date.now() } })
        }
      })

    setTimeout(() => {
      if (!received) {
        push('❌ Realtime timeout — channel may be blocked', 'err')
        push('   Check Supabase project → Realtime is enabled', 'err')
        sb.removeChannel(ch)
        setRunning(false)
      }
    }, 8000)
  }

  // ── Test 4: DB write (voice_sessions) ─────────────────────────────────────
  async function testDB() {
    clear(); setRunning(true)
    push('Testing voice_sessions DB read/write...')

    try {
      // Try inserting a test row
      const { data, error } = await sb.from('voice_sessions').insert({
        caller_id: user.id,
        callee_id: user.id,
        status: 'ringing',
        call_type: 'voice',
        offer: '{"test":true}',
      }).select().single()

      if (error) {
        push(`❌ INSERT failed: ${error.message}`, 'err')
        push('   This means offers/answers cannot be stored → calls will never connect', 'err')
      } else {
        push(`✅ INSERT ok — session id: ${data.id}`, 'ok')

        // Try updating it
        const { error: upErr } = await sb.from('voice_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', data.id)
        if (upErr) push(`❌ UPDATE failed: ${upErr.message}`, 'err')
        else push('✅ UPDATE ok', 'ok')

        push('DB read/write is working correctly', 'ok')
      }
    } catch (e) {
      push(`❌ DB error: ${e.message}`, 'err')
    }
    setRunning(false)
  }

  // ── Test 5: Full loopback ─────────────────────────────────────────────────
  async function testLoopback() {
    clear(); setRunning(true)
    push('Running full WebRTC loopback test (both peers in this browser)...')
    push('If you hear your own voice, WebRTC audio is working.')

    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch (e) { push(`❌ Mic error: ${e.message}`, 'err'); setRunning(false); return }

    const pc1 = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const pc2 = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Wire up ICE
    pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {})
    pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {})

    pc2.ontrack = (e) => {
      push('✅ Track received on pc2 — playing back to your speaker', 'ok')
      const audio = new Audio()
      audio.srcObject = e.streams[0]
      audio.play().catch(() => push('⚠️ Autoplay blocked — tap the screen once', 'warn'))
      setTimeout(() => {
        audio.pause()
        push('Loopback test complete.', 'ok')
        pc1.close(); pc2.close()
        stream.getTracks().forEach(t => t.stop())
        setRunning(false)
      }, 5000)
    }

    pc1.oniceconnectionstatechange = () => push(`pc1 ICE: ${pc1.iceConnectionState}`)
    pc2.oniceconnectionstatechange = () => push(`pc2 ICE: ${pc2.iceConnectionState}`)

    stream.getTracks().forEach(t => pc1.addTrack(t, stream))

    const offer = await pc1.createOffer()
    await pc1.setLocalDescription(offer)
    await pc2.setRemoteDescription(offer)
    const answer = await pc2.createAnswer()
    await pc2.setLocalDescription(answer)
    await pc1.setRemoteDescription(answer)
    push('Offer/answer exchange done — waiting for ICE...')
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold dark:text-white">📡 Call Diagnostics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Run each test and share the results — this tells us exactly where calls are failing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '🎙️ Test Microphone',     fn: testMic },
          { label: '🌐 Test STUN/TURN ICE',  fn: testICE },
          { label: '⚡ Test Realtime',        fn: testRealtime },
          { label: '🗄️ Test DB Write',        fn: testDB },
          { label: '🔁 Full Loopback Test',   fn: testLoopback },
        ].map(({ label, fn }) => (
          <button
            key={label}
            onClick={fn}
            disabled={running}
            className="py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold text-sm transition"
          >
            {label}
          </button>
        ))}
        <button
          onClick={clear}
          className="py-3 px-4 rounded-xl bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white font-semibold text-sm transition"
        >
          🗑️ Clear Log
        </button>
      </div>

      <Log entries={log} />

      <p className="text-xs text-gray-400">
        Logged in as: <strong>{user?.email}</strong> · user id: {user?.id?.slice(0,8)}…
      </p>
    </div>
  )
}
