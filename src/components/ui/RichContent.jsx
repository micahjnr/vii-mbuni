/**
 * RichContent
 * Renders post/comment text with:
 *  - @mentions  → tappable, navigates to /profile/:username
 *  - #hashtags  → tappable, navigates to /explore?tag=...
 */
import { useNavigate } from 'react-router-dom'
import sb from '@/lib/supabase'

export default function RichContent({ content, className = '' }) {
  const navigate = useNavigate()
  if (!content) return null

  const parts = content.split(/([@#]\w+)/g)

  const handleMentionClick = async (e, username) => {
    e.stopPropagation()
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (data?.id) navigate(`/profile/${data.id}`)
  }

  return (
    <p className={`text-gray-800 dark:text-gray-100 text-sm leading-relaxed mb-3 whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const username = part.slice(1)
          return (
            <span
              key={i}
              onClick={(e) => handleMentionClick(e, username)}
              className="text-brand-500 hover:text-brand-600 cursor-pointer font-semibold hover:underline"
            >
              {part}
            </span>
          )
        }
        if (part.startsWith('#')) {
          const tag = part.slice(1).toLowerCase()
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/explore?tag=${encodeURIComponent(tag)}`)
              }}
              className="text-brand-500 hover:text-brand-600 cursor-pointer font-medium"
            >
              {part}
            </span>
          )
        }
        return part
      })}
    </p>
  )
}
