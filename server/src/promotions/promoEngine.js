import db from '../db.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import { emitSocket } from '../market/engine.js';
import { DEFAULT_BONUS_SETTINGS } from './defaults.js';

export function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

export function isPromoExpired(promo) {
  if (!promo?.expires_at) return false;
  const ts = new Date(promo.expires_at).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

export function shouldAutoCreditPromo(promo, settings = getBonusSystemSettings()) {
  const mode = settings?.bonus_payout_mode || 'automatic';
  if (mode === 'automatic') return true;
  if (mode === 'manual') return false;
  return Number(promo?.auto_credit) === 1;
}

export function getBonusSystemSettings() {
  const rows = db.prepare('SELECT key, value FROM bonus_system_settings').all();
  const map = { ...DEFAULT_BONUS_SETTINGS };
  for (const r of rows) {
    if (r && r.key) map[r.key] = String(r.value ?? '');
  }
  const allowedModes = ['automatic', 'manual', 'per_offer'];
  const bonus_payout_mode = allowedModes.includes(map.bonus_payout_mode) ? map.bonus_payout_mode : 'automatic';
  return {
    system_enabled: map.system_enabled === '1',
    bonus_payout_mode,
    default_double_multiplier: Math.max(1.01, Number(map.default_double_multiplier || 2)),
    default_cashout_pct: Math.min(100, Math.max(1, Number(map.default_cashout_pct || 50))),
    default_required_milestones: Math.max(1, parseInt(map.default_required_milestones, 10) || 2),
    allowed_profit_sources: String(map.allowed_profit_sources || 'ai_trade,forex,binary')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    enforce_withdrawal_conditions: map.enforce_withdrawal_conditions === '1',
    auto_match_deposit_bonus: map.auto_match_deposit_bonus === '1',
    page_headline: map.page_headline || DEFAULT_BONUS_SETTINGS.page_headline,
    page_subheadline: map.page_subheadline || DEFAULT_BONUS_SETTINGS.page_subheadline,
    withdrawal_rule_summary: map.withdrawal_rule_summary || DEFAULT_BONUS_SETTINGS.withdrawal_rule_summary
  };
}

export function saveBonusSystemSettings(updates = {}) {
  const upsert = db.prepare(`
    INSERT INTO bonus_system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const pairs = [];
  if (updates.system_enabled !== undefined) {
    pairs.push(['system_enabled', updates.system_enabled ? '1' : '0']);
  }
  if (updates.bonus_payout_mode !== undefined) {
    const allowedModes = ['automatic', 'manual', 'per_offer'];
    const mode = allowedModes.includes(updates.bonus_payout_mode) ? updates.bonus_payout_mode : 'automatic';
    pairs.push(['bonus_payout_mode', mode]);
  }
  if (updates.default_double_multiplier !== undefined) {
    const val = Math.max(1.01, Number(updates.default_double_multiplier) || 2);
    pairs.push(['default_double_multiplier', String(val)]);
  }
  if (updates.default_cashout_pct !== undefined) {
    const val = Math.min(100, Math.max(1, Number(updates.default_cashout_pct) || 50));
    pairs.push(['default_cashout_pct', String(val)]);
  }
  if (updates.default_required_milestones !== undefined) {
    const val = Math.max(1, parseInt(updates.default_required_milestones, 10) || 2);
    pairs.push(['default_required_milestones', String(val)]);
  }
  if (updates.allowed_profit_sources !== undefined) {
    const allowed = ['ai_trade', 'forex', 'binary'];
    const rawArr = Array.isArray(updates.allowed_profit_sources)
      ? updates.allowed_profit_sources
      : String(updates.allowed_profit_sources).split(',');
    const clean = rawArr.map(s => s.trim()).filter(s => allowed.includes(s));
    pairs.push(['allowed_profit_sources', (clean.length ? clean : allowed).join(',')]);
  }
  if (updates.enforce_withdrawal_conditions !== undefined) {
    pairs.push(['enforce_withdrawal_conditions', updates.enforce_withdrawal_conditions ? '1' : '0']);
  }
  if (updates.auto_match_deposit_bonus !== undefined) {
    pairs.push(['auto_match_deposit_bonus', updates.auto_match_deposit_bonus ? '1' : '0']);
  }
  if (updates.page_headline !== undefined) {
    pairs.push(['page_headline', String(updates.page_headline || DEFAULT_BONUS_SETTINGS.page_headline).trim()]);
  }
  if (updates.page_subheadline !== undefined) {
    pairs.push(['page_subheadline', String(updates.page_subheadline || DEFAULT_BONUS_SETTINGS.page_subheadline).trim()]);
  }
  if (updates.withdrawal_rule_summary !== undefined) {
    pairs.push(['withdrawal_rule_summary', String(updates.withdrawal_rule_summary || DEFAULT_BONUS_SETTINGS.withdrawal_rule_summary).trim()]);
  }

  db.transaction(() => {
    for (const [k, v] of pairs) {
      upsert.run(k, v);
    }
  })();

  return getBonusSystemSettings();
}

export function calculateBonusAmount(promo, depositAmount = 0) {
  const dep = Math.max(0, Number(depositAmount) || 0);
  const val = Math.max(0, Number(promo?.bonus_value) || 0);
  const cap = Math.max(0, Number(promo?.max_bonus_amount) || 0);

  if (promo?.bonus_type === 'fixed') {
    return round2(val);
  }
  const raw = dep * (val / 100);
  const capped = cap > 0 ? Math.min(raw, cap) : raw;
  return round2(capped);
}

export function getUserCumulativeTradingProfits(userId) {
  const aiRow = db.prepare(`
    SELECT COALESCE(SUM(payout_amount), 0) AS total
    FROM ai_trade_history
    WHERE user_id = ? AND (action = 'payout' OR (action = 'stopped' AND payout_amount > 0))
  `).get(userId);

  const pendingAiRow = db.prepare(`
    SELECT COALESCE(earnings, 0) AS pending
    FROM ai_trade_sessions
    WHERE user_id = ? AND ai_trade_status = 'ON'
  `).get(userId);

  const forexRow = db.prepare(`
    SELECT COALESCE(SUM(pnl), 0) AS total
    FROM trades
    WHERE user_id = ? AND status = 'closed'
  `).get(userId);

  const binaryRow = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(payout, 0) - COALESCE(stake, 0)), 0) AS total
    FROM binary_trades
    WHERE user_id = ? AND status = 'settled'
  `).get(userId);

  const ai = Number(aiRow?.total || 0);
  const forex = Number(forexRow?.total || 0);
  const binary = Number(binaryRow?.total || 0);
  return {
    ai,
    forex,
    binary,
    total: ai + forex + binary,
    pendingAi: Number(pendingAiRow?.pending || 0)
  };
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

function formatSourcesLabel(sources = []) {
  const names = { ai_trade: 'AI Trade', forex: 'Forex', binary: 'Binary' };
  return sources.map(s => names[s] || s).join(', ') || 'AI Trade, Forex, Binary';
}

export function createOrExtendBonusLockTx({ userId, promo, claimId, depositAmount, bonusAmount }) {
  const settings = getBonusSystemSettings();
  const applyCond = promo?.apply_withdrawal_condition !== undefined
    ? Number(promo.apply_withdrawal_condition) === 1
    : true;

  if (!applyCond || !settings.enforce_withdrawal_conditions) {
    return null;
  }

  const bal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(userId);
  const totalBal = round2(Number(bal?.available || 0) + Number(bal?.locked || 0));
  const profits = getUserCumulativeTradingProfits(userId);

  const multiplier = Math.max(1.01, Number(promo?.profit_multiplier || settings.default_double_multiplier || 2));
  const cashoutPct = Math.min(100, Math.max(1, Number(promo?.cashout_pct_per_milestone || settings.default_cashout_pct || 50)));
  const reqMilestones = Math.max(1, parseInt(promo?.required_milestones || settings.default_required_milestones || 2, 10));
  const allowedSources = String(
    promo?.allowed_sources || settings.allowed_profit_sources.join(',') || 'ai_trade,forex,binary'
  );

  const dep = round2(depositAmount);
  const bon = round2(bonusAmount);
  const addedCapital = round2(dep + bon);

  const existing = db.prepare(`
    SELECT * FROM bonus_locks
    WHERE user_id = ? AND status = 'active'
    ORDER BY id DESC LIMIT 1
  `).get(userId);

  if (existing) {
    const nextStart = round2(Math.max(totalBal, Number(existing.cycle_start_balance || 0) + addedCapital));
    const nextBase = round2(Math.max(totalBal, Number(existing.milestone_base_balance || 0) + addedCapital));
    const nextReq = Math.max(Number(existing.required_milestones || 2), Number(existing.milestones_completed || 0) + reqMilestones);

    db.prepare(`
      UPDATE bonus_locks
      SET promotion_id = ?,
          claim_id = ?,
          promo_code = COALESCE(?, promo_code),
          promo_title = ?,
          deposit_amount = deposit_amount + ?,
          bonus_amount = bonus_amount + ?,
          cycle_start_balance = ?,
          milestone_base_balance = ?,
          profit_multiplier = ?,
          cashout_pct = ?,
          required_milestones = ?,
          allowed_sources = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      promo?.id || existing.promotion_id,
      claimId || existing.claim_id,
      promo?.promo_code || null,
      promo?.title || existing.promo_title,
      dep,
      bon,
      nextStart,
      nextBase,
      multiplier,
      cashoutPct,
      nextReq,
      allowedSources,
      existing.id
    );
    return db.prepare('SELECT * FROM bonus_locks WHERE id = ?').get(existing.id);
  }

  const startBalance = totalBal > 0 ? totalBal : Math.max(bon, addedCapital);
  const info = db.prepare(`
    INSERT INTO bonus_locks (
      user_id, promotion_id, claim_id, promo_code, promo_title,
      deposit_amount, bonus_amount, cycle_start_balance, milestone_base_balance,
      profit_multiplier, cashout_pct, required_milestones, milestones_completed,
      allowed_sources, baseline_ai_profit, baseline_forex_profit, baseline_binary_profit,
      manual_profit_offset, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 'active')
  `).run(
    userId,
    promo?.id || null,
    claimId || null,
    promo?.promo_code || null,
    promo?.title || 'Deposit Bonus',
    dep,
    bon,
    startBalance,
    startBalance,
    multiplier,
    cashoutPct,
    reqMilestones,
    allowedSources,
    profits.ai,
    profits.forex,
    profits.binary
  );

  return db.prepare('SELECT * FROM bonus_locks WHERE id = ?').get(Number(info.lastInsertRowid));
}

export function creditBonusToUserTx({
  claimId,
  userId,
  bonusAmount,
  depositAmount = 0,
  promo = null,
  promoTitle,
  promoCode,
  adminNote,
  actorRole = 'admin'
}) {
  let notifId = null;
  let lockRow = null;
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

    const promoObj = promo || {
      id: null,
      title: promoTitle,
      promo_code: promoCode,
      apply_withdrawal_condition: 1
    };

    lockRow = createOrExtendBonusLockTx({
      userId,
      promo: promoObj,
      claimId,
      depositAmount,
      bonusAmount
    });

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
        depositAmount,
        bonusAmount,
        bonusLockId: lockRow?.id || null
      })
    );

    const ruleMsg = lockRow
      ? ` Make ${lockRow.profit_multiplier}x balance via ${formatSourcesLabel(String(lockRow.allowed_sources).split(','))} to cash out ${lockRow.cashout_pct}% (${lockRow.required_milestones} milestones).`
      : '';

    const n = db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(
      userId,
      'Bonus Credited!',
      `+$${Number(bonusAmount).toFixed(2)} bonus from "${promoTitle}" has been credited to your available balance.${ruleMsg}`
    );
    notifId = Number(n.lastInsertRowid);
  })();

  if (notifId) {
    const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
    if (newNotification) emitSocket('notification', { notification: newNotification });
  }
  emitSocket('user_data_update', { user_id: userId, type: 'balance_updated' });
  return lockRow;
}

export function evaluateUserBonusWithdrawalStatus(userId) {
  const settings = getBonusSystemSettings();
  const bal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(userId);
  const availableBalance = round2(bal?.available || 0);
  const lockedBalance = round2(bal?.locked || 0);
  const totalBalance = round2(availableBalance + lockedBalance);

  const lock = db.prepare(`
    SELECT * FROM bonus_locks
    WHERE user_id = ? AND status = 'active'
    ORDER BY id DESC LIMIT 1
  `).get(userId);

  const completedLocksCount = db.prepare(`
    SELECT COUNT(*) AS c FROM bonus_locks
    WHERE user_id = ? AND status = 'completed'
  `).get(userId)?.c || 0;

  if (!lock || !settings.system_enabled || !settings.enforce_withdrawal_conditions) {
    return {
      hasActiveLock: false,
      restricted: false,
      canWithdrawFull: true,
      availableBalance,
      lockedBalance,
      totalBalance,
      maxWithdrawable: availableBalance,
      completedLocksCount,
      lock: null,
      settings
    };
  }

  const profits = getUserCumulativeTradingProfits(userId);
  const allowedSources = String(lock.allowed_sources || 'ai_trade,forex,binary')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const deltaAi = profits.ai - Number(lock.baseline_ai_profit || 0);
  const deltaForex = profits.forex - Number(lock.baseline_forex_profit || 0);
  const deltaBinary = profits.binary - Number(lock.baseline_binary_profit || 0);
  const manualOffset = Number(lock.manual_profit_offset || 0);

  const netQualifyingProfit =
    (allowedSources.includes('ai_trade') ? deltaAi : 0) +
    (allowedSources.includes('forex') ? deltaForex : 0) +
    (allowedSources.includes('binary') ? deltaBinary : 0) +
    manualOffset;

  const baseBalance = Math.max(0.01, Number(lock.milestone_base_balance || lock.cycle_start_balance || 0));
  const multiplier = Math.max(1.01, Number(lock.profit_multiplier || 2));
  const cashoutPct = Math.min(100, Math.max(1, Number(lock.cashout_pct || 50)));
  const requiredMilestones = Math.max(1, Number(lock.required_milestones || 2));
  const milestonesCompleted = Math.max(0, Number(lock.milestones_completed || 0));

  const profitNeeded = round2(baseBalance * (multiplier - 1));
  const targetBalance = round2(baseBalance * multiplier);

  const profitQualified = netQualifyingProfit + 1e-6 >= profitNeeded;
  const balanceQualified = totalBalance + 1e-6 >= targetBalance;
  const milestoneUnlocked = profitQualified && balanceQualified;

  const rawCashoutCap = milestoneUnlocked ? round2(totalBalance * (cashoutPct / 100)) : 0;
  const maxWithdrawable = milestoneUnlocked ? round2(Math.min(availableBalance, rawCashoutCap)) : 0;

  const profitProgressPct = profitNeeded > 0
    ? Math.min(100, Math.max(0, Math.round((netQualifyingProfit / profitNeeded) * 100)))
    : 100;

  return {
    hasActiveLock: true,
    restricted: true,
    canWithdrawFull: false,
    availableBalance,
    lockedBalance,
    totalBalance,
    milestoneUnlocked,
    maxWithdrawable,
    cashoutCap: rawCashoutCap,
    currentMilestone: milestonesCompleted + 1,
    milestonesCompleted,
    requiredMilestones,
    baseBalance: round2(baseBalance),
    targetBalance,
    profitNeeded,
    profitEarned: round2(netQualifyingProfit),
    profitRemaining: round2(Math.max(0, profitNeeded - netQualifyingProfit)),
    balanceRemaining: round2(Math.max(0, targetBalance - totalBalance)),
    profitProgressPct,
    cashoutPct,
    multiplier,
    allowedSources,
    allowedSourcesLabel: formatSourcesLabel(allowedSources),
    breakdown: {
      ai_trade: round2(deltaAi),
      forex: round2(deltaForex),
      binary: round2(deltaBinary),
      manual_offset: round2(manualOffset),
      pending_ai: round2(profits.pendingAi)
    },
    completedLocksCount,
    lock,
    settings
  };
}

/**
 * Validates withdrawal against active bonus lock and returns pre-withdrawal snapshot if restricted.
 */
export function validateBonusWithdrawal(userId, requestedAmount) {
  const status = evaluateUserBonusWithdrawalStatus(userId);
  if (!status.restricted) {
    return { restricted: false, snapshotJson: null, status };
  }

  if (!status.milestoneUnlocked) {
    const parts = [];
    if (status.profitRemaining > 0) {
      parts.push(`earn +$${status.profitRemaining.toFixed(2)} more trading profit via ${status.allowedSourcesLabel}`);
    }
    if (status.balanceRemaining > 0) {
      parts.push(`reach $${status.targetBalance.toFixed(2)} total balance`);
    }
    const err = new Error(
      `Bonus Withdrawal Condition Active (Milestone ${status.currentMilestone}/${status.requiredMilestones}): You must ${parts.join(' and ')} to unlock your ${status.cashoutPct}% cashout.`
    );
    err.status = 400;
    err.bonusStatus = status;
    throw err;
  }

  const amt = Number(requestedAmount || 0);
  if (amt > status.maxWithdrawable + 1e-6) {
    const err = new Error(
      `Bonus Milestone ${status.currentMilestone}/${status.requiredMilestones} permits up to ${status.cashoutPct}% cashout ($${status.maxWithdrawable.toFixed(2)} max right now).`
    );
    err.status = 400;
    err.bonusStatus = status;
    throw err;
  }

  return {
    restricted: true,
    snapshotJson: JSON.stringify(status.lock),
    status
  };
}

/**
 * Advances or completes the active bonus lock inside the withdrawal transaction.
 */
export function advanceBonusLockOnWithdrawalTx({ userId, requestId, nextAvailableBalance, lockSnapshotJson }) {
  if (!lockSnapshotJson) return null;
  let lock = null;
  try {
    lock = JSON.parse(lockSnapshotJson);
  } catch (_) {
    return null;
  }
  if (!lock?.id) return null;

  const bal = db.prepare('SELECT locked FROM balances WHERE user_id = ?').get(userId);
  const lockedBal = Number(bal?.locked || 0);
  const remainingTotal = round2(Number(nextAvailableBalance || 0) + lockedBal);

  const nextCompleted = Number(lock.milestones_completed || 0) + 1;
  const reqMilestones = Math.max(1, Number(lock.required_milestones || 2));

  if (nextCompleted >= reqMilestones) {
    db.prepare(`
      UPDATE bonus_locks
      SET milestones_completed = ?,
          status = 'completed',
          last_withdrawal_id = ?,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'
    `).run(nextCompleted, requestId, lock.id);

    db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(
      userId,
      'Bonus Conditions Completed!',
      `Congratulations! You completed all ${reqMilestones} milestone cashouts for "${lock.promo_title || 'Deposit Bonus'}". Your remaining funds are now 100% eligible for normal withdrawal.`
    );
    return { completed: true, nextCompleted, reqMilestones };
  }

  const profits = getUserCumulativeTradingProfits(userId);
  const nextBase = Math.max(0.01, remainingTotal);

  db.prepare(`
    UPDATE bonus_locks
    SET milestones_completed = ?,
        milestone_base_balance = ?,
        baseline_ai_profit = ?,
        baseline_forex_profit = ?,
        baseline_binary_profit = ?,
        manual_profit_offset = 0,
        last_withdrawal_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'active'
  `).run(
    nextCompleted,
    nextBase,
    profits.ai,
    profits.forex,
    profits.binary,
    requestId,
    lock.id
  );

  const nextNeeded = round2(nextBase * (Math.max(1.01, Number(lock.profit_multiplier || 2)) - 1));
  db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(
    userId,
    `Milestone ${nextCompleted}/${reqMilestones} Unlocked`,
    `Cashout submitted! For Milestone ${nextCompleted + 1}/${reqMilestones}, earn +$${nextNeeded.toFixed(2)} profit via ${formatSourcesLabel(String(lock.allowed_sources || 'ai_trade,forex,binary').split(','))} on your remaining $${nextBase.toFixed(2)} to withdraw ${lock.cashout_pct}% again.`
  );
  return { completed: false, nextCompleted, reqMilestones, nextBase, nextNeeded };
}

export function restoreBonusLockOnDeclineTx(lockSnapshotJson) {
  if (!lockSnapshotJson) return;
  try {
    const snap = JSON.parse(lockSnapshotJson);
    if (!snap?.id) return;
    db.prepare(`
      UPDATE bonus_locks
      SET milestones_completed = ?,
          milestone_base_balance = ?,
          baseline_ai_profit = ?,
          baseline_forex_profit = ?,
          baseline_binary_profit = ?,
          manual_profit_offset = ?,
          status = 'active',
          completed_at = NULL,
          last_withdrawal_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      Number(snap.milestones_completed || 0),
      Number(snap.milestone_base_balance || snap.cycle_start_balance || 0),
      Number(snap.baseline_ai_profit || 0),
      Number(snap.baseline_forex_profit || 0),
      Number(snap.baseline_binary_profit || 0),
      Number(snap.manual_profit_offset || 0),
      snap.last_withdrawal_id || null,
      snap.id
    );
  } catch (err) {
    console.error('[PROMOTIONS] restoreBonusLockOnDeclineTx error:', err.message);
  }
}

function isOfferEligibleForUserDeposit(promo, userId, depositAmount) {
  if (!promo || promo.active !== 1 || isPromoExpired(promo)) return false;
  if (depositAmount < Number(promo.min_deposit || 0)) return false;
  if (Number(promo.total_global_limit || 0) > 0) {
    const totalUsed = db.prepare(`
      SELECT COUNT(*) AS c FROM promotion_claims
      WHERE promotion_id = ? AND status != 'rejected'
    `).get(promo.id)?.c || 0;
    if (totalUsed >= Number(promo.total_global_limit)) return false;
  }
  const userCount = db.prepare(`
    SELECT COUNT(*) AS c FROM promotion_claims
    WHERE promotion_id = ? AND user_id = ? AND status != 'rejected'
  `).get(promo.id, userId)?.c || 0;
  const maxPerUser = Math.max(1, Number(promo.max_claims_per_user || 1));
  return userCount < maxPerUser;
}

function applyMatchedPromoToDeposit({ promo, userId, dep, depositRequestId, settings, sourceNote }) {
  const bonusAmount = calculateBonusAmount(promo, dep);
  if (bonusAmount <= 0) return false;

  const info = db.prepare(`
    INSERT INTO promotion_claims (promotion_id, user_id, deposit_request_id, promo_code, deposit_amount, bonus_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(promo.id, userId, depositRequestId, promo.promo_code || null, dep, bonusAmount);

  const claimId = Number(info.lastInsertRowid);
  if (shouldAutoCreditPromo(promo, settings)) {
    creditBonusToUserTx({
      claimId,
      userId,
      bonusAmount,
      depositAmount: dep,
      promo,
      promoTitle: promo.title,
      promoCode: promo.promo_code,
      adminNote: `${sourceNote} on $${dep.toFixed(2)} deposit`,
      actorRole: 'system'
    });
  } else {
    createAndEmitUserNotification(
      userId,
      'Deposit Bonus Claim Submitted',
      `Your $${dep.toFixed(2)} deposit qualified for "${promo.title}" (+$${bonusAmount.toFixed(2)} bonus). Pending admin approval.`
    );
    notifyAdmin({
      type: 'promotion',
      title: '🎁 Deposit Bonus Claim Ready for Approval',
      message: `User #${userId} deposited $${dep.toFixed(2)} — qualified for "${promo.title}" (+$${bonusAmount.toFixed(2)}).`,
      link: '/admin/promotions'
    });
  }
  return true;
}

