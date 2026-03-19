import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Hash, TrendingUp, X, Clock } from 'lucide-react'
import sb from '@/lib/supabase'
import PostCard from '@/components/feed/PostCard'
import Avatar from '@/components/ui/Avatar'
import { MoodTag, MOODS } from '@/components/ui/MoodTag'
import { PostSkeleton, Skeleton } from '@/components/ui/PageLoader'
import clsx from 'clsx'

const TABS = ['Posts', 'People', 'Groups', 'Hashtags', 'Moods']

export default function Explore() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [q, setQ]         = useState(params.get('q') || '')
  const [search, setSearch] = useState(params.get('q') || '')
  const [tab, setTab]     = useState('Posts')
  const [activeMood, setActiveMood] = useState(null)
  const [activeTag, setActiveTag]   = useState(params.get('tag') || null)
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vii_recent_searches') || '[]') } catch { return [] }
  })
  const [showRecent, setShowRecent] = useState(false)
  const debounceRef = useRef(null)

  // Sync search state when URL params change (e.g. from sidebar search)
  useEffect(() => {
    const urlQ = params.get('q') || ''
    const urlTag = params.get('tag') || null
    setQ(urlQ)
    setSearch(urlQ)
    if (urlTag) setActiveTag(urlTag)
  }, [params.get('q'), params.get('tag')])

  // Debounced live search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(q), 350)
    return () => clearTimeout(debounceRef.current)
  }, [q])

  const saveRecentSearch = useCallback((term) => {
    if (!term.trim()) return
    setRecentSearches(prev => {
      const updated = [term, ...prev.filter(s => s !== term)].slice(0, 8)
      localStorage.setItem('vii_recent_searches', JSON.stringify(updated))
      return updated
    })
  }, [])

  const { data: posts, isLoading: postsLoading, isError: postsError } = useQuery({
    queryKey: ['explore-posts', search, activeMood, activeTag],
    queryFn: async () => {
      let query = sb.from('posts')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), likes(count), comments(count), comment_replies(count), user_liked:likes(user_id,reaction_type)')
        .eq('is_published', true).eq('is_reel', false)
        .order('created_at', { ascending: false }).limit(20)
      if (search)     query = query.ilike('content', `%${search}%`)
      if (activeMood) query = query.eq('mood', activeMood)
      if (activeTag)  query = query.contains('hashtags', [activeTag])
      const { data } = await query
      return data || []
    },
    enabled: tab === 'Posts' || tab === 'Moods' || tab === 'Hashtags',
  })

  const { data: people, isLoading: peopleLoading, isError: peopleError } = useQuery({
    queryKey: ['explore-people', search],
    queryFn: async () => {
      let query = sb.from('profiles').select('id,username,full_name,avatar_url,bio,xp').limit(20)
      if (search) query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%`)
      const { data } = await query
      return data || []
    },
    enabled: tab === 'People',
  })

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['explore-groups', search],
    queryFn: async () => {
      let query = sb.from('groups')
        .select('*, members:group_members(count)')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(20)
      if (search) query = query.ilike('name', `%${search}%`)
      const { data } = await query
      return data || []
    },
    enabled: tab === 'Groups',
    staleTime: 60_000,
  })

  const { data: trendingTags, isLoading: tagsLoading } = useQuery({
    queryKey: ['trending-tags'],
    queryFn: async () => {
      const { data } = await sb.from('posts')
        .select('hashtags').eq('is_published', true).not('hashtags', 'is', null).limit(200)
      const counts = {}
      ;(data || []).forEach(p => {
        ;(p.hashtags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1 })
      })
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    },
    enabled: tab === 'Hashtags',
    staleTime: 60_000,
  })

  const handleTagClick = (tag) => {
    setActiveTag(tag === activeTag ? null : tag)
    setTab('Posts')
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Explore</h1>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setActiveTag(null); setActiveMood(null) }}
          onFocus={() => setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter') { saveRecentSearch(q); setShowRecent(false) } }}
          placeholder="Search posts, people, #hashtags..."
          className="input pl-10 pr-9"
        />
        {q && (
          <button onClick={() => { setQ(''); setSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        )}
        {/* Recent searches dropdown */}
        {showRecent && recentSearches.length > 0 && !q && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-white/10 z-50 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-white/5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Searches</span>
              <button onClick={() => { setRecentSearches([]); localStorage.removeItem('vii_recent_searches') }} className="text-[11px] text-gray-400 hover:text-red-400 transition-colors">Clear</button>
            </div>
            {recentSearches.map(s => (
              <button key={s} onMouseDown={() => { setQ(s); setSearch(s); setShowRecent(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-surface-50 dark:hover:bg-white/5 text-left transition-colors">
                <Clock size={13} className="text-gray-400 flex-shrink-0" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active filters */}
      {(activeTag || activeMood) && (
        <div className="flex flex-wrap gap-2">
          {activeTag && (
            <button onClick={() => setActiveTag(null)} className="badge badge-brand gap-1.5">
              <Hash size={11} />#{activeTag} ×
            </button>
          )}
          {activeMood && (
            <button onClick={() => setActiveMood(null)} className="badge gap-1.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300">
              <MoodTag mood={activeMood} /> ×
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 bg-surface-100 dark:bg-white/5 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx(
            'flex-1 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all min-w-[70px]',
            tab === t ? 'bg-white dark:bg-surface-800 text-gray-900 dark:text-white shadow-card' : 'text-gray-500 dark:text-gray-400'
          )}>{t}</button>
        ))}
      </div>

      {/* Posts tab */}
      {(tab === 'Posts' || tab === 'Moods' || activeTag) && (
        postsLoading
          ? <div className="space-y-4">{[1,2].map(i => <PostSkeleton key={i} />)}</div>
          : postsError
            ? <div className="text-center py-16 text-gray-400">
                <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">Could not load posts</p>
                <p className="text-sm">Check your connection and try again.</p>
              </div>
            : posts?.length === 0
              ? <div className="text-center py-16 text-gray-400">No posts found</div>
              : <div className="space-y-4">{posts?.map(p => <PostCard key={p.id} post={p} />)}</div>
      )}

      {/* People tab */}
      {tab === 'People' && (
        peopleLoading
          ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-4 flex items-center gap-3"><Skeleton className="w-12 h-12 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-2.5 w-20" /></div></div>)}</div>
          : peopleError
            ? <div className="text-center py-16 text-gray-400">
                <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">Could not load people</p>
                <p className="text-sm">Check your connection and try again.</p>
              </div>
            : people?.length === 0
              ? <div className="text-center py-16 text-gray-400">{search ? 'No people found' : 'Search for people'}</div>
            : <div className="space-y-3">
                {people?.map(p => (
                  <button key={p.id} onClick={() => navigate(`/profile/${p.id}`)} className="card p-4 flex items-center gap-3 w-full text-left hover:shadow-card-lg transition-all">
                    <Avatar src={p.avatar_url} name={p.full_name} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white">{p.full_name}</div>
                      <div className="text-xs text-gray-400">@{p.username}</div>
                      {p.bio && <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{p.bio}</div>}
                    </div>
                    {p.xp > 0 && <span className="text-xs text-brand-500 font-bold">{p.xp} XP</span>}
                  </button>
                ))}
              </div>
      )}

      {/* Hashtags tab */}
      {tab === 'Hashtags' && (
        tagsLoading
          ? <Skeleton className="h-48 w-full rounded-2xl" />
          : (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-brand-500" />
                <h2 className="font-bold text-sm text-gray-900 dark:text-white">Trending Hashtags</h2>
              </div>
              {!trendingTags?.length
                ? <p className="text-gray-400 text-sm text-center py-8">No hashtags yet — start posting with #tags!</p>
                : <div className="flex flex-wrap gap-2">
                    {trendingTags.map(([tag, count]) => (
                      <button key={tag} onClick={() => handleTagClick(tag)}
                        className={clsx('badge cursor-pointer transition-all text-sm py-1.5 px-3',
                          activeTag === tag ? 'badge-brand scale-105' : 'bg-surface-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-brand-50 dark:hover:bg-brand-500/10')}>
                        #{tag}
                        <span className="ml-1 text-xs opacity-60">{count}</span>
                      </button>
                    ))}
                  </div>
              }
            </div>
          )
      )}

      {/* Groups tab */}
      {tab === 'Groups' && (
        groupsLoading
          ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-4 flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-surface-200 dark:bg-white/10 flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3.5 w-28 skeleton rounded" /><div className="h-2.5 w-20 skeleton rounded" /></div></div>)}</div>
          : !groups?.length
            ? <div className="text-center py-16 text-gray-400">{search ? 'No groups found' : 'No public groups yet'}</div>
            : <div className="space-y-3">
                {groups.map(g => (
                  <button key={g.id} onClick={() => navigate('/groups')}
                    className="card p-4 flex items-center gap-3 w-full text-left hover:shadow-card-lg transition-all">
                    <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center text-2xl flex-shrink-0">
                      {g.emoji || '👥'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white">{g.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{Number(g.members?.[0]?.count ?? 0) || 0} members</div>
                      {g.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{g.description}</div>}
                    </div>
                    <span className="badge badge-brand text-xs">Public</span>
                  </button>
                ))}
              </div>
      )}

      {/* Moods tab */}
      {tab === 'Moods' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {MOODS.map(m => (
              <button key={m.id} onClick={() => { setActiveMood(m.id === activeMood ? null : m.id); setTab('Posts') }}
                className={clsx('card p-4 flex items-center gap-3 text-left transition-all hover:shadow-card-lg',
                  activeMood === m.id && 'ring-2 ring-brand-400')}>
                <span className="text-2xl">{m.emoji}</span>
                <span className={`text-sm font-semibold ${m.color.split(' ')[2]}`}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
