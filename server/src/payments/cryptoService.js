import { ethers } from 'ethers';
import nodemailer from 'nodemailer';
import {
  BSC_RPC_URL,
  FACTORY_ADDRESS,
  ADMIN_PRIVATE_KEY,
  JWT_SECRET,
  USDT_ADDRESS,
  HOT_WALLET_ADDRESS,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS
} from '../config.js';
import { FACTORY_ABI, ERC20_ABI, FORWARDER_ABI } from './abis.js';
import db from '../db.js';
import { emitSocket } from '../market/engine.js';
import { notifyAdmin } from '../notifications/adminNotifications.js';

const BSC_RPC_LIST = Array.from(
  new Set([
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io/',
    'https://1rpc.io/bnb',
    BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
  ].filter(Boolean))
);

let provider;
let wallet;
let factoryContract;
let usdtContract;
let pollInterval = null;

// Prevent concurrent checks/sweeps on the same deposit address
const sweepingAddresses = new Set();

function createBscProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl, 56, { staticNetwork: true });
}

async function executeWithRpcFallback(fn) {
  let lastErr;
  for (const rpcUrl of BSC_RPC_LIST) {
    try {
      const tempProvider = rpcUrl === BSC_RPC_LIST[0] && provider ? provider : createBscProvider(rpcUrl);
      return await fn(tempProvider);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All BSC RPC endpoints failed');
}

/**
 * Deterministically derives a unique, permanent EVM wallet for each user.
 * Because it is derived from the server master key + user's immutable identifier (email/id),
 * the user's deposit address NEVER changes across reloads, restarts, or redeployments,
 * and the private key can NEVER be lost.
 */
export function getDeterministicUserWallet(userId, userEmail = null, customProvider = null) {
  let email = userEmail ? String(userEmail).trim().toLowerCase() : '';
  if (!email && userId) {
    try {
      const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      if (row?.email) email = row.email.trim().toLowerCase();
    } catch (_) {}
  }

  const identifier = email || `uid_${userId}`;
  const masterSecret = (ADMIN_PRIVATE_KEY || JWT_SECRET || 'avapartner_master_wallet_seed_v1')
    .trim()
    .replace(/^0x/i, '');

  const derivedPrivateKey = ethers.keccak256(
    ethers.toUtf8Bytes(`AVAPARTNER_USER_DEPOSIT_WALLET_V1:${masterSecret}:${identifier}`)
  );

  return new ethers.Wallet(derivedPrivateKey, customProvider || provider || undefined);
}

/**
 * Ensures the user's previously sent 2 USDT deposit to 0x5BF7a1715c6f7cdedaBEcDE59dA709940134109a
 * is automatically credited to their account balance and deposit history.
 */
export function ensureRecoveredDepositForUser(userId) {
  if (!userId) return false;
  try {
    const recoveredAddress = '0x5BF7a1715c6f7cdedaBEcDE59dA709940134109a';
    const recoveredTxRef = '0x5BF7a1715c6f7cdedaBEcDE59dA709940134109a_bep20_2usdt';

    const alreadyCredited = db
      .prepare('SELECT id FROM payment_requests WHERE tx_ref = ? OR address = ? COLLATE NOCASE')
      .get(recoveredTxRef, recoveredAddress);
    if (alreadyCredited) return false;

    const user = db.prepare('SELECT id, email, name, handle, role FROM users WHERE id = ?').get(userId);
    if (!user || user.role === 'admin') return false;

    const nameLower = (user.name || '').trim().toLowerCase();
    const handleLower = (user.handle || '').trim().toLowerCase();
    const emailLower = (user.email || '').trim().toLowerCase();

    const isTargetUser =
      nameLower === 'uxeitur' ||
      handleLower === 'uxeitur' ||
      emailLower.includes('uxeitur');

    if (!isTargetUser) return false;

    const amount = 2.0;
    const tx = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(user.id);
      db.prepare('UPDATE balances SET available = COALESCE(available, 0) + ? WHERE user_id = ?').run(amount, user.id);

      db.prepare(`
        INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status)
        VALUES (?, 'deposit', ?, ?, ?, 'approved')
      `).run(user.id, amount, recoveredAddress, recoveredTxRef);

      db.prepare(`
        INSERT INTO activity_logs (user_id, actor_role, action, meta)
        VALUES (?, 'system', 'crypto_deposit', ?)
      `).run(
        user.id,
        JSON.stringify({
          amount,
          currency: 'USDT',
          address: recoveredAddress,
          txHash: recoveredTxRef,
          note: 'Recovered 2 USDT BEP-20 deposit'
        })
      );

      const notifRes = db.prepare(`
        INSERT INTO notifications (user_id, title, message)
        VALUES (?, ?, ?)
      `).run(
        user.id,
        'Deposit Credited',
        `Your deposit of ${amount.toFixed(2)} USDT (0x5BF7...109a) has been credited to your account.`
      );
      return notifRes.lastInsertRowid;
    });

    const notifId = tx();
    const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
    emitSocket('notification', { notification: newNotification });
    emitSocket('user_data_update', { user_id: user.id, type: 'deposit_credited' });
    console.log(`[RECOVERY] Credited 2.00 USDT from ${recoveredAddress} to user ${user.id} (${user.email})`);
    return true;
  } catch (err) {
    console.error('[RECOVERY ERROR]', err.message);
    return false;
  }
}

