import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { UserPlus, UserCheck, UserX, Search, Clock, Users, MessageCircle, ChevronRight, MapPin, MoreHorizontal } from 'lucide-react'
import { useAuthStore, useUIStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import XPBadge from '@/components/gamification/XPBadge'
import { Skeleton } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function lastSeenLabel(lastActive, isOnline) {
  if (isOnline) return { text: 'Active now', color: 'text-green-500' }
  if (!lastActive) return { text: null, color: 'text-gray-400' }
  const diff = Date.now() - new Date(lastActive).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2)  return { text: 'Active just now', color: 'text-green-400' }
  if (m < 60) return { text: `Active ${m}m ago`, color: 'text-gray-400' }
  const h = Math.floor(m / 60)
  if (h < 24) return { text: `Active ${h}h ago`, color: 'text-gray-400' }
  const d = Math.floor(h / 24)
  if (d === 1) return { text: 'Active yesterday', color: 'text-gray-400' }
  if (d < 7)  return { text: `Active ${d}d ago`, color: 'text-gray-400' }
  return { text: null, color: 'text-gray-400' }
}

const TABS = [
  { key: 'suggestions', label: 'Suggestions' },
  { key: 'nearby',      label: '📍 Nearby'   },
  { key: 'requests',    label: 'Requests'    },
]

