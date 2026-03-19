import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Home, Compass, Play, Users, MessageCircle, Globe,
  Calendar, BarChart2, User, Bell, BellOff, Moon, Sun, LogOut,
  Menu, X, Search, Trophy, Bookmark, Sparkles, ChevronRight, Settings,
  Download
} from 'lucide-react'
import { useAuthStore, useUIStore, useNotifStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import NotifPanel from '@/components/ui/NotifPanel'
import CreatePostModal from '@/components/feed/CreatePostModal'
import InstallBanner from '@/components/ui/InstallBanner'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useWebRTCCall } from '@/hooks/useWebRTCCall'
import { CallContext } from '@/lib/CallContext'
import CallScreen from '@/components/ui/CallScreen'
import clsx from 'clsx'

const NAV = [
  { to: '/',           icon: Home,          label: 'Home'         },
  { to: '/explore',    icon: Compass,       label: 'Explore'      },
  { to: '/reels',      icon: Play,          label: 'Reels'        },
  { to: '/friends',    icon: Users,         label: 'Friends'      },
  { to: '/messages',   icon: MessageCircle, label: 'Messages',    badge: 'msg' },
  { to: '/challenges', icon: Trophy,        label: 'Challenges'   },
  { to: '/groups',     icon: Globe,         label: 'Groups'       },
  { to: '/events',     icon: Calendar,      label: 'Events'       },
  { to: '/bookmarks',  icon: Bookmark,      label: 'Bookmarks'    },
  { to: '/analytics',  icon: BarChart2,     label: 'Analytics'    },
  { to: '/ai',         icon: Sparkles,      label: 'Vii-Mbuni AI', ai: true },
  { to: '/zaar-culture', icon: Globe,       label: 'Zaar Culture' },
  { to: '/profile',    icon: User,          label: 'Profile'      },
  { to: '/settings',   icon: null,          label: 'Settings', settings: true },
]

const BOTTOM_NAV = [
  { to: '/',         icon: Home,          label: 'Home',     end: true },
  { to: '/friends',  icon: Users,         label: 'Friends'            },
  { to: '/messages', icon: MessageCircle, label: 'Messages', badge: 'msg' },
  { to: '/zaar-culture', icon: null, label: 'Zaar', zaar: true },
  { to: '/profile',  icon: User,          label: 'Profile'            },
]

