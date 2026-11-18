import { useCallback, useEffect, useState } from 'react'
import { Gift, Plus, CheckCircle2, XCircle, Trash2, Edit3, Sparkles, Coins, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { formatBdDateTime } from '../../utils/bdTime'

const emptyForm = {
  title: '',
  subtitle: '',
  category: 'deposit_bonus',
  badge_text: 'HOT OFFER',
  bonus_type: 'percentage',
  bonus_value: '50',
  max_bonus_amount: '500',
  min_deposit: '50',
  promo_code: '',
  terms: '',
  max_claims_per_user: '1',
  auto_credit: false,
  featured: true,
  active: true,
  expires_at: ''
}

export default function AdminPromotionsPage() {
  const { token } = useAdminAuth()
  const [tab, setTab] = useState('claims')
  const [promotions, setPromotions] = useState([])
  const [claims, setClaims] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [reviewingClaim, setReviewingClaim] = useState(null)
  const [approveAmount, setApproveAmount] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [processingClaimId, setProcessingClaimId] = useState(null)

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/admin/promotions')
      setPromotions(Array.isArray(res.data?.promotions) ? res.data.promotions : [])
      setClaims(Array.isArray(res.data?.claims) ? res.data.claims : [])
      setSummary(res.data?.summary || {})
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load promotions.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  const notify = (text, isErr = false) => {
    if (isErr) {
      setErr(text)
      setMsg('')
    } else {
      setMsg(text)
      setErr('')
    }
    setTimeout(() => {
      setMsg('')
      setErr('')
    }, 5000)
  }

  const openCreateForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setTab('offers')
  }

  const openEditForm = (promo) => {
    setEditingId(promo.id)
    setForm({
      title: promo.title || '',
      subtitle: promo.subtitle || '',
      category: promo.category || 'deposit_bonus',
      badge_text: promo.badge_text || '',
      bonus_type: promo.bonus_type || 'percentage',
      bonus_value: String(promo.bonus_value ?? ''),
      max_bonus_amount: String(promo.max_bonus_amount ?? 0),
      min_deposit: String(promo.min_deposit ?? 0),
      promo_code: promo.promo_code || '',
      terms: promo.terms || '',
      max_claims_per_user: String(promo.max_claims_per_user ?? 1),
      auto_credit: promo.auto_credit === 1,
      featured: promo.featured === 1,
      active: promo.active === 1,
      expires_at: promo.expires_at ? String(promo.expires_at).slice(0, 16) : ''
    })
    setShowForm(true)
    setTab('offers')
  }

  const handleSaveOffer = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        bonus_value: Number(form.bonus_value || 0),
        max_bonus_amount: Number(form.max_bonus_amount || 0),
        min_deposit: Number(form.min_deposit || 0),
        max_claims_per_user: Number(form.max_claims_per_user || 1),
        expires_at: form.expires_at || null
      }
      if (editingId) {
        await api(token).put(`/api/admin/promotions/${editingId}`, payload)
        notify('Promotion updated successfully.')
      } else {
        await api(token).post('/api/admin/promotions', payload)
        notify('New promotion created successfully.')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to save promotion.', true)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (promo) => {
    try {
      await api(token).put(`/api/admin/promotions/${promo.id}`, { active: promo.active !== 1 })
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to toggle status.', true)
    }
  }

  const handleDeleteOffer = async (promo) => {
    if (!window.confirm(`Delete promotion "${promo.title}"? This will also remove its claims.`)) return
    try {
      await api(token).delete(`/api/admin/promotions/${promo.id}`)
      notify('Promotion deleted.')
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to delete promotion.', true)
    }
  }

  const handleApproveClaim = async () => {
    if (!reviewingClaim) return
    setProcessingClaimId(reviewingClaim.id)
    try {
      await api(token).post(`/api/admin/promotions/claims/${reviewingClaim.id}/approve`, {
        bonus_amount: approveAmount !== '' ? Number(approveAmount) : undefined,
        admin_note: approveNote || undefined
      })
      notify(`Credited +$${Number(approveAmount || reviewingClaim.bonus_amount || 0).toFixed(2)} bonus to user!`)
      setReviewingClaim(null)
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to credit bonus claim.', true)
    } finally {
      setProcessingClaimId(null)
    }
  }

  const handleRejectClaim = async (claim) => {
    const reason = window.prompt('Reason for declining this claim (optional):', 'Does not meet deposit or offer requirements.')
    if (reason === null) return
    setProcessingClaimId(claim.id)
    try {
      await api(token).post(`/api/admin/promotions/claims/${claim.id}/reject`, { admin_note: reason })
      notify('Claim declined.')
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to decline claim.', true)
    } finally {
      setProcessingClaimId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">Promotions &amp; Deposit Bonuses</h1>
          <p className="text-sm text-slate-500 mt-1">Create deposit bonuses, new-user rewards, promo codes, and approve user bonus credits.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Bonus / Offer</span>
        </button>
      </div>

      {msg && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{msg}</div>}
      {err && <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{err}</div>}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Active Offers</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.active_offers ?? 0} / {summary.total_offers ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Pending Claims</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{summary.pending_claims ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Awaiting Deposit</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{summary.activated_claims ?? 0}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500">Total Bonuses Credited</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">${Number(summary.total_credited_amount || 0).toFixed(2)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('claims')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            tab === 'claims' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          User Bonus Claims ({claims.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('offers')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            tab === 'offers' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Manage Offers &amp; Promos ({promotions.length})
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSaveOffer} className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Gift className="w-5 h-5 text-indigo-600" />
              <span>{editingId ? 'Edit Promotion / Bonus' : 'Create New Promotion / Bonus'}</span>
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Offer Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. 100% Weekend Deposit Bonus"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="deposit_bonus">Deposit Bonus</option>
                <option value="welcome_bonus">New User Bonus</option>
                <option value="promo_offer">Offer Promotion</option>
                <option value="cashback">Cashback Reward</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subtitle / Description</label>
              <input
                type="text"
                value={form.subtitle}
                onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                placeholder="Short summary shown on offer card"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Bonus Calculation Type</label>
              <select
                value={form.bonus_type}
                onChange={e => setForm(f => ({ ...f, bonus_type: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="percentage">Percentage of Deposit (%)</option>
                <option value="fixed">Fixed Dollar Bonus ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {form.bonus_type === 'fixed' ? 'Bonus Amount ($)' : 'Bonus Percentage (%)'} *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.bonus_value}
                onChange={e => setForm(f => ({ ...f, bonus_value: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Max Bonus Cap ($ — 0 for no cap)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.max_bonus_amount}
                onChange={e => setForm(f => ({ ...f, max_bonus_amount: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Minimum Deposit ($ — 0 if none)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.min_deposit}
                onChange={e => setForm(f => ({ ...f, min_deposit: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Promo Code (optional)</label>
              <input
                type="text"
                value={form.promo_code}
                onChange={e => setForm(f => ({ ...f, promo_code: e.target.value.toUpperCase() }))}
                placeholder="e.g. BONUS100"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Badge Text</label>
              <input
                type="text"
                value={form.badge_text}
                onChange={e => setForm(f => ({ ...f, badge_text: e.target.value }))}
                placeholder="HOT OFFER / NEW USER"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Max Claims Per User</label>
              <input
                type="number"
                min="1"
                value={form.max_claims_per_user}
                onChange={e => setForm(f => ({ ...f, max_claims_per_user: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Expires At (optional)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Terms &amp; Eligibility Notes</label>
              <textarea
                rows={2}
                value={form.terms}
                onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1 text-sm text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <span>Active (Visible to Users)</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />
              <span>Featured Offer</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.auto_credit} onChange={e => setForm(f => ({ ...f, auto_credit: e.target.checked }))} />
              <span>Auto-Credit Instantly on Qualifying Deposit</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Create Offer')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading promotions data...</span>
        </div>
      ) : tab === 'claims' ? (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Offer / Code</th>
                  <th className="px-4 py-3">Qualifying Deposit</th>
                  <th className="px-4 py-3">Bonus</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Claimed At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-400">No promotion claims yet.</td>
                  </tr>
                ) : claims.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{c.user_name || `User #${c.user_id}`}</div>
                      <div className="text-xs text-slate-500">{c.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.promo_title || `Offer #${c.promotion_id}`}</div>
                      {c.promo_code && <span className="text-[11px] font-mono text-indigo-600">{c.promo_code}</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">${Number(c.deposit_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-600">+${Number(c.bonus_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                        c.status === 'credited' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'activated' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatBdDateTime(c.claimed_at, { showZone: true }) || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(c.status === 'pending' || c.status === 'activated') && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={processingClaimId === c.id}
                            onClick={() => {
                              setReviewingClaim(c)
                              setApproveAmount(String(c.bonus_amount || (c.bonus_type === 'fixed' ? c.bonus_value : 25)))
                              setApproveNote(c.admin_note || '')
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve &amp; Credit</span>
                          </button>
                          <button
                            type="button"
                            disabled={processingClaimId === c.id}
                            onClick={() => handleRejectClaim(c)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {promotions.map(p => (
            <div key={p.id} className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.active === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {p.active === 1 ? 'Active' : 'Paused'}
                      </span>
                      {p.badge_text && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">
                          {p.badge_text}
                        </span>
                      )}
                      {p.auto_credit === 1 && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase">
                          Auto-Credit
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                  </div>
                  <div className="text-right font-mono font-bold text-emerald-600 text-base">
                    {p.bonus_type === 'fixed' ? `+$${p.bonus_value}` : `+${p.bonus_value}%`}
                  </div>
                </div>
                {p.subtitle && <p className="text-xs text-slate-600">{p.subtitle}</p>}
                <div className="grid grid-cols-3 gap-2 pt-2 text-xs text-slate-600">
                  <div><span className="text-slate-400 block text-[10px]">Code</span><strong className="font-mono">{p.promo_code || '—'}</strong></div>
                  <div><span className="text-slate-400 block text-[10px]">Min Dep</span><strong className="font-mono">${Number(p.min_deposit).toFixed(0)}</strong></div>
                  <div><span className="text-slate-400 block text-[10px]">Max Cap</span><strong className="font-mono">{Number(p.max_bonus_amount) > 0 ? `$${p.max_bonus_amount}` : 'None'}</strong></div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleToggleActive(p)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {p.active === 1 ? 'Pause Offer' : 'Activate Offer'}
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditForm(p)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOffer(p)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      {reviewingClaim && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>Approve &amp; Credit Bonus</span>
            </div>
            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 rounded-xl p-3">
              <div><strong>User:</strong> {reviewingClaim.user_email}</div>
              <div><strong>Offer:</strong> {reviewingClaim.promo_title}</div>
              <div><strong>Qualifying Deposit:</strong> ${Number(reviewingClaim.deposit_amount || 0).toFixed(2)}</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Bonus Amount to Credit ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={approveAmount}
                onChange={e => setApproveAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Admin Note (optional)</label>
              <input
                type="text"
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder="e.g. Credited first deposit welcome bonus"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReviewingClaim(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">Cancel</button>
              <button
                type="button"
                disabled={processingClaimId === reviewingClaim.id}
                onClick={handleApproveClaim}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                <Coins className="w-4 h-4" />
                <span>Credit Balance</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
