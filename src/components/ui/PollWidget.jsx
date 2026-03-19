import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import sb from '@/lib/supabase'
import { useAuthStore } from '@/store'
import clsx from 'clsx'

export default function PollWidget({ poll, postId }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [optimisticVote, setOptimisticVote] = useState(null)

  if (!poll?.options) return null

  const totalVotes = poll.options.reduce((s, o) => s + (o.votes || 0), 0)
  const userVote = optimisticVote ?? poll.user_vote ?? null
  const hasVoted = !!userVote

  const voteMutation = useMutation({
    mutationFn: async (optionIndex) => {
      const { error } = await sb.from('poll_votes').upsert(
        { post_id: postId, user_id: user.id, option_index: optionIndex },
        { onConflict: 'post_id,user_id' }
      )
      if (error) throw error
    },
    onMutate: (optionIndex) => setOptimisticVote(optionIndex),
    onError: () => setOptimisticVote(null),
    onSuccess: () => qc.invalidateQueries(['feed']),
  })

  return (
    <div className="space-y-2 my-3">
      {poll.options.map((opt, i) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
        const isChosen = userVote === i
        return (
          <button
            key={i}
            onClick={() => !hasVoted && voteMutation.mutate(i)}
            disabled={hasVoted}
            className={clsx(
              'relative w-full text-left px-4 py-2.5 rounded-xl border-2 overflow-hidden transition-all',
              isChosen
                ? 'border-brand-500 text-brand-600 dark:text-brand-300'
                : hasVoted
                  ? 'border-surface-200 dark:border-white/10 text-gray-500'
                  : 'border-surface-200 dark:border-white/10 hover:border-brand-400 text-gray-700 dark:text-gray-200'
            )}
          >
            {hasVoted && (
              <div
                className={clsx('absolute inset-0 rounded-xl transition-all duration-700', isChosen ? 'bg-brand-100 dark:bg-brand-500/20' : 'bg-surface-100 dark:bg-white/5')}
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative flex items-center justify-between">
              <span className="text-sm font-medium">{opt.text}</span>
              {hasVoted && <span className="text-xs font-bold">{pct}%</span>}
            </div>
          </button>
        )
      })}
      <p className="text-xs text-gray-400">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  )
}
