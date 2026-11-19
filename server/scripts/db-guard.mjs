import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import pg from 'pg';
import { createClient as createLibsqlClient } from '@libsql/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  DATABASE_URL,
  DB_FILE,
  TURSO_AUTH_TOKEN,
  TURSO_DATABASE_URL
} from '../src/config.js';
import { PERSISTENT_TABLES } from '../src/cloudPersistence.js';

const { Pool } = pg;

const BACKUP_ROOT = path.resolve(path.dirname(DB_FILE), 'backups');
const DEFAULT_BASELINE_PATH = path.join(BACKUP_ROOT, 'pre-deploy-baseline.json');

const CHECK_TABLES = [
  'users',
  'balances',
  'trades',
  'binary_trades',
  'spot_orders',
  'spot_balances',
  'ai_trade_sessions',
  'ai_trade_history',
  'copy_relationships',
  'payment_methods',
  'payment_requests',
  'verifications',
  'activity_logs',
  'notifications',
  'admin_notifications',
  'promotions',
  'promotion_claims',
  'bonus_locks',
  'ib_levels',
  'ib_commission_ledger',
  'user_deposit_wallets',
  'market_settings',
  'market_channels',
  'system_features'
];

// Tables whose counts should never decrease across an update or deploy
const NON_SHRINKING_TABLES = [
  'users',
  'trades',
  'binary_trades',
  'spot_orders',
  'ai_trade_history',
  'payment_methods',
  'payment_requests',
  'verifications',
  'activity_logs',
  'notifications',
  'promotions',
  'promotion_claims',
  'ib_commission_ledger',
  'user_deposit_wallets',
  'market_settings',
  'market_channels',
  'system_features'
];

function parseArgs(argv) {
  const args = { cmd: argv[2] || 'check', apiUrl: process.env.API_URL || '', baselinePath: DEFAULT_BASELINE_PATH };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === '--api' && argv[i + 1]) {
      args.apiUrl = argv[i + 1].replace(/\/+$/, '');
      i += 1;
    } else if (argv[i] === '--baseline' && argv[i + 1]) {
      args.baselinePath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function inspectLocalSqlite(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return { exists: false, dbPath, error: `Database file not found: ${dbPath}` };
  }
  const stat = fs.statSync(dbPath);
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = sqlite.pragma('quick_check', { simple: true });
    const existingTables = new Set(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    const counts = {};
    for (const table of CHECK_TABLES) {
      counts[table] = existingTables.has(table)
        ? Number(sqlite.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get()?.c || 0)
        : 0;
    }
    const nonAdminUsers = existingTables.has('users')
      ? Number(sqlite.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get()?.c || 0)
      : 0;
    const totalBalance = existingTables.has('balances')
      ? Number(sqlite.prepare('SELECT IFNULL(SUM(available + locked), 0) AS s FROM balances').get()?.s || 0)
      : 0;

    return {
      exists: true,
      dbPath,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      quickCheck,
      nonAdminUsers,
      totalBalance: Number(totalBalance.toFixed(6)),
      counts
    };
  } finally {
    sqlite.close();
  }
}

async function inspectCloudDb() {
  if (DATABASE_URL) {
    let pool = null;
    try {
      const u = new URL(DATABASE_URL);
      const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      u.searchParams.delete('sslmode');
      u.searchParams.delete('channel_binding');
      pool = new Pool({
        connectionString: u.toString(),
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 2,
        connectionTimeoutMillis: 10000
      });
      const stateRes = await pool.query('SELECT user_count, revision, updated_at FROM avapartner_cloud_state WHERE id = $1', ['primary']);
      let backupCount = 0;
      let latestBackup = null;
      try {
        const bRes = await pool.query('SELECT COUNT(*) AS c FROM avapartner_cloud_backups');
        backupCount = Number(bRes.rows[0]?.c || 0);
        const lRes = await pool.query('SELECT minute_bucket, user_count, total_balance, created_at FROM avapartner_cloud_backups ORDER BY id DESC LIMIT 1');
        latestBackup = lRes.rows[0] || null;
      } catch (_) {}
      return {
        configured: true,
        driver: 'postgres',
        primary: stateRes.rows[0] || null,
        backupCount,
        latestBackup
      };
    } catch (err) {
      return { configured: true, driver: 'postgres', error: err.message };
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  }

  if (TURSO_DATABASE_URL) {
    try {
      const client = createLibsqlClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN || undefined
      });
      const stateRes = await client.execute({
        sql: 'SELECT user_count, revision, updated_at FROM avapartner_cloud_state WHERE id = ?',
        args: ['primary']
      });
      let backupCount = 0;
      let latestBackup = null;
      try {
        const bRes = await client.execute('SELECT COUNT(*) AS c FROM avapartner_cloud_backups');
        backupCount = Number(bRes.rows[0]?.c || 0);
        const lRes = await client.execute('SELECT minute_bucket, user_count, total_balance, created_at FROM avapartner_cloud_backups ORDER BY id DESC LIMIT 1');
        latestBackup = lRes.rows[0] || null;
      } catch (_) {}
      return {
        configured: true,
        driver: 'turso',
        primary: stateRes.rows[0] || null,
        backupCount,
        latestBackup
      };
    } catch (err) {
      return { configured: true, driver: 'turso', error: err.message };
    }
  }

  return { configured: false, driver: 'none' };
}

