# User Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JWT-based user authentication with invite codes so 10-50 friends can each have their own game save and API keys on the shared Railway server.

**Architecture:** Express middleware (`requireAuth`) gates all `/api/game/*` routes. Users register with invite codes, login returns JWT stored in localStorage. Per-user GameManagers loaded from individual save files. API keys stored server-side encrypted per user instead of in localStorage.

**Tech Stack:** bcrypt (password hashing), jsonwebtoken (JWT), Node crypto (AES-256-GCM for API key encryption), Express middleware

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install bcrypt and jsonwebtoken**

Run:
```bash
cd /Users/michia/Documents/jrpg
npm install bcrypt jsonwebtoken
```

**Step 2: Verify installation**

Run:
```bash
node -e "import('bcrypt').then(b => console.log('bcrypt OK')); import('jsonwebtoken').then(j => console.log('jwt OK'));"
```
Expected: Both print OK

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcrypt and jsonwebtoken dependencies"
```

---

## Task 2: Crypto Module (Password Hashing + API Key Encryption)

**Files:**
- Create: `src/auth/crypto.js`
- Create: `tests/unit/auth-crypto.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/unit/auth-crypto.test.js
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
```

**Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/unit/auth-crypto.test.js
```
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// src/auth/crypto.js
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
```

**Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/unit/auth-crypto.test.js
```
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/auth/crypto.js tests/unit/auth-crypto.test.js
git commit -m "feat(auth): add password hashing and API key encryption"
```

---

## Task 3: User Store (CRUD + Invite Codes)

**Files:**
- Create: `src/auth/users.js`
- Create: `tests/unit/auth-users.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/unit/auth-users.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadUsers, saveUsers, createUser, findUserByUsername,
  findUserById, createInviteCode, useInviteCode, updateUserKeys
} from '../../src/auth/users.js';

const TEST_FILE = join(import.meta.dirname, '../../.jrpg-users-test.json');

