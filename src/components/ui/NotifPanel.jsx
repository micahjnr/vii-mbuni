import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, Bell, Heart, MessageCircle, UserPlus, Share2, AtSign, MessageSquare, Check } from 'lucide-react'
import { useAuthStore, useNotifStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/PageLoader'
import { formatDistanceToNow } from 'date-fns'

// notifications schema: id, user_id, actor_id, type, reference_id, is_read, created_at
// type values: like | comment | reply | mention | friend_request | friend_accept | message | share | timeline_post

const TYPE_CONFIG = {
  like:               { icon: Heart,          color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-500/10',      label: (a) => `${a} liked your post` },
  comment:            { icon: MessageCircle,  color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-500/10',    label: (a) => `${a} commented on your post` },
  reply:              { icon: MessageCircle,  color: 'text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-500/10',    label: (a) => `${a} replied to your comment` },
  mention:            { icon: AtSign,         color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-500/10',  label: (a) => `${a} mentioned you` },
  friend_request:     { icon: UserPlus,       color: 'text-brand-500',  bg: 'bg-brand-50 dark:bg-brand-500/10',  label: (a) => `${a} sent you a friend request` },
  friend_accept:      { icon: UserPlus,       color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-500/10',  label: (a) => `${a} accepted your friend request` },
  follow:             { icon: UserPlus,       color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-500/10',  label: (a) => `${a} accepted your friend request` },
  message:            { icon: MessageSquare,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: (a) => `${a} sent you a message` },
  share:              { icon: Share2,         color: 'text-pink-500',   bg: 'bg-pink-50 dark:bg-pink-500/10',    label: (a) => `${a} shared your post` },
  timeline_post:      { icon: MessageCircle,  color: 'text-teal-500',   bg: 'bg-teal-50 dark:bg-teal-500/10',   label: (a) => `${a} posted on your timeline` },
  group_post:         { icon: MessageCircle,  color: 'text-brand-500',  bg: 'bg-brand-50 dark:bg-brand-500/10',  label: (a) => `${a} posted in your group` },
  group_join:         { icon: UserPlus,       color: 'text-brand-500',  bg: 'bg-brand-50 dark:bg-brand-500/10',  label: (a) => `${a} joined your group` },
  challenge_complete: { icon: Bell,           color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-500/10',  label: (_) => '🏆 Challenge complete!' },
  xp_milestone:       { icon: Bell,           color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10', label: (_) => '⚡ You reached a new level!' },
  default:            { icon: Bell,           color: 'text-gray-500',   bg: 'bg-gray-50 dark:bg-white/10',       label: (a) => `${a} interacted with you` },
}

// Where to navigate when a notification is clicked
function getNavTarget(notif) {
  switch (notif.type) {
    case 'like':
    case 'comment':
    case 'reply':
    case 'mention':
    case 'share':
      // Navigate to home feed with deep-link to the post
      return notif.reference_id ? `/?post=${notif.reference_id}` : (notif.actor?.id ? `/profile/${notif.actor.id}` : null)
    case 'timeline_post':
      // Someone posted on the current user's timeline — go to the current user's own profile
      return `/profile/${notif.user_id}`
    case 'friend_request':
      return '/friends'
    case 'friend_accept':
      return notif.actor?.id ? `/profile/${notif.actor.id}` : null
    case 'message':
      return notif.actor?.id ? `/messages/${notif.actor.id}` : null
    default:
      return null
  }
}

export default function NotifPanel({ onClose }) {
  const { user } = useAuthStore()
  const { markRead, count } = useNotifStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const markReadCalledRef = useRef(false)

  const { data: notifs, isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('notifications')
        .select('*, actor:actor_id(id, username, full_name, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  const markAllRead = useMutation({
    mutationFn: () => sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false),
    onSuccess: () => { markRead(); qc.invalidateQueries(['notifications']) },
  })

  // Mark all read 1 second after panel opens
  // Refetch notification list when a new notif arrives via realtime
  useEffect(() => {
    qc.invalidateQueries(['notifications', user?.id])
  }, [count, qc, user?.id])

  useEffect(() => {
    if (markReadCalledRef.current) return
    markReadCalledRef.current = true
    const timer = setTimeout(() => markAllRead.mutate(), 1500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleClick = (notif) => {
    const target = getNavTarget(notif)
    if (target) {
      navigate(target)
      onClose()
    }
  }

  const unreadCount = notifs?.filter(n => !n.is_read).length || 0

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed top-14 right-4 z-40 w-80 bg-white dark:bg-surface-900 rounded-2xl shadow-card-lg border border-surface-200 dark:border-white/10 overflow-hidden animate-fade-up">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-white/10">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell size={16} />
            Notifications
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-600 transition-colors px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/10">
                <Check size={13} /> Mark all read
              </button>
            )}
            <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[480px] overflow-y-auto divide-y divide-surface-100 dark:divide-white/5">
          {isLoading ? (
            <div className="p-3 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex gap-3 items-center p-1">
                  <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : !notifs?.length ? (
            <div className="py-14 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No notifications yet</p>
              <p className="text-xs text-gray-400 mt-1">We'll let you know when something happens</p>
            </div>
          ) : notifs.map(n => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.default
            const { icon: Icon, color, bg, label } = cfg
            const actorName = n.actor?.full_name ?? n.actor?.username ?? 'Someone'
            const navTarget = getNavTarget(n)

            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${navTarget ? 'cursor-pointer hover:bg-surface-50 dark:hover:bg-white/5' : ''} ${!n.is_read ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}`}
              >
                {/* Actor avatar with type icon badge */}
                <div className="relative flex-shrink-0">
                  <Avatar src={n.actor?.avatar_url} name={actorName} size={38} />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${bg} flex items-center justify-center border-2 border-white dark:border-surface-900`}>
                    <Icon size={10} className={color} />
                  </div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                    {label(actorName)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-2" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
