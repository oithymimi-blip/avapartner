/**
 * IB & Affiliate API Routes
 * ─────────────────────────────────────────────────────────────────────────
 * Public:
 *   GET  /api/ib/config                        — public live IB tier rates & rules
 *
 * User:
 *   GET  /api/ib/dashboard                     — user's full A-Z IB overview, rates, tier table & stats
 *   GET  /api/ib/ledger                        — paginated commission ledger (with rate_label & note)
 *   GET  /api/ib/team                          — direct (L1) + sub-IB (L2) referrals with join date/time
 *
 * Admin (requireAuth + requireAdminRole('users')):
 *   GET  /api/ib/admin/settings                — global IB tier ratios & program rules
 *   PUT  /api/ib/admin/settings                — update global IB percentage ratios, targets & bonuses
 *   GET  /api/ib/admin/overview                — ALL users with IB status, profit breakdown & timestamps
 *   GET  /api/ib/admin/recent-ledger           — platform-wide IB commission ledger across all users
 *   GET  /api/ib/admin/user/:id                — full IB profile + effective/custom rates for any user
 *   GET  /api/ib/admin/user/:id/ledger         — full commission ledger for any user
 *   GET  /api/ib/admin/user/:id/team           — L1 + L2 referral team for any user
 *   PUT  /api/ib/admin/user/:id/profile        — set IB holder status, level, lock, dates, notes, referrer
 *   PUT  /api/ib/admin/user/:id/level          — convenience alias to make IB holder / update level
 *   PUT  /api/ib/admin/user/:id/rates          — set or reset per-user custom commission ratios
 *   PUT  /api/ib/admin/user/:id/metrics        — edit user's monthly team volume & bonus metrics
 *   POST /api/ib/admin/user/:id/assign-referral — attach or detach a referral under this IB user
 *   POST /api/ib/admin/user/:id/credit         — manually add/adjust IB profit (+ optional balance sync & date)
 *   PUT  /api/ib/admin/ledger/:entryId         — edit ledger entry (amount, trade_amt, type, tier, rate, note, date)
 *   DELETE /api/ib/admin/ledger/:entryId       — delete ledger entry & reverse balance
 *   POST /api/ib/set-level                     — legacy admin endpoint to set IB level
 * ─────────────────────────────────────────────────────────────────────────
 */
import express from 'express';
import db from '../db.js';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import {
  IB_LEVELS,
  VALID_ASSET_CLASSES,
  formatRatesForDisplay,
  getAllTierSettings,
  getEffectiveIBProfile,
  getProgramConfig,
} from './ibConfig.js';

