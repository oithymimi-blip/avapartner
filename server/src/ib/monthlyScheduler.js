/**
 * IB Monthly Bonus & Level Upgrade Scheduler
 * ─────────────────────────────────────────────────────────────────────────
 * Runs every hour. For each active IB user:
 *   1. Sums their team volume for the current calendar month
 *   2. Auto-upgrades or downgrades unlocked IB levels based on live ib_settings targets
 *   3. Pays fixed monthly bonus if eligible (reading global tier / per-user custom bonus)
 *
 * All credits are ACID: ledger row + balance update in one transaction.
 * ─────────────────────────────────────────────────────────────────────────
 */
import db from '../db.js';
import { getAllTierSettings, getEffectiveIBProfile, getProgramConfig } from './ibConfig.js';

const getAllIBUsers = db.prepare(`
  SELECT user_id, level, is_ib_holder, level_locked FROM ib_levels
`);

const getMonthVolume = db.prepare(`
  SELECT COALESCE(SUM(trade_amount), 0) AS total
  FROM ib_commission_ledger
  WHERE ib_user_id = ? AND strftime('%Y-%m', created_at) = ?
`);

const upsertMetrics = db.prepare(`
  INSERT INTO ib_monthly_metrics (ib_user_id, month_key, team_volume, bonus_paid, bonus_amount)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(ib_user_id, month_key) DO UPDATE SET
    team_volume  = excluded.team_volume,
    bonus_paid   = CASE WHEN ib_monthly_metrics.bonus_paid = 1 THEN 1 ELSE excluded.bonus_paid END,
    bonus_amount = ib_monthly_metrics.bonus_amount + CASE WHEN ib_monthly_metrics.bonus_paid = 0 THEN excluded.bonus_amount ELSE 0 END,
    updated_at   = CURRENT_TIMESTAMP
`);

const wasBonusPaid = db.prepare(`
  SELECT bonus_paid FROM ib_monthly_metrics WHERE ib_user_id = ? AND month_key = ?
`);

const creditBalance = db.prepare(`
  UPDATE balances SET available = available + ? WHERE user_id = ?
`);

const insertBonusLedger = db.prepare(`
  INSERT INTO ib_commission_ledger
    (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level, rate_label, note)
  VALUES (?, 0, 'MONTHLY_BONUS', 0, ?, 'bonus', 'Monthly Bonus', ?)
`);

const setLevel = db.prepare(`
  INSERT INTO ib_levels (user_id, level, is_ib_holder, assigned_at, upgraded_at)
  VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, upgraded_at = CURRENT_TIMESTAMP
`);

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function computeNewLevel(volume, tierMap) {
  const goldMin = Number(tierMap?.GOLD?.min_monthly_volume ?? 25000);
  const silverMin = Number(tierMap?.SILVER?.min_monthly_volume ?? 5000);
  if (volume >= goldMin) return 'GOLD';
  if (volume >= silverMin) return 'SILVER';
  return 'BRONZE';
}

const payBonus = db.transaction((userId, bonusAmount, monthKey, volume, effectiveLevel) => {
  insertBonusLedger.run(userId, bonusAmount, `${effectiveLevel} monthly salary bonus (${monthKey})`);
  creditBalance.run(bonusAmount, userId);
  upsertMetrics.run(userId, monthKey, volume, 1, bonusAmount);
  console.log(`[IB Scheduler] Monthly bonus paid: user=${userId} +$${bonusAmount} (${monthKey})`);
});

export function checkMonthlyIBBonuses() {
  try {
    const monthKey = currentMonthKey();
    const ibUsers = getAllIBUsers.all();
    if (!ibUsers.length) return;

    const tierMap = getAllTierSettings(db);
    const programConfig = getProgramConfig(db);

    for (const row of ibUsers) {
      const { user_id, level, is_ib_holder, level_locked } = row;
      try {
        if (Number(is_ib_holder ?? 1) === 0) continue;

        const volume = Number(getMonthVolume.get(user_id, monthKey)?.total || 0);

        let effectiveLevel = level;
        if (programConfig.auto_upgrade_enabled && Number(level_locked || 0) !== 1) {
          const newLevel = computeNewLevel(volume, tierMap);
          if (newLevel !== level) {
            setLevel.run(user_id, newLevel);
            effectiveLevel = newLevel;
            console.log(`[IB Scheduler] Level change: user=${user_id} ${level} → ${newLevel} (vol=$${volume})`);
          }
        }

        upsertMetrics.run(user_id, monthKey, volume, 0, 0);

        const alreadyPaid = wasBonusPaid.get(user_id, monthKey)?.bonus_paid === 1;
        if (!alreadyPaid) {
          const profile = getEffectiveIBProfile(user_id, db);
          const bonusAmount = Number(profile.effective_numeric?.monthly_bonus || 0);
          const minVol = Number(tierMap?.[effectiveLevel]?.min_monthly_volume || 0);

          // Pay bonus if user qualifies by monthly volume OR has a custom admin-set bonus for their assigned tier
          const hasCustomBonus = profile.custom_rates?.monthly_bonus != null;
          if (bonusAmount > 0 && (volume >= minVol || hasCustomBonus || Number(level_locked || 0) === 1)) {
            if (effectiveLevel !== 'BRONZE' || hasCustomBonus) {
              payBonus(user_id, bonusAmount, monthKey, volume, effectiveLevel);
            }
          }
        }
      } catch (innerErr) {
        console.error(`[IB Scheduler] Error processing user ${user_id}:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[IB Scheduler] checkMonthlyIBBonuses error:', err);
  }
}

export function initMonthlyIBScheduler() {
  console.log('[IB Scheduler] Started — bonus check every 60 minutes');
  setTimeout(checkMonthlyIBBonuses, 10_000);
  setInterval(checkMonthlyIBBonuses, 60 * 60 * 1000);
}
