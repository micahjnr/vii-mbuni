import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Mail, Phone } from 'lucide-react'
import ViiMbuniLogo from '@/components/ui/ViiMbuniLogo'
import Captcha, { useCaptcha, captchaEnabled } from '@/components/ui/Captcha'
import OtpInput, { EMPTY_OTP, useCooldown } from '@/components/ui/OtpInput'
import sb from '@/lib/supabase'
import { normalizePhone, phoneToEmail, legacyPhoneEmail, toE164 } from '@/lib/phone'
import { authErrorMessage } from '@/lib/authErrors'
import { ensureProfile } from '@/lib/ensureProfile'
import toast from 'react-hot-toast'

const inputClass = [
  'w-full px-4 py-3 rounded-xl text-sm font-medium',
  'bg-white/10 border border-white/20',
  'text-white caret-white',
  'focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400',
  'transition-all duration-200',
].join(' ')
const labelClass = 'block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5'
const backClass  = 'text-gray-400 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors'

// ── SMS code screen — used for (a) finishing an unverified sign-up, (b) password reset ──
function OtpScreen({ phone, purpose, captcha, onBack, onDone }) {
  const [otp, setOtp]             = useState(EMPTY_OTP)
  const [loading, setLoading]     = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, restart]       = useCooldown(60)

  const handleVerify = async () => {
    const token = otp.join('')
    if (token.length !== 6) return toast.error('Enter the full 6-digit code')
    setLoading(true)
    const { data, error } = await sb.auth.verifyOtp({ phone, token, type: 'sms' })
    if (error) { setLoading(false); return toast.error(authErrorMessage(error)) }
    if (purpose === 'verify' && data?.user) await ensureProfile(data.user)
    setLoading(false)
    onDone()
  }

  const handleResend = async () => {
    setResending(true)
    const captchaToken = await captcha.waitForToken()
    const opts = captchaToken ? { captchaToken } : undefined
    const { error } = purpose === 'verify'
      ? await sb.auth.resend({ type: 'sms', phone, options: opts })
      : await sb.auth.signInWithOtp({ phone, options: { shouldCreateUser: false, ...opts } })
    captcha.reset()
    setResending(false)
    if (error) return toast.error(authErrorMessage(error))
    toast.success('New code sent!')
    setOtp(EMPTY_OTP)
    restart()
  }

  return (
    <>
      <button onClick={onBack} className={backClass}>← Back</button>
      <h2 className="text-xl font-bold text-white mb-2">Enter your code</h2>
      <p className="text-gray-400 text-sm mb-6">
        We sent a 6-digit code by SMS to <span className="text-brand-300 font-semibold">{phone}</span>
      </p>
      <div className="mb-6"><OtpInput value={otp} onChange={setOtp} disabled={loading} /></div>
      <button onClick={handleVerify} disabled={loading} className="btn-primary w-full py-3">
        {loading ? <Loader2 size={18} className="animate-spin" /> : purpose === 'reset' ? 'Verify & continue' : 'Verify & sign in'}
      </button>
      <p className="text-center text-gray-500 text-sm mt-4">
        Didn't get it?{' '}
        {cooldown > 0
          ? <span className="text-gray-500">Resend in {cooldown}s</span>
          : <button onClick={handleResend} disabled={resending}
              className="text-brand-400 hover:text-brand-300 font-semibold disabled:opacity-50">
              {resending ? 'Sending…' : 'Resend code'}
            </button>}
      </p>
    </>
  )
}

