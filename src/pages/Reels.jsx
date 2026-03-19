import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Heart, MessageCircle, Share2, Volume2, VolumeX, Play, Plus, X,
  Upload, Loader2, Trash2, Eye, Send, CornerDownRight, MoreVertical,
  Pause, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/PageLoader'
import MentionTextarea from '@/components/ui/MentionTextarea'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { askGroq } from '@/lib/groq'

export default function Reels() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [activeReelId, setActiveReelId] = useState(null)

  const { data: reels = [], isLoading } = useQuery({
    queryKey: ['reels'],
    queryFn: async () => {
      const { data } = await sb
        .from('posts')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), likes(count), comments(count)')
        .eq('is_reel', true)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(30)
      if (!data) return []
      const { data: userLikes } = await sb.from('likes').select('post_id').eq('user_id', user?.id)
      const likedSet = new Set((userLikes || []).map(l => l.post_id))
      return data.map(r => {
        const { likes, comments, ...rest } = r
        return { ...rest, isLiked: likedSet.has(r.id) }
      })
    },
    enabled: !!user,
  })

  if (isLoading) return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="h-8 w-24 bg-surface-200 dark:bg-white/10 rounded-lg animate-pulse" />
        <div className="h-8 w-28 bg-surface-200 dark:bg-white/10 rounded-lg animate-pulse" />
      </div>
      <div className="w-full max-w-sm mx-auto space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="rounded-2xl overflow-hidden bg-surface-200 dark:bg-white/10 animate-pulse"
            style={{ aspectRatio: '9/16', maxHeight: '70vh' }} />
        ))}
      </div>
    </div>
  )

  if (!reels.length) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
      <div className="text-6xl">🎬</div>
      <h3 className="font-extrabold text-xl text-gray-800 dark:text-gray-200">No reels yet</h3>
      <p className="text-gray-500 text-sm">Be the first to share a reel!</p>
      <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2"><Plus size={16} /> Create Reel</button>
      {createOpen && <CreateReelModal onClose={() => setCreateOpen(false)} qc={qc} user={user} />}
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Reels</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs gap-1.5">
          <Plus size={14} /> Create Reel
        </button>
      </div>

      <div className="w-full max-w-sm mx-auto space-y-4">
        {reels.map((reel, index) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            index={index}
            isActive={index === activeIndex}
            muted={muted}
            user={user}
            qc={qc}
            onActivate={() => setActiveIndex(index)}
            onMuteToggle={() => setMuted(v => !v)}
            onOpenComments={() => setActiveReelId(reel.id)}
            onNext={() => setActiveIndex(i => Math.min(i + 1, reels.length - 1))}
            onPrev={() => setActiveIndex(i => Math.max(i - 1, 0))}
            totalReels={reels.length}
          />
        ))}
      </div>

      {activeReelId && (
        <CommentsDrawer
          reelId={activeReelId}
          user={user}
          qc={qc}
          onClose={() => setActiveReelId(null)}
          reel={reels.find(r => r.id === activeReelId)}
        />
      )}
      {createOpen && <CreateReelModal onClose={() => setCreateOpen(false)} qc={qc} user={user} />}
    </div>
  )
}

