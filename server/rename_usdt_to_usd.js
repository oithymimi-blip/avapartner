import Database from 'better-sqlite3';
import { DB_FILE } from './src/config.js';

const db = new Database(DB_FILE);

console.log('Starting USDT to USD migration...');

const tablesToUpdate = [
  { table: 'market_settings', column: 'symbol' },
  { table: 'candles', column: 'symbol' },
  { table: 'ticks', column: 'symbol' },
  { table: 'spot_markets', column: 'symbol' },
  { table: 'spot_overrides', column: 'symbol' },
  { table: 'binary_trades', column: 'symbol' },
  { table: 'trades', column: 'symbol' }
];

db.transaction(() => {
  for (const { table, column } of tablesToUpdate) {
    console.log(`Updating ${table}...`);
    // REPLACE() will safely replace 'USDT' with 'USD' where it exists in the symbol
    // To be strictly safe against double-replacing or breaking e.g. USDT itself,
    // we only replace it if it's exactly at the end of the string or specifically matches the pattern
    // e.g. BTCUSDT -> BTCUSD
    // sqlite doesn't have regex replace built-in, but we can do:
    // UPDATE table SET symbol = SUBSTR(symbol, 1, LENGTH(symbol) - 1) WHERE symbol LIKE '%USDT'
    
    const stmt = db.prepare(`
      UPDATE ${table}
      SET ${column} = SUBSTR(${column}, 1, LENGTH(${column}) - 1)
      WHERE ${column} LIKE '%USDT'
    `);
    const info = stmt.run();
    console.log(` -> Updated ${info.changes} rows in ${table}`);
  }
})();

console.log('Migration complete!');
