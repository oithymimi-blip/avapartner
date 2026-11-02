import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
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
const MAX_CANDLES = 15000
const DEFAULT_TIMEFRAMES = ['15s', '30s', '1m', '5m', '10m', '15m', '1h', '1d']

function tfToSeconds(tf) {
  const match = String(tf).match(/^(\d+)([smhdwy])$/i)
  if (!match) return 60
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return 60
  const unit = match[2].toLowerCase()
  const MULTIPLIERS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 }
  return value * (MULTIPLIERS[unit] ?? 60)
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
  'XAGUSD': 'https://cdn-icons-png.flaticon.com/512/2534/2534212.png',
  'EURUSD': 'https://cdn-icons-png.flaticon.com/512/197/197615.png',
  'GBPUSD': 'https://cdn-icons-png.flaticon.com/512/197/197374.png',
  'USDJPY': 'https://cdn-icons-png.flaticon.com/512/197/197604.png',
  'AUDUSD': 'https://cdn-icons-png.flaticon.com/512/197/197507.png',
  'USDCAD': 'https://cdn-icons-png.flaticon.com/512/197/197430.png',
  'USDCHF': 'https://cdn-icons-png.flaticon.com/512/197/197577.png',
  'NZDUSD': 'https://cdn-icons-png.flaticon.com/512/197/197589.png',
  'USOIL': 'https://cdn-icons-png.flaticon.com/512/3233/3233342.png',
  'UKOIL': 'https://cdn-icons-png.flaticon.com/512/3233/3233342.png',
  'US30': 'https://cdn-icons-png.flaticon.com/512/330/330933.png',
  'US500': 'https://cdn-icons-png.flaticon.com/512/330/330933.png',
  'NAS100': 'https://cdn-icons-png.flaticon.com/512/330/330933.png',
  'GER40': 'https://cdn-icons-png.flaticon.com/512/197/197571.png'
}

