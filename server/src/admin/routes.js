import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import { setPrice, forcePump, resetEngine, clearTicks, emitSocket, currentPrice } from '../market/engine.js';
import { getAdminNotifications, markAdminNotificationsRead } from '../notifications/adminNotifications.js';
import { INITIAL_BALANCE } from '../config.js';
import { settleExpiredTrades } from '../binary/routes.js';
import { getVerificationSettings, saveVerificationSettings } from '../verifications/settings.js';
import {
  exportDatabaseSnapshot,
  getPersistenceStatus,
  importDatabaseSnapshot,
  listCloudBackups,
  pushSnapshotToCloud,
  restoreCloudBackupByHash,
  runMinuteBackupCycle
} from '../cloudPersistence.js';

const router = express.Router();

router.use(requireAuth);
router.use(requireAdminRole());

const ensureSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Main admin only' });
  }
  next();
};

const selectStats = {
  totalUsers: db.prepare('SELECT COUNT(*) AS value FROM users'),
  totalTrades: db.prepare('SELECT COUNT(*) AS value FROM trades'),
  totalInvested: db.prepare('SELECT IFNULL(SUM(notional), 0) AS value FROM trades'),
  totalPnl: db.prepare('SELECT IFNULL(SUM(pnl), 0) AS value FROM trades WHERE status = \'closed\''),
  dayChange: db.prepare(`SELECT IFNULL(SUM(pnl), 0) AS value FROM trades WHERE COALESCE(closed_at, created_at) >= datetime('now','-1 day')`),
  totalNotifications: db.prepare('SELECT COUNT(*) AS value FROM notifications')
};

const selectBalancesSummary = db.prepare(`
  SELECT
    IFNULL(SUM(available), 0) AS available,
    IFNULL(SUM(locked), 0) AS locked
  FROM balances
`);

const selectTopBalances = db.prepare(`
  SELECT
    u.id,
    u.email,
    u.name,
    u.handle,
    IFNULL(b.available, 0) AS available,
    IFNULL(b.locked, 0) AS locked
  FROM users u
  LEFT JOIN balances b ON b.user_id = u.id
  ORDER BY (IFNULL(b.available,0) + IFNULL(b.locked,0)) DESC
  LIMIT 8
`);

const selectRecentTrades = db.prepare(`
  SELECT t.id, t.symbol, t.side, t.status, t.price, t.pnl, t.notional, t.created_at, t.closed_at,
         u.email, u.name
  FROM trades t
  LEFT JOIN users u ON u.id = t.user_id
  ORDER BY t.created_at DESC
  LIMIT 20
`);

const selectRecentNotifications = db.prepare(`
  SELECT n.id, n.title, n.message, n.created_at, u.email
  FROM notifications n
  LEFT JOIN users u ON u.id = n.user_id
  ORDER BY n.created_at DESC
  LIMIT 10
`);

const selectActivityLog = db.prepare(`
  SELECT id, actor_role, action, meta, ts
  FROM activity_logs
  ORDER BY ts DESC
  LIMIT 20
`);

const selectVerificationsForAdmin = db.prepare(`
  SELECT
    v.id,
    v.user_id,
    v.document_type,
    v.document_number,
    v.document_name,
    v.first_name,
    v.last_name,
    v.phone_number,
    v.father_or_spouse_name,
    v.village_address,
    v.city,
    v.state_province,
    v.postal_code,
    v.document_country,
    v.document_birthdate,
    v.document_expires_at,
    v.document_front,
    v.document_back,
    v.selfie,
    v.status,
    v.gold_badge,
    v.notes,
    v.face_similarity,
    v.face_confidence,
    v.face_checked_at,
    v.face_check_notes,
    v.submitted_at,
    v.updated_at,
    u.email,
    u.name,
    u.handle
  FROM verifications v
  JOIN users u ON u.id = v.user_id
  ORDER BY v.updated_at DESC, v.submitted_at DESC
  LIMIT 200
`);
const updateVerificationStatusStmt = db.prepare(`
  UPDATE verifications
  SET status = ?, gold_badge = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
`);
const deleteVerificationStmt = db.prepare('DELETE FROM verifications WHERE user_id = ?');
const ALLOWED_VERIFICATION_STATUSES = new Set(['pending', 'awaiting_approval', 'approved', 'rejected']);

const listSubadminsStmt = db.prepare(`
  SELECT u.id, u.email, u.name, u.created_at, IFNULL(p.permissions, '[]') AS permissions
  FROM users u
  LEFT JOIN admin_permissions p ON p.user_id = u.id
  WHERE u.role = 'subadmin'
  ORDER BY u.created_at DESC
`);

const insertSubadminStmt = db.prepare(`
  INSERT INTO users (email, password_hash, name, role)
  VALUES (?, ?, ?, 'subadmin')
`);

const upsertPermissionsStmt = db.prepare(`
  INSERT INTO admin_permissions (user_id, permissions)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP
`);

