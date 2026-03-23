import { useState, useRef, useCallback } from 'react';
import { Globe, ChevronDown, Image, Users, Smile, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------
const THEMES = [
  {
    id: 'plain',
    label: 'None',
    swatch: null, // rendered as a plain white/gray square
    containerClass: 'bg-transparent',
    containerStyle: {},
    textClass: 'text-gray-800 dark:text-gray-100',
    textStyle: { fontSize: '15px', fontWeight: '400', textAlign: 'left' },
    placeholderColor: undefined,
    centered: false,
  },
  {
    id: 'purple',
    label: 'Purple',
    swatch: 'linear-gradient(135deg, #8b3fc8, #5b0fa8)',
    containerStyle: { background: 'linear-gradient(135deg, #8b3fc8, #5b0fa8)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#fff' },
    placeholderColor: 'rgba(255,255,255,0.55)',
    centered: true,
  },
  {
    id: 'red',
    label: 'Red',
    swatch: 'linear-gradient(135deg, #e0174e, #c0024e)',
    containerStyle: { background: 'linear-gradient(135deg, #e0174e, #c0024e)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#fff' },
    placeholderColor: 'rgba(255,255,255,0.55)',
    centered: true,
  },
  {
    id: 'black',
    label: 'Black',
    swatch: '#1a1a1a',
    containerStyle: { background: '#1a1a1a' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#fff' },
    placeholderColor: 'rgba(255,255,255,0.4)',
    centered: true,
  },
  {
    id: 'gradient1',
    label: 'Pink',
    swatch: 'linear-gradient(135deg, #f953c6, #b91d73)',
    containerStyle: { background: 'linear-gradient(135deg, #f953c6, #b91d73)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#fff' },
    placeholderColor: 'rgba(255,255,255,0.55)',
    centered: true,
  },
  {
    id: 'gradient2',
    label: 'Aurora',
    swatch: 'linear-gradient(135deg, #8360c3, #2ebf91)',
    containerStyle: { background: 'linear-gradient(135deg, #8360c3, #2ebf91)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#fff' },
    placeholderColor: 'rgba(255,255,255,0.55)',
    centered: true,
  },
  {
    id: 'gradient3',
    label: 'Amber',
    swatch: 'linear-gradient(135deg, #f7971e, #ffd200)',
    containerStyle: { background: 'linear-gradient(135deg, #f7971e, #ffd200)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#3a2000' },
    placeholderColor: 'rgba(60,40,0,0.4)',
    centered: true,
  },
  {
    id: 'gradient4',
    label: 'Ocean',
    swatch: 'linear-gradient(135deg, #1fa2ff, #12d8fa, #a6ffcb)',
    containerStyle: { background: 'linear-gradient(135deg, #1fa2ff, #12d8fa, #a6ffcb)' },
    textStyle: { fontSize: '22px', fontWeight: '600', textAlign: 'center', color: '#0a2a1a' },
    placeholderColor: 'rgba(10,40,20,0.4)',
    centered: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MAX_CHARS = 500;

function getCharCountColor(remaining) {
  if (remaining < 20) return 'text-red-500';
  if (remaining < 60) return 'text-amber-500';
  return 'text-gray-400';
}

// ---------------------------------------------------------------------------
// ThemedPostComposer
//
// Props:
//   user        – { name: string, avatarUrl?: string, avatarInitials?: string }
//   onPost      – (payload: { content: string, theme: string }) => Promise<void>
//   placeholder – string (optional)
//   className   – string (optional, extra classes for the outer card)
// ---------------------------------------------------------------------------
export default function ThemedPostComposer({
  user = { name: 'You', avatarInitials: 'ME' },
  onPost,
  placeholder = "What's on your mind?",
  className,
}) {
  const [text, setText] = useState('');
  const [themeId, setThemeId] = useState('plain');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const remaining = MAX_CHARS - text.length;
  const canPost = text.trim().length > 0 && !submitting;

  // Inject a CSS custom property onto the textarea so we can style ::placeholder
  // without a global stylesheet. We swap it whenever the theme changes.
  const textareaStyle = {
    ...theme.textStyle,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    width: '100%',
    // CSS variable read by the <style> tag below
    '--placeholder-color': theme.placeholderColor ?? 'rgba(107,114,128,0.7)',
  };

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    setSubmitting(true);
    try {
      if (onPost) {
        await onPost({ content: text.trim(), theme: themeId });
      } else {
        // Demo fallback
        await new Promise((r) => setTimeout(r, 600));
        toast.success('Post shared!');
      }
      setText('');
      setThemeId('plain');
    } catch (err) {
      toast.error(err?.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [canPost, onPost, text, themeId]);

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter to post
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handlePost();
  };

  return (
    <>
      {/*
        Scoped <style> for ::placeholder — Tailwind can't target this pseudo-element
        with a dynamic color, so we use a CSS variable set inline on the textarea.
      */}
      <style>{`
        .themed-composer-textarea::placeholder {
          color: var(--placeholder-color, rgba(107,114,128,0.7));
          transition: color 0.2s;
        }
      `}</style>

      <div
        className={clsx(
          'w-full max-w-lg mx-auto rounded-xl border border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900 shadow-sm overflow-hidden',
          className,
        )}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <Avatar user={user} />
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-none mb-1">
              {user.name}
            </p>
            <button className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md px-2 py-1 transition-colors">
              <Globe size={12} />
              Public
              <ChevronDown size={11} />
            </button>
          </div>
        </div>

        {/* ── Text area ───────────────────────────────────────────── */}
        <div
          className={clsx(
            'transition-all duration-300 ease-in-out',
            'min-h-[140px] flex items-center px-4 py-3',
            theme.centered ? 'justify-center' : 'items-start',
          )}
          style={theme.containerStyle}
        >
          <textarea
            ref={textareaRef}
            className="themed-composer-textarea"
            style={textareaStyle}
            rows={theme.centered ? 4 : 5}
            maxLength={MAX_CHARS}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Post content"
          />
        </div>

        {/* ── Theme picker ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide">
          {THEMES.map((t) => (
            <ThemeSwatch
              key={t.id}
              theme={t}
              active={themeId === t.id}
              onSelect={() => setThemeId(t.id)}
            />
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          {/* Media actions */}
          <div className="flex items-center gap-1">
            <IconAction icon={<Image size={18} />} label="Photo/Video" />
            <IconAction icon={<Users size={18} />} label="Tag people" />
            <IconAction icon={<Smile size={18} />} label="Feeling/Activity" />
            <IconAction icon={<MapPin size={18} />} label="Check in" />
          </div>

          <div className="flex items-center gap-3">
            {/* Char counter — only show when text exists */}
            {text.length > 0 && (
              <span className={clsx('text-xs tabular-nums', getCharCountColor(remaining))}>
                {remaining}
              </span>
            )}

            {/* Clear button */}
            {text.length > 0 && (
              <button
                onClick={() => { setText(''); setThemeId('plain'); }}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Clear"
              >
                <X size={14} />
              </button>
            )}

            {/* Post button */}
            <button
              onClick={handlePost}
              disabled={!canPost}
              className={clsx(
                'px-5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150',
                canPost
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed',
              )}
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ user }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-sm font-semibold">
        {user.avatarInitials ?? user.name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function ThemeSwatch({ theme, active, onSelect }) {
  const isPlain = theme.id === 'plain';
  return (
    <button
      onClick={onSelect}
      title={theme.label}
      aria-label={`Theme: ${theme.label}`}
      aria-pressed={active}
      className={clsx(
        'w-8 h-8 rounded-[10px] flex-shrink-0 transition-transform duration-100',
        'border-2',
        active
          ? 'border-blue-500 scale-110'
          : 'border-transparent hover:scale-105',
        isPlain &&
          'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600',
      )}
      style={isPlain ? {} : { background: theme.swatch }}
    />
  );
}

function IconAction({ icon, label }) {
  return (
    <button
      title={label}
      aria-label={label}
      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {icon}
    </button>
  );
}
