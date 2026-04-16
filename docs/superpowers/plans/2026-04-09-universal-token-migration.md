# Universal Token Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all Japanese text rendering to the universal token pipeline — one format, one eligibility function, one renderer.

**Architecture:** All sentence-level Japanese text is pre-tokenized at build time via `frame-sources.json` → Sudachi → `frames.json`. Single-word entities (moves, items, creatures) are wrapped at runtime via `entityToToken()`. Everything renders through `renderJpSentence()`. The old `_tokens`/`_contentWords`/`baseForm` format and `renderJpFirst()` are removed entirely.

**Tech Stack:** Node.js, Python (SudachiPy), node:test for testing.

**Spec:** `docs/superpowers/specs/2026-04-09-universal-token-migration-design.md`

---

## Chunk 1: Data Migration — frame-sources.json

Migrate bark, CID script, and NPC line raw text into `frame-sources.json`, add befriend prompt i+1 ladders, rebuild `frames.json`.

### Task 1: Extract bark raw text into frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`
- Reference: `data/dialogue/barks.json`

The current `barks.json` groups barks by trigger (e.g. `onHit`, `onVictory`). Each bark has `text`, `_tokens`, `_contentWords`. We need only the `text` field — the build script will re-tokenize.

- [ ] **Step 1: Add bark entries to frame-sources.json**

Extract each bark's `text` and add as a frame source entry. Category format: `"bark_<trigger>"`. ID format: `"bark_<trigger>_<index>"`. Barks have no slots.

Example entries to add (showing first 2 from onHit, do all triggers):
```json
{ "id": "bark_onHit_0", "category": "bark_onHit", "raw": "いたい！", "slots": [] },
{ "id": "bark_onHit_1", "category": "bark_onHit", "raw": "つよい！", "slots": [] }
```

All bark triggers to migrate: `onHit` (10), `onVictory` (10), `onExplore` (10), `onHeal` (6), `onKO` (6), `onStatusEffect` (6), `onLowHP` (6), `onAttack` (9) = 63 entries total.

- [ ] **Step 2: Verify frame-sources.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/dialogue/frame-sources.json')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add data/dialogue/frame-sources.json
git commit -m "data: add bark raw text to frame-sources.json"
```

### Task 2: Extract CID script lines into frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`
- Reference: `data/dialogue/cid-scripts.json`

CID scripts are arrays of `{ id, lines: [{ text, _tokens, _contentWords }] }`. Each line becomes a separate frame source entry. Category: `"cid"`. ID: `"cid_<scriptId>_<lineIndex>"` (e.g. `"cid_cid-welcome-0_0"`).

CID scripts have a grouping concept — lines within the same script must all be eligible together (all-or-nothing). We need to preserve this grouping. Add a `"group"` field to each entry matching the script ID.

- [ ] **Step 1: Add CID entries to frame-sources.json**

Example entries:
```json
{ "id": "cid_cid-welcome-0_0", "category": "cid", "group": "cid-welcome-0", "raw": "こんにちは！鳥！犬！", "slots": [] },
{ "id": "cid_cid-welcome-0_1", "category": "cid", "group": "cid-welcome-0", "raw": "火！風！水！", "slots": [] },
{ "id": "cid_cid-welcome-0_2", "category": "cid", "group": "cid-welcome-0", "raw": "飛ぶ！守る！", "slots": [] }
```

15 scripts × 3 lines = 45 entries total.

- [ ] **Step 2: Verify frame-sources.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/dialogue/frame-sources.json')); console.log('OK')"`

- [ ] **Step 3: Commit**

```bash
git add data/dialogue/frame-sources.json
git commit -m "data: add CID script lines to frame-sources.json"
```

### Task 3: Extract NPC lines into frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`
- Reference: `data/dialogue/npc-lines.json`

NPC lines are keyed by NPC ID → slot → array of lines. Category: `"npc"`. ID: `"npc_<npcId>_<slot>_<index>"`. Add a `"group"` field with `"<npcId>_<slot>"` so the loader can reconstruct the per-NPC-per-slot grouping.

- [ ] **Step 1: Add NPC line entries to frame-sources.json**

Example entries:
```json
{ "id": "npc_kodomo_shopGreeting_0", "category": "npc", "group": "kodomo_shopGreeting", "raw": "こんにちは！", "slots": [] },
{ "id": "npc_kodomo_shopGreeting_1", "category": "npc", "group": "kodomo_shopGreeting", "raw": "こんにちは！あそぶ？", "slots": [] }
```

4 NPCs × 3 slots × ~4-6 lines each ≈ 56 entries total.

- [ ] **Step 2: Verify frame-sources.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/dialogue/frame-sources.json')); console.log('OK')"`

- [ ] **Step 3: Commit**

```bash
git add data/dialogue/frame-sources.json
git commit -m "data: add NPC lines to frame-sources.json"
```

### Task 4: Add befriend prompt i+1 ladders to frame-sources.json

**Files:**
- Modify: `data/dialogue/frame-sources.json`

Author 5 variants per prompt, forming an i+1 ladder. Each variant adds one content word.

- [ ] **Step 1: Author befriend_wait variants**

Use JPDB frequency lookup to pick high-value words. Example ladder:
```json
{ "id": "befriend_wait_0", "category": "befriend_wait", "raw": "まって！", "slots": [] },
{ "id": "befriend_wait_1", "category": "befriend_wait", "raw": "ちょっとまって！", "slots": [] },
{ "id": "befriend_wait_2", "category": "befriend_wait", "raw": "ちょっとまってください！", "slots": [] },
{ "id": "befriend_wait_3", "category": "befriend_wait", "raw": "おねがい、ちょっとまってください！", "slots": [] },
{ "id": "befriend_wait_4", "category": "befriend_wait", "raw": "おねがい、もうすこしまってください！", "slots": [] }
```