const selectChannelsStmt = db.prepare('SELECT * FROM market_channels ORDER BY channel');
const selectChannelStmt = db.prepare('SELECT * FROM market_channels WHERE channel = ?');

function getOtcChannelSnapshot() {
  const market = db.prepare('SELECT * FROM market_settings WHERE id = 1').get();
  return {
    channel: 'OTC',
    label: 'OTC Desk',
    base_price: Number(market?.base_price ?? 0),
    volatility: Number(market?.volatility ?? 0),
    speed: Number(market?.speed_multiplier ?? 1),
    status: market?.paused ? 'paused' : 'live',
    description: 'Primary admin-controlled OTC feed'
  };
}

function syncOtcChannelRow() {
  const otc = getOtcChannelSnapshot();
  db.prepare(`
    UPDATE market_channels
    SET base_price = ?, volatility = ?, speed = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE channel = 'OTC'
  `).run(otc.base_price, otc.volatility, otc.speed, otc.status);
  return otc;
}

router.get('/market', requireAdminRole('market'), (req, res) => {
  const s = db.prepare('SELECT * FROM market_settings WHERE id = 1').get();
  res.json(s);
});

router.get('/market-settings', requireAdminRole('market'), (req, res) => {
  const rows = db.prepare('SELECT * FROM market_settings ORDER BY symbol ASC').all();
  res.json(rows);
});

router.get('/markets', requireAdminRole('market'), (req, res) => {
  const otc = getOtcChannelSnapshot();
  const channels = selectChannelsStmt.all().map(ch => {
    if (ch.channel === 'OTC') {
      return { ...ch, ...otc };
    }
    return {
      ...ch,
      base_price: Number(ch.base_price ?? 0),
      volatility: Number(ch.volatility ?? 0),
      speed: Number(ch.speed ?? 1)
    };
  });
  res.json({ channels, otc });
});

