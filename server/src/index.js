import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PORT, CORS_ORIGINS } from './config.js';
import authRoutes from './auth/authRoutes.js';
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
import db from './db.js';
import { attachIO, tickOnce } from './market/engine.js';

const app = express();
app.use(helmet());
// Allow larger JSON bodies so base64 document/selfie uploads are accepted.
app.use(express.json({ limit: '15mb' }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, true); // dev: allow all
  },
  credentials: true
}));

app.get('/', (req, res) => res.json({ ok: true, name: 'OTC Market Server' }));
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'otc-market', timestamp: Date.now() });
});
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'otc-market', timestamp: Date.now() });
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

// Tick loop
setInterval(() => {
  try {
    tickOnce();
  } catch (e) {
    console.error('tick error:', e);
  }
}, 1000);

initCryptoService();
initAITradeEngine();
initMonthlyIBScheduler();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
