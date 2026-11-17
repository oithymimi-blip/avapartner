const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000'

export function detectChainFamily(network = '', name = '') {
  const hint = `${network} ${name}`.toLowerCase()
  if (hint.includes('trc') || hint.includes('tron')) return 'tron'
  if (hint.includes('btc') || hint.includes('bitcoin')) return 'btc'
  if (hint.includes('sol')) return 'sol'
  return 'evm'
}

export function getAddressPlaceholder(network = '', name = '') {
  const chain = detectChainFamily(network, name)
  if (chain === 'tron') return 'T... (34-character TRC-20 address)'
  if (chain === 'btc') return 'bc1... or 1... / 3...'
  if (chain === 'sol') return 'Solana wallet address...'
  return '0x... (42-character BEP-20 address)'
}

// Compact Keccak-256 using 64-bit BigInt state for synchronous EIP-55 checksum verification
const KECCAK_ROUNDS = 24
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
]
const KECCAK_ROTC = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
  27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44
]
const KECCAK_PILN = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
  15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1
]
const MASK64 = 0xffffffffffffffffn

function rotl64(x, n) {
  const s = BigInt(n)
  return ((x << s) | (x >> (64n - s))) & MASK64
}

function keccak256Hex(asciiStr) {
  const bytes = new TextEncoder().encode(asciiStr)
  const rate = 136
  const paddedLen = Math.ceil((bytes.length + 1) / rate) * rate
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[bytes.length] = 0x01
  padded[paddedLen - 1] |= 0x80

  const state = new Array(25).fill(0n)
  const bc = new Array(5).fill(0n)

  for (let offset = 0; offset < paddedLen; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(b * 8)
      }
      state[i] ^= lane
    }

    for (let round = 0; round < KECCAK_ROUNDS; round++) {
      for (let i = 0; i < 5; i++) {
        bc[i] = state[i] ^ state[i + 5] ^ state[i + 10] ^ state[i + 15] ^ state[i + 20]
      }
      for (let i = 0; i < 5; i++) {
        const t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1)
        for (let j = 0; j < 25; j += 5) state[j + i] ^= t
      }
      let t = state[1]
      for (let i = 0; i < 24; i++) {
        const j = KECCAK_PILN[i]
        bc[0] = state[j]
        state[j] = rotl64(t, KECCAK_ROTC[i])
        t = bc[0]
      }
      for (let j = 0; j < 25; j += 5) {
        for (let i = 0; i < 5; i++) bc[i] = state[j + i]
        for (let i = 0; i < 5; i++) state[j + i] ^= (~bc[(i + 1) % 5] & MASK64) & bc[(i + 2) % 5]
      }
      state[0] ^= KECCAK_RC[round]
    }
  }

  let hex = ''
  for (let i = 0; i < 4; i++) {
    let lane = state[i]
    for (let b = 0; b < 8; b++) {
      hex += Number((lane >> BigInt(b * 8)) & 0xffn).toString(16).padStart(2, '0')
    }
  }
  return hex
}

export function toEip55Checksum(addr) {
  const clean = addr.toLowerCase().replace(/^0x/, '')
  const hash = keccak256Hex(clean)
  let out = '0x'
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i]
  }
  return out
}

// Compact SHA-256 for synchronous TRON / BTC Base58Check verification
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

function sha256(bytes) {
  const bitLen = bytes.length * 8
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLen - 4, bitLen >>> 0, false)
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false)

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Array(64)
  const rotr = (n, x) => (x >>> n) | (x << (32 - n))

  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3)
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ ((~e) & g)
      const temp1 = (hh + S1 + ch + SHA256_K[t] + w[t]) | 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0
      hh = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  h.forEach((v, idx) => outView.setUint32(idx * 4, v, false))
  return out
}

function decodeBase58(input) {
  let num = 0n
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch)
    if (idx === -1) return null
    num = num * 58n + BigInt(idx)
  }
  const bytes = []
  while (num > 0n) {
    bytes.push(Number(num & 0xffn))
    num >>= 8n
  }
  bytes.reverse()
  let leadingZeros = 0
  for (const ch of input) {
    if (ch === '1') leadingZeros += 1
    else break
  }
  return Uint8Array.from([...new Array(leadingZeros).fill(0), ...bytes])
}

function verifyBase58Check(input) {
  const decoded = decodeBase58(input)
  if (!decoded || decoded.length < 5) return null
  const payload = decoded.slice(0, decoded.length - 4)
  const checksum = decoded.slice(decoded.length - 4)
  const hash2 = sha256(sha256(payload))
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== hash2[i]) return null
  }
  return payload
}

