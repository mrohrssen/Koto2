# Content Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/dev/content` page to the dev hub that lets you browse and inline-edit all 6 game content types (creatures, moves, items, NPCs, NPC skills, areas).

**Architecture:** Single HTML page with tab navigation, served by the existing dev router. Two new API endpoints (`GET /dev/api/content/:type` and `PATCH /dev/api/content/:type`) handle data read/write. All data files live in `data/`. Frontend is vanilla JS (no framework), matching existing dev pages.

**Tech Stack:** Express router (existing `src/routes/dev.js`), vanilla HTML/CSS/JS, `fs` for JSON read/write.

**Important data format note:** `npcs.json` is an **object keyed by NPC ID** (not an array). All other files are arrays. The API must normalize this: return arrays to the frontend, accept patches by ID, and write back in the original format.

---

### Task 1: Add GET /dev/api/content/:type endpoint

**Files:**
- Modify: `src/routes/dev.js`

**Step 1: Write the failing test**

Create `tests/unit/routes/dev-content-api.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createDevRouter } from '../../src/routes/dev.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// Use a temp data dir to avoid touching real data
const TMP_DIR = join(process.cwd(), 'tmp-test-content-api');
const TMP_DATA = join(TMP_DIR, 'data');

describe('GET /dev/api/content/:type', () => {
  let app, server, baseUrl;

  before(async () => {
    mkdirSync(TMP_DATA, { recursive: true });

    // Write test fixtures
    writeFileSync(join(TMP_DATA, 'creatures.json'), JSON.stringify([
      { id: 'test-creature', name: 'テスト', nameEn: 'TestCreature', element: 'fire', rarity: 'common' }
    ]));
    writeFileSync(join(TMP_DATA, 'moves.json'), JSON.stringify([
      { id: 'test-move', name: '走る', nameEn: 'Dash', element: 'neutral', category: 'buff' }
    ]));
    writeFileSync(join(TMP_DATA, 'items.json'), JSON.stringify([
      { id: 'test-item', word: 'テスト', reading: 'てすと', meaning: 'test', type: 'heal' }
    ]));
    writeFileSync(join(TMP_DATA, 'npcs.json'), JSON.stringify({
      'test-npc': { id: 'test-npc', name: 'テスト', nameEn: 'TestNPC', area: 'test-area' }
    }));
    writeFileSync(join(TMP_DATA, 'npc-skills.json'), JSON.stringify([
      { id: 'test-skill', name: 'Test Skill', nameEn: 'Test Skill', element: 'neutral' }
    ]));
    writeFileSync(join(TMP_DATA, 'areas.json'), JSON.stringify([
      { id: 'test-area', name: '森', nameEn: 'Forest', reading: 'もり' }
    ]));

    app = express();
    app.use(express.json());
    app.use('/dev', createDevRouter({ password: '', dataDir: TMP_DATA }));

    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
  });

  it('returns creatures array', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/creatures`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data));
    assert.equal(data.length, 1);
    assert.equal(data[0].id, 'test-creature');
  });

  it('returns npcs as array (normalized from object)', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/npcs`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data));
    assert.equal(data.length, 1);
    assert.equal(data[0].id, 'test-npc');
  });

  it('returns 400 for unknown type', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/unknown`);
    assert.equal(res.status, 400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes/dev-content-api.test.js`
Expected: FAIL — `createDevRouter` doesn't accept `dataDir` param yet and no `/api/content/:type` route exists.

**Step 3: Implement the GET endpoint**

In `src/routes/dev.js`, update `createDevRouter` to accept optional `dataDir` parameter, add content type mapping and the GET route:

```js
// Add near top of createDevRouter, after existing const declarations:
const CONTENT_FILES = {
  creatures: 'creatures.json',
  moves: 'moves.json',
  items: 'items.json',
  npcs: 'npcs.json',
  'npc-skills': 'npc-skills.json',
  areas: 'areas.json'
};

// Add this helper inside createDevRouter:
function loadContentFile(type) {
  const filename = CONTENT_FILES[type];
  if (!filename) return null;
  const contentDataDir = opts.dataDir || DATA_DIR;
  const filePath = join(contentDataDir, filename);
  if (!existsSync(filePath)) return [];
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  // npcs.json is object-keyed, normalize to array
  if (type === 'npcs' && !Array.isArray(raw)) {
    return Object.values(raw);
  }
  return raw;
}

// Route:
router.get('/api/content/:type', requireAuth, (req, res) => {
  const { type } = req.params;
  if (!CONTENT_FILES[type]) {
    return res.status(400).json({ error: `Unknown content type: ${type}` });
  }
  try {
    const data = loadContentFile(type);
    res.json(data);
  } catch (err) {
    console.error(`[Dev] Content load error (${type}):`, err.message);
    res.status(500).json({ error: 'Failed to load content' });
  }
});
```

Update the function signature from `createDevRouter({ password })` to `createDevRouter(opts)` and destructure inside:

```js
export function createDevRouter(opts) {
  const { password } = opts;
  // ... rest unchanged
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/routes/dev-content-api.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/dev.js tests/unit/routes/dev-content-api.test.js
git commit -m "feat: add GET /dev/api/content/:type endpoint for content browser"
```

---

### Task 2: Add PATCH /dev/api/content/:type endpoint

**Files:**
- Modify: `src/routes/dev.js`
- Modify: `tests/unit/routes/dev-content-api.test.js`

**Step 1: Add failing tests**

Append to `dev-content-api.test.js`:

```js
describe('PATCH /dev/api/content/:type', () => {
  // ... same setup/teardown as above (share the before/after)

  it('updates a creature field and persists to disk', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/creatures`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [{ id: 'test-creature', field: 'nameEn', value: 'UpdatedCreature' }]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.updated, 1);

    // Verify persistence
    const check = await fetch(`${baseUrl}/dev/api/content/creatures`);
    const data = await check.json();
    assert.equal(data[0].nameEn, 'UpdatedCreature');
  });

  it('updates an NPC field (object-keyed file)', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/npcs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [{ id: 'test-npc', field: 'nameEn', value: 'UpdatedNPC' }]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 1);
  });

  it('rejects unknown content type', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/bananas`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [] })
    });
    assert.equal(res.status, 400);
  });

  it('rejects changes with unknown IDs', async () => {
    const res = await fetch(`${baseUrl}/dev/api/content/creatures`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: [{ id: 'nonexistent', field: 'nameEn', value: 'X' }]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, 0);
    assert(body.errors.length > 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/routes/dev-content-api.test.js`
Expected: FAIL — no PATCH route

**Step 3: Implement PATCH endpoint**

Add to `src/routes/dev.js` inside `createDevRouter`:

```js
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
    const contentDataDir = opts.dataDir || DATA_DIR;
    const filePath = join(contentDataDir, CONTENT_FILES[type]);
    const raw = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf-8')) : (type === 'npcs' ? {} : []);
    const isObjectKeyed = type === 'npcs' && !Array.isArray(raw);

    let updated = 0;
    const errors = [];

    for (const { id, field, value } of changes) {
      if (field === 'id') {
        errors.push({ id, error: 'Cannot modify id field' });
        continue;
      }

      let entry;
      if (isObjectKeyed) {
        entry = raw[id];
      } else {
        entry = raw.find(e => e.id === id);
      }

      if (!entry) {
        errors.push({ id, error: `Entry not found: ${id}` });
        continue;
      }

      entry[field] = value;
      updated++;
    }

    writeFileSync(filePath, JSON.stringify(raw, null, 2));
    res.json({ ok: true, updated, errors });
  } catch (err) {
    console.error(`[Dev] Content patch error (${type}):`, err.message);
    res.status(500).json({ error: 'Failed to save changes' });
  }
});
```

**Step 4: Run tests**

Run: `node --test tests/unit/routes/dev-content-api.test.js`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/routes/dev.js tests/unit/routes/dev-content-api.test.js
git commit -m "feat: add PATCH /dev/api/content/:type endpoint for inline editing"
```