async function inspectLiveApi(apiUrl) {
  if (!apiUrl) return null;
  try {
    const healthRes = await fetch(`${apiUrl}/api/health`);
    const health = await healthRes.json();
    let adminStatus = null;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      const loginRes = await fetch(`${apiUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        if (loginData?.token) {
          const statusRes = await fetch(`${apiUrl}/api/admin/backup/status`, {
            headers: { Authorization: `Bearer ${loginData.token}` }
          });
          if (statusRes.ok) {
            adminStatus = await statusRes.json();
          }
        }
      }
    }
    return { ok: healthRes.ok, health, adminStatus };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function exportSnapshotReadOnly(dbPath) {
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const existingTables = new Set(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    const data = {};
    for (const table of PERSISTENT_TABLES) {
      data[table] = existingTables.has(table)
        ? sqlite.prepare(`SELECT * FROM "${table}"`).all()
        : [];
    }
    const userCount = Array.isArray(data.users) ? data.users.length : 0;
    return {
      version: 1,
      app: 'avapartner',
      exportedAt: new Date().toISOString(),
      userCount,
      data
    };
  } finally {
    sqlite.close();
  }
}

async function createPreDeployBackup(dbPath) {
  const preDeployDir = path.join(BACKUP_ROOT, 'pre-deploy');
  fs.mkdirSync(preDeployDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destDb = path.join(preDeployDir, `data-pre-deploy-${stamp}.db`);
  const destJsonGz = path.join(preDeployDir, `snapshot-pre-deploy-${stamp}.json.gz`);

  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await sqlite.backup(destDb);
  } finally {
    sqlite.close();
  }

  const snapshot = exportSnapshotReadOnly(dbPath);
  const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot.data)).digest('hex');
  const gzBuf = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'));
  fs.writeFileSync(destJsonGz, gzBuf);

  return { destDb, destJsonGz, hash, userCount: snapshot.userCount };
}

function printReport(report) {
  console.log('==========================================================');
  console.log(`AvaPartner Database Guard Report (${report.checkedAt})`);
  console.log('==========================================================');
  if (report.local.exists) {
    console.log(`SQLite DB:       ${report.local.dbPath}`);
    console.log(`Integrity Check: ${report.local.quickCheck} (${report.local.bytes} bytes)`);
    console.log(`Total Users:     ${report.local.counts.users} (Non-admin: ${report.local.nonAdminUsers})`);
    console.log(`Total Balances:  $${Number(report.local.totalBalance || 0).toFixed(2)}`);
    console.log(`Trades:          FX=${report.local.counts.trades}, Binary=${report.local.counts.binary_trades}, Spot=${report.local.counts.spot_orders}`);
    console.log(`AI Trade:        Sessions=${report.local.counts.ai_trade_sessions}, History=${report.local.counts.ai_trade_history}`);
    console.log(`Payments/KYC:    Requests=${report.local.counts.payment_requests}, Verifications=${report.local.counts.verifications}, Wallets=${report.local.counts.user_deposit_wallets}`);
    console.log(`Promos/IB:       Promos=${report.local.counts.promotions}, Claims=${report.local.counts.promotion_claims}, Locks=${report.local.counts.bonus_locks}, IB Ledger=${report.local.counts.ib_commission_ledger}`);
    console.log(`Activities/Notif: Logs=${report.local.counts.activity_logs}, Notifications=${report.local.counts.notifications}`);
  } else {
    console.log(`SQLite DB:       MISSING (${report.local.error})`);
  }

  if (report.cloud.configured) {
    if (report.cloud.error) {
      console.log(`Cloud DB (${report.cloud.driver}): ERROR - ${report.cloud.error}`);
    } else {
      console.log(`Cloud DB (${report.cloud.driver}): Primary Users=${report.cloud.primary?.user_count ?? 'none'}, Rev=${report.cloud.primary?.revision ?? 0}, Minute Checkpoints=${report.cloud.backupCount}`);
    }
  } else {
    console.log('Cloud DB:        Not configured in local .env (using local SQLite / persistent disk)');
  }

  if (report.liveApi) {
    if (report.liveApi.error) {
      console.log(`Live API:        ERROR - ${report.liveApi.error}`);
    } else {
      console.log(`Live API Health: ok=${report.liveApi.health?.ok}, durable=${report.liveApi.health?.durableStorage}, driver=${report.liveApi.health?.storageDriver}`);
      if (report.liveApi.adminStatus) {
        const c = report.liveApi.adminStatus.counts || {};
        console.log(`Live API Counts: Users=${c.users}, Balance=$${Number(c.totalBalance || 0).toFixed(2)}, Trades=${c.trades}, Payments=${c.payment_requests}, Logs=${c.activity_logs}`);
      }
    }
  }
  console.log('==========================================================');
}

function compareReports(baseline, current, { apiOnly = false } = {}) {
  const failures = [];

  if (!apiOnly) {
    if (!current.local.exists) {
      failures.push(`Local database file vanished: ${current.local.dbPath}`);
      return failures;
    }
    if (current.local.quickCheck !== 'ok') {
      failures.push(`SQLite integrity check failed: ${current.local.quickCheck}`);
    }

    if (baseline?.local?.exists) {
      for (const table of NON_SHRINKING_TABLES) {
        const prev = Number(baseline.local.counts?.[table] || 0);
        const curr = Number(current.local.counts?.[table] || 0);
        if (curr < prev) {
          failures.push(`Table "${table}" shrank from ${prev} to ${curr} rows!`);
        }
      }
      const prevBal = Number(baseline.local.totalBalance || 0);
      const currBal = Number(current.local.totalBalance || 0);
      if (prevBal > 0 && currBal === 0) {
        failures.push(`Total user balances dropped from $${prevBal.toFixed(2)} to $0.00!`);
      }
    }
  }

  if (baseline?.cloud?.primary && current.cloud?.primary) {
    const prevCloudUsers = Number(baseline.cloud.primary.user_count || 0);
    const currCloudUsers = Number(current.cloud.primary.user_count || 0);
    if (currCloudUsers < prevCloudUsers) {
      failures.push(`Cloud primary user_count shrank from ${prevCloudUsers} to ${currCloudUsers}!`);
    }
  }

  if (current.liveApi) {
    if (!current.liveApi.ok) {
      failures.push(`Live API health check failed: ${current.liveApi.error || 'unhealthy'}`);
    } else if (baseline?.liveApi?.adminStatus?.counts && current.liveApi.adminStatus?.counts) {
      const b = baseline.liveApi.adminStatus.counts;
      const c = current.liveApi.adminStatus.counts;
      for (const k of ['users', 'trades', 'binary_trades', 'spot_orders', 'payment_requests', 'verifications', 'activity_logs']) {
        if (Number(c[k] || 0) < Number(b[k] || 0)) {
          failures.push(`Live API "${k}" shrank from ${b[k]} to ${c[k]}!`);
        }
      }
      if (Number(b.totalBalance || 0) > 0 && Number(c.totalBalance || 0) === 0) {
        failures.push(`Live API totalBalance dropped from $${Number(b.totalBalance).toFixed(2)} to $0.00!`);
      }
    }
  }

  return failures;
}

async function main() {
  const args = parseArgs(process.argv);
  const local = inspectLocalSqlite(DB_FILE);
  const cloud = await inspectCloudDb();
  const liveApi = await inspectLiveApi(args.apiUrl);
  const apiOnly = Boolean(args.apiUrl) && !local.exists;

  const report = {
    checkedAt: new Date().toISOString(),
    local,
    cloud,
    liveApi
  };

  printReport(report);

  if (args.cmd === 'check') {
    if (cloud.configured && cloud.error) {
      console.error(`Cloud DB check failed: ${cloud.error}`);
      process.exit(1);
    }
    if (args.apiUrl && !liveApi?.ok) {
      console.error(`Live API check failed: ${liveApi?.error || 'unhealthy'}`);
      process.exit(1);
    }
    if (!apiOnly && (!local.exists || local.quickCheck !== 'ok')) {
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(args.baselinePath), { recursive: true });
    fs.writeFileSync(args.baselinePath, JSON.stringify(report, null, 2));
    console.log(`Baseline saved to ${args.baselinePath}`);
    return;
  }

  if (args.cmd === 'backup') {
    if (!local.exists || local.quickCheck !== 'ok') {
      console.error('Refusing backup: local database missing or failed integrity check.');
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(args.baselinePath), { recursive: true });
    fs.writeFileSync(args.baselinePath, JSON.stringify(report, null, 2));
    const backupRes = await createPreDeployBackup(DB_FILE);
    console.log(`Pre-deploy SQLite backup: ${backupRes.destDb}`);
    console.log(`Pre-deploy JSON backup:   ${backupRes.destJsonGz}`);
    console.log(`Snapshot SHA-256:         ${backupRes.hash} (${backupRes.userCount} users)`);
    return;
  }

  if (args.cmd === 'verify-post') {
    if (!fs.existsSync(args.baselinePath)) {
      console.error(`Missing pre-deploy baseline file: ${args.baselinePath}. Run "npm run db:check" before deploying!`);
      process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(args.baselinePath, 'utf8'));
    const failures = compareReports(baseline, report, { apiOnly });
    if (failures.length > 0) {
      console.error('POST-DEPLOY DATA VERIFICATION FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log('POST-DEPLOY VERIFICATION PASSED: All tables, users, balances, and activities intact.');
    return;
  }

  console.error(`Unknown command: ${args.cmd}. Use: check | backup | verify-post`);
  process.exit(1);
}

main().catch((err) => {
  console.error('DB GUARD FATAL:', err);
  process.exit(1);
});
