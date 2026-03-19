import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import { Skeleton } from '@/components/ui/PageLoader'
import { TrendingUp, Heart, MessageCircle, Users, Zap, Flame, Trophy, Video as VideoIcon } from 'lucide-react'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import XPBadge from '@/components/gamification/XPBadge'
import BadgeDisplay, { BADGES } from '@/components/gamification/BadgeDisplay'
import Leaderboard from '@/components/gamification/Leaderboard'
import clsx from 'clsx'

const RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

export default function Analytics() {
  const { user, profile } = useAuthStore()
  const [rangeDays, setRangeDays] = useState(7)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', user?.id, rangeDays],
    queryFn: async () => {
      const { data: posts } = await sb
        .from('posts').select('id, created_at, content, video_url')
        .eq('user_id', user.id).eq('is_published', true)
        .order('created_at', { ascending: false })

      const postIds = (posts || []).map(p => p.id)

      const [likesRes, commentsRes, friendsRes] = await Promise.all([
        postIds.length
          ? sb.from('likes').select('created_at', { count: 'exact' }).in('post_id', postIds)
          : Promise.resolve({ count: 0 }),
        postIds.length
          ? sb.from('comments').select('created_at', { count: 'exact' }).in('post_id', postIds)
          : Promise.resolve({ count: 0 }),
        sb.from('friends').select('created_at', { count: 'exact' })
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`).eq('status', 'accepted'),
      ])

      const days = eachDayOfInterval({ start: subDays(new Date(), rangeDays - 1), end: new Date() })
      const postsByDay = days.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const count = (posts || []).filter(p => p.created_at?.startsWith(dateStr)).length
        return { label: format(day, 'EEE'), count }
      })
      const maxPosts = Math.max(...postsByDay.map(d => d.count), 1)

      // Top post by likes
      let topPost = null
      if (postIds.length) {
        const { data: topLikes } = await sb
          .from('likes').select('post_id')
          .in('post_id', postIds)
        const likeCounts = {}
        ;(topLikes || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1 })
        const topId = Object.entries(likeCounts).sort((a,b) => b[1]-a[1])[0]?.[0]
        if (topId) topPost = { post: (posts || []).find(p => p.id === topId), likes: likeCounts[topId] }
      }

      return {
        totalPosts: posts?.length || 0,
        videoPosts: (posts || []).filter(p => p.video_url).length,
        totalLikes: likesRes.count || 0,
        totalComments: commentsRes.count || 0,
        totalFriends: friendsRes.count || 0,
        postsByDay, maxPosts,
        recentPosts: (posts || []).slice(0, 5),
        topPost,
      }
    },
    enabled: !!user,
  })

  // Compute earned badges from stats
  const computedBadges = () => {
    if (!data) return []
    const earned = []
    if (data.totalPosts >= 1)  earned.push('first_post')
    if (data.totalPosts >= 10) earned.push('ten_posts')
    if (data.totalPosts >= 50) earned.push('fifty_posts')
    if (data.totalLikes >= 1)  earned.push('first_like')
    if (data.totalLikes >= 100) earned.push('hundred_likes')
    if (data.totalFriends >= 1) earned.push('first_friend')
    if (data.totalFriends >= 10) earned.push('ten_friends')
    if (data.totalComments >= 1) earned.push('first_comment')
    if ((profile?.streak_days || 0) >= 3)  earned.push('streak_3')
    if ((profile?.streak_days || 0) >= 7)  earned.push('streak_7')
    if ((profile?.streak_days || 0) >= 30) earned.push('streak_30')
    if (profile?.bio && profile?.avatar_url) earned.push('profile_complete')
    return earned
  }

  const earnedBadges = computedBadges()
  const xp = profile?.xp || 0

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <span className="text-4xl">⚠️</span>
      <p className="font-semibold text-gray-700 dark:text-gray-200">Could not load analytics</p>
      <p className="text-sm text-gray-400">Check your connection and try again.</p>
    </div>
  )

  const stats = [
    { label: 'Total Posts',  value: data?.totalPosts,    icon: Zap,           color: 'text-brand-500',  bg: 'bg-brand-50 dark:bg-brand-500/10' },
    { label: 'Videos',       value: data?.videoPosts,    icon: VideoIcon,     color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
    { label: 'Total Likes',  value: data?.totalLikes,    icon: Heart,         color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-500/10' },
    { label: 'Comments',     value: data?.totalComments, icon: MessageCircle, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-500/10' },
    { label: 'Friends',      value: data?.totalFriends,  icon: Users,         color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-500/10' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Analytics</h1>
        <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRangeDays(r.days)}
              className={clsx('px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                rangeDays === r.days
                  ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card'
                  : 'text-gray-500 dark:text-gray-400'
              )}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* XP / Level card */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center">
            <Zap size={18} className="text-brand-500" />
          </div>
          <div>
            <div className="font-bold text-gray-900 dark:text-white">Your Level</div>
            {isLoading ? <Skeleton className="h-5 w-32" /> : <XPBadge xp={xp} showProgress />}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><Flame size={14} className="text-orange-400" /> {profile?.streak_days || 0} day streak</span>
          <span className="flex items-center gap-1"><Trophy size={14} className="text-amber-400" /> {earnedBadges.length}/{BADGES.length} badges</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            {isLoading ? <Skeleton className="h-7 w-16 mb-1" /> : (
              <div className="text-2xl font-extrabold text-gray-900 dark:text-white">{value ?? '—'}</div>
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* Top post */}
      {data?.topPost && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🏆</span>
            <h2 className="font-bold text-sm text-gray-900 dark:text-white">Your top post</h2>
            <span className="ml-auto badge badge-brand">{data.topPost.likes} likes</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
            {data.topPost.post?.content || '(no caption)'}
          </p>
          {data.topPost.post?.created_at && (
            <p className="text-xs text-gray-400 mt-2">
              {format(new Date(data.topPost.post.created_at), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      )}

      {/* Posts chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-brand-500" />
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">Posts — Last {rangeDays} Days</h2>
        </div>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <div className="flex items-end gap-2 h-32">
            {data?.postsByDay.map(({ label, count }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center" style={{ height: 96 }}>
                  <div className="w-full rounded-t-lg bg-brand-500 transition-all duration-500"
                    style={{ height: `${(count / data.maxPosts) * 100}%`, minHeight: count > 0 ? 4 : 0 }} />
                </div>
                <span className="text-[10px] text-gray-400 font-medium">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} className="text-amber-400" />
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">Achievements</h2>
          <span className="ml-auto text-xs text-gray-400">{earnedBadges.length}/{BADGES.length} earned</span>
        </div>
        {isLoading ? <Skeleton className="h-32 w-full" /> : <BadgeDisplay earnedBadgeIds={earnedBadges} />}
      </div>

      {/* Leaderboard */}
      <Leaderboard />
    </div>
  )
}
