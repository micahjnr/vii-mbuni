// src/components/betting/AccumulatorCard.jsx
import { useState } from 'react'
import { useDailyAccumulator, useGenerateAccumulator, useUpdateAccumulatorResult } from '@/hooks/useDailyAccumulator'
import { useAuthStore } from '@/store'
import { RefreshCw, TrendingUp, Trophy, XCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

// ── Confidence ring ───────────────────────────────────────────────
function ConfidenceRing({ value }) {
  const r   = 26
  const circ = 2 * Math.PI * r
  const fill = ((value / 100) * circ).toFixed(1)
  const color = value >= 80 ? '#22c55e' : value >= 70 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
      <svg width="64" height="64" className="-rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor"
          className="text-surface-200 dark:text-white/10" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <span className="absolute text-[11px] font-black text-gray-800 dark:text-white leading-none">
        {value}%
      </span>
    </div>
  )
}

// ── Single selection row ──────────────────────────────────────────
function SelectionRow({ sel, index }) {
  const prob = (sel.probability * 100).toFixed(0)
  return (
    <div className="flex items-start gap-3 py-3 border-b border-surface-100 dark:border-white/5 last:border-0">
      {/* Index badge */}
      <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300
                      text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide truncate">
          {sel.league}
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-white leading-tight mt-0.5 truncate">
          {sel.match}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="badge text-[10px] bg-surface-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-md font-medium">
            {sel.market}
          </span>
          <span className="text-[12px] font-bold text-brand-500 dark:text-brand-400">
            {sel.pick}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-base font-black text-gray-900 dark:text-white tabular-nums">
          {sel.odds.toFixed(2)}
        </span>
        <span className="text-[10px] text-green-500 font-semibold">{prob}% prob</span>
      </div>
    </div>
  )
}

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'won')  return (
    <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-full">
      <Trophy size={12} /> WON
    </span>
  )
  if (status === 'lost') return (
    <span className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-full">
      <XCircle size={12} /> LOST
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-full">
      ⏳ PENDING
    </span>
  )
}

// ── Main card ─────────────────────────────────────────────────────
export default function AccumulatorCard({ showAdminControls = false }) {
  const { profile } = useAuthStore()
  const { data: acca, isLoading, isError } = useDailyAccumulator()
  const generate = useGenerateAccumulator()
  const updateResult = useUpdateAccumulatorResult()
  const [analysisOpen, setAnalysisOpen] = useState(false)

  // ── Loading skeleton ──────────────────────────────────────────
  if (isLoading) return (
    <div className="card p-4 space-y-3 animate-pulse">
      <div className="h-5 bg-surface-200 dark:bg-white/10 rounded-lg w-40" />
      <div className="h-3 bg-surface-200 dark:bg-white/10 rounded w-full" />
      <div className="h-3 bg-surface-200 dark:bg-white/10 rounded w-3/4" />
      <div className="h-3 bg-surface-200 dark:bg-white/10 rounded w-5/6" />
    </div>
  )

  // ── No acca yet ───────────────────────────────────────────────
  if (!acca) return (
    <div className="card p-5 flex flex-col items-center gap-3 text-center">
      <div className="text-3xl">🎯</div>
      <div>
        <p className="font-bold text-gray-800 dark:text-white text-sm">No accumulator yet today</p>
        <p className="text-xs text-gray-400 mt-0.5">Check back later or generate one now.</p>
      </div>
      {showAdminControls && (
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="btn-primary text-xs px-4 py-2 gap-1.5 flex items-center"
        >
          <RefreshCw size={13} className={generate.isPending ? 'animate-spin' : ''} />
          {generate.isPending ? 'Generating…' : 'Generate Accumulator'}
        </button>
      )}
    </div>
  )

  // ── Error state ───────────────────────────────────────────────
  if (isError) return (
    <div className="card p-4 text-center text-sm text-red-500">
      Failed to load accumulator. Try refreshing.
    </div>
  )

  const isFinalised = acca.status !== 'pending'

  return (
    <div className={clsx(
      'card overflow-hidden',
      acca.status === 'won'  && 'ring-2 ring-green-400/40 dark:ring-green-500/30',
      acca.status === 'lost' && 'ring-2 ring-red-400/40 dark:ring-red-500/30',
    )}>

      {/* ── Header strip ──────────────────────────────────────── */}
      <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <div>
            <p className="text-white font-black text-sm tracking-wide">DAILY ACCA</p>
            <p className="text-brand-200 text-[10px] font-medium">
              {new Date(acca.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
        <StatusBadge status={acca.status} />
      </div>

      {/* ── Selections ────────────────────────────────────────── */}
      <div className="px-4 divide-y divide-surface-100 dark:divide-white/5">
        {acca.selections.map((sel, i) => (
          <SelectionRow key={i} sel={sel} index={i} />
        ))}
      </div>

      {/* ── Footer: odds + confidence ─────────────────────────── */}
      <div className="px-4 py-3 bg-surface-50 dark:bg-white/3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Combined Odds</p>
          <p className="text-3xl font-black text-gray-900 dark:text-white tabular-nums leading-tight">
            {acca.total_odds.toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {acca.selections.length} selections
          </p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <ConfidenceRing value={acca.confidence} />
          <p className="text-[10px] text-gray-400 font-semibold">Confidence</p>
        </div>
      </div>

      {/* ── Analysis collapsible ──────────────────────────────── */}
      <button
        onClick={() => setAnalysisOpen(v => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-surface-50 dark:hover:bg-white/5 transition-colors border-t border-surface-100 dark:border-white/5"
      >
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} />
          Analysis
        </div>
        {analysisOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {analysisOpen && (
        <div className="px-4 pb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed border-t border-surface-100 dark:border-white/5 pt-2">
          {acca.analysis}
        </div>
      )}

      {/* ── Admin controls: mark won / lost ───────────────────── */}
      {showAdminControls && !isFinalised && (
        <div className="px-4 pb-4 pt-1 flex gap-2 border-t border-surface-100 dark:border-white/5">
          <button
            onClick={() => updateResult.mutate({ id: acca.id, status: 'won' })}
            disabled={updateResult.isPending}
            className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <Trophy size={13} /> Mark Won
          </button>
          <button
            onClick={() => updateResult.mutate({ id: acca.id, status: 'lost' })}
            disabled={updateResult.isPending}
            className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <XCircle size={13} /> Mark Lost
          </button>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            title="Re-generate"
            className="px-3 py-2 rounded-xl bg-surface-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={14} className={generate.isPending ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────────────── */}
      <div className="mx-4 mb-4 mt-1 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2 flex gap-2 items-start">
        <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
          <strong>This is a prediction, not a guarantee.</strong> Past performance does not indicate future results. Bet responsibly — only wager what you can afford to lose.
        </p>
      </div>
    </div>
  )
}
