import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { hashPassword, encryptKeys, decryptKeys } from './crypto.js';
import { dataPath } from '../data-dir.js';

const DEFAULT_FILE = dataPath('.jrpg-users.json');

/**
 * Load users data from file
 * @param {string} filePath
 * @returns {{ users: Array, inviteCodes: Array }}
 */
export function loadUsers(filePath = DEFAULT_FILE) {
  if (!existsSync(filePath)) {
    return { users: [], inviteCodes: [] };
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return { users: [], inviteCodes: [] };
  }
}

/**
 * Save users data to file
 * @param {object} data
 * @param {string} filePath
 */
export function saveUsers(data, filePath = DEFAULT_FILE) {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function createUserRecord(fields, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);

  if (data.users.some(u => u.username === fields.username)) {
    throw new Error('Username already taken');
  }

  const user = {
    id: fields.id || `u_${randomBytes(8).toString('hex')}`,
    username: fields.username,
    passwordHash: fields.passwordHash || await hashPassword(fields.password),
    encryptedApiKeys: fields.encryptedApiKeys ?? null,
    createdAt: fields.createdAt || new Date().toISOString(),
    ...(fields.isBot ? { isBot: true, botProfile: fields.botProfile || {} } : {})
  };

  data.users.push(user);
  saveUsers(data, filePath);
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
export function findUserByUsername(username, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  return data.users.find(u => u.username === username) || null;
}

/**
 * Find user by ID
 * @param {string} id
 * @param {string} filePath
 * @returns {object|null}
 */
export function findUserById(id, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  return data.users.find(u => u.id === id) || null;
}

/**
 * Create an invite code
 * @param {string} adminSecret - Must match ADMIN_SECRET env
 * @param {string} filePath
 * @returns {string} The invite code
 */
export function createInviteCode(adminSecret, filePath = DEFAULT_FILE) {
  const code = `NEO-TOKYO-${randomBytes(6).toString('hex')}`;
  const data = loadUsers(filePath);
  data.inviteCodes.push({
    code,
    usedBy: null,
    createdAt: new Date().toISOString()
  });
  saveUsers(data, filePath);
  return code;
}

/**
 * Attempt to use an invite code for registration
 * @param {string} code
 * @param {string} userId
 * @param {string} filePath
 * @returns {boolean} Whether the code was valid and unused
 */
export function useInviteCode(code, userId, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const invite = data.inviteCodes.find(i => i.code === code && !i.usedBy);
  if (!invite) return false;

  invite.usedBy = userId;
  saveUsers(data, filePath);
  return true;
}

/**
 * Update a user's encrypted API keys
 * @param {string} userId
 * @param {object} keys - Plaintext key-value pairs
 * @param {string} encryptionKey - 64-char hex encryption key
 * @param {string} filePath
 */
export function updateUserKeys(userId, keys, encryptionKey, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const user = data.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  user.encryptedApiKeys = encryptKeys(keys, encryptionKey);
  saveUsers(data, filePath);
}

/**
 * Backfill aiDataSharingConsent for existing users that predate the consent field.
 * Preserves existing encrypted key payloads and only writes when consent is missing.
 *
 * @param {{ filePath?: string, encryptionKey?: string }} options
 * @returns {{ totalUsers: number, migratedUsers: number, skippedUsers: number }}
 */
export function migrateAiConsentForExistingUsers({
  filePath = DEFAULT_FILE,
  encryptionKey = process.env.ENCRYPTION_KEY || 'a'.repeat(64)
} = {}) {
  const data = loadUsers(filePath);
  const users = Array.isArray(data.users) ? data.users : [];
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

    if (typeof keys.aiDataSharingConsent === 'boolean') continue;

    keys.aiDataSharingConsent = true;
    user.encryptedApiKeys = encryptKeys(keys, encryptionKey);
    migratedUsers += 1;
  }

  if (migratedUsers > 0) {
    saveUsers(data, filePath);
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
export function addReview(userId, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const user = data.users.find(u => u.id === userId);
  if (!user) return;

  const now = Date.now();
  if (!user.reviews) user.reviews = [];
  user.reviews.push({ ts: now });

  // Prune entries older than 7 days
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  user.reviews = user.reviews.filter(r => r.ts > sevenDaysAgo);

  saveUsers(data, filePath);
}

/**
 * Get leaderboard data for a given period
 * @param {'daily'|'weekly'} period
 * @param {string} currentUserId - The requesting user's ID
 * @param {string} filePath
 * @returns {{ period: string, entries: Array, currentUser: object }}
 */
export function getLeaderboard(period, currentUserId, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);
  const now = Date.now();

  // Tokyo time (UTC+9) boundaries
  const tokyoOffset = 9 * 60 * 60 * 1000;
  const nowTokyo = new Date(now + tokyoOffset);

  let cutoff;
  if (period === 'weekly') {
    // Monday 00:00 JST this week
    const day = nowTokyo.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    const mondayTokyo = new Date(nowTokyo);
    mondayTokyo.setUTCDate(nowTokyo.getUTCDate() - daysSinceMonday);
    mondayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = mondayTokyo.getTime() - tokyoOffset; // Convert back to UTC ms
  } else {
    // Today 00:00 JST
    const todayTokyo = new Date(nowTokyo);
    todayTokyo.setUTCHours(0, 0, 0, 0);
    cutoff = todayTokyo.getTime() - tokyoOffset; // Convert back to UTC ms
  }

  const ranked = data.users
    .map(u => ({
      username: u.username,
      userId: u.id,
      count: (u.reviews || []).filter(r => r.ts >= cutoff).length
    }))
    .filter(e => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const currentUserEntry = ranked.find(e => e.userId === currentUserId);
  const currentUser = currentUserEntry
    ? { rank: ranked.indexOf(currentUserEntry) + 1, count: currentUserEntry.count }
    : { rank: null, count: 0 };

  const entries = ranked.map((e, i) => ({ rank: i + 1, username: e.username, count: e.count }));

  return { period, entries, currentUser };
}

/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys with userId included, or object with just userId
 */
export function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return { userId };
  try {
    const keys = decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
    return { ...keys, userId };
  } catch {
    return { userId };
  }
}
