export const DEFAULT_VERIFICATION_SETTINGS = {
  nid_feature_enabled: true,
  gold_badge_label: 'Verified Strong',
  require_front_back: true,
  require_address: true,
  require_selfie: false,
  auto_approve: false,
  section_title: 'NID Identity & Address Verification',
  section_subtitle: 'Fill in your identity details matching the front and back of your National ID (NID) to strengthen your account and earn your Gold Verified Strong badge.'
};

function ensureCol(db, table, col, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
    if (!cols.some(c => c.name === col)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
    }
  } catch (err) {
    console.error(`[VERIFICATION SCHEMA] Failed ensuring ${table}.${col}:`, err.message);
  }
}

export function ensureVerificationSchemaAndDefaults(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verification_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureCol(db, 'verifications', 'first_name', 'first_name TEXT');
  ensureCol(db, 'verifications', 'last_name', 'last_name TEXT');
  ensureCol(db, 'verifications', 'phone_number', 'phone_number TEXT');
  ensureCol(db, 'verifications', 'father_or_spouse_name', 'father_or_spouse_name TEXT');
  ensureCol(db, 'verifications', 'village_address', 'village_address TEXT');
  ensureCol(db, 'verifications', 'city', 'city TEXT');
  ensureCol(db, 'verifications', 'state_province', 'state_province TEXT');
  ensureCol(db, 'verifications', 'postal_code', 'postal_code TEXT');
  ensureCol(db, 'verifications', 'gold_badge', 'gold_badge INTEGER DEFAULT 0');

  const ins = db.prepare(`
    INSERT OR IGNORE INTO verification_settings (key, value) VALUES (?, ?)
  `);
  for (const [k, v] of Object.entries(DEFAULT_VERIFICATION_SETTINGS)) {
    const serialized = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
    ins.run(k, serialized);
  }

  // Ensure existing approved records show the Gold Verified Strong badge unless explicitly turned off
  try {
    db.prepare(`
      UPDATE verifications
      SET gold_badge = 1
      WHERE status = 'approved' AND gold_badge IS NULL
    `).run();
  } catch (_) {}
}

export function getVerificationSettings(db) {
  const rows = db.prepare('SELECT key, value FROM verification_settings').all();
  const map = new Map(rows.map(r => [r.key, r.value]));
  const parseBool = (key, fallback) => {
    if (!map.has(key)) return fallback;
    return map.get(key) === '1' || map.get(key) === 'true';
  };
  return {
    nid_feature_enabled: parseBool('nid_feature_enabled', DEFAULT_VERIFICATION_SETTINGS.nid_feature_enabled),
    gold_badge_label: (map.get('gold_badge_label') || DEFAULT_VERIFICATION_SETTINGS.gold_badge_label).trim() || 'Verified Strong',
    require_front_back: parseBool('require_front_back', DEFAULT_VERIFICATION_SETTINGS.require_front_back),
    require_address: parseBool('require_address', DEFAULT_VERIFICATION_SETTINGS.require_address),
    require_selfie: parseBool('require_selfie', DEFAULT_VERIFICATION_SETTINGS.require_selfie),
    auto_approve: parseBool('auto_approve', DEFAULT_VERIFICATION_SETTINGS.auto_approve),
    section_title: map.get('section_title') || DEFAULT_VERIFICATION_SETTINGS.section_title,
    section_subtitle: map.get('section_subtitle') || DEFAULT_VERIFICATION_SETTINGS.section_subtitle
  };
}

export function saveVerificationSettings(db, patch = {}) {
  const upsert = db.prepare(`
    INSERT INTO verification_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const boolKeys = [
    'nid_feature_enabled',
    'require_front_back',
    'require_address',
    'require_selfie',
    'auto_approve'
  ];
  for (const key of boolKeys) {
    if (patch[key] !== undefined) {
      upsert.run(key, patch[key] ? '1' : '0');
    }
  }
  const textKeys = ['gold_badge_label', 'section_title', 'section_subtitle'];
  for (const key of textKeys) {
    if (typeof patch[key] === 'string') {
      const val = patch[key].trim() || DEFAULT_VERIFICATION_SETTINGS[key];
      upsert.run(key, val);
    }
  }
  return getVerificationSettings(db);
}

export function isUserGoldVerified(vRow) {
  if (!vRow) return false;
  return vRow.status === 'approved' && (vRow.gold_badge === null || vRow.gold_badge === undefined || Number(vRow.gold_badge) === 1);
}

export function computeAccountStrength(vRow, userRow) {
  const hasName = Boolean(userRow?.name && String(userRow.name).trim());
  const hasAvatar = Boolean(userRow?.avatar && String(userRow.avatar).trim());
  const hasIdentityName = Boolean((vRow?.first_name && vRow?.last_name) || vRow?.document_name);
  const hasNidNum = Boolean(vRow?.document_number && String(vRow.document_number).trim());
  const hasDob = Boolean(vRow?.document_birthdate && String(vRow.document_birthdate).trim());
  const hasAddress = Boolean(
    vRow?.village_address &&
    vRow?.city &&
    vRow?.state_province &&
    vRow?.document_country
  );
  const hasFront = Boolean(vRow?.document_front);
  const hasBack = Boolean(vRow?.document_back);
  const goldVerified = isUserGoldVerified(vRow);

  let score = 15; // Verified registered account base
  if (hasName) score += 5;
  if (hasAvatar) score += 5;
  if (hasIdentityName) score += 10;
  if (hasNidNum) score += 10;
  if (hasDob) score += 5;
  if (hasAddress) score += 20;
  if (hasFront) score += 10;
  if (hasBack) score += 10;
  if (goldVerified) score += 10;

  score = Math.min(100, score);
  let tier = 'Basic';
  if (goldVerified) {
    tier = 'Gold Verified Strong';
  } else if (score >= 75) {
    tier = vRow?.status === 'awaiting_approval' ? 'Strong (Awaiting Admin Approval)' : 'Strong';
  } else if (score >= 45) {
    tier = 'Moderate';
  }

  return {
    score,
    tier,
    gold_verified: goldVerified,
    checks: {
      profile_name: hasName,
      profile_avatar: hasAvatar,
      nid_identity: hasIdentityName && hasNidNum,
      full_address: hasAddress,
      nid_front: hasFront,
      nid_back: hasBack,
      admin_approved: goldVerified
    }
  };
}
