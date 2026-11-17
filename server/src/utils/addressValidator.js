import crypto from 'crypto';
import { isAddress, getAddress } from 'ethers';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Infer chain family ('evm' | 'tron' | 'btc' | 'sol') from payment method metadata.
 */
export function detectChainFamily(network = '', name = '') {
  const hint = `${network} ${name}`.toLowerCase();
  if (hint.includes('trc') || hint.includes('tron')) return 'tron';
  if (hint.includes('btc') || hint.includes('bitcoin')) return 'btc';
  if (hint.includes('sol')) return 'sol';
  return 'evm';
}

function decodeBase58(input) {
  let num = 0n;
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    num = num * 58n + BigInt(idx);
  }
  const bytes = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  bytes.reverse();
  let leadingZeros = 0;
  for (const ch of input) {
    if (ch === '1') leadingZeros += 1;
    else break;
  }
  return Uint8Array.from([...new Array(leadingZeros).fill(0), ...bytes]);
}

function verifyBase58Check(input) {
  const decoded = decodeBase58(input);
  if (!decoded || decoded.length < 5) return null;
  const payload = decoded.slice(0, decoded.length - 4);
  const checksum = decoded.slice(decoded.length - 4);
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== hash2[i]) return null;
  }
  return payload;
}

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function verifyBech32Address(addr) {
  const lower = addr.toLowerCase();
  if (addr !== lower && addr !== addr.toUpperCase()) return false;
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length || lower.length > 90) return false;
  const hrp = lower.slice(0, pos);
  if (hrp !== 'bc') return false;
  const data = [];
  for (let i = pos + 1; i < lower.length; i++) {
    const idx = BECH32_CHARSET.indexOf(lower[i]);
    if (idx === -1) return false;
    data.push(idx);
  }
  const hrpExpanded = [];
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) >> 5);
  hrpExpanded.push(0);
  for (let i = 0; i < hrp.length; i++) hrpExpanded.push(hrp.charCodeAt(i) & 31);
  const check = bech32Polymod([...hrpExpanded, ...data]);
  const witnessVersion = data[0];
  if (witnessVersion === 0) return check === 1;
  if (witnessVersion >= 1 && witnessVersion <= 16) return check === 0x2bc830a3;
  return false;
}

function validateEvmAddress(trimmed) {
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return {
      valid: false,
      chain: 'evm',
      status: 'wrong_network',
      message: 'This looks like a TRON (TRC-20) address, but EVM / BEP-20 requires a 42-character address starting with 0x.'
    };
  }
  if (!trimmed.startsWith('0x') && !trimmed.startsWith('0X')) {
    return {
      valid: false,
      chain: 'evm',
      status: 'invalid',
      message: 'Wallet address must start with 0x for BEP-20 / ERC-20 networks.'
    };
  }
  if (trimmed.length !== 42) {
    return {
      valid: false,
      chain: 'evm',
      status: 'invalid',
      message: `Invalid length (${trimmed.length}/42 characters). EVM / BEP-20 addresses must be 0x followed by 40 hex digits.`
    };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      valid: false,
      chain: 'evm',
      status: 'invalid',
      message: 'Invalid characters detected. Only 0-9 and A-F are allowed after 0x.'
    };
  }
  if (trimmed.toLowerCase() === ZERO_EVM_ADDRESS) {
    return {
      valid: false,
      chain: 'evm',
      status: 'invalid',
      message: 'Burn (zero) address cannot be used for withdrawals.'
    };
  }
  if (!isAddress(trimmed)) {
    return {
      valid: false,
      chain: 'evm',
      status: 'checksum_error',
      message: 'Invalid EIP-55 address checksum. Check mixed-case letters for a possible typo.'
    };
  }

  const checksummed = getAddress(trimmed);
  const hexBody = trimmed.slice(2);
  const hasMixedCase = /[a-f]/.test(hexBody) && /[A-F]/.test(hexBody);
  return {
    valid: true,
    chain: 'evm',
    status: 'valid',
    normalized: checksummed,
    checksumVerified: hasMixedCase,
    message: hasMixedCase ? 'Valid address (EIP-55 checksum verified)' : 'Valid BEP-20 / EVM wallet address'
  };
}

