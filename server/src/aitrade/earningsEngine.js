/**
 * AI Trade Earnings Engine
 * ─────────────────────────────────────────────────────────────────
 * TICK  (every 60 seconds): accumulate net user profit per slot.
 * PAYOUT (every 24h/session): credit earnings → main balance,
 *         log to ai_trade_history, reset earnings. Session stays ON.
 * ─────────────────────────────────────────────────────────────────
 */
import db from '../db.js';
import { SLOT_RATES } from './constants.js';
import { ibEngine } from '../ib/commissionEngine.js';

const TICK_INTERVAL_MS   = 60_000;
const PAYOUT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ── Prepared statements ──────────────────────────────────────────

const getActiveSessions = db.prepare(`
  SELECT * FROM ai_trade_sessions WHERE ai_trade_status = 'ON'
`);

const addEarnings = db.prepare(`
  UPDATE ai_trade_sessions
  SET earnings = earnings + ?, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
`);

const payoutSession = db.prepare(`
  UPDATE ai_trade_sessions
  SET earnings = 0, last_payout_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
`);

const creditBalance = db.prepare(`
  UPDATE balances SET available = available + ? WHERE user_id = ?
`);

const countPastPayouts = db.prepare(`
  SELECT COUNT(*) AS c FROM ai_trade_history
  WHERE session_ref = ? AND action = 'payout'
`);

const insertHistory = db.prepare(`
  INSERT INTO ai_trade_history (user_id, session_ref, slot, slot_name, allocated_amount, action, payout_amount, day_number, note)
  VALUES (?, ?, ?, ?, ?, 'payout', ?, ?, ?)
`);

const SLOT_NAMES = { 1: 'Starter', 2: 'Booster', 3: 'Premium', 4: 'Titan Mega' };

// ── Tick ─────────────────────────────────────────────────────────

function tickEarnings() {
  try {
    const sessions = getActiveSessions.all();
    if (!sessions.length) return;
    const tick = db.transaction(() => {
      for (const session of sessions) {
        const rates = SLOT_RATES[session.slot] || SLOT_RATES[1];
        const rate = rates.min + Math.random() * (rates.max - rates.min);
        addEarnings.run(Number(session.allocated_amount) * rate, session.user_id);
      }
    });
    tick();
  } catch (err) {
    console.error('[AITradeEngine] tick error:', err);
  }
}

// ── Payout ───────────────────────────────────────────────────────

function checkPayouts() {
  try {
    const sessions = getActiveSessions.all();
    if (!sessions.length) return;
    const now = Date.now();

    for (const session of sessions) {
      const refStr = session.last_payout_at || session.started_at;
      if (!refStr) continue;
      const elapsed = now - new Date(refStr).getTime();
      if (elapsed < PAYOUT_INTERVAL_MS) continue;

      const earnings = Number(session.earnings);
      if (earnings <= 0) {
        // Still reset the timer even if nothing earned this cycle
        payoutSession.run(session.user_id);
        continue;
      }

      const dayNumber = (countPastPayouts.get(session.session_ref || '')?.c ?? 0) + 1;
      const slotName = SLOT_NAMES[session.slot] || `Slot ${session.slot}`;

      db.transaction(() => {
        creditBalance.run(earnings, session.user_id);
        payoutSession.run(session.user_id);
        if (session.session_ref) {
          insertHistory.run(
            session.user_id,
            session.session_ref,
            session.slot,
            slotName,
            session.allocated_amount,
            earnings,
            dayNumber,
            `Day ${dayNumber} payout — $${earnings.toFixed(4)} credited to main wallet`
          );
        }
      })();

      // Fire IB commission for referrer chain (non-blocking, outside main tx)
      ibEngine.processAITradeCommission(session.user_id, earnings);

      console.log(`[AITradeEngine] Payout day ${dayNumber}: user=${session.user_id} slot=${session.slot} +$${earnings.toFixed(4)}`);
    }
  } catch (err) {
    console.error('[AITradeEngine] payout error:', err);
  }
}

// ── Init ─────────────────────────────────────────────────────────

export function initAITradeEngine() {
  console.log('[AITradeEngine] Started — tick 60s, payout check every 60s (fires within 1 min of 24h window)');

  // Earnings accumulation — every 60 seconds
  setInterval(tickEarnings, TICK_INTERVAL_MS);

  // Payout check — every 60 seconds so the credit hits the balance
  // within 1 minute of the 24-hour mark, not up to 5 minutes late.
  setInterval(checkPayouts, 60_000);

  // Run immediately on startup to credit any sessions overdue from a restart
  setTimeout(checkPayouts, 3000);
}
