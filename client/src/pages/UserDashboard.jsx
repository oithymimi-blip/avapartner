import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import CandlestickChart from '../components/CandlestickChart'
import OrderTicket from '../components/OrderTicket'
import BinaryTradePanel from '../components/BinaryTradePanel'
import SpotTradePanel from '../components/SpotTradePanel'
import CopyTradePanel from '../components/CopyTradePanel'
import AITradePanel from '../components/AITradePanel'
import ErrorBoundary from '../components/ErrorBoundary'
import InstallAppButton from '../components/InstallAppButton'
import { api } from '../api'
import { useAuth } from '../store'
import { useAccount } from '../accountStore'
import { socket } from '../socket'

const defaultBase = (() => {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    if (import.meta.env.DEV) {
      return `${protocol}//${hostname}:4000`
    }
    return ''
  }
  return 'http://localhost:4000'
})()

const API_BASE = import.meta.env.VITE_API_BASE || defaultBase

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function formatCurrency(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '$0.00'
  const abs = Math.abs(num)
  if (abs > 0 && abs < 0.01) {
    return `${num < 0 ? '-' : ''}$${abs.toFixed(4)}`
  }
  return currency.format(num)
}

function formatPair(sym) {
  if (!sym) return ''
  const str = typeof sym === 'string' ? sym : (sym.symbol ? String(sym.symbol) : String(sym))
  if (str === 'USOIL') return 'USOIL/USD'
  if (str.endsWith('USD')) {
    return `${str.slice(0, -3)}/USD`
  }
  return str
}

const customLogos = {
  'XAUUSD': 'https://cryptologos.cc/logos/tether-gold-xaut-logo.svg',
  'EURUSD': 'https://cdn-icons-png.flaticon.com/512/197/197615.png',
  'GBPUSD': 'https://cdn-icons-png.flaticon.com/512/197/197374.png',
  'USOIL': 'https://cdn-icons-png.flaticon.com/512/3233/3233342.png',
}

