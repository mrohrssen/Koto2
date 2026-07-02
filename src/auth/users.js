import { randomBytes } from 'crypto';
import { hashPassword, encryptKeys, decryptKeys } from './crypto.js';
import { dataPath } from '../data-dir.js';
import { getDb } from '../db.js';

const DEFAULT_FILE = dataPath('.jrpg-users.json'); // legacy import source only
const PERSONALIZED_DIALOGUE_DEBUG_USERNAME = 'michia';

export function isPersonalizedDialogueDebugUser(user) {
  return (user?.username || '').toLowerCase() === PERSONALIZED_DIALOGUE_DEBUG_USERNAME;
}

function rowToUser(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    encryptedApiKeys: row.encrypted_api_keys ? JSON.parse(row.encrypted_api_keys) : null,
    createdAt: row.created_at,
  };
  if (row.is_bot) {
    user.isBot = true;
    user.botProfile = row.bot_profile ? JSON.parse(row.bot_profile) : {};
  }
  return user;
}

/**
 * Read-only compatibility dump in the legacy `{ users, inviteCodes }` shape.
 * users do NOT include reviews/kanjiKombatRuns arrays (no caller needs them).
 * All filePath parameters below are accepted and ignored (legacy signature).
 */
export function loadUsers(_filePath = DEFAULT_FILE) {
  const db = getDb();
  return {
    users: db.prepare('SELECT * FROM users').all().map(rowToUser),
    inviteCodes: db.prepare('SELECT code, used_by AS usedBy, created_at AS createdAt FROM invite_codes').all(),
  };
}

export async function createUserRecord(fields, _filePath = DEFAULT_FILE) {
  const db = getDb();
  const user = {
    id: fields.id || `u_${randomBytes(8).toString('hex')}`,
    username: fields.username,
    passwordHash: fields.passwordHash || await hashPassword(fields.password),
    encryptedApiKeys: fields.encryptedApiKeys ?? null,
    createdAt: fields.createdAt || new Date().toISOString(),
    ...(fields.isBot ? { isBot: true, botProfile: fields.botProfile || {} } : {})
  };
  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, encrypted_api_keys, created_at, is_bot, bot_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id, user.username, user.passwordHash,
      user.encryptedApiKeys ? JSON.stringify(user.encryptedApiKeys) : null,
      user.createdAt, user.isBot ? 1 : 0,
      user.botProfile ? JSON.stringify(user.botProfile) : null
    );
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint failed: users.username')) {
      throw new Error('Username already taken');
    }
    throw e;
  }
  return user;
}

/**
 * Create a new user with hashed password
 * @param {string} username
 * @param {string} password
 * @param {string} filePath
 * @returns {Promise<object>} Created user
 */
export async function createUser(username, password, filePath = DEFAULT_FILE) {
  return createUserRecord({ username, password }, filePath);
}

/**
 * Find user by username
 * @param {string} username
 * @param {string} filePath
 * @returns {object|null}
 */
export function findUserByUsername(username, _filePath = DEFAULT_FILE) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE username = ?').get(username));
}

/**
 * Find user by ID
 * @param {string} id
 * @param {string} filePath
 * @returns {object|null}
 */
