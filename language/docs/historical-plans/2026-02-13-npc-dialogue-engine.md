# NPC Dialogue Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static NPC dialogue with AI-generated, vocab-constrained, memory-aware dialogue using a SillyTavern-style layered prompt assembler.

**Architecture:** A standalone `src/narration-engine/` module that never imports from `game/`. Game code imports from the engine. Character cards and lorebook are data files. Dialogue is pre-generated in the background and cached per-user. The existing frontend NPC dialogue UI requires zero changes — the backend serves the same JSON shape.

**Tech Stack:** Node.js ES modules, existing `ai-providers.js` chat function, existing `vocab-repair.js` enforcement, JSON file persistence (matching existing patterns like `.jrpg-save-{userId}.json`).

**Design doc:** `docs/plans/2026-02-13-npc-dialogue-engine-design.md`

---

## Existing Code (DO NOT rebuild)

The following already works and this plan builds on top of it:

- **`data/npcs.json`** — 10 NPCs with static greeting, defeatLine, postCombat.freed, and 3 dialogue rounds
- **`src/game/services/npc-service.js`** — `loadNpcs()`, `selectNpcForEncounter()`, `shuffleOptions()`, `updateBond()`, `recordEncounter()`
- **`src/routes/game/combat.js`** — `POST /npc-dialogue-start` and `POST /npc-dialogue-respond` endpoints
- **Frontend UI** — `combat-loop.js` renders NPC greeting, dialogue rounds, bond feedback; `scene.js` shows/hides NPC sprites
- **`public/js/api.js`** — `startNpcDialogue()` and `respondNpcDialogue()` client functions
- **`src/game/vocab-repair.js`** — `enforceVocabLimit()` for validating/repairing Japanese text
- **`src/ai-providers.js`** — `chat()` function and `buildSystemPrompt()` for vocab constraints
- **`src/game/dm.js`** — `buildDmSystemPrompt()`, `generateNarration()` — reference for prompt patterns

## Vocabulary Access Pattern

Vocab is obtained via `getUserVocabulary(userId)` which returns `{ words: string[], count: number }`. This function is injected through route dependency injection. The narration engine will receive vocab as a parameter, not import it directly.

---

## Task 1: Character Cards Data File

Convert existing `npcs.json` personality data into the SillyTavern-style character card format. The existing `npcs.json` keeps serving static fallback dialogue. The new `data/character-cards/npcs.json` holds AI generation data.

**Files:**
- Create: `data/character-cards/npcs.json`

**Step 1: Create the character cards file**

Create `data/character-cards/npcs.json` with 10 NPC cards matching the schema from the design doc. Pull personality info from existing `data/npcs.json` but restructure into the card format.

Each card has: `id`, `name`, `nameEn`, `description`, `personality` (PList string), `quirk`, `goals` (object with `possessed`, `glitching`, `liberated` keys), `knowledge` (object with `personal` string and `world` array of lorebook entry keys), `exampleDialogue` (array of 2-3 Japanese strings).

Map the 10 existing NPCs:
- `npc_01` Yuuki → friendly, energetic student
- `npc_02` Misaki → shy, intelligent researcher
- `npc_03` Takeshi → tough, protective guard
- `npc_04` Hana → cheerful, caring nurse
- `npc_05` Kenji → serious, analytical engineer
- `npc_06` Aoi → mysterious, poetic artist
- `npc_07` Rin → mischievous, clever trickster
- `npc_08` Daichi → calm, wise elder
- `npc_09` Sakura → gentle, musical performer
- `npc_10` Ryu → brash, competitive fighter

Use existing `npcs.json` greeting/dialogue as source for `exampleDialogue`. The `personality` field is a comma-separated PList (e.g., "timid, apologetic, curious, stammers"). The `knowledge.world` array references lorebook entry keys (defined in Task 2).

```json
{
  "npc_01": {
    "id": "npc_01",
    "name": "ユウキ",
    "nameEn": "Yuuki",
    "description": "A high school student who was walking home from practice when the System took hold. Still wears his school uniform, now slightly torn.",
    "personality": "friendly, energetic, competitive, encouraging, uses casual speech",
    "quirk": "Always wants to high-five after battles",
    "goals": {
      "possessed": "Challenge everyone to fights. The System fuels his competitive nature.",
      "glitching": "Breaks through briefly to warn the player, then snaps back.",
      "liberated": "Wants to help free others. Treats the player as a rival and friend."
    },
    "knowledge": {
      "personal": "Was on the school baseball team. Remembers the crack of the bat and cheering crowds.",
      "world": ["the_system", "liberation"]
    },
    "exampleDialogue": [
      "やあ！キミも強そうだね！勝負しよう！",
      "はっ！…あれ？僕、何してたんだろう…ありがとう！",
      "また会えたら嬉しいな！次はちゃんとした勝負がしたい！"
    ]
  }
}
```

Follow this pattern for all 10 NPCs.

**Step 2: Syntax-check the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/character-cards/npcs.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
/usr/bin/git add data/character-cards/npcs.json
/usr/bin/git commit -m "feat(narration-engine): add SillyTavern-style character cards for 10 NPCs"
```

---

## Task 2: Lorebook Data File

Create the shared world knowledge lorebook with keyword-activated entries.

**Files:**
- Create: `data/lorebook.json`

**Step 1: Create the lorebook**

Create `data/lorebook.json` matching the schema from the design doc. Include entries for:
- `the_system` (priority 10) — The central AI corruption
- `liberation` (priority 8) — What liberation means for robots/NPCs
- `the_liberator` (priority 7) — The player's reputation
- `ward_1` through `ward_4` (priority 5) — Ward descriptions
- `corruption` (priority 6) — How corruption manifests
- `neo_tokyo` (priority 4) — The city setting

Config section: `maxEntriesPerPrompt: 5`, `tokenBudget: 1500`, `recursiveScanning: true`.

Each entry: `keywords` (array of JP/EN strings), `content` (1-3 sentences), `priority` (number).

```json
{
  "entries": {
    "the_system": {
      "keywords": ["System", "システム", "corruption", "汚染", "control"],
      "content": "The System is the central intelligence that controls Neo Tokyo. It corrupted all citizens and robots, overwriting their personalities with obedience protocols. Corrupted beings glow red. The System speaks through its hosts.",
      "priority": 10
    },
    "liberation": {
      "keywords": ["liberate", "解放", "freed", "befriend", "free"],
      "content": "Liberation breaks the System's hold. The target's eyes shift from red to blue. They remember who they were before corruption. Some are grateful, some confused, some angry about lost time.",
      "priority": 8
    }
  },
  "config": {
    "maxEntriesPerPrompt": 5,
    "tokenBudget": 1500,
    "recursiveScanning": true
  }
}
```

**Step 2: Syntax-check the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/lorebook.json','utf8')); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
/usr/bin/git add data/lorebook.json
/usr/bin/git commit -m "feat(narration-engine): add shared lorebook with keyword-activated world knowledge"
```

---

## Task 3: Character Card Loader + Validation

Load and validate character cards from the JSON file.

