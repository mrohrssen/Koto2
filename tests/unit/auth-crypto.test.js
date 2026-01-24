import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, encryptKeys, decryptKeys } from '../../src/auth/crypto.js';

describe('auth/crypto', () => {
  describe('password hashing', () => {
    it('hashes a password and verifies it', async () => {
      const hash = await hashPassword('testpass123');
      assert.notEqual(hash, 'testpass123');
      assert.ok(hash.startsWith('$2b$'));
      const valid = await verifyPassword('testpass123', hash);
      assert.equal(valid, true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('testpass123');
      const valid = await verifyPassword('wrongpass', hash);
      assert.equal(valid, false);
    });
  });

  describe('API key encryption', () => {
    it('encrypts and decrypts keys round-trip', () => {
      const keys = {
        jpdbApiKey: 'jpdb-key-123',
        aiApiKey: 'ai-key-456',
        aiProvider: 'openai',
        openaiModel: 'gpt-4o'
      };
      const encryptionKey = 'a'.repeat(64); // 32 bytes hex
      const encrypted = encryptKeys(keys, encryptionKey);
      assert.notEqual(encrypted, JSON.stringify(keys));
      assert.ok(typeof encrypted === 'string');

      const decrypted = decryptKeys(encrypted, encryptionKey);
      assert.deepEqual(decrypted, keys);
    });

    it('returns empty object for null/empty input', () => {
      const encryptionKey = 'a'.repeat(64);
      const result = decryptKeys(null, encryptionKey);
      assert.deepEqual(result, {});
    });
  });
});
