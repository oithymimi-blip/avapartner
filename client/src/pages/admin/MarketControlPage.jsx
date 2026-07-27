import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'

const currency = (value = 0, opts = {}) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    minimumFractionDigits: opts.minimumFractionDigits ?? 2
  }).format(Number(value) || 0)

const parseNumberInput = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPair(sym) {
  if (!sym) return ''
  if (sym === 'USOIL') return 'USOIL/USD'
  if (sym.endsWith('USD')) {
    return `${sym.slice(0, -3)}/USD`
  }
  return sym
}

export default function MarketControlPage() {
  const { token, admin } = useAdminAuth()
  
  // Pair Selection State
  const [allMarkets, setAllMarkets] = useState([])
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const selectedMarket = allMarkets.find(m => m.symbol === selectedSymbol) || null

  const [channels, setChannels] = useState([])
  const [currentPrices, setCurrentPrices] = useState({})
  
  const [controlStatus, setControlStatus] = useState(null)
  const [globalPriceInput, setGlobalPriceInput] = useState('')
  const [globalVolatilityInput, setGlobalVolatilityInput] = useState('')
  const [marketPumpInput, setMarketPumpInput] = useState('2')
  
  const [resetForm, setResetForm] = useState({ base_price: '', volatility: '', symbol: '', pip_size: '' })
  const [channelForms, setChannelForms] = useState({})
  const [channelPulseInputs, setChannelPulseInputs] = useState({})
  const [channelLoading, setChannelLoading] = useState({})
  const [controlLoading, setControlLoading] = useState(false)

  const hasPermission = (perm) => {
    if (admin?.role === 'admin') return true
    if (!perm) return admin?.role === 'subadmin'
    const perms = admin?.permissions || []
    return perms.includes('all') || perms.includes(perm)
  }

  const loadMarketData = async () => {
    if (!token || !hasPermission('market')) return
    try {
      const [marketsRes, channelsRes] = await Promise.all([
        api(token).get('/api/admin/market-settings'),
        api(token).get('/api/admin/markets')
      ])
      
      const marketsList = marketsRes.data || []
      setAllMarkets(marketsList)
      
      if (!selectedSymbol && marketsList.length > 0) {
        // Default to XAUUSD if available, else first
        const defaultSym = marketsList.find(m => m.symbol === 'XAUUSD') ? 'XAUUSD' : marketsList[0].symbol
        setSelectedSymbol(defaultSym)
      }

      setChannels(Array.isArray(channelsRes.data?.channels) ? channelsRes.data.channels : [])
    } catch (err) {
      console.error('market control load error', err)
      setControlStatus({ message: err?.response?.data?.error || 'Failed to load market data', tone: 'danger' })
    }
  }

  // Live prices can be tracked via socket if needed, but for now we'll just poll or use base prices
  // Since engine doesn't expose all live prices via simple REST easily except through /api/market/state which is for single market usually, 
  // we'll rely on the base_price for control panels, or listen to websocket.

  useEffect(() => {
    if (!token) return
    loadMarketData()
  }, [token, admin])

  useEffect(() => {
    if (!selectedMarket) return
    setGlobalPriceInput(selectedMarket.base_price != null ? String(selectedMarket.base_price) : '')
    setGlobalVolatilityInput(selectedMarket.volatility != null ? String(selectedMarket.volatility) : '')
  }, [selectedSymbol, allMarkets]) // re-sync inputs when selected market changes

  useEffect(() => {
    if (!channels.length) return
    setChannelForms(prev => {
      const base = prev || {}
      const next = {}
      channels.forEach(channel => {
        next[channel.channel] = {
          base_price: base[channel.channel]?.base_price ?? (channel.base_price != null ? String(channel.base_price) : ''),
          volatility: base[channel.channel]?.volatility ?? (channel.volatility != null ? String(channel.volatility) : ''),
          speed: base[channel.channel]?.speed ?? (channel.speed != null ? String(channel.speed) : ''),
          status: base[channel.channel]?.status ?? (channel.status || 'live')
        }
      })
      return next
    })
    setChannelPulseInputs(prev => {
      const base = prev || {}
      const next = {}
      channels.forEach(channel => {
        next[channel.channel] = base[channel.channel] ?? '2'
      })
      return next
    })
  }, [channels])

  const setControlMessage = (message, tone = 'success') => {
    setControlStatus({ message, tone })
  }

  const handleSetMarketPrice = async () => {
    if (!token || !hasPermission('market') || !selectedSymbol) return
    const nextPrice = parseNumberInput(globalPriceInput)
    if (!nextPrice || nextPrice <= 0) {
      setControlMessage('Enter a valid price above 0', 'danger')
      return
    }
    setControlLoading(true)
    try {
      const res = await api(token).post('/api/admin/market/set-price', { symbol: selectedSymbol, price: nextPrice })
      const resolvedPrice = res?.data?.price ?? nextPrice
      setGlobalPriceInput(String(resolvedPrice))
      setControlMessage(`${formatPair(selectedSymbol)} price set to ${currency(resolvedPrice)}`, 'success')
      await loadMarketData()
    } catch (err) {
      console.error('set price error', err)
      setControlMessage(err?.response?.data?.error || 'Failed to update price', 'danger')
    } finally {
      setControlLoading(false)
    }
  }

  const handleSetMarketVolatility = async () => {
    if (!token || !hasPermission('market') || !selectedSymbol) return
    const nextVol = parseNumberInput(globalVolatilityInput)
    if (nextVol === null || nextVol < 0 || nextVol > 1) {
      setControlMessage('Volatility must be between 0 and 1', 'danger')
      return
    }
    setControlLoading(true)
    try {
      await api(token).post('/api/admin/market/set-volatility', { symbol: selectedSymbol, volatility: nextVol })
      setGlobalVolatilityInput(String(nextVol))
      setControlMessage(`${formatPair(selectedSymbol)} volatility set to ${(nextVol * 100).toFixed(2)}%`, 'success')
      await loadMarketData()
    } catch (err) {
      console.error('set volatility error', err)
      setControlMessage(err?.response?.data?.error || 'Failed to update volatility', 'danger')
    } finally {
      setControlLoading(false)
    }
  }

  const handleTogglePause = async (target) => {
    if (!token || !hasPermission('market') || !selectedSymbol) return
    setControlLoading(true)
    try {
      await api(token).post(`/api/admin/market/${target}`, { symbol: selectedSymbol })
      setControlMessage(`${formatPair(selectedSymbol)} market ${target === 'pause' ? 'paused' : 'resumed'}`, 'success')
      await loadMarketData()
    } catch (err) {
      console.error('toggle pause error', err)
      setControlMessage(err?.response?.data?.error || `Failed to ${target} market`, 'danger')
    } finally {
      setControlLoading(false)
    }
  }

  const handleMarketPump = async () => {
    if (!token || !hasPermission('market') || !selectedSymbol) return
    const percentage = parseNumberInput(marketPumpInput)
    if (percentage === null) {
      setControlMessage('Provide a pump percentage', 'danger')
      return
    }
    setControlLoading(true)
    try {
      const res = await api(token).post('/api/admin/market/pump', { symbol: selectedSymbol, percentage })
      const nextPrice = res?.data?.price
      setControlMessage(
        `${formatPair(selectedSymbol)} pumped by ${percentage}%${nextPrice ? ` → ${currency(nextPrice)}` : ''}`,
        'success'
      )
      setMarketPumpInput('2')
      await loadMarketData()
    } catch (err) {
      console.error('market pump error', err)
      setControlMessage(err?.response?.data?.error || 'Failed to pump market', 'danger')
    } finally {
      setControlLoading(false)
    }
  }

  const handleChannelUpdate = async (channelCode) => {
    if (!token || !hasPermission('market')) return
    const upper = channelCode.toUpperCase()
    const form = channelForms[upper] || {}
    const payload = {}
    const basePrice = parseNumberInput(form.base_price)
    if (basePrice !== null && basePrice > 0) payload.base_price = basePrice
    const volatility = parseNumberInput(form.volatility)
    if (volatility !== null) payload.volatility = volatility
    const speed = parseNumberInput(form.speed)
    if (speed !== null) payload.speed = speed
    if (form.status) payload.status = form.status
    if (!Object.keys(payload).length) {
      setControlMessage(`Provide updates for ${upper} before saving`, 'warning')
      return
    }
    setChannelLoading(prev => ({ ...prev, [upper]: true }))
    try {
      await api(token).post(`/api/admin/markets/${upper}`, payload)
      setControlMessage(`${upper} channel updated`, 'success')
      await loadMarketData()
    } catch (err) {
      console.error('update channel error', err)
      setControlMessage(err?.response?.data?.error || `Failed to update ${upper}`, 'danger')
    } finally {
      setChannelLoading(prev => ({ ...prev, [upper]: false }))
    }
  }

  const handleChannelPulse = async (channelCode) => {
    if (!token || !hasPermission('market')) return
    const upper = channelCode.toUpperCase()
    const percentage = parseNumberInput(channelPulseInputs[upper])
    if (percentage === null) {
      setControlMessage('Enter a percentage to pulse', 'danger')
      return
    }
    setChannelLoading(prev => ({ ...prev, [upper]: true }))
    try {
      const res = await api(token).post(`/api/admin/markets/${upper}/pulse`, { percentage })
      const nextPrice = res?.data?.price
      setControlMessage(
        `${upper} pulsed ${percentage}%${nextPrice ? ` → ${currency(nextPrice)}` : ''}`,
        'success'
      )
      await loadMarketData()
    } catch (err) {
      console.error('pulse channel error', err)
      setControlMessage(err?.response?.data?.error || `Failed to pulse ${upper}`, 'danger')
    } finally {
      setChannelLoading(prev => ({ ...prev, [upper]: false }))
    }
  }

  const handleResetMarket = async () => {
    if (!token || admin?.role !== 'admin') return
    const payload = {}
    const basePrice = parseNumberInput(resetForm.base_price)
    if (basePrice !== null && basePrice > 0) payload.base_price = basePrice
    const volatility = parseNumberInput(resetForm.volatility)
    if (volatility !== null && volatility >= 0) payload.volatility = volatility
    if (resetForm.symbol) {
      payload.symbol = resetForm.symbol.trim().toUpperCase()
    }
    const pipSize = parseNumberInput(resetForm.pip_size)
    if (pipSize !== null && pipSize > 0) payload.pip_size = pipSize
    setControlLoading(true)
    try {
      const res = await api(token).post('/api/admin/market/reset', payload)
      setControlMessage(
        `Market reset${res?.data?.settings?.symbol ? ` to ${res.data.settings.symbol}` : ''}`,
        'success'
      )
      setResetForm({ base_price: '', volatility: '', symbol: '', pip_size: '' })
      await loadMarketData()
    } catch (err) {
      console.error('reset market error', err)
      setControlMessage(err?.response?.data?.error || 'Failed to reset market', 'danger')
    } finally {
      setControlLoading(false)
    }
  }

  const controlToneStyles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-slate-200 bg-slate-50 text-slate-600'
  }
  const channelStatusStyles = {
    live: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    paused: 'border-rose-200 bg-rose-50 text-rose-600',
    maintenance: 'border-amber-200 bg-amber-50 text-amber-600'
  }

  const renderMissingPermission = (message) => (
    <div className="rounded-2xl bg-white border border-dashed border-slate-200 p-6 text-sm text-slate-500">
      {message}
    </div>
  )

  if (!hasPermission('market')) {
    return renderMissingPermission('Market permission required to access this page.')
  }

  const marketPaused = Boolean(selectedMarket?.paused)

  return (
    <div id="market-control" className="space-y-6">
      <section>
        <div className="rounded-3xl bg-white p-6 shadow-soft border border-slate-100 space-y-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-400">Market Control</p>
              <div className="text-2xl font-semibold text-slate-900">Hands-on pair controls</div>
              <p className="text-sm text-slate-500">Select a pair to adjust its price, volatility, and behavior manually.</p>
            </div>
            
            <div className="flex flex-col items-end">
              <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">Target Pair</label>
              <select 
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
              >
                {allMarkets.map(m => (
                  <option key={m.symbol} value={m.symbol}>{formatPair(m.symbol)}</option>
                ))}
              </select>
            </div>
          </div>
          
          {controlStatus?.message && (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${controlToneStyles[controlStatus.tone] ?? controlToneStyles.info}`}>
              {controlStatus.message}
            </div>
          )}

          {selectedMarket ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-1 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Base price</div>
                  <div className="text-2xl font-semibold text-slate-900">{currency(selectedMarket.base_price)}</div>
                  <div className="text-xs text-slate-400">{formatPair(selectedMarket.symbol)}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-1 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Volatility</div>
                  <div className="text-2xl font-semibold text-slate-900">
                    {selectedMarket.volatility != null ? `${(selectedMarket.volatility * 100).toFixed(2)}%` : '—'}
                  </div>
                  <div className="text-xs text-slate-400">0 – 100%</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-1 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Status</div>
                  <div className="flex items-center gap-2 mt-1 text-2xl font-semibold">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${marketPaused ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                      {marketPaused ? 'Paused' : 'Live'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-2">{selectedMarket.pip_size ? `${selectedMarket.pip_size} pip size` : 'Standard Pip'}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-white p-5 space-y-5 shadow-sm">
                  <div className="text-sm font-bold text-slate-900">Modify Configuration</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Base price</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={globalPriceInput}
                        onChange={(event) => setGlobalPriceInput(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Volatility</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={globalVolatilityInput}
                        onChange={(event) => setGlobalVolatilityInput(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSetMarketPrice}
                      disabled={controlLoading}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {controlLoading ? 'Applying…' : 'Update Price'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSetMarketVolatility}
                      disabled={controlLoading}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {controlLoading ? 'Applying…' : 'Update Volatility'}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-5 space-y-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">Direct Intervention</span>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Force Pump / Dump (%)
                      <div className="mt-1 flex gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={marketPumpInput}
                          onChange={(event) => setMarketPumpInput(event.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-inner focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleMarketPump}
                          disabled={controlLoading}
                          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-60 hover:bg-indigo-700 transition"
                        >
                          {controlLoading ? 'Executing…' : 'Execute'}
                        </button>
                      </div>
                    </label>
                    <p className="text-[11px] text-slate-400 font-medium">Use positive values to pump, negative to dump.</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleTogglePause('pause')}
                        disabled={controlLoading || marketPaused}
                        className="flex-1 rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Freeze Market
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePause('resume')}
                        disabled={controlLoading || !marketPaused}
                        className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resume Market
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-slate-500">Loading market configurations...</div>
          )}

          {/* Legacy Channels Section */}
          <div className="space-y-4 pt-8">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Legacy Channels & Feeds</div>
            <div className="grid gap-4 md:grid-cols-2">
              {channels.map(channel => (
                <div key={channel.channel} className="rounded-3xl border border-slate-100 bg-white p-4 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">{channel.channel}</div>
                      <div className="text-sm font-semibold text-slate-900">{channel.label || channel.channel}</div>
                      <div className="text-xs text-slate-500">{channel.description}</div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${channelStatusStyles[channel.status] ?? 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      {(channel.status ?? 'live').toUpperCase()}
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Base price
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={channelForms[channel.channel]?.base_price ?? ''}
                        onChange={(event) => setChannelForms(prev => ({
                          ...prev,
                          [channel.channel]: {
                            ...prev[channel.channel],
                            base_price: event.target.value
                          }
                        }))}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-inner"
                      />
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Volatility
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={channelForms[channel.channel]?.volatility ?? ''}
                        onChange={(event) => setChannelForms(prev => ({
                          ...prev,
                          [channel.channel]: {
                            ...prev[channel.channel],
                            volatility: event.target.value
                          }
                        }))}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-inner"
                      />
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Speed
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={channelForms[channel.channel]?.speed ?? ''}
                        onChange={(event) => setChannelForms(prev => ({
                          ...prev,
                          [channel.channel]: {
                            ...prev[channel.channel],
                            speed: event.target.value
                          }
                        }))}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-inner"
                      />
                    </label>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Status
                      <select
                        value={channelForms[channel.channel]?.status || channel.status || 'live'}
                        onChange={(event) => setChannelForms(prev => ({
                          ...prev,
                          [channel.channel]: {
                            ...prev[channel.channel],
                            status: event.target.value
                          }
                        }))}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-inner"
                      >
                        <option value="live">Live</option>
                        <option value="paused">Paused</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleChannelUpdate(channel.channel)}
                      disabled={Boolean(channelLoading[channel.channel])}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {channelLoading[channel.channel] ? 'Saving…' : 'Apply'}
                    </button>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={channelPulseInputs[channel.channel] ?? '2'}
                        onChange={(event) => setChannelPulseInputs(prev => ({
                          ...prev,
                          [channel.channel]: event.target.value
                        }))}
                        className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700 shadow-inner text-center"
                      />
                      <button
                        type="button"
                        onClick={() => handleChannelPulse(channel.channel)}
                        disabled={Boolean(channelLoading[channel.channel])}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {channelLoading[channel.channel] ? '…' : 'Pulse'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Global Reset */}
          {admin?.role === 'admin' && (
            <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-5 space-y-4 shadow-sm mt-8">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">Nuclear Option: Global Market Reset</div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Base price
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={resetForm.base_price}
                    onChange={(event) => setResetForm(prev => ({ ...prev, base_price: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Volatility
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={resetForm.volatility}
                    onChange={(event) => setResetForm(prev => ({ ...prev, volatility: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Symbol
                  <input
                    type="text"
                    value={resetForm.symbol}
                    onChange={(event) => setResetForm(prev => ({ ...prev, symbol: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Pip size
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={resetForm.pip_size}
                    onChange={(event) => setResetForm(prev => ({ ...prev, pip_size: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleResetMarket}
                disabled={controlLoading}
                className="w-full rounded-xl bg-rose-600 px-4 py-3 text-xs font-bold uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-60 hover:bg-rose-700 transition"
              >
                {controlLoading ? 'Resetting…' : 'WIPE AND RESET MARKET HISTORY'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