describe('auth/users', () => {
  beforeEach(() => {
    // Start fresh
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
  });

  it('creates a user with hashed password', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    assert.ok(user.id.startsWith('u_'));
    assert.equal(user.username, 'takeshi');
    assert.ok(user.passwordHash.startsWith('$2b$'));
    assert.ok(user.createdAt);
  });

  it('rejects duplicate usernames', async () => {
    await createUser('takeshi', 'pass123', TEST_FILE);
    await assert.rejects(
      () => createUser('takeshi', 'pass456', TEST_FILE),
      { message: 'Username already taken' }
    );
  });

  it('finds user by username', async () => {
    await createUser('takeshi', 'pass123', TEST_FILE);
    const found = findUserByUsername('takeshi', TEST_FILE);
    assert.equal(found.username, 'takeshi');
  });

  it('finds user by id', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    const found = findUserById(user.id, TEST_FILE);
    assert.equal(found.username, 'takeshi');
  });

  it('creates and uses invite codes', () => {
    const code = createInviteCode('secret123', TEST_FILE);
    assert.ok(code.startsWith('NEO-TOKYO-'));

    const result = useInviteCode(code, 'u_abc', TEST_FILE);
    assert.equal(result, true);

    // Can't reuse
    const result2 = useInviteCode(code, 'u_def', TEST_FILE);
    assert.equal(result2, false);
  });

  it('rejects invalid invite codes', () => {
    const result = useInviteCode('FAKE-CODE', 'u_abc', TEST_FILE);
    assert.equal(result, false);
  });

  it('updates user API keys', async () => {
    const user = await createUser('takeshi', 'pass123', TEST_FILE);
    const encryptionKey = 'b'.repeat(64);
    updateUserKeys(user.id, { jpdbApiKey: 'test-key' }, encryptionKey, TEST_FILE);

    const updated = findUserById(user.id, TEST_FILE);
    assert.ok(updated.encryptedApiKeys); // Should be encrypted string
    assert.notEqual(updated.encryptedApiKeys, 'test-key');
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/unit/auth-users.test.js
```
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// src/auth/users.js
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
 * @returns {Promise<object>} Created user (without password)
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
 * Create an invite code (admin-only)
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
```

**Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/unit/auth-users.test.js
```
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/auth/users.js tests/unit/auth-users.test.js
git commit -m "feat(auth): add user store with invite codes"
```

---

## Task 4: JWT Middleware

**Files:**
- Create: `src/auth/middleware.js`
- Create: `tests/unit/auth-middleware.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/unit/auth-middleware.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, requireAuth } from '../../src/auth/middleware.js';

// Set test secret
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only';

describe('auth/middleware', () => {
  describe('signToken / verifyToken', () => {
    it('creates and verifies a valid token', () => {
      const token = signToken({ id: 'u_123', username: 'takeshi' });
      assert.ok(typeof token === 'string');
      assert.ok(token.split('.').length === 3); // JWT format

      const payload = verifyToken(token);
      assert.equal(payload.id, 'u_123');
      assert.equal(payload.username, 'takeshi');
    });

    it('rejects an invalid token', () => {
      const result = verifyToken('invalid.token.here');
      assert.equal(result, null);
    });

    it('rejects expired token', () => {
      // Create token that's already expired
      const token = signToken({ id: 'u_123', username: 'test' }, '-1s');
      const result = verifyToken(token);
      assert.equal(result, null);
    });
  });

  describe('requireAuth middleware', () => {
    it('attaches user to req on valid token', () => {
      const token = signToken({ id: 'u_123', username: 'takeshi' });
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = { status: () => res, json: () => {} };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      requireAuth(req, res, next);
      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 'u_123');
      assert.equal(req.user.username, 'takeshi');
    });

    it('returns 401 on missing token', () => {
      const req = { headers: {} };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (body) => { responseBody = body; }
      };
      const next = () => {};

      requireAuth(req, res, next);
      assert.equal(statusCode, 401);
      assert.equal(responseBody.error, 'No token provided');
    });

    it('returns 401 on invalid token', () => {
      const req = { headers: { authorization: 'Bearer bad-token' } };
      let statusCode = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: () => {}
      };
      const next = () => {};

      requireAuth(req, res, next);
      assert.equal(statusCode, 401);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/unit/auth-middleware.test.js
```
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// src/auth/middleware.js
import jwt from 'jsonwebtoken';

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-in-production';
}

/**
 * Sign a JWT token for a user
 * @param {{ id: string, username: string }} user
 * @param {string} expiresIn - Token expiry (default: '7d')
 * @returns {string} JWT token
 */
export function signToken(user, expiresIn = '7d') {
  return jwt.sign(
    { id: user.id, username: user.username },
    getSecret(),
    { expiresIn }
  );
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {{ id: string, username: string }|null}
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/**
 * Express middleware: requires valid JWT in Authorization header
 * Attaches req.user = { id, username } on success
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = { id: payload.id, username: payload.username };
  next();
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/unit/auth-middleware.test.js
```
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/auth/middleware.js tests/unit/auth-middleware.test.js
git commit -m "feat(auth): add JWT middleware and token helpers"
```

---

## Task 5: Auth Routes (Register, Login, Me, API Keys, Invite)

**Files:**
- Create: `src/auth/routes.js`
- Create: `tests/unit/auth-routes.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/unit/auth-routes.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_USERS_FILE = join(__dirname, '../../.jrpg-users-routes-test.json');

// Set env before importing
process.env.JWT_SECRET = 'test-secret-for-routes';
process.env.ENCRYPTION_KEY = 'c'.repeat(64);
process.env.ADMIN_SECRET = 'admin-test-secret';

import { createInviteCode } from '../../src/auth/users.js';
import { verifyToken } from '../../src/auth/middleware.js';
import createAuthRoutes from '../../src/auth/routes.js';

describe('auth/routes', () => {
  beforeEach(() => {
    if (existsSync(TEST_USERS_FILE)) unlinkSync(TEST_USERS_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_USERS_FILE)) unlinkSync(TEST_USERS_FILE);
  });

  // Helper to simulate express req/res
  function mockReqRes(body = {}, headers = {}) {
    const req = { body, headers };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseBody = data; }
    };
    return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  it('registers a user with valid invite code', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);

    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });
    const handler = router._testHandlers.register;

    const { req, res, getBody } = mockReqRes({
      username: 'takeshi',
      password: 'pass123',
      inviteCode: code
    });

    await handler(req, res);
    const body = getBody();
    assert.ok(body.token);
    assert.equal(body.user.username, 'takeshi');
    assert.ok(body.user.id.startsWith('u_'));

    // Token should be valid
    const payload = verifyToken(body.token);
    assert.equal(payload.username, 'takeshi');
  });

  it('rejects registration without invite code', async () => {
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });
    const handler = router._testHandlers.register;

    const { req, res, getStatus, getBody } = mockReqRes({
      username: 'takeshi',
      password: 'pass123',
      inviteCode: 'FAKE-CODE'
    });

    await handler(req, res);
    assert.equal(getStatus(), 400);
    assert.ok(getBody().error.includes('invite code'));
  });

  it('logs in with correct credentials', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });

    // Register first
    const regHandler = router._testHandlers.register;
    const { req: regReq, res: regRes } = mockReqRes({
      username: 'takeshi', password: 'pass123', inviteCode: code
    });
    await regHandler(regReq, regRes);

    // Login
    const loginHandler = router._testHandlers.login;
    const { req, res, getBody } = mockReqRes({
      username: 'takeshi', password: 'pass123'
    });
    await loginHandler(req, res);
    const body = getBody();
    assert.ok(body.token);
    assert.equal(body.user.username, 'takeshi');
  });

  it('rejects login with wrong password', async () => {
    const code = createInviteCode('admin-test-secret', TEST_USERS_FILE);
    const router = createAuthRoutes({ usersFile: TEST_USERS_FILE });

    // Register
    const { req: regReq, res: regRes } = mockReqRes({
      username: 'takeshi', password: 'pass123', inviteCode: code
    });
    await router._testHandlers.register(regReq, regRes);

    // Login with wrong password
    const { req, res, getStatus, getBody } = mockReqRes({
      username: 'takeshi', password: 'wrongpass'
    });
    await router._testHandlers.login(req, res);
    assert.equal(getStatus(), 401);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/unit/auth-routes.test.js
```
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// src/auth/routes.js
import { Router } from 'express';
import { signToken, requireAuth } from './middleware.js';
import { verifyPassword, decryptKeys, encryptKeys } from './crypto.js';
import {
  createUser, findUserByUsername, findUserById,
  useInviteCode, createInviteCode, loadUsers
} from './users.js';

const DEFAULT_USERS_FILE = '.jrpg-users.json';

// Rate limiting: 5 login attempts per minute per IP
const loginAttempts = new Map(); // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

/**
 * Create auth router
 * @param {{ usersFile?: string }} options
 * @returns {Router}
 */
export default function createAuthRoutes(options = {}) {
  const usersFile = options.usersFile || DEFAULT_USERS_FILE;
  const encryptionKey = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
  const adminSecret = process.env.ADMIN_SECRET || '';

  const router = Router();

  // POST /api/auth/register
  async function register(req, res) {
    const { username, password, inviteCode } = req.body;

    if (!username || !password || !inviteCode) {
      return res.status(400).json({ error: 'Username, password, and invite code required' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate invite code first (before creating user)
    // Check if code exists and is unused
    const data = loadUsers(usersFile);
    const invite = data.inviteCodes.find(i => i.code === inviteCode && !i.usedBy);
    if (!invite) {
      return res.status(400).json({ error: 'Invalid or used invite code' });
    }

    try {
      const user = await createUser(username, password, usersFile);
      useInviteCode(inviteCode, user.id, usersFile);
      const token = signToken(user);
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  // POST /api/auth/login
  async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in 1 minute.' });
    }

    const user = findUserByUsername(username, usersFile);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username } });
  }

  // GET /api/auth/me
  function me(req, res) {
    const user = findUserById(req.user.id, usersFile);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let apiKeysInfo = {};
    if (user.encryptedApiKeys) {
      try {
        const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
        apiKeysInfo = {
          aiProvider: keys.aiProvider || '',
          openaiModel: keys.openaiModel || '',
          openrouterModel: keys.openrouterModel || '',
          jlptLevel: keys.jlptLevel || 'N4',
          hasJpdbKey: !!keys.jpdbApiKey,
          hasAiKey: !!keys.aiApiKey
        };
      } catch {
        apiKeysInfo = {};
      }
    }

    res.json({ id: user.id, username: user.username, apiKeys: apiKeysInfo });
  }

  // PUT /api/auth/api-keys
  function updateKeys(req, res) {
    const { jpdbApiKey, aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel } = req.body;
    const keys = {};
    if (jpdbApiKey !== undefined) keys.jpdbApiKey = jpdbApiKey;
    if (aiApiKey !== undefined) keys.aiApiKey = aiApiKey;
    if (aiProvider !== undefined) keys.aiProvider = aiProvider;
    if (openaiModel !== undefined) keys.openaiModel = openaiModel;
    if (openrouterModel !== undefined) keys.openrouterModel = openrouterModel;
    if (jlptLevel !== undefined) keys.jlptLevel = jlptLevel;

    // Merge with existing keys (partial update)
    const user = findUserById(req.user.id, usersFile);
    let existingKeys = {};
    if (user?.encryptedApiKeys) {
      try { existingKeys = decryptKeys(user.encryptedApiKeys, encryptionKey); } catch {}
    }
    const merged = { ...existingKeys, ...keys };

    const encrypted = encryptKeys(merged, encryptionKey);

    // Save directly to users file
    const data = loadUsers(usersFile);
    const u = data.users.find(u => u.id === req.user.id);
    if (u) {
      u.encryptedApiKeys = encrypted;
      const { saveUsers } = await import('./users.js');
      saveUsers(data, usersFile);
    }

    res.json({ success: true });
  }

  // POST /api/auth/generate-invite
  function generateInvite(req, res) {
    const secret = req.headers['x-admin-secret'];
    if (!adminSecret || secret !== adminSecret) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const code = createInviteCode(adminSecret, usersFile);
    res.json({ code });
  }

  // Mount routes
  router.post('/register', register);
  router.post('/login', login);
  router.get('/me', requireAuth, me);
  router.put('/api-keys', requireAuth, updateKeys);
  router.post('/generate-invite', generateInvite);

  // Expose handlers for testing
  router._testHandlers = { register, login, me, updateKeys, generateInvite };

  return router;
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/unit/auth-routes.test.js
```
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/auth/routes.js tests/unit/auth-routes.test.js
git commit -m "feat(auth): add auth routes (register, login, me, api-keys, invite)"
```

---

## Task 6: Manager Registry (Per-User GameManagers)

**Files:**
- Create: `src/game/manager-registry.js`
- Create: `tests/unit/manager-registry.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/unit/manager-registry.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getManager, saveManager, removeManager } from '../../src/game/manager-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('manager-registry', () => {
  const testDir = join(__dirname, '../..');
  const testSaveFile = join(testDir, '.jrpg-save-u_test123.json');

  afterEach(() => {
    removeManager('u_test123');
    if (existsSync(testSaveFile)) unlinkSync(testSaveFile);
  });

  it('creates a new GameManager for unknown user', () => {
    const manager = getManager('u_test123');
    assert.ok(manager);
    assert.equal(manager.player, null); // Fresh state
  });

  it('returns same manager on repeated calls', () => {
    const m1 = getManager('u_test123');
    const m2 = getManager('u_test123');
    assert.strictEqual(m1, m2);
  });

  it('loads existing save file', () => {
    const saveData = {
      player: { name: 'TestPlayer', stats: { str: 5 }, hp: 100, max_hp: 100, level: 1, exp: 0, money: 0, inventory: [], equipment: {}, chips: { loadout: [], inventory: [] } },
      meta: { essence: 50, upgrades: [], achievements: [], lifetimeStats: {} }
    };
    writeFileSync(testSaveFile, JSON.stringify(saveData));

    const manager = getManager('u_test123');
    assert.equal(manager.player.name, 'TestPlayer');
  });

  it('saves manager state to user-specific file', () => {
    const manager = getManager('u_test123');
    manager.createPlayer('SaveTest', { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 });
    saveManager('u_test123');

    assert.ok(existsSync(testSaveFile));
    const saved = JSON.parse(require('fs').readFileSync(testSaveFile, 'utf-8'));
    assert.equal(saved.player.name, 'SaveTest');
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
node --test tests/unit/manager-registry.test.js
```
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// src/game/manager-registry.js
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GameManager } from './loop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, '../..');

/** @type {Map<string, GameManager>} */
const managers = new Map();

/**
 * Get or create a GameManager for a user
 * Loads from .jrpg-save-{userId}.json if it exists
 * @param {string} userId
 * @returns {GameManager}
 */
export function getManager(userId) {
  if (managers.has(userId)) return managers.get(userId);

  const manager = new GameManager();
  const saveFile = join(BASE_DIR, `.jrpg-save-${userId}.json`);

  if (existsSync(saveFile)) {
    try {
      const data = JSON.parse(readFileSync(saveFile, 'utf-8'));
      if (data.player) manager.loadPlayer(data.player);
      if (data.meta) manager.initMeta(data.meta);
    } catch (e) {
      console.warn(`Failed to load save for ${userId}:`, e.message);
    }
  }

  managers.set(userId, manager);
  return manager;
}

/**
 * Save a user's GameManager state to disk
 * @param {string} userId
 */
export function saveManager(userId) {
  const manager = managers.get(userId);
  if (!manager) return;

  const saveFile = join(BASE_DIR, `.jrpg-save-${userId}.json`);
  const state = {
    player: manager.player,
    meta: manager.getMeta()
  };
  writeFileSync(saveFile, JSON.stringify(state, null, 2));
}

/**
 * Remove a manager from the registry (for cleanup/testing)
 * @param {string} userId
 */
export function removeManager(userId) {
  managers.delete(userId);
}

/**
 * Get the save file path for a user
 * @param {string} userId
 * @returns {string}
 */
export function getSaveFilePath(userId) {
  return join(BASE_DIR, `.jrpg-save-${userId}.json`);
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
node --test tests/unit/manager-registry.test.js
```
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/game/manager-registry.js tests/unit/manager-registry.test.js
git commit -m "feat(auth): add per-user GameManager registry"
```

---

## Task 7: Mount Auth Routes + Protect Game Routes

**Files:**
- Modify: `server.js` (mount auth routes, add requireAuth to game routes)
- Modify: `src/routes/index.js` (pass requireAuth as dependency)
- Modify: `src/routes/game/index.js` (apply requireAuth middleware to all game routes)

**Step 1: Modify server.js to mount auth routes**

In `server.js`, after the existing imports (around line 131), add:

```javascript
import createAuthRoutes from './src/auth/routes.js';
```

After the `app.use('/api', createRoutes({...}))` block (after line 353), add:

```javascript
// Auth routes: /api/auth/*
app.use('/api/auth', createAuthRoutes());
```

**Step 2: Add requireAuth to the route dependencies**

In `src/routes/index.js`, add the import:

```javascript
import { requireAuth } from '../auth/middleware.js';
```

Pass it to game routes:

```javascript
router.use('/game', createGameRoutes({
  ...deps.gameRoutesDeps, // existing deps
  requireAuth
}));
```

Actually, simpler: modify the game routes index to import requireAuth directly.

In `src/routes/game/index.js`, add at the top:

```javascript
import { requireAuth } from '../../auth/middleware.js';
```

Then apply it as middleware to all game routes:

```javascript
// Apply auth to all game routes
router.use(requireAuth);
```

This goes after the router is created but before routes are mounted.

**Step 3: Swap singleton GameManager for manager-registry**

In `src/routes/game/index.js`, the deps currently receive `gameManager` as a singleton. We need to change routes to use `getManager(req.user.id)` instead.

This is the biggest change. Each route file receives `deps.gameManager` - we need to change them to receive a `getManager` function instead, or have the game index wrap each request.

**Approach:** Add middleware at the game router level that attaches `req.gameManager` based on `req.user.id`:

```javascript
import { getManager, saveManager } from '../../game/manager-registry.js';

// After requireAuth runs, attach per-user manager
router.use((req, res, next) => {
  req.gameManager = getManager(req.user.id);
  req.saveGame = () => saveManager(req.user.id);
  next();
});
```

Then update route handlers to use `req.gameManager` instead of `deps.gameManager`.

**Step 4: Update game route files to use req.gameManager**

Each file in `src/routes/game/` (state.js, player.js, run.js, combat.js, economy.js, misc.js) currently does:

```javascript
const { gameManager } = deps;
// ... uses gameManager.method()
```

Change to:

```javascript
// In each handler:
const gameManager = req.gameManager;
```

And change save calls from `deps.saveGameData()` to `req.saveGame()`.

**Step 5: Also update the enriched state and narration to be per-user**

The `getEnrichedGameState()` function in server.js currently uses the singleton. We need to make it accept a GameManager parameter:

```javascript
function getEnrichedGameState(manager) {
  const state = manager.getState();
  // ... enrichment logic
}
```

And narration needs user's API keys from their profile:

```javascript
import { findUserById } from './src/auth/users.js';
import { decryptKeys } from './src/auth/crypto.js';

// In route handlers:
const user = findUserById(req.user.id);
const userKeys = decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY);
```

**Step 6: Run existing tests to verify nothing is broken**

Run:
```bash
node --test tests/unit/*.test.js
```
Expected: All unit tests PASS (auth tests + existing chip tests)

**Step 7: Commit**

```bash
git add server.js src/routes/index.js src/routes/game/
git commit -m "feat(auth): protect game routes with JWT, per-user GameManagers"
```

---

## Task 8: Frontend Auth UI (Login/Register Screen)

**Files:**
- Create: `public/js/ui/auth.js`
- Modify: `public/game.html` (add auth modal/screen markup)
- Modify: `public/game.css` (auth screen styles)

**Step 1: Add auth screen HTML to game.html**

Before the existing game content (inside `.game-app` but before `<header>`), add an auth screen that covers the full viewport when not logged in:

```html
<!-- Auth Screen (shown before login) -->
<div class="auth-screen" id="auth-screen">
  <div class="auth-container">
    <h1 class="auth-title">NEO TOKYO</h1>
    <p class="auth-subtitle">System Liberation</p>

    <div class="auth-form" id="auth-form">
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">Login</button>
        <button class="auth-tab" data-tab="register">Register</button>
      </div>

      <div class="auth-fields" id="auth-fields">
        <input type="text" id="auth-username" placeholder="Username" autocomplete="username" />
        <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password" />
        <input type="text" id="auth-invite" placeholder="Invite Code" class="hidden" />
        <button class="btn-primary" id="auth-submit">Login</button>
        <p class="auth-error hidden" id="auth-error"></p>
      </div>
    </div>

    <button class="btn-text" id="auth-logout" style="display:none;">Logout</button>
  </div>
</div>
```

**Step 2: Add auth CSS styles**

Add to `public/game.css`:

```css
/* ============ AUTH SCREEN ============ */
.auth-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.auth-screen.hidden { display: none; }

.auth-container {
  width: 100%;
  max-width: 360px;
  padding: 2rem;
  text-align: center;
}

.auth-title {
  font-size: 2rem;
  color: var(--system-cyan);
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
  margin-bottom: 0.25rem;
}

.auth-subtitle {
  color: var(--text-muted);
  margin-bottom: 2rem;
  font-size: 0.9rem;
}

.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
}

.auth-tab {
  flex: 1;
  padding: 0.6rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
}

.auth-tab.active {
  background: var(--sl-blue);
  color: white;
  border-color: var(--sl-blue);
}

.auth-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.auth-fields input {
  padding: 0.7rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 4px;
  font-size: 0.9rem;
}

.auth-fields input:focus {
  border-color: var(--system-cyan);
  outline: none;
}

.auth-error {
  color: var(--error);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

#auth-logout {
  margin-top: 2rem;
  color: var(--text-muted);
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
}
```

**Step 3: Create the auth UI module**

```javascript
// public/js/ui/auth.js

/**
 * Auth UI Module
 * Handles login/register forms and token management
 */

let currentTab = 'login';

/**
 * Initialize auth UI event listeners
 * @param {{ onAuthenticated: function }} callbacks
 */
export function init(callbacks) {
  const tabs = document.querySelectorAll('.auth-tab');
  const inviteField = document.getElementById('auth-invite');
  const submitBtn = document.getElementById('auth-submit');
  const logoutBtn = document.getElementById('auth-logout');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (currentTab === 'register') {
        inviteField.classList.remove('hidden');
        submitBtn.textContent = 'Register';
        document.getElementById('auth-password').autocomplete = 'new-password';
      } else {
        inviteField.classList.add('hidden');
        submitBtn.textContent = 'Login';
        document.getElementById('auth-password').autocomplete = 'current-password';
      }
      hideError();
    });
  });

  submitBtn.addEventListener('click', () => handleSubmit(callbacks));

  // Enter key submits
  document.getElementById('auth-fields').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit(callbacks);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
      showAuthScreen();
    });
  }
}

/**
 * Check if user is authenticated, attempt token refresh
 * @returns {Promise<boolean>}
 */
export async function checkAuth() {
  const token = getToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) return true;
    // Token expired/invalid
    removeToken();
    return false;
  } catch {
    return false;
  }
}

/**
 * Show auth screen, hide game
 */
export function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
}

/**
 * Hide auth screen, show game
 */
export function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

/**
 * Get stored auth token
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem('authToken');
}

/**
 * Remove auth token (logout)
 */
export function logout() {
  localStorage.removeItem('authToken');
}

// ---- Internal ----

function removeToken() {
  localStorage.removeItem('authToken');
}

function storeToken(token) {
  localStorage.setItem('authToken', token);
}

async function handleSubmit(callbacks) {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const inviteCode = document.getElementById('auth-invite').value.trim();

  if (!username || !password) {
    showError('Username and password required');
    return;
  }

  if (currentTab === 'register' && !inviteCode) {
    showError('Invite code required');
    return;
  }

  hideError();
  const endpoint = currentTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  const body = currentTab === 'login'
    ? { username, password }
    : { username, password, inviteCode };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Authentication failed');
      return;
    }

    storeToken(data.token);
    hideAuthScreen();
    if (callbacks.onAuthenticated) {
      callbacks.onAuthenticated(data.user);
    }
  } catch (err) {
    showError('Network error. Please try again.');
  }
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  const el = document.getElementById('auth-error');
  el.classList.add('hidden');
}
```

**Step 4: Syntax check**

Run:
```bash
node --check public/js/ui/auth.js && echo "OK"
```
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/auth.js public/game.html public/game.css
git commit -m "feat(auth): add login/register UI screen"
```

---

## Task 9: Frontend Boot Flow (Auth Gate)

**Files:**
- Modify: `public/game.js` (import auth module, gate game init behind auth check)
- Modify: `public/js/api.js` (add JWT header to all requests, remove API keys from body)

**Step 1: Modify api.js to use JWT header**

Replace the `apiCall` function's auth mechanism. Instead of injecting API keys into the body, attach the JWT header:

```javascript
// In apiCall function, change the options:
const token = localStorage.getItem('authToken');
const options = {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
};
if (method !== 'GET' && body) options.body = JSON.stringify(body);
```

Remove the `getApiKeys()` injection from the body. The server now gets API keys from the user's profile.

Also update all direct `fetch()` calls in api.js that currently inject API keys (e.g., `equipChip`, `sendJpdbReview`).

Add a helper:

```javascript
/**
 * Get auth headers for API calls
 * @returns {object} Headers with Authorization if token exists
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}
```

**Step 2: Modify game.js boot flow**

At the top of game.js, add the auth import:

```javascript
import * as auth from './js/ui/auth.js';
```

Change the initialization (currently just calls `loadGameState()` on DOMContentLoaded) to:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  auth.init({
    onAuthenticated: () => initGame()
  });

  const isAuth = await auth.checkAuth();
  if (isAuth) {
    auth.hideAuthScreen();
    initGame();
  } else {
    auth.showAuthScreen();
  }
});

async function initGame() {
  // existing loadGameState() and UI init code moves here
  await loadGameState();
  // ... rest of init
}
```

**Step 3: Add logout button to header**

In game.html, add a logout button in the header-right div:

```html
<button id="logout-btn" title="Logout">⏻</button>
```

Wire it in game.js:

```javascript
document.getElementById('logout-btn').addEventListener('click', () => {
  auth.logout();
  auth.showAuthScreen();
});
```

**Step 4: Syntax check**

Run:
```bash
node --check public/game.js && node --check public/js/api.js && echo "OK"
```
Expected: OK

**Step 5: Commit**

```bash
git add public/game.js public/js/api.js public/game.html
git commit -m "feat(auth): gate game behind auth, add JWT to API calls"
```

---

## Task 10: Server-Side API Key Injection

**Files:**
- Modify: `src/routes/game/` route files (read user keys from profile instead of req.body)
- Modify: `server.js` (update generateGameNarration to accept user keys)

**Step 1: Update narration and JPDB routes to read keys from user profile**

In the game route handlers that currently read `req.body.jpdbApiKey` or `req.body.aiApiKey`, change to read from the user's encrypted profile:

```javascript
import { findUserById } from '../../auth/users.js';
import { decryptKeys } from '../../auth/crypto.js';

// Helper to get user's API keys (add to game/index.js or a shared helper)
function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return {};
  try {
    return decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
  } catch {
    return {};
  }
}
```

In route handlers, replace:
```javascript
const { jpdbApiKey, aiApiKey, aiProvider, ... } = req.body;
```

With:
```javascript
const userKeys = getUserKeys(req.user.id);
```

**Step 2: Also update vocab/JPDB routes**

The vocab and JPDB routes in `src/routes/vocab.js` also need user keys. Add requireAuth there too and read from profile.

**Step 3: Run unit tests**

Run:
```bash
node --test tests/unit/*.test.js
```
Expected: All PASS

**Step 4: Commit**

```bash
git add src/routes/ server.js
git commit -m "feat(auth): inject API keys from user profile server-side"
```

---

## Task 11: Settings Modal Changes (Save Keys to Server)

**Files:**
- Modify: `public/js/settings.js` (save/load API keys via server instead of localStorage)
- Modify: `public/js/ui/modals.js` (settings modal fetches keys from /api/auth/me)

**Step 1: Update settings.js**

Change `getApiKeys()` to be a no-op (keys are server-side now). Add functions to save/load keys from server:

```javascript
/**
 * Save API keys to server (authenticated)
 */
export async function saveApiKeysToServer(keys) {
  const token = localStorage.getItem('authToken');
  const res = await fetch('/api/auth/api-keys', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(keys)
  });
  return res.ok;
}

/**
 * Load API key info from server (for settings display)
 */
export async function loadApiKeysFromServer() {
  const token = localStorage.getItem('authToken');
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data.apiKeys || {};
}
```

**Step 2: Update settings modal to use server-side keys**

When the settings modal opens, fetch current key info from `/api/auth/me` to pre-fill the form. On save, PUT to `/api/auth/api-keys`.

**Step 3: Keep local-only settings in localStorage**

Some settings are still local-only (TTS preferences, JLPT level display). Only API keys move server-side.

**Step 4: Syntax check**

Run:
```bash
node --check public/js/settings.js && echo "OK"
```
Expected: OK

**Step 5: Commit**

```bash
git add public/js/settings.js public/js/ui/modals.js
git commit -m "feat(auth): save/load API keys via server in settings modal"
```

---

## Task 12: Environment Variables + .env.example

**Files:**
- Create: `.env.example`
- Modify: `.gitignore` (ensure .jrpg-users.json is ignored)

**Step 1: Create .env.example**

```bash
# Authentication
JWT_SECRET=your-random-64-char-string-here
ENCRYPTION_KEY=your-random-32-byte-hex-string-here
ADMIN_SECRET=your-random-admin-secret-here

# Existing
PORT=3000
```

**Step 2: Add user data files to .gitignore**

```
.jrpg-users.json
.jrpg-save-*.json
```

**Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add auth env example and gitignore user data"
```

---

## Task 13: Integration Test (Full Auth Flow)

**Files:**
- Create: `tests/integration/auth-flow.test.js`

**Step 1: Write integration test**

```javascript
// tests/integration/auth-flow.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_USERS = join(__dirname, '../../.jrpg-users-integration-test.json');

process.env.JWT_SECRET = 'integration-test-secret';
process.env.ENCRYPTION_KEY = 'd'.repeat(64);
process.env.ADMIN_SECRET = 'admin-integration-test';

import createAuthRoutes from '../../src/auth/routes.js';
import { verifyToken } from '../../src/auth/middleware.js';
import { createInviteCode } from '../../src/auth/users.js';

describe('Auth Integration Flow', () => {
  let router;

  beforeEach(() => {
    if (existsSync(TEST_USERS)) unlinkSync(TEST_USERS);
    router = createAuthRoutes({ usersFile: TEST_USERS });
  });

  afterEach(() => {
    if (existsSync(TEST_USERS)) unlinkSync(TEST_USERS);
  });

  function mockReqRes(body = {}, headers = {}) {
    const req = { body, headers, ip: '127.0.0.1', user: null };
    let statusCode = 200;
    let responseBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { responseBody = data; }
    };
    return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  it('full flow: generate invite -> register -> login -> get me -> update keys', async () => {
    // 1. Generate invite code
    const { req: invReq, res: invRes, getBody: invBody } = mockReqRes(
      {}, { 'x-admin-secret': 'admin-integration-test' }
    );
    router._testHandlers.generateInvite(invReq, invRes);
    const code = invBody().code;
    assert.ok(code.startsWith('NEO-TOKYO-'));

    // 2. Register
    const { req: regReq, res: regRes, getBody: regBody } = mockReqRes({
      username: 'integration_user', password: 'securepass', inviteCode: code
    });
    await router._testHandlers.register(regReq, regRes);
    const regData = regBody();
    assert.ok(regData.token);
    const userId = regData.user.id;

    // 3. Login
    const { req: loginReq, res: loginRes, getBody: loginBody } = mockReqRes({
      username: 'integration_user', password: 'securepass'
    });
    await router._testHandlers.login(loginReq, loginRes);
    assert.ok(loginBody().token);

    // 4. Get /me
    const mePayload = verifyToken(regData.token);
    const { req: meReq, res: meRes, getBody: meBody } = mockReqRes();
    meReq.user = { id: mePayload.id, username: mePayload.username };
    router._testHandlers.me(meReq, meRes);
    assert.equal(meBody().username, 'integration_user');
    assert.equal(meBody().apiKeys.hasJpdbKey, false);

    // 5. Update API keys
    const { req: keyReq, res: keyRes, getBody: keyBody } = mockReqRes({
      jpdbApiKey: 'test-jpdb-key', aiApiKey: 'test-ai-key', aiProvider: 'openai'
    });
    keyReq.user = { id: userId };
    await router._testHandlers.updateKeys(keyReq, keyRes);
    assert.equal(keyBody().success, true);

    // 6. Verify keys saved (via /me)
    const { req: me2Req, res: me2Res, getBody: me2Body } = mockReqRes();
    me2Req.user = { id: userId };
    router._testHandlers.me(me2Req, me2Res);
    assert.equal(me2Body().apiKeys.hasJpdbKey, true);
    assert.equal(me2Body().apiKeys.hasAiKey, true);
    assert.equal(me2Body().apiKeys.aiProvider, 'openai');
  });
});
```

**Step 2: Run integration test**

Run:
```bash
node --test tests/integration/auth-flow.test.js
```
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/auth-flow.test.js
git commit -m "test: add auth integration flow test"
```

---

## Task 14: E2E Tests (Auth UI)

**Files:**
- Create: `tests/e2e/specs/auth.spec.ts`

**Step 1: Write E2E test for auth flow**

```typescript
// tests/e2e/specs/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.removeItem('authToken'));
    await page.reload();
  });

  test('shows auth screen when not logged in', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const authScreen = page.locator('#auth-screen');
    await expect(authScreen).toBeVisible();
  });

  test('login tab is active by default', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const loginTab = page.locator('.auth-tab[data-tab="login"]');
    await expect(loginTab).toHaveClass(/active/);
  });

  test('shows invite code field on register tab', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.locator('.auth-tab[data-tab="register"]').click();
    const inviteField = page.locator('#auth-invite');
    await expect(inviteField).toBeVisible();
  });

  test('shows error on invalid login', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.locator('#auth-username').fill('nonexistent');
    await page.locator('#auth-password').fill('wrongpass');
    await page.locator('#auth-submit').click();
    const error = page.locator('#auth-error');
    await expect(error).toBeVisible();
  });
});
```

**Step 2: Run e2e test**

Run:
```bash
./scripts/e2e-test.sh specs/auth
```
Expected: All auth tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/specs/auth.spec.ts
git commit -m "test: add auth e2e tests"
```

