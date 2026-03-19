import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Image, Hash, X, Sparkles, Loader2, Plus, Trash2, SmilePlus, Globe, Users, Lock, RefreshCw, Check, Video } from 'lucide-react'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/PageLoader'
import { MoodSelector } from '@/components/ui/MoodTag'
import MentionTextarea from '@/components/ui/MentionTextarea'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { askGroq } from '@/lib/groq'
import { compressImage } from '@/lib/imageUtils'
import { processVideo, MAX_DURATION_SECS } from '@/lib/videoUtils'

function extractHashtags(text) {
  return [...new Set((text.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase()))]
}

function parseJson(raw) {
  try {
    const clean = raw.replace(/```json|```/gi, '').trim()
    return JSON.parse(clean)
  } catch { return null }
}

const AUDIENCE_OPTIONS = [
  { value: 'public',  icon: Globe,  label: 'Public'  },
  { value: 'friends', icon: Users,  label: 'Friends' },
  { value: 'private', icon: Lock,   label: 'Only me' },
]

export default function CreatePostModal({ onClose, quotedPost = null }) {
  const { user, profile } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef()

  const [content, setContent]           = useState('')
  const [mentionedIds, setMentionedIds] = useState([])
  const [imageFile, setImageFile]       = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [videoFile, setVideoFile]       = useState(null)
  const [videoPreview, setVideoPreview] = useState(null)
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [videoProgress, setVideoProgress]     = useState(0)
  const [videoMeta, setVideoMeta]             = useState(null)
  const [alsoPostToReels, setAlsoPostToReels] = useState(false)
  const [audience, setAudience]         = useState('public')
  const [mood, setMood]                 = useState(null)
  const [tab, setTab]                   = useState('post')
  const [pollOptions, setPollOptions]   = useState(['', ''])
  const [draftRestored, setDraftRestored] = useState(false)
  const videoRef = useRef()

  // AI state
  const [aiCaptions, setAiCaptions]       = useState([])
  const [aiHashtags, setAiHashtags]       = useState([])
  const [usedHashtags, setUsedHashtags]   = useState(new Set())
  const [aiLoading, setAiLoading]         = useState(false)
  const [aiLoadingType, setAiLoadingType] = useState(null) // 'captions' | 'hashtags' | 'both'
  const [selectedCaption, setSelectedCaption] = useState(null)

  const handleImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    // Clear video if switching to image
    clearVideo()
    // Show preview immediately with original file
    setImagePreview(URL.createObjectURL(file))
    // Compress in background before setting the file for upload
    try {
      const compressed = await compressImage(file)
      setImageFile(compressed)
    } catch {
      // Compression failed — use original file
      setImageFile(file)
    }
  }

  const handleVideo = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Soft pre-check: warn if clearly huge before we even try (500 MB+)
    if (file.size > 500 * 1024 * 1024) {
      toast.error('File too large. Please choose a video under 500 MB.')
      return
    }

    // Clear image if switching to video
    setImageFile(null)
    setImagePreview(null)
    // Reset previous video
    clearVideo()

    // Show the original file as preview immediately so user sees something
    const originalUrl = URL.createObjectURL(file)
    setVideoPreview(originalUrl)
    setVideoProcessing(true)
    setVideoProgress(0)
    setVideoMeta(null)

    try {
      const originalMB = file.size / (1024 * 1024)
      const result = await processVideo(file, (pct) => setVideoProgress(pct))
      const finalMB = result.file.size / (1024 * 1024)

      // Swap preview to the processed file
      URL.revokeObjectURL(originalUrl)
      const processedUrl = URL.createObjectURL(result.file)
      setVideoPreview(processedUrl)
      setVideoFile(result.file)
      setVideoMeta({
        durationSecs:   result.durationSecs,
        wasTrimmed:     result.wasTrimmed,
        wasCompressed:  result.wasCompressed,
        originalMB,
        finalMB,
      })

      // Surface useful info to the user
      if (result.wasTrimmed) {
        toast(`✂️ Trimmed to ${MAX_DURATION_SECS / 60} minutes`, { icon: '⏱️' })
      }
      if (result.wasCompressed) {
        const saved = Math.round(100 - (finalMB / originalMB) * 100)
        toast.success(`Video compressed — saved ${saved}% (${originalMB.toFixed(0)} MB → ${finalMB.toFixed(1)} MB)`)
      }
    } catch (err) {
      // Compression failed — fall back to original file with just a size warning
      const fallbackMB = file.size / (1024 * 1024)
      if (fallbackMB > 50) {
        toast.error(`Could not compress video (${fallbackMB.toFixed(0)} MB). Try a shorter or smaller clip.`)
        clearVideo()
      } else {
        // Small enough to upload as-is
        setVideoFile(file)
        setVideoMeta({ durationSecs: 0, wasTrimmed: false, wasCompressed: false, originalMB: fallbackMB, finalMB: fallbackMB })
        toast('Video ready (compression unavailable in this browser)', { icon: '⚠️' })
      }
    } finally {
      setVideoProcessing(false)
      setVideoProgress(0)
    }
  }

  const clearVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(null)
    setVideoPreview(null)
    setVideoProcessing(false)
    setVideoProgress(0)
    setVideoMeta(null)
    setAlsoPostToReels(false)
  }

  // Load saved draft on first open (skip if quoting — that's intentional)
  useEffect(() => {
    if (quotedPost) return
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null')
      if (saved?.content) { setContent(saved.content); setMood(saved.mood || null); setDraftRestored(true) }
    } catch (_) {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draft autosave ────────────────────────────────────────
  // Each tab gets its own draft slot so two open tabs don't clobber each other.
  const draftKey = (() => {
    if (typeof window === 'undefined') return 'vii-post-draft'
    if (!sessionStorage.getItem('vii-tab-id')) {
      sessionStorage.setItem('vii-tab-id', Math.random().toString(36).slice(2))
    }
    return `vii-post-draft-${sessionStorage.getItem('vii-tab-id')}`
  })()

  // Autosave draft 1s after user stops typing
  useEffect(() => {
    if (quotedPost) return
    const t = setTimeout(() => {
      if (content.trim()) {
        localStorage.setItem(draftKey, JSON.stringify({ content, mood }))
      } else {
        localStorage.removeItem(draftKey)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [content, mood, quotedPost, draftKey])
  // Convert image file to base64 data URL for AI context
  const getImageContext = async () => {
    if (!imageFile) return null
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(imageFile)
    })
  }

  const runAI = async (type) => {
    const ctx = content.trim()
    const hasImage = !!imageFile
    if (!ctx && !hasImage) return toast.error('Write something or add a photo first!')

    const context = ctx || (hasImage ? 'a photo post' : 'general social media post')
    setAiLoading(true)
    setAiLoadingType(type)
    if (type === 'captions' || type === 'both') setAiCaptions([])
    if (type === 'hashtags' || type === 'both') setAiHashtags([])

    try {
      if (type === 'both') {
        // Single API call returning both — faster and cheaper
        const raw = await askGroq(
          `You are a social media expert. For this post context: "${context}"
           Return a JSON object with exactly this shape:
           { "captions": ["caption1", "caption2", "caption3"], "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"] }
           Rules:
           - 3 captions: punchy, authentic, under 120 chars each, no hashtags inside captions
           - 8 hashtags: mix popular + niche, all start with #
           - Return ONLY the JSON object, no markdown, no extra text`,
          { system: 'Return only valid JSON. No markdown fences. No explanation.', maxTokens: 400 }
        )
        const parsed = parseJson(raw)
        if (!parsed) throw new Error('AI returned invalid JSON — please try again')
        if (Array.isArray(parsed.captions) && parsed.captions.length > 0) {
          setAiCaptions(parsed.captions.slice(0, 3))
        }
        if (Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0) {
          setAiHashtags(parsed.hashtags.slice(0, 8))
          setUsedHashtags(new Set())
        }
      } else if (type === 'captions') {
        const raw = await askGroq(
          `Write 3 punchy social media captions for: "${context}". Under 120 chars each. No hashtags inside the captions.
           Return ONLY a JSON array of 3 strings. No markdown.`,
          { system: 'Return only valid JSON array. No markdown. No explanation.', maxTokens: 400 }
        )
        const parsed = parseJson(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI returned invalid response — try again')
        setAiCaptions(parsed.slice(0, 3))
      } else if (type === 'hashtags') {
        const raw = await askGroq(
          `Suggest 8 relevant trending hashtags for: "${context}". Mix popular + niche. All start with #.
           Return ONLY a JSON array of 8 hashtag strings. No markdown.`,
          { system: 'Return only valid JSON array. No markdown. No explanation.', maxTokens: 400 }
        )
        const parsed = parseJson(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('AI returned invalid response — try again')
        setAiHashtags(parsed.slice(0, 8))
        setUsedHashtags(new Set())
      }
    } catch (e) {
      toast.error(e.message || 'AI error — check your Groq API key in Netlify')
    } finally {
      setAiLoading(false)
      setAiLoadingType(null)
    }
  }

  // ── Apply a caption ───────────────────────────────────────
  const applyCaption = (cap) => {
    // Preserve any hashtags already in the text box
    const existingTags = content.match(/#\w+/g) || []
    const tagSuffix = existingTags.length > 0 ? '\n' + existingTags.join(' ') : ''
    setContent(cap + tagSuffix)
    setSelectedCaption(cap)
  }

  // ── Add a hashtag inline ──────────────────────────────────
  const addHashtag = (tag) => {
    if (usedHashtags.has(tag)) return
    setContent(c => {
      const trimmed = c.trimEnd()
      return trimmed ? trimmed + ' ' + tag : tag
    })
    setUsedHashtags(prev => new Set([...prev, tag]))
  }

  // ── Add all unused hashtags at once ──────────────────────
  const addAllHashtags = () => {
    const unused = aiHashtags.filter(t => !usedHashtags.has(t))
    if (!unused.length) return
    setContent(c => {
      const trimmed = c.trimEnd()
      return trimmed ? trimmed + '\n' + unused.join(' ') : unused.join(' ')
    })
    setUsedHashtags(new Set(aiHashtags))
  }

  const postMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = null
      let videoUrl = null

      if (imageFile) {
        const ext = imageFile.name?.split('.').pop() || 'jpg'
        const path = `posts/${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await sb.storage.from('images').upload(path, imageFile)
        if (upErr) throw upErr
        const { data: urlData } = sb.storage.from('images').getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }

      if (videoFile) {
        const ext = videoFile.name?.split('.').pop() || 'mp4'
        const path = `posts/${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await sb.storage.from('videos').upload(path, videoFile, {
          contentType: videoFile.type,
          cacheControl: '3600',
        })
        if (upErr) throw new Error(`Video upload failed: ${upErr.message}`)
        const { data: urlData } = sb.storage.from('videos').getPublicUrl(path)
        videoUrl = urlData.publicUrl
      }

      const hashtags = extractHashtags(content)

      let pollData = null
      if (tab === 'poll') {
        const validOptions = pollOptions.filter(o => o.trim())
        if (validOptions.length < 2) throw new Error('Add at least 2 poll options')
        pollData = JSON.stringify({ options: validOptions.map(text => ({ text, votes: 0 })) })
      }

      const { error, data: newPost } = await sb.from('posts').insert({
        user_id: user.id,
        content: content.trim(),
        image_url: imageUrl,
        video_url: videoUrl,
        audience,
        mood: mood || null,
        hashtags: hashtags.length ? hashtags : null,
        poll_data: pollData,
        quoted_post_id: quotedPost?.id || null,
        is_published: true,
        is_reel: false,
      }).select('id').single()
      if (error) throw error

      // Also post to Reels if checkbox is ticked
      if (alsoPostToReels && videoUrl) {
        await sb.from('posts').insert({
          user_id: user.id,
          content: content.trim(),
          video_url: videoUrl,
          audience,
          hashtags: hashtags.length ? hashtags : null,
          is_published: true,
          is_reel: true,
          view_count: 0,
        })
      }

      if (mentionedIds.length > 0 && newPost?.id) {
        const notifRows = mentionedIds
          .filter(id => id !== user.id)
          .map(id => ({ user_id: id, type: 'mention', actor_id: user.id, reference_id: newPost.id, is_read: false }))
        if (notifRows.length > 0) {
          sb.from('notifications').insert(notifRows).then(() => {}).catch(() => {})
        }
      }

      try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: 10 }) } catch(_) {}
      try { await sb.rpc('update_streak', { p_user_id: user.id }) } catch(_) {}
      try { await sb.rpc('check_and_award_badges', { p_user_id: user.id }) } catch(_) {}
    },
    onSuccess: () => {
      localStorage.removeItem(draftKey)
      clearVideo()
      qc.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['profile-videos'] })
      if (alsoPostToReels) qc.invalidateQueries({ queryKey: ['reels'] })
      toast.success(alsoPostToReels ? 'Posted to feed + Reels! +10 XP 🎬🎉' : 'Post published! +10 XP 🎉')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const hasContent = content.trim() || imageFile || videoFile

  return (
    <Modal title={quotedPost ? 'Quote Post' : 'Create Post'} onClose={onClose}>
      {/* Scrollable content area */}
      <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">

        {/* Draft restored notice */}
        {draftRestored && (
          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2 animate-fade-in">
            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">📝 Draft restored</span>
            <button onClick={() => { setContent(''); setMood(null); setDraftRestored(false); localStorage.removeItem(draftKey) }}
              className="text-xs text-amber-500 hover:text-amber-700 font-semibold">Discard</button>
          </div>
        )}

        {/* Author + audience */}
        <div className="flex items-center gap-3">
          <Avatar src={profile?.avatar_url} name={profile?.full_name} size={42} />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">{profile?.full_name}</div>
            <div className="flex gap-1 mt-1">
              {AUDIENCE_OPTIONS.map(({ value, icon: Icon, label }) => (
                <button key={value} onClick={() => setAudience(value)}
                  className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all',
                    audience === value
                      ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  )}>
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab: Post vs Poll */}
        <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1">
          {['post', 'poll'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                tab === t ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card' : 'text-gray-500')}>
              {t === 'poll' ? '📊 Poll' : '✍️ Post'}
            </button>
          ))}
        </div>

        {/* Quoted post */}
        {quotedPost && (
          <div className="border border-brand-200 dark:border-brand-500/30 rounded-xl p-3 bg-brand-50 dark:bg-brand-500/10">
            <div className="text-xs text-brand-500 font-semibold mb-1">Quoting @{quotedPost.profiles?.username}</div>
            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{quotedPost.content}</p>
          </div>
        )}

        {/* Text area */}
        <MentionTextarea
          value={content}
          onChange={setContent}
          onMentionsChange={setMentionedIds}
          placeholder={tab === 'poll' ? 'Ask your question...' : "What's on your mind? Use #hashtags or @mention friends"}
          rows={tab === 'poll' ? 2 : 4}
        />

        {/* Poll options */}
        {tab === 'poll' && (
          <div className="space-y-2">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={opt}
                  onChange={e => { const n = [...pollOptions]; n[i] = e.target.value; setPollOptions(n) }}
                  placeholder={`Option ${i + 1}`}
                  className="input flex-1 text-sm py-2"
                />
                {pollOptions.length > 2 && (
                  <button onClick={() => setPollOptions(p => p.filter((_, j) => j !== i))}
                    className="btn-icon text-red-400"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
            {pollOptions.length < 4 && (
              <button onClick={() => setPollOptions(p => [...p, ''])}
                className="btn-secondary text-xs w-full gap-1.5"><Plus size={14} /> Add option</button>
            )}
          </div>
        )}

        {/* Image preview */}
        {imagePreview && (
          <div className="relative rounded-xl overflow-hidden">
            <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-cover" />
            <button onClick={() => { setImageFile(null); setImagePreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Video preview + processing overlay */}
        {videoPreview && (
          <div className="relative rounded-xl overflow-hidden bg-black w-full" style={{ aspectRatio: '16/9' }}>
            <video
              src={videoPreview}
              controls={!videoProcessing}
              className="w-full h-full object-cover"
              style={{ display: 'block', opacity: videoProcessing ? 0.4 : 1 }}
              preload="metadata"
              playsInline
            />

            {/* Processing overlay */}
            {videoProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <Loader2 size={28} className="animate-spin text-purple-400" />
                <div className="text-white text-xs font-bold">Processing video…</div>
                <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all duration-300"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
                <div className="text-white/60 text-[10px]">
                  {videoProgress < 10 ? 'Analysing…' : videoProgress < 90 ? `Compressing ${videoProgress}%` : 'Finishing…'}
                </div>
              </div>
            )}

            {/* Clear button — hidden while processing */}
            {!videoProcessing && (
              <button onClick={clearVideo}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                <X size={14} />
              </button>
            )}

            {/* Stats badges — shown after processing */}
            {!videoProcessing && videoMeta && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 flex-wrap">
                <div className="bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Video size={10} /> {videoMeta.finalMB.toFixed(1)} MB
                </div>
                {videoMeta.durationSecs > 0 && (
                  <div className="bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    {Math.floor(videoMeta.durationSecs / 60)}:{String(Math.round(videoMeta.durationSecs % 60)).padStart(2, '0')}
                  </div>
                )}
                {videoMeta.wasTrimmed && (
                  <div className="bg-amber-500/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">✂️ Trimmed to 2 min</div>
                )}
                {videoMeta.wasCompressed && (
                  <div className="bg-green-500/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    ⚡ -{Math.round(100 - (videoMeta.finalMB / videoMeta.originalMB) * 100)}% size
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Also post to Reels — only shown when a video is ready */}
        {videoFile && !videoProcessing && (
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors">
            <input
              type="checkbox"
              checked={alsoPostToReels}
              onChange={e => setAlsoPostToReels(e.target.checked)}
              className="w-4 h-4 rounded accent-purple-500"
            />
            <div>
              <div className="text-xs font-bold text-purple-700 dark:text-purple-300">🎬 Also post to Reels</div>
              <div className="text-[10px] text-purple-500 dark:text-purple-400">Share this video in the Reels feed too</div>
            </div>
          </label>
        )}

        {/* Mood */}
        <div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <SmilePlus size={13} /> How are you feeling?
          </div>
          <MoodSelector value={mood} onChange={setMood} />
        </div>

        {/* ── AI CAPTION SUGGESTIONS ── */}}
        {aiCaptions.length > 0 && (
          <div className="space-y-2 bg-brand-50 dark:bg-brand-500/10 rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-brand-600 dark:text-brand-400 flex items-center gap-1.5">
                <Sparkles size={13} /> AI Caption Suggestions
              </div>
              <button
                onClick={() => runAI('captions')}
                disabled={aiLoading}
                className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-semibold disabled:opacity-40"
              >
                <RefreshCw size={11} className={aiLoading && aiLoadingType === 'captions' ? 'animate-spin' : ''} />
                Regenerate
              </button>
            </div>
            <div className="space-y-2">
              {aiCaptions.map((cap, i) => (
                <div
                  key={i}
                  className={clsx(
                    'flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all group',
                    selectedCaption === cap
                      ? 'border-brand-400 bg-brand-100 dark:bg-brand-500/20'
                      : 'border-transparent bg-white dark:bg-white/5 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10'
                  )}
                  onClick={() => applyCaption(cap)}
                >
                  <div className="flex-1 text-sm text-gray-700 dark:text-gray-200 leading-snug">{cap}</div>
                  <div className={clsx(
                    'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all',
                    selectedCaption === cap
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-200 dark:bg-white/10 text-transparent group-hover:text-brand-400'
                  )}>
                    <Check size={11} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI HASHTAG SUGGESTIONS ── */}
        {aiHashtags.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Hash size={13} /> Suggested Hashtags
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={addAllHashtags}
                  disabled={aiHashtags.every(t => usedHashtags.has(t))}
                  className="text-xs text-amber-600 dark:text-amber-400 font-semibold hover:underline disabled:opacity-40"
                >
                  Add all
                </button>
                <button
                  onClick={() => runAI('hashtags')}
                  disabled={aiLoading}
                  className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 font-semibold disabled:opacity-40"
                >
                  <RefreshCw size={11} className={aiLoading && aiLoadingType === 'hashtags' ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {aiHashtags.map((tag, i) => {
                const used = usedHashtags.has(tag)
                return (
                  <button
                    key={i}
                    onClick={() => addHashtag(tag)}
                    disabled={used}
                    className={clsx(
                      'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border',
                      used
                        ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border-green-300 dark:border-green-500/30 cursor-default'
                        : 'bg-white dark:bg-white/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 cursor-pointer'
                    )}
                  >
                    {used && <Check size={10} />}
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 pt-1 border-t border-surface-100 dark:border-white/10">
          {tab === 'post' && (
            <>
              <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs gap-1.5">
                <Image size={16} /> Photo
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />

              <button onClick={() => videoRef.current?.click()} disabled={videoProcessing} className="btn-ghost text-xs gap-1.5 text-purple-500 hover:text-purple-600 disabled:opacity-40">
                {videoProcessing ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />} Video
              </button>
              <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={handleVideo} />
            </>
          )}

          {/* AI Assist buttons */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => runAI('captions')}
              disabled={aiLoading || !hasContent}
              title="AI caption suggestions"
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40',
                aiCaptions.length > 0
                  ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400'
                  : 'text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10'
              )}
            >
              {aiLoading && aiLoadingType === 'captions'
                ? <Loader2 size={13} className="animate-spin" />
                : <Sparkles size={13} />
              }
              Caption
            </button>
            <button
              onClick={() => runAI('hashtags')}
              disabled={aiLoading || !hasContent}
              title="AI hashtag suggestions"
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40',
                aiHashtags.length > 0
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
              )}
            >
              {aiLoading && aiLoadingType === 'hashtags'
                ? <Loader2 size={13} className="animate-spin" />
                : <Hash size={13} />
              }
              Tags
            </button>
            <button
              onClick={() => runAI('both')}
              disabled={aiLoading || !hasContent}
              title="Suggest captions + hashtags"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all disabled:opacity-40"
            >
              {aiLoading && aiLoadingType === 'both'
                ? <Loader2 size={13} className="animate-spin" />
                : <Sparkles size={13} />
              }
              Both
            </button>
          </div>
        </div>
      </div>

      {/* Pinned submit footer — always visible */}
      <div className="px-5 pb-5 pt-3 border-t border-surface-100 dark:border-white/10 flex-shrink-0">
        <button
          onClick={() => postMutation.mutate()}
          disabled={(!content.trim() && !imageFile && !videoFile && tab !== 'poll') || postMutation.isPending || videoProcessing}
          className="btn-primary w-full py-2.5"
        >
          {videoProcessing
            ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Processing video…</span>
            : postMutation.isPending
              ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {videoFile ? 'Uploading video…' : 'Publishing...'}</span>
              : tab === 'poll' ? '📊 Post Poll' : videoFile ? (alsoPostToReels ? '🎬 Post to Feed + Reels' : '🎬 Post Video') : 'Post'
          }
        </button>
      </div>
    </Modal>
  )
}
