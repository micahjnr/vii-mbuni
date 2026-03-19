import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { UserPlus, UserCheck, UserX, Search, Clock, Users, MessageCircle, ChevronRight, MapPin } from 'lucide-react'
import { useAuthStore, useUIStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import XPBadge from '@/components/gamification/XPBadge'
import { Skeleton } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const TABS = [
  { key: 'friends',     label: 'Your Friends'},
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
          .select('*, sender:user_id(id,username,full_name,avatar_url), receiver:friend_id(id,username,full_name,avatar_url)')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`),
        sb.from('profiles')
          .select('id,username,full_name,avatar_url,bio,xp')
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

      {/* ── Header — Facebook style ───────────────────────────── */}
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

        {/* Tabs — pill style like Facebook */}
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

      {/* ── Content ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
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
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
              People you may know
            </p>
            <div className="grid grid-cols-2 gap-3">
              {suggestions.map(p => (
                <SuggestionCard
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
        <div>
          {nearbyPeople.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MapPin size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
              <p className="font-bold text-lg text-gray-900 dark:text-white">No one nearby yet</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">Add your city in your profile settings to discover people near you</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
                <MapPin size={14} /> {nearbyPeople.length} people in your city
              </p>
              <div className="grid grid-cols-2 gap-3">
                {nearbyPeople.map(person => (
                  <SuggestionCard
                    key={person.id}
                    profile={person}
                    mutuals={mutualMap[person.id] || 0}
                    isOnline={onlineUsers.includes(person.id)}
                    isSent={optimisticSent.has(person.id)}
                    onAdd={() => { sendReq.mutate(person.id); setOptimisticSent(s => new Set([...s, person.id])) }}
                    onView={() => navigate(`/profile/${person.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

      ) : tab === 'requests' ? (
        incomingReqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">📭</span>
            <p className="font-bold text-lg text-gray-900 dark:text-white">No pending requests</p>
            <p className="text-sm text-gray-400 mt-1">Friend requests will appear here</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
              {incomingReqs.length} friend request{incomingReqs.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {incomingReqs.map(req => (
                <RequestCard
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
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
              {myFriends.length} friend{myFriends.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {myFriends.map(p => (
                <FriendCard
                  key={p.id}
                  person={p}
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

// ── Suggestion Card (Facebook grid style) ─────────────────────────────────────
function SuggestionCard({ person, mutuals, sent, isOnline, onAdd, onView, onMessage }) {
  const hue1 = (person.full_name?.charCodeAt(0) || 200) * 5 % 360
  const hue2 = (person.full_name?.charCodeAt(1) || 100) * 7 % 360

  return (
    <div className="card overflow-hidden hover:shadow-card-lg transition-all duration-200 flex flex-col">
      {/* Cover banner */}
      <div
        className="h-24 w-full cursor-pointer flex-shrink-0"
        style={{ background: `linear-gradient(135deg, hsl(${hue1},60%,55%), hsl(${hue2},70%,40%))` }}
        onClick={onView}
      />

      <div className="px-3 pb-3 flex flex-col flex-1">
        {/* Avatar overlapping banner */}
        <div className="-mt-9 mb-2">
          <div className="relative w-16 h-16 cursor-pointer" onClick={onView}>
            {isOnline ? (
              <div className="w-full h-full rounded-full p-[2.5px] gradient-brand border-[3px] border-white dark:border-surface-900 shadow-lg">
                <div className="w-full h-full rounded-full overflow-hidden">
                  <Avatar src={person.avatar_url} name={person.full_name} size={56} />
                </div>
              </div>
            ) : (
              <div className="w-full h-full rounded-full border-[3px] border-white dark:border-surface-900 overflow-hidden shadow-lg">
                <Avatar src={person.avatar_url} name={person.full_name} size={58} />
              </div>
            )}
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
            )}
          </div>
        </div>

        {/* Name + mutual */}
        <div className="flex-1 cursor-pointer mb-2.5" onClick={onView}>
          <div className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">
            {person.full_name}
          </div>
          {mutuals > 0 ? (
            <div className="flex items-center gap-1 mt-1">
              <Users size={11} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-400 line-clamp-1">
                {mutuals} mutual friend{mutuals > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-0.5">@{person.username}</div>
          )}
        </div>

        {/* Actions */}
        {sent ? (
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 py-2 bg-surface-100 dark:bg-white/5 rounded-xl">
            <Clock size={12} /> Requested
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button onClick={onAdd} className="btn-primary text-xs py-2 w-full gap-1">
              <UserPlus size={13} /> Add Friend
            </button>
            <button onClick={onMessage} className="btn-secondary text-xs py-1.5 w-full gap-1">
              <MessageCircle size={13} /> Message
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Request Card (Facebook grid style) ────────────────────────────────────────
function RequestCard({ req, mutuals, isOnline, onAccept, onDecline, onView }) {
  const sender = req.sender
  const hue1 = (sender?.full_name?.charCodeAt(0) || 150) * 5 % 360
  const hue2 = (sender?.full_name?.charCodeAt(1) || 80) * 7 % 360

  return (
    <div className="card overflow-hidden hover:shadow-card-lg transition-all duration-200 flex flex-col">
      {/* Cover */}
      <div
        className="h-24 w-full cursor-pointer flex-shrink-0"
        style={{ background: `linear-gradient(135deg, hsl(${hue1},60%,55%), hsl(${hue2},70%,40%))` }}
        onClick={onView}
      />

      <div className="px-3 pb-3 flex flex-col flex-1">
        {/* Avatar */}
        <div className="-mt-9 mb-2">
          <div className="relative w-16 h-16 cursor-pointer" onClick={onView}>
            {isOnline ? (
              <div className="w-full h-full rounded-full p-[2.5px] gradient-brand border-[3px] border-white dark:border-surface-900 shadow-lg">
                <div className="w-full h-full rounded-full overflow-hidden">
                  <Avatar src={sender?.avatar_url} name={sender?.full_name} size={56} />
                </div>
              </div>
            ) : (
              <div className="w-full h-full rounded-full border-[3px] border-white dark:border-surface-900 overflow-hidden shadow-lg">
                <Avatar src={sender?.avatar_url} name={sender?.full_name} size={58} />
              </div>
            )}
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
            )}
          </div>
        </div>

        {/* Name */}
        <div className="flex-1 cursor-pointer mb-2.5" onClick={onView}>
          <div className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">
            {sender?.full_name}
          </div>
          {mutuals > 0 ? (
            <div className="flex items-center gap-1 mt-1">
              <Users size={11} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-400 line-clamp-1">
                {mutuals} mutual friend{mutuals > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-0.5">@{sender?.username}</div>
          )}
        </div>

        {/* Confirm / Delete — exactly like Facebook */}
        <div className="flex flex-col gap-1.5">
          <button onClick={onAccept} className="btn-primary text-xs py-2 w-full gap-1">
            <UserCheck size={13} /> Confirm
          </button>
          <button onClick={onDecline} className="btn-secondary text-xs py-1.5 w-full gap-1 text-gray-600 dark:text-gray-300">
            <UserX size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Friend Card ───────────────────────────────────────────────────────────────
function FriendCard({ person, isOnline, onView, onMessage, onUnfriend }) {
  const hue1 = (person.full_name?.charCodeAt(0) || 200) * 5 % 360
  const hue2 = (person.full_name?.charCodeAt(1) || 100) * 7 % 360

  return (
    <div className="card overflow-hidden hover:shadow-card-lg transition-all duration-200 flex flex-col">
      <div
        className="h-24 w-full cursor-pointer flex-shrink-0"
        style={{ background: `linear-gradient(135deg, hsl(${hue1},60%,55%), hsl(${hue2},70%,40%))` }}
        onClick={onView}
      />

      <div className="px-3 pb-3 flex flex-col flex-1">
        <div className="-mt-9 mb-2">
          <div className="relative w-16 h-16 cursor-pointer" onClick={onView}>
            {isOnline ? (
              <div className="w-full h-full rounded-full p-[2.5px] gradient-brand border-[3px] border-white dark:border-surface-900 shadow-lg">
                <div className="w-full h-full rounded-full overflow-hidden">
                  <Avatar src={person.avatar_url} name={person.full_name} size={56} />
                </div>
              </div>
            ) : (
              <div className="w-full h-full rounded-full border-[3px] border-white dark:border-surface-900 overflow-hidden shadow-lg">
                <Avatar src={person.avatar_url} name={person.full_name} size={58} />
              </div>
            )}
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
            )}
          </div>
        </div>

        <div className="flex-1 cursor-pointer mb-2.5" onClick={onView}>
          <div className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">
            {person.full_name}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
            {person.bio || `@${person.username}`}
          </div>
        </div>

        <div className="flex gap-1.5">
          <button onClick={onMessage} className="btn-primary text-xs py-1.5 flex-1 gap-1">
            <MessageCircle size={13} /> Message
          </button>
          <button onClick={onUnfriend} title="Unfriend"
            className="btn-secondary text-xs px-2.5 py-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
            <UserX size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="h-24 bg-surface-200 dark:bg-white/10" />
      <div className="px-3 pb-3">
        <div className="-mt-8 mb-2">
          <div className="w-16 h-16 rounded-full bg-surface-300 dark:bg-white/10 border-2 border-white dark:border-surface-800" />
        </div>
        <div className="space-y-2 mb-3">
          <div className="h-4 w-24 skeleton rounded-lg" />
          <div className="h-3 w-16 skeleton rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <div className="h-8 skeleton rounded-xl" />
          <div className="h-7 skeleton rounded-xl" />
        </div>
      </div>
    </div>
  )
}
