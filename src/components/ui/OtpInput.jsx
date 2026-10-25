import { useEffect, useRef, useState } from 'react'

export const EMPTY_OTP = ['', '', '', '', '', '']

/** Countdown for "Resend code". Returns [secondsLeft, restart]. */
export function useCooldown(seconds = 60) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, () => setLeft(seconds)]
}

/** 6-box code input. Supports paste and SMS autofill (iOS/Android put all 6 digits in the first box). */
export default function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([])
  const focus = (i) => refs.current[i]?.focus()

  const handleChange = (i, raw) => {
    const digits = raw.replace(/\D/g, '')
    const next = [...value]
    if (!digits) { next[i] = ''; return onChange(next) }
    const typedOne = value[i] && digits.length === 2          // typed over an existing digit
    const chars = (typedOne ? digits.slice(-1) : digits).slice(0, 6 - i).split('')
    chars.forEach((ch, k) => { next[i + k] = ch })
    onChange(next)
    focus(Math.min(i + chars.length, 5))
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) focus(i - 1)
  }

  return (
    <div className="flex gap-2 justify-center">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={[
            'w-11 h-14 text-center text-xl font-bold rounded-xl',
            'bg-white/10 border-2 text-white caret-white',
            digit ? 'border-brand-400' : 'border-white/20',
            'focus:outline-none focus:border-brand-400 transition-all duration-150',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