export default function Layout() {
  const { profile, user, signOut } = useAuthStore()
  const { theme, toggleTheme } = useUIStore()
  const { count, msgCount, clearMsgCount } = useNotifStore()
  const { supported: pushSupported, enabled: pushEnabled, loading: pushLoading, toggle: togglePush } = usePushNotifications()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  // ── PWA Install prompt ────────────────────────────────────────────────────
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true)
      return
    }
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setInstallPrompt(null)
      // Immediately relaunch into the installed app (standalone mode)
      try { localStorage.setItem('vii-install-date', Date.now()) } catch (_) {}
      const url = new URL(window.location.href)
      url.searchParams.set('source', 'pwa')
      window.location.replace(url.toString())
    })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (installPrompt) {
      // Native one-tap install — browser handles everything
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') { setInstallPrompt(null); setIsInstalled(true) }
    } else if (isIOS) {
      setShowIOSHint(true)
    }
    // All other browsers: do nothing — button stays visible but silent
  }

  // ── Draggable floating theme toggle ──────────────────────────────────────
  const TOGGLE_SIZE = 44
  const BOTTOM_NAV_H = 72
  const getDefaultPos = () => ({
    x: window.innerWidth - TOGGLE_SIZE - 16,
    y: window.innerHeight - BOTTOM_NAV_H - TOGGLE_SIZE - 16,
  })
  const [togglePos, setTogglePos] = useState(() => {
    try {
      const saved = localStorage.getItem('vii-toggle-pos')
      return saved ? JSON.parse(saved) : getDefaultPos()
    } catch { return getDefaultPos() }
  })
  const dragRef = useRef(null)
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, bx: 0, by: 0 })
  const dragMoved = useRef(false)

  const clampPos = (x, y) => ({
    x: Math.max(0, Math.min(window.innerWidth - TOGGLE_SIZE, x)),
    y: Math.max(0, Math.min(window.innerHeight - BOTTOM_NAV_H - TOGGLE_SIZE, y)),
  })

  const onPointerDown = (e) => {
    isDragging.current = true
    dragMoved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, bx: togglePos.x, by: togglePos.y }
    dragRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved.current = true
    const pos = clampPos(dragStart.current.bx + dx, dragStart.current.by + dy)
    setTogglePos(pos)
  }

  const onPointerUp = () => {
    if (!isDragging.current) return
    isDragging.current = false
    // Snap to nearest left or right edge
    const snapX = togglePos.x < window.innerWidth / 2 ? 8 : window.innerWidth - TOGGLE_SIZE - 8
    const snapped = clampPos(snapX, togglePos.y)
    setTogglePos(snapped)
    try { localStorage.setItem('vii-toggle-pos', JSON.stringify(snapped)) } catch {}
    // Only toggle theme if it was a tap, not a drag
    if (!dragMoved.current) toggleTheme()
  }

  const navigate = useNavigate()
  const location = useLocation()
  const notifRef = useRef(null)
  const incomingRingRef    = useRef(null)
  const incomingRingCtxRef = useRef(null)
  const incomingRingStopRef = useRef(null)

  const call = useWebRTCCall({
    user,
    onIncomingCall: ({ caller }) => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        let stopped = false
        const playRing = () => {
          if (stopped) return
          ;[880, 660].forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12)
            osc.start(ctx.currentTime + i * 0.15)
            osc.stop(ctx.currentTime + i * 0.15 + 0.13)
          })
          incomingRingRef.current = setTimeout(playRing, 1800)
        }
        playRing()
        incomingRingCtxRef.current = ctx
        incomingRingStopRef.current = () => {
          stopped = true
          clearTimeout(incomingRingRef.current)
          ctx.close().catch(() => {})
        }
      } catch (_) {}
    },
  })

  useEffect(() => {
    if (call.callState !== 'incoming') {
      incomingRingStopRef.current?.()
      incomingRingStopRef.current = null
    }
  }, [call.callState])

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'INCOMING_CALL' && call.callState === 'idle') {
        const { sessionId } = e.data
        if (!sessionId || !user?.id) return
        import('@/lib/supabase').then(({ default: sb }) => {
          sb.from('voice_sessions')
            .select('*').eq('id', sessionId).eq('status', 'ringing').single()
            .then(({ data: session }) => {
              if (!session) return
              sb.from('profiles')
                .select('id, username, full_name, avatar_url').eq('id', session.caller_id).single()
                .then(({ data: caller }) => { if (caller) call.acceptCall(session, caller) })
            })
        })
      }
      if (e.data?.type === 'DECLINE_CALL') {
        if (call.callSession) call.declineCall(call.callSession)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [call, user?.id])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const initialHeight = vv.height
    const onResize = () => setKeyboardOpen(vv.height < initialHeight - 150)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (location.pathname.startsWith('/messages')) clearMsgCount()
  }, [location.pathname, clearMsgCount])

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!notifOpen) return
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const handleSearch = (e) => {
    e.preventDefault()
    if (search.trim()) navigate(`/explore?q=${encodeURIComponent(search.trim())}`)
  }

  const renderNavLink = ({ to, icon: Icon, label, badge, ai, end, settings: isSettings }) => (
    <NavLink
      key={to} to={to} end={end ?? to === '/'}
      onClick={() => setDrawerOpen(false)}
      className={({ isActive }) => clsx(
        'nav-item',
        ai && !isActive && 'text-purple-500 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10',
        isActive && (ai
          ? 'bg-gradient-to-r from-brand-500/20 to-purple-500/20 text-purple-600 dark:text-purple-400'
          : 'active'
        )
      )}
    >
      <div className="relative">
        {isSettings ? <Settings size={18} /> : <Icon size={18} />}
        {badge === 'msg' && msgCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {msgCount > 9 ? '9+' : msgCount}
          </span>
        )}
      </div>
      <span className={clsx('flex-1', ai && 'font-bold')}>{label}</span>
      {ai && <span className="text-[9px] font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">NEW</span>}
    </NavLink>
  )

  const InstallButton = ({ className = '' }) => {
    if (isInstalled) return null
    return (
      <button
        onClick={handleInstall}
        className={clsx(
          'flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
          'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400',
          'hover:bg-brand-100 dark:hover:bg-brand-500/20 border border-brand-200 dark:border-brand-500/20',
          className
        )}
      >
        <Download size={16} />
        <span>Install App</span>
      </button>
    )
  }

  return (
    <div className="flex min-h-screen bg-surface-50 dark:bg-surface-950">

      {/* ── iOS install hint — minimal visual only ───────────────────── */}
      {showIOSHint && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end justify-center p-4" onClick={() => setShowIOSHint(false)}>
          <div className="bg-white dark:bg-surface-900 rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <img src="/icons/icon-96.png" alt="Vii-Mbuni" className="w-12 h-12 rounded-xl" />
              <div>
                <div className="font-bold text-gray-900 dark:text-white">Install Vii-Mbuni</div>
                <div className="text-xs text-gray-400">Add to your home screen</div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 py-3 bg-surface-50 dark:bg-white/5 rounded-xl">
              <div className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-300">
                <span className="text-3xl">⬆️</span>
                <span className="text-[11px]">Share</span>
              </div>
              <span className="text-gray-300 dark:text-white/20 text-xl">→</span>
              <div className="flex flex-col items-center gap-1 text-gray-500 dark:text-gray-300">
                <span className="text-3xl">➕</span>
                <span className="text-[11px]">Add to Home</span>
              </div>
            </div>
            <button onClick={() => setShowIOSHint(false)} className="btn-primary w-full mt-4">OK</button>
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 p-4 border-r border-surface-200 dark:border-white/5 bg-white dark:bg-surface-900 overflow-y-auto scrollbar-hide flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 mb-6"><ViiMbuniLogo size="sm" /></div>
        <form onSubmit={handleSearch} className="mb-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-9 py-2 text-xs" />
          </div>
        </form>
        <nav className="flex flex-col gap-0.5 flex-1">{NAV.map(renderNavLink)}</nav>
        <button onClick={() => setCreateOpen(true)} className="btn-primary w-full mt-4 py-2.5">
          <span className="text-lg leading-none">+</span> Create Post
        </button>
        <div className="mt-2"><InstallButton /></div>
        <div className="mt-4 pt-4 border-t border-surface-200 dark:border-white/5 flex items-center gap-3">
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size={36} onClick={() => navigate('/profile')} className="cursor-pointer" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate text-gray-900 dark:text-white">{profile?.full_name}</div>
            <div className="text-xs text-gray-400 truncate">@{profile?.username}</div>
          </div>
          <div className="flex items-center gap-1">
            {pushSupported && (
              <button onClick={togglePush} disabled={pushLoading}
                title={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
                className={clsx('btn-icon', pushEnabled ? 'text-brand-500' : 'text-gray-500 dark:text-gray-400')}>
                {pushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
              </button>
            )}
            <button onClick={toggleTheme} className="btn-icon text-gray-500 dark:text-gray-400">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={handleSignOut} className="btn-icon text-gray-500 dark:text-gray-400 hover:text-red-500">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile drawer overlay ───────────────────────────────────── */}
      <div
        className={clsx(
          'lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setDrawerOpen(false)}
      />
      <div className={clsx(
        'lg:hidden fixed left-0 top-0 bottom-0 z-50 w-72 bg-white dark:bg-surface-900 shadow-2xl flex flex-col transition-transform duration-300 ease-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-surface-200 dark:border-white/10">
          <ViiMbuniLogo size="sm" />
          <button onClick={() => setDrawerOpen(false)} className="btn-icon text-gray-500"><X size={20} /></button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-white/10">
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size={42}
            onClick={() => { navigate('/profile'); setDrawerOpen(false) }} className="cursor-pointer" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{profile?.full_name}</div>
            <div className="text-xs text-gray-400 truncate">@{profile?.username}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">{NAV.map(renderNavLink)}</nav>
        <div className="px-4 py-3 border-t border-surface-200 dark:border-white/10 space-y-2">
          <button onClick={() => { setCreateOpen(true); setDrawerOpen(false) }} className="btn-primary w-full py-2.5">
            + Create Post
          </button>
          <InstallButton />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {pushSupported && (
                <button onClick={togglePush} disabled={pushLoading}
                  className={clsx('btn-icon text-sm gap-2 flex items-center', pushEnabled ? 'text-brand-500' : 'text-gray-500 dark:text-gray-400')}>
                  {pushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                  <span className="text-xs font-medium">{pushEnabled ? 'Notifs on' : 'Notifs off'}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleTheme} className="btn-icon text-gray-500 dark:text-gray-400">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={() => { setDrawerOpen(false); handleSignOut() }}
                className="btn-icon text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-white/10 px-3 py-2.5 flex items-center gap-2 shadow-sm">
          <button onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-700 dark:text-white hover:bg-surface-100 dark:hover:bg-white/10 transition-colors flex-shrink-0">
            <Menu size={22} />
          </button>
          <div className="flex-1 flex items-center"><ViiMbuniLogo size="sm" /></div>
          <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-xs mx-2">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-8 py-1.5 text-xs" />
            </div>
          </form>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                onContextMenu={e => { e.preventDefault(); if (pushSupported) togglePush() }}
                onPointerDown={() => { if (!pushSupported) return; const t = setTimeout(() => togglePush(), 600); window.__bellTimer = t }}
                onPointerUp={() => clearTimeout(window.__bellTimer)}
                onPointerLeave={() => clearTimeout(window.__bellTimer)}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-surface-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-surface-200 dark:hover:bg-white/20 transition-colors"
              >
                {pushSupported && !pushEnabled ? <BellOff size={20} className="text-gray-400" /> : <Bell size={20} />}
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-md">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
                {pushSupported && pushEnabled && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-500 rounded-full border-2 border-white dark:border-surface-900" />
                )}
              </button>
              {notifOpen && <div className="absolute right-0 top-11 z-50"><NotifPanel onClose={() => setNotifOpen(false)} /></div>}
            </div>
            <button onClick={() => navigate('/profile')} className="w-9 h-9 rounded-xl overflow-hidden ring-2 ring-brand-400 dark:ring-brand-500 flex-shrink-0">
              <Avatar src={profile?.avatar_url} name={profile?.full_name} size={36} />
            </button>
          </div>
        </header>

        {/* Desktop topbar */}
        <header className="hidden lg:flex sticky top-0 z-30 glass border-b border-surface-200 dark:border-white/5 px-6 py-3 items-center justify-end gap-3">
          <div className="relative" ref={notifRef}>
            <button onClick={() => setNotifOpen(v => !v)} className="btn-icon relative">
              <Bell size={20} />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
            {notifOpen && <div className="absolute right-0 top-11 z-50"><NotifPanel onClose={() => setNotifOpen(false)} /></div>}
          </div>
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size={34} onClick={() => navigate('/profile')} className="cursor-pointer" />
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-3xl mx-auto w-full pb-20 lg:pb-6 overflow-x-hidden">
          <CallContext.Provider value={call}>
            <Outlet />
          </CallContext.Provider>
        </main>

        {/* ── Draggable floating theme toggle — mobile only ────────── */}
        <div
          ref={dragRef}
          className="lg:hidden fixed z-40 touch-none select-none"
          style={{
            left: togglePos.x,
            top: togglePos.y,
            width: TOGGLE_SIZE,
            height: TOGGLE_SIZE,
            cursor: 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="w-full h-full rounded-full shadow-xl flex items-center justify-center border backdrop-blur-sm"
            style={{
              background: theme === 'dark' ? 'rgba(30,30,63,0.95)' : 'rgba(255,255,255,0.95)',
              borderColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark'
              ? <Sun size={18} className="text-yellow-400 pointer-events-none" />
              : <Moon size={18} className="text-indigo-500 pointer-events-none" />}
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav className={clsx(
          'lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-white/10 flex items-center justify-around px-1 shadow-lg dark:shadow-black/40 transition-transform duration-200',
          keyboardOpen && 'translate-y-full'
        )} style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
          {BOTTOM_NAV.map(({ to, icon: Icon, label, badge, end, zaar }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 transition-colors relative',
                zaar ? isActive ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
                     : isActive ? 'text-brand-500' : 'text-gray-500 dark:text-gray-400'
              )}
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    {zaar ? <span style={{ fontSize: 23, lineHeight: 1 }}>🔥</span> : <Icon size={23} strokeWidth={isActive ? 2.5 : 2} />}
                    {badge === 'msg' && msgCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                        {msgCount > 9 ? '9+' : msgCount}
                      </span>
                    )}
                  </div>
                  <span className={clsx('text-[10px] font-semibold', isActive && 'font-bold')}>{label}</span>
                  {isActive && <span className={clsx('absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full', zaar ? 'bg-red-500' : 'bg-brand-500')} />}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setCreateOpen(true)} className="flex flex-col items-center justify-center flex-1 py-2 px-1 gap-0.5">
            <div className="w-12 h-12 rounded-2xl gradient-brand flex items-center justify-center -mt-7 shadow-glow ring-4 ring-white dark:ring-surface-900">
              <span className="text-white text-2xl leading-none font-bold">+</span>
            </div>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Post</span>
          </button>
        </nav>
      </div>

      {createOpen && <CreatePostModal onClose={() => setCreateOpen(false)} />}

      {showInstallBanner && (
        <InstallBanner onClose={() => setShowInstallBanner(false)} />
      )}

      <CallScreen
        callState={call.callState}
        callType={call.callType}
        remoteUser={call.remoteUser}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        muted={call.muted}
        cameraOff={call.cameraOff}
        speakerOff={call.speakerOff}
        facingMode={call.facingMode}
        durationLabel={call.durationLabel}
        screenSharing={call.screenSharing}
        onAccept={() => call.acceptCall(call.callSession, call.remoteUser)}
        onDecline={() => call.declineCall(call.callSession)}
        onEnd={() => call.endCall()}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onToggleSpeaker={call.toggleSpeaker}
        onFlipCamera={call.flipCamera}
        onToggleScreenShare={call.toggleScreenShare}
      />
    </div>
  )
}
