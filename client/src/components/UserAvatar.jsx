import { useState, useEffect } from 'react'

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 sm:w-28 sm:h-28 text-3xl'
}

export default function UserAvatar({ user, size = 'sm', className = '' }) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [user?.avatar])

  const initial = user?.name?.[0]?.toUpperCase?.() || user?.email?.[0]?.toUpperCase?.() || 'U'
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm
  const showImage = Boolean(user?.avatar && !imgError)

  return (
    <div
      className={`${sizeCls} rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold select-none ${
        showImage
          ? 'bg-black/40 border border-brand/40'
          : 'bg-gradient-to-br from-brand/25 via-emerald-500/20 to-sky-500/25 border border-brand/30 text-brand'
      } ${className}`}
    >
      {showImage ? (
        <img
          src={user.avatar}
          alt={user?.name || 'Profile picture'}
          className="w-full h-full object-cover object-center"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
