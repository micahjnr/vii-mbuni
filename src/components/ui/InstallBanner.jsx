/**
 * InstallBanner.jsx
 * Shows a "Install App" prompt that works across ALL browsers:
 *   - Chrome/Edge/Samsung Internet → uses beforeinstallprompt (one-tap install)
 *   - Firefox/Opera → shows manual "Add to Home Screen" instructions
 *   - iOS Safari → shows iOS-specific instructions
 *   - Already installed → never shows
 *
 * Place this in src/components/ui/InstallBanner.jsx
 * Then import and render it once in App.jsx (outside routes, at the bottom).
 */

import { useState, useEffect } from 'react'

// Key stored in localStorage so banner doesn't re-appear after dismissal
const DISMISSED_KEY = 'vii-install-dismissed'
const INSTALL_DATE_KEY = 'vii-install-date'

function isRunningAsPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

function getOS() {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function getBrowser() {
  const ua = navigator.userAgent
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/OPR|Opera/i.test(ua)) return 'opera'
  if (/Firefox/i.test(ua)) return 'firefox'
  if (/Edg/i.test(ua)) return 'edge'
  if (/Chrome/i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua)) return 'safari'
  return 'other'
}

// ── Manual install instructions per browser ─────────────────────────────────
function ManualInstructions({ browser, os, onClose }) {
  const steps = {
    ios: [
      { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
      { icon: '📲', text: 'Scroll down and tap "Add to Home Screen"' },
      { icon: '✅', text: 'Tap "Add" — Vii-Mbuni appears on your home screen' },
    ],
    samsung: [
      { icon: '⋮', text: 'Tap the menu (three dots) at the bottom' },
      { icon: '📲', text: 'Tap "Add page to" → "Home screen"' },
      { icon: '✅', text: 'Tap "Add" to install Vii-Mbuni' },
    ],
    firefox: [
      { icon: '⋮', text: 'Tap the menu (three dots) at the top right' },
      { icon: '📲', text: 'Tap "Install" or "Add to Home Screen"' },
      { icon: '✅', text: 'Confirm to install Vii-Mbuni' },
    ],
    opera: [
      { icon: '⊕', text: 'Tap the "+" or menu at the bottom' },
      { icon: '📲', text: 'Tap "Add to Home Screen"' },
      { icon: '✅', text: 'Tap "Add" to install' },
    ],
  }

  const key = os === 'ios' ? 'ios' : (steps[browser] ? browser : null)
  if (!key) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 env(safe-area-inset-bottom,0) 0',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #12112a 0%, #1a1035 100%)',
        borderTop: '1px solid rgba(200,16,46,0.3)',
        borderRadius: '24px 24px 0 0',
        padding: '28px 24px 32px',
        width: '100%', maxWidth: 480,
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          <img src="/icons/icon-96.png" alt="Vii-Mbuni"
            style={{ width: 48, height: 48, borderRadius: 12 }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Install Vii-Mbuni</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Follow these quick steps</div>
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: '50%', width: 32, height: 32,
            color: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps[key].map((step, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(255,255,255,0.06)', borderRadius: 14,
              padding: '12px 16px',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(200,16,46,0.2)', border: '1px solid rgba(200,16,46,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>{step.icon}</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.4 }}>
                {step.text}
              </div>
            </div>
          ))}
        </div>

        {/* iOS arrow hint */}
        {os === 'ios' && (
          <div style={{
            marginTop: 16, textAlign: 'center',
            color: 'rgba(255,255,255,0.4)', fontSize: 12,
          }}>
            ↓ Look for the share icon at the bottom of your screen
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main banner ──────────────────────────────────────────────────────────────
export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow]                     = useState(false)
  const [showManual, setShowManual]         = useState(false)
  const [installing, setInstalling]         = useState(false)
  const [installed, setInstalled]           = useState(false)
  const os      = getOS()
  const browser = getBrowser()

  useEffect(() => {
    // Don't show if: already installed as PWA, dismissed before, or just installed
    if (isRunningAsPWA()) return
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return
      if (localStorage.getItem(INSTALL_DATE_KEY)) return
    } catch {}

    // Chrome/Edge/Samsung — native prompt available
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Small delay so it doesn't fire immediately on page load
      setTimeout(() => setShow(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS Safari or Firefox/Opera (no beforeinstallprompt) — show manual instructions
    const supportsNative = 'BeforeInstallPromptEvent' in window ||
      CSS.supports('display', 'flex') // broad support check
    if (os === 'ios' || browser === 'firefox' || browser === 'opera' || browser === 'samsung') {
      setTimeout(() => setShow(true), 3000)
    }

    // Track when app is successfully installed via native prompt
    window.addEventListener('appinstalled', () => {
      try { localStorage.setItem(INSTALL_DATE_KEY, Date.now()) } catch {}
      setShow(false)
      setInstalled(true)
      setTimeout(() => setInstalled(false), 4000)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      // Native one-tap install
      setInstalling(true)
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          try { localStorage.setItem(INSTALL_DATE_KEY, Date.now()) } catch {}
          setShow(false)
        }
      } finally {
        setInstalling(false)
        setDeferredPrompt(null)
      }
    } else {
      // Manual instructions for unsupported browsers
      setShowManual(true)
    }
  }

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch {}
    setShow(false)
  }

  if (!show && !installed) return null

  // ── "Installed!" toast ────────────────────────────────────────────────────
  if (installed) {
    return (
      <div style={{
        position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, background: 'linear-gradient(135deg, #c8102e, #7c3aed)',
        color: '#fff', padding: '12px 24px', borderRadius: 16,
        fontWeight: 600, fontSize: 14, boxShadow: '0 8px 32px rgba(200,16,46,0.4)',
        whiteSpace: 'nowrap', animation: 'vii-slide-up 0.4s cubic-bezier(.34,1.56,.64,1)',
      }}>
        🎉 Vii-Mbuni installed successfully!
        <style>{`@keyframes vii-slide-up{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      </div>
    )
  }

  // ── Manual instructions overlay ───────────────────────────────────────────
  if (showManual) {
    return <ManualInstructions browser={browser} os={os} onClose={() => { setShowManual(false); handleDismiss() }} />
  }

  // ── Main install banner ───────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes vii-banner-in {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vii-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        bottom: 'max(80px, calc(env(safe-area-inset-bottom) + 80px))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 99998,
        width: 'calc(100vw - 32px)', maxWidth: 420,
        animation: 'vii-banner-in 0.5s cubic-bezier(.34,1.56,.64,1) forwards',
      }}>
        <div style={{
          background: 'linear-gradient(145deg, #16132e 0%, #1f1545 100%)',
          border: '1px solid rgba(200,16,46,0.35)',
          borderRadius: 20,
          padding: '14px 16px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.15)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* App icon with pulse ring */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              position: 'absolute', inset: -4, borderRadius: 16,
              border: '2px solid rgba(200,16,46,0.5)',
              animation: 'vii-pulse-ring 1.8s ease-out infinite',
            }} />
            <img src="/icons/icon-96.png" alt="Vii-Mbuni" style={{
              width: 48, height: 48, borderRadius: 12,
              boxShadow: '0 4px 16px rgba(200,16,46,0.3)',
            }} />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: '#fff', fontWeight: 700, fontSize: 14,
              letterSpacing: '-0.01em', marginBottom: 2,
            }}>
              Install Vii-Mbuni
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.3,
            }}>
              {deferredPrompt
                ? 'Add to home screen — no app store needed'
                : os === 'ios'
                  ? 'Tap Share → Add to Home Screen'
                  : 'Add to home screen for the best experience'
              }
            </div>
          </div>

          {/* Install button */}
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              flexShrink: 0,
              background: 'linear-gradient(135deg, #c8102e, #7c3aed)',
              border: 'none', borderRadius: 12,
              color: '#fff', fontWeight: 700, fontSize: 13,
              padding: '8px 16px', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(200,16,46,0.35)',
              opacity: installing ? 0.7 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              whiteSpace: 'nowrap',
            }}
          >
            {installing ? '...' : deferredPrompt ? '📲 Install' : '📲 How?'}
          </button>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0, background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
              fontSize: 20, padding: '0 0 0 4px', lineHeight: 1,
              transition: 'color 0.2s',
            }}
            aria-label="Dismiss"
          >×</button>
        </div>
      </div>
    </>
  )
}