Finalize exact words during implementation with `/jpdb-frequency-lookup` skill.

- [ ] **Step 2: Author befriend_name_question variants**

Example ladder:
```json
{ "id": "befriend_name_0", "category": "befriend_name", "raw": "なまえは？", "slots": [] },
{ "id": "befriend_name_1", "category": "befriend_name", "raw": "ぼくのなまえは？", "slots": [] },
{ "id": "befriend_name_2", "category": "befriend_name", "raw": "ぼくのなまえ、わかる？", "slots": [] },
{ "id": "befriend_name_3", "category": "befriend_name", "raw": "ぼくのなまえ、おぼえてる？", "slots": [] },
{ "id": "befriend_name_4", "category": "befriend_name", "raw": "ぼくのなまえ、おぼえてくれた？", "slots": [] }
```

Finalize exact words during implementation with `/jpdb-frequency-lookup` skill.

- [ ] **Step 3: Verify frame-sources.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/dialogue/frame-sources.json')); console.log('OK')"`

- [ ] **Step 4: Commit**

```bash
git add data/dialogue/frame-sources.json
git commit -m "data: add befriend prompt i+1 ladders to frame-sources.json"
```

### Task 5: Update tokenize-static.js to preserve group field

**Files:**
- Modify: `scripts/tokenize-static.js:157-164`
- Test: `tests/unit/tokenize-static.test.js`

The build script currently outputs `{id, category, raw, tokens, words}`. It needs to also pass through the `group` field for CID scripts and NPC lines.

- [ ] **Step 1: Write failing test**

Add to `tests/unit/tokenize-static.test.js`:
```javascript
it('preserves group field on CID and NPC frames', () => {
  const cidFrame = frames.find(f => f.category === 'cid');
  if (cidFrame) {
    assert.ok(cidFrame.group, `CID frame ${cidFrame.id} should have group field`);
  }
  const npcFrame = frames.find(f => f.category === 'npc');
  if (npcFrame) {
    assert.ok(npcFrame.group, `NPC frame ${npcFrame.id} should have group field`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "preserves group"`
Expected: FAIL (group field not in output)

- [ ] **Step 3: Update build script to pass through group**

In `scripts/tokenize-static.js`, modify the final output mapping (~line 158):
```javascript
const frames = sources.map((source, idx) => {
  const frame = {
    id: source.id,
    category: source.category,
    raw: source.raw,
    tokens: frameTokens[idx].tokens,
    words: frameTokens[idx].words,
  };
  if (source.group) frame.group = source.group;
  return frame;
});
```

- [ ] **Step 4: Rebuild frames.json**

Run: `node scripts/tokenize-static.js`
Expected: `Wrote N frames to data/dialogue/frames.json` (N should be ~180+ with all new entries)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- --test-name-pattern "preserves group"`
Expected: PASS

- [ ] **Step 6: Run full tokenize-static tests**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static"`
Expected: All pass (existing tests still pass with new frame categories)

- [ ] **Step 7: Commit**

```bash
git add scripts/tokenize-static.js data/dialogue/frame-sources.json data/dialogue/frames.json tests/unit/tokenize-static.test.js
git commit -m "feat: rebuild frames.json with barks, CID, NPC, befriend entries"
```

### Task 6: Add tokenize-static tests for new categories

**Files:**
- Modify: `tests/unit/tokenize-static.test.js`

- [ ] **Step 1: Add tests for bark frames**

```javascript
it('bark frames have correct category prefix and no slots', () => {
  const barks = frames.filter(f => f.category.startsWith('bark_'));
  assert.ok(barks.length >= 60, `expected at least 60 bark frames, got ${barks.length}`);
  for (const frame of barks) {
    const slots = frame.tokens.filter(t => t.slot);
    assert.equal(slots.length, 0, `bark frame ${frame.id} should have no slots`);
  }
});
```

- [ ] **Step 2: Add tests for CID frames**

```javascript
it('CID frames have group field matching script ID', () => {
  const cids = frames.filter(f => f.category === 'cid');
  assert.ok(cids.length >= 45, `expected at least 45 CID frames, got ${cids.length}`);
  for (const frame of cids) {
    assert.ok(frame.group, `CID frame ${frame.id} should have group`);
    assert.ok(frame.id.startsWith('cid_'), `CID frame ${frame.id} should start with cid_`);
  }
});
```

- [ ] **Step 3: Add tests for NPC frames**

```javascript
it('NPC frames have group field matching npc_slot pattern', () => {
  const npcs = frames.filter(f => f.category === 'npc');
  assert.ok(npcs.length >= 50, `expected at least 50 NPC frames, got ${npcs.length}`);
  for (const frame of npcs) {
    assert.ok(frame.group, `NPC frame ${frame.id} should have group`);
    assert.ok(frame.group.includes('_'), `NPC frame group ${frame.group} should have npcId_slot format`);
  }
});
```

- [ ] **Step 4: Add tests for befriend frames**

