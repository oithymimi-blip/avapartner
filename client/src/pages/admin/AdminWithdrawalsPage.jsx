import { useCallback, useEffect, useState } from 'react'
import { useAdminAuth } from '../../adminStore'
import { api } from '../../api'
import { socket } from '../../socket'
import { formatBdDateTime, sortByTimestampDesc } from '../../utils/bdTime'

const badge = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700'
}

export default function AdminWithdrawalsPage() {
  const { token } = useAdminAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [message, setMessage] = useState('')

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setMessage('')
    try {
      const rRes = await api(token).get('/api/admin/payments/requests?type=withdraw')
      setRequests(sortByTimestampDesc(rRes.data || [], 'created_at'))
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load withdrawals')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!token) return
    const handleUpdate = (payload) => {
      const updated = payload?.request
      if (updated && updated.type === 'withdraw') {
        setRequests(prev => {
          const exists = prev.some(r => r.id === updated.id)
          const next = exists
            ? prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r))
            : [updated, ...prev]
          return sortByTimestampDesc(next, 'created_at')
        })
      } else {
        loadAll()
      }
    }
    const handleAdminNotif = (notif) => {
      if (notif?.type === 'withdrawal') loadAll()
    }
    socket.on('admin_withdrawal_update', handleUpdate)
    socket.on('admin_notification', handleAdminNotif)
    return () => {
      socket.off('admin_withdrawal_update', handleUpdate)
      socket.off('admin_notification', handleAdminNotif)
    }
  }, [token, loadAll])

  const act = async (req, decision) => {
    if (!token || actingId) return
    setActingId(req.id)
    setMessage('')
    try {
      const res = await api(token).post(`/api/admin/payments/requests/${req.id}/${decision}`)
      const nextStatus = decision === 'approve' ? 'approved' : 'declined'
      const updatedRow = res.data?.request
      setRequests(prev => prev.map(r => (
        r.id === req.id
          ? {
              ...r,
              ...(updatedRow || {}),
              status: nextStatus,
              updated_at: updatedRow?.updated_at || new Date().toISOString()
            }
          : r
      )))
      setMessage(`Withdrawal #${req.id} ($${Number(req.amount).toFixed(2)}) ${nextStatus}.`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update request')
    } finally {
      setActingId(null)
    }
  }

  const copyAddress = async (req) => {
    if (!req?.address) return
    try {
      await navigator.clipboard.writeText(req.address)
      setCopiedId(req.id)
      setTimeout(() => setCopiedId(prev => (prev === req.id ? null : prev)), 2000)
    } catch {
      /* ignore clipboard error */
    }
  }

  const pending = requests.filter(r => r.status === 'pending')
  const history = sortByTimestampDesc(
    requests.filter(r => r.status !== 'pending'),
    'updated_at'
  )
  const pendingTotal = pending.reduce((sum, r) => sum + Number(r.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">Withdrawals</h1>
          <p className="text-sm text-slate-500">
            Review and approve USDT withdrawals. All timestamps are shown in <span className="font-semibold text-slate-700">Bangladesh Time (Asia/Dhaka, BDT)</span>.
          </p>
        </div>
        <button className="btn" onClick={loadAll} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {message && (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-sm font-medium text-indigo-800">
          {message}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* ── Pending Withdrawals ── */}
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Pending withdrawals</div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                {pending.length} pending
              </span>
              {pending.length > 0 && (
                <span className="font-mono font-semibold text-slate-700">${pendingTotal.toFixed(2)}</span>
              )}
            </div>
          </div>

          {pending.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">No pending withdrawals.</div>
          ) : (
            <div className="space-y-3">
              {pending.map(req => (
                <div key={req.id} className="border border-slate-200/80 rounded-2xl p-4 space-y-3 bg-slate-50/50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {req.method_name || 'USDT'} · {req.network || 'Binance Smart Chain (BEP-20)'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">Request #{req.id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono text-rose-600">
                        ${Number(req.amount || 0).toFixed(2)}
                      </div>
                      <span className={`inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${badge.pending}`}>
                        Pending
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white border border-slate-200/70 p-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-slate-400 font-medium">User Name:</span>
                      <span className="font-semibold text-slate-900">{req.user_name || '—'}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-slate-400 font-medium">Email:</span>
                      <span className="text-slate-700 font-mono">{req.user_email || `User #${req.user_id}`}</span>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-slate-400 font-medium">Requested (BD Time):</span>
                      <span className="font-semibold text-indigo-700">
                        {formatBdDateTime(req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-slate-400 font-medium">Wallet Address:</span>
                        <button
                          type="button"
                          onClick={() => copyAddress(req)}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition"
                        >
                          {copiedId === req.id ? '✓ Copied' : 'Copy Address'}
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-slate-800 break-all bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                        {req.address || '—'}
                      </div>
                    </div>
                    {req.tag && (
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-400 font-medium">Tag / Memo:</span>
                        <span className="font-mono text-slate-700">{req.tag}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-0.5">
                    <button
                      className="btn bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
                      onClick={() => act(req, 'approve')}
                      disabled={actingId === req.id}
                    >
                      {actingId === req.id ? 'Processing…' : 'Approve'}
                    </button>
                    <button
                      className="btn bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50"
                      onClick={() => act(req, 'decline')}
                      disabled={actingId === req.id}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Processed Withdrawal History ── */}
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">History (Approved &amp; Declined)</div>
            <span className="text-xs text-slate-500">{history.length} items</span>
          </div>

          {history.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">No processed withdrawals yet.</div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {history.map(req => {
                const actionLabel = req.status === 'approved' ? 'Approved (BD Time)' : 'Declined (BD Time)'
                return (
                  <div key={req.id} className="border border-slate-200/80 rounded-2xl p-4 space-y-2.5 bg-slate-50/40">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {req.method_name || 'USDT'} · {req.network || 'Binance Smart Chain (BEP-20)'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">Request #{req.id}</div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-bold font-mono text-slate-900">
                          ${Number(req.amount || 0).toFixed(2)}
                        </span>
                        <span className={`text-[11px] font-semibold uppercase px-3 py-1 rounded-full border ${badge[req.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {req.status}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-slate-200/70 p-3 space-y-1.5 text-xs">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-400 font-medium">User Name:</span>
                        <span className="font-semibold text-slate-900">{req.user_name || '—'}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-400 font-medium">Email:</span>
                        <span className="text-slate-700 font-mono">{req.user_email || `User #${req.user_id}`}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-400 font-medium">Requested (BD Time):</span>
                        <span className="text-slate-700 font-medium">
                          {formatBdDateTime(req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-slate-400 font-medium">{actionLabel}:</span>
                        <span className={`font-semibold ${req.status === 'approved' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatBdDateTime(req.updated_at || req.created_at, { includeSeconds: true, showZone: true }) || '—'}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-slate-400 font-medium">Wallet Address:</span>
                          {req.address && (
                            <button
                              type="button"
                              onClick={() => copyAddress(req)}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition"
                            >
                              {copiedId === req.id ? '✓ Copied' : 'Copy'}
                            </button>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-800 break-all bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                          {req.address || '—'}
                        </div>
                      </div>
                      {req.tag && (
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="text-slate-400 font-medium">Tag / Memo:</span>
                          <span className="font-mono text-slate-700">{req.tag}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
