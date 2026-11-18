import express from 'express';
import { requireAuth } from '../auth/authMiddleware.js';
import db from '../db.js';
import { emitSocket } from '../market/engine.js';
import { buildOtpAuthUri, generateTotpSecret, verifyTotpCode } from '../utils/totp.js';

const router = express.Router();

const ensureSecurityRowStmt = db.prepare(`
  INSERT INTO user_security (user_id, email_verified, phone_verified)
  VALUES (?, 1, 0)
  ON CONFLICT(user_id) DO NOTHING
`);

router.use(requireAuth);

router.get('/status', (req, res) => {
  ensureSecurityRowStmt.run(req.user.id);
  const row = db.prepare(`
    SELECT totp_enabled, totp_verified_at,
           CASE WHEN totp_pending_secret IS NOT NULL AND totp_pending_secret != '' THEN 1 ELSE 0 END AS pending_setup
    FROM user_security
    WHERE user_id = ?
  `).get(req.user.id);

  res.json({
    totp_enabled: Boolean(row?.totp_enabled),
    totp_verified_at: row?.totp_verified_at || null,
    pending_setup: Boolean(row?.pending_setup)
  });
});

// Step 1: Generate a new TOTP secret & otpauth:// URI for Google Authenticator setup
router.post('/totp/setup', (req, res) => {
  ensureSecurityRowStmt.run(req.user.id);
  const existing = db.prepare('SELECT totp_enabled FROM user_security WHERE user_id = ?').get(req.user.id);
  if (existing?.totp_enabled) {
    return res.status(400).json({ error: 'Google Authenticator is already enabled on this account.' });
  }

  const secret = generateTotpSecret(20);
  db.prepare(`
    UPDATE user_security
    SET totp_pending_secret = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(secret, req.user.id);

  const account = req.user.email || `user-${req.user.id}`;
  const otpauthUrl = buildOtpAuthUri({ secret, account, issuer: 'AvaPartner' });

  res.json({
    ok: true,
    secret,
    otpauthUrl,
    issuer: 'AvaPartner',
    account
  });
});

// Step 2: Verify the 6-digit code from Google Authenticator and activate 2FA
function handleVerifySetup(req, res) {
  const { code } = req.body || {};
  const cleanCode = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Enter the 6-digit code from Google Authenticator.' });
  }

  const row = db.prepare('SELECT totp_enabled, totp_pending_secret FROM user_security WHERE user_id = ?').get(req.user.id);
  if (row?.totp_enabled) {
    return res.status(400).json({ error: 'Google Authenticator is already enabled.' });
  }
  if (!row?.totp_pending_secret) {
    return res.status(400).json({ error: 'No setup in progress. Click "Set up Google Authenticator" first.' });
  }

  if (!verifyTotpCode(row.totp_pending_secret, cleanCode)) {
    return res.status(400).json({ error: 'Invalid 6-digit code. Check the current code in your Google Authenticator app and try again.' });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE user_security
      SET totp_secret = ?,
          totp_pending_secret = NULL,
          totp_enabled = 1,
          totp_verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(row.totp_pending_secret, req.user.id);

    db.prepare('INSERT INTO activity_logs (user_id, actor_role, action, meta) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'user', 'totp_enabled', JSON.stringify({ provider: 'Google Authenticator' }));

    db.prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)')
      .run(req.user.id, 'Google Authenticator Enabled', '2FA protection is now active. Withdrawals will require your 6-digit Google Authenticator code.');
  })();

  emitSocket('user_data_update', { user_id: req.user.id, type: 'security_updated', totp_enabled: true });

  res.json({
    ok: true,
    totp_enabled: true,
    message: 'Google Authenticator enabled successfully.'
  });
}

router.post('/totp/verify-setup', handleVerifySetup);
router.post('/totp/enable', handleVerifySetup);

router.post('/totp/cancel', (req, res) => {
  db.prepare('UPDATE user_security SET totp_pending_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Disable Google Authenticator (requires a valid 6-digit code from the active app)
router.post('/totp/disable', (req, res) => {
  const { code } = req.body || {};
  const cleanCode = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Enter your current 6-digit Google Authenticator code to disable 2FA.' });
  }

  const row = db.prepare('SELECT totp_enabled, totp_secret FROM user_security WHERE user_id = ?').get(req.user.id);
  if (!row?.totp_enabled || !row?.totp_secret) {
    return res.status(400).json({ error: 'Google Authenticator is not currently enabled.' });
  }

  if (!verifyTotpCode(row.totp_secret, cleanCode)) {
    return res.status(400).json({ error: 'Invalid Google Authenticator code.' });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE user_security
      SET totp_secret = NULL,
          totp_pending_secret = NULL,
          totp_enabled = 0,
          totp_verified_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(req.user.id);

    db.prepare('INSERT INTO activity_logs (user_id, actor_role, action, meta) VALUES (?, ?, ?, ?)')
      .run(req.user.id, 'user', 'totp_disabled', JSON.stringify({ provider: 'Google Authenticator' }));
  })();

  emitSocket('user_data_update', { user_id: req.user.id, type: 'security_updated', totp_enabled: false });

  res.json({
    ok: true,
    totp_enabled: false,
    message: 'Google Authenticator has been disabled.'
  });
});

export default router;
