// Shared slot definitions for AI Trade — used by routes.js and earningsEngine.js
export const AI_TRADE_SLOTS = [
  { slot: 1, name: 'Starter',    min: 10,   max: 100,      userSplit: 60, adminSplit: 40 },
  { slot: 2, name: 'Booster',    min: 101,  max: 1000,     userSplit: 70, adminSplit: 30 },
  { slot: 3, name: 'Premium',    min: 1001, max: 5000,     userSplit: 75, adminSplit: 25 },
  { slot: 4, name: 'Titan Mega', min: 5001, max: Infinity, userSplit: 85, adminSplit: 15 },
];

// Per-minute rate ranges [min, max] per slot → yields correct daily %
// Slot 1: 1.0%–1.5%/day, Slot 2: 1.5%–2.0%/day, Slot 3: 2.0%–2.5%/day, Slot 4: 2.5%–3.0%/day
export const SLOT_RATES = {
  1: { min: 0.01 / 1440,  max: 0.015 / 1440 },
  2: { min: 0.015 / 1440, max: 0.02 / 1440  },
  3: { min: 0.02 / 1440,  max: 0.025 / 1440 },
  4: { min: 0.025 / 1440, max: 0.03 / 1440  },
};
