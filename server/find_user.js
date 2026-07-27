import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const targetAddress = "0x0554a13b5Bd4ab742A41661B1d88FCd11D295141".toLowerCase();

if (!ADMIN_PRIVATE_KEY) {
  console.error("Missing ADMIN_PRIVATE_KEY in .env");
  process.exit(1);
}

for (let i = 1; i <= 1000; i++) {
  const userSecret = ethers.keccak256(ethers.toUtf8Bytes(ADMIN_PRIVATE_KEY + "_eoa_fallback_" + i));
  const userWallet = new ethers.Wallet(userSecret);
  if (userWallet.address.toLowerCase() === targetAddress) {
    console.log("FOUND USER ID:", i);
    break;
  }
}
