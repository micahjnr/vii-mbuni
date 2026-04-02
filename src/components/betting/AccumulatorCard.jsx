// src/components/betting/AccumulatorCard.jsx
import { useState } from 'react'
import { useDailyAccumulator, useGenerateAccumulator, useUpdateAccumulatorResult } from '@/hooks/useDailyAccumulator'
import { useAuthStore } from '@/store'
import { RefreshCw, TrendingUp, Trophy, XCircle, ChevronDown, ChevronUp, Zap, Target, Shield } from 'lucide-react'
import clsx from 'clsx'

// ── Market icon/color map ─────────────────────────────────────────
function marketStyle(market) {
  if (market?.includes('Over') || market?.includes('Under') || market?.includes('Goals'))
    return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '⚽' }
  if (market?.includes('Both'))
    return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', label: '🎯' }
  return { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: '🏆' }
}

// ── Confidence arc ────────────────────────────────────────────────
function ConfidenceArc({ value }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const fill = ((value / 100) * circ).toFixed(1)
  const color = value >= 80 ? '#22c55e' : value >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative flex flex-col items-center gap-0.5">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg width="80" height="80" className="-rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6"/>
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 6px ${color}88)` }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black text-white leading-none">{value}</span>
          <span className="text-[9px] text-white/50 font-semibold tracking-widest uppercase">conf</span>
        </div>
      </div>
    </div>
  )
}

// ── Single selection ──────────────────────────────────────────────
function SelectionRow({ sel, index }) {
  const prob = Math.round(sel.probability * 100)
  const ms = marketStyle(sel.market)
  return (
    <div className="relative flex items-start gap-3 py-3.5 border-b border-white/5 last:border-0 group">
      {/* glow line on hover */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: ms.color }}/>

      {/* index */}
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-black"
        style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.color}30` }}>
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ms.color }}>
            {sel.league}
          </span>
        </div>
        <p className="text-sm font-bold text-white leading-snug truncate">{sel.match}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.color}25` }}>
            {ms.label} {sel.market}
          </span>
          <span className="text-[12px] font-black" style={{ color: ms.color }}>
            {sel.pick}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-2">
        <span className="text-xl font-black text-white tabular-nums">{sel.odds?.toFixed(2)}</span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${prob}%`, background: ms.color }}/>
          </div>
          <span className="text-[10px] font-semibold text-white/50">{prob}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'won') return (
    <span className="flex items-center gap-1.5 text-xs font-black text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1 rounded-full">
      <Trophy size={11}/> WON
    </span>
  )
  if (status === 'lost') return (
    <span className="flex items-center gap-1.5 text-xs font-black text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-1 rounded-full">
      <XCircle size={11}/> LOST
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/> LIVE
    </span>
  )
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({ onGenerate, isPending, error }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8"
      style={{ background: 'linear-gradient(145deg, #0f0f1a 0%, #13131f 100%)' }}>
      {/* bg decoration */}
      <div className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #6366f130 0%, transparent 60%), radial-gradient(circle at 80% 20%, #8b5cf620 0%, transparent 50%)' }}/>
      <div className="relative flex flex-col items-center gap-4 p-10 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ background: 'linear-gradient(135deg, #6366f120, #8b5cf620)', border: '1px solid #6366f130' }}>
          {error ? '⚠️' : '🎯'}
        </div>
        <div>
          <p className="font-black text-white text-base tracking-wide">
            {error ? 'Generation Failed' : 'No Acca Yet Today'}
          </p>
          <p className="text-xs text-white/40 mt-1 font-medium">
            {error
              ? error
              : 'Our AI is ready to build today\'s picks'}
          </p>
        </div>
        <button onClick={onGenerate} disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px #6366f140' }}>
          <RefreshCw size={14} className={isPending ? 'animate-spin' : ''}/>
          {isPending ? 'Building Picks…' : error ? 'Try Again' : 'Generate Accumulator'}
        </button>
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────
export default function AccumulatorCard({ showAdminControls = false }) {
  const { profile } = useAuthStore()
  const { data: acca, isLoading } = useDailyAccumulator()
  const generate = useGenerateAccumulator()
  const updateResult = useUpdateAccumulatorResult()
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [lastError, setLastError] = useState(null)

  if (isLoading) return (
    <div className="rounded-2xl border border-white/8 overflow-hidden animate-pulse"
      style={{ background: '#0f0f1a' }}>
      <div className="h-24 bg-white/5"/>
      <div className="p-4 space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/5"/>)}
      </div>
    </div>
  )

  if (!acca) return (
    <EmptyState
      onGenerate={() => {
        setLastError(null)
        generate.mutate(undefined, {
          onError: (e) => setLastError(e.message),
        })
      }}
      isPending={generate.isPending}
      error={lastError}
    />
  )

  const isFinalised = acca.status !== 'pending'

  // Compute unique markets for the badge strip
  const markets = [...new Set((acca.selections || []).map(s => s.market))]

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-2xl border transition-all',
      acca.status === 'won'  ? 'border-emerald-500/30' :
      acca.status === 'lost' ? 'border-red-500/30' : 'border-white/8'
    )} style={{ background: 'linear-gradient(160deg, #0c0c18 0%, #111120 100%)' }}>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(ellipse at 20% 0%, #6366f118 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, #8b5cf612 0%, transparent 50%)' }}/>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🔥</span>
              <span className="text-xs font-black tracking-[0.2em] uppercase text-white/40">Daily Acca</span>
            </div>
            <p className="text-white font-black text-lg leading-tight">
              {new Date(acca.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {/* market tags */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {markets.map(m => {
                const ms = marketStyle(m)
                return (
                  <span key={m} className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.color}30` }}>
                    {m}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusBadge status={acca.status}/>
            <ConfidenceArc value={acca.confidence}/>
          </div>
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div className="h-px mx-5 bg-white/5"/>

      {/* ── Selections ──────────────────────────────────────────── */}
      <div className="px-5">
        {(acca.selections || []).map((sel, i) => (
          <SelectionRow key={i} sel={sel} index={i}/>
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="relative mx-4 my-4 rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1">Combined Odds</p>
          <p className="text-4xl font-black text-white tabular-nums leading-none"
            style={{ textShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
            {acca.total_odds?.toFixed(2)}
          </p>
          <p className="text-[10px] text-white/30 mt-1">{(acca.selections || []).length} selections</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-black">
            <Shield size={12}/> AI Verified
          </div>
          <div className="flex items-center gap-1.5 text-blue-400 text-xs font-black">
            <Zap size={12}/> High Value
          </div>
          <div className="flex items-center gap-1.5 text-purple-400 text-xs font-black">
            <Target size={12}/> Mixed Markets
          </div>
        </div>
      </div>

      {/* ── Analysis ────────────────────────────────────────────── */}
      <button onClick={() => setAnalysisOpen(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between text-xs font-bold text-white/30 hover:text-white/60 transition-colors border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12}/> Analysis
        </div>
        {analysisOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
      </button>

      {analysisOpen && (
        <div className="px-5 pb-4 text-xs text-white/40 leading-relaxed border-t border-white/5 pt-3">
          {acca.analysis}
        </div>
      )}

      {/* ── Admin controls ───────────────────────────────────────── */}
      {showAdminControls && !isFinalised && (
        <div className="px-4 pb-4 flex gap-2 border-t border-white/5 pt-3">
          <button onClick={() => updateResult.mutate({ id: acca.id, status: 'won' })}
            disabled={updateResult.isPending}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-emerald-500/20">
            <Trophy size={12}/> Mark Won
          </button>
          <button onClick={() => updateResult.mutate({ id: acca.id, status: 'lost' })}
            disabled={updateResult.isPending}
            className="flex-1 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-black transition-all flex items-center justify-center gap-1.5 border border-red-500/20">
            <XCircle size={12}/> Mark Lost
          </button>
          <button onClick={() => generate.mutate()} disabled={generate.isPending} title="Re-generate"
            className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 transition-all border border-white/8">
            <RefreshCw size={13} className={generate.isPending ? 'animate-spin' : ''}/>
          </button>
        </div>
      )}

      {/* ── Disclaimer ───────────────────────────────────────────── */}
      <div className="mx-4 mb-4 rounded-xl px-3 py-2.5 flex gap-2 items-start border border-amber-500/15"
        style={{ background: 'rgba(245,158,11,0.06)' }}>
        <span className="text-amber-500 flex-shrink-0 mt-0.5 text-xs">⚠</span>
        <p className="text-[10px] text-amber-500/60 leading-relaxed">
          <strong className="text-amber-500/80">Prediction only.</strong> Past performance doesn't guarantee results. Bet responsibly.
        </p>
      </div>
    </div>
  )
}
