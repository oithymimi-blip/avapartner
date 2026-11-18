import express from 'express';
import db from '../db.js';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import {
  isPromoExpired,
  calculateBonusAmount,
  createAndEmitUserNotification,
  creditBonusToUserTx
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

router.get('/', optionalAuth, (req, res) => {
  const allPromos = db.prepare(`
    SELECT * FROM promotions
    WHERE active = 1
    ORDER BY featured DESC, id ASC
  `).all().filter(p => !isPromoExpired(p));

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
      active_count: allPromos.length
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

  const enrichedPromos = allPromos.map(p => {
    const promoClaims = claimsByPromo.get(p.id) || [];
    const activeNonRejected = promoClaims.filter(c => c.status !== 'rejected');
    const latestClaim = promoClaims[0] || null;
    const maxClaims = Math.max(1, Number(p.max_claims_per_user || 1));
    return {
      ...p,
      user_claim_count: activeNonRejected.length,
      latest_claim_status: latestClaim?.status || null,
      latest_claim_id: latestClaim?.id || null,
      can_claim: activeNonRejected.length < maxClaims && !['activated', 'pending'].includes(latestClaim?.status)
    };
  });

  res.json({
    promotions: enrichedPromos,
    claims,
    deposit_stats: {
      approved_count: Number(depStats?.approved_count || 0),
      total_deposited: Number(depStats?.total_deposited || 0),
      latest_deposit_amount: Number(depStats?.latest_deposit_amount || 0)
    },
    active_count: enrichedPromos.length
  });
});

function handleClaimPromotion(userId, userEmail, promo) {
  if (!promo || promo.active !== 1 || isPromoExpired(promo)) {
    return { status: 404, error: 'Promotion is no longer active or has expired.' };
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
  const promotions = db.prepare('SELECT * FROM promotions ORDER BY featured DESC, id DESC').all();
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

  const statsRow = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM promotions) AS total_offers,
      (SELECT COUNT(*) FROM promotions WHERE active = 1) AS active_offers,
      (SELECT COUNT(*) FROM promotion_claims WHERE status = 'pending') AS pending_claims,
      (SELECT COUNT(*) FROM promotion_claims WHERE status = 'activated') AS activated_claims,
      (SELECT COALESCE(SUM(bonus_amount), 0) FROM promotion_claims WHERE status = 'credited') AS total_credited_amount
  `).get();

  res.json({
    promotions,
    claims,
    summary: {
      total_offers: Number(statsRow?.total_offers || 0),
      active_offers: Number(statsRow?.active_offers || 0),
      pending_claims: Number(statsRow?.pending_claims || 0),
      activated_claims: Number(statsRow?.activated_claims || 0),
      total_credited_amount: Number(statsRow?.total_credited_amount || 0)
    }
  });
});

function sanitizePromoPayload(body = {}) {
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
        auto_credit, featured, active, max_claims_per_user, expires_at
      ) VALUES (
        @title, @subtitle, @category, @badge_text, @bonus_type, @bonus_value,
        @max_bonus_amount, @min_deposit, @promo_code, @terms,
        @auto_credit, @featured, @active, @max_claims_per_user, @expires_at
      )
    `).run(data);
    const created = db.prepare('SELECT * FROM promotions WHERE id = ?').get(Number(info.lastInsertRowid));
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
        expires_at = @expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...merged, id });
    const updated = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
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
  res.json({ ok: true });
});

adminRouter.post('/claims/:claimId/approve', (req, res) => {
  const claimId = Number(req.params.claimId);
  const claim = db.prepare(`
    SELECT pc.*, p.title AS promo_title, p.promo_code AS p_code
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

export { router as promotionsRouter, adminRouter as adminPromotionsRouter };
