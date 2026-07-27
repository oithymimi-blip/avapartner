import { useEffect, useState } from 'react'
import { useAdminAuth } from '../../adminStore'
import { api } from '../../api'

const badge = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700'
}

export default function AdminDepositsPage() {
  const { token } = useAdminAuth()
  const [methods, setMethods] = useState([])
  const [methodForm, setMethodForm] = useState({ name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: '', tag: '', qr_url: '', active: true })
  const [editingId, setEditingId] = useState(null)
  const [requests, setRequests] = useState([])
  const [smartWallets, setSmartWallets] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [editingReqId, setEditingReqId] = useState(null)
  const [editingReqAmount, setEditingReqAmount] = useState('')
  const [hotWallet, setHotWallet] = useState({ balance: 0, error: '' })

  const sortByCreated = (list) => [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  const loadAll = async () => {
    if (!token) return
    setLoading(true)
    setMessage('')
    try {
      const [mRes, rRes, sRes, hwRes] = await Promise.all([
        api(token).get('/api/admin/payments/methods?type=deposit').catch(() => ({ data: [] })),
        api(token).get('/api/admin/payments/requests?type=deposit').catch(() => ({ data: [] })),
        api(token).get('/api/admin/payments/smart-wallets').catch(() => ({ data: [] })),
        api(token).get('/api/admin/payments/hot-wallet-status').catch(() => ({ data: { balance: 0 } }))
      ])
      const defaultMethods = mRes.data && mRes.data.length ? mRes.data : [{ id: 'usdt-default', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: '', tag: '', qr_url: '', active: true }]
      setMethods(defaultMethods)
      setRequests(sortByCreated(rRes.data || []))
      setSmartWallets(sRes.data || [])
      setHotWallet(hwRes.data || { balance: 0 })
      setRequests(sortByCreated(rRes.data || []))
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load deposits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [token])

  const saveMethod = async () => {
    if (!token) return
    setMessage('')
    try {
      if (editingId && typeof editingId === 'number') {
        await api(token).put(`/api/admin/payments/methods/${editingId}`, { ...methodForm, type: 'deposit' })
        setMethods(prev => prev.map(m => m.id === editingId ? { ...m, ...methodForm } : m))
        setMessage('Deposit method updated')
      } else {
        const res = await api(token).post('/api/admin/payments/methods', { ...methodForm, type: 'deposit' }).catch(() => ({ data: methodForm }))
        const newId = res?.data?.id || `local-${Date.now()}`
        setMethods(prev => [{ ...methodForm, id: newId }, ...prev])
        setMessage('Deposit method saved')
      }
      setMethodForm({ name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: '', tag: '', qr_url: '', active: true })
      setEditingId(null)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save method')
    }
  }

  const handleQrUpload = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result || ''
      setMethodForm(prev => ({ ...prev, qr_url: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  const toggleMethod = async (method) => {
    const updated = { ...method, active: !method.active }
    setMethods(prev => prev.map(m => (m.id === method.id ? updated : m)))
    try {
      await api(token).put(`/api/admin/payments/methods/${method.id}`, updated).catch(() => null)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update method')
    }
  }

  const approveRequest = async (req, decision) => {
    if (!token) return
    try {
      await api(token).post(`/api/admin/payments/requests/${req.id}/${decision}`).catch(() => null)
      setRequests(prev => prev.map(r => (r.id === req.id ? { ...r, status: decision === 'approve' ? 'approved' : 'declined' } : r)))
      setMessage(`Request ${decision}d`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update request')
    }
  }

  const updateRequestAmount = async (reqId) => {
    if (!token) return
    const amt = Number(editingReqAmount)
    if (!Number.isFinite(amt) || amt < 0) return setMessage('Invalid amount')
    try {
      await api(token).put(`/api/admin/payments/requests/${reqId}/amount`, { amount: amt })
      setRequests(prev => prev.map(r => (r.id === reqId ? { ...r, amount: amt } : r)))
      setMessage('Amount updated successfully')
      setEditingReqId(null)
      setEditingReqAmount('')
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to update amount')
    }
  }

  const pending = requests.filter(r => r.status === 'pending')
  const history = requests.filter(r => r.status !== 'pending')

  const flushWallet = async (address) => {
    if (!token) return;
    try {
      setMessage('Sending flush transaction. Please wait...')
      // Assuming USDT flush for now (could add token address selection later)
      await api(token).post('/api/admin/payments/flush-address', { 
        forwarderAddress: address,
        tokenAddress: '0x55d398326f99059fF775485246999027B3197955' // BSC USDT
      })
      setMessage(`Successfully triggered sweep for ${address}`)
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to flush wallet')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">Deposit Methods & Requests</h1>
          <p className="text-sm text-slate-500">Add USDT chains with QR codes. Approve deposits to credit balances.</p>
        </div>
        <button className="btn self-start sm:self-auto" onClick={loadAll} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-800">{message}</div>}

      {hotWallet.balance < 0.002 && hotWallet.address && (
        <div className="rounded-2xl bg-red-100 border-2 border-red-500 p-5 text-red-900 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
          <h2 className="text-xl font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            CRITICAL SYSTEM ERROR: GAS TRAP
          </h2>
          <p className="font-semibold mb-2">Your Admin Master Wallet has exactly {hotWallet.balance} BNB.</p>
          <p className="text-sm opacity-90 mb-3">
            Auto-sweep is <strong>physically impossible</strong> on the blockchain without BNB to pay for gas fees. 
            All USDT deposits are currently STUCK in user wallets because the system cannot afford the transfer fee.
          </p>
          <div className="bg-red-950 text-white rounded p-3 font-mono text-xs sm:text-sm break-all flex justify-between items-center">
            <span>Deposit BNB here: {hotWallet.address}</span>
            <button className="bg-red-600 px-3 py-1 rounded text-xs uppercase font-bold tracking-wider hover:bg-red-500" onClick={() => navigator.clipboard.writeText(hotWallet.address)}>Copy</button>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Smart Contract Wallets</div>
          <span className="text-xs text-slate-500">{smartWallets.length} active</span>
        </div>
        {smartWallets.length === 0 ? <div className="text-sm text-slate-500">No users have generated deposit addresses yet.</div> : (
          <div className="grid md:grid-cols-2 gap-3">
            {smartWallets.map(w => (
              <div key={w.user_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 flex gap-3 items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{w.email} (User #{w.user_id})</div>
                  <div className="text-xs font-mono text-slate-500 break-all">{w.deposit_address}</div>
                </div>
                <button className="btn bg-indigo-600 text-white whitespace-nowrap" onClick={() => flushWallet(w.deposit_address)}>Sweep USDT</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Add deposit method</div>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="input" placeholder="Name (e.g., USDT)" value={methodForm.name} onChange={e => setMethodForm(prev => ({ ...prev, name: e.target.value }))} />
          <input className="input" placeholder="Network (e.g., Binance Smart Chain (BEP-20))" value={methodForm.network} onChange={e => setMethodForm(prev => ({ ...prev, network: e.target.value }))} />
          <input className="input" placeholder="Wallet address" value={methodForm.address} onChange={e => setMethodForm(prev => ({ ...prev, address: e.target.value }))} />
          <input className="input" placeholder="Tag / Memo (optional)" value={methodForm.tag} onChange={e => setMethodForm(prev => ({ ...prev, tag: e.target.value }))} />
          <input className="input" placeholder="QR code image URL" value={methodForm.qr_url} onChange={e => setMethodForm(prev => ({ ...prev, qr_url: e.target.value }))} />
          <label className="input flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-slate-500">Upload QR</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => handleQrUpload(e.target.files?.[0])} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={methodForm.active} onChange={e => setMethodForm(prev => ({ ...prev, active: e.target.checked }))} /> Active
          </label>
          <button className="btn" onClick={saveMethod}>{editingId ? 'Update method' : 'Save method'}</button>
          {editingId ? (
            <button
              className="btn bg-slate-200 text-slate-700"
              onClick={() => { setEditingId(null); setMethodForm({ name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: '', tag: '', qr_url: '', active: true }) }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {methods.map(m => (
            <div key={m.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 flex gap-3">
              <div className="flex-1">
                <div className="font-semibold text-slate-900">{m.name} · {m.network}</div>
                <div className="text-xs text-slate-500 break-all">{m.address || '—'}</div>
                {m.tag ? <div className="text-xs text-slate-500">Tag/Memo: {m.tag}</div> : null}
                {m.qr_url ? <img src={m.qr_url} alt="QR" className="mt-2 h-16 w-16 object-contain rounded" /> : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <button className={`text-xs font-semibold px-3 py-1 rounded-full border ${m.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`} onClick={() => toggleMethod(m)}>
                  {m.active ? 'Active' : 'Inactive'}
                </button>
                <button
                  className="text-xs text-indigo-600 font-semibold underline"
                  onClick={() => {
                    setEditingId(m.id)
                    setMethodForm({
                      name: m.name || '',
                      network: m.network || '',
                      address: m.address || '',
                      tag: m.tag || '',
                      qr_url: m.qr_url || '',
                      active: m.active !== false
                    })
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Pending deposits</div>
            <span className="text-xs text-slate-500">{pending.length} items</span>
          </div>
          {pending.length === 0 ? <div className="text-sm text-slate-500">No pending deposits.</div> : (
            <div className="space-y-3">
              {pending.map(req => (
                <div key={req.id} className="border border-slate-100 rounded-2xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900">{req.method_name || req.method || 'USDT'} · {req.network || ''}</div>
                    {editingReqId === req.id ? (
                      <div className="flex items-center gap-2">
                        <input type="number" step="0.01" className="input w-24 px-2 py-1 text-sm" value={editingReqAmount} onChange={e => setEditingReqAmount(e.target.value)} />
                        <button className="text-xs text-indigo-600 font-semibold" onClick={() => updateRequestAmount(req.id)}>Save</button>
                        <button className="text-xs text-slate-500 font-semibold" onClick={() => setEditingReqId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="text-sm font-mono flex items-center gap-2">
                        {req.amount}
                        <button className="text-[10px] text-indigo-500 underline" onClick={() => { setEditingReqId(req.id); setEditingReqAmount(req.amount) }}>Edit</button>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">TX: {req.tx_ref || req.tx_hash || '—'}</div>
                  <div className="text-xs text-slate-400">User: {req.user_email || req.user_id}</div>
                  <div className="flex gap-2 mt-2">
                    <button className="btn bg-emerald-500 text-white" onClick={() => approveRequest(req, 'approve')}>Approve</button>
                    <button className="btn bg-rose-500 text-white" onClick={() => approveRequest(req, 'decline')}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Deposit history</div>
            <span className="text-xs text-slate-500">{history.length} items</span>
          </div>
          {history.length === 0 ? <div className="text-sm text-slate-500">No history.</div> : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
              {history.map(req => (
                <div key={req.id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      {req.method_name || req.method || 'USDT'} · {req.network || ''}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge[req.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{req.status}</span>
                    </div>
                    {editingReqId === req.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="number" step="0.01" className="input w-20 px-2 py-0.5 text-xs" value={editingReqAmount} onChange={e => setEditingReqAmount(e.target.value)} />
                        <button className="text-[10px] text-indigo-600 font-semibold" onClick={() => updateRequestAmount(req.id)}>Save</button>
                        <button className="text-[10px] text-slate-500 font-semibold" onClick={() => setEditingReqId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{req.amount}</span> · {req.user_email || req.user_id}
                        <button className="text-[10px] text-indigo-500 underline ml-1" onClick={() => { setEditingReqId(req.id); setEditingReqAmount(req.amount) }}>Edit Amount</button>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">TX: {req.tx_ref || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
