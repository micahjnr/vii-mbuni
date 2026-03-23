import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Phone, Mail } from 'lucide-react'
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

// Validate phone: allow digits, spaces, dashes, +, () — min 7 digits
const isValidPhone = (p) => p.replace(/\D/g, '').length >= 7

// Build a placeholder email from phone so Supabase Auth (which requires email)
// can still create the account without the user needing a real email address.
const phonePlaceholderEmail = (phone) =>
  `${phone.replace(/\D/g, '')}@vii-mbuni.app`

export default function Register() {
  const [form, setForm]       = useState({ fullName: '', username: '', phone: '', email: '', password: '', confirmPassword: '' })
  const [showPw, setShowPw]   = useState(false)
  const [showCpw, setShowCpw] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate              = useNavigate()

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { fullName, username, phone, email, password, confirmPassword } = form

    // ── Validation ──────────────────────────────────────────────
    if (!fullName.trim())             return toast.error('Please enter your full name')
    if (!username.trim())             return toast.error('Please choose a username')
    if (!phone.trim())                return toast.error('Please enter your phone number')
    if (!isValidPhone(phone))         return toast.error('Enter a valid phone number (at least 7 digits)')
    if (!password)                    return toast.error('Please enter a password')
    if (password.length < 6)          return toast.error('Password must be at least 6 characters')
    if (password !== confirmPassword) return toast.error('Passwords do not match — please check and try again')

    // Email is optional — use placeholder if not provided
    const authEmail    = email.trim() ? email.trim() : phonePlaceholderEmail(phone)
    const hasRealEmail = !!email.trim()

    setLoading(true)

    const { data, error } = await sb.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: {
          full_name:      fullName.trim(),
          username:       cleanUser(username),
          phone_number:   phone.trim(),
          has_real_email: hasRealEmail,
        },
      },
    })

    if (error) {
      setLoading(false)
      if (error.message?.toLowerCase().includes('already registered')) {
        return toast.error('This phone number is already registered. Please sign in.')
      }
      return toast.error(error.message)
    }

    // Upsert profile row (handles trigger race condition)
    if (data?.user) {
      await sb.from('profiles').upsert({
        id:           data.user.id,
        full_name:    fullName.trim(),
        username:     cleanUser(username),
        email:        hasRealEmail ? email.trim() : null,
        phone_number: phone.trim(),
        has_real_email: hasRealEmail,
      }, { onConflict: 'id' })
    }

    // If Supabase email-confirmation is ON, signUp() creates the account but
    // does NOT issue a session (data.session is null for unconfirmed users).
    // Phone users have a fake @vii-mbuni.app email they can never confirm, so
    // we sign them in immediately with their password to get a valid session.
    if (!data?.session) {
      const signInEmail = hasRealEmail ? email.trim() : phonePlaceholderEmail(phone)
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: signInEmail,
        password,
      })
      if (signInError) {
        setLoading(false)
        // Account was created but auto-login failed — guide user to login page
        toast.success('Account created! Please sign in to continue.')
        navigate('/login')
        return
      }
    }

    setLoading(false)
    toast.success('Welcome to Vii-Mbuni! 🎉')
    navigate('/')
  }

  return (
    <div style={{ backgroundColor: '#1a0a3d', minHeight: '100vh' }}
      className="flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-up">

        <div className="flex flex-col items-center gap-3 mb-8">
          <ViiMbuniLogo size="lg" />
          <p className="text-gray-400 text-sm">Join the community today</p>
        </div>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          className="rounded-2xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl">

          <h2 className="text-xl font-bold text-white mb-5">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-3.5">

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Full Name</label>
              <input type="text" value={form.fullName} onChange={set('fullName')} className={inputClass} placeholder="e.g. Amina Yusuf" />
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Username</label>
              <input type="text" value={form.username} onChange={set('username')} className={inputClass} placeholder="e.g. amina_y" />
            </div>

            {/* Phone — required */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Phone size={12} />
                Phone Number <span className="text-brand-400 ml-0.5">*</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                className={inputClass}
                placeholder="e.g. 0712 345 678"
                inputMode="tel"
              />
              <p className="text-xs text-gray-500 mt-1">No SMS verification needed — just enter and go</p>
            </div>

            {/* Email — optional */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Mail size={12} />
                Email Address <span className="text-gray-500 font-normal normal-case ml-0.5">(optional)</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                className={inputClass}
                placeholder="you@example.com — add later if you don't have one"
              />
              <p className="text-xs text-gray-500 mt-1">You can add or verify your email any time in Settings</p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  className={inputClass + ' pr-10'}
                  placeholder="At least 6 characters"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  type={showCpw ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  className={[
                    inputClass + ' pr-10',
                    form.confirmPassword && form.confirmPassword !== form.password
                      ? '!border-red-400 focus:!ring-red-400'
                      : form.confirmPassword && form.confirmPassword === form.password
                        ? '!border-green-400 focus:!ring-green-400'
                        : '',
                  ].join(' ')}
                  placeholder="Re-enter your password"
                />
                <button type="button" onClick={() => setShowCpw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                  {showCpw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <p className="text-xs text-red-400 mt-1">⚠ Passwords do not match</p>
              )}
              {form.confirmPassword && form.confirmPassword === form.password && (
                <p className="text-xs text-green-400 mt-1">✓ Passwords match</p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-1">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-sm mt-4">
          <span>Have an account? </span>
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Sign in</Link>
        </p>
        <p className="text-center text-xs text-gray-500 mt-2">
          By registering you agree to our{' '}
          <Link to="/terms" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Terms & Conditions</Link>
        </p>
      </div>
    </div>
  )
}
