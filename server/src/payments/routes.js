import express from 'express';
import db from '../db.js';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import { generateDepositAddress, flushForwarder, getHotWalletStatus, checkUserDeposit } from './cryptoService.js';
import { HOT_WALLET_ADDRESS } from '../config.js';
import { deliverEmail } from '../utils/email.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';

const router = express.Router();

const selectMethodsByType = db.prepare(`
  SELECT * FROM payment_methods
  WHERE (? IS NULL OR type = ?)
  ORDER BY id DESC
`);

const insertMethod = db.prepare(`
  INSERT INTO payment_methods (type, name, network, address, tag, qr_url, active)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateMethod = db.prepare(`
  UPDATE payment_methods
  SET type = COALESCE(?, type),
      name = COALESCE(?, name),
      network = COALESCE(?, network),
      address = COALESCE(?, address),
      tag = COALESCE(?, tag),
      qr_url = COALESCE(?, qr_url),
      active = COALESCE(?, active),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const insertRequest = db.prepare(`
  INSERT INTO payment_requests (user_id, type, method_id, amount, address, tag, tx_ref, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
`);

const selectUserRequests = db.prepare(`
  SELECT pr.*, pm.name AS method_name, pm.network, u.email AS user_email
  FROM payment_requests pr
  LEFT JOIN payment_methods pm ON pm.id = pr.method_id
  LEFT JOIN users u ON u.id = pr.user_id
  WHERE pr.user_id = ?
  ORDER BY pr.created_at DESC
`);

const selectRequests = db.prepare(`
  SELECT pr.*, pm.name AS method_name, pm.network, u.email AS user_email
  FROM payment_requests pr
  LEFT JOIN payment_methods pm ON pm.id = pr.method_id
  LEFT JOIN users u ON u.id = pr.user_id
  WHERE (? IS NULL OR pr.type = ?)
  ORDER BY pr.created_at DESC
`);

const selectRequestById = db.prepare('SELECT * FROM payment_requests WHERE id = ?');
const updateRequestStatus = db.prepare(`
  UPDATE payment_requests
  SET status = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

// --- Public (user) routes ---
router.use(requireAuth);

router.get('/methods', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  const methods = selectMethodsByType.all(type, type).filter(m => m.active !== 0);
  res.json(methods);
});

router.get('/requests', (req, res) => {
  const rows = selectUserRequests.all(req.user.id);
  res.json(rows);
});

router.post('/deposit', (req, res) => {
  const { method_id, amount, tx_ref } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount required' });
  const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(method_id);
  if (!method || method.type !== 'deposit') return res.status(400).json({ error: 'Invalid deposit method' });
  insertRequest.run(req.user.id, 'deposit', method.id, amt, null, null, tx_ref || null);
  notifyAdmin({
    type: 'deposit',
    title: '💳 New Deposit Request',
    message: `$${amt} deposit request submitted by ${req.user.email}.`,
    user_email: req.user.email,
    link: '/admin/deposits'
  });
  res.json({ ok: true });
});

function isValidEVMAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

router.get('/deposit-address', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const userId = Number(req.user.id);
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // Always resolve the user's permanent, deterministic deposit address (never changes on reload)
    const permanentAddress = await generateDepositAddress(userId, req.user.email);

    if (req.query.refresh === '1') {
      await checkUserDeposit(userId).catch(() => {});
    } else {
      checkUserDeposit(userId).catch(() => {});
    }

    return res.json({ address: permanentAddress });
  } catch (error) {
    console.error('Error getting deposit address:', error);
    try {
      const permanentAddress = await generateDepositAddress(req.user.id, req.user.email);
      return res.json({ address: permanentAddress });
    } catch (e) {
      res.status(500).json({ error: 'Failed to retrieve deposit address.' });
    }
  }
});

router.post('/check-deposit', async (req, res) => {
  try {
    const userId = Number(req.user.id);
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const address = await generateDepositAddress(userId, req.user.email);
    const checkResult = await checkUserDeposit(userId);
    const bal = db.prepare('SELECT available, locked FROM balances WHERE user_id = ?').get(userId);
    const requests = selectUserRequests.all(userId);

    res.json({
      ok: true,
      address,
      credited: checkResult.credited || 0,
      swept: Boolean(checkResult.swept),
      balance: bal?.available || 0,
      requests
    });
  } catch (error) {
    console.error('Error checking deposit:', error);
    res.status(500).json({ error: 'Failed to check on-chain deposits.' });
  }
});


function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpExpiresAt(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// Step 1: Validate withdrawal details and send OTP to user's email
router.post('/withdraw/send-otp', async (req, res) => {
  const { method_id, amount, address, tag } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Valid amount is required' });
  if (!address) return res.status(400).json({ error: 'Wallet address is required' });
  const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(method_id);
  if (!method || method.type !== 'withdraw') return res.status(400).json({ error: 'Invalid withdraw method' });

  const bal = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(req.user.id);
  if (!bal || bal.available < amt) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const otpCode = generateOtpCode();
  const expires = otpExpiresAt(10);

  // Delete any existing pending OTP for this user
  db.prepare('DELETE FROM pending_withdraw_otps WHERE user_id = ?').run(req.user.id);

  // Store the pending withdrawal + OTP
  db.prepare(`
    INSERT INTO pending_withdraw_otps (user_id, method_id, amount, address, tag, otp_code, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, method.id, amt, address, tag || null, otpCode, expires);

  // Send the OTP via email
  const userEmail = req.user.email;
  let emailResult = { delivered: false };
  try {
    emailResult = await deliverEmail(userEmail, otpCode);
  } catch (err) {
    console.error('[WITHDRAW] OTP email error:', err);
  }

  if (!emailResult.delivered) {
    console.log(`[WITHDRAW] OTP fallback for user ${req.user.id} (${userEmail}): ${otpCode}`);
  }

  res.json({
    ok: true,
    message: 'Verification code sent to your email',
    devOtp: !emailResult.delivered ? emailResult.devCode || otpCode : undefined
  });
});