---

## Task 15: Run Full Test Suite

**Step 1: Run all unit tests**

Run:
```bash
npm run test:unit
```
Expected: All PASS (49 existing + ~17 new auth tests)

**Step 2: Run integration tests**

Run:
```bash
npm run test:integration
```
Expected: All PASS

**Step 3: Run e2e tests**

Run:
```bash
./scripts/e2e-test.sh
```
Expected: 80+/87 existing tests PASS (some may need auth token setup in fixtures)

**Step 4: Fix any broken e2e tests**

Existing e2e tests will fail because they don't provide auth tokens. Update `tests/e2e/fixtures/test-fixtures.ts`:

- Before each test, register a test user (or have a pre-seeded test user)
- Store the auth token in localStorage before navigating

```typescript
// In test-fixtures.ts, add to resetGameState:
export async function resetGameState(page: Page) {
  // Create test user if needed
  const res = await page.request.post('http://localhost:3000/api/auth/login', {
    data: { username: 'test_user', password: 'test_pass' }
  });

  if (res.ok()) {
    const { token } = await res.json();
    await page.goto('http://localhost:3000');
    await page.evaluate((t) => localStorage.setItem('authToken', t), token);
  }

  // Existing reset logic
  await page.request.post('http://localhost:3000/api/game/full-reset');
}
```

