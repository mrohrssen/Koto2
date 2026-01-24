import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { hashPassword, encryptKeys } from './crypto.js';

const DEFAULT_FILE = '.jrpg-users.json';

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

/**
 * Create a new user with hashed password
 * @param {string} username
 * @param {string} password
 * @param {string} filePath
 * @returns {Promise<object>} Created user
 */
export async function createUser(username, password, filePath = DEFAULT_FILE) {
  const data = loadUsers(filePath);

  if (data.users.some(u => u.username === username)) {
    throw new Error('Username already taken');
  }

  const user = {
    id: `u_${randomBytes(8).toString('hex')}`,
    username,
    passwordHash: await hashPassword(password),
    encryptedApiKeys: null,
    createdAt: new Date().toISOString()
  };

  data.users.push(user);
  saveUsers(data, filePath);
  return user;
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
