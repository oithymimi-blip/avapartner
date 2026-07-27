import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { AI_TRADE_SLOTS } from './constants.js';

const router = express.Router();
router.use(requireAuth);

// ── Prepared statements ──────────────────────────────────────────

const getSession = db.prepare(`SELECT * FROM ai_trade_sessions WHERE user_id = ?`);

const upsertSession = db.prepare(`
  INSERT INTO ai_trade_sessions (user_id, slot, allocated_amount, ai_trade_status, smart_on, earnings, session_ref, started_at, last_payout_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    slot = excluded.slot,
    allocated_amount = excluded.allocated_amount,
    ai_trade_status = excluded.ai_trade_status,
    smart_on = excluded.smart_on,
    earnings = 0,
    session_ref = excluded.session_ref,
    started_at = CURRENT_TIMESTAMP,
    last_payout_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

const updateSessionOff = db.prepare(`
  UPDATE ai_trade_sessions
  SET ai_trade_status = 'OFF', smart_on = 0, allocated_amount = 0, earnings = 0,
      session_ref = NULL, last_payout_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
`);

const insertHistory = db.prepare(`
  INSERT INTO ai_trade_history (user_id, session_ref, slot, slot_name, allocated_amount, action, payout_amount, day_number, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ── Helper ───────────────────────────────────────────────────────

function makeSessionRef(userId) {
  return `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── GET /api/ai-trade/session ────────────────────────────────────

router.get('/session', (req, res) => {
  const session = getSession.get(req.user.id);
  const bal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(req.user.id);

  let next_payout_at = null;
  if (session && session.ai_trade_status === 'ON') {
    const refStr = session.last_payout_at || session.started_at;
    if (refStr) {
      const ref = new Date(refStr).getTime();
      next_payout_at = new Date(ref + 24 * 60 * 60 * 1000).toISOString();
    }
  }

  res.json({
    session: session ? { ...session, next_payout_at } : null,
    slots: AI_TRADE_SLOTS.map(s => ({ ...s, max: s.max === Infinity ? null : s.max })),
    balance: bal || { available: 0, locked: 0 },
  });
});

// ── GET /api/ai-trade/history (paginated, with active session) ───

router.get('/history', (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    // Also include the current active session info so frontend can show it
    const activeSession = getSession.get(req.user.id) || null;

    // Count distinct sessions
    const countRow = db.prepare(`
      SELECT COUNT(DISTINCT session_ref) AS c FROM ai_trade_history WHERE user_id = ?
    `).get(req.user.id);
    const totalSessions = countRow?.c || 0;
    const totalPages = Math.max(Math.ceil(totalSessions / limit), 1);

    // Get paginated session_refs
    const refRows = db.prepare(`
      SELECT session_ref, MAX(created_at) AS latest
      FROM ai_trade_history WHERE user_id = ?
      GROUP BY session_ref ORDER BY latest DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, (page - 1) * limit);

    // Fetch all events for those sessions
    let sessions = [];
    if (refRows.length > 0) {
      const refs = refRows.map(r => r.session_ref);
      const placeholders = refs.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT * FROM ai_trade_history
        WHERE user_id = ? AND session_ref IN (${placeholders})
        ORDER BY created_at DESC
      `).all(req.user.id, ...refs);

      // Group into sessions
      const sessionMap = new Map();
      for (const row of rows) {
        if (!sessionMap.has(row.session_ref)) {
          sessionMap.set(row.session_ref, {
            session_ref: row.session_ref, slot: row.slot, slot_name: row.slot_name,
            allocated_amount: row.allocated_amount, started_at: null, stopped_at: null,
            status: 'active', total_earned: 0, total_days: 0, events: [],
          });
        }
        const s = sessionMap.get(row.session_ref);
        s.events.push(row);
        if (row.action === 'started') s.started_at = row.created_at;
        if (row.action === 'stopped') { s.stopped_at = row.created_at; s.status = 'completed'; }
        if (row.action === 'payout') {
          s.total_earned += Number(row.payout_amount);
          s.total_days = Math.max(s.total_days, row.day_number || 0);
        }
        if (row.action === 'stopped' && row.payout_amount > 0) {
          s.total_earned += Number(row.payout_amount);
        }
      }
      sessions = [...sessionMap.values()].sort((a, b) =>
        new Date(b.started_at || 0) - new Date(a.started_at || 0)
      );
    }

    // Total earned across ALL sessions
    const totalRow = db.prepare(`
      SELECT COALESCE(SUM(payout_amount), 0) AS total FROM ai_trade_history
      WHERE user_id = ? AND (action = 'payout' OR (action = 'stopped' AND payout_amount > 0))
    `).get(req.user.id);

    res.json({
      sessions,
      totalEarned: totalRow?.total || 0,
      page,
      totalPages,
      totalSessions,
      activeSession  // Include active session so frontend always has it
    });
  } catch (err) {
    console.error('[AITrade] /history error:', err);
    res.status(500).json({ error: 'Failed to load history', sessions: [], totalEarned: 0 });
  }
});

// ── POST /api/ai-trade/toggle ────────────────────────────────────

router.post('/toggle', (req, res) => {
  try {
    const { action, slot, amount, smart_on } = req.body || {};

    if (action === 'ON') {
      const slotDef = AI_TRADE_SLOTS.find(s => s.slot === Number(slot));
      if (!slotDef) return res.status(400).json({ error: 'Invalid slot selected.' });

      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount.' });
      if (amt < slotDef.min) return res.status(400).json({ error: `Minimum for ${slotDef.name} slot is $${slotDef.min}.` });
      if (slotDef.max !== Infinity && slotDef.max !== null && amt > slotDef.max) {
        return res.status(400).json({ error: `Maximum for ${slotDef.name} slot is $${slotDef.max}.` });
      }

      const existing = getSession.get(req.user.id);
      if (existing && existing.ai_trade_status === 'ON') {
        return res.status(400).json({ error: 'AI Trade is already active. Turn it off first.' });
      }

      const bal = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(req.user.id);
      if (!bal || bal.available < amt) return res.status(400).json({ error: 'Insufficient available balance.' });

      const sessionRef = makeSessionRef(req.user.id);

      db.transaction(() => {
        db.prepare('UPDATE balances SET available = COALESCE(available, 0) - ?, locked = COALESCE(locked, 0) + ? WHERE user_id = ?')
          .run(amt, amt, req.user.id);
        upsertSession.run(req.user.id, Number(slot), amt, 'ON', smart_on ? 1 : 0, sessionRef);
        // Log session start
        insertHistory.run(req.user.id, sessionRef, Number(slot), slotDef.name, amt, 'started', 0, 0,
          `AI Trade started — ${slotDef.name} slot, $${amt} invested`);
      })();

      const session = getSession.get(req.user.id);
      const updatedBal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(req.user.id);
      return res.json({ ok: true, session, balance: updatedBal });
    }

    if (action === 'OFF') {
      const session = getSession.get(req.user.id);
      if (!session || session.ai_trade_status !== 'ON') {
        return res.status(400).json({ error: 'No active AI Trade session.' });
      }

      const sessionRef = session.session_ref || makeSessionRef(req.user.id);
      const allocatedAmt = Number(session.allocated_amount || 0);
      const remainingEarnings = Number(session.earnings || 0);
      const totalReturn = allocatedAmt + remainingEarnings;
      const slotNum = Number(session.slot || 1);
      const slotDef = AI_TRADE_SLOTS.find(s => s.slot === slotNum) || AI_TRADE_SLOTS[0];

      // Count days run
      let dayCount = 0;
      try {
        const row = db.prepare(`
          SELECT COUNT(*) AS c FROM ai_trade_history
          WHERE session_ref = ? AND action = 'payout'
        `).get(sessionRef);
        dayCount = row?.c ?? 0;
      } catch (e) {
        console.error('[AITrade] Error counting payouts:', e);
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE balances
          SET available = COALESCE(available, 0) + ?,
              locked = CASE WHEN COALESCE(locked, 0) >= ? THEN COALESCE(locked, 0) - ? ELSE 0 END
          WHERE user_id = ?
        `).run(totalReturn, allocatedAmt, allocatedAmt, req.user.id);

        // Log stop event
        insertHistory.run(
          req.user.id,
          sessionRef,
          slotNum,
          slotDef ? slotDef.name : `Slot ${slotNum}`,
          allocatedAmt,
          'stopped',
          remainingEarnings,
          dayCount,
          `AI Trade stopped after ${dayCount} payout cycle(s)${remainingEarnings > 0 ? `. $${remainingEarnings.toFixed(4)} partial earnings returned.` : '.'}`
        );

        updateSessionOff.run(req.user.id);
      })();

      const updatedBal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(req.user.id);
      const updatedSession = getSession.get(req.user.id);
      return res.json({ ok: true, session: updatedSession, balance: updatedBal });
    }

    return res.status(400).json({ error: 'Invalid action. Use "ON" or "OFF".' });
  } catch (err) {
    console.error('[AITrade] /toggle error:', err);
    return res.status(500).json({ error: err.message || 'Server error while toggling AI Trade. Please try again.' });
  }
});

export default router;