function verifyBech32Address(addr) {
  const lower = addr.toLowerCase()
  if (addr !== lower && addr !== addr.toUpperCase()) return false
  const pos = lower.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lower.length || lower.length > 90) return false
  const hrp = lower.slice(0, pos)
  if (hrp !== 'bc') return false
  const data = []
  for (let i = pos + 1; i < lower.length; i++) {
    const idx = BECH32_CHARSET.indexOf(lower[i])
    if (idx === -1) return false
    data.push(idx)
  }
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  const hrpExp = []
  for (let i = 0; i < hrp.length; i++) hrpExp.push(hrp.charCodeAt(i) >> 5)
  hrpExp.push(0)
  for (let i = 0; i < hrp.length; i++) hrpExp.push(hrp.charCodeAt(i) & 31)
  let chk = 1
  for (const v of [...hrpExp, ...data]) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  if (data[0] === 0) return chk === 1
  if (data[0] >= 1 && data[0] <= 16) return chk === 0x2bc830a3
  return false
}

export function validateCryptoAddress(address, network = '', name = '') {
  const trimmed = typeof address === 'string' ? address.trim() : ''
  const chain = detectChainFamily(network, name)

  if (!trimmed) {
    return { valid: false, chain, status: 'empty', message: '' }
  }

  if (chain === 'tron') {
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return { valid: false, chain, status: 'wrong_network', message: 'This is a BEP-20/ERC-20 (0x) address, but TRC-20 withdrawals require a TRON address starting with T.' }
    }
    if (!trimmed.startsWith('T') || trimmed.length !== 34) {
      return { valid: false, chain, status: 'invalid', message: `TRC-20 address must start with T and be 34 characters (${trimmed.length}/34).` }
    }
    const payload = verifyBase58Check(trimmed)
    if (!payload || payload.length !== 21 || payload[0] !== 0x41) {
      return { valid: false, chain, status: 'checksum_error', message: 'Invalid TRON (TRC-20) checksum — please verify for typos.' }
    }
    return { valid: true, chain, status: 'valid', normalized: trimmed, checksumVerified: true, message: 'Valid TRC-20 address (checksum verified)' }
  }

  if (chain === 'btc') {
    if (/^bc1/i.test(trimmed)) {
      return verifyBech32Address(trimmed)
        ? { valid: true, chain, status: 'valid', normalized: trimmed.toLowerCase(), checksumVerified: true, message: 'Valid Bitcoin SegWit address' }
        : { valid: false, chain, status: 'checksum_error', message: 'Invalid Bitcoin SegWit (bc1) checksum.' }
    }
    if (/^[13]/.test(trimmed)) {
      const payload = verifyBase58Check(trimmed)
      return payload && payload.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05)
        ? { valid: true, chain, status: 'valid', normalized: trimmed, checksumVerified: true, message: 'Valid Bitcoin address' }
        : { valid: false, chain, status: 'checksum_error', message: 'Invalid Bitcoin Base58Check checksum.' }
    }
    return { valid: false, chain, status: 'invalid', message: 'Bitcoin addresses must start with 1, 3, or bc1.' }
  }

  if (chain === 'sol') {
    if (/^0x/i.test(trimmed)) {
      return { valid: false, chain, status: 'wrong_network', message: 'Solana addresses do not start with 0x.' }
    }
    const decoded = decodeBase58(trimmed)
    return decoded && decoded.length === 32
      ? { valid: true, chain, status: 'valid', normalized: trimmed, checksumVerified: false, message: 'Valid Solana address' }
      : { valid: false, chain, status: 'invalid', message: 'Invalid Solana address format.' }
  }

  // Default: EVM / BEP-20 / ERC-20
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return { valid: false, chain, status: 'wrong_network', message: 'This looks like a TRON (TRC-20) address, but this withdrawal uses BEP-20 / EVM (must start with 0x).' }
  }
  if (!trimmed.startsWith('0x') && !trimmed.startsWith('0X')) {
    return { valid: false, chain, status: 'invalid', message: 'Wallet address must start with 0x for BEP-20 / ERC-20 networks.' }
  }
  if (trimmed.length !== 42) {
    return { valid: false, chain, status: 'invalid', message: `BEP-20 / EVM address must be 42 characters (${trimmed.length}/42).` }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { valid: false, chain, status: 'invalid', message: 'Address contains invalid characters (only 0-9 and A-F allowed after 0x).' }
  }
  if (trimmed.toLowerCase() === ZERO_EVM_ADDRESS) {
    return { valid: false, chain, status: 'invalid', message: 'Burn (zero) address cannot be used for withdrawals.' }
  }

  const hexBody = trimmed.slice(2)
  const hasMixedCase = /[a-f]/.test(hexBody) && /[A-F]/.test(hexBody)
  const checksummed = toEip55Checksum(trimmed)

  if (hasMixedCase && trimmed !== checksummed) {
    return {
      valid: false,
      chain,
      status: 'checksum_error',
      normalized: checksummed,
      message: 'Invalid EIP-55 address checksum — possible typo in mixed-case letters. Please double-check your address.'
    }
  }

  return {
    valid: true,
    chain,
    status: 'valid',
    normalized: checksummed,
    checksumVerified: hasMixedCase,
    canChecksumFormat: !hasMixedCase,
    message: hasMixedCase
      ? 'Valid address (EIP-55 checksum verified)'
      : 'Valid BEP-20 / EVM wallet address'
  }
}
