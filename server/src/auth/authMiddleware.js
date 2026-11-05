import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET, INITIAL_BALANCE } from '../config.js';
import db from '../db.js';
import { makeReferralCode } from '../utils.js';
import { generateDepositAddress, ensureRecoveredDepositForUser } from '../payments/cryptoService.js';

const selectPermissionsStmt = db.prepare('SELECT permissions FROM admin_permissions WHERE user_id = ?');

function getPermissionsForUser(userId) {
  if (!Number.isInteger(userId)) return [];
  const row = selectPermissionsStmt.get(userId);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.permissions || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function parseClientUserProfile(req) {
  try {
    const raw = req.headers['x-user-profile'];
    if (!raw || typeof raw !== 'string') return null;
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (_) {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Ensure user row exists in SQLite (auto-heals if ephemeral container restarted while JWT is active)
    if (payload && (payload.id || payload.email)) {
      const normalizedEmail = (payload.email || '').trim().toLowerCase();
      let dbUser = normalizedEmail
        ? db.prepare('SELECT id, email, name, handle, role FROM users WHERE LOWER(email) = ?').get(normalizedEmail)
        : null;

      if (!dbUser && payload.id) {
        dbUser = db.prepare('SELECT id, email, name, handle, role FROM users WHERE id = ?').get(Number(payload.id));
      }

      const clientProfile = parseClientUserProfile(req);

      if (!dbUser && normalizedEmail) {
        const profileName = payload.name || clientProfile?.name || normalizedEmail.split('@')[0];
        const profileHandle = payload.handle || clientProfile?.handle || `user_${Math.floor(1000 + Math.random() * 9000)}`;
        const refCode = clientProfile?.referral_code || makeReferralCode();
        const defaultPass = 'Password123!';
        const defaultHash = bcrypt.hashSync(defaultPass, 10);
        const targetId = Number(payload.id) || undefined;

        try {
          if (targetId) {
            db.prepare(`
              INSERT OR IGNORE INTO users (id, email, password_hash, raw_password, name, handle, referral_code, role)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetId, normalizedEmail, defaultHash, defaultPass, profileName, profileHandle, refCode, payload.role || 'user');
          } else {
            db.prepare(`
              INSERT OR IGNORE INTO users (email, password_hash, raw_password, name, handle, referral_code, role)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(normalizedEmail, defaultHash, defaultPass, profileName, profileHandle, refCode, payload.role || 'user');
          }
          dbUser = db.prepare('SELECT id, email, name, handle, role FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
          if (dbUser) {
            db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, ?, 0)').run(dbUser.id, INITIAL_BALANCE);
            generateDepositAddress(dbUser.id, dbUser.email).catch(() => {});
          }
        } catch (restoreErr) {
          console.error('[AUTH RESTORE ERROR]', restoreErr.message);
        }
      } else if (dbUser && clientProfile?.name && (!dbUser.name || dbUser.name === '')) {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(clientProfile.name, dbUser.id);
      }

      if (dbUser) {
        payload.id = dbUser.id;
        payload.email = dbUser.email;
        payload.role = dbUser.role || payload.role;
        ensureRecoveredDepositForUser(dbUser.id);
      }
    }

    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireAdminRole(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    if (req.user.role === 'subadmin') {
      if (!permission) {
        return next();
      }
      const perms = getPermissionsForUser(req.user.id);
      if (perms.includes('all') || perms.includes(permission)) {
        return next();
      }
      return res.status(403).json({ error: 'Permission denied' });
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

export function requireAdmin(req, res, next) {
  return requireAdminRole()(req, res, next);
}
