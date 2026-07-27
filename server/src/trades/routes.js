import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { currentPrice, emitSocket } from '../market/engine.js';
import { INITIAL_BALANCE } from '../config.js';
import { ibEngine } from '../ib/commissionEngine.js';

const router = express.Router();
const EPS = 1e-8;

const getBalanceStmt = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?');
const insertBalanceStmt = db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, ?)');
const updateBalanceStmt = db.prepare('UPDATE balances SET available = ?, locked = ? WHERE user_id = ?');
const insertTradeStmt = db.prepare(`
  INSERT INTO trades (user_id, symbol, side, qty, price, status, remaining_qty, pnl, exit_price, notional, pip_value, pips_realized, stake_amount, sl, tp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertActivityLogStmt = db.prepare(`
  INSERT INTO activity_logs (user_id, actor_role, action, meta)
  VALUES (?, ?, ?, ?)
`);
const updateTradeCloseStmt = db.prepare(`
  UPDATE trades
  SET status = 'closed',
      remaining_qty = 0,
      pnl = ?,
      exit_price = ?,
      pips_realized = ?,
      pip_value = 0,
      closed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const selectTradeByIdStmt = db.prepare('SELECT * FROM trades WHERE id = ?');
const selectOpenTradesStmt = db.prepare(`SELECT * FROM trades WHERE user_id = ? AND status = 'open' ORDER BY created_at ASC`);
const selectRecentTradesStmt = db.prepare(`SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`);
const selectSettingsStmt = db.prepare('SELECT pip_size FROM market_settings WHERE id = 1');
const selectLatestTickStmt = db.prepare('SELECT price FROM ticks WHERE symbol = ? ORDER BY ts DESC LIMIT 1');

function cleanSymbol(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^A-Za-z]/g, '').toUpperCase();
  return cleaned || null;
}

function getLatestPriceForSymbol(symbol) {
  const normalized = cleanSymbol(symbol);
  if (!normalized) return null;
  const row = selectLatestTickStmt.get(normalized);
  if (row && Number.isFinite(row.price) && row.price > 0) {
    return Number(row.price);
  }
  return null;
}

function getOrInitBalance(userId) {
  insertBalanceStmt.run(userId, INITIAL_BALANCE, 0);
  const row = getBalanceStmt.get(userId);
  return {
    available: Number(row?.available ?? INITIAL_BALANCE),
    locked: Number(row?.locked ?? 0)
  };
}

function getPipSize() {
  const row = selectSettingsStmt.get();
  const value = Number(row?.pip_size ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function computeOverview(userId, limit = 10, priceOverride) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 200));
  const balance = getOrInitBalance(userId);
  const fallbackPrice = priceOverride ?? currentPrice('BTCUSDT');

  const openTrades = selectOpenTradesStmt.all(userId);
  let openPnl = 0;
  let openPips = 0;
  for (const trade of openTrades) {
    const qty = Number(trade.qty || 0);
    if (qty <= 0) continue;
    const direction = trade.side === 'sell' ? -1 : 1;
    const marketPrice = getLatestPriceForSymbol(trade.symbol) ?? Number(trade.price || 0);
    const diff = (marketPrice - Number(trade.price || 0)) * direction;
    openPnl += diff * qty;
    openPips += diff;
  }

  const recentTrades = selectRecentTradesStmt.all(userId, safeLimit);

  const balanceTotal = balance.available + balance.locked;
  const equity = balance.available + balance.locked + openPnl;
  const marginUsed = balance.locked;
  const freeMargin = equity - marginUsed;
  const marginLevel = marginUsed > EPS ? (equity / marginUsed) * 100 : null;

  return {
    balance: {
      available: round2(balance.available),
      locked: round2(balance.locked),
      total: round2(balanceTotal)
    },
    openTrades,
    recentTrades,
    openPnl: round2(openPnl),
    openPips: round2(openPips),
    equity: round2(equity),
    currentPrice: fallbackPrice,
    pipSize: getPipSize(),
    marginUsed: round2(marginUsed),
    freeMargin: round2(freeMargin),
    marginLevel: marginLevel == null ? null : Math.round(marginLevel * 100) / 100
  };
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function directionForSide(side) {
  return side === 'sell' ? -1 : 1;
}

router.get('/', requireAuth, (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 500, 500));
  const rows = selectRecentTradesStmt.all(req.user.id, limit);
  res.json(rows);
});

router.get('/open', requireAuth, (req, res) => {
  const rows = selectOpenTradesStmt.all(req.user.id);
  res.json(rows);
});

router.get('/overview', requireAuth, (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  const overview = computeOverview(req.user.id, limit);
  res.json(overview);
});

