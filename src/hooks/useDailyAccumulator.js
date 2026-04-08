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

// ── PATCH result (status and/or booking_code) ─────────────────────
async function patchResult({ id, status, booking_code }) {
  const payload = {}
  if (status !== undefined)       payload.status       = status
  if (booking_code !== undefined) payload.booking_code = booking_code
  const res = await fetch(`${BASE}/daily-accumulator-result?id=${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
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
      if (data?.id && data?.selections) {
        qc.setQueryData(['daily-accumulator', 'today'], data)
      } else {
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

// ── Save SportyBet booking code ───────────────────────────────────
export function useUpdateBookingCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, booking_code }) => patchResult({ id, booking_code }),
    onSuccess: (data) => {
      qc.setQueryData(['daily-accumulator', 'today'], data)
      qc.invalidateQueries({ queryKey: ['daily-accumulator'] })
      toast.success('Booking code saved! 🎯')
    },
    onError: (err) => toast.error(err.message),
  })
}
