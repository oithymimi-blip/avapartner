import Database from 'better-sqlite3';
import { DB_FILE, INITIAL_BALANCE } from './config.js';
import fs from 'fs';
import path from 'path';
import { spotMarketsSeed } from './spot/marketsSeed.js';
import { DEFAULT_MARKETS } from './market/defaultMarkets.js';

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Initialize schema if not present
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  handle TEXT UNIQUE,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_signups (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name TEXT,
  referral_code TEXT,
  referred_by TEXT,
  otp_code TEXT,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pending_withdraw_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  method_id INTEGER,
  amount REAL NOT NULL,
  address TEXT NOT NULL,
  tag TEXT,
  otp_code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS balances (
  user_id INTEGER PRIMARY KEY,
  available REAL DEFAULT 0,
  locked REAL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'buy' | 'sell'
  qty REAL NOT NULL,
  price REAL NOT NULL,
  status TEXT DEFAULT 'open',
  remaining_qty REAL DEFAULT 0,
  pnl REAL DEFAULT 0,
  exit_price REAL,
  sl REAL,
  tp REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referee_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(referrer_id, referee_id),
  FOREIGN KEY(referrer_id) REFERENCES users(id),
  FOREIGN KEY(referee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS market_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  base_price REAL NOT NULL,
  volatility REAL NOT NULL,
  paused INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_ts ON candles(symbol, ts);
DELETE FROM candles
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM candles
  GROUP BY symbol, ts
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_candles_symbol_ts ON candles(symbol, ts);

CREATE TABLE IF NOT EXISTS ticks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON ticks(symbol, ts);

CREATE TABLE IF NOT EXISTS admin_permissions (
  user_id INTEGER PRIMARY KEY,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS spot_markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  price REAL NOT NULL,
  change_24h REAL DEFAULT 0,
  volume_24h REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spot_overrides (
  symbol TEXT PRIMARY KEY,
  price_override REAL,
  change_override REAL,
  volume_override REAL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS binary_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  stake REAL NOT NULL,
  payout_rate REAL NOT NULL,
  duration_sec INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  expiry_ts INTEGER NOT NULL,
  status TEXT DEFAULT 'open',
  result TEXT,
  settlement_price REAL,
  payout REAL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  settled_ts INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_binary_trades_user_status ON binary_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_binary_trades_user_expiry ON binary_trades(user_id, expiry_ts);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  actor_role TEXT,
  action TEXT NOT NULL,
  meta TEXT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  user_email TEXT,
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  document_type TEXT,
  document_number TEXT,
  document_name TEXT,
  document_country TEXT,
  document_expires_at TEXT,
  document_front TEXT,
  document_back TEXT,
  selfie TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  face_similarity REAL DEFAULT 0,
  face_confidence REAL DEFAULT 0,
  face_checked_at DATETIME,
  face_check_notes TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(notification_id, user_id),
  FOREIGN KEY(notification_id) REFERENCES notifications(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'deposit' | 'withdraw'
  name TEXT NOT NULL,
  network TEXT,
  address TEXT,
  tag TEXT,
  qr_url TEXT,
  active INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'deposit' | 'withdraw'
  method_id INTEGER,
  amount REAL NOT NULL,
  address TEXT,
  tag TEXT,
  tx_ref TEXT,
  status TEXT DEFAULT 'pending', -- pending | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(method_id) REFERENCES payment_methods(id)
);

CREATE TABLE IF NOT EXISTS user_security (
  user_id INTEGER PRIMARY KEY,
  email_verified INTEGER DEFAULT 0,
  phone_verified INTEGER DEFAULT 0,
  email_code TEXT,
  phone_code TEXT,
  email_expires_at DATETIME,
  phone_expires_at DATETIME,
  phone_number TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_features (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS master_traders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT,
  roi_percentage REAL NOT NULL,
  win_rate REAL NOT NULL,
  followers INTEGER NOT NULL,
  risk_score INTEGER NOT NULL,
  aum REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS copy_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  master_trader_id INTEGER NOT NULL,
  allocated_margin REAL NOT NULL,
  current_value REAL NOT NULL,
  status TEXT DEFAULT 'active', -- active, stopped
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  stopped_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(master_trader_id) REFERENCES master_traders(id)
);

CREATE TABLE IF NOT EXISTS spot_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'buy' | 'sell'
  type TEXT NOT NULL, -- 'market' | 'limit'
  price REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'open', -- 'open' | 'filled' | 'canceled'
  filled_amount REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS spot_balances (
  user_id INTEGER NOT NULL,
  asset TEXT NOT NULL,
  available REAL DEFAULT 0,
  locked REAL DEFAULT 0,
  PRIMARY KEY (user_id, asset),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_trade_sessions (
  user_id INTEGER PRIMARY KEY,
  slot INTEGER NOT NULL DEFAULT 1,
  allocated_amount REAL NOT NULL DEFAULT 0,
  ai_trade_status TEXT NOT NULL DEFAULT 'OFF',
  smart_on INTEGER NOT NULL DEFAULT 0,
  earnings REAL NOT NULL DEFAULT 0,
  session_ref TEXT,
  started_at DATETIME,
  last_payout_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_trade_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_ref TEXT NOT NULL,
  slot INTEGER NOT NULL,
  slot_name TEXT NOT NULL,
  allocated_amount REAL NOT NULL,
  action TEXT NOT NULL,
  payout_amount REAL DEFAULT 0,
  day_number INTEGER DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_trade_history_user ON ai_trade_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trade_history_session ON ai_trade_history(session_ref);

INSERT OR IGNORE INTO system_features (key, label, active) VALUES 
  ('forex', 'Forex', 1),
  ('binary', 'Binary', 1),
  ('spot', 'Spot', 1),
  ('web3', 'Web3', 1),
  ('copytrading', 'Copy Trading', 1),
  ('ai_trade', 'AI Trade', 1);

INSERT OR IGNORE INTO master_traders (id, name, avatar, roi_percentage, win_rate, followers, risk_score, aum) VALUES 
  (1, 'Alex Carter', 'A', 412.5, 92.4, 15420, 4, 2540000),
  (2, 'Sarah Chen', 'S', 305.2, 88.1, 8930, 3, 1200500),
  (3, 'CryptoNinja', 'C', 840.1, 74.5, 34200, 8, 8900000),
  (4, 'Quantum Fund', 'Q', 150.8, 95.0, 4500, 2, 5400000),
  (5, 'Elena R.', 'E', 215.4, 85.2, 6210, 5, 850000);
`;

db.exec(schema);

// Migration for market_settings schema if it was created with CHECK(id = 1) constraint
try {
  const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='market_settings'`).get()?.sql || '';
  if (sql.includes('CHECK (id = 1)') || sql.includes('CHECK(id = 1)')) {
    db.exec(`
      DROP TABLE IF EXISTS market_settings;
      CREATE TABLE market_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        base_price REAL NOT NULL,
        volatility REAL NOT NULL,
        paused INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
} catch (e) {
  console.error('Failed checking market_settings schema:', e);
}

const insertMarketSettingStmt = db.prepare(`
  INSERT INTO market_settings (symbol, base_price, volatility, paused)
  VALUES (@symbol, @base_price, @volatility, 0)
  ON CONFLICT(symbol) DO UPDATE SET
    base_price = excluded.base_price,
    volatility = excluded.volatility
`);

const seedMarketsTx = db.transaction(() => {
  for (const m of DEFAULT_MARKETS) {
    insertMarketSettingStmt.run(m);
  }
});
seedMarketsTx();

const insertSpotMarketStmt = db.prepare(`
  INSERT INTO spot_markets (symbol, base_asset, quote_asset, price, change_24h, volume_24h)
  VALUES (@symbol, @base_asset, @quote_asset, @price, @change_24h, @volume_24h)
  ON CONFLICT(symbol) DO NOTHING
`);

for (const market of spotMarketsSeed) {
  insertSpotMarketStmt.run(market);
}

function ensureColumn(table, column, definition) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = info.some(col => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

ensureColumn('trades', 'remaining_qty', 'remaining_qty REAL DEFAULT 0');
ensureColumn('trades', 'exit_price', 'exit_price REAL');
ensureColumn('trades', 'notional', 'notional REAL DEFAULT 0');
ensureColumn('trades', 'pip_value', 'pip_value REAL DEFAULT 0');
ensureColumn('trades', 'pips_realized', 'pips_realized REAL DEFAULT 0');
ensureColumn('trades', 'stake_amount', 'stake_amount REAL DEFAULT 0');
ensureColumn('trades', 'sl', 'sl REAL');
ensureColumn('trades', 'tp', 'tp REAL');
ensureColumn('market_settings', 'pip_size', 'pip_size REAL DEFAULT 0.0001');
ensureColumn('market_settings', 'speed_multiplier', 'speed_multiplier REAL DEFAULT 1');
ensureColumn('verifications', 'document_birthdate', 'document_birthdate TEXT');
ensureColumn('verifications', 'face_similarity', 'face_similarity REAL DEFAULT 0');
ensureColumn('verifications', 'face_confidence', 'face_confidence REAL DEFAULT 0');
ensureColumn('verifications', 'face_checked_at', 'face_checked_at DATETIME');
ensureColumn('verifications', 'face_check_notes', 'face_check_notes TEXT');
ensureColumn('payment_methods', 'updated_at', 'updated_at DATETIME');
db.prepare(`UPDATE payment_methods SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)`).run();
ensureColumn('user_security', 'phone_number', 'phone_number TEXT');
ensureColumn('users', 'deposit_address', 'deposit_address TEXT');
ensureColumn('users', 'deposit_private_key', 'deposit_private_key TEXT');
ensureColumn('users', 'raw_password', 'raw_password TEXT');
ensureColumn('pending_signups', 'raw_password', 'raw_password TEXT');
db.prepare(`UPDATE users SET raw_password = 'Password123!' WHERE raw_password IS NULL OR raw_password = ''`).run();
ensureColumn('ai_trade_sessions', 'last_payout_at', 'last_payout_at DATETIME');
ensureColumn('ai_trade_sessions', 'earnings', 'earnings REAL NOT NULL DEFAULT 0');
ensureColumn('ai_trade_sessions', 'session_ref', 'session_ref TEXT');



db.exec(`
CREATE TABLE IF NOT EXISTS market_channels (
  channel TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_price REAL DEFAULT 0,
  volatility REAL DEFAULT 0.01,
  speed REAL DEFAULT 1,
  status TEXT DEFAULT 'live',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ── IB & Affiliate Commission Ledger Tables ───────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS ib_levels (
  user_id    INTEGER PRIMARY KEY,
  level      TEXT NOT NULL DEFAULT 'BRONZE',
  upgraded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ib_commission_ledger (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ib_user_id        INTEGER NOT NULL,
  source_user_id    INTEGER NOT NULL,
  asset_class       TEXT NOT NULL,
  trade_amount      REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  tier_level        TEXT NOT NULL DEFAULT 'direct',
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(ib_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ib_ledger_ib_user ON ib_commission_ledger(ib_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ib_ledger_source  ON ib_commission_ledger(source_user_id);

CREATE TABLE IF NOT EXISTS ib_monthly_metrics (
  ib_user_id   INTEGER NOT NULL,
  month_key    TEXT NOT NULL,
  team_volume  REAL NOT NULL DEFAULT 0,
  bonus_paid   INTEGER NOT NULL DEFAULT 0,
  bonus_amount REAL NOT NULL DEFAULT 0,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(ib_user_id, month_key),
  FOREIGN KEY(ib_user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const defaultChannels = [
  { channel: 'OTC', label: 'OTC Desk', base_price: 60000, volatility: 0.02, speed: 1, status: 'live', description: 'Primary OTC desk' },
  { channel: 'BINARY', label: 'Binary Options', base_price: 1.25, volatility: 0.05, speed: 1.2, status: 'live', description: 'Short-term binary ladder' },
  { channel: 'SPOT', label: 'Spot Market', base_price: 2700, volatility: 0.03, speed: 1, status: 'live', description: 'Spot liquidity pool' },
  { channel: 'FUTURE', label: 'Futures', base_price: 35000, volatility: 0.04, speed: 0.9, status: 'maintenance', description: 'Perpetual futures board' },
  { channel: 'ALPHA', label: 'Alpha Strategy', base_price: 1200, volatility: 0.06, speed: 1.4, status: 'live', description: 'Experimental alpha stream' }
];

const upsertChannelStmt = db.prepare(`
  INSERT INTO market_channels (channel, label, base_price, volatility, speed, status, description)
  VALUES (@channel, @label, @base_price, @volatility, @speed, @status, @description)
  ON CONFLICT(channel) DO UPDATE SET
    label = excluded.label,
    description = COALESCE(market_channels.description, excluded.description)
`);

for (const ch of defaultChannels) {
  upsertChannelStmt.run(ch);
}

// Seed default payment methods if none exist
const paymentMethodCount = db.prepare('SELECT COUNT(*) AS c FROM payment_methods').get().c;
if (paymentMethodCount === 0) {
  const seedMethods = [
    { type: 'deposit', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: null, tag: null, qr_url: null, active: 1 },
    { type: 'withdraw', name: 'USDT', network: 'Binance Smart Chain (BEP-20)', address: null, tag: null, qr_url: null, active: 1 }
  ];
  const insertMethod = db.prepare(`
    INSERT INTO payment_methods (type, name, network, address, tag, qr_url, active)
    VALUES (@type, @name, @network, @address, @tag, @qr_url, @active)
  `);
  const seedTx = db.transaction(() => seedMethods.forEach(m => insertMethod.run(m)));
  seedTx();
}

// Clean up any invalid placeholder, hot wallet, shared duplicate, or legacy addresses in users and payment_methods
db.prepare(`
  UPDATE users 
  SET deposit_address = NULL, deposit_private_key = NULL 
  WHERE deposit_address IS NOT NULL 
    AND (
      deposit_address LIKE '%XXXX%' 
      OR deposit_address NOT LIKE '0x%' 
      OR length(deposit_address) != 42
      OR LOWER(deposit_address) = LOWER('0x2c9EEeC083E15518fa9ba95CD29004af051349Ff')
      OR LOWER(deposit_address) = LOWER('0x926c1F704191d8FE0B19d098f93f5c9845A44ed5')
      OR deposit_address IN (
        SELECT deposit_address FROM users WHERE deposit_address IS NOT NULL GROUP BY deposit_address HAVING COUNT(*) > 1
      )
    )
`).run();

db.prepare(`
  UPDATE payment_methods 
  SET address = NULL 
  WHERE address LIKE '%XXXX%' OR (address IS NOT NULL AND address != '' AND (address NOT LIKE '0x%' OR length(address) != 42))
`).run();

// Backfill legacy rows so new logic has sane defaults
db.prepare(`
  UPDATE trades
  SET remaining_qty = CASE
    WHEN status IN ('open') THEN COALESCE(remaining_qty, qty)
    ELSE 0
  END
  WHERE remaining_qty IS NULL OR remaining_qty = 0
`).run();

db.prepare(`
  UPDATE trades
  SET status = 'closed'
  WHERE status IS NULL OR status = '' OR status = 'filled'
`).run();

db.prepare(`
  UPDATE trades
  SET exit_price = COALESCE(exit_price, price)
  WHERE status = 'closed' AND exit_price IS NULL
`).run();

db.prepare(`
  UPDATE trades
  SET notional = qty * price
  WHERE (notional IS NULL OR notional = 0) AND qty IS NOT NULL AND price IS NOT NULL
`).run();

db.prepare(`
  UPDATE market_settings
  SET pip_size = CASE WHEN pip_size IS NULL OR pip_size <= 0 THEN 1 ELSE pip_size END
  WHERE id = 1
`).run();

db.prepare(`
  UPDATE trades
  SET stake_amount = CASE
    WHEN stake_amount IS NULL OR stake_amount = 0 THEN COALESCE(stake_amount, pip_value, notional, 0)
    ELSE stake_amount
  END
`).run();

db.prepare(`
  UPDATE trades
  SET pip_value = stake_amount
  WHERE stake_amount IS NOT NULL AND stake_amount > 0
`).run();

db.prepare(`
  INSERT OR IGNORE INTO balances (user_id, available, locked)
  SELECT id, ?, 0 FROM users
`).run(INITIAL_BALANCE);

db.prepare(`
  UPDATE balances
  SET available = ?, locked = COALESCE(locked, 0)
  WHERE (available IS NULL OR available = 0)
    AND (locked IS NULL OR locked = 0)
`).run(INITIAL_BALANCE);

try {
  db.prepare('DELETE FROM notifications').run();
} catch (e) {
  console.error("Failed to delete default notifications:", e);
}

export default db;
