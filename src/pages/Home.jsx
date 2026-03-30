import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import PostCard from '@/components/feed/PostCard'
import GroupPostCard from '@/components/feed/GroupPostCard'
import Avatar from '@/components/ui/Avatar'
import StoriesBar from '@/components/stories/StoriesBar'
import Leaderboard from '@/components/gamification/Leaderboard'
import CreatePostModal from '@/components/feed/CreatePostModal'
import TrendingTopics from '@/components/feed/TrendingTopics'
import PeopleYouMayKnow from '@/components/feed/PeopleYouMayKnow'
import { PostSkeleton, EmptyState } from '@/components/ui/PageLoader'
import XPBadge, { getLevelInfo } from '@/components/gamification/XPBadge'
import toast from 'react-hot-toast'
import { Trophy, Flame, Zap, ImageIcon, Smile, Clock, TrendingUp, Shuffle } from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 10

// Ranked feed: score = likes*3 + comments*2 + recency_decay
async function fetchFeed({ pageParam = 0, userId }) {
  if (!userId) throw new Error('Not authenticated')
  const from = pageParam * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data, error } = await sb
    .from('posts')
    .select(`
      id, user_id, content, image_url, images, audio_name, video_url,
      audience, mood, hashtags, poll_data, quoted_post_id, group_id,
      view_count, is_published, is_reel, created_at,
      profiles:user_id (id, username, full_name, avatar_url),
      group:group_id (id, name, emoji, privacy, is_private),
      likes(count),
      comments(count),
      comment_replies(count),
      user_liked:likes(user_id, reaction_type),
      is_bookmarked:bookmarks(user_id)
    `)
    .eq('is_published', true)
    .eq('is_reel', false)
    .eq('user_liked.user_id', userId)
    .eq('is_bookmarked.user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error

  // Client-side ranking: posts < 2h old always float to top via recency boost,
  // older posts ranked by engagement x time-decay.
  const scored = (data || []).map(p => {
    const { likes: rawLikes, comments: rawComments, comment_replies, ...rest } = p
    const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000
    const decay = Math.exp(-ageHours / 48)
    const likeCount = Number(rawLikes?.[0]?.count ?? 0)
    const commentCount = Number(rawComments?.[0]?.count ?? 0)
    const engagement = likeCount * 3 + commentCount * 2 + 1
    // Posts < 2h get a large bonus so they always rank above older posts
    const recencyBoost = ageHours < 2 ? 1000 / (ageHours + 0.1) : 0
    const score = engagement * decay + recencyBoost
    return {
      ...rest,
      _score: score,
      is_bookmarked: Array.isArray(p.is_bookmarked) && p.is_bookmarked.length > 0,
    }
  })
  scored.sort((a, b) => b._score - a._score)

  return { posts: scored, nextPage: data?.length === PAGE_SIZE ? pageParam + 1 : null }
}

