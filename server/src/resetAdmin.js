import db from './db.js';
import bcrypt from 'bcryptjs';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';

const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE email = ? AND role IN ('admin', 'subadmin')");
const info = stmt.run(hash, ADMIN_EMAIL);

console.log(`Reset admin password for ${ADMIN_EMAIL}. Rows affected: ${info.changes}`);
