import express from 'express';
import db from '../db.js';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import { emitSocket } from '../market/engine.js';
import {
  isPromoExpired,
  calculateBonusAmount,
  createAndEmitUserNotification,
  creditBonusToUserTx,
  getBonusSystemSettings,
  saveBonusSystemSettings,
  evaluateUserBonusWithdrawalStatus
} from './promoEngine.js';

const router = express.Router();
const adminRouter = express.Router();

function optionalAuth(req, res, next) {
  if (req.headers.authorization) {
    return requireAuth(req, res, next);
  }
  req.user = null;
  return next();
}

router.get('/withdrawal-status', requireAuth, (req, res) => {
  res.json(evaluateUserBonusWithdrawalStatus(req.user.id));
});

router.get('/', optionalAuth, (req, res) => {
  const settings = getBonusSystemSettings();
  const allPromos = settings.system_enabled
    ? db.prepare(`
        SELECT * FROM promotions
        WHERE active = 1
        ORDER BY featured DESC, sort_order ASC, id ASC
      `).all().filter(p => !isPromoExpired(p))
    : [];

  if (!req.user?.id) {
    return res.json({
      promotions: allPromos.map(p => ({
        ...p,
        user_claim_count: 0,
        latest_claim_status: null,
        can_claim: true
      })),
      claims: [],
      deposit_stats: { approved_count: 0, total_deposited: 0, latest_deposit_amount: 0 },
      active_count: allPromos.length,
      settings,
      withdrawal_status: null
    });
  }

  const userId = req.user.id;
  const claims = db.prepare(`
    SELECT pc.*, p.title AS promo_title, p.category AS promo_category, p.badge_text AS promo_badge,
           p.bonus_type, p.bonus_value, p.max_bonus_amount, p.min_deposit
    FROM promotion_claims pc
    LEFT JOIN promotions p ON p.id = pc.promotion_id
    WHERE pc.user_id = ?
    ORDER BY pc.claimed_at DESC, pc.id DESC
  `).all(userId);

  const depStats = db.prepare(`
    SELECT
      COUNT(*) AS approved_count,
      COALESCE(SUM(amount), 0) AS total_deposited,
      COALESCE((
        SELECT amount FROM payment_requests
        WHERE user_id = ? AND type = 'deposit' AND status = 'approved'
        ORDER BY id DESC LIMIT 1
      ), 0) AS latest_deposit_amount
    FROM payment_requests
    WHERE user_id = ? AND type = 'deposit' AND status = 'approved'
  `).get(userId, userId);

  const claimsByPromo = new Map();
  for (const c of claims) {
    if (!claimsByPromo.has(c.promotion_id)) claimsByPromo.set(c.promotion_id, []);
    claimsByPromo.get(c.promotion_id).push(c);
  }

  const globalCountsRows = db.prepare(`
    SELECT promotion_id, COUNT(*) AS c
    FROM promotion_claims
    WHERE status != 'rejected'
    GROUP BY promotion_id
  `).all();
  const globalCounts = new Map(globalCountsRows.map(r => [r.promotion_id, Number(r.c || 0)]));

  const enrichedPromos = allPromos.map(p => {
    const promoClaims = claimsByPromo.get(p.id) || [];
    const activeNonRejected = promoClaims.filter(c => c.status !== 'rejected');
    const latestClaim = promoClaims[0] || null;
    const maxClaims = Math.max(1, Number(p.max_claims_per_user || 1));
    const globalLimit = Number(p.total_global_limit || 0);
    const totalUsed = globalCounts.get(p.id) || 0;
    const withinGlobal = globalLimit === 0 || totalUsed < globalLimit;

    return {
      ...p,
      global_claims_used: totalUsed,
      user_claim_count: activeNonRejected.length,
      latest_claim_status: latestClaim?.status || null,
      latest_claim_id: latestClaim?.id || null,
      can_claim: withinGlobal && activeNonRejected.length < maxClaims && !['activated', 'pending'].includes(latestClaim?.status)
    };
  });

  const withdrawalStatus = evaluateUserBonusWithdrawalStatus(userId);

  res.json({
    promotions: enrichedPromos,
    claims,
    deposit_stats: {
      approved_count: Number(depStats?.approved_count || 0),
      total_deposited: Number(depStats?.total_deposited || 0),
      latest_deposit_amount: Number(depStats?.latest_deposit_amount || 0)
    },
    active_count: enrichedPromos.length,
    settings,
    withdrawal_status: withdrawalStatus
  });
});

