import { useEffect, useState } from 'react'
import { useAdminAuth } from '../../adminStore'
import { api } from '../../api'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export default function AdminLeaderboardPage() {
  const { token } = useAdminAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [draft, setDraft] = useState({ handle: '', realized_pnl: '' })

  const sortEntries = (list) => [...list].sort((a, b) => Number(b.realized_pnl || 0) - Number(a.realized_pnl || 0))

  const loadEntries = async () => {
    if (!token) return
    setLoading(true)
    setMessage('')
    try {
      const res = await api(token).get('/api/admin/leaderboard').catch(() => api(token).get('/api/trades/leaderboard'))
      const data = Array.isArray(res?.data) ? res.data : []
      const normalized = data.map((item, idx) => ({
        ...item,
        id: item.id ?? item.user_id ?? item.email ?? item.handle ?? `row-${idx}-${Date.now()}`
      }))
      setEntries(sortEntries(normalized))
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [token])

  const updateEntryField = (id, field, value) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)))
  }

  const saveEntry = async (entry) => {
    if (!token) return
    setMessage('')
    try {
      const payload = {
        ...entry,
        handle: (entry.handle || '').trim(),
        realized_pnl: Number(entry.realized_pnl) || 0
      }
      const idStr = entry.id ? String(entry.id) : ''
      const isTemp = idStr.startsWith('temp-')
      const isGenerated = idStr.startsWith('row-')
      const hasRealId = entry.id && !isTemp && !isGenerated

      // optimistic update
      setEntries(prev => sortEntries(prev.map(e => (e.id === entry.id ? { ...e, ...payload } : e))))

      if (hasRealId) {
        try {
          await api(token).put(`/api/admin/leaderboard/${entry.id}`, payload)
        } catch (err) {
          // if update fails (e.g., not found), try create instead
          const res = await api(token).post('/api/admin/leaderboard', payload)
          const newId = res?.data?.id
          if (newId) {
            setEntries(prev => sortEntries(prev.map(e => (e.id === entry.id ? { ...e, id: newId } : e))))
          }
        }
      } else {
        const res = await api(token).post('/api/admin/leaderboard', payload)
        const newId = res?.data?.id
        if (newId) {
          setEntries(prev => sortEntries(prev.map(e => (e.id === entry.id ? { ...e, id: newId } : e))))
        }
      }
      setMessage('Leaderboard updated')
      await loadEntries()
    } catch (err) {
      // keep optimistic data so admin sees change even if backend fails
      setMessage(err?.response?.data?.error || 'Failed to save entry (kept locally)')
    }
  }

  const deleteEntry = async (id) => {
    if (!token || !id) return
    if (!window.confirm('Remove this entry?')) return
    try {
      await api(token).delete(`/api/admin/leaderboard/${id}`).catch(() => null)
      setMessage('Entry removed')
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to delete entry')
    }
  }

  const addDraft = () => {
    if (!draft.handle || draft.realized_pnl === '') {
      setMessage('Handle and PnL required')
      return
    }
    const tempId = `temp-${Date.now()}`
    const newEntry = { id: tempId, handle: draft.handle.trim(), realized_pnl: Number(draft.realized_pnl) || 0 }
    setEntries(prev => sortEntries([...prev, newEntry]))
    setDraft({ handle: '', realized_pnl: '' })
    saveEntry(newEntry)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</div>
          <h1 className="text-3xl font-semibold text-slate-900">Leaderboard</h1>
          <p className="text-sm text-slate-500">View, reorder, and edit top trader entries.</p>
        </div>
        <button
          className="btn"
          onClick={loadEntries}
          disabled={loading}
        >{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {message && (
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-800">{message}</div>
      )}

      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em]">Add entry</div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input bg-white border-slate-200 text-slate-800"
            placeholder="Handle / Email"
            value={draft.handle}
            onChange={e => setDraft(prev => ({ ...prev, handle: e.target.value }))}
          />
          <input
            className="input bg-white border-slate-200 text-slate-800"
            type="number"
            step="0.01"
            placeholder="Realized PnL"
            value={draft.realized_pnl}
            onChange={e => setDraft(prev => ({ ...prev, realized_pnl: e.target.value }))}
          />
          <button className="btn" onClick={addDraft}>Add to leaderboard</button>
        </div>
      </div>

      <div className="rounded-3xl bg-white shadow-soft border border-slate-100 p-5">
        <div className="text-sm font-semibold text-slate-700 uppercase tracking-[0.2em] mb-3">Entries</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 text-left">Rank</th>
                <th className="py-2 text-left">Handle</th>
                <th className="py-2 text-left">Realized PnL</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="py-6 text-center text-slate-500">Loading…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-slate-500">No entries</td></tr>
              ) : (
                sortEntries(entries).map((entry, idx) => (
                  <tr key={entry.id ?? idx}>
                    <td className="py-2 font-mono text-slate-600">#{idx + 1}</td>
                    <td className="py-2">
                      <input
                        className="input bg-white border-slate-200 text-slate-800"
                        value={entry.handle || ''}
                        onChange={e => updateEntryField(entry.id, 'handle', e.target.value)}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className="input bg-white border-slate-200 text-slate-800"
                        type="number"
                        step="0.01"
                        value={entry.realized_pnl ?? 0}
                        onChange={e => updateEntryField(entry.id, 'realized_pnl', e.target.value)}
                      />
                      <div className="text-xs text-slate-500 mt-1">Current: {currency.format(Number(entry.realized_pnl || 0))}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          className="text-xs text-indigo-600 font-semibold"
                          onClick={() => saveEntry({ ...entry, realized_pnl: Number(entry.realized_pnl) || 0 })}
                        >Save</button>
                        <button
                          className="text-xs text-rose-500 font-semibold"
                          onClick={() => deleteEntry(entry.id)}
                          disabled={!entry.id}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
