// XP level badge shown on profiles and posts
import clsx from 'clsx'

const LEVELS = [
  { min: 0,    label: 'Newcomer',   color: 'bg-gray-400',    text: 'text-gray-600',   emoji: '🌱' },
  { min: 100,  label: 'Explorer',   color: 'bg-green-400',   text: 'text-green-700',  emoji: '🔍' },
  { min: 300,  label: 'Member',     color: 'bg-blue-400',    text: 'text-blue-700',   emoji: '⭐' },
  { min: 600,  label: 'Regular',    color: 'bg-indigo-400',  text: 'text-indigo-700', emoji: '💫' },
  { min: 1000, label: 'Veteran',    color: 'bg-purple-500',  text: 'text-purple-700', emoji: '🔥' },
  { min: 2000, label: 'Pro',        color: 'bg-brand-500',   text: 'text-brand-700',  emoji: '⚡' },
  { min: 5000, label: 'Legend',     color: 'bg-amber-400',   text: 'text-amber-700',  emoji: '👑' },
]

export function getLevelInfo(xp = 0) {
  const level = [...LEVELS].reverse().find(l => xp >= l.min) || LEVELS[0]
  const idx = LEVELS.indexOf(level)
  const next = LEVELS[idx + 1]
  const progress = next ? Math.round(((xp - level.min) / (next.min - level.min)) * 100) : 100
  return { ...level, xp, progress, nextXp: next?.min }
}

export default function XPBadge({ xp = 0, size = 'sm', showProgress = false }) {
  const info = getLevelInfo(xp)

  if (size === 'xs') {
    return (
      <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white', info.color)}>
        {info.emoji} {info.label}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white', info.color)}>
        {info.emoji} {info.label} · {xp} XP
      </div>
      {showProgress && info.nextXp && (
        <div className="w-full h-1.5 bg-surface-200 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-700', info.color)}
            style={{ width: `${info.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