```javascript
it('befriend_wait has 5 i+1 ladder frames', () => {
  const waits = frames.filter(f => f.category === 'befriend_wait');
  assert.equal(waits.length, 5, `expected 5 befriend_wait frames, got ${waits.length}`);
  // Check i+1 ladder: each adds one word
  for (let i = 1; i < waits.length; i++) {
    assert.ok(waits[i].words.length >= waits[i - 1].words.length,
      `befriend_wait_${i} should have >= words than befriend_wait_${i - 1}`);
  }
});

it('befriend_name has 5 i+1 ladder frames', () => {
  const names = frames.filter(f => f.category === 'befriend_name');
  assert.equal(names.length, 5, `expected 5 befriend_name frames, got ${names.length}`);
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test:unit -- --test-name-pattern "tokenize-static"`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add tests/unit/tokenize-static.test.js
git commit -m "test: add tokenize-static tests for bark, CID, NPC, befriend frames"
```

---

## Chunk 2: Server-Side — dialogue-loader.js Rewrite

Replace the multi-file loader with a single `frames.json` reader that partitions by category.

### Task 7: Rewrite dialogue-loader.js to load from frames.json

**Files:**
- Modify: `src/game/dialogue-loader.js`
- Test: `tests/unit/dialogue-loader.test.js` (new)

The current loader reads 3 separate files. The new loader reads `frames.json` once and partitions by category prefix. It also consolidates `getShopFrames()` and `getGreetingFrames()` (currently in `src/routes/game/run.js:34-51`).

- [ ] **Step 1: Write failing test for new loader API**

Create `tests/unit/dialogue-loader.test.js`:
```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDialoguePools,
  getBarkPool,
  getCidScripts,
  getNpcLines,
  getShopFrames,
  getGreetingFrames,
  getBefriendFrames,
  getDialogueWordSet,
} from '../../src/game/dialogue-loader.js';