const router = express.Router();
const requireIBAdmin = requireAdminRole('users');

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getStatsForIBUser(userId) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(commission_amount), 0) AS lifetime_earned,
      COUNT(*) AS total_commissions,
      COALESCE(SUM(CASE WHEN asset_class = 'AI_TRADE' THEN commission_amount ELSE 0 END), 0) AS ai_trade_earned,
      COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_TRADING' THEN commission_amount ELSE 0 END), 0) AS manual_earned,
      COALESCE(SUM(CASE WHEN asset_class = 'BINARY_OPTIONS' THEN commission_amount ELSE 0 END), 0) AS binary_earned,
      COALESCE(SUM(CASE WHEN asset_class = 'MONTHLY_BONUS' THEN commission_amount ELSE 0 END), 0) AS bonus_earned,
      COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_CREDIT' THEN commission_amount ELSE 0 END), 0) AS manual_credit_earned,
      COALESCE(SUM(CASE WHEN tier_level = 'direct' THEN commission_amount ELSE 0 END), 0) AS direct_earned,
      COALESCE(SUM(CASE WHEN tier_level = 'sub_ib' THEN commission_amount ELSE 0 END), 0) AS sub_ib_earned,
      MAX(created_at) AS last_commission_at
    FROM ib_commission_ledger
    WHERE ib_user_id = ?
  `).get(userId);
}

function getTeamWithSubIB(userId) {
  const direct = db.prepare(`
    SELECT u.id, u.name, u.email, u.handle, u.created_at,
           'L1' AS tier,
           NULL AS via_user_id,
           NULL AS via_name,
           NULL AS via_email,
           (SELECT COUNT(*) FROM referrals sr WHERE sr.referrer_id = u.id) AS sub_referral_count,
           COALESCE(SUM(l.commission_amount), 0) AS generated_commission,
           COALESCE(SUM(l.trade_amount), 0) AS generated_volume
    FROM referrals r
    JOIN users u ON u.id = r.referee_id
    LEFT JOIN ib_commission_ledger l ON l.source_user_id = u.id AND l.ib_user_id = ?
    WHERE r.referrer_id = ?
    GROUP BY u.id
    ORDER BY generated_volume DESC, u.created_at DESC
  `).all(userId, userId);

  const subIb = db.prepare(`
    SELECT u2.id, u2.name, u2.email, u2.handle, u2.created_at,
           'L2' AS tier,
           u1.id AS via_user_id,
           u1.name AS via_name,
           u1.email AS via_email,
           0 AS sub_referral_count,
           COALESCE(SUM(l.commission_amount), 0) AS generated_commission,
           COALESCE(SUM(l.trade_amount), 0) AS generated_volume
    FROM referrals r1
    JOIN users u1 ON u1.id = r1.referee_id
    JOIN referrals r2 ON r2.referrer_id = u1.id
    JOIN users u2 ON u2.id = r2.referee_id
    LEFT JOIN ib_commission_ledger l ON l.source_user_id = u2.id AND l.ib_user_id = ? AND l.tier_level = 'sub_ib'
    WHERE r1.referrer_id = ? AND u2.id != ?
    GROUP BY u2.id, u1.id
    ORDER BY generated_volume DESC, u2.created_at DESC
  `).all(userId, userId, userId);

  return [...direct, ...subIb];
}

function formatTiersList(tierMap) {
  return IB_LEVELS.map(lvl => {
    const t = tierMap[lvl];
    return {
      ...t,
      formatted: formatRatesForDisplay(t),
    };
  });
}

function buildAdminUserIBProfile(userId) {
  const user = db.prepare('SELECT id, name, email, handle, role, referral_code, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const monthKey = currentMonthKey();
  const effective = getEffectiveIBProfile(userId, db);
  const stats = getStatsForIBUser(userId);
  const monthMetrics = db.prepare('SELECT * FROM ib_monthly_metrics WHERE ib_user_id = ? AND month_key = ?').get(userId, monthKey);
  const referralCount = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?').get(userId)?.c || 0;
  const subReferralCount = db.prepare(`
    SELECT COUNT(*) AS c
    FROM referrals r1
    JOIN referrals r2 ON r2.referrer_id = r1.referee_id
    WHERE r1.referrer_id = ?
  `).get(userId)?.c || 0;

  const referrerRow = db.prepare(`
    SELECT u.id, u.name, u.email FROM referrals r JOIN users u ON u.id = r.referrer_id WHERE r.referee_id = ?
  `).get(userId);

  const recentLedger = db.prepare(`
    SELECT l.*, u.name AS source_name, u.email AS source_email
    FROM ib_commission_ledger l
    LEFT JOIN users u ON u.id = l.source_user_id
    WHERE l.ib_user_id = ?
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 10
  `).all(userId);

  return {
    user,
    is_ib_holder: effective.is_ib_holder,
    ib_status: effective.ib_status,
    eligible: effective.eligible,
    level: effective.assigned_level,
    effective_level: effective.level,
    level_locked: effective.level_locked,
    assigned_at: effective.assigned_at,
    upgraded_at: effective.upgraded_at,
    notes: effective.notes,
    has_custom_rates: effective.has_custom_rates,
    custom_rates: effective.custom_rates,
    tier_defaults: effective.tier_defaults,
    effective_rates: effective.formatted_rates,
    effective_numeric: effective.effective_numeric,
    referral_count: referralCount,
    sub_referral_count: subReferralCount,
    referred_by: referrerRow || null,
    stats,
    month_key: monthKey,
    month_volume: monthMetrics?.team_volume || 0,
    bonus_paid: monthMetrics?.bonus_paid || 0,
    bonus_amount: monthMetrics?.bonus_amount || 0,
    recent_ledger: recentLedger,
    program_config: getProgramConfig(db),
  };
}

function parseOptionalNonNeg(val, label) {
  if (val === undefined || val === null || val === '') return { hasValue: false, value: null };
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return { hasValue: true, value: n };
}

function normalizeTimestampInput(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const ms = new Date(trimmed).getTime();
  if (!Number.isFinite(ms)) return null;
  // Store in SQLite UTC format "YYYY-MM-DD HH:MM:SS" for consistent sorting & strftime()
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

// ── GET /api/ib/config (public) ───────────────────────────────────────────

router.get('/config', (req, res) => {
  try {
    const tierMap = getAllTierSettings(db);
    const programConfig = getProgramConfig(db);
    res.json({
      tiers: formatTiersList(tierMap),
      program_config: programConfig,
    });
  } catch (err) {
    console.error('[IB routes] config error:', err);
    res.status(500).json({ error: 'Failed to load IB configuration' });
  }
});

// ── GET /api/ib/dashboard ─────────────────────────────────────────────────

router.get('/dashboard', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const monthKey = currentMonthKey();
    const tierMap = getAllTierSettings(db);
    const programConfig = getProgramConfig(db);
    const effective = getEffectiveIBProfile(userId, db);

    const userRow = db.prepare('SELECT id, name, email, referral_code, created_at FROM users WHERE id = ?').get(userId);
    const stats = getStatsForIBUser(userId);
    const monthMetrics = db.prepare('SELECT * FROM ib_monthly_metrics WHERE ib_user_id = ? AND month_key = ?').get(userId, monthKey);
    const monthVolume = monthMetrics?.team_volume || 0;

    const referralCount = db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?').get(userId)?.c || 0;
    const subReferralCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM referrals r1
      JOIN referrals r2 ON r2.referrer_id = r1.referee_id
      WHERE r1.referrer_id = ?
    `).get(userId)?.c || 0;

    const recentLedger = db.prepare(`
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      WHERE l.ib_user_id = ?
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 10
    `).all(userId);

    const silverTarget = Number(tierMap.SILVER?.min_monthly_volume || 5000);
    const goldTarget = Number(tierMap.GOLD?.min_monthly_volume || 25000);
    let nextTier = null;
    let nextTierTarget = 0;
    let nextTierBonus = 0;
    let progressPct = 0;
    if (effective.level === 'BRONZE') {
      nextTier = 'SILVER';
      nextTierTarget = silverTarget;
      nextTierBonus = Number(tierMap.SILVER?.monthly_bonus || 0);
      progressPct = silverTarget > 0 ? Math.min(100, (monthVolume / silverTarget) * 100) : 100;
    } else if (effective.level === 'SILVER') {
      nextTier = 'GOLD';
      nextTierTarget = goldTarget;
      nextTierBonus = Number(tierMap.GOLD?.monthly_bonus || 0);
      progressPct = goldTarget > 0 ? Math.min(100, (monthVolume / goldTarget) * 100) : 100;
    }

    res.json({
      level: effective.level,
      is_ib_holder: effective.is_ib_holder,
      ib_status: effective.ib_status,
      eligible: effective.eligible,
      level_locked: effective.level_locked,
      assigned_at: effective.assigned_at,
      upgraded_at: effective.upgraded_at,
      user_created_at: userRow?.created_at || null,
      referral_code: userRow?.referral_code || '',
      referral_count: referralCount,
      sub_referral_count: subReferralCount,
      stats,
      month_key: monthKey,
      month_volume: monthVolume,
      bonus_paid: monthMetrics?.bonus_paid || 0,
      bonus_amount: monthMetrics?.bonus_amount || 0,
      next_tier: nextTier,
      next_tier_target: nextTierTarget,
      next_tier_bonus: nextTierBonus,
      progress_pct: progressPct,
      recent_ledger: recentLedger,
      rates: effective.formatted_rates,
      effective_numeric: effective.effective_numeric,
      has_custom_rates: effective.has_custom_rates,
      tiers: formatTiersList(tierMap),
      program_config: programConfig,
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

    let whereClause = 'WHERE l.ib_user_id = ?';
    const whereParams = [userId];
    if (assetClass && assetClass !== 'ALL') {
      whereClause += ' AND l.asset_class = ?';
      whereParams.push(assetClass);
    }

    const rows = db.prepare(`
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      ${whereClause}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    `).all(...whereParams, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) AS c FROM ib_commission_ledger l ${whereClause}
    `).get(...whereParams)?.c || 0;

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[IB routes] ledger error:', err);
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

// ── GET /api/ib/team ──────────────────────────────────────────────────────

router.get('/team', requireAuth, (req, res) => {
  try {
    res.json(getTeamWithSubIB(req.user.id));
  } catch (err) {
    console.error('[IB routes] team error:', err);
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// ── Admin: Global Settings & Percentage Ratios ────────────────────────────

router.get('/admin/settings', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const tierMap = getAllTierSettings(db);
    const programConfig = getProgramConfig(db);
    res.json({
      tiers: formatTiersList(tierMap),
      program_config: programConfig,
    });
  } catch (err) {
    console.error('[IB admin] settings get error:', err);
    res.status(500).json({ error: 'Failed to load IB settings' });
  }
});

router.put('/admin/settings', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const { tiers, program_config } = req.body || {};

    db.transaction(() => {
      if (Array.isArray(tiers)) {
        const updateTier = db.prepare(`
          UPDATE ib_settings SET
            display_name = ?,
            ai_trade_direct_pct = ?,
            ai_trade_sub_pct = ?,
            manual_mode = ?,
            manual_direct_rate = ?,
            manual_sub_rate = ?,
            binary_direct_pct = ?,
            binary_sub_pct = ?,
            min_monthly_volume = ?,
            monthly_bonus = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE level = ?
        `);

        for (const t of tiers) {
          if (!IB_LEVELS.includes(t.level)) continue;
          const aiDirect = Number(t.ai_trade_direct_pct);
          const aiSub = Number(t.ai_trade_sub_pct);
          const manualDirect = Number(t.manual_direct_rate);
          const manualSub = Number(t.manual_sub_rate);
          const binDirect = Number(t.binary_direct_pct);
          const binSub = Number(t.binary_sub_pct);
          const minVol = Number(t.min_monthly_volume);
          const bonus = Number(t.monthly_bonus);

          for (const [label, num] of [
            ['ai_trade_direct_pct', aiDirect],
            ['ai_trade_sub_pct', aiSub],
            ['manual_direct_rate', manualDirect],
            ['manual_sub_rate', manualSub],
            ['binary_direct_pct', binDirect],
            ['binary_sub_pct', binSub],
            ['min_monthly_volume', minVol],
            ['monthly_bonus', bonus],
          ]) {
            if (!Number.isFinite(num) || num < 0) {
              throw new Error(`${t.level} ${label} must be >= 0`);
            }
          }

          const manualMode = t.manual_mode === 'percent' ? 'percent' : 'per_lot';
          const displayName = String(t.display_name || '').trim() || t.level;

          updateTier.run(
            displayName,
            aiDirect,
            aiSub,
            manualMode,
            manualDirect,
            manualSub,
            binDirect,
            binSub,
            minVol,
            bonus,
            t.level
          );
        }
      }

      if (program_config && typeof program_config === 'object') {
        const upsertCfg = db.prepare(`
          INSERT INTO ib_program_config (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        if (program_config.only_approved_ib_earn !== undefined) {
          upsertCfg.run('only_approved_ib_earn', program_config.only_approved_ib_earn ? '1' : '0');
        }
        if (program_config.auto_upgrade_enabled !== undefined) {
          upsertCfg.run('auto_upgrade_enabled', program_config.auto_upgrade_enabled ? '1' : '0');
        }
      }

      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'update_ib_settings', JSON.stringify({ actor: req.user.id }));
    })();

    const tierMap = getAllTierSettings(db);
    const updatedCfg = getProgramConfig(db);
    res.json({ ok: true, tiers: formatTiersList(tierMap), program_config: updatedCfg });
  } catch (err) {
    console.error('[IB admin] settings save error:', err);
    res.status(400).json({ error: err.message || 'Failed to update IB settings' });
  }
});