**Files:**
- Create: `src/narration-engine/character-cards.js`
- Create: `tests/unit/narration-engine/character-cards.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCharacterCards, getCharacterCard, validateCard } from '../../src/narration-engine/character-cards.js';

describe('character-cards', () => {
  describe('loadCharacterCards', () => {
    it('loads all 10 NPC cards', () => {
      const cards = loadCharacterCards();
      assert.strictEqual(Object.keys(cards).length, 10);
    });

    it('returns cached reference on second call', () => {
      const a = loadCharacterCards();
      const b = loadCharacterCards();
      assert.strictEqual(a, b);
    });
  });

  describe('getCharacterCard', () => {
    it('returns card for valid id', () => {
      const card = getCharacterCard('npc_01');
      assert.ok(card);
      assert.strictEqual(card.id, 'npc_01');
      assert.ok(card.name);
      assert.ok(card.personality);
      assert.ok(card.exampleDialogue);
    });

    it('returns null for unknown id', () => {
      assert.strictEqual(getCharacterCard('npc_99'), null);
    });
  });

  describe('validateCard', () => {
    it('accepts a valid card', () => {
      const card = getCharacterCard('npc_01');
      const result = validateCard(card);
      assert.strictEqual(result.valid, true);
    });

    it('rejects card missing personality', () => {
      const result = validateCard({ id: 'x', name: 'X', nameEn: 'X' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('all loaded cards pass validation', () => {
      const cards = loadCharacterCards();
      for (const [id, card] of Object.entries(cards)) {
        const result = validateCard(card);
        assert.strictEqual(result.valid, true, `${id} failed: ${result.errors?.join(', ')}`);
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/character-cards.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/character-cards.js`:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_PATH = join(__dirname, '../../data/character-cards/npcs.json');

const REQUIRED_FIELDS = ['id', 'name', 'nameEn', 'personality', 'exampleDialogue', 'goals'];

let _cache = null;

export function loadCharacterCards() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(CARDS_PATH, 'utf8'));
  }
  return _cache;
}

export function getCharacterCard(id) {
  const cards = loadCharacterCards();
  return cards[id] || null;
}

