import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

// Mirror the same placeholder logic used at registration
const phonePlaceholderEmail = (phone) =>
  `${phone.replace(/\D/g, '')}@vii-mbuni.app`

const isLikelyPhone = (val) => /^[0-9\s\-+()]{7,}$/.test(val.trim())

/**
 * Normalise a local phone number to the canonical form used at registration.
 * Problem: a user may register with "+2349021775413" (digits → 2349021775413)
 * but log in with "09021775413" (digits → 09021775413) — different emails.
 *
 * Strategy: try the raw digits first; if that fails, retry after stripping a
 * leading "0" and prepending the country code (234 for Nigeria), and vice-versa.
 */
const COUNTRY_CODE = '234' // Nigeria — update if your user base is different

const phoneEmailVariants = (rawPhone) => {
  const digits = rawPhone.replace(/\D/g, '')
  const variants = new Set()
  variants.add(digits) // as typed

  // "09021775413" → "2349021775413"
  if (digits.startsWith('0')) {
    variants.add(COUNTRY_CODE + digits.slice(1))
  }

  // "2349021775413" → "09021775413"
  if (digits.startsWith(COUNTRY_CODE)) {
    variants.add('0' + digits.slice(COUNTRY_CODE.length))
  }

  return [...variants].map(d => `${d}@vii-mbuni.app`)
}

export default function Login() {
  const [identifier, setIdentifier] = useState('')   // email OR phone
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent]   = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!identifier || !password) return toast.error('Fill in all fields')

    setLoading(true)

    if (isLikelyPhone(identifier)) {
      // Try every normalised variant of the phone number.
      // Covers mismatches between local format (09021775413) and
      // international format (2349021775413) used at registration.
      const emails = phoneEmailVariants(identifier)

      for (const email of emails) {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (!error) {
          setLoading(false)
          toast.success('Welcome back! 👋')
          navigate('/')
          return
        }
      }

      setLoading(false)
      return toast.error('Phone number or password is incorrect')
    }

    // Email login — straightforward
    const { error } = await sb.auth.signInWithPassword({ email: identifier.trim(), password })
    setLoading(false)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Welcome back! 👋')
      navigate('/')
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (!identifier) return toast.error('Enter your email address')
    if (isLikelyPhone(identifier)) {
      return toast.error('Password reset requires an email address. Please enter your email, or contact support.')
    }
    setLoading(true)
    const { error } = await sb.auth.resetPasswordForEmail(identifier.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) toast.error(error.message)
    else setResetSent(true)
  }

  const inputClass = [
    'w-full px-4 py-3 rounded-xl text-sm font-medium',
    'bg-white/10 border border-white/20',
    'text-white caret-white placeholder-gray-500',
    'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
    'transition-all duration-200',
  ].join(' ')

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

          {forgotMode ? (
            resetSent ? (
              <div className="text-center space-y-4">
                <div className="text-4xl">📧</div>
                <h2 className="text-xl font-bold text-white">Check your email</h2>
                <p className="text-gray-400 text-sm">We sent a password reset link to <span className="text-brand-400 font-semibold">{identifier}</span></p>
                <button onClick={() => { setForgotMode(false); setResetSent(false) }}
                  className="btn-primary w-full py-3">Back to Sign in</button>
              </div>
            ) : (
              <>
                <button onClick={() => setForgotMode(false)}
                  className="text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors">
                  ← Back to sign in
                </button>
                <h2 className="text-xl font-bold text-white mb-2">Reset password</h2>
                <p className="text-gray-400 text-sm mb-5">Enter your email and we'll send you a reset link.</p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Email</label>
                    <input type="email" value={identifier} onChange={e => setIdentifier(e.target.value)} className={inputClass} />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
                  </button>
                </form>
              </>
            )
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-5">Sign in</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Phone Number or Email</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className={inputClass}
                    placeholder="0712 345 678 or email@example.com"
                    inputMode="text"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">Password</label>
                    <button type="button" onClick={() => setForgotMode(true)}
                      className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={inputClass + ' pr-10'}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
                </button>
              </form>

              <p className="text-center text-gray-400 text-sm mt-4">
                No account?{' '}
                <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Create one</Link>
              </p>
              <p className="text-center text-xs text-gray-500 mt-3">
                <Link to="/terms" className="hover:text-gray-300 underline underline-offset-2">Terms & Conditions</Link>
                {' · '}
                <Link to="/about" className="hover:text-gray-300 underline underline-offset-2">About</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
