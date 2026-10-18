import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Cloudflare Turnstile captcha.
// Turned ON only when VITE_TURNSTILE_SITE_KEY is set at build time.
// With no key, nothing renders and forms behave exactly as before.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
export const captchaEnabled = !!SITE_KEY

let scriptPromise = null
function loadTurnstile() {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.defer = true
      s.onload = () => resolve(window.turnstile)
      s.onerror = () => { scriptPromise = null; reject(new Error('Captcha failed to load')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

/**
 * Hook used by every form that talks to Supabase auth.
 *   const captcha = useCaptcha()
 *   <Captcha ref={captcha.ref} onToken={captcha.setToken} />
 *   if (!captcha.ready) return toast.error('Please complete the captcha check')
 *   sb.auth.signUp({ ..., options: { captchaToken: captcha.token } })
 *   captcha.reset()   // tokens are single-use — always reset after an attempt
 */
export function useCaptcha() {
  const [token, setToken] = useState(null)
  const ref = useRef(null)
  const reset = useCallback(() => {
    setToken(null)
    ref.current?.reset()
  }, [])
  return { token, setToken, ref, reset, ready: !captchaEnabled || !!token }
}

const Captcha = forwardRef(function Captcha({ onToken, theme = 'dark' }, ref) {
  const box = useRef(null)
  const widgetId = useRef(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const [failed, setFailed] = useState(false)

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.reset(widgetId.current) } catch { /* ignore */ }
      }
    },
  }), [])

  useEffect(() => {
    if (!SITE_KEY) return undefined
    let cancelled = false
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current || !ts) return
        widgetId.current = ts.render(box.current, {
          sitekey: SITE_KEY,
          theme,
          callback: (t) => { setFailed(false); onTokenRef.current?.(t) },
          'expired-callback': () => onTokenRef.current?.(null),
          'error-callback': () => { setFailed(true); onTokenRef.current?.(null) },
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })

    return () => {
      cancelled = true
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch { /* ignore */ }
      }
      widgetId.current = null
    }
  }, [theme])

  if (!SITE_KEY) return null
  return (
    <div className="my-1">
      <div ref={box} className="flex justify-center" />
      {failed && (
        <p className="text-center text-xs text-red-400 mt-1">
          Captcha could not load. Check your connection and refresh the page.
        </p>
      )}
    </div>
  )
})

export default Captcha
