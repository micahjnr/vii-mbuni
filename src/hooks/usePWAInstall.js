/**
 * usePWAInstall.js
 * Captures beforeinstallprompt as early as possible.
 * install() fires the native browser install dialog directly.
 */
import { useState, useEffect } from 'react'

const INSTALL_KEY = 'vii-install-date'

export function isRunningAsPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export function usePWAInstall() {
  const [prompt, setPrompt]       = useState(() => window.__viiInstallPrompt || null)
  const [isInstalled, setInstalled] = useState(isRunningAsPWA)

  useEffect(() => {
    if (window.__viiInstallPrompt) setPrompt(window.__viiInstallPrompt)

    const onPrompt = (e) => {
      e.preventDefault()
      window.__viiInstallPrompt = e
      setPrompt(e)
    }
    const onInstalled = () => {
      try { localStorage.setItem(INSTALL_KEY, Date.now()) } catch {}
      window.__viiInstallPrompt = null
      setPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  /**
   * Returns: 'installed' | 'dismissed' | 'unavailable'
   * 'unavailable' = browser hasn't offered install yet (needs 2 visits, HTTPS, SW, etc.)
   */
  const install = async () => {
    const p = window.__viiInstallPrompt || prompt
    if (!p) return 'unavailable'
    try {
      await p.prompt()
      const { outcome } = await p.userChoice
      window.__viiInstallPrompt = null
      setPrompt(null)
      if (outcome === 'accepted') {
        try { localStorage.setItem(INSTALL_KEY, Date.now()) } catch {}
        setInstalled(true)
        return 'installed'
      }
      return 'dismissed'
    } catch {
      return 'unavailable'
    }
  }

  return {
    isInstalled,
    canInstall: !!(prompt || window.__viiInstallPrompt),
    install,
  }
}
