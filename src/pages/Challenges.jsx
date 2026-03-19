import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import { PostSkeleton, EmptyState, Skeleton } from '@/components/ui/PageLoader'
import PostCard from '@/components/feed/PostCard'
import toast from 'react-hot-toast'
import { formatDistanceToNow, isPast } from 'date-fns'
import { Trophy, Clock, Users, Zap, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

function ChallengeCard({ challenge, myEntryIds, onJoin }) {
  const ended = isPast(new Date(challenge.ends_at))
  const entries = Number(challenge.entries?.[0]?.count ?? 0)
  const joined = myEntryIds.has(challenge.id)
  const endsIn = formatDistanceToNow(new Date(challenge.ends_at), { addSuffix: true })

  return (
    <div className={clsx('card p-5 transition-all', ended && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-2xl flex-shrink-0 shadow-glow-sm">
          {challenge.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 dark:text-white">{challenge.title}</h3>
            {ended && <span className="badge bg-gray-100 dark:bg-white/10 text-gray-500 text-xs">Ended</span>}
            {joined && !ended && <span className="badge bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 text-xs">✅ Participating</span>}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{challenge.description}</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><Users size={12} /> {entries} participants</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {ended ? 'Ended' : `Ends ${endsIn}`}</span>
            <span className="flex items-center gap-1 text-brand-500 font-semibold"><Zap size={12} /> +{challenge.xp_reward} XP</span>
          </div>
          <div className="mt-3 pt-3 border-t border-surface-100 dark:border-white/5 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              Tag your post with <span className="text-brand-500 font-semibold">#{challenge.hashtag}</span>
            </span>
            {!ended && !joined && (
              <button onClick={() => onJoin(challenge)} className="btn-primary text-xs px-4 py-1.5">
                Join Challenge
              </button>
            )}
          </div>
          {/* Top participants */}
          {challenge.topEntries?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-100 dark:border-white/5">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Top participants</div>
              <div className="flex items-center gap-2">
                {challenge.topEntries.slice(0,5).map((e, i) => (
                  <div key={e.user_id} className="flex flex-col items-center gap-1 relative">
                    <img src={e.profiles?.avatar_url} alt={e.profiles?.full_name}
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-surface-800 object-cover bg-surface-200"
                      onError={ev => { ev.target.style.display='none' }}
                    />
                    {i === 0 && <span className="absolute -top-1 -right-1 text-[10px]">🥇</span>}
                  </div>
                ))}
                {entries > 5 && <span className="text-xs text-gray-400 font-semibold">+{entries-5}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Challenges() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [activeChallenge, setActiveChallenge] = useState(null)

  const { data: challenges, isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const { data } = await sb.from('weekly_challenges')
        .select('*, entries:challenge_entries(count)')
        .order('starts_at', { ascending: false })
        .limit(20)
      return data || []
    },
  })

  const { data: myEntries } = useQuery({
    queryKey: ['my-challenge-entries', user?.id],
    queryFn: async () => {
      const { data } = await sb.from('challenge_entries')
        .select('challenge_id').eq('user_id', user.id)
      return new Set((data || []).map(e => e.challenge_id))
    },
    enabled: !!user,
  })

  const { data: challengePosts, isLoading: postsLoading } = useQuery({
    queryKey: ['challenge-posts', activeChallenge?.hashtag],
    queryFn: async () => {
      const { data } = await sb.from('posts')
        .select('*, profiles:user_id(id,username,full_name,avatar_url), likes(count), comments(count), user_liked:likes(user_id,reaction_type)')
        .eq('is_published', true)
        .contains('hashtags', [activeChallenge.hashtag.toLowerCase()])
        .order('created_at', { ascending: false })
        .limit(20)
      return data || []
    },
    enabled: !!activeChallenge,
  })

  const joinMutation = useMutation({
    mutationFn: async (challenge) => {
      // Use upsert so re-clicking doesn't throw a duplicate key error
      const { error } = await sb.from('challenge_entries')
        .upsert(
          { challenge_id: challenge.id, user_id: user.id },
          { onConflict: 'challenge_id,user_id', ignoreDuplicates: true }
        )
      if (error) throw error
      // award_xp is a DB function — silently ignore if it doesn't exist yet
      try { await sb.rpc('award_xp', { p_user_id: user.id, p_amount: challenge.xp_reward }) } catch(_) {}
    },
    onSuccess: (_, challenge) => {
      qc.invalidateQueries(['my-challenge-entries'])
      qc.invalidateQueries(['challenges'])
      toast.success(`Challenge joined! +${challenge.xp_reward} XP 🎉`)
    },
    onError: (e) => toast.error(e?.message?.includes('row-level') ? 'Permission denied — make sure you are logged in' : (e?.message || 'Failed to join challenge')),
  })

  const myEntryIds = myEntries || new Set()
  const active = (challenges || []).filter(c => !isPast(new Date(c.ends_at)))
  const past   = (challenges || []).filter(c => isPast(new Date(c.ends_at)))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Trophy size={24} className="text-amber-400" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Challenges</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Active Now</h2>
              <div className="space-y-3">
                {active.map(c => (
                  <div key={c.id}>
                    <ChallengeCard challenge={c} myEntryIds={myEntryIds} onJoin={joinMutation.mutate} />
                    <button onClick={() => setActiveChallenge(a => a?.id === c.id ? null : c)}
                      className="mt-2 text-xs text-brand-500 hover:text-brand-600 font-semibold ml-1 flex items-center gap-1">
                      {activeChallenge?.id === c.id ? '▲ Hide posts' : `▼ See #${c.hashtag} posts`}
                    </button>
                    {activeChallenge?.id === c.id && (
                      <div className="mt-3 space-y-3">
                        {postsLoading ? <PostSkeleton /> : challengePosts?.length === 0
                          ? <p className="text-sm text-gray-400 text-center py-4">No posts yet — be the first!</p>
                          : challengePosts.map(p => <PostCard key={p.id} post={p} />)
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {active.length === 0 && (
            <EmptyState icon="🏆" title="No active challenges" description="Check back soon for new weekly challenges!" />
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Past Challenges</h2>
              <div className="space-y-3">
                {past.map(c => (
                  <ChallengeCard key={c.id} challenge={c} myEntryIds={myEntryIds} onJoin={() => {}} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
