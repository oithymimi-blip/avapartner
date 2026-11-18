import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { formatBdDateTime, toBdDatetimeLocalValue, bdDatetimeLocalToIso } from '../utils/bdTime'

const currency = (v = 0) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(v) || 0)

const currency2 = (v = 0) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)

export const IB_LEVELS = ['BRONZE', 'SILVER', 'GOLD']
export const IB_LEVEL_COLORS = {
  BRONZE: 'bg-amber-100 text-amber-800 border border-amber-200',
  SILVER: 'bg-slate-200 text-slate-800 border border-slate-300',
  GOLD: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
}
export const IB_STATUS_COLORS = {
  ACTIVE_IB: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  PAUSED: 'bg-rose-100 text-rose-700 border border-rose-200',
  STANDARD: 'bg-slate-100 text-slate-600 border border-slate-200',
}
export const IB_ASSET_LABELS = {
  AI_TRADE: 'AI Trade',
  MANUAL_TRADING: 'Forex / Manual',
  BINARY_OPTIONS: 'Binary Options',
  MONTHLY_BONUS: 'Monthly Bonus',
  MANUAL_CREDIT: 'Admin Credit',
}

export default function AdminUserIBPanel({ token, userId, onUpdated }) {
  const [profile, setProfile] = useState(null)
  const [ledger, setLedger] = useState({ rows: [], total: 0 })
  const [team, setTeam] = useState([])
  const [subTab, setSubTab] = useState('overview')
  const [ledgerFilter, setLedgerFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  // Form states
  const [profileForm, setProfileForm] = useState({
    status: 'ACTIVE_IB',
    level: 'BRONZE',
    level_locked: true,
    assigned_at: '',
    notes: '',
    referred_by_email: '',
  })

  const [ratesForm, setRatesForm] = useState({
    ai_trade_direct_pct: '',
    ai_trade_sub_pct: '',
    manual_mode: '',
    manual_direct_rate: '',
    manual_sub_rate: '',
    binary_direct_pct: '',
    binary_sub_pct: '',
    monthly_bonus: '',
  })

  const [metricsForm, setMetricsForm] = useState({
    team_volume: '0',
    bonus_amount: '0',
    bonus_paid: false,
  })

  const [creditModal, setCreditModal] = useState(false)
  const [creditForm, setCreditForm] = useState({
    direction: 'add',
    amount: '',
    trade_amount: '',
    asset_class: 'MANUAL_CREDIT',
    tier_level: 'admin_manual',
    rate_label: 'Admin',
    note: '',
    created_at: '',
    sync_balance: true,
  })

  const [editingEntry, setEditingEntry] = useState(null)
  const [attachEmail, setAttachEmail] = useState('')

  const syncFormsFromProfile = (p) => {
    if (!p) return
    setProfileForm({
      status: p.ib_status || (p.is_ib_holder ? 'ACTIVE_IB' : 'STANDARD'),
      level: p.level || p.effective_level || 'BRONZE',
      level_locked: p.level ? Boolean(p.level_locked) : true,
      assigned_at: p.assigned_at ? toBdDatetimeLocalValue(p.assigned_at) : '',
      notes: p.notes || '',
      referred_by_email: p.referred_by?.email || '',
    })
    const cr = p.custom_rates || {}
    setRatesForm({
      ai_trade_direct_pct: cr.ai_trade_direct_pct ?? '',
      ai_trade_sub_pct: cr.ai_trade_sub_pct ?? '',
      manual_mode: cr.manual_mode || '',
      manual_direct_rate: cr.manual_direct_rate ?? '',
      manual_sub_rate: cr.manual_sub_rate ?? '',
      binary_direct_pct: cr.binary_direct_pct ?? '',
      binary_sub_pct: cr.binary_sub_pct ?? '',
      monthly_bonus: cr.monthly_bonus ?? '',
    })
    setMetricsForm({
      team_volume: String(p.month_volume ?? 0),
      bonus_amount: String(p.bonus_amount ?? 0),
      bonus_paid: Boolean(p.bonus_paid),
    })
  }

  const loadAll = useCallback(async (assetFilter = ledgerFilter) => {
    if (!token || !userId) return
    setLoading(true)
    setErr('')
    try {
      const ledgerParams = { limit: 200 }
      if (assetFilter && assetFilter !== 'ALL') ledgerParams.asset_class = assetFilter
      const [pRes, lRes, tRes] = await Promise.all([
        api(token).get(`/api/ib/admin/user/${userId}`),
        api(token).get(`/api/ib/admin/user/${userId}/ledger`, { params: ledgerParams }),
        api(token).get(`/api/ib/admin/user/${userId}/team`),
      ])
      setProfile(pRes.data)
      syncFormsFromProfile(pRes.data)
      setLedger(lRes.data || { rows: [], total: 0 })
      setTeam(Array.isArray(tRes.data) ? tRes.data : [])
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load user IB details')
    } finally {
      setLoading(false)
    }
  }, [token, userId, ledgerFilter])

  useEffect(() => {
    loadAll(ledgerFilter)
  }, [loadAll, ledgerFilter])

  const notifySaved = (text) => {
    setMsg(text)
    setErr('')
    if (onUpdated) onUpdated()
  }

  const saveIBProfile = async () => {
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const payload = {
        status: profileForm.status,
        level: profileForm.level,
        level_locked: profileForm.level_locked,
        assigned_at: profileForm.assigned_at ? bdDatetimeLocalToIso(profileForm.assigned_at) : undefined,
        notes: profileForm.notes,
        referred_by_email: profileForm.referred_by_email,
      }
      const res = await api(token).put(`/api/ib/admin/user/${userId}/profile`, payload)
      if (res.data?.profile) {
        setProfile(res.data.profile)
        syncFormsFromProfile(res.data.profile)
      }
      notifySaved('IB Holder status & level updated')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to save IB profile')
    } finally {
      setSaving(false)
    }
  }

  const saveCustomRates = async (reset = false) => {
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const payload = reset ? { reset: true } : ratesForm
      const res = await api(token).put(`/api/ib/admin/user/${userId}/rates`, payload)
      if (res.data?.profile) {
        setProfile(res.data.profile)
        syncFormsFromProfile(res.data.profile)
      }
      notifySaved(reset ? 'Custom rates cleared (using tier defaults)' : 'Custom user IB percentage ratios saved')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to update custom rates')
    } finally {
      setSaving(false)
    }
  }

  const saveMetrics = async () => {
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const res = await api(token).put(`/api/ib/admin/user/${userId}/metrics`, {
        team_volume: Number(metricsForm.team_volume || 0),
        bonus_amount: Number(metricsForm.bonus_amount || 0),
        bonus_paid: metricsForm.bonus_paid,
      })
      if (res.data?.profile) {
        setProfile(res.data.profile)
        syncFormsFromProfile(res.data.profile)
      }
      notifySaved('Monthly volume & bonus updated')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to update monthly metrics')
    } finally {
      setSaving(false)
    }
  }

  const submitCredit = async () => {
    const amt = Number(creditForm.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a positive dollar amount')
      return
    }
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      await api(token).post(`/api/ib/admin/user/${userId}/credit`, {
        direction: creditForm.direction,
        amount: amt,
        trade_amount: creditForm.trade_amount !== '' ? Number(creditForm.trade_amount) : undefined,
        asset_class: creditForm.asset_class,
        tier_level: creditForm.tier_level,
        rate_label: creditForm.rate_label,
        note: creditForm.note,
        created_at: creditForm.created_at ? bdDatetimeLocalToIso(creditForm.created_at) : undefined,
        sync_balance: creditForm.sync_balance,
      })
      setCreditModal(false)
      setCreditForm({
        direction: 'add',
        amount: '',
        trade_amount: '',
        asset_class: 'MANUAL_CREDIT',
        tier_level: 'admin_manual',
        rate_label: 'Admin',
        note: '',
        created_at: '',
        sync_balance: true,
      })
      await loadAll()
      notifySaved('IB profit entry recorded')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to adjust IB profit')
    } finally {
      setSaving(false)
    }
  }

  const saveLedgerEntry = async () => {
    if (!editingEntry) return
    setSaving(true)
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
      await loadAll()
      notifySaved('Ledger entry updated')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to update ledger entry')
    } finally {
      setSaving(false)
    }
  }

  const deleteLedgerEntry = async (entryId) => {
    if (!window.confirm('Delete this IB profit entry and reverse its wallet balance adjustment?')) return
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      await api(token).delete(`/api/ib/admin/ledger/${entryId}`)
      await loadAll()
      notifySaved('Entry deleted & balance reversed')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to delete entry')
    } finally {
      setSaving(false)
    }
  }

  const attachReferral = async () => {
    if (!attachEmail.trim()) return
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      await api(token).post(`/api/ib/admin/user/${userId}/assign-referral`, { email: attachEmail.trim(), action: 'add' })
      setAttachEmail('')
      await loadAll()
      notifySaved('Referral attached to team')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to attach referral')
    } finally {
      setSaving(false)
    }
  }

  const removeReferral = async (refereeId) => {
    if (!window.confirm('Remove this user from direct referrals?')) return
    setSaving(true)
    setErr('')
    try {
      await api(token).post(`/api/ib/admin/user/${userId}/assign-referral`, { referee_id: refereeId, action: 'remove' })
      await loadAll()
      notifySaved('Referral removed')
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to remove referral')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !profile) {
    return <div className="py-10 text-center text-slate-400 text-sm">Loading IB profile…</div>
  }
  if (!profile) {
    return <div className="py-10 text-center text-rose-500 text-sm">{err || 'No IB profile data.'}</div>
  }

  const tierDef = profile.tier_defaults || {}

  return (
    <div className="space-y-5">
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

      {/* Top IB Status & Timestamps Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">IB Status</div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${IB_STATUS_COLORS[profile.ib_status] || IB_STATUS_COLORS.STANDARD}`}>
            {profile.ib_status === 'ACTIVE_IB' ? 'IB Holder' : profile.ib_status === 'PAUSED' ? 'IB Paused' : 'Standard'}
          </span>
          <div className="text-[10px] text-slate-400 mt-1">
            {profile.assigned_at ? `Since ${formatBdDateTime(profile.assigned_at)}` : 'Not assigned'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">IB Level</div>
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${IB_LEVEL_COLORS[profile.level] || 'bg-slate-100 text-slate-500'}`}>
            {profile.level || 'NONE'}
          </span>
          <div className="text-[10px] text-slate-400 mt-1">
            {profile.level_locked ? '🔒 Locked by Admin' : 'Auto by volume'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Lifetime IB Profit</div>
          <div className="text-lg font-bold text-emerald-600">{currency2(profile.stats?.lifetime_earned)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{profile.stats?.total_commissions || 0} entries</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Direct / Sub-IB</div>
          <div className="text-sm font-bold text-slate-900">
            {currency2(profile.stats?.direct_earned)} <span className="text-slate-400 font-normal">/</span> <span className="text-indigo-600">{currency2(profile.stats?.sub_ib_earned)}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{profile.referral_count} L1 · {profile.sub_referral_count || 0} L2</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Month Volume</div>
          <div className="text-lg font-bold text-slate-900">{currency2(profile.month_volume)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{profile.month_key}</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Last Profit Date</div>
          <div className="text-xs font-semibold text-slate-800">
            {profile.stats?.last_commission_at ? formatBdDateTime(profile.stats.last_commission_at, { showZone: true }) : 'Never'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Joined: {formatBdDateTime(profile.user?.created_at)}</div>
        </div>
      </div>

      {/* Profit Breakdown & Effective Rates Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['AI Trade Profit', profile.stats?.ai_trade_earned, `Rate: ${profile.effective_rates?.ai_trade?.direct || '—'} / L2 ${profile.effective_rates?.ai_trade?.sub || '—'}`],
          ['Forex / Manual', profile.stats?.manual_earned, `Rate: ${profile.effective_rates?.manual?.direct || '—'} / L2 ${profile.effective_rates?.manual?.sub || '—'}`],
          ['Binary Options', profile.stats?.binary_earned, `Rate: ${profile.effective_rates?.binary?.direct || '—'} / L2 ${profile.effective_rates?.binary?.sub || '—'}`],
          ['Monthly Bonus', profile.stats?.bonus_earned, `Target: ${currency2(profile.effective_rates?.monthly_bonus)}/mo`],
          ['Admin Credits', profile.stats?.manual_credit_earned, profile.has_custom_rates ? '★ Custom Rates Active' : 'Tier Default Rates'],
        ].map(([label, val, sub]) => (
          <div key={label} className="rounded-2xl border border-slate-100 bg-white p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
            <div className="font-bold text-slate-900 mt-0.5">{currency2(val)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1">
        <div className="flex gap-2">
          {[
            { key: 'overview', label: 'Controls & Custom Rates' },
            { key: 'ledger', label: `Profit Ledger (${ledger.total})` },
            { key: 'team', label: `Referral Team (${team.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                subTab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setCreditForm(p => ({ ...p, created_at: toBdDatetimeLocalValue(new Date()) }))
            setCreditModal(true)
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm"
        >
          + Add / Adjust IB Profit
        </button>
      </div>

      {/* Sub-tab: Overview Controls */}
      {subTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Card 1: IB Holder & Level Assignment */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">IB Holder &amp; Level Settings</div>
              {profile.has_custom_rates && (
                <span className="px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 text-[10px] font-bold">Custom % Active</span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">IB Holder Status</span>
                <select
                  value={profileForm.status}
                  onChange={e => setProfileForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  <option value="ACTIVE_IB">Official IB Holder (Active)</option>
                  <option value="PAUSED">Paused / Suspended</option>
                  <option value="STANDARD">Standard User (Not IB Holder)</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">IB Level / Rank</span>
                <select
                  value={profileForm.level}
                  disabled={profileForm.status === 'STANDARD'}
                  onChange={e => setProfileForm(p => ({ ...p, level: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
                >
                  {IB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">IB Assigned Date &amp; Time (BDT)</span>
                <input
                  type="datetime-local"
                  value={profileForm.assigned_at}
                  disabled={profileForm.status === 'STANDARD'}
                  onChange={e => setProfileForm(p => ({ ...p, assigned_at: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Referred By (User Email)</span>
                <input
                  type="email"
                  placeholder="Optional referrer email"
                  value={profileForm.referred_by_email}
                  onChange={e => setProfileForm(p => ({ ...p, referred_by_email: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={profileForm.level_locked}
                disabled={profileForm.status === 'STANDARD'}
                onChange={e => setProfileForm(p => ({ ...p, level_locked: e.target.checked }))}
              />
              <span>Lock IB Level (keep assigned level permanently regardless of monthly volume)</span>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Admin Note</span>
              <input
                type="text"
                placeholder="Internal note about this IB partner"
                value={profileForm.notes}
                onChange={e => setProfileForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              onClick={saveIBProfile}
              disabled={saving}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save IB Holder & Level'}
            </button>
          </div>

          {/* Card 2: Per-User Custom Percentage Ratios */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
            <div>
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Custom User Commission % Ratios</div>
              <p className="text-xs text-slate-500 mt-0.5">
                Leave any box empty to inherit the {profile.effective_level} tier default. Fill any box to set a custom rate just for this user.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">AI Trade Direct (%)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.ai_trade_direct_pct ?? 5}%`}
                  value={ratesForm.ai_trade_direct_pct}
                  onChange={e => setRatesForm(p => ({ ...p, ai_trade_direct_pct: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">AI Trade Sub-IB L2 (%)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.ai_trade_sub_pct ?? 0}%`}
                  value={ratesForm.ai_trade_sub_pct}
                  onChange={e => setRatesForm(p => ({ ...p, ai_trade_sub_pct: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>

              <label className="block space-y-1 col-span-2">
                <span className="text-[11px] font-semibold text-slate-500">Forex / Manual Mode</span>
                <select
                  value={ratesForm.manual_mode}
                  onChange={e => setRatesForm(p => ({ ...p, manual_mode: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                >
                  <option value="">Inherit Tier Default ({tierDef.manual_mode === 'percent' ? '% of margin' : '$ per lot'})</option>
                  <option value="per_lot">$ Fixed per Lot</option>
                  <option value="percent">% of Trade Margin</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Forex Direct Rate</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.manual_direct_rate ?? 2}`}
                  value={ratesForm.manual_direct_rate}
                  onChange={e => setRatesForm(p => ({ ...p, manual_direct_rate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Forex Sub-IB L2 Rate</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.manual_sub_rate ?? 0}`}
                  value={ratesForm.manual_sub_rate}
                  onChange={e => setRatesForm(p => ({ ...p, manual_sub_rate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Binary Direct (%)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.binary_direct_pct ?? 1}%`}
                  value={ratesForm.binary_direct_pct}
                  onChange={e => setRatesForm(p => ({ ...p, binary_direct_pct: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Binary Sub-IB L2 (%)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: ${tierDef.binary_sub_pct ?? 0}%`}
                  value={ratesForm.binary_sub_pct}
                  onChange={e => setRatesForm(p => ({ ...p, binary_sub_pct: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>

              <label className="block space-y-1 col-span-2">
                <span className="text-[11px] font-semibold text-slate-500">Custom Monthly Salary Bonus ($)</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Default: $${tierDef.monthly_bonus ?? 0}`}
                  value={ratesForm.monthly_bonus}
                  onChange={e => setRatesForm(p => ({ ...p, monthly_bonus: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => saveCustomRates(false)}
                disabled={saving}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm disabled:opacity-50"
              >
                Save Custom Ratios
              </button>
              <button
                onClick={() => saveCustomRates(true)}
                disabled={saving}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                Reset to Defaults
              </button>
            </div>
          </div>

          {/* Card 3: Monthly Volume & Bonus Editor */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Edit Month Volume &amp; Bonus ({profile.month_key})</div>
                <p className="text-xs text-slate-500">Directly update current month team volume and monthly bonus payout state.</p>
              </div>
              <button
                onClick={saveMetrics}
                disabled={saving}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs disabled:opacity-50"
              >
                Save Month Metrics
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Team Volume ($)</span>
                <input
                  type="number"
                  step="0.01"
                  value={metricsForm.team_volume}
                  onChange={e => setMetricsForm(p => ({ ...p, team_volume: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-slate-500">Bonus Amount ($)</span>
                <input
                  type="number"
                  step="0.01"
                  value={metricsForm.bonus_amount}
                  onChange={e => setMetricsForm(p => ({ ...p, bonus_amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metricsForm.bonus_paid}
                  onChange={e => setMetricsForm(p => ({ ...p, bonus_paid: e.target.checked }))}
                />
                <span>Monthly Bonus Marked Paid</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab: Ledger */}
      {subTab === 'ledger' && (
        <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Commission Ledger ({ledger.total} entries)</div>
            <div className="flex flex-wrap gap-1.5">
              {['ALL', 'AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS', 'MANUAL_CREDIT'].map(f => (
                <button
                  key={f}
                  onClick={() => setLedgerFilter(f)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                    ledgerFilter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {IB_ASSET_LABELS[f] || 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Date &amp; Time (BDT)</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Type</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Source User</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Base Amt</th>
                  <th className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider">Rate</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Profit</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Tier</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Note</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">No commission entries yet.</td></tr>
                ) : ledger.rows.map(row => (
                  <tr key={row.id} className="text-slate-700 hover:bg-slate-50 transition">
                    <td className="py-2.5 whitespace-nowrap text-slate-500 text-xs">{formatBdDateTime(row.created_at, { showZone: true }) || '—'}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 whitespace-nowrap">
                        {IB_ASSET_LABELS[row.asset_class] || row.asset_class}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs">{row.source_name || row.source_email || (row.source_user_id === 0 ? 'System' : `#${row.source_user_id}`)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{currency2(row.trade_amount)}</td>
                    <td className="py-2.5 text-center font-mono text-xs text-indigo-600">{row.rate_label || '—'}</td>
                    <td className={`py-2.5 text-right font-mono font-semibold whitespace-nowrap ${Number(row.commission_amount) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Number(row.commission_amount) >= 0 ? '+' : ''}{currency(row.commission_amount)}
                    </td>
                    <td className="py-2.5 text-xs capitalize whitespace-nowrap">{row.tier_level?.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 text-xs text-slate-500 max-w-[180px] truncate" title={row.note || ''}>{row.note || '—'}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingEntry({
                            ...row,
                            bd_datetime_local: toBdDatetimeLocalValue(row.created_at),
                            sync_balance: true,
                          })}
                          className="text-[11px] text-indigo-600 font-bold uppercase hover:text-indigo-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteLedgerEntry(row.id)}
                          className="text-[11px] text-rose-500 font-bold uppercase hover:text-rose-700"
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

      {/* Sub-tab: Team */}
      {subTab === 'team' && (
        <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Referral Team ({team.length} members)</div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="Attach user email as L1 referral"
                value={attachEmail}
                onChange={e => setAttachEmail(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 w-56"
              />
              <button
                onClick={attachReferral}
                disabled={saving || !attachEmail.trim()}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                + Attach
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Member</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Level</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Volume</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Commission</th>
                  <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Joined (BDT)</th>
                  <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {team.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">No referrals.</td></tr>
                ) : team.map(m => (
                  <tr key={`${m.tier}-${m.id}-${m.via_user_id || 0}`} className="text-slate-700 hover:bg-slate-50 transition">
                    <td className="py-2.5">
                      <div className="font-semibold">{m.name || m.email}</div>
                      <div className="text-xs text-slate-400 font-mono">{m.email}</div>
                    </td>
                    <td className="py-2.5 text-xs">
                      {m.tier === 'L2'
                        ? <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">L2 via {m.via_name || m.via_email}</span>
                        : <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">L1 Direct</span>}
                    </td>
                    <td className="py-2.5 text-right font-mono">{currency2(m.generated_volume)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">{currency2(m.generated_commission)}</td>
                    <td className="py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatBdDateTime(m.created_at, { showZone: true }) || '—'}</td>
                    <td className="py-2.5 text-right">
                      {m.tier !== 'L2' ? (
                        <button onClick={() => removeReferral(m.id)} className="text-[11px] text-rose-500 font-bold hover:text-rose-700">
                          Detach
                        </button>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Ledger Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Edit IB Profit Entry #{editingEntry.id}</h3>
            </div>
            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Profit / Commission ($)</span>
                  <input type="number" step="0.0001" value={editingEntry.commission_amount}
                    onChange={e => setEditingEntry(p => ({ ...p, commission_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Base Trade / Vol ($)</span>
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
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Tier</span>
                  <select value={editingEntry.tier_level} onChange={e => setEditingEntry(p => ({ ...p, tier_level: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <option value="direct">Direct (L1)</option>
                    <option value="sub_ib">Sub-IB (L2)</option>
                    <option value="bonus">Bonus</option>
                    <option value="admin_manual">Admin Manual</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Applied Rate Label</span>
                  <input type="text" value={editingEntry.rate_label || ''}
                    onChange={e => setEditingEntry(p => ({ ...p, rate_label: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Date &amp; Time (BDT)</span>
                  <input type="datetime-local" value={editingEntry.bd_datetime_local || ''}
                    onChange={e => setEditingEntry(p => ({ ...p, bd_datetime_local: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Details / Note</span>
                <input type="text" value={editingEntry.note || ''}
                  onChange={e => setEditingEntry(p => ({ ...p, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input type="checkbox" checked={editingEntry.sync_balance !== false}
                  onChange={e => setEditingEntry(p => ({ ...p, sync_balance: e.target.checked }))} />
                <span>Adjust user&apos;s Available Wallet Balance by commission difference</span>
              </label>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setEditingEntry(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={saveLedgerEntry} disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Adjust Profit Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Add / Adjust IB Profit — {profile.user?.name || profile.user?.email}</h3>
            </div>
            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Action</span>
                  <select value={creditForm.direction} onChange={e => setCreditForm(p => ({ ...p, direction: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <option value="add">+ Add Profit</option>
                    <option value="deduct">- Deduct Profit</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Profit Amount ($)</span>
                  <input type="number" step="0.01" value={creditForm.amount}
                    onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Stream</span>
                  <select value={creditForm.asset_class} onChange={e => setCreditForm(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    {Object.entries(IB_ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Tier</span>
                  <select value={creditForm.tier_level} onChange={e => setCreditForm(p => ({ ...p, tier_level: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <option value="admin_manual">Admin Manual</option>
                    <option value="direct">Direct (L1)</option>
                    <option value="sub_ib">Sub-IB (L2)</option>
                    <option value="bonus">Bonus</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Base Trade / Volume ($)</span>
                  <input type="number" step="0.01" placeholder="Optional" value={creditForm.trade_amount}
                    onChange={e => setCreditForm(p => ({ ...p, trade_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Rate Label</span>
                  <input type="text" value={creditForm.rate_label}
                    onChange={e => setCreditForm(p => ({ ...p, rate_label: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
                <label className="block space-y-1 col-span-2">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Date &amp; Time (BDT)</span>
                  <input type="datetime-local" value={creditForm.created_at}
                    onChange={e => setCreditForm(p => ({ ...p, created_at: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase text-slate-500">Note (optional)</span>
                <input type="text" value={creditForm.note}
                  onChange={e => setCreditForm(p => ({ ...p, note: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input type="checkbox" checked={creditForm.sync_balance}
                  onChange={e => setCreditForm(p => ({ ...p, sync_balance: e.target.checked }))} />
                <span>Also update user&apos;s Available Wallet Balance</span>
              </label>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setCreditModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={submitCredit} disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                {saving ? 'Saving…' : 'Apply IB Profit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
