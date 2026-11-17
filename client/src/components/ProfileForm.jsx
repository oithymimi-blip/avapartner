import { useEffect, useState } from 'react'
import { useAuth } from '../store'
import { api } from '../api'
import { Check, Loader2, User } from 'lucide-react'

export default function ProfileForm() {
  const { token, user, updateUser } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    setName(user?.name || '')
  }, [user?.name])

  async function save(e) {
    e?.preventDefault?.()
    if (!token) return
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      const res = await api(token).put('/api/me', { name })
      updateUser(res.data)
      setMsg('Profile details saved successfully.')
      setTimeout(() => setMsg(''), 3500)
    } catch (error) {
      setErr(error?.response?.data?.error || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="card bg-[#0d1522] border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-brand/15 text-brand flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Personal Details</h2>
          <p className="text-xs text-white/60">Update your display name shown across your account</p>
        </div>
      </div>

      <div>
        <label className="label block">Full name</label>
        <input
          className="input min-h-[44px]"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter your full name"
        />
      </div>

      {err && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-400">
          {err}
        </div>
      )}

      {msg && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="btn w-full sm:w-auto min-h-[44px] px-6 font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        <span>{saving ? 'Saving...' : 'Save changes'}</span>
      </button>
    </form>
  )
}