function updateMarketChannel(channel, payload = {}) {
  const normalized = channel.toUpperCase();
  if (normalized === 'OTC') {
    const fields = [];
    const params = [];
    if (typeof payload.volatility === 'number') {
      fields.push('volatility = ?');
      params.push(payload.volatility);
    }
    if (typeof payload.speed === 'number') {
      fields.push('speed_multiplier = ?');
      params.push(payload.speed);
    }
    if (payload.status) {
      const paused = payload.status === 'paused' ? 1 : 0;
      fields.push('paused = ?');
      params.push(paused);
    }
    if (fields.length) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE market_settings SET ${fields.join(', ')} WHERE id = 1`).run(...params);
    }
    if (typeof payload.base_price === 'number' && payload.base_price > 0) {
      // Legacy OTC maps to BTCUSD or the first ID if they still use channels
      const first = db.prepare('SELECT symbol FROM market_settings WHERE id = 1').get();
      if (first) setPrice(first.symbol, payload.base_price);
    }
    return syncOtcChannelRow();
  }
  const row = selectChannelStmt.get(normalized);
  if (!row) return null;
  const updates = [];
  const params = [];
  if (typeof payload.base_price === 'number') {
    updates.push('base_price = ?');
    params.push(payload.base_price);
  }
  if (typeof payload.volatility === 'number') {
    updates.push('volatility = ?');
    params.push(payload.volatility);
  }
  if (typeof payload.speed === 'number') {
    updates.push('speed = ?');
    params.push(payload.speed);
  }
  if (payload.status) {
    updates.push('status = ?');
    params.push(payload.status);
  }
  if (!updates.length) {
    return {
      ...row,
      base_price: Number(row.base_price ?? 0),
      volatility: Number(row.volatility ?? 0),
      speed: Number(row.speed ?? 1)
    };
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  db.prepare(`UPDATE market_channels SET ${updates.join(', ')} WHERE channel = ?`).run(...params, normalized);
  return selectChannelStmt.get(normalized);
}

router.post('/markets/:channel', requireAdminRole('market'), (req, res) => {
  const channel = (req.params.channel || '').toUpperCase();
  const result = updateMarketChannel(channel, req.body || {});
  if (!result) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'update_market_channel', JSON.stringify({ channel, payload: req.body || {}, actor: req.user.id }));
  res.json({ ok: true, channel: result });
});

router.post('/markets/:channel/pulse', requireAdminRole('market'), (req, res) => {
  const channel = (req.params.channel || '').toUpperCase();
  const { percentage } = req.body || {};
  if (typeof percentage !== 'number') {
    return res.status(400).json({ error: 'percentage required' });
  }
  if (channel === 'OTC') {
    const first = db.prepare('SELECT symbol FROM market_settings WHERE id = 1').get();
    const price = first ? forcePump(first.symbol, percentage) : null;
    syncOtcChannelRow();
    return res.json({ ok: true, price });
  }
  const row = selectChannelStmt.get(channel);
  if (!row) return res.status(404).json({ error: 'Channel not found' });
  const nextPrice = Number(row.base_price || 0) * (1 + percentage / 100);
  db.prepare('UPDATE market_channels SET base_price = ?, updated_at = CURRENT_TIMESTAMP WHERE channel = ?')
    .run(nextPrice, channel);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'pulse_market_channel', JSON.stringify({ channel, percentage, actor: req.user.id }));
  res.json({ ok: true, price: nextPrice });
});

router.get('/dashboard', requireAdminRole('analytics'), (req, res) => {
  const stats = {
    totalUsers: selectStats.totalUsers.get().value,
    totalTrades: selectStats.totalTrades.get().value,
    totalInvested: selectStats.totalInvested.get().value,
    totalPnL: selectStats.totalPnl.get().value,
    dayChange: selectStats.dayChange.get().value,
    notifications: selectStats.totalNotifications.get().value
  };
  const balances = selectBalancesSummary.get();
  const balanceTotal = (Number(balances.available) || 0) + (Number(balances.locked) || 0);
  const market = db.prepare('SELECT * FROM market_settings WHERE id = 1').get();
  const channels = selectChannelsStmt.all().map(ch => {
    if (ch.channel === 'OTC') {
      const otc = getOtcChannelSnapshot();
      return { ...ch, ...otc };
    }
    return {
      ...ch,
      base_price: Number(ch.base_price ?? 0),
      volatility: Number(ch.volatility ?? 0),
      speed: Number(ch.speed ?? 1)
    };
  });
  res.json({
    stats: {
      ...stats,
      availableLiquidity: Number(balances.available) || 0,
      lockedMargin: Number(balances.locked) || 0,
      totalBalance: balanceTotal
    },
    market: {
      ...market,
      currentPrice: currentPrice()
    },
    topBalances: selectTopBalances.all(),
    recentTrades: selectRecentTrades.all(),
    notifications: selectRecentNotifications.all(),
    activity: selectActivityLog.all(),
    channels
  });
});

router.get('/users', requireAdminRole('users'), (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const likeQuery = `%${query}%`;
  const rows = db.prepare(`
    SELECT u.id, u.email, u.raw_password, u.name, u.handle, u.role, u.created_at,
           IFNULL(b.available,0) AS available,
           IFNULL(b.locked,0) AS locked,
           COUNT(t.id) AS trade_count,
           SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open_trade_count,
           IFNULL(SUM(CASE WHEN t.status = 'closed' THEN t.pnl ELSE 0 END),0) AS realized_pnl,
           v.status AS verification_status,
           COALESCE(v.gold_badge, CASE WHEN v.status = 'approved' THEN 1 ELSE 0 END) AS verification_gold_badge,
           v.submitted_at AS verification_submitted_at,
           v.updated_at AS verification_updated_at
    FROM users u
    LEFT JOIN balances b ON b.user_id = u.id
    LEFT JOIN trades t ON t.user_id = u.id
    LEFT JOIN verifications v ON v.user_id = u.id
    WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ? OR u.handle LIKE ?)
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 100
  `).all(query, likeQuery, likeQuery, likeQuery);
  res.json(rows);
});

router.get('/verifications/settings', requireAdminRole('users'), (req, res) => {
  res.json({ settings: getVerificationSettings(db) });
});

router.put('/verifications/settings', requireAdminRole('users'), (req, res) => {
  const settings = saveVerificationSettings(db, req.body || {});
  res.json({ ok: true, settings });
});

router.get('/verifications', requireAdminRole('users'), (req, res) => {
  const rows = selectVerificationsForAdmin.all();
  res.json(rows);
});

function notifyUserVerificationChange(userId, nextStatus, notes) {
  const settings = getVerificationSettings(db);
  if (nextStatus === 'approved' || nextStatus === 'rejected') {
    const title = nextStatus === 'approved'
      ? `Identity Approved — ${settings.gold_badge_label} Badge Unlocked`
      : 'Identity Verification Declined';
    const message = nextStatus === 'approved'
      ? `Your NID identity has been verified by Admin. Your Gold "${settings.gold_badge_label}" badge is now active on your profile!`
      : `Your identity verification was declined${notes ? `: ${notes}` : '. Please update your NID details and resubmit.'}`;
    const n = db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)').run(userId, title, message);
    const notifRow = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(n.lastInsertRowid));
    if (notifRow) emitSocket('notification', { notification: notifRow });
  }
  emitSocket('user_data_update', {
    user_id: userId,
    type: 'verification_updated',
    status: nextStatus
  });
}

router.patch('/verifications/:userId', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const target = db.prepare('SELECT user_id, gold_badge FROM verifications WHERE user_id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'Verification not found' });
  }
  const { status, notes, gold_badge } = req.body || {};
  const normalizedStatus = (status || '').trim().toLowerCase();
  if (!ALLOWED_VERIFICATION_STATUSES.has(normalizedStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const notesValue = typeof notes === 'string' ? notes.trim() : null;
  const nextGold = normalizedStatus === 'approved'
    ? (gold_badge === false || gold_badge === 0 ? 0 : 1)
    : (normalizedStatus === 'rejected' ? 0 : (gold_badge !== undefined ? (gold_badge ? 1 : 0) : Number(target.gold_badge || 0)));
  updateVerificationStatusStmt.run(
    normalizedStatus,
    nextGold,
    notesValue || null,
    userId
  );
  notifyUserVerificationChange(userId, normalizedStatus, notesValue);
  res.json({ ok: true, status: normalizedStatus, gold_badge: nextGold });
});

router.put('/verifications/:userId', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!userExists) {
    return res.status(404).json({ error: 'User not found' });
  }
  const existing = db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(userId);
  const body = req.body || {};

  const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : (existing?.first_name || '');
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : (existing?.last_name || '');
  const docName = (typeof body.document_name === 'string' && body.document_name.trim())
    ? body.document_name.trim()
    : (`${firstName} ${lastName}`.trim() || existing?.document_name || null);

  const nextStatusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase() : (existing?.status || 'pending');
  const nextStatus = ALLOWED_VERIFICATION_STATUSES.has(nextStatusRaw) ? nextStatusRaw : (existing?.status || 'pending');
  const nextGold = body.gold_badge !== undefined
    ? (body.gold_badge ? 1 : 0)
    : (nextStatus === 'approved' ? 1 : (nextStatus === 'rejected' ? 0 : Number(existing?.gold_badge || 0)));

  const cleanStr = (val, prev) => typeof val === 'string' ? (val.trim() || null) : (prev ?? null);

  db.prepare(`
    INSERT INTO verifications (
      user_id, document_type, document_number, document_name,
      first_name, last_name, phone_number, father_or_spouse_name,
      village_address, city, state_province, postal_code,
      document_country, document_birthdate, document_expires_at,
      status, gold_badge, notes, submitted_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      document_type = excluded.document_type,
      document_number = excluded.document_number,
      document_name = excluded.document_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone_number = excluded.phone_number,
      father_or_spouse_name = excluded.father_or_spouse_name,
      village_address = excluded.village_address,
      city = excluded.city,
      state_province = excluded.state_province,
      postal_code = excluded.postal_code,
      document_country = excluded.document_country,
      document_birthdate = excluded.document_birthdate,
      document_expires_at = excluded.document_expires_at,
      status = excluded.status,
      gold_badge = excluded.gold_badge,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    userId,
    cleanStr(body.document_type, existing?.document_type || 'nid'),
    cleanStr(body.document_number, existing?.document_number),
    docName,
    firstName || null,
    lastName || null,
    cleanStr(body.phone_number, existing?.phone_number),
    cleanStr(body.father_or_spouse_name, existing?.father_or_spouse_name),
    cleanStr(body.village_address, existing?.village_address),
    cleanStr(body.city, existing?.city),
    cleanStr(body.state_province, existing?.state_province),
    cleanStr(body.postal_code, existing?.postal_code),
    cleanStr(body.document_country, existing?.document_country),
    cleanStr(body.document_birthdate, existing?.document_birthdate),
    cleanStr(body.document_expires_at, existing?.document_expires_at),
    nextStatus,
    nextGold,
    typeof body.notes === 'string' ? (body.notes.trim() || null) : (existing?.notes ?? null)
  );

  if (nextStatus !== existing?.status) {
    notifyUserVerificationChange(userId, nextStatus, typeof body.notes === 'string' ? body.notes.trim() : null);
  } else {
    emitSocket('user_data_update', { user_id: userId, type: 'verification_updated', status: nextStatus });
  }

  const updated = db.prepare(`
    SELECT v.*, u.email, u.name, u.handle
    FROM verifications v JOIN users u ON u.id = v.user_id
    WHERE v.user_id = ?
  `).get(userId);
  res.json(updated);
});