// Resend withdrawal OTP
router.post('/withdraw/resend-otp', async (req, res) => {
  const pending = db.prepare('SELECT * FROM pending_withdraw_otps WHERE user_id = ?').get(req.user.id);
  if (!pending) return res.status(400).json({ error: 'No pending withdrawal found. Please start again.' });

  const otpCode = generateOtpCode();
  const expires = otpExpiresAt(10);

  db.prepare('UPDATE pending_withdraw_otps SET otp_code = ?, expires_at = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(otpCode, expires, req.user.id);

  const userEmail = req.user.email;
  let emailResult = { delivered: false };
  try {
    emailResult = await deliverEmail(userEmail, otpCode);
  } catch (err) {
    console.error('[WITHDRAW] Resend OTP email error:', err);
  }

  if (!emailResult.delivered) {
    console.log(`[WITHDRAW] Resend OTP fallback for user ${req.user.id} (${userEmail}): ${otpCode}`);
  }

  res.json({
    ok: true,
    message: 'A new verification code has been sent to your email',
    devOtp: !emailResult.delivered ? emailResult.devCode || otpCode : undefined
  });
});

// Step 2: Verify OTP and process the withdrawal
router.post('/withdraw/verify', (req, res) => {
  const { otp } = req.body || {};
  if (!otp) return res.status(400).json({ error: 'Verification code is required' });

  const pending = db.prepare('SELECT * FROM pending_withdraw_otps WHERE user_id = ?').get(req.user.id);
  if (!pending) return res.status(400).json({ error: 'No pending withdrawal found. Please start again.' });

  if (pending.otp_code !== otp) return res.status(400).json({ error: 'Invalid verification code' });
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM pending_withdraw_otps WHERE user_id = ?').run(req.user.id);
    return res.status(400).json({ error: 'Verification code expired. Please start again.' });
  }

  // Re-check balance at verification time
  const bal = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(req.user.id);
  if (!bal || bal.available < pending.amount) {
    db.prepare('DELETE FROM pending_withdraw_otps WHERE user_id = ?').run(req.user.id);
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Process the withdrawal
  db.prepare('UPDATE balances SET available = available - ? WHERE user_id = ?').run(pending.amount, req.user.id);
  insertRequest.run(req.user.id, 'withdraw', pending.method_id, pending.amount, pending.address, pending.tag || null, null);

  notifyAdmin({
    type: 'withdrawal',
    title: '💸 New Withdrawal Request',
    message: `$${pending.amount} withdrawal request submitted by ${req.user.email}.`,
    user_email: req.user.email,
    link: '/admin/withdrawals'
  });

  // Clean up the pending OTP
  db.prepare('DELETE FROM pending_withdraw_otps WHERE user_id = ?').run(req.user.id);

  res.json({ ok: true, message: 'Withdrawal submitted successfully' });
});

// Legacy direct withdraw (kept for backwards compatibility)
router.post('/withdraw', (req, res) => {
  const { method_id, amount, address, tag } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount required' });
  if (!address) return res.status(400).json({ error: 'address required' });
  const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(method_id);
  if (!method || method.type !== 'withdraw') return res.status(400).json({ error: 'Invalid withdraw method' });

  const bal = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(req.user.id);
  if (!bal || bal.available < amt) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  db.prepare('UPDATE balances SET available = available - ? WHERE user_id = ?').run(amt, req.user.id);
  insertRequest.run(req.user.id, 'withdraw', method.id, amt, address, tag || null, null);
  res.json({ ok: true });
});

// --- Admin routes ---
const adminRouter = express.Router();
adminRouter.use(requireAuth);
adminRouter.use(requireAdminRole('users'));

adminRouter.get('/methods', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  res.json(selectMethodsByType.all(type, type));
});

adminRouter.post('/methods', (req, res) => {
  const { type, name, network, address, tag, qr_url, active = 1 } = req.body || {};
  if (!type || !name) return res.status(400).json({ error: 'type and name required' });
  const result = insertMethod.run(type, name, network || '', address || '', tag || '', qr_url || '', active ? 1 : 0);
  res.json({ ok: true, id: result.lastInsertRowid });
});

