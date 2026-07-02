# Area 4 — Morning Ranch (朝の牧場) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Morning Ranch as the game's 4th area — Light Horse (hikarino-uma) boss, 11 spawn creatures, 4 NPCs, 4 NPC skills, 12 items, dialogue frames, and battle backgrounds — making the light-horse fusion recipe reachable.

**Architecture:** Pure content addition following the School pattern: append one entry to `data/areas.json` (sequential unlock, boss room, and fusion-recipe gating all key off array order — zero engine changes), then add NPC/skill/item/dialogue data rows that existing services pick up by their `area` field. This plan doubles as the canonical template for Areas 5–12 (see final appendix).

**Tech Stack:** Node 24 + ES modules, `node --test` unit tests, Sudachi tokenizer pipeline (`scripts/tokenize-static.js`), ComfyUI for background art.

**Specs (source of truth for all words/data):**
- `docs/superpowers/specs/2026-07-02-fusion-boss-area-roadmap-design.md`
- `docs/superpowers/specs/2026-07-02-area-content-ledger-design.md`

## Global Constraints

- Work in a feature worktree off `dev` (`git worktree add ../koto-wt-morning-ranch -b feature/area-4-morning-ranch`), per CLAUDE.md.
- Never edit `data/dialogue/frames.json` by hand — author `frame-sources.json`, then run `node scripts/tokenize-static.js`.
- Never add/change `data/live-dictionary.json` (or any dictionary) entries without explicit user confirmation — if `scripts/validate-dialogue.js` reports missing words, STOP and present the list to the user.
- Write all raw Japanese in kanji (the pipeline derives readings).
- English glosses must be dictionary-accurate, primary sense first (CLAUDE.md).
- All 12 item words, 4 NPC words, 4 skill words, readings, ranks, and glosses come verbatim from the content ledger — do not re-invent.
- `npm test` (Tier 1 + 2) must pass before merge.
- After regenerating any background asset, bump `BACKGROUND_VERSION` in `src/shared/asset-versions.js`.
- Commit after every task.

---

### Task 1: Area entry + data-contract test

**Files:**
- Create: `tests/unit/game/morning-ranch-area.test.js`
- Modify: `data/areas.json` (append after the `school` entry)
- Modify: `tests/unit/game/boss-locked-fusion-roster.test.js:16` (placement whitelist)

**Interfaces:**
- Produces: area id `"morning-ranch"` at array index 3 — every later task's `area` field references this id. Boss `hikarino-uma` becomes reachable; `hasDefeatedBoss` unlocks recipe `light-horse` automatically via array position (`highestUnlocked >= 3 + 2`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/game/morning-ranch-area.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const areas = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/areas.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/creatures.json'), 'utf8'));
const creatureIds = new Set(creatures.map(c => c.id));

const EXPECTED_SPAWNS = [
  'hikari', 'uma', 'tsuchi', 'ushi', 'buta', 'hitsuji',
  'nezumi', 'kaeru', 'inu', 'tori', 'hana'
];

