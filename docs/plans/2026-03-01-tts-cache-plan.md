# TTS Pre-Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pre-generate VOICEVOX audio for all static game words (~250) and serve them from disk for instant TTS.

**Architecture:** New `src/services/tts-cache.js` loads a manifest at startup mapping Japanese text → WAV filename. The `/api/tts/synthesize` route checks this cache first; hits return the file from `data/tts-cache/`, misses fall through to live VOICEVOX. A generation script produces the WAV files and manifest.

**Tech Stack:** Node.js, Express, VOICEVOX API, `node:fs`, `node:crypto`

---

### Task 1: Create TTS cache service

**Files:**
- Create: `src/services/tts-cache.js`
- Test: `tests/unit/tts-cache.test.js`

**Step 1: Write the failing test**

```js
// tests/unit/tts-cache.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TtsCache } from '../../src/services/tts-cache.js';

const TEST_DIR = join(import.meta.dirname, '../../tmp/test-tts-cache');

describe('TtsCache', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns null when manifest does not exist', () => {
    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 11, 0.9), null);
  });

  it('returns cached WAV buffer on exact match', () => {
    const fakeWav = Buffer.from('RIFF fake wav data');
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), fakeWav);

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    const result = cache.lookup('走る', 11, 0.9);
    assert.deepEqual(result, fakeWav);
  });

  it('returns null for wrong speakerId', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 39, 0.9), null);
  });

  it('returns null for wrong speedScale', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    assert.equal(cache.lookup('走る', 11, 1.0), null);
  });

  it('reports stats', () => {
    const manifest = {
      speakerId: 11,
      speedScale: 0.9,
      entries: { '走る': 'abc123.wav' }
    };
    writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(TEST_DIR, 'abc123.wav'), Buffer.from('wav'));

    const cache = new TtsCache(TEST_DIR);
    cache.load();
    const stats = cache.getStats();
    assert.equal(stats.loaded, true);
    assert.equal(stats.wordCount, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/tts-cache.test.js`
Expected: FAIL — cannot import `TtsCache`

**Step 3: Write the implementation**

```js
// src/services/tts-cache.js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class TtsCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.manifest = null;
  }

  load() {
    const manifestPath = join(this.cacheDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      console.log('[TTS Cache] No manifest found, cache disabled');
      return;
    }
    try {
      this.manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      console.log(`[TTS Cache] Loaded ${Object.keys(this.manifest.entries).length} cached words`);
    } catch (err) {
      console.error('[TTS Cache] Failed to load manifest:', err.message);
      this.manifest = null;
    }
  }

  lookup(text, speakerId, speedScale) {
    if (!this.manifest) return null;
    if (speakerId !== this.manifest.speakerId) return null;
    if (speedScale !== this.manifest.speedScale) return null;

    const filename = this.manifest.entries[text];
    if (!filename) return null;

    const filePath = join(this.cacheDir, filename);
    try {
      return readFileSync(filePath);
    } catch {
      return null;
    }
  }

  getStats() {
    return {
      loaded: this.manifest !== null,
      wordCount: this.manifest ? Object.keys(this.manifest.entries).length : 0
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/tts-cache.test.js`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/services/tts-cache.js tests/unit/tts-cache.test.js
git commit -m "feat: add TTS disk cache service with lookup"
```

---

### Task 2: Wire cache into TTS route

**Files:**
- Modify: `src/routes/tts.js`
- Modify: `src/routes/index.js`

**Step 1: Modify the TTS route to accept and use a cache**

In `src/routes/tts.js`, change the factory to accept `ttsCache` and check it before calling VOICEVOX:

```js
// src/routes/tts.js — full replacement
import { Router } from 'express';
import {
  isVoicevoxRunning,
  getSpeakers,
  synthesize,
  getVersion as getVoicevoxVersion
} from '../voicevox.js';