// ── Admin: Overview (ALL users + IB summary) ──────────────────────────────

router.get('/admin/overview', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const monthKey = currentMonthKey();
    const tierMap = getAllTierSettings(db);
    const programConfig = getProgramConfig(db);

    const rows = db.prepare(`
      SELECT
        u.id AS user_id,
        u.name,
        u.email,
        u.handle,
        u.role,
        u.referral_code,
        u.created_at AS user_created_at,
        il.level AS assigned_level,
        il.is_ib_holder,
        il.level_locked,
        il.assigned_at,
        il.upgraded_at,
        ur.user_id AS custom_rates_user_id,
        ur.ai_trade_direct_pct AS c_ai_direct,
        ur.ai_trade_sub_pct AS c_ai_sub,
        ur.manual_mode AS c_manual_mode,
        ur.manual_direct_rate AS c_manual_direct,
        ur.manual_sub_rate AS c_manual_sub,
        ur.binary_direct_pct AS c_binary_direct,
        ur.binary_sub_pct AS c_binary_sub,
        ur.monthly_bonus AS c_monthly_bonus,
        COALESCE(l_agg.lifetime_earned, 0) AS lifetime_earned,
        COALESCE(l_agg.total_commissions, 0) AS total_commissions,
        COALESCE(l_agg.ai_trade_earned, 0) AS ai_trade_earned,
        COALESCE(l_agg.manual_earned, 0) AS manual_earned,
        COALESCE(l_agg.binary_earned, 0) AS binary_earned,
        COALESCE(l_agg.bonus_earned, 0) AS bonus_earned,
        COALESCE(l_agg.manual_credit_earned, 0) AS manual_credit_earned,
        COALESCE(l_agg.direct_earned, 0) AS direct_earned,
        COALESCE(l_agg.sub_ib_earned, 0) AS sub_ib_earned,
        l_agg.last_commission_at,
        COALESCE(m.team_volume, 0) AS month_volume,
        COALESCE(m.bonus_paid, 0) AS bonus_paid,
        COALESCE(m.bonus_amount, 0) AS bonus_amount,
        (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) AS referral_count,
        (SELECT COUNT(*) FROM referrals r1 JOIN referrals r2 ON r2.referrer_id = r1.referee_id WHERE r1.referrer_id = u.id) AS sub_referral_count,
        (SELECT ru.email FROM referrals rr JOIN users ru ON ru.id = rr.referrer_id WHERE rr.referee_id = u.id LIMIT 1) AS referred_by_email
      FROM users u
      LEFT JOIN ib_levels il ON il.user_id = u.id
      LEFT JOIN ib_user_rates ur ON ur.user_id = u.id
      LEFT JOIN ib_monthly_metrics m ON m.ib_user_id = u.id AND m.month_key = ?
      LEFT JOIN (
        SELECT
          ib_user_id,
          COALESCE(SUM(commission_amount), 0) AS lifetime_earned,
          COUNT(*) AS total_commissions,
          COALESCE(SUM(CASE WHEN asset_class = 'AI_TRADE' THEN commission_amount ELSE 0 END), 0) AS ai_trade_earned,
          COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_TRADING' THEN commission_amount ELSE 0 END), 0) AS manual_earned,
          COALESCE(SUM(CASE WHEN asset_class = 'BINARY_OPTIONS' THEN commission_amount ELSE 0 END), 0) AS binary_earned,
          COALESCE(SUM(CASE WHEN asset_class = 'MONTHLY_BONUS' THEN commission_amount ELSE 0 END), 0) AS bonus_earned,
          COALESCE(SUM(CASE WHEN asset_class = 'MANUAL_CREDIT' THEN commission_amount ELSE 0 END), 0) AS manual_credit_earned,
          COALESCE(SUM(CASE WHEN tier_level = 'direct' THEN commission_amount ELSE 0 END), 0) AS direct_earned,
          COALESCE(SUM(CASE WHEN tier_level = 'sub_ib' THEN commission_amount ELSE 0 END), 0) AS sub_ib_earned,
          MAX(created_at) AS last_commission_at
        FROM ib_commission_ledger
        GROUP BY ib_user_id
      ) l_agg ON l_agg.ib_user_id = u.id
      ORDER BY
        CASE WHEN il.user_id IS NOT NULL AND COALESCE(il.is_ib_holder, 1) = 1 THEN 0 ELSE 1 END,
        lifetime_earned DESC,
        u.created_at DESC
    `).all(monthKey);

    const users = rows.map(r => {
      const hasRow = r.assigned_level !== null;
      const isIbHolder = hasRow && Number(r.is_ib_holder ?? 1) === 1;
      const isPaused = hasRow && Number(r.is_ib_holder ?? 1) === 0;
      const effectiveLevel = IB_LEVELS.includes(r.assigned_level) ? r.assigned_level : 'BRONZE';
      const base = tierMap[effectiveLevel] || tierMap.BRONZE;
      const pick = (c, d) => (c !== null && c !== undefined ? Number(c) : Number(d || 0));
      const numeric = {
        ai_trade_direct_pct: pick(r.c_ai_direct, base.ai_trade_direct_pct),
        ai_trade_sub_pct: pick(r.c_ai_sub, base.ai_trade_sub_pct),
        manual_mode: r.c_manual_mode || base.manual_mode || 'per_lot',
        manual_direct_rate: pick(r.c_manual_direct, base.manual_direct_rate),
        manual_sub_rate: pick(r.c_manual_sub, base.manual_sub_rate),
        binary_direct_pct: pick(r.c_binary_direct, base.binary_direct_pct),
        binary_sub_pct: pick(r.c_binary_sub, base.binary_sub_pct),
        monthly_bonus: pick(r.c_monthly_bonus, base.monthly_bonus),
      };
      const hasCustomRates = Boolean(
        r.custom_rates_user_id && (
          r.c_ai_direct != null || r.c_ai_sub != null || r.c_manual_mode != null ||
          r.c_manual_direct != null || r.c_manual_sub != null ||
          r.c_binary_direct != null || r.c_binary_sub != null || r.c_monthly_bonus != null
        )
      );

      return {
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        handle: r.handle,
        role: r.role,
        referral_code: r.referral_code,
        user_created_at: r.user_created_at,
        is_ib_holder: isIbHolder,
        ib_status: isIbHolder ? 'ACTIVE_IB' : (isPaused ? 'PAUSED' : 'STANDARD'),
        level: r.assigned_level || null,
        effective_level: effectiveLevel,
        level_locked: Number(r.level_locked || 0) === 1,
        assigned_at: r.assigned_at || r.upgraded_at || null,
        upgraded_at: r.upgraded_at || null,
        has_custom_rates: hasCustomRates,
        effective_rates: formatRatesForDisplay(numeric),
        lifetime_earned: Number(r.lifetime_earned || 0),
        total_commissions: Number(r.total_commissions || 0),
        ai_trade_earned: Number(r.ai_trade_earned || 0),
        manual_earned: Number(r.manual_earned || 0),
        binary_earned: Number(r.binary_earned || 0),
        bonus_earned: Number(r.bonus_earned || 0),
        manual_credit_earned: Number(r.manual_credit_earned || 0),
        direct_earned: Number(r.direct_earned || 0),
        sub_ib_earned: Number(r.sub_ib_earned || 0),
        last_commission_at: r.last_commission_at || null,
        month_volume: Number(r.month_volume || 0),
        bonus_paid: Number(r.bonus_paid || 0),
        bonus_amount: Number(r.bonus_amount || 0),
        referral_count: Number(r.referral_count || 0),
        sub_referral_count: Number(r.sub_referral_count || 0),
        referred_by_email: r.referred_by_email || null,
      };
    });

    const summary = {
      total_users: users.length,
      total_ib_holders: users.filter(u => u.is_ib_holder).length,
      total_ib_profit_paid: users.reduce((s, u) => s + u.lifetime_earned, 0),
      total_month_volume: users.reduce((s, u) => s + u.month_volume, 0),
      total_commissions_count: users.reduce((s, u) => s + u.total_commissions, 0),
      month_key: monthKey,
    };

    res.json({ users, summary, program_config: programConfig });
  } catch (err) {
    console.error('[IB routes] admin overview error:', err);
    res.status(500).json({ error: 'Failed to load admin IB overview' });
  }
});

