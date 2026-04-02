// src/hooks/useDailyAccumulator.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import sb from '@/lib/supabase'

const BASE = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions'

// ── Fetch today's accumulator — direct Supabase query ────────────
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

// ── Trigger generation ────────────────────────────────────────────
async function triggerGenerate() {
  const res = await fetch(`${BASE}/daily-accumulator-generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Generation failed (${res.status})`)
  return body
}

// ── Update result ─────────────────────────────────────────────────
async function patchResult({ id, status }) {
  const res = await fetch(`${BASE}/daily-accumulator-result?id=${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Update failed (${res.status})`)
  return body
}

// ─────────────────────────────────────────────────────────────────

export function useDailyAccumulator(date) {
  return useQuery({
    queryKey: ['daily-accumulator', date ?? 'today'],
    queryFn:  () => fetchAccumulator(date),
    staleTime: 0,
    retry:     1,
    refetchOnWindowFocus: true,
  })
}

export function useGenerateAccumulator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: triggerGenerate,
    onSuccess: (data) => {
      // If the server returned the full acca record, inject it directly into
      // the cache so the UI updates instantly without waiting for a refetch.
      if (data?.id && data?.selections) {
        qc.setQueryData(['daily-accumulator', 'today'], data)
      } else {
        // "Already generated today" — force a fresh fetch from Supabase
        qc.refetchQueries({ queryKey: ['daily-accumulator'] })
      }
      toast.success('Accumulator ready!')
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
      qc.refetchQueries({ queryKey: ['daily-accumulator'] })
      toast.success(`Marked as ${data.status === 'won' ? '✅ Won' : '❌ Lost'}`)
    },
    onError: (err) => toast.error(err.message),
  })
}
