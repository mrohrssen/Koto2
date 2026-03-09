# Forge Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a phone-friendly web dashboard that lets the user batch-select theme pool words for forging, then process them via Claude Code Opus subagents, with editable result previews and approve/discard flow.

**Architecture:** Split architecture — `public/forge.html` is the UI layer that reads/writes JSON queue/results files via server API endpoints. A `/forge-queue` Claude Code skill reads the queue, spawns Opus subagents for the AI work, and writes results back. Zero API cost; all AI runs through Claude Code.

**Tech Stack:** Express.js (existing server), vanilla HTML/CSS/JS (matching existing dev tool pattern), Claude Code Agent tool with Opus subagents.

**Design doc:** `docs/plans/2026-03-09-forge-workbench-design.md`

---

## Task 1: Forge Data Utilities

Create a shared module for reading/writing the forge queue and results files.

**Files:**
- Create: `src/forge/forge-data.js`
- Create: `tests/unit/forge/forge-data.test.js`

**Step 1: Write the failing tests**

```js
// tests/unit/forge/forge-data.test.js
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

let forgeData;
const testDir = join(import.meta.dirname, '../../../tmp/test-forge-data');

before(async () => {
  forgeData = await import('../../../src/forge/forge-data.js');
});

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

describe('readQueue', () => {
  it('returns empty jobs array when file does not exist', () => {
    const result = forgeData.readQueue(join(testDir, 'nope.json'));
    assert.deepStrictEqual(result, { jobs: [] });
  });

  it('reads existing queue file', () => {
    const path = join(testDir, 'queue.json');
    const data = { jobs: [{ id: 'test1', status: 'pending' }] };
    writeFileSync(path, JSON.stringify(data));
    const result = forgeData.readQueue(path);
    assert.strictEqual(result.jobs.length, 1);
    assert.strictEqual(result.jobs[0].id, 'test1');
  });
});

describe('appendJobs', () => {
  it('creates file and adds jobs when file does not exist', () => {
    const path = join(testDir, 'queue.json');
    const jobs = [{ word: '教える', role: 'creature', notes: '' }];
    const result = forgeData.appendJobs(path, jobs, 'school');
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].id.startsWith('forge_'));
    assert.strictEqual(result[0].status, 'pending');
    assert.strictEqual(result[0].themeId, 'school');
  });

  it('appends to existing jobs', () => {
    const path = join(testDir, 'queue.json');
    writeFileSync(path, JSON.stringify({ jobs: [{ id: 'existing', status: 'complete' }] }));
    forgeData.appendJobs(path, [{ word: '机', role: 'item', notes: 'desk' }], 'school');
    const queue = forgeData.readQueue(path);
    assert.strictEqual(queue.jobs.length, 2);
  });
});

describe('readResults', () => {
  it('returns empty results array when file does not exist', () => {
    const result = forgeData.readResults(join(testDir, 'nope.json'));
    assert.deepStrictEqual(result, { results: [] });
  });
});

describe('writeResult', () => {
  it('creates file and adds result', () => {
    const path = join(testDir, 'results.json');
    forgeData.writeResult(path, { jobId: 'forge_1', status: 'complete', data: { name: 'test' } });
    const results = forgeData.readResults(path);
    assert.strictEqual(results.results.length, 1);
    assert.strictEqual(results.results[0].jobId, 'forge_1');
  });
});

describe('updateJobStatus', () => {
  it('updates status of a specific job', () => {
    const path = join(testDir, 'queue.json');
    writeFileSync(path, JSON.stringify({ jobs: [{ id: 'j1', status: 'pending' }] }));
    forgeData.updateJobStatus(path, 'j1', 'processing');
    const queue = forgeData.readQueue(path);
    assert.strictEqual(queue.jobs[0].status, 'processing');
  });
});

describe('removeResult', () => {
  it('removes a result by jobId', () => {
    const path = join(testDir, 'results.json');
    const data = { results: [
      { jobId: 'j1', data: {} },
      { jobId: 'j2', data: {} }
    ]};
    writeFileSync(path, JSON.stringify(data));
    forgeData.removeResult(path, 'j1');
    const results = forgeData.readResults(path);
    assert.strictEqual(results.results.length, 1);
    assert.strictEqual(results.results[0].jobId, 'j2');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/forge/forge-data.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```js
