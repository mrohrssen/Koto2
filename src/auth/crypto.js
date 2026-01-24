import bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password with bcrypt
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Encrypt an object of API keys using AES-256-GCM
 * @param {object} keys - Key-value pairs to encrypt
 * @param {string} encryptionKey - 64-char hex string (32 bytes)
 * @returns {string} Encrypted string (iv:authTag:ciphertext, all hex)
 */
export function encryptKeys(keys, encryptionKey) {
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);

  let encrypted = cipher.update(JSON.stringify(keys), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted API keys string
 * @param {string|null} encryptedStr - Output from encryptKeys()
 * @param {string} encryptionKey - Same 64-char hex string used to encrypt
 * @returns {object} Decrypted key-value pairs
 */
export function decryptKeys(encryptedStr, encryptionKey) {
  if (!encryptedStr) return {};

  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(':');
  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
