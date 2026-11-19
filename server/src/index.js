import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PORT, CORS_ORIGINS } from './config.js';
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
import { initCryptoService } from './payments/cryptoService.js';
import securityRoutes from './security/routes.js';
import aiTradeRoutes from './aitrade/routes.js';
import { initAITradeEngine } from './aitrade/earningsEngine.js';
import ibRoutes from './ib/routes.js';
import { initMonthlyIBScheduler } from './ib/monthlyScheduler.js';
import { promotionsRouter, adminPromotionsRouter } from './promotions/routes.js';
import locationsRoutes from './locations/routes.js';
import db from './db.js';
import {
  getPersistenceStatus,
  initCloudPersistence,
  runMinuteBackupCycle,
  shutdownCloudPersistence
} from './cloudPersistence.js';
import { attachIO, tickOnce } from './market/engine.js';

const app = express();
app.use(helmet());
// Allow larger JSON bodies so base64 document/selfie/backup uploads are accepted.
app.use(express.json({ limit: '50mb' }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) return cb(null, true);
    cb(null, true); // fallback: allow all
  },
  credentials: true
}));

app.get('/', (req, res) => res.json({ ok: true, name: 'OTC Market Server' }));
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

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});
attachIO(io);

io.on('connection', (socket) => {
  // nothing special; market engine emits to "io" directly for broadcast
});

async function startServer() {
  await initCloudPersistence(db);
  ensureAdmin();
  initCryptoService();
  initAITradeEngine();
  initMonthlyIBScheduler();

  // Tick loop
  setInterval(() => {
    try {
      tickOnce();
    } catch (e) {
      console.error('tick error:', e);
    }
  }, 1000);

  // Automated every-minute local & cloud database backup (initial snapshot immediately on boot)
  await runMinuteBackupCycle({ createArchive: true }).catch(() => {});

  server.listen(PORT, '0.0.0.0', () => {
    const status = getPersistenceStatus(db);
    console.log(`Server listening on http://0.0.0.0:${PORT} [Storage: ${status.driver}, Durable: ${status.durable}]`);

    // Keep free instance awake & prevent spin-downs (pings every 8 minutes)
    const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://avapartner-api.onrender.com';
    if (renderUrl) {
      setInterval(() => {
        fetch(`${renderUrl}/health`).catch(() => {});
      }, 8 * 60 * 1000);
    }
  });
}

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

startServer().catch((err) => {
  console.error('[BOOT FATAL]', err);
  process.exit(1);
});