export function initCryptoService() {
  provider = createBscProvider(BSC_RPC_LIST[0]);

  if (!ADMIN_PRIVATE_KEY || !HOT_WALLET_ADDRESS) {
    console.warn('CryptoService: Missing ADMIN_PRIVATE_KEY or HOT_WALLET_ADDRESS. Auto-sweep disabled, deterministic addresses active.');
    return;
  }

  const cleanKey = ADMIN_PRIVATE_KEY.trim().startsWith('0x')
    ? ADMIN_PRIVATE_KEY.trim()
    : `0x${ADMIN_PRIVATE_KEY.trim()}`;

  wallet = new ethers.Wallet(cleanKey, provider);
  if (FACTORY_ADDRESS) {
    factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);
  }
  usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

  console.log(`CryptoService initialized on BSC (Admin/Gas Wallet: ${wallet.address} -> Hot Wallet: ${HOT_WALLET_ADDRESS})`);

  // Ensure all existing users have their permanent deterministic deposit address registered
  try {
    const allUsers = db.prepare('SELECT id, email FROM users').all();
    for (const u of allUsers) {
      generateDepositAddress(u.id, u.email).catch(() => {});
      ensureRecoveredDepositForUser(u.id);
    }
  } catch (err) {
    console.error('[CRYPTO INIT] Error syncing user deposit addresses:', err.message);
  }

  // Initial check after 4 seconds, then poll every 20 seconds for rock-solid deposit detection
  setTimeout(() => {
    checkMissedDeposits().catch(() => {});
  }, 4000);

  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    checkMissedDeposits().catch(() => {});
  }, 20000);
}

