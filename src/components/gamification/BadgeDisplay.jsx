// Achievements / badges system
export const BADGES = [
  { id: 'first_post',       emoji: '📝', label: 'First Post',        desc: 'Published your first post',       xpReward: 50  },
  { id: 'ten_posts',        emoji: '✍️', label: 'Writer',            desc: 'Published 10 posts',               xpReward: 100 },
  { id: 'fifty_posts',      emoji: '📚', label: 'Storyteller',       desc: 'Published 50 posts',               xpReward: 300 },
  { id: 'first_like',       emoji: '❤️', label: 'Liked!',            desc: 'Got your first like',              xpReward: 30  },
  { id: 'hundred_likes',    emoji: '🔥', label: 'On Fire',           desc: 'Received 100 likes total',         xpReward: 200 },
  { id: 'first_friend',     emoji: '🤝', label: 'Friendly',          desc: 'Made your first friend',           xpReward: 50  },
  { id: 'ten_friends',      emoji: '👥', label: 'Social Butterfly',  desc: 'Made 10 friends',                  xpReward: 150 },
  { id: 'streak_3',         emoji: '📅', label: '3-Day Streak',      desc: 'Posted 3 days in a row',           xpReward: 75  },
  { id: 'streak_7',         emoji: '⚡', label: 'Week Warrior',      desc: 'Posted 7 days in a row',           xpReward: 200 },
  { id: 'streak_30',        emoji: '👑', label: 'Unstoppable',       desc: 'Posted 30 days in a row',          xpReward: 1000},
  { id: 'first_comment',    emoji: '💬', label: 'Commenter',         desc: 'Left your first comment',          xpReward: 20  },
  { id: 'profile_complete', emoji: '✅', label: 'Complete Profile',  desc: 'Filled out your full profile',     xpReward: 100 },
]

export default function BadgeDisplay({ earnedBadgeIds = [], compact = false }) {
  if (compact) {
    const earned = BADGES.filter(b => earnedBadgeIds.includes(b.id))
    if (!earned.length) return null
    return (
      <div className="flex flex-wrap gap-1">
        {earned.map(b => (
          <span key={b.id} title={`${b.label}: ${b.desc}`}
            className="text-xl cursor-help" aria-label={b.label}>
            {b.emoji}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {BADGES.map(b => {
        const earned = earnedBadgeIds.includes(b.id)
        return (
          <div key={b.id} className={`card p-3 flex items-center gap-3 transition-all ${earned ? 'opacity-100' : 'opacity-40 grayscale'}`}>
            <span className="text-2xl">{b.emoji}</span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-900 dark:text-white truncate">{b.label}</div>
              <div className="text-[10px] text-gray-400 truncate">{b.desc}</div>
              {earned && <div className="text-[10px] text-brand-500 font-semibold">+{b.xpReward} XP</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
