/**
 * Comprehensive FAQ & Trading / IB Knowledge Base
 * Used on both /faq and the User IB Dashboard (/ib-dashboard).
 */

function fmtPct(v) {
  const n = Number(v || 0)
  return n > 0 ? `${Number(n.toFixed(4))}%` : '0%'
}

function fmtManual(rate, mode) {
  const n = Number(rate || 0)
  if (n <= 0) return '$0'
  return mode === 'percent' ? `${Number(n.toFixed(4))}% of trade margin` : `$${Number(n.toFixed(4))} per lot`
}

export function buildDetailedFaqs(tiers = []) {
  const byLevel = {}
  for (const t of tiers) {
    if (t?.level) byLevel[t.level] = t
  }
  const bronze = byLevel.BRONZE || {
    ai_trade_direct_pct: 5, ai_trade_sub_pct: 0,
    manual_mode: 'per_lot', manual_direct_rate: 2, manual_sub_rate: 0,
    binary_direct_pct: 1, binary_sub_pct: 0,
    min_monthly_volume: 0, monthly_bonus: 0,
  }
  const silver = byLevel.SILVER || {
    ai_trade_direct_pct: 8, ai_trade_sub_pct: 2,
    manual_mode: 'per_lot', manual_direct_rate: 4, manual_sub_rate: 1,
    binary_direct_pct: 2, binary_sub_pct: 0.5,
    min_monthly_volume: 5000, monthly_bonus: 50,
  }
  const gold = byLevel.GOLD || {
    ai_trade_direct_pct: 12, ai_trade_sub_pct: 5,
    manual_mode: 'per_lot', manual_direct_rate: 8, manual_sub_rate: 2,
    binary_direct_pct: 3.5, binary_sub_pct: 0,
    min_monthly_volume: 25000, monthly_bonus: 250,
  }

  const bManual = fmtManual(bronze.manual_direct_rate, bronze.manual_mode)
  const sManual = fmtManual(silver.manual_direct_rate, silver.manual_mode)
  const sManualSub = fmtManual(silver.manual_sub_rate, silver.manual_mode)
  const gManual = fmtManual(gold.manual_direct_rate, gold.manual_mode)
  const gManualSub = fmtManual(gold.manual_sub_rate, gold.manual_mode)

  return [
    {
      category: 'IB & Commissions',
      question: 'How does the IB (Introducing Broker) & Referral Program work step by step?',
      answer:
        '1) Copy your unique Invite Link or Referral Code from your IB Dashboard.\n' +
        '2) Share it with friends, clients, or trading communities. Anyone who registers via your link is permanently linked to your account as a Direct Referral (Level 1).\n' +
        '3) Whenever your referrals trade across AI Trade, Forex / Manual Trading, or Binary Options, the IB Commission Engine automatically calculates your commission.\n' +
        '4) Your commission profit is credited instantly in real time directly to your Available Wallet Balance (with zero lockup), and every payout is logged with full Bangladesh Time (BDT), source user, volume, and applied percentage rate.',
    },
    {
      category: 'IB & Commissions',
      question: 'What is the difference between Direct Referral (Level 1) and Sub-IB (Level 2) commission?',
      answer:
        '• Direct Referral (Level 1): Users who sign up directly with your referral link. You earn Level 1 commission on every eligible trade or AI Trade payout they generate.\n' +
        '• Sub-IB Referral (Level 2): When your Level 1 referrals invite their own friends, those second-tier users become your Sub-IB (Level 2) network.\n' +
        `• Tier Rates Example:\n` +
        `  - Bronze Partner: Direct ${fmtPct(bronze.ai_trade_direct_pct)} AI Trade, ${bManual} Forex, ${fmtPct(bronze.binary_direct_pct)} Binary (Direct only).\n` +
        `  - Silver Leader: Direct ${fmtPct(silver.ai_trade_direct_pct)} + Sub-IB ${fmtPct(silver.ai_trade_sub_pct)} AI Trade; Direct ${sManual} + Sub-IB ${sManualSub} Forex; Direct ${fmtPct(silver.binary_direct_pct)} + Sub-IB ${fmtPct(silver.binary_sub_pct)} Binary.\n` +
        `  - Gold Master: Direct ${fmtPct(gold.ai_trade_direct_pct)} + Sub-IB ${fmtPct(gold.ai_trade_sub_pct)} AI Trade; Direct ${gManual} + Sub-IB ${gManualSub} Forex; Direct ${fmtPct(gold.binary_direct_pct)} + Sub-IB ${fmtPct(gold.binary_sub_pct)} Binary.`,
    },
    {
      category: 'Lot Size & Forex',
      question: 'What is Lot Size in Forex / Manual Trading, and how does it affect margin & IB commission?',
      answer:
        'A "Lot" is the unit that measures the size (volume) of a manual Forex, Gold, Crypto, or Commodity trade in the Order Ticket:\n' +
        '• 0.01 Lot (Micro Lot) = smallest standard step size (e.g. 0.01).\n' +
        '• 0.10 Lot (Mini Lot) = 10× larger than 0.01.\n' +
        '• 1.00 Lot (Standard Lot) = 100× larger than 0.01.\n' +
        '• Margin & Leverage (1:100): When a trader opens a trade, Required Margin = (Lots × Market Entry Price) ÷ 100. That margin is temporarily locked while the trade is open, and Profit/Loss (PnL) = (Exit Price − Entry Price) × Direction × Lots.\n' +
        `• How IB Commission Is Calculated on Lots: When your referral closes a manual trade, your IB commission is paid automatically on the closed lot volume (or margin % if configured). For example, at ${bManual} (Bronze), 1.00 lot pays $${Number(bronze.manual_direct_rate || 2).toFixed(2)}, 0.50 lot pays $${(Number(bronze.manual_direct_rate || 2) * 0.5).toFixed(2)}, and 0.10 lot pays $${(Number(bronze.manual_direct_rate || 2) * 0.1).toFixed(2)}.`,
    },
    {
      category: 'Lot Size & Forex',
      question: 'When is Forex / Manual Trading IB commission paid — on trade open or trade close?',
      answer:
        'Manual Forex/Gold/Crypto IB commission is calculated and credited automatically the moment your referral closes an open trade (using either Close on an individual order or Close All). If a trader uses Close All across multiple open positions, the engine sums the total lot volume (and stake) closed and credits your Available Wallet Balance immediately.',
    },
    {
      category: 'AI Trade',
      question: 'How does AI Trade work, what are the 4 slots & daily profit ratios, and how much IB commission do I earn?',
      answer:
        'AI Trade is an automated 24-hour algorithmic trading engine with 4 investment slots:\n' +
        '• Slot 1 — Starter ($10 – $100): 1.5% – 2.0% daily profit (60% user profit split).\n' +
        '• Slot 2 — Booster ($101 – $1,000): 2.0% – 2.5% daily profit (70% user profit split).\n' +
        '• Slot 3 — Premium ($1,001 – $5,000): 2.5% – 3.0% daily profit (75% user profit split).\n' +
        '• Slot 4 — Titan Mega ($5,001 – $10,000+): 3.0% – 3.5% daily profit (85% user profit split).\n' +
        `• How It Pays: Earnings accumulate every 60 seconds and are automatically credited to the user's Available Wallet every 24 hours. Immediately after each 24h payout, your IB Commission (${fmtPct(bronze.ai_trade_direct_pct)} Bronze / ${fmtPct(silver.ai_trade_direct_pct)} Silver / ${fmtPct(gold.ai_trade_direct_pct)} Gold of their daily AI profit) is credited to your wallet! Example: If a referral invests $1,000 in Booster and earns $22.50 daily profit, a Gold Master IB earns $${(22.5 * (Number(gold.ai_trade_direct_pct || 12) / 100)).toFixed(2)} every 24h.`,
    },
    {
      category: 'Binary & Payouts',
      question: 'How does Binary Options trading work & do I earn IB commission even if my referral loses a trade?',
      answer:
        'In Binary Options, a trader selects an asset, chooses a stake amount and expiry timer (30s, 60s, 2m, 5m, or 10m), and predicts whether price will finish Higher (Up/Call) or Lower (Down/Put). Winning trades return stake + 80% payout.\n' +
        `• IB Commission on Binary Turnover: Yes — IB commission is paid on the Binary trade stake/turnover as soon as the trade is placed, regardless of whether the trade wins or loses. Example: If a referral places a $100 Binary trade, you earn ${fmtPct(bronze.binary_direct_pct)} ($${Number(bronze.binary_direct_pct || 1).toFixed(2)}) at Bronze, ${fmtPct(silver.binary_direct_pct)} ($${Number(silver.binary_direct_pct || 2).toFixed(2)}) at Silver, or ${fmtPct(gold.binary_direct_pct)} ($${Number(gold.binary_direct_pct || 3.5).toFixed(2)}) at Gold.`,
    },
    {
      category: 'IB & Commissions',
      question: 'How do IB Level Upgrades (Bronze → Silver → Gold) & Monthly Salary Bonuses work?',
      answer:
        `Every calendar month (e.g., 2026-11), the system sums the team trading volume generated by your referrals across AI Trade, Forex, and Binary Options.\n` +
        `• Silver Leader: Unlocks at $${Number(silver.min_monthly_volume || 5000).toLocaleString()}/month team volume and pays an automatic fixed $${Number(silver.monthly_bonus || 50)} Monthly Bonus.\n` +
        `• Gold Master: Unlocks at $${Number(gold.min_monthly_volume || 25000).toLocaleString()}/month team volume and pays an automatic fixed $${Number(gold.monthly_bonus || 250)} Monthly Bonus.\n` +
        '• The IB Scheduler checks eligibility every hour and credits your monthly salary bonus once per calendar month directly into your Available Wallet Balance.',
    },
    {
      category: 'IB & Commissions',
      question: 'What is "Official IB Holder" status and can Admin set custom IB levels or percentage ratios?',
      answer:
        '• Official IB Holder Status: Administrators can explicitly grant Official IB Holder status to any user, assign Bronze / Silver / Gold rank directly, and lock that rank so monthly volume fluctuations never downgrade it.\n' +
        '• Custom VIP Rates: Administrators can also assign custom commission percentage ratios (higher AI Trade %, Forex $/lot or %, Binary %, or custom Monthly Salary Bonus) to individual IB accounts. When active, your IB Dashboard shows a "★ Custom VIP Rates Active" badge.',
    },
    {
      category: 'Account & Security',
      question: 'When can I withdraw my IB commissions, and how do withdrawals & 2FA work?',
      answer:
        'There is zero lockup or holding period on IB commission earnings — every dollar goes straight into your Available Wallet Balance immediately. You can trade with it or withdraw it anytime via USDT/crypto (BEP-20 / TRC-20, etc.). All withdrawals include automatic wallet address format verification, Google Authenticator (2FA) security confirmation, and a standard 3–24 hour processing SLA.',
    },
    {
      category: 'Account & Security',
      question: 'Why are all dates and times shown in Bangladesh Time (BDT)?',
      answer:
        'To ensure transparent, consistent auditing across all user accounts, IB profit ledgers, team join dates, deposits, and withdrawals, every timestamp across AvaPartner is standardized to Bangladesh Standard Time (Asia/Dhaka, BDT, UTC+6).',
    },
    {
      category: 'Account & Security',
      question: 'What is the AvaPartner Affiliate Program & which regulatory jurisdictions does AvaTrade Group cover?',
      answer:
        'AvaPartner is the global affiliate and Introducing Broker network of the AvaTrade Group (est. 2006). AvaTrade Group holds regulatory licenses across 9 jurisdictions including Ireland (CBI #C53877), Australia (ASIC #406684), Japan (FSA #1662 & FFAJ #1574), UAE Abu Dhabi (ADGM FSRA #190018), South Africa (FSCA #45984), Cyprus (CySEC #347/17), British Virgin Islands (BVI FSC #SIBA/L/13/1049), Israel (ISA #514666577), and Poland (KNF), supporting partners across 150+ countries.',
    },
    {
      category: 'Account & Security',
      question: 'How much does it cost to join and can I promote multiple asset classes?',
      answer:
        'Joining is 100% free with zero setup fees or monthly subscriptions. You earn across all supported products simultaneously — AI Trade strategies, Forex & Gold CFDs, Cryptocurrencies, Indices, Commodities, and Binary Options — using a single referral link.',
    },
  ]
}
