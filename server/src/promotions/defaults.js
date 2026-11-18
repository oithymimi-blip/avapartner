export const DEFAULT_PROMOTIONS = [
  {
    title: '100% First Deposit Welcome Bonus',
    subtitle: 'Double your starting capital on your qualifying USDT (BEP-20) deposit.',
    category: 'deposit_bonus',
    badge_text: '100% BONUS',
    bonus_type: 'percentage',
    bonus_value: 100,
    max_bonus_amount: 500,
    min_deposit: 50,
    promo_code: 'WELCOME100',
    terms: 'Valid once per trader on deposits of $50 or more. Bonus scales 100% up to $500 extra trading capital.',
    auto_credit: 0,
    featured: 1,
    active: 1,
    max_claims_per_user: 1
  },
  {
    title: '50% Reload Deposit Boost',
    subtitle: 'Power up every qualifying top-up with an extra 50% margin boost.',
    category: 'deposit_bonus',
    badge_text: 'HOT OFFER',
    bonus_type: 'percentage',
    bonus_value: 50,
    max_bonus_amount: 1000,
    min_deposit: 100,
    promo_code: 'BOOST50',
    terms: 'Available up to 3 times per user on deposits of $100+ USDT. Maximum $1,000 bonus per claim.',
    auto_credit: 0,
    featured: 1,
    active: 1,
    max_claims_per_user: 3
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
    terms: 'Claimable once by new users after a minimum $20 qualifying deposit.',
    auto_credit: 0,
    featured: 1,
    active: 1,
    max_claims_per_user: 1
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
    terms: 'Applicable up to 2 times on qualifying deposits of $50 or more, capped at $300 per offer claim.',
    auto_credit: 0,
    featured: 0,
    active: 1,
    max_claims_per_user: 2
  }
];

export function ensurePromotionsSchemaAndDefaults(db) {
  db.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_promotion_claims_user ON promotion_claims(user_id, claimed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_promotion_claims_promo ON promotion_claims(promotion_id);
  `);

  const claimCols = db.prepare('PRAGMA table_info(promotion_claims)').all();
  if (!claimCols.some(c => c.name === 'deposit_request_id')) {
    db.exec('ALTER TABLE promotion_claims ADD COLUMN deposit_request_id INTEGER');
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM promotions').get()?.c || 0;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO promotions (
        title, subtitle, category, badge_text, bonus_type, bonus_value,
        max_bonus_amount, min_deposit, promo_code, terms,
        auto_credit, featured, active, max_claims_per_user
      ) VALUES (
        @title, @subtitle, @category, @badge_text, @bonus_type, @bonus_value,
        @max_bonus_amount, @min_deposit, @promo_code, @terms,
        @auto_credit, @featured, @active, @max_claims_per_user
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