function getLogoUrl(sym) {
  if (!sym) return ''
  const str = typeof sym === 'string' ? sym : (sym.symbol ? String(sym.symbol) : String(sym))
  if (customLogos[str]) return customLogos[str]
  let base = str
  if (str.endsWith('USD')) base = str.slice(0, -3)
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${base.toLowerCase()}.svg`
}

export default function UserDashboard() {
  const { token, user } = useAuth()
  const location = useLocation()
  const [state, setState] = useState(null)
  const [currentPrice, setCurrentPrice] = useState(null)
  const [openTrades, setOpenTrades] = useState([])
  const [recentTrades, setRecentTrades] = useState([])
  const [balances, setBalances] = useState({ available: 0, locked: 0, total: 0 })
  const [equity, setEquity] = useState(0)
  const [openPnl, setOpenPnl] = useState(0)
  const [openPips, setOpenPips] = useState(0)
  const [initialBalance, setInitialBalance] = useState(0)
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [pipSize, setPipSize] = useState(0.0001)
  const [closingAll, setClosingAll] = useState(false)
  const [closingTradeIds, setClosingTradeIds] = useState([])
  const [marginUsed, setMarginUsed] = useState(0)
  const [freeMargin, setFreeMargin] = useState(0)
  const [marginLevel, setMarginLevel] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const setAccountSummary = useAccount(state => state.setSummary)
  const clearAccountSummary = useAccount(state => state.clear)
  const [timeframe, setTimeframe] = useState('15s')
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('tab') || 'forex'
  })
  const [activeFeatures, setActiveFeatures] = useState([
    { key: 'forex', label: 'Forex' },
    { key: 'binary', label: 'Binary' },
    { key: 'spot', label: 'Spot' },
    { key: 'web3', label: 'Web3' },
    { key: 'copytrading', label: 'Copy Trading' },
    { key: 'ai_trade', label: 'AI Trade' }
  ])

  useEffect(() => {
    async function loadFeatures() {
      try {
        const res = await fetch(`${API_BASE}/api/features`)
        const data = await res.json()
        const active = data.filter(f => f.active === 1)
        if (active.length > 0) {
          setActiveFeatures(active)
          setMode(prev => {
            // Respect a tab deep-link param; only fall back if requested tab isn't active
            const tabParam = new URLSearchParams(window.location.search).get('tab')
            if (tabParam && active.find(f => f.key === tabParam)) return tabParam
            if (!active.find(f => f.key === prev)) return active[0].key
            return prev
          })
        } else {
          setActiveFeatures([])
        }
      } catch (err) {
        console.error('Failed to load features', err)
      }
    }
    loadFeatures()
  }, [])

  const [states, setStates] = useState([])
  const [marketPrices, setMarketPrices] = useState({})
  const [selectedSymbol, setSelectedSymbol] = useState('XAUUSD')

  useEffect(() => {
    async function loadStates() {
      try {
        const res = await fetch(`${API_BASE}/api/market/states`)
        const data = await res.json()
        
        const topPriority = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USOIL', 'BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'US30', 'NAS100'];
        if (Array.isArray(data)) {
          data.sort((a, b) => {
             const aSym = a?.symbol || '';
             const bSym = b?.symbol || '';
             const aIdx = topPriority.indexOf(aSym);
             const bIdx = topPriority.indexOf(bSym);
             if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
             if (aIdx !== -1) return -1;
             if (bIdx !== -1) return 1;
             return aSym.localeCompare(bSym); 
          });
        }
        
        setStates(data)
        
        const prices = {}
        data.forEach(s => {
          if (s.currentPrice != null) prices[s.symbol] = s.currentPrice
        })
        setMarketPrices(prev => ({ ...prev, ...prices }))

        const activeState = data.find(s => s.symbol === selectedSymbol) || data[0]
        if (activeState) {
          setState(activeState)
          setCurrentPrice(activeState?.currentPrice ?? null)
        }
      } catch (err) {
        console.error('Failed to load market states', err)
      }
    }
    loadStates()

    // Poll for state updates
    const interval = setInterval(loadStates, 10000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  const applyOverview = useCallback((payload) => {
    if (!payload) return
    if (payload.currentPrice != null) {
      setCurrentPrice(payload.currentPrice)
    }
    if (payload.openTrades) {
      setOpenTrades(payload.openTrades)
    }
    if (payload.recentTrades) {
      setRecentTrades(payload.recentTrades)
    }
    if (payload.balance) {
      setBalances({
        available: Number(payload.balance.available ?? 0),
        locked: Number(payload.balance.locked ?? 0),
        total: Number(payload.balance.total ?? (Number(payload.balance.available ?? 0) + Number(payload.balance.locked ?? 0)))
      })
    }
    if (payload.equity != null) {
      setEquity(Number(payload.equity))
    }
    if (payload.openPnl != null) {
      setOpenPnl(Number(payload.openPnl))
    }
    if (payload.openPips != null) {
      setOpenPips(Number(payload.openPips))
    }
    if (payload.initialBalance != null) {
      setInitialBalance(Number(payload.initialBalance))
    }
    if (payload.pipSize != null) {
      setPipSize(Number(payload.pipSize))
    }
    if (payload.marginUsed != null) {
      setMarginUsed(Number(payload.marginUsed))
    }
    if (payload.freeMargin != null) {
      setFreeMargin(Number(payload.freeMargin))
    }
    if (payload.marginLevel != null) {
      setMarginLevel(Number(payload.marginLevel))
    }
    setAccountSummary(payload)
  }, [setAccountSummary])

  const refreshTrades = useCallback(async () => {
    if (!token) {
      setOpenTrades([])
      setRecentTrades([])
      setBalances({ available: 0, locked: 0, total: 0 })
      setEquity(0)
      setOpenPnl(0)
      setOpenPips(0)
      setMarginUsed(0)
      setFreeMargin(0)
      setMarginLevel(null)
      clearAccountSummary()
      return
    }
    setLoadingTrades(true)
    try {
      const res = await api(token).get('/api/trades/overview', { params: { limit: 100 } })
      applyOverview(res.data)
    } catch (err) {
      console.error('Failed to load trades', err)
    } finally {
      setLoadingTrades(false)
    }
  }, [token, applyOverview, clearAccountSummary])

  const handleBinaryBalance = useCallback((snapshot) => {
    if (!snapshot) return
    const availableVal = Number(snapshot.available ?? 0)
    const lockedVal = Number(snapshot.locked ?? 0)
    const totalValRaw = snapshot.total != null ? Number(snapshot.total) : availableVal + lockedVal
    const totalVal = Math.round(totalValRaw * 100) / 100
    const freeVal = Math.round((totalVal - lockedVal) * 100) / 100
    const marginLevelVal = lockedVal > 0 ? Math.round(((totalVal / lockedVal) * 100) * 100) / 100 : null

    setBalances({ available: availableVal, locked: lockedVal, total: totalVal })
    setEquity(totalVal)
    setMarginUsed(Math.round(lockedVal * 100) / 100)
    setFreeMargin(freeVal)
    setMarginLevel(marginLevelVal)

    const previous = useAccount.getState().summary || {}
    setAccountSummary({
      ...previous,
      balance: { available: availableVal, locked: lockedVal, total: totalVal },
      equity: totalVal,
      marginUsed: Math.round(lockedVal * 100) / 100,
      freeMargin: freeVal,
      marginLevel: marginLevelVal
    })
  }, [setAccountSummary])

  useEffect(() => {
    if (token) {
      refreshTrades()
    }
  }, [token, refreshTrades])

  useEffect(() => {
    const handleTradeClosed = (payload) => {
      if (payload?.userId === user?.id) {
        refreshTrades()
      }
    }
    const handleGlobalTick = (msg) => {
      setMarketPrices(prev => ({
        ...prev,
        [msg.symbol]: msg.price
      }))
    }
    socket.on('trade_closed', handleTradeClosed)
    socket.on('tick', handleGlobalTick)
    return () => {
      socket.off('trade_closed', handleTradeClosed)
      socket.off('tick', handleGlobalTick)
    }
  }, [user?.id, refreshTrades])

  useEffect(() => {
    if (!Number.isFinite(currentPrice)) {
      setOpenPnl(0)
      setOpenPips(0)
      setEquity(Number((balances.available + balances.locked).toFixed(2)))
      return
    }
    let totalOpenPnl = 0
    let totalOpenPips = 0
    for (const t of openTrades) {
      const totalQty = Number(t.qty || 0)
      const remainingQty = Number(t.remaining_qty ?? totalQty)
      if (!totalQty || !remainingQty) continue
      const entry = Number(t.price || 0)
      const direction = t.side === 'sell' ? -1 : 1
      const tradePipSize = Number(t.pip_size ?? pipSize)
      const tradeMarketPrice = marketPrices[t.symbol] ?? Number(t.price || 0)
      const pipDiff = tradePipSize > 0 ? ((tradeMarketPrice - entry) / tradePipSize) * direction : 0
      const tradePnl = (tradeMarketPrice - entry) * direction * remainingQty
      totalOpenPips += pipDiff
      totalOpenPnl += tradePnl
    }
    const computedEquity = balances.available + balances.locked + totalOpenPnl
    setOpenPnl(Number(totalOpenPnl.toFixed(2)))
    setOpenPips(Number(totalOpenPips.toFixed(2)))
    setEquity(Number(computedEquity.toFixed(2)))

    const currentSummary = useAccount.getState().summary || {}
    setAccountSummary({
      ...currentSummary,
      equity: computedEquity,
      openPnl: totalOpenPnl
    })
  }, [currentPrice, openTrades, balances, pipSize, setAccountSummary])

  const displayPrice = currentPrice ?? state?.currentPrice
  const numericDisplayPrice = Number(displayPrice)
  const volatility = Number(state?.volatility ?? 0)
  const marketPaused = Boolean(state?.paused)
  const lastUpdated = state?.updated_at ? new Date(state.updated_at) : null
  const volatilityLabel = Number.isFinite(volatility) ? `${(volatility * 100).toFixed(1)}%` : '--'
  const lastUpdatedLabel = lastUpdated
    ? `${lastUpdated.toLocaleDateString()} ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '--'
  const marketStatusLabel = marketPaused ? 'Paused' : 'Live'
  const chartSummary = [
    {
      label: 'Price',
      value: Number.isFinite(numericDisplayPrice) ? numericDisplayPrice.toFixed(2) : '--',
      tone: 'primary',
      monospace: true
    },
    { label: 'Market', value: marketStatusLabel, tone: marketPaused ? 'danger' : 'success' },
    { label: 'Updated', value: lastUpdatedLabel, tone: 'muted' }
  ]
  const enrichedTrades = useMemo(() => {
    return (recentTrades || []).map(trade => {
      const qty = Number(trade.qty || 0)
      const remaining = Number(trade.remaining_qty ?? qty)
      const isOpen = trade.status === 'open' && remaining > 1e-8
      const entryPrice = Number(trade.price || 0)
      const exitPrice = Number(trade.exit_price || trade.price || 0)
      const tradePipSize = Number(trade.pip_size ?? pipSize)
      const totalNotional = Number(trade.notional ?? entryPrice * qty)
      const stakeAmount = Number(trade.stake_amount ?? totalNotional)
      const remainingStake = Number(trade.pip_value ?? (isOpen ? stakeAmount : 0))
      const tradeMarketPrice = marketPrices[trade.symbol] ?? exitPrice
      const effectivePrice = isOpen && Number.isFinite(tradeMarketPrice)
        ? tradeMarketPrice
        : exitPrice
      const direction = trade.side === 'sell' ? -1 : 1
      const pipDiff = tradePipSize > 0 ? ((effectivePrice - entryPrice) / tradePipSize) * direction : 0
      const livePips = isOpen ? pipDiff : Number(trade.pips_realized ?? pipDiff)
      const pnl = isOpen ? (effectivePrice - entryPrice) * direction * remaining : Number(trade.pnl ?? ((effectivePrice - entryPrice) * direction * qty))
      const realizedPips = Number(trade.pips_realized ?? 0)
      return {
        ...trade,
        qty,
        remaining,
        isOpen,
        stakeAmount,
        remainingStake,
        totalNotional,
        pipValue: remainingStake,
        realizedPips,
        displayPrice: Number.isFinite(effectivePrice) ? effectivePrice : null,
        livePnl: pnl,
        livePips
      }
    })
  }, [recentTrades, currentPrice, pipSize])

  const closingSet = useMemo(() => new Set(closingTradeIds), [closingTradeIds])
  const hasOpenPositions = openTrades.some(t => Number(t.remaining_qty || 0) > 1e-8)
  const openPipsLabel = Number.isFinite(openPips) ? `${openPips >= 0 ? '+' : ''}${openPips.toFixed(2)} pips` : '--'

  const itemsPerPage = 10
  const totalPages = Math.ceil(enrichedTrades.length / itemsPerPage)
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return enrichedTrades.slice(start, start + itemsPerPage)
  }, [enrichedTrades, currentPage])

  async function handleCloseTrade(id) {
    if (!token || closingSet.has(id)) return
    setClosingTradeIds(prev => [...prev, id])
    try {
      const res = await api(token).post(`/api/trades/${id}/close`)
      applyOverview(res.data)
    } catch (err) {
      console.error('Failed to close trade', err)
    } finally {
      setClosingTradeIds(prev => prev.filter(tid => tid !== id))
    }
  }

  async function handleCloseAll() {
    if (!token || !hasOpenPositions) return
    setClosingAll(true)
    try {
      const res = await api(token).post('/api/trades/close-all')
      applyOverview(res.data)
      setClosingTradeIds([])
    } catch (err) {
      console.error('Failed to close all trades', err)
    } finally {
      setClosingAll(false)
    }
  }

  return (
    <div className="grid gap-4 lg:gap-5">
      <div className="space-y-4 lg:space-y-5 min-w-0">
        <section className="space-y-4 md:space-y-5">
          <div className="sticky top-[52px] sm:top-[60px] z-40 bg-slate-950/95 backdrop-blur-md py-3 -mx-3 px-3 sm:bg-transparent sm:backdrop-blur-none sm:py-0 border-b border-white/10 sm:border-none flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/50 mb-4 sm:mb-0 sm:mx-0 sm:px-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {activeFeatures.length === 0 && <span>No features active</span>}
              {activeFeatures.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`rounded-full border px-3 py-1.5 transition ${mode === key
                      ? 'border-brand/80 bg-brand text-black shadow-[0_12px_24px_rgba(0,223,154,0.35)]'
                      : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <InstallAppButton variant="dashboard-pill" />
          </div>
          {mode === 'forex' && (
            <ErrorBoundary>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,320px)] items-start">
                <div className="space-y-4 min-w-0">
                  <CandlestickChart
                    symbol={selectedSymbol}
                    symbols={states.map(s => s?.symbol).filter(Boolean)}
                    onSymbolChange={setSelectedSymbol}
                    mode="FOREX"
                    trades={openTrades}
                    onPriceUpdate={setCurrentPrice}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    summary={chartSummary}
                  />
                </div>
                <div className="bg-black/20 p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/10 min-w-0 w-full">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 mb-3">Forex Order</div>
                  <OrderTicket
                    variant="embedded"
                    symbol={selectedSymbol}
                    onPlaced={(payload) => {
                      applyOverview(payload)
                    }}
                  />
                </div>
              </div>
            </ErrorBoundary>
          )}
          {mode === 'binary' && (
            <ErrorBoundary>
              <div className="space-y-4">
                <BinaryTradePanel
                  summary={chartSummary}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  onAccountRefresh={refreshTrades}
                  symbol={selectedSymbol}
                  symbols={states.map(s => s?.symbol).filter(Boolean)}
                  onSymbolChange={setSelectedSymbol}
                  onPriceUpdate={setCurrentPrice}
                  onBalanceSnapshot={handleBinaryBalance}
                />
              </div>
            </ErrorBoundary>
          )}
          {mode === 'spot' && (
            <ErrorBoundary>
              <SpotTradePanel
                onSelectPrice={(market) => {
                  setCurrentPrice(market?.price ?? currentPrice)
                }}
              />
            </ErrorBoundary>
          )}
          {mode === 'web3' && (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
              Web3 trading module is on the way.
            </div>
          )}
          {mode === 'copytrading' && (
            <ErrorBoundary>
              <CopyTradePanel onAccountRefresh={refreshTrades} />
            </ErrorBoundary>
          )}
          {mode === 'ai_trade' && (
            <ErrorBoundary>
              <AITradePanel onAccountRefresh={refreshTrades} />
            </ErrorBoundary>
          )}
        </section>

        {mode !== 'ai_trade' && <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Current Orders</div>
              <div className="text-lg font-semibold">Recent Trades</div>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {loadingTrades && <span className="text-white/50">Updating…</span>}
              {hasOpenPositions && (
                <button
                  className="inline-flex items-center rounded-full bg-rose-500/90 hover:bg-rose-500 text-white shadow-[0_4px_14px_rgba(244,63,94,0.3)] px-5 py-2 text-sm font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                  onClick={handleCloseAll}
                  disabled={closingAll}
                >
                  {closingAll ? 'Closing…' : 'Close All'}
                </button>
              )}
            </div>
          </div>
          <div className="hidden md:block overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="text-white/55 uppercase tracking-[0.12em] text-[10px]">
                <tr className="text-left">
                  <th className="p-2">Time</th>
                  <th className="p-2">Side</th>
                  <th className="p-2 text-right">Margin</th>
                  <th className="p-2 text-right">Lots</th>
                  <th className="p-2 text-right">Entry</th>
                  <th className="p-2 text-right">S/L</th>
                  <th className="p-2 text-right">T/P</th>
                  <th className="p-2 text-right">Current</th>
                  <th className="p-2 text-right">P/L</th>
                  <th className="p-2 text-right">Status</th>
                  <th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedTrades.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-4 text-center text-white/50">
                      No trades yet.
                    </td>
                  </tr>
                )}
                {paginatedTrades.map(trade => {
                  const timeLabel = trade.created_at
                    ? new Date(trade.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '--'
                  const sizeLabel = Number.isFinite(trade.remaining) && trade.isOpen
                    ? `${trade.remaining.toFixed(2)} / ${trade.qty.toFixed(2)}`
                    : trade.qty.toFixed(2)
                  const currentLabel = trade.displayPrice != null
                    ? trade.displayPrice.toFixed(2)
                    : '--'
                  const pnlLabel = Number.isFinite(trade.livePnl) ? trade.livePnl : 0
                  const pipsValue = trade.isOpen ? trade.livePips : trade.realizedPips
                  const pipsLabel = Number.isFinite(pipsValue) ? pipsValue : 0
                  const pnlClass = pnlLabel >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  const isClosing = closingSet.has(trade.id)
                  const amountDisplay = trade.isOpen && trade.stakeAmount
                    ? `${formatCurrency(trade.remainingStake)} / ${formatCurrency(trade.stakeAmount)}`
                    : formatCurrency(trade.stakeAmount || trade.remainingStake)
                  return (
                    <tr key={trade.id}>
                      <td className="p-2 text-white/70">{timeLabel}</td>
                      <td className={`p-2 font-semibold ${trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <div className="flex items-center gap-1.5">
                          <span>{trade.side?.toUpperCase?.() || trade.side}</span>
                          <img src={getLogoUrl(trade.symbol)} alt={trade.symbol} className="w-3.5 h-3.5 rounded-full bg-black/20" onError={e => e.target.style.display = 'none'} />
                          <span className="text-[10px] text-white/70">{formatPair(trade.symbol)}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono">{amountDisplay}</td>
                      <td className="p-2 text-right font-mono">{sizeLabel}</td>
                      <td className="p-2 text-right font-mono">{trade.price?.toFixed?.(2) ?? '--'}</td>
                      <td className="p-2 text-right font-mono">{trade.sl?.toFixed?.(2) ?? '--'}</td>
                      <td className="p-2 text-right font-mono">{trade.tp?.toFixed?.(2) ?? '--'}</td>
                      <td className="p-2 text-right font-mono">{currentLabel}</td>
                      <td className={`p-2 text-right font-mono ${pnlClass}`}>
                        <div>{formatCurrency(pnlLabel)}</div>
                      </td>
                      <td className="p-2 text-right text-white/50">
                        {trade.isOpen ? 'Open' : 'Closed'}
                      </td>
                      <td className="p-2 text-right">
                        {trade.isOpen ? (
                          <button
                            className="inline-flex items-center rounded-full bg-rose-500/80 hover:bg-rose-500 text-white shadow-[0_2px_10px_rgba(244,63,94,0.2)] px-4 py-1.5 text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                            onClick={() => handleCloseTrade(trade.id)}
                            disabled={isClosing}
                          >
                            {isClosing ? 'Closing…' : 'Close'}
                          </button>
                        ) : (
                          <span className="text-white/35 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {paginatedTrades.length === 0 && (
              <div className="text-center text-white/50 text-[12px]">No trades yet.</div>
            )}
            {paginatedTrades.map(trade => {
              const timeLabel = trade.created_at
                ? new Date(trade.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--'
              const sizeLabel = Number.isFinite(trade.remaining) && trade.isOpen
                ? `${trade.remaining.toFixed(2)} / ${trade.qty.toFixed(2)}`
                : trade.qty.toFixed(2)
              const pnlLabel = Number.isFinite(trade.livePnl) ? trade.livePnl : 0
              const pipsValue = trade.isOpen ? trade.livePips : trade.realizedPips
              const pipsLabel = Number.isFinite(pipsValue) ? pipsValue : 0
              const pnlClass = pnlLabel >= 0 ? 'text-emerald-400' : 'text-rose-400'
              const isClosing = closingSet.has(trade.id)
              return (
                <div key={trade.id} className="rounded-2xl border border-white/5 bg-black/15 p-3 space-y-2 text-[11px]">
                  <div className="flex justify-between text-white/50 text-[10px] uppercase tracking-[0.12em]">
                    <span>{timeLabel}</span>
                    <span>{trade.isOpen ? 'Open' : 'Closed'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className={`font-semibold ${trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <div className="flex items-center gap-1.5">
                        <span>{trade.side?.toUpperCase?.() || trade.side}</span>
                        <img src={getLogoUrl(trade.symbol)} alt={trade.symbol} className="w-3.5 h-3.5 rounded-full bg-black/20" onError={e => e.target.style.display = 'none'} />
                        <span className="text-[10px] text-white/70">{formatPair(trade.symbol)}</span>
                      </div>
                    </div>
                    <div className="text-white/60 text-[11px]">{sizeLabel}</div>
                  </div>
                  <div className="text-white/55 text-[10px]">Entry {trade.price?.toFixed?.(2) ?? '--'} · Current {trade.displayPrice != null ? trade.displayPrice.toFixed(2) : '--'}</div>
                  <div className="text-white/55 text-[10px]">S/L: {trade.sl?.toFixed?.(2) ?? '--'} · T/P: {trade.tp?.toFixed?.(2) ?? '--'}</div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-white/45 text-[9px] uppercase tracking-[0.14em]">Margin</div>
                      <div className="font-mono text-[11px]">{trade.isOpen && trade.stakeAmount ? `${formatCurrency(trade.remainingStake)} / ${formatCurrency(trade.stakeAmount)}` : formatCurrency(trade.stakeAmount || trade.remainingStake)}</div>
                    </div>
                    <div className={`font-mono text-right ${pnlClass}`}>
                      <div>{formatCurrency(pnlLabel)}</div>
                    </div>
                    {trade.isOpen ? (
                      <button
                        className="inline-flex items-center rounded-full bg-rose-500/90 hover:bg-rose-500 text-white shadow-[0_2px_10px_rgba(244,63,94,0.25)] px-4 py-2 text-[11px] font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                        onClick={() => handleCloseTrade(trade.id)}
                        disabled={isClosing}
                      >
                        {isClosing ? '...' : 'Close'}
                      </button>
                    ) : (
                      <span className="text-white/35 text-[10px]">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-4 border-t border-white/5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-[12px] font-medium transition ${currentPage === i + 1 ? 'bg-brand text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </section>}
      </div>
    </div>
  )
}
