import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, ArrowUpRight, ArrowDownLeft, Activity, Bot, BarChart3, Clock, Layers } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../store'
import { socket } from '../socket'

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function fmtUsd(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '$0.00'
  const abs = Math.abs(num)
  if (abs > 0 && abs < 0.01) {
    return `${num < 0 ? '-' : ''}$${abs.toFixed(4)}`
  }
  return currencyFmt.format(num)
}

function parseTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z').getTime()
  }
  const ms = new Date(str).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function fmtDateTime(value) {
  const ms = parseTimestamp(value)
  if (!ms) return '--'
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatPair(sym) {
  if (!sym) return '--'
  const str = String(sym)
  if (str === 'USOIL') return 'USOIL/USD'
  if (str.endsWith('USD') && !str.includes('-')) return `${str.slice(0, -3)}/USD`
  return str
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function describeActivity(act) {
  const meta = safeJsonParse(act.meta)
  switch (act.action) {
    case 'crypto_deposit':
      return `USDT Deposit credited (${fmtUsd(meta?.amount || 0)})`
    case 'manual_deposit':
      return `Account credited (${fmtUsd(meta?.amount || 0)})`
    case 'manual_withdraw':
      return `Account debit (${fmtUsd(meta?.amount || 0)})`
    case 'set_user_balance':
      return `Balance updated to ${fmtUsd(meta?.amount || 0)}`
    case 'open_trade':
      return `Opened Forex ${String(meta?.side || '').toUpperCase()} ${formatPair(meta?.symbol)} (${meta?.lots ?? ''} lots)`
    case 'close_trade':
      return `Closed Forex ${String(meta?.side || '').toUpperCase()} ${formatPair(meta?.symbol)} (${Number(meta?.pnl || 0) >= 0 ? '+' : ''}${fmtUsd(meta?.pnl || 0)})`
    case 'close_all_trades':
      return 'Closed all open Forex positions'
    case 'binary_trade_open':
      return `Placed Binary ${String(meta?.direction || '').toUpperCase()} on ${formatPair(meta?.symbol)} (${fmtUsd(meta?.stake || 0)})`
    case 'binary_trade_settled':
      return `Binary ${formatPair(meta?.symbol)} settled: ${String(meta?.result || '').toUpperCase()} (${meta?.result === 'win' ? '+' + fmtUsd(meta?.payout) : fmtUsd(0)})`
    case 'ai_trade_start':
      return `Started AI Trade (${meta?.slot_name || 'Slot'}) — ${fmtUsd(meta?.amount || 0)}`
    case 'ai_trade_payout':
      return `AI Trade Day ${meta?.day_number || ''} payout (+${fmtUsd(meta?.earnings || 0)})`
    case 'ai_trade_stop':
      return `Stopped AI Trade (${meta?.slot_name || 'Slot'})`
    case 'spot_order':
      return `Spot ${String(meta?.side || '').toUpperCase()} ${meta?.symbol || ''} (${meta?.amount ?? ''})`
    case 'copy_trade_start':
      return `Started Copy Trading ${meta?.master_name || ''} (${fmtUsd(meta?.amount || 0)})`
    case 'copy_trade_stop':
      return `Stopped Copy Trading (${fmtUsd(meta?.returned || 0)} returned)`
    default:
      return act.action?.replace(/_/g, ' ') || 'Account activity'
  }
}

const BADGE_CLASSES = {
  ai: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  forex: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  binary: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  spot: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  copy: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  deposit: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  withdraw: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  activity: 'bg-white/10 text-white/75 border-white/15'
}

export default function UnifiedHistoryView({ defaultTab = 'all', compact = false }) {
  const { token, user } = useAuth()
  const [tab, setTab] = useState(defaultTab)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [expandedAi, setExpandedAi] = useState({})

  useEffect(() => {
    setTab(defaultTab)
  }, [defaultTab])

  const loadHistory = useCallback(async (isManual = false) => {
    if (!token) return
    if (isManual) setRefreshing(true)
    else if (!data) setLoading(true)
    setError('')
    try {
      const res = await api(token).get('/api/me/history')
      setData(res.data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load trading history')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    loadHistory(false)
  }, [loadHistory])

  useEffect(() => {
    if (!user?.id) return
    const handleEvent = (payload) => {
      if (!payload?.user_id && !payload?.userId) return
      const targetId = payload?.user_id ?? payload?.userId
      if (targetId === user.id) {
        loadHistory(false)
      }
    }
    socket.on('trade_closed', handleEvent)
    socket.on('user_data_update', handleEvent)
    socket.on('admin_trade_update', handleEvent)
    return () => {
      socket.off('trade_closed', handleEvent)
      socket.off('user_data_update', handleEvent)
      socket.off('admin_trade_update', handleEvent)
    }
  }, [user?.id, loadHistory])

  const forexTrades = data?.forexTrades || []
  const binaryTrades = data?.binaryTrades || []
  const aiSessions = data?.aiTrade?.sessions || []
  const aiEvents = data?.aiTrade?.events || []
  const activeAiSession = data?.aiTrade?.activeSession || null
  const spotOrders = data?.spotOrders || []
  const copyTrades = data?.copyTrades || []
  const payments = data?.payments || []
  const activities = data?.activities || []
  const summary = data?.summary || {}

  // Build unified chronological timeline across every category
  const timeline = useMemo(() => {
    const items = []

    for (const t of forexTrades) {
      const stake = Number(t.stake_amount ?? t.notional ?? (Number(t.qty || 0) * Number(t.price || 0)))
      const pnl = Number(t.pnl || 0)
      items.push({
        id: `forex_${t.id}`,
        ts: parseTimestamp(t.created_at),
        timeStr: t.created_at,
        kind: 'forex',
        badge: 'FOREX',
        title: `${String(t.side || '').toUpperCase()} ${formatPair(t.symbol)}`,
        subtitle: `Margin ${fmtUsd(stake)} · Lots ${Number(t.qty || 0).toFixed(2)} · Entry ${Number(t.price || 0).toFixed(2)}${t.exit_price && t.status === 'closed' ? ` → Exit ${Number(t.exit_price).toFixed(2)}` : ''}`,
        status: t.status === 'open' ? 'Open' : 'Closed',
        amountDisplay: t.status === 'open' ? fmtUsd(stake) : `${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)}`,
        amountTone: t.status === 'open' ? 'neutral' : (pnl >= 0 ? 'positive' : 'negative')
      })
    }

    for (const b of binaryTrades) {
      const createdMs = parseTimestamp(b.created_ts)
      const isWin = b.result === 'win'
      const isLose = b.result === 'lose'
      const net = isWin ? Number(b.payout || 0) : isLose ? -Number(b.stake || 0) : 0
      items.push({
        id: `binary_${b.id}`,
        ts: createdMs,
        timeStr: createdMs,
        kind: 'binary',
        badge: 'BINARY',
        title: `${String(b.direction || '').toUpperCase()} ${formatPair(b.symbol)} (${b.duration_sec >= 60 ? `${b.duration_sec / 60}m` : `${b.duration_sec}s`})`,
        subtitle: `Stake ${fmtUsd(b.stake)} · Entry ${Number(b.entry_price || 0).toFixed(2)}${b.settlement_price != null ? ` → Close ${Number(b.settlement_price).toFixed(2)}` : ''}`,
        status: b.status === 'open' ? 'Open' : (b.result || 'settled').toUpperCase(),
        amountDisplay: b.status === 'open' ? fmtUsd(b.stake) : `${net >= 0 ? '+' : ''}${fmtUsd(net)}`,
        amountTone: b.status === 'open' ? 'neutral' : (isWin ? 'positive' : isLose ? 'negative' : 'neutral')
      })
    }

    if (activeAiSession?.ai_trade_status === 'ON' && !aiSessions.some(s => s.status === 'active')) {
      items.push({
        id: `ai_live_${activeAiSession.user_id}`,
        ts: parseTimestamp(activeAiSession.started_at || activeAiSession.updated_at),
        timeStr: activeAiSession.started_at || activeAiSession.updated_at,
        kind: 'ai',
        badge: 'AI TRADE',
        title: `Active Slot ${activeAiSession.slot} Session`,
        subtitle: `Allocated ${fmtUsd(activeAiSession.allocated_amount)} · Live cycle`,
        status: 'ACTIVE',
        amountDisplay: `+${fmtUsd(activeAiSession.earnings || 0)}`,
        amountTone: 'positive'
      })
    }

    for (const ev of aiEvents) {
      const isPayout = ev.action === 'payout' || (ev.action === 'stopped' && Number(ev.payout_amount) > 0)
      items.push({
        id: `ai_ev_${ev.id}`,
        ts: parseTimestamp(ev.created_at),
        timeStr: ev.created_at,
        kind: 'ai',
        badge: 'AI TRADE',
        title: `${ev.slot_name || `Slot ${ev.slot}`} — ${ev.action === 'started' ? 'Activated' : ev.action === 'payout' ? `Day ${ev.day_number || ''} Payout` : 'Stopped'}`,
        subtitle: ev.note || `Allocated ${fmtUsd(ev.allocated_amount)}`,
        status: ev.action?.toUpperCase?.() || 'LOG',
        amountDisplay: isPayout ? `+${fmtUsd(ev.payout_amount)}` : fmtUsd(ev.allocated_amount),
        amountTone: isPayout ? 'positive' : 'neutral'
      })
    }

    for (const s of spotOrders) {
      const total = Number(s.price || 0) * Number(s.amount || 0)
      items.push({
        id: `spot_${s.id}`,
        ts: parseTimestamp(s.created_at),
        timeStr: s.created_at,
        kind: 'spot',
        badge: 'SPOT',
        title: `${String(s.side || '').toUpperCase()} ${s.symbol} (${s.type})`,
        subtitle: `Qty ${Number(s.amount || 0)} @ ${fmtUsd(s.price)}`,
        status: String(s.status || '').toUpperCase(),
        amountDisplay: fmtUsd(total),
        amountTone: 'neutral'
      })
    }

    for (const c of copyTrades) {
      const pnl = Number(c.current_value || 0) - Number(c.allocated_margin || 0)
      items.push({
        id: `copy_${c.id}`,
        ts: parseTimestamp(c.created_at),
        timeStr: c.created_at,
        kind: 'copy',
        badge: 'COPY',
        title: `Copy Trader: ${c.master_name || `#${c.master_trader_id}`}`,
        subtitle: `Allocated ${fmtUsd(c.allocated_margin)} · Value ${fmtUsd(c.current_value)}`,
        status: String(c.status || '').toUpperCase(),
        amountDisplay: c.status === 'active' ? fmtUsd(c.allocated_margin) : `${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)}`,
        amountTone: c.status === 'active' ? 'neutral' : (pnl >= 0 ? 'positive' : 'negative')
      })
    }

    for (const p of payments) {
      const isDep = p.type === 'deposit'
      items.push({
        id: `pay_${p.id}`,
        ts: parseTimestamp(p.created_at),
        timeStr: p.created_at,
        kind: isDep ? 'deposit' : 'withdraw',
        badge: isDep ? 'DEPOSIT' : 'WITHDRAW',
        title: `${isDep ? 'USDT Deposit' : 'Withdrawal Request'}${p.method_name ? ` (${p.method_name})` : ''}`,
        subtitle: p.tx_ref ? `Ref: ${p.tx_ref.slice(0, 14)}…` : (p.address ? `Address: ${p.address.slice(0, 14)}…` : 'Account transfer'),
        status: p.status === 'approved' ? 'CREDITED' : String(p.status || '').toUpperCase(),
        amountDisplay: `${isDep ? '+' : '-'}${fmtUsd(p.amount)}`,
        amountTone: isDep ? 'positive' : 'negative'
      })
    }

    // Add non-duplicate audit activity logs (e.g. balance adjustments, security events)
    const coveredTradeActions = new Set([
      'open_trade', 'close_trade', 'binary_trade_open', 'binary_trade_settled',
      'ai_trade_start', 'ai_trade_stop', 'ai_trade_payout', 'spot_order',
      'copy_trade_start', 'copy_trade_stop', 'crypto_deposit'
    ])
    for (const a of activities) {
      if (coveredTradeActions.has(a.action)) continue
      items.push({
        id: `act_${a.id}`,
        ts: parseTimestamp(a.ts),
        timeStr: a.ts,
        kind: 'activity',
        badge: 'ACTIVITY',
        title: describeActivity(a),
        subtitle: `Recorded by ${a.actor_role || 'system'}`,
        status: 'LOGGED',
        amountDisplay: '—',
        amountTone: 'neutral'
      })
    }

    return items.sort((a, b) => b.ts - a.ts)
  }, [forexTrades, binaryTrades, activeAiSession, aiSessions, aiEvents, spotOrders, copyTrades, payments, activities])

  const tabs = [
    { key: 'all', label: 'All History', count: timeline.length },
    { key: 'ai', label: 'AI Trade', count: summary.aiSessionCount ?? aiSessions.length },
    { key: 'forex', label: 'Forex', count: forexTrades.length },
    { key: 'binary', label: 'Binary', count: binaryTrades.length },
    { key: 'spot', label: 'Spot & Copy', count: spotOrders.length + copyTrades.length },
    { key: 'payments', label: 'Deposits & Activity', count: payments.length + activities.length }
  ]

  if (loading && !data) {
    return (
      <div className="card p-8 text-center text-white/60 text-sm animate-pulse">
        Loading your permanent trading &amp; activity history…
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-brand font-semibold">Permanent Ledger</div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {compact && tab === 'binary' ? 'Binary Options History' : compact && tab === 'spot' ? 'Spot & Copy Trade History' : 'All Trading & Activity History'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {compact && (
            <Link
              to="/history"
              className="rounded-full bg-white/5 hover:bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition"
            >
              Full History Page →
            </Link>
          )}
          <button
            type="button"
            onClick={() => loadHistory(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Summary KPI Cards (Full View) */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="card bg-black/25 border border-white/10 p-3.5 sm:p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Total Trades</span>
              <Layers className="w-3.5 h-3.5 text-brand" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono text-white">{summary.totalTrades ?? 0}</div>
            <div className="text-[10px] text-white/50">{summary.activityCount ?? 0} activity logs</div>
          </div>

          <div className="card bg-black/25 border border-white/10 p-3.5 sm:p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>AI Trade Earned</span>
              <Bot className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400">+{fmtUsd(summary.aiTotalEarned || 0)}</div>
            <div className="text-[10px] text-white/50">{summary.aiSessionCount ?? 0} session(s)</div>
          </div>

          <div className="card bg-black/25 border border-white/10 p-3.5 sm:p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Forex Realized P/L</span>
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono ${(summary.forexPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(summary.forexPnl || 0) >= 0 ? '+' : ''}{fmtUsd(summary.forexPnl || 0)}
            </div>
            <div className="text-[10px] text-white/50">{summary.forexCount ?? 0} trades ({summary.forexOpenCount ?? 0} open)</div>
          </div>

          <div className="card bg-black/25 border border-white/10 p-3.5 sm:p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Binary Net P/L</span>
              <Clock className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono ${(summary.binaryPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(summary.binaryPnl || 0) >= 0 ? '+' : ''}{fmtUsd(summary.binaryPnl || 0)}
            </div>
            <div className="text-[10px] text-white/50">{summary.binaryWins ?? 0}W / {summary.binaryLosses ?? 0}L</div>
          </div>

          <div className="card bg-black/25 border border-white/10 p-3.5 sm:p-4 space-y-1 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Total Deposited</span>
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono text-white">{fmtUsd(summary.depositTotal || 0)}</div>
            <div className="text-[10px] text-white/50">Withdrawn: {fmtUsd(summary.withdrawTotal || 0)}</div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? 'border-brand/80 bg-brand text-black shadow-sm'
                : 'border-white/15 bg-white/5 text-white/75 hover:bg-white/10'
            }`}
          >
            <span>{t.label}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              tab === t.key ? 'bg-black/15 text-black' : 'bg-white/10 text-white/70'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ALL HISTORY UNIFIED TIMELINE */}
      {tab === 'all' && (
        <div className="card bg-black/25 border border-white/10 p-0 overflow-hidden">
          {timeline.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Activity className="w-8 h-8 text-white/30 mx-auto" />
              <div className="text-sm font-semibold text-white/70">No trading or account activity yet</div>
              <div className="text-xs text-white/50">All AI Trades, Forex trades, Binary options, Spot orders, Copy trades, and deposits are stored here permanently.</div>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {timeline.map(item => (
                <div key={item.id} className="p-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/[0.03] transition">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${BADGE_CLASSES[item.kind] || BADGE_CLASSES.activity}`}>
                      {item.badge}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{item.title}</div>
                      <div className="text-xs text-white/60 break-words">{item.subtitle}</div>
                      <div className="text-[11px] text-white/45 mt-0.5 font-mono">{fmtDateTime(item.timeStr)}</div>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 pl-0 sm:pl-3">
                    <span className={`font-mono font-bold text-sm ${
                      item.amountTone === 'positive' ? 'text-emerald-400' : item.amountTone === 'negative' ? 'text-rose-400' : 'text-white'
                    }`}>
                      {item.amountDisplay}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI TRADE HISTORY */}
      {tab === 'ai' && (
        <div className="space-y-3">
          {activeAiSession?.ai_trade_status === 'ON' && !aiSessions.some(s => s.status === 'active') && (
            <div className="card border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">● Active AI Trade Session (Slot {activeAiSession.slot})</div>
                <div className="text-sm text-white mt-1">
                  Allocated: <span className="font-mono font-bold">{fmtUsd(activeAiSession.allocated_amount)}</span> · Current Cycle Earnings: <span className="font-mono text-emerald-400">+{fmtUsd(activeAiSession.earnings || 0)}</span>
                </div>
                <div className="text-xs text-white/55 mt-0.5">Started: {fmtDateTime(activeAiSession.started_at)}</div>
              </div>
            </div>
          )}

          {aiSessions.length === 0 && activeAiSession?.ai_trade_status !== 'ON' ? (
            <div className="card p-8 text-center text-sm text-white/60">
              No AI Trade sessions recorded yet.
            </div>
          ) : (
            aiSessions.map(s => {
              const isOpen = Boolean(expandedAi[s.session_ref])
              const payouts = (s.events || []).filter(e => e.action === 'payout')
              return (
                <div key={s.session_ref} className="card border border-white/10 p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedAi(prev => ({ ...prev, [s.session_ref]: !prev[s.session_ref] }))}
                    className="w-full p-4 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">{s.slot_name || `Slot ${s.slot}`}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          s.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-white/5 text-white/60 border-white/15'
                        }`}>
                          {s.status === 'active' ? '● Active' : '✓ Completed'}
                        </span>
                      </div>
                      <div className="text-xs text-white/60 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>Invested: <strong className="text-white font-mono">{fmtUsd(s.allocated_amount)}</strong></span>
                        <span>Payout cycles: <strong className="text-white">{payouts.length}</strong></span>
                        <span>Started: {fmtDateTime(s.started_at || s.events?.[0]?.created_at)}</span>
                        {s.stopped_at && <span>Stopped: {fmtDateTime(s.stopped_at)}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 font-bold font-mono text-base">+{fmtUsd(s.total_earned)}</div>
                      <div className="text-[10px] text-white/50">{isOpen ? 'Hide details ▲' : 'View payouts ▼'}</div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/10 bg-black/20 divide-y divide-white/5">
                      {(s.events || []).map(ev => (
                        <div key={ev.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="font-semibold text-white capitalize">
                              {ev.action === 'payout' ? `Day ${ev.day_number || ''} Payout` : ev.action === 'started' ? 'Session Activated' : 'Session Stopped'}
                            </div>
                            <div className="text-white/55">{ev.note}</div>
                            <div className="text-[10px] text-white/45 font-mono">{fmtDateTime(ev.created_at)}</div>
                          </div>
                          <div className={`font-mono font-semibold shrink-0 ${Number(ev.payout_amount) > 0 ? 'text-emerald-400' : 'text-white/70'}`}>
                            {Number(ev.payout_amount) > 0 ? `+${fmtUsd(ev.payout_amount)}` : fmtUsd(ev.allocated_amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* FOREX TRADES */}
      {tab === 'forex' && (
        <div className="card p-0 overflow-hidden">
          {forexTrades.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/60">No Forex trades recorded yet.</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="text-white/60 bg-white/5 border-b border-white/10 text-[11px] uppercase">
                    <tr>
                      <th className="text-left p-3">Time</th>
                      <th className="text-left p-3">Pair &amp; Side</th>
                      <th className="text-right p-3">Margin ($)</th>
                      <th className="text-right p-3">Size (Lots)</th>
                      <th className="text-right p-3">Entry</th>
                      <th className="text-right p-3">Exit</th>
                      <th className="text-right p-3">S/L · T/P</th>
                      <th className="text-right p-3">P/L</th>
                      <th className="text-right p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {forexTrades.map(r => {
                      const qty = Number(r.qty || 0)
                      const amount = Number(r.stake_amount ?? r.notional ?? r.price * qty)
                      const pnl = Number(r.pnl ?? 0)
                      return (
                        <tr key={r.id} className="hover:bg-white/[0.03]">
                          <td className="p-3 whitespace-nowrap text-xs text-white/70">{fmtDateTime(r.created_at)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`font-bold uppercase ${r.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{r.side}</span>
                            <span className="ml-2 text-white font-medium">{formatPair(r.symbol)}</span>
                          </td>
                          <td className="p-3 text-right font-mono">{fmtUsd(amount)}</td>
                          <td className="p-3 text-right font-mono">{qty.toFixed(4)}</td>
                          <td className="p-3 text-right font-mono">{Number(r.price || 0).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono">{r.exit_price != null ? Number(r.exit_price).toFixed(2) : '--'}</td>
                          <td className="p-3 text-right font-mono text-xs text-white/60">
                            {r.sl ? Number(r.sl).toFixed(2) : '--'} / {r.tp ? Number(r.tp).toFixed(2) : '--'}
                          </td>
                          <td className={`p-3 text-right font-mono font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                          </td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              r.status === 'open' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-white/60 border-white/10'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-white/10">
                {forexTrades.map(r => {
                  const qty = Number(r.qty || 0)
                  const amount = Number(r.stake_amount ?? r.notional ?? r.price * qty)
                  const pnl = Number(r.pnl ?? 0)
                  return (
                    <div key={r.id} className="p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-bold uppercase ${r.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{r.side}</span>
                          <span className="ml-2 font-semibold text-white">{formatPair(r.symbol)}</span>
                        </div>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">{r.status}</span>
                      </div>
                      <div className="flex justify-between text-white/60">
                        <span>Margin {fmtUsd(amount)} · Lots {qty.toFixed(2)}</span>
                        <span className={`font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-white/50">
                        <span>Entry {Number(r.price || 0).toFixed(2)} → Exit {r.exit_price != null ? Number(r.exit_price).toFixed(2) : '--'}</span>
                        <span>{fmtDateTime(r.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* BINARY TRADES */}
      {tab === 'binary' && (
        <div className="card p-0 overflow-hidden">
          {binaryTrades.length === 0 ? (
            <div className="p-8 text-center text-sm text-white/60">No Binary trades recorded yet.</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="text-white/60 bg-white/5 border-b border-white/10 text-[11px] uppercase">
                    <tr>
                      <th className="text-left p-3">Time</th>
                      <th className="text-left p-3">Pair &amp; Direction</th>
                      <th className="text-right p-3">Duration</th>
                      <th className="text-right p-3">Stake ($)</th>
                      <th className="text-right p-3">Entry Price</th>
                      <th className="text-right p-3">Close Price</th>
                      <th className="text-right p-3">Outcome</th>
                      <th className="text-right p-3">Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {binaryTrades.map(b => {
                      const isWin = b.result === 'win'
                      const isLose = b.result === 'lose'
                      return (
                        <tr key={b.id} className="hover:bg-white/[0.03]">
                          <td className="p-3 whitespace-nowrap text-xs text-white/70">{fmtDateTime(b.created_ts)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`font-bold uppercase ${b.direction === 'call' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {b.direction === 'call' ? 'Call ↑' : 'Put ↓'}
                            </span>
                            <span className="ml-2 text-white font-medium">{formatPair(b.symbol)}</span>
                          </td>
                          <td className="p-3 text-right font-mono">{b.duration_sec >= 60 ? `${b.duration_sec / 60}m` : `${b.duration_sec}s`}</td>
                          <td className="p-3 text-right font-mono">{fmtUsd(b.stake)}</td>
                          <td className="p-3 text-right font-mono">{Number(b.entry_price || 0).toFixed(2)}</td>
                          <td className="p-3 text-right font-mono">{b.settlement_price != null ? Number(b.settlement_price).toFixed(2) : '--'}</td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              isWin
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : isLose
                                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                  : 'bg-white/5 text-white/65 border-white/15'
                            }`}>
                              {b.status === 'open' ? 'Open' : (b.result || 'Settled')}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${isWin ? 'text-emerald-400' : isLose ? 'text-rose-400' : 'text-white/70'}`}>
                            {isWin ? `+${fmtUsd(b.payout)}` : isLose ? `-${fmtUsd(b.stake)}` : b.result === 'push' ? fmtUsd(0) : 'Pending'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-white/10">
                {binaryTrades.map(b => {
                  const isWin = b.result === 'win'
                  const isLose = b.result === 'lose'
                  return (
                    <div key={b.id} className="p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-bold uppercase ${b.direction === 'call' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {b.direction === 'call' ? 'Call ↑' : 'Put ↓'}
                          </span>
                          <span className="ml-2 font-semibold text-white">{formatPair(b.symbol)}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          isWin ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : isLose ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-white/5 text-white/60 border-white/15'
                        }`}>
                          {b.status === 'open' ? 'Open' : (b.result || 'Settled')}
                        </span>
                      </div>
                      <div className="flex justify-between text-white/60">
                        <span>Stake {fmtUsd(b.stake)} · {b.duration_sec >= 60 ? `${b.duration_sec / 60}m` : `${b.duration_sec}s`}</span>
                        <span className={`font-mono font-bold ${isWin ? 'text-emerald-400' : isLose ? 'text-rose-400' : 'text-white/70'}`}>
                          {isWin ? `+${fmtUsd(b.payout)}` : isLose ? `-${fmtUsd(b.stake)}` : b.result === 'push' ? '$0.00' : 'Pending'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-white/50">
                        <span>Entry {Number(b.entry_price || 0).toFixed(2)} → Close {b.settlement_price != null ? Number(b.settlement_price).toFixed(2) : '--'}</span>
                        <span>{fmtDateTime(b.created_ts)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* SPOT & COPY TRADING */}
      {tab === 'spot' && (
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-bold text-sm text-white">Spot Orders ({spotOrders.length})</div>
            {spotOrders.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/60">No spot orders yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {spotOrders.map(s => (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-white">
                        <span className={s.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>{String(s.side || '').toUpperCase()}</span> {s.symbol} ({s.type})
                      </div>
                      <div className="text-white/55">Amount: {s.amount} @ {fmtUsd(s.price)} · {fmtDateTime(s.created_at)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-white">{fmtUsd(Number(s.price || 0) * Number(s.amount || 0))}</div>
                      <div className="text-[10px] uppercase text-white/50">{s.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-bold text-sm text-white">Copy Trading ({copyTrades.length})</div>
            {copyTrades.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/60">No copy trading allocations yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {copyTrades.map(c => {
                  const pnl = Number(c.current_value || 0) - Number(c.allocated_margin || 0)
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-semibold text-white">{c.master_name || `Trader #${c.master_trader_id}`}</div>
                        <div className="text-white/55">Allocated {fmtUsd(c.allocated_margin)} → Current {fmtUsd(c.current_value)} · {fmtDateTime(c.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                        </div>
                        <div className="text-[10px] uppercase text-white/50">{c.status}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEPOSITS, WITHDRAWALS & ACTIVITY */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-bold text-sm text-white">Deposits &amp; Withdrawals ({payments.length})</div>
            {payments.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/60">No deposit or withdrawal records yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {payments.map(p => {
                  const isDep = p.type === 'deposit'
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isDep ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {isDep ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white capitalize">{p.type}{p.method_name ? ` (${p.method_name})` : ''}</div>
                          <div className="text-white/55 truncate">{p.tx_ref || p.address || 'Account settlement'}</div>
                          <div className="text-[10px] text-white/45 font-mono">{fmtDateTime(p.created_at)}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-mono font-bold ${isDep ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isDep ? '+' : '-'}{fmtUsd(p.amount)}
                        </div>
                        <div className="text-[10px] uppercase text-white/55">{p.status === 'approved' ? 'Credited' : p.status}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-bold text-sm text-white">Account Activity Logs ({activities.length})</div>
            {activities.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/60">No activity logs recorded yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {activities.map(a => (
                  <div key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{describeActivity(a)}</div>
                      <div className="text-[10px] text-white/45 font-mono">{fmtDateTime(a.ts)}</div>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                      {a.actor_role || 'system'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
