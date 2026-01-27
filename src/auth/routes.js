import { Router } from 'express';
import { signToken, requireAuth } from './middleware.js';
import { verifyPassword, decryptKeys, encryptKeys } from './crypto.js';
import {
  createUser, findUserByUsername, findUserById,
  useInviteCode, createInviteCode, loadUsers, saveUsers
} from './users.js';
import { dataPath } from '../data-dir.js';

const DEFAULT_USERS_FILE = dataPath('.jrpg-users.json');

// Permanent invite code - unlimited uses, works locally and on Railway
const PERMANENT_INVITE_CODE = 'neo-tokyo-friends';

// Rate limiting: 5 login attempts per minute per IP
const loginAttempts = new Map();

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

    // Check for permanent invite code (unlimited uses)
    const isPermanentCode = inviteCode === PERMANENT_INVITE_CODE;

    if (!isPermanentCode) {
      // Validate one-time invite code
      const data = loadUsers(usersFile);
      const invite = data.inviteCodes.find(i => i.code === inviteCode && !i.usedBy);
      if (!invite) {
        return res.status(400).json({ error: 'Invalid or used invite code' });
      }
    }

    try {
      const user = await createUser(username, password, usersFile);
      // Only mark one-time codes as used
      if (!isPermanentCode) {
        useInviteCode(inviteCode, user.id, usersFile);
      }
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
      // In test mode, return a mock user profile so the frontend proceeds
      if (process.env.NODE_ENV === 'test' || process.env.SKIP_AUTH === 'true') {
        return res.json({ id: req.user.id, username: req.user.username, apiKeys: {} });
      }
      return res.status(404).json({ error: 'User not found' });
    }

    let apiKeysInfo = {
      aiProvider: '',
      openaiModel: '',
      openrouterModel: '',
      jlptLevel: 'N4',
      hasJpdbKey: false,
      hasAiKey: false
    };
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
        // Keep defaults on decryption failure
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

    // Save to users file
    const data = loadUsers(usersFile);
    const u = data.users.find(u => u.id === req.user.id);
    if (u) {
      u.encryptedApiKeys = encrypted;
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