// ── Admin: Platform-wide Recent IB Ledger ──────────────────────────────────

router.get('/admin/recent-ledger', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const assetClass = req.query.asset_class || null;
    const q = String(req.query.q || '').trim().toLowerCase();

    const conditions = [];
    const params = [];
    if (assetClass && assetClass !== 'ALL') {
      conditions.push('l.asset_class = ?');
      params.push(assetClass);
    }
    if (q) {
      conditions.push(`(
        LOWER(COALESCE(ib_u.email, '')) LIKE ?
        OR LOWER(COALESCE(ib_u.name, '')) LIKE ?
        OR LOWER(COALESCE(src_u.email, '')) LIKE ?
        OR LOWER(COALESCE(src_u.name, '')) LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT l.*,
             ib_u.name AS ib_name, ib_u.email AS ib_email,
             src_u.name AS source_name, src_u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users ib_u ON ib_u.id = l.ib_user_id
      LEFT JOIN users src_u ON src_u.id = l.source_user_id
      ${whereSql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM ib_commission_ledger l
      LEFT JOIN users ib_u ON ib_u.id = l.ib_user_id
      LEFT JOIN users src_u ON src_u.id = l.source_user_id
      ${whereSql}
    `).get(...params)?.c || 0;

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[IB admin] recent ledger error:', err);
    res.status(500).json({ error: 'Failed to load platform IB ledger' });
  }
});

