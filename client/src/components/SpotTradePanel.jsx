import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../store'

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

export default function SpotTradePanel({ onSelectPrice }) {
  const { token } = useAuth()
  const [markets, setMarkets] = useState([])
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orderSide, setOrderSide] = useState('buy')
  const [orderType, setOrderType] = useState('limit')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [sliderValue, setSliderValue] = useState(0)
  const [tpEnabled, setTpEnabled] = useState(false)
  const [icebergEnabled, setIcebergEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState('orders')
  const [showPairSheet, setShowPairSheet] = useState(false)
  const [orders, setOrders] = useState([])
  const [holdings, setHoldings] = useState({ spot: [], usd: { available: 0, locked: 0 } })
  const [tradeLoading, setTradeLoading] = useState(false)
  const quickPercents = [25, 50, 75, 100]
  const sliderValueRef = useRef(0)

  const tabs = useMemo(() => ([
    {
      key: 'orders',
      label: `Open Orders (${orders.filter(o => o.status === 'open').length})`,
      headers: ['Pair', 'Type', 'Price', 'Amount', 'Filled', 'Status', 'Action'],
      description: 'No open orders yet. Submit a trade to see it appear here instantly.'
    },
    {
      key: 'holdings',
      label: 'Holdings',
      headers: ['Asset', 'Balance', 'Available', 'Value (USD)'],
      description: 'Connect your spot wallet to track balances and mark-to-market values.'
    },
    {
      key: 'grid',
      label: 'Spot Grid',
      headers: [],
      description: 'Grid trading unlocks soon. Configure price bands and auto-orders once released.'
    }
  ]), [])

  const headerNav = useMemo(() => ['Convert', 'Spot', 'Margin', 'Bots', 'Copy', 'Buy', 'P2P'], [])

  useEffect(() => {
    async function loadMarkets() {
      try {
        setLoading(true)
        const res = await api(token).get('/api/spot/markets')
        const list = res.data?.markets || []
        setMarkets(list)
        if (list.length) {
          setSelectedSymbol(prev => prev || list[0].symbol)
        }
        setError('')
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load spot markets')
      } finally {
        setLoading(false)
      }
    }
    loadMarkets()
    const interval = setInterval(loadMarkets, 45000)
    return () => clearInterval(interval)
  }, [token])

  useEffect(() => {
    async function loadUserData() {
      if (!token) return
      try {
        const [ordersRes, holdingsRes] = await Promise.all([
          api(token).get('/api/spot/orders'),
          api(token).get('/api/spot/holdings')
        ])
        setOrders(ordersRes.data?.orders || [])
        setHoldings(holdingsRes.data?.balances || { spot: [], usd: { available: 0, locked: 0 } })
      } catch (err) {
        console.error('failed to load spot user data', err)
      }
    }
    loadUserData()
    const interval = setInterval(loadUserData, 10000)
    return () => clearInterval(interval)
  }, [token])

  useEffect(() => {
    const market = markets.find(m => m.symbol === selectedSymbol)
    if (market) {
      setPrice(String(market.price))
      onSelectPrice?.(market)
      if (sliderValueRef.current > 0) {
        setAmount(computeAmountFromPercent(sliderValueRef.current, market))
      }
    }
  }, [selectedSymbol, markets, onSelectPrice])

  useEffect(() => {
    sliderValueRef.current = sliderValue
  }, [sliderValue])

  const selectedMarket = useMemo(
    () => markets.find(m => m.symbol === selectedSymbol) || null,
    [markets, selectedSymbol]
  )

  function computeAmountFromPercent(percent, market = selectedMarket) {
    if (!market) return '0.0000'
    const marketPrice = Number(market.price)
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      return (percent / 100).toFixed(4)
    }
    const baseAmount = (percent / 100) * (1 / marketPrice)
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) return '0.0000'
    return baseAmount >= 1 ? baseAmount.toFixed(4) : baseAmount.toFixed(6)
  }

  const sliderTrackStyle = useMemo(() => ({
    background: `linear-gradient(90deg, rgba(16,185,129,0.8) 0%, rgba(16,185,129,0.8) ${sliderValue}%, rgba(226,232,240,0.8) ${sliderValue}%, rgba(226,232,240,0.8) 100%)`
  }), [sliderValue])

  function handleSliderChange(value) {
    const normalized = Math.min(100, Math.max(0, value))
    setSliderValue(normalized)
    setAmount(computeAmountFromPercent(normalized))
  }

  function handleQuickFill(percent) {
    handleSliderChange(percent)
  }

  function handleSelectSymbol(symbol) {
    setSelectedSymbol(symbol)
    setShowPairSheet(false)
  }

  async function handleTrade() {
    if (!selectedMarket || !amount) return
    try {
      setTradeLoading(true)
      setError('')
      await api(token).post('/api/spot/trade', {
        symbol: selectedMarket.symbol,
        side: orderSide,
        type: orderType,
        price: orderType === 'market' ? undefined : Number(price),
        amount: Number(amount)
      })
      alert(`Spot ${orderSide.toUpperCase()} order placed successfully.`)
      setAmount('')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to place order')
    } finally {
      setTradeLoading(false)
    }
  }

  async function handleCancelOrder(orderId) {
    try {
      await api(token).delete(`/api/spot/orders/${orderId}`)
      alert('Order canceled successfully')
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to cancel order')
    }
  }

  const syntheticOrderbook = useMemo(() => {
    if (!selectedMarket) return { asks: [], bids: [] }
    const mid = Number(selectedMarket.price) || 0
    const asks = Array.from({ length: 12 }).map((_, idx) => {
      const priceLevel = mid * (1 + (idx + 1) * 0.0008)
      const amountLevel = Math.max(0.0005, mid / priceLevel) * (1 + idx * 0.2)
      return { price: priceLevel, amount: amountLevel }
    })
    const bids = Array.from({ length: 12 }).map((_, idx) => {
      const priceLevel = mid * (1 - (idx + 1) * 0.0008)
      const amountLevel = Math.max(0.0005, mid / priceLevel) * (1 + idx * 0.2)
      return { price: priceLevel, amount: amountLevel }
    })
    return { asks: asks.reverse(), bids }
  }, [selectedMarket])

  const changeClass = selectedMarket && Number(selectedMarket.change_24h) >= 0 ? 'text-emerald-500' : 'text-rose-500'
  const estimatedTotal = useMemo(() => {
    const p = Number(price)
    const a = Number(amount || (sliderValue / 100) * 1)
    if (!Number.isFinite(p) || !Number.isFinite(a)) return '0.00'
    return (p * a).toFixed(2)
  }, [price, amount, sliderValue])

  const activeTabMeta = useMemo(
    () => tabs.find(tab => tab.key === activeTab) || tabs[0],
    [tabs, activeTab]
  )

  const userAvailable = useMemo(() => {
    if (!selectedMarket) return 0
    if (orderSide === 'buy') {
      return holdings.usd?.available || 0
    } else {
      const asset = holdings.spot?.find(s => s.asset === selectedMarket.base_asset)
      return asset?.available || 0
    }
  }, [holdings, selectedMarket, orderSide])

  const availableDisplay = orderSide === 'buy' ? formatCurrency(userAvailable) : `${userAvailable.toFixed(6)} ${selectedMarket?.base_asset || ''}`
  
  const maxAmount = useMemo(() => {
    if (!selectedMarket) return 0
    if (orderSide === 'buy') {
      const p = Number(price) > 0 ? Number(price) : Number(selectedMarket.price)
      if (!p) return 0
      return userAvailable / p
    } else {
      return userAvailable
    }
  }, [userAvailable, price, selectedMarket, orderSide])

  function renderTabContent() {
    if (!activeTabMeta) return null
    if (activeTabMeta.key === 'grid') {
      return (
        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-6 py-8 text-center text-sm text-emerald-600 shadow-inner">
          {activeTabMeta.description}
        </div>
      )
    }

    if (activeTabMeta.key === 'orders') {
      const openOrders = orders.filter(o => o.status === 'open')
      return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm text-slate-600">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  {activeTabMeta.headers.map(header => (
                    <th
                      key={header}
                      className={`px-4 py-3 font-semibold ${header === 'Pair' ? 'text-left' : 'text-right'}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                      {activeTabMeta.description}
                    </td>
                  </tr>
                ) : (
                  openOrders.map(order => (
                    <tr key={order.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{order.symbol}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${order.side === 'buy' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {order.type} {order.side}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{order.type === 'market' ? 'Market' : order.price}</td>
                      <td className="px-4 py-3 text-right">{order.amount}</td>
                      <td className="px-4 py-3 text-right">{order.filled_amount}</td>
                      <td className="px-4 py-3 text-right text-amber-500 uppercase text-[10px] tracking-wider font-semibold">{order.status}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleCancelOrder(order.id)} className="text-xs text-rose-500 hover:underline">Cancel</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    if (activeTabMeta.key === 'holdings') {
      const allHoldings = holdings.spot || []
      return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm text-slate-600">
              <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  {activeTabMeta.headers.map(header => (
                    <th
                      key={header}
                      className={`px-4 py-3 font-semibold ${header === 'Asset' ? 'text-left' : 'text-right'}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">USD</td>
                  <td className="px-4 py-3 text-right">{formatCurrency((holdings.usd?.available || 0) + (holdings.usd?.locked || 0))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(holdings.usd?.available || 0)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency((holdings.usd?.available || 0) + (holdings.usd?.locked || 0))}</td>
                </tr>
                {allHoldings.length === 0 ? null : (
                  allHoldings.map(asset => {
                    const market = markets.find(m => m.base_asset === asset.asset && m.quote_asset === 'USD')
                    const price = market ? market.price : 0
                    const total = asset.available + asset.locked
                    const valueUsd = total * price
                    return (
                      <tr key={asset.asset} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{asset.asset}</td>
                        <td className="px-4 py-3 text-right">{total.toFixed(6)}</td>
                        <td className="px-4 py-3 text-right">{asset.available.toFixed(6)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(valueUsd)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="space-y-6 text-slate-900 max-w-full overflow-x-hidden">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-400">
          <nav className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:w-auto sm:justify-start">
            {headerNav.map(link => (
              <span
                key={link}
                className={`cursor-pointer transition ${link === 'Spot' ? 'text-emerald-500 font-semibold' : 'hover:text-slate-700'}`}
              >
                {link}
              </span>
            ))}
          </nav>
          {loading && <div className="text-[11px] text-slate-500">Refreshing…</div>}
        </div>
        <div className="text-sm text-slate-500">Top 100 Binance pairs mirrored for demo trading.</div>
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
            {error}
          </div>
        )}

        <div className="grid w-full gap-4 lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)] items-start">
          <div className="rounded-2xl border border-slate-200 bg-white w-full overflow-hidden min-w-0">
            <div className="flex items-center justify-between px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-slate-500 border-b border-slate-200">
              <span>Order Book</span>
              <div className="text-[10px] text-slate-400">Depth · Demo</div>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="space-y-1">
                {syntheticOrderbook.asks.map((row, idx) => (
                  <div key={`ask-${idx}`} className="flex items-center justify-between text-[12px] text-rose-500">
                    <span className="font-semibold">{row.price.toFixed(2)}</span>
                    <span>{formatCoin(row.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="py-3 border-y border-slate-200 text-center space-y-1">
                <div className="text-xl font-bold tracking-tight text-slate-900">
                  {selectedMarket ? selectedMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
                </div>
                <div className={`text-[12px] font-semibold ${changeClass}`}>
                  {selectedMarket ? `${Number(selectedMarket.change_24h) >= 0 ? '+' : ''}${Number(selectedMarket.change_24h).toFixed(2)}%` : '--'}
                </div>
              </div>
              <div className="space-y-1">
                {syntheticOrderbook.bids.map((row, idx) => (
                  <div key={`bid-${idx}`} className="flex items-center justify-between text-[12px] text-emerald-500">
                    <span className="font-semibold">{row.price.toFixed(2)}</span>
                    <span>{formatCoin(row.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 w-full overflow-hidden min-w-0">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
                  <button
                    type="button"
                    onClick={() => setShowPairSheet(true)}
                    className="inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 sm:w-56"
                  >
                    <span>{selectedSymbol || 'Select pair'}</span>
                    <span className="text-xs text-slate-400">▾</span>
                  </button>
                  {selectedMarket && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        24h Change
                        <span className={`font-semibold ${changeClass}`}>
                          {Number(selectedMarket.change_24h) >= 0 ? '+' : ''}{Number(selectedMarket.change_24h).toFixed(2)}%
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        Volume
                        <span className="font-semibold text-slate-700">{formatCurrency(selectedMarket.volume_24h)}</span>
                      </span>
                    </div>
                  )}
                </div>
                {selectedMarket && (
                  <div className="order-3 w-full space-y-1 text-left sm:order-none sm:w-auto sm:text-right sm:min-w-[160px]">
                    <div className="text-2xl font-semibold text-slate-900">
                      {selectedMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Last Price ({selectedMarket.quote_asset})</div>
                  </div>
                )}
              </div>

              <div className="flex w-full rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] uppercase tracking-[0.12em] font-semibold">
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-1.5 transition ${orderSide === 'buy' ? 'bg-emerald-500 text-white shadow' : 'text-slate-600 hover:text-emerald-500'}`}
                  onClick={() => setOrderSide('buy')}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-1.5 transition ${orderSide === 'sell' ? 'bg-rose-500 text-white shadow' : 'text-slate-600 hover:text-rose-500'}`}
                  onClick={() => setOrderSide('sell')}
                >
                  Sell
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${orderType === 'limit' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setOrderType('limit')}
                >
                  Limit
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${orderType === 'market' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setOrderType('market')}
                >
                  Market
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${orderType === 'stop' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  onClick={() => setOrderType('stop')}
                >
                  Stop
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-500 uppercase tracking-[0.12em]">Price ({selectedMarket?.quote_asset || 'USD'})</label>
              <div className="flex items-center gap-2">
                <input
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                  placeholder="0.00"
                />
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600"
                    onClick={() => setPrice(prev => String(Number(prev || selectedMarket?.price || 0) + 1))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-rose-300 hover:text-rose-500"
                    onClick={() => setPrice(prev => String(Math.max(0, Number(prev || selectedMarket?.price || 0) - 1)))}
                  >
                    -
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-500 uppercase tracking-[0.12em]">Amount ({selectedMarket?.base_asset || 'BTC'})</label>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Amount Slider</span>
                <span>{sliderValue}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={sliderValue}
                onChange={e => handleSliderChange(Number(e.target.value))}
                style={sliderTrackStyle}
                className="w-full h-2 cursor-pointer rounded-full border-none bg-slate-200 outline-none transition focus:ring-2 focus:ring-emerald-300"
              />
              <div className="flex items-center justify-between gap-2">
                {quickPercents.map(percent => (
                  <button
                    type="button"
                    key={percent}
                    onClick={() => handleQuickFill(percent)}
                    className={`flex-1 rounded-full border text-xs font-semibold transition ${
                      sliderValue === percent
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-600 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-500'
                    }`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span>Order Settings</span>
                <span>{orderType === 'market' ? 'Market' : 'Limit'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-600">
                  <input type="checkbox" checked={tpEnabled} onChange={e => setTpEnabled(e.target.checked)} /> TP/SL
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-slate-600">
                  <input type="checkbox" checked={icebergEnabled} onChange={e => setIcebergEnabled(e.target.checked)} /> Iceberg
                </label>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-slate-600">
                <div className="space-y-0.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Available</dt>
                  <dd className="font-semibold text-slate-700">{availableDisplay}</dd>
                </div>
                <div className="space-y-0.5 text-right">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{orderSide === 'buy' ? 'Max Buy' : 'Max Sell'}</dt>
                  <dd className="font-semibold text-slate-700">{formatCoin(maxAmount)} {selectedMarket?.base_asset}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Est. Fee</dt>
                  <dd className="font-semibold text-slate-700">—</dd>
                </div>
                <div className="space-y-0.5 text-right">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Total ({selectedMarket?.quote_asset || 'USD'})</dt>
                  <dd className="text-sm font-bold text-slate-900">{estimatedTotal}</dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              disabled={tradeLoading}
              className={`w-full rounded-2xl py-3 text-sm font-semibold text-white transition ${
                orderSide === 'buy'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:brightness-110'
                  : 'bg-gradient-to-r from-rose-500 to-rose-400 hover:brightness-110'
              } disabled:opacity-50`}
              onClick={handleTrade}
            >
              {tradeLoading ? 'Processing...' : (orderSide === 'buy' ? `Buy ${selectedMarket?.base_asset || ''}` : `Sell ${selectedMarket?.base_asset || ''}`)}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white text-slate-900 p-4 sm:p-5 space-y-4 w-full overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-1">
          <nav className="flex w-full flex-wrap items-center justify-center gap-3 text-sm font-semibold sm:w-auto sm:justify-start">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative pb-3 transition ${activeTab === tab.key ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab.label}
                {activeTab === tab.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-emerald-500" />}
              </button>
            ))}
          </nav>
          <button type="button" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-emerald-500">
            Export CSV
          </button>
        </div>
        {renderTabContent()}
      </div>

      {showPairSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/50 backdrop-blur-sm">
          <div className="mt-auto rounded-t-3xl border-t border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 text-slate-900">
              <div>
                <div className="text-sm font-semibold">Markets</div>
                <div className="text-[12px] text-slate-500">Select from the full pair list</div>
              </div>
              <button
                type="button"
                onClick={() => setShowPairSheet(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto px-5 pb-6 space-y-2">
              {markets.map(market => {
                const pct = Number(market.change_24h)
                const pctClass = !Number.isFinite(pct) ? 'text-slate-400' : pct >= 0 ? 'text-emerald-500' : 'text-rose-500'
                const active = selectedSymbol === market.symbol
                return (
                  <button
                    key={market.symbol}
                    onClick={() => handleSelectSymbol(market.symbol)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      active ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <img
                        src={market.logo_url}
                        alt={market.base_asset}
                        className="h-8 w-8 rounded-full border border-slate-100 bg-white object-contain"
                        onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                      />
                      <span className="flex flex-col">
                        <span className="font-semibold">{market.symbol}</span>
                        <span className="text-[12px] text-slate-400">{formatCurrency(market.price)}</span>
                      </span>
                    </span>
                    <span className={`text-sm font-semibold ${pctClass}`}>
                      {Number.isFinite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
