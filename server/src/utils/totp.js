import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode raw bytes to uppercase RFC 4648 Base32 without padding (Google Authenticator standard).
 */
export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decode RFC 4648 Base32 secret (ignoring spaces/padding/case) into a Buffer.
 */
export function decodeBase32(secret) {
  const clean = String(secret || '').toUpperCase().replace(/[\s=-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 160-bit Base32 TOTP secret (32 characters).
 */
export function generateTotpSecret(numBytes = 20) {
  return encodeBase32(crypto.randomBytes(numBytes));
}

/**
 * Build standard otpauth:// URI compatible with Google Authenticator, Authy, 1Password, etc.
 */
export function buildOtpAuthUri({ secret, account, issuer = 'AvaPartner' }) {
  const cleanIssuer = encodeURIComponent(issuer);
  const cleanAccount = encodeURIComponent(account || 'user');
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${encodeURIComponent(secret)}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Compute RFC 6238 6-digit TOTP code for a specific time counter step.
 */
export function computeTotpCode(secret, counter, digits = 6) {
  const key = decodeBase32(secret);
  if (!key || key.length === 0) return null;
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % (10 ** digits);
  return String(otp).padStart(digits, '0');
}

/**
 * Verify a 6-digit user-provided TOTP token within +/- `window` 30-second steps.
 */
export function verifyTotpCode(secret, token, { window = 1, period = 30, nowMs = Date.now() } = {}) {
  if (!secret) return false;
  const cleanToken = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentCounter = Math.floor(nowMs / 1000 / period);
  const targetBuf = Buffer.from(cleanToken, 'utf8');

  for (let delta = -window; delta <= window; delta++) {
    const candidate = computeTotpCode(secret, currentCounter + delta, 6);
    if (!candidate) return false;
    const candBuf = Buffer.from(candidate, 'utf8');
    if (candBuf.length === targetBuf.length && crypto.timingSafeEqual(candBuf, targetBuf)) {
      return true;
    }
  }
  return false;
}
