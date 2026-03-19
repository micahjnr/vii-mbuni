import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Calendar, MapPin, Clock, Users, Search, X, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import { Skeleton, EmptyState, Modal } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import { format, isPast, parseISO } from 'date-fns'
import clsx from 'clsx'

export default function Events() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState('Upcoming')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['events', user?.id],
    queryFn: async () => {
      const [{ data: events }, { data: rsvps }] = await Promise.all([
        sb.from('events').select('*, event_rsvps(count)').order('starts_at', { ascending: true }),
        sb.from('event_rsvps').select('event_id').eq('user_id', user.id),
      ])
      const rsvpSet = new Set((rsvps || []).map(r => r.event_id))
      return { events: events || [], rsvpSet }
    },
    enabled: !!user,
  })

  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, going }) => {
      if (going) await sb.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      else await sb.from('event_rsvps').insert({ event_id: eventId, user_id: user.id })
    },
    onMutate: ({ eventId, going }) => {
      // Optimistic update — toggle immediately without waiting for DB
      const prev = qc.getQueryData(['events', user?.id])
      qc.setQueryData(['events', user?.id], old => {
        if (!old) return old
        const newSet = new Set(old.rsvpSet)
        going ? newSet.delete(eventId) : newSet.add(eventId)
        return { ...old, rsvpSet: newSet }
      })
      toast.success(going ? 'Removed from Going' : 'Going! 🎉')
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['events', user?.id], ctx.prev)
      toast.error('Failed to update RSVP')
    },
    onSettled: () => qc.invalidateQueries(['events']),
  })

  const events = data?.events || []
  const rsvpSet = data?.rsvpSet || new Set()
  const q = search.toLowerCase()
  const filtered = events.filter(e => !q || e.title?.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q))
  const upcoming = filtered.filter(e => !isPast(parseISO(e.starts_at)))
  const past = filtered.filter(e => isPast(parseISO(e.starts_at)))
  const myEvents = filtered.filter(e => rsvpSet.has(e.id))
  const list = tab === 'Upcoming' ? upcoming : tab === 'Past' ? past : myEvents

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Events</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs gap-1.5"><Plus size={14} /> Create Event</button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="input pl-10" />
      </div>

      <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1">
        {['Upcoming', 'Past', 'Going'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx(
            'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
            tab === t ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card' : 'text-gray-500 dark:text-gray-400'
          )}>{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState icon="📅" title={`No ${tab.toLowerCase()} events`} description={tab === 'Upcoming' ? 'Check back soon or create one!' : 'Nothing here yet.'} />
      ) : (
        <div className="space-y-3">
          {list.map(event => (
            <EventCard
              key={event.id}
              event={event}
              going={rsvpSet.has(event.id)}
              onRsvp={() => rsvpMutation.mutate({ eventId: event.id, going: rsvpSet.has(event.id) })}
            />
          ))}
        </div>
      )}

      {createOpen && <CreateEventModal onClose={() => setCreateOpen(false)} user={user} qc={qc} />}
    </div>
  )
}

function EventCard({ event, going, onRsvp }) {
  const isPastEvent = isPast(parseISO(event.starts_at))
  const attendees = Number(event.event_rsvps?.[0]?.count ?? 0) || 0
  return (
    <div className="card p-4 flex gap-4">
      {/* Date block */}
      <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex flex-col items-center justify-center border border-brand-100 dark:border-brand-800">
        <div className="text-brand-500 text-xs font-bold uppercase">{format(parseISO(event.starts_at), 'MMM')}</div>
        <div className="text-brand-700 dark:text-brand-300 text-xl font-extrabold leading-none">{format(parseISO(event.starts_at), 'd')}</div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white">{event.title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          <span className="flex items-center gap-1 text-xs text-gray-500"><Clock size={11} /> {format(parseISO(event.starts_at), 'EEE h:mm a')}</span>
          {event.location && <span className="flex items-center gap-1 text-xs text-gray-500"><MapPin size={11} /> {event.location}</span>}
          <span className="flex items-center gap-1 text-xs text-gray-500"><Users size={11} /> {attendees} going</span>
        </div>
        {event.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{event.description}</p>}
      </div>
      {!isPastEvent && (
        <button onClick={onRsvp} className={clsx('flex-shrink-0 self-center text-xs px-3 py-1.5 rounded-xl font-semibold transition-all', going ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300' : 'btn-primary')}>
          {going ? '✓ Going' : 'RSVP'}
        </button>
      )}
    </div>
  )
}

function CreateEventModal({ onClose, user, qc }) {
  const [form, setForm] = useState({ title: '', description: '', location: '', starts_at: '', ends_at: '' })
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from('events').insert({ ...form, creator_id: user.id })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['events']); toast.success('Event created! 🎉'); onClose() },
    onError: () => toast.error('Failed to create event'),
  })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  return (
    <Modal title="Create Event" onClose={onClose}>
      <div className="p-5 space-y-3">
        <input value={form.title} onChange={set('title')} placeholder="Event title *" className="input" />
        <textarea value={form.description} onChange={set('description')} placeholder="Description" rows={3} className="input resize-none" />
        <input value={form.location} onChange={set('location')} placeholder="Location" className="input" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Start *</label>
            <input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} className="input" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">End</label>
            <input type="datetime-local" value={form.ends_at} onChange={set('ends_at')} className="input" />
          </div>
        </div>
        <button onClick={() => mutation.mutate()} disabled={!form.title.trim() || !form.starts_at || mutation.isPending} className="btn-primary w-full py-2.5">
          {mutation.isPending ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Creating...</span> : 'Create Event'}
        </button>
      </div>
    </Modal>
  )
}
