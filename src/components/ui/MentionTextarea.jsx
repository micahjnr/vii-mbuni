/**
 * MentionTextarea
 * A textarea that shows a live @mention dropdown as the user types @name.
 * Also handles #hashtag highlighting (read-only display layer is separate).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import sb from '@/lib/supabase'
import Avatar from '@/components/ui/Avatar'
import clsx from 'clsx'

function useMentionSearch(query) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // null means no @ context — don't search at all
    if (query === null) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timeout = setTimeout(async () => {
      let q = sb
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .order('full_name', { ascending: true })
        .limit(8)
      if (query) {
        q = q.or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      }
      const { data } = await q
      if (!cancelled) {
        setResults(data || [])
        setLoading(false)
      }
    }, 150)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [query])

  return { results, loading }
}

// Parse the current @-word being typed at caret position
// Triggers on bare "@" too (empty query = show all users)
function getMentionAtCaret(value, caretPos) {
  const before = value.slice(0, caretPos)
  const match = before.match(/@(\w*)$/)
  if (!match) return null
  return {
    query: match[1], // empty string when just "@" was typed
    start: caretPos - match[0].length,
    end: caretPos,
  }
}

export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className = '',
  onMentionsChange,   // optional: receives array of mentioned user ids
}) {
  const textareaRef = useRef(null)
  const dropdownRef = useRef(null)
  const [caretPos, setCaretPos] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [mentionedIds, setMentionedIds] = useState([])

  const mentionContext = getMentionAtCaret(value, caretPos)
  const { results, loading } = useMentionSearch(mentionContext?.query ?? null)
  const showDropdown = mentionContext !== null && (results.length > 0 || loading)

  // Keep caret position in sync
  const updateCaret = useCallback(() => {
    if (textareaRef.current) setCaretPos(textareaRef.current.selectionStart)
  }, [])

  // Reset selection index when results change
  useEffect(() => { setSelectedIdx(0) }, [results])

  // Clear tracked mention IDs when textarea is cleared after submit
  useEffect(() => {
    if (!value) {
      setMentionedIds([])
    }
  }, [value])

  const insertMention = useCallback((profile) => {
    if (!mentionContext) return
    const before = value.slice(0, mentionContext.start)
    const after  = value.slice(mentionContext.end)
    const inserted = `@${profile.username} `
    const newValue = before + inserted + after
    onChange(newValue)

    // Track mentioned user ids
    const newIds = [...new Set([...mentionedIds, profile.id])]
    setMentionedIds(newIds)
    onMentionsChange?.(newIds)

    // Move caret after the inserted mention
    const newCaret = mentionContext.start + inserted.length
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCaret, newCaret)
        setCaretPos(newCaret)
      }
    })
  }, [value, mentionContext, onChange, mentionedIds, onMentionsChange])

  const handleKeyDown = (e) => {
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (results[selectedIdx]) {
        e.preventDefault()
        insertMention(results[selectedIdx])
      }
    } else if (e.key === 'Escape') {
      setCaretPos(0) // dismiss
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          textareaRef.current && !textareaRef.current.contains(e.target)) {
        setCaretPos(0)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => { onChange(e.target.value); updateCaret() }}
        onKeyUp={updateCaret}
        onMouseUp={updateCaret}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={clsx('input resize-none text-base leading-relaxed', className)}
      />

      {/* Mention dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-surface-800 rounded-2xl shadow-card-lg border border-surface-200 dark:border-white/10 overflow-hidden animate-fade-up"
        >
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400">Searching...</div>
          ) : (
            results.map((profile, i) => (
              <button
                key={profile.id}
                onMouseDown={e => { e.preventDefault(); insertMention(profile) }}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === selectedIdx
                    ? 'bg-brand-50 dark:bg-brand-500/15'
                    : 'hover:bg-surface-50 dark:hover:bg-white/5'
                )}
              >
                <Avatar src={profile.avatar_url} name={profile.full_name} size={32} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                    {profile.full_name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">@{profile.username}</div>
                </div>
                {i === selectedIdx && (
                  <span className="ml-auto text-[10px] text-gray-400 bg-surface-100 dark:bg-white/10 rounded px-1.5 py-0.5">
                    ↵ select
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
