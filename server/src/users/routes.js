import express from 'express';
import db, { recordActivity } from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { performFaceCheck } from '../faceCheck.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';
import { settleExpiredTrades } from '../binary/routes.js';
import {
  computeAccountStrength,
  getVerificationSettings,
  isUserGoldVerified
} from '../verifications/settings.js';

const router = express.Router();

const selectVerificationStmt = db.prepare(`
  SELECT
    document_type,
    document_number,
    document_name,
    first_name,
    last_name,
    phone_number,
    father_or_spouse_name,
    village_address,
    city,
    state_province,
    postal_code,
    document_country,
    document_birthdate,
    document_expires_at,
    document_front,
    document_back,
    selfie,
    status,
    gold_badge,
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
  INSERT INTO verifications (
    user_id, document_type, document_number, document_name,
    first_name, last_name, phone_number, father_or_spouse_name,
    village_address, city, state_province, postal_code,
    document_country, document_birthdate, document_expires_at,
    document_front, document_back, selfie, status, gold_badge, notes,
    submitted_at, updated_at
  )
  VALUES (
    ?, ?, NULLIF(?, ''), ?,
    NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''),
    NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''),
    NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''),
    NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
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
    document_front = COALESCE(excluded.document_front, verifications.document_front),
    document_back = COALESCE(excluded.document_back, verifications.document_back),
    selfie = COALESCE(excluded.selfie, verifications.selfie),
    status = excluded.status,
    gold_badge = excluded.gold_badge,
    notes = excluded.notes,
    submitted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`);

const ALLOWED_DOCUMENT_TYPES = new Set(['nid', 'passport', 'driver_license']);

function toImageDataUrl(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('data:image/') ? trimmed : `data:image/jpeg;base64,${trimmed}`;
}