function ReelCard({ reel, index, isActive, muted, user, qc, onActivate, onMuteToggle, onOpenComments, onNext, onPrev, totalReels }) {
  const videoRef = useRef(null)
  const cardRef  = useRef(null)
  const viewCountedRef = useRef(false)   // guard: count view once per activation
  const touchStartY = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)   // 0-100 playback progress
  const [liked, setLiked] = useState(reel.isLiked || false)
  const [likeCount, setLikeCount] = useState(Number(reel.likes?.[0]?.count ?? 0) || 0)
  const [commentCount, setCommentCount] = useState(Number(reel.comments?.[0]?.count ?? 0) || 0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewCount, setViewCount] = useState(reel.view_count || 0)
  const [emojiRain, setEmojiRain] = useState([])   // floating emoji burst on milestones
  const [liveReactions, setLiveReactions] = useState([])  // realtime reactions from others
  const channelRef = useRef(null)

  // ── Supabase Realtime broadcast — live emoji reactions ──────
  useEffect(() => {
    if (!isActive || !reel?.id) return
    const ch = sb.channel(`reel-reactions:${reel.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      const id = Date.now() + Math.random()
      const reaction = { id, emoji: payload.emoji, x: 15 + Math.random() * 70 }
      setLiveReactions(r => [...r, reaction])
      setTimeout(() => setLiveReactions(r => r.filter(rx => rx.id !== id)), 2200)
    }).subscribe()
    channelRef.current = ch
    return () => { sb.removeChannel(ch); channelRef.current = null }
  }, [isActive, reel?.id])

  const broadcastReaction = useCallback((emoji) => {
    channelRef.current?.send({ type: 'broadcast', event: 'react', payload: { emoji } })
    // Also show locally
    const id = Date.now()
    setLiveReactions(r => [...r, { id, emoji, x: 15 + Math.random() * 70 }])
    setTimeout(() => setLiveReactions(r => r.filter(rx => rx.id !== id)), 2200)
  }, [])
  const isOwner = reel.user_id === user?.id

  // Trigger emoji rain when likeCount hits a milestone (50, 100, 500 …)
  const prevLikeCountRef = useRef(likeCount)
  useEffect(() => {
    const prev = prevLikeCountRef.current
    prevLikeCountRef.current = likeCount
    const milestones = [50, 100, 250, 500, 1000]
    const hit = milestones.some(m => prev < m && likeCount >= m)
    if (!hit) return
    const emojis = ['❤️', '🔥', '✨', '💥', '🎉', '👑', '💫']
    const burst = Array.from({ length: 18 }, (_, i) => ({
      id: Date.now() + i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: 10 + Math.random() * 80,   // % from left
      delay: Math.random() * 0.6,
      duration: 1.5 + Math.random() * 1,
    }))
    setEmojiRain(burst)
    setTimeout(() => setEmojiRain([]), 3000)
  }, [likeCount])

  // IntersectionObserver: auto-activate when reel is >60% visible
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onActivate()
    }, { threshold: 0.6 })
    obs.observe(card)
    return () => obs.disconnect()
  }, [])

  // Play/pause when isActive changes; reset view guard on deactivation
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isActive) {
      video.muted = muted
      video.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
      setPlaying(false)
      setProgress(0)
      viewCountedRef.current = false   // reset so next activation counts again
    }
  }, [isActive])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Progress bar: update on timeupdate
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTime = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100)
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [])

  // View count: fire once per activation, only after 2s of watching — guarded by ref
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(async () => {
      if (viewCountedRef.current) return
      viewCountedRef.current = true
      const newCount = viewCount + 1
      setViewCount(newCount)
      await sb.from('posts').update({ view_count: newCount }).eq('id', reel.id)
    }, 2000)
    return () => clearTimeout(timer)
  }, [isActive])

  // Swipe up/down gesture for next/prev reel
  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY }
  const onTouchEnd   = (e) => {
    if (touchStartY.current === null) return
    const dy = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(dy) < 50) return   // ignore small swipes
    if (dy > 0) onNext(); else onPrev()
    touchStartY.current = null
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) { v.pause(); setPlaying(false) }
    else { v.play(); setPlaying(true) }
  }

  const likeMut = useMutation({
    mutationFn: async () => {
      if (liked) {
        const { error } = await sb.from('likes').delete().eq('post_id', reel.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('likes').upsert({ post_id: reel.id, user_id: user.id, reaction_type: 'like' }, { onConflict: 'post_id,user_id' })
        if (error) throw error
        // Notify reel owner (skip self-like)
        if (reel.user_id !== user.id) {
          sb.from('notifications').insert({
            user_id: reel.user_id, actor_id: user.id,
            type: 'like', reference_id: reel.id,
            is_read: false, extra_data: { isVideo: true },
          }).then(() => {}).catch(() => {})
        }
      }
    },
    onMutate: () => { const p = liked; setLiked(!p); setLikeCount(n => p ? n-1 : n+1) },
    onError: () => { setLiked(l => !l); setLikeCount(n => liked ? n+1 : n-1) },
  })

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from('posts').delete().eq('id', reel.id).eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['reels']); toast.success('Reel deleted') },
    onError: e => toast.error(e.message),
  })

  const handleShare = async () => {
    try { await navigator.share({ title: `Reel by ${reel.profiles?.full_name}`, url: window.location.href }) }
    catch { await navigator.clipboard.writeText(window.location.href); toast.success('Link copied!') }
  }

  return (
    <div
      ref={cardRef}
      className={clsx(
        'relative w-full aspect-[9/16] rounded-3xl overflow-hidden bg-black shadow-2xl transition-all duration-300 cursor-pointer',
        isActive
          ? 'ring-2 ring-brand-500/50 shadow-brand-500/20'
          : 'opacity-75 hover:opacity-90 scale-[0.98]'
      )}
      onClick={!isActive ? onActivate : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Emoji rain overlay — shown on like milestones */}
      {/* Live reactions from other viewers */}
      {liveReactions.map(r => (
        <div key={r.id} className="absolute bottom-32 pointer-events-none z-20 animate-bounce"
          style={{ left: `${r.x}%`, animation: 'liveReact 2.2s ease-out forwards' }}>
          <span style={{ fontSize: 28 }}>{r.emoji}</span>
        </div>
      ))}

      {emojiRain.length > 0 && (
        <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
          <style>{`
            @keyframes vii-mbuni-float-up {
              0%   { transform: translateY(100%) scale(0.5); opacity: 1; }
              80%  { opacity: 1; }
              100% { transform: translateY(-120%) scale(1.2) rotate(20deg); opacity: 0; }
            }
          `}</style>
          {emojiRain.map(p => (
            <span
              key={p.id}
              style={{
                position: 'absolute',
                bottom: '10%',
                left: `${p.x}%`,
                fontSize: '1.75rem',
                animation: `vii-mbuni-float-up ${p.duration}s ease-out ${p.delay}s both`,
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>
      )}
      {/* Progress bar */}
      {isActive && reel.video_url && (
        <div className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-white/20">
          <div className="h-full bg-white transition-none" style={{ width: `${progress}%` }} />
        </div>
      )}
      {/* Media */}
      {reel.video_url ? (
        <video ref={videoRef} src={reel.video_url} className="w-full h-full object-cover" loop muted={muted} playsInline preload="metadata" onClick={isActive ? togglePlay : undefined} />
      ) : reel.image_url ? (
        <img src={reel.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full gradient-brand flex items-center justify-center">
          <Play size={48} className="text-white/40" />
        </div>
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/30 pointer-events-none" />

      {/* Pause indicator */}
      {reel.video_url && !playing && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm animate-fade-in">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Top controls */}
      {isActive && (
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={onPrev} className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all">
                <ChevronUp size={16} />
              </button>
            )}
            {index < totalReels - 1 && (
              <button onClick={onNext} className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all">
                <ChevronDown size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Eye size={12} className="text-white/80" />
              <span className="text-white text-xs font-bold">{viewCount.toLocaleString()}</span>
            </div>
            <button onClick={onMuteToggle} className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all">
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {isOwner && (
              <div className="relative">
                <button onClick={() => setMenuOpen(v => !v)} className="w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all">
                  <MoreVertical size={15} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-20 bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-white/10 overflow-hidden min-w-[140px]">
                      <button
                        onClick={() => { deleteMut.mutate(); setMenuOpen(false) }}
                        disabled={deleteMut.isPending}
                        className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-medium">
                        <Trash2 size={14} />
                        {deleteMut.isPending ? 'Deleting…' : 'Delete reel'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Author + caption bottom-left */}
      <div className="absolute bottom-0 left-0 right-16 p-4 pointer-events-none">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-full border-2 border-white/40 overflow-hidden flex-shrink-0">
            <Avatar src={reel.profiles?.avatar_url} name={reel.profiles?.full_name} size={36} />
          </div>
          <div>
            <div className="text-white font-bold text-sm drop-shadow">{reel.profiles?.full_name}</div>
            <div className="text-white/60 text-xs">@{reel.profiles?.username}</div>
          </div>
        </div>
        {reel.content && <p className="text-white text-sm leading-relaxed line-clamp-3 drop-shadow">{reel.content}</p>}
        {reel.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {reel.hashtags.slice(0, 4).map(t => (
              <span key={t} className="text-brand-300 text-xs font-bold drop-shadow">#{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons right side */}
      {isActive && (
        <div className="absolute bottom-8 right-3 flex flex-col gap-5 items-center">
          <button onClick={() => likeMut.mutate()} className="flex flex-col items-center gap-1 group">
            <div className={clsx(
              'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-sm shadow-lg',
              liked ? 'bg-red-500 scale-110 shadow-red-500/40' : 'bg-black/50 group-hover:bg-black/70'
            )}>
              <Heart size={22} className={clsx('text-white transition-all', liked && 'fill-current')} />
            </div>
            <span className="text-white text-xs font-bold drop-shadow">{likeCount || ''}</span>
          </button>

          <button onClick={onOpenComments} className="flex flex-col items-center gap-1 group">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/70 transition-all shadow-lg">
              <MessageCircle size={22} className="text-white" />
            </div>
            <span className="text-white text-xs font-bold drop-shadow">{commentCount || ''}</span>
          </button>

          <button onClick={handleShare} className="flex flex-col items-center gap-1 group">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/70 transition-all shadow-lg">
              <Share2 size={22} className="text-white" />
            </div>
            <span className="text-white text-xs font-bold drop-shadow">Share</span>
          </button>

          {/* Live emoji reactions */}
          <div className="flex flex-col gap-1 mt-1">
            {['❤️','🔥','😂','😮','👏'].map(em => (
              <button key={em} onClick={() => broadcastReaction(em)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm active:scale-125 transition-transform text-base">
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inactive overlay hint */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center">
            <Play size={20} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
      )}
    </div>
  )
}

function CommentsDrawer({ reelId, user, qc, onClose, reel }) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const bottomRef = useRef(null)

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['reel-comments', reelId],
    queryFn: async () => {
      const { data } = await sb
        .from('comments')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), replies:comment_replies(*, profiles:user_id(id,username,full_name,avatar_url))')
        .eq('post_id', reelId)
        .order('created_at', { ascending: true })
      return data || []
    },
  })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  const submitMut = useMutation({
    mutationFn: async () => {
      if (replyTo) {
        const { error } = await sb.from('comment_replies').insert({ comment_id: replyTo.id, post_id: reelId, user_id: user.id, content: text.trim() })
        if (error) throw error
      } else {
        const { error } = await sb.from('comments').insert({ post_id: reelId, user_id: user.id, content: text.trim() })
        if (error) throw error
      }
      if (reel?.user_id && reel.user_id !== user.id) {
        sb.from('notifications').insert({ user_id: reel.user_id, actor_id: user.id, type: replyTo ? 'reply' : 'comment', reference_id: reelId, is_read: false }).then(() => {}).catch(() => {})
      }
    },
    onSuccess: () => { setText(''); setReplyTo(null); setMentions([]); qc.invalidateQueries(['reel-comments', reelId]); qc.invalidateQueries(['reels']) },
    onError: e => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: async ({ id, isReply }) => {
      const table = isReply ? 'comment_replies' : 'comments'
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['reel-comments', reelId]),
    onError: e => toast.error(e.message),
  })

  const handleAI = async () => {
    setAiLoading(true)
    try {
      const ctx = replyTo
        ? `Reply to this reel comment: "${replyTo.content}"`
        : `Comment on a reel: "${reel?.content || 'a video reel'}"`
      const s = await askGroq(`${ctx}. Short, natural, 1-2 sentences.`)
      setText(s)
    } catch(e) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-900 rounded-t-3xl shadow-2xl max-h-[78vh] flex flex-col"
        style={{ animation: 'slideUp .3s cubic-bezier(.34,1.56,.64,1)' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-surface-300 dark:bg-white/20 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 dark:border-white/10 flex-shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-white">
            Comments {comments.length > 0 && <span className="text-gray-400 font-normal text-sm ml-1">({comments.length})</span>}
          </h3>
          <button onClick={onClose} className="btn-icon text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-brand-400" /></div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
              <MessageCircle size={32} />
              <p className="text-sm font-medium">No comments yet — be first!</p>
            </div>
          ) : comments.map(comment => (
            <ReelComment
              key={comment.id}
              comment={comment}
              user={user}
              onReply={(id, name, content) => { setReplyTo({ id, name, content }); setText('') }}
              onDelete={(id) => deleteMut.mutate({ id, isReply: false })}
              onDeleteReply={(id) => deleteMut.mutate({ id, isReply: true })}
              onAIReply={async (commentContent) => {
                setAiLoading(true)
                try {
                  const s = await askGroq(`Write a short natural reply to: "${commentContent}". Max 1-2 sentences.`)
                  setText(s)
                  setReplyTo({ id: comment.id, name: comment.profiles?.full_name?.split(' ')[0], content: commentContent })
                } catch(e) { toast.error(e.message) }
                finally { setAiLoading(false) }
              }}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="flex items-center justify-between px-4 py-2 bg-brand-50 dark:bg-brand-500/10 border-t border-brand-100 dark:border-brand-500/20 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-brand-600 dark:text-brand-400">
              <CornerDownRight size={12} />
              <span>Replying to <strong>{replyTo.name}</strong></span>
            </div>
            <button onClick={() => { setReplyTo(null); setText('') }} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14} /></button>
          </div>
        )}

        <div className="px-4 pt-2 pb-5 border-t border-surface-100 dark:border-white/10 flex-shrink-0 space-y-2">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <MentionTextarea
                value={text}
                onChange={setText}
                onMentionsChange={setMentions}
                placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Add a comment…'}
                rows={1}
                className="text-sm py-2.5"
              />
            </div>
            <button
              onClick={() => text.trim() && submitMut.mutate()}
              disabled={!text.trim() || submitMut.isPending}
              className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center text-white hover:bg-brand-600 disabled:opacity-40 transition-all flex-shrink-0 shadow-lg shadow-brand-500/30"
            >
              {submitMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
          <button
            onClick={handleAI}
            disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-purple-500 dark:text-purple-400 hover:text-purple-600 transition-colors disabled:opacity-40"
          >
            {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            AI suggest {replyTo ? 'reply' : 'comment'}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>
    </>
  )
}

function ReelComment({ comment, user, onReply, onDelete, onDeleteReply, onAIReply }) {
  const [showReplies, setShowReplies] = useState(false)
  const isOwner = comment.user_id === user?.id
  const repliesCount = comment.replies?.length || 0

  return (
    <div className="space-y-2">
      <div className="flex gap-2.5 items-start group">
        <Avatar src={comment.profiles?.avatar_url} name={comment.profiles?.full_name} size={32} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="bg-surface-50 dark:bg-white/5 rounded-2xl rounded-tl-md px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{comment.profiles?.full_name}</span>
              {isOwner && (
                <button onClick={() => onDelete(comment.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0 mt-0.5">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">{comment.content}</p>
          </div>
          <div className="flex items-center gap-3 mt-1.5 px-1">
            <span className="text-[10px] text-gray-400">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            <button onClick={() => onReply(comment.id, comment.profiles?.full_name?.split(' ')[0], comment.content)}
              className="text-[11px] font-bold text-gray-400 hover:text-brand-500 transition-colors flex items-center gap-1">
              <CornerDownRight size={10} /> Reply
            </button>
            <button onClick={() => onAIReply(comment.content)}
              className="text-[11px] font-bold text-gray-400 hover:text-purple-500 transition-colors flex items-center gap-1">
              <Sparkles size={10} /> AI
            </button>
            {repliesCount > 0 && (
              <button onClick={() => setShowReplies(v => !v)}
                className="text-[11px] font-bold text-brand-500 hover:text-brand-600 transition-colors">
                {showReplies ? 'Hide replies' : `${repliesCount} ${repliesCount === 1 ? 'reply' : 'replies'}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {showReplies && comment.replies?.map(reply => (
        <div key={reply.id} className="flex gap-2 items-start ml-10 group">
          <Avatar src={reply.profiles?.avatar_url} name={reply.profiles?.full_name} size={26} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="bg-surface-50 dark:bg-white/5 rounded-2xl rounded-tl-md px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{reply.profiles?.full_name}</span>
                {reply.user_id === user?.id && (
                  <button onClick={() => onDeleteReply(reply.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0">
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">{reply.content}</p>
            </div>
            <span className="text-[10px] text-gray-400 px-1">
              {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function CreateReelModal({ onClose, qc, user }) {
  const [content, setContent] = useState('')
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const fileRef = useRef()

  // Revoke object URL when preview changes or component unmounts to prevent memory leaks
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (preview) URL.revokeObjectURL(preview) // revoke previous before creating new
    setFile(f); setPreview(URL.createObjectURL(f))
    setFileType(f.type.startsWith('video') ? 'video' : 'image')
  }

  const handleAI = async () => {
    setAiLoading(true)
    try {
      const ctx = content.trim() || (file ? `a ${fileType} reel` : 'a social media reel')
      const s = await askGroq(`Write a punchy caption for a reel: "${ctx}". Under 100 chars, add 2-3 hashtags.`)
      setContent(s)
    } catch(e) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let media_url = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `reels/${user.id}/${Date.now()}.${ext}`
        const bucket = fileType === 'video' ? 'videos' : 'images'
        const { error: upErr } = await sb.storage.from(bucket).upload(path, file)
        if (upErr) throw upErr
        media_url = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
      }
      const { error } = await sb.from('posts').insert({
        user_id: user.id, content: content.trim(),
        is_reel: true, is_published: true, view_count: 0,
        ...(fileType === 'video' ? { video_url: media_url } : { image_url: media_url }),
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['reels']); toast.success('Reel posted! 🎬'); onClose() },
    onError: e => toast.error(e.message),
  })

  return (
    <Modal title="Create Reel" onClose={onClose}>
      <div className="p-5 space-y-4">
        {preview ? (
          <div className="relative aspect-[9/16] max-h-64 rounded-2xl overflow-hidden bg-black mx-auto w-full max-w-[150px]">
            {fileType === 'video'
              ? <video src={preview} className="w-full h-full object-cover" autoPlay muted loop playsInline />
              : <img src={preview} alt="" className="w-full h-full object-cover" />
            }
            <button onClick={() => { URL.revokeObjectURL(preview); setFile(null); setPreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full h-44 rounded-2xl border-2 border-dashed border-brand-300 dark:border-brand-700 flex flex-col items-center justify-center gap-3 bg-brand-50 dark:bg-brand-900/10 hover:bg-brand-100 dark:hover:bg-brand-900/20 transition-colors">
            <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center shadow-lg shadow-brand-500/30">
              <Upload size={24} className="text-white" />
            </div>
            <div className="text-sm font-bold text-brand-600 dark:text-brand-400">Upload video or image</div>
            <div className="text-xs text-gray-400">MP4, MOV, JPG, PNG</div>
          </button>
        )}
        <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFile} />
        <div className="space-y-1.5">
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Add a caption… #hashtags" rows={3} className="input resize-none text-sm" />
          <button onClick={handleAI} disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-purple-500 hover:text-purple-600 transition-colors disabled:opacity-40">
            {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            AI write caption
          </button>
        </div>
        <button onClick={() => mutation.mutate()} disabled={(!content.trim() && !file) || mutation.isPending} className="btn-primary w-full py-3 text-sm font-bold">
          {mutation.isPending
            ? <span className="flex items-center gap-2 justify-center"><Loader2 size={16} className="animate-spin" />Posting…</span>
            : '🎬 Post Reel'
          }
        </button>
      </div>
    </Modal>
  )
}
