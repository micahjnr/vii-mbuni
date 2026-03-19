import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import XPBadge from '@/components/gamification/XPBadge'
import { Skeleton } from '@/components/ui/PageLoader'
import toast from 'react-hot-toast'

export default function PeopleYouMayKnow() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Fetch existing friend connections to exclude
  const { data: myFriendIds = [] } = useQuery({
    queryKey: ['my-friend-ids', user?.id],
    queryFn: async () => {
      const { data } = await sb
        .from('friends')
        .select('friend_id, user_id')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      return (data || []).flatMap(f => [f.user_id, f.friend_id]).filter(id => id !== user.id)
    },
    enabled: !!user,
  })

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['people-suggestions', user?.id, myFriendIds.length],
    queryFn: async () => {
      // Fetch all registered users, exclude self and existing friends/pending
      let query = sb
        .from('profiles')
        .select('id, username, full_name, avatar_url, xp, bio')
        .order('full_name', { ascending: true })
        .limit(50)
      // Exclude self and anyone already connected
      const excludeIds = [user.id, ...myFriendIds]
      excludeIds.forEach(id => { query = query.neq('id', id) })
      const { data } = await query
      return data || []
    },
    enabled: !!user,
    staleTime: 300_000, // 5 min
  })

  const addFriend = useMutation({
    mutationFn: async (friendId) => {
      await sb.from('friends').insert({ user_id: user.id, friend_id: friendId, status: 'pending' })
    },
    onSuccess: () => {
      qc.invalidateQueries(['my-friend-ids'])
      qc.invalidateQueries(['people-suggestions'])
      toast.success('Friend request sent! 👋')
    },
    onError: () => toast.error('Could not send request'),
  })

  if (!isLoading && (!suggestions || suggestions.length === 0)) return null

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-brand-500" />
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">People You May Know</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto scrollbar-hide pr-1">
          {suggestions.map(person => (
            <div key={person.id} className="flex items-center gap-3">
              <div
                className="cursor-pointer flex-shrink-0"
                onClick={() => navigate(`/profile/${person.id}`)}
              >
                <Avatar src={person.avatar_url} name={person.full_name} size={38} />
              </div>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/profile/${person.id}`)}
              >
                <div className="font-semibold text-sm text-gray-900 dark:text-white truncate leading-tight">
                  {person.full_name}
                </div>
                <div className="text-xs text-gray-400 truncate">@{person.username}</div>
                {person.xp > 0 && (
                  <div className="mt-0.5">
                    <XPBadge xp={person.xp} size="xs" />
                  </div>
                )}
              </div>
              <button
                onClick={() => addFriend.mutate(person.id)}
                disabled={addFriend.isPending}
                className="btn-secondary text-xs px-2.5 py-1.5 gap-1 flex-shrink-0"
              >
                <UserPlus size={12} />
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