---

### Task 3: Create the Content Browser HTML page

**Files:**
- Create: `public/dev-content.html`

**Step 1: Create the HTML page**

This is a large file. Key structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Content Browser — Koto Dev</title>
  <style>
    /* Match existing dev site dark theme: #1a1a2e bg, #16213e cards, #0f3460 accent */
    /* Sticky topbar with tabs + search (same pattern as dev-sprites.html) */
    /* Sortable table with alternating row colors */
    /* Click-to-edit cells: yellow highlight for modified */
    /* Diff modal for save confirmation */
    /* Toast for save success */
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-row">
      <div class="tabs" id="tabs">
        <!-- 6 tabs, each with data-type attribute and count badge -->
      </div>
      <input class="search" placeholder="Search..." id="search">
      <span class="stats" id="stats"></span>
    </div>
  </div>

  <div id="table-container">
    <table id="content-table">
      <thead id="thead"></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

  <div id="save-bar" class="save-bar hidden">
    <span id="change-count"></span>
    <button id="save-btn">Save Changes</button>
    <button id="discard-btn">Discard</button>
  </div>

  <!-- Diff modal -->
  <div class="overlay" id="diff-overlay">
    <div class="modal">
      <button class="modal-close" id="diff-close">&times;</button>
      <h3>Confirm Changes</h3>
      <div id="diff-content"></div>
      <div class="modal-actions">
        <button class="btn btn-confirm" id="diff-confirm">Save</button>
        <button class="btn btn-cancel" id="diff-cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    // State
    let currentType = 'creatures';
    let data = {};        // { creatures: [...], moves: [...], ... }
    let pendingChanges = new Map(); // key: "type:id:field", value: { id, field, oldValue, newValue }

    // Column definitions per type
    const COLUMNS = {
      creatures: [
        { key: 'id', label: 'ID', editable: false },
        { key: 'name', label: 'Name (JP)' },
        { key: 'nameEn', label: 'Name (EN)' },
        { key: 'element', label: 'Element', enum: ['fire','water','earth','wood','metal','neutral'] },
        { key: 'rarity', label: 'Rarity', enum: ['common','uncommon','rare','epic','legendary'] },
        { key: 'archetype', label: 'Archetype' },
        { key: 'stage', label: 'Stage', type: 'number' },
        { key: 'baseHp', label: 'HP', type: 'number' },
        { key: 'baseAttack', label: 'ATK', type: 'number' },
        { key: 'baseMp', label: 'MP', type: 'number' },
        { key: 'learnset', label: 'Moves', editable: false, compute: v => Array.isArray(v) ? v.length : 0 }
      ],
      moves: [
        { key: 'id', label: 'ID', editable: false },
        { key: 'name', label: 'Name (JP)' },
        { key: 'nameEn', label: 'Name (EN)' },
        { key: 'reading', label: 'Reading' },
        { key: 'meaning', label: 'Meaning' },
        { key: 'element', label: 'Element', enum: ['fire','water','earth','wood','metal','neutral'] },
        { key: 'category', label: 'Category', enum: ['damage','buff','debuff','heal','shield','drain'] },
        { key: 'power', label: 'Power', type: 'number' },
        { key: 'mpCost', label: 'MP Cost', type: 'number' },
        { key: 'tier', label: 'Tier', type: 'number' },
        { key: 'stage', label: 'Stage', type: 'number' }
      ],
      items: [
        { key: 'id', label: 'ID', editable: false },
        { key: 'word', label: 'Word (JP)' },
        { key: 'reading', label: 'Reading' },
        { key: 'meaning', label: 'Meaning' },
        { key: 'type', label: 'Type', enum: ['heal','damage','revive','status-cure','status-inflict','evolution','key','currency'] },
        { key: 'rarity', label: 'Rarity', enum: ['common','uncommon','rare','epic','legendary'] },
        { key: 'effect', label: 'Effect' },
        { key: 'stage', label: 'Stage', type: 'number' }
      ],
      npcs: [
        { key: 'id', label: 'ID', editable: false },
        { key: 'name', label: 'Name (JP)' },
        { key: 'nameEn', label: 'Name (EN)' },
        { key: 'area', label: 'Area' },
        { key: 'tier', label: 'Tier', type: 'number' },
        { key: 'skills', label: 'Skills', editable: false, compute: v => Array.isArray(v) ? v.length : 0 },
        { key: 'personality.traits', label: 'Traits', editable: false, compute: (v, row) => row.personality?.traits?.join(', ') || '' }
      ],
      'npc-skills': [
        { key: 'id', label: 'ID', editable: false },
        { key: 'name', label: 'Name (JP)' },
        { key: 'nameEn', label: 'Name (EN)' },
        { key: 'reading', label: 'Reading' },
        { key: 'meaning', label: 'Meaning' },
        { key: 'element', label: 'Element', enum: ['fire','water','earth','wood','metal','neutral'] },
        { key: 'category', label: 'Category', enum: ['damage','buff','debuff','heal','shield','drain'] },
        { key: 'power', label: 'Power', type: 'number' },
        { key: 'mpCost', label: 'MP Cost', type: 'number' }
      ],
      areas: [
        { key: 'id', label: 'ID', editable: false },
        { key: 'name', label: 'Name (JP)' },
        { key: 'nameEn', label: 'Name (EN)' },
        { key: 'reading', label: 'Reading' },
        { key: 'theme', label: 'Theme' },
        { key: 'creatures', label: 'Creatures', editable: false, compute: v => Array.isArray(v) ? v.length : 0 },
        { key: 'subAreas', label: 'Sub-areas', editable: false, compute: v => Array.isArray(v) ? v.length : 0 }
      ]
    };

    // Tab labels
    const TAB_LABELS = {
      creatures: 'Creatures',
      moves: 'Moves',
      items: 'Items',
      npcs: 'NPCs',
      'npc-skills': 'NPC Skills',
      areas: 'Areas'
    };

    // Core functions:
    // loadTab(type) - fetch GET /dev/api/content/:type, store in data[type], render
    // renderTable() - build thead + tbody from COLUMNS[currentType] and data[currentType]
    // startEdit(cell, rowId, colDef) - replace cell with input/select
    // commitEdit(cell, rowId, colDef, newValue) - record in pendingChanges, highlight cell
    // applySearch(query) - filter tbody rows by text content
    // sortBy(colKey) - sort data[currentType] by column, re-render
    // showDiff() - build diff HTML from pendingChanges, show modal
    // saveChanges() - PATCH /dev/api/content/:type with pendingChanges, handle response
    // showToast(msg) - brief success/error message
  </script>
