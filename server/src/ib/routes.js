/**
 * IB & Affiliate API Routes
 * ─────────────────────────────────────────────────────────────────────────
 * GET  /api/ib/dashboard               — user's IB overview (level, stats, ledger)
 * GET  /api/ib/ledger                  — paginated commission ledger
 * GET  /api/ib/team                    — list of direct referrals + their volume
 * POST /api/ib/set-level               — admin: manually set a user's IB level
 * GET  /api/ib/admin/overview          — admin: all IB users overview
 * GET  /api/ib/admin/user/:id          — admin: full IB profile for any user
 * GET  /api/ib/admin/user/:id/ledger   — admin: full commission ledger for any user
 * GET  /api/ib/admin/user/:id/team     — admin: team members for any user
 * PUT  /api/ib/admin/user/:id/level    — admin: set IB rank for any user
 * POST /api/ib/admin/user/:id/credit   — admin: manually credit commission
 * PUT  /api/ib/admin/ledger/:entryId   — admin: edit a commission ledger entry
 * DELETE /api/ib/admin/ledger/:entryId — admin: delete a commission ledger entry
 * ─────────────────────────────────────────────────────────────────────────
 */
import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = express.Router();

// ── Admin middleware ──────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const AI_TRADE_RATES = {
  BRONZE: { direct: '5%',   sub: '—' },
  SILVER: { direct: '8%',   sub: '2%' },
  GOLD:   { direct: '12%',  sub: '5%' },
};
const MANUAL_RATES = {
  BRONZE: { direct: '$2/lot', sub: '—' },
  SILVER: { direct: '$4/lot', sub: '$1/lot' },
  GOLD:   { direct: '$8/lot', sub: '$2/lot' },
};
const BINARY_RATES = {
  BRONZE: { direct: '1%',   sub: '—' },
  SILVER: { direct: '2%',   sub: '0.5%' },
  GOLD:   { direct: '3.5%', sub: '—' },
};

// ── GET /api/ib/dashboard ─────────────────────────────────────────────────

