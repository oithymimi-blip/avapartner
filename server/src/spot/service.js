import db from '../db.js';

const BINANCE_ENDPOINT = 'https://api.binance.com/api/v3/ticker/24hr';
const CACHE_TTL_MS = 45_000;
const MAX_MARKETS = 100;

const overridesStmt = db.prepare(`SELECT symbol, price_override, change_override, volume_override FROM spot_overrides`);
const upsertOverrideStmt = db.prepare(`
  INSERT INTO spot_overrides (symbol, price_override, change_override, volume_override, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(symbol) DO UPDATE SET
    price_override = excluded.price_override,
    change_override = excluded.change_override,
    volume_override = excluded.volume_override,
    updated_at = CURRENT_TIMESTAMP
`);
const getOverrideStmt = db.prepare(`SELECT symbol, price_override, change_override, volume_override FROM spot_overrides WHERE symbol = ?`);

let cache = { markets: [], fetchedAt: 0 };

function parseSymbol(symbol) {
  const quoteCandidates = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB'];
  for (const quote of quoteCandidates) {
    if (symbol.endsWith(quote)) {
      const base = symbol.slice(0, -quote.length);
      return { base, quote };
    }
  }
  return { base: symbol.slice(0, 3), quote: symbol.slice(3) };
}

function applyOverrides(tickers) {
  const overrides = overridesStmt.all();
  if (!overrides.length) return tickers;
  const overrideMap = new Map(overrides.map(o => [o.symbol.toUpperCase(), o]));
  return tickers.map(ticker => {
    const override = overrideMap.get(ticker.symbol);
    if (!override) return ticker;
    return {
      ...ticker,
      price: Number(override.price_override ?? ticker.price),
      change_24h: Number(override.change_override ?? ticker.change_24h),
      volume_24h: Number(override.volume_override ?? ticker.volume_24h)
    };
  });
}