</body>
</html>
```

The full implementation should be ~600-800 lines of HTML/CSS/JS. Match the existing dark theme colors exactly: `#1a1a2e` body, `#16213e` cards/rows, `#0f3460` accents, `#a0c4ff` headings, `#e0e0e0` text.

**Step 2: Verify the page loads**

Start dev server, navigate to `http://localhost:3000/dev/content`, verify page loads and tabs render.

**Step 3: Commit**

```bash
git add public/dev-content.html
git commit -m "feat: add content browser HTML page with tab navigation and inline editing"
```

---

### Task 4: Register the route and add hub card

**Files:**
- Modify: `src/routes/dev.js` (add route)
- Modify: `public/dev-hub.html` (add card)

**Step 1: Add the route in dev.js**

After the `/sprites` route (line ~509), add:

```js
router.get('/content', requireAuth, (_req, res) => {
  res.sendFile(join(process.cwd(), 'public', 'dev-content.html'));
});
```

**Step 2: Add the hub card in dev-hub.html**

Add a new card in the `.grid` div, after the Forge Workbench card:

```html
<a class="card" href="/dev/content">
  <h2>Content Browser</h2>
  <p>Browse and edit all game data — creatures, moves, items, NPCs, skills, areas.</p>
  <span class="badge">auth</span>
</a>
```

