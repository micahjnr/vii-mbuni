/**
 * usePushNotifications
 * Handles requesting permission and registering/unregistering push
 * notifications with the backend.
 *
 * - In the browser: standard Web Push (VAPID) via the Push API,
 *   saved through push-subscribe.js -> push_subscriptions table.
 * - In the native Android app (Capacitor): Firebase Cloud Messaging via
 *   @capacitor/push-notifications, saved through push-subscribe-fcm.js
 *   -> fcm_tokens table. Requires google-services.json to be present in
 *   android/app/ at build time (see .github/workflows/build-apk.yml).
 */
import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const IS_NATIVE = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Generic helper for calling either Netlify function with a JSON body
async function callJsonAPI(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`)
  return data
}

const callSubscribeAPI = (method, user_id, subscription) =>
  callJsonAPI('/.netlify/functions/push-subscribe', method, { user_id, subscription: subscription.toJSON() })

const callSubscribeFcmAPI = (method, user_id, token) =>
  callJsonAPI('/.netlify/functions/push-subscribe-fcm', method, { user_id, token })

export function usePushNotifications() {
  const { user } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const fcmTokenRef = useRef(null)

  const supported = IS_NATIVE
    ? true
    : (typeof window !== 'undefined' &&
       'serviceWorker' in navigator &&
       'PushManager' in window &&
       !!VAPID_PUBLIC_KEY)

  // ── Native (Android/FCM): wire up token + error listeners once ──────────
  useEffect(() => {
    if (!IS_NATIVE) return

    const regSub = PushNotifications.addListener('registration', async (token) => {
      fcmTokenRef.current = token.value
      if (!user) return
      try {
        await callSubscribeFcmAPI('POST', user.id, token.value)
        setEnabled(true)
      } catch (err) {
        console.error('[usePushNotifications] FCM token save failed:', err)
        toast.error('Failed to enable notifications: ' + err.message)
        setEnabled(false)
      } finally {
        setLoading(false)
      }
    })

    const errSub = PushNotifications.addListener('registrationError', (err) => {
      console.error('[usePushNotifications] FCM registration failed:', err)
      toast.error('Failed to enable notifications')
      setEnabled(false)
      setLoading(false)
    })

    return () => {
      regSub.then(l => l.remove())
      errSub.then(l => l.remove())
    }
  }, [user])

  // ── Sync enabled state on mount / user change ────────────────────────────
  useEffect(() => {
    if (!supported || !user) { setEnabled(false); return }

    if (IS_NATIVE) {
      PushNotifications.checkPermissions()
        .then(({ receive }) => {
          setEnabled(receive === 'granted')
          // Re-register silently so we have a fresh token in memory (needed
          // to unsubscribe later) without re-prompting the user.
          if (receive === 'granted') PushNotifications.register()
        })
        .catch(() => setEnabled(false))
      return
    }

    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEnabled(!!sub))
      .catch(() => setEnabled(false))
  }, [supported, user])

  // ── Native subscribe/unsubscribe ─────────────────────────────────────────
  const subscribeNative = async () => {
    if (!user || loading) return
    setLoading(true)
    try {
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive !== 'granted') {
        toast.error('Notifications blocked — allow them in app settings')
        setLoading(false)
        return
      }
      // Triggers the 'registration' listener above with the FCM token,
      // which saves it and clears `loading`.
      await PushNotifications.register()
      toast.success('Push notifications enabled! 🔔')
    } catch (err) {
      console.error('[usePushNotifications] native subscribe failed:', err)
      toast.error('Failed to enable notifications: ' + err.message)
      setLoading(false)
    }
  }

  const unsubscribeNative = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (fcmTokenRef.current) {
        await callSubscribeFcmAPI('DELETE', user.id, fcmTokenRef.current)
      }
      setEnabled(false)
      toast('Push notifications disabled', { icon: '🔕' })
    } catch (err) {
      console.error('[usePushNotifications] native unsubscribe failed:', err)
      toast.error('Failed to disable notifications: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Web subscribe/unsubscribe (unchanged VAPID flow) ─────────────────────
  const subscribeWeb = async () => {
    if (!user || loading) return
    if (!VAPID_PUBLIC_KEY) {
      toast.error('Push not configured — VITE_VAPID_PUBLIC_KEY missing')
      return
    }
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        toast.error('Notifications blocked — allow them in browser settings')
        return
      }
      if (permission !== 'granted') {
        toast.error('Notification permission not granted')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      await callSubscribeAPI('POST', user.id, sub)

      setEnabled(true)
      toast.success('Push notifications enabled! 🔔')
    } catch (err) {
      console.error('[usePushNotifications] subscribe failed:', err)
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      } catch (_) {}
      setEnabled(false)
      toast.error('Failed to enable notifications: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const unsubscribeWeb = async () => {
    if (!supported || loading) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await callSubscribeAPI('DELETE', user.id, sub)
        await sub.unsubscribe()
      }
      setEnabled(false)
      toast('Push notifications disabled', { icon: '🔕' })
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe failed:', err)
      toast.error('Failed to disable notifications: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const subscribe = IS_NATIVE ? subscribeNative : subscribeWeb
  const unsubscribe = IS_NATIVE ? unsubscribeNative : unsubscribeWeb

  return {
    supported,
    enabled,
    loading,
    toggle: enabled ? unsubscribe : subscribe,
  }
}