router.get('/dashboard', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const monthKey = currentMonthKey();

    // Level
    const levelRow = db.prepare('SELECT level, upgraded_at FROM ib_levels WHERE user_id = ?').get(userId);
    const level = levelRow?.level || 'BRONZE';

    // Lifetime stats
    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(commission_amount), 0) AS lifetime_earned,
        COUNT(*) AS total_commissions,
        COALESCE(SUM(CASE WHEN asset_class = 'AI_TRADE' THEN commission_amount ELSE 0 END), 0) AS ai_trade_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_TRADING' THEN commission_amount ELSE 0 END), 0) AS manual_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'BINARY_OPTIONS' THEN commission_amount ELSE 0 END), 0) AS binary_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'MONTHLY_BONUS' THEN commission_amount ELSE 0 END), 0) AS bonus_earned
      FROM ib_commission_ledger
      WHERE ib_user_id = ?
    `).get(userId);

    // Current month metrics
    const monthMetrics = db.prepare(`
      SELECT * FROM ib_monthly_metrics WHERE ib_user_id = ? AND month_key = ?
    `).get(userId, monthKey);

    const monthVolume = monthMetrics?.team_volume || 0;

    // Direct referral count
    const referralCount = db.prepare(`
      SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?
    `).get(userId)?.c || 0;

    // Recent ledger (last 10)
    const recentLedger = db.prepare(`
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      WHERE l.ib_user_id = ?
      ORDER BY l.created_at DESC
      LIMIT 10
    `).all(userId);

    // Next tier progress
    const SILVER_TARGET = 5000;
    const GOLD_TARGET = 25000;
    let nextTier = null;
    let progressPct = 0;
    if (level === 'BRONZE') {
      nextTier = 'SILVER';
      progressPct = Math.min(100, (monthVolume / SILVER_TARGET) * 100);
    } else if (level === 'SILVER') {
      nextTier = 'GOLD';
      progressPct = Math.min(100, (monthVolume / GOLD_TARGET) * 100);
    }

    res.json({
      level,
      upgraded_at: levelRow?.upgraded_at || null,
      referral_count: referralCount,
      stats,
      month_key: monthKey,
      month_volume: monthVolume,
      bonus_paid: monthMetrics?.bonus_paid || 0,
      bonus_amount: monthMetrics?.bonus_amount || 0,
      next_tier: nextTier,
      progress_pct: progressPct,
      recent_ledger: recentLedger,
      rates: {
        ai_trade: AI_TRADE_RATES[level],
        manual: MANUAL_RATES[level],
        binary: BINARY_RATES[level],
      },
    });
  } catch (err) {
    console.error('[IB routes] dashboard error:', err);
    res.status(500).json({ error: 'Failed to load IB dashboard' });
  }
});

// ── GET /api/ib/ledger ────────────────────────────────────────────────────

router.get('/ledger', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const assetClass = req.query.asset_class || null;

    let query = `
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      WHERE l.ib_user_id = ?
    `;
    const params = [userId];

    if (assetClass) {
      query += ' AND l.asset_class = ?';
      params.push(assetClass);
    }
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);

    const total = db.prepare(`
      SELECT COUNT(*) AS c FROM ib_commission_ledger WHERE ib_user_id = ?
    `).get(userId)?.c || 0;

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[IB routes] ledger error:', err);
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

// ── GET /api/ib/team ──────────────────────────────────────────────────────

router.get('/team', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const team = db.prepare(`
      SELECT u.id, u.name, u.email, u.created_at,
             COALESCE(SUM(l.commission_amount), 0) AS generated_commission,
             COALESCE(SUM(l.trade_amount), 0) AS generated_volume
      FROM referrals r
      JOIN users u ON u.id = r.referee_id
      LEFT JOIN ib_commission_ledger l ON l.source_user_id = u.id AND l.ib_user_id = ?
      WHERE r.referrer_id = ?
      GROUP BY u.id
      ORDER BY generated_volume DESC
    `).all(userId, userId);
    res.json(team);
  } catch (err) {
    console.error('[IB routes] team error:', err);
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// ── POST /api/ib/set-level (admin) ────────────────────────────────────────

router.post('/set-level', requireAuth, requireAdmin, (req, res) => {
  try {
    const { user_id, level } = req.body;
    if (!['BRONZE', 'SILVER', 'GOLD'].includes(level)) {
      return res.status(400).json({ error: 'Invalid level. Use BRONZE, SILVER, or GOLD.' });
    }
    db.prepare(`
      INSERT INTO ib_levels (user_id, level)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, upgraded_at = CURRENT_TIMESTAMP
    `).run(user_id, level);
    res.json({ ok: true, user_id, level });
  } catch (err) {
    console.error('[IB routes] set-level error:', err);
    res.status(500).json({ error: 'Failed to set IB level' });
  }
});

// ── GET /api/ib/admin/overview ────────────────────────────────────────────

router.get('/admin/overview', requireAuth, requireAdmin, (req, res) => {
  try {
    const monthKey = currentMonthKey();
    const users = db.prepare(`
      SELECT
        il.user_id,
        il.level,
        il.upgraded_at,
        u.name,
        u.email,
        COALESCE(SUM(l.commission_amount), 0) AS lifetime_earned,
        COALESCE(m.team_volume, 0) AS month_volume,
        (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = il.user_id) AS referral_count
      FROM ib_levels il
      JOIN users u ON u.id = il.user_id
      LEFT JOIN ib_commission_ledger l ON l.ib_user_id = il.user_id
      LEFT JOIN ib_monthly_metrics m ON m.ib_user_id = il.user_id AND m.month_key = ?
      GROUP BY il.user_id
      ORDER BY lifetime_earned DESC
    `).all(monthKey);
    res.json(users);
  } catch (err) {
    console.error('[IB routes] admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin IB overview' });
  }
});

// ── GET /api/ib/admin/user/:id  ───────────────────────────────────────────
// Full IB profile for any user (admin view)

router.get('/admin/user/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const monthKey = currentMonthKey();

    const user = db.prepare('SELECT id, name, email, handle, created_at FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const levelRow = db.prepare('SELECT level, upgraded_at FROM ib_levels WHERE user_id = ?').get(userId);
    const level = levelRow?.level || null;

    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(commission_amount), 0) AS lifetime_earned,
        COUNT(*) AS total_commissions,
        COALESCE(SUM(CASE WHEN asset_class = 'AI_TRADE' THEN commission_amount ELSE 0 END), 0) AS ai_trade_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_TRADING' THEN commission_amount ELSE 0 END), 0) AS manual_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'BINARY_OPTIONS' THEN commission_amount ELSE 0 END), 0) AS binary_earned,
        COALESCE(SUM(CASE WHEN asset_class = 'MONTHLY_BONUS' THEN commission_amount ELSE 0 END), 0) AS bonus_earned
      FROM ib_commission_ledger
      WHERE ib_user_id = ?
    `).get(userId);

    const monthMetrics = db.prepare('SELECT * FROM ib_monthly_metrics WHERE ib_user_id = ? AND month_key = ?').get(userId, monthKey);

    const referralCount = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?').get(userId)?.c || 0;

    const referrerRow = db.prepare(`
      SELECT u.id, u.name, u.email FROM referrals r JOIN users u ON u.id = r.referrer_id WHERE r.referee_id = ?
    `).get(userId);

    const recentLedger = db.prepare(`
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      WHERE l.ib_user_id = ?
      ORDER BY l.created_at DESC
      LIMIT 10
    `).all(userId);

    res.json({
      user,
      level,
      upgraded_at: levelRow?.upgraded_at || null,
      referral_count: referralCount,
      referred_by: referrerRow || null,
      stats,
      month_key: monthKey,
      month_volume: monthMetrics?.team_volume || 0,
      bonus_paid: monthMetrics?.bonus_paid || 0,
      bonus_amount: monthMetrics?.bonus_amount || 0,
      recent_ledger: recentLedger,
    });
  } catch (err) {
    console.error('[IB admin] user profile error:', err);
    res.status(500).json({ error: 'Failed to load IB profile' });
  }
});

