/**
 * IB & Affiliate Commission Engine
 * ─────────────────────────────────────────────────────────────────────────
 * Three commission streams:
 *   1. AI Trade  — % of daily profit distributed to referrer chain
 *   2. Manual    — fixed $ per lot traded
 *   3. Binary    — % of stake/turnover
 *
 * All writes are ACID: ledger row inserted BEFORE balance credited.
 * Referral chain resolved via 2-step JOIN (max depth 2, no recursion).
 * ─────────────────────────────────────────────────────────────────────────
 */
import db from '../db.js';

// ── Tier rates ────────────────────────────────────────────────────────────

const AI_TRADE_RATES = {
  BRONZE: { direct: 0.05, sub: 0 },
  SILVER: { direct: 0.08, sub: 0.02 },
  GOLD:   { direct: 0.12, sub: 0.05 },
};

const MANUAL_RATES = {
  BRONZE: { direct: 2,  sub: 0 },
  SILVER: { direct: 4,  sub: 1 },
  GOLD:   { direct: 8,  sub: 2 },
};

const BINARY_RATES = {
  BRONZE: { direct: 0.01,  sub: 0 },
  SILVER: { direct: 0.02,  sub: 0.005 },
  GOLD:   { direct: 0.035, sub: 0 },
};

// ── Prepared statements ───────────────────────────────────────────────────

const getLevel = db.prepare(`
  SELECT level FROM ib_levels WHERE user_id = ?
`);