The server should seed a test user on startup in dev mode, or the test setup should create one via the invite code flow.

**Step 5: Commit any test fixes**

```bash
git add tests/
git commit -m "fix: update e2e fixtures for auth"
```

---

## Task 16: Generate Initial Invite Codes (Admin Script)

**Files:**
- Create: `scripts/generate-invites.js`

**Step 1: Write the script**

```javascript
// scripts/generate-invites.js
/**
 * Generate invite codes for friends
 * Usage: ADMIN_SECRET=your-secret node scripts/generate-invites.js [count]
 */
import { createInviteCode, loadUsers } from '../src/auth/users.js';

const count = parseInt(process.argv[2]) || 5;
const adminSecret = process.env.ADMIN_SECRET;

if (!adminSecret) {
  console.error('Set ADMIN_SECRET env variable');
  process.exit(1);
}

console.log(`Generating ${count} invite codes...\n`);

for (let i = 0; i < count; i++) {
  const code = createInviteCode(adminSecret);
  console.log(code);
}

console.log('\nDone. Share these with friends to register.');
```

**Step 2: Test it**

Run:
```bash
ADMIN_SECRET=test node scripts/generate-invites.js 3
```
Expected: Prints 3 NEO-TOKYO-* codes

**Step 3: Commit**

```bash
git add scripts/generate-invites.js
git commit -m "feat(auth): add invite code generation script"
```

---

## Summary of Dependencies Between Tasks

```
Task 1 (deps)
  ↓
Task 2 (crypto) ──┐
  ↓                │
Task 3 (users) ───┤
  ↓                │
Task 4 (middleware)┤
  ↓                │
Task 5 (routes) ◄──┘
  ↓
Task 6 (manager-registry)
  ↓
Task 7 (mount routes + protect game routes) ← requires 2-6
  ↓
Task 8 (frontend auth UI)
  ↓
Task 9 (boot flow + api.js JWT) ← requires 7-8
  ↓
Task 10 (server-side key injection) ← requires 7
  ↓
Task 11 (settings modal changes) ← requires 9-10
  ↓
Task 12 (env + gitignore)
  ↓
Task 13 (integration test)
  ↓
Task 14 (e2e tests) ← requires 7-11
  ↓
Task 15 (full test run + fixes)
  ↓
Task 16 (invite script)
```
