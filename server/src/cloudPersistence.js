import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import pg from 'pg';
import { createClient as createLibsqlClient } from '@libsql/client';
import { DB_FILE, DATABASE_URL, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from './config.js';
import {
  backupDatabase,
  getLocalBackupStatus,
  listLocalBackups,
  registerMutationListener,
  saveLocalJsonSnapshot
} from './db.js';
import { ensureIBSchemaAndDefaults } from './ib/ibConfig.js';
import { ensurePromotionsSchemaAndDefaults } from './promotions/defaults.js';
import { ensureVerificationSchemaAndDefaults } from './verifications/settings.js';

const { Pool } = pg;

// Durable application tables (excludes high-volume transient ticks/candles and static market seeds)
export const PERSISTENT_TABLES = [
  'users',
  'balances',
  'user_security',
  'admin_permissions',
  'user_deposit_wallets',
  'referrals',
  'trades',
  'binary_trades',
  'spot_orders',
  'spot_balances',
  'spot_overrides',
  'master_traders',
  'copy_relationships',
  'ai_trade_sessions',
  'ai_trade_history',
  'ib_levels',
  'ib_user_rates',
  'ib_settings',
  'ib_program_config',
  'ib_commission_ledger',
  'ib_monthly_metrics',
  'bonus_system_settings',
  'promotions',
  'promotion_claims',
  'bonus_locks',
  'verifications',
  'verification_settings',
  'payment_methods',
  'payment_requests',
  'notifications',
  'notification_reads',
  'admin_notifications',
  'activity_logs',
  'system_features',
  'market_settings',
  'market_channels',
  'pending_signups',
  'pending_withdraw_otps',
  'password_reset_tokens',
  'sqlite_sequence'
];

const USER_LINKED_TABLES_APPEND = [
  'trades',
  'binary_trades',
  'spot_orders',
  'ai_trade_history',
  'ib_commission_ledger',
  'promotion_claims',
  'bonus_locks',
  'notifications',
  'activity_logs',
  'payment_requests',
  'copy_relationships',
  'password_reset_tokens',
  'pending_withdraw_otps'
];

let dbRef = null;
let pgPool = null;
let tursoClient = null;
let activeDriver = 'none'; // 'postgres' | 'turso' | 'none'
let syncTimer = null;
let safetyInterval = null;
let minuteBackupInterval = null;
let backupCycleRunning = false;
let dirty = false;
let isRestoring = false;
let lastSyncAt = null;
let lastSyncError = null;
let lastCloudBackupAt = null;
let lastCloudBackupHash = null;
let lastBackupError = null;
let cloudBackupCount = 0;
let cloudBlobCount = 0;
let lastKnownCloudUserCount = 0;
let localRevision = 0;
let refreshInFlight = null;
let syncInFlight = null;

function buildPgPoolConfig(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    return {
      connectionString: u.toString(),
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    };
  } catch {
    const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
    return {
      connectionString: rawUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    };
  }
}

function encodeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  return zlib.gzipSync(Buffer.from(json, 'utf8')).toString('base64');
}

function decodeSnapshot(payload) {
  if (!payload || typeof payload !== 'string') return null;
  try {
    if (payload.trim().startsWith('{')) {
      return JSON.parse(payload);
    }
    const buf = Buffer.from(payload, 'base64');
    const json = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    console.error('[CLOUD SYNC] Failed to decode snapshot:', err.message);
    return null;
  }
}

function getTableColumns(db, table) {
  try {
    return db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
  } catch {
    return [];
  }
}

function buildInsertStatement(db, table, columns, orClause = 'INSERT OR REPLACE') {
  const colList = columns.map(c => `"${c}"`).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  return db.prepare(`${orClause} INTO "${table}" (${colList}) VALUES (${placeholders})`);
}

export function exportDatabaseSnapshot(db = dbRef) {
  if (!db) throw new Error('Database not initialized');
  const data = {};
  for (const table of PERSISTENT_TABLES) {
    try {
      data[table] = db.prepare(`SELECT * FROM "${table}"`).all();
    } catch (_) {
      data[table] = [];
    }
  }
  const userCount = Array.isArray(data.users) ? data.users.length : 0;
  return {
    version: 1,
    app: 'avapartner',
    exportedAt: new Date().toISOString(),
    userCount,
    data
  };
}

