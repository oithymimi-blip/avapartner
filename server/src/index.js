import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PORT, CORS_ORIGINS, JWT_SECRET } from './config.js';
import authRoutes, { ensureAdmin } from './auth/authRoutes.js';
import userRoutes from './users/routes.js';
import marketRoutes from './market/routes.js';
import tradeRoutes from './trades/routes.js';
import adminRoutes from './admin/routes.js';
import notificationRoutes from './notifications/routes.js';
import binaryRoutes from './binary/routes.js';
import spotRoutes from './spot/routes.js';
import copytradingRoutes from './copytrading/routes.js';
import { paymentsRouter, adminPaymentsRouter } from './payments/routes.js';
import { checkMissedDeposits, initCryptoService } from './payments/cryptoService.js';
import securityRoutes from './security/routes.js';
import aiTradeRoutes from './aitrade/routes.js';
import { initAITradeEngine, runAITradeCycleNow } from './aitrade/earningsEngine.js';
import ibRoutes from './ib/routes.js';
import { checkMonthlyIBBonuses, initMonthlyIBScheduler } from './ib/monthlyScheduler.js';
import { promotionsRouter, adminPromotionsRouter } from './promotions/routes.js';
import locationsRoutes from './locations/routes.js';
import db from './db.js';
import {
  ensureLatestFromCloud,
  exportDatabaseSnapshot,
  flushIfDirty,
  getPersistenceStatus,
  hasPendingCloudSync,
  initCloudPersistence,
  runMinuteBackupCycle,
  shutdownCloudPersistence
} from './cloudPersistence.js';
import { attachIO, runMarketPriceSyncOnce, startMarketBackgroundLoops, tickOnce } from './market/engine.js';

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
let initPromise = null;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await initCloudPersistence(db);
      ensureAdmin();
      initCryptoService();
      if (!IS_SERVERLESS) {
        initAITradeEngine();
        initMonthlyIBScheduler();
        startMarketBackgroundLoops();
        setInterval(() => {
          try {
            tickOnce();
          } catch (e) {
            console.error('tick error:', e);
          }
        }, 1000);
        await runMinuteBackupCycle({ createArchive: false }).catch(() => {});
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const HAS_CLIENT_DIST = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

const app = express();
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
// Allow larger JSON bodies so base64 document/selfie/backup uploads are accepted.
app.use(express.json({ limit: '50mb' }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (
      CORS_ORIGINS.includes(origin) ||
      origin === 'https://avapartner.app' ||
      origin === 'https://www.avapartner.app' ||
      origin === 'https://avapartner.up.railway.app' ||
      origin.endsWith('.vercel.app')
    ) {
      return cb(null, true);
    }
    cb(null, true); // fallback: allow all
  },
  credentials: true
}));

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    if (IS_SERVERLESS && !req.path.startsWith('/api/internal/') && !req.path.startsWith('/socket.io')) {
      await ensureLatestFromCloud();
    }
  } catch (err) {
    return next(err);
  }

  if (!IS_SERVERLESS || req.path === '/api/internal/minute-backup') {
    return next();
  }

  const origSend = res.send.bind(res);
  const origRedirect = res.redirect.bind(res);
  let flushing = false;

  res.send = function wrappedSend(body) {
    if (flushing || !hasPendingCloudSync()) {
      return origSend(body);
    }
    flushing = true;
    flushIfDirty()
      .catch((err) => console.error('[CLOUD FLUSH ERROR]', err.message))
      .finally(() => {
        if (!res.headersSent) {
          origSend(body);
        }
      });
    return res;
  };

  res.redirect = function wrappedRedirect(...args) {
    if (flushing || !hasPendingCloudSync()) {
      return origRedirect(...args);
    }
    flushing = true;
    flushIfDirty()
      .catch((err) => console.error('[CLOUD FLUSH ERROR]', err.message))
      .finally(() => {
        if (!res.headersSent) {
          origRedirect(...args);
        }
      });
    return res;
  };

  next();
});

const buildHealthPayload = () => {
  const status = getPersistenceStatus(db);
  return {
    ok: true,
    service: 'otc-market',
    durableStorage: status.durable,
    storageDriver: status.driver,
    backupIntervalSeconds: status.backupIntervalSeconds,
    lastSyncAt: status.lastSyncAt,
    lastCloudBackupAt: status.lastCloudBackupAt,
    lastLocalBackupAt: status.localBackup?.lastLocalBackupAt || null,
    hasData: (status.counts?.users || 0) > 0,
    timestamp: Date.now()
  };
};

app.get('/api/health', (req, res) => {
  res.json(buildHealthPayload());
});
app.get('/health', (req, res) => {
  res.json(buildHealthPayload());
});

