import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import zlib from 'zlib';

const PORT = Number(process.env.PORT || 3000);
const TARGET_API_URL = (process.env.TARGET_API_URL || 'https://avapartner.up.railway.app').replace(/\/+$/, '');
const CRON_SECRET = (process.env.CRON_SECRET || '').trim();
const BACKUP_DIR = (process.env.BACKUP_DIR || '').trim() || (
  fs.existsSync('/var/data') ? '/var/data/mirror' : path.resolve('./mirror')
);
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 60000);

const state = {
  ok: true,
  startedAt: new Date().toISOString(),
  targetApiUrl: TARGET_API_URL,
  backupDir: BACKUP_DIR,
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastRemoteHash: null,
  lastSavedHash: null,
  lastCounts: null,
  consecutiveFailures: 0,
  totalRuns: 0,
  totalSuccesses: 0,
  mirrorSnapshotFiles: 0,
  inFlight: false
};

function ensureDirs() {
  const snapshotsDir = path.join(BACKUP_DIR, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  return snapshotsDir;
}

function countMirrorFiles(snapshotsDir) {
  try {
    return fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json.gz')).length;
  } catch {
    return 0;
  }
}

function writeOffsiteMirror(snapshot, hash, counts = {}) {
  const snapshotsDir = ensureDirs();
  const payload = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const gz = zlib.gzipSync(payload);
  const nowIso = new Date().toISOString();
  const safeTs = nowIso.replace(/[:.]/g, '-');

  const latestPath = path.join(BACKUP_DIR, 'latest-snapshot.json.gz');
  const tmpPath = path.join(BACKUP_DIR, `.latest-tmp-${process.pid}.json.gz`);
  fs.writeFileSync(tmpPath, gz);
  fs.renameSync(tmpPath, latestPath);

  const changed = hash !== state.lastSavedHash;
  if (changed) {
    const snapFile = path.join(snapshotsDir, `snapshot-${safeTs}-${String(hash).slice(0, 8)}.json.gz`);
    fs.writeFileSync(snapFile, gz);
    state.lastSavedHash = hash;
  }

  const historyLine = JSON.stringify({
    ts: nowIso,
    hash,
    changed,
    users: counts.users ?? snapshot?.userCount ?? 0,
    totalBalance: counts.totalBalance ?? 0,
    trades: counts.trades ?? 0,
    activities: counts.activity_logs ?? 0,
    bytes: gz.length
  }) + '\n';
  fs.appendFileSync(path.join(BACKUP_DIR, 'mirror-history.jsonl'), historyLine);

  state.mirrorSnapshotFiles = countMirrorFiles(snapshotsDir);
  return { changed, bytes: gz.length, mirrorSnapshotFiles: state.mirrorSnapshotFiles };
}

async function runBackupTick() {
  if (state.inFlight) return;
  if (!CRON_SECRET) {
    state.lastError = 'CRON_SECRET is not configured';
    state.lastRunAt = new Date().toISOString();
    console.error('[BACKUP WORKER] Missing CRON_SECRET env var');
    return;
  }

  state.inFlight = true;
  state.totalRuns += 1;
  state.lastRunAt = new Date().toISOString();

  try {
    const url = `${TARGET_API_URL}/api/internal/minute-backup?snapshot=1`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ source: 'railway-minute-worker' }),
      signal: AbortSignal.timeout(25000)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    const remoteHash =
      data?.backup?.hash ||
      crypto.createHash('sha256').update(JSON.stringify(data?.snapshot?.data || {})).digest('hex');

    let mirrorRes = { changed: false, bytes: 0 };
    if (data?.snapshot?.data) {
      mirrorRes = writeOffsiteMirror(data.snapshot, remoteHash, data?.status?.counts || {});
    }

    state.lastSuccessAt = new Date().toISOString();
    state.lastError = null;
    state.lastRemoteHash = remoteHash;
    state.lastCounts = data?.status?.counts || null;
    state.consecutiveFailures = 0;
    state.totalSuccesses += 1;

    console.log(
      `[MINUTE BACKUP WORKER] OK users=${data?.status?.counts?.users ?? '?'} balance=${data?.status?.counts?.totalBalance ?? '?'} driver=${data?.status?.driver ?? '?'} hash=${String(remoteHash).slice(0, 8)} mirrorChanged=${mirrorRes.changed} mirrorFiles=${state.mirrorSnapshotFiles}`
    );
  } catch (err) {
    state.consecutiveFailures += 1;
    state.lastError = err.message;
    console.error(`[MINUTE BACKUP WORKER] FAILED (#${state.consecutiveFailures}): ${err.message}`);
  } finally {
    state.inFlight = false;
  }
}

ensureDirs();
state.mirrorSnapshotFiles = countMirrorFiles(path.join(BACKUP_DIR, 'snapshots'));

function verifyCronSecret(req) {
  if (!CRON_SECRET) return false;
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided = String(req.headers['x-cron-secret'] || bearer || '');
  if (!provided || provided.length !== CRON_SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(CRON_SECRET, 'utf8'));
}

function readLatestMirrorSnapshot() {
  const latestPath = path.join(BACKUP_DIR, 'latest-snapshot.json.gz');
  let targetFile = latestPath;
  if (!fs.existsSync(targetFile)) {
    const snapsDir = path.join(BACKUP_DIR, 'snapshots');
    if (fs.existsSync(snapsDir)) {
      const files = fs.readdirSync(snapsDir).filter((f) => f.endsWith('.json.gz')).sort();
      if (files.length > 0) {
        targetFile = path.join(snapsDir, files[files.length - 1]);
      }
    }
  }
  if (!fs.existsSync(targetFile)) return null;
  const gz = fs.readFileSync(targetFile);
  const raw = zlib.gunzipSync(gz).toString('utf8');
  return { file: path.basename(targetFile), snapshot: JSON.parse(raw) };
}

const server = http.createServer((req, res) => {
  const reqPath = (req.url || '/').split('?')[0];

  if (reqPath === '/internal/mirror/latest') {
    if (!verifyCronSecret(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    try {
      const data = readLatestMirrorSnapshot();
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'No mirror snapshot available yet' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, ...data }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (reqPath === '/internal/mirror/list') {
    if (!verifyCronSecret(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    try {
      const snapsDir = ensureDirs();
      const files = fs.readdirSync(snapsDir).filter((f) => f.endsWith('.json.gz')).sort().reverse().slice(0, 50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, files }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'avapartner-backup-worker',
    ...state
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKUP WORKER] Listening on :${PORT} -> ${TARGET_API_URL} every ${INTERVAL_MS}ms (mirror: ${BACKUP_DIR})`);
  setTimeout(() => {
    runBackupTick().catch(() => {});
  }, 2000);
  const timer = setInterval(() => {
    runBackupTick().catch(() => {});
  }, INTERVAL_MS);

  const shutdown = (sig) => {
    console.log(`[BACKUP WORKER] ${sig} received, shutting down cleanly.`);
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[BACKUP WORKER] Unhandled rejection (kept alive):', reason?.message || reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[BACKUP WORKER] Uncaught exception (kept alive):', err?.message || err);
  });
});
