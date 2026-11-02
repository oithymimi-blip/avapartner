import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../store'
import { api } from '../api'
import { useAccount } from '../accountStore'

const statusStyles = {
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  declined:  'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  pending:   'bg-amber-500/15 text-amber-400 border border-amber-500/30',
}
const statusLabel = { approved: '✓ Approved', declined: '✕ Declined', pending: '⏳ Pending' }

export default function WalletWithdraw() {
  const { token, user } = useAuth()
  const account = useAccount(state => state.summary)
  const [methods, setMethods]       = useState([])
  const [form, setForm]             = useState({ method_id: '', amount: '', address: '', tag: '' })
  const [requests, setRequests]     = useState([])
  const [msg, setMsg]               = useState('')
  const [msgOk, setMsgOk]           = useState(false)
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bals, setBals]             = useState({ available: 0, locked: 0 })
  const [aiOn, setAiOn]             = useState(false)

  // OTP verification state
  const [otpStep, setOtpStep]             = useState(false)
  const [otp, setOtp]                     = useState('')
  const [verifying, setVerifying]         = useState(false)
  const [resendTimer, setResendTimer]     = useState(0)
  const [resending, setResending]         = useState(false)

  const selectedMethod = useMemo(
    () => methods.find(m => String(m.id) === String(form.method_id)) || methods[0],
    [methods, form.method_id]
  )

  const load = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [wR, rR, aR] = await Promise.all([
        api(token).get('/api/payments/methods?type=withdraw').catch(() => ({
          data: [{ id: 'usdt-withdraw', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', active: true }]
        })),
        api(token).get('/api/payments/requests').catch(() => ({ data: [] })),
        api(token).get('/api/ai-trade/session').catch(() => ({ data: { session: null, balance: null } })),
      ])
      const active = (wR.data || []).filter(m => m.active !== false)
      setMethods(active)
      setForm(p => ({ ...p, method_id: active[0]?.id != null ? String(active[0].id) : '' }))
      setRequests((rR.data || []).filter(r => r.type === 'withdraw'))
      const b = aR.data?.balance
      if (b) setBals({ available: b.available ?? 0, locked: b.locked ?? 0 })
      setAiOn(aR.data?.session?.ai_trade_status === 'ON')
    } catch {/* silent */}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [token])

  useEffect(() => {
    if (account?.balance) setBals(b => ({
      available: account.balance.available ?? b.available,
      locked:    account.balance.locked    ?? b.locked,
    }))
  }, [account])

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  // Submit withdrawal directly without requiring email OTP
  const submitSendOtp = async () => {
    if (!form.method_id) { setMsg('Please select a network.'); setMsgOk(false); return }
    if (!form.amount || Number(form.amount) <= 0) { setMsg('Enter a valid amount.'); setMsgOk(false); return }
    if (!form.address) { setMsg('Wallet address is required.'); setMsgOk(false); return }
    setSubmitting(true); setMsg('')
    try {
      await api(token).post('/api/payments/withdraw', {
        ...form,
        method_id: Number(form.method_id) || form.method_id,
      })
      setMsg('Withdrawal submitted successfully. It will be processed shortly.')
      setMsgOk(true)
      setOtpStep(false)
      setForm(p => ({ ...p, amount: '', address: '', tag: '' }))
      load()
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Failed to submit withdrawal.')
      setMsgOk(false)
    } finally { setSubmitting(false) }
  }

  // Resend OTP
  const resendOtp = async () => {
    if (resendTimer > 0 || resending) return
    setResending(true); setMsg('')
    try {
      await api(token).post('/api/payments/withdraw/resend-otp')
      setMsg('A new verification code has been sent to your email.')
      setMsgOk(true)
      setResendTimer(30)
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Failed to resend code.')
      setMsgOk(false)
    } finally { setResending(false) }
  }

  // Step 2: Verify OTP and process withdrawal
  const submitVerifyOtp = async () => {
    if (otp.length !== 6) { setMsg('Please enter the 6-digit code.'); setMsgOk(false); return }
    setVerifying(true); setMsg('')
    try {
      await api(token).post('/api/payments/withdraw/verify', { otp })
      setMsg('Withdrawal submitted successfully. It will be processed shortly.')
      setMsgOk(true)
      setOtpStep(false)
      setOtp('')
      setForm(p => ({ ...p, amount: '', address: '', tag: '' }))
      load()
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Verification failed. Please try again.')
      setMsgOk(false)
    } finally { setVerifying(false) }
  }

  // Cancel OTP step and go back to form
  const cancelOtp = () => {
    setOtpStep(false)
    setOtp('')
    setMsg('')
  }

  const { available, locked } = bals

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* ── Page header ── */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold mb-1">Wallet</div>
        <h1 className="text-2xl font-bold text-white">Withdraw USDT</h1>
        <p className="text-sm text-white/50 mt-1">Request withdrawals; funds deduct from your available balance immediately.</p>
      </div>

      {/* ── Balance summary bar ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">Available to Withdraw</div>
          <div className="text-xl font-bold font-mono text-emerald-400">${available.toFixed(2)}</div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${locked > 0 ? 'border-amber-500/25 bg-amber-500/8' : 'border-white/8 bg-white/[0.03]'}`}>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Locked (AI Trade)</div>
          <div className={`text-xl font-bold font-mono ${locked > 0 ? 'text-amber-400' : 'text-white/30'}`}>${locked.toFixed(2)}</div>
        </div>
      </div>

      {/* ── AI Trade info banner (soft, non-blocking) ── */}
      {aiOn && locked > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
          <svg className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1C9.243 1 7 3.243 7 6v2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6c0-2.757-2.243-5-5-5zm0 2c1.654 0 3 1.346 3 3v2H9V6c0-1.654 1.346-3 3-3zm0 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-300">AI Trade Active — ${locked.toFixed(2)} is locked</div>
            <div className="text-xs text-amber-400/70 mt-0.5 leading-relaxed">
              You can withdraw your available balance (${available.toFixed(2)}) freely.
              The locked amount will be released when you stop AI Trade.
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback message ── */}
      {msg && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
          msgOk
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        }`}>
          <span className="shrink-0 mt-0.5">{msgOk ? '✓' : '✕'}</span>
          <span>{msg}</span>
        </div>
      )}

      {/* ── OTP Verification Step ── */}
      {otpStep ? (
        <div className="rounded-3xl border border-cyan-500/20 bg-black/25 p-5 sm:p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">Email Verification Required</h2>
            <p className="text-sm text-white/50">
              We've sent a 6-digit verification code to <b className="text-white/80">{user?.email}</b>.
              Enter it below to confirm your withdrawal.
            </p>
          </div>

          {/* Withdrawal summary */}
          <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Amount</span>
              <span className="font-mono text-brand font-semibold">${Number(form.amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">To Address</span>
              <span className="font-mono text-white/70 text-xs truncate max-w-[200px]" title={form.address}>{form.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Network</span>
              <span className="text-white/70">{selectedMethod?.name} · {selectedMethod?.network}</span>
            </div>
          </div>

          {/* OTP input */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-white/10 bg-black/40 text-white font-mono text-center tracking-[0.3em] text-lg px-4 py-3.5 placeholder-white/20 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Verify button */}
          <button
            onClick={submitVerifyOtp}
            disabled={verifying || otp.length !== 6}
            className="w-full rounded-2xl py-4 font-bold text-base tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-[0_8px_24px_rgba(6,182,212,0.3)] hover:shadow-[0_12px_32px_rgba(6,182,212,0.45)]"
          >
            {verifying ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Verifying…
              </span>
            ) : 'Confirm Withdrawal'}
          </button>

          {/* Resend + Back */}
          <div className="flex flex-col items-center gap-3 pt-2 border-t border-white/5">
            <div className="flex items-center gap-2 text-sm text-white/50">
              <span>Didn't receive the code?</span>
              <button
                type="button"
                onClick={resendOtp}
                disabled={resendTimer > 0 || resending}
                className={`text-cyan-400 font-medium text-sm transition-opacity ${
                  resendTimer > 0 || resending ? 'opacity-50 cursor-not-allowed' : 'hover:underline'
                }`}
              >
                {resending ? 'Sending…' : resendTimer > 0 ? `Resend (${resendTimer}s)` : 'Resend Code'}
              </button>
            </div>
            <button
              type="button"
              onClick={cancelOtp}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              ← Go back and edit details
            </button>
          </div>
        </div>
      ) : (
        /* ── Withdrawal form ── */
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6 space-y-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">Withdrawal Details</div>

          {/* Network selector */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Network</label>
            <select
              className="w-full rounded-xl border border-white/10 bg-black/40 text-white px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand appearance-none"
              value={form.method_id}
              onChange={e => setForm(p => ({ ...p, method_id: e.target.value }))}
            >
              {methods.map(m => <option key={m.id} value={String(m.id)}>{m.name} · {m.network}</option>)}
            </select>
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-white/50">Amount (USDT)</label>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, amount: String(Math.floor(available * 100) / 100) }))}
                className="text-[11px] text-brand hover:text-brand/80 font-semibold transition-colors"
              >
                Max: ${available.toFixed(2)}
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 text-white font-mono px-4 py-3 text-sm placeholder-white/25 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Wallet address */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Wallet Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 text-white font-mono px-4 py-3 text-sm placeholder-white/25 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Memo */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Tag / Memo <span className="text-white/25">(optional)</span></label>
            <input
              type="text"
              placeholder="Only required for some networks"
              value={form.tag}
              onChange={e => setForm(p => ({ ...p, tag: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/40 text-white px-4 py-3 text-sm placeholder-white/25 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {selectedMethod?.note && (
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-2.5 text-xs text-white/50">{selectedMethod.note}</div>
          )}

          {/* Submit */}
          <button
            onClick={submitSendOtp}
            disabled={submitting || loading}
            className="w-full rounded-2xl py-4 font-bold text-base tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-[0_8px_24px_rgba(244,63,94,0.3)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.45)]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Sending Code…
              </span>
            ) : 'Submit Withdrawal'}
          </button>
        </div>
      )}

      {/* ── Withdrawal history ── */}
      <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6 space-y-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">Withdrawal Requests</div>

        {loading && (
          <div className="text-sm text-white/40 text-center py-4 animate-pulse">Loading…</div>
        )}

        {!loading && requests.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <div className="text-3xl">📋</div>
            <div className="text-sm text-white/40">No withdrawal requests yet.</div>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="space-y-2">
            {requests.map(req => {
              const s = req.status || 'pending'
              return (
                <div key={req.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="font-semibold text-white text-sm">
                      {req.method_name || 'USDT'} <span className="text-white/50">·</span> <span className="font-mono text-brand">${Number(req.amount).toFixed(2)}</span>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${statusStyles[s] || statusStyles.pending}`}>
                      {statusLabel[s] || s}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40 font-mono break-all leading-relaxed">
                    {req.address}
                  </div>
                  {req.created_at && (
                    <div className="text-[10px] text-white/30 mt-1.5">
                      {new Date(req.created_at).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
