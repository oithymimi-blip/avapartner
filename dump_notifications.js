const Database = require('better-sqlite3');
const db = new Database('server/data.db');

const rows = db.prepare('SELECT * FROM notifications').all();
console.log(rows);