router.delete('/verifications/:userId', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const target = db.prepare('SELECT user_id FROM verifications WHERE user_id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'Verification not found' });
  }
  deleteVerificationStmt.run(userId);
  res.json({ ok: true });
});

router.get('/users/:id', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
  const row = db.prepare(`
    SELECT u.id, u.email, u.raw_password, u.name, u.handle, u.role, u.created_at,
           IFNULL(b.available,0) AS available,
           IFNULL(b.locked,0) AS locked,
           COUNT(t.id) AS trade_count,
           IFNULL(SUM(CASE WHEN t.status = 'closed' THEN t.pnl ELSE 0 END),0) AS realized_pnl,
           v.status AS verification_status,
           v.notes AS note
    FROM users u
    LEFT JOIN balances b ON b.user_id = u.id
    LEFT JOIN trades t ON t.user_id = u.id
    LEFT JOIN verifications v ON v.user_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(row);
});

router.put('/users/:id', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
  const { role, verification_status, note, password } = req.body || {};
  
  if (role && ['admin', 'subadmin', 'user'].includes(role)) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }
  
  if (password && typeof password === 'string' && password.trim().length > 0) {
    const cleanPassword = password.trim();
    const hash = bcrypt.hashSync(cleanPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, raw_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, cleanPassword, userId);
    db.prepare('INSERT INTO activity_logs (user_id, actor_role, action, meta) VALUES (?, ?, ?, ?)')
      .run(userId, req.user.role, 'update_user_password', JSON.stringify({ actor: req.user.id }));
  }

  if (verification_status) {
    const nextGold = verification_status === 'approved' ? 1 : (verification_status === 'rejected' ? 0 : 0);
    db.prepare(`
      INSERT INTO verifications (user_id, status, gold_badge, notes) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET status = ?, gold_badge = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    `).run(
      userId,
      verification_status,
      nextGold,
      typeof note === 'string' ? note : null,
      verification_status,
      nextGold,
      typeof note === 'string' ? note : null
    );
    notifyUserVerificationChange(userId, verification_status, typeof note === 'string' ? note : null);
  } else if (typeof note === 'string') {
    db.prepare(`
      INSERT INTO verifications (user_id, status, notes) VALUES (?, 'not_started', ?)
      ON CONFLICT(user_id) DO UPDATE SET notes = ?, updated_at = CURRENT_TIMESTAMP
    `).run(userId, note, note);
  }

  res.json({ ok: true });
});

router.get('/users/:id/activity', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
  const combined = db.prepare(`
    SELECT * FROM activity_logs 
    WHERE user_id = ? OR json_extract(meta, '$.actor') = ? 
    ORDER BY ts DESC LIMIT 200
  `).all(userId, userId).map(row => ({
    timestamp: row.ts,
    action: row.action,
    description: row.actor_role ? `[${row.actor_role}] ${row.meta}` : row.meta
  }));
  res.json(combined);
});

router.get('/users/:id/history', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });

  try { settleExpiredTrades(userId); } catch (_) {}
  
  const depositsAndWithdrawals = db.prepare(`
    SELECT id, type AS category, amount, status, created_at AS timestamp, 'Payment' AS source, NULL AS pnl, address, tx_ref
    FROM payment_requests 
    WHERE user_id = ?
  `).all(userId);
  
  const trades = db.prepare(`
    SELECT id, side AS category, COALESCE(stake_amount, notional) AS amount, status, created_at AS timestamp, 'Forex Trade' AS source, pnl, symbol
    FROM trades
    WHERE user_id = ?
  `).all(userId);
  
  const binary = db.prepare(`
    SELECT id, direction AS category, stake AS amount, status, datetime(created_ts, 'unixepoch') AS timestamp, 'Binary Trade' AS source,
           CASE WHEN result = 'win' THEN payout WHEN result = 'lose' THEN -stake ELSE 0 END AS pnl, symbol, result
    FROM binary_trades
    WHERE user_id = ?
  `).all(userId);

  const aiTrade = db.prepare(`
    SELECT id, action AS category, COALESCE(NULLIF(payout_amount, 0), allocated_amount) AS amount, 'completed' AS status, created_at AS timestamp, 'AI Trade' AS source, payout_amount AS pnl, slot_name, day_number, note
    FROM ai_trade_history
    WHERE user_id = ? AND action IN ('payout', 'started', 'stopped')
  `).all(userId);

  const spot = db.prepare(`
    SELECT id, side AS category, (price * amount) AS amount, status, created_at AS timestamp, 'Spot Order' AS source, NULL AS pnl, symbol
    FROM spot_orders
    WHERE user_id = ?
  `).all(userId);

  const copy = db.prepare(`
    SELECT cr.id, 'copy' AS category, cr.allocated_margin AS amount, cr.status, cr.created_at AS timestamp, 'Copy Trade' AS source,
           (cr.current_value - cr.allocated_margin) AS pnl, mt.name AS slot_name
    FROM copy_relationships cr
    LEFT JOIN master_traders mt ON mt.id = cr.master_trader_id
    WHERE cr.user_id = ?
  `).all(userId);
  
  const history = [...depositsAndWithdrawals, ...trades, ...binary, ...aiTrade, ...spot, ...copy].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  res.json(history);
});

router.get('/users/:id/open-trades', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });
  
  const trades = db.prepare(`
    SELECT *
    FROM trades
    WHERE user_id = ? AND status = 'open'
    ORDER BY created_at DESC
  `).all(userId);
  
  res.json(trades);
});

router.get('/users/:id/binary-trades', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });

  // Settle any trades that expired up to this moment
  settleExpiredTrades(userId);

  const open = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = ? AND status = 'open'
    ORDER BY created_ts DESC
  `).all(userId);

  const history = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = ? AND status = 'settled'
    ORDER BY COALESCE(settled_ts, expiry_ts, created_ts) DESC
    LIMIT 200
  `).all(userId);

  const statsRow = db.prepare(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS win,
      SUM(CASE WHEN result = 'lose' THEN 1 ELSE 0 END) AS lose,
      SUM(CASE WHEN result = 'push' THEN 1 ELSE 0 END) AS push,
      SUM(stake) AS total_stake,
      SUM(payout) AS total_payout,
      SUM(CASE WHEN status = 'settled' THEN (payout - stake) ELSE 0 END) AS net_pnl
    FROM binary_trades
    WHERE user_id = ?
  `).get(userId);

  res.json({
    open,
    history,
    stats: {
      total: Number(statsRow?.total || 0),
      win: Number(statsRow?.win || 0),
      lose: Number(statsRow?.lose || 0),
      push: Number(statsRow?.push || 0),
      totalStake: Number(statsRow?.total_stake || 0),
      totalPayout: Number(statsRow?.total_payout || 0),
      netPnL: Number(statsRow?.net_pnl || 0)
    }
  });
});

