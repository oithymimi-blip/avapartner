import { useEffect, useState } from 'react'
import { useAdminAuth } from '../../adminStore'
import { api } from '../../api'

const badge = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700'
}

export default function AdminWithdrawalsPage() {
  const { token } = useAdminAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const sortByCreated = (list) => [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  const loadAll = async () => {
    if (!token) return
    setLoading(true)
    setMessage('')
    try {
      const rRes = await api(token).get('/api/admin/payments/requests?type=withdraw').catch(() => ({ data: [] }))
      setRequests(sortByCreated(rRes.data || []))
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load withdrawals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [token])

  const act = async (req, decision) => {
    if (!token) return
    try {
      await api(token).post(`/api/admin/payments/requests/${req.id}/${decision}`).catch(() => null)
      setRequests(prev => prev.map(r => (r.id === req.id ? { ...r, status: decision === 'approve' ? 'approved' : 'declined' } : r)))
      setMessage(`Request ${decision}d`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update request')
    }
  }

  const pending = requests.filter(r => r.status === 'pending')
  const history = requests.filter(r => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">Withdrawals</h1>
          <p className="text-sm text-slate-500">Review and approve USDT withdrawals. Approval should match on-chain transfers.</p>
        </div>
        <button className="btn" onClick={loadAll} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-800">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Pending withdrawals</div>
            <span className="text-xs text-slate-500">{pending.length} items</span>
          </div>
          {pending.length === 0 ? <div className="text-sm text-slate-500">No pending withdrawals.</div> : (
            <div className="space-y-3">
              {pending.map(req => (
                <div key={req.id} className="border border-slate-100 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900">{req.method_name || req.method || 'USDT'} · {req.network || ''}</div>
                    <div className="text-sm font-mono">{req.amount}</div>
                  </div>
                  <div className="text-xs text-slate-500">To: {req.address} {req.tag ? `· Tag ${req.tag}` : ''}</div>
                  <div className="text-xs text-slate-400">User: {req.user_email || req.user_id}</div>
                  <div className="flex gap-2 mt-2">
                    <button className="btn bg-emerald-500 text-white" onClick={() => act(req, 'approve')}>Approve</button>
                    <button className="btn bg-rose-500 text-white" onClick={() => act(req, 'decline')}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">History</div>
            <span className="text-xs text-slate-500">{history.length} items</span>
          </div>
          {history.length === 0 ? <div className="text-sm text-slate-500">No history.</div> : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
              {history.map(req => (
                <div key={req.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{req.method_name || req.method || 'USDT'} · {req.network || ''}</div>
                    <div className="text-xs text-slate-500">{req.amount} · {req.user_email || req.user_id}</div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${badge[req.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{req.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