function validateTronAddress(trimmed) {
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      valid: false,
      chain: 'tron',
      status: 'wrong_network',
      message: 'This is a BEP-20/ERC-20 (0x) address, but TRC-20 withdrawals require a TRON address starting with T.'
    };
  }
  if (!trimmed.startsWith('T') || trimmed.length !== 34) {
    return {
      valid: false,
      chain: 'tron',
      status: 'invalid',
      message: 'TRON (TRC-20) addresses must start with T and be exactly 34 characters long.'
    };
  }
  const payload = verifyBase58Check(trimmed);
  if (!payload || payload.length !== 21 || payload[0] !== 0x41) {
    return {
      valid: false,
      chain: 'tron',
      status: 'checksum_error',
      message: 'Invalid TRON (TRC-20) Base58Check checksum. Please verify your address.'
    };
  }
  return {
    valid: true,
    chain: 'tron',
    status: 'valid',
    normalized: trimmed,
    checksumVerified: true,
    message: 'Valid TRON (TRC-20) address (checksum verified)'
  };
}

function validateBtcAddress(trimmed) {
  if (/^bc1/i.test(trimmed)) {
    if (!verifyBech32Address(trimmed)) {
      return {
        valid: false,
        chain: 'btc',
        status: 'checksum_error',
        message: 'Invalid Bitcoin SegWit (bc1) address checksum.'
      };
    }
    return {
      valid: true,
      chain: 'btc',
      status: 'valid',
      normalized: trimmed.toLowerCase(),
      checksumVerified: true,
      message: 'Valid Bitcoin SegWit address'
    };
  }
  if (/^[13]/.test(trimmed)) {
    const payload = verifyBase58Check(trimmed);
    if (!payload || payload.length !== 21 || (payload[0] !== 0x00 && payload[0] !== 0x05)) {
      return {
        valid: false,
        chain: 'btc',
        status: 'checksum_error',
        message: 'Invalid Bitcoin address checksum.'
      };
    }
    return {
      valid: true,
      chain: 'btc',
      status: 'valid',
      normalized: trimmed,
      checksumVerified: true,
      message: 'Valid Bitcoin address'
    };
  }
  return {
    valid: false,
    chain: 'btc',
    status: 'invalid',
    message: 'Bitcoin addresses must start with 1, 3, or bc1.'
  };
}

function validateSolAddress(trimmed) {
  if (/^0x/i.test(trimmed)) {
    return {
      valid: false,
      chain: 'sol',
      status: 'wrong_network',
      message: 'Solana addresses do not start with 0x.'
    };
  }
  const decoded = decodeBase58(trimmed);
  if (!decoded || decoded.length !== 32) {
    return {
      valid: false,
      chain: 'sol',
      status: 'invalid',
      message: 'Invalid Solana public key format (must decode to 32 bytes in Base58).'
    };
  }
  return {
    valid: true,
    chain: 'sol',
    status: 'valid',
    normalized: trimmed,
    checksumVerified: false,
    message: 'Valid Solana address'
  };
}

/**
 * Validate a withdrawal wallet address against the selected network & method.
 */
export function validateCryptoAddress(address, network = '', name = '') {
  const trimmed = typeof address === 'string' ? address.trim() : '';
  const chain = detectChainFamily(network, name);
  if (!trimmed) {
    return { valid: false, chain, status: 'empty', message: 'Wallet address is required.' };
  }
  if (chain === 'tron') return validateTronAddress(trimmed);
  if (chain === 'btc') return validateBtcAddress(trimmed);
  if (chain === 'sol') return validateSolAddress(trimmed);
  return validateEvmAddress(trimmed);
}