// ── Admin: Full User IB Profile ───────────────────────────────────────────

router.get('/admin/user/:id', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });
    const profile = buildAdminUserIBProfile(userId);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
  } catch (err) {
    console.error('[IB admin] user profile error:', err);
    res.status(500).json({ error: 'Failed to load IB profile' });
  }
});

router.get('/admin/user/:id/ledger', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const assetClass = req.query.asset_class || null;

    let whereClause = 'WHERE l.ib_user_id = ?';
    const whereParams = [userId];
    if (assetClass && assetClass !== 'ALL') {
      whereClause += ' AND l.asset_class = ?';
      whereParams.push(assetClass);
    }

    const rows = db.prepare(`
      SELECT l.*, u.name AS source_name, u.email AS source_email
      FROM ib_commission_ledger l
      LEFT JOIN users u ON u.id = l.source_user_id
      ${whereClause}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?
    `).all(...whereParams, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) AS c FROM ib_commission_ledger l ${whereClause}
    `).get(...whereParams)?.c || 0;

    res.json({ rows, total, limit, offset });
  } catch (err) {
    console.error('[IB admin] user ledger error:', err);
    res.status(500).json({ error: 'Failed to load ledger' });
  }
});

router.get('/admin/user/:id/team', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });
    res.json(getTeamWithSubIB(userId));
  } catch (err) {
    console.error('[IB admin] user team error:', err);
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// ── Admin: Make IB Holder / Set Level / Lock / Date / Notes / Referrer ────

router.put('/admin/user/:id/profile', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { status, level, level_locked, assigned_at, notes, referred_by_email } = req.body || {};

    db.transaction(() => {
      if (status === 'STANDARD') {
        db.prepare('DELETE FROM ib_levels WHERE user_id = ?').run(userId);
      } else {
        const chosenLevel = IB_LEVELS.includes(level) ? level : 'BRONZE';
        const holderFlag = status === 'PAUSED' ? 0 : 1;
        const lockFlag = level_locked === undefined ? 1 : (level_locked ? 1 : 0);
        const parsedDate = normalizeTimestampInput(assigned_at);
        const existing = db.prepare('SELECT * FROM ib_levels WHERE user_id = ?').get(userId);

        if (existing) {
          db.prepare(`
            UPDATE ib_levels SET
              level = ?,
              is_ib_holder = ?,
              level_locked = ?,
              assigned_at = COALESCE(?, assigned_at, CURRENT_TIMESTAMP),
              upgraded_at = COALESCE(?, CURRENT_TIMESTAMP),
              notes = ?
            WHERE user_id = ?
          `).run(
            chosenLevel,
            holderFlag,
            lockFlag,
            parsedDate,
            parsedDate,
            notes !== undefined ? String(notes || '') : (existing.notes || ''),
            userId
          );
        } else {
          db.prepare(`
            INSERT INTO ib_levels (user_id, level, is_ib_holder, level_locked, assigned_at, upgraded_at, notes)
            VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP), ?)
          `).run(userId, chosenLevel, holderFlag, lockFlag, parsedDate, parsedDate, String(notes || ''));
        }
      }

      if (referred_by_email !== undefined) {
        const refEmail = String(referred_by_email || '').trim().toLowerCase();
        if (!refEmail) {
          db.prepare('DELETE FROM referrals WHERE referee_id = ?').run(userId);
        } else {
          const refUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(refEmail);
          if (!refUser) throw new Error(`Referrer email "${refEmail}" not found`);
          if (refUser.id === userId) throw new Error('A user cannot refer themselves');
          db.prepare('DELETE FROM referrals WHERE referee_id = ?').run(userId);
          db.prepare('INSERT INTO referrals (referrer_id, referee_id) VALUES (?, ?)').run(refUser.id, userId);
        }
      }

      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'update_ib_profile', JSON.stringify({ user_id: userId, status, level, level_locked, actor: req.user.id }));
    })();

    res.json({ ok: true, profile: buildAdminUserIBProfile(userId) });
  } catch (err) {
    console.error('[IB admin] update profile error:', err);
    res.status(400).json({ error: err.message || 'Failed to update IB profile' });
  }
});

function setLevelHandler(req, res) {
  try {
    const userId = Number(req.params.id || req.body?.user_id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const { level, is_ib_holder = true, level_locked = true } = req.body || {};
    if (!IB_LEVELS.includes(level)) {
      return res.status(400).json({ error: 'Invalid level. Use BRONZE, SILVER, or GOLD.' });
    }

    db.prepare(`
      INSERT INTO ib_levels (user_id, level, is_ib_holder, level_locked, assigned_at, upgraded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        level = excluded.level,
        is_ib_holder = excluded.is_ib_holder,
        level_locked = excluded.level_locked,
        assigned_at = COALESCE(ib_levels.assigned_at, CURRENT_TIMESTAMP),
        upgraded_at = CURRENT_TIMESTAMP
    `).run(userId, level, is_ib_holder ? 1 : 0, level_locked ? 1 : 0);

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'set_ib_level', JSON.stringify({ user_id: userId, level, actor: req.user.id }));

    res.json({ ok: true, user_id: userId, level });
  } catch (err) {
    console.error('[IB routes] set-level error:', err);
    res.status(500).json({ error: 'Failed to set IB level' });
  }
}

router.post('/set-level', requireAuth, requireIBAdmin, setLevelHandler);
router.put('/admin/user/:id/level', requireAuth, requireIBAdmin, setLevelHandler);

// ── Admin: Custom Per-User Commission Ratios ──────────────────────────────

router.put('/admin/user/:id/rates', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const body = req.body || {};
    if (body.reset) {
      db.prepare('DELETE FROM ib_user_rates WHERE user_id = ?').run(userId);
      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'reset_ib_user_rates', JSON.stringify({ user_id: userId, actor: req.user.id }));
      return res.json({ ok: true, profile: buildAdminUserIBProfile(userId) });
    }

    const aiDirect = parseOptionalNonNeg(body.ai_trade_direct_pct, 'AI Trade Direct %');
    const aiSub = parseOptionalNonNeg(body.ai_trade_sub_pct, 'AI Trade Sub-IB %');
    const manualDirect = parseOptionalNonNeg(body.manual_direct_rate, 'Manual Direct Rate');
    const manualSub = parseOptionalNonNeg(body.manual_sub_rate, 'Manual Sub-IB Rate');
    const binaryDirect = parseOptionalNonNeg(body.binary_direct_pct, 'Binary Direct %');
    const binarySub = parseOptionalNonNeg(body.binary_sub_pct, 'Binary Sub-IB %');
    const monthlyBonus = parseOptionalNonNeg(body.monthly_bonus, 'Monthly Bonus');

    const manualMode = (body.manual_mode === 'per_lot' || body.manual_mode === 'percent') ? body.manual_mode : null;

    const allEmpty = !aiDirect.hasValue && !aiSub.hasValue && !manualMode &&
      !manualDirect.hasValue && !manualSub.hasValue && !binaryDirect.hasValue &&
      !binarySub.hasValue && !monthlyBonus.hasValue;

    if (allEmpty) {
      db.prepare('DELETE FROM ib_user_rates WHERE user_id = ?').run(userId);
    } else {
      db.prepare(`
        INSERT INTO ib_user_rates (
          user_id, ai_trade_direct_pct, ai_trade_sub_pct, manual_mode,
          manual_direct_rate, manual_sub_rate, binary_direct_pct, binary_sub_pct,
          monthly_bonus, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
          ai_trade_direct_pct = excluded.ai_trade_direct_pct,
          ai_trade_sub_pct = excluded.ai_trade_sub_pct,
          manual_mode = excluded.manual_mode,
          manual_direct_rate = excluded.manual_direct_rate,
          manual_sub_rate = excluded.manual_sub_rate,
          binary_direct_pct = excluded.binary_direct_pct,
          binary_sub_pct = excluded.binary_sub_pct,
          monthly_bonus = excluded.monthly_bonus,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        userId,
        aiDirect.value,
        aiSub.value,
        manualMode,
        manualDirect.value,
        manualSub.value,
        binaryDirect.value,
        binarySub.value,
        monthlyBonus.value
      );
    }

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'update_ib_user_rates', JSON.stringify({ user_id: userId, actor: req.user.id }));

    res.json({ ok: true, profile: buildAdminUserIBProfile(userId) });
  } catch (err) {
    console.error('[IB admin] user rates error:', err);
    res.status(400).json({ error: err.message || 'Failed to update user IB rates' });
  }
});