// ── GET /admin/users/:id/ai-trade ────────────────────────────────
// Returns current session + paginated session history for admin view

router.get('/users/:id/ai-trade', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid id' });

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  // Current session
  const session = db.prepare('SELECT * FROM ai_trade_sessions WHERE user_id = ?').get(userId) || null;

  // Paginated session history
  const allRefs = db.prepare(`
    SELECT session_ref, MAX(created_at) AS latest
    FROM ai_trade_history WHERE user_id = ?
    GROUP BY session_ref ORDER BY latest DESC
  `).all(userId);

  const totalSessions = allRefs.length;
  const totalPages = Math.max(Math.ceil(totalSessions / limit), 1);
  const pagedRefs = allRefs.slice((page - 1) * limit, page * limit).map(r => r.session_ref);

  let sessions = [];
  if (pagedRefs.length > 0) {
    const placeholders = pagedRefs.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM ai_trade_history
      WHERE user_id = ? AND session_ref IN (${placeholders})
      ORDER BY created_at DESC
    `).all(userId, ...pagedRefs);

    // Group into sessions
    const sessionMap = new Map();
    for (const row of rows) {
      if (!sessionMap.has(row.session_ref)) {
        sessionMap.set(row.session_ref, {
          session_ref: row.session_ref, slot: row.slot, slot_name: row.slot_name,
          allocated_amount: row.allocated_amount, started_at: null, stopped_at: null,
          status: 'active', total_earned: 0, total_days: 0, events: [],
        });
      }
      const s = sessionMap.get(row.session_ref);
      s.events.push(row);
      if (row.action === 'started') s.started_at = row.created_at;
      if (row.action === 'stopped') { s.stopped_at = row.created_at; s.status = 'completed'; }
      if (row.action === 'payout') { s.total_earned += Number(row.payout_amount); s.total_days = Math.max(s.total_days, row.day_number || 0); }
      if (row.action === 'stopped' && row.payout_amount > 0) s.total_earned += Number(row.payout_amount);
    }
    sessions = [...sessionMap.values()].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  }

  const totalRow = db.prepare(`
    SELECT COALESCE(SUM(payout_amount), 0) AS total FROM ai_trade_history
    WHERE user_id = ? AND (action = 'payout' OR (action = 'stopped' AND payout_amount > 0))
  `).get(userId);

  res.json({
    session,
    history: { sessions, totalEarned: totalRow?.total || 0, page, totalPages, totalSessions }
  });
});

router.put('/records/timestamp', requireAdminRole('admin_manage'), ensureSuperAdmin, (req, res) => {
  const { table, id, field, value } = req.body || {};
  if (!table || !id || !field || !value) return res.status(400).json({ error: 'Missing parameters' });
  
  const allowedTables = ['users', 'trades', 'binary_trades', 'payment_requests', 'activity_logs'];
  const allowedFields = ['created_at', 'updated_at', 'closed_at', 'created_ts', 'settled_ts', 'ts'];
  
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });
  if (!allowedFields.includes(field)) return res.status(400).json({ error: 'Invalid field' });
  
  let dateValue = value;
  // Convert ISO string to sqlite format if applicable, though sqlite accepts ISO strings for DATETIME natively
  // but for binary_trades it uses INTEGER timestamps:
  if (table === 'binary_trades') {
      const unix = Math.floor(new Date(value).getTime() / 1000);
      if (isNaN(unix)) return res.status(400).json({ error: 'Invalid date string' });
      dateValue = unix;
  }
  
  db.prepare(`UPDATE ${table} SET ${field} = ? WHERE id = ?`).run(dateValue, id);
  
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'edit_timestamp', JSON.stringify({ table, id, field, value, actor: req.user.id }));
    
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdminRole('users'), (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM balances WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM trades WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM activity_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM referrals WHERE referrer_id = ? OR referee_id = ?').run(userId, userId);
    db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  tx();
  res.json({ ok: true });
});

router.post('/users/set-balance', requireAdminRole('users'), (req, res) => {
  const { user_id, email, amount } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return res.status(400).json({ error: 'amount must be a number' });
  }

  let user = null;
  if (user_id) {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  } else if (email) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, 0)').run(user.id, numericAmount);
  db.prepare('UPDATE balances SET available = ?, locked = 0 WHERE user_id = ?').run(numericAmount, user.id);

  db.prepare('INSERT INTO activity_logs (user_id, actor_role, action, meta) VALUES (?, ?, ?, ?)')
    .run(user.id, req.user.role, 'set_user_balance', JSON.stringify({ amount: numericAmount, actor: req.user.id }));

  const balance = db.prepare('SELECT * FROM balances WHERE user_id = ?').get(user.id);
  res.json({ ok: true, user: { id: user.id, email: user.email }, balance });
});

router.post('/market/set-price', requireAdminRole('market'), (req, res) => {
  const { symbol, price } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  if (typeof price !== 'number' || price <= 0) return res.status(400).json({ error: 'Invalid price' });
  const p = setPrice(symbol, price);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'set_price', JSON.stringify({ symbol, price, actor: req.user.id }));
  res.json({ ok: true, price: p });
});

router.post('/market/set-volatility', requireAdminRole('market'), (req, res) => {
  const { symbol, volatility } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  if (typeof volatility !== 'number' || volatility < 0 || volatility > 1) return res.status(400).json({ error: 'Invalid volatility' });
  db.prepare('UPDATE market_settings SET volatility = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(volatility, symbol);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'set_volatility', JSON.stringify({ symbol, volatility, actor: req.user.id }));
  res.json({ ok: true, volatility });
});

router.post('/market/pause', requireAdminRole('market'), (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  db.prepare('UPDATE market_settings SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(symbol);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'pause_market', JSON.stringify({ symbol, actor: req.user.id }));
  res.json({ ok: true });
});

router.post('/market/resume', requireAdminRole('market'), (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  db.prepare('UPDATE market_settings SET paused = 0, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?').run(symbol);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'resume_market', JSON.stringify({ symbol, actor: req.user.id }));
  res.json({ ok: true });
});

router.post('/market/pump', requireAdminRole('market'), (req, res) => {
  const { symbol, percentage } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  if (typeof percentage !== 'number') return res.status(400).json({ error: 'percentage required' });
  const price = forcePump(symbol, percentage);
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'pump', JSON.stringify({ symbol, percentage, resulting_price: price, actor: req.user.id }));
  res.json({ ok: true, price });
});

router.post('/market/reset', requireAdminRole('market'), ensureSuperAdmin, (req, res) => {
  const { base_price, volatility, symbol, pip_size } = req.body || {};
  const current = db.prepare('SELECT * FROM market_settings WHERE id = 1').get();
  const nextBase = typeof base_price === 'number' && base_price > 0 ? base_price : current?.base_price || 60000;
  const nextVol = typeof volatility === 'number' && volatility >= 0 && volatility <= 1 ? volatility : current?.volatility || 0.02;
  const nextSymbol = typeof symbol === 'string' && symbol.trim() ? symbol.trim().toUpperCase() : current?.symbol || 'BTCUSDT';
  const nextPipSize = typeof pip_size === 'number' && pip_size > 0 ? pip_size : current?.pip_size || 1;

  const tx = db.transaction(() => {
    db.exec('DELETE FROM trades');
    db.exec('DELETE FROM candles');
    db.exec('DELETE FROM activity_logs');
    db.exec('DELETE FROM ticks');
    db.prepare('UPDATE balances SET available = ?, locked = 0').run(INITIAL_BALANCE);
    db.prepare(`
      UPDATE market_settings
      SET symbol = ?, base_price = ?, volatility = ?, paused = 0, pip_size = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(nextSymbol, nextBase, nextVol, nextPipSize);
  });

  tx();
  resetEngine(nextBase);
  clearTicks();
  syncOtcChannelRow();

  const updated = db.prepare('SELECT * FROM market_settings WHERE id = 1').get();
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'reset_market', JSON.stringify({ base_price: nextBase, volatility: nextVol, symbol: nextSymbol, pip_size: nextPipSize, actor: req.user.id }));

  res.json({ ok: true, settings: updated });
});

