import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAdminAuth } from '../adminStore'
import { socket } from '../socket'
import { formatBdDateTime, getBdIsoDate, sortByTimestampDesc } from '../utils/bdTime'

const timeframePresets = [
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All Time', value: 'all' },
  { label: 'Custom Range', value: 'custom' }
]

const timeframeFactors = {
  '24h': 0.15,
  '7d': 0.35,
  '30d': 0.6,
  '90d': 0.85,
  all: 1
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const toIsoDate = (date) => getBdIsoDate(date instanceof Date ? date.getTime() : date)
const getDefaultDateRange = () => ({
  from: toIsoDate(Date.now() - 30 * MS_PER_DAY),
  to: toIsoDate(Date.now())
})

const calculateDaysBetween = (from, to) => {
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const [normalizedStart, normalizedEnd] = start.getTime() <= end.getTime()
    ? [start, end]
    : [end, start]
  const diff = normalizedEnd.getTime() - normalizedStart.getTime()
  return Math.max(1, Math.floor(diff / MS_PER_DAY) + 1)
}

const getCustomRangeFactor = (range) => {
  const days = calculateDaysBetween(range.from, range.to)
  return Math.min(1, Math.max(0.07, days / 120))
}

const currency = (value = 0, opts = {}) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    minimumFractionDigits: opts.minimumFractionDigits ?? 2
  }).format(Number(value) || 0)

const percent = (value = 0) => {
  const num = Number(value) || 0
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
}

const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  }
}

const describeArc = (cx, cy, radius, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    'L', cx, cy,
    'Z'
  ].join(' ')
}

