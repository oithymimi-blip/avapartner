/**
 * IB Monthly Bonus & Level Upgrade Scheduler
 * ─────────────────────────────────────────────────────────────────────────
 * Runs every hour.  For each IB user:
 *   1. Sums their team volume for the current calendar month
 *   2. Pays a fixed monthly bonus if eligible (Silver=$50, Gold=$250)
 *   3. Auto-upgrades or downgrades their IB level based on volume targets
 *
 * All credits are ACID: ledger row + balance update in one transaction.
 * ─────────────────────────────────────────────────────────────────────────
 */
import db from '../db.js';

// ── Thresholds (USD team volume per month) ───────────────────────────────
const THRESHOLDS = {
  SILVER_MIN:  5_000,   // Bronze → Silver at $5,000/month
  GOLD_MIN:   25_000,   // Silver → Gold   at $25,000/month
  SILVER_BONUS:    50,  // Fixed monthly salary for Silver
  GOLD_BONUS:     250,  // Fixed monthly salary for Gold
};

// ── Prepared statements ───────────────────────────────────────────────────

const getAllIBUsers = db.prepare(`
  SELECT user_id, level FROM ib_levels
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
    (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level)
  VALUES (?, 0, 'MONTHLY_BONUS', 0, ?, 'bonus')
`);

const setLevel = db.prepare(`
  INSERT INTO ib_levels (user_id, level)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, upgraded_at = CURRENT_TIMESTAMP
`);

// ── Helpers ───────────────────────────────────────────────────────────────

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function computeNewLevel(volume) {
  if (volume >= THRESHOLDS.GOLD_MIN)   return 'GOLD';
  if (volume >= THRESHOLDS.SILVER_MIN) return 'SILVER';
  return 'BRONZE';
}

const payBonus = db.transaction((userId, bonusAmount, monthKey, volume) => {
  insertBonusLedger.run(userId, bonusAmount);
  creditBalance.run(bonusAmount, userId);
  upsertMetrics.run(userId, monthKey, volume, 1, bonusAmount);
  console.log(`[IB Scheduler] Monthly bonus paid: user=${userId} +$${bonusAmount} (${monthKey})`);
});

// ── Main check ────────────────────────────────────────────────────────────

export function checkMonthlyIBBonuses() {
  try {
    const monthKey = currentMonthKey();
    const ibUsers = getAllIBUsers.all();
    if (!ibUsers.length) return;

    for (const { user_id, level } of ibUsers) {
      try {
        // 1. Sum team volume for current month
        const volume = Number(getMonthVolume.get(user_id, monthKey)?.total || 0);

        // 2. Auto-upgrade / downgrade level
        const newLevel = computeNewLevel(volume);
        if (newLevel !== level) {
          setLevel.run(user_id, newLevel);
          console.log(`[IB Scheduler] Level change: user=${user_id} ${level} → ${newLevel} (vol=$${volume})`);
        }

        // 3. Update metrics row (no bonus yet)
        upsertMetrics.run(user_id, monthKey, volume, 0, 0);

        // 4. Pay bonus if eligible and not already paid this month
        const alreadyPaid = wasBonusPaid.get(user_id, monthKey)?.bonus_paid === 1;
        if (!alreadyPaid) {
          const effectiveLevel = newLevel;
          if (effectiveLevel === 'GOLD' && volume >= THRESHOLDS.GOLD_MIN) {
            payBonus(user_id, THRESHOLDS.GOLD_BONUS, monthKey, volume);
          } else if (effectiveLevel === 'SILVER' && volume >= THRESHOLDS.SILVER_MIN) {
            payBonus(user_id, THRESHOLDS.SILVER_BONUS, monthKey, volume);
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

// ── Init ──────────────────────────────────────────────────────────────────

export function initMonthlyIBScheduler() {
  console.log('[IB Scheduler] Started — bonus check every 60 minutes');
  // Run after 10s on startup (catch any restart-missed payouts)
  setTimeout(checkMonthlyIBBonuses, 10_000);
  // Then every hour
  setInterval(checkMonthlyIBBonuses, 60 * 60 * 1000);
}