// ── Admin: Edit Monthly Metrics (Volume & Bonus) ──────────────────────────

router.put('/admin/user/:id/metrics', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const { team_volume, bonus_paid, bonus_amount, month_key } = req.body || {};
    const targetMonth = month_key || currentMonthKey();
    const vol = Number(team_volume ?? 0);
    const bonusAmt = Number(bonus_amount ?? 0);
    const paidFlag = bonus_paid ? 1 : 0;

    if (!Number.isFinite(vol) || vol < 0) return res.status(400).json({ error: 'Invalid team_volume' });
    if (!Number.isFinite(bonusAmt) || bonusAmt < 0) return res.status(400).json({ error: 'Invalid bonus_amount' });

    db.prepare(`
      INSERT INTO ib_monthly_metrics (ib_user_id, month_key, team_volume, bonus_paid, bonus_amount, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ib_user_id, month_key) DO UPDATE SET
        team_volume = excluded.team_volume,
        bonus_paid = excluded.bonus_paid,
        bonus_amount = excluded.bonus_amount,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, targetMonth, vol, paidFlag, bonusAmt);

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'edit_ib_metrics', JSON.stringify({ user_id: userId, month_key: targetMonth, vol, paidFlag, bonusAmt, actor: req.user.id }));

    res.json({ ok: true, profile: buildAdminUserIBProfile(userId) });
  } catch (err) {
    console.error('[IB admin] edit metrics error:', err);
    res.status(500).json({ error: 'Failed to update monthly metrics' });
  }
});

// ── Admin: Attach / Detach Referral Under User ────────────────────────────

router.post('/admin/user/:id/assign-referral', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const referrerId = Number(req.params.id);
    if (!Number.isInteger(referrerId)) return res.status(400).json({ error: 'Invalid user id' });

    const { email, referee_id, action = 'add' } = req.body || {};
    let targetUser = null;
    if (referee_id) {
      targetUser = db.prepare('SELECT id, email FROM users WHERE id = ?').get(Number(referee_id));
    } else if (email) {
      targetUser = db.prepare('SELECT id, email FROM users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase());
    }
    if (!targetUser) return res.status(404).json({ error: 'Referral user not found' });
    if (targetUser.id === referrerId) return res.status(400).json({ error: 'User cannot refer themselves' });

    if (action === 'remove') {
      db.prepare('DELETE FROM referrals WHERE referrer_id = ? AND referee_id = ?').run(referrerId, targetUser.id);
    } else {
      db.prepare('DELETE FROM referrals WHERE referee_id = ?').run(targetUser.id);
      db.prepare('INSERT INTO referrals (referrer_id, referee_id) VALUES (?, ?)').run(referrerId, targetUser.id);
    }

    db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
      .run('admin', 'admin_assign_referral', JSON.stringify({ referrer_id: referrerId, referee_id: targetUser.id, action, actor: req.user.id }));

    res.json({ ok: true, team: getTeamWithSubIB(referrerId) });
  } catch (err) {
    console.error('[IB admin] assign referral error:', err);
    res.status(500).json({ error: 'Failed to update referral link' });
  }
});

// ── Admin: Credit / Adjust IB Profit ──────────────────────────────────────

router.post('/admin/user/:id/credit', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const {
      amount,
      direction = 'add',
      asset_class = 'MANUAL_CREDIT',
      trade_amount,
      tier_level = 'admin_manual',
      rate_label,
      note,
      created_at,
      sync_balance = true,
    } = req.body || {};

    const rawAmt = Number(amount);
    if (!Number.isFinite(rawAmt) || rawAmt === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero number' });
    }
    const signedAmount = direction === 'deduct' ? -Math.abs(rawAmt) : rawAmt;
    const baseVolume = trade_amount !== undefined && trade_amount !== ''
      ? Math.max(0, Number(trade_amount) || 0)
      : Math.max(0, signedAmount);

    const assetClass = VALID_ASSET_CLASSES.includes(asset_class) ? asset_class : 'MANUAL_CREDIT';
    const validTiers = ['direct', 'sub_ib', 'bonus', 'admin_manual'];
    const tierLevel = validTiers.includes(tier_level) ? tier_level : 'admin_manual';
    const parsedTs = normalizeTimestampInput(created_at);
    const monthKey = parsedTs ? parsedTs.slice(0, 7) : currentMonthKey();

    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(userId);

      if (parsedTs) {
        db.prepare(`
          INSERT INTO ib_commission_ledger
            (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level, rate_label, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, req.user.id, assetClass, baseVolume, signedAmount, tierLevel, rate_label || 'Admin', note || null, parsedTs);
      } else {
        db.prepare(`
          INSERT INTO ib_commission_ledger
            (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level, rate_label, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, req.user.id, assetClass, baseVolume, signedAmount, tierLevel, rate_label || 'Admin', note || null);
      }

      if (sync_balance !== false) {
        db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(signedAmount, userId);
      }

      if (baseVolume > 0) {
        db.prepare(`
          INSERT INTO ib_monthly_metrics (ib_user_id, month_key, team_volume)
          VALUES (?, ?, ?)
          ON CONFLICT(ib_user_id, month_key) DO UPDATE SET
            team_volume = team_volume + excluded.team_volume,
            updated_at = CURRENT_TIMESTAMP
        `).run(userId, monthKey, baseVolume);
      }

      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'manual_ib_credit', JSON.stringify({ user_id: userId, amount: signedAmount, asset_class: assetClass, note, sync_balance, actor: req.user.id }));
    })();

    res.json({ ok: true, credited: signedAmount });
  } catch (err) {
    console.error('[IB admin] credit error:', err);
    res.status(500).json({ error: 'Failed to credit commission' });
  }
});

// ── Admin: Edit / Delete Ledger Entry ─────────────────────────────────────

router.put('/admin/ledger/:entryId', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId)) return res.status(400).json({ error: 'Invalid entry id' });

    const entry = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    const {
      commission_amount,
      asset_class,
      trade_amount,
      tier_level,
      rate_label,
      note,
      created_at,
      sync_balance = true,
    } = req.body || {};

    const fields = [];
    const params = [];
    let balanceDelta = 0;

    if (commission_amount !== undefined) {
      const n = Number(commission_amount);
      if (!Number.isFinite(n)) return res.status(400).json({ error: 'Invalid commission_amount' });
      balanceDelta = n - Number(entry.commission_amount);
      fields.push('commission_amount = ?');
      params.push(n);
    }

    if (trade_amount !== undefined) {
      const n = Number(trade_amount);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Invalid trade_amount' });
      fields.push('trade_amount = ?');
      params.push(n);
    }

    if (asset_class && VALID_ASSET_CLASSES.includes(asset_class)) {
      fields.push('asset_class = ?');
      params.push(asset_class);
    }

    if (tier_level && ['direct', 'sub_ib', 'bonus', 'admin_manual'].includes(tier_level)) {
      fields.push('tier_level = ?');
      params.push(tier_level);
    }

    if (rate_label !== undefined) {
      fields.push('rate_label = ?');
      params.push(rate_label ? String(rate_label) : null);
    }

    if (note !== undefined) {
      fields.push('note = ?');
      params.push(note ? String(note) : null);
    }

    if (created_at !== undefined && created_at !== '') {
      const normalizedTs = normalizeTimestampInput(created_at);
      if (!normalizedTs) return res.status(400).json({ error: 'Invalid created_at timestamp' });
      fields.push('created_at = ?');
      params.push(normalizedTs);
    }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(entryId);
    db.transaction(() => {
      if (sync_balance !== false && balanceDelta !== 0) {
        db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(balanceDelta, entry.ib_user_id);
      }
      db.prepare(`UPDATE ib_commission_ledger SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
        .run('admin', 'edit_ib_ledger', JSON.stringify({ entry_id: entryId, changes: req.body, actor: req.user.id }));
    })();

    const updated = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    res.json({ ok: true, entry: updated });
  } catch (err) {
    console.error('[IB admin] edit ledger error:', err);
    res.status(500).json({ error: 'Failed to edit ledger entry' });
  }
});

router.delete('/admin/ledger/:entryId', requireAuth, requireIBAdmin, (req, res) => {
  try {
    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId)) return res.status(400).json({ error: 'Invalid entry id' });

    const entry = db.prepare('SELECT * FROM ib_commission_ledger WHERE id = ?').get(entryId);
    if (!entry) return res.status(404).json({ error: 'Ledger entry not found' });

    db.transaction(() => {
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