function getLogoUrl(sym) {
  if (!sym) return ''
  const str = typeof sym === 'string' ? sym : (sym.symbol ? String(sym.symbol) : String(sym))
  if (customLogos[str]) return customLogos[str]
  let base = str
  if (str.endsWith('USD')) base = str.slice(0, -3)
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${base.toLowerCase()}.svg`
}

export default function CandlestickChart({
  symbol = 'BTCUSD',
  symbols = [],
  onSymbolChange,
  mode = 'FOREX',
  trades = [],
  onPriceUpdate,
  timeframe = '1m',
  onTimeframeChange,
  summary = [],
  timeframes = DEFAULT_TIMEFRAMES
}) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const candlesRef = useRef([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const priceLinesRef = useRef([])
  const priceUpdateRef = useRef(onPriceUpdate)
  const intervalSec = tfToSeconds(timeframe)
  const TARGET_VISIBLE_BARS = 70

  const filteredSymbols = useMemo(() => {
    if (!Array.isArray(symbols)) return []
    return symbols.filter(s => {
      if (!s) return false
      const symStr = typeof s === 'string' ? s : (s.symbol ? String(s.symbol) : String(s))
      const formatted = formatPair(symStr).toLowerCase()
      const raw = symStr.toLowerCase()
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch = !query || raw.includes(query) || formatted.includes(query)
      if (!matchesSearch) return false

      if (selectedCategory === 'ALL') return true
      if (selectedCategory === 'FOREX') return ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY','NZDJPY','EURAUD','EURCAD','EURCHF','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPNZD','AUDCAD','AUDCHF','AUDNZD','CADCHF','NZDCAD','NZDCHF','USDHKD','USDSGD','USDSEK','USDNOK','USDTRY','USDZAR','USDMXN'].includes(symStr)
      if (selectedCategory === 'COMMODITIES') return ['XAUUSD','XAGUSD','XPTUSD','XPDUSD','USOIL','UKOIL','NGAS','COPPER'].includes(symStr)
      if (selectedCategory === 'INDICES') return ['US30','US500','NAS100','GER40','UK100','JP225','HK50','FRA40','AUS200'].includes(symStr)
      if (selectedCategory === 'CRYPTO') return !['XAUUSD','XAGUSD','XPTUSD','XPDUSD','USOIL','UKOIL','NGAS','COPPER','US30','US500','NAS100','GER40','UK100','JP225','HK50','FRA40','AUS200','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY','NZDJPY','EURAUD','EURCAD','EURCHF','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPNZD','AUDCAD','AUDCHF','AUDNZD','CADCHF','NZDCAD','NZDCHF','USDHKD','USDSGD','USDSEK','USDNOK','USDTRY','USDZAR','USDMXN'].includes(symStr)
      return true
    })
  }, [symbols, searchQuery, selectedCategory])

  const applyZoom = useCallback(() => {
    const chart = chartRef.current
    const candles = candlesRef.current
    if (!chart || !candles || candles.length === 0) return
    const total = candles.length
    const to = total + 3
    const from = Math.max(0, total - TARGET_VISIBLE_BARS)
    chart.timeScale().setVisibleLogicalRange({ from, to })
  }, [TARGET_VISIBLE_BARS])

  useEffect(() => {
    priceUpdateRef.current = onPriceUpdate
  }, [onPriceUpdate])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(255, 255, 255, 0.6)' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: intervalSec < 60,
        borderVisible: false,
        barSpacing: 12,
        rightOffset: 8
      },
      rightPriceScale: { borderVisible: false },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      }
    })

    const series = chart.addCandlestickSeries({
      upColor: '#0ddf9a',
      borderUpColor: '#0ddf9a',
      wickUpColor: '#0ddf9a',
      downColor: '#f87171',
      borderDownColor: '#f87171',
      wickDownColor: '#f87171',
      priceLineVisible: false,
      lastValueVisible: false
    })

    chartRef.current = chart
    seriesRef.current = series
    candlesRef.current = []

    let disposed = false

    const resizeObserver = new ResizeObserver(entries => {
      if (disposed || !entries || entries.length === 0 || !chartRef.current) return
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height })
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    async function loadInitial() {
      try {
        const res = await fetch(`${API_BASE}/api/market/candles?symbol=${symbol}&limit=${MAX_CANDLES}&tf=${timeframe}`)
        if (disposed) return
        let rows = []
        if (res.ok) {
          rows = await res.json()
        }
        if (disposed) return

        let formatted = []
        if (Array.isArray(rows) && rows.length > 0) {
          formatted = rows.map(r => ({
            time: r.time ?? r.ts,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close
          }))
          formatted.sort((a, b) => a.time - b.time)
        } else {
          // Client-side fallback if server has no historical candles
          const now = Math.floor(Date.now() / 1000)
          const count = 100
          const startTime = (Math.floor(now / intervalSec) - count) * intervalSec
          const basePrice = symbol === 'XAUUSD' ? 2450 : symbol === 'BTCUSD' ? 65000 : 100
          let p = basePrice
          for (let i = 0; i < count; i++) {
            const t = startTime + i * intervalSec
            const delta = p * 0.001 * (Math.random() - 0.49)
            const open = p
            const close = Math.max(0.01, open + delta)
            const high = Math.max(open, close) + Math.abs(delta) * 0.5
            const low = Math.min(open, close) - Math.abs(delta) * 0.5
            p = close
            formatted.push({ time: t, open, high, low, close })
          }
        }

        candlesRef.current = formatted
        series.setData(formatted)
        applyZoom()
        const lastPrice = formatted[formatted.length - 1].close
        priceUpdateRef.current?.(lastPrice)
      } catch (err) {
        console.error('Candlestick load error:', err)
      }
    }

    loadInitial()

    function handleTick(msg) {
      if (disposed || !chartRef.current) return
      if (msg.symbol && msg.symbol !== symbol) return

      const price = msg.price
      if (!Number.isFinite(price)) return

      const bucketTime = Math.floor(msg.ts / intervalSec) * intervalSec
      let candles = candlesRef.current
      priceUpdateRef.current?.(price)

      if (!candles || candles.length === 0) {
        const first = { time: bucketTime, open: price, high: price, low: price, close: price }
        candles = [first]
        candlesRef.current = candles
        series.setData(candles)
        applyZoom()
        return
      }

      const last = candles[candles.length - 1]

      if (bucketTime === last.time) {
        last.high = Math.max(last.high, price)
        last.low = Math.min(last.low, price)
        last.close = price
        candlesRef.current = candles
        series.update(last)
        applyZoom()
        return
      }
      
      if (bucketTime > last.time) {
        const newCandle = {
          time: bucketTime,
          open: last.close ?? price,
          high: price,
          low: price,
          close: price
        }
        candles.push(newCandle)
        if (candles.length > MAX_CANDLES) candles.shift()
        candlesRef.current = candles
        series.update(newCandle)
        applyZoom()
      }
    }

    socket.on('tick', handleTick)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      socket.off('tick', handleTick)
      chart.remove()
      seriesRef.current = null
      chartRef.current = null
      candlesRef.current = []
      priceLinesRef.current = []
    }
  }, [symbol, timeframe, intervalSec, applyZoom])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    try {
      if (Array.isArray(priceLinesRef.current)) {
        priceLinesRef.current.forEach(line => {
          try { series.removePriceLine(line) } catch (e) {}
        })
      }
      priceLinesRef.current = []

      if (!Array.isArray(trades)) return

      const lines = trades
        .filter(t => t && t.symbol === symbol && Number.isFinite(t?.price) && (t?.remaining_qty ?? t?.qty ?? 0) > 1e-8)
        .map(t => {
          try {
            const remainingStake = Number(t.pip_value ?? t.stake_amount ?? 0)
            const sideLabel = t.side === 'sell' ? 'Sell' : 'Buy'
            const amountLabel = Number.isFinite(remainingStake) ? `$${remainingStake.toFixed(2)}` : ''
            return series.createPriceLine({
              price: t.price,
              color: t.side === 'sell' ? '#f97316' : '#00df9a',
              lineStyle: LineStyle.Dashed,
              lineWidth: 1,
              axisLabelVisible: true,
              title: `${sideLabel}${amountLabel ? ` ${amountLabel}` : ''} @ ${t.price.toFixed(2)}`
            })
          } catch (e) {
            return null
          }
        })
        .filter(Boolean)
      priceLinesRef.current = lines
    } catch (err) {
      console.error('PriceLine handling error:', err)
    }
  }, [trades, symbol])

  const priceVal = summary?.find(s => s.label === 'Price')?.value || '--'
  const marketVal = summary?.find(s => s.label === 'Market')
  const updatedVal = summary?.find(s => s.label === 'Updated')?.value || '--'

  return (
    <div className="bg-slate-900/60 backdrop-blur-md text-white p-3 sm:p-4 space-y-3 sm:space-y-4 shadow-xl border border-white/5 rounded-2xl sm:rounded-3xl min-w-0 w-full">
      <div className="flex flex-col gap-3 sm:gap-4 border-b border-white/5 pb-3 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center justify-between w-full sm:w-auto relative z-50 min-w-0">
            {symbols.length > 0 ? (
              <div className="relative group leading-none flex-shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1.5">Pair</div>
                <button 
                  type="button"
                  className="flex items-center gap-2 text-white hover:text-brand transition cursor-pointer text-left outline-none"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <img src={getLogoUrl(symbol)} alt={symbol} className="w-6 h-6 rounded-full bg-slate-800 object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                  <span className="text-xl font-black tracking-tight">{formatPair(symbol)}</span>
                  <span className="text-[11px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded tracking-wide border border-brand/20">{(mode || 'FOREX').toUpperCase()}</span>
                  <svg className={`w-4 h-4 transition-all duration-300 ${isDropdownOpen ? 'rotate-180 text-brand' : 'text-white/40 group-hover:text-brand'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>

                {isDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsDropdownOpen(false)} 
                    />
                    <div className="absolute top-full left-0 mt-3 w-72 sm:w-80 max-h-[380px] bg-slate-900/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col p-2.5 overflow-hidden">
                      {/* Search Bar */}
                      <div className="mb-2">
                        <input
                          type="text"
                          placeholder="Search pairs..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-brand/60"
                        />
                      </div>
                      {/* Category Tabs */}
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide mb-2 pb-1 text-[10px] font-bold">
                        {['ALL', 'FOREX', 'CRYPTO', 'COMMODITIES', 'INDICES'].map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-2 py-1 rounded-lg flex-shrink-0 transition ${selectedCategory === cat ? 'bg-brand text-black font-extrabold' : 'bg-white/5 text-white/60 hover:text-white'}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      {/* Symbol List */}
                      <div className="overflow-y-auto max-h-[260px] space-y-0.5 pr-1">
                        {filteredSymbols.length === 0 && (
                          <div className="p-3 text-center text-xs text-white/40">No pairs found</div>
                        )}
                        {filteredSymbols.map(s => (
                          <button
                            key={s}
                            type="button"
                            className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-bold rounded-xl transition-colors ${s === symbol ? 'text-brand bg-brand/10 border border-brand/20' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                            onClick={() => {
                              onSymbolChange?.(s)
                              setIsDropdownOpen(false)
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <img src={getLogoUrl(s)} alt={s} className="w-5 h-5 rounded-full object-cover bg-slate-800" onError={(e) => { e.target.style.display = 'none' }} />
                              <span>{formatPair(s)}</span>
                            </div>
                            <span className="text-[10px] text-white/30 font-normal">{s}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="w-1 flex-shrink-0" />
            )}

            {/* Timeframes on mobile to the right of the pair */}
            <div className="sm:hidden flex-1 overflow-x-auto scrollbar-hide ml-3 min-w-0 flex">
              <div className="inline-flex items-center bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner ml-auto">
                {timeframes.map(tf => (
                  <button
                    key={tf}
                    onClick={() => onTimeframeChange?.(tf)}
                    className={`flex-shrink-0 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                      timeframe === tf 
                        ? 'bg-brand shadow-[0_0_10px_rgba(0,223,154,0.3)] text-black border border-brand' 
                        : 'text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide min-w-0 pb-1 sm:pb-0">
            <div className="leading-none sm:border-l sm:border-white/10 sm:pl-6 flex-shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1.5">Price</div>
              <div className="text-lg font-mono font-bold text-emerald-400 tracking-tight">
                {priceVal}
              </div>
            </div>

            <div className="leading-none border-l border-white/10 pl-4 sm:pl-6 flex-shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1.5">Market</div>
              <div className={`text-sm font-bold tracking-wide mt-1.5 ${marketVal?.tone === 'danger' ? 'text-rose-400' : 'text-brand'}`}>
                {marketVal?.value || '--'}
              </div>
            </div>

            <div className="leading-none border-l border-white/10 pl-4 sm:pl-6 hidden md:block flex-shrink-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1.5">Updated</div>
              <div className="text-xs font-semibold text-white/60 mt-2">
                {updatedVal}
              </div>
            </div>
          </div>

          {/* Timeframes on desktop */}
          <div className="hidden sm:block w-full sm:w-auto overflow-x-auto scrollbar-hide">
            <div className="inline-flex items-center bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
              {timeframes.map(tf => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange?.(tf)}
                  className={`flex-shrink-0 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    timeframe === tf 
                      ? 'bg-brand shadow-[0_0_10px_rgba(0,223,154,0.3)] text-black border border-brand' 
                      : 'text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="w-full h-[320px] min-[380px]:h-[400px] sm:h-[540px] rounded-2xl overflow-hidden" ref={containerRef} />
    </div>
  )
}
