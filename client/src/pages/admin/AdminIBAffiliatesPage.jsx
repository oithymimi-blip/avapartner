import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'

const currency = (v = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(v) || 0)
const LEVELS = ['BRONZE', 'SILVER', 'GOLD']
const LEVEL_COLORS = { BRONZE: 'bg-amber-100 text-amber-700', SILVER: 'bg-slate-200 text-slate-700', GOLD: 'bg-yellow-100 text-yellow-700' }
const ASSET_LABELS = { AI_TRADE: 'AI Trade', MANUAL_TRADING: 'Manual', BINARY_OPTIONS: 'Binary', MONTHLY_BONUS: 'Bonus', MANUAL_CREDIT: 'Manual Credit' }

export default function AdminIBAffiliatesPage() {
  const { token } = useAdminAuth()
  const [overview, setOverview] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ledger, setLedger] = useState({ rows: [], total: 0 })
  const [team, setTeam] = useState([])
  const [tab, setTab] = useState('overview')
  const [detailLoading, setDetailLoading] = useState(false)
  // Edit states
  const [editingLevel, setEditingLevel] = useState(null)
  const [editingEntry, setEditingEntry] = useState(null)
  const [creditForm, setCreditForm] = useState({ amount: '', asset_class: 'MANUAL_CREDIT', note: '' })
  const [showCreditModal, setShowCreditModal] = useState(false)

  const loadOverview = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/ib/admin/overview')
      setOverview(res.data)
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadOverview() }, [token])

  const openUser = async (userId) => {
    setSelectedUserId(userId)
    setTab('overview')
    setDetailLoading(true)
    try {
      const [pRes, lRes, tRes] = await Promise.all([
        api(token).get(`/api/ib/admin/user/${userId}`),
        api(token).get(`/api/ib/admin/user/${userId}/ledger`),
        api(token).get(`/api/ib/admin/user/${userId}/team`)
      ])
      setProfile(pRes.data)
      setEditingLevel(pRes.data.level || 'BRONZE')
      setLedger(lRes.data)
      setTeam(tRes.data)
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed to load') }
    finally { setDetailLoading(false) }
  }

  const saveLevel = async () => {
    if (!editingLevel) return
    setDetailLoading(true)
    try {
      await api(token).put(`/api/ib/admin/user/${selectedUserId}/level`, { level: editingLevel })
      setMsg('Level updated')
      openUser(selectedUserId)
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed') }
    finally { setDetailLoading(false) }
  }

  const creditCommission = async () => {
    const amt = Number(creditForm.amount)
    if (!amt || amt <= 0) return setMsg('Enter valid amount')
    setDetailLoading(true)
    try {
      await api(token).post(`/api/ib/admin/user/${selectedUserId}/credit`, creditForm)
      setMsg(`Credited ${currency(amt)}`)
      setShowCreditModal(false)
      setCreditForm({ amount: '', asset_class: 'MANUAL_CREDIT', note: '' })
      openUser(selectedUserId)
      loadOverview()
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed') }
    finally { setDetailLoading(false) }
  }

  const saveLedgerEntry = async () => {
    if (!editingEntry) return
    setDetailLoading(true)
    try {
      await api(token).put(`/api/ib/admin/ledger/${editingEntry.id}`, {
        commission_amount: Number(editingEntry.commission_amount),
        trade_amount: Number(editingEntry.trade_amount),
        asset_class: editingEntry.asset_class,
      })
      setMsg('Entry updated')
      setEditingEntry(null)
      openUser(selectedUserId)
      loadOverview()
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed') }
    finally { setDetailLoading(false) }
  }

  const deleteLedgerEntry = async (entryId) => {
    if (!window.confirm('Delete this commission entry? Balance will be reversed.')) return
    setDetailLoading(true)
    try {
      await api(token).delete(`/api/ib/admin/ledger/${entryId}`)
      setMsg('Entry deleted & balance reversed')
      openUser(selectedUserId)
      loadOverview()
    } catch (e) { setMsg(e?.response?.data?.error || 'Failed') }
    finally { setDetailLoading(false) }
  }

  // ─── User Detail View ──────────────────────────────────────────────
  if (selectedUserId && profile) {
    const u = profile.user
    const lvl = profile.level || 'NONE'
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedUserId(null); setProfile(null) }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">IB / Affiliate Profile</div>
            <h1 className="text-2xl font-semibold text-slate-900">{u.name || u.email}</h1>
          </div>
        </div>

        {msg && <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">{msg}<button className="ml-2 font-bold" onClick={() => setMsg('')}>×</button></div>}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">IB Level</div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${LEVEL_COLORS[lvl] || 'bg-slate-100 text-slate-500'}`}>{lvl}</span>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Lifetime Earned</div>
            <div className="text-lg font-semibold text-emerald-600">{currency(profile.stats?.lifetime_earned)}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Commissions</div>
            <div className="text-lg font-semibold text-slate-900">{profile.stats?.total_commissions || 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Referrals</div>
            <div className="text-lg font-semibold text-slate-900">{profile.referral_count}</div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Month Volume</div>
            <div className="text-lg font-semibold text-slate-900">{currency(profile.month_volume)}</div>
          </div>
        </div>

        {/* Earnings Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['AI Trade', profile.stats?.ai_trade_earned], ['Manual', profile.stats?.manual_earned], ['Binary', profile.stats?.binary_earned], ['Bonus', profile.stats?.bonus_earned]].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{l}</div>
              <div className="font-semibold text-slate-800">{currency(v)}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200">
          {['overview', 'ledger', 'team'].map(t => (
            <button key={t} className={`px-4 py-2 text-sm font-semibold border-b-2 transition capitalize ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {/* Tab: Overview — Admin Controls */}
        {tab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Edit Level */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Edit IB Level / Rank</div>
              <div className="flex items-center gap-3">
                <select value={editingLevel || 'BRONZE'} onChange={e => setEditingLevel(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none">
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button onClick={saveLevel} disabled={detailLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50">
                  {detailLoading ? 'Saving…' : 'Save Level'}
                </button>
              </div>
              {profile.referred_by && (
                <div className="text-xs text-slate-500">Referred by: <span className="font-semibold text-slate-700">{profile.referred_by.name || profile.referred_by.email}</span></div>
              )}
            </div>

            {/* Manual Credit */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-soft p-5 space-y-4">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Manual Commission Credit</div>
              <button onClick={() => setShowCreditModal(true)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-md">
                + Credit Commission
              </button>
              <p className="text-xs text-slate-400">Add funds directly to user's commission balance. Will appear in ledger.</p>
            </div>
          </div>
        )}

        {/* Tab: Ledger */}
        {tab === 'ledger' && (
          <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-slate-800 uppercase tracking-wider">Commission Ledger ({ledger.total} entries)</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Date</th>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Type</th>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Source</th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Trade Amt</th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Commission</th>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Tier</th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.rows.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-400">No commission entries yet.</td></tr>
                  ) : ledger.rows.map(row => (
                    <tr key={row.id} className="text-slate-700 hover:bg-slate-50 transition group">
                      <td className="py-2.5 whitespace-nowrap text-slate-500 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="py-2.5"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{ASSET_LABELS[row.asset_class] || row.asset_class}</span></td>
                      <td className="py-2.5 text-xs">{row.source_name || row.source_email || '—'}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{currency(row.trade_amount)}</td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">{currency(row.commission_amount)}</td>
                      <td className="py-2.5 text-xs capitalize">{row.tier_level}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => setEditingEntry({ ...row })}
                            className="text-[10px] text-indigo-600 font-bold uppercase hover:text-indigo-800">Edit</button>
                          <button onClick={() => deleteLedgerEntry(row.id)}
                            className="text-[10px] text-rose-500 font-bold uppercase hover:text-rose-700">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Team */}
        {tab === 'team' && (
          <div className="rounded-2xl bg-white shadow-soft border border-slate-100 p-5">
            <div className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Referral Team ({team.length} members)</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Member</th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Volume</th>
                    <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Commission</th>
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {team.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-400">No referrals.</td></tr>
                  ) : team.map(m => (
                    <tr key={m.id} className="text-slate-700 hover:bg-slate-50 transition">
                      <td className="py-2.5"><div className="font-semibold">{m.name || m.email}</div><div className="text-xs text-slate-400 font-mono">{m.email}</div></td>
                      <td className="py-2.5 text-right font-mono">{currency(m.generated_volume)}</td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">{currency(m.generated_commission)}</td>
                      <td className="py-2.5 text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</td>
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
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Edit Ledger Entry #{editingEntry.id}</h3>
              </div>
              <div className="p-5 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commission Amount</span>
                  <input type="number" step="0.01" value={editingEntry.commission_amount}
                    onChange={e => setEditingEntry(p => ({ ...p, commission_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Trade Amount</span>
                  <input type="number" step="0.01" value={editingEntry.trade_amount}
                    onChange={e => setEditingEntry(p => ({ ...p, trade_amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Asset Class</span>
                  <select value={editingEntry.asset_class} onChange={e => setEditingEntry(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20">
                    {Object.entries(ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => setEditingEntry(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={saveLedgerEntry} disabled={detailLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                  {detailLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Credit Commission Modal */}
        {showCreditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900">Credit Commission to {u.name || u.email}</h3>
              </div>
              <div className="p-5 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Amount ($)</span>
                  <input type="number" step="0.01" value={creditForm.amount}
                    onChange={e => setCreditForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Category</span>
                  <select value={creditForm.asset_class} onChange={e => setCreditForm(p => ({ ...p, asset_class: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20">
                    {Object.entries(ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Note (optional)</span>
                  <input type="text" value={creditForm.note}
                    onChange={e => setCreditForm(p => ({ ...p, note: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </label>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => setShowCreditModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button onClick={creditCommission} disabled={detailLoading}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50">
                  {detailLoading ? 'Crediting…' : 'Credit Funds'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Overview List ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
        <h1 className="text-3xl font-semibold text-slate-900">IB & Affiliate Program</h1>
      </div>

      {msg && <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">{msg}<button className="ml-2 font-bold" onClick={() => setMsg('')}>×</button></div>}

      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5">
        <div className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">All IB Partners ({overview.length})</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Partner</th>
                <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Level</th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Lifetime Earned</th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Month Volume</th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Referrals</th>
                <th className="py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Loading…</td></tr>
              ) : overview.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No IB partners yet.</td></tr>
              ) : overview.map(u => (
                <tr key={u.user_id} className="text-slate-700 cursor-pointer hover:bg-slate-50 transition group" onClick={() => openUser(u.user_id)}>
                  <td className="py-3">
                    <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">{u.name || u.email}</div>
                    <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                  </td>
                  <td className="py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${LEVEL_COLORS[u.level] || 'bg-slate-100 text-slate-500'}`}>{u.level}</span></td>
                  <td className="py-3 text-right font-mono font-semibold text-emerald-600">{currency(u.lifetime_earned)}</td>
                  <td className="py-3 text-right font-mono">{currency(u.month_volume)}</td>
                  <td className="py-3 text-right font-mono">{u.referral_count}</td>
                  <td className="py-3 text-right">
                    <button className="text-xs text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider" onClick={e => { e.stopPropagation(); openUser(u.user_id) }}>Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
