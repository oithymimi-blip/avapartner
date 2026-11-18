import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { ShieldCheck, ShieldAlert, Copy, CheckCircle2, KeyRound, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuth } from '../store'
import { api } from '../api'
import { socket } from '../socket'
import { formatBdDateTime } from '../utils/bdTime'

function formatDateTime(value) {
  return formatBdDateTime(value, { showZone: true })
}

export default function Security() {
  const { token, user } = useAuth()
  const [status, setStatus] = useState({ totp_enabled: false, totp_verified_at: null })
  const [setupData, setSetupData] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [showDisable, setShowDisable] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState(true)

  const loadStatus = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/security/status')
      setStatus({
        totp_enabled: Boolean(res.data?.totp_enabled),
        totp_verified_at: res.data?.totp_verified_at || null
      })
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load security status')
      setMessageOk(false)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!user?.id) return
    const handleUpdate = (payload) => {
      if (payload?.user_id === user.id && payload?.type === 'security_updated') {
        loadStatus()
      }
    }
    socket.on('user_data_update', handleUpdate)
    return () => socket.off('user_data_update', handleUpdate)
  }, [user?.id, loadStatus])

  const startSetup = async () => {
    if (!token || busy) return
    setBusy(true)
    setMessage('')
    try {
      const res = await api(token).post('/api/security/totp/setup')
      setSetupData(res.data)
      setVerifyCode('')
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to initialize Google Authenticator setup')
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }

  const cancelSetup = async () => {
    setSetupData(null)
    setVerifyCode('')
    setMessage('')
    if (token) {
      api(token).post('/api/security/totp/cancel').catch(() => {})
    }
  }

  const copySecret = async () => {
    if (!setupData?.secret) return
    try {
      await navigator.clipboard.writeText(setupData.secret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } catch {
      /* ignore clipboard restrictions */
    }
  }

  const verifyAndEnable = async (e) => {
    e?.preventDefault?.()
    if (!token || busy) return
    const clean = verifyCode.replace(/\D/g, '')
    if (clean.length !== 6) {
      setMessage('Enter the 6-digit code shown in Google Authenticator.')
      setMessageOk(false)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await api(token).post('/api/security/totp/verify-setup', { code: clean })
      setSetupData(null)
      setVerifyCode('')
      setMessage('Google Authenticator enabled! Every withdrawal will now ask for your 6-digit code.')
      setMessageOk(true)
      await loadStatus()
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Verification failed. Check your code and try again.')
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }

  const disableTotp = async (e) => {
    e?.preventDefault?.()
    if (!token || busy) return
    const clean = disableCode.replace(/\D/g, '')
    if (clean.length !== 6) {
      setMessage('Enter your current 6-digit Google Authenticator code to disable 2FA.')
      setMessageOk(false)
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await api(token).post('/api/security/totp/disable', { code: clean })
      setDisableCode('')
      setShowDisable(false)
      setMessage('Google Authenticator has been disabled.')
      setMessageOk(true)
      await loadStatus()
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Invalid Google Authenticator code.')
      setMessageOk(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 font-semibold mb-1">Security</div>
        <h1 className="text-2xl font-bold text-white">Protect your account</h1>
        <p className="text-sm text-white/55 mt-1">
          Set up Google Authenticator (2FA) to protect fund withdrawals on your account.
        </p>
      </div>

      {message && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
          messageOk
            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/35 bg-rose-500/10 text-rose-300'
        }`}>
          {messageOk
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      {/* ── Google Authenticator (2FA) Card ── */}
      <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
              status.totp_enabled
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}>
              {status.totp_enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Google Authenticator (2FA)</h2>
              <p className="text-xs text-white/50">Time-based 6-digit verification code for withdrawals</p>
            </div>
          </div>

          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
            status.totp_enabled
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}>
            {loading ? 'Checking…' : status.totp_enabled ? '✓ Active & Enabled' : 'Not Enabled'}
          </span>
        </div>

        {/* State A: Enabled */}
        {!loading && status.totp_enabled && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Withdrawal Protection Active
              </div>
              <p className="text-white/65 leading-relaxed">
                Whenever you withdraw funds from your wallet, AvaPartner will ask for a 6-digit code from your Google Authenticator app before sending the request.
              </p>
              {status.totp_verified_at && (
                <div className="text-[11px] text-white/40 pt-1">
                  Activated: {formatDateTime(status.totp_verified_at)}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Link
                to="/wallet/withdraw"
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-black hover:bg-emerald-400 transition"
              >
                Go to Withdraw
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => {
                  setShowDisable(prev => !prev)
                  setDisableCode('')
                  setMessage('')
                }}
                className="text-xs text-rose-400/80 hover:text-rose-400 font-medium transition"
              >
                {showDisable ? 'Cancel' : 'Disable Google Authenticator'}
              </button>
            </div>

            {showDisable && (
              <form onSubmit={disableTotp} className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4 space-y-3">
                <div className="text-xs text-rose-200 font-medium">
                  Enter your current 6-digit Google Authenticator code to turn off 2FA:
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={disableCode}
                    onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                    className="w-40 rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-center font-mono text-base tracking-[0.25em] text-white placeholder-white/25 focus:border-rose-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || disableCode.length !== 6}
                    className="rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white transition"
                  >
                    {busy ? 'Disabling…' : 'Confirm Disable'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* State B: Setup Flow */}
        {!loading && !status.totp_enabled && setupData && (
          <form onSubmit={verifyAndEnable} className="space-y-5 border-t border-white/10 pt-5">
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] items-center">
              <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-3.5 shadow-lg mx-auto sm:mx-0">
                <QRCode value={setupData.otpauthUrl} size={160} level="M" />
              </div>

              <div className="space-y-3 min-w-0">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-brand mb-1">Step 1 · Scan QR Code</div>
                  <p className="text-xs text-white/65 leading-relaxed">
                    Open the <b className="text-white">Google Authenticator</b> app on your phone, tap <b className="text-white">+</b> → <b className="text-white">Scan a QR code</b>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                    Or enter setup key manually
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                    <code className="text-xs font-mono text-cyan-300 break-all select-all flex-1">{setupData.secret}</code>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white transition"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSecret ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="text-xs font-bold uppercase tracking-wider text-brand">Step 2 · Verify 6-Digit Code</div>
              <p className="text-xs text-white/55">
                Enter the 6-digit code generated by Google Authenticator for <span className="text-white/80 font-mono">{setupData.account}</span>:
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="w-44 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-white placeholder-white/25 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  type="submit"
                  disabled={busy || verifyCode.length !== 6}
                  className="rounded-xl bg-brand hover:bg-emerald-400 disabled:opacity-50 px-5 py-3 text-sm font-bold text-black shadow-md shadow-brand/20 transition"
                >
                  {busy ? 'Verifying…' : 'Verify & Enable'}
                </button>
                <button
                  type="button"
                  onClick={cancelSetup}
                  disabled={busy}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 text-xs font-semibold text-white/70 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* State C: Not Enabled, Ready to Set Up */}
        {!loading && !status.totp_enabled && !setupData && (
          <div className="space-y-4">
            <p className="text-sm text-white/65 leading-relaxed">
              Add an extra layer of security with <b className="text-white">Google Authenticator</b>. Once activated, every fund withdrawal will require a fresh 6-digit code from your authenticator app.
            </p>
            <button
              type="button"
              onClick={startSetup}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand hover:bg-emerald-400 disabled:opacity-50 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-brand/20 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              {busy ? 'Generating Key…' : 'Set up Google Authenticator'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