/**
 * Applies user's selected promo code or auto-matches best eligible deposit bonus when a real deposit is approved/credited.
 */
export function processQualifyingDepositForPromotions(userId, depositAmount, depositRequestId = null) {
  try {
    const settings = getBonusSystemSettings();
    if (!settings.system_enabled) return;

    const dep = Number(depositAmount || 0);
    if (!userId || !Number.isFinite(dep) || dep <= 0) return;

    if (depositRequestId != null) {
      const alreadyBound = db.prepare(`
        SELECT id FROM promotion_claims
        WHERE deposit_request_id = ? AND status != 'rejected'
      `).get(depositRequestId);
      if (alreadyBound) return;
    }

    // 1. Check user's explicitly selected promo code for their deposit
    const userPref = db.prepare('SELECT preferred_promo_code FROM users WHERE id = ?').get(userId);
    const prefCode = String(userPref?.preferred_promo_code || '').trim().toUpperCase();
    if (prefCode) {
      const prefPromo = db.prepare('SELECT * FROM promotions WHERE UPPER(promo_code) = ?').get(prefCode);
      if (isOfferEligibleForUserDeposit(prefPromo, userId, dep)) {
        db.prepare('UPDATE users SET preferred_promo_code = NULL WHERE id = ?').run(userId);
        if (applyMatchedPromoToDeposit({ promo: prefPromo, userId, dep, depositRequestId, settings, sourceNote: 'Auto-credited selected promo' })) {
          return;
        }
      }
    }

    // 2. Auto-match best eligible deposit bonus if enabled by admin
    if (settings.auto_match_deposit_bonus) {
      const candidates = db.prepare(`
        SELECT * FROM promotions
        WHERE active = 1 AND category IN ('deposit_bonus', 'welcome_bonus') AND min_deposit <= ?
        ORDER BY featured DESC, sort_order ASC, bonus_value DESC, id ASC
      `).all(dep);

      for (const promo of candidates) {
        if (!isOfferEligibleForUserDeposit(promo, userId, dep)) continue;
        if (applyMatchedPromoToDeposit({ promo, userId, dep, depositRequestId, settings, sourceNote: 'Auto-matched & credited' })) {
          return;
        }
      }
    }
  } catch (err) {
    console.error('[PROMOTIONS] processQualifyingDepositForPromotions error:', err.message);
  }
}