function handleClaimPromotion(userId, userEmail, promo) {
  const settings = getBonusSystemSettings();
  if (!settings.system_enabled) {
    return { status: 400, error: 'Promotions and bonus offers are currently paused.' };
  }
  if (!promo || promo.active !== 1 || isPromoExpired(promo)) {
    return { status: 404, error: 'Promotion is no longer active or has expired.' };
  }

  const globalLimit = Number(promo.total_global_limit || 0);
  if (globalLimit > 0) {
    const totalUsed = db.prepare(`
      SELECT COUNT(*) AS c FROM promotion_claims
      WHERE promotion_id = ? AND status != 'rejected'
    `).get(promo.id)?.c || 0;
    if (totalUsed >= globalLimit) {
      return { status: 400, error: 'This promotional offer has reached its maximum campaign redemption limit.' };
    }
  }

  const existingClaims = db.prepare(`
    SELECT * FROM promotion_claims
    WHERE promotion_id = ? AND user_id = ?
    ORDER BY id DESC
  `).all(promo.id, userId);

  const inProgress = existingClaims.find(c => c.status === 'activated' || c.status === 'pending');
  if (inProgress) {
    return {
      status: 200,
      ok: true,
      alreadyActive: true,
      claim: inProgress,
      needsDeposit: inProgress.status === 'activated',
      message: inProgress.status === 'activated'
        ? `Offer "${promo.title}" is already activated! Deposit $${Number(promo.min_deposit).toFixed(2)}+ USDT to unlock your bonus.`
        : `Your claim for "${promo.title}" is already pending review.`
    };
  }

  const nonRejectedCount = existingClaims.filter(c => c.status !== 'rejected').length;
  const maxClaims = Math.max(1, Number(promo.max_claims_per_user || 1));
  if (nonRejectedCount >= maxClaims) {
    return { status: 400, error: `You have already reached the maximum claim limit (${maxClaims}) for this offer.` };
  }

  const minDeposit = Math.max(0, Number(promo.min_deposit || 0));

  // Look for latest qualifying approved deposit not already bound to another bonus claim
  const qualifyingDeposit = minDeposit > 0
    ? db.prepare(`
        SELECT pr.id, pr.amount
        FROM payment_requests pr
        WHERE pr.user_id = ?
          AND pr.type = 'deposit'
          AND pr.status = 'approved'
          AND pr.amount >= ?
          AND NOT EXISTS (
            SELECT 1 FROM promotion_claims pc
            WHERE pc.deposit_request_id = pr.id
              AND pc.status != 'rejected'
          )
        ORDER BY pr.id DESC
        LIMIT 1
      `).get(userId, minDeposit)
    : null;

  if (minDeposit > 0 && !qualifyingDeposit) {
    const previewBonus = calculateBonusAmount(promo, minDeposit);

    const info = db.prepare(`
      INSERT INTO promotion_claims (promotion_id, user_id, promo_code, deposit_amount, bonus_amount, status)
      VALUES (?, ?, ?, 0, ?, 'activated')
    `).run(promo.id, userId, promo.promo_code || null, previewBonus);

    const claim = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(Number(info.lastInsertRowid));
    createAndEmitUserNotification(
      userId,
      'Bonus Offer Activated',
      `You activated "${promo.title}". Deposit at least $${minDeposit.toFixed(2)} USDT to unlock your bonus.`
    );

    return {
      status: 200,
      ok: true,
      needsDeposit: true,
      claim,
      message: `Offer activated! Make a qualifying deposit of $${minDeposit.toFixed(2)}+ USDT to unlock your bonus.`
    };
  }

  const depReqId = qualifyingDeposit ? qualifyingDeposit.id : null;
  const depAmt = qualifyingDeposit ? Number(qualifyingDeposit.amount) : 0;
  const bonusAmt = calculateBonusAmount(promo, depAmt);

  if (promo.auto_credit === 1 && bonusAmt > 0) {
    const info = db.prepare(`
      INSERT INTO promotion_claims (promotion_id, user_id, deposit_request_id, promo_code, deposit_amount, bonus_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(promo.id, userId, depReqId, promo.promo_code || null, depAmt, bonusAmt);

    const claimId = Number(info.lastInsertRowid);
    creditBonusToUserTx({
      claimId,
      userId,
      bonusAmount: bonusAmt,
      depositAmount: depAmt,
      promo,
      promoTitle: promo.title,
      promoCode: promo.promo_code,
      adminNote: 'Instant auto-credited bonus',
      actorRole: 'system'
    });
    const claim = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(claimId);
    return {
      status: 200,
      ok: true,
      credited: true,
      claim,
      message: `+$${bonusAmt.toFixed(2)} bonus from "${promo.title}" has been credited to your balance!`
    };
  }

  const info = db.prepare(`
    INSERT INTO promotion_claims (promotion_id, user_id, deposit_request_id, promo_code, deposit_amount, bonus_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(promo.id, userId, depReqId, promo.promo_code || null, depAmt, bonusAmt);

  const claim = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(Number(info.lastInsertRowid));

  createAndEmitUserNotification(
    userId,
    'Bonus Claim Submitted',
    `Your claim for "${promo.title}" (+$${bonusAmt.toFixed(2)}) has been submitted for approval.`
  );
  notifyAdmin({
    type: 'promotion',
    title: '🎁 New Bonus Claim Submitted',
    message: `${userEmail || `User #${userId}`} claimed "${promo.title}" (+$${bonusAmt.toFixed(2)}).`,
    user_email: userEmail || '',
    link: '/admin/promotions'
  });

  return {
    status: 200,
    ok: true,
    pending: true,
    claim,
    message: `Claim submitted for +$${bonusAmt.toFixed(2)}! Our team will credit your bonus shortly.`
  };
}

router.post('/redeem', requireAuth, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Please enter a valid promo code.' });

  const promo = db.prepare('SELECT * FROM promotions WHERE UPPER(promo_code) = ?').get(code);
  if (!promo) return res.status(404).json({ error: `Promo code "${code}" was not found.` });

  const result = handleClaimPromotion(req.user.id, req.user.email, promo);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

router.post('/:id/claim', requireAuth, (req, res) => {
  const promoId = Number(req.params.id);
  if (!Number.isInteger(promoId)) return res.status(400).json({ error: 'Invalid promotion ID.' });

  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(promoId);
  const result = handleClaimPromotion(req.user.id, req.user.email, promo);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
});

// ── Admin Routes ────────────────────────────────────────────────────────────
adminRouter.use(requireAuth);
adminRouter.use(requireAdminRole('users'));

adminRouter.get('/', (req, res) => {
  const settings = getBonusSystemSettings();
  const promotions = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM promotion_claims pc WHERE pc.promotion_id = p.id AND pc.status != 'rejected') AS total_claims_count
    FROM promotions p
    ORDER BY p.featured DESC, p.sort_order ASC, p.id DESC
  `).all();

  const claims = db.prepare(`
    SELECT pc.*,
           p.title AS promo_title,
           p.category AS promo_category,
           p.badge_text AS promo_badge,
           p.bonus_type,
           p.bonus_value,
           p.min_deposit,
           u.email AS user_email,
           u.name AS user_name,
           u.handle AS user_handle
    FROM promotion_claims pc
    LEFT JOIN promotions p ON p.id = pc.promotion_id
    LEFT JOIN users u ON u.id = pc.user_id
    ORDER BY
      CASE pc.status WHEN 'pending' THEN 0 WHEN 'activated' THEN 1 ELSE 2 END,
      pc.claimed_at DESC,
      pc.id DESC
    LIMIT 250
  `).all();

  const rawLocks = db.prepare(`
    SELECT bl.*, u.email AS user_email, u.name AS user_name, u.handle AS user_handle
    FROM bonus_locks bl
    LEFT JOIN users u ON u.id = bl.user_id
    ORDER BY CASE bl.status WHEN 'active' THEN 0 ELSE 1 END, bl.id DESC
    LIMIT 200
  `).all();

  const locks = rawLocks.map(l => {
    if (l.status !== 'active') return { ...l, live_status: null };
    return {
      ...l,
      live_status: evaluateUserBonusWithdrawalStatus(l.user_id)
    };
  });

  const statsRow = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM promotions) AS total_offers,
      (SELECT COUNT(*) FROM promotions WHERE active = 1) AS active_offers,
      (SELECT COUNT(*) FROM promotion_claims WHERE status = 'pending') AS pending_claims,
      (SELECT COUNT(*) FROM promotion_claims WHERE status = 'activated') AS activated_claims,
      (SELECT COUNT(*) FROM bonus_locks WHERE status = 'active') AS active_locks,
      (SELECT COALESCE(SUM(bonus_amount), 0) FROM promotion_claims WHERE status = 'credited') AS total_credited_amount
  `).get();

  res.json({
    settings,
    promotions,
    claims,
    locks,
    summary: {
      total_offers: Number(statsRow?.total_offers || 0),
      active_offers: Number(statsRow?.active_offers || 0),
      pending_claims: Number(statsRow?.pending_claims || 0),
      activated_claims: Number(statsRow?.activated_claims || 0),
      active_locks: Number(statsRow?.active_locks || 0),
      total_credited_amount: Number(statsRow?.total_credited_amount || 0)
    }
  });
});

adminRouter.put('/settings', (req, res) => {
  const body = req.body || {};
  const updated = saveBonusSystemSettings(body);
  if (body.sync_to_offers) {
    db.prepare(`
      UPDATE promotions
      SET profit_multiplier = ?,
          cashout_pct_per_milestone = ?,
          required_milestones = ?,
          allowed_sources = ?,
          updated_at = CURRENT_TIMESTAMP
    `).run(
      updated.default_double_multiplier,
      updated.default_cashout_pct,
      updated.default_required_milestones,
      updated.allowed_profit_sources.join(',')
    );
  }
  emitSocket('promotions_updated', { ts: Date.now() });
  res.json({ ok: true, settings: updated });
});

function sanitizePromoPayload(body = {}) {
  const settings = getBonusSystemSettings();
  const title = String(body.title || '').trim();
  const subtitle = String(body.subtitle || '').trim();
  const allowedCategories = ['deposit_bonus', 'welcome_bonus', 'promo_offer', 'cashback'];
  const category = allowedCategories.includes(body.category) ? body.category : 'deposit_bonus';
  const badge_text = String(body.badge_text || '').trim().slice(0, 24) || null;
  const bonus_type = body.bonus_type === 'fixed' ? 'fixed' : 'percentage';
  const bonus_value = Math.max(0, Number(body.bonus_value || 0));
  const max_bonus_amount = Math.max(0, Number(body.max_bonus_amount || 0));
  const min_deposit = Math.max(0, Number(body.min_deposit || 0));
  const promo_code = body.promo_code ? String(body.promo_code).trim().toUpperCase().replace(/\s+/g, '') : null;
  const terms = String(body.terms || '').trim() || null;
  const auto_credit = body.auto_credit ? 1 : 0;
  const featured = body.featured ? 1 : 0;
  const active = body.active === undefined ? 1 : (body.active ? 1 : 0);
  const max_claims_per_user = Math.max(1, parseInt(body.max_claims_per_user, 10) || 1);

  const apply_withdrawal_condition = body.apply_withdrawal_condition === undefined
    ? 1
    : (body.apply_withdrawal_condition ? 1 : 0);
  const profit_multiplier = Math.max(1.01, Number(body.profit_multiplier || settings.default_double_multiplier || 2));
  const cashout_pct_per_milestone = Math.min(100, Math.max(1, Number(body.cashout_pct_per_milestone || settings.default_cashout_pct || 50)));
  const required_milestones = Math.max(1, parseInt(body.required_milestones, 10) || settings.default_required_milestones || 2);

  const validSources = ['ai_trade', 'forex', 'binary'];
  const rawSources = Array.isArray(body.allowed_sources)
    ? body.allowed_sources
    : String(body.allowed_sources || settings.allowed_profit_sources.join(',')).split(',');
  const cleanSources = rawSources.map(s => s.trim()).filter(s => validSources.includes(s));
  const allowed_sources = (cleanSources.length ? cleanSources : validSources).join(',');

  const total_global_limit = Math.max(0, parseInt(body.total_global_limit, 10) || 0);
  const sort_order = parseInt(body.sort_order, 10) || 0;
  const expires_at = body.expires_at ? String(body.expires_at).trim() : null;

  return {
    title,
    subtitle,
    category,
    badge_text,
    bonus_type,
    bonus_value,
    max_bonus_amount,
    min_deposit,
    promo_code,
    terms,
    auto_credit,
    featured,
    active,
    max_claims_per_user,
    apply_withdrawal_condition,
    profit_multiplier,
    cashout_pct_per_milestone,
    required_milestones,
    allowed_sources,
    total_global_limit,
    sort_order,
    expires_at
  };
}

adminRouter.post('/', (req, res) => {
  const data = sanitizePromoPayload(req.body);
  if (!data.title) return res.status(400).json({ error: 'Offer title is required.' });
  if (!Number.isFinite(data.bonus_value) || data.bonus_value <= 0) {
    return res.status(400).json({ error: 'Bonus value must be greater than 0.' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO promotions (
        title, subtitle, category, badge_text, bonus_type, bonus_value,
        max_bonus_amount, min_deposit, promo_code, terms,
        auto_credit, featured, active, max_claims_per_user,
        apply_withdrawal_condition, profit_multiplier, cashout_pct_per_milestone,
        required_milestones, allowed_sources, total_global_limit, sort_order, expires_at
      ) VALUES (
        @title, @subtitle, @category, @badge_text, @bonus_type, @bonus_value,
        @max_bonus_amount, @min_deposit, @promo_code, @terms,
        @auto_credit, @featured, @active, @max_claims_per_user,
        @apply_withdrawal_condition, @profit_multiplier, @cashout_pct_per_milestone,
        @required_milestones, @allowed_sources, @total_global_limit, @sort_order, @expires_at
      )
    `).run(data);
    const created = db.prepare('SELECT * FROM promotions WHERE id = ?').get(Number(info.lastInsertRowid));
    emitSocket('promotions_updated', { ts: Date.now() });
    res.json({ ok: true, promotion: created });
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'A promotion with this promo code already exists.' });
    }
    res.status(500).json({ error: err?.message || 'Failed to create promotion.' });
  }
});

adminRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Promotion not found.' });

  const merged = sanitizePromoPayload({ ...existing, ...req.body });
  if (!merged.title) return res.status(400).json({ error: 'Offer title is required.' });
  if (!Number.isFinite(merged.bonus_value) || merged.bonus_value <= 0) {
    return res.status(400).json({ error: 'Bonus value must be greater than 0.' });
  }

  try {
    db.prepare(`
      UPDATE promotions SET
        title = @title,
        subtitle = @subtitle,
        category = @category,
        badge_text = @badge_text,
        bonus_type = @bonus_type,
        bonus_value = @bonus_value,
        max_bonus_amount = @max_bonus_amount,
        min_deposit = @min_deposit,
        promo_code = @promo_code,
        terms = @terms,
        auto_credit = @auto_credit,
        featured = @featured,
        active = @active,
        max_claims_per_user = @max_claims_per_user,
        apply_withdrawal_condition = @apply_withdrawal_condition,
        profit_multiplier = @profit_multiplier,
        cashout_pct_per_milestone = @cashout_pct_per_milestone,
        required_milestones = @required_milestones,
        allowed_sources = @allowed_sources,
        total_global_limit = @total_global_limit,
        sort_order = @sort_order,
        expires_at = @expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...merged, id });
    const updated = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
    emitSocket('promotions_updated', { ts: Date.now() });
    res.json({ ok: true, promotion: updated });
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'A promotion with this promo code already exists.' });
    }
    res.status(500).json({ error: err?.message || 'Failed to update promotion.' });
  }
});

adminRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM promotions WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Promotion not found.' });
  emitSocket('promotions_updated', { ts: Date.now() });
  res.json({ ok: true });
});

adminRouter.post('/claims/:claimId/approve', (req, res) => {
  const claimId = Number(req.params.claimId);
  const claim = db.prepare(`
    SELECT pc.*, p.id AS p_id, p.title AS promo_title, p.promo_code AS p_code,
           p.apply_withdrawal_condition, p.profit_multiplier, p.cashout_pct_per_milestone,
           p.required_milestones, p.allowed_sources
    FROM promotion_claims pc
    LEFT JOIN promotions p ON p.id = pc.promotion_id
    WHERE pc.id = ?
  `).get(claimId);

  if (!claim) return res.status(404).json({ error: 'Claim not found.' });
  if (claim.status === 'credited') return res.status(400).json({ error: 'Bonus already credited.' });
  if (claim.status === 'rejected') return res.status(400).json({ error: 'Cannot approve a rejected claim.' });

  const requestedAmount = req.body?.bonus_amount !== undefined && req.body?.bonus_amount !== ''
    ? Number(req.body.bonus_amount)
    : Number(claim.bonus_amount || 0);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return res.status(400).json({ error: 'Valid bonus amount greater than 0 is required to credit.' });
  }

  const adminNote = req.body?.admin_note ? String(req.body.admin_note).trim() : null;

  creditBonusToUserTx({
    claimId: claim.id,
    userId: claim.user_id,
    bonusAmount: Math.round(requestedAmount * 100) / 100,
    depositAmount: Number(claim.deposit_amount || 0),
    promo: {
      id: claim.p_id || claim.promotion_id,
      title: claim.promo_title || 'Promotion Bonus',
      promo_code: claim.promo_code || claim.p_code,
      apply_withdrawal_condition: claim.apply_withdrawal_condition ?? 1,
      profit_multiplier: claim.profit_multiplier,
      cashout_pct_per_milestone: claim.cashout_pct_per_milestone,
      required_milestones: claim.required_milestones,
      allowed_sources: claim.allowed_sources
    },
    promoTitle: claim.promo_title || 'Promotion Bonus',
    promoCode: claim.promo_code || claim.p_code,
    adminNote,
    actorRole: 'admin'
  });

  const updated = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(claimId);
  res.json({ ok: true, claim: updated });
});