const insertLedger = db.prepare(`
  INSERT INTO ib_commission_ledger
    (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const creditBalance = db.prepare(`
  UPDATE balances SET available = available + ? WHERE user_id = ?
`);

const updateMonthlyVolume = db.prepare(`
  INSERT INTO ib_monthly_metrics (ib_user_id, month_key, team_volume)
  VALUES (?, ?, ?)
  ON CONFLICT(ib_user_id, month_key) DO UPDATE SET
    team_volume = team_volume + excluded.team_volume,
    updated_at  = CURRENT_TIMESTAMP
`);

// Referral chain: returns [direct_referrer_id, sub_ib_id]
// direct = who referred sourceUser
// sub_ib = who referred the direct referrer
const getDirectReferrer = db.prepare(`
  SELECT referrer_id FROM referrals WHERE referee_id = ?
`);

// ── Helpers ───────────────────────────────────────────────────────────────

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getUserLevel(userId) {
  const row = getLevel.get(userId);
  return row?.level || 'BRONZE';
}

function getReferrerChain(sourceUserId) {
  const direct = getDirectReferrer.get(sourceUserId);
  if (!direct) return [null, null];
  const sub = getDirectReferrer.get(direct.referrer_id);
  return [direct.referrer_id, sub?.referrer_id || null];
}

/**
 * Atomic: write ledger entry → credit balance → update monthly volume
 * Returns the commission amount credited.
 */
const creditCommission = db.transaction((ibUserId, sourceUserId, assetClass, tradeAmount, commissionAmount, tierLevel) => {
  if (commissionAmount <= 0) return 0;
  insertLedger.run(ibUserId, sourceUserId, assetClass, tradeAmount, commissionAmount, tierLevel);
  creditBalance.run(commissionAmount, ibUserId);
  updateMonthlyVolume.run(ibUserId, currentMonthKey(), tradeAmount);
  return commissionAmount;
});

// ── Engine ────────────────────────────────────────────────────────────────

class IBCommissionEngine {
  /**
   * Stream 1: AI Trade
   * Called after each daily AI payout is credited to a user.
   * @param {number} userId   — the user who received the AI payout
   * @param {number} dailyProfit — the payout amount
   */
  processAITradeCommission(userId, dailyProfit) {
    try {
      if (!dailyProfit || dailyProfit <= 0) return;
      const [directId, subId] = getReferrerChain(userId);
      if (!directId) return;

      const level = getUserLevel(directId);
      const rates = AI_TRADE_RATES[level] || AI_TRADE_RATES.BRONZE;

      // Direct commission
      const directAmt = dailyProfit * rates.direct;
      creditCommission(directId, userId, 'AI_TRADE', dailyProfit, directAmt, 'direct');
      console.log(`[IB] AI_TRADE direct: ib=${directId} source=${userId} +$${directAmt.toFixed(4)}`);

      // Sub-IB commission (Level 2)
      if (subId && rates.sub > 0) {
        const subLevel = getUserLevel(subId);
        const subRates = AI_TRADE_RATES[subLevel] || AI_TRADE_RATES.BRONZE;
        const subAmt = dailyProfit * subRates.sub;
        creditCommission(subId, userId, 'AI_TRADE', dailyProfit, subAmt, 'sub_ib');
        console.log(`[IB] AI_TRADE sub_ib: ib=${subId} source=${userId} +$${subAmt.toFixed(4)}`);
      }
    } catch (err) {
      console.error('[IB] processAITradeCommission error:', err);
    }
  }

  /**
   * Stream 2: Manual Forex/Gold/Crypto trade
   * Called when a manual trade closes.
   * @param {number} userId — the trader
   * @param {number} lots   — qty / lots traded
   */
  processManualTradeCommission(userId, lots) {
    try {
      if (!lots || lots <= 0) return;
      const [directId, subId] = getReferrerChain(userId);
      if (!directId) return;

      const level = getUserLevel(directId);
      const rates = MANUAL_RATES[level] || MANUAL_RATES.BRONZE;

      const directAmt = lots * rates.direct;
      creditCommission(directId, userId, 'MANUAL_TRADING', lots, directAmt, 'direct');
      console.log(`[IB] MANUAL_TRADING direct: ib=${directId} source=${userId} +$${directAmt.toFixed(4)}`);

      if (subId && rates.sub > 0) {
        const subLevel = getUserLevel(subId);
        const subRates = MANUAL_RATES[subLevel] || MANUAL_RATES.BRONZE;
        const subAmt = lots * subRates.sub;
        creditCommission(subId, userId, 'MANUAL_TRADING', lots, subAmt, 'sub_ib');
        console.log(`[IB] MANUAL_TRADING sub_ib: ib=${subId} source=${userId} +$${subAmt.toFixed(4)}`);
      }
    } catch (err) {
      console.error('[IB] processManualTradeCommission error:', err);
    }
  }

  /**
   * Stream 3: Binary options trade
   * Called on every binary trade execution (win or lose).
   * @param {number} userId   — the trader
   * @param {number} turnover — stake amount
   */
  processBinaryTradeCommission(userId, turnover) {
    try {
      if (!turnover || turnover <= 0) return;
      const [directId, subId] = getReferrerChain(userId);
      if (!directId) return;

      const level = getUserLevel(directId);
      const rates = BINARY_RATES[level] || BINARY_RATES.BRONZE;

      const directAmt = turnover * rates.direct;
      creditCommission(directId, userId, 'BINARY_OPTIONS', turnover, directAmt, 'direct');
      console.log(`[IB] BINARY_OPTIONS direct: ib=${directId} source=${userId} +$${directAmt.toFixed(4)}`);

      if (subId && rates.sub > 0) {
        const subLevel = getUserLevel(subId);
        const subRates = BINARY_RATES[subLevel] || BINARY_RATES.BRONZE;
        const subAmt = turnover * subRates.sub;
        creditCommission(subId, userId, 'BINARY_OPTIONS', turnover, subAmt, 'sub_ib');
        console.log(`[IB] BINARY_OPTIONS sub_ib: ib=${subId} source=${userId} +$${subAmt.toFixed(4)}`);
      }
    } catch (err) {
      console.error('[IB] processBinaryTradeCommission error:', err);
    }
  }
}

export const ibEngine = new IBCommissionEngine();
