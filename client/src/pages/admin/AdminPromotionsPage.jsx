import { useCallback, useEffect, useState } from 'react'
import {
  Gift,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit3,
  Sparkles,
  Coins,
  Loader2,
  Settings,
  Lock,
  Unlock,
  Wand2,
  Link2,
  Sliders,
  Megaphone,
  ShieldCheck
} from 'lucide-react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { formatBdDateTime } from '../../utils/bdTime'

const ADMIN_INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none'
const ADMIN_MONO_INPUT_CLS = `${ADMIN_INPUT_CLS} font-mono font-medium`
const ADMIN_LABEL_CLS = 'block text-xs font-semibold text-slate-700 mb-1.5'

const emptyForm = {
  title: '',
  subtitle: '',
  category: 'deposit_bonus',
  badge_text: 'HOT OFFER',
  bonus_type: 'percentage',
  bonus_value: '100',
  max_bonus_amount: '0',
  min_deposit: '50',
  promo_code: '',
  terms: '',
  max_claims_per_user: '2',
  total_global_limit: '0',
  sort_order: '0',
  apply_withdrawal_condition: true,
  profit_multiplier: '2',
  cashout_pct_per_milestone: '50',
  required_milestones: '2',
  allowed_sources: ['ai_trade', 'forex', 'binary'],
  auto_credit: true,
  featured: true,
  active: true,
  expires_at: ''
}

const SOURCE_OPTIONS = [
  { key: 'ai_trade', label: 'AI Trade' },
  { key: 'forex', label: 'Forex' },
  { key: 'binary', label: 'Binary' }
]

function makeRandomPromoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = 'AVA'
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export default function AdminPromotionsPage() {
  const { token } = useAdminAuth()
  const [tab, setTab] = useState('claims')
  const [promotions, setPromotions] = useState([])
  const [claims, setClaims] = useState([])
  const [locks, setLocks] = useState([])
  const [syncToOffers, setSyncToOffers] = useState(true)
  const [settings, setSettings] = useState({
    system_enabled: true,
    default_double_multiplier: 2,
    default_cashout_pct: 50,
    default_required_milestones: 2,
    allowed_profit_sources: ['ai_trade', 'forex', 'binary'],
    enforce_withdrawal_conditions: true,
    auto_match_deposit_bonus: true,
    bonus_payout_mode: 'automatic',
    page_headline: '',
    page_subheadline: '',
    withdrawal_rule_summary: ''
  })
  const [summary, setSummary] = useState({})
  const [usersSummary, setUsersSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copiedId, setCopiedId] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const [reviewingClaim, setReviewingClaim] = useState(null)
  const [approveAmount, setApproveAmount] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [processingClaimId, setProcessingClaimId] = useState(null)

  const [showGrantModal, setShowGrantModal] = useState(false)
  const [granting, setGranting] = useState(false)
  const [grantForm, setGrantForm] = useState({
    user_id: '',
    promotion_id: '',
    deposit_amount: '',
    bonus_amount: '',
    apply_withdrawal_condition: true,
    admin_note: ''
  })

  const [editingLock, setEditingLock] = useState(null)
  const [lockForm, setLockForm] = useState({})
  const [savingLock, setSavingLock] = useState(false)

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await api(token).get('/api/admin/promotions')
      setPromotions(Array.isArray(res.data?.promotions) ? res.data.promotions : [])
      setClaims(Array.isArray(res.data?.claims) ? res.data.claims : [])
      setLocks(Array.isArray(res.data?.locks) ? res.data.locks : [])
      setUsersSummary(Array.isArray(res.data?.users_summary) ? res.data.users_summary : [])
      if (res.data?.settings) setSettings(s => ({ ...s, ...res.data.settings }))
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

  const copyMarketingLink = async (code, key) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${origin}/promotions?code=${encodeURIComponent(code)}`
    try {
      await navigator.clipboard.writeText(url)
    } catch (_) {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (e) {}
      document.body.removeChild(ta)
    }
    setCopiedId(key)
    setTimeout(() => setCopiedId(''), 2000)
    notify(`Copied shareable marketing link for ${code}: ${url}`)
  }

  const openCreateForm = () => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      profit_multiplier: String(settings.default_double_multiplier || 2),
      cashout_pct_per_milestone: String(settings.default_cashout_pct || 50),
      required_milestones: String(settings.default_required_milestones || 2),
      allowed_sources: Array.isArray(settings.allowed_profit_sources) && settings.allowed_profit_sources.length
        ? settings.allowed_profit_sources
        : ['ai_trade', 'forex', 'binary']
    })
    setShowForm(true)
    setTab('offers')
  }

  const openEditForm = (promo) => {
    setEditingId(promo.id)
    const srcArr = String(promo.allowed_sources || 'ai_trade,forex,binary')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
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
      total_global_limit: String(promo.total_global_limit ?? 0),
      sort_order: String(promo.sort_order ?? 0),
      apply_withdrawal_condition: promo.apply_withdrawal_condition !== 0,
      profit_multiplier: String(promo.profit_multiplier ?? 2),
      cashout_pct_per_milestone: String(promo.cashout_pct_per_milestone ?? 50),
      required_milestones: String(promo.required_milestones ?? 2),
      allowed_sources: srcArr.length ? srcArr : ['ai_trade', 'forex', 'binary'],
      auto_credit: promo.auto_credit === 1,
      featured: promo.featured === 1,
      active: promo.active === 1,
      expires_at: promo.expires_at ? String(promo.expires_at).slice(0, 16) : ''
    })
    setShowForm(true)
    setTab('offers')
  }

  const toggleFormSource = (srcKey) => {
    setForm(f => {
      const has = f.allowed_sources.includes(srcKey)
      const next = has ? f.allowed_sources.filter(x => x !== srcKey) : [...f.allowed_sources, srcKey]
      return { ...f, allowed_sources: next.length ? next : [srcKey] }
    })
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
        total_global_limit: Number(form.total_global_limit || 0),
        sort_order: Number(form.sort_order || 0),
        profit_multiplier: Number(form.profit_multiplier || 2),
        cashout_pct_per_milestone: Number(form.cashout_pct_per_milestone || 50),
        required_milestones: Number(form.required_milestones || 2),
        allowed_sources: form.allowed_sources,
        expires_at: form.expires_at || null
      }
      if (editingId) {
        await api(token).put(`/api/admin/promotions/${editingId}`, payload)
        notify('Promotion updated successfully — Deposit Bonus Calculator & offers updated live.')
      } else {
        await api(token).post('/api/admin/promotions', payload)
        notify('New promotion created and published live.')
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

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await api(token).put('/api/admin/promotions/settings', {
        ...settings,
        sync_to_offers: syncToOffers
      })
      if (res.data?.settings) setSettings(res.data.settings)
      await loadData()
      notify(
        syncToOffers
          ? 'Global rules saved & synced across all bonus offers and calculators!'
          : 'Global system & automation rules saved!'
      )
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to save system settings.', true)
    } finally {
      setSavingSettings(false)
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

  const getSuggestedDepositForUser = (user) => {
    if (!user) return 0
    const unused = Number(user.unused_deposit_amount || 0)
    if (unused > 0) return unused
    return Number(user.total_deposited || 0)
  }

  const openGrantModal = () => {
    const firstUser = usersSummary.find(u => Number(u.unused_deposit_amount || 0) > 0) || usersSummary[0]
    const defaultOffer = promotions.find(p => p.active === 1 && p.category === 'deposit_bonus') || promotions[0]
    const dep = getSuggestedDepositForUser(firstUser)
    setGrantForm({
      user_id: firstUser ? String(firstUser.id) : '',
      promotion_id: defaultOffer ? String(defaultOffer.id) : '',
      deposit_amount: dep > 0 ? String(Number(dep.toFixed(2))) : '0',
      bonus_amount: dep > 0 ? String(Number(dep.toFixed(2))) : '',
      apply_withdrawal_condition: true,
      admin_note: ''
    })
    setShowGrantModal(true)
  }

  const handleSelectGrantUser = (userId) => {
    const u = usersSummary.find(item => String(item.id) === String(userId))
    const dep = getSuggestedDepositForUser(u)
    setGrantForm(f => ({
      ...f,
      user_id: userId,
      deposit_amount: dep > 0 ? String(Number(dep.toFixed(2))) : '0',
      bonus_amount: dep > 0 ? String(Number(dep.toFixed(2))) : f.bonus_amount
    }))
  }

  const handleGrantManual = async (e) => {
    e.preventDefault()
    if (!grantForm.user_id) return notify('Select a user first.', true)
    if (!(Number(grantForm.bonus_amount) > 0)) return notify('Enter a bonus amount greater than $0.', true)
    setGranting(true)
    try {
      await api(token).post('/api/admin/promotions/grant-manual', {
        user_id: Number(grantForm.user_id),
        promotion_id: grantForm.promotion_id ? Number(grantForm.promotion_id) : undefined,
        deposit_amount: Number(grantForm.deposit_amount || 0),
        bonus_amount: Number(grantForm.bonus_amount),
        apply_withdrawal_condition: Boolean(grantForm.apply_withdrawal_condition),
        admin_note: grantForm.admin_note || undefined
      })
      notify(`Manually credited +$${Number(grantForm.bonus_amount).toFixed(2)} to user's main balance!`)
      setShowGrantModal(false)
      await loadData()
    } catch (errRes) {
      notify(errRes?.response?.data?.error || 'Failed to credit manual bonus.', true)
    } finally {
      setGranting(false)
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

  const openEditLock = (lock) => {
    setEditingLock(lock)
    setLockForm({
      milestone_base_balance: String(lock.milestone_base_balance ?? 0),
      profit_multiplier: String(lock.profit_multiplier ?? 2),
      cashout_pct: String(lock.cashout_pct ?? 50),
      required_milestones: String(lock.required_milestones ?? 2),
      milestones_completed: String(lock.milestones_completed ?? 0),
      manual_profit_offset: String(lock.manual_profit_offset ?? 0),
      status: lock.status || 'active',
      allowed_sources: String(lock.allowed_sources || 'ai_trade,forex,binary').split(',').map(s => s.trim()).filter(Boolean)
    })
  }

  const handleSaveLock = async (e) => {
    e.preventDefault()
    if (!editingLock) return
    setSavingLock(true)
    try {
      await api(token).put(`/api/admin/promotions/locks/${editingLock.id}`, {
        milestone_base_balance: Number(lockForm.milestone_base_balance),
        profit_multiplier: Number(lockForm.profit_multiplier),
        cashout_pct: Number(lockForm.cashout_pct),
        required_milestones: Number(lockForm.required_milestones),
        milestones_completed: Number(lockForm.milestones_completed),
        manual_profit_offset: Number(lockForm.manual_profit_offset),
        status: lockForm.status,
        allowed_sources: lockForm.allowed_sources
      })
      notify('User bonus lock & milestone progress updated.')
      setEditingLock(null)
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to update bonus lock.', true)
    } finally {
      setSavingLock(false)
    }
  }

  const handleCompleteLock = async (lock) => {
    if (!window.confirm(`Unlock full withdrawal immediately for ${lock.user_email || `User #${lock.user_id}`}?`)) return
    try {
      await api(token).post(`/api/admin/promotions/locks/${lock.id}/complete`)
      notify('Full withdrawal unlocked for user!')
      await loadData()
    } catch (e) {
      notify(e?.response?.data?.error || 'Failed to complete bonus lock.', true)
    }
  }

  const previewMult = Math.max(1.01, Number(settings.default_double_multiplier || 2))
  const previewPct = Math.min(100, Math.max(1, Number(settings.default_cashout_pct || 50)))
  const previewMiles = Math.max(1, Number(settings.default_required_milestones || 2))
  const previewTarget = 10000 * previewMult
  const previewCashout = previewTarget * (previewPct / 100)

  return (
    <div style={{ colorScheme: 'light' }} className="space-y-6 text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">Promotions, Deposit Bonus &amp; Cashout Automation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure bonus ratios, profit-double cashout conditions, marketing promo codes, and automated bonus locks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openGrantModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition"
          >
            <Coins className="w-4 h-4" />
            <span>Grant 2x / Manual Bonus</span>
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Bonus / Promo Code</span>
          </button>
        </div>
      </div>

      {msg && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 font-medium">{err}</div>}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          <div className="text-xs text-slate-500">Active Bonus Locks</div>
          <div className="text-2xl font-bold text-sky-600 mt-1">{summary.active_locks ?? 0}</div>
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
            tab === 'claims' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          User Bonus Claims ({claims.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('offers')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            tab === 'offers' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Offers &amp; Promo Codes ({promotions.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('locks')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            tab === 'locks' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          User Bonus Locks &amp; Milestones ({locks.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
            tab === 'settings' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>System Rules &amp; Automation</span>
        </button>
      </div>

      {/* Create / Edit Offer Form */}
      {showForm && (
        <form onSubmit={handleSaveOffer} className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <Gift className="w-5 h-5" />
              </span>
              <span>{editingId ? 'Edit Promotion / Bonus Offer' : 'Create New Promotion / Bonus Offer'}</span>
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition">
              Close
            </button>
          </div>

          <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Megaphone className="w-4 h-4 text-indigo-500" />
              <span>Offer Details &amp; Bonus Ratios</span>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className={ADMIN_LABEL_CLS}>Offer Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. 100% Deposit Welcome Bonus"
                  className={ADMIN_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="deposit_bonus">Deposit Bonus</option>
                  <option value="welcome_bonus">New User Bonus</option>
                  <option value="promo_offer">Offer Promotion</option>
                  <option value="cashback">Cashback Reward</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={ADMIN_LABEL_CLS}>Subtitle / Marketing Hook</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="Short summary shown on offer card"
                  className={ADMIN_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Bonus Calculation Type</label>
                <select
                  value={form.bonus_type}
                  onChange={e => setForm(f => ({ ...f, bonus_type: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="percentage">Percentage of Deposit (%)</option>
                  <option value="fixed">Fixed Dollar Bonus ($)</option>
                </select>
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>
                  {form.bonus_type === 'fixed' ? 'Bonus Amount ($)' : 'Bonus Ratio Percentage (%)'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.bonus_value}
                  onChange={e => setForm(f => ({ ...f, bonus_value: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Max Bonus Cap ($ — 0 for Unlimited / No Cap)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.max_bonus_amount}
                  onChange={e => setForm(f => ({ ...f, max_bonus_amount: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Minimum Deposit ($ — 0 if no deposit needed)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={form.min_deposit}
                  onChange={e => setForm(f => ({ ...f, min_deposit: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Redeemable Promo Code (for marketing anywhere)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.promo_code}
                    onChange={e => setForm(f => ({ ...f, promo_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. WELCOME100"
                    className={`${ADMIN_MONO_INPUT_CLS} uppercase`}
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, promo_code: makeRandomPromoCode() }))}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-sm transition"
                    title="Generate random promo code"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Badge Label</label>
                <input
                  type="text"
                  value={form.badge_text}
                  onChange={e => setForm(f => ({ ...f, badge_text: e.target.value }))}
                  placeholder="100% BONUS / NEW USER"
                  className={ADMIN_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Max Claims Per User Account</label>
                <input
                  type="number"
                  min="1"
                  value={form.max_claims_per_user}
                  onChange={e => setForm(f => ({ ...f, max_claims_per_user: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Global Campaign Cap (0 = unlimited)</label>
                <input
                  type="number"
                  min="0"
                  value={form.total_global_limit}
                  onChange={e => setForm(f => ({ ...f, total_global_limit: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Sort Order (lower shows first)</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Expires At (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                />
              </div>
              <div className="md:col-span-2">
                <label className={ADMIN_LABEL_CLS}>Terms &amp; Eligibility Notes</label>
                <textarea
                  rows={2}
                  value={form.terms}
                  onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                />
              </div>
            </div>
          </div>

          {/* Per-Offer Cashout & Withdrawal Rule Controls */}
          <div className="rounded-2xl bg-amber-50/60 border border-amber-200/80 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Cashout &amp; Withdrawal Conditions for This Bonus</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-amber-200">
                <input
                  type="checkbox"
                  className="accent-indigo-600 w-4 h-4"
                  checked={form.apply_withdrawal_condition}
                  onChange={e => setForm(f => ({ ...f, apply_withdrawal_condition: e.target.checked }))}
                />
                <span>Enforce Profit-Double &amp; Milestone Cashout Rule</span>
              </label>
            </div>

            {form.apply_withdrawal_condition && (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className={ADMIN_LABEL_CLS}>Profit Multiplier (2 = Double)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.1"
                    value={form.profit_multiplier}
                    onChange={e => setForm(f => ({ ...f, profit_multiplier: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={ADMIN_LABEL_CLS}>Cashout % Per Milestone</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={form.cashout_pct_per_milestone}
                    onChange={e => setForm(f => ({ ...f, cashout_pct_per_milestone: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={ADMIN_LABEL_CLS}>Required Milestones (Times)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={form.required_milestones}
                    onChange={e => setForm(f => ({ ...f, required_milestones: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
                <div className="md:col-span-3 flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-800 bg-white rounded-xl border border-amber-200/70 px-3.5 py-2.5">
                  <span className="font-semibold">Required Profit Sources:</span>
                  {SOURCE_OPTIONS.map(s => (
                    <label key={s.key} className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        className="accent-indigo-600 w-4 h-4"
                        checked={form.allowed_sources.includes(s.key)}
                        onChange={() => toggleFormSource(s.key)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm text-slate-700">
            <label className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-100/70">
              <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <span className="font-medium text-slate-800">Active (Visible to Users)</span>
            </label>
            <label className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-100/70">
              <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />
              <span className="font-medium text-slate-800">Featured Offer</span>
            </label>
            <label className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-slate-100/70">
              <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={form.auto_credit} onChange={e => setForm(f => ({ ...f, auto_credit: e.target.checked }))} />
              <span className="font-medium text-slate-800">Auto-Credit on Deposit</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50">
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
                ) : claims.map(c => {
                  const claimDeposit = Number(c.deposit_amount || 0)
                  const minDepositReq = Number(c.min_deposit || 0)
                  const missingDeposit = minDepositReq > 0 && claimDeposit < minDepositReq
                  const totalDeposited = Number(c.user_total_deposited || 0)
                  const depositCount = Number(c.user_deposit_count || 0)
                  const latestDeposit = Number(c.user_latest_deposit || 0)
                  return (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{c.user_name || `User #${c.user_id}`}</div>
                      <div className="text-xs text-slate-500">{c.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.promo_title || `Offer #${c.promotion_id}`}</div>
                      {c.promo_code && <span className="text-[11px] font-mono text-indigo-600">{c.promo_code}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`font-mono font-semibold ${missingDeposit ? 'text-rose-600' : 'text-slate-800'}`}>
                        ${claimDeposit.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Total Dep: ${totalDeposited.toFixed(2)} ({depositCount})
                      </div>
                      {latestDeposit > 0 && (
                        <div className="text-[11px] text-slate-400 font-mono">
                          Latest: ${latestDeposit.toFixed(2)}
                        </div>
                      )}
                    </td>
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
                          {missingDeposit ? (
                            <span className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-semibold">
                              No Qualifying Deposit (${minDepositReq.toFixed(0)}+)
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={processingClaimId === c.id}
                              onClick={() => {
                                setReviewingClaim(c)
                                setApproveAmount(String(c.bonus_amount || 0))
                                setApproveNote(c.admin_note || '')
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve &amp; Credit</span>
                            </button>
                          )}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'offers' ? (
        <div className="grid md:grid-cols-2 gap-4">
          {promotions.map(p => (
            <div key={p.id} className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
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
                <div className="grid grid-cols-4 gap-2 pt-2 text-xs text-slate-600">
                  <div><span className="text-slate-400 block text-[10px]">Code</span><strong className="font-mono">{p.promo_code || '—'}</strong></div>
                  <div><span className="text-slate-400 block text-[10px]">Max Cap</span><strong className="font-mono">{Number(p.max_bonus_amount) > 0 ? `$${Number(p.max_bonus_amount).toLocaleString()}` : 'No Cap'}</strong></div>
                  <div><span className="text-slate-400 block text-[10px]">Per User</span><strong className="font-mono">{p.max_claims_per_user}x</strong></div>
                  <div><span className="text-slate-400 block text-[10px]">Claims</span><strong className="font-mono">{p.total_claims_count || 0}{p.total_global_limit > 0 ? `/${p.total_global_limit}` : ''}</strong></div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
                  <strong>Cashout Rule:</strong>{' '}
                  {p.apply_withdrawal_condition !== 0
                    ? `${p.profit_multiplier || 2}x balance via ${(p.allowed_sources || 'ai_trade,forex,binary').replace(/,/g, ', ')} → ${p.cashout_pct_per_milestone || 50}% × ${p.required_milestones || 2} times`
                    : 'No withdrawal lock (instant withdrawable)'}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(p)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {p.active === 1 ? 'Pause' : 'Activate'}
                  </button>
                  {p.promo_code && (
                    <button
                      type="button"
                      onClick={() => copyMarketingLink(p.promo_code, p.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800"
                      title="Copy marketing share link"
                    >
                      {copiedId === p.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                      <span>Share Link</span>
                    </button>
                  )}
                </div>
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
      ) : tab === 'locks' ? (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Bonus Offer</th>
                  <th className="px-4 py-3">Base → Target</th>
                  <th className="px-4 py-3">Trading Profit</th>
                  <th className="px-4 py-3">Milestones</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locks.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-400">No active or completed bonus locks yet.</td>
                  </tr>
                ) : locks.map(l => {
                  const live = l.live_status
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{l.user_name || `User #${l.user_id}`}</div>
                        <div className="text-xs text-slate-500">{l.user_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{l.promo_title || 'Deposit Bonus'}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          Dep: ${Number(l.deposit_amount).toFixed(0)} + Bon: ${Number(l.bonus_amount).toFixed(0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        ${Number(l.milestone_base_balance).toFixed(2)} →{' '}
                        <strong className="text-slate-900">${(Number(l.milestone_base_balance) * Number(l.profit_multiplier)).toFixed(2)}</strong>
                        <div className="text-[10px] text-slate-400">{l.profit_multiplier}x / {l.cashout_pct}% cashout</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {live ? (
                          <div>
                            <strong className={live.milestoneUnlocked ? 'text-emerald-600' : 'text-amber-600'}>
                              ${live.profitEarned.toFixed(2)} / ${live.profitNeeded.toFixed(2)}
                            </strong>
                            <div className="text-[10px] text-slate-400">
                              AI: ${live.breakdown.ai_trade.toFixed(0)} • FX: ${live.breakdown.forex.toFixed(0)} • Bin: ${live.breakdown.binary.toFixed(0)}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {l.milestones_completed} / {l.required_milestones}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                          l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          l.status === 'active' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditLock(l)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          {l.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleCompleteLock(l)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Unlock Full</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Global System & Automation Tab */
        <form onSubmit={handleSaveSettings} className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Global Bonus Rules &amp; Automation Control</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Edit default bonus multipliers, cashout percentages, qualifying trading sources, and marketing copy anytime.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold shrink-0">
              <ShieldCheck className="w-4 h-4" />
              <span>Real-Time Automation</span>
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-100/70 transition">
              <input
                type="checkbox"
                checked={Boolean(settings.system_enabled)}
                onChange={e => setSettings(s => ({ ...s, system_enabled: e.target.checked }))}
                className="mt-1 w-4 h-4 accent-indigo-600"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">Promotions System Active</div>
                <div className="text-xs text-slate-500 mt-0.5">Master switch to show or pause all user bonus offers.</div>
              </div>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-100/70 transition">
              <input
                type="checkbox"
                checked={Boolean(settings.enforce_withdrawal_conditions)}
                onChange={e => setSettings(s => ({ ...s, enforce_withdrawal_conditions: e.target.checked }))}
                className="mt-1 w-4 h-4 accent-indigo-600"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">Enforce Cashout Conditions</div>
                <div className="text-xs text-slate-500 mt-0.5">Enforce profit-double &amp; milestone cashout locks on active bonus balances.</div>
              </div>
            </label>

            <label className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-start gap-3 cursor-pointer hover:bg-slate-100/70 transition">
              <input
                type="checkbox"
                checked={Boolean(settings.auto_match_deposit_bonus)}
                onChange={e => setSettings(s => ({ ...s, auto_match_deposit_bonus: e.target.checked }))}
                className="mt-1 w-4 h-4 accent-indigo-600"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">Auto-Apply Deposit Bonus</div>
                <div className="text-xs text-slate-500 mt-0.5">Automatically match &amp; run qualifying deposit bonuses whenever a user deposits.</div>
              </div>
            </label>
          </div>

          {/* Deposit Bonus Payout Mode (Automatic vs Manual) */}
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-900">Deposit Bonus Payout Mode</div>
                <div className="text-xs text-slate-600">
                  Choose whether qualifying deposit bonuses credit instantly &amp; automatically into user main balance, or wait for manual Admin approval.
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold uppercase">
                Current: {settings.bonus_payout_mode || 'automatic'}
              </span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                {
                  key: 'automatic',
                  title: 'Automatic Instant Credit',
                  desc: 'Instantly credits calculated bonus (e.g. 100% / 2x total) into main balance right after deposit approval.'
                },
                {
                  key: 'manual',
                  title: 'Manual Admin Approval',
                  desc: 'Deposit creates a Pending claim showing the user deposit amount; Admin reviews and credits manually.'
                },
                {
                  key: 'per_offer',
                  title: 'Per-Offer Setting',
                  desc: 'Follows each individual offer Auto-Credit toggle.'
                }
              ].map(mode => {
                const active = (settings.bonus_payout_mode || 'automatic') === mode.key
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, bonus_payout_mode: mode.key }))}
                    className={`text-left rounded-2xl border p-3.5 transition ${
                      active
                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 bg-white/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">{mode.title}</span>
                      <span className={`w-3.5 h-3.5 rounded-full border-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`} />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{mode.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className={ADMIN_LABEL_CLS}>Default Profit Multiplier (2 = Double)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.1"
                  value={settings.default_double_multiplier}
                  onChange={e => setSettings(s => ({ ...s, default_double_multiplier: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Default Cashout % Per Milestone</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={settings.default_cashout_pct}
                  onChange={e => setSettings(s => ({ ...s, default_cashout_pct: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Default Required Milestones (Times)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={settings.default_required_milestones}
                  onChange={e => setSettings(s => ({ ...s, default_required_milestones: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Qualifying Profit Sources:</span>
                {SOURCE_OPTIONS.map(src => {
                  const arr = Array.isArray(settings.allowed_profit_sources) ? settings.allowed_profit_sources : []
                  const checked = arr.includes(src.key)
                  return (
                    <label key={src.key} className="inline-flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? arr.filter(x => x !== src.key) : [...arr, src.key]
                          setSettings(s => ({ ...s, allowed_profit_sources: next.length ? next : [src.key] }))
                        }}
                      />
                      <span>{src.label}</span>
                    </label>
                  )
                })}
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-indigo-600"
                  checked={syncToOffers}
                  onChange={e => setSyncToOffers(e.target.checked)}
                />
                <span>Sync ratios to all existing offers on save</span>
              </label>
            </div>

            {/* Live Calculation Preview */}
            <div className="rounded-xl bg-indigo-50/80 border border-indigo-200 px-4 py-3 text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Live Formula Preview ($5,000 Deposit + 100% Bonus):</strong>{' '}
                Start <strong className="font-mono">$10,000</strong> → Target ({previewMult}x){' '}
                <strong className="font-mono">${previewTarget.toLocaleString()}</strong> → Eligible Cashout ({previewPct}%){' '}
                <strong className="font-mono">${previewCashout.toLocaleString()}</strong> ×{' '}
                <strong>{previewMiles}</strong> times before full unlock
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">User Promotions Page Content</div>
            <div>
              <label className={ADMIN_LABEL_CLS}>Promotions Page Headline</label>
              <input
                type="text"
                value={settings.page_headline}
                onChange={e => setSettings(s => ({ ...s, page_headline: e.target.value }))}
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div>
              <label className={ADMIN_LABEL_CLS}>Promotions Page Subheadline</label>
              <textarea
                rows={2}
                value={settings.page_subheadline}
                onChange={e => setSettings(s => ({ ...s, page_subheadline: e.target.value }))}
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div>
              <label className={ADMIN_LABEL_CLS}>Withdrawal Condition Rule Explanation (shown to users)</label>
              <textarea
                rows={3}
                value={settings.withdrawal_rule_summary}
                onChange={e => setSettings(s => ({ ...s, withdrawal_rule_summary: e.target.value }))}
                className={ADMIN_INPUT_CLS}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm disabled:opacity-50 transition"
            >
              {savingSettings ? 'Saving Settings...' : 'Save Global System & Automation Rules'}
            </button>
          </div>
        </form>
      )}

      {/* Approve Claim Modal */}
      {reviewingClaim && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div style={{ colorScheme: 'light' }} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>Approve &amp; Credit Bonus</span>
            </div>
            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div><strong>User:</strong> {reviewingClaim.user_email}</div>
              <div><strong>Offer:</strong> {reviewingClaim.promo_title}</div>
              <div><strong>Qualifying Claim Deposit:</strong> ${Number(reviewingClaim.deposit_amount || 0).toFixed(2)}</div>
              <div>
                <strong>Account Total Deposited:</strong> ${Number(reviewingClaim.user_total_deposited || 0).toFixed(2)} ({Number(reviewingClaim.user_deposit_count || 0)} deposits)
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Bonus Amount to Credit ($)</label>
                {Number(reviewingClaim.deposit_amount || 0) > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setApproveAmount(String(Number(reviewingClaim.deposit_amount).toFixed(2)))}
                      className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold"
                    >
                      100% Match (= 2x Total)
                    </button>
                    <button
                      type="button"
                      onClick={() => setApproveAmount(String((Number(reviewingClaim.deposit_amount) * 2).toFixed(2)))}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold"
                    >
                      2x Deposit
                    </button>
                  </div>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={approveAmount}
                onChange={e => setApproveAmount(e.target.value)}
                className={ADMIN_MONO_INPUT_CLS}
              />
            </div>
            <div>
              <label className={ADMIN_LABEL_CLS}>Admin Note (optional)</label>
              <input
                type="text"
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                placeholder="e.g. Credited first deposit welcome bonus"
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReviewingClaim(null)} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700">Cancel</button>
              <button
                type="button"
                disabled={processingClaimId === reviewingClaim.id}
                onClick={handleApproveClaim}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                <Coins className="w-4 h-4" />
                <span>Credit Balance &amp; Apply Lock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lock Modal */}
      {editingLock && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form style={{ colorScheme: 'light' }} onSubmit={handleSaveLock} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Lock className="w-5 h-5 text-indigo-600" />
                <span>Edit User Bonus Lock &amp; Milestones</span>
              </div>
              <button type="button" onClick={() => setEditingLock(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Close</button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <strong>User:</strong> {editingLock.user_email} • <strong>Offer:</strong> {editingLock.promo_title}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ADMIN_LABEL_CLS}>Milestone Base Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={lockForm.milestone_base_balance}
                  onChange={e => setLockForm(f => ({ ...f, milestone_base_balance: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Profit Multiplier (e.g. 2)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.1"
                  value={lockForm.profit_multiplier}
                  onChange={e => setLockForm(f => ({ ...f, profit_multiplier: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Cashout % Per Milestone</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={lockForm.cashout_pct}
                  onChange={e => setLockForm(f => ({ ...f, cashout_pct: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Completed / Required</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={lockForm.milestones_completed}
                    onChange={e => setLockForm(f => ({ ...f, milestones_completed: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                  <input
                    type="number"
                    min="1"
                    value={lockForm.required_milestones}
                    onChange={e => setLockForm(f => ({ ...f, required_milestones: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Manual Profit Credit Offset ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={lockForm.manual_profit_offset}
                  onChange={e => setLockForm(f => ({ ...f, manual_profit_offset: e.target.value }))}
                  className={ADMIN_MONO_INPUT_CLS}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Lock Status</label>
                <select
                  value={lockForm.status}
                  onChange={e => setLockForm(f => ({ ...f, status: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="active">Active (Enforced)</option>
                  <option value="completed">Completed (Full Withdrawal)</option>
                  <option value="cancelled">Cancelled (Unlocked)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setEditingLock(null)} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={savingLock} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
                {savingLock ? 'Saving...' : 'Save Lock Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grant Manual / 2x Bonus Modal */}
      {showGrantModal && (() => {
        const selectedUser = usersSummary.find(u => String(u.id) === String(grantForm.user_id))
        const depNum = Math.max(0, Number(grantForm.deposit_amount || 0))
        const bonusNum = Math.max(0, Number(grantForm.bonus_amount || 0))
        const currentBal = Number(selectedUser?.available_balance || 0)
        return (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <form style={{ colorScheme: 'light' }} onSubmit={handleGrantManual} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-slate-900">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Coins className="w-5 h-5 text-emerald-600" />
                  <span>Grant Manual / 2x Bonus to Main Balance</span>
                </div>
                <button type="button" onClick={() => setShowGrantModal(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Close</button>
              </div>

              <div>
                <label className={ADMIN_LABEL_CLS}>Select User (shows Main Balance &amp; Approved Deposits)</label>
                <select
                  value={grantForm.user_id}
                  onChange={e => handleSelectGrantUser(e.target.value)}
                  className={ADMIN_INPUT_CLS}
                  required
                >
                  <option value="">-- Choose User --</option>
                  {usersSummary.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || `User #${u.id}`} ({u.email}) — Bal: ${Number(u.available_balance || 0).toFixed(2)} | Unused Dep: ${Number(u.unused_deposit_amount || 0).toFixed(2)} | Total Dep: ${Number(u.total_deposited || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedUser && (
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs">
                  <div>
                    <div className="text-slate-500">Main Balance</div>
                    <div className="font-mono font-bold text-slate-900">${Number(selectedUser.available_balance || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Unused Deposit</div>
                    <div className="font-mono font-bold text-indigo-600">${Number(selectedUser.unused_deposit_amount || 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Total Deposited ({selectedUser.deposit_count || 0})</div>
                    <div className="font-mono font-bold text-emerald-600">${Number(selectedUser.total_deposited || 0).toFixed(2)}</div>
                  </div>
                </div>
              )}

              <div>
                <label className={ADMIN_LABEL_CLS}>Link to Promotion / Offer (for tracking &amp; cashout rules)</label>
                <select
                  value={grantForm.promotion_id}
                  onChange={e => setGrantForm(f => ({ ...f, promotion_id: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="">-- Direct Admin Bonus --</option>
                  {promotions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} {p.promo_code ? `(${p.promo_code})` : ''} — {p.bonus_type === 'percentage' ? `${p.bonus_value}%` : `$${p.bonus_value}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ADMIN_LABEL_CLS}>Deposit Basis ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={grantForm.deposit_amount}
                    onChange={e => setGrantForm(f => ({ ...f, deposit_amount: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={ADMIN_LABEL_CLS}>Bonus Amount to Credit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={grantForm.bonus_amount}
                    onChange={e => setGrantForm(f => ({ ...f, bonus_amount: e.target.value }))}
                    className={ADMIN_MONO_INPUT_CLS}
                  />
                </div>
              </div>

              {depNum > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGrantForm(f => ({ ...f, bonus_amount: String(Number(depNum.toFixed(2))) }))}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold"
                  >
                    100% Match (= 2x Total: +${depNum.toFixed(2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGrantForm(f => ({ ...f, bonus_amount: String(Number((depNum * 2).toFixed(2))) }))}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold"
                  >
                    2x Deposit Bonus (+${(depNum * 2).toFixed(2)})
                  </button>
                </div>
              )}

              <label className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(grantForm.apply_withdrawal_condition)}
                  onChange={e => setGrantForm(f => ({ ...f, apply_withdrawal_condition: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-indigo-600"
                />
                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">Enforce 2x Profit &amp; 50% Milestone Cashout Lock</div>
                  <div className="text-slate-500">User must reach profit target via AI Trade, Forex, or Binary to withdraw 50% across milestones.</div>
                </div>
              </label>

              <div>
                <label className={ADMIN_LABEL_CLS}>Admin Note (optional)</label>
                <input
                  type="text"
                  value={grantForm.admin_note}
                  onChange={e => setGrantForm(f => ({ ...f, admin_note: e.target.value }))}
                  placeholder="e.g. Manual 100% / 2x deposit bonus credit"
                  className={ADMIN_INPUT_CLS}
                />
              </div>

              {selectedUser && bonusNum > 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800 flex items-center justify-between font-mono">
                  <span>Main Balance Preview:</span>
                  <span>${currentBal.toFixed(2)} + ${bonusNum.toFixed(2)} = <strong>${(currentBal + bonusNum).toFixed(2)}</strong></span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowGrantModal(false)} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700">Cancel</button>
                <button
                  type="submit"
                  disabled={granting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  <Coins className="w-4 h-4" />
                  <span>{granting ? 'Crediting...' : 'Credit Bonus to Main Balance'}</span>
                </button>
              </div>
            </form>
          </div>
        )
      })()}
    </div>
  )
}
