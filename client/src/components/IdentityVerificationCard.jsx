import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../store'
import { socket } from '../socket'
import VerifiedBadge from './VerifiedBadge'
import CountryStateCitySelects from './CountryStateCitySelects'
import GlobalPhoneInput from './GlobalPhoneInput'
import {
  Award,
  Camera,
  Check,
  CheckCircle2,
  FileBadge2,
  Loader2,
  MapPin,
  Save,
  Send,
  ShieldCheck,
  Upload,
  UserCheck
} from 'lucide-react'

function compressImageFile(file, maxDim = 1100, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

const emptyIdentity = {
  document_type: 'nid',
  first_name: '',
  last_name: '',
  father_or_spouse_name: '',
  document_number: '',
  document_birthdate: '',
  document_expires_at: '',
  phone_number: '',
  village_address: '',
  city: '',
  state_province: '',
  postal_code: '',
  document_country: '',
  document_front: '',
  document_back: '',
  selfie: ''
}

export default function IdentityVerificationCard({ onUpdated }) {
  const { token, user, syncProfile } = useAuth()
  const [form, setForm] = useState(emptyIdentity)
  const [status, setStatus] = useState('not_started')
  const [goldVerified, setGoldVerified] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [strength, setStrength] = useState({ score: 15, tier: 'Basic', checks: {} })
  const [settings, setSettings] = useState({
    nid_feature_enabled: true,
    gold_badge_label: 'Verified Strong',
    require_front_back: true,
    require_address: true,
    require_selfie: false,
    section_title: 'NID Identity & Address Verification',
    section_subtitle: ''
  })
  const [loading, setLoading] = useState(true)
  const [savingMode, setSavingMode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const applyServerData = useCallback((d) => {
    if (!d) return
    setStatus(d.status || 'not_started')
    setGoldVerified(Boolean(d.gold_verified))
    setAdminNotes(d.notes || '')
    if (d.account_strength) setStrength(d.account_strength)
    if (d.settings) setSettings(s => ({ ...s, ...d.settings }))
    setForm(prev => ({
      ...prev,
      document_type: d.document_type || 'nid',
      first_name: d.first_name || '',
      last_name: d.last_name || '',
      father_or_spouse_name: d.father_or_spouse_name || '',
      document_number: d.document_number || '',
      document_birthdate: d.document_birthdate || '',
      document_expires_at: d.document_expires_at || '',
      phone_number: d.phone_number || '',
      village_address: d.village_address || '',
      city: d.city || '',
      state_province: d.state_province || '',
      postal_code: d.postal_code || '',
      document_country: d.document_country || '',
      document_front: d.document_front || prev.document_front || '',
      document_back: d.document_back || prev.document_back || '',
      selfie: d.selfie || prev.selfie || ''
    }))
  }, [])

  const loadVerification = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/verifications/me')
      applyServerData(res.data)
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load identity details.')
    } finally {
      setLoading(false)
    }
  }, [token, applyServerData])

  useEffect(() => {
    loadVerification()
  }, [loadVerification])

  useEffect(() => {
    if (!user?.id) return
    const onUpdate = (payload) => {
      if (payload?.user_id === user.id && payload?.type === 'verification_updated') {
        loadVerification()
        syncProfile()
      }
    }
    socket.on('user_data_update', onUpdate)
    return () => socket.off('user_data_update', onUpdate)
  }, [user?.id, loadVerification, syncProfile])

  const handleImagePick = async (field, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const dataUrl = await compressImageFile(file)
      setForm(f => ({ ...f, [field]: dataUrl }))
    } catch (error) {
      setErr(error?.message || 'Unable to process uploaded image.')
    }
  }

  const handleSaveOrSubmit = async (mode) => {
    if (!token || savingMode) return
    setErr('')
    setMsg('')
    setSavingMode(mode)
    try {
      const endpoint = mode === 'draft' ? '/api/verifications/me' : '/api/verifications'
      const method = mode === 'draft' ? 'put' : 'post'
      const res = await api(token)[method](endpoint, {
        ...form,
        document_name: `${form.first_name} ${form.last_name}`.trim(),
        mode
      })
      applyServerData(res.data)
      await syncProfile()
      if (onUpdated) onUpdated(res.data)
      if (res.data?.gold_verified) {
        setMsg(`Identity saved and automatically approved! Your Gold "${settings.gold_badge_label}" badge is active.`)
      } else if (mode === 'draft') {
        setMsg('NID identity details saved! Submit anytime when ready for Admin Gold Verification.')
      } else {
        setMsg('NID identity details submitted! Admin will review your Front & Back ID to unlock your Gold Verified Strong badge.')
      }
      setTimeout(() => setMsg(''), 6000)
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to save identity details.')
    } finally {
      setSavingMode('')
    }
  }

  if (loading) {
    return (
      <div className="card bg-[#0d1522] border border-white/10 rounded-3xl p-6 flex items-center justify-center gap-2 text-xs text-white/60">
        <Loader2 className="w-4 h-4 animate-spin text-brand" />
        <span>Loading NID identity verification...</span>
      </div>
    )
  }

  if (settings.nid_feature_enabled === false && !goldVerified) {
    return null
  }

  const strengthPct = Math.min(100, Math.max(0, Number(strength?.score || 0)))
  const inputCls = 'input min-h-[42px] bg-[#090f19] border-white/10 text-white placeholder:text-white/35 text-sm'
  const labelCls = 'block text-xs font-semibold text-white/75 mb-1.5'

  const uploadSlots = [
    {
      key: 'document_front',
      title: 'NID Front Part',
      hint: 'Clear photo of ID front side (name, photo, NID no.)',
      required: settings.require_front_back
    },
    {
      key: 'document_back',
      title: 'ID / NID Back Part',
      hint: 'Clear photo of ID back side (street address, city, state, ZIP)',
      required: settings.require_front_back
    },
    {
      key: 'selfie',
      title: settings.require_selfie ? 'Live Selfie Photo' : 'Live Selfie (Optional)',
      hint: 'Clear portrait holding ID or face photo',
      required: settings.require_selfie
    }
  ]

  return (
    <div className="card bg-[#0d1522] border border-white/10 rounded-3xl p-5 sm:p-7 space-y-6">
      {/* Header & Account Strength Meter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/15 text-amber-300 border border-amber-400/30 flex items-center justify-center">
              <FileBadge2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-white">{settings.section_title || 'NID Identity & Address Verification'}</h2>
                <VerifiedBadge
                  status={status}
                  goldVerified={goldVerified}
                  label={settings.gold_badge_label}
                />
              </div>
              <p className="text-xs text-white/60 mt-0.5 max-w-2xl">
                {settings.section_subtitle || 'Fill in your identity and address exactly as shown on your NID front and back parts to make your account stronger.'}
              </p>
            </div>
          </div>
        </div>

        {/* Account Strength Box */}
        <div className="lg:w-72 rounded-2xl bg-black/35 border border-white/10 p-3.5 space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/70 font-semibold flex items-center gap-1.5">
              <ShieldCheck className={`w-4 h-4 ${goldVerified ? 'text-amber-400' : 'text-brand'}`} />
              Account Strength
            </span>
            <span className={`font-mono font-bold ${goldVerified ? 'text-amber-300' : 'text-brand'}`}>
              {strengthPct}% • {goldVerified ? settings.gold_badge_label : (strength?.tier || 'Basic')}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                goldVerified
                  ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500'
                  : 'bg-gradient-to-r from-brand to-emerald-400'
              }`}
              style={{ width: `${strengthPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {[
              { ok: strength?.checks?.nid_identity, text: 'NID Info' },
              { ok: strength?.checks?.full_address, text: 'Address' },
              { ok: strength?.checks?.nid_front, text: 'Front' },
              { ok: strength?.checks?.nid_back, text: 'Back' },
              { ok: strength?.checks?.admin_approved, text: 'Gold Badge' }
            ].map(item => (
              <span
                key={item.text}
                className={`px-2 py-0.5 rounded-full border ${
                  item.ok
                    ? (item.text === 'Gold Badge'
                      ? 'bg-amber-400/20 border-amber-400/40 text-amber-300 font-bold'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300')
                    : 'bg-white/5 border-white/10 text-white/45'
                }`}
              >
                {item.ok ? '✓ ' : ''}{item.text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Gold Verified Success Highlight */}
      {goldVerified && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border border-amber-400/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(251,191,36,0.45)]">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-amber-300">
                Gold {settings.gold_badge_label} Account Active
              </div>
              <p className="text-xs text-amber-100/80 mt-0.5">
                Your NID front &amp; back identity and residential address have been verified by Admin. Your account enjoys maximum trust and priority processing.
              </p>
            </div>
          </div>
          <VerifiedBadge status="approved" goldVerified label={settings.gold_badge_label} />
        </div>
      )}

      {status === 'rejected' && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3.5 text-xs text-rose-300 space-y-1">
          <div className="font-bold">Previous Submission Needs Update</div>
          <div>{adminNotes || 'Please verify that your NID details, address, and Front/Back images match clearly, then resubmit.'}</div>
        </div>
      )}

      {status === 'awaiting_approval' && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 p-3.5 text-xs text-amber-200 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Your NID Front &amp; Back details are saved and awaiting Admin approval to unlock your Gold <strong>{settings.gold_badge_label}</strong> badge. You may still update details below if needed.</span>
        </div>
      )}

      {/* NID Front Part Personal Details */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand">
          <UserCheck className="w-4 h-4" />
          <span>1. Identity Details (NID Front Part)</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className={labelCls}>Document Type *</label>
            <select
              value={form.document_type}
              onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
              className={inputCls}
            >
              <option value="nid">National ID (NID)</option>
              <option value="passport">Passport</option>
              <option value="driver_license">Driving License</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>First Name *</label>
            <input
              type="text"
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="e.g. Michael"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Last Name *</label>
            <input
              type="text"
              value={form.last_name}
              onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              placeholder="e.g. Anderson"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>ID / Document Number *</label>
            <input
              type="text"
              value={form.document_number}
              onChange={e => setForm(f => ({ ...f, document_number: e.target.value }))}
              placeholder="Enter National ID / SSN / ID number"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Date of Birth</label>
            <input
              type="date"
              value={form.document_birthdate}
              onChange={e => setForm(f => ({ ...f, document_birthdate: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Phone / Contact Number (Global)</label>
            <GlobalPhoneInput
              value={form.phone_number}
              selectedCountryName={form.document_country}
              dark
              inputClassName={inputCls}
              placeholder="(555) 234-5678"
              onChange={val => setForm(f => ({ ...f, phone_number: val }))}
            />
          </div>
          <div>
            <label className={labelCls}>Middle / Legal Guardian / Spouse (Optional)</label>
            <input
              type="text"
              value={form.father_or_spouse_name}
              onChange={e => setForm(f => ({ ...f, father_or_spouse_name: e.target.value }))}
              placeholder="Optional — printed on ID card"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Card Issue / Expiry Date (Optional)</label>
            <input
              type="text"
              value={form.document_expires_at}
              onChange={e => setForm(f => ({ ...f, document_expires_at: e.target.value }))}
              placeholder="e.g. 2032-12-31 or No Expiry"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* NID Back Part Address Details */}
      <div className="space-y-4 pt-2 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400">
          <MapPin className="w-4 h-4" />
          <span>2. Full Address (ID / NID Back Part)</span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={labelCls}>Street Address / Apt / House / Village {settings.require_address ? '*' : ''}</label>
            <input
              type="text"
              value={form.village_address}
              onChange={e => setForm(f => ({ ...f, village_address: e.target.value }))}
              placeholder="e.g. 742 Maple Street, Apt 4B"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Postal / ZIP Code</label>
            <input
              type="text"
              value={form.postal_code}
              onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))}
              placeholder="e.g. 10001"
              className={inputCls}
            />
          </div>
          <CountryStateCitySelects
            country={form.document_country}
            state={form.state_province}
            city={form.city}
            onChange={({ country, state, city }) =>
              setForm(f => ({
                ...f,
                document_country: country,
                state_province: state,
                city
              }))
            }
            required={Boolean(settings.require_address)}
            dark
            inputClassName={inputCls}
            labelClassName={labelCls}
          />
        </div>
      </div>

      {/* NID Images Upload */}
      <div className="space-y-4 pt-2 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
          <Camera className="w-4 h-4" />
          <span>3. NID Front Part, Back Part &amp; Selfie Photos</span>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {uploadSlots.map(slot => {
            const val = form[slot.key]
            return (
              <div key={slot.key} className="rounded-2xl border border-white/10 bg-black/30 p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
                    <span>{slot.title} {slot.required ? '*' : ''}</span>
                    {val && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">{slot.hint}</p>
                </div>

                {val ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/50 h-32">
                    <img src={val} alt={slot.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] h-32 flex flex-col items-center justify-center text-white/40 text-xs">
                    <Upload className="w-5 h-5 mb-1.5 opacity-60" />
                    <span>No photo uploaded</span>
                  </div>
                )}

                <label className="cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-semibold text-white transition">
                  <Upload className="w-3.5 h-3.5 text-brand" />
                  <span>{val ? 'Change Photo' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleImagePick(slot.key, e)}
                  />
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {err && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-4 py-3 text-xs text-rose-400">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
        <p className="text-[11px] text-white/50">
          All NID data &amp; images are stored securely in your encrypted account database.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={Boolean(savingMode)}
            onClick={() => handleSaveOrSubmit('draft')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 px-5 py-2.5 text-xs font-bold text-white transition disabled:opacity-50"
          >
            {savingMode === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-sky-400" />}
            <span>Save Progress</span>
          </button>
          <button
            type="button"
            disabled={Boolean(savingMode)}
            onClick={() => handleSaveOrSubmit('submit')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 px-6 py-2.5 text-xs font-extrabold text-slate-950 shadow-[0_0_20px_rgba(251,191,36,0.3)] transition disabled:opacity-50"
          >
            {savingMode === 'submit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{goldVerified ? 'Save & Resubmit NID' : 'Save & Submit for Gold Badge'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
