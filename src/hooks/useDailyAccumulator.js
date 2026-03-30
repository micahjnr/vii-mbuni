// src/hooks/useDailyAccumulator.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

const BASE = import.meta.env.DEV
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions'

// ── Fetch today's accumulator ─────────────────────────────────────
async function fetchAccumulator(date) {
  const url = `${BASE}/daily-accumulator-get${date ? `?date=${date}` : ''}`
  const res = await fetch(url)
  if (res.status === 404) return null  // no acca today — not an error
  if (!res.ok) throw new Error(`Failed to load accumulator (${res.status})`)
  return res.json()
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
    staleTime: 1000 * 60 * 10,   // 10 min
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