router.post('/notifications', requireAdminRole('notifications'), (req, res) => {
  const { title, message, user_id, email } = req.body || {};
  if (!title || !message) {
    return res.status(400).json({ error: 'title and message required' });
  }

  let targetId = null;
  if (user_id) {
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!row) return res.status(404).json({ error: 'Target user not found' });
    targetId = row.id;
  } else if (email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!row) return res.status(404).json({ error: 'Target user not found' });
    targetId = row.id;
  }

  const result = db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)')
    .run(targetId, title, message);
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);

  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'create_notification', JSON.stringify({ id: result.lastInsertRowid, title, user_id: targetId, actor: req.user.id }));

  emitSocket('notification', { notification });

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.get('/audit', requireAdminRole('audit'), (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_logs ORDER BY ts DESC LIMIT 200').all();
  res.json(rows);
});

router.get('/subadmins', requireAdminRole('admin_manage'), ensureSuperAdmin, (req, res) => {
  const rows = listSubadminsStmt.all().map(row => ({
    ...row,
    permissions: (() => {
      try {
        const parsed = JSON.parse(row.permissions || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return [];
      }
    })()
  }));
  res.json(rows);
});

router.post('/subadmins', requireAdminRole('admin_manage'), ensureSuperAdmin, (req, res) => {
  const { email, password, name, permissions } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const tx = db.transaction(() => {
    insertSubadminStmt.run(email, hash, name || '');
    const created = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(created.id);
    upsertPermissionsStmt.run(created.id, JSON.stringify(permissions || []), JSON.stringify(permissions || []));
    return created;
  });
  const newUser = tx();
  res.json({ ok: true, user: { id: newUser.id, email, name: name || '', permissions: permissions || [] } });
});

router.put('/subadmins/:id', requireAdminRole('admin_manage'), ensureSuperAdmin, (req, res) => {
  const subId = Number(req.params.id);
  if (!Number.isInteger(subId)) return res.status(400).json({ error: 'Invalid id' });
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND role = \'subadmin\'').get(subId);
  if (!target) return res.status(404).json({ error: 'Sub admin not found' });
  const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  const name = req.body?.name;
  if (typeof name === 'string') {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, subId);
  }
  upsertPermissionsStmt.run(subId, JSON.stringify(permissions), JSON.stringify(permissions));
  res.json({ ok: true });
});

