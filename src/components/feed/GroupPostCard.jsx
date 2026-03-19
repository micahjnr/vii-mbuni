import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users, Globe, Lock, MessageCircle, Share2, Bookmark, ChevronDown, Video as VideoIcon, Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import ReactionPicker from '@/components/ui/ReactionPicker'
import RichContent from '@/components/ui/RichContent'
import toast from 'react-hot-toast'
import clsx from 'clsx'

/**
 * GroupPostCard
 * Renders a group post in the main feed. Shows a group banner at the top with
 * a "Join Group" CTA for non-members. Supports likes, comments counter, share
 * and bookmark — all wired to the same DB tables as PostCard.
 *
 * Props:
 *   post        – post row with .profiles, .group (group row), .likes, .comments
 *   isMember    – boolean, whether the current user is already in the group
 */
export default function GroupPostCard({ post, isMember: initialMember }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const group = post.group
  const postProfile = post.profiles
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })

  const [reaction, setReaction]   = useState(() => post.user_liked?.[0]?.reaction_type ?? null)
  const [likeCount, setLikeCount] = useState(Number(post.likes?.[0]?.count ?? 0))
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked ?? false)
  const [isMember, setIsMember]   = useState(initialMember)
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText]   = useState('')
  const commentCount = (Number(post.comments?.[0]?.count ?? 0)) + (Number(post.comment_replies?.[0]?.count ?? 0))

  const videoRef = useRef(null)
  const [videoPoster, setVideoPoster] = useState(null)
  const [videoPlaying, setVideoPlaying] = useState(false)

  useEffect(() => {
    if (!post.video_url) return
    const vid = document.createElement('video')
    vid.src = post.video_url
    vid.crossOrigin = 'anonymous'
    vid.preload = 'metadata'
    vid.muted = true
    vid.playsInline = true
    const onMeta = () => { vid.currentTime = 0.5 }
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = vid.videoWidth  || 640
        canvas.height = vid.videoHeight || 360
        canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height)
        setVideoPoster(canvas.toDataURL('image/jpeg', 0.8))
      } catch (_) {}
      vid.src = ''
    }
    vid.addEventListener('loadedmetadata', onMeta)
    vid.addEventListener('seeked', onSeeked)
    vid.load()
    return () => { vid.removeEventListener('loadedmetadata', onMeta); vid.removeEventListener('seeked', onSeeked); vid.src = '' }
  }, [post.video_url])

  useEffect(() => {
    if (!post.video_url) return
    const el = videoRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      // No autoplay — pause on scroll out only
      if (!entry.isIntersecting) { el.pause(); setVideoPlaying(false) }
      else { el.pause(); setVideoPlaying(false) }
    }, { threshold: 0.6 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [post.video_url])

  // ── Join group ────────────────────────────────────────────────
  const joinMut = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
      })
      if (error) throw error
      // Award XP for joining a group
      try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: 5 }) } catch (_) {}
    },
    onSuccess: () => {
      setIsMember(true)
      qc.invalidateQueries(['groups'])
      toast.success(`Joined "${group.name}"! +5 XP 🎉`)
    },
    onError: (e) => toast.error(e?.message || 'Could not join group'),
  })

  // ── Reaction ──────────────────────────────────────────────────
  const reactionMut = useMutation({
    mutationFn: async next => {
      if (!next) {
        const { error } = await sb.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('likes').upsert(
          { post_id: post.id, user_id: user.id, reaction_type: next },
          { onConflict: 'post_id,user_id' }
        )
        if (error) throw error
        if (post.user_id !== user.id) {
          sb.from('notifications').insert({
            user_id: post.user_id, actor_id: user.id, type: 'like', reference_id: post.id, is_read: false,
          }).then(() => {}).catch(() => {})
        }
      }
    },
    onMutate: next => {
      const prev = reaction
      setReaction(next)
      setLikeCount(n => (!prev && next) ? n + 1 : (prev && !next) ? n - 1 : n)
      return { prev }
    },
    onError: (_, __, ctx) => {
      setReaction(ctx.prev)
      setLikeCount(n => (reaction && !ctx.prev) ? n - 1 : (!reaction && ctx.prev) ? n + 1 : n)
    },
  })

  // ── Bookmark ──────────────────────────────────────────────────
  const handleBookmark = async () => {
    const prev = bookmarked
    setBookmarked(v => !v)
    try {
      if (prev) {
        await sb.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', user.id)
      } else {
        await sb.from('bookmarks').upsert({ post_id: post.id, user_id: user.id }, { onConflict: 'user_id,post_id' })
        toast.success('Saved to bookmarks!')
      }
    } catch {
      setBookmarked(prev)
      toast.error('Failed to update bookmark')
    }
  }

  // ── Share ─────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`
    try { await navigator.share({ title: group?.name, text: post.content, url }) }
    catch { await navigator.clipboard.writeText(url); toast.success('Link copied!') }
  }

  // ── Post comment ──────────────────────────────────────────────
  const commentMut = useMutation({
    mutationFn: async text => {
      const { error } = await sb.from('comments').insert({
        post_id: post.id, user_id: user.id, content: text.trim(),
      })
      if (error) throw error
      if (post.user_id !== user.id) {
        sb.from('notifications').insert({
          user_id: post.user_id, actor_id: user.id, type: 'comment', reference_id: post.id, is_read: false,
        }).then(() => {}).catch(() => {})
      }
    },
    onSuccess: () => {
      setCommentText('')
      qc.invalidateQueries(['group-feed'])
      toast.success('Comment added!')
    },
    onError: e => toast.error('Comment failed: ' + (e?.message || String(e))),
  })

  if (!group) return null

  // Support both `privacy` text column (v5.8+) and legacy `is_private` boolean
  const isPrivate = group.privacy === 'private' || group.is_private === true

  return (
    <article className="post-card overflow-hidden">

      {/* ── Group banner ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-surface-100 dark:border-white/5">
        <button
          className="flex items-center gap-2.5 flex-1 min-w-0"
          onClick={() => navigate('/groups')}
        >
          {/* Group icon / emoji */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/40 dark:to-brand-800/40 flex items-center justify-center text-lg flex-shrink-0 border border-brand-200 dark:border-brand-500/20">
            {group.emoji || '👥'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{group.name}</span>
              {isPrivate
                ? <Lock size={11} className="text-gray-400 flex-shrink-0" />
                : <Globe size={11} className="text-gray-400 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Users size={11} />
              <span>{Number(Array.isArray(group.member_count) ? group.member_count?.[0]?.count : group.member_count) || Number(group.members?.[0]?.count ?? 0)} members</span>
              <span>·</span>
              <span className="text-brand-500 font-medium">Group post</span>
            </div>
          </div>
        </button>

        {/* Join / Joined CTA */}
        {isMember ? (
          <button
            onClick={() => navigate('/groups')}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 border border-surface-200 dark:border-white/10 hover:bg-surface-200 dark:hover:bg-white/15 transition-colors"
          >
            ✓ Joined
          </button>
        ) : (
          <button
            onClick={() => joinMut.mutate()}
            disabled={joinMut.isPending || isPrivate}
            className={clsx(
              'flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
              isPrivate
                ? 'bg-surface-100 dark:bg-white/5 text-gray-400 cursor-not-allowed border border-surface-200 dark:border-white/10'
                : 'btn-primary'
            )}
            title={isPrivate ? 'This group is private — find it in Groups to request access' : ''}
          >
            {joinMut.isPending ? 'Joining…' : isPrivate ? '🔒 Private' : '+ Join Group'}
          </button>
        )}
      </div>

      {/* ── Post author row ──────────────────────────────────── */}
      <div className="flex items-center gap-2.5 mb-2">
        <button onClick={() => navigate(`/profile/${postProfile?.id || post.user_id}`)}>
          <Avatar src={postProfile?.avatar_url} name={postProfile?.full_name} size={32} />
        </button>
        <div>
          <button
            className="font-semibold text-xs text-gray-800 dark:text-gray-200 hover:underline"
            onClick={() => navigate(`/profile/${postProfile?.id || post.user_id}`)}
          >
            {postProfile?.full_name}
          </button>
          <div className="text-[11px] text-gray-400">@{postProfile?.username} · {timeAgo}</div>
        </div>
      </div>

      {/* ── Post content ─────────────────────────────────────── */}
      <RichContent content={post.content} />

      {post.image_url && (
        <div className="rounded-xl overflow-hidden mb-3 bg-surface-100 dark:bg-surface-800">
          <img src={post.image_url} alt="Post" className="w-full object-cover max-h-80" loading="lazy" />
        </div>
      )}

      {post.video_url && (
        <div className="relative rounded-xl overflow-hidden mb-3 bg-black w-full" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            src={post.video_url}
            poster={videoPoster || undefined}
            controls
            loop
            preload="metadata"
            playsInline
            onPlay={() => setVideoPlaying(true)}
            onPause={() => setVideoPlaying(false)}
            className="w-full h-full object-cover"
            style={{ display: 'block' }}
          />
          {!videoPlaying && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
              <VideoIcon size={10} /> VIDEO
            </div>
          )}
          {!videoPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <Play size={24} className="text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>
      )}

      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.hashtags.map(tag => (
            <span key={tag} className="badge badge-brand text-xs">#{tag}</span>
          ))}
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 pt-1 border-t border-surface-100 dark:border-white/5">
        <ReactionPicker onReact={r => reactionMut.mutate(r)} currentReaction={reaction} count={likeCount} />

        <button
          onClick={() => setShowComments(v => !v)}
          className={clsx('reaction-btn', showComments && 'text-blue-500')}
        >
          <MessageCircle size={16} />
          {commentCount > 0 && <span>{commentCount}</span>}
          <span className="hidden sm:inline">Comment</span>
          <ChevronDown size={13} className={clsx('transition-transform duration-200', showComments && 'rotate-180')} />
        </button>

        <button onClick={handleShare} className="reaction-btn">
          <Share2 size={16} /><span className="hidden sm:inline">Share</span>
        </button>

        <button onClick={handleBookmark} className={clsx('reaction-btn ml-auto', bookmarked && 'text-amber-500')}>
          <Bookmark size={16} className={bookmarked ? 'fill-current' : ''} />
        </button>
      </div>

      {/* ── Inline comment box (collapsed by default) ────────── */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-surface-100 dark:border-white/5">
          <p className="text-xs text-gray-400 mb-2">
            Comments from group members only.{' '}
            {!isMember && (
              <button
                onClick={() => joinMut.mutate()}
                disabled={joinMut.isPending || isPrivate}
                className="text-brand-500 font-semibold hover:underline disabled:opacity-40"
              >
                Join to comment
              </button>
            )}
          </p>

          {isMember && (
            <div className="flex gap-2 items-start">
              <Avatar src={user?.user_metadata?.avatar_url} name={user?.user_metadata?.full_name} size={28} />
              <div className="flex-1 flex gap-2">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && commentText.trim() && commentMut.mutate(commentText)}
                  placeholder="Write a comment…"
                  className="flex-1 text-xs rounded-xl border border-surface-200 dark:border-white/10 bg-surface-50 dark:bg-white/5 px-3 py-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button
                  onClick={() => commentText.trim() && commentMut.mutate(commentText)}
                  disabled={!commentText.trim() || commentMut.isPending}
                  className="btn-primary px-3 py-2 text-xs self-start"
                >
                  {commentMut.isPending ? '…' : 'Post'}
                </button>
              </div>
            </div>
          )}

          {/* Prompt non-members to visit the group page for full thread */}
          {!isMember && !isPrivate && (
            <button
              onClick={() => navigate('/groups')}
              className="mt-2 text-xs text-brand-500 hover:text-brand-600 font-semibold"
            >
              View full discussion in group →
            </button>
          )}
        </div>
      )}
    </article>
  )
}
