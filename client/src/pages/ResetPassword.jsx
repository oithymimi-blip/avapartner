import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

export default function ResetPassword() {
  const [qp, setQp] = useSearchParams()
  const token = qp.get('token') || ''
  const nav = useNavigate()

  // State for request link step
  const [email, setEmail] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [requestErr, setRequestErr] = useState('')

  // State for token verification
  const [tokenVerifying, setTokenVerifying] = useState(Boolean(token))
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenErr, setTokenErr] = useState('')

  // State for set new password step
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetErr, setResetErr] = useState('')

  // Verify token when component mounts or token changes
  useEffect(() => {
    if (!token) {
      setTokenVerifying(false)
      return
    }
    let isMounted = true
    setTokenVerifying(true)
    setTokenErr('')

    api()
      .get(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!isMounted) return
        if (res.data?.valid) {
          setTokenValid(true)
        } else {
          setTokenValid(false)
          setTokenErr(res.data?.error || 'This reset link is invalid or has expired.')
        }
      })
      .catch(() => {
        if (!isMounted) return
        setTokenValid(false)
        setTokenErr('Failed to verify reset token. Please check your connection or request a new link.')
      })
      .finally(() => {
        if (isMounted) setTokenVerifying(false)
      })

    return () => {
      isMounted = false
    }
  }, [token])

  async function handleRequestLink(e) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setRequestErr('Please enter a valid email address')
      return
    }
    setRequestErr('')
    setRequestLoading(true)
    try {
      await api().post('/api/auth/request-password-reset', { email: email.trim() })
      setRequestSent(true)
    } catch (e) {
      setRequestErr(e?.response?.data?.error || 'Failed to send reset link. Please try again.')
    } finally {
      setRequestLoading(false)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!newPass) {
      setResetErr('Please enter a new password.')
      return
    }
    if (newPass.length < 6) {
      setResetErr('Password must be at least 6 characters long.')
      return
    }
    if (newPass !== confirmPass) {
      setResetErr('Passwords do not match.')
      return
    }
    setResetErr('')
    setResetLoading(true)
    try {
      await api().post('/api/auth/reset-password', { token, new_password: newPass })
      setResetSuccess(true)
    } catch (e) {
      setResetErr(e?.response?.data?.error || 'Failed to update password. Link may have expired.')
    } finally {
      setResetLoading(false)
    }
  }

  // FLOW 1: LINK TOKEN PRESENT IN URL
  if (token) {
    // 1a. Verifying Token...
    if (tokenVerifying) {
      return (
        <div className="max-w-md mx-auto card text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent mb-4"></div>
          <p className="text-white/80 font-medium text-sm">Verifying reset link security token...</p>
        </div>
      )
    }

    // 1b. Token Invalid / Expired
    if (!tokenValid) {
      return (
        <div className="max-w-md mx-auto card text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-white">Reset Link Invalid or Expired</h2>
          <p className="text-white/70 text-sm">{tokenErr || 'This reset link has expired or has already been used.'}</p>
          <button
            onClick={() => setQp({})}
            className="btn w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold py-2.5 rounded-lg transition-all"
          >
            Request a New Reset Link
          </button>
          <div className="pt-2 text-sm text-white/50">
            Or <Link to="/login" className="link text-emerald-400 hover:underline">Return to Login</Link>
          </div>
        </div>
      )
    }

    // 1c. Token Valid - Success Screen after password set
    if (resetSuccess) {
      return (
        <div className="max-w-md mx-auto card text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-2xl font-bold">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-white">Password Updated!</h2>
          <p className="text-white/70 text-sm">Your password has been successfully updated. You can now log in using your new password.</p>
          <button
            onClick={() => nav('/login')}
            className="btn w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold py-2.5 rounded-lg transition-all"
          >
            Sign In Now
          </button>
        </div>
      )
    }

    // 1d. Token Valid - Set New Password Form
    return (
      <div className="max-w-md mx-auto card space-y-5">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Set New Password</h2>
          <p className="text-white/70 text-sm">Please choose a strong password containing at least 6 characters.</p>
        </div>

        {resetErr && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            {resetErr}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <div className="label text-sm text-white/80 mb-1">New Password</div>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input w-full pr-10"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-xs font-medium"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <div className="label text-sm text-white/80 mb-1">Confirm New Password</div>
            <input
              type={showPass ? 'text' : 'password'}
              className="input w-full"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50"
            disabled={resetLoading}
          >
            {resetLoading ? 'Updating Password...' : 'Set New Password'}
          </button>
        </form>

        <div className="text-center text-sm text-white/50 pt-1">
          <Link to="/login" className="link text-emerald-400 hover:underline">Back to Login</Link>
        </div>
      </div>
    )
  }

  // FLOW 2: REQUEST RESET LINK FORM (No token in URL)
  return (
    <div className="max-w-md mx-auto card space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Reset your password</h2>
        <p className="text-white/70 text-sm">
          Enter your account email address below. We'll send you a link to reset your password.
        </p>
      </div>

      {requestSent ? (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-4 rounded-lg text-sm space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <span>✉️</span> Check Your Email
            </div>
            <p className="text-white/80 text-xs leading-relaxed">
              If an account exists with <strong className="text-white">{email}</strong>, a password reset link has been dispatched to your inbox.
            </p>
          </div>
          <p className="text-xs text-white/50 text-center">
            Didn't receive the email? Check your spam folder or try requesting again.
          </p>
          <button
            onClick={() => setRequestSent(false)}
            className="btn w-full bg-white/10 hover:bg-white/15 text-white py-2 rounded-lg text-sm transition-all"
          >
            Try another email
          </button>
          <div className="text-center text-sm text-white/60 pt-2">
            <Link to="/login" className="link text-emerald-400 hover:underline">Back to Sign in</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRequestLink} className="space-y-4">
          {requestErr && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {requestErr}
            </div>
          )}

          <div>
            <div className="label text-sm text-white/80 mb-1">Email address</div>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            className="btn w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50"
            disabled={requestLoading}
          >
            {requestLoading ? 'Sending Link...' : 'Send reset link'}
          </button>

          <div className="text-center text-sm text-white/60 pt-2">
            Remember your password?{' '}
            <Link to="/login" className="link text-emerald-400 hover:underline">Sign in</Link>
          </div>
        </form>
      )}
    </div>
  )
}
