import { useEffect, useState, useMemo } from 'react'
import { api } from '../api'
import { useAuth } from '../store'
import { formatBdDate, formatBdDateTime } from '../utils/bdTime'

const LEVEL_CONFIG = {
  BRONZE: {
    gradient: 'from-amber-700 via-amber-600 to-yellow-500',
    glow: 'shadow-[0_0_40px_rgba(217,169,78,0.3)]',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    badge: '🥉',
    label: 'Bronze Partner',
  },
  SILVER: {
    gradient: 'from-slate-400 via-slate-300 to-white',
    glow: 'shadow-[0_0_40px_rgba(203,213,225,0.3)]',
    border: 'border-slate-400/40',
    text: 'text-slate-300',
    bg: 'bg-slate-400/10',
    badge: '🥈',
    label: 'Silver Leader',
  },
  GOLD: {
    gradient: 'from-yellow-500 via-amber-400 to-orange-400',
    glow: 'shadow-[0_0_50px_rgba(250,204,21,0.35)]',
    border: 'border-yellow-400/50',
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    badge: '🥇',
    label: 'Gold Master',
  },
}

const ASSET_LABELS = {
  AI_TRADE: 'AI Trade',
  MANUAL_TRADING: 'Forex / Manual',
  BINARY_OPTIONS: 'Binary Options',
  MONTHLY_BONUS: 'Monthly Bonus',
  MANUAL_CREDIT: 'Admin Adjustment',
}

function formatMoney(v) {
  const n = Number(v) || 0
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function formatMoney2(v) {
  const n = Number(v) || 0
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function AssetIcon({ type, className = '' }) {
  if (type === 'AI_TRADE') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1v3l-4 4-4-4v-3H7a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z" />
        <circle cx="12" cy="9" r="1.5" fill="currentColor" />
      </svg>
    )
  }
  if (type === 'MANUAL_TRADING') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    )
  }
  if (type === 'BINARY_OPTIONS') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

