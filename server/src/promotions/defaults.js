export const DEFAULT_BONUS_SETTINGS = {
  system_enabled: '1',
  default_double_multiplier: '2',
  default_cashout_pct: '50',
  default_required_milestones: '2',
  allowed_profit_sources: 'ai_trade,forex,binary',
  enforce_withdrawal_conditions: '1',
  auto_match_deposit_bonus: '1',
  page_headline: 'Deposit Bonuses & Exclusive Promotions',
  page_subheadline:
    'Unlock 100% deposit bonuses, new user rewards, and custom promo codes. Double your balance via AI Trade, Forex, or Binary to cash out 50% across 2 milestones.',
  withdrawal_rule_summary:
    'Example: Deposit $100 + 100% Bonus ($100) = $200. Double to $400 via AI Trade, Forex, or Binary to withdraw 50% ($200). Double your remaining balance a 2nd time to withdraw 50% again — after 2 completed milestones, 100% of remaining funds are eligible for normal withdrawal.'
};

export const DEFAULT_PROMOTIONS = [
  {
    title: '100% Deposit Welcome Bonus',
    subtitle: 'Get a 100% deposit match up to 2 times on your account — double your trading power instantly.',
    category: 'deposit_bonus',
    badge_text: '100% BONUS',
    bonus_type: 'percentage',
    bonus_value: 100,
    max_bonus_amount: 500,
    min_deposit: 50,
    promo_code: 'WELCOME100',
    terms:
      'Claimable up to 2 times per account on deposits of $50+. Profit must be earned from AI Trade, Forex, or Binary: double total balance to cash out 50%, repeat a 2nd double for 50% again, then full balance unlocks.',
    auto_credit: 1,
    featured: 1,
    active: 1,
    max_claims_per_user: 2,
    apply_withdrawal_condition: 1,
    profit_multiplier: 2,
    cashout_pct_per_milestone: 50,
    required_milestones: 2,
    allowed_sources: 'ai_trade,forex,binary',
    total_global_limit: 0,
    sort_order: 1
  },
  {
    title: '50% Reload Deposit Boost',
    subtitle: 'Power up qualifying top-ups with an extra 50% margin boost.',
    category: 'deposit_bonus',
    badge_text: 'HOT OFFER',
    bonus_type: 'percentage',
    bonus_value: 50,
    max_bonus_amount: 1000,
    min_deposit: 100,
    promo_code: 'BOOST50',
    terms:
      'Available up to 3 times per user on deposits of $100+ USDT. Subject to AI Trade, Forex, or Binary double-profit 50% x 2 milestone cashout terms.',
    auto_credit: 0,
    featured: 1,
    active: 1,
    max_claims_per_user: 3,
    apply_withdrawal_condition: 1,
    profit_multiplier: 2,
    cashout_pct_per_milestone: 50,
    required_milestones: 2,
    allowed_sources: 'ai_trade,forex,binary',
    total_global_limit: 0,
    sort_order: 2
  },
  {
    title: '$25 New User Starter Bonus',
    subtitle: 'Exclusive welcome reward for newly funded AvaPartner accounts.',
    category: 'welcome_bonus',
    badge_text: 'NEW USER',
    bonus_type: 'fixed',
    bonus_value: 25,
    max_bonus_amount: 25,
    min_deposit: 20,
    promo_code: 'NEW25',
    terms:
      'Claimable once by new users after a minimum $20 qualifying deposit. Complete AI Trade, Forex, or Binary trading milestones to unlock withdrawals.',
    auto_credit: 0,
    featured: 1,
    active: 1,
    max_claims_per_user: 1,
    apply_withdrawal_condition: 1,
    profit_multiplier: 2,
    cashout_pct_per_milestone: 50,
    required_milestones: 2,
    allowed_sources: 'ai_trade,forex,binary',
    total_global_limit: 0,
    sort_order: 3
  },
  {
    title: '15% VIP Cashback & Promo Offer',
    subtitle: 'Extra promotional cashback reward for active Forex, Binary & AI Trade users.',
    category: 'promo_offer',
    badge_text: 'CASHBACK',
    bonus_type: 'percentage',
    bonus_value: 15,
    max_bonus_amount: 300,
    min_deposit: 50,
    promo_code: 'VIP15',
    terms:
      'Applicable up to 2 times on qualifying deposits of $50 or more, capped at $300 per offer claim.',
    auto_credit: 0,
    featured: 0,
    active: 1,
    max_claims_per_user: 2,
    apply_withdrawal_condition: 1,
    profit_multiplier: 2,
    cashout_pct_per_milestone: 50,
    required_milestones: 2,
    allowed_sources: 'ai_trade,forex,binary',
    total_global_limit: 0,
    sort_order: 4
  }
];

