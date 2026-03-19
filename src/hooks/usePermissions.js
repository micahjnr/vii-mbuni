/**
 * usePermissions — Central permission manager for Vii-Mbuni
 * 
 * Handles: camera, microphone, notifications, location, storage (photos)
 * Works correctly on Android TWA, iOS Safari, and desktop Chrome/Firefox.
 * 
 * Usage:
 *   const { permissions, request, openSettings } = usePermissions()
 *   await request('camera')   // returns 'granted' | 'denied' | 'prompt'
 */

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

// Permission names mapped to their browser API equivalents
const PERMISSION_MAP = {
  camera:        { query: 'camera',            label: 'Camera',        icon: '📷' },
  microphone:    { query: 'microphone',         label: 'Microphone',    icon: '🎙️' },
  notifications: { query: 'notifications',      label: 'Notifications', icon: '🔔' },
  location:      { query: 'geolocation',        label: 'Location',      icon: '📍' },
  storage:       { query: null,                 label: 'Storage',       icon: '💾' }, // handled via File API
}

// Human-readable explanation for why we need each permission
const PERMISSION_REASONS = {
  camera:        'To make video calls and upload photos/stories',
  microphone:    'To make voice and video calls, and record voice messages',
  notifications: 'To notify you of new messages, calls, and activity',
  location:      'To show you people nearby in your city',
  storage:       'To let you upload photos and videos from your gallery',
}

async function queryPermissionState(name) {
  const def = PERMISSION_MAP[name]
  if (!def) return 'unsupported'

  // Notifications uses its own API
  if (name === 'notifications') {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission // 'granted' | 'denied' | 'default' → normalize to 'prompt'
      === 'default' ? 'prompt' : Notification.permission
  }

  // Storage — always available via <input type="file">, mark as granted
  if (name === 'storage') return 'granted'

  // Use Permissions API where available
  if ('permissions' in navigator && def.query) {
    try {
      const result = await navigator.permissions.query({ name: def.query })
      return result.state // 'granted' | 'denied' | 'prompt'
    } catch {
      // Firefox doesn't support camera/microphone queries — fall through
    }
  }

  // Fallback: unknown → treat as 'prompt'
  return 'prompt'
}

export function usePermissions() {
  const [permissions, setPermissions] = useState({
    camera:        'unknown',
    microphone:    'unknown',
    notifications: 'unknown',
    location:      'unknown',
    storage:       'granted',
  })

  // Check all permission states on mount
  useEffect(() => {
    const check = async () => {
      const results = {}
      for (const name of Object.keys(PERMISSION_MAP)) {
        results[name] = await queryPermissionState(name)
      }
      setPermissions(results)
    }
    check()
  }, [])

  // Request a specific permission with a friendly explanation
  const request = useCallback(async (name, { silent = false } = {}) => {
    const def = PERMISSION_MAP[name]
    if (!def) return 'unsupported'

    try {
      // ── NOTIFICATIONS ──────────────────────────────────────────
      if (name === 'notifications') {
        if (!('Notification' in window)) {
          if (!silent) toast.error('Notifications not supported on this device')
          return 'unsupported'
        }
        if (Notification.permission === 'granted') return 'granted'
        if (Notification.permission === 'denied') {
          if (!silent) showDeniedToast(name)
          return 'denied'
        }
        const result = await Notification.requestPermission()
        const state = result === 'default' ? 'prompt' : result
        setPermissions(p => ({ ...p, notifications: state }))
        if (state === 'granted' && !silent) toast.success('Notifications enabled! 🔔')
        if (state === 'denied' && !silent) showDeniedToast(name)
        return state
      }

      // ── CAMERA ─────────────────────────────────────────────────
      if (name === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        stream.getTracks().forEach(t => t.stop()) // immediately release
        setPermissions(p => ({ ...p, camera: 'granted' }))
        return 'granted'
      }

      // ── MICROPHONE ─────────────────────────────────────────────
      if (name === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        stream.getTracks().forEach(t => t.stop())
        setPermissions(p => ({ ...p, microphone: 'granted' }))
        return 'granted'
      }

      // ── CAMERA + MICROPHONE (combined for video calls) ─────────
      if (name === 'camera+microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        stream.getTracks().forEach(t => t.stop())
        setPermissions(p => ({ ...p, camera: 'granted', microphone: 'granted' }))
        return 'granted'
      }

      // ── LOCATION ───────────────────────────────────────────────
      if (name === 'location') {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setPermissions(p => ({ ...p, location: 'granted' }))
              resolve('granted')
            },
            (err) => {
              const state = err.code === 1 ? 'denied' : 'error'
              setPermissions(p => ({ ...p, location: state }))
              if (!silent) {
                if (err.code === 1) showDeniedToast('location')
                else toast.error('Could not get location: ' + err.message)
              }
              resolve(state)
            },
            { timeout: 10000, maximumAge: 60000 }
          )
        })
      }

      // ── STORAGE ────────────────────────────────────────────────
      // Modern browsers use File System Access API or just <input type="file">
      // No explicit permission needed — always granted via file picker
      if (name === 'storage') {
        setPermissions(p => ({ ...p, storage: 'granted' }))
        return 'granted'
      }

    } catch (err) {
      const isPermDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      const isNotFound   = err.name === 'NotFoundError'

      if (isPermDenied) {
        // 'camera+microphone' is not a state key — set both individually
        if (name === 'camera+microphone') {
          setPermissions(p => ({ ...p, camera: 'denied', microphone: 'denied' }))
          if (!silent) showDeniedToast('camera')
        } else {
          setPermissions(p => ({ ...p, [name]: 'denied' }))
          if (!silent) showDeniedToast(name)
        }
        return 'denied'
      }
      if (isNotFound) {
        if (!silent) toast.error(`${def.icon} No ${def.label.toLowerCase()} found on this device`)
        return 'not-found'
      }
      console.error(`[Permissions] ${name} error:`, err)
      if (!silent) toast.error(`Could not access ${def.label.toLowerCase()}: ${err.message}`)
      return 'error'
    }

    return 'unknown'
  }, [])

  // Guide user to device settings when permission is permanently denied
  const openSettings = useCallback((name) => {
    const def = PERMISSION_MAP[name] || { label: 'Permission', icon: '⚙️' }
    toast(
      (t) => (
        `${def.icon} ${def.label} is blocked.\n\nTo fix: Open your phone Settings → Apps → Vii-Mbuni → Permissions → allow ${def.label}`
      ),
      { duration: 8000, icon: '⚙️' }
    )
  }, [])

  return { permissions, request, openSettings, PERMISSION_REASONS, PERMISSION_MAP }
}

function showDeniedToast(name) {
  const def = PERMISSION_MAP[name]
  toast.error(
    `${def?.icon || '⚠️'} ${def?.label || name} permission denied.\nGo to Settings → Apps → Vii-Mbuni → Permissions to allow it.`,
    { duration: 6000 }
  )
}

// ── One-time permission onboarding ────────────────────────────────────────
// Shows a permission request screen on first launch
export function usePermissionOnboarding() {
  const { request } = usePermissions()
  const [done, setDone] = useState(true)

  useEffect(() => {
    try {
      const seen = localStorage.getItem('vii-permissions-onboarded')
      if (!seen) setDone(false)
    } catch { setDone(true) }
  }, [])

  const complete = useCallback(async (requested) => {
    // Request each permission the user agreed to
    for (const name of requested) {
      await request(name, { silent: true }).catch(() => {})
    }
    try { localStorage.setItem('vii-permissions-onboarded', '1') } catch {}
    setDone(true)
  }, [request])

  return { needsOnboarding: !done, complete }
}
