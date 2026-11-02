// Live market engine using Binance WebSocket
import WebSocket from 'ws';
import db from '../db.js';
import { nowTs } from '../utils.js';
import { autoCloseTrades } from '../trades/routes.js';
import { startLivePriceFetcher } from './livePriceFetcher.js';

const insertCandleStmt = db.prepare(`
  INSERT INTO candles (symbol, open, high, low, close, volume, ts)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(symbol, ts) DO UPDATE SET
    high = CASE WHEN excluded.high > candles.high THEN excluded.high ELSE candles.high END,
    low = CASE WHEN excluded.low < candles.low THEN excluded.low ELSE candles.low END,
    close = excluded.close,
    volume = candles.volume + excluded.volume
`);

const stateMap = new Map(); // symbol -> { lastPrice, lastCandle }
let ioRef = null;
let lastTickCleanup = 0;
let ws = null;
const activeSymbols = new Set();

function getAllSettings() {
  return db.prepare('SELECT * FROM market_settings').all();
}

export function attachIO(io) {
  ioRef = io;
}

export function emitSocket(event, payload) {
  if (ioRef) ioRef.emit(event, payload);
}

// Fetch historical 1m candles from Binance
async function fetchBinanceHistory(symbol) {
  try {
    let binanceSymbol = symbol;
    if (symbol === 'XAUUSD') binanceSymbol = 'XAUTUSDT';
    else if (symbol.endsWith('USD')) binanceSymbol = symbol + 'T';
    
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1m&limit=1000`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(d => ({
      ts: Math.floor(d[0] / 1000),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5])
    }));
  } catch (err) {
    console.error(`Failed to fetch history for ${symbol}:`, err.message);
    return null;
  }
}

async function initSymbolState(s) {
  let lastPrice = s.base_price;
  let lastCandle = null;
  
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM candles WHERE symbol = ?').get(s.symbol);
  if (!countRow || countRow.cnt < 10) {
    // Seed from Binance
    const history = await fetchBinanceHistory(s.symbol);
    if (history && history.length > 0) {
      const tx = db.transaction(() => {
        for (const c of history) {
          insertCandleStmt.run(s.symbol, c.open, c.high, c.low, c.close, c.volume, c.ts);
        }
      });
      tx();
      const last = history[history.length - 1];
      lastPrice = last.close;
      lastCandle = {
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
        tsStart: last.ts
      };
    }
  } else {
    const tickRow = db.prepare('SELECT price, ts FROM ticks WHERE symbol = ? ORDER BY ts DESC LIMIT 1').get(s.symbol);
    if (tickRow) {
      lastPrice = tickRow.price;
      lastCandle = {
        open: tickRow.price, high: tickRow.price, low: tickRow.price, close: tickRow.price, volume: 0, tsStart: Math.floor(tickRow.ts / 60) * 60
      };
    } else {
      const candleRow = db.prepare('SELECT open, high, low, close, volume, ts FROM candles WHERE symbol = ? ORDER BY ts DESC LIMIT 1').get(s.symbol);
      if (candleRow) {
        lastPrice = candleRow.close;
        lastCandle = {
          open: candleRow.open, high: candleRow.high, low: candleRow.low, close: candleRow.close, volume: candleRow.volume, tsStart: candleRow.ts
        };
      }
    }
  }

  stateMap.set(s.symbol, { lastPrice, lastCandle });
  activeSymbols.add(s.symbol);
}

export function currentPrice(symbol = 'BTCUSDT') {
  const st = stateMap.get(symbol);
  if (st && st.lastPrice != null) return st.lastPrice;
  const s = db.prepare('SELECT base_price FROM market_settings WHERE symbol = ?').get(symbol);
  return s ? s.base_price : 0;
}

export function setPrice(symbol, p) {
  const st = stateMap.get(symbol);
  if (st) st.lastPrice = p;
  db.prepare('UPDATE market_settings SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(p, symbol);
  return p;
}

export function resetEngine(symbol, newBasePrice = null) {
  const st = stateMap.get(symbol);
  if (st) {
    if (newBasePrice != null) {
      st.lastPrice = newBasePrice;
    }
    st.lastCandle = null;
  }
}

export function forcePump(symbol, percentage) {
  const st = stateMap.get(symbol);
  if (!st) return null;
  const p0 = st.lastPrice;
  const p1 = p0 * (1 + percentage / 100);
  setPrice(symbol, p1);
  if (st.lastCandle) {
    st.lastCandle.high = Math.max(st.lastCandle.high, p1);
    st.lastCandle.low = Math.min(st.lastCandle.low, p1);
    st.lastCandle.close = p1;
  }
  if (ioRef) ioRef.emit('tick', { symbol, price: p1, ts: nowTs() });
  return p1;
}

export function clearTicks() {
  db.prepare('DELETE FROM ticks').run();
  lastTickCleanup = 0;
}

// Tick loop - cleanup and non-Binance simulation
export function tickOnce() {
  const now = nowTs();
  if (!lastTickCleanup || now - lastTickCleanup > 300) {
    db.prepare('DELETE FROM ticks WHERE ts < ?').run(now - 86400);
    lastTickCleanup = now;

    const all = getAllSettings();
    for (const s of all) {
      if (!activeSymbols.has(s.symbol)) {
        activeSymbols.add(s.symbol);
        initSymbolState(s).catch(err => {
          console.error('Failed to init symbol state:', err);
          activeSymbols.delete(s.symbol);
        });
      }
    }
  }

  // Track last WS update timestamp to simulate non-WS symbols smoothly
  const allSettings = getAllSettings();
  const insertTickStmt = db.prepare('INSERT INTO ticks (symbol, price, ts) VALUES (?, ?, ?)');

  for (const s of allSettings) {
    const sym = s.symbol;
    if (!activeSymbols.has(sym)) continue;
    const st = stateMap.get(sym);
    if (!st || st.lastPrice == null) continue;

    // If symbol was updated via Binance WS in the last 2 seconds, skip manual tick
    if (st.lastWsTick && now - st.lastWsTick < 2) continue;

    const vol = s.volatility || 0.005;
    
    // Smooth random walk based on volatility
    const change = st.lastPrice * (vol / 50) * (Math.random() - 0.495);
    const p1 = Math.max(0.000001, st.lastPrice + change);
    st.lastPrice = p1;

    if (!st.lastCandle || now - st.lastCandle.tsStart >= 60) {
      if (st.lastCandle) {
        insertCandleStmt.run(
          sym, st.lastCandle.open, st.lastCandle.high, st.lastCandle.low, st.lastCandle.close, st.lastCandle.volume, st.lastCandle.tsStart
        );
      }
      st.lastCandle = { open: p1, high: p1, low: p1, close: p1, volume: Math.random(), tsStart: now - (now % 60) };
    } else {
      st.lastCandle.high = Math.max(st.lastCandle.high, p1);
      st.lastCandle.low = Math.min(st.lastCandle.low, p1);
      st.lastCandle.close = p1;
      st.lastCandle.volume += Math.random() * 0.05;
    }

    insertTickStmt.run(sym, p1, now);
    autoCloseTrades(sym, p1);
    
    if (ioRef) {
      ioRef.emit('tick', { symbol: sym, price: p1, ts: now });
    }
  }
}

// --- Binance WebSocket Integration ---

function connectBinance() {
  ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
  
  ws.on('open', () => {
    console.log('Connected to Binance WebSocket');
  });

  ws.on('message', (data) => {
    try {
      const tickers = JSON.parse(data);
      const now = nowTs();
      const insertTickStmt = db.prepare('INSERT INTO ticks (symbol, price, ts) VALUES (?, ?, ?)');
      
      const ticksToEmit = [];
      const symbolsToAutoClose = [];

      const tx = db.transaction(() => {
        for (const t of tickers) {
          let symbol = t.s;
          // Explicitly ignore illiquid Binance forex/gold pairs so we can simulate them smoothly
          if (symbol === 'XAUTUSDT' || symbol === 'EURUSDT' || symbol === 'GBPUSDT') continue;
          
          if (symbol.endsWith('USDT')) {
            symbol = symbol.slice(0, -1); // e.g. BTCUSDT -> BTCUSD
          }
          if (!activeSymbols.has(symbol)) continue; // Only track our DB symbols
          
          const price = parseFloat(t.c);
          const st = stateMap.get(symbol);
          if (!st) continue;
          
          st.lastPrice = price;
          st.lastWsTick = now;
          db.prepare('UPDATE market_settings SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(price, symbol);
          const volPerSec = parseFloat(t.v) / 86400; // rough 1s volume
          
          // Update candle
          if (!st.lastCandle || now - st.lastCandle.tsStart >= 60) {
            if (st.lastCandle) {
              insertCandleStmt.run(
                symbol, st.lastCandle.open, st.lastCandle.high, st.lastCandle.low, st.lastCandle.close, st.lastCandle.volume, st.lastCandle.tsStart
              );
            }
            st.lastCandle = { open: price, high: price, low: price, close: price, volume: volPerSec, tsStart: now - (now % 60) };
          } else {
            st.lastCandle.high = Math.max(st.lastCandle.high, price);
            st.lastCandle.low = Math.min(st.lastCandle.low, price);
            st.lastCandle.close = price;
            st.lastCandle.volume += volPerSec;
          }

          insertTickStmt.run(symbol, price, now);
          ticksToEmit.push({ symbol, price, ts: now });
          symbolsToAutoClose.push({ symbol, price });
        }
      });
      
      tx();

      // Check SL/TP and emit outside transaction
      for (const { symbol, price } of symbolsToAutoClose) {
        autoCloseTrades(symbol, price);
      }
      
      if (ioRef && ticksToEmit.length > 0) {
        for (const t of ticksToEmit) {
          ioRef.emit('tick', t);
        }
      }

    } catch (err) {
      console.error('Binance WS Message Error:', err);
    }
  });

  ws.on('close', () => {
    console.log('Binance WS closed. Reconnecting...');
    setTimeout(connectBinance, 5000);
  });

  ws.on('error', (err) => {
    console.error('Binance WS Error:', err);
    ws.close();
  });
}

export function handleLiveTick(symbol, price) {
  if (!symbol || !Number.isFinite(price) || price <= 0) return;
  const now = nowTs();
  const st = stateMap.get(symbol);
  if (!st) return;

  st.lastPrice = price;
  st.lastWsTick = now;

  try {
    db.prepare('UPDATE market_settings SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(price, symbol);
    const insertTickStmt = db.prepare('INSERT INTO ticks (symbol, price, ts) VALUES (?, ?, ?)');
    insertTickStmt.run(symbol, price, now);

    if (!st.lastCandle || now - st.lastCandle.tsStart >= 60) {
      if (st.lastCandle) {
        insertCandleStmt.run(
          symbol, st.lastCandle.open, st.lastCandle.high, st.lastCandle.low, st.lastCandle.close, st.lastCandle.volume, st.lastCandle.tsStart
        );
      }
      st.lastCandle = { open: price, high: price, low: price, close: price, volume: 1, tsStart: now - (now % 60) };
    } else {
      st.lastCandle.high = Math.max(st.lastCandle.high, price);
      st.lastCandle.low = Math.min(st.lastCandle.low, price);
      st.lastCandle.close = price;
      st.lastCandle.volume += 0.1;
    }

    autoCloseTrades(symbol, price);

    if (ioRef) {
      ioRef.emit('tick', { symbol, price, ts: now });
    }
  } catch (err) {
    console.error(`Error processing live tick for ${symbol}:`, err.message);
  }
}

// init on startup
const all = getAllSettings();
connectBinance();
startLivePriceFetcher(handleLiveTick);

(async () => {
  for (const s of all) {
    await initSymbolState(s);
    // sleep a bit to avoid binance rate limits
    await new Promise(r => setTimeout(r, 200));
  }
})();