function ensureCol(db, table, colName, colDef) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  if (!cols.some(c => c.name === colName)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN ${colDef}`);
    return true;
  }
  return false;
}

export function ensurePromotionsSchemaAndDefaults(db, { skipPromoSeed = false } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bonus_system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      category TEXT NOT NULL DEFAULT 'deposit_bonus',
      badge_text TEXT,
      bonus_type TEXT NOT NULL DEFAULT 'percentage',
      bonus_value REAL NOT NULL DEFAULT 0,
      max_bonus_amount REAL NOT NULL DEFAULT 0,
      min_deposit REAL NOT NULL DEFAULT 0,
      promo_code TEXT UNIQUE,
      terms TEXT,
      auto_credit INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      max_claims_per_user INTEGER NOT NULL DEFAULT 1,
      apply_withdrawal_condition INTEGER NOT NULL DEFAULT 1,
      profit_multiplier REAL NOT NULL DEFAULT 2,
      cashout_pct_per_milestone REAL NOT NULL DEFAULT 50,
      required_milestones INTEGER NOT NULL DEFAULT 2,
      allowed_sources TEXT NOT NULL DEFAULT 'ai_trade,forex,binary',
      total_global_limit INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS promotion_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      deposit_request_id INTEGER,
      promo_code TEXT,
      deposit_amount REAL NOT NULL DEFAULT 0,
      bonus_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bonus_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      promotion_id INTEGER,
      claim_id INTEGER,
      promo_code TEXT,
      promo_title TEXT,
      deposit_amount REAL NOT NULL DEFAULT 0,
      bonus_amount REAL NOT NULL DEFAULT 0,
      cycle_start_balance REAL NOT NULL DEFAULT 0,
      milestone_base_balance REAL NOT NULL DEFAULT 0,
      profit_multiplier REAL NOT NULL DEFAULT 2,
      cashout_pct REAL NOT NULL DEFAULT 50,
      required_milestones INTEGER NOT NULL DEFAULT 2,
      milestones_completed INTEGER NOT NULL DEFAULT 0,
      allowed_sources TEXT NOT NULL DEFAULT 'ai_trade,forex,binary',
      baseline_ai_profit REAL NOT NULL DEFAULT 0,
      baseline_forex_profit REAL NOT NULL DEFAULT 0,
      baseline_binary_profit REAL NOT NULL DEFAULT 0,
      manual_profit_offset REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      last_withdrawal_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_promotion_claims_user ON promotion_claims(user_id, claimed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_promotion_claims_promo ON promotion_claims(promotion_id);
    CREATE INDEX IF NOT EXISTS idx_bonus_locks_user_status ON bonus_locks(user_id, status);
  `);

  ensureCol(db, 'promotion_claims', 'deposit_request_id', 'deposit_request_id INTEGER');
  ensureCol(db, 'payment_requests', 'bonus_lock_snapshot', 'bonus_lock_snapshot TEXT');

  ensureCol(db, 'promotions', 'apply_withdrawal_condition', 'apply_withdrawal_condition INTEGER NOT NULL DEFAULT 1');
  ensureCol(db, 'promotions', 'profit_multiplier', 'profit_multiplier REAL NOT NULL DEFAULT 2');
  ensureCol(db, 'promotions', 'cashout_pct_per_milestone', 'cashout_pct_per_milestone REAL NOT NULL DEFAULT 50');
  ensureCol(db, 'promotions', 'required_milestones', 'required_milestones INTEGER NOT NULL DEFAULT 2');
  ensureCol(db, 'promotions', 'allowed_sources', "allowed_sources TEXT NOT NULL DEFAULT 'ai_trade,forex,binary'");
  ensureCol(db, 'promotions', 'total_global_limit', 'total_global_limit INTEGER NOT NULL DEFAULT 0');
  ensureCol(db, 'promotions', 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');

  const upsertSetting = db.prepare(`
    INSERT OR IGNORE INTO bonus_system_settings (key, value) VALUES (?, ?)
  `);
  for (const [k, v] of Object.entries(DEFAULT_BONUS_SETTINGS)) {
    upsertSetting.run(k, String(v));
  }

  const migratedV2 = db.prepare("SELECT value FROM bonus_system_settings WHERE key = 'migration_welcome100_v2'").get();
  if (!migratedV2) {
    db.prepare(`
      UPDATE promotions
      SET max_claims_per_user = 2,
          auto_credit = 1,
          title = '100% Deposit Welcome Bonus',
          subtitle = 'Get a 100% deposit match up to 2 times on your account — double your trading power instantly.',
          terms = 'Claimable up to 2 times per account on deposits of $50+. Profit must be earned from AI Trade, Forex, or Binary: double total balance to cash out 50%, repeat a 2nd double for 50% again, then full balance unlocks.',
          updated_at = CURRENT_TIMESTAMP
      WHERE promo_code = 'WELCOME100' AND title = '100% First Deposit Welcome Bonus' AND max_claims_per_user = 1
    `).run();
    db.prepare("INSERT OR REPLACE INTO bonus_system_settings (key, value) VALUES ('migration_welcome100_v2', '1')").run();
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM promotions').get()?.c || 0;
  if (!skipPromoSeed && count === 0) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO promotions (
        title, subtitle, category, badge_text, bonus_type, bonus_value,
        max_bonus_amount, min_deposit, promo_code, terms,
        auto_credit, featured, active, max_claims_per_user,
        apply_withdrawal_condition, profit_multiplier, cashout_pct_per_milestone,
        required_milestones, allowed_sources, total_global_limit, sort_order
      ) VALUES (
        @title, @subtitle, @category, @badge_text, @bonus_type, @bonus_value,
        @max_bonus_amount, @min_deposit, @promo_code, @terms,
        @auto_credit, @featured, @active, @max_claims_per_user,
        @apply_withdrawal_condition, @profit_multiplier, @cashout_pct_per_milestone,
        @required_milestones, @allowed_sources, @total_global_limit, @sort_order
      )
    `);
    const tx = db.transaction(() => {
      for (const p of DEFAULT_PROMOTIONS) {
        insert.run(p);
      }
    });
    tx();
  }
}
