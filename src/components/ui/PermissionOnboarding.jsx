/**
 * PermissionOnboarding — First-launch permission request screen
 * Shows once when the app is first opened, asks for all needed permissions
 * in a friendly way with explanations before triggering OS dialogs.
 */
import { useState } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import clsx from 'clsx'

const PERMISSIONS_LIST = [
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Notifications',
    desc: 'Get alerted when someone messages you, calls you, or interacts with your posts.',
    required: false,
  },
  {
    id: 'microphone',
    icon: '🎙️',
    title: 'Microphone',
    desc: 'Make voice and video calls, and record voice messages.',
    required: false,
  },
  {
    id: 'camera',
    icon: '📷',
    title: 'Camera',
    desc: 'Make video calls and upload photos directly from your camera.',
    required: false,
  },
  {
    id: 'location',
    icon: '📍',
    title: 'Location',
    desc: 'Discover people in your city with the Nearby People feature.',
    required: false,
  },
  {
    id: 'storage',
    icon: '🖼️',
    title: 'Photos & Storage',
    desc: 'Upload images and videos from your gallery to posts and stories.',
    required: false,
  },
]

export default function PermissionOnboarding({ onDone }) {
  const { request } = usePermissions()
  const [selected, setSelected] = useState(new Set(['notifications', 'microphone', 'camera', 'storage']))
  const [step, setStep] = useState('select') // 'select' | 'requesting' | 'done'
  const [current, setCurrent] = useState(null)

  const toggle = (id) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const proceed = async () => {
    setStep('requesting')
    for (const id of selected) {
      setCurrent(id)
      await request(id, { silent: true }).catch(() => {})
      await new Promise(r => setTimeout(r, 400))
    }
    setCurrent(null)
    setStep('done')
    try { localStorage.setItem('vii-permissions-onboarded', '1') } catch {}
    setTimeout(() => onDone?.(), 800)
  }

  const skip = () => {
    try { localStorage.setItem('vii-permissions-onboarded', '1') } catch {}
    onDone?.()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white dark:bg-surface-900 w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>

        {step === 'done' ? (
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">All set!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">You can change these in Settings anytime.</p>
          </div>
        ) : step === 'requesting' ? (
          <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
            <div className="text-5xl mb-4 animate-bounce">
              {PERMISSIONS_LIST.find(p => p.id === current)?.icon || '⏳'}
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Requesting {PERMISSIONS_LIST.find(p => p.id === current)?.title || 'permissions'}…
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              A system dialog may appear — tap <strong>Allow</strong> to grant access.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 text-center border-b border-surface-100 dark:border-white/10">
              <div className="text-4xl mb-3">🔐</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">App Permissions</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Choose what Vii-Mbuni can access. You can change these later in Settings.
              </p>
            </div>

            {/* Permission list */}
            <div className="px-4 py-3 space-y-2">
              {PERMISSIONS_LIST.map(p => {
                const on = selected.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)}
                    className={clsx(
                      'w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all',
                      on
                        ? 'bg-brand-50 dark:bg-brand-500/15 border-2 border-brand-400 dark:border-brand-500'
                        : 'bg-surface-50 dark:bg-white/5 border-2 border-transparent'
                    )}>
                    <span className="text-2xl flex-shrink-0">{p.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white">
                        {p.title}
                        {p.required && <span className="ml-1.5 text-[10px] text-red-500 font-bold">REQUIRED</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{p.desc}</div>
                    </div>
                    <div className={clsx(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                      on ? 'bg-brand-500 border-brand-500' : 'border-gray-300 dark:border-white/20'
                    )}>
                      {on && <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Actions */}
            <div className="px-4 pb-2 pt-2 flex flex-col gap-2">
              <button onClick={proceed}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #c8102e, #7c3aed)' }}>
                {selected.size === 0 ? 'Continue without permissions' : `Allow ${selected.size} permission${selected.size > 1 ? 's' : ''}`}
              </button>
              <button onClick={skip}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                Skip for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
