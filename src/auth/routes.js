import { Router } from 'express';
import multer from 'multer';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { signToken, requireAuth } from './middleware.js';
import { verifyPassword, decryptKeys, encryptKeys } from './crypto.js';
import {
  createUser, findUserByUsername, findUserById,
  useInviteCode, createInviteCode, loadUsers, saveUsers, updateUserKeys
} from './users.js';
import { dataPath, getDataDir } from '../data-dir.js';
import { parseWordList } from '../game/bootstrap/word-list-parser.js';
import { clearSrsCache, createCard, gradeCard } from '../game/internal-srs.js';
import { getAnalyticsId } from './analytics-id.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

const DEFAULT_USERS_FILE = dataPath('.jrpg-users.json');

// Permanent invite code - unlimited uses, works locally and on Railway
const PERMANENT_INVITE_CODE = 'neo-tokyo-friends';

// Rate limiting: 5 login attempts per minute per IP
const loginAttempts = new Map();

function publicUser(user) {
  const analyticsId = getAnalyticsId(user?.id);
  return {
    id: user.id,
    username: user.username,
    ...(analyticsId ? { analyticsId } : {})
  };
}

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

function deleteAssociatedData(userId) {
  const dataDir = getDataDir();
  const deletedFiles = [];
  const deletedBugReports = [];

  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (entry.name.includes(userId)) {
      rmSync(join(dataDir, entry.name), { recursive: true, force: true });
      deletedFiles.push(entry.name);
    }
  }

  const bugReportsDir = dataPath('bug-reports');
  if (existsSync(bugReportsDir)) {
    for (const entry of readdirSync(bugReportsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const reportPath = join(bugReportsDir, entry.name, 'report.json');
      if (!existsSync(reportPath)) continue;
      try {
        const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
        if (report.userId === userId) {
          rmSync(join(bugReportsDir, entry.name), { recursive: true, force: true });
          deletedBugReports.push(entry.name);
        }
      } catch {
        // Leave malformed reports in place; they cannot be matched to this account.
      }
    }
  }

  clearSrsCache(userId);
  return {
    deletedFiles: deletedFiles.sort(),
    deletedBugReports: deletedBugReports.sort()
  };
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
    const aiDataSharingConsent = req.body.aiDataSharingConsent === true || req.body.aiDataSharingConsent === 'true';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (!aiDataSharingConsent) {
      return res.status(400).json({ error: 'AI data sharing consent required' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Invite codes are temporarily optional for App Store review access.
    if (inviteCode && inviteCode !== PERMANENT_INVITE_CODE) {
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
      if (inviteCode && inviteCode !== PERMANENT_INVITE_CODE) {
        useInviteCode(inviteCode, user.id, usersFile);
      }
      updateUserKeys(user.id, {
        aiDataSharingConsent: true,
        aiConversationsEnabled: true
      }, encryptionKey, usersFile);

      // Seed FSRS vocab deck from uploaded word list
      if (req.file) {
        const words = parseWordList(req.file.buffer.toString('utf-8'));
        for (const word of words) {
          createCard(user.id, 'vocab', word, { word });
          gradeCard(user.id, 'vocab', word, 'good');
        }
      }

      const token = signToken(user);
      res.json({ token, user: publicUser(user) });
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
    res.json({ token, user: publicUser(user) });
  }

  // GET /api/auth/me
  function me(req, res) {
    const user = findUserById(req.user.id, usersFile);
    if (!user) {
      // Mock profile only for explicit test/auth-bypass modes.
      if (process.env.NODE_ENV === 'test' || process.env.SKIP_AUTH === 'true') {
        return res.json({ id: req.user.id, username: req.user.username, apiKeys: {} });
      }
      return res.status(401).json({ error: 'User not found' });
    }

    let apiKeysInfo = {
      jlptLevel: 'N4',
      aiDataSharingConsent: false,
      aiConversationsEnabled: false
    };
    if (user.encryptedApiKeys) {
      try {
        const keys = decryptKeys(user.encryptedApiKeys, encryptionKey);
        apiKeysInfo = {
          jlptLevel: keys.jlptLevel || 'N4',
          aiDataSharingConsent: keys.aiDataSharingConsent === true,
          aiConversationsEnabled: keys.aiConversationsEnabled !== false
        };
      } catch {
        // Keep defaults on decryption failure
      }
    }

    res.json({ ...publicUser(user), apiKeys: apiKeysInfo });
  }

  // PUT /api/auth/api-keys
  function updateKeys(req, res) {
    const { jlptLevel, aiDataSharingConsent, aiConversationsEnabled } = req.body;
    const keys = {};
    if (jlptLevel !== undefined) keys.jlptLevel = jlptLevel;
    if (aiDataSharingConsent !== undefined) keys.aiDataSharingConsent = aiDataSharingConsent === true;
    if (aiConversationsEnabled !== undefined) keys.aiConversationsEnabled = aiConversationsEnabled === true;

    // Merge with existing keys (partial update)
    const user = findUserById(req.user.id, usersFile);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    let existingKeys = {};
    if (user?.encryptedApiKeys) {
      try { existingKeys = decryptKeys(user.encryptedApiKeys, encryptionKey); } catch {}
    }
    const merged = { ...existingKeys, ...keys };
    delete merged.aiApiKey;
    delete merged.aiProvider;
    delete merged.openaiModel;
    delete merged.openrouterModel;
    delete merged.bunproToken;

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

  async function deleteMe(req, res) {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const data = loadUsers(usersFile);
    const userIndex = data.users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = data.users[userIndex];
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const { deletedFiles, deletedBugReports } = deleteAssociatedData(user.id);
    data.users.splice(userIndex, 1);
    saveUsers(data, usersFile);

    res.json({
      success: true,
      deletedUserId: user.id,
      deletedFiles,
      deletedBugReports
    });
  }

  // Mount routes
  router.post('/register', upload.single('wordList'), register);
  router.post('/login', login);
  router.get('/me', requireAuth, me);
  router.delete('/me', requireAuth, deleteMe);
  router.put('/api-keys', requireAuth, updateKeys);
  router.post('/generate-invite', generateInvite);
  router.get('/admin/users', adminUsers);

  // Expose handlers for testing
  router._testHandlers = { register, login, me, deleteMe, updateKeys, generateInvite };

  return router;
}
