// Mood/vibe tag — unique to Vii-Mbuni
export const MOODS = [
  { id: 'hyped',       emoji: '🔥', label: 'Hyped',       color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300' },
  { id: 'chill',       emoji: '😌', label: 'Chill',       color: 'bg-blue-100   dark:bg-blue-500/20   text-blue-600   dark:text-blue-300'   },
  { id: 'thinking',    emoji: '💭', label: 'Thinking',    color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300' },
  { id: 'celebrating', emoji: '🎉', label: 'Celebrating', color: 'bg-pink-100   dark:bg-pink-500/20   text-pink-600   dark:text-pink-300'   },
  { id: 'inspired',    emoji: '✨', label: 'Inspired',    color: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' },
  { id: 'grinding',    emoji: '💪', label: 'Grinding',    color: 'bg-green-100  dark:bg-green-500/20  text-green-600  dark:text-green-300'  },
  { id: 'grateful',    emoji: '🙏', label: 'Grateful',    color: 'bg-teal-100   dark:bg-teal-500/20   text-teal-600   dark:text-teal-300'   },
  { id: 'curious',     emoji: '🤔', label: 'Curious',     color: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300' },
]

export function getMood(id) {
  return MOODS.find(m => m.id === id)
}

// Display a mood tag inline
export function MoodTag({ mood }) {
  const m = typeof mood === 'string' ? getMood(mood) : mood
  if (!m) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>
      {m.emoji} {m.label}
    </span>
  )
}

// Selector for create post modal
export function MoodSelector({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MOODS.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(value === m.id ? null : m.id)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-2
            ${value === m.id
              ? `${m.color} border-current scale-105`
              : 'bg-surface-100 dark:bg-white/5 text-gray-500 border-transparent hover:border-gray-200 dark:hover:border-white/20'
            }`}
        >
          {m.emoji} {m.label}
        </button>
      ))}
    </div>
  )
}