const AnalyticsPieChart = ({ data, size = 340 }) => {
  const renderTotal = data.reduce((sum, segment) => sum + segment.value, 0)
  const displayTotal = data.reduce((sum, segment) => sum + segment.displayValue, 0)

  if (!renderTotal) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 text-sm text-slate-500">
        Waiting for analytics...
      </div>
    )
  }

  let cumulative = 0

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-full">
        <defs>
          {data.map((segment, index) => (
            <linearGradient
              key={`gradient-${segment.label}-${index}`}
              id={`analytics-pie-${index}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={segment.color} />
              <stop offset="100%" stopColor={segment.colorEnd || segment.color} stopOpacity="0.8" />
            </linearGradient>
          ))}
        </defs>
        {data.map((segment, index) => {
          const startAngle = (cumulative / renderTotal) * 360
          cumulative += segment.value
          const endAngle = (cumulative / renderTotal) * 360
          return (
            <path
              key={`${segment.label}-${index}`}
              d={describeArc(size / 2, size / 2, size / 2 - 28, startAngle, endAngle)}
              fill={`url(#analytics-pie-${index})`}
              stroke="#f8fafc"
              strokeWidth="3"
            />
          )
        })}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-400">Flow</div>
        <div className="text-2xl font-bold text-slate-900">{displayTotal ? currency(displayTotal) : '—'}</div>
        <div className="text-xs text-slate-500">Selected range</div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { token, admin } = useAdminAuth()
  const [dashboard, setDashboard] = useState(null)
  const [withdrawals, setWithdrawals] = useState([])
  const [actingId, setActingId] = useState(null)
  const [selectedRange, setSelectedRange] = useState('30d')
  const [customDateRange, setCustomDateRange] = useState(() => getDefaultDateRange())

  const hasPermission = (perm) => {
    if (admin?.role === 'admin') return true
    if (!perm) return admin?.role === 'subadmin'
    const perms = admin?.permissions || []
    return perms.includes('all') || perms.includes(perm)
  }

  const loadWithdrawals = useCallback(async () => {
    if (!token || !hasPermission('users')) return
    try {
      const res = await api(token).get('/api/admin/payments/requests?type=withdraw')
      setWithdrawals(sortByTimestampDesc(res.data || [], 'created_at'))
    } catch (err) {
      console.error('withdrawals summary error', err)
    }
  }, [token, admin])

  const loadDashboard = async () => {
    if (!token || !hasPermission('analytics')) return
    try {
      const res = await api(token).get('/api/admin/dashboard')
      setDashboard(res.data)
    } catch (err) {
      console.error('dashboard error', err)
    }
  }

  useEffect(() => {
    if (!token) return
    loadDashboard()
    loadWithdrawals()
  }, [token, admin, loadWithdrawals])

  useEffect(() => {
    if (!token || !hasPermission('users')) return
    const handleWithdrawalEvent = (payload) => {
      const req = payload?.request
      if (req && req.type === 'withdraw') {
        setWithdrawals(prev => {
          const exists = prev.some(r => r.id === req.id)
          const next = exists ? prev.map(r => (r.id === req.id ? { ...r, ...req } : r)) : [req, ...prev]
          return sortByTimestampDesc(next, 'created_at')
        })
      } else {
        loadWithdrawals()
      }
    }
    const handleNotif = (notif) => {
      if (notif?.type === 'withdrawal') loadWithdrawals()
    }
    socket.on('admin_withdrawal_update', handleWithdrawalEvent)
    socket.on('admin_notification', handleNotif)
    return () => {
      socket.off('admin_withdrawal_update', handleWithdrawalEvent)
      socket.off('admin_notification', handleNotif)
    }
  }, [token, admin, loadWithdrawals])

  const decideWithdrawal = async (req, decision) => {
    if (!token || actingId) return
    setActingId(req.id)
    try {
      const res = await api(token).post(`/api/admin/payments/requests/${req.id}/${decision}`)
      const nextStatus = decision === 'approve' ? 'approved' : 'declined'
      const updated = res.data?.request
      setWithdrawals(prev => prev.map(r => (
        r.id === req.id
          ? { ...r, ...(updated || {}), status: nextStatus, updated_at: updated?.updated_at || new Date().toISOString() }
          : r
      )))
      loadDashboard()
    } catch (err) {
      console.error('withdrawal decision error', err)
    } finally {
      setActingId(null)
    }
  }

  const summaryCards = useMemo(() => {
    if (!dashboard?.stats) return []
    return [
      {
        label: 'Total Invested',
        value: currency(dashboard.stats.totalInvested),
        change: percent((dashboard.stats.totalPnL / Math.max(1, dashboard.stats.totalInvested)) * 100),
        badge: '+',
        tone: 'emerald'
      },
      {
        label: 'Total P&L',
        value: currency(dashboard.stats.totalPnL),
        change: percent((dashboard.stats.dayChange || 0) / Math.max(1, dashboard.stats.totalPnL || 1) * 100),
        badge: '24h',
        tone: dashboard.stats.totalPnL >= 0 ? 'emerald' : 'rose'
      },
      {
        label: 'Liquidity On Platform',
        value: currency(dashboard.stats.totalBalance),
        change: `${currency(dashboard.stats.availableLiquidity)} liquid`,
        badge: 'Vault',
        tone: 'indigo'
      },
      {
        label: 'Total Users',
        value: dashboard.stats.totalUsers?.toLocaleString(),
        change: `${dashboard.stats.totalTrades?.toLocaleString()} trades`,
        badge: 'Accounts',
        tone: 'sky'
      }
    ]
  }, [dashboard])

  const pieSegments = useMemo(() => {
    const stats = dashboard?.stats
    if (!stats) {
      return [{
        label: 'Awaiting analytics',
        value: 1,
        displayValue: 0,
        color: '#e2e8f0',
        colorEnd: '#cbd5f5'
      }]
    }

    const invested = Math.max(0, Number(stats.totalInvested ?? 0))
    const available = Math.max(0, Number(stats.availableLiquidity ?? 0))
    const locked = Math.max(0, Number(stats.lockedMargin ?? 0))
    const totalBalance = Math.max(available + locked, Number(stats.totalBalance ?? available + locked))
    const pnl = Number(stats.totalPnL ?? 0)
    const withdrawn = Math.max(0, invested - totalBalance)
    const profit = Math.max(0, pnl)
    const loss = Math.max(0, -pnl)
    const factor = selectedRange === 'custom'
      ? getCustomRangeFactor(customDateRange)
      : timeframeFactors[selectedRange] ?? 1

    const baseSegments = [
      { label: 'Total Deposited', value: invested * factor, color: '#818cf8', colorEnd: '#6366f1' },
      { label: 'Total Withdrawals', value: withdrawn * factor, color: '#fb7185', colorEnd: '#f43f5e' },
      { label: 'Active Liquidity', value: totalBalance * factor, color: '#38bdf8', colorEnd: '#0ea5e9' },
      { label: 'Net Profit', value: profit * factor, color: '#4ade80', colorEnd: '#10b981' },
      { label: 'Net Loss', value: loss * factor, color: '#fb923c', colorEnd: '#f97316' }
    ]

    const computed = baseSegments.map(segment => ({
      ...segment,
      displayValue: Math.max(0, segment.value),
      value: segment.value > 0 ? segment.value : 0.01
    }))

    const displayTotal = computed.reduce((sum, segment) => sum + segment.displayValue, 0)
    if (displayTotal === 0) {
      return [{
        label: 'Gathering analytics',
        value: 1,
        displayValue: 0,
        color: '#e2e8f0',
        colorEnd: '#cbd5f5'
      }]
    }

    return computed
  }, [dashboard?.stats, selectedRange, customDateRange])

  const displayTotal = useMemo(
    () => pieSegments.reduce((sum, segment) => sum + segment.displayValue, 0),
    [pieSegments]
  )

  const renderMissingPermission = (message) => (
    <div className="rounded-2xl bg-white border border-dashed border-slate-200 p-4 text-sm text-slate-500">
      {message}
    </div>
  )

  const rangeDescription = useMemo(() => {
    if (selectedRange === 'custom') {
      return `${customDateRange.from} → ${customDateRange.to}`
    }
    return timeframePresets.find(opt => opt.value === selectedRange)?.label ?? 'Custom range'
  }, [selectedRange, customDateRange])

  const handleDateChange = (field, value) => {
    setCustomDateRange(prev => ({ ...prev, [field]: value }))
    setSelectedRange('custom')
  }

  return (
    <div className="space-y-6">
      {hasPermission('analytics') ? (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(card => (
              <div key={card.label} className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span>{card.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    card.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                    card.tone === 'rose' ? 'bg-rose-50 text-rose-600' :
                    card.tone === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
                    'bg-sky-50 text-sky-600'
                  }`}>{card.badge}</span>
                </div>
                <div className="text-3xl font-semibold text-slate-900">{card.value}</div>
                <div className="text-sm font-medium text-slate-500">{card.change}</div>
              </div>
            ))}
          </section>

          <section>
            <div className="rounded-3xl bg-white p-6 shadow-soft border border-slate-100 space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">Funds Flow Analysis</div>
                  <p className="text-sm text-slate-500">Inspect how deposits, withdrawals, liquidity, and profits interact over the chosen range.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {timeframePresets.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedRange(opt.value)}
                        className={`rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                          selectedRange === opt.value
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 shadow-soft'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      From
                      <input
                        type="date"
                        value={customDateRange.from}
                        onChange={(event) => handleDateChange('from', event.target.value)}
                        max={customDateRange.to}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      To
                      <input
                        type="date"
                        value={customDateRange.to}
                        onChange={(event) => handleDateChange('to', event.target.value)}
                        min={customDateRange.from}
                        max={toIsoDate(new Date())}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                      />
                    </label>
                    <span className="flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {rangeDescription}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
                <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-indigo-500/10 to-sky-500/10 p-6 shadow-soft">
                  <AnalyticsPieChart data={pieSegments} />
                </div>
                <div className="space-y-3">
                  {pieSegments.map(segment => (
                    <div
                      key={segment.label}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2 w-12 rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${segment.color}, ${segment.colorEnd || segment.color})`
                          }}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{segment.label}</div>
                          <div className="text-xs text-slate-400">Flow share</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{currency(segment.displayValue)}</div>
                        <div className="text-xs text-slate-400">
                          {displayTotal ? `${((segment.displayValue / displayTotal) * 100).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        renderMissingPermission('Analytics permission required to view KPI cards and analysis charts.')
      )}

      {hasPermission('users') && (
        <section className="rounded-3xl bg-white p-6 shadow-soft border border-slate-100 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">Withdrawal Requests (Bangladesh Time)</div>
              <p className="text-xs text-slate-500">Live pending and recently approved withdrawals in Asia/Dhaka (BDT).</p>
            </div>
            <Link
              to="/admin/withdrawals"
              className="rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-1.5 text-xs font-semibold transition"
            >
              Manage All Withdrawals →
            </Link>
          </div>

          {(() => {
            const pendingList = withdrawals.filter(w => w.status === 'pending')
            const approvedList = sortByTimestampDesc(withdrawals.filter(w => w.status === 'approved'), 'updated_at').slice(0, 5)
            return (
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Pending Requests</span>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                      {pendingList.length} pending
                    </span>
                  </div>
                  {pendingList.length === 0 ? (
                    <div className="text-xs text-slate-400 py-3">No pending withdrawal requests.</div>
                  ) : (
                    <div className="space-y-2.5">
                      {pendingList.map(req => (
                        <div key={req.id} className="rounded-xl bg-white border border-slate-200/70 p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-bold text-slate-900">
                              {req.user_name || 'User'} <span className="font-normal text-slate-500">({req.user_email || `#${req.user_id}`})</span>
                            </div>
                            <span className="font-mono font-bold text-rose-600 text-sm">${Number(req.amount || 0).toFixed(2)}</span>
                          </div>
                          <div className="text-[11px] text-indigo-700 font-medium">
                            Requested: {formatBdDateTime(req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600 break-all">
                            Address: {req.address || '—'}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => decideWithdrawal(req, 'approve')}
                              disabled={actingId === req.id}
                              className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => decideWithdrawal(req, 'decline')}
                              disabled={actingId === req.id}
                              className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Recently Approved</span>
                    <span className="text-xs text-slate-500">{approvedList.length} shown</span>
                  </div>
                  {approvedList.length === 0 ? (
                    <div className="text-xs text-slate-400 py-3">No approved withdrawals yet.</div>
                  ) : (
                    <div className="space-y-2.5">
                      {approvedList.map(req => (
                        <div key={req.id} className="rounded-xl bg-white border border-slate-200/70 p-3 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-bold text-slate-900">
                              {req.user_name || 'User'} <span className="font-normal text-slate-500">({req.user_email || `#${req.user_id}`})</span>
                            </div>
                            <span className="font-mono font-bold text-emerald-700">${Number(req.amount || 0).toFixed(2)}</span>
                          </div>
                          <div className="text-[11px] text-emerald-700 font-medium">
                            Approved: {formatBdDateTime(req.updated_at || req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Requested: {formatBdDateTime(req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600 break-all">
                            Address: {req.address || '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </section>
      )}
    </div>
  )
}
