import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '$0.00'
  return currencyFmt.format(num)
}

function formatCoin(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.0000'
  if (Math.abs(num) >= 1) return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num.toFixed(6)
}

export default function AdminSpotMarketsPage() {
  const { token, admin } = useAdminAuth()
  const [markets, setMarkets] = useState([])
  const [overrides, setOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [editingMarket, setEditingMarket] = useState(null)
  const [editForm, setEditForm] = useState({ price: '', change_24h: '', volume_24h: '' })
  const [submitting, setSubmitting] = useState(false)

  const hasPermission = (perm) => {
    if (admin?.role === 'admin') return true
    if (!perm) return admin?.role === 'subadmin'
    const perms = admin?.permissions || []
    return perms.includes('all') || perms.includes(perm)
  }

  const loadData = async () => {
    if (!token || !hasPermission('market')) return
    try {
      const [marketsRes, overridesRes] = await Promise.all([
        api(token).get('/api/spot/markets'),
        api(token).get('/api/spot/overrides')
      ])
      setMarkets(marketsRes.data?.markets || [])
      setOverrides(overridesRes.data?.overrides || [])
      setError('')
    } catch (err) {
      console.error('spot markets load error', err)
      setError('Failed to load spot market data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [token, admin])

  const overrideMap = useMemo(() => {
    const map = new Map()
    for (const o of overrides) {
      map.set(o.symbol.toUpperCase(), o)
    }
    return map
  }, [overrides])

  const filteredMarkets = useMemo(() => {
    if (!searchQuery) return markets
    const q = searchQuery.toLowerCase()
    return markets.filter(m => m.symbol.toLowerCase().includes(q) || m.base_asset.toLowerCase().includes(q))
  }, [markets, searchQuery])

  const handleEditClick = (market) => {
    const override = overrideMap.get(market.symbol.toUpperCase())
    setEditingMarket(market)
    setEditForm({
      price: override?.price_override != null ? String(override.price_override) : '',
      change_24h: override?.change_override != null ? String(override.change_override) : '',
      volume_24h: override?.volume_override != null ? String(override.volume_override) : ''
    })
  }

  const handleSaveOverride = async (e) => {
    e.preventDefault()
    if (!editingMarket || !token) return
    setSubmitting(true)
    try {
      const payload = {}
      if (editForm.price.trim() !== '') payload.price = Number(editForm.price)
      if (editForm.change_24h.trim() !== '') payload.change_24h = Number(editForm.change_24h)
      if (editForm.volume_24h.trim() !== '') payload.volume_24h = Number(editForm.volume_24h)

      await api(token).post(`/api/spot/markets/${editingMarket.symbol}/price`, payload)
      await loadData()
      setEditingMarket(null)
    } catch (err) {
      console.error('save override error', err)
      alert(err?.response?.data?.error || 'Failed to save override')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClearOverride = async () => {
    if (!editingMarket || !token) return
    setSubmitting(true)
    try {
      await api(token).delete(`/api/spot/markets/${editingMarket.symbol}/override`)
      await loadData()
      setEditingMarket(null)
    } catch (err) {
      console.error('clear override error', err)
      alert(err?.response?.data?.error || 'Failed to clear override')
    } finally {
      setSubmitting(false)
    }
  }

  if (!hasPermission('market')) {
    return (
      <div className="rounded-2xl bg-white border border-dashed border-slate-200 p-6 text-sm text-slate-500">
        Market permission required to access this page.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-soft border border-slate-100 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-emerald-500">Spot Engine</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Top 100 Crypto Pairs</h1>
            <p className="text-sm text-slate-500 mt-1">Control live Binance feeds and apply synthetic overrides.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total Markets</div>
              <div className="text-xl font-bold text-slate-900">{markets.length}</div>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-left">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Overridden</div>
              <div className="text-xl font-bold text-indigo-600">{overrides.length}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-6">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-lg">🔎</span>
            <input
              type="text"
              placeholder="Search by symbol or asset..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {loading && <span className="animate-pulse text-emerald-500">Syncing Live Data...</span>}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-400 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Asset Pair</th>
                <th className="px-6 py-4 font-semibold text-right">Price</th>
                <th className="px-6 py-4 font-semibold text-right">24h Change</th>
                <th className="px-6 py-4 font-semibold text-right">24h Volume</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredMarkets.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                    No markets found matching "{searchQuery}"
                  </td>
                </tr>
              ) : (
                filteredMarkets.map((market) => {
                  const pct = Number(market.change_24h)
                  const isOverridden = overrideMap.has(market.symbol.toUpperCase())
                  
                  return (
                    <tr key={market.symbol} className="hover:bg-slate-50 transition group">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img
                            src={market.logo_url}
                            alt={market.base_asset}
                            className="h-8 w-8 rounded-full border border-slate-100 bg-white object-contain p-0.5"
                            onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                          />
                          <div>
                            <div className="font-bold text-slate-900">{market.symbol}</div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">{market.base_asset}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap font-mono font-medium text-slate-800">
                        {formatCoin(market.price)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 font-semibold ${pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {pct >= 0 ? '↗' : '↘'} {Math.abs(pct).toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap font-mono text-slate-500">
                        {formatCurrency(market.volume_24h)}
                      </td>
                      <td className="px-6 py-3 text-center whitespace-nowrap">
                        {isOverridden ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 border border-indigo-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                            Overridden
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-200">
                            Live Feed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleEditClick(market)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-600 group-hover:bg-emerald-50"
                        >
                          Control
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingMarket && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={editingMarket.logo_url}
                  alt={editingMarket.base_asset}
                  className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-0.5"
                  onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                />
                <div>
                  <h3 className="font-bold text-slate-900">{editingMarket.symbol} Control</h3>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Market Override Settings</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingMarket(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveOverride} className="p-6 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1.5">
                    Price Override
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder={`Live: ${editingMarket.price}`}
                    value={editForm.price}
                    onChange={(e) => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Leave blank to use live Binance price.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1.5">
                    24h Change (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder={`Live: ${editingMarket.change_24h}`}
                    value={editForm.change_24h}
                    onChange={(e) => setEditForm(prev => ({ ...prev, change_24h: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 mb-1.5">
                    24h Volume
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder={`Live: ${editingMarket.volume_24h}`}
                    value={editForm.volume_24h}
                    onChange={(e) => setEditForm(prev => ({ ...prev, volume_24h: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Applying...' : 'Apply Overrides'}
                </button>
                {overrideMap.has(editingMarket.symbol.toUpperCase()) && (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    disabled={submitting}
                    className="flex-1 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 border border-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
