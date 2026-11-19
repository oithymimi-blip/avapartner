import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { formatBdDateTime } from '../../utils/bdTime'
import CountryStateCitySelects from '../../components/CountryStateCitySelects'
import GlobalPhoneInput from '../../components/GlobalPhoneInput'
import {
  Award,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Trash2,
  XCircle
} from 'lucide-react'

const ADMIN_INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 focus:outline-none'
const ADMIN_LABEL_CLS = 'block text-xs font-semibold text-slate-700 mb-1'

const STATUS_LABELS = {
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved (Gold)',
  rejected: 'Rejected',
  pending: 'Saved Draft'
}

const STATUS_BADGES = {
  awaiting_approval: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 text-slate-950 border border-amber-400 font-bold',
  rejected: 'bg-rose-100 text-rose-700 border border-rose-200',
  pending: 'bg-slate-100 text-slate-700 border border-slate-200'
}

function toImageSrc(val) {
  if (!val || typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!trimmed) return null
  return trimmed.startsWith('data:image/') ? trimmed : `data:image/jpeg;base64,${trimmed}`
}

export default function AdminVerificationsPage() {
  const { token, admin } = useAdminAuth()
  const canManage = admin?.role === 'admin' || (admin?.permissions || []).includes('all') || (admin?.permissions || []).includes('users')

  const [verifications, setVerifications] = useState([])
  const [usersList, setUsersList] = useState([])
  const [settings, setSettings] = useState({
    nid_feature_enabled: true,
    gold_badge_label: 'Verified Strong',
    require_front_back: true,
    require_address: true,
    require_selfie: false,
    auto_approve: false,
    section_title: 'NID Identity & Address Verification',
    section_subtitle: ''
  })

  const [loading, setLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [processingId, setProcessingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [preview, setPreview] = useState(null)

  const [editingRow, setEditingRow] = useState(null)
  const [isNewForUser, setIsNewForUser] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

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

  const loadData = useCallback(async () => {
    if (!token || !canManage) return
    setLoading(true)
    try {
      const [verRes, setRes] = await Promise.all([
        api(token).get('/api/admin/verifications'),
        api(token).get('/api/admin/verifications/settings').catch(() => ({ data: null }))
      ])
      setVerifications(Array.isArray(verRes.data) ? verRes.data : [])
      if (setRes?.data?.settings) {
        setSettings(s => ({ ...s, ...setRes.data.settings }))
      }
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to load verifications', true)
    } finally {
      setLoading(false)
    }
  }, [token, canManage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openEditModal = (row) => {
    const splitParts = String(row.document_name || '').trim().split(/\s+/).filter(Boolean)
    const fallbackFirst = row.first_name || splitParts[0] || ''
    const fallbackLast = row.last_name || (splitParts.length > 1 ? splitParts.slice(1).join(' ') : '')
    setIsNewForUser(false)
    setEditingRow(row)
    setEditForm({
      user_id: String(row.user_id),
      document_type: row.document_type || 'nid',
      first_name: fallbackFirst,
      last_name: fallbackLast,
      document_name: row.document_name || `${fallbackFirst} ${fallbackLast}`.trim(),
      document_number: row.document_number || '',
      document_birthdate: row.document_birthdate || '',
      document_expires_at: row.document_expires_at || '',
      phone_number: row.phone_number || '',
      father_or_spouse_name: row.father_or_spouse_name || '',
      village_address: row.village_address || '',
      city: row.city || '',
      state_province: row.state_province || '',
      postal_code: row.postal_code || '',
      document_country: row.document_country || '',
      status: row.status || 'awaiting_approval',
      gold_badge: row.status === 'approved' ? (row.gold_badge == null ? true : Number(row.gold_badge) === 1) : Number(row.gold_badge || 0) === 1,
      notes: row.notes || ''
    })
  }

  const openCreateForUserModal = async () => {
    setIsNewForUser(true)
    setEditingRow({ email: 'Select user', name: '' })
    if (usersList.length === 0) {
      try {
        const res = await api(token).get('/api/admin/users')
        setUsersList(Array.isArray(res.data) ? res.data : [])
      } catch (_) {}
    }
    setEditForm({
      user_id: '',
      document_type: 'nid',
      first_name: '',
      last_name: '',
      document_name: '',
      document_number: '',
      document_birthdate: '',
      document_expires_at: '',
      phone_number: '',
      father_or_spouse_name: '',
      village_address: '',
      city: '',
      state_province: '',
      postal_code: '',
      document_country: '',
      status: 'approved',
      gold_badge: true,
      notes: ''
    })
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editForm.user_id) return notify('Select a user first.', true)
    setSavingEdit(true)
    try {
      await api(token).put(`/api/admin/verifications/${editForm.user_id}`, {
        ...editForm,
        document_name: `${editForm.first_name} ${editForm.last_name}`.trim() || editForm.document_name
      })
      notify('Identity details & verification status saved!')
      setEditingRow(null)
      await loadData()
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to save verification details.', true)
    } finally {
      setSavingEdit(false)
    }
  }

  const updateStatus = async (userId, nextStatus, currentNotes) => {
    if (!token) return
    const promptMsg = nextStatus === 'approved'
      ? 'Optional approval note (Gold Verified Strong badge will be granted):'
      : 'Reason for declining (optional):'
    const note = window.prompt(promptMsg, currentNotes || '')
    if (note === null) return
    setProcessingId(userId)
    try {
      await api(token).patch(`/api/admin/verifications/${userId}`, {
        status: nextStatus,
        notes: note || undefined,
        gold_badge: nextStatus === 'approved' ? 1 : 0
      })
      notify(
        nextStatus === 'approved'
          ? `Approved! Gold "${settings.gold_badge_label}" badge activated on user profile.`
          : 'Verification declined.'
      )
      await loadData()
    } catch (errRes) {
      notify(errRes?.response?.data?.error || 'Failed to update verification', true)
    } finally {
      setProcessingId(null)
    }
  }

  const deleteVerification = async (userId) => {
    if (!token) return
    if (!window.confirm('Delete this verification record? This cannot be undone.')) return
    setProcessingId(userId)
    try {
      await api(token).delete(`/api/admin/verifications/${userId}`)
      notify('Verification record deleted.')
      await loadData()
    } catch (errRes) {
      notify(errRes?.response?.data?.error || 'Failed to delete verification', true)
    } finally {
      setProcessingId(null)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await api(token).put('/api/admin/verifications/settings', settings)
      if (res.data?.settings) setSettings(res.data.settings)
      notify('NID Verification & Gold Badge settings saved globally!')
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to save verification settings', true)
    } finally {
      setSavingSettings(false)
    }
  }

  const counts = useMemo(() => ({
    all: verifications.length,
    awaiting_approval: verifications.filter(v => v.status === 'awaiting_approval').length,
    approved: verifications.filter(v => v.status === 'approved').length,
    pending: verifications.filter(v => !v.status || v.status === 'pending').length,
    rejected: verifications.filter(v => v.status === 'rejected').length
  }), [verifications])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return verifications.filter(row => {
      const st = row.status || 'pending'
      if (filterStatus !== 'all' && st !== filterStatus) return false
      if (!q) return true
      const hay = [
        row.name,
        row.email,
        row.first_name,
        row.last_name,
        row.document_name,
        row.document_number,
        row.village_address,
        row.city,
        row.state_province,
        row.document_country
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [verifications, filterStatus, search])

  if (!canManage) {
    return <div className="rounded-3xl bg-white border border-dashed border-slate-200 p-6 text-slate-500">Permissions required to view verifications.</div>
  }

  const renderImage = (rawVal, title) => {
    const src = toImageSrc(rawVal)
    if (!src) return null
    return (
      <img
        src={src}
        alt={title || 'document'}
        className="h-28 w-44 object-cover rounded-xl border border-slate-200 cursor-zoom-in transition hover:shadow-lg"
        onClick={() => setPreview({ src, title })}
      />
    )
  }

  return (
    <div style={{ colorScheme: 'light' }} className="space-y-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Verifications &amp; KYC</div>
          <h1 className="text-3xl font-semibold text-slate-900">Identity Requests &amp; NID Control</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Review NID Front/Back details, adjust identity settings, and approve users to grant the Gold Verified Strong badge.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSettings(s => !s)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm shadow-sm transition"
          >
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>{showSettings ? 'Hide Feature Settings' : 'Feature & Badge Settings'}</span>
          </button>
          <button
            type="button"
            onClick={openCreateForUserModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Set User NID / Gold Badge</span>
          </button>
        </div>
      </div>

      {msg && <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 font-medium">{err}</div>}

      {/* Feature Settings Panel */}
      {showSettings && (
        <form onSubmit={handleSaveSettings} className="rounded-3xl bg-white border border-indigo-200/70 shadow-sm p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">NID Identity Feature &amp; Gold Badge Configuration</h2>
                <p className="text-xs text-slate-500">Adjust user profile identity requirements and badge styling dynamically. Saved permanently to database.</p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                key: 'nid_feature_enabled',
                title: 'Enable NID Feature on User Profile',
                desc: 'Show the NID Front & Back identity form on user profiles.'
              },
              {
                key: 'require_front_back',
                title: 'Require NID Front & Back Photos',
                desc: 'Require uploading both front and back images before submitting.'
              },
              {
                key: 'require_address',
                title: 'Require Street, City, State & Country',
                desc: 'Require complete residential address matching ID back part.'
              },
              {
                key: 'require_selfie',
                title: 'Require Live Selfie Photo',
                desc: 'Off by default so users can submit cleanly with NID front & back.'
              },
              {
                key: 'auto_approve',
                title: 'Auto-Approve NID Submissions',
                desc: 'Automatically approve & grant Gold badge upon submission (off = Manual Admin approval).'
              }
            ].map(item => (
              <label key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-start gap-3 cursor-pointer hover:bg-slate-100/70 transition">
                <input
                  type="checkbox"
                  checked={Boolean(settings[item.key])}
                  onChange={e => setSettings(s => ({ ...s, [item.key]: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-indigo-600"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={ADMIN_LABEL_CLS}>Gold Badge Label (shown on approved user profiles)</label>
              <input
                type="text"
                value={settings.gold_badge_label}
                onChange={e => setSettings(s => ({ ...s, gold_badge_label: e.target.value }))}
                placeholder="Verified Strong"
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div>
              <label className={ADMIN_LABEL_CLS}>Profile Card Headline</label>
              <input
                type="text"
                value={settings.section_title}
                onChange={e => setSettings(s => ({ ...s, section_title: e.target.value }))}
                placeholder="NID Identity & Address Verification"
                className={ADMIN_INPUT_CLS}
              />
            </div>
            <div className="md:col-span-2">
              <label className={ADMIN_LABEL_CLS}>Profile Card Description</label>
              <input
                type="text"
                value={settings.section_subtitle}
                onChange={e => setSettings(s => ({ ...s, section_subtitle: e.target.value }))}
                className={ADMIN_INPUT_CLS}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-50"
            >
              {savingSettings ? 'Saving Settings...' : 'Save Verification Settings'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: `All (${counts.all})` },
            { key: 'awaiting_approval', label: `Awaiting Approval (${counts.awaiting_approval})` },
            { key: 'approved', label: `Approved Gold (${counts.approved})` },
            { key: 'pending', label: `Drafts (${counts.pending})` },
            { key: 'rejected', label: `Rejected (${counts.rejected})` }
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilterStatus(t.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                filterStatus === t.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user, NID no, city, country..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-3xl bg-white shadow-soft border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">NID Identity &amp; Address</th>
                <th className="px-4 py-3 text-left">Photos</th>
                <th className="px-4 py-3 text-left">Status &amp; Badge</th>
                <th className="px-4 py-3 text-left">Updated / Submitted</th>
                <th className="px-4 py-3 text-left">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Loading verification requests…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No verification records match this filter.</td></tr>
              ) : (
                filtered.map(row => {
                  const statusKey = row.status || 'pending'
                  const badge = STATUS_BADGES[statusKey] ?? STATUS_BADGES.pending
                  const label = STATUS_LABELS[statusKey] ?? STATUS_LABELS.pending
                  const isProcessing = processingId === row.user_id
                  const expanded = expandedId === row.user_id
                  const isGold = statusKey === 'approved' && (row.gold_badge == null || Number(row.gold_badge) === 1)
                  const fullLegalName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.document_name
                  const addrSummary = [row.village_address, row.city, row.state_province, row.document_country].filter(Boolean).join(', ')

                  return (
                    <Fragment key={`${row.user_id}-${row.id}`}>
                      <tr className="hover:bg-slate-50/70 text-slate-700">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{row.name || row.email}</div>
                          <div className="text-xs text-slate-500">{row.email}</div>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="font-semibold text-slate-900">
                            {row.document_type?.replace('_', ' ')?.toUpperCase() || 'NID'}
                            {row.document_number ? ` • ${row.document_number}` : ''}
                          </div>
                          {fullLegalName && <div className="text-xs text-slate-700 font-medium">{fullLegalName}</div>}
                          {addrSummary && <div className="text-[11px] text-slate-500 truncate" title={addrSummary}>{addrSummary}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            <span className={`px-2 py-0.5 rounded-md font-medium ${row.document_front ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                              Front {row.document_front ? '✓' : '—'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md font-medium ${row.document_back ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                              Back {row.document_back ? '✓' : '—'}
                            </span>
                          </div>
                          {row.face_similarity > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">Face: {row.face_similarity.toFixed(1)}%</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] ${badge}`}>
                            {isGold && <Award className="w-3 h-3 text-amber-950" />}
                            <span>{isGold ? (settings.gold_badge_label || 'Verified Strong') : label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatBdDateTime(row.updated_at || row.submitted_at, { showZone: true }) || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-slate-500 max-w-[180px] break-words">
                            {row.notes || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : row.user_id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{expanded ? 'Hide' : 'Details'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => openEditModal(row)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            {statusKey !== 'approved' && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => updateStatus(row.user_id, 'approved', row.notes)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                            )}
                            {statusKey !== 'rejected' && (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => updateStatus(row.user_id, 'rejected', row.notes)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => deleteVerification(row.user_id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition"
                              title="Delete verification record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="py-4 px-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-slate-600">NID Front Part</div>
                                {renderImage(row.document_front, 'NID Front Part') || <div className="text-xs text-slate-400">No front image uploaded</div>}
                              </div>
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-slate-600">NID Back Part</div>
                                {renderImage(row.document_back, 'NID Back Part') || <div className="text-xs text-slate-400">No back image uploaded</div>}
                              </div>
                              <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-slate-600">Selfie Photo</div>
                                {renderImage(row.selfie, 'Selfie') || <div className="text-xs text-slate-400">No selfie uploaded</div>}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white rounded-2xl border border-slate-200 p-4">
                              <div><span className="text-slate-400 block">First Name</span><strong className="text-slate-800">{row.first_name || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Last Name</span><strong className="text-slate-800">{row.last_name || '—'}</strong></div>
                              <div><span className="text-slate-400 block">NID / ID Number</span><strong className="font-mono text-slate-800">{row.document_number || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Phone</span><strong className="text-slate-800">{row.phone_number || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Date of Birth</span><strong className="text-slate-800">{row.document_birthdate || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Middle / Spouse</span><strong className="text-slate-800">{row.father_or_spouse_name || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Street / Village</span><strong className="text-slate-800">{row.village_address || '—'}</strong></div>
                              <div><span className="text-slate-400 block">City / Town</span><strong className="text-slate-800">{row.city || '—'}</strong></div>
                              <div><span className="text-slate-400 block">State / Province</span><strong className="text-slate-800">{row.state_province || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Postal / ZIP Code</span><strong className="text-slate-800">{row.postal_code || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Country</span><strong className="text-slate-800">{row.document_country || '—'}</strong></div>
                              <div><span className="text-slate-400 block">Gold Verified Badge</span><strong className={isGold ? 'text-amber-600' : 'text-slate-500'}>{isGold ? 'Active (Gold)' : 'Inactive'}</strong></div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit & Adjust Identity Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form style={{ colorScheme: 'light' }} onSubmit={handleSaveEdit} className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-slate-900 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>{isNewForUser ? 'Set User NID Identity & Gold Badge' : `Edit & Verify Identity — ${editingRow.email}`}</span>
              </div>
              <button type="button" onClick={() => setEditingRow(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Close</button>
            </div>

            {isNewForUser && (
              <div>
                <label className={ADMIN_LABEL_CLS}>Select User *</label>
                <select
                  required
                  value={editForm.user_id}
                  onChange={e => setEditForm(f => ({ ...f, user_id: e.target.value }))}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="">-- Select Account --</option>
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.name || `User #${u.id}`} ({u.email}) — {u.verification_status || 'not_started'}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={ADMIN_LABEL_CLS}>Document Type</label>
                <select value={editForm.document_type} onChange={e => setEditForm(f => ({ ...f, document_type: e.target.value }))} className={ADMIN_INPUT_CLS}>
                  <option value="nid">National ID (NID)</option>
                  <option value="passport">Passport</option>
                  <option value="driver_license">Driving License</option>
                </select>
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>First Name</label>
                <input type="text" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Last Name</label>
                <input type="text" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>NID / Document Number</label>
                <input type="text" value={editForm.document_number} onChange={e => setEditForm(f => ({ ...f, document_number: e.target.value }))} className={`${ADMIN_INPUT_CLS} font-mono`} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Date of Birth</label>
                <input type="date" value={editForm.document_birthdate} onChange={e => setEditForm(f => ({ ...f, document_birthdate: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Phone Number (Global)</label>
                <GlobalPhoneInput
                  value={editForm.phone_number || ''}
                  selectedCountryName={editForm.document_country || ''}
                  dark={false}
                  inputClassName={ADMIN_INPUT_CLS}
                  onChange={val => setEditForm(f => ({ ...f, phone_number: val }))}
                />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Middle / Guardian / Spouse</label>
                <input type="text" value={editForm.father_or_spouse_name} onChange={e => setEditForm(f => ({ ...f, father_or_spouse_name: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Expiry Date</label>
                <input type="text" value={editForm.document_expires_at} onChange={e => setEditForm(f => ({ ...f, document_expires_at: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div>
                <label className={ADMIN_LABEL_CLS}>Postal / ZIP Code</label>
                <input type="text" value={editForm.postal_code} onChange={e => setEditForm(f => ({ ...f, postal_code: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <div className="sm:col-span-3">
                <label className={ADMIN_LABEL_CLS}>Street Address / Apt / Village (ID Back)</label>
                <input type="text" value={editForm.village_address} onChange={e => setEditForm(f => ({ ...f, village_address: e.target.value }))} className={ADMIN_INPUT_CLS} />
              </div>
              <CountryStateCitySelects
                country={editForm.document_country || ''}
                state={editForm.state_province || ''}
                city={editForm.city || ''}
                onChange={({ country, state, city }) =>
                  setEditForm(f => ({
                    ...f,
                    document_country: country,
                    state_province: state,
                    city
                  }))
                }
                dark={false}
                inputClassName={ADMIN_INPUT_CLS}
                labelClassName={ADMIN_LABEL_CLS}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className={ADMIN_LABEL_CLS}>Verification Status</label>
                <select
                  value={editForm.status}
                  onChange={e => {
                    const st = e.target.value
                    setEditForm(f => ({
                      ...f,
                      status: st,
                      gold_badge: st === 'approved' ? true : (st === 'rejected' ? false : f.gold_badge)
                    }))
                  }}
                  className={ADMIN_INPUT_CLS}
                >
                  <option value="pending">Saved Draft</option>
                  <option value="awaiting_approval">Awaiting Approval</option>
                  <option value="approved">Approved (Verified Strong)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <label className="rounded-2xl border border-amber-300 bg-amber-50/70 px-3.5 py-2.5 flex items-center gap-3 cursor-pointer mt-5 sm:mt-0">
                <input
                  type="checkbox"
                  checked={Boolean(editForm.gold_badge)}
                  onChange={e => setEditForm(f => ({ ...f, gold_badge: e.target.checked }))}
                  className="w-4 h-4 accent-amber-500"
                />
                <div className="text-xs">
                  <div className="font-bold text-slate-900 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    <span>Show Gold &ldquo;{settings.gold_badge_label}&rdquo; Badge</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Shown on user&apos;s profile once Approved.</div>
                </div>
              </label>
            </div>

            <div>
              <label className={ADMIN_LABEL_CLS}>Admin Note</label>
              <input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional review note" className={ADMIN_INPUT_CLS} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setEditingRow(null)} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700">Cancel</button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Identity Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fullscreen Image Zoom Preview */}
      {preview ? (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-800">{preview.title || 'Preview'}</div>
              <div className="flex items-center gap-3">
                <a
                  href={preview.src}
                  download={`${(preview.title || 'image').replace(/\s+/g, '-').toLowerCase()}.jpg`}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Download
                </a>
                <button
                  type="button"
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-50 flex items-center justify-center">
              <img
                src={preview.src}
                alt={preview.title || 'Preview'}
                className="max-h-[80vh] max-w-full rounded-xl shadow-lg object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
