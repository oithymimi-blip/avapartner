import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Gift,
  Sparkles,
  Percent,
  Coins,
  Award,
  Ticket,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Calculator,
  Loader2,
  Flame,
  Wallet,
  XCircle
} from 'lucide-react'
import { useAuth } from '../store'
import { api } from '../api'
import { socket } from '../socket'
import { formatBdDateTime } from '../utils/bdTime'

const CATEGORY_META = {
  deposit_bonus: {
    label: 'Deposit Bonus',
    icon: Coins,
    iconBox: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
  },
  welcome_bonus: {
    label: 'New User Bonus',
    icon: Gift,
    iconBox: 'bg-amber-500/15 border-amber-400/30 text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-400/30'
  },
  promo_offer: {
    label: 'Promo Offer',
    icon: Flame,
    iconBox: 'bg-sky-500/15 border-sky-400/30 text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-400/30'
  },
  cashback: {
    label: 'Cashback',
    icon: Award,
    iconBox: 'bg-violet-500/15 border-violet-400/30 text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-400/30'
  }
}

const CLAIM_STATUS_STYLE = {
  activated: {
    label: 'Activated — Deposit to Unlock',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-400/35'
  },
  pending: {
    label: 'Pending Review',
    cls: 'bg-sky-500/15 text-sky-300 border-sky-400/35'
  },
  credited: {
    label: 'Credited',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
  },
  rejected: {
    label: 'Declined',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-400/35'
  }
}

function calcEstimatedBonus(promo, amount) {
  if (!promo) return 0
  const dep = Math.max(0, Number(amount) || 0)
  const val = Math.max(0, Number(promo.bonus_value) || 0)
  const cap = Math.max(0, Number(promo.max_bonus_amount) || 0)
  if (promo.bonus_type === 'fixed') return Math.round(val * 100) / 100
  const raw = dep * (val / 100)
  const capped = cap > 0 ? Math.min(raw, cap) : raw
  return Math.round(capped * 100) / 100
}

