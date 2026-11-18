/**
 * Shared IB Configuration & Effective Rate Resolver
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for global IB tier rates, program rules,
 * per-user custom percentage overrides, and rate formatting.
 * ─────────────────────────────────────────────────────────────────────────
 */
import db from '../db.js';

export const IB_LEVELS = ['BRONZE', 'SILVER', 'GOLD'];

export const VALID_ASSET_CLASSES = [
  'AI_TRADE',
  'MANUAL_TRADING',
  'BINARY_OPTIONS',
  'MONTHLY_BONUS',
  'MANUAL_CREDIT',
];

export const DEFAULT_TIER_SETTINGS = [
  {
    level: 'BRONZE',
    display_name: 'Bronze Partner',
    ai_trade_direct_pct: 5,
    ai_trade_sub_pct: 0,
    manual_mode: 'per_lot',
    manual_direct_rate: 2,
    manual_sub_rate: 0,
    binary_direct_pct: 1,
    binary_sub_pct: 0,
    min_monthly_volume: 0,
    monthly_bonus: 0,
  },
  {
    level: 'SILVER',
    display_name: 'Silver Leader',
    ai_trade_direct_pct: 8,
    ai_trade_sub_pct: 2,
    manual_mode: 'per_lot',
    manual_direct_rate: 4,
    manual_sub_rate: 1,
    binary_direct_pct: 2,
    binary_sub_pct: 0.5,
    min_monthly_volume: 5000,
    monthly_bonus: 50,
  },
  {
    level: 'GOLD',
    display_name: 'Gold Master',
    ai_trade_direct_pct: 12,
    ai_trade_sub_pct: 5,
    manual_mode: 'per_lot',
    manual_direct_rate: 8,
    manual_sub_rate: 2,
    binary_direct_pct: 3.5,
    binary_sub_pct: 0,
    min_monthly_volume: 25000,
    monthly_bonus: 250,
  },
];

export const DEFAULT_PROGRAM_CONFIG = {
  only_approved_ib_earn: '0',
  auto_upgrade_enabled: '1',
};

/**
 * Idempotently ensure default IB tier rows and program config keys exist.
 * Safe to call on startup and immediately after cloud snapshot restores.
 */