router.post('/', requireAuth, (req, res) => {
  try {
    const { symbol, side, amount, requestedPrice, sl, tp } = req.body;
    const normalizedSide = String(side).toLowerCase() === 'sell' ? 'sell' : 'buy';
    const lots = Number(amount);
    if (!Number.isFinite(lots) || lots <= 0) {
      return res.status(400).json({ error: 'Volume (Lots) must be positive' });
    }

    const normalizedSymbol = cleanSymbol(symbol) || 'BTCUSDT';
    const brokerPrice = Number(requestedPrice);
    const entryPrice = Number.isFinite(brokerPrice) && brokerPrice > 0 ? brokerPrice : currentPrice(normalizedSymbol);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return res.status(500).json({ error: 'Invalid market price' });
    }

    const leverage = 100;
    const requiredMargin = (lots * entryPrice) / leverage;

    const balance = getOrInitBalance(req.user.id);
    if (balance.available + EPS < requiredMargin) {
      return res.status(400).json({ error: 'Insufficient balance for margin' });
    }

    const qty = lots;
    insertTradeStmt.run(
      req.user.id,
      normalizedSymbol,
      normalizedSide,
      qty,
      entryPrice,
      'open',
      qty,
      0,
      null,
      qty * entryPrice,
      requiredMargin,
      0,
      requiredMargin,
      Number.isFinite(Number(sl)) && Number(sl) > 0 ? Number(sl) : null,
      Number.isFinite(Number(tp)) && Number(tp) > 0 ? Number(tp) : null
    );

    updateBalanceStmt.run(round2(balance.available - requiredMargin), round2(balance.locked + requiredMargin), req.user.id);
    insertActivityLogStmt.run(
      req.user.id,
      'user',
      'open_trade',
      JSON.stringify({
        symbol: normalizedSymbol,
        side: normalizedSide,
        price: entryPrice,
        lots: qty,
        margin: requiredMargin
      })
    );

    const overview = computeOverview(req.user.id, 10, entryPrice);
    emitSocket('admin_trade_update', { userId: req.user.id });
    res.json({ ok: true, price: entryPrice, amount: lots, ...overview });
  } catch (err) {
    console.error('trade error', err);
    res.status(500).json({ error: 'Trade failed' });
  }
});

router.post('/:id/close', requireAuth, (req, res) => {
  try {
    const tradeId = Number(req.params.id);
    if (!Number.isInteger(tradeId)) {
      return res.status(400).json({ error: 'Invalid trade id' });
    }
    const trade = selectTradeByIdStmt.get(tradeId);
    if (!trade || trade.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (trade.status !== 'open') {
      const overview = computeOverview(req.user.id, 10);
      return res.json({ ok: true, ...overview });
    }

    const requested = Number(req.body?.price);
    const latestTick = getLatestPriceForSymbol(trade.symbol);
    const marketPrice = (Number.isFinite(requested) && requested > 0)
      ? requested
      : (Number.isFinite(latestTick) && latestTick > 0)
        ? latestTick
        : Number(trade.price || 0);
    const qty = Number(trade.qty || 0);
    const direction = directionForSide(trade.side);
    const pnl = (marketPrice - Number(trade.price || 0)) * direction * qty;
    const pips = (marketPrice - Number(trade.price || 0)) * direction;

    updateTradeCloseStmt.run(pnl, marketPrice, pips, tradeId);

    const balance = getOrInitBalance(req.user.id);
    const stakeAmount = Number(trade.stake_amount || 0);
    updateBalanceStmt.run(
      round2(balance.available + stakeAmount + pnl),
      round2(Math.max(0, balance.locked - stakeAmount)),
      req.user.id
    );
    insertActivityLogStmt.run(
      req.user.id,
      'user',
      'close_trade',
      JSON.stringify({
        tradeId,
        symbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        entryPrice: trade.price,
        exitPrice: marketPrice,
        pnl,
        pips
      })
    );

    const overview = computeOverview(req.user.id, 10, marketPrice);
    emitSocket('admin_trade_update', { userId: req.user.id });

    // IB commission: fired outside trade-close transaction
    ibEngine.processManualTradeCommission(req.user.id, Number(trade.qty || 0));

    res.json({ ok: true, realizedPnl: pnl, realizedPips: pips, price: marketPrice, ...overview });
  } catch (err) {
    console.error('close trade error', err);
    res.status(500).json({ error: 'Failed to close trade' });
  }
});

router.post('/close-all', requireAuth, (req, res) => {
  try {
    const openTrades = selectOpenTradesStmt.all(req.user.id);
    let totalPnl = 0;
    let totalPips = 0;
    let lastPrice = null;
    const reqBodyPrice = (() => {
      const raw = req.body?.price;
      if (raw == null) return null;
      if (typeof raw === 'object') {
        const bid = Number(raw.bid);
        const ask = Number(raw.ask);
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
          return (bid + ask) / 2;
        }
        const single = Number(raw.price);
        if (Number.isFinite(single) && single > 0) return single;
        return null;
      }
      const asNum = Number(raw);
      return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
    })();
    for (const trade of openTrades) {
      const qty = Number(trade.qty || 0);
      const stakeAmount = Number(trade.stake_amount || 0);
      if (qty <= 0) continue;
      const direction = directionForSide(trade.side);
      const latestTick = getLatestPriceForSymbol(trade.symbol);
      const marketPrice = (Number.isFinite(reqBodyPrice) && reqBodyPrice > 0)
        ? reqBodyPrice
        : (Number.isFinite(latestTick) && latestTick > 0)
          ? latestTick
          : Number(trade.price || 0);
      lastPrice = marketPrice;
      const pnl = (marketPrice - Number(trade.price || 0)) * direction * qty;
      const pips = (marketPrice - Number(trade.price || 0)) * direction;
      updateTradeCloseStmt.run(pnl, marketPrice, pips, trade.id);
      totalPnl += pnl;
      totalPips += pips;
      const balance = getOrInitBalance(req.user.id);
      updateBalanceStmt.run(
        round2(balance.available + stakeAmount + pnl),
        round2(Math.max(0, balance.locked - stakeAmount)),
        req.user.id
      );
    }
    const summaryPrice = lastPrice ?? currentPrice('BTCUSDT');
    const overview = computeOverview(req.user.id, 10, summaryPrice);
    insertActivityLogStmt.run(
      req.user.id,
      'user',
      'close_all_trades',
      JSON.stringify({
        count: openTrades.length,
        price: summaryPrice,
        realizedPnl: totalPnl,
        realizedPips: totalPips
      })
    );
    emitSocket('admin_trade_update', { userId: req.user.id });

    // IB commission for total lots closed
    const totalLots = openTrades.reduce((sum, t) => sum + Number(t.qty || 0), 0);
    ibEngine.processManualTradeCommission(req.user.id, totalLots);

    res.json({ ok: true, realizedPnl: totalPnl, realizedPips: totalPips, price: summaryPrice, ...overview });
  } catch (err) {
    console.error('close-all error', err);
    res.status(500).json({ error: 'Failed to close all trades' });
  }
});

