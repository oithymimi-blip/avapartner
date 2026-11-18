import fs from 'fs';
import zlib from 'zlib';
import pg from 'pg';
import { createClient as createLibsqlClient } from '@libsql/client';
import { DB_FILE, DATABASE_URL, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } from './config.js';
import { registerMutationListener } from './db.js';
import { ensureIBSchemaAndDefaults } from './ib/ibConfig.js';
import { ensurePromotionsSchemaAndDefaults } from './promotions/defaults.js';

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
let dirty = false;
let isRestoring = false;
let lastSyncAt = null;
let lastSyncError = null;
let lastKnownCloudUserCount = 0;
let localRevision = 0;

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
      idleTimeoutMillis: 30000
    };
  } catch {
    const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
    return {
      connectionString: rawUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000
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

      for (const table of ['ib_settings', 'ib_program_config', 'bonus_system_settings']) {
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
          } else if (table === 'activity_logs') {
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
            const dup = db.prepare('SELECT id FROM notifications WHERE user_id = ? AND title = ? AND COALESCE(created_at, \'\') = ?')
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
      return { ok: true, mode: 'replace', userCount: snapshot.data.users?.length || 0 };
    }
    const stats = mergeSnapshot(db, snapshot);
    ensureIBSchemaAndDefaults(db);
    ensurePromotionsSchemaAndDefaults(db, { skipPromoSeed: Array.isArray(snapshot.data.promotions) });
    return { ok: true, mode: 'merge', ...stats };
  } finally {
    isRestoring = false;
  }
}

async function initRemoteDriver() {
  if (DATABASE_URL) {
    try {
      pgPool = new Pool(buildPgPoolConfig(DATABASE_URL));
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
      activeDriver = 'postgres';
      console.log('[CLOUD SYNC] Connected to persistent PostgreSQL (DATABASE_URL).');
      return;
    } catch (err) {
      lastSyncError = `PostgreSQL connection failed: ${err.message}`;
      console.error('[CLOUD SYNC ERROR]', lastSyncError);
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
      activeDriver = 'turso';
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

export async function pushSnapshotToCloud({ force = false } = {}) {
  if (activeDriver === 'none' || !dbRef) return { synced: false, reason: 'No external cloud DB configured' };

  try {
    // Check for concurrent rolling-deploy updates from another container
    const remoteMeta = await getRemoteMeta();
    const remoteRev = Number(remoteMeta?.revision || 0);
    const remoteUsers = Number(remoteMeta?.user_count || 0);
    if (remoteUsers > lastKnownCloudUserCount) lastKnownCloudUserCount = remoteUsers;

    if (!force && remoteRev > localRevision) {
      const newerCloudSnap = await readCloudStateRow();
      if (newerCloudSnap?.data) {
        importDatabaseSnapshot(dbRef, newerCloudSnap, { mode: 'merge' });
      }
    }

    const snapshot = exportDatabaseSnapshot(dbRef);
    const localUserCount = snapshot.userCount;

    // Guard: never overwrite a populated cloud backup with a blank freshly-booted container
    if (!force && lastKnownCloudUserCount > 1 && localUserCount <= 1) {
      return { synced: false, reason: 'Refused to overwrite populated cloud backup with fresh single-admin DB' };
    }

    const encoded = encodeSnapshot(snapshot);
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

export function scheduleCloudSync(delayMs = 300) {
  if (isRestoring) return;
  dirty = true;
  if (activeDriver === 'none') return;
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

export async function initCloudPersistence(db) {
  dbRef = db;
  await initRemoteDriver();

  if (activeDriver !== 'none') {
    try {
      const cloudSnapshot = await readCloudStateRow();
      const localNonAdminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get()?.c || 0;
      const localTotalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0;
      const cloudScore = cloudSnapshot?.data ? getSnapshotRichnessScore(cloudSnapshot.data) : 0;
      const localScore = getLocalRichnessScore(db);

      if (cloudSnapshot?.data?.users?.length > 0 && (localNonAdminCount === 0 || cloudSnapshot.data.users.length > localTotalUsers || cloudScore > localScore)) {
        importDatabaseSnapshot(db, cloudSnapshot, { mode: 'replace' });
        lastSyncAt = cloudSnapshot.exportedAt || new Date().toISOString();
        console.log(`[CLOUD SYNC] Auto-restored ${cloudSnapshot.data.users.length} users and full database from ${activeDriver} (rev ${localRevision}).`);
      } else if (localTotalUsers > 0 && !cloudSnapshot) {
        await pushSnapshotToCloud({ force: true });
      }
    } catch (err) {
      lastSyncError = `Startup restore failed: ${err.message}`;
      console.error('[CLOUD SYNC BOOT ERROR]', err.message);
    }
  } else {
    const isPersistentDisk = Boolean(process.env.DB_FILE) || fs.existsSync('/var/data') || fs.existsSync('/data');
    if (!isPersistentDisk) {
      console.warn('[PERSISTENCE WARNING] Running on ephemeral local disk without DATABASE_URL / TURSO_DATABASE_URL / Persistent Disk. Set DATABASE_URL in Render Environment Variables to prevent data loss on redeploys.');
    }
  }

  registerMutationListener(() => {
    scheduleCloudSync(300);
  });

  if (safetyInterval) clearInterval(safetyInterval);
  safetyInterval = setInterval(() => {
    if (dirty && activeDriver !== 'none') {
      pushSnapshotToCloud().catch(() => {});
    }
  }, 30000);
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
  if (activeDriver !== 'none' && dbRef) {
    await pushSnapshotToCloud().catch(() => {});
  }
  if (pgPool) {
    await pgPool.end().catch(() => {});
  }
}

export function getPersistenceStatus(db = dbRef) {
  const isPersistentDisk = DB_FILE.startsWith('/var/data') || DB_FILE.startsWith('/data') || Boolean(process.env.DB_FILE && !DB_FILE.startsWith('./'));
  const durable = activeDriver !== 'none' || isPersistentDisk;

  let counts = { users: 0, trades: 0, payment_requests: 0, totalBalance: 0 };
  if (db) {
    try {
      counts.users = db.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0;
      counts.trades = db.prepare('SELECT COUNT(*) AS c FROM trades').get()?.c || 0;
      counts.payment_requests = db.prepare('SELECT COUNT(*) AS c FROM payment_requests').get()?.c || 0;
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
    lastKnownCloudUserCount,
    counts
  };
}
