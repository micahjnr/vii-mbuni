// src/hooks/useDailyAccumulator.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import sb from '@/lib/supabase'

const BASE = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions'

// ── Fetch today's accumulator — direct Supabase query (avoids Netlify function 405) ──
async function fetchAccumulator(date) {
  const today = date || new Date().toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('daily_accumulators')
    .select('*')
    .eq('date', today)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

// ── Trigger generation (admin / manual) ──────────────────────────
async function triggerGenerate() {
  const res = await fetch(`${BASE}/daily-accumulator-generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Generation failed (${res.status})`)
  }
  return res.json()
}

// ── Update result ─────────────────────────────────────────────────
async function patchResult({ id, status }) {
  const res = await fetch(`${BASE}/daily-accumulator-result?id=${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Update failed (${res.status})`)
  }
  return res.json()
}

// ─────────────────────────────────────────────────────────────────

export function useDailyAccumulator(date) {
  return useQuery({
    queryKey: ['daily-accumulator', date ?? 'today'],
    queryFn:  () => fetchAccumulator(date),
    staleTime: 0,         // always refetch on mount so generated acca shows immediately
    retry:     1,
  })
}

export function useGenerateAccumulator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: triggerGenerate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-accumulator'] })
      toast.success('New accumulator generated!')
    },
    onError: (err) => toast.error(err.message),
  })
}

export function useUpdateAccumulatorResult() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: patchResult,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['daily-accumulator'] })
      toast.success(`Marked as ${data.status === 'won' ? '✅ Won' : '❌ Lost'}`)
    },
    onError: (err) => toast.error(err.message),
  })
}
