// Emoji reaction picker — replaces the plain Like button
import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'

export const REACTIONS = [
  { type: 'like',    emoji: '👍', label: 'Like',    color: 'text-blue-500' },
  { type: 'love',    emoji: '❤️', label: 'Love',    color: 'text-red-500' },
  { type: 'haha',    emoji: '😂', label: 'Haha',    color: 'text-yellow-500' },
  { type: 'wow',     emoji: '😮', label: 'Wow',     color: 'text-yellow-400' },
  { type: 'sad',     emoji: '😢', label: 'Sad',     color: 'text-blue-400' },
  { type: 'angry',   emoji: '😡', label: 'Angry',   color: 'text-red-600' },
]

export function reactionEmoji(type) {
  return REACTIONS.find(r => r.type === type)?.emoji ?? '👍'
}

export default function ReactionPicker({ onReact, currentReaction, count = 0 }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const timerRef = useRef(null)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Cleanup hover timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleMouseEnter = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), 400)
  }
  const handleMouseLeave = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(false), 300)
  }

  const handleClick = () => {
    if (currentReaction) {
      onReact(null) // unlike
    } else {
      onReact('like')
    }
  }

  const handleReact = (type) => {
    onReact(currentReaction === type ? null : type)
    setOpen(false)
  }

  const current = REACTIONS.find(r => r.type === currentReaction)

  return (
    <div ref={ref} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Picker popup */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 animate-fade-up">
          <div className="flex items-center gap-1 bg-white dark:bg-surface-800 rounded-2xl shadow-card-lg border border-surface-200 dark:border-white/10 px-2 py-1.5">
            {REACTIONS.map(r => (
              <button
                key={r.type}
                onClick={() => handleReact(r.type)}
                onMouseEnter={() => setHovered(r.type)}
                onMouseLeave={() => setHovered(null)}
                className={clsx(
                  'relative flex flex-col items-center transition-transform duration-150',
                  hovered === r.type ? 'scale-125 -translate-y-1' : 'scale-100',
                  currentReaction === r.type && 'scale-110'
                )}
                title={r.label}
              >
                <span className="text-2xl leading-none">{r.emoji}</span>
                {hovered === r.type && (
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-gray-800 text-white rounded-md px-1.5 py-0.5 whitespace-nowrap font-semibold">
                    {r.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main button */}
      <button
        onClick={handleClick}
        className={clsx(
          'reaction-btn',
          current && current.color,
          current && 'bg-opacity-10'
        )}
      >
        <span className="text-base leading-none">{current ? current.emoji : '👍'}</span>
        {count > 0 && <span>{count}</span>}
        <span className="hidden sm:inline">{current ? current.label : 'Like'}</span>
      </button>
    </div>
  )
}