function withLogos(tickers) {
  return tickers.map(ticker => {
    const symbol = ticker.base_asset?.toLowerCase?.() || 'btc';
    const logo = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${symbol}.svg`;
    return { ...ticker, logo_url: logo };
  });
}

export async function getSpotMarkets() {
  const now = Date.now();
  if (cache.markets.length && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.markets;
  }

  const res = await fetch(BINANCE_ENDPOINT);
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }
  const data = await res.json();
  const filtered = data
    .filter(t => t.symbol?.endsWith('USDT'))
    .map(t => {
      const { base, quote } = parseSymbol(t.symbol);
      const displayQuote = quote === 'USDT' ? 'USD' : quote;
      return {
        symbol: `${base}-${displayQuote}`,
        base_asset: base,
        quote_asset: displayQuote,
        price: Number(t.lastPrice),
        change_24h: Number(t.priceChangePercent),
        volume_24h: Number(t.quoteVolume)
      };
    })
    .filter(m => Number.isFinite(m.price) && Number.isFinite(m.change_24h))
    .sort((a, b) => Number(b.volume_24h || 0) - Number(a.volume_24h || 0))
    .slice(0, MAX_MARKETS);

  const enriched = withLogos(applyOverrides(filtered));
  cache = { markets: enriched, fetchedAt: now };
  return enriched;
}

export async function updateSpotOverride(symbol, { price, change_24h, volume_24h }) {
  const upperSymbol = symbol.toUpperCase();
  const existing = getOverrideStmt.get(upperSymbol) || {};
  upsertOverrideStmt.run(
    upperSymbol,
    price !== undefined ? (price !== null ? Number(price) : null) : existing.price_override,
    change_24h !== undefined ? (change_24h !== null ? Number(change_24h) : null) : existing.change_override,
    volume_24h !== undefined ? (volume_24h !== null ? Number(volume_24h) : null) : existing.volume_override
  );
  cache = { markets: [], fetchedAt: 0 };
  const override = getOverrideStmt.get(upperSymbol);
  return override;
}

export async function clearSpotOverride(symbol) {
  const upperSymbol = symbol.toUpperCase();
  db.prepare('DELETE FROM spot_overrides WHERE symbol = ?').run(upperSymbol);
  cache = { markets: [], fetchedAt: 0 };
}

export function getSpotOverrides() {
  return db.prepare('SELECT * FROM spot_overrides').all();
}

export async function createSpotOrder(userId, symbol, side, type, price, amount) {
  const [base, quote] = symbol.split('-');
  const isBuy = side === 'buy';
  const orderPrice = Number(price);
  const orderAmount = Number(amount);
  
  if (!orderAmount || orderAmount <= 0) throw new Error('Invalid amount');
  
  let execPrice = orderPrice;
  if (type === 'market') {
    const markets = await getSpotMarkets();
    const market = markets.find(m => m.symbol === symbol);
    if (!market) throw new Error('Market not found');
    execPrice = market.price;
  }
  
  const totalCost = execPrice * orderAmount;

  const tx = db.transaction(() => {
    let usdBalance = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(userId);
    if (!usdBalance) {
      db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(userId);
      usdBalance = { available: 0 };
    }
    
    let baseBalance = db.prepare('SELECT available FROM spot_balances WHERE user_id = ? AND asset = ?').get(userId, base);
    if (!baseBalance) {
      db.prepare('INSERT OR IGNORE INTO spot_balances (user_id, asset, available, locked) VALUES (?, ?, 0, 0)').run(userId, base);
      baseBalance = { available: 0 };
    }
    
    if (isBuy) {
      if (usdBalance.available < totalCost) throw new Error('Insufficient USD balance');
      
      if (type === 'market') {
        db.prepare('UPDATE balances SET available = available - ? WHERE user_id = ?').run(totalCost, userId);
        db.prepare('UPDATE spot_balances SET available = available + ? WHERE user_id = ? AND asset = ?').run(orderAmount, userId, base);
      } else {
        db.prepare('UPDATE balances SET available = available - ?, locked = locked + ? WHERE user_id = ?').run(totalCost, totalCost, userId);
      }
    } else {
      if (baseBalance.available < orderAmount) throw new Error(`Insufficient ${base} balance`);
      
      if (type === 'market') {
        db.prepare('UPDATE spot_balances SET available = available - ? WHERE user_id = ? AND asset = ?').run(orderAmount, userId, base);
        db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(totalCost, userId);
      } else {
        db.prepare('UPDATE spot_balances SET available = available - ?, locked = locked + ? WHERE user_id = ? AND asset = ?').run(orderAmount, orderAmount, userId, base);
      }
    }
    
    const status = type === 'market' ? 'filled' : 'open';
    const filledAmt = type === 'market' ? orderAmount : 0;
    
    const result = db.prepare(`
      INSERT INTO spot_orders (user_id, symbol, side, type, price, amount, status, filled_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, symbol, side, type, execPrice, orderAmount, status, filledAmt);
    
    return { id: result.lastInsertRowid, symbol, side, type, price: execPrice, amount: orderAmount, status, filled_amount: filledAmt };
  });

  return tx();
}

export function getSpotOrders(userId) {
  return db.prepare('SELECT * FROM spot_orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function getSpotBalances(userId) {
  const spot = db.prepare('SELECT * FROM spot_balances WHERE user_id = ? AND (available > 0 OR locked > 0)').all(userId);
  const usd = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(userId);
  return { spot, usd: usd || { available: 0, locked: 0 } };
}

export function cancelSpotOrder(userId, orderId) {
  const tx = db.transaction(() => {
    const order = db.prepare('SELECT * FROM spot_orders WHERE id = ? AND user_id = ?').get(orderId, userId);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'open') throw new Error('Order is not open');
    
    const [base, quote] = order.symbol.split('-');
    
    if (order.side === 'buy') {
      const totalCost = order.price * order.amount;
      db.prepare('UPDATE balances SET available = available + ?, locked = locked - ? WHERE user_id = ?').run(totalCost, totalCost, userId);
    } else {
      db.prepare('UPDATE spot_balances SET available = available + ?, locked = locked - ? WHERE user_id = ? AND asset = ?').run(order.amount, order.amount, userId, base);
    }
    
    db.prepare('UPDATE spot_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('canceled', orderId);
    return true;
  });
  
  return tx();
}