export default function createTTSRoutes({ getSettings, ttsCache }) {
  const router = Router();

  // TTS status
  router.get('/status', async (req, res) => {
    const running = await isVoicevoxRunning();
    let version = null;
    let speakers = [];

    if (running) {
      try {
        version = await getVoicevoxVersion();
        speakers = await getSpeakers();
      } catch (e) {}
    }

    const cacheStats = ttsCache ? ttsCache.getStats() : { loaded: false, wordCount: 0 };
    res.json({ running, version, speakers, cache: cacheStats });
  });

  // Get speakers
  router.get('/speakers', async (req, res) => {
    try {
      const speakers = await getSpeakers();
      res.json(speakers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Synthesize speech
  router.post('/synthesize', async (req, res) => {
    const { text, speakerId, speed, speedScale, volumeScale } = req.body;
    const settings = getSettings();

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const resolvedSpeakerId = speakerId || 13;
    const resolvedSpeed = speed ?? speedScale ?? settings.gameTtsSpeed ?? 0.9;

    // Check disk cache first
    if (ttsCache) {
      const cached = ttsCache.lookup(text, resolvedSpeakerId, resolvedSpeed);
      if (cached) {
        res.set('Content-Type', 'audio/wav');
        res.set('X-TTS-Cache', 'hit');
        return res.send(cached);
      }
    }

    try {
      const audioBuffer = await synthesize(text, resolvedSpeakerId, {
        speedScale: resolvedSpeed,
        volumeScale: volumeScale ?? settings.gameTtsVolume ?? 1.0
      });

      res.set('Content-Type', 'audio/wav');
      res.set('X-TTS-Cache', 'miss');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
```

**Step 2: Pass ttsCache through the route index**

In `src/routes/index.js`, pass the `ttsCache` dep through to TTS routes:

Change line 39-41 from:
```js
  router.use('/tts', createTTSRoutes({
    getSettings: deps.getSettings
  }));
```
To:
```js
  router.use('/tts', createTTSRoutes({
    getSettings: deps.getSettings,
    ttsCache: deps.ttsCache
  }));
```

**Step 3: Create and load the cache in `server.js`**

Add near the top imports (around line 125):
```js
import { TtsCache } from './src/services/tts-cache.js';
```

Add before the `app.use('/api', createRoutes(...))` block (around line 354):
```js
const ttsCache = new TtsCache(join(__dirname, 'data', 'tts-cache'));
ttsCache.load();
```

Pass `ttsCache` into `createRoutes`:
```js
app.use('/api', createRoutes({
  getSettings: () => settings,
  // ... existing deps ...
  ttsCache
}));
```

**Step 4: Run existing tests**

Run: `npm test`
Expected: All existing tests still pass (cache is null/absent = no behavior change)

**Step 5: Commit**

```bash
git add src/routes/tts.js src/routes/index.js server.js
git commit -m "feat: wire TTS disk cache into synthesize endpoint"
```

---

### Task 3: Create pre-generation script

**Files:**
- Create: `scripts/generate-tts-cache.mjs`

**Step 1: Write the generation script**

```js
#!/usr/bin/env node
// scripts/generate-tts-cache.mjs
//
// Pre-generates VOICEVOX audio for all static game words.
// Usage: node scripts/generate-tts-cache.mjs
//
// Requires VOICEVOX running at localhost:50021 (or VOICEVOX_URL env var)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', 'tts-cache');
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const SPEAKER_ID = 11;  // Kurono Takehiro ノーマル
const SPEED_SCALE = 0.9;

function loadWords() {
  const words = new Map(); // text → source label (for logging)

  // Moves
  const moves = JSON.parse(readFileSync(join(ROOT, 'data', 'moves.json'), 'utf-8'));
  for (const move of moves) {
    if (move.name) words.set(move.name, `move:${move.id}`);
  }

  // Creatures
  const creatures = JSON.parse(readFileSync(join(ROOT, 'data', 'creatures.json'), 'utf-8'));
  for (const c of creatures) {
    if (c.baseWord) words.set(c.baseWord, `creature-base:${c.id}`);
    if (c.modifier?.word) words.set(c.modifier.word, `creature-mod:${c.id}`);
  }

  // Items
  const items = JSON.parse(readFileSync(join(ROOT, 'data', 'items.json'), 'utf-8'));
  for (const item of items) {
    if (item.word) words.set(item.word, `item:${item.id}`);
    if (item.components) {
      for (const comp of item.components) {
        if (comp.word) words.set(comp.word, `item-comp:${item.id}`);
      }
    }
  }

  return words;
}

async function synthesize(text) {
  // Step 1: Audio query
  const queryRes = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER_ID}`,
    { method: 'POST' }
  );
  if (!queryRes.ok) throw new Error(`audio_query failed: ${await queryRes.text()}`);
  const audioQuery = await queryRes.json();
  audioQuery.speedScale = SPEED_SCALE;

  // Step 2: Synthesis
  const synthRes = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${SPEAKER_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery)
    }
  );
  if (!synthRes.ok) throw new Error(`synthesis failed: ${await synthRes.text()}`);
  return Buffer.from(await synthRes.arrayBuffer());
}

function hashText(text) {
  return createHash('md5').update(text).digest('hex').slice(0, 12);
}

async function main() {
  // Check VOICEVOX is running
  try {
    const res = await fetch(`${VOICEVOX_URL}/version`);
    if (!res.ok) throw new Error('not ok');
    console.log(`VOICEVOX version: ${await res.text()}`);
  } catch {
    console.error(`ERROR: VOICEVOX not running at ${VOICEVOX_URL}`);
    console.error('Start VOICEVOX first, or set VOICEVOX_URL env var.');
    process.exit(1);
  }

  const words = loadWords();
  console.log(`Found ${words.size} unique words to cache\n`);

  mkdirSync(CACHE_DIR, { recursive: true });

  // Load existing manifest to skip already-cached words
  const manifestPath = join(CACHE_DIR, 'manifest.json');
  let existing = {};
  if (existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (prev.speakerId === SPEAKER_ID && prev.speedScale === SPEED_SCALE) {
        existing = prev.entries || {};
        console.log(`Existing cache has ${Object.keys(existing).length} words, will skip those\n`);
      }
    } catch {}
  }

  const entries = { ...existing };
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [text, source] of words) {
    if (entries[text]) {
      skipped++;
      continue;
    }

    const filename = `${hashText(text)}.wav`;
    try {
      const wav = await synthesize(text);
      writeFileSync(join(CACHE_DIR, filename), wav);
      entries[text] = filename;
      generated++;
      console.log(`  [${generated}] ${text} (${source}) → ${filename} (${wav.length} bytes)`);
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${text} (${source}) — ${err.message}`);
    }
  }

  // Write manifest
  const manifest = {
    speakerId: SPEAKER_ID,
    speedScale: SPEED_SCALE,
    generatedAt: new Date().toISOString(),
    entries
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Total cached: ${Object.keys(entries).length} words`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 2: Verify it loads words correctly (dry-run)**

Run: `node -e "import('./scripts/generate-tts-cache.mjs')"` — this will fail because VOICEVOX is not running, but we can verify word loading separately:

```bash
node -e "
  import { readFileSync } from 'fs';
  const moves = JSON.parse(readFileSync('data/moves.json','utf-8'));
  const creatures = JSON.parse(readFileSync('data/creatures.json','utf-8'));
  const items = JSON.parse(readFileSync('data/items.json','utf-8'));
  const words = new Set();
  moves.forEach(m => m.name && words.add(m.name));
  creatures.forEach(c => { c.baseWord && words.add(c.baseWord); c.modifier?.word && words.add(c.modifier.word); });
  items.forEach(i => { i.word && words.add(i.word); i.components?.forEach(comp => comp.word && words.add(comp.word)); });
  console.log('Unique words:', words.size);
"
```

Expected: prints something like `Unique words: 240-260`

**Step 3: Commit**

```bash
git add scripts/generate-tts-cache.mjs
git commit -m "feat: add TTS cache generation script for VOICEVOX"
```

---

### Task 4: Run the generation script (requires VOICEVOX)

**Step 1: Verify VOICEVOX is reachable**

Run: `curl -s http://127.0.0.1:50021/version`
Expected: version string (e.g. `"0.15.0"`)

If VOICEVOX is not running, this task must wait until it is available.

**Step 2: Run the generation script**

Run: `node scripts/generate-tts-cache.mjs`
Expected: Generates ~250 WAV files in `data/tts-cache/`, prints summary.

**Step 3: Verify the cache**

Run: `ls data/tts-cache/*.wav | wc -l` — should be ~250
Run: `du -sh data/tts-cache/` — should be ~5MB
Run: `cat data/tts-cache/manifest.json | node -e "const m=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log('Words:', Object.keys(m.entries).length, 'Speaker:', m.speakerId, 'Speed:', m.speedScale)"`

**Step 4: Test the server serves cached audio**

Restart the server: `sudo pm2 restart all`

Wait 3s, then test:
```bash
curl -s -X POST http://localhost:3000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"走る","speakerId":11,"speed":0.9}' \
  -o /dev/null -w "HTTP %{http_code}, Size: %{size_download}, Cache: %{header:X-TTS-Cache}\n"
```

Expected: `HTTP 200, Size: ~20000, Cache: hit`

Test a miss (different speaker):
```bash
curl -s -X POST http://localhost:3000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"走る","speakerId":39,"speed":0.9}' \
  -o /dev/null -w "HTTP %{http_code}, Cache: %{header:X-TTS-Cache}\n"
```

Expected: `Cache: miss` (or VOICEVOX error if not running)

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass, no regressions

**Step 2: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: complete TTS pre-cache system for static game words"
```
