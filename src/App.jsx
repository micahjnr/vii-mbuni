import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import sb from '@/lib/supabase'
import { useAuthStore, useUIStore, useNotifStore } from '@/store'
import Layout from '@/components/layout/Layout'
import PermissionOnboarding from '@/components/ui/PermissionOnboarding'
import PageLoader from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import { useDailyStreak } from '@/hooks/useDailyStreak'

// ── Bottom nav pages: imported directly (no lazy) so they NEVER show loader on tab switch
import Home        from '@/pages/Home'
import Friends     from '@/pages/Friends'
import Messages    from '@/pages/Messages'
import ZaarCulture from '@/pages/ZaarCulture'
import Profile     from '@/pages/Profile'

import ZaarTutor from './pages/ZaarTutor';
// ── Everything else: lazy loaded (only loads when user visits)
const Explore     = lazy(() => import('@/pages/Explore'))
const Chat        = lazy(() => import('@/pages/Chat'))
const Groups      = lazy(() => import('@/pages/Groups'))
const Events      = lazy(() => import('@/pages/Events'))
const Reels       = lazy(() => import('@/pages/Reels'))
const Analytics   = lazy(() => import('@/pages/Analytics'))
const Login       = lazy(() => import('@/pages/Login'))
const Register    = lazy(() => import('@/pages/Register'))
const NotFound    = lazy(() => import('@/pages/NotFound'))
const Challenges  = lazy(() => import('@/pages/Challenges'))
const Bookmarks   = lazy(() => import('@/pages/Bookmarks'))
const AIAssistant = lazy(() => import('@/pages/AIAssistant'))
const PostDetail  = lazy(() => import('@/pages/PostDetail'))
const Settings    = lazy(() => import('@/pages/Settings'))
const CallDiag      = lazy(() => import('@/pages/CallDiag'))
const ResetPassword = lazy(() => import('@/pages/ResetPassword'))
const Terms         = lazy(() => import('@/pages/Terms'))
const About         = lazy(() => import('@/pages/About'))

// Tiny fallback — just keeps layout stable, no full-screen loader
const TabFallback = () => <div style={{ minHeight: '60vh' }} />

