import { useEffect, useState, useMemo, useCallback } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { formatBdDateTime, toBdDatetimeLocalValue, bdDatetimeLocalToIso } from '../../utils/bdTime'
import AdminUserIBPanel, {
  IB_ASSET_LABELS,
  IB_LEVELS,
  IB_LEVEL_COLORS,
  IB_STATUS_COLORS,
} from '../../components/AdminUserIBPanel'

const currency2 = (v = 0) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)

const currency4 = (v = 0) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(v) || 0)

export default function AdminIBAffiliatesPage() {
  const { token } = useAdminAuth()
  const [users, setUsers] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Main view state
  const [mainTab, setMainTab] = useState('users') // 'users' | 'history' | 'settings'
  const [userFilter, setUserFilter] = useState('all') // 'all' | 'ib_holders' | 'with_profit' | 'custom_rates'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)

  // Quick Make IB Holder modal
  const [quickModalUser, setQuickModalUser] = useState(null)
  const [quickForm, setQuickForm] = useState({ status: 'ACTIVE_IB', level: 'BRONZE', level_locked: true, notes: '' })
  const [quickSaving, setQuickSaving] = useState(false)

  // Platform-wide IB profit ledger
  const [recentLedger, setRecentLedger] = useState({ rows: [], total: 0 })
  const [ledgerAsset, setLedgerAsset] = useState('ALL')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [editingEntry, setEditingEntry] = useState(null)

  // Global Commission Ratios & Rules
  const [tiersForm, setTiersForm] = useState([])
  const [programConfig, setProgramConfig] = useState({ only_approved_ib_earn: false, auto_upgrade_enabled: true })
  const [settingsSaving, setSettingsSaving] = useState(false)

  const loadOverview = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/ib/admin/overview')
      const data = res.data || {}
      setUsers(Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : []))
      setSummary(data.summary || {})
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load IB overview')
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadSettings = useCallback(async () => {
    if (!token) return
    try {
      const res = await api(token).get('/api/ib/admin/settings')
      setTiersForm(Array.isArray(res.data?.tiers) ? res.data.tiers : [])
      if (res.data?.program_config) setProgramConfig(res.data.program_config)
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load IB settings')
    }
  }, [token])

  const loadRecentLedger = useCallback(async () => {
    if (!token) return
    try {
      const params = { limit: 150 }
      if (ledgerAsset !== 'ALL') params.asset_class = ledgerAsset
      if (ledgerSearch.trim()) params.q = ledgerSearch.trim()
      const res = await api(token).get('/api/ib/admin/recent-ledger', { params })
      setRecentLedger(res.data || { rows: [], total: 0 })
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load profit history')
    }
  }, [token, ledgerAsset, ledgerSearch])

  useEffect(() => {
    loadOverview()
    loadSettings()
  }, [loadOverview, loadSettings])

  useEffect(() => {
    if (mainTab === 'history') {
      loadRecentLedger()
    }
  }, [mainTab, loadRecentLedger])

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return users.filter(u => {
      if (userFilter === 'ib_holders' && !u.is_ib_holder) return false
      if (userFilter === 'with_profit' && Number(u.lifetime_earned || 0) <= 0) return false
      if (userFilter === 'custom_rates' && !u.has_custom_rates) return false
      if (!q) return true
      return (
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q) ||
        String(u.handle || '').toLowerCase().includes(q) ||
        String(u.referral_code || '').toLowerCase().includes(q) ||
        String(u.user_id || '') === q
      )
    })
  }, [users, userFilter, searchQuery])

  const openQuickModal = (u, e) => {
    if (e) e.stopPropagation()
    setQuickModalUser(u)
    setQuickForm({
      status: u.ib_status === 'PAUSED' ? 'PAUSED' : 'ACTIVE_IB',
      level: u.level || 'BRONZE',
      level_locked: u.level ? Boolean(u.level_locked) : true,
      notes: '',
    })
  }

  const saveQuickHolder = async () => {
    if (!quickModalUser) return
    setQuickSaving(true)
    setMsg('')
    setErr('')
    try {
      await api(token).put(`/api/ib/admin/user/${quickModalUser.user_id}/profile`, quickForm)
      setMsg(`Updated IB status for ${quickModalUser.name || quickModalUser.email}`)
      setQuickModalUser(null)
      await loadOverview()
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to update IB status')
    } finally {
      setQuickSaving(false)
    }
  }

  const updateTierField = (level, field, value) => {
    setTiersForm(prev => prev.map(t => (t.level === level ? { ...t, [field]: value } : t)))
  }

  const saveGlobalSettings = async () => {
    setSettingsSaving(true)
    setMsg('')
    setErr('')
    try {
      const res = await api(token).put('/api/ib/admin/settings', {
        tiers: tiersForm.map(t => ({
          level: t.level,
          display_name: t.display_name,
          ai_trade_direct_pct: Number(t.ai_trade_direct_pct),
          ai_trade_sub_pct: Number(t.ai_trade_sub_pct),
          manual_mode: t.manual_mode === 'percent' ? 'percent' : 'per_lot',
          manual_direct_rate: Number(t.manual_direct_rate),
          manual_sub_rate: Number(t.manual_sub_rate),
          binary_direct_pct: Number(t.binary_direct_pct),
          binary_sub_pct: Number(t.binary_sub_pct),
          min_monthly_volume: Number(t.min_monthly_volume),
          monthly_bonus: Number(t.monthly_bonus),
        })),
        program_config: programConfig,
      })
      if (Array.isArray(res.data?.tiers)) setTiersForm(res.data.tiers)
      if (res.data?.program_config) setProgramConfig(res.data.program_config)
      setMsg('Global IB percentage ratios and program rules saved!')
      loadOverview()
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to save global settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const savePlatformLedgerEdit = async () => {
    if (!editingEntry) return
    setSettingsSaving(true)
    setMsg('')
    setErr('')
    try {
      await api(token).put(`/api/ib/admin/ledger/${editingEntry.id}`, {
        commission_amount: Number(editingEntry.commission_amount),
        trade_amount: Number(editingEntry.trade_amount),
        asset_class: editingEntry.asset_class,
        tier_level: editingEntry.tier_level,
        rate_label: editingEntry.rate_label || '',
        note: editingEntry.note || '',
        created_at: editingEntry.bd_datetime_local ? bdDatetimeLocalToIso(editingEntry.bd_datetime_local) : undefined,
        sync_balance: editingEntry.sync_balance !== false,
      })
      setEditingEntry(null)
      setMsg('Profit ledger entry updated')
      loadRecentLedger()
      loadOverview()
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to update ledger entry')
    } finally {
      setSettingsSaving(false)
    }
  }

  const deletePlatformLedgerEntry = async (entryId) => {
    if (!window.confirm('Delete this IB profit entry and reverse its wallet balance adjustment?')) return
    try {
      await api(token).delete(`/api/ib/admin/ledger/${entryId}`)
      setMsg('Ledger entry deleted & balance reversed')
      loadRecentLedger()
      loadOverview()
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to delete ledger entry')
    }
  }

  // ─── Single User IB Management View ───────────────────────────────────────
  if (selectedUser) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedUser(null); loadOverview() }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">IB / Affiliate Management</div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {selectedUser.name || selectedUser.email}
                <span className="ml-2 text-sm font-mono font-normal text-slate-400">#{selectedUser.user_id}</span>
              </h1>
              <div className="text-xs text-slate-500">{selectedUser.email} · Ref Code: <span className="font-mono font-semibold">{selectedUser.referral_code || '—'}</span></div>
            </div>
          </div>
        </div>

        <AdminUserIBPanel
          token={token}
          userId={selectedUser.user_id}
          onUpdated={loadOverview}
        />
      </div>
    )
  }

  // ─── Main Admin IB Console ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">IB &amp; Affiliate Program</h1>
          <p className="text-sm text-slate-500 mt-1">
            Inspect every user&apos;s IB profit &amp; date/time, assign IB Holders &amp; levels, set custom user rates, and configure global percentage ratios.
          </p>
        </div>
      </div>

      {msg && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 flex items-center justify-between">
          <span>{msg}</span>
          <button className="font-bold ml-3" onClick={() => setMsg('')}>×</button>
        </div>
      )}
      {err && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700 flex items-center justify-between">
          <span>{err}</span>
          <button className="font-bold ml-3" onClick={() => setErr('')}>×</button>
        </div>
      )}

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Users', value: summary.total_users ?? users.length, accent: 'text-slate-900' },
          { label: 'Official IB Holders', value: summary.total_ib_holders ?? 0, accent: 'text-indigo-600' },
          { label: 'Total IB Profit Paid', value: currency2(summary.total_ib_profit_paid), accent: 'text-emerald-600' },
          { label: `Month Volume (${summary.month_key || ''})`, value: currency2(summary.total_month_volume), accent: 'text-slate-900' },
          { label: 'Profit Payouts', value: summary.total_commissions_count ?? 0, accent: 'text-slate-900' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 shadow-soft p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</div>
            <div className={`text-xl font-bold ${k.accent}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'users', label: `All Users & IB Holders (${users.length})` },
          { key: 'history', label: 'All IB Profit History (Date & Time)' },
          { key: 'settings', label: 'Commission Ratios & Rules (%)' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              mainTab === t.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab 1: All Users & IB Holders ─── */}
      {mainTab === 'users' && (
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: `All Users (${users.length})` },
                { key: 'ib_holders', label: `IB Holders (${users.filter(u => u.is_ib_holder).length})` },
                { key: 'with_profit', label: `With Profit (${users.filter(u => u.lifetime_earned > 0).length})` },
                { key: 'custom_rates', label: `Custom % (${users.filter(u => u.has_custom_rates).length})` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setUserFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    userFilter === f.key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search name, email, ref code, ID…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 w-full md:w-72 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">User &amp; Registered (BDT)</th>
                  <th className="py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">IB Status &amp; Assigned (BDT)</th>
                  <th className="py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Active Rates</th>
                  <th className="py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Team (L1/L2)</th>
                  <th className="py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Month Vol</th>
                  <th className="py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">IB Profit &amp; Last Date</th>
                  <th className="py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading users…</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">No matching users found.</td></tr>
                ) : filteredUsers.map(u => (
                  <tr
                    key={u.user_id}
                    className="text-slate-700 cursor-pointer hover:bg-slate-50 transition group"
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                        {u.name || u.email} <span className="text-[11px] text-slate-400 font-mono">#{u.user_id}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Joined: {formatBdDateTime(u.user_created_at) || '—'} · Code: {u.referral_code || '—'}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${IB_STATUS_COLORS[u.ib_status] || IB_STATUS_COLORS.STANDARD}`}>
                          {u.ib_status === 'ACTIVE_IB' ? 'IB Holder' : u.ib_status === 'PAUSED' ? 'Paused' : 'Standard'}
                        </span>
                        {u.level && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${IB_LEVEL_COLORS[u.level] || ''}`}>
                            {u.level}
                          </span>
                        )}
                        {u.has_custom_rates && (
                          <span className="px-1.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 text-[9px] font-bold">
                            Custom %
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {u.assigned_at ? `IB: ${formatBdDateTime(u.assigned_at)}` : 'Not assigned yet'}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-[11px] font-mono text-slate-600 whitespace-nowrap">
                      <div>AI: {u.effective_rates?.ai_trade?.direct} (L2 {u.effective_rates?.ai_trade?.sub})</div>
                      <div>FX: {u.effective_rates?.manual?.direct} · Bin: {u.effective_rates?.binary?.direct}</div>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-xs whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{u.referral_count}</span>
                      <span className="text-slate-400"> / {u.sub_referral_count || 0}</span>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-xs whitespace-nowrap">{currency2(u.month_volume)}</td>
                    <td className="py-3 pr-3 text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-emerald-600">{currency2(u.lifetime_earned)}</div>
                      <div className="text-[10px] text-slate-400">
                        {u.last_commission_at ? formatBdDateTime(u.last_commission_at) : 'No payouts'}
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => openQuickModal(u, e)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                            u.is_ib_holder
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {u.is_ib_holder ? 'Set Level' : 'Make IB Holder'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedUser(u) }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold"
                        >
                          Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Tab 2: Platform-wide IB Profit History ─── */}
      {mainTab === 'history' && (
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['ALL', 'AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS', 'MANUAL_CREDIT'].map(f => (
                <button
                  key={f}
                  onClick={() => setLedgerAsset(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    ledgerAsset === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {IB_ASSET_LABELS[f] || 'All Streams'}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Filter by partner or referral email…"
              value={ledgerSearch}
              onChange={e => setLedgerSearch(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 w-full md:w-72"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">Date &amp; Time (BDT)</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">IB Partner</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">Source User</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">Stream</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase">Base Vol</th>
                  <th className="py-2 text-center text-[11px] font-semibold uppercase">Rate</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase">Profit</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase">Note</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLedger.rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">No IB profit transactions recorded yet.</td></tr>
                ) : recentLedger.rows.map(row => (
                  <tr key={row.id} className="text-slate-700 hover:bg-slate-50 transition">
                    <td className="py-2.5 whitespace-nowrap text-xs text-slate-500">{formatBdDateTime(row.created_at, { showZone: true }) || '—'}</td>
                    <td className="py-2.5 text-xs">
                      <button
                        onClick={() => {
                          const found = users.find(u => u.user_id === row.ib_user_id)
                          setSelectedUser(found || { user_id: row.ib_user_id, name: row.ib_name, email: row.ib_email })
                        }}
                        className="font-semibold text-indigo-600 hover:underline text-left"
                      >
                        {row.ib_name || row.ib_email || `#${row.ib_user_id}`}
                      </button>
                    </td>
                    <td className="py-2.5 text-xs">{row.source_name || row.source_email || (row.source_user_id === 0 ? 'System' : `#${row.source_user_id}`)}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 whitespace-nowrap">
                        {IB_ASSET_LABELS[row.asset_class] || row.asset_class}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">{currency2(row.trade_amount)}</td>
                    <td className="py-2.5 text-center font-mono text-xs text-indigo-600">{row.rate_label || '—'}</td>
                    <td className={`py-2.5 text-right font-mono font-bold whitespace-nowrap ${Number(row.commission_amount) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Number(row.commission_amount) >= 0 ? '+' : ''}{currency4(row.commission_amount)}
                    </td>
                    <td className="py-2.5 text-xs text-slate-500 max-w-[180px] truncate" title={row.note || ''}>{row.note || '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingEntry({ ...row, bd_datetime_local: toBdDatetimeLocalValue(row.created_at), sync_balance: true })}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 uppercase"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deletePlatformLedgerEntry(row.id)}
                          className="text-[11px] font-bold text-rose-500 hover:text-rose-700 uppercase"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Tab 3: Global IB Commission Ratios & Program Rules ─── */}
      {mainTab === 'settings' && (
        <div className="space-y-5">
          <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Global IB Program Rules</h2>
                <p className="text-xs text-slate-500">Control who can earn IB commissions and whether levels auto-adjust monthly.</p>
              </div>
              <button
                onClick={saveGlobalSettings}
                disabled={settingsSaving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50"
              >
                {settingsSaving ? 'Saving…' : 'Save All Ratios & Rules'}
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={programConfig.only_approved_ib_earn}
                  onChange={e => setProgramConfig(p => ({ ...p, only_approved_ib_earn: e.target.checked }))}
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Only Approved IB Holders Earn Commissions</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    When enabled, only users explicitly granted &quot;Official IB Holder&quot; status by Admin earn referral commissions. When disabled, all referrers earn at Bronze default unless paused.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={programConfig.auto_upgrade_enabled}
                  onChange={e => setProgramConfig(p => ({ ...p, auto_upgrade_enabled: e.target.checked }))}
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Auto-Adjust Unlocked IB Levels Monthly</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Hourly scheduler upgrades/downgrades unlocked IB Holders based on the monthly team volume targets below (Admin-locked levels are never changed).
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            {tiersForm.map(t => (
              <div key={t.level} className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${IB_LEVEL_COLORS[t.level] || ''}`}>{t.level}</span>
                  <span className="text-xs text-slate-400">Global Tier Ratio</span>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Display Name</span>
                  <input
                    type="text"
                    value={t.display_name || ''}
                    onChange={e => updateTierField(t.level, 'display_name', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">AI Trade Direct (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.ai_trade_direct_pct}
                      onChange={e => updateTierField(t.level, 'ai_trade_direct_pct', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">AI Trade Sub-IB (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.ai_trade_sub_pct}
                      onChange={e => updateTierField(t.level, 'ai_trade_sub_pct', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>

                  <label className="block space-y-1 col-span-2">
                    <span className="text-[11px] font-semibold text-slate-500">Forex / Manual Commission Mode</span>
                    <select
                      value={t.manual_mode || 'per_lot'}
                      onChange={e => updateTierField(t.level, 'manual_mode', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                    >
                      <option value="per_lot">$ Fixed per Lot</option>
                      <option value="percent">% of Trade Margin</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Forex Direct ({t.manual_mode === 'percent' ? '%' : '$/lot'})
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.manual_direct_rate}
                      onChange={e => updateTierField(t.level, 'manual_direct_rate', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Forex Sub-IB ({t.manual_mode === 'percent' ? '%' : '$/lot'})
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.manual_sub_rate}
                      onChange={e => updateTierField(t.level, 'manual_sub_rate', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Binary Direct (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.binary_direct_pct}
                      onChange={e => updateTierField(t.level, 'binary_direct_pct', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Binary Sub-IB (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={t.binary_sub_pct}
                      onChange={e => updateTierField(t.level, 'binary_sub_pct', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Monthly Volume Target ($)</span>
                    <input
                      type="number"
                      step="1"
                      value={t.min_monthly_volume}
                      onChange={e => updateTierField(t.level, 'min_monthly_volume', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Monthly Bonus ($)</span>
                    <input
                      type="number"
                      step="1"
                      value={t.monthly_bonus}
                      onChange={e => updateTierField(t.level, 'monthly_bonus', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 font-mono"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Make IB Holder / Set Level Modal */}
      {quickModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Assign IB Holder — {quickModalUser.name || quickModalUser.email}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{quickModalUser.email}</p>
            </div>
            <div className="p-5 space-y-4">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">IB Holder Status</span>
                <select
                  value={quickForm.status}
                  onChange={e => setQuickForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                >
                  <option value="ACTIVE_IB">Official IB Holder (Active)</option>
                  <option value="PAUSED">Paused / Suspended</option>
                  <option value="STANDARD">Remove IB Holder Status</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">IB Level</span>
                <select
                  value={quickForm.level}
                  disabled={quickForm.status === 'STANDARD'}
                  onChange={e => setQuickForm(p => ({ ...p, level: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 disabled:opacity-50"
                >
                  {IB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickForm.level_locked}
                  disabled={quickForm.status === 'STANDARD'}
                  onChange={e => setQuickForm(p => ({ ...p, level_locked: e.target.checked }))}
                />
                <span>Lock assigned level (do not auto-downgrade monthly)</span>
              </label>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setQuickModalUser(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button
                onClick={saveQuickHolder}
                disabled={quickSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50"
              >
                {quickSaving ? 'Saving…' : 'Save IB Holder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Ledger Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit IB Profit Entry #{editingEntry.id}</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Profit ($)</span>
                  <input type="number" step="0.0001" value={editingEntry.commission_amount}
                    onChange={e => setEditingEntry(p => ({ ...p, commission_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Base Vol ($)</span>
                  <input type="number" step="0.01" value={editingEntry.trade_amount}
                    onChange={e => setEditingEntry(p => ({ ...p, trade_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Stream</span>
                  <select value={editingEntry.asset_class} onChange={e => setEditingEntry(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    {Object.entries(IB_ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Date &amp; Time (BDT)</span>
                  <input type="datetime-local" value={editingEntry.bd_datetime_local || ''}
                    onChange={e => setEditingEntry(p => ({ ...p, bd_datetime_local: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Rate Label</span>
                <input type="text" value={editingEntry.rate_label || ''}
                  onChange={e => setEditingEntry(p => ({ ...p, rate_label: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Note</span>
                <input type="text" value={editingEntry.note || ''}
                  onChange={e => setEditingEntry(p => ({ ...p, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={editingEntry.sync_balance !== false}
                  onChange={e => setEditingEntry(p => ({ ...p, sync_balance: e.target.checked }))} />
                <span>Adjust IB partner&apos;s wallet balance by difference</span>
              </label>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setEditingEntry(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={savePlatformLedgerEdit} disabled={settingsSaving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                {settingsSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
