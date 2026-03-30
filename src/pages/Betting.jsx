// src/pages/Betting.jsx
import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import AccumulatorCard from '@/components/betting/AccumulatorCard'
import { Trophy, TrendingUp, History } from 'lucide-react'
import clsx from 'clsx'

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim())

// ── Recent history ────────────────────────────────────────────────
function AccaHistory() {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['acca-history'],
    queryFn: async () => {
      const { data } = await sb
        .from('daily_accumulators')
        .select('id, date, total_odds, confidence, status, selections')
        .order('date', { ascending: false })
        .limit(10)
      return data || []
    },
    staleTime: 60_000,
  })

  if (isLoading) return (
    <div className="space-y-2">
      {[1,2,3].map(i => (
        <div key={i} className="h-14 rounded-xl bg-surface-100 dark:bg-white/5 animate-pulse" />
      ))}
    </div>
  )

  if (!history.length) return (
    <p className="text-sm text-gray-400 text-center py-4">No history yet.</p>
  )

  const wins  = history.filter(h => h.status === 'won').length
  const done  = history.filter(h => h.status !== 'pending').length
  const rate  = done ? Math.round((wins / done) * 100) : null

  return (
    <div className="space-y-3">
      {/* Win rate summary */}
      {rate !== null && (
        <div className="flex items-center gap-4 p-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20">
          <Trophy size={18} className="text-brand-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Win Rate (last {done} settled)</p>
            <p className="font-black text-gray-900 dark:text-white text-lg">{rate}%</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">W / L</p>
            <p className="font-bold text-sm text-gray-700 dark:text-gray-200">{wins} / {done - wins}</p>
          </div>
        </div>
      )}

      {/* Row list */}
      {history.map(row => (
        <div key={row.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-surface-900 border border-surface-100 dark:border-white/5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
              {new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {row.selections?.length} sel · {row.selections?.map(s => s.pick).join(' · ')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-black text-gray-900 dark:text-white tabular-nums">{row.total_odds.toFixed(2)}</p>
            <span className={clsx(
              'text-[10px] font-bold rounded-full px-2 py-0.5',
              row.status === 'won'     && 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
              row.status === 'lost'    && 'bg-red-100 dark:bg-red-500/20 text-red-500',
              row.status === 'pending' && 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
            )}>
              {row.status.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

export default function Betting() {
  const { user } = useAuthStore()
  const isAdmin = ADMIN_EMAILS.includes(user?.email)

  return (
    <div className="animate-fade-in space-y-5 max-w-xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <TrendingUp size={20} className="text-brand-500" />
        <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">Daily Accumulator</h1>
      </div>

      {/* Today's acca */}
      <AccumulatorCard showAdminControls={isAdmin} />

      {/* History section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-gray-400" />
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Recent History</h2>
        </div>
        <AccaHistory />
      </div>
    </div>
  )
}