export default function Promotions() {
  const { token, user } = useAuth()
  const nav = useNavigate()

  const [promotions, setPromotions] = useState([])
  const [claims, setClaims] = useState([])
  const [depositStats, setDepositStats] = useState({ approved_count: 0, total_deposited: 0, latest_deposit_amount: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [claimingId, setClaimingId] = useState(null)
  const [copiedCode, setCopiedCode] = useState('')
  const [feedback, setFeedback] = useState(null)

  const [calcAmount, setCalcAmount] = useState('100')
  const [calcPromoId, setCalcPromoId] = useState('')

  const loadPromotions = useCallback(async () => {
    try {
      const res = await api(token).get('/api/promotions')
      const list = Array.isArray(res.data?.promotions) ? res.data.promotions : []
      setPromotions(list)
      setClaims(Array.isArray(res.data?.claims) ? res.data.claims : [])
      if (res.data?.deposit_stats) setDepositStats(res.data.deposit_stats)
      setCalcPromoId(prev => {
        if (prev && list.some(p => String(p.id) === String(prev))) return prev
        return list[0] ? String(list[0].id) : ''
      })
    } catch (err) {
      console.error('Failed to load promotions', err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadPromotions()
  }, [loadPromotions])

  useEffect(() => {
    if (!user?.id) return
    const handleUpdate = (payload) => {
      if (payload?.user_id === user.id) {
        loadPromotions()
      }
    }
    socket.on('user_data_update', handleUpdate)
    return () => socket.off('user_data_update', handleUpdate)
  }, [user?.id, loadPromotions])

  const selectedCalcPromo = useMemo(
    () => promotions.find(p => String(p.id) === String(calcPromoId)) || promotions[0] || null,
    [promotions, calcPromoId]
  )

  const numericCalcDep = Math.max(0, Number(calcAmount) || 0)
  const estimatedBonus = useMemo(
    () => calcEstimatedBonus(selectedCalcPromo, numericCalcDep),
    [selectedCalcPromo, numericCalcDep]
  )
  const meetsCalcMin = selectedCalcPromo ? numericCalcDep >= Number(selectedCalcPromo.min_deposit || 0) : true

  const totalCreditedBonus = useMemo(
    () => claims.filter(c => c.status === 'credited').reduce((s, c) => s + Number(c.bonus_amount || 0), 0),
    [claims]
  )

  const filteredPromotions = useMemo(() => {
    if (activeTab === 'all') return promotions
    if (activeTab === 'claims') return []
    if (activeTab === 'promo_offer') {
      return promotions.filter(p => p.category === 'promo_offer' || p.category === 'cashback')
    }
    return promotions.filter(p => p.category === activeTab)
  }, [promotions, activeTab])

  const handleCopyCode = async (code) => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch (_) {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (e) {}
      document.body.removeChild(ta)
    }
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(''), 2000)
  }

  const handleClaim = async (promo) => {
    if (!token) {
      nav('/login')
      return
    }
    setClaimingId(promo.id)
    setFeedback(null)
    try {
      const res = await api(token).post(`/api/promotions/${promo.id}/claim`)
      const data = res.data || {}
      setFeedback({
        type: data.needsDeposit ? 'info' : 'success',
        text: data.message || 'Offer updated!'
      })
      await loadPromotions()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error || 'Could not claim this offer.'
      })
    } finally {
      setClaimingId(null)
    }
  }

  const handleRedeemCode = async (e) => {
    e.preventDefault()
    if (!token) {
      nav('/login')
      return
    }
    const clean = promoCodeInput.trim().toUpperCase()
    if (!clean) {
      setFeedback({ type: 'error', text: 'Please enter a promo code to redeem.' })
      return
    }
    setRedeeming(true)
    setFeedback(null)
    try {
      const res = await api(token).post('/api/promotions/redeem', { code: clean })
      const data = res.data || {}
      setFeedback({
        type: data.needsDeposit ? 'info' : 'success',
        text: data.message || `Promo code ${clean} applied!`
      })
      setPromoCodeInput('')
      await loadPromotions()
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error || 'Invalid or unavailable promo code.'
      })
    } finally {
      setRedeeming(false)
    }
  }

  const tabs = [
    { key: 'all', label: 'All Offers', icon: Sparkles, count: promotions.length },
    { key: 'deposit_bonus', label: 'Deposit Bonus', icon: Percent, count: promotions.filter(p => p.category === 'deposit_bonus').length },
    { key: 'welcome_bonus', label: 'New User Bonus', icon: Gift, count: promotions.filter(p => p.category === 'welcome_bonus').length },
    { key: 'promo_offer', label: 'Promos & Cashback', icon: Award, count: promotions.filter(p => p.category === 'promo_offer' || p.category === 'cashback').length },
    { key: 'claims', label: 'My Claims', icon: CheckCircle2, count: claims.length }
  ]

  return (
    <div className="promo-page max-w-6xl mx-auto py-4 sm:py-6 space-y-6 pb-12">
      {/* Hero Banner */}
      <section className="card relative overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-[#0e1522] via-[#0b1018] to-[#0a1718] p-5 sm:p-8 shadow-soft">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
              <Gift className="w-3.5 h-3.5" />
              <span>Deposit Bonus &amp; Promotions</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Boost Your Trading Capital with <span className="text-brand">Exclusive Bonuses</span>
            </h1>
            <p className="text-xs sm:text-sm text-white/65 leading-relaxed">
              Unlock deposit match bonuses, new trader welcome rewards, and promotional cashback offers. Activate an offer below or apply a promo code before funding your account.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:min-w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Live Offers</div>
              <div className="text-xl sm:text-2xl font-black text-amber-300 mt-1">{promotions.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Deposits</div>
              <div className="text-lg sm:text-xl font-black text-white mt-1 font-mono">${depositStats.total_deposited.toFixed(0)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/50">Earned</div>
              <div className="text-lg sm:text-xl font-black text-brand mt-1 font-mono">${totalCreditedBonus.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </section>

      {feedback && (
        <div
          className={`rounded-2xl border p-4 flex items-start justify-between gap-3 text-sm ${
            feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : feedback.type === 'info'
              ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
              : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
          {feedback.type === 'info' && (
            <Link
              to="/wallet/deposit"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Deposit Now</span>
            </Link>
          )}
        </div>
      )}

      {/* Promo Code + Live Bonus Estimator */}
      <section className="grid lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleRedeemCode}
          className="card lg:col-span-5 rounded-2xl border border-white/10 bg-[#0d131d] p-5 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <span className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center">
                <Ticket className="w-4 h-4" />
              </span>
              <span>Redeem Promo Code</span>
            </div>
            <p className="text-xs text-white/60">
              Have a promotional or new-user bonus code? Enter it below to activate or claim instantly.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={promoCodeInput}
              onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. WELCOME100"
              className="input flex-1 uppercase font-mono tracking-wider"
            />
            <button
              type="submit"
              disabled={redeeming}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-bold text-sm transition disabled:opacity-60"
            >
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Apply Code</span>
            </button>
          </div>
        </form>

        <div className="card lg:col-span-7 rounded-2xl border border-white/10 bg-[#0d131d] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 flex items-center justify-center">
                <Calculator className="w-4 h-4" />
              </span>
              <span>Deposit Bonus Calculator</span>
            </div>
            <div className="flex items-center gap-1.5">
              {['50', '100', '250', '500', '1000'].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCalcAmount(amt)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition ${
                    calcAmount === amt
                      ? 'bg-brand text-black border-brand'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-white/55 block mb-1">Select Promotion</label>
              <select
                value={calcPromoId}
                onChange={(e) => setCalcPromoId(e.target.value)}
                className="input"
              >
                {promotions.length === 0 && <option value="">No active offers</option>}
                {promotions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.bonus_type === 'fixed' ? `$${p.bonus_value}` : `${p.bonus_value}%`})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-white/55 block mb-1">Your Deposit Amount (USDT)</label>
              <input
                type="number"
                min="0"
                step="10"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                className="input font-mono"
              />
            </div>
          </div>

          {selectedCalcPromo && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-white/50 block text-[10px] uppercase">Estimated Bonus</span>
                  <span className={`font-mono font-extrabold text-base ${meetsCalcMin ? 'text-amber-300' : 'text-white/40'}`}>
                    {meetsCalcMin ? `+$${estimatedBonus.toFixed(2)}` : `Min $${Number(selectedCalcPromo.min_deposit).toFixed(0)}`}
                  </span>
                </div>
                <div className="w-px h-7 bg-white/10 hidden sm:block" />
                <div>
                  <span className="text-white/50 block text-[10px] uppercase">Total Trading Power</span>
                  <span className="font-mono font-extrabold text-base text-brand">
                    ${(numericCalcDep + (meetsCalcMin ? estimatedBonus : 0)).toFixed(2)}
                  </span>
                </div>
              </div>
              <Link
                to={`/wallet/deposit${selectedCalcPromo.promo_code ? `?promo=${encodeURIComponent(selectedCalcPromo.promo_code)}` : ''}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-emerald-400 text-black font-bold text-xs transition"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Deposit &amp; Claim</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
                active
                  ? 'bg-brand text-black border-brand shadow-[0_8px_20px_rgba(0,223,154,0.28)]'
                  : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  active ? 'bg-black/15 text-black' : 'bg-white/10 text-white/70'
                }`}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Offer Cards */}
      {loading ? (
        <div className="card rounded-2xl border border-white/10 bg-[#0d131d] p-10 text-center text-white/60 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
          <span className="text-sm">Loading active bonuses &amp; promotions...</span>
        </div>
      ) : activeTab !== 'claims' ? (
        filteredPromotions.length === 0 ? (
          <div className="card rounded-2xl border border-white/10 bg-[#0d131d] p-10 text-center text-white/60 text-sm">
            No promotions currently available in this category. Check back soon or explore All Offers!
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredPromotions.map(promo => {
              const meta = CATEGORY_META[promo.category] || CATEGORY_META.deposit_bonus
              const CatIcon = meta.icon
              const statusInfo = CLAIM_STATUS_STYLE[promo.latest_claim_status]
              const isActivated = promo.latest_claim_status === 'activated'
              const isPending = promo.latest_claim_status === 'pending'
              const maxClaims = Math.max(1, Number(promo.max_claims_per_user || 1))

              return (
                <div
                  key={promo.id}
                  className={`card rounded-2xl border p-5 flex flex-col justify-between gap-4 transition hover:-translate-y-0.5 ${
                    promo.featured
                      ? 'border-amber-400/30 bg-gradient-to-br from-[#121927] via-[#0e1420] to-[#0c1619]'
                      : 'border-white/10 bg-[#0d131d]'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 ${meta.iconBox}`}>
                          <CatIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${meta.badge}`}>
                              {promo.badge_text || meta.label}
                            </span>
                            {promo.auto_credit === 1 && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold uppercase">
                                Instant
                              </span>
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{promo.title}</h3>
                        </div>
                      </div>
                    </div>

                    {promo.subtitle && (
                      <p className="text-xs text-white/65 leading-relaxed">{promo.subtitle}</p>
                    )}

                    {/* Reward Highlight Strip */}
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/5 border border-white/10 p-3 text-xs">
                      <div>
                        <span className="text-[10px] text-white/45 uppercase block">Bonus</span>
                        <span className="font-extrabold text-brand text-sm">
                          {promo.bonus_type === 'fixed'
                            ? `+$${Number(promo.bonus_value).toFixed(0)}`
                            : `+${Number(promo.bonus_value)}%`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-white/45 uppercase block">Max Cap</span>
                        <span className="font-bold text-white font-mono">
                          {Number(promo.max_bonus_amount) > 0
                            ? `$${Number(promo.max_bonus_amount).toLocaleString()}`
                            : 'No Cap'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-white/45 uppercase block">Min Deposit</span>
                        <span className="font-bold text-white font-mono">
                          {Number(promo.min_deposit) > 0 ? `$${Number(promo.min_deposit).toFixed(0)}` : '$0'}
                        </span>
                      </div>
                    </div>

                    {promo.terms && (
                      <p className="text-[11px] text-white/50 leading-relaxed">{promo.terms}</p>
                    )}
                  </div>

                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      {promo.promo_code ? (
                        <button
                          type="button"
                          onClick={() => handleCopyCode(promo.promo_code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-amber-300 transition"
                          title="Copy promo code"
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          <span>{promo.promo_code}</span>
                          {copiedCode === promo.promo_code ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 opacity-60" />
                          )}
                        </button>
                      ) : (
                        <span className="text-[11px] text-white/45">No promo code required</span>
                      )}

                      <span className="text-[11px] text-white/55">
                        Used: <strong className="text-white">{promo.user_claim_count || 0}/{maxClaims}</strong>
                      </span>
                    </div>

                    {statusInfo && (
                      <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 ${statusInfo.cls}`}>
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Status: {statusInfo.label}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {!token ? (
                        <Link
                          to="/login"
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-emerald-400 text-black font-bold text-xs transition"
                        >
                          <span>Sign In to Claim Bonus</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : isActivated ? (
                        <Link
                          to={`/wallet/deposit${promo.promo_code ? `?promo=${encodeURIComponent(promo.promo_code)}` : ''}`}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-extrabold text-xs transition"
                        >
                          <Wallet className="w-4 h-4" />
                          <span>Deposit ${Number(promo.min_deposit || 0).toFixed(0)}+ to Unlock Bonus</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : isPending ? (
                        <button
                          type="button"
                          disabled
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-300 font-semibold text-xs cursor-default"
                        >
                          <Clock className="w-4 h-4" />
                          <span>Claim Pending Review</span>
                        </button>
                      ) : promo.can_claim ? (
                        <button
                          type="button"
                          disabled={claimingId === promo.id}
                          onClick={() => handleClaim(promo)}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-emerald-400 text-black font-extrabold text-xs transition disabled:opacity-60"
                        >
                          {claimingId === promo.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Gift className="w-4 h-4" />
                          )}
                          <span>{claimingId === promo.id ? 'Activating...' : 'Activate & Claim Bonus'}</span>
                        </button>
                      ) : (
                        <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 font-semibold text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Maximum Claims Reached</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : null}

      {/* Claimed Bonuses History */}
      {(activeTab === 'claims' || claims.length > 0) && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <span>My Claimed Bonuses &amp; Offers</span>
            </h2>
            <span className="text-xs text-white/50">{claims.length} record{claims.length === 1 ? '' : 's'}</span>
          </div>

          <div className="card p-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0d131d]">
            {claims.length === 0 ? (
              <div className="p-8 text-center text-white/50 text-sm">
                You have not claimed or activated any bonus offers yet. Choose an offer above to get started!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm text-left">
                  <thead className="text-[11px] uppercase text-white/50 bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3">Offer</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Deposit</th>
                      <th className="px-4 py-3">Bonus</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Claimed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {claims.map(c => {
                      const st = CLAIM_STATUS_STYLE[c.status] || CLAIM_STATUS_STYLE.pending
                      return (
                        <tr key={c.id} className="hover:bg-white/5 transition">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{c.promo_title || `Offer #${c.promotion_id}`}</div>
                            {c.admin_note && (
                              <div className="text-[11px] text-white/50 mt-0.5">{c.admin_note}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-amber-300">
                            {c.promo_code || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-white/80">
                            {Number(c.deposit_amount) > 0 ? `$${Number(c.deposit_amount).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-brand">
                            +${Number(c.bonus_amount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${st.cls}`}>
                              {c.status === 'rejected' && <XCircle className="w-3 h-3" />}
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/55 whitespace-nowrap">
                            {formatBdDateTime(c.claimed_at, { showZone: true }) || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