router.delete('/subadmins/:id', requireAdminRole('admin_manage'), ensureSuperAdmin, (req, res) => {
  const subId = Number(req.params.id);
  if (!Number.isInteger(subId)) return res.status(400).json({ error: 'Invalid id' });
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND role = \'subadmin\'').get(subId);
  if (!target) return res.status(404).json({ error: 'Sub admin not found' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(subId);
    db.prepare('DELETE FROM users WHERE id = ?').run(subId);
  });
  tx();
  res.json({ ok: true });
});

router.put('/features/:key', requireAdminRole('market'), (req, res) => {
  const key = req.params.key;
  const { active } = req.body || {};
  if (typeof active !== 'number') return res.status(400).json({ error: 'active must be 0 or 1' });

  const feature = db.prepare('SELECT * FROM system_features WHERE key = ?').get(key);
  if (!feature) return res.status(404).json({ error: 'Feature not found' });

  db.prepare('UPDATE system_features SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(active, key);
  
  db.prepare('INSERT INTO activity_logs (actor_role, action, meta) VALUES (?, ?, ?)')
    .run(req.user.role, 'toggle_feature', JSON.stringify({ feature: key, active, actor: req.user.id }));
    
  res.json({ ok: true, key, active });
});

router.get('/admin-notifications', (req, res) => {
  const data = getAdminNotifications(50);
  res.json(data);
});

router.post('/admin-notifications/read', (req, res) => {
  const result = markAdminNotificationsRead();
  res.json(result);
});

router.get('/backup/status', ensureSuperAdmin, (req, res) => {
  res.json(getPersistenceStatus(db));
});

router.get('/backup/history', ensureSuperAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 60);
    const history = await listCloudBackups(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load backup history' });
  }
});

