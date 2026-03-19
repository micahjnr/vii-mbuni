import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, Loader2, Trash2, Copy, Check, ChevronDown, Bot, User, Zap } from 'lucide-react'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { callGroq } from '@/lib/groq'

// ── Quick prompt chips ────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: '✍️ Write a post', prompt: 'Write me an engaging social media post about something trending today.' },
  { label: '💡 Give me ideas', prompt: 'Give me 5 creative content ideas for my social media this week.' },
  { label: '🎯 Caption for photo', prompt: 'Write 3 punchy captions for a lifestyle photo I just took.' },
  { label: '📊 Explain a trend', prompt: 'Explain a current trending topic and why people are talking about it.' },
  { label: '🗣️ Start a conversation', prompt: 'Give me 3 interesting conversation starters I can post today.' },
  { label: '😂 Make me laugh', prompt: 'Tell me something funny or write a witty social media post.' },
  { label: '🏷️ Hashtag strategy', prompt: 'What hashtag strategy should I use to grow my social media reach?' },
  { label: '📝 Bio help', prompt: 'Help me write a compelling social media bio that stands out.' },
]

const SYSTEM_PROMPT = `You are Vii-Mbuni AI — a sharp, friendly personal assistant built into the Vii-Mbuni social media app.
You help users with: writing posts and captions, brainstorming content ideas, answering daily questions, 
explaining trending topics, writing bios, hashtag strategy, and anything else they need.
Be concise, direct, and conversational. Use emojis sparingly but naturally.
When writing content for them, make it ready-to-use without extra explanation unless asked.`

// ── Markdown-lite renderer ────────────────────────────────────
// SECURITY: Strip all HTML tags from the raw AI text first, then
// apply our own safe transformations. This prevents XSS even if
// the model returns content containing <script> or event attributes.
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(text) {
  // Escape all raw HTML first, then apply safe markdown substitutions
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<div class="font-bold text-sm mt-2 mb-1">$1</div>')
    .replace(/^[-•] (.+)$/gm, '<div class="flex gap-2 my-0.5"><span class="text-brand-400 mt-0.5">•</span><span>$1</span></div>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

// ── Message bubble ────────────────────────────────────────────
function MessageBubble({ msg }) {
  const [copied, setCopied] = useState(false)
  const isAI = msg.role === 'assistant'

  const copy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={clsx('flex gap-3 group', isAI ? 'items-start' : 'items-start flex-row-reverse')}>
      {/* Avatar */}
      <div className={clsx(
        'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
        isAI
          ? 'bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-lg shadow-brand-500/30'
          : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-white/10 dark:to-white/5 text-gray-600 dark:text-gray-300'
      )}>
        {isAI ? <Bot size={16} /> : <User size={14} />}
      </div>

      {/* Bubble */}
      <div className={clsx(
        'max-w-[82%] relative',
        isAI ? 'items-start' : 'items-end flex flex-col'
      )}>
        <div className={clsx(
          'px-4 py-3 rounded-2xl text-sm leading-relaxed',
          isAI
            ? 'bg-white dark:bg-surface-800 text-gray-800 dark:text-gray-100 shadow-card border border-surface-100 dark:border-white/5 rounded-tl-md'
            : 'bg-brand-500 text-white rounded-tr-md'
        )}>
          {isAI ? (
            <div
              className="prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          ) : (
            <p>{msg.content}</p>
          )}
        </div>

        {/* Copy button for AI messages */}
        {isAI && (
          <button
            onClick={copy}
            className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-all px-1"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Bot size={16} className="text-white" />
      </div>
      <div className="bg-white dark:bg-surface-800 border border-surface-100 dark:border-white/5 shadow-card px-4 py-3 rounded-2xl rounded-tl-md">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function AIAssistant() {
  const { profile } = useAuthStore()

  // Load saved messages from localStorage on first mount
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('vii_ai_chat')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showQuick, setShowQuick] = useState(true)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const historyRef = useRef(messages) // keep full message history for context

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    try {
      // Keep only last 40 messages to avoid hitting localStorage limits
      const toSave = messages.slice(-40)
      localStorage.setItem('vii_ai_chat', JSON.stringify(toSave))
      historyRef.current = toSave
    } catch { /* storage full — fail silently */ }
    if (messages.length > 0) setShowQuick(false)
  }, [messages])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async (text) => {
    const trimmed = (text || input).trim()
    if (!trimmed || loading) return

    const userMsg = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setShowQuick(false)

    try {
      const reply = await callGroq([...historyRef.current, userMsg], SYSTEM_PROMPT)
      const assistantMsg = { role: 'assistant', content: reply }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      toast.error(e.message || 'AI error — check Groq API key')
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, loading])

  const clearChat = () => {
    setMessages([])
    historyRef.current = []
    localStorage.removeItem('vii_ai_chat')
    setShowQuick(true)
    setInput('')
    inputRef.current?.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-2rem)] max-w-2xl mx-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-4 border-b border-surface-100 dark:border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              Vii-Mbuni AI
              <span className="text-[10px] font-bold bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 px-2 py-0.5 rounded-full">BETA</span>
            </h1>
            <p className="text-xs text-gray-400">Your personal assistant</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Clear chat
          </button>
        )}
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto py-5 space-y-4 px-1">

        {/* Welcome state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-1">
              <Sparkles size={30} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
                Hey {firstName}! 👋
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                Ask me anything — posts, captions, hashtags, daily questions, ideas, and more.
              </p>
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {/* Typing indicator */}
        {loading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ── */}
      {showQuick && messages.length === 0 && (
        <div className="flex-shrink-0 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={12} className="text-amber-500" />
            <span className="text-xs font-semibold text-gray-400">Quick prompts</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PROMPTS.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q.prompt)}
                disabled={loading}
                className="text-left px-3 py-2.5 rounded-xl border border-surface-200 dark:border-white/10 bg-white dark:bg-surface-800 hover:border-brand-300 dark:hover:border-brand-500/50 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all text-xs text-gray-700 dark:text-gray-300 font-medium disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 pt-3 border-t border-surface-100 dark:border-white/10">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask me anything…"
              rows={1}
              disabled={loading}
              className="w-full input resize-none py-3 pr-4 text-sm leading-relaxed max-h-32 overflow-y-auto disabled:opacity-60"
              style={{ minHeight: '48px' }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
              }}
            />
          </div>
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {loading
              ? <Loader2 size={18} className="animate-spin" />
              : <Send size={18} />
            }
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-300 dark:text-gray-600 mt-2">
          Powered by Groq · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
