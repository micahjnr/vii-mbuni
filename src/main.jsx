import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

// ── Capture install prompt ASAP — before React mounts ────────────────────────
// beforeinstallprompt fires early; if Layout hasn't mounted yet it would be lost.
// We store it on window so Layout can always pick it up.
window.__viiInstallPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()          // MUST be called to suppress Chrome's mini bar
  window.__viiInstallPrompt = e
})

// ── Error Boundary ────────────────────────────────────────────
// Catches render errors anywhere in the tree so one broken component
// doesn't crash the whole app. Shows a friendly recovery UI instead.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center',
        background: '#0f0f1a', color: '#e5e7eb',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1.5rem', maxWidth: 360 }}>
          {this.state.error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}
          style={{
            background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px',
            padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
          }}
        >
          Back to Home
        </button>
      </div>
    )
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => { console.error('[mutation error]', error) },
    },
  },
})

// ── Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

      // Force an update check immediately after registration
      reg.update().catch(() => {})

      // Poll for updates every 30s (was 60s) — critical for mobile
      setInterval(() => reg.update().catch(() => {}), 30_000)

      // Also check when tab becomes visible (desktop + some mobile)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })

      // Also check on focus (iOS Safari fires this more reliably than visibilitychange)
      window.addEventListener('focus', () => reg.update().catch(() => {}))

      // Also check on pageshow (fires when navigating back on mobile)
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) reg.update().catch(() => {}) // came from bfcache
      })

      // SW_RELOAD = SW self-destructed (stale asset) → wipe caches + hard reload
      // SW_UPDATED = new SW just activated → show refresh banner immediately
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'OFFLINE') { showOfflineBanner() }
        if (e.data?.type === 'ONLINE')  { hideOfflineBanner() }

        // SW inline reply needs the user's JWT to authenticate the push-reply call
        if (e.data?.type === 'GET_AUTH_TOKEN') {
          try {
            // Supabase stores the session in localStorage under this key
            const raw = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            const session = raw ? JSON.parse(localStorage.getItem(raw)) : null
            const token = session?.access_token || null
            e.ports[0]?.postMessage({ token })
          } catch (_) {
            e.ports[0]?.postMessage({ token: null })
          }
          return
        }

        if (e.data?.type === 'SW_RELOAD') {
          // SW detected stale assets — wipe all caches then hard reload
          caches.keys()
            .then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .finally(() => window.location.replace(window.location.href))
        }
        if (e.data?.type === 'SW_UPDATED') {
          // New SW already active — ask user to reload.
          // Guard: on slow mobile the message can fire before React has mounted,
          // so defer until document.body is available (it always is by 'load',
          // but belt-and-suspenders for edge cases).
          if (document.body) {
            showUpdateBanner(() => window.location.reload())
          } else {
            window.addEventListener('load', () => showUpdateBanner(() => window.location.reload()), { once: true })
          }
        }
      })

      // Show banner if a SW is already waiting when page loads (edge case)
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      // Show banner when a new SW finishes installing
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing
        if (!sw) return
        sw.addEventListener('statechange', () => {
          // SW is installed and waiting — show the banner.
          // Do NOT call skipWaiting here; only call it when the user clicks "Update now".
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(() => {
              sw.postMessage({ type: 'SKIP_WAITING' })
            })
          }
        })
      })

    } catch (err) {
      console.warn('SW registration failed:', err)
    }
  })
}

function showOfflineBanner() {
  if (document.getElementById('vii-mbuni-offline-banner')) return
  const el = document.createElement('div')
  el.id = 'vii-mbuni-offline-banner'
  el.style.cssText = `
    position:fixed; top:0; left:0; right:0; z-index:99999;
    background:#1a1a2e; color:#fff; text-align:center;
    padding:8px 16px; font-size:13px; font-family:sans-serif;
    border-bottom:2px solid #ef4444;
    display:flex; align-items:center; justify-content:center; gap:8px;
  `
  el.innerHTML = `<span>📡</span><span>You're offline — showing cached content</span>`
  document.body.prepend(el)
}

function hideOfflineBanner() {
  document.getElementById('vii-mbuni-offline-banner')?.remove()
}

function showUpdateBanner(onReload) {
  // Remove any existing banner first
  document.getElementById('vii-mbuni-update-banner')?.remove()

  if (!document.getElementById('vii-mbuni-banner-style')) {
    const s = document.createElement('style')
    s.id = 'vii-mbuni-banner-style'
    // Slide up from bottom, sits ABOVE mobile nav (80px)
    s.textContent = `
      @keyframes _nbIn {
        from { opacity:0; transform:translateX(-50%) translateY(20px) }
        to   { opacity:1; transform:translateX(-50%) translateY(0) }
      }
      #vii-mbuni-update-banner {
        position: fixed;
        bottom: 90px;        /* above mobile bottom nav */
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        color: #fff;
        padding: 14px 18px;
        border-radius: 16px;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        white-space: nowrap;
        box-shadow: 0 8px 32px rgba(109,40,217,.45);
        z-index: 99999;
        animation: _nbIn .35s cubic-bezier(.34,1.56,.64,1) forwards;
        max-width: calc(100vw - 32px);
      }
      #vii-mbuni-update-btn {
        background: #fff;
        color: #6d28d9;
        border: none;
        padding: 7px 18px;
        border-radius: 10px;
        font-weight: 700;
        cursor: pointer;
        font-size: 13px;
        flex-shrink: 0;
        transition: opacity .15s;
      }
      #vii-mbuni-update-btn:active { opacity: .8 }
      #vii-mbuni-update-x {
        background: transparent;
        color: rgba(255,255,255,.7);
        border: none;
        cursor: pointer;
        font-size: 22px;
        line-height: 1;
        padding: 0;
        flex-shrink: 0;
      }
    `
    document.head.appendChild(s)
  }

  const el = document.createElement('div')
  el.id = 'vii-mbuni-update-banner'
  el.innerHTML = `
    <span>🚀 New version ready!</span>
    <button id="vii-mbuni-update-btn">Update now</button>
    <button id="vii-mbuni-update-x" aria-label="Dismiss">×</button>
  `
  document.body.appendChild(el)

  // Auto-dismiss after 15s on mobile; cleared if user acts first
  const autoDismiss = setTimeout(() => el?.remove(), 15_000)

  document.getElementById('vii-mbuni-update-btn').onclick = () => {
    clearTimeout(autoDismiss)
    el.remove()
    onReload?.()
  }
  document.getElementById('vii-mbuni-update-x').onclick = () => {
    clearTimeout(autoDismiss)
    el.remove()
  }
}

// ── Android TWA back button support ─────────────────────────
// When running as a TWA/APK, Android's back button fires popstate.
// React Router handles this natively, but we add a safety net for
// cases where the user would exit the app accidentally.
if ('navigation' in window) {
  // Modern Navigation API (Chrome 102+)
  window.navigation.addEventListener('navigate', () => {})
} else {
  // Fallback: prevent accidental exit when at root
  window.addEventListener('popstate', (e) => {
    // If we're at the root and there's no history, push a state
    // so the next back press exits gracefully
    if (window.location.pathname === '/' && window.history.length <= 1) {
      window.history.pushState(null, '', window.location.href)
    }
  })
}

// Mark app as ready once React has mounted — removes splash overlay
const rootEl = document.getElementById('root')
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--color-surface-800, #1a1a2e)',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '13px',
            },
          }}
        />
      </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)
