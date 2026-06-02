import express, { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';

// ── Paths ──────────────────────────────────────────────────────────
const DATA_DIR = join(process.cwd(), 'data');
const SPRITE_DIR = join(process.cwd(), 'public', 'assets', 'sprites');
const BG_DIR = join(process.cwd(), 'public', 'assets', 'backgrounds');
const FEEDBACK_PATH = join(process.cwd(), 'tools', 'sprite-feedback.json');
const REVIEW_QUEUE_PATH = join(process.cwd(), 'data', 'sprite-review-queue.json');
const STAGING_DIR = join(process.cwd(), 'data', 'sprite-staging');

// ── Data loaders ───────────────────────────────────────────────────

function loadJSON(filename) {
  const filePath = join(DATA_DIR, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function spriteExists(category, filename) {
  return existsSync(join(SPRITE_DIR, category, filename));
}

function listWebp(category) {
  const dir = join(SPRITE_DIR, category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''));
}

function listBgWebp(subdir) {
  const dir = subdir ? join(BG_DIR, subdir) : BG_DIR;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.webp'));
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

// ── Review queue persistence ──────────────────────────────────────

function loadReviewQueue() {
  if (!existsSync(REVIEW_QUEUE_PATH)) return { pending: [] };
  try {
    return JSON.parse(readFileSync(REVIEW_QUEUE_PATH, 'utf-8'));
  } catch {
    return { pending: [] };
  }
}

function saveReviewQueue(data) {
  writeFileSync(REVIEW_QUEUE_PATH, JSON.stringify(data, null, 2));
}

/** Map sprite type to its directory name under sprites/ or staging/ */
function typeDirFor(type) {
  const map = {
    action: 'actions',
    creature: 'creatures',
    item: 'items',
    boss: 'bosses',
    npc: 'npcs',
    background: 'backgrounds'
  };
  return map[type] || type;
}

// ── Manifest builder ───────────────────────────────────────────────

function buildManifest() {
  const manifest = { creatures: [], moves: [], items: [], enemies: [], bosses: [], npcs: [], backgrounds: [], player: [], starterVariants: [] };

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

  // Orphan sprites (files on disk with no data entry)
  const creatureDataIds = new Set(creatures.map(c => c.id));
  for (const file of listWebp('creatures')) {
    if (file.endsWith('-idle')) continue;
    if (!creatureDataIds.has(file)) {
      manifest.creatures.push({
        id: file, name: null, nameEn: file,
        spriteFile: `${file}.webp`, idleFile: `${file}-idle.webp`,
        hasSprite: true, hasIdle: listWebp('creatures').includes(`${file}-idle`),
        hasData: false
      });
    }
  }
  // Tag creatures with data
  for (const c of manifest.creatures) {
    if (c.hasData === undefined) c.hasData = creatureDataIds.has(c.id);
  }

  const moveSlugSet = new Set(moves.map(m => m.nameEn ? m.nameEn.toLowerCase().replace(/\s+/g, '-') : m.id));
  for (const file of listWebp('actions')) {
    if (!moveSlugSet.has(file)) {
      manifest.moves.push({
        id: file, slug: file, name: null, nameEn: file,
        spriteFile: `${file}.webp`, hasSprite: true, hasData: false
      });
    }
  }
  for (const m of manifest.moves) {
    if (m.hasData === undefined) m.hasData = true;
  }

  const itemDataIds = new Set(items.map(i => i.id));
  for (const file of listWebp('items')) {
    if (!itemDataIds.has(file)) {
      manifest.items.push({
        id: file, name: null, nameEn: file,
        spriteFile: `${file}.webp`, hasSprite: true, hasData: false
      });
    }
  }
  for (const i of manifest.items) {
    if (i.hasData === undefined) i.hasData = true;
  }

  const enemyDataIds = new Set(Object.keys(enemies));
  const bossIds = new Set(manifest.bosses.map(b => b.id));
  for (const file of listWebp('enemies')) {
    if (!enemyDataIds.has(file) && !bossIds.has(file)) {
      manifest.enemies.push({
        id: file, name: null, nameEn: file,
        spriteFile: `${file}.webp`, hasSprite: true, hasData: false
      });
    }
  }
  for (const e of manifest.enemies) {
    if (e.hasData === undefined) e.hasData = true;
  }

  // NPCs
  const npcs = loadJSON('npcs.json') || {};
  for (const [npcId, n] of Object.entries(npcs)) {
    manifest.npcs.push({
      id: npcId,
      name: n.name,
      nameEn: n.nameEn,
      area: n.area,
      tier: n.tier,
      spriteFile: `${npcId}.webp`,
      hasSprite: spriteExists('npcs', `${npcId}.webp`),
      hasData: true
    });
  }
  // Orphan NPC sprites
  const npcDataIds = new Set(Object.keys(npcs));
  for (const file of listWebp('npcs')) {
    if (!npcDataIds.has(file)) {
      manifest.npcs.push({
        id: file, name: null, nameEn: file,
        spriteFile: `${file}.webp`, hasSprite: true, hasData: false
      });
    }
  }

  // Backgrounds - grouped by area + standalone root backgrounds
  const areaDirs = existsSync(join(BG_DIR, 'areas'))
    ? readdirSync(join(BG_DIR, 'areas'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    : [];
  for (const area of areaDirs) {
    const files = listBgWebp(join('areas', area));
    manifest.backgrounds.push({
      id: `area/${area}`,
      name: null,
      nameEn: area,
      type: 'area',
      files: files,
      fileCount: files.length,
      spriteFile: files[0] || null,
      spritePath: `/assets/backgrounds/areas/${area}/`,
      hasSprite: files.length > 0,
      hasData: true
    });
  }
  // Standalone root backgrounds (group by base name, e.g. floor1, floor1_1..5)
  const rootBgFiles = listBgWebp(null);
  const bgGroups = new Map();
  for (const file of rootBgFiles) {
    // Group: floor1.webp + floor1_1..5.webp -> "floor1"
    const base = file.replace('.webp', '');
    const match = base.match(/^(.+?)(?:_\d+)?$/);
    const groupKey = match ? match[1] : base;
    if (!bgGroups.has(groupKey)) bgGroups.set(groupKey, []);
    bgGroups.get(groupKey).push(file);
  }
  for (const [groupKey, files] of bgGroups) {
    manifest.backgrounds.push({
      id: `bg/${groupKey}`,
      name: null,
      nameEn: groupKey,
      type: 'standalone',
      files: files.sort(),
      fileCount: files.length,
      spriteFile: files.sort()[0],
      spritePath: '/assets/backgrounds/',
      hasSprite: true,
      hasData: true
    });
  }

  // Player sprites
  const playerFiles = listWebp('player');
  for (const file of playerFiles) {
    manifest.player.push({
      id: file,
      name: null,
      nameEn: file,
      spriteFile: `${file}.webp`,
      hasSprite: true,
      hasData: true
    });
  }

  // Starter variants
  const starterFiles = listWebp('starter-variants');
  for (const file of starterFiles) {
    // Extract creature base name (e.g. "timbark" from "timbark-a2")
    const baseName = file.replace(/-[a-z]\d*$/, '');
    manifest.starterVariants.push({
      id: file,
      name: null,
      nameEn: file,
      baseName: baseName,
      spriteFile: `${file}.webp`,
      hasSprite: true,
      hasData: true
    });
  }

  // Summary counts
  manifest.summary = {
    creatures: { total: manifest.creatures.length, withSprite: manifest.creatures.filter(c => c.hasSprite).length, withIdle: manifest.creatures.filter(c => c.hasIdle).length },
    moves: { total: manifest.moves.length, withSprite: manifest.moves.filter(m => m.hasSprite).length },
    items: { total: manifest.items.length, withSprite: manifest.items.filter(i => i.hasSprite).length },
    enemies: { total: manifest.enemies.length, withSprite: manifest.enemies.filter(e => e.hasSprite).length },
    bosses: { total: manifest.bosses.length, withSprite: manifest.bosses.filter(b => b.hasSprite).length },
    npcs: { total: manifest.npcs.length, withSprite: manifest.npcs.filter(n => n.hasSprite).length },
    backgrounds: { total: manifest.backgrounds.length, withSprite: manifest.backgrounds.filter(b => b.hasSprite).length },
    player: { total: manifest.player.length, withSprite: manifest.player.filter(p => p.hasSprite).length },
    starterVariants: { total: manifest.starterVariants.length, withSprite: manifest.starterVariants.filter(s => s.hasSprite).length }
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
 * @param {string} [opts.dataDir] - Override data directory (for tests)
 * @returns {Router}
 */
export function createDevRouter(opts) {
  const { password } = opts;
  const router = Router();
  const requiresAuth = password.length > 0;
  const contentDataDir = opts.dataDir || DATA_DIR;

  // ── Content file mapping ──────────────────────────────────────────
  const CONTENT_FILES = {
    creatures: 'creatures.json',
    moves: 'moves.json',
    items: 'items.json',
    npcs: 'npcs.json',
    'npc-skills': 'npc-skills.json',
    areas: 'areas.json'
  };

  function loadContentFile(type) {
    const filename = CONTENT_FILES[type];
    if (!filename) return null;
    const filePath = join(contentDataDir, filename);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

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
    // Login routes are always accessible
    if (req.path === '/login') return next();

    const token = req.cookies?.dev_token || req.headers['x-dev-token'];
    if (isValidSession(token)) return next();

    // For API endpoints, return 401 JSON; for pages, redirect to login
    if (req.path.startsWith('/api/') || req.path === '/auth') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/dev/login');
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
  router.use(express.urlencoded({ extended: false }));

  // ── GET /login ──────────────────────────────────────────────
  router.get('/login', (req, res) => {
    const err = req.query.err ? '<p class="error">Wrong password</p>' : '';
    res.send(`<!DOCTYPE html><html><head><title>Dev Login</title>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e}
      form{background:#16213e;padding:2rem;border-radius:8px;color:#e0e0e0}
      input{padding:0.5rem;margin:0.5rem 0;border:1px solid #444;border-radius:4px;background:#0f0f23;color:#e0e0e0;width:200px;display:block}
      button{padding:0.5rem 1rem;background:#0f3460;color:white;border:none;border-radius:4px;cursor:pointer;margin-top:0.5rem}
      .error{color:#e74c3c;font-size:0.9em}</style></head>
      <body><form method="POST" action="/dev/login">
      <h3>Sprite Dashboard</h3>
      <input type="password" name="password" placeholder="Password" autofocus>
      <button type="submit">Login</button>
      ${err}</form></body></html>`);
  });

  // ── POST /login ─────────────────────────────────────────────
  router.post('/login', authLimiter, (req, res) => {
    const submitted = req.body?.password;
    if (!requiresAuth || submitted === password) {
      const token = createSession();
      res.cookie('dev_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.redirect('/dev/');
    }
    return res.redirect('/dev/login?err=1');
  });

  // ── GET / (hub) ──────────────────────────────────────────────
  router.get('/', requireAuth, (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-hub.html'));
  });

  // ── GET /sprites ────────────────────────────────────────────
  router.get('/sprites', requireAuth, (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-sprites.html'));
  });

  // ── GET /content ──────────────────────────────────────────
  router.get('/content', requireAuth, (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-content.html'));
  });

  // ── POST /auth (API) ───────────────────────────────────────
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

  // ── GET /api/manifest ──────────────────────────────────────────
  router.get('/api/manifest', requireAuth, (_req, res) => {
    try {
      const manifest = buildManifest();
      res.json(manifest);
    } catch (err) {
      console.error('[Dev] Manifest build error:', err.message);
      res.status(500).json({ error: 'Failed to build manifest' });
    }
  });

  // ── GET /api/feedback ──────────────────────────────────────────
  router.get('/api/feedback', requireAuth, (_req, res) => {
    res.json(loadFeedback());
  });

  // ── POST /api/feedback ───────────────────────────────────────
  router.post('/api/feedback', requireAuth, (req, res) => {
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

  // ── GET /api/qa-failures ────────────────────────────────────────
  const QA_FAILURES_PATH = join(DATA_DIR, 'sprite-qa-failures.json');
  router.get('/api/qa-failures', requireAuth, (_req, res) => {
    try {
      if (!existsSync(QA_FAILURES_PATH)) return res.json([]);
      const data = JSON.parse(readFileSync(QA_FAILURES_PATH, 'utf-8'));
      res.json(data);
    } catch (err) {
      console.error('[Dev] QA failures load error:', err.message);
      res.json([]);
    }
  });

  // ── GET /api/review-queue ──────────────────────────────────────
  router.get('/api/review-queue', requireAuth, (_req, res) => {
    try {
      const data = loadReviewQueue();
      res.json(data);
    } catch (err) {
      console.error('[Dev] Review queue load error:', err.message);
      res.json({ pending: [] });
    }
  });

  // ── POST /api/review-queue/pick ──────────────────────────────────
  router.post('/api/review-queue/pick', requireAuth, async (req, res) => {
    try {
      const { id, type, file } = req.body || {};
      if (!id || !type || !file) {
        return res.status(400).json({ error: 'Missing id, type, or file' });
      }

      const queue = loadReviewQueue();
      const idx = queue.pending.findIndex(e => e.id === id && e.type === type);
      if (idx === -1) {
        return res.status(404).json({ error: 'Entry not found in queue' });
      }

      const typeDir = typeDirFor(type);
      const srcPath = join(STAGING_DIR, typeDir, file);
      if (!existsSync(srcPath)) {
        return res.status(404).json({ error: `Candidate file not found: ${file}` });
      }

      // Convert PNG to WebP and write to production sprites dir
      const sharp = (await import('sharp')).default;
      const pngBuffer = readFileSync(srcPath);
      const webpBuffer = await sharp(pngBuffer).webp({ quality: 80 }).toBuffer();

      const destDir = join(SPRITE_DIR, typeDir);
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      const destPath = join(destDir, `${id}.webp`);
      writeFileSync(destPath, webpBuffer);

      // Remove entry from queue and save
      queue.pending.splice(idx, 1);
      saveReviewQueue(queue);

      res.json({ ok: true, dest: `/assets/sprites/${typeDir}/${id}.webp` });
    } catch (err) {
      console.error('[Dev] Review queue pick error:', err.message);
      res.status(500).json({ error: 'Failed to pick candidate' });
    }
  });

  // ── POST /api/review-queue/reject ────────────────────────────────
  router.post('/api/review-queue/reject', requireAuth, (req, res) => {
    try {
      const { id, type, note } = req.body || {};
      if (!id || !type) {
        return res.status(400).json({ error: 'Missing id or type' });
      }

      const queue = loadReviewQueue();
      const idx = queue.pending.findIndex(e => e.id === id && e.type === type);
      if (idx === -1) {
        return res.status(404).json({ error: 'Entry not found in queue' });
      }

      const entry = queue.pending[idx];
      entry.rejectedByUser = true;
      entry.regenNote = note || '';
      entry.attempt = (entry.attempt || 1) + 1;

      // Move all candidates to rejected with gate: 'human'
      if (!entry.rejected) entry.rejected = [];
      if (entry.candidates && entry.candidates.length > 0) {
        for (const c of entry.candidates) {
          entry.rejected.push({ ...c, gate: 'human' });
        }
        entry.candidates = [];
      }

      saveReviewQueue(queue);
      res.json({ ok: true, attempt: entry.attempt });
    } catch (err) {
      console.error('[Dev] Review queue reject error:', err.message);
      res.status(500).json({ error: 'Failed to reject entry' });
    }
  });

  // ── Serve staging files for review UI ──────────────────────────────
  router.use('/staging', requireAuth, express.static(join(process.cwd(), 'data', 'sprite-staging')));

  // ── POST /api/review-queue/batch-accept ──────────────────────────
  router.post('/api/review-queue/batch-accept', requireAuth, async (req, res) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Missing or empty ids array' });
      }

      const sharp = (await import('sharp')).default;
      const queue = loadReviewQueue();
      const results = [];

      for (const { id, type } of ids) {
        const idx = queue.pending.findIndex(e => e.id === id && e.type === type);
        if (idx === -1) {
          results.push({ id, type, ok: false, error: 'Not found' });
          continue;
        }

        const entry = queue.pending[idx];
        // Pick the first candidate (highest score, already sorted)
        const topCandidate = entry.candidates?.[0];
        if (!topCandidate) {
          results.push({ id, type, ok: false, error: 'No candidates' });
          continue;
        }

        const typeDir = typeDirFor(type);
        const srcPath = join(STAGING_DIR, typeDir, topCandidate.file);
        if (!existsSync(srcPath)) {
          results.push({ id, type, ok: false, error: 'File not found' });
          continue;
        }

        // Convert and copy to production
        const pngBuffer = readFileSync(srcPath);
        const webpBuffer = await sharp(pngBuffer).webp({ quality: 80 }).toBuffer();

        const destDir = join(SPRITE_DIR, typeDir);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(join(destDir, `${id}.webp`), webpBuffer);

        // Remove from queue
        queue.pending.splice(idx, 1);
        results.push({ id, type, ok: true });
      }

      saveReviewQueue(queue);
      res.json({ results, remaining: queue.pending.length });
    } catch (err) {
      console.error('[Dev] Review queue batch-accept error:', err.message);
      res.status(500).json({ error: 'Failed to batch accept' });
    }
  });

  // ── GET /api/content/:type ──────────────────────────────────────────
  router.get('/api/content/:type', requireAuth, (req, res) => {
    const { type } = req.params;
    if (!CONTENT_FILES[type]) {
      return res.status(400).json({ error: `Unknown content type: ${type}` });
    }

    try {
      const data = loadContentFile(type);
      if (data === null) return res.json([]);

      // npcs.json is an object keyed by NPC ID — normalize to array
      if (type === 'npcs' && !Array.isArray(data)) {
        return res.json(Object.values(data));
      }

      return res.json(data);
    } catch (err) {
      console.error(`[Dev] Content load error (${type}):`, err.message);
      return res.status(500).json({ error: 'Failed to load content' });
    }
  });

  // ── PATCH /api/content/:type ────────────────────────────────────────
  router.patch('/api/content/:type', requireAuth, (req, res) => {
    const { type } = req.params;
    if (!CONTENT_FILES[type]) {
      return res.status(400).json({ error: `Unknown content type: ${type}` });
    }

    const { changes } = req.body || {};
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'Missing or empty changes array' });
    }

    try {
      const data = loadContentFile(type);
      if (data === null) {
        return res.status(404).json({ error: `Content file not found for type: ${type}` });
      }

      const isObject = type === 'npcs' && !Array.isArray(data);
      let updated = 0;
      const errors = [];

      const BLOCKED_FIELDS = new Set(['id', '__proto__', 'constructor', 'prototype']);

      for (const { id, field, value } of changes) {
        if (BLOCKED_FIELDS.has(field)) {
          errors.push(`Cannot modify '${field}' field on ${id}`);
          continue;
        }

        let entry;
        if (isObject) {
          entry = data[id];
        } else {
          entry = data.find(e => e.id === id);
        }

        if (!entry) {
          errors.push(`Entry not found: ${id}`);
          continue;
        }

        entry[field] = value;
        updated++;
      }

      // Only write if something actually changed
      if (updated > 0) {
        const filePath = join(contentDataDir, CONTENT_FILES[type]);
        writeFileSync(filePath, JSON.stringify(data, null, 2));
      }

      return res.json({ ok: true, updated, errors });
    } catch (err) {
      console.error(`[Dev] Content patch error (${type}):`, err.message);
      return res.status(500).json({ error: 'Failed to patch content' });
    }
  });

  return router;
}