function replaceSnapshot(db, snapshot) {
  const data = snapshot?.data || {};
  const reverseTables = [...PERSISTENT_TABLES].reverse();

  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      for (const table of reverseTables) {
        try {
          db.prepare(`DELETE FROM "${table}"`).run();
        } catch (_) {}
      }

      for (const table of PERSISTENT_TABLES) {
        const rows = Array.isArray(data[table]) ? data[table] : [];
        if (rows.length === 0) continue;

        if (table === 'sqlite_sequence') {
          const stmt = db.prepare('INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)');
          for (const row of rows) {
            if (row?.name != null && row?.seq != null) {
              stmt.run(row.name, row.seq);
            }
          }
          continue;
        }

        const validCols = getTableColumns(db, table);
        if (validCols.length === 0) continue;

        for (const row of rows) {
          const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(row, c));
          if (cols.length === 0) continue;
          const stmt = buildInsertStatement(db, table, cols, 'INSERT OR REPLACE');
          stmt.run(...cols.map(c => row[c] === undefined ? null : row[c]));
        }
      }
    });
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function mergeSnapshot(db, snapshot) {
  const data = snapshot?.data || {};
  const stats = { usersAdded: 0, usersMatched: 0, recordsMerged: 0 };

  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      const userIdMap = new Map();
      const newlyAddedUserIds = new Set();

      // 1. Merge users by lowercase email cleanly with zero ID collisions
      const incomingUsers = Array.isArray(data.users) ? data.users : [];
      for (const u of incomingUsers) {
        const email = String(u?.email || '').trim().toLowerCase();
        if (!email) continue;

        const existing = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
        if (existing) {
          userIdMap.set(u.id, existing.id);
          stats.usersMatched += 1;
          db.prepare(`
            UPDATE users
            SET name = COALESCE(NULLIF(name, ''), ?),
                handle = COALESCE(NULLIF(handle, ''), ?),
                referral_code = COALESCE(NULLIF(referral_code, ''), ?),
                deposit_address = COALESCE(NULLIF(deposit_address, ''), ?),
                deposit_private_key = COALESCE(NULLIF(deposit_private_key, ''), ?),
                avatar = COALESCE(avatar, ?)
            WHERE id = ?
          `).run(
            u.name || null,
            u.handle || null,
            u.referral_code || null,
            u.deposit_address || null,
            u.deposit_private_key || null,
            u.avatar || null,
            existing.id
          );
          continue;
        }

        const validCols = getTableColumns(db, 'users');
        const clone = { ...u, email };

        // Avoid unique handle or referral_code collisions
        if (clone.handle) {
          const dupHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(clone.handle);
          if (dupHandle) clone.handle = `${clone.handle}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
        if (clone.referral_code) {
          const dupRef = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(clone.referral_code);
          if (dupRef) clone.referral_code = `${clone.referral_code.slice(0, 4)}${Math.floor(10 + Math.random() * 89)}`;
        }

        const idOccupied = clone.id != null && db.prepare('SELECT id FROM users WHERE id = ?').get(clone.id);
        if (idOccupied) {
          delete clone.id;
        }

        const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
        const stmt = buildInsertStatement(db, 'users', cols, 'INSERT');
        const info = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
        const newId = Number(info.lastInsertRowid);
        userIdMap.set(u.id, newId);
        newlyAddedUserIds.add(newId);
        stats.usersAdded += 1;
      }

      // 2. Merge single-row-per-user tables
      for (const table of ['balances', 'user_security', 'admin_permissions', 'ai_trade_sessions', 'ib_levels', 'ib_user_rates', 'verifications']) {
        const rows = Array.isArray(data[table]) ? data[table] : [];
        const validCols = getTableColumns(db, table);
        if (validCols.length === 0) continue;

        for (const row of rows) {
          const targetUid = userIdMap.get(row.user_id);
          if (!targetUid) continue;
          // Only overwrite balance/state for newly restored users or when target row does not exist yet
          if (table === 'balances' && !newlyAddedUserIds.has(targetUid)) {
            const existingBal = db.prepare('SELECT user_id FROM balances WHERE user_id = ?').get(targetUid);
            if (existingBal) continue;
          }
          const clone = { ...row, user_id: targetUid };
          if (table === 'verifications') delete clone.id;
          const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
          const stmt = buildInsertStatement(db, table, cols, 'INSERT OR IGNORE');
          const res = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
          stats.recordsMerged += res.changes || 0;
        }
      }

      // 3. Merge composite-key tables
      for (const row of (data.spot_balances || [])) {
        const targetUid = userIdMap.get(row.user_id);
        if (!targetUid) continue;
        const res = db.prepare('INSERT OR IGNORE INTO spot_balances (user_id, asset, available, locked) VALUES (?, ?, ?, ?)')
          .run(targetUid, row.asset, row.available ?? 0, row.locked ?? 0);
        stats.recordsMerged += res.changes || 0;
      }

      for (const row of (data.referrals || [])) {
        const refId = userIdMap.get(row.referrer_id);
        const eeId = userIdMap.get(row.referee_id);
        if (!refId || !eeId) continue;
        const res = db.prepare('INSERT OR IGNORE INTO referrals (referrer_id, referee_id, created_at) VALUES (?, ?, ?)')
          .run(refId, eeId, row.created_at || null);
        stats.recordsMerged += res.changes || 0;
      }

      for (const row of (data.ib_monthly_metrics || [])) {
        const targetUid = userIdMap.get(row.ib_user_id);
        if (!targetUid) continue;
        const res = db.prepare(`
          INSERT OR IGNORE INTO ib_monthly_metrics (ib_user_id, month_key, team_volume, bonus_paid, bonus_amount, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(targetUid, row.month_key, row.team_volume ?? 0, row.bonus_paid ?? 0, row.bonus_amount ?? 0, row.updated_at || null);
        stats.recordsMerged += res.changes || 0;
      }

      for (const table of ['ib_settings', 'ib_program_config', 'bonus_system_settings', 'verification_settings', 'system_features', 'market_settings', 'market_channels', 'spot_overrides', 'master_traders']) {
        const rows = Array.isArray(data[table]) ? data[table] : [];
        const validCols = getTableColumns(db, table);
        if (validCols.length === 0) continue;
        for (const row of rows) {
          const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(row, c));
          if (cols.length === 0) continue;
          const stmt = buildInsertStatement(db, table, cols, 'INSERT OR IGNORE');
          const res = stmt.run(...cols.map(c => row[c] === undefined ? null : row[c]));
          stats.recordsMerged += res.changes || 0;
        }
      }

      const pmCols = getTableColumns(db, 'payment_methods');
      if (pmCols.length > 0) {
        for (const row of (data.payment_methods || [])) {
          const dup = db.prepare(`
            SELECT id FROM payment_methods
            WHERE type = ? AND name = ? AND COALESCE(network, '') = ? AND COALESCE(address, '') = ?
          `).get(row.type, row.name, row.network || '', row.address || '');
          if (dup) continue;
          const clone = { ...row };
          delete clone.id;
          const cols = pmCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
          const stmt = buildInsertStatement(db, 'payment_methods', cols, 'INSERT');
          const res = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
          stats.recordsMerged += res.changes || 0;
        }
      }

      const anCols = getTableColumns(db, 'admin_notifications');
      if (anCols.length > 0) {
        for (const row of (data.admin_notifications || [])) {
          const dup = db.prepare(`
            SELECT id FROM admin_notifications
            WHERE type = ? AND title = ? AND COALESCE(created_at, '') = ?
          `).get(row.type, row.title, row.created_at || '');
          if (dup) continue;
          const clone = { ...row };
          delete clone.id;
          const cols = anCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
          const stmt = buildInsertStatement(db, 'admin_notifications', cols, 'INSERT');
          const res = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
          stats.recordsMerged += res.changes || 0;
        }
      }

      const promoIdMap = new Map();
      const promoCols = getTableColumns(db, 'promotions');
      if (promoCols.length > 0) {
        for (const row of (data.promotions || [])) {
          const existing = row.promo_code
            ? db.prepare('SELECT id FROM promotions WHERE LOWER(promo_code) = LOWER(?)').get(row.promo_code)
            : db.prepare('SELECT id FROM promotions WHERE title = ?').get(row.title);
          if (existing) {
            promoIdMap.set(row.id, existing.id);
            continue;
          }
          const clone = { ...row };
          delete clone.id;
          const cols = promoCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
          if (cols.length === 0) continue;
          const stmt = buildInsertStatement(db, 'promotions', cols, 'INSERT');
          const res = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
          promoIdMap.set(row.id, Number(res.lastInsertRowid));
          stats.recordsMerged += res.changes || 0;
        }
      }

      for (const row of (data.user_deposit_wallets || [])) {
        const targetUid = userIdMap.get(row.user_id);
        if (!targetUid || !row.address || !row.private_key) continue;
        const res = db.prepare(`
          INSERT OR IGNORE INTO user_deposit_wallets (address, user_id, email, private_key, unswept_credited_wei, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(row.address, targetUid, row.email || null, row.private_key, row.unswept_credited_wei || '0', row.created_at || null);
        stats.recordsMerged += res.changes || 0;
      }

      // 4. Merge append tables idempotently (avoid duplicate rows on repeated imports)
      for (const table of USER_LINKED_TABLES_APPEND) {
        const rows = Array.isArray(data[table]) ? data[table] : [];
        const validCols = getTableColumns(db, table);
        if (validCols.length === 0) continue;

        for (const row of rows) {
          const clone = { ...row };
          delete clone.id;

          if (table === 'ib_commission_ledger') {
            const ibUid = userIdMap.get(row.ib_user_id);
            const srcUid = userIdMap.get(row.source_user_id);
            if (!ibUid || !srcUid) continue;
            clone.ib_user_id = ibUid;
            clone.source_user_id = srcUid;
            const dup = db.prepare(`
              SELECT id FROM ib_commission_ledger
              WHERE ib_user_id = ? AND source_user_id = ? AND created_at = ? AND commission_amount = ?
            `).get(ibUid, srcUid, row.created_at || '', row.commission_amount ?? 0);
            if (dup) continue;
          } else if (row.user_id != null) {
            const targetUid = userIdMap.get(row.user_id);
            if (!targetUid) continue;
            clone.user_id = targetUid;
          } else if (table === 'activity_logs' || table === 'notifications') {
            clone.user_id = null;
          } else {
            continue;
          }

          if (table === 'payment_requests') {
            const dup = row.tx_ref
              ? db.prepare('SELECT id FROM payment_requests WHERE user_id = ? AND tx_ref = ?').get(clone.user_id, row.tx_ref)
              : db.prepare('SELECT id FROM payment_requests WHERE user_id = ? AND type = ? AND amount = ? AND COALESCE(created_at, \'\') = ?').get(clone.user_id, row.type, row.amount, row.created_at || '');
            if (dup) continue;
          } else if (table === 'trades') {
            const dup = db.prepare('SELECT id FROM trades WHERE user_id = ? AND symbol = ? AND side = ? AND price = ? AND qty = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.symbol, row.side, row.price, row.qty, row.created_at || '');
            if (dup) continue;
          } else if (table === 'binary_trades') {
            const dup = db.prepare('SELECT id FROM binary_trades WHERE user_id = ? AND symbol = ? AND created_ts = ?')
              .get(clone.user_id, row.symbol, row.created_ts);
            if (dup) continue;
          } else if (table === 'activity_logs') {
            const dup = db.prepare('SELECT id FROM activity_logs WHERE COALESCE(user_id, -1) = COALESCE(?, -1) AND action = ? AND COALESCE(ts, \'\') = ?')
              .get(clone.user_id, row.action, row.ts || '');
            if (dup) continue;
          } else if (table === 'notifications') {
            const dup = db.prepare('SELECT id FROM notifications WHERE COALESCE(user_id, -1) = COALESCE(?, -1) AND title = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.title, row.created_at || '');
            if (dup) continue;
          } else if (table === 'spot_orders') {
            const dup = db.prepare('SELECT id FROM spot_orders WHERE user_id = ? AND symbol = ? AND side = ? AND price = ? AND amount = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.symbol, row.side, row.price, row.amount, row.created_at || '');
            if (dup) continue;
          } else if (table === 'ai_trade_history') {
            const dup = db.prepare('SELECT id FROM ai_trade_history WHERE user_id = ? AND session_ref = ? AND action = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.session_ref, row.action, row.created_at || '');
            if (dup) continue;
          } else if (table === 'copy_relationships') {
            const dup = db.prepare('SELECT id FROM copy_relationships WHERE user_id = ? AND master_trader_id = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.master_trader_id, row.created_at || '');
            if (dup) continue;
          } else if (table === 'promotion_claims') {
            const mappedPromoId = promoIdMap.get(row.promotion_id) || row.promotion_id;
            if (!mappedPromoId) continue;
            clone.promotion_id = mappedPromoId;
            const dup = db.prepare('SELECT id FROM promotion_claims WHERE user_id = ? AND promotion_id = ? AND COALESCE(claimed_at, \'\') = ?')
              .get(clone.user_id, clone.promotion_id, row.claimed_at || '');
            if (dup) continue;
          } else if (table === 'bonus_locks') {
            if (row.promotion_id) {
              clone.promotion_id = promoIdMap.get(row.promotion_id) || row.promotion_id;
            }
            const dup = db.prepare('SELECT id FROM bonus_locks WHERE user_id = ? AND COALESCE(promo_code, \'\') = ? AND COALESCE(created_at, \'\') = ?')
              .get(clone.user_id, row.promo_code || '', row.created_at || '');
            if (dup) continue;
          }

          const cols = validCols.filter(c => Object.prototype.hasOwnProperty.call(clone, c));
          const stmt = buildInsertStatement(db, table, cols, 'INSERT');
          const res = stmt.run(...cols.map(c => clone[c] === undefined ? null : clone[c]));
          stats.recordsMerged += res.changes || 0;
        }
      }
    });
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return stats;
}

export function importDatabaseSnapshot(db = dbRef, snapshot, { mode = 'merge' } = {}) {
  if (!db) throw new Error('Database not initialized');
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.data || typeof snapshot.data !== 'object') {
    throw new Error('Invalid backup snapshot payload');
  }

  isRestoring = true;
  try {
    if (mode === 'replace') {
      replaceSnapshot(db, snapshot);
      ensureIBSchemaAndDefaults(db);
      ensurePromotionsSchemaAndDefaults(db, { skipPromoSeed: Array.isArray(snapshot.data.promotions) });
      ensureVerificationSchemaAndDefaults(db);
      return { ok: true, mode: 'replace', userCount: snapshot.data.users?.length || 0 };
    }
    const stats = mergeSnapshot(db, snapshot);
    ensureIBSchemaAndDefaults(db);
    ensurePromotionsSchemaAndDefaults(db, { skipPromoSeed: Array.isArray(snapshot.data.promotions) });
    ensureVerificationSchemaAndDefaults(db);
    return { ok: true, mode: 'merge', ...stats };
  } finally {
    isRestoring = false;
  }
}

async function initRemoteDriver() {
  if (DATABASE_URL) {
    try {
      pgPool = new Pool(buildPgPoolConfig(DATABASE_URL));
      pgPool.on('error', (err) => {
        lastSyncError = `PostgreSQL pool error: ${err.message}`;
        console.error('[CLOUD SYNC POOL ERROR]', err.message);
      });
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_state (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          revision INTEGER DEFAULT 1,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pgPool.query(`ALTER TABLE avapartner_cloud_state ADD COLUMN IF NOT EXISTS revision INTEGER DEFAULT 1;`);
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_blobs (
          hash TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          byte_size INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_backups (
          id SERIAL PRIMARY KEY,
          minute_bucket TEXT UNIQUE NOT NULL,
          snapshot_hash TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          total_balance DOUBLE PRECISION DEFAULT 0,
          trade_count INTEGER DEFAULT 0,
          activity_count INTEGER DEFAULT 0,
          revision INTEGER DEFAULT 0,
          changed INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_created ON avapartner_cloud_backups(created_at DESC);`);
      await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_changed ON avapartner_cloud_backups(changed, created_at);`);

      try {
        const latestRow = await pgPool.query('SELECT snapshot_hash, created_at FROM avapartner_cloud_backups ORDER BY id DESC LIMIT 1');
        if (latestRow.rows[0]) {
          lastCloudBackupHash = latestRow.rows[0].snapshot_hash;
          lastCloudBackupAt = new Date(latestRow.rows[0].created_at).toISOString();
        }
        const countsRes = await pgPool.query(`
          SELECT
            (SELECT COUNT(*) FROM avapartner_cloud_backups) AS backup_count,
            (SELECT COUNT(*) FROM avapartner_cloud_blobs) AS blob_count
        `);
        cloudBackupCount = Number(countsRes.rows[0]?.backup_count || 0);
        cloudBlobCount = Number(countsRes.rows[0]?.blob_count || 0);
      } catch (_) {}

      activeDriver = 'postgres';
      lastSyncError = null;
      console.log('[CLOUD SYNC] Connected to persistent PostgreSQL (DATABASE_URL).');
      return;
    } catch (err) {
      lastSyncError = `PostgreSQL connection failed: ${err.message}`;
      console.error('[CLOUD SYNC ERROR]', lastSyncError);
      if (pgPool) {
        await pgPool.end().catch(() => {});
      }
      pgPool = null;
    }
  }

  if (TURSO_DATABASE_URL) {
    try {
      tursoClient = createLibsqlClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN || undefined
      });
      await tursoClient.execute(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_state (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          revision INTEGER DEFAULT 1,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        await tursoClient.execute(`ALTER TABLE avapartner_cloud_state ADD COLUMN revision INTEGER DEFAULT 1`);
      } catch (_) {}
      await tursoClient.execute(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_blobs (
          hash TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          byte_size INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await tursoClient.execute(`
        CREATE TABLE IF NOT EXISTS avapartner_cloud_backups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          minute_bucket TEXT UNIQUE NOT NULL,
          snapshot_hash TEXT NOT NULL,
          user_count INTEGER DEFAULT 0,
          total_balance REAL DEFAULT 0,
          trade_count INTEGER DEFAULT 0,
          activity_count INTEGER DEFAULT 0,
          revision INTEGER DEFAULT 0,
          changed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await tursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_created ON avapartner_cloud_backups(created_at DESC)`);
      await tursoClient.execute(`CREATE INDEX IF NOT EXISTS idx_cloud_backups_changed ON avapartner_cloud_backups(changed, created_at)`);

      try {
        const latestRow = await tursoClient.execute('SELECT snapshot_hash, created_at FROM avapartner_cloud_backups ORDER BY id DESC LIMIT 1');
        if (latestRow.rows[0]) {
          lastCloudBackupHash = latestRow.rows[0].snapshot_hash;
          lastCloudBackupAt = String(latestRow.rows[0].created_at);
        }
        const bCount = await tursoClient.execute('SELECT COUNT(*) AS c FROM avapartner_cloud_backups');
        const blCount = await tursoClient.execute('SELECT COUNT(*) AS c FROM avapartner_cloud_blobs');
        cloudBackupCount = Number(bCount.rows[0]?.c || 0);
        cloudBlobCount = Number(blCount.rows[0]?.c || 0);
      } catch (_) {}

      activeDriver = 'turso';
      lastSyncError = null;
      console.log('[CLOUD SYNC] Connected to persistent Turso/libSQL (TURSO_DATABASE_URL).');
      return;
    } catch (err) {
      lastSyncError = `Turso connection failed: ${err.message}`;
      console.error('[CLOUD SYNC ERROR]', lastSyncError);
      tursoClient = null;
    }
  }

  activeDriver = 'none';
}

function computeSnapshotMeta(snapshot) {
  const data = snapshot?.data || {};
  const dataJson = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(dataJson).digest('hex');
  const balances = Array.isArray(data.balances) ? data.balances : [];
  const totalBalance = balances.reduce(
    (sum, b) => sum + Number(b?.available || 0) + Number(b?.locked || 0),
    0
  );
  const tradeCount =
    (Array.isArray(data.trades) ? data.trades.length : 0) +
    (Array.isArray(data.binary_trades) ? data.binary_trades.length : 0) +
    (Array.isArray(data.spot_orders) ? data.spot_orders.length : 0);
  const activityCount = Array.isArray(data.activity_logs) ? data.activity_logs.length : 0;
  return {
    hash,
    userCount: snapshot?.userCount || 0,
    totalBalance: Number(totalBalance.toFixed(6)),
    tradeCount,
    activityCount
  };
}

async function recordMinuteCloudBackup(snapshot, encodedPayload, meta) {
  if (activeDriver === 'none') return { backedUp: false, reason: 'No external cloud DB configured' };

  const minuteBucket = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM UTC
  const changed = meta.hash !== lastCloudBackupHash ? 1 : 0;
  const byteSize = Buffer.byteLength(encodedPayload, 'utf8');

  try {
    if (activeDriver === 'postgres' && pgPool) {
      await pgPool.query(
        `
        INSERT INTO avapartner_cloud_blobs (hash, payload, user_count, byte_size, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (hash) DO NOTHING
        `,
        [meta.hash, encodedPayload, meta.userCount, byteSize]
      );
      await pgPool.query(
        `
        INSERT INTO avapartner_cloud_backups (
          minute_bucket, snapshot_hash, user_count, total_balance, trade_count, activity_count, revision, changed, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (minute_bucket) DO UPDATE SET
          snapshot_hash = EXCLUDED.snapshot_hash,
          user_count = EXCLUDED.user_count,
          total_balance = EXCLUDED.total_balance,
          trade_count = EXCLUDED.trade_count,
          activity_count = EXCLUDED.activity_count,
          revision = EXCLUDED.revision,
          changed = GREATEST(avapartner_cloud_backups.changed, EXCLUDED.changed),
          created_at = NOW()
        `,
        [
          minuteBucket,
          meta.hash,
          meta.userCount,
          meta.totalBalance,
          meta.tradeCount,
          meta.activityCount,
          localRevision,
          changed
        ]
      );
      // Keep ALL changed snapshots forever; prune only unchanged minute-heartbeat metadata older than 7 days
      await pgPool.query(
        `DELETE FROM avapartner_cloud_backups WHERE changed = 0 AND created_at < NOW() - INTERVAL '7 days'`
      );
      const countsRes = await pgPool.query(`
        SELECT
          (SELECT COUNT(*) FROM avapartner_cloud_backups) AS backup_count,
          (SELECT COUNT(*) FROM avapartner_cloud_blobs) AS blob_count
      `);
      cloudBackupCount = Number(countsRes.rows[0]?.backup_count || 0);
      cloudBlobCount = Number(countsRes.rows[0]?.blob_count || 0);
    } else if (activeDriver === 'turso' && tursoClient) {
      await tursoClient.execute({
        sql: `
          INSERT OR IGNORE INTO avapartner_cloud_blobs (hash, payload, user_count, byte_size, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        args: [meta.hash, encodedPayload, meta.userCount, byteSize]
      });
      await tursoClient.execute({
        sql: `
          INSERT INTO avapartner_cloud_backups (
            minute_bucket, snapshot_hash, user_count, total_balance, trade_count, activity_count, revision, changed, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (minute_bucket) DO UPDATE SET
            snapshot_hash = excluded.snapshot_hash,
            user_count = excluded.user_count,
            total_balance = excluded.total_balance,
            trade_count = excluded.trade_count,
            activity_count = excluded.activity_count,
            revision = excluded.revision,
            changed = MAX(avapartner_cloud_backups.changed, excluded.changed),
            created_at = CURRENT_TIMESTAMP
        `,
        args: [
          minuteBucket,
          meta.hash,
          meta.userCount,
          meta.totalBalance,
          meta.tradeCount,
          meta.activityCount,
          localRevision,
          changed
        ]
      });
      await tursoClient.execute(
        `DELETE FROM avapartner_cloud_backups WHERE changed = 0 AND created_at < datetime('now', '-7 days')`
      );
      const bCount = await tursoClient.execute('SELECT COUNT(*) AS c FROM avapartner_cloud_backups');
      const blCount = await tursoClient.execute('SELECT COUNT(*) AS c FROM avapartner_cloud_blobs');
      cloudBackupCount = Number(bCount.rows[0]?.c || 0);
      cloudBlobCount = Number(blCount.rows[0]?.c || 0);
    }

    lastCloudBackupHash = meta.hash;
    lastCloudBackupAt = new Date().toISOString();
    lastBackupError = null;
    return {
      backedUp: true,
      minuteBucket,
      hash: meta.hash,
      changed: Boolean(changed),
      at: lastCloudBackupAt
    };
  } catch (err) {
    lastBackupError = err.message;
    console.error('[CLOUD MINUTE BACKUP ERROR]', err.message);
    return { backedUp: false, error: err.message };
  }
}

async function readCloudStateRow() {
  if (activeDriver === 'postgres' && pgPool) {
    const res = await pgPool.query('SELECT payload, user_count, revision, updated_at FROM avapartner_cloud_state WHERE id = $1', ['primary']);
    if (!res.rows.length) return null;
    const row = res.rows[0];
    lastKnownCloudUserCount = Number(row.user_count || 0);
    localRevision = Number(row.revision || 1);
    return decodeSnapshot(row.payload);
  }
  if (activeDriver === 'turso' && tursoClient) {
    const res = await tursoClient.execute({
      sql: 'SELECT payload, user_count, revision, updated_at FROM avapartner_cloud_state WHERE id = ?',
      args: ['primary']
    });
    if (!res.rows.length) return null;
    const row = res.rows[0];
    lastKnownCloudUserCount = Number(row.user_count || 0);
    localRevision = Number(row.revision || 1);
    return decodeSnapshot(row.payload);
  }
  return null;
}

async function getRemoteMeta() {
  if (activeDriver === 'postgres' && pgPool) {
    const res = await pgPool.query('SELECT user_count, revision FROM avapartner_cloud_state WHERE id = $1', ['primary']);
    return res.rows[0] || null;
  }
  if (activeDriver === 'turso' && tursoClient) {
    const res = await tursoClient.execute({
      sql: 'SELECT user_count, revision FROM avapartner_cloud_state WHERE id = ?',
      args: ['primary']
    });
    return res.rows[0] || null;
  }
  return null;
}

export async function pushSnapshotToCloud({ force = false, precomputedSnapshot = null, precomputedEncoded = null } = {}) {
  if (activeDriver === 'none' || !dbRef) return { synced: false, reason: 'No external cloud DB configured' };

  try {
    // Check for concurrent rolling-deploy updates from another container
    const remoteMeta = await getRemoteMeta();
    const remoteRev = Number(remoteMeta?.revision || 0);
    const remoteUsers = Number(remoteMeta?.user_count || 0);
    if (remoteUsers > lastKnownCloudUserCount) lastKnownCloudUserCount = remoteUsers;

    let mergedFromRemote = false;
    if (!force && remoteRev > localRevision) {
      const newerCloudSnap = await readCloudStateRow();
      if (newerCloudSnap?.data) {
        importDatabaseSnapshot(dbRef, newerCloudSnap, { mode: 'merge' });
        mergedFromRemote = true;
      }
    }

    const snapshot = (!mergedFromRemote && precomputedSnapshot) ? precomputedSnapshot : exportDatabaseSnapshot(dbRef);
    const localUserCount = snapshot.userCount;

    // Guard: never overwrite a populated cloud backup with a blank freshly-booted container
    if (!force && lastKnownCloudUserCount > 1 && localUserCount <= 1) {
      return { synced: false, reason: 'Refused to overwrite populated cloud backup with fresh single-admin DB' };
    }

    const encoded = (!mergedFromRemote && precomputedEncoded) ? precomputedEncoded : encodeSnapshot(snapshot);
    const nextRevision = Math.max(localRevision, remoteRev) + 1;

    if (activeDriver === 'postgres' && pgPool) {
      await pgPool.query(
        `
        INSERT INTO avapartner_cloud_state (id, payload, user_count, revision, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          user_count = EXCLUDED.user_count,
          revision = EXCLUDED.revision,
          updated_at = NOW()
        `,
        ['primary', encoded, localUserCount, nextRevision]
      );
    } else if (activeDriver === 'turso' && tursoClient) {
      await tursoClient.execute({
        sql: `
          INSERT INTO avapartner_cloud_state (id, payload, user_count, revision, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            payload = excluded.payload,
            user_count = excluded.user_count,
            revision = excluded.revision,
            updated_at = CURRENT_TIMESTAMP
        `,
        args: ['primary', encoded, localUserCount, nextRevision]
      });
    }
    dirty = false;
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
    lastKnownCloudUserCount = localUserCount;
    localRevision = nextRevision;
    return { synced: true, userCount: localUserCount, revision: nextRevision, updatedAt: lastSyncAt };
  } catch (err) {
    lastSyncError = err.message;
    console.error('[CLOUD SYNC PUSH ERROR]', err.message);
    return { synced: false, error: err.message };
  }
}

export function hasPendingCloudSync() {
  return dirty;
}

export async function ensureLatestFromCloud() {
  if (activeDriver === 'none' || !dbRef || isRestoring) {
    return { checked: false, refreshed: false };
  }
  if (syncInFlight) {
    await syncInFlight.catch(() => {});
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const remoteMeta = await getRemoteMeta();
      const remoteRev = Number(remoteMeta?.revision || 0);
      const remoteUsers = Number(remoteMeta?.user_count || 0);
      if (remoteUsers > lastKnownCloudUserCount) lastKnownCloudUserCount = remoteUsers;
      if (remoteRev > localRevision) {
        const newerSnap = await readCloudStateRow();
        if (newerSnap?.data) {
          const mode = dirty ? 'merge' : 'replace';
          importDatabaseSnapshot(dbRef, newerSnap, { mode });
          lastSyncAt = newerSnap.exportedAt || new Date().toISOString();
          return { checked: true, refreshed: true, revision: localRevision };
        }
      }
      return { checked: true, refreshed: false, revision: localRevision };
    } catch (err) {
      lastSyncError = `Remote freshness check failed: ${err.message}`;
      return { checked: false, refreshed: false, error: err.message };
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function flushIfDirty({ force = false, recordMinuteBackup = false } = {}) {
  if (activeDriver === 'none' || !dbRef || isRestoring) {
    return { flushed: false };
  }
  if (syncInFlight) {
    await syncInFlight.catch(() => {});
  }
  if (!dirty && !force && !recordMinuteBackup) {
    return { flushed: false };
  }

  syncInFlight = (async () => {
    let syncRes = { synced: false };
    let cloudBackupRes = { backedUp: false };
    if (dirty || force) {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      syncRes = await pushSnapshotToCloud({ force });
    }
    const lastMs = lastCloudBackupAt ? Date.parse(lastCloudBackupAt) : 0;
    const dueForMinute = recordMinuteBackup || !lastMs || (Date.now() - lastMs >= 60 * 1000);
    if (dueForMinute && activeDriver !== 'none') {
      const snapshot = exportDatabaseSnapshot(dbRef);
      const meta = computeSnapshotMeta(snapshot);
      if (!(lastKnownCloudUserCount > 1 && meta.userCount <= 1)) {
        const encoded = encodeSnapshot(snapshot);
        cloudBackupRes = await recordMinuteCloudBackup(snapshot, encoded, meta);
      }
    }
    return { flushed: Boolean(syncRes?.synced), syncRes, cloudBackupRes };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function scheduleCloudSync(delayMs = 300) {
  if (isRestoring) return;
  dirty = true;
  if (activeDriver === 'none') return;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    pushSnapshotToCloud().catch(() => {});
  }, delayMs);
}

const CORE_RECORD_TABLES = [
  'users',
  'trades',
  'binary_trades',
  'ai_trade_sessions',
  'ai_trade_history',
  'spot_orders',
  'copy_relationships',
  'payment_requests',
  'activity_logs'
];

function getSnapshotRichnessScore(data = {}) {
  let score = 0;
  for (const t of CORE_RECORD_TABLES) {
    const len = Array.isArray(data[t]) ? data[t].length : 0;
    score += t === 'users' ? len * 100 : len;
  }
  return score;
}

function getLocalRichnessScore(db) {
  let score = 0;
  for (const t of CORE_RECORD_TABLES) {
    try {
      const len = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get()?.c || 0;
      score += t === 'users' ? len * 100 : len;
    } catch (_) {}
  }
  return score;
}

export async function runMinuteBackupCycle({ createArchive = null, forceSync = false } = {}) {
  if (!dbRef || backupCycleRunning) {
    return { skipped: true, reason: !dbRef ? 'Database not initialized' : 'Backup cycle already running' };
  }
  backupCycleRunning = true;
  try {
    // Reconnect remote cloud driver automatically if env vars are set and earlier boot connection failed
    if (activeDriver === 'none' && (DATABASE_URL || TURSO_DATABASE_URL)) {
      await initRemoteDriver();
      if (activeDriver !== 'none') {
        await reconcileStartupState(dbRef);
      }
    }

    const snapshot = exportDatabaseSnapshot(dbRef);
    const meta = computeSnapshotMeta(snapshot);

    // 1. Always preserve local SQLite hot backup + compressed JSON snapshot every minute
    const localDbRes = await backupDatabase(undefined, { createArchive });
    const localJsonRes = saveLocalJsonSnapshot(snapshot, meta.hash, meta);

    // 2. Sync primary cloud state if dirty or forced, and record minute-by-minute checkpoint in cloud DB
    let syncRes = { synced: false };
    let cloudBackupRes = { backedUp: false };

    if (activeDriver !== 'none') {
      if (!forceSync && lastKnownCloudUserCount > 1 && meta.userCount <= 1) {
        syncRes = { synced: false, reason: 'Refused to overwrite populated cloud backup with fresh single-admin DB' };
        cloudBackupRes = { backedUp: false, reason: syncRes.reason };
      } else {
        const encoded = encodeSnapshot(snapshot);
        if (dirty || forceSync || meta.hash !== lastCloudBackupHash) {
          syncRes = await pushSnapshotToCloud({ force: forceSync, precomputedSnapshot: snapshot, precomputedEncoded: encoded });
        }
        cloudBackupRes = await recordMinuteCloudBackup(snapshot, encoded, meta);
      }
    }

    return {
      ok: true,
      hash: meta.hash,
      userCount: meta.userCount,
      totalBalance: meta.totalBalance,
      localDb: localDbRes,
      localJson: localJsonRes,
      cloudSync: syncRes,
      cloudBackup: cloudBackupRes
    };
  } catch (err) {
    lastBackupError = err.message;
    console.error('[MINUTE BACKUP CYCLE ERROR]', err.message);
    return { ok: false, error: err.message };
  } finally {
    backupCycleRunning = false;
  }
}

export async function listCloudBackups(limit = 60) {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200);
  let cloudBackups = [];
  if (activeDriver === 'postgres' && pgPool) {
    try {
      const res = await pgPool.query(
        `SELECT b.id, b.minute_bucket, b.snapshot_hash, b.user_count, b.total_balance,
                b.trade_count, b.activity_count, b.revision, b.changed, b.created_at,
                bl.byte_size
         FROM avapartner_cloud_backups b
         LEFT JOIN avapartner_cloud_blobs bl ON bl.hash = b.snapshot_hash
         ORDER BY b.id DESC
         LIMIT $1`,
        [safeLimit]
      );
      cloudBackups = res.rows;
    } catch (err) {
      console.error('[LIST CLOUD BACKUPS ERROR]', err.message);
    }
  } else if (activeDriver === 'turso' && tursoClient) {
    try {
      const res = await tursoClient.execute({
        sql: `SELECT b.id, b.minute_bucket, b.snapshot_hash, b.user_count, b.total_balance,
                     b.trade_count, b.activity_count, b.revision, b.changed, b.created_at,
                     bl.byte_size
              FROM avapartner_cloud_backups b
              LEFT JOIN avapartner_cloud_blobs bl ON bl.hash = b.snapshot_hash
              ORDER BY b.id DESC
              LIMIT ?`,
        args: [safeLimit]
      });
      cloudBackups = res.rows;
    } catch (err) {
      console.error('[LIST CLOUD BACKUPS ERROR]', err.message);
    }
  }
  return {
    driver: activeDriver,
    cloudBackups,
    localBackups: listLocalBackups(safeLimit)
  };
}

export async function restoreCloudBackupByHash(hash, { mode = 'merge' } = {}) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Backup snapshot hash is required');
  }
  if (activeDriver === 'none' || !dbRef) {
    throw new Error('No external cloud database connected');
  }

  let payload = null;
  if (activeDriver === 'postgres' && pgPool) {
    const res = await pgPool.query('SELECT payload FROM avapartner_cloud_blobs WHERE hash = $1', [hash.trim()]);
    payload = res.rows[0]?.payload || null;
  } else if (activeDriver === 'turso' && tursoClient) {
    const res = await tursoClient.execute({
      sql: 'SELECT payload FROM avapartner_cloud_blobs WHERE hash = ?',
      args: [hash.trim()]
    });
    payload = res.rows[0]?.payload || null;
  }

  if (!payload) {
    throw new Error('Backup snapshot not found in cloud archive');
  }

  const snapshot = decodeSnapshot(payload);
  if (!snapshot?.data) {
    throw new Error('Failed to decode cloud backup snapshot');
  }

  const result = importDatabaseSnapshot(dbRef, snapshot, { mode: mode === 'replace' ? 'replace' : 'merge' });
  const syncResult = await pushSnapshotToCloud({ force: true }).catch(() => ({ synced: false }));
  return { ...result, cloudSynced: Boolean(syncResult?.synced), restoredHash: hash.trim() };
}

async function reconcileStartupState(db) {
  const cloudSnapshot = await readCloudStateRow();
  const localNonAdminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get()?.c || 0;
  const localTotalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0;
  const cloudScore = cloudSnapshot?.data ? getSnapshotRichnessScore(cloudSnapshot.data) : 0;
  const localScore = getLocalRichnessScore(db);
  const cloudUserCount = cloudSnapshot?.data?.users?.length || 0;

  if (cloudSnapshot?.data && (cloudUserCount > 0 || cloudScore > localScore)) {
    if (localNonAdminCount === 0 && (cloudUserCount >= localTotalUsers || cloudScore >= localScore)) {
      importDatabaseSnapshot(db, cloudSnapshot, { mode: 'replace' });
      lastSyncAt = cloudSnapshot.exportedAt || new Date().toISOString();
      console.log(`[CLOUD SYNC] Auto-restored ${cloudUserCount} users and full database from ${activeDriver} (rev ${localRevision}).`);
      return;
    }
    if (cloudUserCount > localTotalUsers || cloudScore > localScore) {
      importDatabaseSnapshot(db, cloudSnapshot, { mode: 'merge' });
      lastSyncAt = cloudSnapshot.exportedAt || new Date().toISOString();
      console.log(`[CLOUD SYNC] Auto-merged richer cloud state (${cloudUserCount} cloud users) into local DB (rev ${localRevision}).`);
      await pushSnapshotToCloud({ force: true });
      return;
    }
  }

  if (localTotalUsers > 0 && (!cloudSnapshot || localScore > cloudScore || localTotalUsers > cloudUserCount)) {
    await pushSnapshotToCloud({ force: true });
  }
}

export async function initCloudPersistence(db) {
  dbRef = db;
  await initRemoteDriver();

  if (activeDriver !== 'none') {
    try {
      await reconcileStartupState(db);
    } catch (err) {
      lastSyncError = `Startup restore failed: ${err.message}`;
      console.error('[CLOUD SYNC BOOT ERROR]', err.message);
    }
  } else {
    const rawEnvDbFile = (process.env.DB_FILE || '').trim();
    const isPersistentDisk =
      DB_FILE.startsWith('/var/data') ||
      DB_FILE.startsWith('/data') ||
      (Boolean(rawEnvDbFile) && path.isAbsolute(rawEnvDbFile)) ||
      fs.existsSync('/var/data') ||
      fs.existsSync('/data');
    if (!isPersistentDisk) {
      console.warn('[PERSISTENCE WARNING] Running on ephemeral local disk without DATABASE_URL / TURSO_DATABASE_URL / Persistent Disk. Set DATABASE_URL in Render Environment Variables to prevent data loss on redeploys.');
    }
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  registerMutationListener(() => {
    scheduleCloudSync(300);
  });

  if (safetyInterval) clearInterval(safetyInterval);
  if (minuteBackupInterval) clearInterval(minuteBackupInterval);
  if (!isServerless) {
    safetyInterval = setInterval(() => {
      if (dirty && activeDriver !== 'none') {
        pushSnapshotToCloud().catch(() => {});
      }
    }, 30000);

    minuteBackupInterval = setInterval(() => {
      runMinuteBackupCycle().catch(() => {});
    }, 60 * 1000);
  }
}

export async function shutdownCloudPersistence() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (safetyInterval) {
    clearInterval(safetyInterval);
    safetyInterval = null;
  }
  if (minuteBackupInterval) {
    clearInterval(minuteBackupInterval);
    minuteBackupInterval = null;
  }
  if (dbRef) {
    await runMinuteBackupCycle({ forceSync: activeDriver !== 'none' }).catch(() => {});
  }
  if (pgPool) {
    await pgPool.end().catch(() => {});
  }
}

export function getPersistenceStatus(db = dbRef) {
  const rawEnvDbFile = (process.env.DB_FILE || '').trim();
  const isPersistentDisk =
    !DB_FILE.startsWith('/tmp/') && (
      DB_FILE.startsWith('/var/data') ||
      DB_FILE.startsWith('/data') ||
      (Boolean(rawEnvDbFile) && path.isAbsolute(rawEnvDbFile))
    );
  const durable = activeDriver !== 'none' || isPersistentDisk;

  const counts = {
    users: 0,
    nonAdminUsers: 0,
    trades: 0,
    binary_trades: 0,
    spot_orders: 0,
    ai_trade_sessions: 0,
    ai_trade_history: 0,
    payment_requests: 0,
    verifications: 0,
    activity_logs: 0,
    notifications: 0,
    promotions: 0,
    promotion_claims: 0,
    bonus_locks: 0,
    ib_levels: 0,
    ib_commission_ledger: 0,
    totalBalance: 0
  };
  if (db) {
    try {
      counts.users = db.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0;
      counts.nonAdminUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get()?.c || 0;
      counts.trades = db.prepare('SELECT COUNT(*) AS c FROM trades').get()?.c || 0;
      counts.binary_trades = db.prepare('SELECT COUNT(*) AS c FROM binary_trades').get()?.c || 0;
      counts.spot_orders = db.prepare('SELECT COUNT(*) AS c FROM spot_orders').get()?.c || 0;
      counts.ai_trade_sessions = db.prepare('SELECT COUNT(*) AS c FROM ai_trade_sessions').get()?.c || 0;
      counts.ai_trade_history = db.prepare('SELECT COUNT(*) AS c FROM ai_trade_history').get()?.c || 0;
      counts.payment_requests = db.prepare('SELECT COUNT(*) AS c FROM payment_requests').get()?.c || 0;
      counts.verifications = db.prepare('SELECT COUNT(*) AS c FROM verifications').get()?.c || 0;
      counts.activity_logs = db.prepare('SELECT COUNT(*) AS c FROM activity_logs').get()?.c || 0;
      counts.notifications = db.prepare('SELECT COUNT(*) AS c FROM notifications').get()?.c || 0;
      counts.promotions = db.prepare('SELECT COUNT(*) AS c FROM promotions').get()?.c || 0;
      counts.promotion_claims = db.prepare('SELECT COUNT(*) AS c FROM promotion_claims').get()?.c || 0;
      counts.bonus_locks = db.prepare('SELECT COUNT(*) AS c FROM bonus_locks').get()?.c || 0;
      counts.ib_levels = db.prepare('SELECT COUNT(*) AS c FROM ib_levels').get()?.c || 0;
      counts.ib_commission_ledger = db.prepare('SELECT COUNT(*) AS c FROM ib_commission_ledger').get()?.c || 0;
      counts.totalBalance = db.prepare('SELECT IFNULL(SUM(available + locked), 0) AS s FROM balances').get()?.s || 0;
    } catch (_) {}
  }

  return {
    durable,
    driver: activeDriver !== 'none' ? activeDriver : (isPersistentDisk ? 'persistent_disk' : 'ephemeral_local'),
    dbFile: DB_FILE,
    hasDatabaseUrl: Boolean(DATABASE_URL),
    hasTursoUrl: Boolean(TURSO_DATABASE_URL),
    pendingSync: dirty,
    lastSyncAt,
    lastSyncError,
    lastCloudBackupAt,
    lastCloudBackupHash,
    lastBackupError,
    cloudBackupCount,
    cloudBlobCount,
    backupIntervalSeconds: 60,
    localBackup: getLocalBackupStatus(),
    lastKnownCloudUserCount,
    localRevision,
    counts
  };
}
