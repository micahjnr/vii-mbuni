import { useQuery } from '@tanstack/react-query'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import XPBadge from './XPBadge'
import { Skeleton } from '@/components/ui/PageLoader'
import { Trophy } from 'lucide-react'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const { data: leaders, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const { data } = await sb
        .from('profiles')
        .select('id, full_name, username, avatar_url, xp, level, streak_days')
        .order('xp', { ascending: false })
        .limit(10)
      return data || []
    },
    staleTime: 300_000, // 5 min — leaderboard doesn't need to be real-time
  })

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-amber-400" />
        <h2 className="font-bold text-sm text-gray-900 dark:text-white">Top Members</h2>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {leaders?.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="text-lg w-6 text-center flex-shrink-0">
                {i < 3 ? MEDALS[i] : <span className="text-xs font-bold text-gray-400">#{i + 1}</span>}
              </span>
              <Avatar src={p.avatar_url} name={p.full_name} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.full_name}</div>
                <div className="text-xs text-gray-400">@{p.username}</div>
              </div>
              <XPBadge xp={p.xp} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
