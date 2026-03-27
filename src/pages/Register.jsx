import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Mail, Phone } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import sb from '@/lib/supabase'
import toast from 'react-hot-toast'

const cleanUser = (u) => u.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
const isValidPhone = (v) => /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, ''))
const phoneToEmail = (phone) => `${phone.replace(/\D/g, '')}@phone.vii-mbuni.app`

const inputClass = [
  'w-full px-4 py-3 rounded-xl text-sm font-medium',
  'bg-white/10 border border-white/20 text-white caret-white',
  'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
  'transition-all duration-200',
].join(' ')

// Step 0 — Choose signup method
function StepChoose({ onChoose }) {
  return (
    <>
      <h2 className="text-xl font-bold text-white mb-2">Create account</h2>
      <p className="text-gray-400 text-sm mb-6">How would you like to sign up?</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChoose('email')}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/5 border border-white/15 hover:border-brand-400 hover:bg-brand-500/10 transition-all duration-200 group"
        >
          <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
            <Mail size={20} className="text-brand-300" />
          </div>
          <span className="text-sm font-semibold text-white">Email</span>
          <span className="text-[11px] text-gray-400 text-center leading-tight">Verify with a code</span>
        </button>
        <button
          onClick={() => onChoose('phone')}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/5 border border-white/15 hover:border-brand-400 hover:bg-brand-500/10 transition-all duration-200 group"
        >
          <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
            <Phone size={20} className="text-brand-300" />
          </div>
          <span className="text-sm font-semibold text-white">Phone</span>
          <span className="text-[11px] text-gray-400 text-center leading-tight">Instant — no code</span>
        </button>
      </div>
    </>
  )
}

// Step 1a — Email registration form
function StepEmailForm({ onBack, onNext }) {
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
      options: { data: { full_name: fullName, username: cleanUser(username) } },
    })
    setLoading(false)

    if (error) return toast.error(error.message)
    toast.success('Code sent to your email!')
    onNext({ email, fullName, username: cleanUser(username) })
  }

  return (
    <>
      <button onClick={onBack} className="text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors">
        ← Back
      </button>
      <h2 className="text-xl font-bold text-white mb-5">Sign up with Email</h2>
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

// Step 2a — Email OTP verification
function StepEmailVerify({ creds, onBack }) {
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [loading, setLoading]     = useState(false)
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

    const { data, error } = await sb.auth.verifyOtp({ email: creds.email, token, type: 'signup' })
    if (error) { setLoading(false); return toast.error(error.message) }

    if (data?.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        full_name: creds.fullName,
        username: creds.username,
        email: creds.email,
      }, { onConflict: 'id' })
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
      <p className="text-center mt-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
          ← Use a different email
        </button>
      </p>
    </>
  )
}

// Step 1b — Phone registration (no OTP)
function StepPhoneForm({ onBack }) {
  const [form, setForm]       = useState({ fullName: '', username: '', phone: '', password: '' })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { fullName, username, phone, password } = form
    if (!fullName || !username || !phone || !password) return toast.error('Fill in all fields')
    if (!isValidPhone(phone)) return toast.error('Enter a valid phone number, e.g. +254712345678')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')

    setLoading(true)
    // Supabase auth requires an email — we derive one deterministically from the phone number
    // so the user can later log in with phone + password on the Login page.
    const syntheticEmail = phoneToEmail(phone)
    const { data, error } = await sb.auth.signUp({
      email: syntheticEmail,
      password,
      options: {
        data: { full_name: fullName, username: cleanUser(username), phone_number: phone },
      },
    })
    setLoading(false)

    if (error) return toast.error(error.message)

    if (data?.user) {
      await sb.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        username: cleanUser(username),
        phone_number: phone,
      }, { onConflict: 'id' })
    }

    toast.success('Account created! Welcome 🎉')
    navigate('/')
  }

  return (
    <>
      <button onClick={onBack} className="text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors">
        ← Back
      </button>
      <h2 className="text-xl font-bold text-white mb-1">Sign up with Phone</h2>
      <p className="text-gray-400 text-xs mb-5">No verification code needed — instant account.</p>
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
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Phone Number</label>
          <input
            type="tel"
            placeholder="+254 712 345 678"
            value={form.phone}
            onChange={set('phone')}
            className={inputClass}
          />
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
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Create Account'}
        </button>
      </form>
    </>
  )
}

// Main Register page — step: 'choose' | 'email-form' | 'email-otp' | 'phone-form'
export default function Register() {
  const [step, setStep]     = useState('choose')
  const [creds, setCreds]   = useState(null)
  const [method, setMethod] = useState(null)

  const dotIndex = { 'choose': 1, 'email-form': 2, 'email-otp': 3, 'phone-form': 2 }
  const totalDots = method === 'phone' ? 2 : 3

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
          {Array.from({ length: totalDots }, (_, i) => i + 1).map(s => (
            <div key={s} className={[
              'h-1.5 rounded-full transition-all duration-300',
              s === dotIndex[step] ? 'w-8 bg-brand-400' : s < dotIndex[step] ? 'w-4 bg-brand-600' : 'w-4 bg-white/20',
            ].join(' ')} />
          ))}
        </div>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">

          {step === 'choose' && (
            <StepChoose onChoose={(m) => { setMethod(m); setStep(m === 'email' ? 'email-form' : 'phone-form') }} />
          )}
          {step === 'email-form' && (
            <StepEmailForm onBack={() => setStep('choose')} onNext={(d) => { setCreds(d); setStep('email-otp') }} />
          )}
          {step === 'email-otp' && (
            <StepEmailVerify creds={creds} onBack={() => setStep('email-form')} />
          )}
          {step === 'phone-form' && (
            <StepPhoneForm onBack={() => setStep('choose')} />
          )}
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          {step === 'choose'
            ? <><span>Have an account? </span><Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Sign in</Link></>
            : <button onClick={() => setStep('choose')} className="text-brand-400 hover:text-brand-300 font-semibold">← Back to options</button>
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