export default function Friends() {
  const { user } = useAuthStore()
  const { onlineUsers } = useUIStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState('friends')
  const [search, setSearch] = useState('')
  const [optimisticSent, setOptimisticSent] = useState(new Set())

  // ── Data ──────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['friends-all', user?.id],
    queryFn: async () => {
      const [{ data: rows }, { data: profiles }] = await Promise.all([
        sb.from('friends')
          .select('*, sender:user_id(id,username,full_name,avatar_url,last_active), receiver:friend_id(id,username,full_name,avatar_url,last_active)')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
        sb.from('profiles')
          .select('id,username,full_name,avatar_url,bio,xp,last_active')
          .neq('id', user.id)
          .order('full_name', { ascending: true })
          .limit(200),
      ])
      return { rows: rows || [], profiles: profiles || [] }
    },
    staleTime: 300_000, // 5 min — friend lists change slowly
    enabled: !!user,
  })

  const rows     = data?.rows     || []
  const profiles = data?.profiles || []

  // ── Nearby people (same city) ─────────────────────────────
  const { data: nearbyPeople = [] } = useQuery({
    queryKey: ['nearby', user?.id],
    queryFn: async () => {
      // Get own city first
      const { data: me } = await sb.from('profiles').select('city').eq('id', user.id).single()
      if (!me?.city) return []
      const { data } = await sb.from('profiles')
        .select('id, username, full_name, avatar_url, bio, city, xp')
        .eq('city', me.city)
        .neq('id', user.id)
        .limit(50)
      return data || []
    },
    enabled: !!user,
    staleTime: 60_000,
  })

  const accepted     = rows.filter(r => r.status === 'accepted')
  const friendIds    = new Set(accepted.map(r => r.user_id === user?.id ? r.friend_id : r.user_id))
  const pendingSent  = new Set(rows.filter(r => r.status === 'pending' && r.user_id === user?.id).map(r => r.friend_id))
  const incomingReqs = rows.filter(r => r.status === 'pending' && r.friend_id === user?.id)
  const allSent      = new Set([...pendingSent, ...optimisticSent])

  // ── Mutual friends ────────────────────────────────────────────
  const { data: mutualMap = {} } = useQuery({
    queryKey: ['mutuals', user?.id, [...friendIds].join(',')],
    queryFn: async () => {
      if (!friendIds.size) return {}
      const myFriendArr = [...friendIds]
      const { data: fof } = await sb.from('friends')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(myFriendArr.map(id => `user_id.eq.${id},friend_id.eq.${id}`).join(','))
      const map = {}
      ;(fof || []).forEach(r => {
        [r.user_id, r.friend_id].forEach(id => {
          if (id !== user.id && !friendIds.has(id)) {
            map[id] = (map[id] || 0) + 1
          }
        })
      })
      return map
    },
    enabled: !!user && friendIds.size > 0,
    staleTime: 120_000,
  })

  // ── Mutations ─────────────────────────────────────────────────
  const sendReq = useMutation({
    mutationFn: async (friendId) => {
      const { error } = await sb.from('friends').insert({ user_id: user.id, friend_id: friendId, status: 'pending' })
      if (error) throw error
      await sb.from('notifications').insert({
        user_id: friendId, actor_id: user.id, type: 'friend_request', reference_id: user.id, is_read: false,
      })
    },
    onMutate: (friendId) => setOptimisticSent(prev => new Set([...prev, friendId])),
    onSuccess: () => { qc.invalidateQueries(['friends-all']); toast.success('Friend request sent! 🙌') },
    onError: (_e, friendId) => {
      setOptimisticSent(prev => { const n = new Set(prev); n.delete(friendId); return n })
      toast.error('Failed to send request')
    },
  })

  const acceptReq = useMutation({
    mutationFn: async (req) => {
      const { error } = await sb.from('friends')
        .update({ status: 'accepted' })
        .eq('id', req.id)
        .eq('friend_id', user.id)
      if (error) throw error
      sb.from('notifications').insert({
        user_id: req.user_id, actor_id: user.id, type: 'follow', reference_id: user.id, is_read: false,
      }).then(() => {}).catch(() => {})
    },
    onSuccess: () => { qc.invalidateQueries(['friends-all']); toast.success('Friend added! 🎉') },
    onError: () => toast.error('Failed to accept — check Supabase RLS'),
    retry: 0,
  })

  const declineReq = useMutation({
    mutationFn: async (id) => {
      const { error } = await sb.from('friends').delete().eq('id', id).eq('friend_id', user.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['friends-all']),
    onError: () => toast.error('Failed to decline'),
    retry: 0,
  })

  const unfriend = useMutation({
    mutationFn: (otherId) => sb.from('friends').delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${user.id})`),
    onSuccess: () => { qc.invalidateQueries(['friends-all']); toast.success('Unfriended') },
  })

  // ── Filtered lists ─────────────────────────────────────────────
  const q = search.toLowerCase()
  const matches = (p) => !q || p.full_name?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q)

  const suggestions = useMemo(() => (
    profiles
      .filter(p => !friendIds.has(p.id) && !allSent.has(p.id) && matches(p))
      .sort((a, b) => (mutualMap[b.id] || 0) - (mutualMap[a.id] || 0))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [profiles, friendIds, allSent, mutualMap, q])

  const myFriends = profiles.filter(p => friendIds.has(p.id) && matches(p))

  return (
    <div className="animate-fade-in">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Friends</h1>
          {incomingReqs.length > 0 && (
            <button
              onClick={() => setTab('requests')}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-500 hover:text-brand-600"
            >
              {incomingReqs.length} request{incomingReqs.length > 1 ? 's' : ''}
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people..."
            className="input pl-10"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all',
                tab === t.key
                  ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400'
                  : 'bg-surface-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-white/15'
              )}
            >
              {t.label}
              {t.key === 'requests' && incomingReqs.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 bg-red-500 text-white text-[11px] font-bold rounded-full px-1">
                  {incomingReqs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-1">
          {[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}
        </div>

      ) : tab === 'suggestions' ? (
        suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🌍</span>
            <p className="font-bold text-lg text-gray-900 dark:text-white">No more suggestions</p>
            <p className="text-sm text-gray-400 mt-1">You're connected with everyone!</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              People you may know
            </p>
            <div className="space-y-1">
              {suggestions.map(p => (
                <SuggestionRow
                  key={p.id}
                  person={p}
                  mutuals={mutualMap[p.id] || 0}
                  sent={allSent.has(p.id)}
                  isOnline={onlineUsers.includes(p.id)}
                  onAdd={() => sendReq.mutate(p.id)}
                  onView={() => navigate(`/profile/${p.id}`)}
                  onMessage={() => navigate(`/messages/${p.id}`)}
                />
              ))}
            </div>
          </div>
        )

      ) : tab === 'nearby' ? (
        nearbyPeople.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <p className="font-bold text-lg text-gray-900 dark:text-white">No one nearby yet</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">Add your city in your profile settings to discover people near you</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
              <MapPin size={14} /> {nearbyPeople.length} people in your city
            </p>
            <div className="space-y-1">
              {nearbyPeople.map(person => (
                <SuggestionRow
                  key={person.id}
                  person={person}
                  mutuals={mutualMap[person.id] || 0}
                  isOnline={onlineUsers.includes(person.id)}
                  sent={optimisticSent.has(person.id)}
                  onAdd={() => { sendReq.mutate(person.id); setOptimisticSent(s => new Set([...s, person.id])) }}
                  onView={() => navigate(`/profile/${person.id}`)}
                  onMessage={() => navigate(`/messages/${person.id}`)}
                />
              ))}
            </div>
          </div>
        )

      ) : tab === 'requests' ? (
        incomingReqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📭</span>
            <p className="font-bold text-lg text-gray-900 dark:text-white">No pending requests</p>
            <p className="text-sm text-gray-400 mt-1">Friend requests will appear here</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              {incomingReqs.length} friend request{incomingReqs.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-1">
              {incomingReqs.map(req => (
                <RequestRow
                  key={req.id}
                  req={req}
                  mutuals={mutualMap[req.sender?.id] || 0}
                  isOnline={onlineUsers.includes(req.sender?.id)}
                  onAccept={() => acceptReq.mutate(req)}
                  onDecline={() => declineReq.mutate(req.id)}
                  onView={() => navigate(`/profile/${req.sender?.id}`)}
                />
              ))}
            </div>
          </div>
        )

      ) : (
        myFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">🤝</span>
            <p className="font-bold text-lg text-gray-900 dark:text-white">No friends yet</p>
            <p className="text-sm text-gray-400 mt-1">Add people from suggestions</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">
              {myFriends.length.toLocaleString()} friend{myFriends.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1">
              {myFriends.map(p => (
                <FriendRow
                  key={p.id}
                  person={p}
                  mutuals={mutualMap[p.id] || 0}
                  isOnline={onlineUsers.includes(p.id)}
                  onView={() => navigate(`/profile/${p.id}`)}
                  onMessage={() => navigate(`/messages/${p.id}`)}
                  onUnfriend={() => unfriend.mutate(p.id)}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ── Shared: mutual friends avatars display ────────────────────────────────────
function MutualLine({ mutuals }) {
  if (!mutuals) return null
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Users size={11} className="text-gray-400 flex-shrink-0" />
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {mutuals.toLocaleString()} mutual friend{mutuals !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ── Facebook-style "Your Friends" list row ────────────────────────────────────
function FriendRow({ person, mutuals, isOnline, onView, onMessage, onUnfriend }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { text: activeText, color: activeColor } = lastSeenLabel(person.last_active, isOnline)

  return (
    <div className="flex items-center gap-3 px-1 py-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-white/5 transition-colors relative">
      {/* Avatar */}
      <div className="relative flex-shrink-0 cursor-pointer" onClick={onView}>
        <div className="w-14 h-14 rounded-full overflow-hidden">
          <Avatar src={person.avatar_url} name={person.full_name} size={56} />
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
        )}
      </div>

      {/* Name + active status + mutuals */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
        <p className="font-semibold text-[15px] text-gray-900 dark:text-white leading-tight truncate">
          {person.full_name}
        </p>
        {activeText && (
          <p className={clsx('text-xs font-medium mt-0.5', activeColor)}>{activeText}</p>
        )}
        <MutualLine mutuals={mutuals} />
        {!mutuals && !activeText && (
          <p className="text-xs text-gray-400 mt-0.5">@{person.username}</p>
        )}
      </div>

      {/* Three-dot menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-9 h-9 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-500 hover:bg-surface-200 dark:hover:bg-white/20 transition-colors"
        >
          <MoreHorizontal size={20} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-11 z-20 bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-100 dark:border-white/10 overflow-hidden min-w-[160px]">
              <button
                onClick={() => { setMenuOpen(false); onMessage() }}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-surface-50 dark:hover:bg-white/5 w-full text-left"
              >
                <MessageCircle size={16} /> Message
              </button>
              <button
                onClick={() => { setMenuOpen(false); onUnfriend() }}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 w-full text-left"
              >
                <UserX size={16} /> Unfriend
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Facebook-style Suggestion list row ────────────────────────────────────────
function SuggestionRow({ person, mutuals, sent, isOnline, onAdd, onView, onMessage }) {
  const [dismissed, setDismissed] = useState(false)
  const { text: activeText, color: activeColor } = lastSeenLabel(person.last_active, isOnline)
  if (dismissed) return null

  return (
    <div className="flex items-center gap-3 px-1 py-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-white/5 transition-colors">
      {/* Avatar */}
      <div className="relative flex-shrink-0 cursor-pointer" onClick={onView}>
        <div className="w-14 h-14 rounded-full overflow-hidden">
          <Avatar src={person.avatar_url} name={person.full_name} size={56} />
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
        )}
      </div>

      {/* Name + active status + mutuals */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-[15px] text-gray-900 dark:text-white leading-tight truncate cursor-pointer"
          onClick={onView}
        >
          {person.full_name}
        </p>
        {activeText && (
          <p className={clsx('text-xs font-medium mt-0.5', activeColor)}>{activeText}</p>
        )}
        <MutualLine mutuals={mutuals} />
        {!mutuals && !activeText && (
          <p className="text-xs text-gray-400 mt-0.5">@{person.username}</p>
        )}

        {/* Action buttons — Facebook style */}
        <div className="flex gap-2 mt-2">
          {sent ? (
            <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-surface-100 dark:bg-white/10 text-xs font-semibold text-gray-500">
              <Clock size={12} /> Requested
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors"
            >
              <UserPlus size={14} /> Add friend
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-surface-100 dark:bg-white/10 hover:bg-surface-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 text-sm font-semibold transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Facebook-style Request list row ──────────────────────────────────────────
function RequestRow({ req, mutuals, isOnline, onAccept, onDecline, onView }) {
  const sender = req.sender
  const { text: activeText, color: activeColor } = lastSeenLabel(sender?.last_active, isOnline)

  return (
    <div className="flex items-center gap-3 px-1 py-2.5 rounded-xl hover:bg-surface-100 dark:hover:bg-white/5 transition-colors">
      {/* Avatar */}
      <div className="relative flex-shrink-0 cursor-pointer" onClick={onView}>
        <div className="w-14 h-14 rounded-full overflow-hidden">
          <Avatar src={sender?.avatar_url} name={sender?.full_name} size={56} />
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
        )}
      </div>

      {/* Name + active status + mutuals + actions */}
      <div className="flex-1 min-w-0">
        <p
          className="font-semibold text-[15px] text-gray-900 dark:text-white leading-tight truncate cursor-pointer"
          onClick={onView}
        >
          {sender?.full_name}
        </p>
        {activeText && (
          <p className={clsx('text-xs font-medium mt-0.5', activeColor)}>{activeText}</p>
        )}
        <MutualLine mutuals={mutuals} />
        {!mutuals && !activeText && (
          <p className="text-xs text-gray-400 mt-0.5">@{sender?.username}</p>
        )}

        {/* Confirm / Delete — exactly like Facebook */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors"
          >
            <UserCheck size={14} /> Confirm
          </button>
          <button
            onClick={onDecline}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-surface-100 dark:bg-white/10 hover:bg-surface-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 text-sm font-semibold transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-1 py-2.5">
      <div className="w-14 h-14 rounded-full skeleton flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-36 skeleton rounded-lg" />
        <div className="h-3 w-24 skeleton rounded-lg" />
      </div>
      <div className="w-9 h-9 rounded-full skeleton flex-shrink-0" />
    </div>
  )
}