router.post('/backup/now', ensureSuperAdmin, async (req, res) => {
  try {
    const result = await runMinuteBackupCycle({ createArchive: true, forceSync: true });
    res.json({ ok: true, ...result, status: getPersistenceStatus(db) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Immediate backup failed' });
  }
});

router.post('/backup/sync', ensureSuperAdmin, async (req, res) => {
  try {
    const result = await pushSnapshotToCloud({ force: true });
    res.json({ ...result, status: getPersistenceStatus(db) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Cloud sync failed' });
  }
});

router.post('/backup/restore-cloud', ensureSuperAdmin, async (req, res) => {
  try {
    const { hash, mode } = req.body || {};
    const result = await restoreCloudBackupByHash(hash, { mode: mode === 'replace' ? 'replace' : 'merge' });
    res.json({ ok: true, ...result, status: getPersistenceStatus(db) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to restore cloud backup snapshot' });
  }
});

router.get('/backup/export', ensureSuperAdmin, (req, res) => {
  try {
    const snapshot = exportDatabaseSnapshot(db);
    const filename = `avapartner-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to export backup' });
  }
});

router.post('/backup/import', ensureSuperAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const snapshot = body.snapshot && body.snapshot.data ? body.snapshot : body;
    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const result = importDatabaseSnapshot(db, snapshot, { mode });
    const syncResult = await pushSnapshotToCloud({ force: true }).catch(() => ({ synced: false }));
    res.json({
      ok: true,
      ...result,
      cloudSynced: Boolean(syncResult?.synced),
      status: getPersistenceStatus(db)
    });
  } catch (err) {
    console.error('[ADMIN BACKUP IMPORT ERROR]', err);
    res.status(400).json({ error: err.message || 'Invalid backup file or restore error' });
  }
});

export default router;