// src/forge/forge-data.js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function readQueue(filePath) {
  if (!existsSync(filePath)) return { jobs: [] };
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function appendJobs(filePath, newJobs, themeId) {
  const queue = readQueue(filePath);
  const created = newJobs.map(job => ({
    id: `forge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    themeId,
    word: job.word,
    reading: job.reading || '',
    meaning: job.meaning || '',
    rank: job.rank || null,
    role: job.role,
    notes: job.notes || '',
    previousResult: job.previousResult || null,
    reforgeHistory: job.reforgeHistory || [],
    status: 'pending',
    submittedAt: new Date().toISOString()
  }));
  queue.jobs.push(...created);
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(queue, null, 2));
  return created;
}

export function readResults(filePath) {
  if (!existsSync(filePath)) return { results: [] };
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeResult(filePath, result) {
  const data = readResults(filePath);
  // Replace existing result for same jobId, or append
  const idx = data.results.findIndex(r => r.jobId === result.jobId);
  if (idx >= 0) {
    data.results[idx] = result;
  } else {
    data.results.push(result);
  }
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function updateJobStatus(filePath, jobId, status) {
  const queue = readQueue(filePath);
  const job = queue.jobs.find(j => j.id === jobId);
  if (job) {
    job.status = status;
    writeFileSync(filePath, JSON.stringify(queue, null, 2));
  }
}

export function removeResult(filePath, jobId) {
  const data = readResults(filePath);
  data.results = data.results.filter(r => r.jobId !== jobId);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/forge/forge-data.test.js`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/forge/forge-data.js tests/unit/forge/forge-data.test.js
git commit -m "feat: add forge queue/results data utilities with tests"
```

---

## Task 2: Forge API Endpoints

Add `/api/forge/*` endpoints to server.js for the dashboard to communicate with.

**Files:**
- Create: `src/routes/forge.js`
- Modify: `server.js:324-415` (mount the forge router)
- Create: `tests/unit/forge/forge-routes.test.js`

**Step 1: Write the failing tests**

```js
// tests/unit/forge/forge-routes.test.js
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

let createForgeRouter;
const testDir = join(import.meta.dirname, '../../../tmp/test-forge-routes');
const themesDir = join(testDir, 'themes');
const dataDir = join(testDir, 'data');

// Minimal mock req/res for route handler testing
function mockReq(overrides = {}) {
  return { params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; }
  };
  return res;
}

before(async () => {
  const mod = await import('../../../src/routes/forge.js');
  createForgeRouter = mod.createForgeRouter;
});

beforeEach(() => {
  mkdirSync(themesDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

describe('getThemes handler', () => {
  it('lists available themes with stats', async () => {
    // Write a minimal theme file
    writeFileSync(join(themesDir, 'school.json'), JSON.stringify({
      themeId: 'school',
      areaWord: '学校',
      areaReading: 'がっこう',
      areaMeaning: 'school',
      areaRank: 700,
      computedStage: 5,
      words: [
        { word: '教える', assigned: null, roles: ['creature'] },
        { word: '走る', assigned: 'move:hashiru', roles: ['move'] }
      ]
    }));

    const router = createForgeRouter({ themesDir, dataDir });
    const handler = router._handlers.getThemes;
    const req = mockReq();
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.body.themes.length, 1);
    assert.strictEqual(res.body.themes[0].themeId, 'school');
    assert.strictEqual(res.body.themes[0].totalWords, 2);
    assert.strictEqual(res.body.themes[0].assignedWords, 1);
  });
});

describe('getTheme handler', () => {
  it('returns full theme pool by id', async () => {
    writeFileSync(join(themesDir, 'school.json'), JSON.stringify({
      themeId: 'school',
      areaWord: '学校',
      words: [{ word: '教える', assigned: null }]
    }));

    const router = createForgeRouter({ themesDir, dataDir });
    const handler = router._handlers.getTheme;
    const req = mockReq({ params: { id: 'school' } });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.body.themeId, 'school');
    assert.strictEqual(res.body.words.length, 1);
  });

  it('returns 404 for missing theme', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const handler = router._handlers.getTheme;
    const req = mockReq({ params: { id: 'nope' } });
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
  });
});

describe('postQueue handler', () => {
  it('appends jobs to queue file', async () => {
    const router = createForgeRouter({ themesDir, dataDir });
    const handler = router._handlers.postQueue;
    const req = mockReq({
      body: {
        themeId: 'school',
        jobs: [
          { word: '教える', reading: 'おしえる', meaning: 'teach', rank: 300, role: 'creature', notes: 'owl' }
        ]
      }
    });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.body.added, 1);
    assert.ok(existsSync(join(dataDir, 'forge-queue.json')));
  });
});

describe('postApprove handler', () => {
  it('writes creature data to staging file', async () => {
    // Setup: a result exists, a theme exists
    writeFileSync(join(themesDir, 'school.json'), JSON.stringify({
      themeId: 'school',
      areaWord: '学校',
      words: [{ word: '教える', reading: 'おしえる', meaning: 'teach', rank: 300, roles: ['creature'], assigned: null }]
    }));
    writeFileSync(join(dataDir, 'forge-results.json'), JSON.stringify({
      results: [{ jobId: 'j1', role: 'creature', word: '教える', themeId: 'school', data: { id: 'fukuroeru', name: 'フクロエル' } }]
    }));

    const router = createForgeRouter({ themesDir, dataDir });
    const handler = router._handlers.postApprove;
    const req = mockReq({
      body: { jobId: 'j1', editedData: { id: 'fukuroeru', name: 'フクロエル' } }
    });
    const res = mockRes();
    await handler(req, res);

    assert.strictEqual(res.body.success, true);
    // Result should be removed from results file
    const results = JSON.parse(readFileSync(join(dataDir, 'forge-results.json'), 'utf8'));
    assert.strictEqual(results.results.length, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/forge/forge-routes.test.js`
Expected: FAIL — module not found

**Step 3: Write the route module**

```js
// src/routes/forge.js
import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  readQueue, appendJobs, readResults, writeResult,
  updateJobStatus, removeResult
} from '../forge/forge-data.js';

// Staging file paths by role
const STAGING_FILES = {
  creature: 'new-creatures-staging.json',
  move: 'new-moves-staging.json',
  item: 'new-items-staging.json',
  npc: 'new-npcs-staging.json',
  area: 'new-areas-staging.json'
};

export function createForgeRouter({ themesDir, dataDir }) {
  const router = Router();
  const queuePath = join(dataDir, 'forge-queue.json');
  const resultsPath = join(dataDir, 'forge-results.json');

  // --- Handlers (exported for testing) ---

  async function getThemes(req, res) {
    try {
      const files = readdirSync(themesDir).filter(f => f.endsWith('.json'));
      const themes = files.map(f => {
        const theme = JSON.parse(readFileSync(join(themesDir, f), 'utf8'));
        const totalWords = theme.words?.length || 0;
        const assignedWords = (theme.words || []).filter(w => w.assigned).length;
        return {
          themeId: theme.themeId,
          areaWord: theme.areaWord,
          areaReading: theme.areaReading,
          areaMeaning: theme.areaMeaning,
          computedStage: theme.computedStage,
          totalWords,
          assignedWords,
          progress: totalWords > 0 ? Math.round((assignedWords / totalWords) * 100) : 0
        };
      });
      res.json({ themes });
    } catch (error) {
      console.error('[Forge] Error listing themes:', error);
      res.status(500).json({ error: 'Failed to list themes', details: error.message });
    }
  }

  async function getTheme(req, res) {
    try {
      const filePath = join(themesDir, `${req.params.id}.json`);
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: `Theme '${req.params.id}' not found` });
      }
      const theme = JSON.parse(readFileSync(filePath, 'utf8'));
      res.json(theme);
    } catch (error) {
      console.error('[Forge] Error reading theme:', error);
      res.status(500).json({ error: 'Failed to read theme', details: error.message });
    }
  }

  async function getQueue(req, res) {
    try {
      res.json(readQueue(queuePath));
    } catch (error) {
      console.error('[Forge] Error reading queue:', error);
      res.status(500).json({ error: 'Failed to read queue', details: error.message });
    }
  }

  async function postQueue(req, res) {
    try {
      const { themeId, jobs } = req.body;
      if (!themeId || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'themeId and non-empty jobs array required' });
      }
      const created = appendJobs(queuePath, jobs, themeId);
      res.json({ success: true, added: created.length, jobs: created });
    } catch (error) {
      console.error('[Forge] Error adding to queue:', error);
      res.status(500).json({ error: 'Failed to add jobs', details: error.message });
    }
  }

  async function getResults(req, res) {
    try {
      res.json(readResults(resultsPath));
    } catch (error) {
      console.error('[Forge] Error reading results:', error);
      res.status(500).json({ error: 'Failed to read results', details: error.message });
    }
  }

  async function postApprove(req, res) {
    try {
      const { jobId, editedData } = req.body;
      if (!jobId || !editedData) {
        return res.status(400).json({ error: 'jobId and editedData required' });
      }

      // Find the result
      const allResults = readResults(resultsPath);
      const result = allResults.results.find(r => r.jobId === jobId);
      if (!result) {
        return res.status(404).json({ error: `Result '${jobId}' not found` });
      }

      // Write to appropriate staging file
      const stagingFile = STAGING_FILES[result.role];
      if (!stagingFile) {
        return res.status(400).json({ error: `Unknown role '${result.role}'` });
      }
      const stagingPath = join(dataDir, stagingFile);
      const staging = existsSync(stagingPath)
        ? JSON.parse(readFileSync(stagingPath, 'utf8'))
        : [];
      staging.push(editedData);
      writeFileSync(stagingPath, JSON.stringify(staging, null, 2));

      // Mark assigned in theme pool
      const themePath = join(themesDir, `${result.themeId}.json`);
      if (existsSync(themePath)) {
        const theme = JSON.parse(readFileSync(themePath, 'utf8'));
        const word = theme.words.find(w => w.word === result.word);
        if (word) {
          word.assigned = `${result.role}:${editedData.id}`;
          writeFileSync(themePath, JSON.stringify(theme, null, 2));
        }
      }

      // Remove from results
      removeResult(resultsPath, jobId);

      // Update queue job status to approved
      updateJobStatus(queuePath, jobId, 'approved');

      res.json({ success: true, role: result.role, id: editedData.id });
    } catch (error) {
      console.error('[Forge] Error approving:', error);
      res.status(500).json({ error: 'Failed to approve', details: error.message });
    }
  }

  async function postDiscard(req, res) {
    try {
      const { jobId } = req.body;
      if (!jobId) {
        return res.status(400).json({ error: 'jobId required' });
      }
      removeResult(resultsPath, jobId);
      updateJobStatus(queuePath, jobId, 'discarded');
      res.json({ success: true });
    } catch (error) {
      console.error('[Forge] Error discarding:', error);
      res.status(500).json({ error: 'Failed to discard', details: error.message });
    }
  }

  // Mount routes
  router.get('/themes', getThemes);
  router.get('/theme/:id', getTheme);
  router.get('/queue', getQueue);
  router.post('/queue', postQueue);
  router.get('/results', getResults);
  router.post('/approve', postApprove);
  router.post('/discard', postDiscard);

  // Expose handlers for testing
  router._handlers = { getThemes, getTheme, getQueue, postQueue, getResults, postApprove, postDiscard };

  return router;
}
```

**Step 4: Mount in server.js**

Add after the theme-pool-submit endpoint (after line 711 in server.js):

```js
// ============ Forge Workbench ============
import { createForgeRouter } from './src/routes/forge.js';

app.use('/api/forge', createForgeRouter({
  themesDir: join(__dirname, 'language', 'themes'),
  dataDir: join(__dirname, 'data')
}));
```

Note: The `import` statement should go at the top of server.js with other imports. The `app.use()` call goes after line 711.

**Step 5: Run tests to verify they pass**

Run: `node --test tests/unit/forge/forge-routes.test.js`
Expected: All tests PASS

**Step 6: Verify server starts**

Run: `node --check server.js && echo "OK"`
Expected: OK (no syntax errors)

**Step 7: Commit**

```bash
git add src/routes/forge.js tests/unit/forge/forge-routes.test.js server.js
git commit -m "feat: add forge workbench API endpoints"
```

---

## Task 3: Forge Dashboard HTML

Create the phone-friendly dashboard page.

**Files:**
- Create: `public/forge.html`

**Step 1: Create the dashboard**

This is a single-file HTML page following the existing dev tool pattern: inline CSS (dark theme, `#1a1a2e` bg), inline vanilla JS, fetch-based API calls. No framework.

The page has four sections:
1. **Header** — theme selector dropdown with progress indicator
2. **Word list** — scrollable list of words from selected theme, checkboxes for selection, role badges, grayed if assigned
3. **Batch panel** — selected words with role dropdown + notes textarea per word, submit button
4. **Results panel** — forge results with editable fields, approve/re-forge/discard buttons

Key UI behaviors:
- Theme selector loads word list via `GET /api/forge/theme/:id`
- Checking words moves them to batch panel with default role from their `roles[0]`
- Submit POSTs to `/api/forge/queue` and shows "Waiting for /forge-queue..." status
- Results panel polls `GET /api/forge/results` every 3 seconds while jobs are pending
- Each result renders as an editable card with type-specific fields (see design doc)
- Approve POSTs to `/api/forge/approve` with edited data
- Re-forge adds a new job to the queue via `/api/forge/queue` with `previousResult` set
- Discard POSTs to `/api/forge/discard`

Card field layouts by role:

**Creature:** id, name (katakana), nameEn, element (dropdown: fire/water/earth/wood/metal/neutral), archetype (dropdown: Fighter/Mage/Trickster/Tank-Healer), baseWord, baseMeaning, modifier.word, modifier.meaning, description (textarea), learnset display

**Move:** id, name, nameEn, reading, meaning, element (dropdown), category (dropdown: damage/buff/debuff/heal/shield/drain), target (dropdown), power, mpCost, statusEffect, tier, stage, description

**Item:** id, word, reading, meaning, components display, rank, rarity (dropdown), type (dropdown), effect (JSON editor), description, descriptionJa

**NPC:** id, name, nameEn, baseWord, baseMeaning, modifier, area, personality.traits, personality.speechStyle, personality.quirk

Mobile-first CSS: full-width cards, large touch targets (min 44px), sticky header.

```
Color palette (matching existing dev tools):
- Background: #1a1a2e
- Card background: #16213e
- Deep background: #0f0f23
- Accent blue: #0f3460
- Text: #e0e0e0
- Success green: #4ade80
- Warning amber: #fbbf24
- Error red: #f87171
- Role badges: creature=#a78bfa, move=#f472b6, item=#34d399, npc=#60a5fa, area=#fbbf24
```

**Step 2: Verify the page loads**

Start server, navigate to `http://localhost:3000/forge.html` in browser. Should show theme selector and empty state.

**Step 3: Commit**

```bash
git add public/forge.html
git commit -m "feat: add forge workbench dashboard UI"
```

---

## Task 4: Dashboard Polish & Integration Testing

Test the full flow manually and fix issues.

**Files:**
- Possibly modify: `public/forge.html` (bugfixes from manual testing)

**Step 1: Manual integration test**

1. Open `http://localhost:3000/forge.html`
2. Select "school" theme from dropdown
3. Verify word list loads with correct roles and assignment status
4. Select 2-3 words, assign roles, add notes
5. Submit batch
6. Verify jobs appear in `data/forge-queue.json`
7. Verify results panel shows "Waiting for /forge-queue..."

**Step 2: Test approve flow with mock data**

Manually write a test result to `data/forge-results.json`:
```bash
echo '{"results":[{"jobId":"test1","status":"complete","role":"creature","word":"教える","themeId":"school","data":{"id":"fukuroeru","name":"フクロエル","nameEn":"Fukuroeru","element":"psychic","archetype":"Mage","description":"An owl teacher"},"agentNotes":"Test result"}]}' > data/forge-results.json
```

Verify:
- Result card appears in dashboard
- Fields are editable
- Approve writes to `data/new-creatures-staging.json`
- Word shows as assigned in theme pool after refresh

**Step 3: Test re-forge flow**

- Click Re-forge on a result
- Add notes
- Verify new job appears in queue with `previousResult` set
- Verify role can be changed before re-submitting

**Step 4: Commit any fixes**

```bash
git add public/forge.html
git commit -m "fix: forge dashboard integration fixes"
```

---

## Task 5: `/forge-queue` Claude Code Skill

Create the skill that reads the queue and processes jobs via Opus subagents.

**Files:**
- Create: `.claude/plugins/koto-forge/1.1.0/skills/forge-queue/SKILL.md`
- Create symlink: `.claude/commands/forge-queue.md` → `../plugins/koto-forge/1.1.0/skills/forge-queue/SKILL.md`

**Step 1: Write the skill**

The skill should:

1. Read `data/forge-queue.json` and filter for `status: "pending"` jobs
2. If no pending jobs, report "No pending forge jobs" and exit
3. Sort jobs by dependency order:
   - Group 1: moves
   - Group 2: creatures
   - Group 3: areas
   - Group 4: NPCs, items (parallel)
4. For each group, spawn Opus subagents (up to 3 parallel within a group) using the Agent tool
5. Each subagent receives:
   - The word data (word, reading, meaning, rank)
   - User's notes
   - Previous result if re-forging
   - Theme context (stage, area word, what's already forged)
   - Existing game data context (for dedup and learnset building)
   - Role-specific forge rules (condensed from the SKILL.md files)
   - Output format: JSON matching the staging file schema
6. When a subagent completes, write its result to `data/forge-results.json`
7. Update the job status in `data/forge-queue.json` to `complete`
8. After all groups are done, report summary

The subagent prompts should include the generative rules from the forge skills (see design doc references). Each role type gets a different system prompt section.

Key rules to embed in subagent prompts:
- **Creature**: naming (romaji substring rule), element assignment, archetype stats, modifier rules, learnset from existing moves.json, visual description
- **Move**: element from verb semantics, category from verb type, tier/power/cost tables, status effect rules
- **Item**: compound word brainstorming, rarity from rarest component rank, effect by rarity
- **NPC**: person-noun base words only, natural Japanese given names, personality/bond/dialogue generation
- **Area**: sub-area naming (modifier+の+location), creature matching, visual descriptions (no cyberpunk)

**Step 2: Create the symlink**

```bash
ln -sf ../plugins/koto-forge/1.1.0/skills/forge-queue/SKILL.md .claude/commands/forge-queue.md
```

**Step 3: Test the skill**

1. Ensure there are pending jobs in `data/forge-queue.json` (submitted from dashboard)
2. Run `/forge-queue` in Claude Code
3. Verify subagents spawn and process jobs
4. Verify results appear in `data/forge-results.json`
5. Verify dashboard picks up results on next poll

**Step 4: Commit**

```bash
git add .claude/plugins/koto-forge/1.1.0/skills/forge-queue/SKILL.md .claude/commands/forge-queue.md
git commit -m "feat: add /forge-queue skill for Opus subagent forging"
```

---

## Task 6: End-to-End Verification

Full pipeline test with a real theme.

**Steps:**

1. Open forge dashboard on phone/browser
2. Select "school" theme
3. Select 1 word per role type: 1 move, 1 creature, 1 item
4. Add guidance notes for each
5. Submit batch
6. Run `/forge-queue` in Claude Code
7. Watch results stream into dashboard
8. Edit a creature name
9. Approve the move and creature
10. Re-forge the item with different notes
11. Run `/forge-queue` again for the re-forge
12. Approve the re-forged item
13. Verify:
    - `data/new-creatures-staging.json` has the creature
    - `data/new-moves-staging.json` has the move (or `data/moves.json` if staging doesn't exist — handle this)
    - `data/new-items-staging.json` has the item
    - `language/themes/school.json` has all 3 words marked as `assigned`

**Step 2: Commit final state**

```bash
git add -A
git commit -m "feat: forge workbench end-to-end verified"
```

---

## Implementation Order Summary

| Task | What | Estimated Complexity |
|------|------|---------------------|
| 1 | Forge data utilities + tests | Small — pure file I/O |
| 2 | API endpoints + tests | Medium — 7 route handlers |
| 3 | Dashboard HTML | Large — substantial UI |
| 4 | Integration testing & fixes | Small — manual verification |
| 5 | `/forge-queue` skill | Large — subagent prompt engineering |
| 6 | End-to-end verification | Small — manual pipeline test |

Tasks 1-2 are backend, test-driven. Task 3 is the big frontend piece. Task 5 is the big AI piece. Tasks 4 and 6 are verification.