// ── GET /api/ib/admin/user/:id/ledger  ────────────────────────────────────

router.get('/admin/user/:id/ledger', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const assetClass = req.query.asset_class || null;

    let query = `
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      WHERE l.ib_user_id = ?
    `;
    const params = [userId];
    if (assetClass) {
      query += ' AND l.asset_class = ?';
      params.push(assetClass);
    }
    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS c FROM ib_commission_ledger WHERE ib_user_id = ?').get(userId)?.c || 0;

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[IB admin] user ledger error:', err);
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

// ── GET /api/ib/admin/user/:id/team  ─────────────────────────────────────

router.get('/admin/user/:id/team', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const team = db.prepare(`
      SELECT u.id, u.name, u.email, u.created_at,
             COALESCE(SUM(l.commission_amount), 0) AS generated_commission,
             COALESCE(SUM(l.trade_amount), 0) AS generated_volume
      FROM referrals r
      JOIN users u ON u.id = r.referee_id
      LEFT JOIN ib_commission_ledger l ON l.source_user_id = u.id AND l.ib_user_id = ?
      WHERE r.referrer_id = ?
      GROUP BY u.id
      ORDER BY generated_volume DESC
    `).all(userId, userId);

    res.json(team);
  } catch (err) {
    console.error('[IB admin] user team error:', err);
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// ── PUT /api/ib/admin/user/:id/level  ────────────────────────────────────

router.put('/admin/user/:id/level', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const { level } = req.body || {};
    if (!['BRONZE', 'SILVER', 'GOLD'].includes(level)) {
      return res.status(400).json({ error: 'Invalid level. Use BRONZE, SILVER, or GOLD.' });
    }

    db.prepare(`
      INSERT INTO ib_levels (user_id, level)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, upgraded_at = CURRENT_TIMESTAMP
    `).run(userId, level);

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'set_ib_level', JSON.stringify({ user_id: userId, level, actor: req.user.id }));

    res.json({ ok: true, user_id: userId, level });
  } catch (err) {
    console.error('[IB admin] set level error:', err);
    res.status(500).json({ error: 'Failed to set IB level' });
  }
});

