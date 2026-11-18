import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock, ShieldCheck, Gift, Lock, Unlock, TrendingUp } from 'lucide-react'
import { useAuth } from '../store'
import { api } from '../api'
import { useAccount } from '../accountStore'
import { socket } from '../socket'
import { getAddressPlaceholder, validateCryptoAddress } from '../utils/addressValidator'
import { formatBdDateTime } from '../utils/bdTime'

const statusStyles = {
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  declined: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
}
const statusLabel = { approved: '✓ Approved', declined: '✕ Declined', pending: '⏳ Pending' }

function formatDateTime(value) {
  return formatBdDateTime(value, { showZone: true })
}

export default function WalletWithdraw() {
  const { token, user } = useAuth()
  const account = useAccount(state => state.summary)
  const setAccountSummary = useAccount(state => state.setSummary)

  const [methods, setMethods] = useState([])
  const [form, setForm] = useState({ method_id: '', amount: '', address: '', tag: '' })
  const [requests, setRequests] = useState([])
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bals, setBals] = useState({ available: 0, locked: 0 })
  const [aiOn, setAiOn] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [bonusStatus, setBonusStatus] = useState(null)

  // Google Authenticator 2FA withdrawal confirmation step
  const [authStep, setAuthStep] = useState(false)
  const [totpCode, setTotpCode] = useState('')

  const selectedMethod = useMemo(
    () => methods.find(m => String(m.id) === String(form.method_id)) || methods[0],
    [methods, form.method_id]
  )

  // Live automatic wallet address check on every input or network switch
  const addressCheck = useMemo(
    () => validateCryptoAddress(form.address, selectedMethod?.network || '', selectedMethod?.name || ''),
    [form.address, selectedMethod]
  )

  const hasAddressInput = form.address.trim().length > 0
  const parsedAmount = Number(form.amount)
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0.01 && parsedAmount <= bals.available + 1e-6

  const syncAccountBalance = useCallback((nextBal) => {
    if (!nextBal) return
    const nextAvailable = Number(nextBal.available ?? 0)
    const nextLocked = Number(nextBal.locked ?? 0)
    const nextTotal = Number(nextBal.total ?? (nextAvailable + nextLocked))
    setBals({ available: nextAvailable, locked: nextLocked })

    const prev = useAccount.getState().summary || {}
    const openPnl = Number(prev.openPnl || 0)
    setAccountSummary({
      ...prev,
      balance: { available: nextAvailable, locked: nextLocked, total: nextTotal },
      equity: Math.round((nextTotal + openPnl) * 100) / 100,
      freeMargin: Math.round((nextAvailable + openPnl) * 100) / 100
    })
  }, [setAccountSummary])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [wR, rR, oR, aR, sR, bR] = await Promise.all([
        api(token).get('/api/payments/methods?type=withdraw').catch(() => ({
          data: [{ id: 'usdt-withdraw', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', active: true }]
        })),
        api(token).get('/api/payments/requests').catch(() => ({ data: [] })),
        api(token).get('/api/trades/overview', { params: { limit: 1 } }).catch(() => null),
        api(token).get('/api/ai-trade/session').catch(() => ({ data: { session: null, balance: null } })),
        api(token).get('/api/security/status').catch(() => ({ data: { totp_enabled: false } })),
        api(token).get('/api/promotions/withdrawal-status').catch(() => ({ data: null })),
      ])

      const rawMethods = Array.isArray(wR.data) && wR.data.length > 0
        ? wR.data
        : [{ id: 'usdt-withdraw', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', active: true }]
      const active = rawMethods.filter(m => m.active !== false && m.active !== 0)
      setMethods(active)
      setForm(p => ({
        ...p,
        method_id: p.method_id && active.some(m => String(m.id) === String(p.method_id))
          ? p.method_id
          : (active[0]?.id != null ? String(active[0].id) : '')
      }))
      setRequests((rR.data || []).filter(r => r.type === 'withdraw'))
      setTotpEnabled(Boolean(sR?.data?.totp_enabled))
      setBonusStatus(bR?.data || null)

      if (oR?.data) {
        setAccountSummary(oR.data)
        if (oR.data.balance) {
          setBals({
            available: Number(oR.data.balance.available ?? 0),
            locked: Number(oR.data.balance.locked ?? 0)
          })
        }
      } else if (aR?.data?.balance) {
        syncAccountBalance(aR.data.balance)
      }
      setAiOn(aR?.data?.session?.ai_trade_status === 'ON')
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [token, setAccountSummary, syncAccountBalance])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (account?.balance) {
      setBals(b => ({
        available: Number(account.balance.available ?? b.available),
        locked: Number(account.balance.locked ?? b.locked),
      }))
    }
  }, [account])

  useEffect(() => {
    if (!user?.id || !token) return
    const handleUpdate = (payload) => {
      if (payload?.user_id !== user.id) return
      if (payload?.balance) {
        syncAccountBalance(payload.balance)
      }
      load()
    }
    socket.on('user_data_update', handleUpdate)
    return () => socket.off('user_data_update', handleUpdate)
  }, [user?.id, token, load, syncAccountBalance])

  const validateBeforeSubmit = () => {
    if (!form.method_id && methods.length === 0) {
      setMsg('Please select a network.')
      setMsgOk(false)
      return false
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0.01) {
      setMsg('Enter a valid withdrawal amount (minimum $0.01).')
      setMsgOk(false)
      return false
    }
    if (parsedAmount > bals.available + 1e-6) {
      setMsg('Insufficient available balance.')
      setMsgOk(false)
      return false
    }
    if (bonusStatus?.restricted) {
      if (!bonusStatus.milestoneUnlocked) {
        setMsg(
          `Bonus Condition Active (Milestone ${bonusStatus.currentMilestone}/${bonusStatus.requiredMilestones}): Earn +$${Number(bonusStatus.profitRemaining || 0).toFixed(2)} more profit via ${bonusStatus.allowedSourcesLabel} to reach $${Number(bonusStatus.targetBalance || 0).toFixed(2)} and unlock ${bonusStatus.cashoutPct}% withdrawal.`
        )
        setMsgOk(false)
        return false
      }
      if (parsedAmount > Number(bonusStatus.maxWithdrawable || 0) + 1e-6) {
        setMsg(
          `Bonus Milestone ${bonusStatus.currentMilestone}/${bonusStatus.requiredMilestones} permits withdrawing up to ${bonusStatus.cashoutPct}% ($${Number(bonusStatus.maxWithdrawable || 0).toFixed(2)} max right now).`
        )
        setMsgOk(false)
        return false
      }
    }
    if (!hasAddressInput) {
      setMsg('Wallet address is required.')
      setMsgOk(false)
      return false
    }
    if (!addressCheck.valid) {
      setMsg(addressCheck.message || 'Please enter a valid wallet address for the selected network.')
      setMsgOk(false)
      return false
    }
    return true
  }

  const executeWithdrawSubmit = async (code = '') => {
    if (!validateBeforeSubmit()) return

    setSubmitting(true)
    setMsg('')
    try {
      const safeAmt = Math.min(bals.available, Math.round(parsedAmount * 1e6) / 1e6)
      const res = await api(token).post('/api/payments/withdraw', {
        ...form,
        amount: safeAmt,
        address: addressCheck.normalized || form.address.trim(),
        method_id: Number(form.method_id) || form.method_id,
        ...(code ? { totpCode: code } : {})
      })

      // Instantly deduct from available & navbar main balance everywhere
      if (res.data?.balance) {
        syncAccountBalance(res.data.balance)
      } else {
        const nextAvail = Math.max(0, Math.round((bals.available - safeAmt) * 100) / 100)
        syncAccountBalance({
          available: nextAvail,
          locked: bals.locked,
          total: nextAvail + bals.locked
        })
      }

      if (res.data?.request) {
        setRequests(prev => [res.data.request, ...prev.filter(r => r.id !== res.data.request.id)])
      }

      // Sync full overview cleanly in background so equity / margin stay authoritative everywhere
      api(token).get('/api/trades/overview', { params: { limit: 1 } })
        .then(oRes => {
          if (oRes?.data) setAccountSummary(oRes.data)
        })
        .catch(() => {})

      setMsg(`Withdrawal of $${safeAmt.toFixed(2)} USDT submitted! Deducted from your main balance immediately — estimated processing time: 3 to 24 hours.`)
      setMsgOk(true)
      setAuthStep(false)
      setTotpCode('')
      setForm(p => ({ ...p, amount: '', address: '', tag: '' }))
      load()
    } catch (err) {
      const errData = err?.response?.data
      if (errData?.codeRequired === 'GOOGLE_AUTHENTICATOR') {
        setTotpEnabled(true)
        setAuthStep(true)
      }
      setMsg(errData?.error || 'Failed to submit withdrawal.')
      setMsgOk(false)
    } finally {
      setSubmitting(false)
    }
  }

  const submitWithdrawal = async () => {
    if (!validateBeforeSubmit()) return
    setMsg('')
    if (totpEnabled) {
      setTotpCode('')
      setAuthStep(true)
      return
    }
    await executeWithdrawSubmit('')
  }

  const confirmAuthenticatorWithdraw = async (e) => {
    e?.preventDefault?.()
    const clean = totpCode.replace(/\D/g, '')
    if (clean.length !== 6) {
      setMsg('Enter the 6-digit code from your Google Authenticator app.')
      setMsgOk(false)
      return
    }
    await executeWithdrawSubmit(clean)
  }

  const cancelAuthStep = () => {
    setAuthStep(false)
    setTotpCode('')
    setMsg('')
  }

  const { available, locked } = bals
  const remainingAfterWithdraw = validAmount ? Math.max(0, available - parsedAmount) : available
  const canSubmit = !submitting && !loading && validAmount && addressCheck.valid

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-8">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-semibold mb-1">Wallet</div>
          <h1 className="text-2xl font-bold text-white">Withdraw USDT</h1>
          <p className="text-sm text-white/50 mt-1">
            Funds deduct from your main balance immediately when submitted. Processing takes <span className="text-white/80 font-medium">3 to 24 hours</span>.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 shrink-0">
          <Clock className="w-3.5 h-3.5" />
          Withdrawal Time: 3–24 Hours
        </div>
      </div>

      {/* ── Balance summary bar ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1">Available to Withdraw</div>
          <div className="text-xl font-bold font-mono text-emerald-400">${available.toFixed(2)}</div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${locked > 0 ? 'border-amber-500/25 bg-amber-500/8' : 'border-white/8 bg-white/[0.03]'}`}>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Locked Balance</div>
          <div className={`text-xl font-bold font-mono ${locked > 0 ? 'text-amber-400' : 'text-white/30'}`}>${locked.toFixed(2)}</div>
        </div>
      </div>

      {/* ── Bonus Withdrawal Condition Progress Card ── */}
      {bonusStatus?.hasActiveLock ? (
        <div className={`rounded-2xl border p-4 space-y-3 ${
          bonusStatus.milestoneUnlocked
            ? 'border-emerald-500/35 bg-emerald-500/10'
            : 'border-amber-500/35 bg-amber-500/10'
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                bonusStatus.milestoneUnlocked
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              }`}>
                {bonusStatus.milestoneUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    {bonusStatus.lock?.promo_title || 'Deposit Bonus'} Condition
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-amber-300 border border-amber-400/30">
                    Milestone {bonusStatus.currentMilestone}/{bonusStatus.requiredMilestones}
                  </span>
                </div>
                <p className="text-xs text-white/75 mt-0.5">
                  {bonusStatus.milestoneUnlocked ? (
                    <>
                      Target achieved! You can withdraw up to{' '}
                      <strong className="text-emerald-300">${Number(bonusStatus.maxWithdrawable || 0).toFixed(2)} ({bonusStatus.cashoutPct}%)</strong> now.
                    </>
                  ) : (
                    <>
                      Earn <strong className="text-white">+${Number(bonusStatus.profitRemaining || 0).toFixed(2)}</strong> more profit via{' '}
                      <strong className="text-amber-300">{bonusStatus.allowedSourcesLabel}</strong> to reach{' '}
                      <strong className="text-white">${Number(bonusStatus.targetBalance || 0).toFixed(2)}</strong> ({bonusStatus.multiplier}x) and unlock{' '}
                      <strong className="text-amber-300">{bonusStatus.cashoutPct}%</strong> cashout.
                    </>
                  )}
                </p>
              </div>
            </div>

            {bonusStatus.milestoneUnlocked ? (
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, amount: String(bonusStatus.maxWithdrawable) }))}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-brand hover:bg-emerald-400 text-black font-bold text-xs transition"
              >
                Use Max {bonusStatus.cashoutPct}% (${Number(bonusStatus.maxWithdrawable || 0).toFixed(2)})
              </button>
            ) : (
              <Link
                to="/dashboard"
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition"
              >
                <TrendingUp className="w-3.5 h-3.5 text-brand" />
                <span>Trade Now</span>
              </Link>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-white/70">
              <span>Trading Profit Progress: <strong className="font-mono text-white">${Number(bonusStatus.profitEarned || 0).toFixed(2)}</strong> / <strong className="font-mono text-brand">${Number(bonusStatus.profitNeeded || 0).toFixed(2)}</strong></span>
              <span className="font-mono font-bold text-amber-300">{bonusStatus.profitProgressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-brand transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, Number(bonusStatus.profitProgressPct || 0)))}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-white/60 font-mono">
              <span>AI Trade: ${Number(bonusStatus.breakdown?.ai_trade || 0).toFixed(2)}</span>
              <span>Forex: ${Number(bonusStatus.breakdown?.forex || 0).toFixed(2)}</span>
              <span>Binary: ${Number(bonusStatus.breakdown?.binary || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : bonusStatus?.completedLocksCount > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
            <span><strong>Bonus Terms Completed:</strong> All milestone conditions satisfied — your full balance is eligible for normal withdrawal.</span>
          </div>
          <Link to="/promotions" className="shrink-0 font-semibold text-brand hover:underline">Offers</Link>
        </div>
      ) : null}

      {/* ── Processing time notice banner ── */}
      <div className="flex items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-xs text-cyan-200/90">
        <Clock className="w-4 h-4 mt-0.5 shrink-0 text-cyan-400" />
        <div className="leading-relaxed">
          <span className="font-semibold text-white">Estimated Withdrawal Time: 3 – 24 Hours.</span>{' '}
          Your requested amount is instantly deducted and reserved from your main available balance upon clicking <span className="font-semibold text-white">Submit Withdrawal</span>.
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

      {/* ── Google Authenticator status banner ── */}
      {totpEnabled ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              <b className="text-white">Google Authenticator (2FA) Active:</b> You will be asked for your 6-digit code when withdrawing funds.
            </span>
          </div>
          <Link to="/security" className="shrink-0 text-[11px] font-semibold text-white/60 hover:text-white transition">
            Manage
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs">
          <div className="flex items-center gap-2.5 text-white/65">
            <ShieldCheck className="w-4 h-4 shrink-0 text-white/40" />
            <span>Protect withdrawals with 2FA using Google Authenticator.</span>
          </div>
          <Link to="/security" className="shrink-0 text-[11px] font-semibold text-brand hover:underline">
            Set up →
          </Link>
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

      {/* ── Google Authenticator 2FA Step ── */}
      {authStep ? (
        <form onSubmit={confirmAuthenticatorWithdraw} className="rounded-3xl border border-emerald-500/25 bg-black/25 p-5 sm:p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Google Authenticator Verification</h2>
            <p className="text-sm text-white/55">
              Enter the 6-digit code from your <b className="text-white">Google Authenticator</b> app to authorize this withdrawal.
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/40">Amount</span>
              <span className="font-mono text-rose-400 font-semibold">-${Number(form.amount).toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Balance After Withdraw</span>
              <span className="font-mono text-white font-semibold">${remainingAfterWithdraw.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/40 shrink-0">To Address</span>
              <span className="font-mono text-white/75 text-xs truncate max-w-[230px]" title={addressCheck.normalized || form.address}>
                {addressCheck.normalized || form.address}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Network</span>
              <span className="text-white/75">{selectedMethod?.name} · {selectedMethod?.network}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Processing Time</span>
              <span className="text-cyan-300 font-medium">3 – 24 Hours</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1.5">Google Authenticator Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              className="w-full rounded-xl border border-white/15 bg-black/40 text-white font-mono text-center tracking-[0.35em] text-xl px-4 py-3.5 placeholder-white/20 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || totpCode.length !== 6}
            className="w-full rounded-2xl py-4 font-bold text-base tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-[0_8px_24px_rgba(244,63,94,0.3)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.45)]"
          >
            {submitting ? 'Verifying & Withdrawing…' : 'Confirm & Withdraw Funds'}
          </button>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={cancelAuthStep}
              disabled={submitting}
              className="text-xs text-white/40 hover:text-white/75 transition-colors"
            >
              ← Go back and edit withdrawal details
            </button>
          </div>
        </form>
      ) : (
        /* ── Withdrawal form ── */
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">Withdrawal Details</div>
            <span className="text-[11px] text-cyan-300/90 flex items-center gap-1 font-medium">
              <Clock className="w-3 h-3" /> 3–24h Processing
            </span>
          </div>

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
              min="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className={`w-full rounded-xl border bg-black/40 text-white font-mono px-4 py-3 text-sm placeholder-white/25 focus:outline-none focus:ring-1 ${
                form.amount && !validAmount
                  ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-white/10 focus:border-brand focus:ring-brand'
              }`}
            />
            {form.amount && parsedAmount > available + 1e-6 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Amount exceeds your available balance (${available.toFixed(2)}).</span>
              </div>
            )}
          </div>

          {/* Wallet address with automatic live verification */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-xs text-white/50">Wallet Address</label>
              {hasAddressInput && (
                addressCheck.valid ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <ShieldCheck className="w-3 h-3" />
                      {addressCheck.checksumVerified ? 'EIP-55 Checksum Verified' : 'Valid Address'}
                    </span>
                    {addressCheck.canChecksumFormat && addressCheck.normalized && form.address.trim() !== addressCheck.normalized && (
                      <button
                        type="button"
                        onClick={() => setForm(p => ({ ...p, address: addressCheck.normalized }))}
                        className="text-[10px] text-cyan-400 hover:underline font-medium"
                      >
                        Format Checksum
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-rose-400">
                    <AlertCircle className="w-3 h-3" />
                    Invalid Address
                  </span>
                )
              )}
            </div>

            <input
              type="text"
              placeholder={getAddressPlaceholder(selectedMethod?.network, selectedMethod?.name)}
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              onBlur={() => {
                const trimmed = form.address.trim()
                if (trimmed !== form.address) setForm(p => ({ ...p, address: trimmed }))
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className={`w-full rounded-xl border bg-black/40 text-white font-mono px-4 py-3 text-sm placeholder-white/25 focus:outline-none focus:ring-1 transition-colors ${
                hasAddressInput
                  ? addressCheck.valid
                    ? 'border-emerald-500/60 focus:border-emerald-400 focus:ring-emerald-400'
                    : 'border-rose-500/70 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-white/10 focus:border-brand focus:ring-brand'
              }`}
            />

            {hasAddressInput ? (
              addressCheck.valid ? (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{addressCheck.message}</span>
                </div>
              ) : (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{addressCheck.message}</span>
                </div>
              )
            ) : (
              <div className="mt-1.5 text-[11px] text-white/35">
                Automatically verifies wallet format and checksum for {selectedMethod?.network || 'Binance Smart Chain (BEP-20)'}.
              </div>
            )}
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

          {/* Live balance & timing summary */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-white/50">
              <span>Main Balance After Withdraw</span>
              <span className="font-mono font-semibold text-white">
                ${remainingAfterWithdraw.toFixed(2)}
                {validAmount && (
                  <span className="ml-1.5 text-rose-400">(-${parsedAmount.toFixed(2)})</span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-white/50">
              <span>Estimated Processing Time</span>
              <span className="font-semibold text-cyan-300">3 – 24 Hours</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={submitWithdrawal}
            disabled={!canSubmit}
            className="w-full rounded-2xl py-4 font-bold text-base tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-[0_8px_24px_rgba(244,63,94,0.3)] hover:shadow-[0_12px_32px_rgba(244,63,94,0.45)]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Processing Withdrawal…
              </span>
            ) : totpEnabled ? 'Continue with Google Authenticator' : 'Submit Withdrawal'}
          </button>
        </div>
      )}

      {/* ── Withdrawal history ── */}
      <div className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">Withdrawal Requests</div>
          <span className="text-[11px] text-white/40">ETA: 3–24 hours</span>
        </div>

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
              const createdLabel = formatDateTime(req.created_at)
              return (
                <div key={req.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-white text-sm">
                      {req.method_name || 'USDT'} <span className="text-white/50">·</span>{' '}
                      <span className="font-mono text-rose-400">-${Number(req.amount).toFixed(2)}</span>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${statusStyles[s] || statusStyles.pending}`}>
                      {statusLabel[s] || s}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/45 font-mono break-all leading-relaxed">
                    To: {req.address}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/35 pt-0.5">
                    <span>{createdLabel}</span>
                    {s === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-cyan-300/80 font-medium">
                        <Clock className="w-3 h-3" /> Processing time: 3 – 24 hours
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
