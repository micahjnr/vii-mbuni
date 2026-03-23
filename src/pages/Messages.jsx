import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, X, Edit3, CheckCheck, Check, Mic, Image } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore, useUIStore, useNotifStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/PageLoader'
import { formatDistanceToNow } from 'date-fns'

// ── New Message Modal ────────────────────────────────────────
function NewMessageModal({ onClose, onSelect }) {
  const { user } = useAuthStore()
  const [q, setQ] = useState('')

  const { data: people, isLoading } = useQuery({
    queryKey: ['new-message-search', q],
    queryFn: async () => {
      if (!q.trim()) {
        const { data } = await sb
          .from('friends')
          .select('sender:user_id(id,username,full_name,avatar_url), receiver:friend_id(id,username,full_name,avatar_url)')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .limit(20)
        return (data || []).map(r => r.user_id === user.id ? r.receiver : r.sender).filter(Boolean)
      }
      const { data } = await sb
        .from('profiles')
        .select('id,username,full_name,avatar_url')
        .neq('id', user.id)
        .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(15)
      return data || []
    },
    enabled: true,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-surface-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-surface-200 dark:bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white">New Chat</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-white/10 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search friends..."
              autoFocus
              className="input pl-10 text-sm py-2.5 rounded-2xl"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-1 px-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-2.5">
                  <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : !people?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {q ? '😕 No results found' : '👥 No friends yet'}
            </p>
          ) : (
            people.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                <Avatar src={p.avatar_url} name={p.full_name} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{p.full_name}</div>
                  <div className="text-xs text-gray-400">@{p.username}</div>
                </div>
                <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center flex-shrink-0">
                  <Edit3 size={13} className="text-white" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Build conversation list from raw messages ──────────────
function buildConvos(messages, userId) {
  const convMap = new Map()
  for (const msg of messages) {
    const isMe = msg.sender_id === userId
    const other = isMe ? msg.receiver : msg.sender
    if (!other?.id) continue
    // Skip story reaction messages entirely — they are not real chat messages
    const isStoryReaction = STORY_REACTION_RE.test(msg.content || '')
    if (!convMap.has(other.id)) {
      convMap.set(other.id, { other, lastMsg: isStoryReaction ? null : msg, unreadCount: 0 })
    } else if (!isStoryReaction && !convMap.get(other.id).lastMsg) {
      // Backfill lastMsg if it was initially skipped due to story reaction
      convMap.get(other.id).lastMsg = msg
    }
    if (!isMe && !msg.is_read && !isStoryReaction) {
      convMap.get(other.id).unreadCount++
    }
  }
  // Remove convos where ALL messages were story reactions (no real lastMsg)
  return Array.from(convMap.values()).filter(c => c.lastMsg !== null)
}

// ── Message preview content ────────────────────────────────
// Story reaction messages sneak in via the notifications system.
// They have content like "🔥 reacted to your story" — filter them out
// so the conversation preview always shows the last real chat message.
const STORY_REACTION_RE = /reacted to your story/i

function previewContent(msg) {
  if (msg.audio_url) return { icon: 'mic', text: 'Voice message' }
  const content = msg.content || ''
  if (STORY_REACTION_RE.test(content)) return { icon: null, text: '' }
  if (msg.image_url || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(content)) {
    return { icon: 'img', text: content === '🎞️ GIF' ? 'GIF' : 'Photo' }
  }
  return { icon: null, text: content }
}

// ── Compact time string ────────────────────────────────────
function compactTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── "Last seen" label ──────────────────────────────────────
function lastSeenLabel(lastActive, isOnline) {
  if (isOnline) return { text: 'Online', color: 'text-green-500' }
  if (!lastActive) return { text: 'Offline', color: 'text-gray-400' }
  const diff = Date.now() - new Date(lastActive).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2)  return { text: 'Just now', color: 'text-green-400' }
  if (m < 60) return { text: `${m}m ago`, color: 'text-gray-400' }
  const h = Math.floor(m / 60)
  if (h < 24) return { text: `${h}h ago`, color: 'text-gray-400' }
  const d = Math.floor(h / 24)
  if (d === 1) return { text: 'Yesterday', color: 'text-gray-400' }
  if (d < 7)  return { text: `${d}d ago`, color: 'text-gray-400' }
  return { text: new Date(lastActive).toLocaleDateString([], { month: 'short', day: 'numeric' }), color: 'text-gray-400' }
}

// ── Active contacts horizontal strip ──────────────────────
function ActiveStrip({ convos, onlineUsers, onOpen }) {
  // Sort: online users first, then by last_active descending
  const sorted = [...convos].sort((a, b) => {
    const aOnline = onlineUsers.includes(a.other.id)
    const bOnline = onlineUsers.includes(b.other.id)
    if (aOnline !== bOnline) return aOnline ? -1 : 1
    const aTime = new Date(a.other.last_active || 0).getTime()
    const bTime = new Date(b.other.last_active || 0).getTime()
    return bTime - aTime
  }).slice(0, 10)

  if (!sorted.length) return null
  return (
    <div className="mb-2">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide px-1 py-2">
        {sorted.map(({ other }) => {
          const isOnline = onlineUsers.includes(other.id)
          const { text: seenText } = lastSeenLabel(other.last_active, isOnline)
          return (
            <button
              key={other.id}
              onClick={() => onOpen(other.id)}
              className="flex flex-col items-center gap-1 flex-shrink-0 group"
            >
              <div className="relative">
                <div className={`w-[58px] h-[58px] rounded-full p-[2.5px] transition-all ${isOnline ? 'gradient-brand' : 'bg-surface-200 dark:bg-white/10'}`}>
                  <div className="w-full h-full rounded-full border-2 border-white dark:border-surface-900 overflow-hidden">
                    <Avatar src={other.avatar_url} name={other.full_name} size={50} />
                  </div>
                </div>
                {isOnline && (
                  <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900 shadow-sm" />
                )}
              </div>
              <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 w-14 text-center truncate group-hover:text-brand-500 transition-colors">
                {other.full_name?.split(' ')[0]}
              </span>
              <span className={`text-[9px] w-14 text-center truncate ${isOnline ? 'text-green-500 font-semibold' : 'text-gray-400'}`}>
                {seenText}
              </span>
            </button>
          )
        })}
      </div>
      <div className="h-px bg-surface-100 dark:bg-white/5 mt-1 mb-3" />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────
export default function Messages() {
  const { user } = useAuthStore()
  const { onlineUsers } = useUIStore()
  const { setMsgCount } = useNotifStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [newMsgOpen, setNewMsgOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user?.id) return
    const channel = sb.channel(`msg-list:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user.id}`,
      }, () => qc.invalidateQueries({ queryKey: ['conversations', user.id] }))
      .subscribe()
    return () => sb.removeChannel(channel)
  }, [user?.id])

  const { data: convos = [], isLoading, isError } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('get_conversations', { uid: user.id })
      if (error) throw error
      // Map RPC rows into the same shape buildConvos() used to produce
      return (data || []).map(row => ({
        other: {
          id:          row.other_id,
          username:    row.other_username,
          full_name:   row.other_full_name,
          avatar_url:  row.other_avatar_url,
          last_active: row.other_last_active,
        },
        lastMsg: {
          id:         row.last_msg_id,
          content:    row.last_msg_content,
          audio_url:  row.last_msg_audio,
          image_url:  row.last_msg_image,
          is_read:    row.last_msg_read,
          sender_id:  row.last_msg_sender,
          created_at: row.last_msg_at,
        },
        unreadCount: Number(row.unread_count),
      }))
    },
    enabled: !!user,
    staleTime: 10_000,
  })

  const unreadCount = convos.filter(c => c.unreadCount > 0).length

  // Keep the nav badge in sync with what the conversation list actually shows.
  // This catches stale badge counts (e.g. messages marked read on another device).
  useEffect(() => {
    setMsgCount(unreadCount)
  }, [unreadCount])

  const filtered = convos
    .filter(({ other, unreadCount: uc }) => {
      const matchesSearch = !search.trim() ||
        other.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        other.username?.toLowerCase().includes(search.toLowerCase())
      const matchesFilter = filter === 'all' || uc > 0
      return matchesSearch && matchesFilter
    })
    // Sort: online users first, then by last_active desc
    .sort((a, b) => {
      const aOnline = onlineUsers.includes(a.other.id)
      const bOnline = onlineUsers.includes(b.other.id)
      if (aOnline !== bOnline) return aOnline ? -1 : 1
      // Among same status, keep original order (most recent message first)
      return 0
    })

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Messages</h1>
          {unreadCount > 0 && (
            <p className="text-xs text-brand-500 font-semibold mt-0.5">
              {unreadCount} unread conversation{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setNewMsgOpen(true)}
          title="New message"
          className="w-10 h-10 rounded-full gradient-brand flex items-center justify-center shadow-glow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Edit3 size={16} className="text-white" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="input pl-10 text-sm py-2.5 rounded-2xl"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: unreadCount > 0 ? `Unread · ${unreadCount}` : 'Unread' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === key
                ? 'gradient-brand text-white shadow-glow-sm'
                : 'bg-surface-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-surface-200 dark:hover:bg-white/15'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
              <Skeleton className="w-14 h-14 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-10" />
                </div>
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-700 dark:text-gray-300">Could not load messages</p>
          <p className="text-sm text-gray-400 mt-1">Check your connection and try again.</p>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['conversations'] })} className="btn-primary mt-4 text-sm px-5">
            Retry
          </button>
        </div>
      ) : convos.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full gradient-brand flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Edit3 size={32} className="text-white" />
          </div>
          <h3 className="font-bold text-gray-800 dark:text-white text-lg">No messages yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-5">Start a conversation with a friend</p>
          <button onClick={() => setNewMsgOpen(true)} className="btn-primary px-6">Send a Message</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">{search ? '🔍' : '✅'}</div>
          <p className="font-semibold text-gray-700 dark:text-gray-300">
            {search ? 'No conversations match' : 'No unread messages'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {search ? 'Try a different name' : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <>
          {/* Active contacts strip */}
          {!search && filter === 'all' && (
            <ActiveStrip convos={filtered} onlineUsers={onlineUsers} onOpen={id => navigate(`/messages/${id}`)} />
          )}

          {/* Conversation rows */}
          <div className="space-y-0.5">
            {filtered.map(({ other, lastMsg, unreadCount: uc }) => {
              const hasUnread = uc > 0
              const isMe = lastMsg.sender_id === user.id
              const isOnline = onlineUsers.includes(other.id)
              const { icon, text } = previewContent(lastMsg)
              const seen = lastSeenLabel(other.last_active, isOnline)

              return (
                <button
                  key={other.id}
                  onClick={() => navigate(`/messages/${other.id}`)}
                  className={`flex items-center gap-3.5 w-full px-3 py-3 rounded-2xl text-left transition-all active:scale-[0.98] ${
                    hasUnread
                      ? 'bg-brand-50 dark:bg-brand-900/40 hover:bg-brand-100/60 dark:hover:bg-brand-800/30'
                      : 'hover:bg-surface-50 dark:hover:bg-white/5'
                  }`}
                >
                  {/* Avatar with optional online ring */}
                  <div className="relative flex-shrink-0">
                    {isOnline ? (
                      <div className="w-[54px] h-[54px] rounded-full p-[2.5px] gradient-brand">
                        <div className="w-full h-full rounded-full border-2 border-white dark:border-surface-900 overflow-hidden">
                          <Avatar src={other.avatar_url} name={other.full_name} size={46} />
                        </div>
                      </div>
                    ) : (
                      <Avatar src={other.avatar_url} name={other.full_name} size={54} />
                    )}
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white dark:border-surface-900" />
                    )}
                  </div>

                  {/* Name + preview */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900 dark:text-white' : 'font-semibold text-gray-800 dark:text-gray-200'}`}>
                        {other.full_name}
                      </span>
                      <span className={`text-[11px] flex-shrink-0 tabular-nums ${hasUnread ? 'text-brand-500 font-semibold' : 'text-gray-400'}`}>
                        {compactTime(lastMsg.created_at)}
                      </span>
                    </div>
                    {/* Last seen line */}
                    <div className={`text-[10px] mb-0.5 font-medium ${seen.color}`}>
                      {seen.text}
                    </div>
                    <div className={`text-xs flex items-center gap-1 ${hasUnread ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>
                      {isMe && (
                        lastMsg.is_read
                          ? <CheckCheck size={12} className="text-brand-400 flex-shrink-0 shrink-0" />
                          : <Check size={12} className="text-gray-300 flex-shrink-0 shrink-0" />
                      )}
                      {icon === 'mic' && <Mic size={11} className="flex-shrink-0" />}
                      {icon === 'img' && <Image size={11} className="flex-shrink-0" />}
                      <span className="truncate">
                        {isMe && icon === null && <span className="text-gray-400 mr-0.5">You:</span>}
                        {text}
                      </span>
                    </div>
                  </div>

                  {/* Right side: unread badge OR small avatar echo */}
                  <div className="flex-shrink-0">
                    {hasUnread ? (
                      <div className="min-w-[22px] h-[22px] gradient-brand text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 shadow-glow-sm">
                        {uc > 99 ? '99+' : uc}
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full overflow-hidden opacity-60">
                        <Avatar src={other.avatar_url} name={other.full_name} size={36} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="h-20" />
        </>
      )}

      {/* Floating compose (mobile) */}
      <button
        onClick={() => setNewMsgOpen(true)}
        className="fixed bottom-24 right-5 lg:hidden w-14 h-14 rounded-full gradient-brand shadow-glow flex items-center justify-center z-30 active:scale-95 transition-transform"
        aria-label="New message"
      >
        <Edit3 size={22} className="text-white" />
      </button>

      {newMsgOpen && (
        <NewMessageModal
          onClose={() => setNewMsgOpen(false)}
          onSelect={person => { setNewMsgOpen(false); navigate(`/messages/${person.id}`) }}
        />
      )}
    </div>
  )
}