export function ensureIBSchemaAndDefaults(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ib_settings (
      level TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      ai_trade_direct_pct REAL NOT NULL DEFAULT 5,
      ai_trade_sub_pct REAL NOT NULL DEFAULT 0,
      manual_mode TEXT NOT NULL DEFAULT 'per_lot',
      manual_direct_rate REAL NOT NULL DEFAULT 2,
      manual_sub_rate REAL NOT NULL DEFAULT 0,
      binary_direct_pct REAL NOT NULL DEFAULT 1,
      binary_sub_pct REAL NOT NULL DEFAULT 0,
      min_monthly_volume REAL NOT NULL DEFAULT 0,
      monthly_bonus REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ib_user_rates (
      user_id INTEGER PRIMARY KEY,
      ai_trade_direct_pct REAL,
      ai_trade_sub_pct REAL,
      manual_mode TEXT,
      manual_direct_rate REAL,
      manual_sub_rate REAL,
      binary_direct_pct REAL,
      binary_sub_pct REAL,
      monthly_bonus REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ib_program_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertTier = database.prepare(`
    INSERT OR IGNORE INTO ib_settings (
      level, display_name, ai_trade_direct_pct, ai_trade_sub_pct,
      manual_mode, manual_direct_rate, manual_sub_rate,
      binary_direct_pct, binary_sub_pct, min_monthly_volume, monthly_bonus
    ) VALUES (
      @level, @display_name, @ai_trade_direct_pct, @ai_trade_sub_pct,
      @manual_mode, @manual_direct_rate, @manual_sub_rate,
      @binary_direct_pct, @binary_sub_pct, @min_monthly_volume, @monthly_bonus
    )
  `);
  for (const tier of DEFAULT_TIER_SETTINGS) {
    insertTier.run(tier);
  }

  const insertCfg = database.prepare(`
    INSERT OR IGNORE INTO ib_program_config (key, value) VALUES (?, ?)
  `);
  for (const [k, v] of Object.entries(DEFAULT_PROGRAM_CONFIG)) {
    insertCfg.run(k, v);
  }
}

export function getAllTierSettings(database = db) {
  let rows = [];
  try {
    rows = database.prepare('SELECT * FROM ib_settings').all();
  } catch {
    ensureIBSchemaAndDefaults(database);
    rows = database.prepare('SELECT * FROM ib_settings').all();
  }
  if (rows.length < IB_LEVELS.length) {
    ensureIBSchemaAndDefaults(database);
    rows = database.prepare('SELECT * FROM ib_settings').all();
  }
  const map = {};
  for (const def of DEFAULT_TIER_SETTINGS) {
    const found = rows.find(r => r.level === def.level);
    map[def.level] = found ? { ...def, ...found } : { ...def };
  }
  return map;
}

export function getProgramConfig(database = db) {
  let rows = [];
  try {
    rows = database.prepare('SELECT key, value FROM ib_program_config').all();
  } catch {
    ensureIBSchemaAndDefaults(database);
    rows = database.prepare('SELECT key, value FROM ib_program_config').all();
  }
  const map = { ...DEFAULT_PROGRAM_CONFIG };
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return {
    only_approved_ib_earn: map.only_approved_ib_earn === '1',
    auto_upgrade_enabled: map.auto_upgrade_enabled !== '0',
  };
}

function fmtPct(v) {
  const n = Number(v || 0);
  if (n <= 0) return '—';
  return `${Number(n.toFixed(4))}%`;
}

function fmtManual(v, mode) {
  const n = Number(v || 0);
  if (n <= 0) return '—';
  return mode === 'percent' ? `${Number(n.toFixed(4))}%` : `$${Number(n.toFixed(4))}/lot`;
}

export function formatRatesForDisplay(rates) {
  const mode = rates.manual_mode === 'percent' ? 'percent' : 'per_lot';
  return {
    ai_trade: {
      direct: fmtPct(rates.ai_trade_direct_pct),
      sub: fmtPct(rates.ai_trade_sub_pct),
      direct_pct: Number(rates.ai_trade_direct_pct || 0),
      sub_pct: Number(rates.ai_trade_sub_pct || 0),
    },
    manual: {
      mode,
      direct: fmtManual(rates.manual_direct_rate, mode),
      sub: fmtManual(rates.manual_sub_rate, mode),
      direct_rate: Number(rates.manual_direct_rate || 0),
      sub_rate: Number(rates.manual_sub_rate || 0),
    },
    binary: {
      direct: fmtPct(rates.binary_direct_pct),
      sub: fmtPct(rates.binary_sub_pct),
      direct_pct: Number(rates.binary_direct_pct || 0),
      sub_pct: Number(rates.binary_sub_pct || 0),
    },
    monthly_bonus: Number(rates.monthly_bonus || 0),
  };
}

export function getEffectiveIBProfile(userId, database = db) {
  const tierMap = getAllTierSettings(database);
  const programConfig = getProgramConfig(database);

  const levelRow = database.prepare('SELECT * FROM ib_levels WHERE user_id = ?').get(userId) || null;
  const customRow = database.prepare('SELECT * FROM ib_user_rates WHERE user_id = ?').get(userId) || null;

  const isIbHolder = levelRow ? Number(levelRow.is_ib_holder ?? 1) === 1 : false;
  const isPaused = levelRow ? Number(levelRow.is_ib_holder ?? 1) === 0 : false;
  const level = IB_LEVELS.includes(levelRow?.level) ? levelRow.level : 'BRONZE';
  const tierDefaults = tierMap[level] || tierMap.BRONZE;

  // Eligible to earn automatic IB commissions:
  // - Explicitly paused/revoked IB rows (is_ib_holder = 0) never earn.
  // - When only_approved_ib_earn is ON, only active IB Holders (is_ib_holder = 1) earn.
  const eligible = isPaused ? false : (programConfig.only_approved_ib_earn ? isIbHolder : true);

  const pickNum = (overrideVal, fallbackVal) =>
    overrideVal !== null && overrideVal !== undefined && overrideVal !== '' && Number.isFinite(Number(overrideVal))
      ? Number(overrideVal)
      : Number(fallbackVal || 0);

  const effectiveNumeric = {
    ai_trade_direct_pct: pickNum(customRow?.ai_trade_direct_pct, tierDefaults.ai_trade_direct_pct),
    ai_trade_sub_pct: pickNum(customRow?.ai_trade_sub_pct, tierDefaults.ai_trade_sub_pct),
    manual_mode: customRow?.manual_mode || tierDefaults.manual_mode || 'per_lot',
    manual_direct_rate: pickNum(customRow?.manual_direct_rate, tierDefaults.manual_direct_rate),
    manual_sub_rate: pickNum(customRow?.manual_sub_rate, tierDefaults.manual_sub_rate),
    binary_direct_pct: pickNum(customRow?.binary_direct_pct, tierDefaults.binary_direct_pct),
    binary_sub_pct: pickNum(customRow?.binary_sub_pct, tierDefaults.binary_sub_pct),
    monthly_bonus: pickNum(customRow?.monthly_bonus, tierDefaults.monthly_bonus),
  };

  const hasCustomRates = Boolean(
    customRow && (
      customRow.ai_trade_direct_pct != null ||
      customRow.ai_trade_sub_pct != null ||
      customRow.manual_mode != null ||
      customRow.manual_direct_rate != null ||
      customRow.manual_sub_rate != null ||
      customRow.binary_direct_pct != null ||
      customRow.binary_sub_pct != null ||
      customRow.monthly_bonus != null
    )
  );

  const ibStatus = isIbHolder ? 'ACTIVE_IB' : (isPaused ? 'PAUSED' : 'STANDARD');

  return {
    is_ib_holder: isIbHolder,
    ib_status: ibStatus,
    eligible,
    level,
    assigned_level: levelRow?.level || null,
    level_locked: Number(levelRow?.level_locked || 0) === 1,
    assigned_at: levelRow?.assigned_at || levelRow?.upgraded_at || null,
    upgraded_at: levelRow?.upgraded_at || null,
    notes: levelRow?.notes || '',
    has_custom_rates: hasCustomRates,
    custom_rates: customRow,
    tier_defaults: tierDefaults,
    effective_numeric: effectiveNumeric,
    formatted_rates: formatRatesForDisplay(effectiveNumeric),
  };
}