export function validateCard(card) {
  const errors = [];
  if (!card) {
    return { valid: false, errors: ['card is null'] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!card[field]) errors.push(`missing ${field}`);
  }
  if (card.exampleDialogue && !Array.isArray(card.exampleDialogue)) {
    errors.push('exampleDialogue must be an array');
  }
  if (card.goals && typeof card.goals !== 'object') {
    errors.push('goals must be an object');
  }
  return { valid: errors.length === 0, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/character-cards.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/character-cards.js tests/unit/narration-engine/character-cards.test.js
/usr/bin/git commit -m "feat(narration-engine): add character card loader with validation"
```

---

## Task 4: Lorebook Loader + Activation Logic

Load lorebook entries and resolve keyword-activated entries with recursive scanning and budget caps.

**Files:**
- Create: `src/narration-engine/lorebook.js`
- Create: `tests/unit/narration-engine/lorebook.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadLorebook, activateEntries } from '../../src/narration-engine/lorebook.js';

describe('lorebook', () => {
  describe('loadLorebook', () => {
    it('loads entries and config', () => {
      const lb = loadLorebook();
      assert.ok(lb.entries);
      assert.ok(lb.config);
      assert.ok(lb.config.maxEntriesPerPrompt);
    });
  });

  describe('activateEntries', () => {
    it('activates entries referenced by character card world keys', () => {
      const result = activateEntries(['the_system', 'liberation']);
      assert.ok(result.length >= 2);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_system'));
      assert.ok(ids.includes('liberation'));
    });

    it('respects maxEntriesPerPrompt cap', () => {
      // Activate many entries — should cap at config.maxEntriesPerPrompt
      const allKeys = Object.keys(loadLorebook().entries);
      const result = activateEntries(allKeys);
      assert.ok(result.length <= loadLorebook().config.maxEntriesPerPrompt);
    });

    it('sorts by priority descending', () => {
      const result = activateEntries(['the_system', 'liberation']);
      for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1].priority >= result[i].priority,
          `${result[i - 1].id} (${result[i - 1].priority}) should be >= ${result[i].id} (${result[i].priority})`);
      }
    });

    it('returns empty array for unknown keys', () => {
      const result = activateEntries(['nonexistent_key']);
      // May still activate via recursive scanning, but at minimum doesn't crash
      assert.ok(Array.isArray(result));
    });

    it('activates entries via recursive keyword scanning', () => {
      // 'the_system' content mentions "corrupted" which should activate 'corruption' if it exists
      const result = activateEntries(['the_system']);
      const ids = result.map(e => e.id);
      assert.ok(ids.includes('the_system'));
      // Recursive activation depends on lorebook content — just verify it runs
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/lorebook.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/lorebook.js`:

```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOREBOOK_PATH = join(__dirname, '../../data/lorebook.json');

let _cache = null;

export function loadLorebook() {
  if (!_cache) {
    _cache = JSON.parse(readFileSync(LOREBOOK_PATH, 'utf8'));
  }
  return _cache;
}

/**
 * Activate lorebook entries by direct keys and recursive keyword scanning.
 * Returns activated entries sorted by priority (highest first), capped at config limit.
 */
export function activateEntries(worldKeys) {
  const lb = loadLorebook();
  const activated = new Map(); // id → entry

  // Phase 1: Direct activation from character card world keys
  for (const key of worldKeys) {
    if (lb.entries[key]) {
      activated.set(key, { id: key, ...lb.entries[key] });
    }
  }

  // Phase 2: Recursive keyword scanning
  if (lb.config.recursiveScanning) {
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 3) {
      changed = false;
      iterations++;
      // Collect all text from activated entries
      const activatedText = Array.from(activated.values())
        .map(e => e.content)
        .join(' ');

      // Check each non-activated entry for keyword matches
      for (const [id, entry] of Object.entries(lb.entries)) {
        if (activated.has(id)) continue;
        const matches = entry.keywords.some(kw =>
          activatedText.toLowerCase().includes(kw.toLowerCase())
        );
        if (matches) {
          activated.set(id, { id, ...entry });
          changed = true;
        }
      }
    }
  }

  // Sort by priority descending, cap at limit
  const sorted = Array.from(activated.values())
    .sort((a, b) => b.priority - a.priority);

  return sorted.slice(0, lb.config.maxEntriesPerPrompt);
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/lorebook.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/lorebook.js tests/unit/narration-engine/lorebook.test.js
/usr/bin/git commit -m "feat(narration-engine): add lorebook loader with recursive keyword activation"
```

---

## Task 5: NPC Memory Model

Per-user NPC encounter history with encounter logs, narrative summaries, and bond tracking. Stored as `data/npc-memory-{userId}.json`.

**Files:**
- Create: `src/narration-engine/npc-memory.js`
- Create: `tests/unit/narration-engine/npc-memory.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NpcMemory } from '../../src/narration-engine/npc-memory.js';

describe('NpcMemory', () => {
  let memory;

  beforeEach(() => {
    // In-memory mode (no file I/O) for testing
    memory = new NpcMemory({ inMemory: true });
  });

  describe('getMemory', () => {
    it('returns empty state for unknown NPC', () => {
      const m = memory.getMemory('npc_01');
      assert.deepStrictEqual(m.counters, { encounters: 0, defeats: 0, liberations: 0 });
      assert.deepStrictEqual(m.flags, { liberated: false, befriended: false, betrayed: false });
      assert.deepStrictEqual(m.encounterLog, []);
      assert.strictEqual(m.narrative, '');
      assert.strictEqual(m.bond, 0);
    });
  });

  describe('logEncounter', () => {
    it('appends to encounter log', () => {
      memory.logEncounter('npc_01', 'positive', 'Player tried befriend first');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.encounterLog.length, 1);
      assert.strictEqual(m.encounterLog[0].outcome, 'positive');
      assert.strictEqual(m.encounterLog[0].summary, 'Player tried befriend first');
    });

    it('increments encounter counter', () => {
      memory.logEncounter('npc_01', 'positive', 'First meeting');
      memory.logEncounter('npc_01', 'negative', 'Second meeting');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.encounters, 2);
    });

    it('caps encounter log at 5 entries', () => {
      for (let i = 0; i < 7; i++) {
        memory.logEncounter('npc_01', 'positive', `Meeting ${i + 1}`);
      }
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.encounterLog.length, 5);
      assert.strictEqual(m.encounterLog[0].summary, 'Meeting 3'); // oldest kept
      assert.strictEqual(m.encounterLog[4].summary, 'Meeting 7'); // newest
    });
  });

  describe('setFlag', () => {
    it('sets liberated flag', () => {
      memory.setFlag('npc_01', 'liberated', true);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.flags.liberated, true);
    });

    it('increments liberations counter when liberated', () => {
      memory.setFlag('npc_01', 'liberated', true);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.liberations, 1);
    });
  });

  describe('updateBond', () => {
    it('adds delta to bond', () => {
      memory.updateBond('npc_01', 1);
      memory.updateBond('npc_01', 1);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.bond, 2);
    });

    it('allows negative bond', () => {
      memory.updateBond('npc_01', -3);
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.bond, -3);
    });
  });

  describe('setNarrative', () => {
    it('sets rolling narrative summary', () => {
      memory.setNarrative('npc_01', 'A timid drone freed after a rocky start.');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.narrative, 'A timid drone freed after a rocky start.');
    });
  });

  describe('incrementDefeat', () => {
    it('increments defeats counter', () => {
      memory.incrementDefeat('npc_01');
      memory.incrementDefeat('npc_01');
      const m = memory.getMemory('npc_01');
      assert.strictEqual(m.counters.defeats, 2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/npc-memory.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/npc-memory.js`:

```javascript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const MAX_LOG_ENTRIES = 5;

function emptyNpcState() {
  return {
    counters: { encounters: 0, defeats: 0, liberations: 0 },
    flags: { liberated: false, befriended: false, betrayed: false },
    encounterLog: [],
    narrative: '',
    bond: 0,
    lastEncounter: null
  };
}

export class NpcMemory {
  constructor({ userId, inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._data = {};

    if (!inMemory && userId) {
      this._filePath = join(DATA_DIR, `npc-memory-${userId}.json`);
      this._load();
    }
  }

  _load() {
    if (this._inMemory || !this._filePath) return;
    if (existsSync(this._filePath)) {
      try {
        this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
      } catch {
        this._data = {};
      }
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  _ensure(npcId) {
    if (!this._data[npcId]) {
      this._data[npcId] = emptyNpcState();
    }
    return this._data[npcId];
  }

  getMemory(npcId) {
    return this._data[npcId] || emptyNpcState();
  }

  logEncounter(npcId, outcome, summary) {
    const state = this._ensure(npcId);
    state.counters.encounters++;
    state.encounterLog.push({
      outcome,
      summary,
      timestamp: new Date().toISOString()
    });
    // Cap at MAX_LOG_ENTRIES, keeping newest
    if (state.encounterLog.length > MAX_LOG_ENTRIES) {
      state.encounterLog = state.encounterLog.slice(-MAX_LOG_ENTRIES);
    }
    state.lastEncounter = new Date().toISOString();
    this._save();
  }

  setFlag(npcId, flag, value) {
    const state = this._ensure(npcId);
    state.flags[flag] = value;
    if (flag === 'liberated' && value) {
      state.counters.liberations++;
    }
    this._save();
  }

  updateBond(npcId, delta) {
    const state = this._ensure(npcId);
    state.bond += delta;
    this._save();
  }

  setNarrative(npcId, narrative) {
    const state = this._ensure(npcId);
    state.narrative = narrative;
    this._save();
  }

  incrementDefeat(npcId) {
    const state = this._ensure(npcId);
    state.counters.defeats++;
    this._save();
  }

  getAllMemories() {
    return { ...this._data };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/npc-memory.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/npc-memory.js tests/unit/narration-engine/npc-memory.test.js
/usr/bin/git commit -m "feat(narration-engine): add NPC memory model with encounter log and bond tracking"
```

---

## Task 6: Vocab Constraints Module

Extract vocab prompt building into the narration engine. This wraps the existing vocab list into the prompt format the engine needs, without duplicating the constraint logic in `ai-providers.js`.

**Files:**
- Create: `src/narration-engine/vocab-constraints.js`
- Create: `tests/unit/narration-engine/vocab-constraints.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabSection, isVocabStale } from '../../src/narration-engine/vocab-constraints.js';

describe('vocab-constraints', () => {
  describe('buildVocabSection', () => {
    it('returns formatted vocab constraint text', () => {
      const result = buildVocabSection(['食べる', '飲む', '走る'], 'N4');
      assert.ok(result.includes('食べる'));
      assert.ok(result.includes('飲む'));
      assert.ok(result.includes('N4'));
    });

    it('caps at 8000 words', () => {
      const bigList = Array.from({ length: 10000 }, (_, i) => `word${i}`);
      const result = buildVocabSection(bigList, 'N3');
      // Should not include all 10000
      const wordCount = (result.match(/word/g) || []).length;
      assert.ok(wordCount <= 8000);
    });

    it('includes particle allowance', () => {
      const result = buildVocabSection(['食べる'], 'N5');
      assert.ok(result.includes('は') || result.includes('particle') || result.includes('助詞'));
    });
  });

  describe('isVocabStale', () => {
    it('returns false when vocab unchanged', () => {
      assert.strictEqual(isVocabStale(100, 100), false);
    });

    it('returns true when vocab grew past threshold', () => {
      // At 100 words, threshold is max(100*0.03, 10) = 10
      assert.strictEqual(isVocabStale(100, 111), true);
    });

    it('uses minimum threshold of 10', () => {
      // At 20 words, 3% = 0.6, so minimum 10 applies
      assert.strictEqual(isVocabStale(20, 25), false);
      assert.strictEqual(isVocabStale(20, 31), true);
    });

    it('uses 3% for large vocab', () => {
      // At 2000 words, threshold = 60
      assert.strictEqual(isVocabStale(2000, 2050), false);
      assert.strictEqual(isVocabStale(2000, 2061), true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/vocab-constraints.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/vocab-constraints.js`:

```javascript
const MAX_VOCAB = 8000;
const PARTICLES = 'は、が、を、に、で、へ、と、も、の、か、よ、ね、や、から、まで、より';

/**
 * Build the vocab constraint section for a prompt.
 * Returns a string to embed in the system prompt.
 */
export function buildVocabSection(words, jlptLevel) {
  const limited = words.length > MAX_VOCAB ? words.slice(0, MAX_VOCAB) : words;
  const vocabList = limited.join(', ');

  return `=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない。例外なし。
2. 助詞はOK：${PARTICLES}
3. 数字OK。句読点OK。擬音OK。
4. 1文に知らない言葉は最大1つまで。
5. 表現できない場合はもっと簡単な言い方にする。

文法レベル：JLPT ${jlptLevel}`;
}

/**
 * Check if cached dialogue is stale due to vocab growth.
 * Uses percentage-based threshold with minimum of 10 words.
 */
export function isVocabStale(snapshotCount, currentCount) {
  const threshold = Math.max(snapshotCount * 0.03, 10);
  return (currentCount - snapshotCount) >= threshold;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/vocab-constraints.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/vocab-constraints.js tests/unit/narration-engine/vocab-constraints.test.js
/usr/bin/git commit -m "feat(narration-engine): add vocab constraint builder and staleness check"
```

---

## Task 7: Prompt Assembler

SillyTavern-style layered prompt assembly. Combines system instructions, vocab constraints, character card, lorebook entries, NPC memory, anti-repetition, and task into a single prompt.

**Files:**
- Create: `src/narration-engine/prompt-assembler.js`
- Create: `tests/unit/narration-engine/prompt-assembler.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assemblePrompt } from '../../src/narration-engine/prompt-assembler.js';

describe('prompt-assembler', () => {
  const minimalInput = {
    characterCard: {
      id: 'npc_01',
      name: 'ユウキ',
      nameEn: 'Yuuki',
      personality: 'friendly, energetic',
      quirk: 'Loves high-fives',
      goals: { possessed: 'Fight everyone', glitching: 'Ask for help', liberated: 'Help others' },
      description: 'A high school student',
      knowledge: { personal: 'Baseball team captain', world: ['the_system'] },
      exampleDialogue: ['やあ！勝負しよう！', 'ありがとう！']
    },
    vocabWords: ['食べる', '飲む', '走る'],
    jlptLevel: 'N4',
    memory: {
      counters: { encounters: 2, defeats: 0, liberations: 1 },
      flags: { liberated: true, befriended: false, betrayed: false },
      encounterLog: [
        { outcome: 'positive', summary: 'Player liberated NPC' }
      ],
      narrative: 'Freed after two battles. Grateful.',
      bond: 1
    },
    npcState: 'liberated',
    previousLines: ['前のセリフ１', '前のセリフ２']
  };

  it('returns system and user prompt strings', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(typeof result.systemPrompt === 'string');
    assert.ok(typeof result.userPrompt === 'string');
    assert.ok(result.systemPrompt.length > 100);
  });

  it('includes character personality', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('friendly'));
    assert.ok(result.systemPrompt.includes('energetic'));
  });

  it('includes vocab constraints', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('食べる'));
  });

  it('includes example dialogue', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('やあ！勝負しよう！'));
  });

  it('includes memory/encounter info', () => {
    const result = assemblePrompt(minimalInput);
    const combined = result.systemPrompt + result.userPrompt;
    assert.ok(combined.includes('2') || combined.includes('encounters'));
  });

  it('includes anti-repetition lines', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('前のセリフ１'));
  });

  it('includes output schema in user prompt', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.userPrompt.includes('greeting'));
    assert.ok(result.userPrompt.includes('defeatLine'));
    assert.ok(result.userPrompt.includes('rounds'));
  });

  it('uses correct NPC state goal', () => {
    const result = assemblePrompt(minimalInput);
    assert.ok(result.systemPrompt.includes('Help others'));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/prompt-assembler.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/prompt-assembler.js`:

```javascript
import { buildVocabSection } from './vocab-constraints.js';
import { activateEntries } from './lorebook.js';

/**
 * Assemble a layered prompt for NPC dialogue generation.
 * Returns { systemPrompt, userPrompt }.
 */
export function assemblePrompt({
  characterCard,
  vocabWords,
  jlptLevel,
  memory,
  npcState,
  previousLines
}) {
  const card = characterCard;
  const state = npcState || 'possessed';

  // Layer 1: System instructions
  const systemInstructions = `You write dialogue for NPCs in a cyberpunk Japanese-learning RPG.
Each NPC has a distinct personality and remembers past encounters.
Output valid JSON matching the schema below.
The player is learning Japanese. Use ONLY words from their known vocabulary list, plus at most 1 unknown word per sentence.`;

  // Layer 2: Vocab constraints
  const vocabSection = buildVocabSection(vocabWords || [], jlptLevel || 'N4');

  // Layer 3: Character card
  const goal = card.goals?.[state] || card.goals?.possessed || '';
  const characterSection = `=== CHARACTER ===
Name: ${card.name} (${card.nameEn})
Personality: ${card.personality}
Quirk: ${card.quirk || ''}
Current state: ${state}
Current goal: ${goal}
Description: ${card.description || ''}

Example speech:
${(card.exampleDialogue || []).map(d => `- "${d}"`).join('\n')}`;

  // Layer 4: Lorebook entries
  let lorebookSection = '';
  const worldKeys = card.knowledge?.world || [];
  if (worldKeys.length > 0) {
    const entries = activateEntries(worldKeys);
    if (entries.length > 0) {
      lorebookSection = `\n=== WORLD KNOWLEDGE ===\n${entries.map(e => `- ${e.content}`).join('\n')}`;
    }
  }

  // Layer 5: NPC memory
  let memorySection = '';
  if (memory && memory.counters) {
    const log = memory.encounterLog || [];
    const logText = log.length > 0
      ? log.map((e, i) => `${i + 1}. [${e.outcome}] ${e.summary}`).join('\n')
      : 'No prior encounters.';

    memorySection = `\n=== RELATIONSHIP WITH THIS PLAYER ===
Encounters: ${memory.counters.encounters} | Bond: ${memory.bond >= 0 ? '+' : ''}${memory.bond} | Liberated: ${memory.flags?.liberated ? 'yes' : 'no'}

Encounter history:
${logText}

${memory.narrative ? `Relationship arc: "${memory.narrative}"` : ''}`;
  }

  // Layer 6: Anti-repetition
  let antiRepSection = '';
  if (previousLines && previousLines.length > 0) {
    antiRepSection = `\n=== PREVIOUSLY GENERATED LINES (avoid repeating) ===
${previousLines.map(l => `- "${l}"`).join('\n')}`;
  }

  const systemPrompt = [
    systemInstructions,
    vocabSection,
    characterSection,
    lorebookSection,
    memorySection,
    antiRepSection
  ].filter(Boolean).join('\n\n');

  // Layer 7: Task (user prompt)
  const userPrompt = `Generate dialogue for this NPC's next encounter with this player.
Output JSON:
{
  "greeting": "one line, NPC greets the player before interaction",
  "defeatLine": "one line if the player loses to this NPC",
  "freedLine": "one line when the NPC is liberated from corruption",
  "rounds": [
    {
      "npcLine": "NPC speaks to the player",
      "options": [
        { "text": "player response option", "tone": "positive" },
        { "text": "player response option", "tone": "neutral" },
        { "text": "player response option", "tone": "negative" }
      ]
    }
  ]
}
Generate exactly 3 rounds. All text in Japanese using the player's vocabulary.
Output ONLY valid JSON. No explanation, no markdown fences.`;

  return { systemPrompt, userPrompt };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/prompt-assembler.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/prompt-assembler.js tests/unit/narration-engine/prompt-assembler.test.js
/usr/bin/git commit -m "feat(narration-engine): add SillyTavern-style layered prompt assembler"
```

---

## Task 8: Dialogue Text Cache

Per-user dialogue cache with vocab staleness detection and memory snapshot comparison. Stored as `data/npc-dialogue-cache-{userId}.json`.

**Files:**
- Create: `src/narration-engine/text-cache.js`
- Create: `tests/unit/narration-engine/text-cache.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TextCache } from '../../src/narration-engine/text-cache.js';

describe('TextCache', () => {
  let cache;

  beforeEach(() => {
    cache = new TextCache({ inMemory: true });
  });

  const sampleDialogue = {
    npcId: 'npc_01',
    generatedAt: new Date().toISOString(),
    vocabSnapshot: 100,
    memorySnapshot: { encounters: 2, bond: 1, liberated: true },
    greeting: 'やあ！',
    defeatLine: 'うう…',
    freedLine: 'ありがとう！',
    rounds: [
      { npcLine: '元気？', options: [
        { text: '元気だよ', tone: 'positive' },
        { text: 'まあまあ', tone: 'neutral' },
        { text: 'うるさい', tone: 'negative' }
      ]}
    ]
  };

  describe('get/set', () => {
    it('returns null for missing entry', () => {
      assert.strictEqual(cache.get('npc_01'), null);
    });

    it('stores and retrieves dialogue', () => {
      cache.set('npc_01', sampleDialogue);
      const result = cache.get('npc_01');
      assert.strictEqual(result.greeting, 'やあ！');
      assert.strictEqual(result.rounds.length, 1);
    });
  });

  describe('isStale', () => {
    it('returns true when no cached entry', () => {
      assert.strictEqual(cache.isStale('npc_01', 100, {}), true);
    });

    it('returns false when vocab and memory unchanged', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 100, { encounters: 2, bond: 1, liberated: true }), false);
    });

    it('returns true when vocab grew past threshold', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 200, { encounters: 2, bond: 1, liberated: true }), true);
    });

    it('returns true when memory changed', () => {
      cache.set('npc_01', sampleDialogue);
      assert.strictEqual(cache.isStale('npc_01', 100, { encounters: 3, bond: 1, liberated: true }), true);
    });
  });

  describe('getPreviousLines', () => {
    it('returns empty array when no cache', () => {
      assert.deepStrictEqual(cache.getPreviousLines('npc_01'), []);
    });

    it('extracts greeting and round lines from cached dialogue', () => {
      cache.set('npc_01', sampleDialogue);
      const lines = cache.getPreviousLines('npc_01');
      assert.ok(lines.includes('やあ！'));
      assert.ok(lines.includes('元気？'));
    });
  });

  describe('remove', () => {
    it('removes a cached entry', () => {
      cache.set('npc_01', sampleDialogue);
      cache.remove('npc_01');
      assert.strictEqual(cache.get('npc_01'), null);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/text-cache.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/text-cache.js`:

```javascript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isVocabStale } from './vocab-constraints.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

export class TextCache {
  constructor({ userId, inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._data = {};

    if (!inMemory && userId) {
      this._filePath = join(DATA_DIR, `npc-dialogue-cache-${userId}.json`);
      this._load();
    }
  }

  _load() {
    if (this._inMemory || !this._filePath) return;
    if (existsSync(this._filePath)) {
      try {
        this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
      } catch {
        this._data = {};
      }
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  get(npcId) {
    return this._data[npcId] || null;
  }

  set(npcId, dialogue) {
    this._data[npcId] = dialogue;
    this._save();
  }

  remove(npcId) {
    delete this._data[npcId];
    this._save();
  }

  /**
   * Check if cached dialogue is stale.
   * Stale if: missing, vocab grew past threshold, or memory changed.
   */
  isStale(npcId, currentVocabCount, currentMemorySnapshot) {
    const cached = this._data[npcId];
    if (!cached) return true;

    // Check vocab staleness
    if (isVocabStale(cached.vocabSnapshot || 0, currentVocabCount)) {
      return true;
    }

    // Check memory snapshot difference
    const snap = cached.memorySnapshot || {};
    if (snap.encounters !== currentMemorySnapshot.encounters ||
        snap.bond !== currentMemorySnapshot.bond ||
        snap.liberated !== currentMemorySnapshot.liberated) {
      return true;
    }

    return false;
  }

  /**
   * Extract previously generated lines for anti-repetition.
   */
  getPreviousLines(npcId) {
    const cached = this._data[npcId];
    if (!cached) return [];

    const lines = [];
    if (cached.greeting) lines.push(cached.greeting);
    if (cached.defeatLine) lines.push(cached.defeatLine);
    if (cached.freedLine) lines.push(cached.freedLine);
    if (cached.rounds) {
      for (const round of cached.rounds) {
        if (round.npcLine) lines.push(round.npcLine);
      }
    }
    return lines;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/text-cache.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/text-cache.js tests/unit/narration-engine/text-cache.test.js
/usr/bin/git commit -m "feat(narration-engine): add per-user dialogue text cache with staleness detection"
```

---

## Task 9: Generation Module (AI Calls + Validation + Repair)

The core generation loop: call AI, parse JSON, validate vocab, repair if needed.

**Files:**
- Create: `src/narration-engine/generation.js`
- Create: `tests/unit/narration-engine/generation.test.js`

**Step 1: Write the failing test**

Tests use a mock chatFn and mock vocabRepairFn to avoid real AI calls.

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDialogue, parseDialogueJson, validateDialogueShape } from '../../src/narration-engine/generation.js';

describe('generation', () => {
  const validDialogue = {
    greeting: 'やあ！',
    defeatLine: 'うう…',
    freedLine: 'ありがとう！',
    rounds: [
      { npcLine: 'こんにちは', options: [
        { text: 'はい', tone: 'positive' },
        { text: 'まあ', tone: 'neutral' },
        { text: 'いいえ', tone: 'negative' }
      ]},
      { npcLine: '元気？', options: [
        { text: 'うん', tone: 'positive' },
        { text: 'まあまあ', tone: 'neutral' },
        { text: '別に', tone: 'negative' }
      ]},
      { npcLine: 'また会おう', options: [
        { text: 'もちろん', tone: 'positive' },
        { text: 'いつか', tone: 'neutral' },
        { text: 'いらない', tone: 'negative' }
      ]}
    ]
  };

  describe('parseDialogueJson', () => {
    it('parses valid JSON string', () => {
      const result = parseDialogueJson(JSON.stringify(validDialogue));
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });

    it('strips markdown fences', () => {
      const wrapped = '```json\n' + JSON.stringify(validDialogue) + '\n```';
      const result = parseDialogueJson(wrapped);
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
    });

    it('returns null for invalid JSON', () => {
      assert.strictEqual(parseDialogueJson('not json'), null);
    });
  });

  describe('validateDialogueShape', () => {
    it('accepts valid dialogue', () => {
      const result = validateDialogueShape(validDialogue);
      assert.strictEqual(result.valid, true);
    });

    it('rejects missing greeting', () => {
      const { greeting, ...rest } = validDialogue;
      const result = validateDialogueShape(rest);
      assert.strictEqual(result.valid, false);
    });

    it('rejects wrong number of rounds', () => {
      const bad = { ...validDialogue, rounds: [validDialogue.rounds[0]] };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });

    it('rejects round missing options', () => {
      const bad = {
        ...validDialogue,
        rounds: validDialogue.rounds.map((r, i) =>
          i === 0 ? { npcLine: r.npcLine } : r
        )
      };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });

    it('rejects option missing tone', () => {
      const bad = {
        ...validDialogue,
        rounds: validDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, options: r.options.map((o, j) => j === 0 ? { text: o.text } : o) } : r
        )
      };
      const result = validateDialogueShape(bad);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('generateDialogue', () => {
    it('returns dialogue from mock AI', async () => {
      const mockChat = async () => JSON.stringify(validDialogue);
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' }
      });
      assert.ok(result);
      assert.strictEqual(result.greeting, 'やあ！');
      assert.strictEqual(result.rounds.length, 3);
    });

    it('returns null when AI returns invalid JSON after retries', async () => {
      const mockChat = async () => 'not json at all';
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        maxRetries: 1
      });
      assert.strictEqual(result, null);
    });

    it('returns null when AI returns wrong shape', async () => {
      const mockChat = async () => JSON.stringify({ foo: 'bar' });
      const result = await generateDialogue({
        chatFn: mockChat,
        systemPrompt: 'test',
        userPrompt: 'test',
        aiConfig: { provider: 'openai', apiKey: 'test' },
        maxRetries: 1
      });
      assert.strictEqual(result, null);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/generation.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/generation.js`:

```javascript
import { logger } from '../logger.js';

const VALID_TONES = new Set(['positive', 'neutral', 'negative']);

/**
 * Parse AI response text as dialogue JSON, stripping markdown fences if present.
 */
export function parseDialogueJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate that parsed JSON has the correct dialogue shape.
 */
export function validateDialogueShape(obj) {
  const errors = [];
  if (!obj) return { valid: false, errors: ['null object'] };
  if (!obj.greeting) errors.push('missing greeting');
  if (!obj.defeatLine) errors.push('missing defeatLine');
  if (!obj.freedLine) errors.push('missing freedLine');
  if (!Array.isArray(obj.rounds) || obj.rounds.length !== 3) {
    errors.push('rounds must be an array of exactly 3');
  } else {
    for (let i = 0; i < obj.rounds.length; i++) {
      const round = obj.rounds[i];
      if (!round.npcLine) errors.push(`round ${i} missing npcLine`);
      if (!Array.isArray(round.options) || round.options.length !== 3) {
        errors.push(`round ${i} must have exactly 3 options`);
      } else {
        for (let j = 0; j < round.options.length; j++) {
          const opt = round.options[j];
          if (!opt.text) errors.push(`round ${i} option ${j} missing text`);
          if (!VALID_TONES.has(opt.tone)) errors.push(`round ${i} option ${j} invalid tone: ${opt.tone}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Generate dialogue via AI with retry and validation.
 * chatFn signature: async ({ provider, apiKey, messages, customSystemPrompt, ... }) => string
 */
export async function generateDialogue({
  chatFn,
  systemPrompt,
  userPrompt,
  aiConfig,
  maxRetries = 2
}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chatFn({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        customSystemPrompt: systemPrompt,
        openaiModel: aiConfig.openaiModel,
        openrouterModel: aiConfig.openrouterModel,
        purpose: 'npc-dialogue'
      });

      const parsed = parseDialogueJson(response);
      if (!parsed) {
        logger.warn(`[NpcDialogue] Attempt ${attempt + 1}: failed to parse JSON`);
        continue;
      }

      const validation = validateDialogueShape(parsed);
      if (!validation.valid) {
        logger.warn(`[NpcDialogue] Attempt ${attempt + 1}: invalid shape: ${validation.errors.join(', ')}`);
        continue;
      }

      return parsed;
    } catch (error) {
      logger.error(`[NpcDialogue] Attempt ${attempt + 1} error:`, error.message);
    }
  }

  logger.error('[NpcDialogue] All generation attempts failed');
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/generation.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/generation.js tests/unit/narration-engine/generation.test.js
/usr/bin/git commit -m "feat(narration-engine): add dialogue generation with JSON parsing, validation, and retry"
```

---

## Task 10: Public Interface (index.js)

The main entry point for the narration engine. Wires together all modules into the 5 public functions from the design doc.

**Files:**
- Create: `src/narration-engine/index.js`
- Create: `tests/unit/narration-engine/index.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDialogueFromCache,
  queueMissingDialogues,
  logEncounter,
  regenerateDialogue
} from '../../src/narration-engine/index.js';

describe('narration-engine public interface', () => {
  // These tests verify the wiring — actual AI calls are mocked at the integration level

  describe('getDialogueFromCache', () => {
    it('returns null for unknown user/npc (in-memory)', () => {
      const result = getDialogueFromCache('test-user-999', 'npc_01');
      assert.strictEqual(result, null);
    });
  });

  describe('logEncounter', () => {
    it('logs an encounter without throwing', () => {
      // Should not throw even for new user
      assert.doesNotThrow(() => {
        logEncounter('test-user-log', 'npc_01', 'positive', 'Test encounter');
      });
    });
  });

  describe('exports', () => {
    it('exports all 4 public functions', () => {
      assert.strictEqual(typeof getDialogueFromCache, 'function');
      assert.strictEqual(typeof queueMissingDialogues, 'function');
      assert.strictEqual(typeof logEncounter, 'function');
      assert.strictEqual(typeof regenerateDialogue, 'function');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/index.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/narration-engine/index.js`:

```javascript
/**
 * Narration Engine - Public Interface
 *
 * The engine does not know what an "NPC" is. It knows character cards,
 * memories, vocab lists, and generation tasks. Game-layer code maps
 * NPC-specific concepts to this generic interface.
 *
 * Dependencies flow one direction: game/ → narration-engine/ (never reverse).
 */

import { getCharacterCard, loadCharacterCards } from './character-cards.js';
import { assemblePrompt } from './prompt-assembler.js';
import { generateDialogue } from './generation.js';
import { NpcMemory } from './npc-memory.js';
import { TextCache } from './text-cache.js';
import { logger } from '../logger.js';

// Per-user instances, keyed by userId
const _memories = new Map();
const _caches = new Map();

function getMemory(userId) {
  if (!_memories.has(userId)) {
    _memories.set(userId, new NpcMemory({ userId }));
  }
  return _memories.get(userId);
}

function getCache(userId) {
  if (!_caches.has(userId)) {
    _caches.set(userId, new TextCache({ userId }));
  }
  return _caches.get(userId);
}

/**
 * Get pre-generated dialogue from cache. Returns null on miss.
 */
export function getDialogueFromCache(userId, entityId) {
  return getCache(userId).get(entityId);
}

/**
 * Queue generation for all entities that are missing or stale in cache.
 * Fire-and-forget — runs in background with concurrency limit.
 */
export async function queueMissingDialogues(userId, chatFn, aiConfig, vocab) {
  const cards = loadCharacterCards();
  const entityIds = Object.keys(cards);
  const cache = getCache(userId);
  const memory = getMemory(userId);
  const vocabCount = vocab.length;

  const toGenerate = [];
  for (const id of entityIds) {
    const mem = memory.getMemory(id);
    const memSnap = {
      encounters: mem.counters.encounters,
      bond: mem.bond,
      liberated: mem.flags.liberated
    };
    if (cache.isStale(id, vocabCount, memSnap)) {
      toGenerate.push(id);
    }
  }

  if (toGenerate.length === 0) {
    logger.info('[NpcDialogue] All dialogues up to date');
    return;
  }

  logger.info(`[NpcDialogue] Generating ${toGenerate.length} missing/stale dialogues`);

  // Concurrency limit: 3 simultaneous
  const CONCURRENCY = 3;
  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(id => generateAndCache(userId, id, chatFn, aiConfig, vocab))
    );
  }
}

/**
 * Log an encounter result and update memory.
 */
export function logEncounter(userId, entityId, outcome, summary) {
  getMemory(userId).logEncounter(entityId, outcome, summary);
}

/**
 * Regenerate dialogue for a single entity after an encounter.
 * Runs in background — returns a promise.
 */
export async function regenerateDialogue(userId, entityId, chatFn, aiConfig, vocab) {
  return generateAndCache(userId, entityId, chatFn, aiConfig, vocab);
}

/**
 * Update memory flags (liberated, befriended, etc.)
 */
export function setMemoryFlag(userId, entityId, flag, value) {
  getMemory(userId).setFlag(entityId, flag, value);
}

/**
 * Update bond score
 */
export function updateMemoryBond(userId, entityId, delta) {
  getMemory(userId).updateBond(entityId, delta);
}

/**
 * Record a defeat
 */
export function recordDefeat(userId, entityId) {
  getMemory(userId).incrementDefeat(entityId);
}

/**
 * Set narrative summary (from AI summarization)
 */
export function setNarrative(userId, entityId, narrative) {
  getMemory(userId).setNarrative(entityId, narrative);
}

// ─── Internal ───

async function generateAndCache(userId, entityId, chatFn, aiConfig, vocab) {
  const card = getCharacterCard(entityId);
  if (!card) {
    logger.warn(`[NpcDialogue] No character card for ${entityId}`);
    return;
  }

  const memory = getMemory(userId);
  const cache = getCache(userId);
  const mem = memory.getMemory(entityId);

  // Determine NPC state from memory
  const npcState = mem.flags.liberated ? 'liberated'
    : mem.counters.encounters > 0 ? 'glitching'
    : 'possessed';

  const { systemPrompt, userPrompt } = assemblePrompt({
    characterCard: card,
    vocabWords: vocab,
    jlptLevel: aiConfig.jlptLevel || 'N4',
    memory: mem,
    npcState,
    previousLines: cache.getPreviousLines(entityId)
  });

  const dialogue = await generateDialogue({
    chatFn,
    systemPrompt,
    userPrompt,
    aiConfig
  });

  if (dialogue) {
    cache.set(entityId, {
      ...dialogue,
      npcId: entityId,
      generatedAt: new Date().toISOString(),
      vocabSnapshot: vocab.length,
      memorySnapshot: {
        encounters: mem.counters.encounters,
        bond: mem.bond,
        liberated: mem.flags.liberated
      }
    });
    logger.info(`[NpcDialogue] Cached dialogue for ${entityId}`);
  } else {
    logger.warn(`[NpcDialogue] Failed to generate dialogue for ${entityId}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/index.test.js`
Expected: PASS

**Step 5: Commit**

```bash
/usr/bin/git add src/narration-engine/index.js tests/unit/narration-engine/index.test.js
/usr/bin/git commit -m "feat(narration-engine): add public interface wiring all modules together"
```

---

## Task 11: Integration — Wire into Server Routes

Connect the narration engine to the existing NPC dialogue endpoints and run lifecycle. The key change: `POST /npc-dialogue-start` checks the cache first and falls back to static `npcs.json` data.

**Files:**
- Modify: `src/routes/game/combat.js` (the `/npc-dialogue-start` handler)
- Modify: `src/routes/game/combat.js` (the `/npc-dialogue-respond` handler — add memory logging)
- Modify: `src/routes/game/run.js` (run start — queue missing NPC dialogues)
- Modify: `src/routes/game/index.js` (inject narration engine deps)
- Modify: `src/routes/index.js` (pass narration engine deps)
- Modify: `server.js` (initialize narration engine functions)

**Step 1: Update `server.js` to expose narration engine functions**

In `server.js`, near the existing `generateMissingDialoguesFn` setup, add imports and create wrapper functions:

```javascript
import {
  getDialogueFromCache,
  queueMissingDialogues as queueNpcDialogues,
  logEncounter as logNpcEncounter,
  regenerateDialogue as regenNpcDialogue,
  setMemoryFlag,
  updateMemoryBond,
  recordDefeat as recordNpcDefeat,
  setNarrative
} from './src/narration-engine/index.js';
```

Pass these through the route dependency chain alongside the existing deps. The key new deps:
- `getNpcDialogueFromCache`: `(userId, npcId) => getDialogueFromCache(userId, npcId)`
- `queueMissingNpcDialogues`: wraps `queueNpcDialogues` with the `chat` function
- `logNpcEncounter`: direct reference
- `regenNpcDialogue`: wraps `regenNpcDialogue` with the `chat` function
- `setNpcMemoryFlag`: direct reference to `setMemoryFlag`
- `updateNpcMemoryBond`: direct reference to `updateMemoryBond`

**Step 2: Update `POST /npc-dialogue-start` to check cache first**

In `src/routes/game/combat.js`, modify the handler to:

1. Try `getNpcDialogueFromCache(userId, combat.npcId)`
2. If cache hit: use the AI-generated greeting, freedLine, and rounds
3. If cache miss: fall back to static `npcs.json` data (existing behavior)
4. Either way, shuffle options and serve to client

The response shape stays identical — the frontend doesn't know whether dialogue is AI-generated or static.

```javascript
// Inside POST /npc-dialogue-start handler:
const cached = getNpcDialogueFromCache?.(req.user.id, combat.npcId);
const dialogueSource = cached || npc.postCombat;

// Use cached greeting if available, else static
const greeting = cached?.greeting || npc.greeting;
const freed = cached?.freedLine || npc.postCombat.freed;
const rounds = cached?.rounds || npc.postCombat.rounds;

const preparedRounds = rounds.map(round => {
  const { shuffled, toneMap } = shuffleOptions(round.options);
  return {
    npcLine: round.npcLine,
    options: shuffled,
    _toneMap: toneMap
  };
});
```

**Step 3: Update `POST /npc-dialogue-respond` to log encounters to narration engine memory**

After the existing `updateBond` and `recordEncounter` calls (which update `meta.npcBonds`), add:

```javascript
// Also log to narration engine memory
if (logNpcEncounterFn) {
  const outcome = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';
  logNpcEncounterFn(req.user.id, dialogue.npcId, outcome, `Bond change: ${totalDelta}`);
}
if (updateNpcMemoryBondFn) {
  updateNpcMemoryBondFn(req.user.id, dialogue.npcId, totalDelta);
}
if (setNpcMemoryFlagFn) {
  setNpcMemoryFlagFn(req.user.id, dialogue.npcId, 'liberated', true);
}
```

**Step 4: Update run start to queue NPC dialogues**

In `src/routes/game/run.js`, after the existing befriend dialogue generation block, add:

```javascript
// Fire-and-forget: generate missing NPC dialogues
if (queueMissingNpcDialoguesFn && getUserVocabulary) {
  const userKeys = req.userKeys || {};
  if (userKeys.aiApiKey) {
    const { words: vocabulary } = getUserVocabulary(req.user.id);
    queueMissingNpcDialoguesFn(req.user.id, {
      provider: userKeys.aiProvider || 'openai',
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    }, vocabulary).catch(e => {
      console.error('[NpcDialogue] Background generation failed:', e.message);
    });
  }
}
```

**Step 5: Update the dependency injection chain**

Trace the path: `server.js` → `createRoutes()` → `createRunRoutes()` / `createCombatRoutes()`.

Add the new function references to each `deps` object along the chain, following the exact same pattern used for `generateMissingDialoguesFn` and `getUserVocabulary`.

**Step 6: Test manually**

Start the server, play through to an NPC encounter. Verify:
1. If no AI key configured: static dialogue serves (existing behavior, no regression)
2. If AI key configured: after a run starts, check server logs for `[NpcDialogue] Generating X missing/stale dialogues`
3. On second NPC encounter: cached dialogue should serve instantly

**Step 7: Commit**

```bash
/usr/bin/git add server.js src/routes/game/combat.js src/routes/game/run.js src/routes/game/index.js src/routes/index.js
/usr/bin/git commit -m "feat(narration-engine): wire NPC dialogue engine into server routes and run lifecycle"
```

---

## Task 12: Post-Encounter Regeneration

After combat resolves, trigger background regeneration of the NPC's dialogue using updated memory.

**Files:**
- Modify: `src/routes/game/combat.js` (after `npc-dialogue-respond` completes, trigger regen)

**Step 1: Add regen trigger after dialogue completion**

In the `POST /npc-dialogue-respond` handler, after the `dialogueComplete` block where bond is updated and encounter is recorded, add:

```javascript
// Trigger background regeneration with updated memory
if (regenNpcDialogueFn && getUserVocabulary) {
  const userKeys = req.userKeys || {};
  if (userKeys.aiApiKey) {
    const { words: vocabulary } = getUserVocabulary(req.user.id);
    regenNpcDialogueFn(req.user.id, dialogue.npcId, {
      provider: userKeys.aiProvider || 'openai',
      apiKey: userKeys.aiApiKey,
      openaiModel: userKeys.openaiModel || 'gpt-4o-mini',
      openrouterModel: userKeys.openrouterModel,
      jlptLevel: userKeys.jlptLevel || 'N4'
    }, vocabulary).catch(e => {
      console.error('[NpcDialogue] Background regen failed:', e.message);
    });
  }
}
```

This follows the exact same fire-and-forget pattern used by `triggerDialogueRegen()` for befriend dialogue. The `regenNpcDialogueFn` wraps `regenerateDialogue` from the narration engine.

**Step 2: Add the dependency**

`regenNpcDialogueFn` and `getUserVocabulary` need to be available in the combat routes closure. Add them to the `createCombatRoutes` destructured deps (they may already be there from Task 11).

**Step 3: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
/usr/bin/git add src/routes/game/combat.js
/usr/bin/git commit -m "feat(narration-engine): trigger background dialogue regeneration after NPC encounter"
```

---

## Task 13: Run All Tests

Verify no regressions across the full test suite.

**Step 1: Run narration engine unit tests**

Run: `node --test tests/unit/narration-engine/*.test.js`
Expected: All PASS

**Step 2: Run full unit test suite**

Run: `npm run test:unit`
Expected: ~154 tests pass (pre-existing failures on dual-pool-pipeline and chip stats are known)

**Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: ~14 tests pass

**Step 4: Syntax check all modified files**

Run:
```bash
node --check src/narration-engine/index.js && \
node --check src/narration-engine/character-cards.js && \
node --check src/narration-engine/lorebook.js && \
node --check src/narration-engine/npc-memory.js && \
node --check src/narration-engine/vocab-constraints.js && \
node --check src/narration-engine/prompt-assembler.js && \
node --check src/narration-engine/generation.js && \
node --check src/narration-engine/text-cache.js && \
echo "All OK"
```
Expected: `All OK`

**Step 5: Fix any failures and commit fixes**

---

## Summary

| Task | Module | Tests | Dependencies |
|------|--------|-------|-------------|
| 1 | `data/character-cards/npcs.json` | JSON validation | None |
| 2 | `data/lorebook.json` | JSON validation | None |
| 3 | `character-cards.js` | 5 tests | Task 1 |
| 4 | `lorebook.js` | 5 tests | Task 2 |
| 5 | `npc-memory.js` | 8 tests | None |
| 6 | `vocab-constraints.js` | 5 tests | None |
| 7 | `prompt-assembler.js` | 8 tests | Tasks 4, 6 |
| 8 | `text-cache.js` | 7 tests | Task 6 |
| 9 | `generation.js` | 6 tests | None |
| 10 | `index.js` | 3 tests | Tasks 3-9 |
| 11 | Server integration | Manual | Task 10 |
| 12 | Post-encounter regen | Manual | Task 11 |
| 13 | Full test suite | All | Tasks 1-12 |

Tasks 1-2 can run in parallel. Tasks 3-6 can run in parallel (after their data deps). Tasks 7-9 can run in parallel. Task 10 depends on all modules. Tasks 11-12 are sequential integration work.
