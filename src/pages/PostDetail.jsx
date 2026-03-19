import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import PostCard from '@/components/feed/PostCard'
import { PostSkeleton, EmptyState } from '@/components/ui/PageLoader'

export default function PostDetail() {
  const { postId } = useParams()
  const [searchParams] = useSearchParams()
  const openComments = searchParams.get('comments') === '1'
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['post-detail', postId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('posts')
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url),
          likes(count),
          comments(count),
          comment_replies(count),
          user_liked:likes(user_id, reaction_type),
          is_bookmarked:bookmarks(user_id)
        `)
        .eq('id', postId)
        .eq('user_liked.user_id', user?.id)
        .eq('is_bookmarked.user_id', user?.id)
        .single()
      if (error) throw error
      return {
        ...data,
        is_bookmarked: Array.isArray(data.is_bookmarked) && data.is_bookmarked.length > 0,
      }
    },
    enabled: !!postId && !!user,
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {isLoading ? (
        <PostSkeleton />
      ) : isError || !post ? (
        <EmptyState
          icon="🔍"
          title="Post not found"
          description="This post may have been deleted or is not available."
          action={
            <button onClick={() => navigate('/')} className="btn-primary">
              Go Home
            </button>
          }
        />
      ) : (
        <PostCard post={post} autoOpenComments={openComments} />
      )}
    </div>
  )
}
