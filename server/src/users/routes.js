import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { performFaceCheck } from '../faceCheck.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import { settleExpiredTrades } from '../binary/routes.js';

const router = express.Router();

const selectVerificationStmt = db.prepare(`
  SELECT
    document_type,
    document_number,
    document_name,
    document_country,
    document_birthdate,
    document_expires_at,
    status,
    notes,
    submitted_at,
    updated_at,
    document_front IS NOT NULL AS has_document_front,
    document_back IS NOT NULL AS has_document_back,
    selfie IS NOT NULL AS has_selfie,
    face_similarity,
    face_confidence,
    face_checked_at,
    face_check_notes
  FROM verifications
  WHERE user_id = ?
`);

const upsertVerificationStmt = db.prepare(`
  INSERT INTO verifications (user_id, document_type, document_number, document_name, document_country, document_birthdate, document_expires_at, document_front, document_back, selfie, status, notes, submitted_at, updated_at)
  VALUES (?, ?, NULLIF(?, ''), ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, 'awaiting_approval', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    document_name = excluded.document_name,
    document_country = excluded.document_country,
    document_birthdate = excluded.document_birthdate,
    document_expires_at = excluded.document_expires_at,
    document_front = excluded.document_front,
    document_back = excluded.document_back,
    selfie = excluded.selfie,
    status = 'awaiting_approval',
    notes = excluded.notes,
    submitted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

const ALLOWED_DOCUMENT_TYPES = new Set(['nid', 'passport', 'driver_license']);

function formatVerification(row) {
  if (!row) {
    return { status: 'not_started' };
  }
  return {
    document_type: row.document_type,
    document_number: row.document_number,
    document_name: row.document_name,
    document_country: row.document_country,
    document_birthdate: row.document_birthdate,
    document_expires_at: row.document_expires_at,
    status: row.status || 'pending',
    notes: row.notes,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    has_document_front: Boolean(row.has_document_front),
    has_document_back: Boolean(row.has_document_back),
    has_selfie: Boolean(row.has_selfie),
    face_similarity: row.face_similarity ?? 0,
    face_confidence: row.face_confidence ?? 0,
    face_checked_at: row.face_checked_at,
    face_check_notes: row.face_check_notes
  };
}

const MAX_AVATAR_LENGTH = 1_500_000;
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

router.get('/me', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, email, name, handle, referral_code, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(u);
});

router.put('/me', requireAuth, (req, res) => {
  const { name, handle, avatar } = req.body || {};
  if (handle) {
    const exists = db.prepare('SELECT id FROM users WHERE handle = ? AND id != ?').get(handle, req.user.id);
    if (exists) return res.status(409).json({ error: 'Handle already taken' });
  }

  let hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar');
  let nextAvatar = null;
  if (hasAvatarUpdate) {
    if (avatar === null || avatar === '') {
      nextAvatar = null;
    } else if (typeof avatar === 'string') {
      const trimmed = avatar.trim();
      if (trimmed.length > MAX_AVATAR_LENGTH) {
        return res.status(400).json({ error: 'Profile picture is too large. Please choose a smaller image.' });
      }
      if (!DATA_IMAGE_RE.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid profile picture format. Allowed: PNG, JPEG, WEBP, GIF.' });
      }
      nextAvatar = trimmed;
    } else {
      return res.status(400).json({ error: 'Invalid profile picture payload' });
    }
  }

  const trimmedName = typeof name === 'string' ? name.trim() : null;
  const trimmedHandle = typeof handle === 'string' && handle.trim() ? handle.trim() : null;

  if (hasAvatarUpdate) {
    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          handle = COALESCE(?, handle),
          avatar = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trimmedName || null, trimmedHandle, nextAvatar, req.user.id);
  } else {
    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          handle = COALESCE(?, handle),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(trimmedName || null, trimmedHandle, req.user.id);
  }

  const u = db.prepare('SELECT id, email, name, handle, referral_code, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(u);
});

router.get('/referrals', requireAuth, (req, res) => {
  const codeRow = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(req.user.id);
  const countRow = db.prepare('SELECT COUNT(*) as c FROM referrals WHERE referrer_id = ?').get(req.user.id);
  res.json({ referral_code: codeRow?.referral_code, referred_count: countRow?.c || 0 });
});

function buildUserUnifiedHistory(userId) {
  try {
    settleExpiredTrades(userId);
  } catch (_) {}

  const forexTrades = db.prepare(`
    SELECT * FROM trades
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `).all(userId);

  const binaryTrades = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = ?
    ORDER BY COALESCE(settled_ts, expiry_ts, created_ts) DESC, id DESC
    LIMIT 500
  `).all(userId);

  const activeSession = db.prepare('SELECT * FROM ai_trade_sessions WHERE user_id = ?').get(userId) || null;
  const aiEvents = db.prepare(`
    SELECT * FROM ai_trade_history
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `).all(userId);

  // Group AI trade events into sessions cleanly
  const aiSessionMap = new Map();
  let aiTotalEarned = 0;
  for (const row of aiEvents) {
    if (row.action === 'payout' || (row.action === 'stopped' && Number(row.payout_amount) > 0)) {
      aiTotalEarned += Number(row.payout_amount || 0);
    }
    const key = row.session_ref || `legacy_${row.slot}_${row.created_at}`;
    if (!aiSessionMap.has(key)) {
      aiSessionMap.set(key, {
        session_ref: key,
        slot: row.slot,
        slot_name: row.slot_name,
        allocated_amount: row.allocated_amount,
        started_at: null,
        stopped_at: null,
        status: 'active',
        total_earned: 0,
        total_days: 0,
        events: []
      });
    }
    const sess = aiSessionMap.get(key);
    sess.events.push(row);
    if (row.action === 'started') sess.started_at = row.created_at;
    if (row.action === 'stopped') {
      sess.stopped_at = row.created_at;
      sess.status = 'completed';
    }
    if (row.action === 'payout') {
      sess.total_earned += Number(row.payout_amount || 0);
      sess.total_days = Math.max(sess.total_days, row.day_number || 0);
    }
    if (row.action === 'stopped' && Number(row.payout_amount) > 0) {
      sess.total_earned += Number(row.payout_amount || 0);
    }
  }
  const aiSessions = [...aiSessionMap.values()].sort(
    (a, b) => new Date(b.started_at || b.events?.[0]?.created_at || 0) - new Date(a.started_at || a.events?.[0]?.created_at || 0)
  );

  const spotOrders = db.prepare(`
    SELECT * FROM spot_orders
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 300
  `).all(userId);

  const copyTrades = db.prepare(`
    SELECT cr.*, mt.name AS master_name, mt.avatar AS master_avatar, mt.roi_percentage, mt.win_rate
    FROM copy_relationships cr
    LEFT JOIN master_traders mt ON mt.id = cr.master_trader_id
    WHERE cr.user_id = ?
    ORDER BY cr.created_at DESC, cr.id DESC
    LIMIT 300
  `).all(userId);

  const payments = db.prepare(`
    SELECT pr.*, pm.name AS method_name, pm.network
    FROM payment_requests pr
    LEFT JOIN payment_methods pm ON pm.id = pr.method_id
    WHERE pr.user_id = ?
    ORDER BY pr.created_at DESC, pr.id DESC
    LIMIT 300
  `).all(userId);

  const activities = db.prepare(`
    SELECT * FROM activity_logs
    WHERE user_id = ?
    ORDER BY ts DESC, id DESC
    LIMIT 300
  `).all(userId);

  const forexPnl = forexTrades.reduce((acc, t) => acc + (t.status === 'closed' ? Number(t.pnl || 0) : 0), 0);
  const forexOpenCount = forexTrades.filter(t => t.status === 'open' && Number(t.remaining_qty ?? t.qty ?? 0) > 1e-8).length;

  let binaryWins = 0;
  let binaryLosses = 0;
  let binaryPnl = 0;
  for (const b of binaryTrades) {
    if (b.status === 'settled') {
      if (b.result === 'win') {
        binaryWins += 1;
        binaryPnl += Number(b.payout || 0);
      } else if (b.result === 'lose') {
        binaryLosses += 1;
        binaryPnl -= Number(b.stake || 0);
      }
    }
  }

  const depositTotal = payments
    .filter(p => p.type === 'deposit' && p.status === 'approved')
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const withdrawTotal = payments
    .filter(p => p.type === 'withdraw' && p.status === 'approved')
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return {
    forexTrades,
    binaryTrades,
    aiTrade: {
      activeSession,
      sessions: aiSessions,
      events: aiEvents,
      totalEarned: aiTotalEarned
    },
    spotOrders,
    copyTrades,
    payments,
    activities,
    summary: {
      totalTrades: forexTrades.length + binaryTrades.length + aiSessions.length + spotOrders.length + copyTrades.length + (activeSession?.ai_trade_status === 'ON' && !aiSessions.some(s => s.status === 'active') ? 1 : 0),
      forexCount: forexTrades.length,
      forexOpenCount,
      forexPnl,
      binaryCount: binaryTrades.length,
      binaryWins,
      binaryLosses,
      binaryPnl,
      aiSessionCount: aiSessions.length + (activeSession?.ai_trade_status === 'ON' && !aiSessions.some(s => s.status === 'active') ? 1 : 0),
      aiTotalEarned,
      spotCount: spotOrders.length,
      copyCount: copyTrades.length,
      depositTotal,
      withdrawTotal,
      activityCount: activities.length
    }
  };
}