if (HAS_CLIENT_DIST) {
  const indexHtmlPath = path.join(CLIENT_DIST, 'index.html');
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/socket.io/') &&
      req.path !== '/health' &&
      !req.headers.authorization &&
      (req.headers.accept || '').includes('text/html') &&
      !/\.[a-zA-Z0-9]{1,8}$/.test(req.path)
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(indexHtmlPath);
    }
    return next();
  });

  app.get('/AvaPartner_Company_Profile.pdf', (req, res, next) => {
    const pdfPath = path.join(CLIENT_DIST, 'AvaPartner_Company_Profile.pdf');
    if (!fs.existsSync(pdfPath)) return next();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="AvaPartner_Company_Profile.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(pdfPath);
  });

  app.use(express.static(CLIENT_DIST, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('manifest.json')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
}

app.get('/', (req, res) => res.json({ ok: true, name: 'OTC Market Server' }));

// Dual route mounts for fail-safe Nginx proxy compatibility
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

app.use('/api/payments', paymentsRouter);
app.use('/payments', paymentsRouter);

app.use('/api/admin/payments', adminPaymentsRouter);
app.use('/admin/payments', adminPaymentsRouter);

app.use('/api/notifications', notificationRoutes);
app.use('/notifications', notificationRoutes);

app.use('/api/market', marketRoutes);
app.use('/market', marketRoutes);

app.use('/api/trades', tradeRoutes);
app.use('/trades', tradeRoutes);

app.use('/api/binary-trades', binaryRoutes);
app.use('/binary-trades', binaryRoutes);

app.use('/api/spot', spotRoutes);
app.use('/spot', spotRoutes);

app.use('/api/copytrading', copytradingRoutes);
app.use('/copytrading', copytradingRoutes);

app.use('/api/security', securityRoutes);
app.use('/security', securityRoutes);

app.use('/api/ai-trade', aiTradeRoutes);
app.use('/ai-trade', aiTradeRoutes);

app.use('/api/ib', ibRoutes);
app.use('/ib', ibRoutes);

app.use('/api/promotions', promotionsRouter);
app.use('/promotions', promotionsRouter);

app.use('/api/admin/promotions', adminPromotionsRouter);
app.use('/admin/promotions', adminPromotionsRouter);

app.use('/api/locations', locationsRoutes);
app.use('/locations', locationsRoutes);

app.use('/api', userRoutes);
app.use('/', userRoutes);

app.get('/api/features', (req, res) => {
  const features = db.prepare('SELECT * FROM system_features ORDER BY key').all();
  res.json(features);
});

function verifyCronSecret(req) {
  const expected = process.env.CRON_SECRET || JWT_SECRET;
  if (!expected) return false;
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided = String(req.headers['x-cron-secret'] || bearer || req.query.secret || '');
  if (!provided || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}

app.all('/api/internal/minute-backup', async (req, res) => {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await ensureInitialized();
    if (IS_SERVERLESS) {
      await ensureLatestFromCloud();
      runAITradeCycleNow({ runTick: true });
      checkMonthlyIBBonuses();
      await runMarketPriceSyncOnce({ force: true, includeYahoo: true }).catch(() => {});
      await Promise.race([
        checkMissedDeposits().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 6000))
      ]);
    }
    const backup = await runMinuteBackupCycle({ createArchive: IS_SERVERLESS ? false : null });
    const status = getPersistenceStatus(db);
    const includeSnapshot = String(req.query.snapshot || '') === '1';
    res.json({
      ok: Boolean(backup?.ok ?? true),
      backup,
      status,
      ...(includeSnapshot ? { snapshot: exportDatabaseSnapshot(db) } : {})
    });
  } catch (err) {
    console.error('[INTERNAL MINUTE BACKUP ERROR]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

if (HAS_CLIENT_DIST) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
      return next();
    }
    if (/\.[a-zA-Z0-9]{1,8}$/.test(req.path)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});
attachIO(io);

io.on('connection', (socket) => {
  // nothing special; market engine emits to "io" directly for broadcast
});

let shuttingDown = false;
async function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] ${signal} received, flushing database to cloud storage...`);
  try {
    await shutdownCloudPersistence();
  } catch (err) {
    console.error('[SHUTDOWN] Flush error:', err.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled promise rejection (kept alive):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught exception (kept alive):', err?.message || err);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

if (!IS_SERVERLESS) {
  ensureInitialized()
    .then(() => {
      server.listen(PORT, '0.0.0.0', () => {
        const status = getPersistenceStatus(db);
        console.log(`Server listening on http://0.0.0.0:${PORT} [Storage: ${status.driver}, Durable: ${status.durable}]`);

        // Keep 24/7 container active & healthcheck warm every 60s
        const externalUrl =
          process.env.RENDER_EXTERNAL_URL ||
          (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
        if (externalUrl) {
          setInterval(() => {
            fetch(`${externalUrl}/api/health`).catch(() => {});
          }, 60 * 1000);
        }
      });
    })
    .catch((err) => {
      console.error('[BOOT FATAL]', err);
      process.exit(1);
    });
}

export default server;