function getEnrichedUser(userId) {
  const u = db.prepare('SELECT id, email, name, handle, referral_code, avatar, role, created_at FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const v = db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(userId);
  const settings = getVerificationSettings(db);
  const strength = computeAccountStrength(v, u);
  return {
    ...u,
    verification_status: v?.status || 'not_started',
    gold_verified: strength.gold_verified,
    verified_badge_label: settings.gold_badge_label,
    nid_feature_enabled: settings.nid_feature_enabled,
    account_strength: strength
  };
}

function formatVerification(row, userRow = null) {
  const settings = getVerificationSettings(db);
  const strength = computeAccountStrength(row, userRow);
  const clientSettings = {
    nid_feature_enabled: settings.nid_feature_enabled,
    gold_badge_label: settings.gold_badge_label,
    require_front_back: settings.require_front_back,
    require_address: settings.require_address,
    require_selfie: settings.require_selfie,
    section_title: settings.section_title,
    section_subtitle: settings.section_subtitle
  };
  if (!row) {
    return {
      status: 'not_started',
      gold_verified: false,
      account_strength: strength,
      settings: clientSettings
    };
  }
  const splitParts = String(row.document_name || '').trim().split(/\s+/).filter(Boolean);
  const fallbackFirst = row.first_name || splitParts[0] || '';
  const fallbackLast = row.last_name || (splitParts.length > 1 ? splitParts.slice(1).join(' ') : '');
  return {
    document_type: row.document_type || 'nid',
    document_number: row.document_number || '',
    first_name: fallbackFirst,
    last_name: fallbackLast,
    document_name: row.document_name || `${fallbackFirst} ${fallbackLast}`.trim(),
    phone_number: row.phone_number || '',
    father_or_spouse_name: row.father_or_spouse_name || '',
    village_address: row.village_address || '',
    city: row.city || '',
    state_province: row.state_province || '',
    postal_code: row.postal_code || '',
    document_country: row.document_country || '',
    document_birthdate: row.document_birthdate || '',
    document_expires_at: row.document_expires_at || '',
    document_front: toImageDataUrl(row.document_front),
    document_back: toImageDataUrl(row.document_back),
    selfie: toImageDataUrl(row.selfie),
    status: row.status || 'pending',
    gold_badge: isUserGoldVerified(row),
    gold_verified: isUserGoldVerified(row),
    notes: row.notes,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    has_document_front: Boolean(row.has_document_front || row.document_front),
    has_document_back: Boolean(row.has_document_back || row.document_back),
    has_selfie: Boolean(row.has_selfie || row.selfie),
    face_similarity: row.face_similarity ?? 0,
    face_confidence: row.face_confidence ?? 0,
    face_checked_at: row.face_checked_at,
    face_check_notes: row.face_check_notes,
    account_strength: strength,
    settings: clientSettings
  };
}

const MAX_AVATAR_LENGTH = 1_500_000;
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

router.get('/me', requireAuth, (req, res) => {
  res.json(getEnrichedUser(req.user.id));
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

  recordActivity(req.user.id, req.user.role || 'user', 'profile_updated', {
    updated_name: Boolean(trimmedName),
    updated_handle: Boolean(trimmedHandle),
    updated_avatar: hasAvatarUpdate
  });

  res.json(getEnrichedUser(req.user.id));
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

const MAX_KYC_IMAGE_CHARS = 5_000_000;

function handleUpsertVerification(req, res) {
  try {
    const settings = getVerificationSettings(db);
    if (!settings.nid_feature_enabled) {
      return res.status(403).json({ error: 'Identity verification is temporarily disabled by admin.' });
    }

    const body = req.body || {};
    const existing = db.prepare('SELECT * FROM verifications WHERE user_id = ?').get(req.user.id);
    const isDraft = String(body.mode || '').toLowerCase() === 'draft';

    const rawType = String(body.document_type || existing?.document_type || 'nid').trim().toLowerCase();
    const normalizedType = ALLOWED_DOCUMENT_TYPES.has(rawType) ? rawType : 'nid';

    const firstName = String(body.first_name ?? existing?.first_name ?? '').trim();
    const lastName = String(body.last_name ?? existing?.last_name ?? '').trim();
    const combinedName = `${firstName} ${lastName}`.trim() || String(body.document_name ?? existing?.document_name ?? '').trim();

    const docNumber = String(body.document_number ?? existing?.document_number ?? '').trim();
    const docBirthdate = String(body.document_birthdate ?? existing?.document_birthdate ?? '').trim();
    const docExpires = String(body.document_expires_at ?? existing?.document_expires_at ?? '').trim();
    const phoneNum = String(body.phone_number ?? existing?.phone_number ?? '').trim();
    const fatherSpouse = String(body.father_or_spouse_name ?? existing?.father_or_spouse_name ?? '').trim();
    const villageAddress = String(body.village_address ?? existing?.village_address ?? '').trim();
    const city = String(body.city ?? existing?.city ?? '').trim();
    const stateProvince = String(body.state_province ?? existing?.state_province ?? '').trim();
    const postalCode = String(body.postal_code ?? existing?.postal_code ?? '').trim();
    const country = String(body.document_country ?? existing?.document_country ?? '').trim();

    const newFront = typeof body.document_front === 'string' && body.document_front.trim() ? body.document_front.trim() : null;
    const newBack = typeof body.document_back === 'string' && body.document_back.trim() ? body.document_back.trim() : null;
    const newSelfie = typeof body.selfie === 'string' && body.selfie.trim() ? body.selfie.trim() : null;

    if ((newFront && newFront.length > MAX_KYC_IMAGE_CHARS) ||
        (newBack && newBack.length > MAX_KYC_IMAGE_CHARS) ||
        (newSelfie && newSelfie.length > MAX_KYC_IMAGE_CHARS)) {
      return res.status(400).json({ error: 'Uploaded image is too large. Please upload a clear standard photo under 3MB.' });
    }

    const effectiveFront = newFront || existing?.document_front || null;
    const effectiveBack = newBack || existing?.document_back || null;
    const effectiveSelfie = newSelfie || existing?.selfie || null;

    if (!isDraft) {
      if (!firstName || !lastName) {
        return res.status(400).json({ error: 'First name and last name (matching your NID) are required.' });
      }
      if (!docNumber) {
        return res.status(400).json({ error: 'NID / Document number is required.' });
      }
      if (settings.require_address && (!villageAddress || !city || !stateProvince || !country)) {
        return res.status(400).json({ error: 'Village / street address, city, state / division, and country are required.' });
      }
      if (settings.require_front_back && (!effectiveFront || !effectiveBack)) {
        return res.status(400).json({ error: 'Please upload both NID front part and NID back part images.' });
      }
      if (settings.require_selfie && !effectiveSelfie) {
        return res.status(400).json({ error: 'Please upload a selfie photo for identity matching.' });
      }
    } else if (!combinedName && !docNumber && !villageAddress && !city && !country && !effectiveFront && !effectiveBack) {
      return res.status(400).json({ error: 'Please enter at least your name, address, or upload an NID photo to save.' });
    }

    let nextStatus = existing?.status || 'pending';
    let nextGoldBadge = isUserGoldVerified(existing) ? 1 : 0;

    if (!isDraft) {
      if (settings.auto_approve) {
        nextStatus = 'approved';
        nextGoldBadge = 1;
      } else {
        nextStatus = 'awaiting_approval';
        nextGoldBadge = 0;
      }
    } else if (nextStatus === 'not_started') {
      nextStatus = 'pending';
    }

    const nextNotes = typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : (isDraft ? (existing?.notes || null) : null);

    upsertVerificationStmt.run(
      req.user.id,
      normalizedType,
      docNumber,
      combinedName || 'Pending Name',
      firstName,
      lastName,
      phoneNum,
      fatherSpouse,
      villageAddress,
      city,
      stateProvince,
      postalCode,
      country,
      docBirthdate,
      docExpires,
      newFront,
      newBack,
      newSelfie,
      nextStatus,
      nextGoldBadge,
      nextNotes
    );

    if (!isDraft && !settings.auto_approve) {
      notifyAdmin({
        type: 'verification',
        title: '🪪 New NID Identity Submission',
        message: `${combinedName || req.user.email} (${country || 'Unknown'}) submitted NID Front & Back identity for Gold Badge approval.`,
        user_email: req.user.email,
        link: '/admin/verifications'
      });
    }

    const saved = selectVerificationStmt.get(req.user.id);
    const userRow = db.prepare('SELECT id, email, name, avatar FROM users WHERE id = ?').get(req.user.id);
    recordActivity(req.user.id, req.user.role || 'user', isDraft ? 'verification_draft_saved' : 'verification_submitted', {
      document_type: normalizedType,
      country: country || null,
      status: nextStatus
    });
    res.json(formatVerification(saved, userRow));
    if (!isDraft && effectiveFront && effectiveSelfie) {
      void performFaceCheck(req.user.id);
    }
  } catch (err) {
    console.error('Failed to save verification:', err);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
}

router.get('/verifications/me', requireAuth, (req, res) => {
  const row = selectVerificationStmt.get(req.user.id);
  const userRow = db.prepare('SELECT id, email, name, avatar FROM users WHERE id = ?').get(req.user.id);
  res.json(formatVerification(row, userRow));
});

router.put('/verifications/me', requireAuth, handleUpsertVerification);
router.post('/verifications', requireAuth, handleUpsertVerification);

export default router;
