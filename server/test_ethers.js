import { ethers } from 'ethers';
console.log(ethers ? 'ethers is defined' : 'ethers is UNDEFINED');
if (ethers) {
  console.log(ethers.Wallet ? 'ethers.Wallet is defined' : 'ethers.Wallet is UNDEFINED');
}