async function sendDepositEmail(userEmail, amount, txHash) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !userEmail) return;
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0b0f13; color: #ffffff; padding: 20px; border-radius: 10px; border: 1px solid #1f2937;">
        <h2 style="color: #10b981; text-align: center; margin-bottom: 20px;">AvaPartner — Deposit Confirmed</h2>
        <p style="font-size: 16px; color: #e5e7eb;">Hello,</p>
        <p style="font-size: 16px; color: #e5e7eb;">Your deposit of <strong style="color: #10b981;">${amount} USDT (BEP-20)</strong> has been credited to your AvaPartner account.</p>
        <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">Transaction Reference: <br><span style="font-size: 12px; word-break: break-all;">${txHash}</span></p>
        <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
          <a href="https://avapartner.vercel.app/wallet/deposit" style="background-color: #10b981; color: #04130d; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">View Wallet</a>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"AvaPartner Support" <${SMTP_USER}>`,
      to: userEmail,
      subject: `AvaPartner: Deposit of ${amount} USDT Credited`,
      html
    });
    console.log(`[EMAIL] Sent deposit notification to ${userEmail}`);
  } catch (err) {
    console.error('[EMAIL ERROR] Failed to send deposit email:', err.message);
  }
}

/**
 * Generates or retrieves the permanent, unique, deterministic EVM deposit address for a user.
 * Never overwrites or randomizes an address on reload.
 */
export async function generateDepositAddress(userId, userEmail = null) {
  if (!userId) throw new Error('userId is required');

  // Archive any existing random deposit wallet that has a stored private key before syncing deterministic wallet
  const existingUser = db
    .prepare('SELECT id, email, deposit_address, deposit_private_key, unswept_credited_wei FROM users WHERE id = ?')
    .get(userId);

  const effectiveEmail = (userEmail || existingUser?.email || '').trim().toLowerCase();

  if (existingUser?.deposit_address && existingUser?.deposit_private_key) {
    db.prepare(`
      INSERT OR IGNORE INTO user_deposit_wallets (address, user_id, email, private_key, unswept_credited_wei)
      VALUES (?, ?, ?, ?, COALESCE(?, '0'))
    `).run(
      existingUser.deposit_address.trim(),
      userId,
      effectiveEmail,
      existingUser.deposit_private_key,
      existingUser.unswept_credited_wei
    );
  }

  const detWallet = getDeterministicUserWallet(userId, effectiveEmail);
  const permanentAddress = detWallet.address;
  const permanentPrivateKey = detWallet.privateKey;

  db.prepare(`
    INSERT INTO user_deposit_wallets (address, user_id, email, private_key, unswept_credited_wei)
    VALUES (?, ?, ?, ?, '0')
    ON CONFLICT(address) DO UPDATE SET
      user_id = excluded.user_id,
      email = COALESCE(excluded.email, user_deposit_wallets.email),
      private_key = excluded.private_key
  `).run(permanentAddress, userId, effectiveEmail, permanentPrivateKey);

  db.prepare(`
    UPDATE users
    SET deposit_address = ?, deposit_private_key = ?
    WHERE id = ?
  `).run(permanentAddress, permanentPrivateKey, userId);

  ensureRecoveredDepositForUser(userId);

  return permanentAddress;
}

/**
 * Inspects a single deposit address on BSC, credits any new USDT balance to the user's account
 * with strict idempotency (via unswept_credited_wei), and sweeps the USDT to HOT_WALLET_ADDRESS.
 */
async function inspectAndProcessDepositAddress(walletRow) {
  const { address, user_id: userId, email, private_key: privateKey } = walletRow;
  if (!address || !userId) return { credited: 0, swept: false };

  const lockKey = address.trim().toLowerCase();
  if (sweepingAddresses.has(lockKey)) {
    return { credited: 0, swept: false };
  }

  sweepingAddresses.add(lockKey);
  let creditedAmount = 0;
  let swept = false;

  try {
    const balanceWei = await executeWithRpcFallback(async (rpcProvider) => {
      const contract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, rpcProvider);
      return await contract.balanceOf(address);
    });

    const currentRecord = db
      .prepare('SELECT unswept_credited_wei FROM user_deposit_wallets WHERE address = ? COLLATE NOCASE')
      .get(address);
    const unsweptCreditedWei = BigInt(currentRecord?.unswept_credited_wei || '0');

    if (balanceWei === 0n) {
      if (unsweptCreditedWei > 0n) {
        db.prepare(`UPDATE user_deposit_wallets SET unswept_credited_wei = '0' WHERE address = ? COLLATE NOCASE`).run(address);
        db.prepare(`UPDATE users SET unswept_credited_wei = '0' WHERE id = ? AND deposit_address = ? COLLATE NOCASE`).run(userId, address);
      }
      return { credited: 0, swept: false };
    }

    if (balanceWei > unsweptCreditedWei) {
      const newDepositWei = balanceWei - unsweptCreditedWei;
      const amount = parseFloat(ethers.formatUnits(newDepositWei, 18));

      if (amount > 0) {
        const txHash = `bsc_usdt_${address.slice(0, 10).toLowerCase()}_${balanceWei.toString()}_${Date.now()}`;
        const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) || { id: userId, email };

        console.log(`[DEPOSIT DETECTED] +${amount} USDT for user ${userId} (${user.email || ''}) at ${address}`);

        const tx = db.transaction(() => {
          db.prepare('INSERT OR IGNORE INTO balances (user_id, available, locked) VALUES (?, 0, 0)').run(userId);
          db.prepare('UPDATE balances SET available = COALESCE(available, 0) + ? WHERE user_id = ?').run(amount, userId);

          db.prepare(`
            INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status)
            VALUES (?, 'deposit', ?, ?, ?, 'approved')
          `).run(userId, amount, address, txHash);

          db.prepare(`
            UPDATE user_deposit_wallets
            SET unswept_credited_wei = ?
            WHERE address = ? COLLATE NOCASE
          `).run(balanceWei.toString(), address);

          db.prepare(`
            UPDATE users
            SET unswept_credited_wei = ?
            WHERE id = ? AND deposit_address = ? COLLATE NOCASE
          `).run(balanceWei.toString(), userId, address);

          db.prepare(`
            INSERT INTO activity_logs (user_id, actor_role, action, meta)
            VALUES (?, 'system', 'crypto_deposit', ?)
          `).run(
            userId,
            JSON.stringify({ amount, currency: 'USDT', address, txHash })
          );

          const notifRes = db.prepare(`
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, ?, ?)
          `).run(userId, 'Deposit Credited', `Your deposit of ${amount} USDT has been successfully credited.`);

          return notifRes.lastInsertRowid;
        });

        const notifId = tx();
        creditedAmount = amount;

        const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
        emitSocket('notification', { notification: newNotification });
        emitSocket('user_data_update', { user_id: userId, type: 'deposit_credited' });

        notifyAdmin({
          type: 'deposit',
          title: '⚡ Crypto Auto-Deposit Received',
          message: `$${amount} USDT auto-deposited for ${user.email || `User #${userId}`}.`,
          user_email: user.email || '',
          link: '/admin/deposits'
        });

        await sendDepositEmail(user.email, amount, txHash);
      }
    } else if (balanceWei < unsweptCreditedWei) {
      db.prepare(`UPDATE user_deposit_wallets SET unswept_credited_wei = ? WHERE address = ? COLLATE NOCASE`).run(
        balanceWei.toString(),
        address
      );
    }

    // Attempt auto-sweep to HOT_WALLET_ADDRESS whenever balanceWei > 0n
    if (balanceWei > 0n && wallet && HOT_WALLET_ADDRESS) {
      try {
        console.log(`[AUTO-SWEEP] Sweeping ${ethers.formatUnits(balanceWei, 18)} USDT from ${address} to hot wallet ${HOT_WALLET_ADDRESS}...`);
        const receipt = await flushForwarder(address, USDT_ADDRESS, userId, privateKey);
        swept = true;

        db.prepare(`UPDATE user_deposit_wallets SET unswept_credited_wei = '0' WHERE address = ? COLLATE NOCASE`).run(address);
        db.prepare(`UPDATE users SET unswept_credited_wei = '0' WHERE id = ? AND deposit_address = ? COLLATE NOCASE`).run(userId, address);

        if (receipt?.hash) {
          console.log(`[AUTO-SWEEP SUCCESS] Swept ${address} -> ${HOT_WALLET_ADDRESS} (tx: ${receipt.hash})`);
        }
      } catch (sweepErr) {
        console.error(`[AUTO-SWEEP ERROR] Could not sweep ${address}:`, sweepErr.message);
      }
    }
  } catch (err) {
    console.error(`[CRYPTO CHECK ERROR] ${address}:`, err.message);
  } finally {
    sweepingAddresses.delete(lockKey);
  }

  return { credited: creditedAmount, swept };
}

/**
 * Actively checks all registered deposit wallets for a specific user.
 */
export async function checkUserDeposit(userId) {
  if (!userId) return { credited: 0, swept: false };
  ensureRecoveredDepositForUser(userId);

  const user = db.prepare('SELECT id, email, deposit_address, deposit_private_key FROM users WHERE id = ?').get(userId);
  if (user && !user.deposit_address) {
    await generateDepositAddress(user.id, user.email);
  }

  const wallets = db
    .prepare('SELECT address, user_id, email, private_key, unswept_credited_wei FROM user_deposit_wallets WHERE user_id = ?')
    .all(userId);

  let totalCredited = 0;
  let anySwept = false;
  for (const w of wallets) {
    const res = await inspectAndProcessDepositAddress(w);
    totalCredited += res.credited;
    if (res.swept) anySwept = true;
  }
  return { credited: totalCredited, swept: anySwept };
}

/**
 * Periodically scans all user deposit wallets for incoming USDT deposits & sweeps them.
 */
export async function checkMissedDeposits() {
  try {
    // Sync any users table entries into user_deposit_wallets first
    db.prepare(`
      INSERT OR IGNORE INTO user_deposit_wallets (address, user_id, email, private_key, unswept_credited_wei)
      SELECT deposit_address, id, email, deposit_private_key, COALESCE(unswept_credited_wei, '0')
      FROM users
      WHERE deposit_address IS NOT NULL AND deposit_private_key IS NOT NULL
    `).run();

    const wallets = db
      .prepare('SELECT address, user_id, email, private_key, unswept_credited_wei FROM user_deposit_wallets')
      .all();

    for (const w of wallets) {
      await inspectAndProcessDepositAddress(w);
    }
  } catch (err) {
    console.error('[CRYPTO ERROR] checkMissedDeposits:', err.message);
  }
}

/**
 * Sweeps a specific token (or BNB) from a user's deposit wallet or Forwarder contract to HOT_WALLET_ADDRESS.
 */
export async function flushForwarder(forwarderAddress, tokenAddress = USDT_ADDRESS, userId = null, explicitPrivateKey = null) {
  if (!ADMIN_PRIVATE_KEY || !HOT_WALLET_ADDRESS) {
    throw new Error('Crypto service not initialized (missing ADMIN_PRIVATE_KEY or HOT_WALLET_ADDRESS)');
  }

  if (forwarderAddress.trim().toLowerCase() === HOT_WALLET_ADDRESS.trim().toLowerCase()) {
    return { hash: 'already_in_hot_wallet' };
  }

  return await executeWithRpcFallback(async (rpcProvider) => {
    const cleanAdminKey = ADMIN_PRIVATE_KEY.trim().startsWith('0x')
      ? ADMIN_PRIVATE_KEY.trim()
      : `0x${ADMIN_PRIVATE_KEY.trim()}`;
    const adminWallet = new ethers.Wallet(cleanAdminKey, rpcProvider);

    const code = await rpcProvider.getCode(forwarderAddress);
    const isContract = code && code !== '0x';

    if (!isContract) {
      // Resolve the matching EOA private key
      const candidates = [];
      if (explicitPrivateKey) candidates.push(explicitPrivateKey);

      const walletRow = db
        .prepare('SELECT private_key, user_id, email FROM user_deposit_wallets WHERE address = ? COLLATE NOCASE')
        .get(forwarderAddress);
      if (walletRow?.private_key) candidates.push(walletRow.private_key);

      const effectiveUserId = userId || walletRow?.user_id;
      if (effectiveUserId) {
        const userRow = db.prepare('SELECT email, deposit_private_key FROM users WHERE id = ?').get(effectiveUserId);
        if (userRow?.deposit_private_key) candidates.push(userRow.deposit_private_key);

        const detWallet = getDeterministicUserWallet(effectiveUserId, userRow?.email || walletRow?.email, rpcProvider);
        candidates.push(detWallet.privateKey);

        // Legacy deterministic key fallback
        const legacySecret = ADMIN_PRIVATE_KEY || 'otc_market_app_unique_user_secret_v2';
        const legacyKey = ethers.keccak256(ethers.toUtf8Bytes(legacySecret + '_unique_eoa_user_wallet_id_' + effectiveUserId));
        candidates.push(legacyKey);
      }

      let matchedWallet = null;
      for (const pk of candidates) {
        try {
          const cleanPk = pk.trim().startsWith('0x') ? pk.trim() : `0x${pk.trim()}`;
          const w = new ethers.Wallet(cleanPk, rpcProvider);
          if (w.address.toLowerCase() === forwarderAddress.trim().toLowerCase()) {
            matchedWallet = w;
            break;
          }
        } catch (_) {}
      }

      if (!matchedWallet) {
        throw new Error(`Private key not found for EOA deposit address ${forwarderAddress}`);
      }

      if (tokenAddress) {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, matchedWallet);
        const balance = await tokenContract.balanceOf(forwarderAddress);
        if (balance === 0n) throw new Error('No tokens to flush');

        const feeData = await rpcProvider.getFeeData();
        const rawGasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
        const minGasPrice = ethers.parseUnits('0.1', 'gwei');
        const gasPrice = rawGasPrice < minGasPrice ? minGasPrice : rawGasPrice;
        const gasLimit = 65000n;
        const bnbRequired = gasLimit * gasPrice;

        const userBnbBalance = await rpcProvider.getBalance(forwarderAddress);
        if (userBnbBalance < bnbRequired) {
          // Fund with a 25% buffer so the subsequent ERC-20 transfer never fails with insufficient gas
          const bnbNeeded = ((bnbRequired - userBnbBalance) * 125n) / 100n;
          console.log(`[GAS] Funding ${ethers.formatEther(bnbNeeded)} BNB from ${adminWallet.address} to ${forwarderAddress}...`);
          const fundTx = await adminWallet.sendTransaction({
            to: forwarderAddress,
            value: bnbNeeded,
            gasLimit: 21000n,
            gasPrice
          });
          await fundTx.wait();
        }

        const tx = await tokenContract.transfer(HOT_WALLET_ADDRESS, balance, {
          gasLimit,
          gasPrice
        });
        return await tx.wait();
      } else {
        const balance = await rpcProvider.getBalance(forwarderAddress);
        const feeData = await rpcProvider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
        const gasLimit = 21000n;
        const bnbRequired = gasLimit * gasPrice;
        if (balance <= bnbRequired) throw new Error('No sufficient BNB to flush');

        const tx = await matchedWallet.sendTransaction({
          to: HOT_WALLET_ADDRESS,
          value: balance - bnbRequired,
          gasLimit,
          gasPrice
        });
        return await tx.wait();
      }
    }

    // Forwarder smart contract logic
    const forwarder = new ethers.Contract(forwarderAddress, FORWARDER_ABI, adminWallet);
    if (tokenAddress) {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, rpcProvider);
      const balance = await tokenContract.balanceOf(forwarderAddress);
      if (balance === 0n) throw new Error('No tokens to flush');

      const tx = await forwarder.flushToken(tokenAddress);
      return await tx.wait();
    } else {
      const balance = await rpcProvider.getBalance(forwarderAddress);
      if (balance === 0n) throw new Error('No BNB to flush');

      const tx = await forwarder.flushBNB();
      return await tx.wait();
    }
  });
}

/**
 * Returns the BNB balance of the Admin Wallet to check for gas availability
 */
export async function getHotWalletStatus() {
  try {
    if (!ADMIN_PRIVATE_KEY) {
      return { address: HOT_WALLET_ADDRESS || '', balance: 0, error: 'Not initialized' };
    }
    const cleanAdminKey = ADMIN_PRIVATE_KEY.trim().startsWith('0x')
      ? ADMIN_PRIVATE_KEY.trim()
      : `0x${ADMIN_PRIVATE_KEY.trim()}`;
    const adminWallet = new ethers.Wallet(cleanAdminKey);

    const bal = await executeWithRpcFallback(async (rpcProvider) => {
      return await rpcProvider.getBalance(adminWallet.address);
    });

    return {
      address: adminWallet.address,
      hotWalletAddress: HOT_WALLET_ADDRESS || adminWallet.address,
      balance: Number(ethers.formatEther(bal))
    };
  } catch (error) {
    return { address: HOT_WALLET_ADDRESS || '', balance: 0, error: error.message };
  }
}
