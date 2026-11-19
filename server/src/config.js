import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(SERVER_ROOT, '.env') });

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_change_me';
if (IS_PRODUCTION && (JWT_SECRET === 'dev_only_change_me' || !process.env.JWT_SECRET)) {
  console.error('[CRITICAL SECURITY RISK] JWT_SECRET is using default development value in production! Set a unique JWT_SECRET in .env');
}

export const DB_FILE = (() => {
  const raw = (process.env.DB_FILE || '').trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(SERVER_ROOT, raw);
  }
  if (fs.existsSync('/var/data')) return '/var/data/data.db';
  if (fs.existsSync('/data')) return '/data/data.db';
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return '/tmp/avapartner-data.db';
  }
  return path.resolve(SERVER_ROOT, 'data.db');
})();
const cleanEnv = (v) => (v || '').trim().replace(/^["']|["']$/g, '');

export const DATABASE_URL = cleanEnv(
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.NEON_DATABASE_URL
);
export const TURSO_DATABASE_URL = cleanEnv(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL);
export const TURSO_AUTH_TOKEN = cleanEnv(process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN);
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@avapartner.com').trim().toLowerCase().replace(/^["']|["']$/g, '');

let rawAdminPass = process.env.ADMIN_PASSWORD;
if (rawAdminPass === 'Admin') {
  // In case .env parsed # as comment without quotes
  rawAdminPass = 'Admin#Secure2026!';
}
export const ADMIN_PASSWORD = (rawAdminPass || 'Admin#Secure2026!').trim().replace(/^["']|["']$/g, '');

const parsedInitialBalance = Number(process.env.INITIAL_BALANCE);
export const INITIAL_BALANCE = Number.isFinite(parsedInitialBalance) && parsedInitialBalance >= 0
  ? parsedInitialBalance
  : 0;

export const AWS_REGION = process.env.AWS_REGION || ''
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ''
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ''
export const AWS_FACE_MATCH_THRESHOLD = (() => {
  const parsed = Number(process.env.AWS_FACE_MATCH_THRESHOLD)
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return 90
})()

export const SMTP_HOST = process.env.SMTP_HOST || ''
export const SMTP_PORT = process.env.SMTP_PORT || ''
export const SMTP_USER = process.env.SMTP_USER || ''
export const SMTP_PASS = process.env.SMTP_PASS || ''

export const TWILIO_SID = process.env.TWILIO_SID || ''
export const TWILIO_TOKEN = process.env.TWILIO_TOKEN || ''
export const TWILIO_FROM = process.env.TWILIO_FROM || ''

export const BSC_RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || ''
export const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || ''
export const USDT_ADDRESS = process.env.USDT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955'
export const HOT_WALLET_ADDRESS = process.env.HOT_WALLET_ADDRESS || ''