describe('morning-ranch area', () => {
  const area = areas.find(a => a.id === 'morning-ranch');

  it('exists at array index 3 (after school)', () => {
    assert.ok(area, 'morning-ranch missing from areas.json');
    assert.equal(areas.indexOf(area), 3);
  });

  it('has the approved names and teaching words', () => {
    assert.equal(area.name, '朝の牧場');
    assert.equal(area.nameEn, 'Morning Ranch');
    assert.equal(area.reading, 'あさのぼくじょう');
    assert.equal(area.modifierWord.word, '朝');
    assert.equal(area.locationWord.word, '牧場');
  });

  it('has the approved spawn pool and boss', () => {
    assert.deepEqual(area.creatures, EXPECTED_SPAWNS);
    assert.equal(area.bossCreatureId, 'hikarino-uma');
  });

  it('references only existing creatures', () => {
    for (const id of [...area.creatures, area.bossCreatureId]) {
      assert.ok(creatureIds.has(id), `unknown creature ${id}`);
    }
  });

  it('has run wiring fields', () => {
    assert.equal(area.roomCount, 30);
    assert.equal(area.stage, 1);
    assert.equal(area.parallaxId, 'morning-ranch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/morning-ranch-area.test.js`
Expected: FAIL — "morning-ranch missing from areas.json"

- [ ] **Step 3: Append the area entry to `data/areas.json`**

Append this object after the `school` entry (keep valid JSON — add a comma to the previous entry). Object-form `modifierWord`/`locationWord` follows the hajimari-no-hiroba precedent (the only existing modifier+location area):

```json
{
  "id": "morning-ranch",
  "name": "朝の牧場",
  "nameEn": "Morning Ranch",
  "reading": "あさのぼくじょう",
  "rank": 400,
  "particle": "の",
  "parallaxId": "morning-ranch",
  "modifierWord": {
    "word": "朝",
    "reading": "あさ",
    "meaning": "morning",
    "rank": 400
  },
  "locationWord": {
    "word": "牧場",
    "reading": "ぼくじょう",
    "meaning": "ranch / pasture",
    "rank": 13700
  },
  "theme": "A sunlit family ranch waking with the dawn, where farm creatures roam the pastures.",
  "creatures": [
    "hikari",
    "uma",
    "tsuchi",
    "ushi",
    "buta",
    "hitsuji",
    "nezumi",
    "kaeru",
    "inu",
    "tori",
    "hana"
  ],
  "bossCreatureId": "hikarino-uma",
  "roomCount": 30,
  "description": "A family-run ranch at the edge of the plains, busiest at sunrise.",
  "tags": [
    "ranch",
    "farm",
    "morning",
    "open"
  ],
  "subAreas": [],
  "background": "areas/morning-ranch/morning-ranch_01.webp",
  "stage": 1,
  "createdAt": "2026-07-02"
}
```

- [ ] **Step 4: Update the fusion placement whitelist**

In `tests/unit/game/boss-locked-fusion-roster.test.js` line 16, change:

```js
const ALLOWED_FUSION_AREA_PLACEMENTS = new Set(['school:boss:hanano-yousei']);
```

to:

```js
const ALLOWED_FUSION_AREA_PLACEMENTS = new Set([
  'school:boss:hanano-yousei',
  'morning-ranch:boss:hikarino-uma'
]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/unit/game/morning-ranch-area.test.js tests/unit/game/boss-locked-fusion-roster.test.js`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add data/areas.json tests/unit/game/morning-ranch-area.test.js tests/unit/game/boss-locked-fusion-roster.test.js
git commit -m "feat: add Morning Ranch area entry with Light Horse boss"
```

---

### Task 2: NPC skills

**Files:**
- Create: `tests/unit/game/morning-ranch-content.test.js`
- Modify: `data/npc-skills.json` (append 4 entries)

**Interfaces:**
- Produces: skill ids `sodateru`, `okosu`, `hakobu`, `tetsudau` — Task 3's NPCs reference these in their `skills` arrays.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/game/morning-ranch-content.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const skills = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npc-skills.json'), 'utf8'));

const EXPECTED_SKILLS = [
  { id: 'sodateru', name: '育てる', reading: 'そだてる' },
  { id: 'okosu', name: '起こす', reading: 'おこす' },
  { id: 'hakobu', name: '運ぶ', reading: 'はこぶ' },
  { id: 'tetsudau', name: '手伝う', reading: 'てつだう' }
];

describe('morning-ranch npc skills', () => {
  for (const expected of EXPECTED_SKILLS) {
    it(`defines ${expected.id}`, () => {
      const skill = skills.find(s => s.id === expected.id);
      assert.ok(skill, `${expected.id} missing`);
      assert.equal(skill.name, expected.name);
      assert.equal(skill.reading, expected.reading);
      assert.ok(['damage', 'heal', 'buff'].includes(skill.category));
      assert.ok(Number.isFinite(skill.power));
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: FAIL — "sodateru missing"

- [ ] **Step 3: Append the 4 skills to `data/npc-skills.json`**

Same shape as the existing `asobu` entry (power 10 / mpCost 0 matches every existing NPC skill):

```json
{
  "id": "sodateru",
  "name": "育てる",
  "nameEn": "Raise",
  "reading": "そだてる",
  "meaning": "to raise / to bring up",
  "element": "neutral",
  "category": "buff",
  "target": "all_allies",
  "power": 0,
  "mpCost": 0,
  "description": "Nurtures allies, raising their spirits.",
  "statusEffect": null,
  "statusChance": 0,
  "statusDuration": 0
},
{
  "id": "okosu",
  "name": "起こす",
  "nameEn": "Wake Up",
  "reading": "おこす",
  "meaning": "to wake (someone) / to raise",
  "element": "neutral",
  "category": "damage",
  "target": "all_enemies",
  "power": 10,
  "mpCost": 0,
  "description": "A brisk wake-up call that startles all enemies.",
  "statusEffect": null,
  "statusChance": 0,
  "statusDuration": 0
},
{
  "id": "hakobu",
  "name": "運ぶ",
  "nameEn": "Carry",
  "reading": "はこぶ",
  "meaning": "to carry / to transport",
  "element": "neutral",
  "category": "damage",
  "target": "all_enemies",
  "power": 10,
  "mpCost": 0,
  "description": "Hauls a heavy load into the enemy line.",
  "statusEffect": null,
  "statusChance": 0,
  "statusDuration": 0
},
{
  "id": "tetsudau",
  "name": "手伝う",
  "nameEn": "Help Out",
  "reading": "てつだう",
  "meaning": "to help / to assist",
  "element": "neutral",
  "category": "heal",
  "target": "all_allies",
  "power": 10,
  "mpCost": 0,
  "description": "Lends a hand, restoring allies.",
  "statusEffect": null,
  "statusChance": 0,
  "statusDuration": 0
}
```

Note: `oboeru` (category `buff`) uses `power: 0` — mirror that for `sodateru`. Check `oboeru`'s `target` value in the file and copy it for `sodateru` if it differs from `all_allies`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/npc-skills.json tests/unit/game/morning-ranch-content.test.js
git commit -m "feat: add Morning Ranch NPC skills (sodateru, okosu, hakobu, tetsudau)"
```

---

### Task 3: NPCs

**Files:**
- Modify: `data/npcs.json` (add 4 keyed entries)
- Modify: `tests/unit/game/morning-ranch-content.test.js` (extend)

**Interfaces:**
- Consumes: skill ids from Task 2.
- Produces: NPC ids `nouka`, `okaasan`, `musume`, `ojiisan` with `area: "morning-ranch"` — `selectNpcForEncounter('morning-ranch', …)` in `src/game/services/npc-service.js:60` picks them up with no code change. Task 5's dialogue frames use groups named `<npcId>_fightStart` / `<npcId>_defeatLine`.

- [ ] **Step 1: Extend the test (failing)**

Append to `tests/unit/game/morning-ranch-content.test.js`:

```js
const npcs = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/npcs.json'), 'utf8'));

const EXPECTED_NPCS = [
  { key: 'nouka', name: '農家', reading: 'のうか', skill: 'sodateru' },
  { key: 'okaasan', name: 'お母さん', reading: 'おかあさん', skill: 'okosu' },
  { key: 'musume', name: '娘', reading: 'むすめ', skill: 'hakobu' },
  { key: 'ojiisan', name: 'おじいさん', reading: 'おじいさん', skill: 'tetsudau' }
];

describe('morning-ranch npcs', () => {
  for (const expected of EXPECTED_NPCS) {
    it(`defines ${expected.key}`, () => {
      const npc = npcs[expected.key];
      assert.ok(npc, `${expected.key} missing`);
      assert.equal(npc.area, 'morning-ranch');
      assert.equal(npc.name, expected.name);
      assert.equal(npc.reading, expected.reading);
      assert.deepEqual(npc.skills, [expected.skill]);
      assert.ok(Number.isFinite(npc.speakerId));
      assert.ok(npc.greeting.length > 0);
      assert.ok(npc.defeatLine.length > 0);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: FAIL — "nouka missing"

- [ ] **Step 3: Add the 4 NPC entries to `data/npcs.json`**

Top-level keys (School precedent: plain ids). `attack: 16` — one step above School's 14, matching the area's position. `speakerId` reuses the existing VOICEVOX palette (13 adult male, 10 adult female, 52 girl, 51 older male); audition via the TTS endpoint later if desired. Ranks/glosses from the ledger.

```json
"nouka": {
  "id": "nouka",
  "name": "農家",
  "nameEn": "Farmer",
  "speakerId": 13,
  "area": "morning-ranch",
  "reading": "のうか",
  "meaning": "farmer / farm family",
  "rank": 8100,
  "attack": 16,
  "skills": ["sodateru"],
  "personality": {
    "traits": ["hardworking", "proud"],
    "speechStyle": "Plain and warm.",
    "quirk": "Brags about the vegetables."
  },
  "greeting": "おはよう！",
  "shopGreetings": ["おはよう！"],
  "defeatLine": "ありがとう！",
  "createdAt": "2026-07-02"
},
"okaasan": {
  "id": "okaasan",
  "name": "お母さん",
  "nameEn": "Mother",
  "speakerId": 10,
  "area": "morning-ranch",
  "reading": "おかあさん",
  "meaning": "mother / mom",
  "rank": 1400,
  "attack": 16,
  "skills": ["okosu"],
  "personality": {
    "traits": ["caring", "brisk"],
    "speechStyle": "Kind but no-nonsense.",
    "quirk": "Wakes everyone at sunrise."
  },
  "greeting": "おはよう！",
  "shopGreetings": ["おはよう！"],
  "defeatLine": "また来てね！",
  "createdAt": "2026-07-02"
},
"musume": {
  "id": "musume",
  "name": "娘",
  "nameEn": "Daughter",
  "speakerId": 52,
  "area": "morning-ranch",
  "reading": "むすめ",
  "meaning": "daughter / (young) girl",
  "rank": 600,
  "attack": 16,
  "skills": ["hakobu"],
  "personality": {
    "traits": ["energetic", "curious"],
    "speechStyle": "Bright and quick.",
    "quirk": "Races the morning deliveries."
  },
  "greeting": "おはよう！",
  "shopGreetings": ["おはよう！"],
  "defeatLine": "楽しかった！",
  "createdAt": "2026-07-02"
},
"ojiisan": {
  "id": "ojiisan",
  "name": "おじいさん",
  "nameEn": "Grandfather",
  "speakerId": 51,
  "area": "morning-ranch",
  "reading": "おじいさん",
  "meaning": "grandfather / elderly man",
  "rank": 9000,
  "attack": 16,
  "skills": ["tetsudau"],
  "personality": {
    "traits": ["gentle", "wise"],
    "speechStyle": "Slow and fond of stories.",
    "quirk": "Claims the ranch was smaller in his day."
  },
  "greeting": "おはよう！",
  "shopGreetings": ["おはよう！"],
  "defeatLine": "元気ですね！",
  "createdAt": "2026-07-02"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/npcs.json tests/unit/game/morning-ranch-content.test.js
git commit -m "feat: add Morning Ranch NPCs (farmer family)"
```

---

### Task 4: Items

**Files:**
- Modify: `data/items.json` (append 12 entries)
- Modify: `tests/unit/game/morning-ranch-content.test.js` (extend)

**Interfaces:**
- Produces: 12 items with `area: "morning-ranch"`. `rollFriendlyNpcOffers` (`src/game/services/friendly-npc-offers.js:15`) auto-includes them once the player reaches the area; the word-dictionary overlay auto-registers each `word` for dialogue validation.

- [ ] **Step 1: Extend the test (failing)**

Append to `tests/unit/game/morning-ranch-content.test.js`:

```js
const items = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/items.json'), 'utf8'));

const EXPECTED_ITEMS = [
  { id: 'gyuunyuu', word: '牛乳', category: 'food' },
  { id: 'yasai', word: '野菜', category: 'food' },
  { id: 'kome', word: '米', category: 'food' },
  { id: 'chiizu', word: 'チーズ', category: 'food' },
  { id: 'bataa', word: 'バター', category: 'food' },
  { id: 'kuriimu', word: 'クリーム', category: 'food' },
  { id: 'baketsu', word: 'バケツ', category: 'equipment' },
  { id: 'suzu', word: '鈴', category: 'equipment' },
  { id: 'kago', word: '籠', category: 'equipment' },
  { id: 'epuron', word: 'エプロン', category: 'equipment' },
  { id: 'tane', word: '種', category: 'equipment' },
  { id: 'kama', word: '鎌', category: 'equipment' }
];

describe('morning-ranch items', () => {
  const ranchItems = items.filter(i => i.area === 'morning-ranch');

  it('has exactly the 12 approved items', () => {
    assert.deepEqual(
      ranchItems.map(i => i.id).sort(),
      EXPECTED_ITEMS.map(i => i.id).sort()
    );
  });

  for (const expected of EXPECTED_ITEMS) {
    it(`defines ${expected.id} correctly`, () => {
      const item = ranchItems.find(i => i.id === expected.id);
      assert.ok(item, `${expected.id} missing`);
      assert.equal(item.word, expected.word);
      assert.equal(item.category, expected.category);
      assert.ok(['common', 'uncommon', 'rare'].includes(item.rarity));
      assert.ok(item.effect && typeof item.effect === 'object');
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: FAIL — "has exactly the 12 approved items"

- [ ] **Step 3: Append the 12 items to `data/items.json`**

Readings, glosses, and ranks verbatim from the ledger. Food = `heal` type (`healAllPercent`, existing shape); equipment = `boost` type (fields from `MULT_FIELDS`/`BASE_BONUS_FIELDS` in `src/game/services/item-service.js:57-58`). Keep description percentages consistent with effect values.

```json
{
  "id": "gyuunyuu",
  "word": "牛乳",
  "reading": "ぎゅうにゅう",
  "nameEn": "Milk",
  "meaning": "milk",
  "category": "food",
  "rarity": "common",
  "type": "heal",
  "effect": { "healAllPercent": 0.32 },
  "description": "Heals all living creatures for 32% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "yasai",
  "word": "野菜",
  "reading": "やさい",
  "nameEn": "Vegetables",
  "meaning": "vegetable",
  "category": "food",
  "rarity": "common",
  "type": "heal",
  "effect": { "healAllPercent": 0.28 },
  "description": "Heals all living creatures for 28% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "kome",
  "word": "米",
  "reading": "こめ",
  "nameEn": "Rice",
  "meaning": "(uncooked) rice",
  "category": "food",
  "rarity": "common",
  "type": "heal",
  "effect": { "healAllPercent": 0.30 },
  "description": "Heals all living creatures for 30% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "chiizu",
  "word": "チーズ",
  "reading": "チーズ",
  "nameEn": "Cheese",
  "meaning": "cheese",
  "category": "food",
  "rarity": "uncommon",
  "type": "heal",
  "effect": { "healAllPercent": 0.5 },
  "description": "Heals all living creatures for 50% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "bataa",
  "word": "バター",
  "reading": "バター",
  "nameEn": "Butter",
  "meaning": "butter",
  "category": "food",
  "rarity": "common",
  "type": "heal",
  "effect": { "healAllPercent": 0.26 },
  "description": "Heals all living creatures for 26% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "kuriimu",
  "word": "クリーム",
  "reading": "クリーム",
  "nameEn": "Cream",
  "meaning": "cream",
  "category": "food",
  "rarity": "uncommon",
  "type": "heal",
  "effect": { "healAllPercent": 0.45 },
  "description": "Heals all living creatures for 45% of max HP.",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "baketsu",
  "word": "バケツ",
  "reading": "バケツ",
  "nameEn": "Bucket",
  "meaning": "bucket",
  "category": "equipment",
  "rarity": "common",
  "type": "boost",
  "effect": { "field": "baseHpBonus", "value": 12 },
  "description": "+12 base HP (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "suzu",
  "word": "鈴",
  "reading": "すず",
  "nameEn": "Bell",
  "meaning": "bell (small)",
  "category": "equipment",
  "rarity": "common",
  "type": "boost",
  "effect": { "field": "baseMpBonus", "value": 8 },
  "description": "+8 base MP (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "kago",
  "word": "籠",
  "reading": "かご",
  "nameEn": "Basket",
  "meaning": "basket",
  "category": "equipment",
  "rarity": "common",
  "type": "boost",
  "effect": { "field": "baseHpBonus", "value": 10 },
  "description": "+10 base HP (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "epuron",
  "word": "エプロン",
  "reading": "エプロン",
  "nameEn": "Apron",
  "meaning": "apron",
  "category": "equipment",
  "rarity": "uncommon",
  "type": "boost",
  "effect": { "field": "baseAttackBonus", "value": 12 },
  "description": "+12 base attack (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "tane",
  "word": "種",
  "reading": "たね",
  "nameEn": "Seeds",
  "meaning": "seed / pit",
  "category": "equipment",
  "rarity": "common",
  "type": "boost",
  "effect": { "field": "baseAttackBonus", "value": 8 },
  "description": "+8 base attack (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
},
{
  "id": "kama",
  "word": "鎌",
  "reading": "かま",
  "nameEn": "Sickle",
  "meaning": "sickle",
  "category": "equipment",
  "rarity": "uncommon",
  "type": "boost",
  "effect": { "field": "baseAttackBonus", "value": 14 },
  "description": "+14 base attack (scales with level).",
  "stage": 1,
  "area": "morning-ranch",
  "createdAt": "2026-07-02"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/game/morning-ranch-content.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/items.json tests/unit/game/morning-ranch-content.test.js
git commit -m "feat: add Morning Ranch items (6 food, 6 equipment)"
```

---

### Task 5: Dialogue frames + validation (dictionary gate)

**Files:**
- Modify: `data/dialogue/frame-sources.json` (append 8 frames)
- Regenerate: `data/dialogue/frames.json` (via script — never by hand)

**Interfaces:**
- Consumes: NPC ids from Task 3 (frame groups must be named `<npcId>_fightStart` / `<npcId>_defeatLine` — School precedent `sensei_fightStart`).
- Consumes: item/NPC/skill words from Tasks 2–4 (the word-dictionary overlay in `src/game/word-dictionary.js:28-36` auto-registers them, so frames may use 育てる, 牛乳, etc. freely).

- [ ] **Step 1: Append 8 frames to `frame-sources.json`**

Follow the shape of `npc_sensei_fightStart_ready` (`category: "npc"` for fight starts, `category: "npcDefeat"` for defeat lines — copy the exact category value used by the existing `sensei_defeatLine` group):

```json
{
  "id": "npc_nouka_fightStart_yasai",
  "category": "npc",
  "group": "nouka_fightStart",
  "raw": "野菜を育てます！",
  "slots": []
},
{
  "id": "npc_nouka_defeatLine_arigatou",
  "category": "npc",
  "group": "nouka_defeatLine",
  "raw": "ありがとう！",
  "slots": []
},
{
  "id": "npc_okaasan_fightStart_asa",
  "category": "npc",
  "group": "okaasan_fightStart",
  "raw": "朝ですよ！",
  "slots": []
},
{
  "id": "npc_okaasan_defeatLine_matakite",
  "category": "npc",
  "group": "okaasan_defeatLine",
  "raw": "また来てね！",
  "slots": []
},
{
  "id": "npc_musume_fightStart_gyuunyuu",
  "category": "npc",
  "group": "musume_fightStart",
  "raw": "牛乳を運びます！",
  "slots": []
},
{
  "id": "npc_musume_defeatLine_tanoshikatta",
  "category": "npc",
  "group": "musume_defeatLine",
  "raw": "楽しかった！",
  "slots": []
},
{
  "id": "npc_ojiisan_fightStart_tetsudai",
  "category": "npc",
  "group": "ojiisan_fightStart",
  "raw": "手伝いましょうか？",
  "slots": []
},
{
  "id": "npc_ojiisan_defeatLine_genki",
  "category": "npc",
  "group": "ojiisan_defeatLine",
  "raw": "元気ですね！",
  "slots": []
}
```

- [ ] **Step 2: Run the tokenizer**

Run: `node scripts/tokenize-static.js`
Expected: exits 0; `data/dialogue/frames.json` gains 8 new frames with `tokens[]` and `words[]`.

- [ ] **Step 3: Run the dialogue validator**

Run: `node scripts/validate-dialogue.js`
Expected: exits 0 with no errors for the new frames.

**If it reports missing dictionary words** (candidates: 朝, ありがとう, 来る, 楽しい, 元気 — common words likely already present): **STOP. Do not edit any dictionary file.** Present the missing-word list to the user and wait for explicit approval before adding entries (CLAUDE.md hard rule). Resume only after approval or after swapping the line for one that validates.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (Tier 1 + Tier 2)

- [ ] **Step 5: Commit**

```bash
git add data/dialogue/frame-sources.json data/dialogue/frames.json
git commit -m "feat: add Morning Ranch NPC dialogue frames"
```

---

### Task 6: Theme pool file (curation artifact)

**Files:**
- Create: `language/themes/morning-ranch.json`

**Interfaces:**
- Consumed by the forge dashboard (`server.js:474` reads `language/themes/<themeId>.json`); records which ledger words are spent and what remains for future ranch content (door hints, cooking, quests).

- [ ] **Step 1: Write the theme pool file**

Words = the 22 taught words (2 area-name + 4 NPC + 4 skill + 12 item), each with `assigned` set. `avgRank` = 5577 (sum 122,700 / 22), `computedStage` = 6 per `data/stage-definitions.json` (cap 6500). Follow `language/themes/school.json` field layout exactly:

```json
{
  "themeId": "morning-ranch",
  "areaWord": "牧場",
  "areaReading": "ぼくじょう",
  "areaMeaning": "ranch / pasture",
  "areaRank": 13700,
  "avgRank": 5577,
  "computedStage": 6,
  "generatedAt": "2026-07-02",
  "words": [
    { "word": "朝", "reading": "あさ", "meaning": "morning", "rank": 400, "roles": ["modifier"], "source": "ledger", "assigned": "area:morning-ranch", "existingUses": [] },
    { "word": "牧場", "reading": "ぼくじょう", "meaning": "ranch / pasture", "rank": 13700, "roles": ["sub-area"], "source": "ledger", "assigned": "area:morning-ranch", "existingUses": [] },
    { "word": "農家", "reading": "のうか", "meaning": "farmer / farm family", "rank": 8100, "roles": ["npc"], "source": "ledger", "assigned": "npc:nouka", "existingUses": [] },
    { "word": "お母さん", "reading": "おかあさん", "meaning": "mother / mom", "rank": 1400, "roles": ["npc"], "source": "ledger", "assigned": "npc:okaasan", "existingUses": [] },
    { "word": "娘", "reading": "むすめ", "meaning": "daughter / (young) girl", "rank": 600, "roles": ["npc"], "source": "ledger", "assigned": "npc:musume", "existingUses": [] },
    { "word": "おじいさん", "reading": "おじいさん", "meaning": "grandfather / elderly man", "rank": 9000, "roles": ["npc"], "source": "ledger", "assigned": "npc:ojiisan", "existingUses": [] },
    { "word": "育てる", "reading": "そだてる", "meaning": "to raise / to bring up", "rank": 1300, "roles": ["npc-skill"], "source": "ledger", "assigned": "npc-skill:sodateru", "existingUses": [] },
    { "word": "起こす", "reading": "おこす", "meaning": "to wake (someone) / to raise", "rank": 800, "roles": ["npc-skill"], "source": "ledger", "assigned": "npc-skill:okosu", "existingUses": [] },
    { "word": "運ぶ", "reading": "はこぶ", "meaning": "to carry / to transport", "rank": 900, "roles": ["npc-skill"], "source": "ledger", "assigned": "npc-skill:hakobu", "existingUses": [] },
    { "word": "手伝う", "reading": "てつだう", "meaning": "to help / to assist", "rank": 900, "roles": ["npc-skill"], "source": "ledger", "assigned": "npc-skill:tetsudau", "existingUses": [] },
    { "word": "牛乳", "reading": "ぎゅうにゅう", "meaning": "milk", "rank": 6200, "roles": ["item"], "source": "ledger", "assigned": "item:gyuunyuu", "existingUses": [] },
    { "word": "野菜", "reading": "やさい", "meaning": "vegetable", "rank": 2600, "roles": ["item"], "source": "ledger", "assigned": "item:yasai", "existingUses": [] },
    { "word": "米", "reading": "こめ", "meaning": "(uncooked) rice", "rank": 6700, "roles": ["item"], "source": "ledger", "assigned": "item:kome", "existingUses": [] },
    { "word": "チーズ", "reading": "チーズ", "meaning": "cheese", "rank": 6300, "roles": ["item"], "source": "ledger", "assigned": "item:chiizu", "existingUses": [] },
    { "word": "バター", "reading": "バター", "meaning": "butter", "rank": 9800, "roles": ["item"], "source": "ledger", "assigned": "item:bataa", "existingUses": [] },
    { "word": "クリーム", "reading": "クリーム", "meaning": "cream", "rank": 9700, "roles": ["item"], "source": "ledger", "assigned": "item:kuriimu", "existingUses": [] },
    { "word": "バケツ", "reading": "バケツ", "meaning": "bucket", "rank": 10400, "roles": ["item"], "source": "ledger", "assigned": "item:baketsu", "existingUses": [] },
    { "word": "鈴", "reading": "すず", "meaning": "bell (small)", "rank": 5000, "roles": ["item"], "source": "ledger", "assigned": "item:suzu", "existingUses": [] },
    { "word": "籠", "reading": "かご", "meaning": "basket", "rank": 6000, "roles": ["item"], "source": "ledger", "assigned": "item:kago", "existingUses": [] },
    { "word": "エプロン", "reading": "エプロン", "meaning": "apron", "rank": 8500, "roles": ["item"], "source": "ledger", "assigned": "item:epuron", "existingUses": [] },
    { "word": "種", "reading": "たね", "meaning": "seed / pit", "rank": 4400, "roles": ["item"], "source": "ledger", "assigned": "item:tane", "existingUses": [] },
    { "word": "鎌", "reading": "かま", "meaning": "sickle", "rank": 10000, "roles": ["item"], "source": "ledger", "assigned": "item:kama", "existingUses": [] }
  ]
}
```

- [ ] **Step 2: Verify it parses**

Run: `node -e "const t = require('./language/themes/morning-ranch.json'); console.log(t.words.length + ' words OK')"`
Expected: `22 words OK`

- [ ] **Step 3: Commit**

```bash
git add language/themes/morning-ranch.json
git commit -m "docs: add Morning Ranch theme pool file"
```

---

### Task 7: Full verification + merge

**Files:**
- Modify (temporarily, not committed): `src/dev/dev-test-user.js:53`

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: PASS. Then `node --check` any JS files touched (only test files in this plan).

- [ ] **Step 2: Boot smoke test**

Run: `npm run dev`, wait 5s, then:
`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`
Expected: `200`

- [ ] **Step 3: Manual playtest (ask the user before launching Playwright)**

Read `docs/playtest-guide.md` first. To reach Morning Ranch with `devtester`, temporarily set `highestUnlocked: 4` in `src/dev/dev-test-user.js:53`, run `npm run seed:dev-user`, then **revert the edit** (do not commit it). Verify in-browser:
- Morning Ranch appears in area select after School
- Entering it spawns ranch creatures (uma, ushi, buta…)
- An NPC battle shows a farmer-family NPC with their skill word
- The boss room fights 光の馬 (Light Horse); defeating it unlocks the Light Horse fusion recipe in the fusion menu
- A shop/NPC offer shows ranch items

- [ ] **Step 4: Merge (follow CLAUDE.md finish flow)**

```bash
cd ../koto-dev && git pull origin dev
git merge feature/area-4-morning-ranch
npm test && git push origin dev && git push origin dev:master
git worktree remove ../koto-wt-morning-ranch
git branch -d feature/area-4-morning-ranch
```

---

### Task 8: Battle backgrounds (art pass — may ship after merge)

The pixi layer loader falls back to a solid color when assets are missing (`public/js/pixi/parallax.js:42`), so the area is playable before art lands. School currently ships this way. Treat this task as its own PR if art generation stalls.

**Files:**
- Create: `public/assets/backgrounds/morning-ranch/sky.webp`
- Create: `public/assets/backgrounds/morning-ranch/battleground.webp`
- Create: `public/assets/backgrounds/areas/morning-ranch/morning-ranch_01.webp`
- Modify: `src/shared/asset-versions.js` (bump `BACKGROUND_VERSION` to `'20260702'` or the actual generation date)

- [ ] **Step 1: Generate the three images via ComfyUI**

Follow `docs/superpowers/specs/2026-05-03-scenario-battlefield-asset-workflow-design.md` (the workflow used for existing areas). Art direction from the roadmap spec: sunlit ranch at dawn, warm golden light, pastures and fences, bright Saturday-morning-anime palette — no darkness. `sky.webp` = dawn sky layer; `battleground.webp` = pasture ground layer; `morning-ranch_01.webp` = scene background.

- [ ] **Step 2: Bump the cache-buster**

In `src/shared/asset-versions.js`, set `BACKGROUND_VERSION` to the generation date (e.g. `'20260702'`).

- [ ] **Step 3: Visual verification (mandatory per CLAUDE.md)**

Ask the user before launching Playwright. Boot `npm run dev`, enter a Morning Ranch battle with the dev account (unlock note in Task 7 Step 3), screenshot, confirm the dawn-ranch layers render behind combat (not fallback color). Delete screenshots after showing them.

- [ ] **Step 4: Commit**

```bash
git add public/assets/backgrounds/morning-ranch public/assets/backgrounds/areas/morning-ranch src/shared/asset-versions.js
git commit -m "feat: Morning Ranch battle backgrounds + BACKGROUND_VERSION bump"
```

---

## Appendix: Stamping plans for Areas 5–12

Each subsequent area repeats Tasks 1–8 with its own data rows. **When starting an area, copy this plan, then substitute:**

1. **Task 1 data** — area id, names, readings, modifier/location word objects, `rank` (= primary teaching word's rank), spawn `creatures` array, `bossCreatureId`, theme/description/tags: all from the roadmap spec's area card. Append after the previous area (array order = unlock order = roadmap order). Add the new `"<area-id>:boss:<fusion-id>"` line to `ALLOWED_FUSION_AREA_PLACEMENTS`.
2. **Tasks 2–4 data** — NPC/skill/item words, readings, ranks, glosses: verbatim from the content ledger's area section. Escalate NPC `attack` by ~2 per area index (School 14 → A4 16 → A5 18 → … → A12 32). Rarity mix shifts rarer with area index (by A12, several `rare` items).
3. **Task 5 frames** — one fightStart + one defeatLine per NPC, built from that area's own taught words (same i+1-safe pattern; validator + dictionary gate unchanged).
4. **Task 6 theme pool** — recompute `avgRank`/`computedStage` from that area's 20-24 words.
5. **Task 7 unlock** — `highestUnlocked` needed = area index + 1 (A5→5 … A12→9).
6. **Task 8 art direction** — from the roadmap card (Blue Sea horizon, lantern-lit dusk town, dune sea, moonlit forest, storm peak, frozen shore, snowy onsen village, festival night).

Area-specific one-offs to remember:
- **A5 Blue Sea:** kujira is an epic ultra-rare — confirm spawn-weighting by rarity exists in `generateEnemyCreature` before relying on "ultra-rare" flavor; if spawning is uniform, note it and keep kujira in the pool anyway (it's befriendable either way).
- **A6 Evening Town:** harvest `language/themes/shopping-mall.json` words into the theme pool file's unassigned remainder.
- **A10 Frozen Lake:** the 漁師 NPC entry is a *reuse* — new key `ryoushi_frozen_lake` (Meadow/Plains `kodomo_wild_plains` precedent) pointing at the same word with `area: "frozen-lake"` and the new `matsu` skill.
- **A12 Festival:** アイドル NPC uses the existing `utau` skill — no new skill entry for the 4th NPC (only 祝う/願う/踊る are new).
- **Every area:** two words in each area card (`modifierWord`, `locationWord`) auto-register in the dictionary via the areas.json overlay — but only `name` (the full compound) is the overlay key; single modifier words used inside dialogue frames must exist in the live dictionary (the validator will tell you — dictionary gate applies).