router.get('/me/history', requireAuth, (req, res) => {
  try {
    res.json(buildUserUnifiedHistory(req.user.id));
  } catch (err) {
    console.error('[USER HISTORY ERROR]', err);
    res.status(500).json({ error: 'Failed to load trading history' });
  }
});

router.get('/history/all', requireAuth, (req, res) => {
  try {
    res.json(buildUserUnifiedHistory(req.user.id));
  } catch (err) {
    console.error('[USER HISTORY ALL ERROR]', err);
    res.status(500).json({ error: 'Failed to load trading history' });
  }
});

router.get('/verifications/me', requireAuth, (req, res) => {
  const row = selectVerificationStmt.get(req.user.id);
  res.json(formatVerification(row));
});

router.post('/verifications', requireAuth, (req, res) => {
  try {
    const {
      document_type,
      document_name,
      document_country,
      document_front,
      document_back,
      selfie,
      notes
    } = req.body || {};

    const normalizedType = (document_type || '').trim().toLowerCase();
    if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
      return res.status(400).json({ error: 'Document type is required' });
    }

    const trimmedName = (document_name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    const trimmedCountry = (document_country || '').trim();
    if (!trimmedCountry) {
      return res.status(400).json({ error: 'Document issuing country is required' });
    }

    if (typeof document_front !== 'string' || !document_front.trim()) {
      return res.status(400).json({ error: 'Document front image is required' });
    }
    if (typeof document_back !== 'string' || !document_back.trim()) {
      return res.status(400).json({ error: 'Document back image is required' });
    }
    if (typeof selfie !== 'string' || !selfie.trim()) {
      return res.status(400).json({ error: 'Selfie image is required' });
    }

    upsertVerificationStmt.run(
      req.user.id,
      normalizedType,
      null,
      trimmedName,
      trimmedCountry,
      null,
      null,
      document_front.trim(),
      document_back.trim(),
      selfie.trim(),
      typeof notes === 'string' && notes.trim() ? notes.trim() : null
    );

    notifyAdmin({
      type: 'verification',
      title: '📝 New KYC Verification Request',
      message: `KYC verification submitted by ${req.user.email}.`,
      user_email: req.user.email,
      link: '/admin/verifications'
    });

    const saved = selectVerificationStmt.get(req.user.id);
    res.json(formatVerification(saved));
    void performFaceCheck(req.user.id);
  } catch (err) {
    console.error('Failed to save verification:', err);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
});

export default router;