function PasswordInput({ value, onChange, show, onToggle, autoComplete }) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={inputClass + ' pr-10'}
      />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function Login() {
  // 'choose' | 'email' | 'phone' | 'forgot' | 'otp'
  const [view, setView]         = useState('choose')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [forgotMethod, setForgotMethod] = useState('phone')   // 'phone' | 'email'
  const [resetSent, setResetSent]       = useState(false)
  const [otpCtx, setOtpCtx]             = useState(null)      // { phone: '+234…', purpose: 'verify' | 'reset' }
  const captcha  = useCaptcha()
  const navigate = useNavigate()

  const go = (v) => { if (v === 'choose') captcha.reset(); setView(v) }
  const welcome = () => { toast.success('Welcome back! 👋'); navigate('/') }

  // One captcha token per Supabase call — wait for a fresh one when a handler needs several.
  const signInWith = async (creds) => {
    const captchaToken = await captcha.waitForToken()
    const res = await sb.auth.signInWithPassword({ ...creds, options: captchaToken ? { captchaToken } : undefined })
    captcha.reset()
    return res
  }

  // ── Email login ───────────────────────────────────────────────────────────
  const handleEmailLogin = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email.trim() || !password) return toast.error('Fill in all fields')
    if (!captcha.ready) return toast.error('Please complete the captcha check')
    setLoading(true)
    const { error } = await signInWith({ email: email.trim().toLowerCase(), password })
    setLoading(false)
    if (error) toast.error(authErrorMessage(error))
    else welcome()
  }

  // ── Phone login ───────────────────────────────────────────────────────────
  const handlePhoneLogin = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!phone.trim() || !password) return toast.error('Fill in all fields')
    const digits = normalizePhone(phone)
    if (!digits) return toast.error('Enter a valid phone number, e.g. +2348012345678')
    if (!captcha.ready) return toast.error('Please complete the captcha check')

    const e164 = toE164(digits)
    setLoading(true)
    const { error } = await signInWith({ phone: e164, password })
    if (!error) { setLoading(false); return welcome() }

    // Signed up but never entered the SMS code → send a fresh one and finish verification.
    if (error.code === 'phone_not_confirmed' || /phone not confirmed/i.test(error.message || '')) {
      const captchaToken = await captcha.waitForToken()
      const { error: sendErr } = await sb.auth.resend({ type: 'sms', phone: e164, options: captchaToken ? { captchaToken } : undefined })
      captcha.reset()
      setLoading(false)
      if (sendErr) return toast.error(authErrorMessage(sendErr))
      toast.success('Please verify your number — we sent you a code.')
      setOtpCtx({ phone: e164, purpose: 'verify' })
      return setView('otp')
    }

    // Accounts made before SMS verification existed are keyed on a synthetic email.
    // They sign in here, then the app routes them to /verify-phone to prove the number.
    if (error.code === 'invalid_credentials' || /invalid login/i.test(error.message || '')) {
      const legacy = [...new Set([phoneToEmail(digits), legacyPhoneEmail(phone)])]
      for (const legacyEmail of legacy) {
        let r = await signInWith({ email: legacyEmail, password })
        if (r.error && /email not confirmed/i.test(r.error.message || '')) {
          try {
            const res = await fetch('/.netlify/functions/phone-confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: legacyEmail, password }),
            })
            if (res.ok) r = await signInWith({ email: legacyEmail, password })
          } catch { /* fall through to the generic error */ }
        }
        if (!r.error) { setLoading(false); return welcome() }
      }
    }

    setLoading(false)
    toast.error(authErrorMessage(error))
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotEmail = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email.trim()) return toast.error('Enter your email address')
    if (!captcha.ready) return toast.error('Please complete the captcha check')
    setLoading(true)
    const captchaToken = await captcha.waitForToken()
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    })
    captcha.reset()
    setLoading(false)
    if (error) toast.error(authErrorMessage(error))
    else setResetSent(true)
  }

  const handleForgotPhone = async (e) => {
    e.preventDefault()
    if (loading) return
    const digits = normalizePhone(phone)
    if (!digits) return toast.error('Enter a valid phone number, e.g. +2348012345678')
    if (!captcha.ready) return toast.error('Please complete the captcha check')
    setLoading(true)
    const captchaToken = await captcha.waitForToken()
    const e164 = toE164(digits)
    const { error } = await sb.auth.signInWithOtp({
      phone: e164,
      options: { shouldCreateUser: false, ...(captchaToken ? { captchaToken } : {}) },
    })
    captcha.reset()
    setLoading(false)
    if (error) {
      // shouldCreateUser:false → Supabase refuses numbers that have no verified account.
      return toast.error(/signups not allowed|not allowed for otp/i.test(error.message || '')
        ? 'No verified account found for this number. Sign in with your old password first to verify it, or create an account.'
        : authErrorMessage(error))
    }
    toast.success('Code sent!')
    setOtpCtx({ phone: e164, purpose: 'reset' })
    setView('otp')
  }

  return (
    <div style={{ backgroundColor: '#1a0a3d', minHeight: '100vh' }} className="flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">

        <div className="flex flex-col items-center gap-3 mb-8">
          <ViiMbuniLogo size="lg" />
          <p className="text-gray-400 text-sm">Connect. Share. Thrive.</p>
        </div>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">

          {/* Method chooser */}
          {view === 'choose' && (
            <>
              <h2 className="text-xl font-bold text-white mb-2">Sign in</h2>
              <p className="text-gray-400 text-sm mb-6">How would you like to sign in?</p>
              <div className="grid grid-cols-2 gap-3">
                {[['email', Mail, 'Email'], ['phone', Phone, 'Phone']].map(([key, Icon, label]) => (
                  <button key={key} onClick={() => go(key)}
                    className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white/5 border border-white/15 hover:border-brand-400 hover:bg-brand-500/10 transition-all duration-200 group">
                    <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
                      <Icon size={20} className="text-brand-300" />
                    </div>
                    <span className="text-sm font-semibold text-white">{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-center text-gray-400 text-sm mt-5">
                No account?{' '}
                <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Create one</Link>
              </p>
            </>
          )}

          {/* Email login */}
          {view === 'email' && (
            <>
              <button onClick={() => go('choose')} className={backClass}>← Back</button>
              <h2 className="text-xl font-bold text-white mb-5">Sign in with Email</h2>
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelClass + ' !mb-0'}>Password</label>
                    <button type="button" onClick={() => { setForgotMethod('email'); setResetSent(false); setView('forgot') }}
                      className="text-xs text-brand-400 hover:text-brand-300 transition-colors">Forgot password?</button>
                  </div>
                  <PasswordInput value={password} onChange={e => setPassword(e.target.value)} show={showPw}
                    onToggle={() => setShowPw(v => !v)} autoComplete="current-password" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
                </button>
              </form>
              <p className="text-center text-gray-400 text-sm mt-4">
                No account?{' '}<Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Create one</Link>
              </p>
            </>
          )}

          {/* Phone login */}
          {view === 'phone' && (
            <>
              <button onClick={() => go('choose')} className={backClass}>← Back</button>
              <h2 className="text-xl font-bold text-white mb-5">Sign in with Phone</h2>
              <form onSubmit={handlePhoneLogin} className="space-y-4">
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input type="tel" autoComplete="tel" placeholder="+234 801 234 5678"
                    value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelClass + ' !mb-0'}>Password</label>
                    <button type="button" onClick={() => { setForgotMethod('phone'); setResetSent(false); setView('forgot') }}
                      className="text-xs text-brand-400 hover:text-brand-300 transition-colors">Forgot password?</button>
                  </div>
                  <PasswordInput value={password} onChange={e => setPassword(e.target.value)} show={showPw}
                    onToggle={() => setShowPw(v => !v)} autoComplete="current-password" />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
                </button>
              </form>
              <p className="text-center text-gray-400 text-sm mt-4">
                No account?{' '}<Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold">Create one</Link>
              </p>
            </>
          )}

          {/* Forgot password (phone → SMS code, email → reset link) */}
          {view === 'forgot' && (
            resetSent ? (
              <div className="text-center space-y-4">
                <div className="text-4xl">📧</div>
                <h2 className="text-xl font-bold text-white">Check your email</h2>
                <p className="text-gray-400 text-sm">
                  We sent a reset link to <span className="text-brand-400 font-semibold">{email}</span>
                </p>
                <button onClick={() => { setResetSent(false); go('email') }} className="btn-primary w-full py-3">Back to Sign in</button>
              </div>
            ) : (
              <>
                <button onClick={() => go(forgotMethod === 'phone' ? 'phone' : 'email')} className={backClass}>← Back to sign in</button>
                <h2 className="text-xl font-bold text-white mb-2">Reset password</h2>
                <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-white/5">
                  {[['phone', 'By SMS'], ['email', 'By email']].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setForgotMethod(k)}
                      className={['py-2 text-xs font-semibold rounded-lg transition-colors',
                        forgotMethod === k ? 'bg-brand-500/30 text-white' : 'text-gray-400 hover:text-white'].join(' ')}>
                      {label}
                    </button>
                  ))}
                </div>
                {forgotMethod === 'phone' ? (
                  <form onSubmit={handleForgotPhone} className="space-y-4">
                    <p className="text-gray-400 text-sm">Enter your phone number and we'll text you a code.</p>
                    <div>
                      <label className={labelClass}>Phone Number</label>
                      <input type="tel" autoComplete="tel" placeholder="+234 801 234 5678"
                        value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                      {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send code'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleForgotEmail} className="space-y-4">
                    <p className="text-gray-400 text-sm">Enter your email and we'll send you a reset link.</p>
                    <div>
                      <label className={labelClass}>Email</label>
                      <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                      {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
                    </button>
                  </form>
                )}
              </>
            )
          )}

          {/* SMS code */}
          {view === 'otp' && otpCtx && (
            <OtpScreen
              phone={otpCtx.phone}
              purpose={otpCtx.purpose}
              captcha={captcha}
              onBack={() => go(otpCtx.purpose === 'reset' ? 'forgot' : 'phone')}
              onDone={() => {
                if (otpCtx.purpose === 'reset') { toast.success('Verified — choose a new password'); navigate('/reset-password', { replace: true }) }
                else welcome()
              }}
            />
          )}

          {/* One persistent captcha widget for every Supabase call on this page */}
          {captchaEnabled && view !== 'choose' && <div className="mt-4"><Captcha ref={captcha.ref} onToken={captcha.setToken} /></div>}
        </div>

        <p className="text-center text-xs text-gray-500 mt-3">
          <Link to="/terms" className="hover:text-gray-300 underline underline-offset-2">Terms & Conditions</Link>
          {' · '}
          <Link to="/privacy" className="hover:text-gray-300 underline underline-offset-2">Privacy</Link>
          {' · '}
          <Link to="/about" className="hover:text-gray-300 underline underline-offset-2">About</Link>
        </p>
      </div>
    </div>
  )
}
