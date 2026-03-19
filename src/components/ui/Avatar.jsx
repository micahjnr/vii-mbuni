import { useState } from 'react'
import clsx from 'clsx'

const COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-rose-500',
]

function colorFor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

export default function Avatar({ src, name = '', size = 40, className = '', onClick, online = false }) {
  const [imgError, setImgError] = useState(false)
  const [prevSrc, setPrevSrc] = useState(src)

  // Reset error state when src changes (e.g. after uploading a new avatar).
  // Without this the initials fallback sticks forever once an image errors.
  if (src !== prevSrc) {
    setPrevSrc(src)
    if (imgError) setImgError(false)
  }

  const initials = name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  const color = colorFor(name)
  const showImage = src && !imgError

  return (
    <div
      className={clsx('relative flex-shrink-0', onClick && 'cursor-pointer', className)}
      onClick={onClick}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="avatar w-full h-full"
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={clsx('avatar w-full h-full flex items-center justify-center text-white font-bold select-none', color)}
          style={{ fontSize: Math.max(10, size * 0.38) }}
        >
          {initials}
        </div>
      )}
      {online && <span className="online-dot" />}
    </div>
  )
}
