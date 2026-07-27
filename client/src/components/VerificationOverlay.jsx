import { useState, useEffect } from 'react'
import { api } from '../api'
import { useAuth } from '../store'
import { useNavigate, useLocation } from 'react-router-dom'

export default function VerificationOverlay() {
  const { token } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!token) return
    api(token).get('/api/security/status')
      .then(res => setStatus(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token])

  if (!token || loading || !status || status.email_verified) return null

  // Don't show on public pages or admin pages
  const publicPaths = ['/login', '/signup', '/admin/login', '/reset-password']
  if (publicPaths.includes(loc.pathname) || loc.pathname.startsWith('/admin')) {
    return null
  }

  async function onVerify(e) {
    e.preventDefault()
    setVerifying(true)
    setErr('')
    setMsg('')
    try {
      await api(token).post('/api/security/email/verify', { code: otp })
      setStatus({ ...status, email_verified: 1 })
    } catch (e) {
      setErr(e?.response?.data?.error || 'Verification failed. Please check the code.')
    } finally {
      setVerifying(false)
    }
  }

  async function resendOtp() {
    setSending(true)
    setErr('')
    setMsg('')
    try {
      await api(token).post('/api/security/email/send')
      setMsg('A new verification code has been sent to your email.')
    } catch (e) {
      setErr('Failed to send verification code. Please try again later.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="card max-w-md w-full border border-white/10 shadow-[0_0_50px_rgba(0,223,154,0.1)]">
        <div className="w-12 h-12 rounded-full bg-brand/20 text-brand flex items-center justify-center mb-6 mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-2">Verify your email</h2>
        <p className="text-center text-white/60 text-sm mb-6">
          To secure your account and start trading, please verify your email address.
        </p>

        {err && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm mb-4 text-center">
            {err}
          </div>
        )}
        
        {msg && (
          <div className="p-3 bg-brand/10 border border-brand/20 rounded text-brand text-sm mb-4 text-center">
            {msg}
          </div>
        )}

        <form onSubmit={onVerify} className="space-y-4">
          <div>
            <div className="label text-center">Enter 6-digit Code</div>
            <input 
              type="text"
              required
              maxLength={6}
              className="input font-mono text-center tracking-widest text-2xl h-14"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </div>
          <button className="btn w-full h-12 text-base" disabled={verifying || otp.length !== 6}>
            {verifying ? 'Verifying...' : 'Verify Now'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={resendOtp} 
            disabled={sending}
            className="text-sm text-brand hover:text-white transition-colors"
          >
            {sending ? 'Sending...' : 'Didn\'t receive a code? Resend'}
          </button>
        </div>
      </div>
    </div>
  )
}