adminRouter.post('/claims/:claimId/reject', (req, res) => {
  const claimId = Number(req.params.claimId);
  const claim = db.prepare(`
    SELECT pc.*, p.title AS promo_title
    FROM promotion_claims pc
    LEFT JOIN promotions p ON p.id = pc.promotion_id
    WHERE pc.id = ?
  `).get(claimId);

  if (!claim) return res.status(404).json({ error: 'Claim not found.' });
  if (claim.status === 'credited') return res.status(400).json({ error: 'Already credited claims cannot be rejected.' });

  const adminNote = req.body?.admin_note ? String(req.body.admin_note).trim() : 'Does not meet offer eligibility criteria.';

  db.prepare(`
    UPDATE promotion_claims
    SET status = 'rejected',
        admin_note = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(adminNote, claimId);

  createAndEmitUserNotification(
    claim.user_id,
    'Promotion Claim Update',
    `Your bonus claim for "${claim.promo_title || 'Promotion'}" was not approved: ${adminNote}`
  );

  const updated = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(claimId);
  res.json({ ok: true, claim: updated });
});

adminRouter.put('/locks/:lockId', (req, res) => {
  const lockId = Number(req.params.lockId);
  const lock = db.prepare('SELECT * FROM bonus_locks WHERE id = ?').get(lockId);
  if (!lock) return res.status(404).json({ error: 'Bonus lock not found.' });

  const body = req.body || {};
  const nextMilestoneBase = body.milestone_base_balance !== undefined ? Math.max(0.01, Number(body.milestone_base_balance) || lock.milestone_base_balance) : lock.milestone_base_balance;
  const nextMultiplier = body.profit_multiplier !== undefined ? Math.max(1.01, Number(body.profit_multiplier) || lock.profit_multiplier) : lock.profit_multiplier;
  const nextCashoutPct = body.cashout_pct !== undefined ? Math.min(100, Math.max(1, Number(body.cashout_pct) || lock.cashout_pct)) : lock.cashout_pct;
  const nextReqMilestones = body.required_milestones !== undefined ? Math.max(1, parseInt(body.required_milestones, 10) || lock.required_milestones) : lock.required_milestones;
  const nextCompleted = body.milestones_completed !== undefined ? Math.max(0, parseInt(body.milestones_completed, 10) || 0) : lock.milestones_completed;
  const nextOffset = body.manual_profit_offset !== undefined ? (Number(body.manual_profit_offset) || 0) : lock.manual_profit_offset;

  let nextAllowed = lock.allowed_sources;
  if (body.allowed_sources !== undefined) {
    const valid = ['ai_trade', 'forex', 'binary'];
    const raw = Array.isArray(body.allowed_sources) ? body.allowed_sources : String(body.allowed_sources).split(',');
    const clean = raw.map(s => s.trim()).filter(s => valid.includes(s));
    if (clean.length) nextAllowed = clean.join(',');
  }

  const nextStatus = body.status && ['active', 'completed', 'cancelled'].includes(body.status)
    ? body.status
    : (nextCompleted >= nextReqMilestones ? 'completed' : lock.status);

  db.prepare(`
    UPDATE bonus_locks
    SET milestone_base_balance = ?,
        profit_multiplier = ?,
        cashout_pct = ?,
        required_milestones = ?,
        milestones_completed = ?,
        manual_profit_offset = ?,
        allowed_sources = ?,
        status = ?,
        completed_at = CASE WHEN ? IN ('completed', 'cancelled') THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    nextMilestoneBase,
    nextMultiplier,
    nextCashoutPct,
    nextReqMilestones,
    nextCompleted,
    nextOffset,
    nextAllowed,
    nextStatus,
    nextStatus,
    lockId
  );

  emitSocket('user_data_update', { user_id: lock.user_id, type: 'balance_updated' });
  const updated = db.prepare('SELECT * FROM bonus_locks WHERE id = ?').get(lockId);
  res.json({ ok: true, lock: updated });
});

adminRouter.post('/locks/:lockId/complete', (req, res) => {
  const lockId = Number(req.params.lockId);
  const lock = db.prepare('SELECT * FROM bonus_locks WHERE id = ?').get(lockId);
  if (!lock) return res.status(404).json({ error: 'Bonus lock not found.' });

  db.prepare(`
    UPDATE bonus_locks
    SET status = 'completed',
        milestones_completed = required_milestones,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(lockId);

  createAndEmitUserNotification(
    lock.user_id,
    'Full Withdrawal Unlocked!',
    `Admin marked your bonus terms for "${lock.promo_title || 'Deposit Bonus'}" as completed. You can now withdraw your full funds normally.`
  );
  emitSocket('user_data_update', { user_id: lock.user_id, type: 'balance_updated' });
  res.json({ ok: true });
});

export { router as promotionsRouter, adminRouter as adminPromotionsRouter };
