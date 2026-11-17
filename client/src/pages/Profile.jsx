import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store'
import { api } from '../api'
import ProfileForm from '../components/ProfileForm'
import UserAvatar from '../components/UserAvatar'
import AvatarCropModal from '../components/AvatarCropModal'
import {
  Camera,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wallet,
  Users,
  Lock
} from 'lucide-react'
import {
  computeAutoAdjustment,
  exportAdjustedAvatar,
  loadImageFromDataUrl,
  loadImageFromFile
} from '../utils/avatarUtils'

export default function Profile() {
  const { token, user, updateUser, syncProfile } = useAuth()
  const fileInputRef = useRef(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState('')
  const [avatarErr, setAvatarErr] = useState('')
  const [copiedRef, setCopiedRef] = useState(false)

  // Adjuster / cropper modal state
  const [cropOpen, setCropOpen] = useState(false)
  const [sourceImage, setSourceImage] = useState(null)
  const [cropSettings, setCropSettings] = useState({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })

  // Keep user profile synced with backend on visit
  useEffect(() => {
    if (!token) return
    syncProfile()
  }, [token, syncProfile])

  const persistAvatar = async (avatarDataUrl, successText = 'Profile picture updated and auto-adjusted!') => {
    if (!token) return
    setAvatarErr('')
    setAvatarMsg('')
    setUploadingAvatar(true)
    try {
      const res = await api(token).put('/api/me', { avatar: avatarDataUrl })
      const userId = res?.data?.id || user?.id
      const removedKey = userId ? `avatar_removed_${userId}` : 'avatar_removed'
      if (avatarDataUrl) {
        localStorage.removeItem(removedKey)
      } else {
        localStorage.setItem(removedKey, '1')
      }
      updateUser({ ...res.data, avatar: avatarDataUrl || null })
      setAvatarMsg(successText)
      setTimeout(() => setAvatarMsg(''), 4000)
    } catch (err) {
      setAvatarErr(err?.response?.data?.error || 'Failed to upload profile picture. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setAvatarErr('')
    setAvatarMsg('')
    setUploadingAvatar(true)

    try {
      const loadedSource = await loadImageFromFile(file)
      const autoSettings = computeAutoAdjustment(loadedSource, 0)
      const autoCroppedDataUrl = exportAdjustedAvatar(loadedSource, autoSettings, 320)

      setSourceImage(loadedSource)
      setCropSettings(autoSettings)

      await persistAvatar(autoCroppedDataUrl, 'Profile picture uploaded and automatically adjusted!')
    } catch (err) {
      setAvatarErr(err?.message || 'Unable to process image file.')
      setUploadingAvatar(false)
    }
  }

  const handleOpenAdjuster = async () => {
    setAvatarErr('')
    try {
      let src = sourceImage
      if (!src && user?.avatar) {
        src = await loadImageFromDataUrl(user.avatar)
        setSourceImage(src)
        setCropSettings(computeAutoAdjustment(src, 0))
      }
      if (src) {
        setCropOpen(true)
      }
    } catch (err) {
      setAvatarErr('Unable to load image for adjustment. Please upload a new photo.')
    }
  }

  const handleSaveAdjusted = async (croppedDataUrl, nextSettings) => {
    setCropSettings(nextSettings)
    await persistAvatar(croppedDataUrl, 'Profile picture adjustment saved!')
    setCropOpen(false)
  }

  const handleRemoveAvatar = async () => {
    setSourceImage(null)
    await persistAvatar('', 'Profile picture removed.')
  }

  const handleCopyReferral = async () => {
    const code = user?.referral_code || ''
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 2000)
    } catch (_) {}
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Active'

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Mobile-First Profile Hero Card */}
      <div className="card bg-[#0d1522] border border-white/10 rounded-3xl p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-brand/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-5 sm:gap-7">
          {/* Circular Mobile-Responsive Avatar with Camera Badge */}
          <div className="relative flex-shrink-0 group">
            <button
              type="button"
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Upload profile picture"
              className="relative rounded-full focus:outline-none focus:ring-4 focus:ring-brand/30 transition-transform active:scale-95"
            >
              <UserAvatar
                user={user}
                size="xl"
                className="ring-4 ring-brand/25 border-2 border-brand shadow-[0_0_28px_rgba(0,223,154,0.22)]"
              />
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/65 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-brand animate-spin" />
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-brand text-black shadow-lg border-2 border-[#0d1522] flex items-center justify-center group-hover:scale-105 transition">
                <Camera className="w-4 h-4" />
              </span>
            </button>
          </div>

          {/* Name, Email & Action Buttons */}
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-2.5 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 justify-center sm:justify-start">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                {user?.name || 'AvaPartner Trader'}
              </h1>
              <span className="inline-flex items-center gap-1 self-center sm:self-auto px-2.5 py-0.5 rounded-full bg-brand/15 border border-brand/30 text-brand text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Partner
              </span>
            </div>

            <p className="text-xs sm:text-sm text-white/60 break-all">{user?.email}</p>

            {/* Upload / Adjust / Remove Buttons - Touch Friendly on Mobile */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand hover:bg-brand-dark text-black font-bold text-xs px-4 py-2 shadow-sm transition active:scale-95 disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{user?.avatar ? 'Change Photo' : 'Upload Photo'}</span>
              </button>

              {user?.avatar && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenAdjuster}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold text-xs px-3.5 py-2 transition active:scale-95 disabled:opacity-60"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-brand" />
                    <span>Adjust</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 font-semibold text-xs px-3.5 py-2 transition active:scale-95 disabled:opacity-60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </>
              )}
            </div>

            <p className="text-[11px] text-white/50">
              Photos are automatically centered, cropped, and optimized for your mobile &amp; web profile.
            </p>
          </div>
        </div>

        {(avatarMsg || avatarErr) && (
          <div className="relative z-10 mt-4">
            {avatarMsg && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{avatarMsg}</span>
              </div>
            )}
            {avatarErr && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-400">
                {avatarErr}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Profile Settings & Account Details */}
      <div className="grid md:grid-cols-2 gap-4">
        <ProfileForm />

        <div className="card bg-[#0d1522] border border-white/10 rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">Your Account</h2>

            <div className="divide-y divide-white/10 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-white/60 text-xs">Email</span>
                <span className="text-white font-medium text-xs sm:text-sm truncate">{user?.email || '-'}</span>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-white/60 text-xs">Role</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white capitalize">
                  {user?.role || 'user'}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-white/60 text-xs">Referral Code</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-brand text-xs sm:text-sm">{user?.referral_code || '-'}</span>
                  {user?.referral_code && (
                    <button
                      type="button"
                      onClick={handleCopyReferral}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-brand transition"
                      aria-label="Copy referral code"
                    >
                      {copiedRef ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-white/60 text-xs">Member Since</span>
                <span className="text-white/70 text-xs sm:text-sm">{memberSince}</span>
              </div>
            </div>
          </div>

          {/* Mobile Quick Shortcuts */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Link
              to="/wallet/deposit"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 px-2 text-center transition"
            >
              <Wallet className="w-4 h-4 text-brand" />
              <span className="text-[11px] font-semibold text-white">Deposit</span>
            </Link>
            <Link
              to="/referral"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 px-2 text-center transition"
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span className="text-[11px] font-semibold text-white">Affiliate</span>
            </Link>
            <Link
              to="/security"
              className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 px-2 text-center transition"
            >
              <Lock className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-white">Security</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile-Friendly Touch Crop/Zoom/Rotate Modal */}
      <AvatarCropModal
        open={cropOpen}
        sourceImage={sourceImage}
        initialSettings={cropSettings}
        saving={uploadingAvatar}
        onClose={() => setCropOpen(false)}
        onSave={handleSaveAdjusted}
      />
    </div>
  )
}