describe('dialogue-loader (frames.json)', () => {
  beforeEach(() => {
    loadDialoguePools(process.cwd() + '/data');
  });

  it('getBarkPool returns barks grouped by trigger', () => {
    const pool = getBarkPool();
    assert.ok(pool.onHit, 'should have onHit trigger');
    assert.ok(pool.onVictory, 'should have onVictory trigger');
    assert.ok(Array.isArray(pool.onHit));
    assert.ok(pool.onHit.length >= 10);
    // Each bark should have universal format
    const bark = pool.onHit[0];
    assert.ok(Array.isArray(bark.tokens), 'bark should have tokens array');
    assert.ok(Array.isArray(bark.words), 'bark should have words array');
    assert.ok(bark.raw, 'bark should have raw text');
  });

  it('getCidScripts returns scripts grouped by script ID', () => {
    const scripts = getCidScripts();
    assert.ok(Array.isArray(scripts));
    assert.ok(scripts.length >= 15);
    const script = scripts[0];
    assert.ok(script.id, 'script should have id');
    assert.ok(Array.isArray(script.lines), 'script should have lines array');
    // Each line should have universal format
    const line = script.lines[0];
    assert.ok(Array.isArray(line.tokens), 'line should have tokens');
    assert.ok(Array.isArray(line.words), 'line should have words');
  });

  it('getNpcLines returns lines grouped by NPC and slot', () => {
    const npcLines = getNpcLines();
    assert.ok(npcLines.kodomo, 'should have kodomo NPC');
    assert.ok(npcLines.kodomo.shopGreeting, 'kodomo should have shopGreeting');
    assert.ok(Array.isArray(npcLines.kodomo.shopGreeting));
    const line = npcLines.kodomo.shopGreeting[0];
    assert.ok(Array.isArray(line.tokens), 'line should have tokens');
    assert.ok(Array.isArray(line.words), 'line should have words');
  });

  it('getShopFrames returns shop category frames', () => {
    const frames = getShopFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 3);
    assert.ok(frames.every(f => f.category === 'shop'));
  });

  it('getGreetingFrames returns greeting category frames', () => {
    const frames = getGreetingFrames();
    assert.ok(Array.isArray(frames));
    assert.ok(frames.length >= 5);
    assert.ok(frames.every(f => f.category === 'greeting'));
  });

  it('getBefriendFrames returns frames grouped by prompt type', () => {
    const frames = getBefriendFrames();
    assert.ok(frames.wait, 'should have wait prompts');
    assert.ok(frames.name, 'should have name prompts');
    assert.ok(frames.wait.length === 5);
    assert.ok(frames.name.length === 5);
  });

  it('getDialogueWordSet returns all content words across all frames', () => {
    const words = getDialogueWordSet();
    assert.ok(words instanceof Set);
    assert.ok(words.size > 0);
    // Should include known words from various categories
    assert.ok(words.has('こんにちは'), 'should include こんにちは from greetings');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "dialogue-loader"`
Expected: FAIL (old exports don't match new API)

- [ ] **Step 3: Implement new dialogue-loader.js**

Replace `src/game/dialogue-loader.js` with:
```javascript
// src/game/dialogue-loader.js
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let _frames = [];
let _barkPool = {};
let _cidScripts = [];
let _npcLines = {};
let _shopFrames = [];
let _greetingFrames = [];
let _befriendFrames = {};

export function loadDialoguePools(dataDir) {
  const framesPath = join(dataDir, 'dialogue', 'frames.json');
  if (!existsSync(framesPath)) {
    console.warn('[Dialogue] frames.json not found');
    return;
  }
  _frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
  console.log(`[Dialogue] Loaded ${_frames.length} frames from frames.json`);

  // Partition by category
  _shopFrames = _frames.filter(f => f.category === 'shop');
  _greetingFrames = _frames.filter(f => f.category === 'greeting');

  // Barks: category "bark_<trigger>" → grouped by trigger
  _barkPool = {};
  for (const f of _frames) {
    if (!f.category.startsWith('bark_')) continue;
    const trigger = f.category.slice(5); // "bark_onHit" → "onHit"
    if (!_barkPool[trigger]) _barkPool[trigger] = [];
    _barkPool[trigger].push(f);
  }

  // CID scripts: category "cid", grouped by group field
  const cidByGroup = {};
  for (const f of _frames) {
    if (f.category !== 'cid') continue;
    const group = f.group || f.id;
    if (!cidByGroup[group]) cidByGroup[group] = [];
    cidByGroup[group].push(f);
  }
  _cidScripts = Object.entries(cidByGroup).map(([id, lines]) => ({ id, lines }));

  // NPC lines: category "npc", grouped by group field "<npcId>_<slot>"
  _npcLines = {};
  for (const f of _frames) {
    if (f.category !== 'npc') continue;
    const group = f.group || '';
    const sepIdx = group.indexOf('_');
    if (sepIdx < 0) continue;
    const npcId = group.slice(0, sepIdx);
    const slot = group.slice(sepIdx + 1);
    if (!_npcLines[npcId]) _npcLines[npcId] = {};
    if (!_npcLines[npcId][slot]) _npcLines[npcId][slot] = [];
    _npcLines[npcId][slot].push(f);
  }

  // Befriend frames: category "befriend_wait" and "befriend_name"
  _befriendFrames = {
    wait: _frames.filter(f => f.category === 'befriend_wait'),
    name: _frames.filter(f => f.category === 'befriend_name'),
  };
}

export function getBarkPool() { return _barkPool; }
export function getCidScripts() { return _cidScripts; }
export function getNpcLines() { return _npcLines; }
export function getShopFrames() { return _shopFrames; }
export function getGreetingFrames() { return _greetingFrames; }
export function getBefriendFrames() { return _befriendFrames; }

export function getDialogueWordSet() {
  const words = new Set();
  for (const frame of _frames) {
    for (const w of (frame.words || [])) words.add(w);
  }
  return words;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- --test-name-pattern "dialogue-loader"`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/game/dialogue-loader.js tests/unit/dialogue-loader.test.js
git commit -m "feat: rewrite dialogue-loader to load all pools from frames.json"
```

### Task 8: Update run.js to use dialogue-loader for shop/greeting frames

**Files:**
- Modify: `src/routes/game/run.js:33-51`

Remove the local `getShopFrames()` and `getGreetingFrames()` functions and import from `dialogue-loader.js`.

- [ ] **Step 1: Replace local frame loaders with imports**

At the top of `src/routes/game/run.js`, add import:
```javascript
import { getShopFrames, getGreetingFrames } from '../../game/dialogue-loader.js';
```

Remove lines 33-51 (the local `_shopFrames`, `getShopFrames`, `_greetingFrames`, `getGreetingFrames` functions).

- [ ] **Step 2: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "refactor: use dialogue-loader for shop/greeting frames in run.js"
```

---

## Chunk 3: Server-Side — dialogue-filter.js Migration

Migrate `dialogue-filter.js` from old `_tokens`/`baseForm` format to universal `tokens`/`base` format. Delegate i+1 gating to `token-format.js`.

### Task 9: Migrate dialogue-filter.js to universal format

**Files:**
- Modify: `src/game/dialogue-filter.js`
- Modify: `tests/unit/dialogue-filter.test.js`

- [ ] **Step 1: Update test helpers to universal format**

In `tests/unit/dialogue-filter.test.js`, replace the old test helpers:

Old:
```javascript
const tok = (surface, baseForm, pos = '名詞') => ({ surface, baseForm, pos, reading: '' });
const punct = (ch) => ({ surface: ch, baseForm: ch, pos: '記号', reading: '' });
const line = (text, tokenDefs) => ({
  text,
  _tokens: tokenDefs,
  _contentWords: tokenDefs.filter(t => t.pos !== '記号').map(t => t.baseForm),
});
```

New:
```javascript
// Universal format: content tokens have `base`, punctuation tokens don't
const tok = (surface, base) => ({ surface, base, reading: '', meaning: '' });
const punct = (ch) => ({ surface: ch });
const line = (text, tokenDefs) => ({
  raw: text,
  tokens: tokenDefs,
  words: tokenDefs.filter(t => t.base).map(t => t.base),
});
```

Update all test calls to use new signature — `tok('痛い', '痛い')` instead of `tok('痛い', '痛い', '形容詞')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --test-name-pattern "dialogue-filter"`
Expected: FAIL (tests use new format but code still reads old format)

- [ ] **Step 3: Rewrite dialogue-filter.js**

Replace `src/game/dialogue-filter.js`:
```javascript
/**
 * Word-gated dialogue filtering and selection.
 * Uses isEligible from token-format.js for i+1 rule.
 */
import { isEligible } from './token-format.js';

export function isLineEligible(line, knownWords) {
  return isEligible(line.tokens || [], knownWords);
}

function teachingWordCount(line, knownWords) {
  return (line.tokens || [])
    .filter(t => t.base)
    .filter(t => !knownWords.has(t.base))
    .length;
}

export function filterEligibleScripts(scripts, knownWords) {
  return scripts.filter(script =>
    script.lines.every(line => isLineEligible(line, knownWords))
  );
}

export function selectCidScript(eligible, knownWords, seenScriptIds = []) {
  if (eligible.length === 0) return null;
  const seenSet = new Set(seenScriptIds);
  const scored = eligible.map(script => {
    const totalTeaching = script.lines.reduce(
      (sum, line) => sum + teachingWordCount(line, knownWords), 0
    );
    const wasSeen = seenSet.has(script.id);
    const seenIndex = seenScriptIds.indexOf(script.id);
    return { script, totalTeaching, wasSeen, seenIndex };
  });
  scored.sort((a, b) => {
    if (a.wasSeen !== b.wasSeen) return a.wasSeen ? 1 : -1;
    if (a.totalTeaching !== b.totalTeaching) return b.totalTeaching - a.totalTeaching;
    if (a.wasSeen && b.wasSeen) return a.seenIndex - b.seenIndex;
    return 0;
  });
  return scored[0].script;
}

export function selectNpcLine(lines, knownWords, options = {}) {
  const { lastSeenText, curriculumWords = [] } = options;
  const eligible = lines.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;
  const curriculumSet = new Set(curriculumWords);
  const teaching = eligible.filter(line =>
    (line.tokens || []).filter(t => t.base).some(t => !knownWords.has(t.base) && curriculumSet.has(t.base))
  );
  const pool = teaching.length > 0 ? teaching : eligible;
  const nonRepeat = pool.filter(l => l.raw !== lastSeenText);
  const finalPool = nonRepeat.length > 0 ? nonRepeat : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function selectBark(barkPool, trigger, knownWords, options = {}) {
  const { usedThisCombat = new Set() } = options;
  const pool = barkPool[trigger];
  if (!pool || pool.length === 0) return null;
  const eligible = pool.filter(line => isLineEligible(line, knownWords));
  if (eligible.length === 0) return null;
  const getContentTokens = (line) => (line.tokens || []).filter(t => t.base);
  const reinforcement = eligible.filter(line =>
    getContentTokens(line).every(t => knownWords.has(t.base))
  );
  const teachable = eligible.filter(line =>
    getContentTokens(line).some(t => !knownWords.has(t.base))
  );
  const useTeaching = teachable.length > 0 && Math.random() < 0.2;
  const selectedPool = useTeaching ? teachable : (reinforcement.length > 0 ? reinforcement : eligible);
  const nonRepeat = selectedPool.filter(l => !usedThisCombat.has(l.raw));
  const finalPool = nonRepeat.length > 0 ? nonRepeat : selectedPool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
```

Key changes:
- `_tokens` → `tokens`, `baseForm` → `base`, `_contentWords` → `words`
- `text` → `raw` (matches frames.json field name)
- `isLineEligible` delegates to `isEligible` from `token-format.js`
- Removed `isPunctuation`, `PUNCT_POS`, `splitIntoSentences` (all handled by `isEligible`)
- `selectNpcLine` and `selectBark` use `l.raw` instead of `l.text` for deduplication

- [ ] **Step 4: Update test dedup assertions**

In `selectNpcLine` test, `lastSeenText` now matches against `line.raw` instead of `line.text`. Update the test line helper if tests reference `.text`.

- [ ] **Step 5: Update integration test**

In `tests/integration/dialogue-bootstrap.test.js`, update the line construction (~line 29) from:
```javascript
const line = { text: 'こんにちは！', _tokens: tokens, _contentWords: contentWords };
```
to:
```javascript
const line = { raw: 'こんにちは！', tokens: tokens.map(t => {
  if (/^[\p{P}\p{S}\s]+$/u.test(t.surface)) return { surface: t.surface };
  return { surface: t.surface, base: t.baseForm, reading: t.reading, meaning: '' };
}), words: contentWords };
```

- [ ] **Step 6: Run unit + integration tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/game/dialogue-filter.js tests/unit/dialogue-filter.test.js tests/integration/dialogue-bootstrap.test.js
git commit -m "refactor: migrate dialogue-filter to universal token format"
```

### Task 9b: Update combat.js NPC dialogue mapLine

**Files:**
- Modify: `src/routes/game/combat.js:82-100`

The `mapLine` function reads `l.text` and `l._tokens` (old format). After Task 7, `getNpcLines()` returns frames with `raw`, `tokens`, `words` (universal format). Must update.

- [ ] **Step 1: Update mapLine to read universal format**

At lines 82-86 of `src/routes/game/combat.js`, change:
```javascript
const mapLine = (l) => l ? {
  text: l.text,
  tokens: l._tokens || [],
  overrides: l.overrides || {},
} : null;
```
to:
```javascript
const mapLine = (l) => l ? {
  text: l.raw,
  tokens: l.tokens || [],
  overrides: {},
} : null;
```

- [ ] **Step 2: Update word exposure to use `words` array**

At lines 94-99, change:
```javascript
if (line && line._contentWords) {
  for (const w of line._contentWords) {
    dialogueWords.push({ word: w, meaning: '' });
  }
}
```
to:
```javascript
if (line && line.words) {
  for (const w of line.words) {
    const token = (line.tokens || []).find(t => t.base === w);
    dialogueWords.push({ word: w, meaning: token?.meaning || '' });
  }
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "refactor: combat.js NPC dialogue uses universal token format"
```

---

## Chunk 4: Server-Side — loop.js and Befriend Quiz

Update bark sending format in loop.js and add befriend prompt selection to the quiz route.

### Task 10: Update loop.js bark sending to universal format

**Files:**
- Modify: `src/game/loop.js:800-812`

- [ ] **Step 1: Update bark push to use universal fields**

At line 802, change:
```javascript
barks.push({ trigger, text: bark.text, _tokens: bark._tokens || [], _contentWords: bark._contentWords || [] });
```
to:
```javascript
barks.push({ trigger, text: bark.raw, tokens: bark.tokens || [], words: bark.words || [] });
```

At line 804, change:
```javascript
for (const w of (bark._contentWords || [])) {
```
to:
```javascript
for (const w of (bark.words || [])) {
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "refactor: send barks in universal token format from loop.js"
```

### Task 11: Add befriend prompt selection to loop.js

**Files:**
- Modify: `src/game/loop.js:843-870`

When the befriend quiz is triggered, select i+1 eligible prompts from the befriend frame pools and attach them to the quiz data sent to the client.

- [ ] **Step 1: Add import for getBefriendFrames**

At the top of `src/game/loop.js`, add to existing dialogue-loader imports:
```javascript
import { getBarkPool, getBefriendFrames } from './dialogue-loader.js';
```

Also add this import (not currently in loop.js):
```javascript
import { isEligible, scoreCandidate } from './token-format.js';
```

- [ ] **Step 2: Add prompt selection before befriendQuiz response**

After `const quiz = generateBefriendQuiz(...)` (~line 843), add befriend prompt selection:

```javascript
// Select best befriend prompts via i+1
const befriendFrames = getBefriendFrames();
const knownSet = new Set(getKnownWordsFromFsrs(this.userId));

function selectBestFrame(pool, known) {
  const eligible = pool.filter(f => isEligible(f.tokens, known));
  if (eligible.length === 0) return pool[0] || null; // fallback to simplest
  eligible.sort((a, b) => scoreCandidate(b.tokens, known) - scoreCandidate(a.tokens, known));
  return eligible[0];
}

const waitPrompt = selectBestFrame(befriendFrames.wait, knownSet);
const namePrompt = selectBestFrame(befriendFrames.name, knownSet);
```

- [ ] **Step 3: Attach prompts to befriendQuiz response**

In the `befriendQuiz` object sent to client (~line 864), add:
```javascript
befriendQuiz: {
  targetIndex,
  creatureId: lastKilled.id,
  creatureName: lastKilled.name,
  creatureNameEn: lastKilled.nameEn,
  options: quiz.options.map(o => ({ id: o.id, name: o.name })),
  waitPrompt: waitPrompt ? { tokens: waitPrompt.tokens, words: waitPrompt.words } : null,
  namePrompt: namePrompt ? { tokens: namePrompt.tokens, words: namePrompt.words } : null,
}
```

- [ ] **Step 4: Expose befriend prompt words to SRS**

After the prompt selection, expose words:
```javascript
const befriendWords = [
  ...(waitPrompt?.words || []),
  ...(namePrompt?.words || []),
].map(w => {
  const token = [...(waitPrompt?.tokens || []), ...(namePrompt?.tokens || [])].find(t => t.base === w);
  return { word: w, meaning: token?.meaning || '' };
});
if (befriendWords.length > 0) this.exposeWords(befriendWords);
```

- [ ] **Step 5: Syntax check**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: select i+1 befriend prompts and attach to quiz response"
```

---

## Chunk 5: Frontend — Client-side entityToToken and renderJpFirst Removal

Add client-side `entityToToken()`, migrate all `renderJpFirst()` callsites, then remove `renderJpFirst()`.

### Task 12: Add client-side entityToToken to bootstrap-client.js

**Files:**
- Modify: `public/js/ui/bootstrap-client.js`

- [ ] **Step 1: Add entityToToken export**

Add after the `renderJpSentence` function in `bootstrap-client.js`:

```javascript
/**
 * Convert a game entity to a universal token for rendering.
 * Works with moves, items, creatures, NPC roles, speakers — anything with
 * name/word + reading + nameEn/meaning fields.
 */
export function entityToToken(entity) {
  const surface = entity.word || entity.baseWord || entity.name;
  const reading = entity.reading || entity.baseReading;
  const meaning = entity.nameEn || entity.baseMeaning || entity.meaning;
  return { surface, base: surface, reading, meaning, entity: true };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/bootstrap-client.js
git commit -m "feat: add client-side entityToToken to bootstrap-client.js"
```

### Task 13: Migrate move-select.js

**Files:**
- Modify: `public/js/ui/move-select.js:5,57`

- [ ] **Step 1: Update import**

Change line 5:
```javascript
import { renderJpFirst } from './bootstrap-client.js';
```
to:
```javascript
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
```

- [ ] **Step 2: Update move name rendering**

Change line 57:
```javascript
const moveNameHtml = renderJpFirst(move.name, move.reading, move.nameEn);
```
to:
```javascript
const token = entityToToken(move);
const moveNameHtml = renderJpSentence([token], getKnownWords(), new Map());
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/move-select.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/move-select.js
git commit -m "refactor: move-select uses entityToToken + renderJpSentence"
```

### Task 14: Migrate combat-loop.js move help popup

**Files:**
- Modify: `public/js/ui/combat-loop.js:32,743`

- [ ] **Step 1: Update import**

At line 32, change:
```javascript
import { renderJpFirst, renderEnFirst } from './bootstrap-client.js';
```
to:
```javascript
import { renderJpSentence, renderEnFirst, getKnownWords, entityToToken } from './bootstrap-client.js';
```

- [ ] **Step 2: Update move name in help popup**

At line 743, change:
```javascript
const moveNameHtml = renderJpFirst(move.name, move.reading, move.meaning);
```
to:
```javascript
const token = entityToToken({ name: move.name, reading: move.reading, nameEn: move.meaning });
const moveNameHtml = renderJpSentence([token], getKnownWords(), new Map());
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "refactor: combat-loop move help uses entityToToken + renderJpSentence"
```

### Task 15: Migrate combat-loop.js befriend quiz prompts

**Files:**
- Modify: `public/js/ui/combat-loop.js:2911,2961`

- [ ] **Step 1: Update renderBefriendQuiz to use server-provided prompts**

At line 2911, change:
```javascript
await narration.showNarration('まって！！', { speaker: creatureSpeaker });
```
to:
```javascript
if (quizData.waitPrompt) {
  const waitHtml = renderJpSentence(quizData.waitPrompt.tokens, getKnownWords(), new Map());
  await narration.showNarration(waitHtml, { speaker: creatureSpeaker, html: true });
} else {
  await narration.showNarration('まって！！', { speaker: creatureSpeaker });
}
```

At line 2961, change:
```javascript
await narration.showNarration('なまえは？', { speaker: creatureSpeaker });
```
to:
```javascript
if (quizData.namePrompt) {
  const nameHtml = renderJpSentence(quizData.namePrompt.tokens, getKnownWords(), new Map());
  await narration.showNarration(nameHtml, { speaker: creatureSpeaker, html: true });
} else {
  await narration.showNarration('なまえは？', { speaker: creatureSpeaker });
}
```

The fallbacks are temporary safety nets — once the server always provides prompts, these `else` branches become dead code.

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: render befriend quiz prompts via universal tokens"
```

### Task 16: Migrate scene.js

**Files:**
- Modify: `public/js/ui/scene.js:39,418,449`

- [ ] **Step 1: Update import**

Change line 39:
```javascript
import { renderJpFirst, esc as escHtml } from './bootstrap-client.js';
```
to:
```javascript
import { renderJpSentence, getKnownWords, entityToToken, esc as escHtml } from './bootstrap-client.js';
```

- [ ] **Step 2: Update NPC role rendering (line 418)**

Change:
```javascript
? ' \u2014 ' + renderJpFirst(npc.role.word, npc.role.reading, npc.role.meaning)
```
to:
```javascript
? ' \u2014 ' + renderJpSentence([entityToToken(npc.role)], getKnownWords(), new Map())
```

Note: `npc.role` has `{ word, reading, meaning }` — `entityToToken` maps `word` → `surface`.

- [ ] **Step 3: Update NPC skill pill rendering (line 449)**

Change:
```javascript
pill.innerHTML = renderJpFirst(skill.name, skill.reading, skill.nameEn);
```
to:
```javascript
pill.innerHTML = renderJpSentence([entityToToken(skill)], getKnownWords(), new Map());
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "refactor: scene.js uses entityToToken + renderJpSentence for NPC display"
```

### Task 17: Migrate creature-row.js and pvp-lobby.js

**Files:**
- Modify: `public/js/ui/creature-row.js:21,191-194`
- Modify: `public/js/ui/pvp-lobby.js:28,66-69`

These two files have the same creature popup subtitle pattern. Migrate both for PvE/PvP parity.

- [ ] **Step 1: Update creature-row.js import**

Change line 21:
```javascript
import { renderJpFirst } from './bootstrap-client.js';
```
to:
```javascript
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
```

- [ ] **Step 2: Update creature-row.js subtitle rendering (lines 191-194)**

Change:
```javascript
? renderJpFirst(creature.modifier.word, creature.modifier.reading, creature.modifier.meaning)
```
to:
```javascript
? renderJpSentence([entityToToken(creature.modifier)], getKnownWords(), new Map())
```

Change:
```javascript
+ renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning)
: renderJpFirst(creature.baseWord, creature.baseReading, creature.baseMeaning);
```
to:
```javascript
+ renderJpSentence([entityToToken({ word: creature.baseWord, reading: creature.baseReading, nameEn: creature.baseMeaning })], getKnownWords(), new Map())
: renderJpSentence([entityToToken({ word: creature.baseWord, reading: creature.baseReading, nameEn: creature.baseMeaning })], getKnownWords(), new Map());
```

- [ ] **Step 3: Update pvp-lobby.js — same pattern**

Change line 28 import, then lines 66-69 with the same substitutions as creature-row.js.

- [ ] **Step 4: Syntax check both files**

Run: `node --check public/js/ui/creature-row.js && node --check public/js/ui/pvp-lobby.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/creature-row.js public/js/ui/pvp-lobby.js
git commit -m "refactor: creature popup subtitle uses entityToToken + renderJpSentence"
```

### Task 18: Migrate move-learn.js, post-combat-shop.js, narration-box.js

**Files:**
- Modify: `public/js/ui/move-learn.js:7,27,98`
- Modify: `public/js/ui/post-combat-shop.js:18,57,74`
- Modify: `public/js/ui/narration-box.js:29,210`

All follow the same pattern: replace import, replace `renderJpFirst(name, reading, en)` with `renderJpSentence([entityToToken(...)], getKnownWords(), new Map())`.

- [ ] **Step 1: Migrate move-learn.js**

Update import (line 7), line 27, and line 98 to use `entityToToken(move)` pattern.

- [ ] **Step 2: Migrate post-combat-shop.js**

Update import (line 18), line 57, and line 74 to use `entityToToken(item)` pattern.

- [ ] **Step 3: Migrate narration-box.js**

Update import (line 29). At line 210, change:
```javascript
speakerEl.innerHTML = renderJpFirst(speaker.name, speaker.reading, speaker.meaning);
```
to:
```javascript
speakerEl.innerHTML = renderJpSentence([entityToToken(speaker)], getKnownWords(), new Map());
```

- [ ] **Step 4: Syntax check all three files**

Run: `node --check public/js/ui/move-learn.js && node --check public/js/ui/post-combat-shop.js && node --check public/js/ui/narration-box.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/move-learn.js public/js/ui/post-combat-shop.js public/js/ui/narration-box.js
git commit -m "refactor: move-learn, post-combat-shop, narration-box use universal tokens"
```

### Task 19: Migrate speech-bubble.js

**Files:**
- Modify: `public/js/ui/speech-bubble.js:15,59-83,120-125,28-42`

- [ ] **Step 1: Update import**

Change line 15:
```javascript
import { renderJpFirst, renderJpSentence, getKnownWords } from './bootstrap-client.js';
```
to:
```javascript
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
```

- [ ] **Step 2: Simplify showBubble — always render universal tokens**

Replace the dual-path rendering in `showBubble` (lines 68-83) with:
```javascript
const knownWords = getKnownWords();
const dict = window.gameState?.wordDictionary || {};
const dictMap = dict instanceof Map ? dict : new Map(Object.entries(dict));
bubble.innerHTML = renderJpSentence(
  phrase.tokens || [],
  knownWords,
  dictMap,
  {},
  false
);
```

- [ ] **Step 3: Update findServerBark to return universal format**

At line 120-125, change:
```javascript
return { ...bark, isTokenized: true };
```
to:
```javascript
return bark;
```

- [ ] **Step 4: Remove legacy phrase code**

Delete `_phrases` variable (line 25), `getLegacyPhrases()` (lines 28-31), `pickLegacyPhrase()` (lines 33-41).

In the event handlers (lines 136-154), remove the `|| pickLegacyPhrase(...)` fallbacks:
```javascript
const bark = findServerBark('onHit');
```
(instead of `findServerBark('onHit') || pickLegacyPhrase('onHit')`)

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/speech-bubble.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/speech-bubble.js
git commit -m "refactor: speech-bubble always renders universal tokens, remove legacy path"
```

### Task 20: Remove renderJpFirst and clean up game.js import

**Files:**
- Modify: `public/js/ui/bootstrap-client.js:64-76`
- Modify: `public/game.js:116`

- [ ] **Step 1: Delete renderJpFirst from bootstrap-client.js**

Remove lines 64-76 (the `renderJpFirst` function).

- [ ] **Step 2: Remove from game.js import**

At line 116 of `public/game.js`, remove `renderJpFirst` from the import statement.

- [ ] **Step 3: Verify no remaining references**

Run: `grep -r "renderJpFirst" public/ --include="*.js"`
Expected: No results

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/bootstrap-client.js && node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/bootstrap-client.js public/game.js
git commit -m "chore: remove renderJpFirst — all rendering uses renderJpSentence"
```

---

## Chunk 6: Delete Old Data Files and Final Cleanup

### Task 21: Delete old dialogue data files

**Files:**
- Delete: `data/dialogue/barks.json`
- Delete: `data/dialogue/cid-scripts.json`
- Delete: `data/dialogue/npc-lines.json`

- [ ] **Step 1: Verify no code references old files**

Run: `grep -r "barks\.json\|cid-scripts\.json\|npc-lines\.json" src/ tests/ scripts/ --include="*.js"`
Expected: No results (all references now go through `frames.json` via `dialogue-loader.js`)

- [ ] **Step 2: Delete the files**

```bash
rm data/dialogue/barks.json data/dialogue/cid-scripts.json data/dialogue/npc-lines.json
```

- [ ] **Step 3: Commit**

```bash
git add -u data/dialogue/
git commit -m "chore: delete old dialogue data files — all data now in frames.json"
```

### Task 22: Update speech-bubble tests

**Files:**
- Modify: `tests/unit/ui/speech-bubble.test.js`

The speech-bubble test validates the old `creature-speech.json` format (fields: `jp`, `reading`, `en`, `romaji`). This file/format no longer exists. Update or remove these tests.

- [ ] **Step 1: Remove or update legacy creature-speech tests**

If `data/creature-speech.json` still exists, delete it. Update the test to validate bark data from `frames.json` instead — or remove the data validation tests entirely since `tokenize-static.test.js` already validates frame structure.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All Tier 1 + Tier 2 pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ui/speech-bubble.test.js
git commit -m "test: update speech-bubble tests for universal token format"
```

### Task 23: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All Tier 1 (unit) and Tier 2 (integration) tests pass

- [ ] **Step 2: Verify no old format references remain**

Run: `grep -rn "_tokens\|_contentWords\|baseForm\|renderJpFirst\|isTokenized" src/ public/ tests/ --include="*.js" | grep -v node_modules | grep -v "\.test\.js.*Old\|\.test\.js.*legacy"`
Expected: No results

- [ ] **Step 3: Verify frames.json has all categories**

Run: `node -e "const f=JSON.parse(require('fs').readFileSync('data/dialogue/frames.json'));const cats=[...new Set(f.map(x=>x.category))];console.log(cats.sort().join(', '));console.log('Total:',f.length)"`
Expected: Categories include `bark_onAttack, bark_onExplore, bark_onHeal, bark_onHit, bark_onKO, bark_onLowHP, bark_onStatusEffect, bark_onVictory, befriend_name, befriend_wait, cid, greeting, npc, shop` and total frame count ~180+.

- [ ] **Step 4: Commit any remaining fixes**

If any issues found, fix and commit individually.
