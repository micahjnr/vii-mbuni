import { useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera, Edit2, Check, X, MapPin, Link as LinkIcon,
  Calendar, Shield, MessageCircle, UserPlus, UserCheck,
  Clock, Image as ImageIcon, Smile, Loader2, Video as VideoIcon, Play, Flag
} from 'lucide-react'
import { useAuthStore, useUIStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import PostCard from '@/components/feed/PostCard'
import XPBadge from '@/components/gamification/XPBadge'
import BadgeDisplay, { BADGES } from '@/components/gamification/BadgeDisplay'
import MentionTextarea from '@/components/ui/MentionTextarea'
import { PostSkeleton, Skeleton, EmptyState } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

const PROFILE_TABS = ['Posts', 'Videos', 'Badges']

/** Compact video thumbnail card for the profile Videos grid */
function VideoThumb({ post, onClick }) {
  const [hovered, setHovered] = useState(false)
  const likes    = Number(post.likes?.[0]?.count    ?? 0)
  const comments = Number(post.comments?.[0]?.count ?? 0)

  return (
    <div
      className="relative aspect-video rounded-xl overflow-hidden bg-black cursor-pointer group"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        src={post.video_url}
        className="w-full h-full object-cover"
        preload="metadata"
        muted
        playsInline
        // Play on hover for a quick preview feel
        ref={el => {
          if (!el) return
          if (hovered) { el.play().catch(() => {}) }
          else { el.pause(); el.currentTime = 0 }
        }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      {/* Play badge (visible when not hovered) */}
      <div className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity">
        <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
          <Play size={16} className="text-white ml-0.5" fill="white" />
        </div>
      </div>

      {/* Stats on hover */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {post.content && (
          <p className="text-white text-[10px] leading-tight line-clamp-1 flex-1 font-medium">{post.content}</p>
        )}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-white text-[10px] font-bold">❤️ {likes}</span>
          <span className="text-white text-[10px] font-bold">💬 {comments}</span>
        </div>
      </div>
    </div>
  )
}

export default function Profile() {
  const { userId } = useParams()
  const { user, profile: myProfile, fetchProfile } = useAuthStore()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { onlineUsers } = useUIStore()
  const viewId = userId || user?.id
  const isOwn = viewId === user?.id
  const [editing, setEditing] = useState(() => searchParams.get('edit') === '1')
  const [form, setForm] = useState({})
  const [activeTab, setActiveTab] = useState('Posts')
  const avatarRef = useRef()
  const bannerRef = useRef()
  const fileRef = useRef()

  // Timeline post state
  const [timelineText, setTimelineText] = useState('')
  const [timelineImage, setTimelineImage] = useState(null)
  const [timelinePreview, setTimelinePreview] = useState(null)
  const [timelineMentions, setTimelineMentions] = useState([])
  const [timelinePosting, setTimelinePosting] = useState(false)

  // ── Queries ────────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', viewId],
    queryFn: async () => {
      const { data } = await sb.from('profiles').select('id, username, full_name, email, bio, avatar_url, banner_url, cover_url, status_emoji, status_text, follower_count, following_count, xp, level, streak_days, last_active, created_at, location, website, theme_color, city').eq('id', viewId).single()
      return data
    },
    enabled: !!viewId,
  })

  // Fetch both profile's own posts AND posts written on their timeline by others
  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['profile-posts', viewId],
    queryFn: async () => {
      // Try fetching timeline posts; fall back if timeline_user_id column doesn't exist yet
      const { data, error } = await sb.from('posts')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), likes(count), comments(count), comment_replies(count), user_liked:likes(user_id,reaction_type)')
        .or(`user_id.eq.${viewId},timeline_user_id.eq.${viewId}`)
        .eq('is_published', true)
        .eq('user_liked.user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (error?.code === '42703') {
        // timeline_user_id column missing — fall back to own posts only
        const { data: fallback } = await sb.from('posts')
          .select('*, profiles:user_id(id,username,full_name,avatar_url), likes(count), comments(count), comment_replies(count), user_liked:likes(user_id,reaction_type)')
          .eq('user_id', viewId)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(30)
        return fallback || []
      }
      return data || []
    },
    enabled: !!viewId,
  })

  const { data: videoPosts = [], isLoading: videosLoading } = useQuery({
    queryKey: ['profile-videos', viewId],
    queryFn: async () => {
      const { data } = await sb.from('posts')
        .select('id, video_url, content, created_at, likes(count), comments(count)')
        .eq('user_id', viewId)
        .eq('is_published', true)
        .not('video_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30)
      return data || []
    },
    enabled: !!viewId,
  })

  const { data: friendStatus } = useQuery({
    queryKey: ['friend-status', user?.id, viewId],
    queryFn: async () => {
      const { data } = await sb.from('friends').select('id, user_id, friend_id, status, created_at')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${viewId}),and(user_id.eq.${viewId},friend_id.eq.${user.id})`)
        .maybeSingle()
      return data
    },
    enabled: !!user && !isOwn,
  })

  // ── Mutations ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (updates) => {
      const { error } = await sb.from('profiles').update(updates).eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['profile', viewId])
      fetchProfile(user.id)
      setEditing(false)
      toast.success('Profile updated!')
    },
    onError: () => toast.error('Failed to save profile'),
  })

  // Ensure the Supabase client has a fresh session token before storage uploads.
  // New users just verified OTP — the client session may not be set yet, causing
  // the upload to fire as 'anon' and fail the storage RLS policy check.
  const ensureSession = async () => {
    const { data } = await sb.auth.getSession()
    if (!data?.session) {
      const { data: refreshed } = await sb.auth.refreshSession()
      return refreshed?.session
    }
    return data.session
  }

  const uploadAvatar = async (file) => {
    await ensureSession()
    const ext = file.name?.split('.').pop() || 'jpg'
    const path = `avatars/${user.id}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('images').upload(path, file, { upsert: true })
    if (error) { console.error('[uploadAvatar]', error); toast.error('Upload failed: ' + error.message); return }
    const { data } = sb.storage.from('images').getPublicUrl(path)
    const { error: updateError } = await sb.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    if (updateError) { toast.error('Failed to save avatar'); return }
    await fetchProfile(user.id)
    await qc.invalidateQueries({ queryKey: ['profile', viewId] })
    toast.success('Avatar updated!')
  }

  const uploadBanner = async (file) => {
    await ensureSession()
    const ext = file.name?.split('.').pop() || 'jpg'
    const path = `banners/${user.id}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('images').upload(path, file, { upsert: true })
    if (error) { console.error('[uploadBanner]', error); toast.error('Upload failed: ' + error.message); return }
    const { data } = sb.storage.from('images').getPublicUrl(path)
    const { error: updateError } = await sb.from('profiles').update({ banner_url: data.publicUrl }).eq('id', user.id)
    if (updateError) { toast.error('Failed to save banner'); return }
    await fetchProfile(user.id)
    await qc.invalidateQueries({ queryKey: ['profile', viewId] })
    toast.success('Banner updated!')
  }

  const addFriend = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from('friends').insert({ user_id: user.id, friend_id: viewId, status: 'pending' })
      if (error) throw error
      sb.from('notifications').insert({
        user_id: viewId, actor_id: user.id, type: 'friend_request', reference_id: user.id, is_read: false,
      }).then(() => {}).catch(() => {})
    },
    onSuccess: () => { qc.invalidateQueries(['friend-status']); toast.success('Friend request sent!') },
  })

  const blockUser = useMutation({
    mutationFn: async () => {
      await sb.from('friends').upsert(
        { user_id: user.id, friend_id: viewId, status: 'blocked' },
        { onConflict: 'user_id,friend_id' }
      )
      // Also insert into blocked_users table
      await sb.from('blocked_users').upsert(
        { user_id: user.id, blocked_id: viewId },
        { onConflict: 'user_id,blocked_id' }
      ).then(() => {}).catch(() => {})
    },
    onSuccess: () => { qc.invalidateQueries(['friend-status']); toast.success('User blocked') },
  })

  const [reportReason, setReportReason] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)
  const reportUser = useMutation({
    mutationFn: async (reason) => {
      const { error } = await sb.from('reports').insert({
        reporter_id:      user.id,
        reported_user_id: viewId,
        reason,
        content_type: 'profile',
      })
      if (error) throw error
    },
    onSuccess: () => { setShowReportModal(false); setReportReason(''); toast.success('Report submitted — thank you') },
    onError:   () => toast.error('Failed to submit report'),
  })

  // ── Timeline post handler ──────────────────────────────────────
  const handleTimelinePost = async () => {
    if (!timelineText.trim() && !timelineImage) return
    setTimelinePosting(true)
    try {
      let imageUrl = null
      if (timelineImage) {
        const ext = timelineImage.name.split('.').pop()
        const path = `posts/${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await sb.storage.from('images').upload(path, timelineImage)
        if (upErr) throw upErr
        const { data: urlData } = sb.storage.from('images').getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }

      let insertedPostId = null
      const { error, data: newPost } = await sb.from('posts').insert({
        user_id: user.id,
        timeline_user_id: viewId,
        content: timelineText.trim(),
        image_url: imageUrl,
        audience: 'public',
        is_published: true,
        is_reel: false,
      }).select('id').single()

      // If timeline_user_id column doesn't exist yet, retry without it
      if (error?.code === '42703') {
        const { error: e2, data: newPost2 } = await sb.from('posts').insert({
          user_id: user.id,
          content: timelineText.trim(),
          image_url: imageUrl,
          is_published: true,
          is_reel: false,
        }).select('id').single()
        if (e2) throw e2
        insertedPostId = newPost2?.id
      } else if (error) {
        throw error
      } else {
        insertedPostId = newPost?.id
      }

      // Notifications — fire-and-forget, never block the post
      const notifRows = []
      if (viewId !== user.id) {
        notifRows.push({ user_id: viewId, type: 'mention', actor_id: user.id, reference_id: insertedPostId, is_read: false })
      }
      if (timelineMentions.length > 0 && insertedPostId) {
        timelineMentions.filter(id => id !== user.id).forEach(id => {
          notifRows.push({ user_id: id, type: 'mention', actor_id: user.id, reference_id: insertedPostId, is_read: false })
        })
      }
      if (notifRows.length) {
        sb.from('notifications').insert(notifRows).then(() => {}).catch(() => {})
      }

      try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: 10 }) } catch(_) {}
      setTimelineText('')
      setTimelineImage(null)
      setTimelinePreview(null)
      setTimelineMentions([])
      qc.invalidateQueries(['profile-posts', viewId])
      toast.success('Posted! +10 XP 🎉')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setTimelinePosting(false)
    }
  }

  // ── Badge calc ─────────────────────────────────────────────────
  const earnedBadges = () => {
    if (!profile || !posts) return []
    const earned = []
    const ownPosts = posts.filter(p => p.user_id === viewId)
    if (ownPosts.length >= 1)  earned.push('first_post')
    if (ownPosts.length >= 10) earned.push('ten_posts')
    if (ownPosts.length >= 50) earned.push('fifty_posts')
    if ((profile.follower_count || 0) >= 1)  earned.push('first_friend')
    if ((profile.follower_count || 0) >= 10) earned.push('ten_friends')
    if ((profile.streak_days || 0) >= 3)  earned.push('streak_3')
    if ((profile.streak_days || 0) >= 7)  earned.push('streak_7')
    if ((profile.streak_days || 0) >= 30) earned.push('streak_30')
    if (profile.bio && profile.avatar_url) earned.push('profile_complete')
    return earned
  }

  if (profileLoading) return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-40 rounded-2xl w-full" />
      <div className="flex items-end gap-4 -mt-12 px-4">
        <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2 pb-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>
    </div>
  )

  const p = editing ? { ...profile, ...form } : profile
  const badges = earnedBadges()

  const friendBtn = () => {
    // Already friends — show static "Friends" label, no action needed
    if (friendStatus?.status === 'accepted') return (
      <button className="btn-secondary text-xs px-3 py-1.5 gap-1.5" disabled>
        <UserCheck size={14} /> Friends
      </button>
    )
    // I sent the request — waiting for them to accept
    if (friendStatus?.status === 'pending' && friendStatus?.user_id === user.id) return (
      <button disabled className="btn-secondary text-xs px-3 py-1.5 gap-1.5 text-gray-400">
        <Clock size={14} /> Pending
      </button>
    )
    // They sent me a request — show Accept button
    if (friendStatus?.status === 'pending' && friendStatus?.user_id === viewId) return (
      <button
        onClick={async () => {
          await sb.from('friends')
            .update({ status: 'accepted' })
            .eq('user_id', viewId)
            .eq('friend_id', user.id)
          qc.invalidateQueries(['friend-status'])
          toast.success('Friend request accepted!')
        }}
        className="btn-primary text-xs px-3 py-1.5 gap-1.5"
      >
        <UserCheck size={14} /> Accept
      </button>
    )
    // No relationship — show Add Friend
    return (
      <button onClick={() => addFriend.mutate()} disabled={addFriend.isPending} className="btn-primary text-xs px-3 py-1.5 gap-1.5">
        <UserPlus size={14} /> Add Friend
      </button>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Banner ─────────────────────────────────────────────── */}
      <div className="relative h-52 rounded-2xl overflow-hidden bg-gradient-to-br from-brand-400 to-brand-700" style={p?.theme_color && !p?.banner_url ? { background: `linear-gradient(135deg, ${p.theme_color} 0%, ${p.theme_color}bb 100%)` } : {}}>
        {p?.banner_url && <img src={p.banner_url} alt="Banner" className="w-full h-full object-cover object-center" />}
        {isOwn && (
          <>
            <button onClick={() => bannerRef.current?.click()}
              className="absolute bottom-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors">
              <Camera size={13} /> Change Banner
            </button>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadBanner(e.target.files[0])} />
          </>
        )}
      </div>

      {/* ── Avatar + action buttons ─────────────────────────────── */}
      <div className="flex items-end justify-between -mt-14 px-2">
        <div className="relative">
          <div className="w-28 h-28 rounded-2xl border-4 border-white dark:border-surface-950 overflow-hidden shadow-xl bg-brand-100 dark:bg-brand-900">
            <Avatar src={p?.avatar_url} name={p?.full_name} size={112} />
          </div>
          {isOwn && (
            <>
              <button onClick={() => avatarRef.current?.click()}
                className="absolute bottom-1 right-1 w-8 h-8 bg-brand-500 hover:bg-brand-600 rounded-xl flex items-center justify-center border-2 border-white dark:border-surface-950 transition-colors shadow">
                <Camera size={14} className="text-white" />
              </button>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadAvatar(e.target.files[0])} />
            </>
          )}
        </div>

        <div className="flex gap-2 pb-2">
          {isOwn ? (
            editing ? (
              <div className="flex gap-2">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary text-xs px-3 py-1.5 gap-1.5">
                  <Check size={14} /> Save
                </button>
                <button onClick={() => { setEditing(false); setForm({}) }} className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
                  <X size={14} /> Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => { setEditing(true); setForm({ full_name: profile?.full_name, bio: profile?.bio, location: profile?.location, website: profile?.website, status_emoji: profile?.status_emoji, status_text: profile?.status_text, theme_color: profile?.theme_color || '#7c3aed', city: profile?.city || '' }) }}
                className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
                <Edit2 size={14} /> Edit Profile
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button onClick={() => navigate(`/messages/${viewId}`)} className="btn-primary text-xs px-3 py-1.5 gap-1.5">
                <MessageCircle size={14} /> Message
              </button>
              {friendBtn()}
              {friendStatus?.status !== 'blocked' && (
                <button onClick={() => blockUser.mutate()} className="btn-ghost text-xs px-2 py-1.5 text-red-400 hover:text-red-500" title="Block user">
                  <Shield size={14} />
                </button>
              )}
              <button onClick={() => setShowReportModal(true)} className="btn-ghost text-xs px-2 py-1.5 text-orange-400 hover:text-orange-500" title="Report user">
                <Flag size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Report modal ─────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setShowReportModal(false)}>
          <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">Report @{p?.username}</h3>
            <p className="text-xs text-gray-400 mb-4">Tell us why you're reporting this account.</p>
            <div className="space-y-2 mb-4">
              {['Spam or fake account', 'Harassment or bullying', 'Hate speech', 'Inappropriate content', 'Scam or fraud', 'Other'].map(r => (
                <button key={r} onClick={() => setReportReason(r)}
                  className={clsx('w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-all',
                    reportReason === r
                      ? 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                      : 'border-surface-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-surface-50 dark:hover:bg-white/5'
                  )}>
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReportModal(false)} className="btn-ghost flex-1 text-sm">Cancel</button>
              <button
                disabled={!reportReason || reportUser.isPending}
                onClick={() => reportUser.mutate(reportReason)}
                className="btn-primary flex-1 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-40">
                {reportUser.isPending ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile info ────────────────────────────────────────── */}
      <div className="card p-5 space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={form.status_emoji || ''} onChange={e => setForm(f => ({ ...f, status_emoji: e.target.value }))}
                placeholder="😊" className="input w-16 text-center text-xl" maxLength={2} />
              <input value={form.status_text || ''} onChange={e => setForm(f => ({ ...f, status_text: e.target.value }))}
                placeholder="What's your status?" className="input flex-1" />
            </div>
            <input value={form.full_name || ''} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Full name" className="input" />
            <textarea value={form.bio || ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Bio" rows={3} className="input resize-none" />
            <input value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="input" />
            <input value={form.website || ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="Website" className="input" />
            <input value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City (e.g. Bauchi)" className="input" />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Profile theme colour</p>
              <div className="flex gap-2 flex-wrap">
                {['#7c3aed','#c8102e','#0ea5e9','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6'].map(col => (
                  <button key={col} type="button"
                    onClick={() => setForm(f => ({ ...f, theme_color: col }))}
                    className="w-8 h-8 rounded-full transition-all"
                    style={{ background: col, outline: form.theme_color === col ? `3px solid ${col}` : 'none', outlineOffset: 2, transform: form.theme_color === col ? 'scale(1.2)' : 'scale(1)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{p?.full_name}</h2>
                {p?.xp > 0 && <XPBadge xp={p.xp} size="xs" />}
                {badges.length > 0 && <BadgeDisplay earnedBadgeIds={badges} compact />}
              </div>
              <p className="text-sm text-gray-400">@{p?.username}</p>
              {(p?.status_emoji || p?.status_text) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{p.status_emoji} {p.status_text}</p>
              )}
            </div>
            {/* Online status */}
            {!isOwn && (
              <div className="flex items-center gap-1.5 mb-1">
                {onlineUsers.includes(viewId)
                  ? <><span className="w-2 h-2 bg-green-400 rounded-full" /><span className="text-xs text-green-500 font-semibold">Active now</span></>
                  : p?.last_active
                    ? <><span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" /><span className="text-xs text-gray-400">Last seen {formatDistanceToNow(new Date(p.last_active), { addSuffix: true })}</span></>
                    : null
                }
              </div>
            )}
            {p?.bio && <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{p.bio}</p>}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
              {p?.location && <span className="flex items-center gap-1"><MapPin size={12} /> {p.location}</span>}
              {p?.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-500 hover:underline"><LinkIcon size={12} /> {p.website}</a>}
              {p?.created_at && <span className="flex items-center gap-1"><Calendar size={12} /> Joined {format(new Date(p.created_at), 'MMMM yyyy')}</span>}
              {(p?.streak_days || 0) > 0 && <span className="flex items-center gap-1">🔥 {p.streak_days} day streak</span>}
            </div>
          </>
        )}
        <div className="flex gap-6 pt-2 border-t border-surface-100 dark:border-white/5">
          <div className="text-center">
            <div className="font-bold text-gray-900 dark:text-white">{posts?.filter(p => p.user_id === viewId).length || 0}</div>
            <div className="text-xs text-gray-400">Posts</div>
          </div>
          <button className="text-center hover:opacity-70 transition-opacity" onClick={() => navigate('/friends?tab=friends')}>
            <div className="font-bold text-gray-900 dark:text-white">{p?.follower_count || 0}</div>
            <div className="text-xs text-gray-400">Followers</div>
          </button>
          <button className="text-center hover:opacity-70 transition-opacity" onClick={() => navigate('/friends?tab=friends')}>
            <div className="font-bold text-gray-900 dark:text-white">{p?.following_count || 0}</div>
            <div className="text-xs text-gray-400">Following</div>
          </button>
          <div className="text-center">
            <div className="font-bold text-gray-900 dark:text-white">{p?.xp || 0}</div>
            <div className="text-xs text-gray-400">XP</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1">
        {PROFILE_TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={clsx(
            'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
            activeTab === t ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card' : 'text-gray-500 dark:text-gray-400'
          )}>{t}</button>
        ))}
      </div>

      {activeTab === 'Posts' && (
        <div className="space-y-4">

          {/* ── Timeline compose box ─────────────────────────────── */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Avatar src={myProfile?.avatar_url} name={myProfile?.full_name} size={32} />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {isOwn ? "What's on your mind?" : `Write on ${p?.full_name?.split(' ')[0]}'s timeline`}
              </span>
            </div>
            <MentionTextarea
              value={timelineText}
              onChange={setTimelineText}
              onMentionsChange={setTimelineMentions}
              placeholder={isOwn ? "Share something with your followers..." : `Say something to ${p?.full_name?.split(' ')[0]}...`}
              rows={3}
            />
            {timelinePreview && (
              <div className="relative rounded-xl overflow-hidden">
                <img src={timelinePreview} alt="Preview" className="w-full max-h-48 object-cover" />
                <button onClick={() => { setTimelineImage(null); setTimelinePreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-surface-100 dark:border-white/10">
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs gap-1.5 text-green-500">
                  <ImageIcon size={16} /> Photo
                </button>
                <button className="btn-ghost text-xs gap-1.5 text-amber-400">
                  <Smile size={16} /> Feeling
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files[0]
                    if (!f) return
                    setTimelineImage(f)
                    setTimelinePreview(URL.createObjectURL(f))
                  }} />
              </div>
              <button
                onClick={handleTimelinePost}
                disabled={(!timelineText.trim() && !timelineImage) || timelinePosting}
                className="btn-primary text-xs px-4 py-1.5"
              >
                {timelinePosting ? <Loader2 size={14} className="animate-spin" /> : 'Post'}
              </button>
            </div>
          </div>

          {/* ── Posts feed ──────────────────────────────────────── */}
          {postsLoading
            ? <div className="space-y-4">{[1,2].map(i => <PostSkeleton key={i} />)}</div>
            : posts?.length === 0
              ? <EmptyState icon="📝" title="No posts yet" description={isOwn ? 'Share something with the world!' : 'Nothing posted yet.'} />
              : posts.map(post => <PostCard key={post.id} post={post} />)
          }
        </div>
      )}

      {activeTab === 'Videos' && (
        <div>
          {videosLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="aspect-video rounded-xl bg-surface-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : videoPosts.length === 0 ? (
            <div className="card p-10 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center">
                <VideoIcon size={24} className="text-purple-400" />
              </div>
              <div>
                <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">No videos yet</div>
                <div className="text-xs text-gray-400">
                  {isOwn ? 'Share your first video — tap the 🎬 button when creating a post.' : 'No videos posted yet.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {videoPosts.map(post => (
                <VideoThumb key={post.id} post={post} onClick={() => navigate(`/post/${post.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Badges' && (
        <div className="card p-5">
          <p className="text-xs text-gray-400 mb-4">{badges.length}/{BADGES.length} badges earned</p>
          <BadgeDisplay earnedBadgeIds={badges} />
        </div>
      )}
    </div>
  )
}
