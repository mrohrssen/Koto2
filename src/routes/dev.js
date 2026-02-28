/**
 * @fileoverview Dev tools routes - sprite review dashboard backend
 *
 * Provides authentication, sprite manifest, and feedback APIs for the
 * dev sprite review dashboard. Protected by DEV_DASHBOARD_PASSWORD env var
 * in production; open access in development when no password is set.
 *
 * API ENDPOINTS:
 *   POST /dev/auth       - Authenticate with password, receive session cookie
 *   GET  /dev/manifest   - Sprite manifest (all entities + sprite file status)
 *   GET  /dev/feedback   - Load saved feedback data
 *   POST /dev/feedback   - Save feedback data
 *
 * DEPENDENCIES:
 *   - express-rate-limit  - Rate limiting for auth endpoint
 *   - data/creatures.json - Creature definitions
 *   - data/moves.json     - Move definitions (action icons)
 *   - data/items.json     - Item definitions
 *   - data/enemies.json   - Enemy definitions
 *   - data/bosses.json    - Boss definitions
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';

// ── Paths ──────────────────────────────────────────────────────────
const DATA_DIR = join(process.cwd(), 'data');
const SPRITE_DIR = join(process.cwd(), 'public', 'assets', 'sprites');
const FEEDBACK_PATH = join(process.cwd(), 'tools', 'sprite-feedback.json');

// ── Data loaders ───────────────────────────────────────────────────

function loadJSON(filename) {
  const filePath = join(DATA_DIR, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function spriteExists(category, filename) {
  return existsSync(join(SPRITE_DIR, category, filename));
}

// ── Feedback persistence ───────────────────────────────────────────

function loadFeedback() {
  if (!existsSync(FEEDBACK_PATH)) return {};
  try {
    return JSON.parse(readFileSync(FEEDBACK_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveFeedback(data) {
  const dir = join(process.cwd(), 'tools');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FEEDBACK_PATH, JSON.stringify(data, null, 2));
}

// ── Manifest builder ───────────────────────────────────────────────

function buildManifest() {
  const manifest = { creatures: [], moves: [], items: [], enemies: [], bosses: [] };

  // Creatures
  const creatures = loadJSON('creatures.json') || [];
  for (const c of creatures) {
    manifest.creatures.push({
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      element: c.element,
      rarity: c.rarity,
      description: c.description,
      spriteFile: `${c.id}.webp`,
      idleFile: `${c.id}-idle.webp`,
      hasSprite: spriteExists('creatures', `${c.id}.webp`),
      hasIdle: spriteExists('creatures', `${c.id}-idle.webp`)
    });
  }

  // Moves (action icons)
  const moves = loadJSON('moves.json') || [];
  for (const m of moves) {
    // Action icon filenames use nameEn lowercased
    const iconName = m.nameEn ? m.nameEn.toLowerCase().replace(/\s+/g, '-') : m.id;
    manifest.moves.push({
      id: m.id,
      name: m.name,
      nameEn: m.nameEn,
      element: m.element,
      category: m.category,
      tier: m.tier,
      spriteFile: `${iconName}.webp`,
      hasSprite: spriteExists('actions', `${iconName}.webp`)
    });
  }

  // Items
  const items = loadJSON('items.json') || [];
  for (const i of items) {
    // Item icon filenames use the item id
    const iconName = i.id;
    manifest.items.push({
      id: i.id,
      name: i.word || i.id,
      nameEn: i.meaning || i.id,
      rarity: i.rarity,
      type: i.type,
      spriteFile: `${iconName}.webp`,
      hasSprite: spriteExists('items', `${iconName}.webp`)
    });
  }

  // Enemies (object keyed by id)
  const enemies = loadJSON('enemies.json') || {};
  for (const [enemyId, e] of Object.entries(enemies)) {
    manifest.enemies.push({
      id: enemyId,
      name: e.name,
      nameEn: e.nameEn,
      spriteFile: `${enemyId}.webp`,
      hasSprite: spriteExists('enemies', `${enemyId}.webp`)
    });
  }

  // Bosses
  const bosses = loadJSON('bosses.json') || {};
  // Floor bosses (keyed by floor number)
  if (bosses.floorBosses) {
    for (const [floor, b] of Object.entries(bosses.floorBosses)) {
      manifest.bosses.push({
        id: b.id,
        name: b.name,
        nameEn: b.nameEn,
        floor: Number(floor),
        type: 'floor',
        spriteFile: `${b.id}.webp`,
        hasSprite: spriteExists('enemies', `${b.id}.webp`)
      });
    }
  }
  // Final boss
  if (bosses.finalBoss) {
    const fb = bosses.finalBoss;
    manifest.bosses.push({
      id: fb.id,
      name: fb.name,
      nameEn: fb.nameEn,
      floor: null,
      type: 'final',
      spriteFile: `${fb.id}.webp`,
      hasSprite: spriteExists('enemies', `${fb.id}.webp`)
    });
  }

  // Summary counts
  manifest.summary = {
    creatures: { total: manifest.creatures.length, withSprite: manifest.creatures.filter(c => c.hasSprite).length, withIdle: manifest.creatures.filter(c => c.hasIdle).length },
    moves: { total: manifest.moves.length, withSprite: manifest.moves.filter(m => m.hasSprite).length },
    items: { total: manifest.items.length, withSprite: manifest.items.filter(i => i.hasSprite).length },
    enemies: { total: manifest.enemies.length, withSprite: manifest.enemies.filter(e => e.hasSprite).length },
    bosses: { total: manifest.bosses.length, withSprite: manifest.bosses.filter(b => b.hasSprite).length }
  };

  return manifest;
}

// ── Session store ──────────────────────────────────────────────────

const sessions = new Map();

function createSession() {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  // Sessions expire after 24 hours
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > ONE_DAY) {
    sessions.delete(token);
    return false;
  }
  return true;
}

// ── Router factory ─────────────────────────────────────────────────

/**
 * Create dev tools router
 * @param {object} opts
 * @param {string} opts.password - Required password (empty string = no auth needed)
 * @returns {Router}
 */
