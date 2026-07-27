import { useEffect, useState, useMemo } from 'react'
import { api } from '../api'
import { useAuth } from '../store'

const LEVEL_CONFIG = {
  BRONZE: {
    gradient: 'from-amber-700 via-amber-600 to-yellow-500',
    glow: 'shadow-[0_0_40px_rgba(217,169,78,0.35)]',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    badge: '🥉',
    label: 'Bronze Partner',
  },
  SILVER: {
    gradient: 'from-slate-400 via-slate-300 to-white',
    glow: 'shadow-[0_0_40px_rgba(203,213,225,0.35)]',
    border: 'border-slate-400/40',
    text: 'text-slate-300',
    bg: 'bg-slate-400/10',
    badge: '🥈',
    label: 'Silver Leader',
  },
  GOLD: {
    gradient: 'from-yellow-500 via-amber-400 to-orange-400',
    glow: 'shadow-[0_0_50px_rgba(250,204,21,0.4)]',
    border: 'border-yellow-400/50',
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    badge: '🥇',
    label: 'Gold Master',
  },
}

function formatMoney(v) {
  const n = Number(v) || 0
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
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

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      api(token).get('/api/ib/dashboard'),
      api(token).get('/api/ib/team'),
    ]).then(([dashRes, teamRes]) => {
      setData(dashRes.data)
      setTeam(teamRes.data)
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

  const streams = useMemo(() => {
    if (!data) return []
    return [
      {
        key: 'ai_trade',
        label: 'AI Trade',
        icon: 'AI_TRADE',
        earned: data.stats?.ai_trade_earned || 0,
        rates: data.rates?.ai_trade,
        color: 'from-violet-500 to-purple-600',
        border: 'border-violet-500/30',
        accent: 'text-violet-400',
      },
      {
        key: 'manual',
        label: 'Forex / Manual',
        icon: 'MANUAL_TRADING',
        earned: data.stats?.manual_earned || 0,
        rates: data.rates?.manual,
        color: 'from-sky-500 to-blue-600',
        border: 'border-sky-500/30',
        accent: 'text-sky-400',
      },
      {
        key: 'binary',
        label: 'Binary Options',
        icon: 'BINARY_OPTIONS',
        earned: data.stats?.binary_earned || 0,
        rates: data.rates?.binary,
        color: 'from-rose-500 to-pink-600',
        border: 'border-rose-500/30',
        accent: 'text-rose-400',
      },
    ]
  }, [data])

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

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* ─── Hero Badge ─── */}
      <section className={`relative overflow-hidden rounded-3xl border ${cfg.border} bg-gradient-to-br from-[#0e1218] to-[#0b0f13] p-6 sm:p-8 ${cfg.glow}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br opacity-[0.06] rounded-full blur-3xl pointer-events-none" style={{ background: `linear-gradient(135deg, currentColor, transparent)` }} />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-4xl shadow-lg flex-shrink-0 animate-pulse`} style={{ animationDuration: '3s' }}>
            {cfg.badge}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] uppercase tracking-[0.25em] ${cfg.text} font-bold mb-1`}>IB Level</div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{cfg.label}</h1>
            <div className="text-white/50 text-sm mt-1">
              {data.referral_count} referral{data.referral_count !== 1 ? 's' : ''} · Member since {data.upgraded_at ? new Date(data.upgraded_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 mb-1">Lifetime Earned</div>
            <div className="text-2xl sm:text-3xl font-black text-brand">{formatMoney(data.stats?.lifetime_earned)}</div>
            <div className="text-white/40 text-xs mt-1">{data.stats?.total_commissions || 0} commissions</div>
          </div>
        </div>

        {/* Tier progress bar */}
        {data.next_tier && (
          <div className="mt-6">
            <div className="flex justify-between text-[10px] uppercase tracking-[0.15em] text-white/45 mb-2">
              <span>Progress to {data.next_tier}</span>
              <span>{data.progress_pct?.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${cfg.gradient} transition-all duration-1000 ease-out`}
                style={{ width: `${Math.min(100, data.progress_pct || 0)}%` }}
              />
            </div>
            <div className="text-[10px] text-white/35 mt-1.5">
              Monthly volume: {formatMoney(data.month_volume)} / {formatMoney(data.next_tier === 'SILVER' ? 5000 : 25000)}
            </div>
          </div>
        )}
        {!data.next_tier && data.level === 'GOLD' && (
          <div className="mt-5 text-center">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold uppercase tracking-wider">
              ✦ Maximum Tier Reached
            </span>
          </div>
        )}
      </section>

      {/* ─── Monthly Status Bar ─── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Month Volume', value: formatMoney(data.month_volume), sub: data.month_key },
          { label: 'Monthly Bonus', value: data.bonus_paid ? formatMoney(data.bonus_amount) : 'Pending', sub: data.bonus_paid ? 'Paid ✓' : 'Eligible check hourly' },
          { label: 'AI Trade Earned', value: formatMoney(data.stats?.ai_trade_earned) },
          { label: 'Bonus Earned', value: formatMoney(data.stats?.bonus_earned) },
        ].map((card, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#0e1218] p-4">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1">{card.label}</div>
            <div className="text-lg font-bold text-white">{card.value}</div>
            {card.sub && <div className="text-[10px] text-white/30 mt-0.5">{card.sub}</div>}
          </div>
        ))}
      </section>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1.5 text-xs font-semibold uppercase tracking-[0.2em]">
        {['overview', 'ledger', 'team'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-2 transition ${
              tab === t
                ? 'border-brand/80 bg-brand text-black shadow-[0_8px_20px_rgba(0,223,154,0.3)]'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Commission Stream Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {streams.map(s => (
              <div key={s.key} className={`relative overflow-hidden rounded-2xl border ${s.border} bg-gradient-to-b from-[#111620] to-[#0b0f13] p-5 hover:-translate-y-1 transition-transform duration-300`}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 pointer-events-none" style={{ background: 'currentColor' }} />
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4 shadow-md`}>
                  <AssetIcon type={s.icon} className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">{s.label}</h3>
                <div className={`text-xl font-black ${s.accent} mb-3`}>{formatMoney(s.earned)}</div>
                {s.rates && (
                  <div className="space-y-1 text-[10px] text-white/45">
                    <div className="flex justify-between">
                      <span>Direct</span>
                      <span className="text-white/70 font-mono">{s.rates.direct}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sub-IB (L2)</span>
                      <span className="text-white/70 font-mono">{s.rates.sub}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recent activity */}
          {data.recent_ledger?.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Recent Activity</div>
              </div>
              <div className="divide-y divide-white/5">
                {data.recent_ledger.map(row => (
                  <div key={row.id} className="px-5 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <AssetIcon type={row.asset_class} className="w-4 h-4 text-white/40 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-white/80 text-xs font-medium truncate">
                          {row.asset_class?.replace(/_/g, ' ')} · {row.tier_level}
                        </div>
                        <div className="text-[10px] text-white/35 truncate">
                          from {row.source_name || row.source_email || `User #${row.source_user_id}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-brand font-bold text-sm">+{formatMoney(row.commission_amount)}</div>
                      <div className="text-[10px] text-white/30">{new Date(row.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Ledger Tab ─── */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS'].map(f => (
              <button
                key={f}
                onClick={() => { setLedgerFilter(f); setLedgerPage(0) }}
                className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold transition ${
                  ledgerFilter === f
                    ? 'border-brand/60 bg-brand/10 text-brand'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40 border-b border-white/5">
                  <tr>
                    <th className="text-left p-3">Time</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Tier</th>
                    <th className="text-right p-3">Volume</th>
                    <th className="text-right p-3">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-white/40">No entries yet</td>
                    </tr>
                  )}
                  {ledger.map(row => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-white/50 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleDateString()} {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-white/70 truncate max-w-[120px]">
                        {row.source_name || row.source_email || (row.source_user_id === 0 ? 'System' : `#${row.source_user_id}`)}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-[9px] uppercase font-semibold">
                          <AssetIcon type={row.asset_class} className="w-3 h-3" />
                          {row.asset_class?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-white/50 capitalize">{row.tier_level?.replace(/_/g, ' ')}</td>
                      <td className="p-3 text-right font-mono text-white/50">{formatMoney(row.trade_amount)}</td>
                      <td className="p-3 text-right font-mono text-brand font-bold">+{formatMoney(row.commission_amount)}</td>
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

      {/* ─── Team Tab ─── */}
      {tab === 'team' && (
        <div className="rounded-2xl border border-white/8 bg-[#0e1218] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Your Referrals</div>
              <div className="text-lg font-bold text-white">{team.length} member{team.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          {team.length === 0 ? (
            <div className="p-8 text-center text-white/40 text-sm">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              No referrals yet. Share your affiliate link to start earning!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40 border-b border-white/5">
                  <tr>
                    <th className="text-left p-3">Member</th>
                    <th className="text-right p-3">Volume</th>
                    <th className="text-right p-3">Commission</th>
                    <th className="text-right p-3">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {team.map(m => (
                    <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center text-brand font-bold text-[10px]">
                            {(m.name || m.email)?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="text-white/80 font-medium">{m.name || 'Unnamed'}</div>
                            <div className="text-[10px] text-white/35">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-white/60">{formatMoney(m.generated_volume)}</td>
                      <td className="p-3 text-right font-mono text-brand font-bold">{formatMoney(m.generated_commission)}</td>
                      <td className="p-3 text-right text-white/40">{new Date(m.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
