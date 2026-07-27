import { initCryptoService, generateDepositAddress } from './cryptoService.js';
import db from '../db.js';

// mock db.prepare to ignore updates
db.prepare = function(sql) {
  return {
    run: function() {},
    get: function() { return { id: 1 }; }
  };
};

async function test() {
  initCryptoService();
  try {
    const addr = await generateDepositAddress(9999);
    console.log('Success:', addr);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
