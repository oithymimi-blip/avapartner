import { ethers } from 'ethers';
import db from './server/src/db.js';
import { BSC_RPC_URL, ADMIN_PRIVATE_KEY, USDT_ADDRESS, HOT_WALLET_ADDRESS } from './server/src/config.js';
import { ERC20_ABI } from './server/src/payments/abis.js';

async function diagnoseAndFix() {
  console.log("=== AUTO-SWEEP DIAGNOSTIC & RECOVERY ===");
  
  const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
  const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

  console.log("Admin Wallet Address:", adminWallet.address);
  const adminBnb = await provider.getBalance(adminWallet.address);
  console.log("Admin Wallet BNB Balance:", ethers.formatEther(adminBnb));

  if (adminBnb === 0n) {
    console.log("\n❌ ERROR: Your Admin Wallet has 0 BNB! It cannot pay for the gas to sweep the user wallets.");
    console.log(`Please send at least 0.05 BNB to ${adminWallet.address} and try again.`);
    return;
  }

  const users = db.prepare('SELECT id, email, deposit_address, deposit_private_key FROM users WHERE deposit_address IS NOT NULL').all();
  let found = false;

  for (const user of users) {
    if (!user.deposit_address) continue;
    
    const balanceWei = await usdtContract.balanceOf(user.deposit_address);
    if (balanceWei > 0n) {
      found = true;
      const amountStr = ethers.formatUnits(balanceWei, 18);
      const amount = parseFloat(amountStr);
      console.log(`\n✅ Found ${amount} USDT in user ${user.id} wallet: ${user.deposit_address}`);
      
      // Check if we already credited this
      const existing = db.prepare('SELECT id FROM payment_requests WHERE user_id = ? AND address = ? AND amount = ?').get(user.id, user.deposit_address, amount);
      
      if (!existing) {
        console.log("Crediting user in database...");
        const txHash = 'manual_sweep_' + Date.now();
        db.transaction(() => {
          db.prepare(`UPDATE balances SET available = available + ? WHERE user_id = ?`).run(amount, user.id);
          db.prepare(`
            INSERT INTO payment_requests (user_id, type, amount, address, tx_ref, status)
            VALUES (?, 'deposit', ?, ?, ?, 'approved')
          `).run(user.id, amount, user.deposit_address, txHash);
          db.prepare(`
            INSERT INTO activity_logs (user_id, actor_role, action, meta)
            VALUES (?, ?, ?, ?)
          `).run(user.id, 'system', 'crypto_deposit', JSON.stringify({ amount, currency: 'USDT', address: user.deposit_address, txHash }));
        })();
        console.log(`User ${user.id} balance successfully credited!`);
      } else {
        console.log(`User ${user.id} was already credited for this amount in the database.`);
      }
      
      let userWallet;
      if (user.deposit_private_key) {
        userWallet = new ethers.Wallet(user.deposit_private_key, provider);
      } else {
        const secretKey = ADMIN_PRIVATE_KEY || 'otc_market_app_unique_user_secret_v2';
        const userSecret = ethers.keccak256(ethers.toUtf8Bytes(secretKey + "_unique_eoa_user_wallet_id_" + user.id));
        userWallet = new ethers.Wallet(userSecret, provider);
      }

      const userBnbBalance = await provider.getBalance(user.deposit_address);
      console.log(`User Wallet BNB Balance: ${ethers.formatEther(userBnbBalance)}`);

      const tokenContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, userWallet);
      
      try {
        console.log("Estimating gas for USDT transfer...");
        const gasLimit = await tokenContract.transfer.estimateGas(HOT_WALLET_ADDRESS, balanceWei).catch(() => 60000n);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits('3', 'gwei');
        const bnbRequired = gasLimit * gasPrice;

        console.log(`BNB required for sweep: ${ethers.formatEther(bnbRequired)}`);

        if (userBnbBalance < bnbRequired) {
          const bnbNeeded = bnbRequired - userBnbBalance;
          console.log(`Funding user wallet with ${ethers.formatEther(bnbNeeded)} BNB...`);
          const fundTx = await adminWallet.sendTransaction({
            to: user.deposit_address,
            value: bnbNeeded
          });
          console.log(`Funding tx sent: ${fundTx.hash}`);
          await fundTx.wait();
          console.log("User wallet funded!");
        }

        console.log(`Sweeping USDT to Hot Wallet (${HOT_WALLET_ADDRESS})...`);
        const tx = await tokenContract.transfer(HOT_WALLET_ADDRESS, balanceWei);
        console.log(`Sweep tx sent: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Sweep successful!");

      } catch (err) {
        console.error("❌ Sweep failed:", err.message);
      }
    }
  }

  if (!found) {
    console.log("\nNo unswept USDT found in any user deposit address.");
  }
}

diagnoseAndFix().catch(console.error);
