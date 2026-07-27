import { ethers } from 'ethers';
import nodemailer from 'nodemailer';
import { BSC_RPC_URL, FACTORY_ADDRESS, ADMIN_PRIVATE_KEY, USDT_ADDRESS, HOT_WALLET_ADDRESS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } from '../config.js';
import { FACTORY_ABI, ERC20_ABI, FORWARDER_ABI } from './abis.js';
import db from '../db.js';
import { emitSocket } from '../market/engine.js';

let provider;
let wallet;
let factoryContract;
let usdtContract;

export function initCryptoService() {
  if (!BSC_RPC_URL || !FACTORY_ADDRESS || !ADMIN_PRIVATE_KEY || !HOT_WALLET_ADDRESS) {
    console.warn('CryptoService: Missing blockchain configuration. Crypto deposits disabled.');
    return;
  }

  provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
  wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  factoryContract = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);
  usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

  console.log('CryptoService initialized. Listening for USDT transfers on BSC...');
  startBlockchainListener();
  
  // Check for missed deposits on startup (background)
  setTimeout(checkMissedDeposits, 5000);
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
        <h2 style="color: #06b6d4; text-align: center; margin-bottom: 20px;">Deposit Successful</h2>
        <p style="font-size: 16px; color: #e5e7eb;">Hello,</p>
        <p style="font-size: 16px; color: #e5e7eb;">Your deposit of <strong style="color: #10b981;">${amount} USDT</strong> has been successfully credited to your account.</p>
        <p style="font-size: 14px; color: #9ca3af; margin-top: 30px;">Transaction Hash: <br><span style="font-size: 12px; word-break: break-all;">${txHash}</span></p>
        <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
          <a href="https://yourwebsite.com/dashboard" style="background-color: #06b6d4; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">View Dashboard</a>
        </div>
      </div>
    `;
    
    await transporter.sendMail({
      from: `"Support" <${SMTP_USER}>`,
      to: userEmail,
      subject: `Deposit of ${amount} USDT Credited`,
      html
    });
    console.log(`[EMAIL] Sent deposit notification to ${userEmail}`);
  } catch (err) {
    console.error('[EMAIL ERROR] Failed to send deposit email:', err.message);
  }
}

async function checkMissedDeposits() {
  console.log('[CRYPTO] Checking for missed deposits on startup...');
  try {
    const users = db.prepare('SELECT id, email, deposit_address FROM users WHERE deposit_address IS NOT NULL').all();
    for (const user of users) {
      if (!user.deposit_address) continue;
      
      const balanceWei = await usdtContract.balanceOf(user.deposit_address).catch(() => 0n);
      if (balanceWei > 0n) {
        const amount = parseFloat(ethers.formatUnits(balanceWei, 18));
        console.log(`[MISSED DEPOSIT] Found ${amount} USDT for user ${user.id} at ${user.deposit_address}`);
        
        const txHash = 'swept_' + Date.now();
        
        const tx = db.transaction(() => {
          db.prepare(`UPDATE balances SET available = available + ? WHERE user_id = ?`).run(amount, user.id);
          db.prepare(`
            INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status)
            VALUES (?, 'deposit', ?, ?, ?, 'approved')
          `).run(user.id, amount, user.deposit_address, txHash);
          db.prepare(`
            INSERT INTO activity_logs (user_id, actor_role, action, meta)
            VALUES (?, ?, ?, ?)
          `).run(user.id, 'system', 'crypto_deposit', JSON.stringify({ amount, currency: 'USDT', address: user.deposit_address, txHash }));
          const notifRes = db.prepare(`
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, ?, ?)
          `).run(user.id, 'Deposit Credited', `Your deposit of ${amount} USDT has been successfully credited.`);
          return notifRes.lastInsertRowid;
        });
        const notifId = tx();

        const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
        emitSocket('notification', { notification: newNotification });
        emitSocket('user_data_update', { user_id: user.id, type: 'deposit_credited' });
        
        await sendDepositEmail(user.email, amount, txHash);
        
        console.log(`[AUTO-SWEEP] Sweeping missed deposit for user ${user.id}...`);
        await flushForwarder(user.deposit_address, USDT_ADDRESS, user.id).catch(err => {
          console.error('[AUTO-SWEEP ERROR]', err.message);
        });
      }
    }
    console.log('[CRYPTO] Missed deposit check completed.');
  } catch (err) {
    console.error('[CRYPTO ERROR] checkMissedDeposits:', err);
  }
}

function isAddressUniqueAndNotHotWallet(address, userId) {
  if (!address || typeof address !== 'string') return false;
  const cleanAddr = address.trim().toLowerCase();
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) return false;

  if (HOT_WALLET_ADDRESS && cleanAddr === HOT_WALLET_ADDRESS.trim().toLowerCase()) return false;
  if (FACTORY_ADDRESS && cleanAddr === FACTORY_ADDRESS.trim().toLowerCase()) return false;

  const dup = db.prepare('SELECT id FROM users WHERE deposit_address = ? COLLATE NOCASE AND id != ?').get(address.trim(), userId);
  if (dup) return false;

  return true;
}

export async function generateDepositAddress(userId) {
  try {
    if (!userId) throw new Error('userId is required');

    let newWallet = ethers.Wallet.createRandom();
    let attempts = 0;
    
    while (attempts < 10) {
      const addr = newWallet.address;
      const isHot = HOT_WALLET_ADDRESS && addr.toLowerCase() === HOT_WALLET_ADDRESS.trim().toLowerCase();
      const isFactory = FACTORY_ADDRESS && addr.toLowerCase() === FACTORY_ADDRESS.trim().toLowerCase();
      const dup = db.prepare('SELECT id FROM users WHERE LOWER(deposit_address) = LOWER(?)').get(addr);
      
      if (!isHot && !isFactory && !dup) {
        break;
      }
      newWallet = ethers.Wallet.createRandom();
      attempts++;
    }

    const newAddress = newWallet.address;
    const privateKey = newWallet.privateKey;

    db.prepare(`UPDATE users SET deposit_address = ?, deposit_private_key = ? WHERE id = ?`)
      .run(newAddress, privateKey, userId);

    console.log(`[DEPOSIT] Generated unique random EVM wallet ${newAddress} for user ${userId}`);
    return newAddress;
  } catch (error) {
    console.error('generateDepositAddress FATAL ERROR:', error);
    throw error;
  }
}

/**
 * Sweeps a specific token from a user's forwarder to the hot wallet
 */
export async function flushForwarder(forwarderAddress, tokenAddress, userId = null) {
  if (!wallet) throw new Error('Crypto service not initialized');
  
  // Check if the address is a contract or an EOA
  const code = await provider.getCode(forwarderAddress);
  const isContract = code !== '0x';

  if (!isContract) {
    if (!userId) throw new Error('userId required to sweep EOA fallback wallet');
    console.log(`[INFO] Address ${forwarderAddress} is an EOA fallback wallet. Sweeping via direct transfer...`);
    
    const userRow = db.prepare('SELECT deposit_private_key FROM users WHERE id = ?').get(userId);
    let userWallet;
    if (userRow && userRow.deposit_private_key) {
      userWallet = new ethers.Wallet(userRow.deposit_private_key, provider);
    } else {
      const secretKey = ADMIN_PRIVATE_KEY || 'otc_market_app_unique_user_secret_v2';
      const userSecret = ethers.keccak256(ethers.toUtf8Bytes(secretKey + "_unique_eoa_user_wallet_id_" + userId));
      userWallet = new ethers.Wallet(userSecret, provider);
    }

    if (tokenAddress) {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, userWallet);
      const balance = await tokenContract.balanceOf(forwarderAddress);
      if (balance === 0n || balance === 0) throw new Error('No tokens to flush');

      // Estimate gas needed for the token transfer
      const gasLimit = await tokenContract.transfer.estimateGas(HOT_WALLET_ADDRESS, balance).catch(() => 60000n);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('3', 'gwei');
      const bnbRequired = gasLimit * gasPrice;

      // Check user wallet BNB balance
      const userBnbBalance = await provider.getBalance(forwarderAddress);
      
      // If user wallet lacks BNB, admin must send it
      if (userBnbBalance < bnbRequired) {
        const bnbNeeded = bnbRequired - userBnbBalance;
        console.log(`[INFO] Sending ${ethers.formatEther(bnbNeeded)} BNB to EOA wallet for gas...`);
        const fundTx = await wallet.sendTransaction({
          to: forwarderAddress,
          value: bnbNeeded
        });
        await fundTx.wait();
        console.log(`[INFO] Gas funded to EOA wallet.`);
      }

      console.log(`Flushing token ${tokenAddress} from EOA ${forwarderAddress}...`);
      const tx = await tokenContract.transfer(HOT_WALLET_ADDRESS, balance);
      return await tx.wait();
    } else {
      // Sweeping BNB directly from EOA
      const balance = await provider.getBalance(forwarderAddress);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('3', 'gwei');
      const gasLimit = 21000n;
      const bnbRequired = gasLimit * gasPrice;
      
      if (balance <= bnbRequired) throw new Error('No sufficient BNB to flush');
      const amountToSend = balance - bnbRequired;

      console.log(`Flushing BNB from EOA ${forwarderAddress}...`);
      const tx = await userWallet.sendTransaction({
        to: HOT_WALLET_ADDRESS,
        value: amountToSend
      });
      return await tx.wait();
    }
  }

  // Original Forwarder logic
  const forwarder = new ethers.Contract(forwarderAddress, FORWARDER_ABI, wallet);
  
  if (tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(forwarderAddress);
    if (balance === 0n || balance === 0) {
      throw new Error('No tokens to flush');
    }

    console.log(`Flushing token ${tokenAddress} from forwarder ${forwarderAddress}...`);
    const tx = await forwarder.flushToken(tokenAddress);
    return await tx.wait();
  } else {
    // Check BNB balance
    const balance = await provider.getBalance(forwarderAddress);
    if (balance === 0n || balance === 0) {
      throw new Error('No BNB to flush');
    }

    console.log(`Flushing BNB from forwarder ${forwarderAddress}...`);
    const tx = await forwarder.flushBNB();
    return await tx.wait();
  }
}

/**
 * Starts listening to blockchain events for deposits
 */
function startBlockchainListener() {
  // Listen for USDT Transfers
  usdtContract.on('Transfer', async (from, to, value, event) => {
    try {
      // Check if 'to' address is one of our user deposit addresses
      const user = db.prepare(`SELECT id, email FROM users WHERE deposit_address = ? COLLATE NOCASE`).get(to);
      if (user) {
        // value is in wei (usually 18 decimals for BSC USDT)
        const amountStr = ethers.formatUnits(value, 18);
        const amount = parseFloat(amountStr);

        console.log(`[DEPOSIT] Detected ${amount} USDT deposit for user ${user.id} at ${to}`);

        // Credit user balance in DB and record in payment_requests
        const tx = db.transaction(() => {
          db.prepare(`UPDATE balances SET available = available + ? WHERE user_id = ?`).run(amount, user.id);
          
          db.prepare(`
            INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status)
            VALUES (?, 'deposit', ?, ?, ?, 'approved')
          `).run(user.id, amount, to, event.log.transactionHash);

          db.prepare(`
            INSERT INTO activity_logs (user_id, actor_role, action, meta)
            VALUES (?, ?, ?, ?)
          `).run(user.id, 'system', 'crypto_deposit', JSON.stringify({
            amount,
            currency: 'USDT',
            address: to,
            txHash: event.log.transactionHash
          }));

          const notifRes = db.prepare(`
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, ?, ?)
          `).run(user.id, 'Deposit Credited', `Your deposit of ${amount} USDT has been successfully credited.`);

          return notifRes.lastInsertRowid;
        });
        const notifId = tx();

        const newNotification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notifId);
        emitSocket('notification', { notification: newNotification });
        
        // Broadcast generic event to let client refetch history and balance
        emitSocket('user_data_update', { user_id: user.id, type: 'deposit_credited' });
        
        await sendDepositEmail(user.email, amount, event.log.transactionHash);

        console.log(`[DEPOSIT] Successfully credited ${amount} USDT to user ${user.id}`);
        
        // Trigger auto-flush
        console.log(`[AUTO-SWEEP] Automatically sweeping funds from ${to} to hot wallet...`);
        await flushForwarder(to, USDT_ADDRESS, user.id).catch(err => {
          console.error('[AUTO-SWEEP ERROR] Failed to auto-sweep:', err.message);
        });
      }
    } catch (error) {
      console.error('Error processing USDT transfer:', error);
    }
  });

  // Listen for BNB Deposits directly to factory or forwarders if needed, 
  // but mostly relying on USDT for now.
}

/**
 * Returns the BNB balance of the Admin Wallet to check for gas availability
 */
export async function getHotWalletStatus() {
  try {
    if (!provider || !wallet) return { address: HOT_WALLET_ADDRESS || '', balance: 0, error: 'Not initialized' };
    const bal = await provider.getBalance(wallet.address);
    return { address: wallet.address, balance: Number(ethers.formatEther(bal)) };
  } catch (error) {
    return { address: HOT_WALLET_ADDRESS || '', balance: 0, error: error.message };
  }
}
