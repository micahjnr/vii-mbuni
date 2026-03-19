import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle, Share2, MoreHorizontal, Trash2, Bookmark,
  ChevronDown, CornerDownRight, Quote, Flag, Eye, Pencil, Check, X,
  Sparkles, Loader2, Video as VideoIcon, Play,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import ReactionPicker from '@/components/ui/ReactionPicker'
import RichContent from '@/components/ui/RichContent'
import MentionTextarea from '@/components/ui/MentionTextarea'
import { MoodTag } from '@/components/ui/MoodTag'
import PollWidget from '@/components/ui/PollWidget'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { askGroq } from '@/lib/groq'

function QuotePreview({ quotedPost }) {
  if (!quotedPost) return null
  return (
    <div className="border border-surface-200 dark:border-white/10 rounded-xl p-3 mb-3 bg-surface-50 dark:bg-white/5">
      <div className="flex items-center gap-2 mb-1">
        <Avatar src={quotedPost.profiles?.avatar_url} name={quotedPost.profiles?.full_name} size={18} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {quotedPost.profiles?.full_name}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
        {quotedPost.content || '(no caption)'}
      </p>
    </div>
  )
}

function Comment({ comment, postId, postOwnerId, user, myProfile, depth = 0, onCountChange }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyMentions, setReplyMentions] = useState([])
  const [liked, setLiked] = useState(comment.user_has_liked ?? false)
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content)
  const [menuOpen, setMenuOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const isMyComment = comment.user_id === user?.id
  const isPostOwner = postOwnerId === user?.id
  const canEdit = isMyComment
  const canDelete = isMyComment || isPostOwner

  const likeMut = useMutation({
    mutationFn: async () => {
      const op = liked
        ? sb.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', user.id)
        : sb.from('comment_likes').upsert({ comment_id: comment.id, user_id: user.id }, { onConflict: 'comment_id,user_id' })
      const { error } = await op
      if (error) throw error
    },
    onMutate: () => {
      const prev = liked
      setLiked(!prev)
      setLikeCount(n => prev ? n - 1 : n + 1)
      return { prev }
    },
    onError: (_, __, ctx) => {
      setLiked(ctx.prev)
      setLikeCount(n => ctx.prev ? n + 1 : n - 1)
    },
  })

  const deleteMut = useMutation({
    mutationFn: async () => {
      const table = depth > 0 ? 'comment_replies' : 'comments'
      const { error } = await sb.from(table).delete().eq('id', comment.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['comments', postId])
      onCountChange?.()
      toast.success('Comment deleted')
    },
    onError: e => toast.error('Delete failed: ' + (e?.message || String(e))),
  })

  const editMut = useMutation({
    mutationFn: async text => {
      const table = depth > 0 ? 'comment_replies' : 'comments'
      const { error } = await sb.from(table).update({ content: text.trim() }).eq('id', comment.id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries(['comments', postId])
      toast.success('Comment updated')
    },
    onError: e => toast.error('Edit failed: ' + (e?.message || String(e))),
  })

  const replyMut = useMutation({
    mutationFn: async text => {
      const { error } = await sb.from('comment_replies').insert({
        comment_id: comment.id, post_id: postId, user_id: user.id, content: text.trim(),
      })
      if (error) throw error
      const rows = []
      if (comment.user_id !== user.id)
        rows.push({ user_id: comment.user_id, actor_id: user.id, type: 'reply', reference_id: postId, is_read: false })
      replyMentions.filter(id => id !== user.id).forEach(id =>
        rows.push({ user_id: id, actor_id: user.id, type: 'mention', reference_id: postId, is_read: false })
      )
      if (rows.length) sb.from('notifications').insert(rows).then(() => {}).catch(() => {})
    },
    onSuccess: () => {
      setReplyText(''); setReplyMentions([]); setReplyOpen(false)
      qc.invalidateQueries(['comments', postId])
      onCountChange?.()
    },
    onError: e => toast.error('Reply failed: ' + (e?.message || String(e))),
  })

  return (
    <div className={clsx('flex gap-2 items-start', depth > 0 && 'ml-8 mt-1')}>
      <button className="shrink-0" onClick={() => navigate(`/profile/${comment.profiles?.id || comment.user_id}`)}>
        <Avatar src={comment.profiles?.avatar_url} name={comment.profiles?.full_name} size={depth > 0 ? 24 : 28} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="bg-surface-50 dark:bg-white/5 rounded-xl px-3 py-2">
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <button className="font-semibold text-xs text-gray-800 dark:text-gray-200 hover:underline text-left"
              onClick={() => navigate(`/profile/${comment.profiles?.id || comment.user_id}`)}>
              {comment.profiles?.full_name}
            </button>
            {(canEdit || canDelete) && !editing && (
              <div className="relative shrink-0">
                <button onClick={() => setMenuOpen(v => !v)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <MoreHorizontal size={14} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-7 z-30 bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-200 dark:border-white/10 overflow-hidden min-w-[110px]">
                      {canEdit && (
                        <button onClick={() => { setEditing(true); setMenuOpen(false) }}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-surface-100 dark:hover:bg-white/10 transition-colors">
                          <Pencil size={12} /> Edit
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { deleteMut.mutate(); setMenuOpen(false) }} disabled={deleteMut.isPending}
                          className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50">
                          <Trash2 size={12} /> {deleteMut.isPending ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {editing ? (
            <div className="flex gap-1.5 items-start mt-1">
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} autoFocus
                className="flex-1 text-xs rounded-lg border border-surface-200 dark:border-white/10 bg-white dark:bg-surface-800 px-2.5 py-1.5 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400" />
              <div className="flex flex-col gap-1">
                <button onClick={() => editText.trim() && editMut.mutate(editText)} disabled={!editText.trim() || editMut.isPending}
                  className="p-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors">
                  <Check size={12} />
                </button>
                <button onClick={() => { setEditing(false); setEditText(comment.content) }}
                  className="p-1.5 rounded-lg bg-surface-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-surface-300 dark:hover:bg-white/20 transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            <RichContent content={comment.content} className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[10px] text-gray-400">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          <button onClick={() => likeMut.mutate()}
            className={clsx('flex items-center gap-1 text-[11px] font-semibold transition-colors', liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400')}>
            ❤️ {likeCount > 0 && likeCount} Like
          </button>
          {depth === 0 && (
            <button onClick={() => setReplyOpen(v => !v)}
              className="text-[11px] font-semibold text-gray-400 hover:text-brand-500 transition-colors flex items-center gap-1">
              <CornerDownRight size={11} /> Reply
            </button>
          )}
          <button onClick={async () => {
            setAiLoading(true)
            try {
              const s = await askGroq(`Write a short reply to: "${comment.content}". Max 1-2 sentences.`)
              setReplyOpen(true); setReplyText(s)
            } catch (e) { toast.error(e.message) }
            finally { setAiLoading(false) }
          }} disabled={aiLoading}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-40">
            {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} AI Reply
          </button>
        </div>
        {replyOpen && (
          <div className="flex gap-2 mt-2 ml-1 items-start">
            <Avatar src={myProfile?.avatar_url} name={myProfile?.full_name} size={22} />
            <div className="flex-1 flex gap-1.5">
              <MentionTextarea value={replyText} onChange={setReplyText} onMentionsChange={setReplyMentions}
                placeholder={`Reply to ${comment.profiles?.full_name?.split(' ')[0]}…`} rows={1} className="flex-1 text-xs py-1.5" />
              <button onClick={() => replyText.trim() && replyMut.mutate(replyText)} disabled={!replyText.trim() || replyMut.isPending}
                className="btn-primary px-2.5 py-1.5 text-xs self-start">
                {replyMut.isPending ? '…' : 'Reply'}
              </button>
            </div>
          </div>
        )}
        {comment.replies?.length > 0 && (
          <div className="mt-1 space-y-2">
            {comment.replies.map(reply => (
              <Comment key={reply.id} comment={reply} postId={postId} postOwnerId={postOwnerId}
                user={user} myProfile={myProfile} depth={1} onCountChange={onCountChange} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PostCard({ post, onQuote, autoOpenComments = false }) {
  const { user, profile: myProfile } = useAuthStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const articleRef = useRef(null)
  const viewedRef = useRef(false)
  const videoRef   = useRef(null)
  const [videoPoster, setVideoPoster] = useState(null)
  const [videoPlaying, setVideoPlaying] = useState(false)

  // Extract first-frame poster thumbnail from video
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
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('seeked', onSeeked)
      vid.src = ''
    }
  }, [post.video_url])

  // Pause video when scrolled out of view (no autoplay — user must tap to play)
  useEffect(() => {
    if (!post.video_url) return
    const el = videoRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        el.pause()
        setVideoPlaying(false)
      }
      // No autoplay on scroll-in — user taps to start
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [post.video_url])

  const [showComments, setShowComments] = useState(autoOpenComments)
  const [commentText, setCommentText] = useState('')
  const [commentMentions, setCommentMentions] = useState([])
  const [aiCommentLoading, setAiCommentLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked ?? false)
  const [viewCount, setViewCount] = useState(post.view_count ?? 0)
  const [postEditing, setPostEditing] = useState(false)
  const [postEditText, setPostEditText] = useState(post.content || '')
  const [postEditAudience, setPostEditAudience] = useState(post.audience || 'public')
  const [reaction, setReaction] = useState(() => post.user_liked?.[0]?.reaction_type ?? null)
  const [likeCount, setLikeCount] = useState(Number(post.likes?.[0]?.count ?? 0))
  const [tldr, setTldr] = useState(null)
  const [tldrLoading, setTldrLoading] = useState(false)
  const [translation, setTranslation] = useState(null)   // { lang, text }
  const [translating, setTranslating] = useState(false)
  const [totalCommentCount, setTotalCommentCount] = useState(
    (Number(post.comments?.[0]?.count ?? 0)) + (Number(post.comment_replies?.[0]?.count ?? 0))
  )

  const isOwn = post.user_id === user?.id
  const postProfile = post.profiles
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
  const poll = post.poll_data
    ? (typeof post.poll_data === 'string' ? JSON.parse(post.poll_data) : post.poll_data)
    : null

  const refreshCount = useCallback(async () => {
    try {
      const [{ count: a }, { count: b }] = await Promise.all([
        sb.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
        sb.from('comment_replies').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
      ])
      setTotalCommentCount((a ?? 0) + (b ?? 0))
    } catch (_) {}
  }, [post.id])

  useEffect(() => { refreshCount() }, [refreshCount])

  useEffect(() => {
    const el = articleRef.current
    if (!el || viewedRef.current) return
    const obs = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && !viewedRef.current) {
        viewedRef.current = true
        obs.disconnect()
        try {
          const { data, error } = await sb.rpc('increment_view_count', { post_id: post.id })
            .select('view_count').single()
          if (!error && data?.view_count) setViewCount(data.view_count)
        } catch (_) {}
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [post.id, post.view_count])

  const { data: quotedPost } = useQuery({
    queryKey: ['post', post.quoted_post_id],
    queryFn: async () => {
      const { data } = await sb.from('posts')
        .select('*, profiles:user_id(id, username, full_name, avatar_url)')
        .eq('id', post.quoted_post_id).single()
      return data
    },
    enabled: !!post.quoted_post_id,
  })

  const { data: rawComments, isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', post.id],
    queryFn: async () => {
      const [{ data: topLevel }, { data: replies }] = await Promise.all([
        sb.from('comments').select('*, profiles:user_id(id, username, full_name, avatar_url)')
          .eq('post_id', post.id).order('created_at', { ascending: true }).limit(50),
        sb.from('comment_replies').select('*, profiles:user_id(id, username, full_name, avatar_url)')
          .eq('post_id', post.id).order('created_at', { ascending: true }).limit(100),
      ])
      setTotalCommentCount((topLevel?.length ?? 0) + (replies?.length ?? 0))
      return { topLevel: topLevel || [], replies: replies || [] }
    },
    enabled: showComments,
    staleTime: 0,
  })

  const comments = rawComments
    ? rawComments.topLevel.map(c => ({ ...c, replies: rawComments.replies.filter(r => r.comment_id === c.id) }))
    : []

  const reactionMut = useMutation({
    mutationFn: async next => {
      if (!next) {
        const { error } = await sb.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('likes').upsert(
          { post_id: post.id, user_id: user.id, reaction_type: next }, { onConflict: 'post_id,user_id' }
        )
        if (error) throw error
        if (post.user_id !== user.id)
          sb.from('notifications').insert({ user_id: post.user_id, actor_id: user.id, type: 'like', reference_id: post.id, is_read: false, extra_data: { preview: (post.content || '').slice(0, 60), isVideo: !!post.video_url } }).then(() => {}).catch(() => {})
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

  const deletePostMut = useMutation({
    mutationFn: () => sb.from('posts').delete().eq('id', post.id),
    onSuccess: () => { qc.invalidateQueries(['feed']); toast.success('Post deleted') },
    onError: () => toast.error('Failed to delete post'),
  })

  const editPostMut = useMutation({
    mutationFn: async () => {
      const hashtags = [...postEditText.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase())
      const { error } = await sb.from('posts').update({ content: postEditText.trim(), audience: postEditAudience, hashtags }).eq('id', post.id)
      if (error) throw error
    },
    onSuccess: () => { setPostEditing(false); qc.invalidateQueries(['feed']); toast.success('Post updated!') },
    onError: () => toast.error('Failed to update post'),
  })

  const commentMut = useMutation({
    mutationFn: async text => {
      const { error } = await sb.from('comments').insert({ post_id: post.id, user_id: user.id, content: text.trim() })
      if (error) throw error
      const rows = []
      if (post.user_id !== user.id)
        rows.push({ user_id: post.user_id, actor_id: user.id, type: 'comment', reference_id: post.id, is_read: false, extra_data: { preview: (post.content || '').slice(0, 60), isVideo: !!post.video_url } })
      commentMentions.filter(id => id !== user.id).forEach(id =>
        rows.push({ user_id: id, actor_id: user.id, type: 'mention', reference_id: post.id, is_read: false })
      )
      if (rows.length) sb.from('notifications').insert(rows).then(() => {}).catch(() => {})
    },
    onSuccess: () => { setCommentText(''); setCommentMentions([]); qc.invalidateQueries(['comments', post.id]); refreshCount() },
    onError: e => toast.error('Comment failed: ' + (e?.message || String(e))),
  })

  const submitComment = useCallback(() => {
    if (commentText.trim()) commentMut.mutate(commentText)
  }, [commentText, commentMut])

  const handleBookmark = async () => {
    const prev = bookmarked
    setBookmarked(v => !v)
    try {
      if (prev) {
        const { error } = await sb.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('bookmarks').upsert({ post_id: post.id, user_id: user.id }, { onConflict: 'user_id,post_id' })
        if (error) throw error
        toast.success('Saved to bookmarks!')
      }
    } catch {
      setBookmarked(prev) // revert on error
      toast.error('Failed to update bookmark')
    }
  }

  const [shareOpen, setShareOpen] = useState(false)
  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Vii-Mbuni Post', text: post.content, url }); return }
      catch (e) { if (e.name === 'AbortError') return }
    }
    setShareOpen(true)
  }
  const copyLink = async () => {
    const url = `${window.location.origin}/post/${post.id}`
    await navigator.clipboard.writeText(url)
    toast.success('Link copied!')
    setShareOpen(false)
  }
  const shareWhatsApp = () => {
    const url = `${window.location.origin}/post/${post.id}`
    window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank')
    setShareOpen(false)
  }

  const handleReport = async reason => {
    await sb.from('reports').insert({ reporter_id: user.id, post_id: post.id, reason }).catch(() => {})
    toast.success("Post reported. We'll review it shortly.")
    setReportOpen(false)
  }

  const groupName = post.group?.name || post.group_name
  const groupEmoji = post.group?.emoji || '👥'

  return (
    <article className="post-card" ref={articleRef}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar — shows group icon if group post, else author avatar */}
          {groupName ? (
            <button
              onClick={e => { e.stopPropagation(); navigate('/groups') }}
              className="flex-shrink-0"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xl shadow-sm">
                {groupEmoji}
              </div>
            </button>
          ) : (
            <button className="flex-shrink-0" onClick={() => navigate(`/profile/${postProfile?.id || post.user_id}`)}>
              <Avatar src={postProfile?.avatar_url} name={postProfile?.full_name} size={44} />
            </button>
          )}

          <div className="text-left min-w-0 flex-1">
            {groupName ? (
              <>
                {/* Group name — big and prominent */}
                <button
                  onClick={e => { e.stopPropagation(); navigate('/groups') }}
                  className="font-bold text-base text-gray-900 dark:text-white hover:text-brand-500 transition-colors leading-tight block truncate"
                >
                  {groupName}
                </button>
                {/* Author + time — small below */}
                <button
                  onClick={() => navigate(`/profile/${postProfile?.id || post.user_id}`)}
                  className="flex items-center gap-1 mt-0.5"
                >
                  <Avatar src={postProfile?.avatar_url} name={postProfile?.full_name} size={16} />
                  <span className="text-xs text-gray-400 hover:underline truncate">
                    {postProfile?.full_name} · {timeAgo}
                    {post.audience === 'friends' && ' · 👥'}
                    {post.audience === 'private' && ' · 🔒'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate(`/profile/${postProfile?.id || post.user_id}`)}>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white hover:underline">{postProfile?.full_name}</div>
                </button>
                <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                  @{postProfile?.username} · {timeAgo}
                  {post.audience === 'friends' && <span>· 👥</span>}
                  {post.audience === 'private' && <span>· 🔒</span>}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {post.mood && <MoodTag mood={post.mood} />}
          <div className="relative">
            <button onClick={() => { setMenuOpen(v => !v); setReportOpen(false) }} className="btn-icon text-gray-400">
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 bg-white dark:bg-surface-800 rounded-xl shadow-card-lg border border-surface-200 dark:border-white/10 w-44 overflow-hidden">
                  {isOwn ? (
                    <>
                      <button onClick={() => { setPostEditing(true); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-surface-100 dark:hover:bg-white/10 transition-colors">
                        <Pencil size={15} /> Edit
                      </button>
                      <button onClick={() => { deletePostMut.mutate(); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 size={15} /> Delete
                      </button>
                    </>
                  ) : (
                    <>
                      {onQuote && (
                        <button onClick={() => { onQuote(post); setMenuOpen(false) }}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-surface-100 dark:hover:bg-white/10 transition-colors">
                          <Quote size={15} /> Quote Post
                        </button>
                      )}
                      <button onClick={() => { setReportOpen(true); setMenuOpen(false) }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors">
                        <Flag size={15} /> Report Post
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {reportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setReportOpen(false)} />
                <div className="absolute right-0 top-9 z-20 bg-white dark:bg-surface-800 rounded-xl shadow-card-lg border border-surface-200 dark:border-white/10 w-52 overflow-hidden">
                  <div className="px-4 py-2 text-xs font-bold text-gray-500 border-b border-surface-100 dark:border-white/10">Why are you reporting?</div>
                  {['Spam', 'Harassment', 'Misinformation', 'Inappropriate content', 'Other'].map(r => (
                    <button key={r} onClick={() => handleReport(r)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-surface-100 dark:hover:bg-white/10 transition-colors">{r}</button>
                  ))}
                  <button onClick={() => setReportOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:bg-surface-100 dark:hover:bg-white/10 border-t border-surface-100 dark:border-white/10 transition-colors">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {post.quoted_post_id && <QuotePreview quotedPost={quotedPost} />}

      {postEditing ? (
        <div className="mb-3 space-y-2">
          <textarea value={postEditText} onChange={e => setPostEditText(e.target.value)} rows={4} autoFocus
            className="w-full text-sm rounded-xl border border-surface-200 dark:border-white/10 bg-white dark:bg-surface-800 px-3 py-2.5 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <div className="flex items-center justify-between gap-2">
            <select value={postEditAudience} onChange={e => setPostEditAudience(e.target.value)}
              className="text-xs rounded-lg border border-surface-200 dark:border-white/10 bg-white dark:bg-surface-800 px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none">
              <option value="public">🌎 Public</option>
              <option value="friends">👥 Friends</option>
              <option value="private">🔒 Private</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => { setPostEditing(false); setPostEditText(post.content || '') }}
                className="px-3 py-1.5 text-xs rounded-lg bg-surface-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-white/20 transition-colors">Cancel</button>
              <button onClick={() => postEditText.trim() && editPostMut.mutate()} disabled={!postEditText.trim() || editPostMut.isPending}
                className="px-3 py-1.5 text-xs rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {editPostMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <RichContent content={post.content} />
      )}

      {poll && <PollWidget poll={poll} postId={post.id} />}

      {post.image_url && (
        <div className="rounded-xl overflow-hidden mb-3 bg-surface-100 dark:bg-surface-800 min-h-[120px]">
          <img src={post.image_url} alt="Post" className="w-full object-cover max-h-96" loading="lazy" decoding="async" />
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
          {/* 🎬 badge — shown when paused */}
          {!videoPlaying && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full pointer-events-none">
              <VideoIcon size={10} /> VIDEO
            </div>
          )}
          {/* Tap-to-play overlay — only shown when paused and not interacted */}
          {!videoPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <Play size={24} className="text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Translate — always shown */}
      {!postEditing && post.content && (
        <div className="mb-2">
          {translation ? (
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3 py-2.5 animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  🌍 {translation.lang}
                </span>
                <button onClick={() => setTranslation(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{translation.text}</p>
            </div>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: '🇬🇧 English',  lang: 'English'  },
                { label: '🇳🇬 Hausa',    lang: 'Hausa'    },
                { label: '🔤 Zaar',      lang: 'Zaar'     },
              ].map(({ label, lang }) => (
                <button key={lang}
                  disabled={translating}
                  onClick={async () => {
                    setTranslating(true)
                    try {
                      const text = await askGroq(
                        `Translate this social media post to ${lang}. If it is already in ${lang}, improve it naturally.\n\nPost: "${(post.content || '').slice(0, 600)}"`,
                        { system: `You are a trilingual translator (Zaar, Hausa, English). Translate naturally and concisely. Return only the translated text, no preamble or explanation.`, maxTokens: 250 }
                      )
                      setTranslation({ lang, text })
                    } catch { toast.error('Translation unavailable') }
                    finally { setTranslating(false) }
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors disabled:opacity-40"
                >
                  {translating ? <Loader2 size={10} className="animate-spin" /> : null}
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TL;DR — only shown for long posts */}
      {(post.content?.length ?? 0) > 280 && !postEditing && (
        <div className="mb-3">
          {tldr ? (
            <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl px-3 py-2.5 animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-brand-500 flex items-center gap-1"><Sparkles size={11} /> TL;DR</span>
                <button onClick={() => setTldr(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{tldr}</p>
            </div>
          ) : (
            <button
              onClick={async () => {
                setTldrLoading(true)
                try {
                  const summary = await askGroq(
                    `Summarize this social media post in 1-2 short sentences:\n\n"${post.content}"`,
                    { system: 'Write a very brief, neutral summary. No preamble. Max 2 sentences.', maxTokens: 80 }
                  )
                  setTldr(summary)
                } catch { toast.error('Summary unavailable') }
                finally { setTldrLoading(false) }
              }}
              disabled={tldrLoading}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-500 hover:text-brand-600 dark:text-brand-400 transition-colors disabled:opacity-40"
            >
              {tldrLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              TL;DR
            </button>
          )}
        </div>
      )}

      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.hashtags.map(tag => (
            <span key={tag} className="badge badge-brand text-xs cursor-pointer hover:bg-brand-200 dark:hover:bg-brand-500/30">#{tag}</span>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 pt-1 border-t border-surface-100 dark:border-white/5">
        <ReactionPicker onReact={r => reactionMut.mutate(r)} currentReaction={reaction} count={likeCount} />
        <button onClick={() => setShowComments(v => !v)} className={clsx('reaction-btn', showComments && 'text-blue-500')}>
          <MessageCircle size={16} />
          {totalCommentCount > 0 && <span>{totalCommentCount}</span>}
          <span className="hidden sm:inline">Comment</span>
          <ChevronDown size={13} className={clsx('transition-transform duration-200', showComments && 'rotate-180')} />
        </button>
        <button onClick={handleShare} className="reaction-btn">
          <Share2 size={16} /><span className="hidden sm:inline">Share</span>
        </button>
        <button onClick={handleBookmark} className={clsx('reaction-btn ml-auto', bookmarked && 'text-amber-500')}>
          <Bookmark size={16} className={bookmarked ? 'fill-current' : ''} />
        </button>
        {viewCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-400 pl-1">
            <Eye size={13} />
            {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount}
          </span>
        )}
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="mt-3 space-y-3 pt-3 border-t border-surface-100 dark:border-white/5">
          {commentsLoading ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading comments…</p>
          ) : comments.length > 0 ? (
            <div className="space-y-3">
              {comments.map(c => (
                <Comment key={c.id} comment={c} postId={post.id} postOwnerId={post.user_id}
                  user={user} myProfile={myProfile} onCountChange={refreshCount} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-1">No comments yet — be the first!</p>
          )}
          <div className="flex gap-2 items-start">
            <Avatar src={myProfile?.avatar_url} name={myProfile?.full_name} size={32} />
            <div className="flex-1 space-y-1.5">
              <div className="flex gap-2">
                <MentionTextarea value={commentText} onChange={setCommentText} onMentionsChange={setCommentMentions}
                  placeholder="Write a comment… (@mention friends)" rows={1} className="flex-1 text-xs py-2 min-h-[38px]" />
                <button onClick={submitComment} disabled={!commentText.trim() || commentMut.isPending}
                  className="btn-primary px-3 py-2 text-xs self-start">
                  {commentMut.isPending ? '…' : 'Post'}
                </button>
              </div>
              <button onClick={async () => {
                setAiCommentLoading(true)
                try {
                  const s = await askGroq(`Write a short comment for: "${(post.content || '').slice(0, 200)}". 1-2 sentences, natural.`)
                  setCommentText(s)
                } catch (e) { toast.error(e.message) }
                finally { setAiCommentLoading(false) }
              }} disabled={aiCommentLoading}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-500 hover:text-purple-600 dark:text-purple-400 transition-colors disabled:opacity-40">
                {aiCommentLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                AI suggest comment
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
