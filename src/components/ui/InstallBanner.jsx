/**
 * InstallBanner.jsx
 * Triggered on demand (when user clicks "Install App").
 * Handles ALL browsers: Chrome/Edge/Samsung (native prompt),
 * Firefox/Opera/iOS Safari (manual steps).
 */
import { useState } from 'react'
import { usePWAInstall } from '@/hooks/usePWAInstall'

const STEPS = {
  ios: [
    { icon: '⬆️', text: 'Tap the Share icon at the bottom of Safari' },
    { icon: '📲', text: 'Tap "Add to Home Screen"' },
    { icon: '✅', text: 'Tap "Add" — done!' },
  ],
  samsung: [
    { icon: '⋮',  text: 'Tap the menu (⋮) at the bottom' },
    { icon: '📲', text: 'Tap "Add page to" → "Home screen"' },
    { icon: '✅', text: 'Tap "Add"' },
  ],
  firefox: [
    { icon: '⋮',  text: 'Tap the menu (⋮) at the top right' },
    { icon: '📲', text: 'Tap "Install" or "Add to Home Screen"' },
    { icon: '✅', text: 'Confirm to install' },
  ],
  opera: [
    { icon: '☰',  text: 'Tap the menu at the bottom' },
    { icon: '📲', text: 'Tap "Home screen"' },
    { icon: '✅', text: 'Tap "Add"' },
  ],
  edge: [
    { icon: '⋯',  text: 'Tap the menu (⋯) at the bottom' },
    { icon: '📲', text: 'Tap "Add to phone" or "Install"' },
    { icon: '✅', text: 'Tap "Install"' },
  ],
}

function ManualSteps({ os, browser, onClose }) {
  const key = os === 'ios' ? 'ios' : (STEPS[browser] ? browser : null)
  const steps = key ? STEPS[key] : null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(160deg,#12112a,#1a1035)',
        borderTop: '1px solid rgba(200,16,46,0.3)',
        borderRadius: '24px 24px 0 0',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom,0px))',
        width: '100%', maxWidth: 480,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <img src="/icons/icon-96.png" alt="" style={{ width:44, height:44, borderRadius:10 }} />
          <div style={{ flex:1 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:15 }}>Install Vii-Mbuni</div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12 }}>Follow these steps</div>
          </div>
          <button onClick={onClose} style={{
            background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'50%',
            width:30, height:30, color:'#fff', fontSize:16, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>×</button>
        </div>

        {steps ? (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {steps.map((s, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:12,
                background:'rgba(255,255,255,0.06)', borderRadius:12, padding:'11px 14px',
              }}>
                <span style={{ fontSize:22, width:32, textAlign:'center', flexShrink:0 }}>{s.icon}</span>
                <span style={{ color:'rgba(255,255,255,0.85)', fontSize:14 }}>{s.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color:'rgba(255,255,255,0.6)', fontSize:14, textAlign:'center', padding:'16px 0' }}>
            Open your browser menu and tap<br/>
            <strong style={{ color:'#fff' }}>"Add to Home Screen"</strong>
          </div>
        )}

        {os === 'ios' && (
          <div style={{ marginTop:14, textAlign:'center', color:'rgba(255,255,255,0.35)', fontSize:11 }}>
            ↓ Share icon is at the bottom of Safari
          </div>
        )}
      </div>
    </div>
  )
}

export default function InstallBanner({ onClose }) {
  const { isInstalled, canInstall, install, os, browser } = usePWAInstall()
  const [installing, setInstalling] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  if (isInstalled) { onClose?.(); return null }

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const result = await install()
      if (result === 'installed') {
        setShowSuccess(true)
        setTimeout(() => { setShowSuccess(false); onClose?.() }, 3000)
      } else if (result === 'manual') {
        setShowManual(true)
      } else if (result === 'dismissed') {
        onClose?.()
      }
    } finally {
      setInstalling(false)
    }
  }

  if (showSuccess) {
    return (
      <div style={{
        position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)',
        zIndex:99999, background:'linear-gradient(135deg,#c8102e,#7c3aed)',
        color:'#fff', padding:'12px 24px', borderRadius:16,
        fontWeight:600, fontSize:14, whiteSpace:'nowrap',
        boxShadow:'0 8px 32px rgba(200,16,46,0.4)',
        animation:'vii-up 0.4s cubic-bezier(.34,1.56,.64,1)',
      }}>
        🎉 Vii-Mbuni installed!
        <style>{`@keyframes vii-up{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      </div>
    )
  }

  if (showManual) {
    return <ManualSteps os={os} browser={browser} onClose={() => { setShowManual(false); onClose?.() }} />
  }

  return (
    <>
      <style>{`
        @keyframes vii-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes vii-ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.6);opacity:0}}
      `}</style>
      <div style={{
        position:'fixed',
        bottom:'max(88px, calc(env(safe-area-inset-bottom,0px) + 88px))',
        left:'50%', transform:'translateX(-50%)',
        zIndex:99998, width:'calc(100vw - 32px)', maxWidth:420,
        animation:'vii-in 0.4s cubic-bezier(.34,1.56,.64,1) forwards',
      }}>
        <div style={{
          background:'linear-gradient(145deg,#16132e,#1f1545)',
          border:'1px solid rgba(200,16,46,0.3)',
          borderRadius:20, padding:'14px 16px',
          boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <div style={{
              position:'absolute', inset:-4, borderRadius:16,
              border:'2px solid rgba(200,16,46,0.5)',
              animation:'vii-ring 1.8s ease-out infinite',
            }}/>
            <img src="/icons/icon-96.png" alt="" style={{ width:48, height:48, borderRadius:12 }}/>
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Install Vii-Mbuni</div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12, marginTop:2 }}>
              {canInstall ? 'Tap Install — no app store needed' : 'Add to your home screen'}
            </div>
          </div>

          <button onClick={handleInstall} disabled={installing} style={{
            flexShrink:0,
            background:'linear-gradient(135deg,#c8102e,#7c3aed)',
            border:'none', borderRadius:12, color:'#fff',
            fontWeight:700, fontSize:13, padding:'9px 16px',
            cursor:'pointer', whiteSpace:'nowrap',
            opacity: installing ? 0.6 : 1,
          }}>
            {installing ? '...' : canInstall ? '📲 Install' : '📲 How?'}
          </button>

          <button onClick={onClose} style={{
            flexShrink:0, background:'none', border:'none',
            color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:20, padding:0,
          }}>×</button>
        </div>
      </div>
    </>
  )
}
