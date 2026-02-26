# Creature Dialogue Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Absorb the broken befriend dialogue system into the narration engine by making it entity-type-aware, fixing all 5 audit bugs and adding i+1 vocab repair to creature dialogue.

**Architecture:** The narration engine gets an `entity-types/` directory with `npc.js` and `creature.js` modules. Each provides type-specific prompt assembly, shape validation, and string extraction. Shared infrastructure (TextCache, batch gen, vocab repair, staleness) dispatches to the correct type via a registry. The befriend-dialogue-service is deleted entirely.

**Tech Stack:** Node.js, ES modules, node:test for unit tests

---

### Task 1: Create entity type registry

**Files:**
- Create: `src/narration-engine/entity-types/index.js`
- Test: `tests/unit/narration-engine/entity-types/registry.test.js`

**Step 1: Write the failing test**

Create `tests/unit/narration-engine/entity-types/registry.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEntityType, listEntityTypes } from '../../../../src/narration-engine/entity-types/index.js';

describe('entity-type registry', () => {
  it('returns npc type by default', () => {
    const type = getEntityType('npc');
    assert.ok(type);
    assert.strictEqual(typeof type.validateShape, 'function');
    assert.strictEqual(typeof type.extractStrings, 'function');
    assert.strictEqual(typeof type.buildRepairInstruction, 'function');
    assert.strictEqual(typeof type.assemblePrompt, 'function');
    assert.strictEqual(typeof type.getPreviousLines, 'function');
    assert.strictEqual(typeof type.getMemorySnapshot, 'function');
    assert.ok(type.cachePrefix);
    assert.ok(type.memoryPrefix);
    assert.ok(Array.isArray(type.requiredCardFields));
  });

  it('returns creature type', () => {
    const type = getEntityType('creature');
    assert.ok(type);
    assert.strictEqual(type.cachePrefix, 'creature-dialogue-cache');
    assert.strictEqual(type.memoryPrefix, 'creature-memory');
  });

  it('throws for unknown type', () => {
    assert.throws(() => getEntityType('unknown'), /Unknown entity type/);
  });

  it('lists all registered types', () => {
    const types = listEntityTypes();
    assert.ok(types.includes('npc'));
    assert.ok(types.includes('creature'));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/entity-types/registry.test.js`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/narration-engine/entity-types/index.js`:

```js
import * as npcType from './npc.js';
import * as creatureType from './creature.js';

const REGISTRY = {
  npc: npcType,
  creature: creatureType
};

export function getEntityType(typeName) {
  const type = REGISTRY[typeName];
  if (!type) throw new Error(`Unknown entity type: ${typeName}`);
  return type;
}

export function listEntityTypes() {
  return Object.keys(REGISTRY);
}
```

This depends on npc.js and creature.js which are built in Tasks 2 and 3. Create stubs first:

Create `src/narration-engine/entity-types/npc.js` (stub):
```js
// Stub — populated in Task 2
export const cachePrefix = 'npc-dialogue-cache';
export const memoryPrefix = 'npc-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality', 'exampleDialogue', 'goals'];
export function validateShape(obj) { return { valid: false, errors: ['stub'] }; }
export function extractStrings(dialogue) { return []; }
export function buildRepairInstruction(violations) { return ''; }
export function assemblePrompt(params) { return { systemBlocks: [], userPrompt: '' }; }
export function getPreviousLines(cached) { return []; }
export function getMemorySnapshot(mem) { return {}; }
```

Create `src/narration-engine/entity-types/creature.js` (stub):
```js
// Stub — populated in Task 3
export const cachePrefix = 'creature-dialogue-cache';
export const memoryPrefix = 'creature-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality'];
export function validateShape(obj) { return { valid: false, errors: ['stub'] }; }
export function extractStrings(dialogue) { return []; }
export function buildRepairInstruction(violations) { return ''; }
export function assemblePrompt(params) { return { systemBlocks: [], userPrompt: '' }; }
export function getPreviousLines(cached) { return []; }
export function getMemorySnapshot(mem) { return {}; }
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/entity-types/registry.test.js`
Expected: PASS (stubs satisfy the interface check)

**Step 5: Commit**

```bash
git add src/narration-engine/entity-types/ tests/unit/narration-engine/entity-types/
git commit -m "feat: add entity type registry with npc/creature stubs"
```

---

### Task 2: Extract NPC type from existing code

Extract NPC-specific logic from `generation.js`, `dialogue-repair.js`, and `prompt-assembler.js` into `entity-types/npc.js`. This is a pure refactor — existing tests must still pass.

**Files:**
- Modify: `src/narration-engine/entity-types/npc.js` (replace stub)
- Test: `tests/unit/narration-engine/entity-types/npc.test.js`

**Step 1: Write the failing test**

Create `tests/unit/narration-engine/entity-types/npc.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShape, extractStrings, buildRepairInstruction,
  assemblePrompt, getPreviousLines, getMemorySnapshot
} from '../../../../src/narration-engine/entity-types/npc.js';

