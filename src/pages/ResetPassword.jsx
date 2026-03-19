import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

const inputClass = [
  'w-full px-4 py-3 rounded-xl text-sm font-medium',
  'bg-white/10 border border-white/20 text-white caret-white',
  'placeholder-gray-500',
  'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
  'transition-all duration-200',
].join(' ')

export default function ResetPassword() {
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [done, setDone]               = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  // Supabase sends the user back with a recovery token in the URL fragment.
  // Calling getSession() picks it up and signs the user in temporarily.
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        // No valid recovery session — token expired or already used
        toast.error('Reset link is invalid or has expired.')
        navigate('/login')
      }
    })
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    if (password !== confirm)  return toast.error('Passwords do not match')

    setLoading(true)
    const { error } = await sb.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      toast.error(error.message || 'Failed to update password')
    } else {
      setDone(true)
      setTimeout(() => navigate('/'), 2500)
    }
  }

  return (
    <div style={{ backgroundColor: '#1a0a3d', minHeight: '100vh' }}
      className="flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">

        <div className="flex flex-col items-center gap-3 mb-8">
          <ViiMbuniLogo size="lg" />
          <p className="text-gray-400 text-sm">Connect. Share. Thrive.</p>
        </div>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">

          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle size={48} className="text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Password updated!</h2>
              <p className="text-gray-400 text-sm">Taking you to the app…</p>
            </div>
          ) : !sessionReady ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={28} className="animate-spin text-brand-400" />
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-1">Set new password</h2>
              <p className="text-gray-400 text-sm mb-5">Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className={inputClass + ' pr-10'}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    className={inputClass}
                  />
                </div>

                <button type="submit" disabled={loading || !password || !confirm}
                  className="btn-primary w-full py-3 mt-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
