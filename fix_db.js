const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const db = new Database('server/data.db');

const hash = bcrypt.hashSync('Password123!', 10);
const email = 'scottclements@jourrapide.com';
const address = '0x0554a13b5Bd4ab742A41661B1d88FCd11D295141';

db.prepare(`
  INSERT OR REPLACE INTO users (id, email, password_hash, deposit_address, role)
  VALUES (11, ?, ?, ?, 'user')
`).run(email, hash, address);

db.prepare(`
  INSERT OR REPLACE INTO balances (user_id, available)
  VALUES (11, 0.01)
`).run();

console.log("Database updated successfully");
