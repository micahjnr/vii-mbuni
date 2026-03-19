import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import sb from '@/lib/supabase'

// ── Auth Store ────────────────────────────────────────────────
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      loading: true,   // stays true until BOTH rehydration AND getSession() finish

      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),

      fetchProfile: async (userId) => {
        const { data } = await sb
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (data) set({ profile: data })
        return data
      },

      signOut: async () => {
        await sb.auth.signOut()
        set({ user: null, profile: null })
        try { localStorage.removeItem('vii-mbuni-auth') } catch (_) {}
      },
    }),
    {
      name: 'vii-mbuni-auth',
      // Persist user id + slim profile — enough for AuthGuard to work instantly on reload
      partialize: (s) => ({
        user: s.user ? { id: s.user.id, email: s.user.email } : null,
        profile: s.profile
          ? { id: s.profile.id, username: s.profile.username, full_name: s.profile.full_name, avatar_url: s.profile.avatar_url, xp: s.profile.xp, streak_days: s.profile.streak_days }
          : null,
      }),
      // Keep loading=true until rehydration is done so AuthGuard never flashes
      onRehydrateStorage: () => (state) => {
        // After rehydration, loading stays true — App.jsx getSession() will set it false.
        // But if rehydration itself fails (no stored data), set loading=false immediately
        // so the app doesn't hang on a blank PageLoader.
        if (!state?.user) {
          useAuthStore.setState({ loading: false })
        }
      },
    }
  )
)

// ── UI Store ──────────────────────────────────────────────────
const prefersDark = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false

export const useUIStore = create(
  persist(
    (set) => ({
      theme: prefersDark ? 'dark' : 'light',
      sidebarOpen: false,
      activeCall: null,
      onlineUsers: [],

      toggleTheme: () =>
        set((s) => {
          const next = s.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.classList.toggle('dark', next === 'dark')
          return { theme: next }
        }),

      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      setActiveCall: (call) => set({ activeCall: call }),
      setOnlineUsers: (users) => set({ onlineUsers: users }),
      addOnlineUser: (id) => set((s) => ({ onlineUsers: [...new Set([...s.onlineUsers, id])] })),
      removeOnlineUser: (id) => set((s) => ({ onlineUsers: s.onlineUsers.filter(u => u !== id) })),
    }),
    {
      name: 'vii-mbuni-ui',
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) document.documentElement.classList.toggle('dark', state.theme === 'dark')
      },
    }
  )
)

// ── Notifications + Messages Store ───────────────────────────
export const useNotifStore = create((set) => ({
  count: 0,       // unread notification count
  msgCount: 0,    // unread message count
  notifs: [],

  setCount:    (count)    => set({ count }),
  setMsgCount: (msgCount) => set({ msgCount }),
  setNotifs:   (notifs)   => set({ notifs, count: notifs.filter(n => !n.is_read).length }),
  addNotif:    (notif)    => set((s) => ({ notifs: [notif, ...s.notifs], count: s.count + 1 })),
  markRead:    ()         => set({ count: 0 }),
  clearMsgCount: ()       => set({ msgCount: 0 }),
}))