export function findUserById(id, _filePath = DEFAULT_FILE) {
  return rowToUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

/**
 * Create an invite code
 * @param {string} adminSecret - Must match ADMIN_SECRET env
 * @param {string} filePath
 * @returns {string} The invite code
 */
export function createInviteCode(_adminSecret, _filePath = DEFAULT_FILE) {
  const code = `NEO-TOKYO-${randomBytes(6).toString('hex')}`;
  getDb().prepare('INSERT INTO invite_codes (code, used_by, created_at) VALUES (?, NULL, ?)')
    .run(code, new Date().toISOString());
  return code;
}

/**
 * Attempt to use an invite code for registration
 * @param {string} code
 * @param {string} userId
 * @param {string} filePath
 * @returns {boolean} Whether the code was valid and unused
 */
export function useInviteCode(code, userId, _filePath = DEFAULT_FILE) {
  const result = getDb().prepare(
    'UPDATE invite_codes SET used_by = ? WHERE code = ? AND used_by IS NULL'
  ).run(userId, code);
  return result.changes === 1;
}

const userKeysCache = new Map(); // userId -> decrypted keys object

function invalidateUserKeysCache(userId) {
  userKeysCache.delete(userId);
}

/**
 * Update a user's encrypted API keys
 * @param {string} userId
 * @param {object} keys - Plaintext key-value pairs
 * @param {string} encryptionKey - 64-char hex encryption key
 * @param {string} filePath
 */
export function updateUserKeys(userId, keys, encryptionKey, _filePath = DEFAULT_FILE) {
  const user = findUserById(userId);
  if (!user) throw new Error('User not found');
  setUserEncryptedApiKeys(userId, encryptKeys(keys, encryptionKey));
}

export function setUserEncryptedApiKeys(userId, encryptedBlobOrNull) {
  getDb().prepare('UPDATE users SET encrypted_api_keys = ? WHERE id = ?')
    .run(encryptedBlobOrNull ? JSON.stringify(encryptedBlobOrNull) : null, userId);
  invalidateUserKeysCache(userId);
}

export function setUserPasswordHash(userId, passwordHash) {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function deleteUserById(userId) {
  const db = getDb();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM reviews WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM kanji_kombat_runs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  remove();
  invalidateUserKeysCache(userId);
}

/**
 * Backfill AI consent/conversation defaults for existing users that predate
 * those fields. Preserves existing encrypted key payloads and only writes when
 * a field is missing.
 *
 * @param {{ filePath?: string, encryptionKey?: string }} options
 * @returns {{ totalUsers: number, migratedUsers: number, skippedUsers: number }}
 */
export function migrateAiConsentForExistingUsers({
  filePath = DEFAULT_FILE,
  encryptionKey = process.env.ENCRYPTION_KEY || 'a'.repeat(64)
} = {}) {
  const users = loadUsers(filePath).users;
  let migratedUsers = 0;
  let skippedUsers = 0;

  for (const user of users) {
    let keys = {};

    if (user?.encryptedApiKeys) {
      try {
        keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
      } catch {
        skippedUsers += 1;
        continue;
      }
    }

    let changed = false;

    if (typeof keys.aiDataSharingConsent !== 'boolean') {
      keys.aiDataSharingConsent = true;
      changed = true;
    }

    const aiConversationsEnabled = isPersonalizedDialogueDebugUser(user)
      ? keys.aiConversationsEnabled === true
      : false;
    if (keys.aiConversationsEnabled !== aiConversationsEnabled) {
      keys.aiConversationsEnabled = aiConversationsEnabled;
      changed = true;
    }

    if (!changed) continue;

    setUserEncryptedApiKeys(user.id, encryptKeys(keys, encryptionKey));
    migratedUsers += 1;
  }

  return {
    totalUsers: users.length,
    migratedUsers,
    skippedUsers
  };
}

/**
 * Record a review timestamp for a user and prune old entries (>7 days)
 * @param {string} userId
 * @param {string} filePath
 */
export function addReview(userId, _filePath = DEFAULT_FILE) {
  const db = getDb();
  if (!findUserById(userId)) return;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO reviews (user_id, ts) VALUES (?, ?)').run(userId, now);
  db.prepare('DELETE FROM reviews WHERE user_id = ? AND ts <= ?').run(userId, sevenDaysAgo);
}

function getKanjiKombatCutoff(period, now = Date.now()) {
  const windowMs = period === 'weekly'
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return now - windowMs;
}

function coerceTimestamp(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Record the furthest Kanji Kombat wave reached for one finished run.
 * @param {string} userId
 * @param {{ wave?: number, wavesCleared?: number, completedAt?: number|string }} run
 * @param {string} filePath
 */
export function recordKanjiKombatRun(userId, run = {}, _filePath = DEFAULT_FILE) {
  const db = getDb();
  if (!findUserById(userId)) return null;
  const completedAt = coerceTimestamp(run.completedAt);
  const wavesCleared = Math.max(0, Math.floor(Number(run.wavesCleared) || 0));
  const wave = Math.max(1, Math.floor(Number(run.wave) || wavesCleared + 1));
  const weeklyCutoff = getKanjiKombatCutoff('weekly');
  const record = db.transaction(() => {
    db.prepare('INSERT INTO kanji_kombat_runs (user_id, ts, wave, waves_cleared) VALUES (?, ?, ?, ?)')
      .run(userId, completedAt, wave, wavesCleared);
    db.prepare('DELETE FROM kanji_kombat_runs WHERE user_id = ? AND ts < ?').run(userId, weeklyCutoff);
  });
  record();
  return { wave, wavesCleared, ts: completedAt };
}

/**
 * Get Kanji Kombat wave leaderboard data for a rolling period.
 * @param {'24h'|'weekly'} period
 * @param {string} currentUserId - The requesting user's ID
 * @param {string} filePath
 * @param {{ now?: number }} opts
 * @returns {{ period: string, entries: Array, currentUser: object }}
 */
export function getKanjiKombatLeaderboard(period, currentUserId, _filePath = DEFAULT_FILE, opts = {}) {
  const normalizedPeriod = period === 'weekly' ? 'weekly' : '24h';
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const cutoff = getKanjiKombatCutoff(normalizedPeriod, now);
  const rows = getDb().prepare(`
    SELECT u.id AS userId, u.username AS username, r.wave AS wave, MIN(r.ts) AS ts
    FROM kanji_kombat_runs r
    JOIN users u ON u.id = r.user_id
    WHERE r.ts >= @cutoff AND r.wave > 0
      AND r.wave = (
        SELECT MAX(r2.wave) FROM kanji_kombat_runs r2
        WHERE r2.user_id = r.user_id AND r2.ts >= @cutoff
      )
    GROUP BY r.user_id
    ORDER BY wave DESC, ts ASC, username ASC
  `).all({ cutoff });

  const currentIndex = rows.findIndex(entry => entry.userId === currentUserId);
  const currentUser = currentIndex !== -1
    ? { rank: currentIndex + 1, wave: rows[currentIndex].wave }
    : { rank: null, wave: 0 };
  const entries = rows.map((entry, index) => ({
    rank: index + 1, username: entry.username, wave: entry.wave,
  }));
  return { period: normalizedPeriod, entries, currentUser };
}

/**
 * Get leaderboard data for a given period
 * @param {'daily'|'weekly'} period
 * @param {string} currentUserId - The requesting user's ID
 * @param {string} filePath
 * @returns {{ period: string, entries: Array, currentUser: object }}
 */
export function getLeaderboard(period, currentUserId, _filePath = DEFAULT_FILE) {
  // Tokyo-time cutoff math copied verbatim from the previous implementation
  const now = Date.now();
  const tokyoOffset = 9 * 60 * 60 * 1000;
  const nowTokyo = new Date(now + tokyoOffset);
  let cutoff;
  if (period === 'weekly') {
    const day = nowTokyo.getUTCDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mondayTokyo = new Date(nowTokyo);
    mondayTokyo.setUTCDate(nowTokyo.getUTCDate() - daysSinceMonday);
    mondayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = mondayTokyo.getTime() - tokyoOffset;
  } else {
    const todayTokyo = new Date(nowTokyo);
    todayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = todayTokyo.getTime() - tokyoOffset;
  }

  const rows = getDb().prepare(`
    SELECT u.username AS username, u.id AS userId, COUNT(*) AS count
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.ts >= ?
    GROUP BY r.user_id
    HAVING COUNT(*) > 0
    ORDER BY count DESC
  `).all(cutoff);

  const currentIndex = rows.findIndex(entry => entry.userId === currentUserId);
  const currentUser = currentIndex !== -1
    ? { rank: currentIndex + 1, count: rows[currentIndex].count }
    : { rank: null, count: 0 };
  const entries = rows.map((entry, index) => ({ rank: index + 1, username: entry.username, count: entry.count }));
  return { period, entries, currentUser };
}

/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys with userId included, or object with just userId
 */
export function getUserKeys(userId) {
  if (userKeysCache.has(userId)) return { ...userKeysCache.get(userId), userId };
  const user = findUserById(userId);
  let result = { userId, aiConversationsEnabled: false };
  if (user?.encryptedApiKeys) {
    try {
      const keys = decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
      result = {
        ...keys,
        aiConversationsEnabled: isPersonalizedDialogueDebugUser(user) && keys.aiConversationsEnabled === true,
        userId,
      };
    } catch { /* fall through to default */ }
  }
  const { userId: _ignored, ...cacheable } = result;
  userKeysCache.set(userId, cacheable);
  return result;
}