export default function IBDashboard() {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [ledger, setLedger] = useState([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [ledgerFilter, setLedgerFilter] = useState('ALL')
  const [ledgerPage, setLedgerPage] = useState(0)
  const [tab, setTab] = useState('overview')
  const [copiedType, setCopiedType] = useState('')

  // Interactive calculator state
  const [calcAiProfit, setCalcAiProfit] = useState('100')
  const [calcForexLots, setCalcForexLots] = useState('5')
  const [calcBinaryStake, setCalcBinaryStake] = useState('500')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      api(token).get('/api/ib/dashboard'),
      api(token).get('/api/ib/team'),
    ]).then(([dashRes, teamRes]) => {
      setData(dashRes.data)
      setTeam(Array.isArray(teamRes.data) ? teamRes.data : [])
    }).catch(err => console.error('IB load error:', err))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!token) return
    const params = { limit: 20, offset: ledgerPage * 20 }
    if (ledgerFilter !== 'ALL') params.asset_class = ledgerFilter
    api(token).get('/api/ib/ledger', { params })
      .then(res => {
        setLedger(res.data.rows || [])
        setLedgerTotal(res.data.total || 0)
      })
      .catch(err => console.error('Ledger load error:', err))
  }, [token, ledgerFilter, ledgerPage])

  const cfg = LEVEL_CONFIG[data?.level] || LEVEL_CONFIG.BRONZE
  const rates = data?.rates
  const numRates = data?.effective_numeric || {}

  const referralLink = useMemo(() => {
    if (!data?.referral_code) return ''
    if (typeof window === 'undefined') return data.referral_code
    return `${window.location.origin}/signup?ref=${data.referral_code}`
  }, [data?.referral_code])

  const copyText = async (text, type) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedType(type)
      setTimeout(() => setCopiedType(''), 2000)
    } catch (_) {}
  }

  const streams = useMemo(() => {
    if (!data) return []
    const aiDirect = Number(numRates.ai_trade_direct_pct || 0)
    const manMode = numRates.manual_mode === 'percent' ? 'percent' : 'per_lot'
    const manDirect = Number(numRates.manual_direct_rate || 0)
    const binDirect = Number(numRates.binary_direct_pct || 0)

    return [
      {
        key: 'ai_trade',
        label: 'AI Trade Commission',
        icon: 'AI_TRADE',
        earned: data.stats?.ai_trade_earned || 0,
        rates: rates?.ai_trade,
        basis: 'Paid every 24h on your referral’s AI Trade daily profit payout',
        example: aiDirect > 0
          ? `Example: Referral earns $100 AI profit → You earn ${formatMoney2(100 * (aiDirect / 100))}`
          : 'Currently set to 0%',
        color: 'from-violet-500 to-purple-600',
        border: 'border-violet-500/30',
        accent: 'text-violet-400',
      },
      {
        key: 'manual',
        label: 'Forex / Manual Trading',
        icon: 'MANUAL_TRADING',
        earned: data.stats?.manual_earned || 0,
        rates: rates?.manual,
        basis: manMode === 'percent'
          ? 'Paid automatically when your referral closes a trade (% of trade margin)'
          : 'Paid automatically when your referral closes a trade (USD per lot)',
        example: manDirect > 0
          ? (manMode === 'percent'
            ? `Example: Referral closes $1,000 trade → You earn ${formatMoney2(1000 * (manDirect / 100))}`
            : `Example: Referral closes 2.00 lots → You earn ${formatMoney2(2 * manDirect)}`)
          : 'Currently set to $0',
        color: 'from-sky-500 to-blue-600',
        border: 'border-sky-500/30',
        accent: 'text-sky-400',
      },
      {
        key: 'binary',
        label: 'Binary Options',
        icon: 'BINARY_OPTIONS',
        earned: data.stats?.binary_earned || 0,
        rates: rates?.binary,
        basis: 'Paid on every Binary Options trade stake placed (win or lose)',
        example: binDirect > 0
          ? `Example: Referral places $100 trade → You earn ${formatMoney2(100 * (binDirect / 100))}`
          : 'Currently set to 0%',
        color: 'from-rose-500 to-pink-600',
        border: 'border-rose-500/30',
        accent: 'text-rose-400',
      },
    ]
  }, [data, rates, numRates])

  const calcEstimate = useMemo(() => {
    const aiVal = Math.max(0, Number(calcAiProfit) || 0)
    const fxVal = Math.max(0, Number(calcForexLots) || 0)
    const binVal = Math.max(0, Number(calcBinaryStake) || 0)
    const manMode = numRates.manual_mode === 'percent' ? 'percent' : 'per_lot'

    const directAi = aiVal * ((Number(numRates.ai_trade_direct_pct) || 0) / 100)
    const subAi = aiVal * ((Number(numRates.ai_trade_sub_pct) || 0) / 100)
    const directFx = manMode === 'percent'
      ? fxVal * ((Number(numRates.manual_direct_rate) || 0) / 100)
      : fxVal * (Number(numRates.manual_direct_rate) || 0)
    const subFx = manMode === 'percent'
      ? fxVal * ((Number(numRates.manual_sub_rate) || 0) / 100)
      : fxVal * (Number(numRates.manual_sub_rate) || 0)
    const directBin = binVal * ((Number(numRates.binary_direct_pct) || 0) / 100)
    const subBin = binVal * ((Number(numRates.binary_sub_pct) || 0) / 100)

    return {
      directTotal: directAi + directFx + directBin,
      subTotal: subAi + subFx + subBin,
      directAi, directFx, directBin,
      subAi, subFx, subBin,
      manMode,
    }
  }, [calcAiProfit, calcForexLots, calcBinaryStake, numRates])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-brand/40 border-t-brand rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-white/50">
        Failed to load IB dashboard.
      </div>
    )
  }

  const totalPages = Math.ceil(ledgerTotal / 20)
  const l1Members = team.filter(m => m.tier !== 'L2')
  const l2Members = team.filter(m => m.tier === 'L2')

  const statusBadge = data.ib_status === 'ACTIVE_IB'
    ? { label: 'Official IB Holder · Active', cls: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' }
    : data.ib_status === 'PAUSED'
      ? { label: 'IB Commissions Paused by Admin', cls: 'bg-rose-500/15 border-rose-400/40 text-rose-300' }
      : data.program_config?.only_approved_ib_earn
        ? { label: 'Pending IB Holder Activation', cls: 'bg-amber-500/15 border-amber-400/40 text-amber-300' }
        : { label: 'Standard IB Partner · Active', cls: 'bg-sky-500/15 border-sky-400/40 text-sky-300' }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">

      {/* ─── Hero IB Status Card ─── */}
      <section className={`relative overflow-hidden rounded-3xl border ${cfg.border} bg-gradient-to-br from-[#0e1218] to-[#0b0f13] p-6 sm:p-8 ${cfg.glow}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-4xl shadow-lg flex-shrink-0`}>
            {cfg.badge}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] uppercase tracking-[0.25em] ${cfg.text} font-bold`}>IB Level</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
              {data.has_custom_rates && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300 text-[10px] font-bold">
                  ★ Custom VIP Rates Active
                </span>
              )}
              {data.level_locked && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/60 text-[10px] font-semibold">
                  🔒 Admin Assigned Rank
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{cfg.label}</h1>
            <div className="text-white/55 text-xs sm:text-sm flex flex-wrap gap-x-3 gap-y-1">
              <span>{data.referral_count} Direct (L1)</span>
              <span>· {data.sub_referral_count || 0} Sub-IB (L2)</span>
              <span>· {data.assigned_at ? `IB Since ${formatBdDateTime(data.assigned_at, { showZone: true })}` : `Joined ${formatBdDate(data.user_created_at) || '—'}`}</span>
            </div>
          </div>
          <div className="sm:text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mb-1">Lifetime IB Profit</div>
            <div className="text-2xl sm:text-3xl font-black text-brand">{formatMoney2(data.stats?.lifetime_earned)}</div>
            <div className="text-white/45 text-xs mt-1">{data.stats?.total_commissions || 0} commission payout{(data.stats?.total_commissions || 0) !== 1 ? 's' : ''}</div>
            {data.stats?.last_commission_at && (
              <div className="text-[10px] text-white/35 mt-0.5">
                Last credit: {formatBdDateTime(data.stats.last_commission_at, { showZone: true })}
              </div>
            )}
          </div>
        </div>

        {/* Tier progress bar */}
        {data.next_tier && (
          <div className="mt-6">
            <div className="flex flex-wrap justify-between gap-2 text-[11px] text-white/60 mb-2">
              <span>
                Progress to <strong className="text-white">{data.next_tier}</strong>
                {data.next_tier_bonus > 0 ? ` (Unlocks higher rates + ${formatMoney2(data.next_tier_bonus)}/mo fixed bonus)` : ''}
              </span>
              <span className="font-mono text-brand font-bold">{data.progress_pct?.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${cfg.gradient} transition-all duration-1000 ease-out`}
                style={{ width: `${Math.min(100, data.progress_pct || 0)}%` }}
              />
            </div>
            <div className="text-[11px] text-white/40 mt-1.5 flex flex-wrap justify-between gap-2">
              <span>Current month team volume: {formatMoney2(data.month_volume)} / {formatMoney2(data.next_tier_target)}</span>
              <span>Remaining needed: {formatMoney2(Math.max(0, (data.next_tier_target || 0) - (data.month_volume || 0)))}</span>
            </div>
          </div>
        )}
        {!data.next_tier && data.level === 'GOLD' && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-yellow-500/10 border border-yellow-400/20 px-4 py-2.5">
            <span className="text-yellow-300 text-xs font-bold uppercase tracking-wider">
              ✦ Maximum Tier Reached — Top Commission Ratios Active
            </span>
            <span className="text-xs text-yellow-200/70">
              Monthly Bonus Target: {formatMoney2(data.rates?.monthly_bonus || 0)}/month
            </span>
          </div>
        )}
      </section>

      {/* ─── Pending Approval Notice (if Admin enabled approval-only mode) ─── */}
      {!data.eligible && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-4 text-xs sm:text-sm text-amber-200 space-y-1">
          <div className="font-bold">
            {data.ib_status === 'PAUSED'
              ? '⏸️ Your IB commission earning is currently paused by an Administrator.'
              : '🔒 Official IB Holder approval is currently required before referral commissions are credited.'}
          </div>
          <p className="text-amber-200/75 text-xs">
            Contact platform support or an administrator to activate or resume Official IB Holder status on your account.
          </p>
        </div>
      )}

      {/* ─── Referral Invite Link Bar ─── */}
      {data.referral_code && (
        <section className="rounded-2xl border border-brand/25 bg-[#0e1218] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-brand font-bold">Your Referral Link &amp; Invite Code</div>
            <div className="text-xs text-white/60">
              Share this link with friends or clients. Everyone who registers through it is permanently linked to your IB team, and commissions go straight into your Available Wallet Balance.
            </div>
            <div className="font-mono text-xs text-white/90 bg-black/40 border border-white/10 rounded-xl px-3 py-2 break-all mt-1.5">
              {referralLink}
            </div>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center">
              <div className="text-[9px] uppercase tracking-wider text-white/40">Code</div>
              <div className="font-mono font-bold text-sm text-brand">{data.referral_code}</div>
            </div>
            <button
              type="button"
              onClick={() => copyText(data.referral_code, 'code')}
              className="rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition"
            >
              {copiedType === 'code' ? '✓ Copied' : 'Copy Code'}
            </button>
            <button
              type="button"
              onClick={() => copyText(referralLink, 'link')}
              className="rounded-xl bg-brand hover:bg-emerald-400 px-4 py-2.5 text-xs font-bold text-black transition shadow-md shadow-brand/20"
            >
              {copiedType === 'link' ? '✓ Link Copied' : 'Copy Invite Link'}
            </button>
          </div>
        </section>
      )}

      {/* ─── Profit Breakdown Summary Cards ─── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Lifetime Profit', value: formatMoney2(data.stats?.lifetime_earned), sub: 'All streams combined', accent: 'text-brand' },
          { label: 'Direct (L1) Profit', value: formatMoney2(data.stats?.direct_earned), sub: `${data.referral_count} direct users`, accent: 'text-white' },
          { label: 'Sub-IB (L2) Profit', value: formatMoney2(data.stats?.sub_ib_earned), sub: `${data.sub_referral_count || 0} L2 users`, accent: 'text-violet-300' },
          { label: 'Month Volume', value: formatMoney2(data.month_volume), sub: `Cycle ${data.month_key}`, accent: 'text-white' },
          { label: 'Monthly Bonus', value: data.bonus_paid ? formatMoney2(data.bonus_amount) : (rates?.monthly_bonus > 0 ? `${formatMoney2(rates.monthly_bonus)} goal` : '$0.00'), sub: data.bonus_paid ? 'Paid ✓' : 'Checked hourly', accent: 'text-amber-300' },
          { label: 'Bonuses & Credits', value: formatMoney2((data.stats?.bonus_earned || 0) + (data.stats?.manual_credit_earned || 0)), sub: 'Salary + admin credits', accent: 'text-emerald-300' },
        ].map((card, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/40 mb-1">{card.label}</div>
            <div className={`text-base sm:text-lg font-bold ${card.accent}`}>{card.value}</div>
            <div className="text-[10px] text-white/35 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </section>

      {/* ─── Tabs ─── */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.15em]">
        {[
          { key: 'overview', label: 'Overview & Rates' },
          { key: 'guide', label: 'A–Z Guide & Calculator' },
          { key: 'ledger', label: `Profit History (${ledgerTotal})` },
          { key: 'team', label: `My Team (${team.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-2 transition ${
              tab === t.key
                ? 'border-brand/80 bg-brand text-black shadow-[0_8px_20px_rgba(0,223,154,0.3)]'
                : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab 1: Overview & Live Rates ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Your Active Commission Streams with Real Dollar Examples */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Your Active Commission Profit Rates</h2>
                <p className="text-xs text-white/45 mt-0.5">
                  Every time your referrals trade or earn profit, your commission is automatically credited to your withdrawable wallet balance.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {streams.map(s => (
                <div key={s.key} className={`relative overflow-hidden rounded-2xl border ${s.border} bg-gradient-to-b from-[#111620] to-[#0b0f13] p-5 flex flex-col justify-between`}>
                  <div>
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3 shadow-md`}>
                      <AssetIcon type={s.icon} className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-bold text-white">{s.label}</h3>
                    <div className={`text-2xl font-black ${s.accent} mt-1 mb-2`}>{formatMoney2(s.earned)}</div>
                    <p className="text-[11px] text-white/50 leading-relaxed mb-3">{s.basis}</p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-white/10">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/55">Direct Referral (L1)</span>
                      <span className="text-white font-mono font-bold">{s.rates?.direct || '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/55">Sub-IB Team (L2)</span>
                      <span className="text-white/85 font-mono font-semibold">{s.rates?.sub || '—'}</span>
                    </div>
                    <div className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2 text-[11px] text-emerald-300 font-medium">
                      {s.example}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All IB Tiers Comparison Table (Live from Admin Settings) */}
          {Array.isArray(data.tiers) && data.tiers.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0e1218] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">IB Levels &amp; Percentage Ratios (All Tiers)</h2>
                  <p className="text-xs text-white/45 mt-0.5">
                    Reach the monthly team volume target to unlock higher commission percentages and fixed monthly salary bonuses.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-white/45 border-b border-white/10 bg-black/25">
                    <tr>
                      <th className="text-left p-3.5">IB Level</th>
                      <th className="text-left p-3.5">Monthly Volume Target</th>
                      <th className="text-center p-3.5">AI Trade (L1 / L2)</th>
                      <th className="text-center p-3.5">Forex / Manual (L1 / L2)</th>
                      <th className="text-center p-3.5">Binary Options (L1 / L2)</th>
                      <th className="text-right p-3.5">Monthly Bonus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.tiers.map(t => {
                      const isCurrent = t.level === data.level
                      const c = LEVEL_CONFIG[t.level] || LEVEL_CONFIG.BRONZE
                      return (
                        <tr key={t.level} className={isCurrent ? 'bg-brand/[0.06]' : 'hover:bg-white/[0.02]'}>
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{c.badge}</span>
                              <div>
                                <div className={`font-bold ${c.text}`}>{t.display_name || c.label}</div>
                                {isCurrent && (
                                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[9px] font-bold uppercase">
                                    Your Level
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-white/75">
                            {Number(t.min_monthly_volume) > 0 ? `${formatMoney2(t.min_monthly_volume)} / mo` : 'Default (Free to start)'}
                          </td>
                          <td className="p-3.5 text-center font-mono text-white">
                            <span className="font-bold">{t.formatted?.ai_trade?.direct}</span>
                            <span className="text-white/40"> / {t.formatted?.ai_trade?.sub}</span>
                          </td>
                          <td className="p-3.5 text-center font-mono text-white">
                            <span className="font-bold">{t.formatted?.manual?.direct}</span>
                            <span className="text-white/40"> / {t.formatted?.manual?.sub}</span>
                          </td>
                          <td className="p-3.5 text-center font-mono text-white">
                            <span className="font-bold">{t.formatted?.binary?.direct}</span>
                            <span className="text-white/40"> / {t.formatted?.binary?.sub}</span>
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-brand">
                            {Number(t.monthly_bonus) > 0 ? `${formatMoney2(t.monthly_bonus)} / mo` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Commission Activity */}
          <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-semibold">Recent Commission Credits (BDT)</div>
              {data.recent_ledger?.length > 0 && (
                <button onClick={() => setTab('ledger')} className="text-xs text-brand font-semibold hover:underline">
                  View Full History →
                </button>
              )}
            </div>
            {(!data.recent_ledger || data.recent_ledger.length === 0) ? (
              <div className="p-6 text-center text-white/40 text-xs">
                No commission credits yet. Once your referrals trade or earn AI Trade profit, every commission payout with date, time, rate, and source will appear here.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {data.recent_ledger.map(row => (
                  <div key={row.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <AssetIcon type={row.asset_class} className="w-4 h-4 text-white/45 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-white/90 text-xs font-semibold flex flex-wrap items-center gap-1.5">
                          <span>{ASSET_LABELS[row.asset_class] || row.asset_class}</span>
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white/70 capitalize">
                            {row.tier_level?.replace(/_/g, ' ')}
                          </span>
                          {row.rate_label && (
                            <span className="px-1.5 py-0.5 rounded bg-brand/15 text-[10px] font-mono text-brand">
                              {row.rate_label}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/45 truncate mt-0.5">
                          From: {row.source_name || row.source_email || (row.source_user_id === 0 ? 'System Bonus' : `User #${row.source_user_id}`)}
                          {row.note ? ` · ${row.note}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-bold text-sm font-mono ${Number(row.commission_amount) >= 0 ? 'text-brand' : 'text-rose-400'}`}>
                        {Number(row.commission_amount) >= 0 ? '+' : ''}{formatMoney(row.commission_amount)}
                      </div>
                      <div className="text-[10px] text-white/40">{formatBdDateTime(row.created_at, { showZone: true }) || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab 2: A-Z IB Guide & Live Profit Calculator ─── */}
      {tab === 'guide' && (
        <div className="space-y-6">
          {/* Interactive Profit Calculator */}
          <div className="rounded-3xl border border-brand/25 bg-gradient-to-br from-[#0f1720] to-[#0b0f13] p-5 sm:p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-brand font-bold">Live Commission Estimator</div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5">Calculate How Much IB Profit You Earn</h2>
              <p className="text-xs text-white/50 mt-1">
                Enter sample trading activity from your referrals below to see your exact dollar commission using your active rates ({cfg.label}{data.has_custom_rates ? ' + Custom VIP Rates' : ''}).
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-white/60">1. Referral AI Trade Profit ($/day)</span>
                <input
                  type="number"
                  min="0"
                  value={calcAiProfit}
                  onChange={e => setCalcAiProfit(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-sm font-mono text-white focus:border-brand focus:outline-none"
                />
                <div className="text-[10px] text-violet-300">
                  Your rate: {rates?.ai_trade?.direct || '0%'} Direct · {rates?.ai_trade?.sub || '—'} Sub-IB
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-white/60">
                  2. Referral Forex {calcEstimate.manMode === 'percent' ? 'Volume ($)' : 'Volume (Lots)'}
                </span>
                <input
                  type="number"
                  min="0"
                  value={calcForexLots}
                  onChange={e => setCalcForexLots(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-sm font-mono text-white focus:border-brand focus:outline-none"
                />
                <div className="text-[10px] text-sky-300">
                  Your rate: {rates?.manual?.direct || '—'} Direct · {rates?.manual?.sub || '—'} Sub-IB
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-white/60">3. Referral Binary Stake ($)</span>
                <input
                  type="number"
                  min="0"
                  value={calcBinaryStake}
                  onChange={e => setCalcBinaryStake(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-sm font-mono text-white focus:border-brand focus:outline-none"
                />
                <div className="text-[10px] text-rose-300">
                  Your rate: {rates?.binary?.direct || '0%'} Direct · {rates?.binary?.sub || '—'} Sub-IB
                </div>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-bold">If From Direct Referrals (Level 1)</div>
                <div className="text-2xl font-black text-brand font-mono">+{formatMoney2(calcEstimate.directTotal)}</div>
                <div className="text-[11px] text-white/65">
                  AI Trade: {formatMoney2(calcEstimate.directAi)} · Forex: {formatMoney2(calcEstimate.directFx)} · Binary: {formatMoney2(calcEstimate.directBin)}
                </div>
              </div>
              <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-violet-300/80 font-bold">If From Sub-IB Network (Level 2)</div>
                <div className="text-2xl font-black text-violet-300 font-mono">+{formatMoney2(calcEstimate.subTotal)}</div>
                <div className="text-[11px] text-white/65">
                  AI Trade: {formatMoney2(calcEstimate.subAi)} · Forex: {formatMoney2(calcEstimate.subFx)} · Binary: {formatMoney2(calcEstimate.subBin)}
                </div>
              </div>
            </div>
          </div>

          {/* A-to-Z Complete Explanation */}
          <div className="rounded-3xl border border-white/10 bg-[#0e1218] p-5 sm:p-6 space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-bold">A to Z Partner Manual</div>
              <h2 className="text-xl font-bold text-white mt-0.5">Everything About Your IB Commission &amp; Profits</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  step: 'A · What Is an Introducing Broker (IB)?',
                  body: 'As an IB Partner, you earn passive commission income every time users who joined through your referral link (and their referrals at Level 2) trade or earn profit on AvaPartner.',
                },
                {
                  step: 'B · How Direct (Level 1) vs Sub-IB (Level 2) Works',
                  body: 'Level 1 (Direct) = anyone who signs up directly with your referral link. Level 2 (Sub-IB) = anyone invited by your Level 1 referrals. Silver, Gold, and custom VIP partners earn on BOTH levels simultaneously.',
                },
                {
                  step: 'C · When & Where You Get Paid',
                  body: 'All IB commissions are credited automatically into your main Available Wallet Balance in real time (on trade close, binary execution, or 24h AI Trade payout). There is zero lockup — you can trade or withdraw immediately.',
                },
                {
                  step: 'D · How Your IB Level Upgrades',
                  body: 'Your team trading volume is tracked automatically every calendar month. Crossing the Silver or Gold volume threshold promotes your account (checked hourly) and unlocks higher % rates plus a fixed monthly USD bonus.',
                },
                {
                  step: 'E · Exact Meaning of Each Stream',
                  body: `• AI Trade: You earn ${rates?.ai_trade?.direct || '—'} of the daily profit paid to your referral every 24 hours.\n• Forex / Manual: You earn ${rates?.manual?.direct || '—'} whenever your referral closes a trade.\n• Binary Options: You earn ${rates?.binary?.direct || '—'} of every binary trade stake placed (win or lose).`,
                },
                {
                  step: 'F · Full Transparency & Custom VIP Tiers',
                  body: 'Every single dollar credited to your IB wallet is recorded permanently in your Profit History with exact Bangladesh Time (BDT), source user, trade/profit base, and applied percentage rate. Administrators may also assign VIP ranks or custom commission ratios directly.',
                },
              ].map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-white/8 bg-black/25 p-4 space-y-1.5">
                  <div className="text-sm font-bold text-brand">{item.step}</div>
                  <p className="text-xs text-white/65 leading-relaxed whitespace-pre-line">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab 3: Ledger Tab ─── */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS', 'MANUAL_CREDIT'].map(f => (
              <button
                key={f}
                onClick={() => { setLedgerFilter(f); setLedgerPage(0) }}
                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold transition ${
                  ledgerFilter === f
                    ? 'border-brand/60 bg-brand/10 text-brand'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {ASSET_LABELS[f] || 'All Streams'}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40 border-b border-white/5">
                  <tr>
                    <th className="text-left p-3">Date &amp; Time (BDT)</th>
                    <th className="text-left p-3">From User</th>
                    <th className="text-left p-3">Stream</th>
                    <th className="text-left p-3">Tier</th>
                    <th className="text-right p-3">Base Vol/Profit</th>
                    <th className="text-center p-3">Rate</th>
                    <th className="text-right p-3">Commission Profit</th>
                    <th className="text-left p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40">No commission entries yet</td>
                    </tr>
                  )}
                  {ledger.map(row => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-white/60 whitespace-nowrap">
                        {formatBdDateTime(row.created_at, { showZone: true }) || '—'}
                      </td>
                      <td className="p-3 text-white/80 truncate max-w-[140px]">
                        {row.source_name || row.source_email || (row.source_user_id === 0 ? 'System Bonus' : `#${row.source_user_id}`)}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/75 text-[10px] font-semibold whitespace-nowrap">
                          <AssetIcon type={row.asset_class} className="w-3 h-3" />
                          {ASSET_LABELS[row.asset_class] || row.asset_class}
                        </span>
                      </td>
                      <td className="p-3 text-white/60 capitalize whitespace-nowrap">{row.tier_level?.replace(/_/g, ' ')}</td>
                      <td className="p-3 text-right font-mono text-white/60">{formatMoney2(row.trade_amount)}</td>
                      <td className="p-3 text-center font-mono text-brand/90">{row.rate_label || '—'}</td>
                      <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${Number(row.commission_amount) >= 0 ? 'text-brand' : 'text-rose-400'}`}>
                        {Number(row.commission_amount) >= 0 ? '+' : ''}{formatMoney(row.commission_amount)}
                      </td>
                      <td className="p-3 text-white/45 max-w-[200px] truncate" title={row.note || ''}>
                        {row.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 border-t border-white/5">
                <button
                  onClick={() => setLedgerPage(p => Math.max(0, p - 1))}
                  disabled={ledgerPage === 0}
                  className="px-3 py-1 rounded-lg bg-white/5 text-white/50 text-xs disabled:opacity-30 hover:bg-white/10 transition"
                >
                  ← Prev
                </button>
                <span className="text-[10px] text-white/35">Page {ledgerPage + 1} of {totalPages}</span>
                <button
                  onClick={() => setLedgerPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={ledgerPage >= totalPages - 1}
                  className="px-3 py-1 rounded-lg bg-white/5 text-white/50 text-xs disabled:opacity-30 hover:bg-white/10 transition"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab 4: Team Tab (L1 Direct + L2 Sub-IB) ─── */}
      {tab === 'team' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Direct Referrals (L1)</div>
              <div className="text-xl font-bold text-white mt-0.5">{l1Members.length}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Sub-IB Team (L2)</div>
              <div className="text-xl font-bold text-violet-300 mt-0.5">{l2Members.length}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Team Volume Generated</div>
              <div className="text-xl font-bold text-white mt-0.5">
                {formatMoney2(team.reduce((s, m) => s + Number(m.generated_volume || 0), 0))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Commission Earned</div>
              <div className="text-xl font-bold text-brand mt-0.5">
                {formatMoney2(team.reduce((s, m) => s + Number(m.generated_commission || 0), 0))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Your Network</div>
                <div className="text-lg font-bold text-white">{team.length} team member{team.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            {team.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">
                No referrals yet. Share your affiliate link above to start earning!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40 border-b border-white/5">
                    <tr>
                      <th className="text-left p-3">Member</th>
                      <th className="text-left p-3">Network Level</th>
                      <th className="text-right p-3">Volume</th>
                      <th className="text-right p-3">Your Commission</th>
                      <th className="text-right p-3">Joined (BDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {team.map(m => (
                      <tr key={`${m.tier}-${m.id}-${m.via_user_id || 0}`} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center text-brand font-bold text-[10px] shrink-0">
                              {(m.name || m.email)?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <div className="text-white/85 font-medium truncate">{m.name || 'Unnamed'}</div>
                              <div className="text-[10px] text-white/40 truncate">{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          {m.tier === 'L2' ? (
                            <span className="inline-flex flex-col text-[10px]">
                              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold w-fit">Sub-IB (L2)</span>
                              <span className="text-white/40 mt-0.5">via {m.via_name || m.via_email}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-[10px]">
                              Direct (L1){m.sub_referral_count > 0 ? ` · ${m.sub_referral_count} sub` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-white/65">{formatMoney2(m.generated_volume)}</td>
                        <td className="p-3 text-right font-mono text-brand font-bold">{formatMoney2(m.generated_commission)}</td>
                        <td className="p-3 text-right text-white/45 whitespace-nowrap">{formatBdDateTime(m.created_at, { showZone: true }) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