adminRouter.put('/methods/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
  if (!method) return res.status(404).json({ error: 'method not found' });
  const { type, name, network, address, tag, qr_url, active } = req.body || {};
  updateMethod.run(
    type !== undefined ? type : null, 
    name !== undefined ? name : null, 
    network !== undefined ? network : null, 
    address !== undefined ? address : null, 
    tag !== undefined ? tag : null, 
    qr_url !== undefined ? qr_url : null, 
    active === undefined ? null : (active ? 1 : 0), 
    id
  );
  res.json({ ok: true });
});

adminRouter.get('/requests', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  res.json(selectRequests.all(type, type));
});

function settleRequestStatus(id, status) {
  const row = selectRequestById.get(id);
  if (!row) return { error: 'Request not found' };
  if (row.status !== 'pending') return { error: 'Already processed' };
  if (status === 'approved' && row.type === 'deposit') {
    db.prepare('UPDATE balances SET available = COALESCE(available,0) + ? WHERE user_id = ?').run(row.amount, row.user_id);
  }
  if (status === 'declined' && row.type === 'withdraw') {
    // refund the withheld balance
    db.prepare('UPDATE balances SET available = COALESCE(available,0) + ? WHERE user_id = ?').run(row.amount, row.user_id);
  }
  updateRequestStatus.run(status, id);
  return { ok: true };
}

adminRouter.post('/requests/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  const result = settleRequestStatus(id, 'approved');
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

adminRouter.post('/requests/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const result = settleRequestStatus(id, 'declined');
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

adminRouter.put('/requests/:id/amount', (req, res) => {
  const id = Number(req.params.id);
  const { amount } = req.body;
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'invalid amount' });
  
  const reqRow = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  
  const diff = amount - reqRow.amount;
  db.transaction(() => {
    db.prepare('UPDATE payment_requests SET amount = ? WHERE id = ?').run(amount, id);
    if (reqRow.type === 'deposit' && reqRow.status === 'approved') {
      db.prepare('UPDATE balances SET available = available + ? WHERE user_id = ?').run(diff, reqRow.user_id);
    } else if (reqRow.type === 'withdraw' && (reqRow.status === 'pending' || reqRow.status === 'approved')) {
      db.prepare('UPDATE balances SET available = available - ? WHERE user_id = ?').run(diff, reqRow.user_id);
    }
  })();
  res.json({ ok: true, newAmount: amount });
});


adminRouter.post('/requests/:id/decline', (req, res) => {
  const id = Number(req.params.id);
  const result = settleRequestStatus(id, 'declined');
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

adminRouter.get('/smart-wallets', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id as user_id, email, deposit_address
      FROM users
      WHERE deposit_address IS NOT NULL
      ORDER BY id DESC
    `).all();
    
    // Also fetch recent crypto deposits from activity_logs for these users if desired, or just send the users
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch smart wallets' });
  }
});

adminRouter.post('/flush-address', async (req, res) => {
  try {
    const { forwarderAddress, tokenAddress } = req.body;
    if (!forwarderAddress) return res.status(400).json({ error: 'forwarderAddress required' });
    
    // Look up userId if this is an EOA wallet linked to a user
    const user = db.prepare('SELECT id FROM users WHERE deposit_address = ? COLLATE NOCASE').get(forwarderAddress);
    const userId = user ? user.id : null;
    
    await flushForwarder(forwarderAddress, tokenAddress, userId);
    res.json({ ok: true, message: 'Flush transaction sent successfully' });
  } catch (error) {
    console.error('Error flushing forwarder:', error);
    res.status(500).json({ error: error.message || 'Failed to flush forwarder' });
  }
});


adminRouter.get('/hot-wallet-status', async (req, res) => {
  const status = await getHotWalletStatus();
  res.json(status);
});

adminRouter.post('/users/:id/manual', (req, res) => {
  const userId = Number(req.params.id);
  const { type, amount } = req.body;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'invalid amount' });
  if (type !== 'deposit' && type !== 'withdraw') return res.status(400).json({ error: 'invalid type' });
  
  db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status) 
      VALUES (?, ?, ?, 'Manual Entry', ?, 'approved')
    `).run(userId, type, amount, `MANUAL-${Date.now()}`);
    
    if (type === 'deposit') {
      db.prepare('UPDATE balances SET available = COALESCE(available,0) + ? WHERE user_id = ?').run(amount, userId);
    } else {
      db.prepare('UPDATE balances SET available = COALESCE(available,0) - ? WHERE user_id = ?').run(amount, userId);
    }
    
    db.prepare('INSERT INTO activity_logs (user_id, actor_role, action, meta) VALUES (?, ?, ?, ?)')
      .run(userId, 'admin', `manual_${type}`, JSON.stringify({ amount, actor: req.user.id }));
  })();
  res.json({ ok: true });
});

export { router as paymentsRouter, adminRouter as adminPaymentsRouter };