router.get('/leaderboard', (req, res) => {
  const users = db.prepare('SELECT id, handle, name FROM users').all();
  const lb = [];
  for (const user of users) {
    const trades = db.prepare('SELECT pnl FROM trades WHERE user_id = ?').all(user.id);
    const pnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    lb.push({ user_id: user.id, handle: user.handle || `user${user.id}`, name: user.name || '', realized_pnl: Number(pnl.toFixed(2)) });
  }
  lb.sort((a, b) => b.realized_pnl - a.realized_pnl);
  res.json(lb.slice(0, 50));
});

function closeTradeInternal(trade, currentPrice, reason) {
  try {
    const qty = Number(trade.qty || 0);
    const stakeAmount = Number(trade.stake_amount || 0);
    const direction = directionForSide(trade.side);
    const pnl = (currentPrice - Number(trade.price || 0)) * direction * qty;
    const pips = (currentPrice - Number(trade.price || 0)) * direction;

    updateTradeCloseStmt.run(pnl, currentPrice, pips, trade.id);

    const balance = getOrInitBalance(trade.user_id);
    updateBalanceStmt.run(
      round2(balance.available + stakeAmount + pnl),
      round2(Math.max(0, balance.locked - stakeAmount)),
      trade.user_id
    );
    insertActivityLogStmt.run(
      trade.user_id,
      'system',
      'auto_close_trade',
      JSON.stringify({
        tradeId: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        entryPrice: trade.price,
        exitPrice: currentPrice,
        pnl,
        pips,
        reason
      })
    );
    emitSocket('trade_closed', { tradeId: trade.id, userId: trade.user_id });
    emitSocket('admin_trade_update', { userId: trade.user_id });
  } catch (err) {
    console.error(`Failed to auto-close trade via ${reason}`, err);
  }
}

export function autoCloseTrades(symbol, currentPrice) {
  const openTrades = db.prepare(`SELECT * FROM trades WHERE symbol = ? AND status = 'open'`).all(symbol);
  const usersToCheck = new Set();
  
  for (const trade of openTrades) {
    let shouldClose = false;
    const isBuy = trade.side === 'buy';
    
    if (trade.sl != null) {
      if (isBuy && currentPrice <= trade.sl) shouldClose = true;
      if (!isBuy && currentPrice >= trade.sl) shouldClose = true;
    }
    
    if (trade.tp != null) {
      if (isBuy && currentPrice >= trade.tp) shouldClose = true;
      if (!isBuy && currentPrice <= trade.tp) shouldClose = true;
    }
    
    if (shouldClose) {
      closeTradeInternal(trade, currentPrice, 'sl_tp_hit');
    } else {
      usersToCheck.add(trade.user_id);
    }
  }

  // Stop Out logic (Equity <= 0)
  for (const userId of usersToCheck) {
    const overview = computeOverview(userId);
    if (overview.equity <= 0) {
      const userOpenTrades = selectOpenTradesStmt.all(userId);
      for (const t of userOpenTrades) {
        const marketPrice = getLatestPriceForSymbol(t.symbol) ?? currentPrice;
        closeTradeInternal(t, marketPrice, 'stop_out');
      }
      // Negative Balance Protection
      const bal = getBalanceStmt.get(userId);
      if (bal && bal.available < 0) {
        updateBalanceStmt.run(0, bal.locked, userId);
      }
    }
  }
}

export default router;
