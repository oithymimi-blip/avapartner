/**
 * IB & Affiliate Commission Engine
 * ─────────────────────────────────────────────────────────────────────────
 * Three commission streams:
 *   1. AI Trade  — % of daily profit distributed to referrer chain
 *   2. Manual    — $ per lot traded (or % if configured)
 *   3. Binary    — % of stake/turnover
 *
 * Uses live global tier rates (ib_settings) + per-user custom overrides
 * (ib_user_rates) + IB holder eligibility rules (ib_levels & ib_program_config).
 * All writes are ACID: ledger row inserted BEFORE balance credited.
 * ─────────────────────────────────────────────────────────────────────────
 */
import db from '../db.js';
import { getEffectiveIBProfile } from './ibConfig.js';

const insertLedger = db.prepare(`
  INSERT INTO ib_commission_ledger
    (ib_user_id, source_user_id, asset_class, trade_amount, commission_amount, tier_level, rate_label, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

const getDirectReferrer = db.prepare(`
  SELECT referrer_id FROM referrals WHERE referee_id = ?
`);

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getReferrerChain(sourceUserId) {
  const direct = getDirectReferrer.get(sourceUserId);
  if (!direct) return [null, null];
  const sub = getDirectReferrer.get(direct.referrer_id);
  return [direct.referrer_id, sub?.referrer_id || null];
}

const creditCommission = db.transaction((ibUserId, sourceUserId, assetClass, tradeAmount, commissionAmount, tierLevel, rateLabel, note) => {
  if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) return 0;
  insertLedger.run(ibUserId, sourceUserId, assetClass, tradeAmount, commissionAmount, tierLevel, rateLabel || null, note || null);
  creditBalance.run(commissionAmount, ibUserId);
  updateMonthlyVolume.run(ibUserId, currentMonthKey(), tradeAmount);
  return commissionAmount;
});

class IBCommissionEngine {
  /**
   * Shared helper to credit direct (L1) and sub-IB (L2) referrers based on resolved rates.
   */
  _distribute(sourceUserId, assetClass, computeTier) {
    const [directId, subId] = getReferrerChain(sourceUserId);
    if (!directId) return;

    const directProfile = getEffectiveIBProfile(directId);
    if (directProfile.eligible) {
      const payout = computeTier(directProfile.effective_numeric, 'direct');
      if (payout && payout.amount > 0) {
        creditCommission(
          directId,
          sourceUserId,
          assetClass,
          payout.volumeBase,
          payout.amount,
          'direct',
          payout.rateLabel,
          payout.note
        );
        console.log(`[IB] ${assetClass} direct: ib=${directId} source=${sourceUserId} +$${payout.amount.toFixed(4)} (${payout.rateLabel})`);
      }
    }

    if (subId && subId !== directId) {
      const subProfile = getEffectiveIBProfile(subId);
      if (subProfile.eligible) {
        const subPayout = computeTier(subProfile.effective_numeric, 'sub_ib');
        if (subPayout && subPayout.amount > 0) {
          creditCommission(
            subId,
            sourceUserId,
            assetClass,
            subPayout.volumeBase,
            subPayout.amount,
            'sub_ib',
            subPayout.rateLabel,
            subPayout.note
          );
          console.log(`[IB] ${assetClass} sub_ib: ib=${subId} source=${sourceUserId} +$${subPayout.amount.toFixed(4)} (${subPayout.rateLabel})`);
        }
      }
    }
  }

  processAITradeCommission(userId, dailyProfit) {
    try {
      const profit = Number(dailyProfit);
      if (!Number.isFinite(profit) || profit <= 0) return;

      this._distribute(userId, 'AI_TRADE', (rates, tier) => {
        const pct = tier === 'direct' ? rates.ai_trade_direct_pct : rates.ai_trade_sub_pct;
        if (!pct || pct <= 0) return null;
        return {
          volumeBase: profit,
          amount: profit * (pct / 100),
          rateLabel: `${pct}%`,
          note: `${tier === 'direct' ? 'Direct' : 'Sub-IB (L2)'} AI Trade profit $${profit.toFixed(2)} × ${pct}%`,
        };
      });
    } catch (err) {
      console.error('[IB] processAITradeCommission error:', err);
    }
  }

  processManualTradeCommission(userId, lots, stakeAmount = 0) {
    try {
      const lotQty = Number(lots);
      const stake = Number(stakeAmount || 0);
      if ((!Number.isFinite(lotQty) || lotQty <= 0) && (!Number.isFinite(stake) || stake <= 0)) return;

      this._distribute(userId, 'MANUAL_TRADING', (rates, tier) => {
        const rate = tier === 'direct' ? rates.manual_direct_rate : rates.manual_sub_rate;
        if (!rate || rate <= 0) return null;
        const prefix = tier === 'direct' ? 'Direct' : 'Sub-IB (L2)';
        if (rates.manual_mode === 'percent') {
          const base = stake > 0 ? stake : lotQty;
          return {
            volumeBase: base,
            amount: base * (rate / 100),
            rateLabel: `${rate}%`,
            note: `${prefix} Forex volume $${base.toFixed(2)} × ${rate}%`,
          };
        }
        return {
          volumeBase: lotQty,
          amount: lotQty * rate,
          rateLabel: `$${rate}/lot`,
          note: `${prefix} Forex ${lotQty.toFixed(4)} lot(s) × $${rate}/lot`,
        };
      });
    } catch (err) {
      console.error('[IB] processManualTradeCommission error:', err);
    }
  }

  processBinaryTradeCommission(userId, turnover) {
    try {
      const stake = Number(turnover);
      if (!Number.isFinite(stake) || stake <= 0) return;

      this._distribute(userId, 'BINARY_OPTIONS', (rates, tier) => {
        const pct = tier === 'direct' ? rates.binary_direct_pct : rates.binary_sub_pct;
        if (!pct || pct <= 0) return null;
        return {
          volumeBase: stake,
          amount: stake * (pct / 100),
          rateLabel: `${pct}%`,
          note: `${tier === 'direct' ? 'Direct' : 'Sub-IB (L2)'} Binary stake $${stake.toFixed(2)} × ${pct}%`,
        };
      });
    } catch (err) {
      console.error('[IB] processBinaryTradeCommission error:', err);
    }
  }
}

export const ibEngine = new IBCommissionEngine();