export function createDevRouter({ password }) {
  const router = Router();
  const requiresAuth = password.length > 0;

  // Rate limit auth attempts
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 attempts per window
    message: { error: 'Too many login attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  // ── Auth middleware ────────────────────────────────────────────
  function requireAuth(req, res, next) {
    if (!requiresAuth) return next();

    const token = req.cookies?.dev_token || req.headers['x-dev-token'];
    if (isValidSession(token)) return next();

    return res.status(401).json({ error: 'Unauthorized' });
  }

  // We need cookie-parser for this router. Use a lightweight inline parser
  // since the main app may not have cookie-parser installed.
  function parseCookies(req, _res, next) {
    if (req.cookies) return next();
    req.cookies = {};
    const header = req.headers.cookie;
    if (header) {
      for (const pair of header.split(';')) {
        const [name, ...rest] = pair.trim().split('=');
        if (name) req.cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
      }
    }
    next();
  }

  router.use(parseCookies);

  // ── POST /auth ────────────────────────────────────────────────
  router.post('/auth', authLimiter, (req, res) => {
    if (!requiresAuth) {
      const token = createSession();
      res.cookie('dev_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
      return res.json({ ok: true });
    }

    const { password: submittedPassword } = req.body || {};
    if (submittedPassword === password) {
      const token = createSession();
      res.cookie('dev_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
      return res.json({ ok: true });
    }

    return res.status(403).json({ error: 'Wrong password' });
  });

  // ── GET /manifest ─────────────────────────────────────────────
  router.get('/manifest', requireAuth, (_req, res) => {
    try {
      const manifest = buildManifest();
      res.json(manifest);
    } catch (err) {
      console.error('[Dev] Manifest build error:', err.message);
      res.status(500).json({ error: 'Failed to build manifest' });
    }
  });

  // ── GET /feedback ─────────────────────────────────────────────
  router.get('/feedback', requireAuth, (_req, res) => {
    res.json(loadFeedback());
  });

  // ── POST /feedback ────────────────────────────────────────────
  router.post('/feedback', requireAuth, (req, res) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid feedback data' });
      }
      saveFeedback(data);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Dev] Feedback save error:', err.message);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  return router;
}
