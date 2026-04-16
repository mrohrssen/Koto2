import { Router } from 'express';
import multer from 'multer';
import { signToken, requireAuth } from './middleware.js';
import { verifyPassword, decryptKeys, encryptKeys } from './crypto.js';
import {
  createUser, findUserByUsername, findUserById,
  useInviteCode, createInviteCode, loadUsers, saveUsers
} from './users.js';
import { dataPath } from '../data-dir.js';
import { parseWordList } from '../game/bootstrap/word-list-parser.js';
import { createCard, gradeCard } from '../game/internal-srs.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

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

      // Seed FSRS vocab deck from uploaded word list
      if (req.file) {
        const words = parseWordList(req.file.buffer.toString('utf-8'));
        for (const word of words) {
          createCard(user.id, 'vocab', word, { word, meaning: '', reading: word });
          gradeCard(user.id, 'vocab', word, 'good');
        }
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
      // Mock profile for tests, explicit skip, or local non-production when JWT is valid but user row is missing.
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.SKIP_AUTH === 'true' ||
        process.env.NODE_ENV !== 'production'
      ) {
        return res.json({ id: req.user.id, username: req.user.username, apiKeys: {} });
      }
      return res.status(404).json({ error: 'User not found' });
    }

    let apiKeysInfo = {
      aiProvider: '',
      openaiModel: '',
      openrouterModel: '',
      jlptLevel: 'N4',
      hasAiKey: false,
      hasBunproToken: false
    };
    if (user.encryptedApiKeys) {
      try {
        const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
        apiKeysInfo = {
          aiProvider: keys.aiProvider || '',
          openaiModel: keys.openaiModel || '',
          openrouterModel: keys.openrouterModel || '',
          jlptLevel: keys.jlptLevel || 'N4',
          hasAiKey: !!keys.aiApiKey,
          hasBunproToken: !!keys.bunproToken
        };
      } catch {
        // Keep defaults on decryption failure
      }
    }

    res.json({ id: user.id, username: user.username, apiKeys: apiKeysInfo });
  }

  // PUT /api/auth/api-keys
  function updateKeys(req, res) {
    const { aiApiKey, aiProvider, openaiModel, openrouterModel, jlptLevel, bunproToken } = req.body;
    const keys = {};
    if (aiApiKey !== undefined) keys.aiApiKey = aiApiKey;
    if (aiProvider !== undefined) keys.aiProvider = aiProvider;
    if (openaiModel !== undefined) keys.openaiModel = openaiModel;
    if (openrouterModel !== undefined) keys.openrouterModel = openrouterModel;
    if (jlptLevel !== undefined) keys.jlptLevel = jlptLevel;
    if (bunproToken !== undefined) keys.bunproToken = bunproToken;

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

  // GET /api/auth/admin/users - list all users (admin only)
  const adminUser = process.env.ADMIN_USER || '';
  const adminPassHash = process.env.ADMIN_PASS_HASH || '';

  async function adminUsers(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      return res.status(401).json({ error: 'Admin credentials required' });
    }

    if (!adminUser || !adminPassHash) {
      return res.status(503).json({ error: 'Admin credentials not configured' });
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');

    if (user !== adminUser || !(await verifyPassword(pass, adminPassHash))) {
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const data = loadUsers(usersFile);
    const users = data.users.map(u => ({
      id: u.id,
      username: u.username,
      createdAt: u.createdAt,
      hasApiKeys: !!u.encryptedApiKeys
    }));
    res.json({ count: users.length, users });
  }

  // Mount routes
  router.post('/register', upload.single('wordList'), register);
  router.post('/login', login);
  router.get('/me', requireAuth, me);
  router.put('/api-keys', requireAuth, updateKeys);
  router.post('/generate-invite', generateInvite);
  router.get('/admin/users', adminUsers);

  // Expose handlers for testing
  router._testHandlers = { register, login, me, updateKeys, generateInvite };

  return router;
}