function AuthGuard({ children }) {
  const { user, loading, setLoading } = useAuthStore()

  // Safety net: if loading stays true for more than 5s, force it false
  // so the user isn't stuck on a blank screen forever
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      console.warn('[AuthGuard] loading timeout — forcing false')
      setLoading(false)
    }, 5000)
    return () => clearTimeout(t)
  }, [loading, setLoading])

  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function GuestGuard({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return <PageLoader />
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { setUser, setLoading, fetchProfile } = useAuthStore()
  const { theme, setOnlineUsers } = useUIStore()
  const { setNotifs, addNotif, setMsgCount } = useNotifStore()

  // Award daily login XP + update streak
  useDailyStreak()

  // Permission onboarding — shown once on first launch after login
  const [showPermOnboarding, setShowPermOnboarding] = useState(false)
  const { user: authUser } = useAuthStore()
  useEffect(() => {
    if (!authUser) return
    try {
      const done = localStorage.getItem('vii-permissions-onboarded')
      if (!done) setShowPermOnboarding(true)
    } catch {}
  }, [authUser])

  // Keep a ref to the active channels so we can clean them up properly
  // without recreating them on every auth state change (token refresh etc.)
  const notifChannelRef = useRef(null)
  const msgChannelRef   = useRef(null)
  const presenceChannelRef = useRef(null)
  const heartbeatRef    = useRef(null)   // dedicated ref so teardown always clears it
  const setupDoneRef    = useRef(null) // stores the userId we set up for

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Remove splash screen overlay once app has mounted
  useEffect(() => {
    document.body.classList.add('app-ready')
    return () => document.body.classList.remove('app-ready')
  }, [])

  // ── Offline / online banner ───────────────────────────────────
  useEffect(() => {
    const onOffline = () => toast.error('You are offline — some features may not work', {
      id: 'offline-toast', duration: Infinity, icon: '📡',
    })
    const onOnline = () => {
      toast.dismiss('offline-toast')
      toast.success('Back online!', { id: 'online-toast', duration: 3000 })
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online',  onOnline)
    // Check immediately on mount
    if (!navigator.onLine) onOffline()
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online',  onOnline)
    }
  }, [])

  useEffect(() => {
    // Tear down realtime channels for a given user
    const teardown = () => {
      if (notifChannelRef.current) { sb.removeChannel(notifChannelRef.current); notifChannelRef.current = null }
      if (msgChannelRef.current)   { sb.removeChannel(msgChannelRef.current);   msgChannelRef.current   = null }
      if (presenceChannelRef.current) {
        sb.removeChannel(presenceChannelRef.current)
        presenceChannelRef.current = null
      }
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      setOnlineUsers([])
      setupDoneRef.current = null
      // Flush the feed cache so a newly-logged-in user never sees a previous
      // user's cached posts (cross-user cache poisoning via SW FEED_CACHE).
      if ('caches' in window) {
        caches.delete('vii-mbuni-feed-v1').catch(() => {})
      }
    }

    const setupForUser = async (userId) => {
      // Guard: don't re-setup if already listening for this user
      // (prevents duplicate channels on token refresh)
      if (setupDoneRef.current === userId) return
      teardown()
      setupDoneRef.current = userId

      // ── 1. Fetch initial unread notification count ──────────
      const { data: unreadNotifs } = await sb
        .from('notifications')
        .select('*, actor:actor_id(id, username, full_name, avatar_url)')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20)
      if (unreadNotifs) setNotifs(unreadNotifs)

      // ── 2. Fetch initial unread message count ───────────────
      const { count: unreadMsgs } = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false)
      setMsgCount(unreadMsgs ?? 0)

      // ── 3. Realtime: new notifications ──────────────────────
      notifChannelRef.current = sb
        .channel(`notifs:${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, async (payload) => {
          // Fetch full row with actor join (payload.new has no joins)
          const { data: full } = await sb
            .from('notifications')
            .select('*, actor:actor_id(id, username, full_name, avatar_url)')
            .eq('id', payload.new.id)
            .single()
          addNotif(full || payload.new)
        })
        .subscribe()

      // ── 4. Realtime: new messages (for badge count) ─────────
      msgChannelRef.current = sb
        .channel(`msgs:${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        }, () => {
          // Re-fetch unread count on every new incoming message
          sb.from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', userId)
            .eq('is_read', false)
            .then(({ count }) => setMsgCount(count ?? 0))
        })
        .subscribe()

      // ── 5. Global presence — track who is online ─────────────
      // Everyone joins the same 'online' channel keyed by their userId.
      // On sync we extract all present user IDs and push to the store.
      presenceChannelRef.current = sb
        .channel('online', { config: { presence: { key: userId } } })
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannelRef.current?.presenceState?.() ?? {}
          setOnlineUsers(Object.keys(state))
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Announce ourselves and write last_active to DB
            await presenceChannelRef.current.track({ user_id: userId, online_at: new Date().toISOString() })
            sb.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId).then(() => {})
          }
        })

      // Keep last_active fresh every 2 minutes while the tab is open
      heartbeatRef.current = setInterval(() => {
        sb.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId).then(() => {})
      }, 120_000)
    }

    // Initial session check — always resolves loading regardless of outcome
    sb.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) console.warn('[Auth] getSession error:', error.message)
        if (session?.user) {
          setUser(session.user)
          fetchProfile(session.user.id)
          setupForUser(session.user.id)
        } else {
          setUser(null)   // no session → clear any stale persisted user
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('[Auth] getSession failed:', err)
        setUser(null)
        setLoading(false)  // always unblock the app
      })

    // Auth state changes — only re-setup on actual sign in / sign out,
    // NOT on token refresh (SIGNED_IN fires on refresh too, guard handles it)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
        setupForUser(session.user.id) // guarded by setupDoneRef
      } else {
        setUser(null)
        teardown()
        setNotifs([])
        setMsgCount(0)
      }
      setLoading(false)
    })

    // ── Mobile fix: Supabase Realtime drops when app backgrounds ──
    // Re-fetch missed notifications + reconnect channels on visibility restore
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.user) return
      const userId = session.user.id

      // Re-fetch any notifications that arrived while backgrounded
      const { data: unreadNotifs } = await sb
        .from('notifications')
        .select('*, actor:actor_id(id, username, full_name, avatar_url)')
        .eq('user_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20)
      if (unreadNotifs) setNotifs(unreadNotifs)

      // Re-fetch unread message count
      const { count: unreadMsgs } = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false)
      setMsgCount(unreadMsgs ?? 0)

      // Force reconnect realtime channels if they dropped
      if (notifChannelRef.current) {
        const state = notifChannelRef.current.state
        if (state === 'closed' || state === 'errored') {
          // Reset guard so setupForUser actually runs, then reconnect
          setupDoneRef.current = null
          setupForUser(userId)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      teardown()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"          element={<GuestGuard><Login /></GuestGuard>} />
        <Route path="/register"       element={<GuestGuard><Register /></GuestGuard>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms"          element={<Terms />} />
        <Route path="/about"          element={<About />} />

        <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
          {/* Bottom nav pages — no lazy, instant switch */}
          <Route index          element={<Home />} />
          <Route path="friends" element={<Friends />} />
          <Route path="messages"element={<Messages />} />
          <Route path="messages/:userId" element={<Suspense fallback={<TabFallback />}><Chat /></Suspense>} />
          <Route path="zaar-culture" element={<ZaarCulture />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/:userId" element={<Profile />} />

          {/* Secondary pages — lazy with silent fallback */}
          <Route path="explore"    element={<Suspense fallback={<TabFallback />}><Explore /></Suspense>} />
          <Route path="reels"      element={<Suspense fallback={<TabFallback />}><Reels /></Suspense>} />
          <Route path="groups"     element={<Suspense fallback={<TabFallback />}><Groups /></Suspense>} />
          <Route path="events"     element={<Suspense fallback={<TabFallback />}><Events /></Suspense>} />
          <Route path="analytics"  element={<Suspense fallback={<TabFallback />}><Analytics /></Suspense>} />
          <Route path="challenges" element={<Suspense fallback={<TabFallback />}><Challenges /></Suspense>} />
          <Route path="bookmarks"  element={<Suspense fallback={<TabFallback />}><Bookmarks /></Suspense>} />
          <Route path="ai"         element={<Suspense fallback={<TabFallback />}><AIAssistant /></Suspense>} />
          <Route path="post/:postId" element={<Suspense fallback={<TabFallback />}><PostDetail /></Suspense>} />
          <Route path="settings"   element={<Suspense fallback={<TabFallback />}><Settings /></Suspense>} />
          <Route path="call-diag"  element={<Suspense fallback={<TabFallback />}><CallDiag /></Suspense>} />
          <Route path="zaar-tutor" element={<ZaarTutor />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>

      {showPermOnboarding && (
        <PermissionOnboarding onDone={() => setShowPermOnboarding(false)} />
      )}
    </Suspense>
  )
}
