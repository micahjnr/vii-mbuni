import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import sb from '@/lib/supabase'
import PostCard from '@/components/feed/PostCard'
import { PostSkeleton, EmptyState } from '@/components/ui/PageLoader'
import { Bookmark } from 'lucide-react'
import { useRef, useCallback } from 'react'

const PAGE_SIZE = 10

export default function Bookmarks() {
  const { user } = useAuthStore()
  const bottomRef = useRef(null)
  const observerRef = useRef(null)

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1
      const { data } = await sb
        .from('bookmarks')
        .select(`
          post_id,
          posts:post_id (
            *,
            profiles:user_id (id, username, full_name, avatar_url),
            likes(count),
            comments(count),
            comment_replies(count),
            user_liked:likes(user_id, reaction_type)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)
      const posts = (data || []).map(b => {
        const post = b.posts
        if (!post) return null
        const { likes, comments, comment_replies, ...postRest } = post
        return {
          ...postRest,
          is_bookmarked: true,
          user_liked: (post.user_liked || []).filter(l => l.user_id === user.id),
        }
      }).filter(Boolean)
      return { posts, nextPage: posts.length === PAGE_SIZE ? pageParam + 1 : null }
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: !!user,
  })

  const posts = data?.pages.flatMap(p => p.posts) || []

  const setBottomRef = useCallback(node => {
    if (!node) return
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { threshold: 0.1 })
    observerRef.current.observe(node)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Bookmark size={22} className="text-amber-500" />
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Bookmarks</h1>
        {posts.length > 0 && (
          <span className="badge bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300">{posts.length}{hasNextPage ? '+' : ''}</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <PostSkeleton key={i} />)}</div>
      ) : posts.length === 0 ? (
        <EmptyState icon="🔖" title="No bookmarks yet"
          description="Tap the bookmark icon on any post to save it here." />
      ) : (
        <>
          <div className="space-y-4">
            {posts.map(post => <PostCard key={post.id} post={post} />)}
          </div>
          <div ref={setBottomRef} className="h-8 flex items-center justify-center">
            {isFetchingNextPage && (
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce"
                    style={{ animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
