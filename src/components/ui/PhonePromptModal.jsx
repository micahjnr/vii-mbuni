/**
 * PhonePromptModal
 * Shown once to existing users who don't yet have a phone_number saved.
 * They can save a number or dismiss (won't be asked again for 7 days).
 */
import { useState } from 'react'
import { Phone, X, Loader2 } from 'lucide-react'
import sb from '@/lib/supabase'
import { useAuthStore } from '@/store'
import toast from 'react-hot-toast'

const DISMISS_KEY = 'vii_phone_prompt_dismissed_until'

const isValidPhone = (p) => p.replace(/\D/g, '').length >= 7

export default function PhonePromptModal({ onClose }) {
  const { user, fetchProfile } = useAuthStore()
  const [phone, setPhone]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!phone.trim()) return toast.error('Please enter a phone number')
    if (!isValidPhone(phone)) return toast.error('Enter a valid phone number (at least 7 digits)')

    setLoading(true)
    const { error } = await sb
      .from('profiles')
      .update({ phone_number: phone.trim() })
      .eq('id', user.id)

    setLoading(false)

    if (error) {
      if (error.code === '23505') return toast.error('That phone number is already used by another account')
      return toast.error(error.message)
    }

    toast.success('Phone number saved! ✅')
    await fetchProfile(user.id)
    onClose()
  }

  const handleSkip = () => {
    // Snooze for 7 days so we don't nag the user every session
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000
    try { localStorage.setItem(DISMISS_KEY, String(until)) } catch (_) {}
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl animate-fade-up"
        style={{ backgroundColor: '#1e0f4a' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
              <Phone size={20} className="text-brand-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Add your phone number</h3>
              <p className="text-gray-400 text-xs mt-0.5">Help others find you more easily</p>
            </div>
          </div>
          <button onClick={handleSkip}
            className="text-gray-500 hover:text-white transition-colors p-1 -mt-1 -mr-1">
            <X size={18} />
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Your account was created with an email. Adding a phone number lets people on Vii-Mbuni find you even without email.
        </p>

        <div className="mb-4">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 0712 345 678"
            inputMode="tel"
            className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-white/10 border border-white/20 text-white caret-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-all"
          />
          <p className="text-xs text-gray-500 mt-1">No SMS code will be sent — just saved to your profile</p>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSkip}
            className="flex-1 py-2.5 rounded-xl border border-white/20 text-gray-300 text-sm font-semibold hover:bg-white/5 transition-colors">
            Skip for now
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-400 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Save number'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Call this at app startup to check if the prompt should be shown */
export function shouldShowPhonePrompt(profile) {
  if (!profile) return false
  if (profile.phone_number) return false   // already has one
  try {
    const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10)
    if (Date.now() < until) return false   // snoozed
  } catch (_) {}
  return true
}
