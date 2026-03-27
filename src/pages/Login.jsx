import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Mail, Phone } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

const isValidPhone = (v) => /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, ''))
const phoneToEmail = (phone) => `${phone.replace(/\D/g, '')}@phone.vii-mbuni.app`

const inputClass = [
  'w-full px-4 py-3 rounded-xl text-sm font-medium',
  'bg-white/10 border border-white/20',
  'text-white caret-white',
  'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
  'transition-all duration-200',
].join(' ')

export default function Login() {
  // 'choose' | 'email' | 'phone'
  const [mode, setMode]         = useState('choose')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent]   = useState(false)
  const navigate = useNavigate()

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('Fill in all fields')
    setLoading(true)
    const { error } = await sb.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) toast.error(error.message)
    else { toast.success('Welcome back! 👋'); navigate('/') }
  }

  const handlePhoneLogin = async (e) => {
    e.preventDefault()
    if (!phone || !password) return toast.error('Fill in all fields')
    if (!isValidPhone(phone)) return toast.error('Enter a valid phone number, e.g. +254712345678')
    setLoading(true)
    const { error } = await sb.auth.signInWithPassword({ email: phoneToEmail(phone), password })
    setLoading(false)
    if (error) toast.error(error.message)
    else { toast.success('Welcome back! 👋'); navigate('/') }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (!email) return toast.error('Enter your email address')
    setLoading(true)
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) toast.error(error.message)
    else setResetSent(true)
  }

  // ── Forgot password screen ────────────────────────────────────────────────
  if (forgotMode) {
    return (
      <div style={{ backgroundColor: '#1a0a3d', minHeight: '100vh' }}
        className="flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="flex flex-col items-center gap-3 mb-8">
            <ViiMbuniLogo size="lg" />
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">
            {resetSent ? (
              <div className="text-center space-y-4">
                <div className="text-4xl">📧</div>
                <h2 className="text-xl font-bold text-white">Check your email</h2>
                <p className="text-gray-400 text-sm">
                  We sent a reset link to <span className="text-brand-400 font-semibold">{email}</span>
                </p>
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
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main login screen ─────────────────────────────────────────────────────
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

          {/* Method chooser */}
          {mode === 'choose' && (
            <>
              <h2 className="text-xl font-bold text-white mb-2">Sign in</h2>
              <p className="text-gray-400 text-sm mb-6">How would you like to sign in?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('email')}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/5 border border-white/15 hover:border-brand-400 hover:bg-brand-500/10 transition-all duration-200 group"
                >
                  <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
                    <Mail size={20} className="text-brand-300" />
                  </div>
                  <span className="text-sm font-semibold text-white">Email</span>
                </button>
                <button
                  onClick={() => setMode('phone')}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/5 border border-white/15 hover:border-brand-400 hover:bg-brand-500/10 transition-all duration-200 group"
                >
                  <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
                    <Phone size={20} className="text-brand-300" />
                  </div>
                  <span className="text-sm font-semibold text-white">Phone</span>
                </button>
              </div>
              <p className="text-center text-gray-400 text-sm mt-5">
                No account?{' '}
                <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Create one</Link>
              </p>
            </>
          )}

          {/* Email login */}
          {mode === 'email' && (
            <>
              <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              <h2 className="text-xl font-bold text-white mb-5">Sign in with Email</h2>
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
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
            </>
          )}

          {/* Phone login */}
          {mode === 'phone' && (
            <>
              <button onClick={() => setMode('choose')} className="text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors">
                ← Back
              </button>
              <h2 className="text-xl font-bold text-white mb-5">Sign in with Phone</h2>
              <form onSubmit={handlePhoneLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+254 712 345 678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Password</label>
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
            </>
          )}

        </div>

        <p className="text-center text-xs text-gray-500 mt-3">
          <Link to="/terms" className="hover:text-gray-300 underline underline-offset-2">Terms & Conditions</Link>
          {' · '}
          <Link to="/about" className="hover:text-gray-300 underline underline-offset-2">About</Link>
        </p>
      </div>
    </div>
  )
}
