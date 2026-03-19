/**
 * usePushNotifications
 * Handles requesting permission and registering/unregistering
 * the browser push subscription with the backend.
 */
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Call the push-subscribe Netlify function and throw a clear error on failure
async function callSubscribeAPI(method, user_id, subscription) {
  const res = await fetch('/.netlify/functions/push-subscribe', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, subscription: subscription.toJSON() }),
  })
  // Always parse the body — even on error it contains a message
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Server returned ${res.status}`)
  }
  return data
}

export function usePushNotifications() {
  const { user } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY

  // Sync enabled state with actual browser subscription on mount / user change
  useEffect(() => {
    if (!supported || !user) { setEnabled(false); return }
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEnabled(!!sub))
      .catch(() => setEnabled(false))
  }, [supported, user])

  const subscribe = async () => {
    if (!user || loading) return
    if (!VAPID_PUBLIC_KEY) {
      toast.error('Push not configured — VITE_VAPID_PUBLIC_KEY missing')
      return
    }
    setLoading(true)
    try {
      // 1. Request permission
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        toast.error('Notifications blocked — allow them in browser settings')
        return
      }
      if (permission !== 'granted') {
        toast.error('Notification permission not granted')
        return
      }

      // 2. Subscribe via Push API
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // 3. Save to Supabase via Netlify function
      await callSubscribeAPI('POST', user.id, sub)

      setEnabled(true)
      toast.success('Push notifications enabled! 🔔')
    } catch (err) {
      console.error('[usePushNotifications] subscribe failed:', err)
      // Unsubscribe from browser too if backend save failed,
      // so the state stays in sync
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

  const unsubscribe = async () => {
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

  return {
    supported,
    enabled,
    loading,
    toggle: enabled ? unsubscribe : subscribe,
  }
}
