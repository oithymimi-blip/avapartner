import { useEffect, useState } from 'react'
import { useAuth } from '../store'
import { api } from '../api'

export default function Security() {
  const { token } = useAuth()
  const [status, setStatus] = useState({ email_verified: 0, phone_verified: 0, phone_number: '' })
  const [emailCode, setEmailCode] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const loadStatus = async () => {
    if (!token) return
    try {
      const res = await api(token).get('/api/security/status')
      setStatus(res.data || {})
      setPhone(res.data?.phone_number || '')
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load security status')
    }
  }

  useEffect(() => { loadStatus() }, [token])

  const sendEmailCode = async () => {
    if (!token) return
    setMessage('')
    try {
      const res = await api(token).post('/api/security/email/send')
      setMessage(`Email code sent. Use code: ${res.data?.code || 'check console'}`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to send email code')
    }
  }

  const verifyEmail = async () => {
    if (!token) return
    setMessage('')
    try {
      await api(token).post('/api/security/email/verify', { code: emailCode })
      setMessage('Email verified')
      setEmailCode('')
      loadStatus()
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Email verification failed')
    }
  }

  const sendPhoneCode = async () => {
    if (!token) return
    if (!phone.trim()) {
      setMessage('Enter a phone number first')
      return
    }
    setMessage('')
    try {
      const res = await api(token).post('/api/security/phone/send', { phone })
      setMessage(`SMS code sent. Use code: ${res.data?.code || 'check console'}`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to send SMS code')
    }
  }

  const verifyPhone = async () => {
    if (!token) return
    setMessage('')
    try {
      await api(token).post('/api/security/phone/verify', { code: phoneCode })
      setMessage('Phone verified')
      setPhoneCode('')
      loadStatus()
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Phone verification failed')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-white/45">Security</div>
        <h1 className="text-2xl font-semibold text-white">Protect your account</h1>
        <p className="text-sm text-white/60">Verify your email and phone with OTP codes.</p>
      </div>

      {message && <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/40 px-4 py-2 text-sm text-emerald-200">{message}</div>}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Email verification</div>
          <span className={`text-xs px-3 py-1 rounded-full border ${status.email_verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {status.email_verified ? 'Verified' : 'Not verified'}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn" onClick={sendEmailCode} disabled={loading}>Send code</button>
          <input
            className="input w-40"
            placeholder="Enter code"
            value={emailCode}
            onChange={e => setEmailCode(e.target.value)}
          />
          <button className="btn bg-emerald-500 text-white" onClick={verifyEmail} disabled={loading || !emailCode.trim()}>Verify</button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Phone verification</div>
          <span className={`text-xs px-3 py-1 rounded-full border ${status.phone_verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {status.phone_verified ? 'Verified' : 'Not verified'}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            className="input w-56"
            placeholder="Phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <button className="btn" onClick={sendPhoneCode} disabled={loading}>Send SMS code</button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            className="input w-40"
            placeholder="Enter code"
            value={phoneCode}
            onChange={e => setPhoneCode(e.target.value)}
          />
          <button className="btn bg-emerald-500 text-white" onClick={verifyPhone} disabled={loading || !phoneCode.trim()}>Verify</button>
        </div>
      </div>
    </div>
  )
}
