import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, Lock, Globe, Search, X, Loader2, ArrowLeft, Image, Heart, MessageCircle, Send, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Skeleton, EmptyState, Modal } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function groupEmoji(group) { return group?.emoji || '👥' }
function groupName(group) { return group?.name || '' }


// ── Group Post Card ───────────────────────────────────────────
function GroupPostCard({ post, user, groupId, qc }) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(Number(post.likes?.[0]?.count ?? 0))
  const [showComment, setShowComment] = useState(false)
  const [commentText, setCommentText] = useState('')
  const isOwn = post.user_id === user?.id

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (liked) {
        await sb.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      } else {
        await sb.from('likes').upsert({ post_id: post.id, user_id: user.id, reaction_type: 'like' }, { onConflict: 'post_id,user_id' })
      }
    },
    onMutate: () => {
      const was = liked
      setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1)
      return { was }
    },
    onError: (_e, _v, ctx) => { setLiked(ctx.was); setLikeCount(c => ctx.was ? c + 1 : c - 1) },
  })

  const commentMutation = useMutation({
    mutationFn: async (text) => {
      const { error } = await sb.from('comments').insert({ post_id: post.id, user_id: user.id, content: text.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      setCommentText('')
      setShowComment(false)
      qc.invalidateQueries(['group-posts', groupId])
      toast.success('Comment added!')
    },
    onError: () => toast.error('Failed to add comment'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => sb.from('posts').delete().eq('id', post.id),
    onSuccess: () => { qc.invalidateQueries(['group-posts', groupId]); toast.success('Post deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar src={post.profiles?.avatar_url} name={post.profiles?.full_name} size={38} />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">{post.profiles?.full_name}</div>
            <div className="text-xs text-gray-400">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</div>
          </div>
        </div>
        {isOwn && (
          <button onClick={() => deleteMutation.mutate()} className="btn-icon text-gray-400 hover:text-red-500">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {post.content && <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>}
      {post.image_url && (
        <div className="rounded-xl overflow-hidden bg-surface-100 dark:bg-surface-800">
          <img src={post.image_url} alt="" className="w-full object-cover max-h-80" loading="lazy" />
        </div>
      )}

      <div className="flex items-center gap-1 pt-1 border-t border-surface-100 dark:border-white/5">
        <button onClick={() => likeMutation.mutate()} className={clsx('reaction-btn', liked && 'liked')}>
          <Heart size={15} className={liked ? 'fill-current' : ''} />
          {likeCount > 0 && <span>{likeCount}</span>}
          <span className="hidden sm:inline">Like</span>
        </button>
        <button onClick={() => setShowComment(v => !v)} className={clsx('reaction-btn', showComment && 'text-blue-500')}>
          <MessageCircle size={15} />
          {Number(post.comments?.[0]?.count ?? 0) > 0 && <span>{Number(post.comments[0].count)}</span>}
          <span className="hidden sm:inline">Comment</span>
        </button>
      </div>

      {showComment && (
        <div className="flex gap-2">
          <Avatar src={user?.user_metadata?.avatar_url} name={user?.email} size={28} />
          <div className="flex-1 flex gap-2">
            <input value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commentText.trim() && commentMutation.mutate(commentText)}
              placeholder="Write a comment..." className="input flex-1 text-xs py-2" autoFocus />
            <button onClick={() => commentText.trim() && commentMutation.mutate(commentText)}
              disabled={!commentText.trim() || commentMutation.isPending}
              className="btn-primary px-3 py-2 text-xs">
              {commentMutation.isPending ? '...' : <Send size={13} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create Group Post Modal ───────────────────────────────────
function CreateGroupPostModal({ group, user, onClose, qc }) {
  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const fileRef = useState(null)

  const mutation = useMutation({
    mutationFn: async () => {
      let image_url = null
      if (imageFile) {
        // Safe extension fallback — mobile cameras sometimes produce blobs with no extension
        const ext = (imageFile.name?.split('.').pop() || 'jpg').toLowerCase()
        // Use posts/ path — matches the storage INSERT policy whitelist
        const path = `posts/${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await sb.storage.from('images').upload(path, imageFile)
        if (upErr) throw new Error(upErr.message || 'Image upload failed')
        const { data } = sb.storage.from('images').getPublicUrl(path)
        image_url = data.publicUrl
      }
      // audience must be 'public'|'friends'|'private' — 'group' violates the DB CHECK constraint
      const { error } = await sb.from('posts').insert({
        user_id: user.id,
        content: content.trim(),
        image_url,
        group_id: group.id,
        is_published: true,
        is_reel: false,
        audience: 'public',
      })
      if (error) throw new Error(error.message || 'Failed to post in group')
    },
    onSuccess: () => {
      qc.invalidateQueries(['group-posts', group.id])
      toast.success('Post shared to group! 🎉')
      onClose()
    },
    onError: (e) => toast.error(e.message || 'Failed to post'),
  })

  const handleImage = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setImageFile(f)
    setImagePreview(URL.createObjectURL(f))
  }

  return (
    <Modal title={`Post in ${groupEmoji(group)} ${groupName(group)}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar src={user?.user_metadata?.avatar_url} name={user?.email} size={38} />
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{user?.user_metadata?.full_name ?? user?.email}</div>
        </div>
        <textarea value={content} onChange={e => setContent(e.target.value)}
          placeholder={`Share something with ${group.name}...`} rows={4} className="input resize-none text-sm leading-relaxed" />
        {imagePreview && (
          <div className="relative rounded-xl overflow-hidden">
            <img src={imagePreview} alt="" className="w-full max-h-56 object-cover" />
            <button onClick={() => { setImageFile(null); setImagePreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white">
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-surface-100 dark:border-white/10">
          <label className="btn-ghost text-xs gap-1.5 cursor-pointer">
            <Image size={15} /> Photo
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </label>
          <button onClick={() => mutation.mutate()} disabled={(!content.trim() && !imageFile) || mutation.isPending}
            className="btn-primary ml-auto px-5">
            {mutation.isPending ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Posting...</span> : 'Post'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Group Feed ────────────────────────────────────────────────
function GroupFeed({ group, user, onBack }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const { profile } = useAuthStore()

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['group-posts', group.id],
    queryFn: async () => {
      // Try fetching by group_id first; fall back to recent posts if column doesn't exist
      const { data, error } = await sb
        .from('posts')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), group:group_id(id,name,emoji,privacy,is_private), likes(count), comments(count)')
        .eq('group_id', group.id)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error?.code === '42703') {
        // group_id column doesn't exist yet — show empty with a note
        return []
      }
      if (error) throw error
      return data || []
    },
    enabled: !!group.id,
  })

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Group header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-icon"><ArrowLeft size={20} /></button>
        <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center text-xl flex-shrink-0">
          {groupEmoji(group)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-gray-900 dark:text-white truncate">{group.name}</h2>
          {group.description && <p className="text-xs text-gray-400 truncate">{group.description}</p>}
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs gap-1.5 flex-shrink-0">
          <Plus size={14} /> Post
        </button>
      </div>

      {/* Create post prompt */}
      <button onClick={() => setCreateOpen(true)} className="card w-full p-4 flex items-center gap-3 hover:bg-surface-50 dark:hover:bg-white/5 transition-colors text-left">
        <Avatar src={profile?.avatar_url} name={profile?.full_name} size={38} />
        <span className="text-sm text-gray-400 dark:text-gray-500 flex-1">Share something with the group...</span>
        <div className="btn-primary text-xs px-3 py-1.5">Post</div>
      </button>

      {/* Posts feed */}
      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : posts.length === 0 ? (
        <EmptyState icon="📝" title="No posts yet" description="Be the first to post in this group!" action={
          <button onClick={() => setCreateOpen(true)} className="btn-primary mt-2">Create First Post</button>
        } />
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <GroupPostCard key={post.id} post={post} user={user} groupId={group.id} qc={qc} />
          ))}
        </div>
      )}

      {createOpen && <CreateGroupPostModal group={group} user={user} onClose={() => setCreateOpen(false)} qc={qc} />}
    </div>
  )
}

// ── Groups Page ───────────────────────────────────────────────
export default function Groups() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState('Discover')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async () => {
      const [groupsRes, memberRes] = await Promise.all([
        sb.from('groups').select('*, group_members(count)').order('created_at', { ascending: false }).limit(30),
        sb.from('group_members').select('group_id').eq('user_id', user.id),
      ])
      if (groupsRes.error) throw groupsRes.error
      // memberRes may fail on RLS violations — fall back to empty set rather than crashing
      const myGroupIds = new Set((memberRes.error ? [] : (memberRes.data || [])).map(m => m.group_id))
      return { all: groupsRes.data || [], myGroupIds }
    },
    enabled: !!user,
  })

  const joinMutation = useMutation({
    mutationFn: async (groupId) => {
      await sb.from('group_members').insert({ group_id: groupId, user_id: user.id, role: 'member' })
      // Notify group admin
      const { data: grp } = await sb.from('groups').select('created_by, name').eq('id', groupId).single()
      if (grp?.created_by && grp.created_by !== user.id) {
        sb.from('notifications').insert({
          user_id: grp.created_by, actor_id: user.id,
          type: 'group_join', reference_id: groupId,
          is_read: false, extra_data: { groupName: grp.name },
        }).then(() => {}).catch(() => {})
      }
    },
    onSuccess: () => { qc.invalidateQueries(['groups']); toast.success('Joined group!') },
    onError: () => toast.error('Could not join group'),
  })

  const leaveMutation = useMutation({
    mutationFn: (groupId) => sb.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id),
    onSuccess: () => { qc.invalidateQueries(['groups']); toast.success('Left group') },
    onError: () => toast.error('Could not leave group'),
  })

  const all = data?.all || []
  const myGroupIds = data?.myGroupIds || new Set()
  const q = search.toLowerCase()
  const filtered = all.filter(g => !q || g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q))
  const myGroups = filtered.filter(g => myGroupIds.has(g.id))
  const discover = filtered.filter(g => !myGroupIds.has(g.id))

  // Show group feed if one is selected
  if (activeGroup) {
    return <GroupFeed group={activeGroup} user={user} onBack={() => setActiveGroup(null)} />
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Groups</h1>
        <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs gap-1.5"><Plus size={14} /> Create Group</button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups..." className="input pl-10" />
      </div>

      <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1">
        {['Discover', 'My Groups'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx(
            'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
            tab === t ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card' : 'text-gray-500 dark:text-gray-400'
          )}>{t}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : tab === 'Discover' ? (
        discover.length === 0
          ? <EmptyState icon="🔍" title="No groups found" description="Try a different search or create one!" />
          : <div className="space-y-3">
              {discover.map(g => (
                <GroupCard key={g.id} group={g} isMember={false}
                  onJoin={() => joinMutation.mutate(g.id)}
                  onLeave={() => leaveMutation.mutate(g.id)}
                  onOpen={() => setActiveGroup(g)}
                />
              ))}
            </div>
      ) : (
        myGroups.length === 0
          ? <EmptyState icon="👥" title="No groups yet" description="Join a group from Discover!" />
          : <div className="space-y-3">
              {myGroups.map(g => (
                <GroupCard key={g.id} group={g} isMember={true}
                  onJoin={() => joinMutation.mutate(g.id)}
                  onLeave={() => leaveMutation.mutate(g.id)}
                  onOpen={() => setActiveGroup(g)}
                />
              ))}
            </div>
      )}

      {createOpen && <CreateGroupModal onClose={() => setCreateOpen(false)} user={user} qc={qc} />}
    </div>
  )
}

function GroupCard({ group, isMember, onJoin, onLeave, onOpen }) {
  const memberCount = Number(group.group_members?.[0]?.count ?? 0) || 0
  const [confirmLeave, setConfirmLeave] = useState(false)
  return (
    <div className="card p-4 flex items-center gap-4">
      <button onClick={onOpen} className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center flex-shrink-0 text-2xl hover:opacity-90 transition-opacity">
        {groupEmoji(group)}
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{group.name}</h3>
          {group.is_private ? <Lock size={12} className="text-gray-400 flex-shrink-0" /> : <Globe size={12} className="text-gray-400 flex-shrink-0" />}
        </div>
        {group.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{group.description}</p>}
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Users size={11} /> {memberCount} members</p>
      </button>
      <div className="flex flex-col gap-1.5">
        {isMember && (
          <button onClick={onOpen} className="btn-primary text-xs px-3 py-1.5">View</button>
        )}
        {isMember ? (
          confirmLeave ? (
            <div className="flex gap-1">
              <button onClick={() => { onLeave(); setConfirmLeave(false) }} className="text-xs px-2 py-1.5 btn-secondary text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">Yes, leave</button>
              <button onClick={() => setConfirmLeave(false)} className="text-xs px-2 py-1.5 btn-secondary">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmLeave(true)} className="btn-secondary text-xs px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">Leave</button>
          )
        ) : (
          <button onClick={onJoin} className="btn-primary text-xs px-3 py-1.5">Join</button>
        )}
      </div>
    </div>
  )
}

function CreateGroupModal({ onClose, user, qc }) {
  const [form, setForm] = useState({ name: '', description: '', emoji: '👥', privacy: 'public' })
  const mutation = useMutation({
    mutationFn: async () => {
      const { data: group, error } = await sb.from('groups').insert({
        name: form.name.trim(),
        description: form.description || null,
        emoji: form.emoji,
        is_private: form.privacy === 'private',
        owner_id: user.id,
      }).select().single()
      if (error) throw error
      await sb.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'admin' })
    },
    onSuccess: () => { qc.invalidateQueries(['groups']); toast.success('Group created! 🎉'); onClose() },
    onError: (e) => toast.error(e.message || 'Failed to create group'),
  })
  const EMOJIS = ['👥', '🎮', '📚', '🎵', '💼', '🌍', '🏋️', '🎨', '🍕', '💡']
  return (
    <Modal title="Create Group" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 block">Group Icon</label>
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={clsx('w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all',
                  form.emoji === e ? 'bg-brand-100 dark:bg-brand-500/20 ring-2 ring-brand-500' : 'bg-surface-100 dark:bg-white/10 hover:bg-surface-200')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Group name *" className="input" />
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" rows={3} className="input resize-none" />
        <label className="flex items-center gap-3 cursor-pointer">
          <div onClick={() => setForm(f => ({ ...f, privacy: f.privacy === 'private' ? 'public' : 'private' }))}
            className={clsx('w-10 h-5 rounded-full transition-all relative cursor-pointer', form.privacy === 'private' ? 'bg-brand-500' : 'bg-surface-200 dark:bg-white/20')}>
            <div className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', form.privacy === 'private' ? 'left-5' : 'left-0.5')} />
          </div>
          <span className="text-sm text-gray-700 dark:text-gray-200">Private group {form.privacy === 'private' ? '🔒' : '🌍'}</span>
        </label>
        <button onClick={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending} className="btn-primary w-full py-2.5">
          {mutation.isPending ? <span className="flex items-center gap-2 justify-center"><Loader2 size={16} className="animate-spin" /> Creating...</span> : 'Create Group'}
        </button>
      </div>
    </Modal>
  )
}