**Step 3: Verify**

Navigate to `/dev/`, confirm the new card appears. Click it, confirm it loads `/dev/content`.

**Step 4: Commit**

```bash
git add src/routes/dev.js public/dev-hub.html
git commit -m "feat: register /dev/content route and add hub card"
```

---

### Task 5: Run full test suite and verify

**Step 1: Run all tests**

```bash
npm test
```

Expected: All existing tests + new content API tests pass.

**Step 2: Syntax check the new HTML**

```bash
# Quick sanity check that the JS in the HTML doesn't have syntax errors
node -e "const fs = require('fs'); const html = fs.readFileSync('public/dev-content.html','utf8'); const m = html.match(/<script>([\s\S]*)<\/script>/); if(m) new Function(m[1]); console.log('OK')"
```

**Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: address test/lint issues from content browser"
```

---

### Task 6: Manual verification

**Step 1:** Navigate to `/dev/content` in the browser
**Step 2:** Verify each tab loads data and shows correct column headers
**Step 3:** Click a cell, edit it, see the yellow highlight
**Step 4:** Click Save, verify the diff modal shows old → new values
**Step 5:** Confirm save, verify the toast appears and file on disk is updated
**Step 6:** Verify search filters rows across all visible columns
**Step 7:** Verify column sorting works (click header to toggle asc/desc)
