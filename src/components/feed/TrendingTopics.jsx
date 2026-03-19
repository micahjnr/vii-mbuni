import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Hash } from 'lucide-react'
import sb from '@/lib/supabase'
import { Skeleton } from '@/components/ui/PageLoader'

export default function TrendingTopics() {
  const navigate = useNavigate()

  const { data: tags, isLoading } = useQuery({
    queryKey: ['trending-topics'],
    queryFn: async () => {
      const { data } = await sb
        .from('posts')
        .select('hashtags')
        .eq('is_published', true)
        .not('hashtags', 'is', null)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // last 7 days
        .limit(300)
      const counts = {}
      ;(data || []).forEach(p => {
        ;(p.hashtags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1 })
      })
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count }))
    },
    staleTime: 600_000, // 10 min — trending topics are slow to change
  })

  if (!isLoading && (!tags || tags.length === 0)) return null

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-brand-500" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Trending This Week</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-1">
          {tags.map(({ tag, count }, i) => (
            <button
              key={tag}
              onClick={() => navigate(`/explore?tag=${encodeURIComponent(tag)}`)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-100 dark:hover:bg-white/10 transition-colors group text-left"
            >
              <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-4">
                {i + 1}
              </span>
              <Hash size={11} className="text-brand-400 flex-shrink-0" />
              <span className="flex-1 font-semibold text-sm text-gray-800 dark:text-gray-200 group-hover:text-brand-500 transition-colors truncate">
                {tag}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
