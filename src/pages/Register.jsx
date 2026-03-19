import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

const cleanUser = (u) => u.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

const inputClass = [
  'w-full px-4 py-3 rounded-xl text-sm font-medium',
  'bg-white/10 border border-white/20 text-white caret-white',
  'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
  'transition-all duration-200',
].join(' ')

// ── Step 1 — Registration form ────────────────────────────────────
function StepForm({ onNext }) {
  const [form, setForm]       = useState({ fullName: '', username: '', email: '', password: '' })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { fullName, username, email, password } = form
    if (!fullName || !username || !email || !password) return toast.error('Fill in all fields')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')

    setLoading(true)
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username: cleanUser(username),
        },
      },
    })
    setLoading(false)

    if (error) return toast.error(error.message)
    toast.success('Code sent to your email!')
    onNext({ email, fullName, username: cleanUser(username) })
  }

  return (
    <>
      <h2 className="text-xl font-bold text-white mb-5">Create account</h2>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Full Name</label>
          <input type="text" value={form.fullName} onChange={set('fullName')} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Username</label>
          <input type="text" value={form.username} onChange={set('username')} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              className={inputClass + ' pr-10'}
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-1">
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
        </button>
      </form>
    </>
  )
}

// ── Step 2 — OTP verification ─────────────────────────────────────
function StepVerify({ creds }) {
  const [otp, setOtp]           = useState(['', '', '', '', '', ''])
  const [loading, setLoading]   = useState(false)
  const [resending, setResending] = useState(false)
  const navigate = useNavigate()

  const handleChange = (i, val) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus()
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0)
      document.getElementById(`otp-${i - 1}`)?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      document.getElementById('otp-5')?.focus()
    }
  }

  const handleVerify = async () => {
    const token = otp.join('')
    if (token.length !== 6) return toast.error('Enter the full 6-digit code')
    setLoading(true)

    // Verify the OTP — this confirms the user and signs them in
    const { data, error } = await sb.auth.verifyOtp({
      email: creds.email,
      token,
      type: 'signup',
    })

    if (error) {
      setLoading(false)
      return toast.error(error.message)
    }

    // Upsert the profile row — handles both cases:
    //   (a) trigger already created it → update with real name/username
    //   (b) trigger failed / row missing → create it now so the user isn't stuck
    if (data?.user) {
      await sb
        .from('profiles')
        .upsert({
          id: data.user.id,
          full_name: creds.fullName,
          username: creds.username,
          email: creds.email,
        }, { onConflict: 'id' })
      // Ignore upsert errors — profile is usable even with default values
    }

    setLoading(false)
    toast.success('Welcome to Vii-Mbuni! 🎉')
    navigate('/')
  }

  const handleResend = async () => {
    setResending(true)
    const { error } = await sb.auth.resend({ type: 'signup', email: creds.email })
    setResending(false)
    if (error) toast.error(error.message)
    else toast.success('New code sent!')
  }

  return (
    <>
      <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
      <p className="text-gray-400 text-sm mb-6">
        We sent a 6-digit code to{' '}
        <span className="text-brand-300 font-semibold">{creds.email}</span>
      </p>

      <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className={[
              'w-11 h-14 text-center text-xl font-bold rounded-xl',
              'bg-white/10 border-2 text-white caret-white',
              digit ? 'border-brand-400' : 'border-white/20',
              'focus:outline-none focus:border-brand-400',
              'transition-all duration-150',
            ].join(' ')}
          />
        ))}
      </div>

      <button onClick={handleVerify} disabled={loading} className="btn-primary w-full py-3">
        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify & finish'}
      </button>

      <p className="text-center text-gray-500 text-sm mt-4">
        Didn't get it?{' '}
        <button onClick={handleResend} disabled={resending}
          className="text-brand-400 hover:text-brand-300 font-semibold disabled:opacity-50">
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </p>
    </>
  )
}

// ── Main Register page ────────────────────────────────────────────
export default function Register() {
  const [step, setStep]   = useState(1)
  const [creds, setCreds] = useState(null)

  return (
    <div style={{ backgroundColor: '#1a0a3d', minHeight: '100vh' }}
      className="flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">

        <div className="flex flex-col items-center gap-3 mb-8">
          <ViiMbuniLogo size="lg" />
          <p className="text-gray-400 text-sm">Join the community today</p>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-2 justify-center mb-6">
          {[1, 2].map(s => (
            <div key={s} className={[
              'h-1.5 rounded-full transition-all duration-300',
              s === step ? 'w-8 bg-brand-400' : s < step ? 'w-4 bg-brand-600' : 'w-4 bg-white/20',
            ].join(' ')} />
          ))}
        </div>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">
          {step === 1 && <StepForm onNext={(data) => { setCreds(data); setStep(2) }} />}
          {step === 2 && <StepVerify creds={creds} />}
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          {step === 1
            ? <><span>Have an account? </span><Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Sign in</Link></>
            : <button onClick={() => setStep(1)} className="text-brand-400 hover:text-brand-300 font-semibold">← Back</button>
          }
        </p>
        <p className="text-center text-xs text-gray-500 mt-2">
          By registering you agree to our{' '}
          <Link to="/terms" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Terms & Conditions</Link>
        </p>
      </div>
    </div>
  )
}