const validNpcDialogue = {
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

describe('entity-types/npc', () => {
  describe('validateShape', () => {
    it('accepts valid NPC dialogue', () => {
      assert.strictEqual(validateShape(validNpcDialogue).valid, true);
    });

    it('rejects missing greeting', () => {
      const { greeting, ...rest } = validNpcDialogue;
      assert.strictEqual(validateShape(rest).valid, false);
    });

    it('rejects missing defeatLine', () => {
      const { defeatLine, ...rest } = validNpcDialogue;
      assert.strictEqual(validateShape(rest).valid, false);
    });

    it('rejects wrong round count', () => {
      assert.strictEqual(
        validateShape({ ...validNpcDialogue, rounds: [validNpcDialogue.rounds[0]] }).valid,
        false
      );
    });
  });

  describe('extractStrings', () => {
    it('extracts 15 strings from standard dialogue', () => {
      assert.strictEqual(extractStrings(validNpcDialogue).length, 15);
    });

    it('includes greeting path', () => {
      const paths = extractStrings(validNpcDialogue).map(e => e.path);
      assert.ok(paths.includes('greeting'));
    });
  });

  describe('buildRepairInstruction', () => {
    it('includes violation paths', () => {
      const instruction = buildRepairInstruction([
        { path: 'greeting', text: 'X', unknowns: ['困難'] }
      ]);
      assert.ok(instruction.includes('greeting'));
      assert.ok(instruction.includes('困難'));
    });

    it('references NPC JSON structure', () => {
      const instruction = buildRepairInstruction([
        { path: 'greeting', text: 'X', unknowns: ['word'] }
      ]);
      assert.ok(instruction.includes('greeting'));
      assert.ok(instruction.includes('defeatLine'));
      assert.ok(instruction.includes('freedLine'));
    });
  });

  describe('assemblePrompt', () => {
    it('returns systemBlocks and userPrompt', () => {
      const result = assemblePrompt({
        characterCard: {
          name: 'ナギ', nameEn: 'Nagi', personality: 'test',
          quirk: 'test', goals: { possessed: 'goal' },
          exampleDialogue: ['テスト']
        },
        vocabWords: ['猫', '犬'],
        jlptLevel: 'N4',
        memory: null,
        npcState: 'possessed',
        previousLines: []
      });
      assert.ok(result.systemBlocks.length > 0);
      assert.ok(result.userPrompt.includes('greeting'));
    });
  });

  describe('getPreviousLines', () => {
    it('extracts greeting and npcLines', () => {
      const lines = getPreviousLines(validNpcDialogue);
      assert.ok(lines.includes('やあ！'));
      assert.ok(lines.includes('こんにちは'));
    });

    it('returns empty array for null', () => {
      assert.deepStrictEqual(getPreviousLines(null), []);
    });
  });

  describe('getMemorySnapshot', () => {
    it('extracts encounters, bond, liberated', () => {
      const snap = getMemorySnapshot({
        counters: { encounters: 3 },
        bond: 2,
        flags: { liberated: true }
      });
      assert.deepStrictEqual(snap, { encounters: 3, bond: 2, liberated: true });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/entity-types/npc.test.js`
Expected: FAIL — stub functions don't produce correct results

**Step 3: Populate npc.js with extracted logic**

Replace the stub in `src/narration-engine/entity-types/npc.js` with logic extracted from:
- `validateDialogueShape` from `generation.js:24-48`
- `extractDialogueStrings` from `dialogue-repair.js:10-29`
- `buildRepairInstruction` from `dialogue-repair.js:65-82`
- `assemblePrompt` from `prompt-assembler.js:8-107`
- `getPreviousLines` logic from `text-cache.js:81-95`

Key exports:
- `cachePrefix = 'npc-dialogue-cache'`
- `memoryPrefix = 'npc-memory'`
- `requiredCardFields` — same as current `REQUIRED_FIELDS`
- `validateShape(obj)` — the current `validateDialogueShape`
- `extractStrings(dialogue)` — the current `extractDialogueStrings`
- `buildRepairInstruction(violations)` — the current version, referencing NPC JSON structure
- `assemblePrompt({characterCard, vocabWords, jlptLevel, memory, npcState, previousLines})` — the current `assemblePrompt`
- `getPreviousLines(cached)` — extracts greeting, defeatLine, freedLine, npcLine from cached dialogue
- `getMemorySnapshot(mem)` — returns `{ encounters, bond, liberated }`

Import shared helpers: `buildVocabSection` from `vocab-constraints.js`, `activateEntries` from `lorebook.js`.

**Step 4: Run tests**

Run: `node --test tests/unit/narration-engine/entity-types/npc.test.js`
Expected: PASS

Also verify existing tests still pass:
Run: `npm run test:unit`
Expected: Same pass/fail count as before (existing tests still import from original modules)

**Step 5: Commit**

```bash
git add src/narration-engine/entity-types/npc.js tests/unit/narration-engine/entity-types/npc.test.js
git commit -m "feat: extract NPC entity type from narration engine"
```

---

### Task 3: Create creature entity type

**Files:**
- Modify: `src/narration-engine/entity-types/creature.js` (replace stub)
- Test: `tests/unit/narration-engine/entity-types/creature.test.js`

**Step 1: Write the failing test**

Create `tests/unit/narration-engine/entity-types/creature.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateShape, extractStrings, buildRepairInstruction,
  assemblePrompt, getPreviousLines, getMemorySnapshot,
  cachePrefix, memoryPrefix, requiredCardFields
} from '../../../../src/narration-engine/entity-types/creature.js';

const validBefriendDialogue = {
  rounds: [
    { speaker: '友達になろう！', options: ['うん！', '魚が好き。', '靴を買った。'], correctIndex: 0 },
    { speaker: '一緒に遊ぼう！', options: ['テレビを見た。', 'いいね！', '車が速い。'], correctIndex: 1 },
    { speaker: '仲間だね！', options: ['昨日は暑い。', 'お金がない。', 'ずっと仲間！'], correctIndex: 2 }
  ]
};

describe('entity-types/creature', () => {
  it('has correct prefixes', () => {
    assert.strictEqual(cachePrefix, 'creature-dialogue-cache');
    assert.strictEqual(memoryPrefix, 'creature-memory');
  });

  it('has minimal required card fields', () => {
    assert.ok(requiredCardFields.includes('id'));
    assert.ok(requiredCardFields.includes('name'));
    assert.ok(requiredCardFields.includes('personality'));
    assert.ok(!requiredCardFields.includes('goals'));
  });

  describe('validateShape', () => {
    it('accepts valid befriend dialogue', () => {
      assert.strictEqual(validateShape(validBefriendDialogue).valid, true);
    });

    it('rejects missing rounds', () => {
      assert.strictEqual(validateShape({}).valid, false);
    });

    it('rejects wrong round count', () => {
      assert.strictEqual(
        validateShape({ rounds: [validBefriendDialogue.rounds[0]] }).valid,
        false
      );
    });

    it('rejects round missing speaker', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { options: r.options, correctIndex: r.correctIndex } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });

    it('rejects round with wrong option count', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, options: ['a', 'b'] } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });

    it('rejects correctIndex out of range', () => {
      const bad = {
        rounds: validBefriendDialogue.rounds.map((r, i) =>
          i === 0 ? { ...r, correctIndex: 5 } : r
        )
      };
      assert.strictEqual(validateShape(bad).valid, false);
    });

    it('rejects null', () => {
      assert.strictEqual(validateShape(null).valid, false);
    });
  });

  describe('extractStrings', () => {
    it('extracts 12 strings (3 speakers + 9 options)', () => {
      assert.strictEqual(extractStrings(validBefriendDialogue).length, 12);
    });

    it('includes speaker paths', () => {
      const paths = extractStrings(validBefriendDialogue).map(e => e.path);
      assert.ok(paths.includes('rounds[0].speaker'));
      assert.ok(paths.includes('rounds[2].speaker'));
    });

    it('includes option paths', () => {
      const paths = extractStrings(validBefriendDialogue).map(e => e.path);
      assert.ok(paths.includes('rounds[0].options[0]'));
      assert.ok(paths.includes('rounds[2].options[2]'));
    });
  });

  describe('buildRepairInstruction', () => {
    it('includes violation paths and references befriend schema', () => {
      const instruction = buildRepairInstruction([
        { path: 'rounds[0].speaker', text: 'X', unknowns: ['未知'] }
      ]);
      assert.ok(instruction.includes('rounds[0].speaker'));
      assert.ok(instruction.includes('未知'));
      assert.ok(instruction.includes('speaker'));
      assert.ok(instruction.includes('correctIndex'));
    });
  });

  describe('assemblePrompt', () => {
    it('returns systemBlocks and userPrompt with befriend schema', () => {
      const result = assemblePrompt({
        characterCard: {
          id: 'kamedor', name: 'カメドル', nameEn: 'Kamedor',
          element: 'water', personality: 'Patient', quirk: 'Mentions water',
          archetype: 'Tank/Healer', exampleDialogue: ['ゆっくり行こう。']
        },
        vocabWords: ['猫', '犬'],
        jlptLevel: 'N4',
        memory: null,
        previousLines: []
      });
      assert.ok(result.systemBlocks.length > 0);
      assert.ok(result.userPrompt.includes('speaker'));
      assert.ok(result.userPrompt.includes('correctIndex'));
    });

    it('does not include lorebook layer', () => {
      const result = assemblePrompt({
        characterCard: {
          id: 'kamedor', name: 'カメドル', nameEn: 'Kamedor',
          element: 'water', personality: 'Patient',
          exampleDialogue: []
        },
        vocabWords: [],
        jlptLevel: 'N4',
        memory: null,
        previousLines: []
      });
      const labels = result.systemBlocks.map(b => b.label);
      assert.ok(!labels.includes('lorebook'));
    });
  });

  describe('getPreviousLines', () => {
    it('extracts speaker lines from cached dialogue', () => {
      const lines = getPreviousLines(validBefriendDialogue);
      assert.ok(lines.includes('友達になろう！'));
      assert.ok(lines.includes('仲間だね！'));
      assert.strictEqual(lines.length, 3);
    });

    it('returns empty for null', () => {
      assert.deepStrictEqual(getPreviousLines(null), []);
    });
  });

  describe('getMemorySnapshot', () => {
    it('extracts befriendAttempts', () => {
      const snap = getMemorySnapshot({
        counters: { befriendAttempts: 3 },
        flags: { befriended: true }
      });
      assert.deepStrictEqual(snap, { befriendAttempts: 3, befriended: true });
    });

    it('handles missing counters', () => {
      const snap = getMemorySnapshot({});
      assert.strictEqual(snap.befriendAttempts, 0);
      assert.strictEqual(snap.befriended, false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/entity-types/creature.test.js`
Expected: FAIL

**Step 3: Implement creature.js**

Replace the stub in `src/narration-engine/entity-types/creature.js`. Key elements:

- `cachePrefix = 'creature-dialogue-cache'`
- `memoryPrefix = 'creature-memory'`
- `requiredCardFields = ['id', 'name', 'nameEn', 'personality']`
- `validateShape(obj)` — 3 rounds, each with `speaker` (string), `options` (array of 3 strings), `correctIndex` (0-2)
- `extractStrings(dialogue)` — extracts `rounds[i].speaker` + `rounds[i].options[j]` = 12 fields
- `buildRepairInstruction(violations)` — same pattern as NPC but references befriend JSON schema (speaker/options/correctIndex)
- `assemblePrompt({characterCard, vocabWords, jlptLevel, memory, previousLines})`:
  - Layer 1 (instructions): i+1 rules for wild creature befriend dialogue
  - Layer 2 (vocab): shared `buildVocabSection`
  - Layer 3 (character): creature name, element, personality, quirk, archetype, example dialogue
  - Layer 4 (memory): befriend attempt count (if any)
  - Layer 5 (anti-repetition): previous speaker lines
  - User prompt: befriend quiz JSON schema
- `getPreviousLines(cached)` — extracts all `rounds[i].speaker` strings
- `getMemorySnapshot(mem)` — returns `{ befriendAttempts, befriended }`

Import `buildVocabSection` from `../vocab-constraints.js`.

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/narration-engine/entity-types/creature.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/narration-engine/entity-types/creature.js tests/unit/narration-engine/entity-types/creature.test.js
git commit -m "feat: create creature entity type for befriend dialogue"
```

---

### Task 4: Make character-cards.js support multiple entity types

**Files:**
- Modify: `src/narration-engine/character-cards.js`
- Modify: `tests/unit/narration-engine/character-cards.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/narration-engine/character-cards.test.js`:

```js
describe('loadCharacterCards with type', () => {
  it('loads NPC cards with type=npc', () => {
    const cards = loadCharacterCards('npc');
    assert.strictEqual(Object.keys(cards).length, 10);
  });

  it('defaults to npc when no type', () => {
    const cards = loadCharacterCards();
    assert.strictEqual(Object.keys(cards).length, 10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/character-cards.test.js`
Expected: FAIL — `loadCharacterCards` doesn't accept a type parameter yet

**Step 3: Update character-cards.js**

Current: `loadCharacterCards()` loads only `data/character-cards/npcs.json` from a single `_cache`.

Change to: `loadCharacterCards(type = 'npc')` that loads from `data/character-cards/{type}s.json` with per-type caches.

```js
const _caches = {};

export function loadCharacterCards(type = 'npc') {
  if (!_caches[type]) {
    const cardsPath = join(__dirname, `../../data/character-cards/${type}s.json`);
    _caches[type] = JSON.parse(readFileSync(cardsPath, 'utf8'));
  }
  return _caches[type];
}

export function getCharacterCard(id, type = 'npc') {
  const cards = loadCharacterCards(type);
  return cards[id] || null;
}
```

Note: NPC file is `npcs.json`, creature file will be `creatures.json`. The `s` suffix maps `npc` → `npcs.json`, `creature` → `creatures.json`.

Update `validateCard` to accept entity type and use the type's `requiredCardFields`:

```js
import { getEntityType } from './entity-types/index.js';

export function validateCard(card, type = 'npc') {
  const errors = [];
  if (!card) return { valid: false, errors: ['card is null'] };
  const { requiredCardFields } = getEntityType(type);
  for (const field of requiredCardFields) {
    if (!card[field]) errors.push(`missing ${field}`);
  }
  return { valid: errors.length === 0, errors };
}
```

**Step 4: Run tests**

Run: `node --test tests/unit/narration-engine/character-cards.test.js`
Expected: PASS (existing tests work with default type)

Run: `npm run test:unit`
Expected: Same results as before

**Step 5: Commit**

```bash
git add src/narration-engine/character-cards.js tests/unit/narration-engine/character-cards.test.js
git commit -m "feat: make character-cards.js support multiple entity types"
```

---

### Task 5: Make generation.js dispatch to entity type

**Files:**
- Modify: `src/narration-engine/generation.js`
- Modify: `tests/unit/narration-engine/generation.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/narration-engine/generation.test.js`:

```js
import { validateBefriendShape } from '../../../src/narration-engine/generation.js';

// Add alongside existing tests:
describe('validateBefriendShape (creature type)', () => {
  const validBefriend = {
    rounds: [
      { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
      { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
      { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
    ]
  };

  it('accepts valid befriend dialogue', () => {
    const result = validateBefriendShape(validBefriend);
    assert.strictEqual(result.valid, true);
  });
});
```

Actually, simpler: just make `generateDialogue` accept an optional `entityType` param so it uses the correct validator.

Add test for `generateDialogue` with `entityType: 'creature'`:

```js
describe('generateDialogue with entityType', () => {
  const validBefriend = {
    rounds: [
      { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
      { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
      { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
    ]
  };

  it('validates creature shape when entityType is creature', async () => {
    const mockChat = async () => JSON.stringify(validBefriend);
    const result = await generateDialogue({
      chatFn: mockChat,
      systemPrompt: 'test',
      userPrompt: 'test',
      aiConfig: { provider: 'openai', apiKey: 'test' },
      entityType: 'creature'
    });
    assert.ok(result);
    assert.strictEqual(result.rounds.length, 3);
    assert.ok(result.rounds[0].speaker);
  });

  it('rejects NPC shape when entityType is creature', async () => {
    const npcDialogue = {
      greeting: 'やあ', defeatLine: 'うう', freedLine: 'ありがとう',
      rounds: [
        { npcLine: 'こんにちは', options: [{ text: 'はい', tone: 'positive' }, { text: 'まあ', tone: 'neutral' }, { text: 'いいえ', tone: 'negative' }] },
        { npcLine: '元気？', options: [{ text: 'うん', tone: 'positive' }, { text: 'まあまあ', tone: 'neutral' }, { text: '別に', tone: 'negative' }] },
        { npcLine: 'また', options: [{ text: 'もちろん', tone: 'positive' }, { text: 'いつか', tone: 'neutral' }, { text: 'いらない', tone: 'negative' }] }
      ]
    };
    const mockChat = async () => JSON.stringify(npcDialogue);
    const result = await generateDialogue({
      chatFn: mockChat,
      systemPrompt: 'test',
      userPrompt: 'test',
      aiConfig: { provider: 'openai', apiKey: 'test' },
      entityType: 'creature',
      maxRetries: 0
    });
    assert.strictEqual(result, null);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/generation.test.js`
Expected: FAIL — `generateDialogue` doesn't accept `entityType`

**Step 3: Update generation.js**

Add `entityType` param to `generateDialogue`. Import `getEntityType` and dispatch `validateDialogueShape` based on type:

```js
import { getEntityType } from './entity-types/index.js';

export async function generateDialogue({
  chatFn, systemPrompt, systemBlocks, userPrompt, aiConfig,
  maxRetries = 2, entityType = 'npc'
}) {
  const { validateShape } = getEntityType(entityType);
  // ... existing retry loop, but use validateShape instead of validateDialogueShape
}
```

Keep the existing `validateDialogueShape` export for backward compatibility (it's imported by dialogue-repair.js and tests). It becomes a thin wrapper:

```js
export function validateDialogueShape(obj) {
  return getEntityType('npc').validateShape(obj);
}
```

**Step 4: Run all tests**

Run: `node --test tests/unit/narration-engine/generation.test.js`
Expected: PASS

Run: `npm run test:unit`
Expected: Same results (existing callers still work)

**Step 5: Commit**

```bash
git add src/narration-engine/generation.js tests/unit/narration-engine/generation.test.js
git commit -m "feat: make generateDialogue dispatch shape validation by entity type"
```

---

### Task 6: Make dialogue-repair.js dispatch to entity type

**Files:**
- Modify: `src/narration-engine/dialogue-repair.js`
- Modify: `tests/unit/narration-engine/dialogue-repair.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/narration-engine/dialogue-repair.test.js`:

```js
describe('creature entity type support', () => {
  const validBefriend = {
    rounds: [
      { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
      { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
      { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
    ]
  };

  it('extractDialogueStrings extracts 12 fields for creature type', () => {
    const entries = extractDialogueStrings(validBefriend, 'creature');
    assert.strictEqual(entries.length, 12);
  });

  it('validateDialogueVocab works with creature strings', async () => {
    const cleanCheck = async () => ({ unknownWords: [], count: 0 });
    const violations = await validateDialogueVocab(validBefriend, cleanCheck, 'creature');
    assert.strictEqual(violations.length, 0);
  });

  it('enforceDialogueVocab repairs creature dialogue', async () => {
    let callCount = 0;
    const checkFn = async (text) => {
      callCount++;
      if (callCount <= 12 && text === 'BAD') {
        return { unknownWords: ['未知1', '未知2'], count: 2 };
      }
      return { unknownWords: [], count: 0 };
    };
    const repaired = { ...validBefriend };
    repaired.rounds = repaired.rounds.map(r => ({ ...r }));
    repaired.rounds[0] = { ...repaired.rounds[0], speaker: 'いい台詞' };
    const mockChat = async () => JSON.stringify(repaired);

    const dirty = { ...validBefriend };
    dirty.rounds = dirty.rounds.map(r => ({ ...r }));
    dirty.rounds[0] = { ...dirty.rounds[0], speaker: 'BAD' };

    const result = await enforceDialogueVocab({
      dialogue: dirty,
      checkViolationsFn: checkFn,
      chatFn: mockChat,
      systemPrompt: 'sys',
      userPrompt: 'usr',
      aiConfig: {},
      entityType: 'creature'
    });
    assert.strictEqual(result.repaired, true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/dialogue-repair.test.js`
Expected: FAIL

**Step 3: Update dialogue-repair.js**

Add `entityType` param to `extractDialogueStrings`, `validateDialogueVocab`, `buildRepairInstruction`, and `enforceDialogueVocab`. Dispatch to entity type's functions:

```js
import { getEntityType } from './entity-types/index.js';

export function extractDialogueStrings(dialogue, entityType = 'npc') {
  return getEntityType(entityType).extractStrings(dialogue);
}

export async function validateDialogueVocab(dialogue, checkFn, entityType = 'npc') {
  if (!checkFn) return [];
  const entries = extractDialogueStrings(dialogue, entityType);
  // ... same logic
}

export function buildRepairInstruction(violations, entityType = 'npc') {
  return getEntityType(entityType).buildRepairInstruction(violations);
}

export async function enforceDialogueVocab({
  dialogue, checkViolationsFn, chatFn, systemPrompt, systemBlocks,
  userPrompt, aiConfig, maxAttempts = 3, entityType = 'npc'
}) {
  // ... same logic, but pass entityType to validateDialogueVocab,
  // buildRepairInstruction, and validateDialogueShape
}
```

The repair loop in `enforceDialogueVocab` also calls `parseDialogueJson` and `validateDialogueShape` during repair. Update those calls to pass `entityType`:

```js
const { validateShape } = getEntityType(entityType);
// ... in the repair loop:
const shapeCheck = validateShape(parsed);
```

**Step 4: Run all tests**

Run: `node --test tests/unit/narration-engine/dialogue-repair.test.js`
Expected: PASS

Run: `npm run test:unit`
Expected: Same results

**Step 5: Commit**

```bash
git add src/narration-engine/dialogue-repair.js tests/unit/narration-engine/dialogue-repair.test.js
git commit -m "feat: make dialogue-repair dispatch by entity type"
```

---

### Task 7: Make TextCache and NpcMemory support entity type prefixes

**Files:**
- Modify: `src/narration-engine/text-cache.js`
- Modify: `src/narration-engine/npc-memory.js`
- Modify: `tests/unit/narration-engine/text-cache.test.js`
- Modify: `tests/unit/narration-engine/npc-memory.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/narration-engine/text-cache.test.js`:

```js
describe('TextCache with entityType', () => {
  it('uses creature prefix for creature type', () => {
    const cache = new TextCache({ userId: 'test', entityType: 'creature', inMemory: true });
    assert.ok(cache); // Just verify construction works
  });

  it('getPreviousLines dispatches to entity type', () => {
    const cache = new TextCache({ entityType: 'creature', inMemory: true });
    const befriendDialogue = {
      rounds: [
        { speaker: '友達になろう！', options: ['うん！', '魚。', '靴。'], correctIndex: 0 },
        { speaker: '遊ぼう！', options: ['テレビ。', 'いいね！', '車。'], correctIndex: 1 },
        { speaker: '仲間！', options: ['暑い。', 'ない。', 'ずっと仲間！'], correctIndex: 2 }
      ]
    };
    cache.set('kamedor', befriendDialogue);
    const lines = cache.getPreviousLines('kamedor');
    assert.ok(lines.includes('友達になろう！'));
    assert.strictEqual(lines.length, 3);
  });

  it('isStale uses entity type memory snapshot', () => {
    const cache = new TextCache({ entityType: 'creature', inMemory: true });
    cache.set('kamedor', {
      vocabSnapshot: 100,
      memorySnapshot: { befriendAttempts: 1, befriended: false },
      rounds: []
    });
    // Same memory = not stale
    assert.strictEqual(cache.isStale('kamedor', 100, { befriendAttempts: 1, befriended: false }), false);
    // Memory changed = stale
    assert.strictEqual(cache.isStale('kamedor', 100, { befriendAttempts: 2, befriended: false }), true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/text-cache.test.js`
Expected: FAIL — TextCache doesn't accept entityType

**Step 3: Update TextCache**

Add `entityType` to constructor. Use it for:
1. File path: `dataPath(\`${prefix}-${userId}.json\`)`  where `prefix = getEntityType(entityType).cachePrefix`
2. `getPreviousLines()`: dispatch to `getEntityType(entityType).getPreviousLines(cached)`
3. `isStale()`: compare memory snapshot fields generically (deep-equal the snapshot object instead of checking specific fields)

```js
import { getEntityType } from './entity-types/index.js';

export class TextCache {
  constructor({ userId, entityType = 'npc', inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._entityType = entityType;
    this._data = {};

    if (!inMemory && userId) {
      const { cachePrefix } = getEntityType(entityType);
      this._filePath = dataPath(`${cachePrefix}-${userId}.json`);
      this._load();
    }
  }

  // ... get/set/remove/clear/getAll unchanged ...

  isStale(entityId, currentVocabCount, currentMemorySnapshot) {
    const cached = this._data[entityId];
    if (!cached) return true;
    if (isVocabStale(cached.vocabSnapshot || 0, currentVocabCount)) return true;

    // Generic memory snapshot comparison
    const snap = cached.memorySnapshot || {};
    for (const key of Object.keys(currentMemorySnapshot)) {
      if (snap[key] !== currentMemorySnapshot[key]) return true;
    }
    return false;
  }

  getPreviousLines(entityId) {
    const cached = this._data[entityId];
    if (!cached) return [];
    return getEntityType(this._entityType).getPreviousLines(cached);
  }
}
```

Also update `NpcMemory` in `npc-memory.js` to accept `entityType` for file prefix:

```js
constructor({ userId, entityType = 'npc', inMemory = false } = {}) {
  // ...
  if (!inMemory && userId) {
    const { memoryPrefix } = getEntityType(entityType);
    this._filePath = dataPath(`${memoryPrefix}-${userId}.json`);
    this._load();
  }
}
```

**Step 4: Run all tests**

Run: `node --test tests/unit/narration-engine/text-cache.test.js`
Expected: PASS

Run: `node --test tests/unit/narration-engine/npc-memory.test.js`
Expected: PASS

Run: `npm run test:unit`
Expected: Same results

**Step 5: Commit**

```bash
git add src/narration-engine/text-cache.js src/narration-engine/npc-memory.js tests/unit/narration-engine/text-cache.test.js tests/unit/narration-engine/npc-memory.test.js
git commit -m "feat: make TextCache and NpcMemory support entity type prefixes"
```

---

### Task 8: Make index.js accept entityType on all public functions

This is the main integration: the narration engine's public API now supports creatures.

**Files:**
- Modify: `src/narration-engine/index.js`
- Modify: `tests/unit/narration-engine/index.test.js`

**Step 1: Write the failing test**

Add to `tests/unit/narration-engine/index.test.js`:

```js
describe('creature entity type support', () => {
  it('getDialogueFromCache accepts entityType', () => {
    const result = getDialogueFromCache('test-user-creature', 'kamedor', 'creature');
    assert.strictEqual(result, null);
  });

  it('logEncounter accepts entityType', () => {
    assert.doesNotThrow(() => {
      logEncounter('test-user-creature-log', 'kamedor', 'befriend-attempt', 'Tried to befriend', 'creature');
    });
  });

  it('setMemoryFlag accepts entityType', () => {
    assert.doesNotThrow(() => {
      setMemoryFlag('test-user-creature-flag', 'kamedor', 'befriended', true, 'creature');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/narration-engine/index.test.js`
Expected: FAIL

**Step 3: Update index.js**

Key changes:
1. Cache and memory maps become keyed by `userId:entityType` instead of just `userId`
2. All public functions gain `entityType` param (default `'npc'`)
3. `generateAndCache` uses entity type for prompt assembly, shape validation, and memory snapshots
4. `queueMissingDialogues` loads cards by type

```js
const _memories = new Map();
const _caches = new Map();

function getMemory(userId, entityType = 'npc') {
  const key = `${userId}:${entityType}`;
  if (!_memories.has(key)) {
    _memories.set(key, new NpcMemory({ userId, entityType }));
  }
  return _memories.get(key);
}

function getCache(userId, entityType = 'npc') {
  const key = `${userId}:${entityType}`;
  if (!_caches.has(key)) {
    _caches.set(key, new TextCache({ userId, entityType }));
  }
  return _caches.get(key);
}

export function getDialogueFromCache(userId, entityId, entityType = 'npc') {
  return getCache(userId, entityType).get(entityId);
}

export async function queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, entityType = 'npc') {
  const vocab = vocabContext?.words || vocabContext || [];
  const vocabCount = Array.isArray(vocab) ? vocab.length : 0;
  const cards = loadCharacterCards(entityType === 'creature' ? 'creature' : 'npc');
  const entityIds = Object.keys(cards);
  const cache = getCache(userId, entityType);
  const memory = getMemory(userId, entityType);
  const { getMemorySnapshot } = getEntityType(entityType);

  const toGenerate = [];
  for (const id of entityIds) {
    const mem = memory.getMemory(id);
    const memSnap = getMemorySnapshot(mem);
    if (cache.isStale(id, vocabCount, memSnap)) {
      toGenerate.push(id);
    }
  }
  // ... same batch logic with CONCURRENCY = 3
}
```

Update `generateAndCache` to use entity type for prompt assembly and shape validation:

```js
async function generateAndCache(userId, entityId, chatFn, aiConfig, vocabContext, entityType = 'npc') {
  const card = getCharacterCard(entityId, entityType === 'creature' ? 'creature' : 'npc');
  // ...
  const entityTypeDef = getEntityType(entityType);

  // Use entity type's assemblePrompt
  const { systemBlocks, userPrompt } = entityTypeDef.assemblePrompt({
    characterCard: card,
    vocabWords: vocab,
    jlptLevel: aiConfig.jlptLevel || 'N4',
    memory: mem,
    npcState,  // NPC type uses this; creature type ignores it
    previousLines: cache.getPreviousLines(entityId)
  });

  // Generate with entity-type-specific validation
  const dialogue = await generateDialogue({
    chatFn, systemPrompt, systemBlocks, userPrompt, aiConfig,
    entityType
  });

  // Vocab repair with entity-type-specific string extraction
  const { dialogue: repairedDialogue, repaired, attempts, violations } =
    await enforceDialogueVocab({
      dialogue, checkViolationsFn, chatFn,
      systemPrompt, systemBlocks, userPrompt, aiConfig,
      entityType
    });

  // Cache with entity-type-specific memory snapshot
  cache.set(entityId, {
    ...repairedDialogue,
    entityId,
    entityType,
    generatedAt: new Date().toISOString(),
    vocabSnapshot: vocab.length,
    memorySnapshot: entityTypeDef.getMemorySnapshot(mem)
  });
}
```

**Step 4: Run all tests**

Run: `node --test tests/unit/narration-engine/index.test.js`
Expected: PASS

Run: `npm run test:unit`
Expected: Same results (all defaulting to 'npc' preserves existing behavior)

**Step 5: Commit**

```bash
git add src/narration-engine/index.js tests/unit/narration-engine/index.test.js
git commit -m "feat: make narration engine public API accept entityType parameter"
```

---

### Task 9: Generate creature character cards

Use AI subagents to generate character cards from `data/creatures.json`. Save to `data/character-cards/creatures.json`.

**Files:**
- Create: `data/character-cards/creatures.json`

**Step 1: Write a generation script**

Create a temporary script `scripts/_generate-creature-cards.mjs` that:
1. Reads `data/creatures.json`
2. For each creature, generates personality, quirk, exampleDialogue from the creature's element, archetype, description, baseWord, and modifier
3. Uses Opus subagents (or just constructs programmatically from templates) to generate rich personality text
4. Saves to `data/character-cards/creatures.json`

The card shape for each creature:
```json
{
  "id": "kamedor",
  "name": "カメドル",
  "nameEn": "Kamedor",
  "element": "water",
  "archetype": "Tank/Healer",
  "personality": "...",
  "quirk": "...",
  "description": "...",
  "exampleDialogue": ["...", "..."]
}
```

**Step 2: Run the generation script**

Run: `node scripts/_generate-creature-cards.mjs`

**Step 3: Verify the output**

Check: `data/character-cards/creatures.json` exists and has 37 entries, each with required fields.

**Step 4: Update character-cards.test.js**

Add test:
```js
describe('creature cards', () => {
  it('loads creature cards with type=creature', () => {
    const cards = loadCharacterCards('creature');
    assert.ok(Object.keys(cards).length >= 37);
  });

  it('all creature cards have required fields', () => {
    const cards = loadCharacterCards('creature');
    for (const [id, card] of Object.entries(cards)) {
      assert.ok(card.id, `${id} missing id`);
      assert.ok(card.name, `${id} missing name`);
      assert.ok(card.personality, `${id} missing personality`);
    }
  });
});
```

**Step 5: Commit**

```bash
git add data/character-cards/creatures.json tests/unit/narration-engine/character-cards.test.js
git commit -m "feat: add AI-generated creature character cards for 37 creatures"
```

---

### Task 10: Update server.js wiring

Replace befriend-dialogue-service imports with narration engine calls.

**Files:**
- Modify: `server.js` (lines 130-135, 374-384)

**Step 1: Remove befriend-dialogue-service imports**

In `server.js`, remove lines 130-135:
```js
// DELETE these imports:
import { generateBefriendConversation } from './src/game/services/robot-combat-service.js';
import {
  getDialogueForRobot,
  generateMissingDialogues,
  regenerateRobotDialogue
} from './src/game/services/befriend-dialogue-service.js';
```

Also remove the `generateBefriendConversation` import from robot-combat-service (line 130).

**Step 2: Replace dependency injection**

In `server.js` deps object (~lines 374-384), replace the befriend deps with narration engine calls that pass `entityType: 'creature'`:

```js
// DELETE these:
// generateBefriendConversationFn, getDialogueForRobot,
// generateMissingDialoguesFn, regenerateRobotDialogueFn

// REPLACE with:
getCreatureDialogueFromCache: (userId, creatureId) =>
  getNpcDialogueFromCache(userId, creatureId, 'creature'),
queueMissingCreatureDialoguesFn: async (userId, aiConfig, vocabContext) =>
  queueNpcDialogues(userId, chat, aiConfig, vocabContext, 'creature'),
regenCreatureDialogueFn: async (userId, creatureId, aiConfig, vocabContext) =>
  regenNpcDialogue(userId, creatureId, chat, aiConfig, vocabContext, 'creature'),
```

Note: The narration engine imports (lines 136-145) now need the `'creature'` variants, which they already support via the `entityType` parameter added in Task 8. The existing NPC imports with aliases remain unchanged.

**Step 3: Syntax check**

Run: `node --check server.js && echo "OK"`

**Step 4: Commit**

```bash
git add server.js
git commit -m "refactor: replace befriend-dialogue-service deps with narration engine creature type"
```

---

### Task 11: Update route dependency injection chain

**Files:**
- Modify: `src/routes/game/index.js` (lines 61-89)

**Step 1: Update run route deps**

In `src/routes/game/index.js`, the run routes currently receive `generateMissingDialoguesFn`. Replace with `queueMissingCreatureDialoguesFn`:

```js
// In createRunRoutes call, replace:
//   generateMissingDialoguesFn: deps.generateMissingDialoguesFn,
// With:
queueMissingCreatureDialoguesFn: deps.queueMissingCreatureDialoguesFn,
```

**Step 2: Update combat route deps**

In the `createCombatRoutes` call, replace befriend deps:

```js
// REMOVE:
// generateBefriendConversationFn, getDialogueForRobot, regenerateRobotDialogueFn

// ADD:
getCreatureDialogueFromCache: deps.getCreatureDialogueFromCache,
regenCreatureDialogueFn: deps.regenCreatureDialogueFn,
```

**Step 3: Syntax check**

Run: `node --check src/routes/game/index.js && echo "OK"`

**Step 4: Commit**

```bash
git add src/routes/game/index.js
git commit -m "refactor: update route dep injection for creature dialogue"
```

---

### Task 12: Update combat routes for creature dialogue

**Files:**
- Modify: `src/routes/game/combat.js` (lines 13-25, 27-43, 241-315, 318-349)

**Step 1: Update constructor deps**

In the route factory function, replace the old befriend deps:

```js
// Old deps to remove:
// generateBefriendConversationFn, getDialogueForRobot, regenerateRobotDialogueFn

// New deps:
// getCreatureDialogueFromCache, regenCreatureDialogueFn
```

**Step 2: Update POST /befriend-conversation (lines 241-315)**

Replace the cache lookup and fallback:

```js
// Old (lines 271-288):
// let rounds = getDialogueForRobot(req.user.id, target.id)?.rounds;
// if (!rounds) { rounds = await generateBefriendConversationFn(...); }

// New:
let cached = getCreatureDialogueFromCache(req.user.id, target.id);
if (!cached?.rounds) {
  // On-demand generation via narration engine
  await regenCreatureDialogueFn(
    req.user.id, target.id, aiConfig,
    { words: vocabulary, checkViolationsFn: checkSentenceViolations ? ... : null }
  );
  cached = getCreatureDialogueFromCache(req.user.id, target.id);
}
const rounds = cached?.rounds;
if (!rounds) {
  return res.status(503).json({ error: 'Creature dialogue generation failed' });
}
```

The client response still strips `correctIndex` from rounds before sending.

**Step 3: Update POST /befriend-answer (lines 318-349)**

Replace the background regeneration trigger:

```js
// Old (line 339):
// triggerDialogueRegen(target, aiConfig, vocabulary)

// New:
regenCreatureDialogueFn(
  req.user.id, target.id, aiConfig,
  { words: vocabulary, checkViolationsFn: ... }
).catch(e => logger.error('[CreatureDialogue] Background regen failed', e.message));
```

**Step 4: Remove the triggerDialogueRegen helper (lines 13-25)**

Delete the old helper function that called `regenerateRobotDialogueFn`.

**Step 5: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`

**Step 6: Commit**

```bash
git add src/routes/game/combat.js
git commit -m "refactor: use narration engine for befriend dialogue in combat routes"
```

---

### Task 13: Update run routes for creature dialogue

**Files:**
- Modify: `src/routes/game/run.js` (lines 49-78)

**Step 1: Update queueBackgroundDialogues**

Replace the befriend batch call:

```js
// Old (lines 61-66):
// generateMissingDialoguesFn(userId, aiConfig, vocabulary)

// New:
queueMissingCreatureDialoguesFn(userId, aiConfig, { words: vocabulary, checkViolationsFn })
  .catch(e => logger.error('[CreatureDialogue] Background bulk generation failed', e.message));
```

The `checkViolationsFn` needs to be built here, same as NPC dialogues use. It should use `checkSentenceViolations` bound with the user's JPDB context:

```js
const checkViolationsFn = checkSentenceViolations
  ? (text) => checkSentenceViolations(text, userId)
  : null;
const vocabContext = { words: vocabulary, checkViolationsFn };

// Queue creature dialogues
queueMissingCreatureDialoguesFn(userId, aiConfig, vocabContext)
  .catch(e => logger.error('[CreatureDialogue] Background generation failed', e.message));

// Queue NPC dialogues (existing, unchanged)
queueMissingNpcDialoguesFn(userId, aiConfig, vocabContext)
  .catch(e => logger.error('[NpcDialogue] Background generation failed', e.message));
```

**Step 2: Update constructor to receive new dep**

The run route factory receives `queueMissingCreatureDialoguesFn` instead of `generateMissingDialoguesFn`.

**Step 3: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "refactor: use narration engine for creature dialogue batch generation"
```

---

### Task 14: Delete befriend-dialogue-service and dead code

**Files:**
- Delete: `src/game/services/befriend-dialogue-service.js`
- Delete: `tests/unit/befriend-dialogue-service.test.js`
- Delete: `data/befriend-conversations.json`
- Modify: `src/game/services/robot-combat-service.js` (remove generateBefriendConversation and getStaticConversation)

**Step 1: Delete the files**

```bash
rm src/game/services/befriend-dialogue-service.js
rm tests/unit/befriend-dialogue-service.test.js
rm data/befriend-conversations.json
```

**Step 2: Remove dead functions from robot-combat-service.js**

Delete `generateBefriendConversation` (lines 621-658) and `getStaticConversation` (lines 761-777) from robot-combat-service.js. Remove any imports these functions used that are now unused.

Also remove the `export` of `generateBefriendConversation` if it was exported.

**Step 3: Syntax check all modified files**

```bash
node --check src/game/services/robot-combat-service.js && echo "OK"
node --check server.js && echo "OK"
```

**Step 4: Run all unit tests**

Run: `npm run test:unit`
Expected: Tests pass. The deleted befriend-dialogue-service tests no longer run. Existing narration engine tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete befriend-dialogue-service and stale static fallback"
```

---

### Task 15: Integration smoke test

**Step 1: Start the server**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: 200

**Step 2: Run unit tests**

```bash
npm run test:unit
```
Expected: PASS (minus the pre-existing failures noted in CLAUDE.md)

**Step 3: Verify creature cards load**

```bash
node -e "
  import { loadCharacterCards } from './src/narration-engine/character-cards.js';
  const cards = loadCharacterCards('creature');
  console.log('Creature cards:', Object.keys(cards).length);
  console.log('First:', Object.keys(cards)[0]);
"
```
Expected: `Creature cards: 37`

**Step 4: Verify entity type registry**

```bash
node -e "
  import { getEntityType, listEntityTypes } from './src/narration-engine/entity-types/index.js';
  console.log('Types:', listEntityTypes());
  const ct = getEntityType('creature');
  console.log('Creature cachePrefix:', ct.cachePrefix);
  console.log('Creature validateShape valid:', ct.validateShape({
    rounds: [
      { speaker: 'a', options: ['b','c','d'], correctIndex: 0 },
      { speaker: 'e', options: ['f','g','h'], correctIndex: 1 },
      { speaker: 'i', options: ['j','k','l'], correctIndex: 2 }
    ]
  }).valid);
"
```
Expected: Types include npc and creature, valid = true

**Step 5: Commit any fixes**

If anything broke, fix it and commit.

---

### Summary of files created/modified/deleted

**Created:**
- `src/narration-engine/entity-types/index.js` — Registry
- `src/narration-engine/entity-types/npc.js` — NPC type (extracted)
- `src/narration-engine/entity-types/creature.js` — Creature type (new)
- `data/character-cards/creatures.json` — 37 creature character cards
- `tests/unit/narration-engine/entity-types/registry.test.js`
- `tests/unit/narration-engine/entity-types/npc.test.js`
- `tests/unit/narration-engine/entity-types/creature.test.js`

**Modified:**
- `src/narration-engine/index.js` — entityType param on all public functions
- `src/narration-engine/character-cards.js` — multi-type card loading
- `src/narration-engine/generation.js` — type-dispatched shape validation
- `src/narration-engine/dialogue-repair.js` — type-dispatched string extraction/repair
- `src/narration-engine/text-cache.js` — type-prefixed cache files, generic staleness
- `src/narration-engine/npc-memory.js` — type-prefixed memory files
- `src/routes/game/combat.js` — use narration engine for befriend
- `src/routes/game/run.js` — use narration engine for creature batch
- `src/routes/game/index.js` — updated dep injection
- `server.js` — replaced befriend deps with narration engine creature type
- `src/game/services/robot-combat-service.js` — removed dead befriend functions

**Deleted:**
- `src/game/services/befriend-dialogue-service.js`
- `tests/unit/befriend-dialogue-service.test.js`
- `data/befriend-conversations.json`
