import db from '../db.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import { emitSocket } from '../market/engine.js';

export function isPromoExpired(promo) {
  if (!promo?.expires_at) return false;
  const ts = new Date(promo.expires_at).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

export function calculateBonusAmount(promo, depositAmount = 0) {
  const dep = Math.max(0, Number(depositAmount) || 0);
  const val = Math.max(0, Number(promo?.bonus_value) || 0);
  const cap = Math.max(0, Number(promo?.max_bonus_amount) || 0);

  if (promo?.bonus_type === 'fixed') {
    return Math.round(val * 100) / 100;
  }
  const raw = dep * (val / 100);
  const capped = cap > 0 ? Math.min(raw, cap) : raw;
  return Math.round(capped * 100) / 100;
}

export function createAndEmitUserNotification(userId, title, message) {
  const res = db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(
    userId,
    title,
    message
  );
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(res.lastInsertRowid));
  if (row) emitSocket('notification', { notification: row });
  return row;
}

export function creditBonusToUserTx({ claimId, userId, bonusAmount, promoTitle, promoCode, adminNote, actorRole = 'admin' }) {
  let notifId = null;
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(userId);
    db.prepare('UPDATE balances SET available = COALESCE(available, 0) + ? WHERE user_id = ?').run(bonusAmount, userId);

    db.prepare(`
      UPDATE promotion_claims
      SET status = 'credited',
          bonus_amount = ?,
          admin_note = COALESCE(?, admin_note),
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bonusAmount, adminNote || null, claimId);

    db.prepare(`
      INSERT INTO activity_logs (user_id, actor_role, action, meta)
      VALUES (?, ?, 'promotion_bonus_credited', ?)
    `).run(
      userId,
      actorRole,
      JSON.stringify({
        claimId,
        promoTitle,
        promoCode: promoCode || null,
        bonusAmount
      })
    );

    const n = db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(
      userId,
      'Bonus Credited!',
      `+$${Number(bonusAmount).toFixed(2)} bonus from "${promoTitle}" has been credited to your available balance.`
    );
    notifId = Number(n.lastInsertRowid);
  })();

  if (notifId) {
    const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
    if (newNotification) emitSocket('notification', { notification: newNotification });
  }
  emitSocket('user_data_update', { user_id: userId, type: 'balance_updated' });
}

/**
 * Automatically upgrades one 'activated' (awaiting deposit) bonus claim when a deposit is approved/credited.
 */
export function processQualifyingDepositForPromotions(userId, depositAmount, depositRequestId = null) {
  try {
    const dep = Number(depositAmount || 0);
    if (!userId || !Number.isFinite(dep) || dep <= 0) return;

    if (depositRequestId != null) {
      const alreadyBound = db.prepare(`
        SELECT id FROM promotion_claims
        WHERE deposit_request_id = ? AND status != 'rejected'
      `).get(depositRequestId);
      if (alreadyBound) return;
    }

    const activatedClaims = db.prepare(`
      SELECT pc.*, p.title, p.promo_code, p.bonus_type, p.bonus_value, p.max_bonus_amount,
             p.min_deposit, p.auto_credit, p.active, p.expires_at
      FROM promotion_claims pc
      JOIN promotions p ON p.id = pc.promotion_id
      WHERE pc.user_id = ? AND pc.status = 'activated'
      ORDER BY pc.id ASC
    `).all(userId);

    for (const claim of activatedClaims) {
      if (claim.active !== 1 || isPromoExpired(claim)) continue;
      if (dep < Number(claim.min_deposit || 0)) continue;

      const bonusAmount = calculateBonusAmount(claim, dep);
      if (bonusAmount <= 0) continue;

      if (claim.auto_credit === 1) {
        db.prepare(`UPDATE promotion_claims SET deposit_amount = ?, deposit_request_id = ? WHERE id = ?`)
          .run(dep, depositRequestId, claim.id);
        creditBonusToUserTx({
          claimId: claim.id,
          userId,
          bonusAmount,
          promoTitle: claim.title,
          promoCode: claim.promo_code,
          adminNote: `Auto-credited on $${dep.toFixed(2)} deposit`,
          actorRole: 'system'
        });
      } else {
        db.prepare(`
          UPDATE promotion_claims
          SET status = 'pending',
              deposit_amount = ?,
              deposit_request_id = ?,
              bonus_amount = ?
          WHERE id = ?
        `).run(dep, depositRequestId, bonusAmount, claim.id);

        createAndEmitUserNotification(
          userId,
          'Bonus Offer Qualified!',
          `Your $${dep.toFixed(2)} deposit unlocked "${claim.title}" (+$${bonusAmount.toFixed(2)} bonus). Pending quick review.`
        );
        notifyAdmin({
          type: 'promotion',
          title: '🎁 Deposit Bonus Claim Ready',
          message: `User #${userId} deposited $${dep.toFixed(2)} and qualified for +$${bonusAmount.toFixed(2)} (${claim.title}).`,
          link: '/admin/promotions'
        });
      }
      // Bind each deposit to at most one activated promotion offer
      break;
    }
  } catch (err) {
    console.error('[PROMOTIONS] processQualifyingDepositForPromotions error:', err.message);
  }
}