// ── POST /api/ib/admin/user/:id/credit  ──────────────────────────────────

router.post('/admin/user/:id/credit', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const { amount, asset_class, note } = req.body || {};
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const validClasses = ['AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS', 'MANUAL_CREDIT'];
    const assetClass = validClasses.includes(asset_class) ? asset_class : 'MANUAL_CREDIT';

    const monthKey = currentMonthKey();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO ib_commission_ledger
          (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, req.user.id, assetClass, numericAmount, numericAmount, 'admin_manual');

      db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(numericAmount, userId);

      db.prepare(`
        INSERT INTO ib_monthly_metrics (ib_user_id, month_key, team_volume)
        VALUES (?, ?, ?)
        ON CONFLICT(ib_user_id, month_key) DO UPDATE SET
          team_volume = team_volume + excluded.team_volume,
          updated_at = CURRENT_TIMESTAMP
      `).run(userId, monthKey, numericAmount);

      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'manual_ib_credit', JSON.stringify({ user_id: userId, amount: numericAmount, asset_class: assetClass, note, actor: req.user.id }));
    })();

    res.json({ ok: true, credited: numericAmount });
  } catch (err) {
    console.error('[IB admin] credit error:', err);
    res.status(500).json({ error: 'Failed to credit commission' });
  }
});

// ── PUT /api/ib/admin/ledger/:entryId  ───────────────────────────────────

router.put('/admin/ledger/:entryId', requireAuth, requireAdmin, (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId)) return res.status(400).json({ error: 'Invalid entry id' });

    const entry = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    const { commission_amount, asset_class, trade_amount, created_at } = req.body || {};
    const fields = [];
    const params = [];

    if (commission_amount !== undefined) {
      const n = Number(commission_amount);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid commission_amount' });
      // Adjust balance: remove old, add new
      const diff = n - Number(entry.commission_amount);
      db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(diff, entry.ib_user_id);
      fields.push('commission_amount = ?');
      params.push(n);
    }

    if (trade_amount !== undefined) {
      const n = Number(trade_amount);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid trade_amount' });
      fields.push('trade_amount = ?');
      params.push(n);
    }

    const validClasses = ['AI_TRADE', 'MANUAL_TRADING', 'BINARY_OPTIONS', 'MONTHLY_BONUS', 'MANUAL_CREDIT'];
    if (asset_class && validClasses.includes(asset_class)) {
      fields.push('asset_class = ?');
      params.push(asset_class);
    }

    if (created_at) {
      fields.push('created_at = ?');
      params.push(created_at);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(entryId);
    db.prepare(`UPDATE ib_commission_ledger SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'edit_ib_ledger', JSON.stringify({ entry_id: entryId, changes: req.body, actor: req.user.id }));

    const updated = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    res.json({ ok: true, entry: updated });
  } catch (err) {
    console.error('[IB admin] edit ledger error:', err);
    res.status(500).json({ error: 'Failed to edit ledger entry' });
  }
});

// ── DELETE /api/ib/admin/ledger/:entryId  ────────────────────────────────

router.delete('/admin/ledger/:entryId', requireAuth, requireAdmin, (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId)) return res.status(400).json({ error: 'Invalid entry id' });

    const entry = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    db.transaction(() => {
      // Reverse the balance credit
      db.prepare('UPDATE balances SET available = available - ? WHERE user_id = ?')
        .run(Number(entry.commission_amount), entry.ib_user_id);
      db.prepare('DELETE FROM ib_commission_ledger WHERE id = ?').run(entryId);
      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'delete_ib_ledger', JSON.stringify({ entry_id: entryId, amount: entry.commission_amount, actor: req.user.id }));
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error('[IB admin] delete ledger error:', err);
    res.status(500).json({ error: 'Failed to delete ledger entry' });
  }
});

export default router;
