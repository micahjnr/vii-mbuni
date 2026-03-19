/**
 * useDailyStreak — awards XP on the user's first visit each calendar day
 * and increments their streak_days counter.
 *
 * Called once after login in App.jsx.
 *
 * ── Race-condition fix ────────────────────────────────────────────────────
 * Previously this hook did a read-check-write entirely in JS, so two tabs
 * open at the same time could both see "not yet awarded" and double-award XP.
 *
 * Now it calls the `claim_daily_streak` RPC which does an atomic
 * INSERT ... ON CONFLICT DO NOTHING into `daily_logins`. The server returns
 * true only for the first caller; all subsequent calls (other tabs, page
 * refreshes) get false and are no-ops. localStorage is still used as a
 * quick local guard to avoid even hitting the network on repeat visits.
 */
import { useEffect } from 'react'
import sb from '@/lib/supabase'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'

const STREAK_KEY = (userId) => `vii-mbuni-streak-${userId}`

export function useDailyStreak() {
  const { user, profile, fetchProfile } = useAuthStore()

  useEffect(() => {
    if (!user || !profile) return

    const today = new Date().toDateString() // e.g. "Mon Mar 11 2026"
    const key = STREAK_KEY(user.id)

    // Quick local guard: if we already claimed today in this browser, skip network call
    if (localStorage.getItem(key) === today) return

    const run = async () => {
      try {
        // Server-side atomic claim — returns true only for the first claim of today
        const { data: awarded, error } = await sb.rpc('claim_daily_streak', {
          p_user_id: user.id,
        })

        if (error) {
          // RPC not deployed yet (local dev) — fall back to legacy behaviour
          console.warn('[useDailyStreak] RPC unavailable, using legacy path:', error.message)
          await legacyAward(user, profile, fetchProfile, today, key)
          return
        }

        if (!awarded) {
          // Already claimed today (another tab beat us, or a previous session)
          localStorage.setItem(key, today)
          return
        }

        // Refresh profile so streak_days / XP are up to date in the UI
        const updated = await fetchProfile(user.id)
        localStorage.setItem(key, today)

        if (document.visibilityState !== 'visible') return

        const streak = updated?.streak_days ?? 1
        const xp = streak >= 7 ? 50 : 25
        if (streak > 1) {
          toast.success(
            `🔥 ${streak} day streak! +${xp} XP${xp > 25 ? ' (2× bonus!)' : ''}`,
            { duration: 4000 }
          )
        } else {
          toast.success(`Welcome back! +${xp} XP`, { duration: 3000 })
        }
      } catch (err) {
        console.warn('[useDailyStreak] error:', err)
      }
    }

    run()
  }, [user?.id, profile?.id]) // Only run when user/profile first loads
}

// ── Legacy fallback (used if claim_daily_streak RPC isn't deployed yet) ──
async function legacyAward(user, profile, fetchProfile, today, key) {
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yest = yesterday.toDateString()
    const lastVisit = localStorage.getItem(key)
    const isConsecutive = lastVisit === yest
    const newStreak = isConsecutive ? (profile.streak_days || 0) + 1 : 1
    const bonusXP = newStreak >= 7 ? 50 : 25

    await sb.from('profiles').update({
      streak_days: newStreak,
      last_active: new Date().toISOString(),
    }).eq('id', user.id)

    try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: bonusXP }) } catch (_) {}
    await fetchProfile(user.id)
    localStorage.setItem(key, today)

    if (document.visibilityState !== 'visible') return
    if (newStreak > 1) {
      toast.success(`🔥 ${newStreak} day streak! +${bonusXP} XP${bonusXP > 25 ? ' (2× bonus!)' : ''}`, { duration: 4000 })
    } else {
      toast.success(`Welcome back! +${bonusXP} XP`, { duration: 3000 })
    }
  } catch (err) {
    console.warn('[useDailyStreak legacy] error:', err)
  }
}
