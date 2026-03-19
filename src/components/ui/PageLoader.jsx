import { Zap, X } from 'lucide-react'
import clsx from 'clsx'

// ── PageLoader ────────────────────────────────────────────────
export default function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-50 dark:bg-surface-950 z-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl gradient-brand flex items-center justify-center shadow-glow animate-pulse-soft">
          <Zap size={24} className="text-white" />
        </div>
        <div className="flex gap-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className }) {
  return <div className={clsx('skeleton', className)} />
}

export function PostSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ title, onClose, children, size = 'md' }) {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={clsx('w-full bg-white dark:bg-surface-900 rounded-2xl shadow-2xl overflow-hidden animate-fade-up flex flex-col', widths[size])}
        style={{ maxHeight: '90dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-white/10 flex-shrink-0">
            <h2 className="font-bold text-lg text-gray-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="text-5xl">{icon}</div>
      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">{title}</h3>
      {description && <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 20 }) {
  return (
    <div
      className="rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin"
      style={{ width: size, height: size }}
    />
  )
}