// Fetch recent public-group posts for feed discovery (max 5, refreshed every 5 min)
async function fetchGroupFeed(userId) {
  if (!userId) return { posts: [], memberGroupIds: new Set() }

  // 1. Which groups is this user already in?
  const { data: memberships } = await sb
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  const memberGroupIds = new Set((memberships || []).map(m => m.group_id))

  // 2. Fetch recent posts from public groups
  const { data: posts, error } = await sb
    .from('posts')
    .select(`
      *,
      profiles:user_id (id, username, full_name, avatar_url),
      group:group_id (id, name, emoji, privacy, is_private, member_count:group_members(count)),
      likes(count),
      comments(count),
      comment_replies(count),
      user_liked:likes(user_id, reaction_type),
      is_bookmarked:bookmarks(user_id)
    `)
    .eq('is_published', true)
    .eq('is_reel', false)
    .not('group_id', 'is', null)
    .eq('user_liked.user_id', userId)
    .eq('is_bookmarked.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return { posts: [], memberGroupIds }

  // Only show public group posts (handle both privacy text col and legacy is_private bool)
  const publicGroupPosts = (posts || [])
    .filter(p => p.group && p.group.privacy !== 'private' && p.group.is_private !== true)
    .map(p => {
      const { likes, comments, comment_replies, ...rest } = p
      if (rest.group && Array.isArray(rest.group.member_count)) {
        rest.group = { ...rest.group, member_count: Number(rest.group.member_count?.[0]?.count ?? 0) }
      }
      return {
        ...rest,
        is_bookmarked: Array.isArray(p.is_bookmarked) && p.is_bookmarked.length > 0,
        _type: 'group_post',
      }
    })
    .slice(0, 5)

  return { posts: publicGroupPosts, memberGroupIds }
}

// Weekly challenge widget
function ChallengeWidget() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { data: challenge } = useQuery({
    queryKey: ['active-challenge'],
    queryFn: async () => {
      const { data } = await sb.from('weekly_challenges')
        .select('*, entries:challenge_entries(count)')
        .gte('ends_at', new Date().toISOString())
        .lte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
        .limit(1)
        .single()
      return data
    },
    staleTime: 300_000,
  })

  const { data: myEntry } = useQuery({
    queryKey: ['my-challenge-entry', challenge?.id, user?.id],
    queryFn: async () => {
      const { data } = await sb.from('challenge_entries')
        .select('id').eq('challenge_id', challenge.id).eq('user_id', user.id).maybeSingle()
      return data
    },
    enabled: !!challenge && !!user,
  })

  const joinMutation = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from('challenge_entries').insert({
        challenge_id: challenge.id, user_id: user.id,
      })
      if (error) throw error
      try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: challenge.xp_reward }) } catch(_) {}
    },
    onSuccess: () => {
      qc.invalidateQueries(['my-challenge-entry'])
      toast.success(`Challenge joined! +${challenge.xp_reward} XP 🎉`)
    },
    onError: () => toast.error('Failed to join challenge'),
  })

  if (!challenge) return null

  const entries = Number(challenge.entries?.[0]?.count ?? 0)
  const endsIn = formatDistanceToNow(new Date(challenge.ends_at), { addSuffix: true })

  return (
    <div className="card p-4 bg-gradient-to-br from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border-brand-200 dark:border-brand-500/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{challenge.emoji}</span>
            <span className="text-xs font-bold text-brand-500 uppercase tracking-wider">Weekly Challenge</span>
          </div>
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">{challenge.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{challenge.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>👥 {entries} joined</span>
            <span>⏰ Ends {endsIn}</span>
            <span className="text-brand-500 font-semibold">+{challenge.xp_reward} XP</span>
          </div>
        </div>
        {myEntry ? (
          <span className="badge bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 flex-shrink-0">✅ Joined</span>
        ) : (
          <button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
            Join
          </button>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-brand-200 dark:border-brand-500/20">
        <p className="text-xs text-gray-400">
          Post with <span className="text-brand-500 font-semibold">#{challenge.hashtag}</span> to participate
        </p>
      </div>
    </div>
  )
}

// XP Progress widget
function XPWidget({ profile }) {
  if (!profile) return null
  const info = getLevelInfo(profile.xp || 0)
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-brand-500" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Your Progress</span>
        </div>
        <span className="text-xs text-gray-400">{profile.xp || 0} XP</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{info.emoji}</span>
        <span className="font-bold text-sm text-gray-900 dark:text-white">{info.label}</span>
        {info.nextXp && (
          <span className="text-xs text-gray-400 ml-auto">{info.nextXp - (profile.xp || 0)} XP to next level</span>
        )}
      </div>
      <div className="w-full h-2 bg-surface-200 dark:bg-white/10 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-700', info.color)}
          style={{ width: `${info.progress}%` }} />
      </div>
      {profile.streak_days > 0 && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-surface-100 dark:border-white/5">
          <Flame size={14} className="text-orange-500" />
          <span className="text-xs font-semibold text-orange-500">{profile.streak_days} day streak!</span>
          <span className="text-xs text-gray-400 ml-auto">Keep it up 💪</span>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { user, profile } = useAuthStore()
  const qc = useQueryClient()
  const observerRef = useRef(null)
  const { search } = useLocation()

  const [quotePost, setQuotePost] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [feedMode, setFeedMode] = useState('smart') // 'smart' | 'recent' | 'random'

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError,
  } = useInfiniteQuery({
    queryKey: ['feed', user?.id],
    queryFn: ({ pageParam }) => fetchFeed({ pageParam, userId: user.id }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: !!user,
  })

  // Group posts discovery feed
  const { data: groupFeedData } = useQuery({
    queryKey: ['group-feed', user?.id],
    queryFn: () => fetchGroupFeed(user.id),
    enabled: !!user,
    staleTime: 300_000, // 5 min
  })
  const groupPosts = groupFeedData?.posts || []
  const memberGroupIds = groupFeedData?.memberGroupIds || new Set()

  const bottomRef = useCallback(node => {
    if (!node) return
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { threshold: 0.1 })
    observerRef.current.observe(node)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Merge group posts into the regular feed at a natural interval.
  const rawPosts = data?.pages.flatMap(p => p.posts) || []

  const posts = (() => {
    // First merge group posts at every 4th slot
    let base = rawPosts
    if (groupPosts.length) {
      const seen = new Set(rawPosts.map(p => p.id))
      const freshGroup = groupPosts.filter(p => !seen.has(p.id))
      if (freshGroup.length) {
        const merged = []
        let gi = 0
        rawPosts.forEach((post, i) => {
          merged.push(post)
          if ((i + 1) % 4 === 0 && gi < freshGroup.length) merged.push(freshGroup[gi++])
        })
        while (gi < freshGroup.length) merged.push(freshGroup[gi++])
        base = merged
      }
    }

    // Apply feed mode
    if (feedMode === 'recent') {
      // Pure chronological — newest first
      return [...base].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    if (feedMode === 'random') {
      // Fisher-Yates shuffle — completely random each refresh
      const arr = [...base]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }

    // 'smart' (default) — already sorted by engagement+recency score from fetchFeed
    return base
  })()

  // Scroll to specific post when opened via push notification deep-link /?post=<id>
  useEffect(() => {
    const targetId = new URLSearchParams(search).get('post')
    if (!targetId || !posts.length) return
    const t = setTimeout(() => {
      const el = document.getElementById('post-' + targetId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
    return () => clearTimeout(t)
  }, [search, posts.length])

  return (
    <div className="animate-fade-in">
      <div className="flex gap-6 items-start">
        {/* Main feed */}
        <div className="flex-1 min-w-0 space-y-4">
          <StoriesBar />

          {/* Compose box */}
          <div className="card p-3 flex items-center gap-3 cursor-pointer hover:bg-surface-50 dark:hover:bg-white/5 transition-colors"
            onClick={() => setComposeOpen(true)}>
            <Avatar src={profile?.avatar_url} name={profile?.full_name} size={38} />
            <div className="flex-1 bg-surface-100 dark:bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-400 select-none">
              What's on your mind, {profile?.full_name?.split(' ')[0] || 'there'}?
            </div>
            <div className="flex items-center gap-1.5 text-gray-400">
              <ImageIcon size={18} className="text-green-500" />
              <Smile size={18} className="text-amber-400" />
            </div>
          </div>
          <ChallengeWidget />

          {/* Feed mode toggle */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Feed</span>
            {[
              { id: 'smart',  icon: TrendingUp, label: 'Smart'  },
              { id: 'recent', icon: Clock,       label: 'Recent' },
              { id: 'random', icon: Shuffle,     label: 'Random' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setFeedMode(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={feedMode === id
                  ? { background: 'var(--brand,#7c3aed)', color: '#fff' }
                  : { background: 'var(--color-surface-100,#f3f4f6)', color: 'var(--color-gray-500,#6b7280)' }
                }>
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-4">{[1,2,3].map(i => <PostSkeleton key={i} />)}</div>
          ) : isError ? (
            <EmptyState icon="⚠️" title="Could not load feed" description="Check your connection and try again."
              action={<button onClick={() => qc.invalidateQueries(['feed'])} className="btn-primary">Retry</button>} />
          ) : posts.length === 0 ? (
            <EmptyState icon="✨" title="Your feed is empty" description="Follow people or create a post to get started." />
          ) : (
            <>
              <div className="space-y-4">
                {posts.map((post, i) => (
                  <div key={post.id} className="animate-fade-up"
                    style={{ animationDelay: `${Math.min(i,5)*0.05}s`, animationFillMode: 'both' }}>
                    <div id={'post-' + post.id}>
                      {post._type === 'group_post' ? (
                        <GroupPostCard post={post} isMember={memberGroupIds.has(post.group_id)} />
                      ) : (
                        <PostCard post={post} onQuote={(p) => setQuotePost(p)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div ref={bottomRef} className="h-8 flex items-center justify-center">
                {isFetchingNextPage && (
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"
                        style={{ animationDelay: `${i*0.15}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right sidebar — desktop only */}
        <div className="hidden xl:flex flex-col gap-4 w-72 flex-shrink-0">
          <XPWidget profile={profile} />
          <PeopleYouMayKnow />
          <TrendingTopics />
          <Leaderboard />
        </div>
      </div>

      {composeOpen && <CreatePostModal onClose={() => { setComposeOpen(false); qc.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' }) }} />}
      {quotePost && <CreatePostModal onClose={() => { setQuotePost(null); qc.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' }) }} quotedPost={quotePost} />}
    </div>
  )
}
