# Area-Based Item Filtering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter NPC shop items by area progression — area 1 shops show area 1 items only, area 2 shops show area 1 + area 2 items.

**Architecture:** Add `area` field to each item in `items.json`. Pass cumulative area IDs into `rollFriendlyNpcOffers()` and filter the pool. Three files change: data, one function signature, one call site.

**Tech Stack:** Node.js, ES modules, node:test

**Spec:** `docs/superpowers/specs/2026-04-10-area-item-filtering-design.md`

---

## Chunk 1: Implementation

### Task 1: Write failing test for area filtering

**Files:**
- Create: `tests/unit/item/friendly-npc-offers.test.js`

- [ ] **Step 1: Write the test file**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { rollFriendlyNpcOffers } from '../../../src/game/services/exploration-service.js';

const MOCK_ITEMS = [
  { id: 'ocha', category: 'food', area: 'hajimari-no-hiroba', word: 'お茶', reading: 'おちゃ', meaning: 'tea', rarity: 'common', type: 'mpRestore', effect: {}, description: 'test' },
  { id: 'pan', category: 'food', area: 'school', word: 'パン', reading: 'パン', meaning: 'bread', rarity: 'common', type: 'heal', effect: {}, description: 'test' },
  { id: 'katana', category: 'equipment', area: 'hajimari-no-hiroba', word: '刀', reading: 'かたな', meaning: 'katana', rarity: 'uncommon', type: 'boost', effect: {}, description: 'test' },
  { id: 'enpitsu', category: 'equipment', area: 'school', word: '鉛筆', reading: 'えんぴつ', meaning: 'pencil', rarity: 'common', type: 'boost', effect: {}, description: 'test' },
];

describe('rollFriendlyNpcOffers - area filtering', () => {
  it('area 1 only: returns only area 1 food items', () => {
    const areaIds = ['hajimari-no-hiroba'];
    for (let i = 0; i < 20; i++) {
      const offers = rollFriendlyNpcOffers('food', areaIds, MOCK_ITEMS);
      for (const item of offers) {
        assert.strictEqual(item.area, 'hajimari-no-hiroba', `Got area 2 item "${item.id}" in area 1 shop`);
      }
    }
  });

  it('area 1+2: returns items from both areas', () => {
    const areaIds = ['hajimari-no-hiroba', 'school'];
    const seenAreas = new Set();
    for (let i = 0; i < 50; i++) {
      const offers = rollFriendlyNpcOffers('food', areaIds, MOCK_ITEMS);
      for (const item of offers) seenAreas.add(item.area);
    }
    assert.ok(seenAreas.has('hajimari-no-hiroba'), 'Should include area 1 items');
    assert.ok(seenAreas.has('school'), 'Should include area 2 items');
  });

  it('equipment category respects area filtering', () => {
    const areaIds = ['hajimari-no-hiroba'];
    for (let i = 0; i < 20; i++) {
      const offers = rollFriendlyNpcOffers('equipment', areaIds, MOCK_ITEMS);
      for (const item of offers) {
        assert.strictEqual(item.area, 'hajimari-no-hiroba', `Got area 2 equipment "${item.id}" in area 1 shop`);
      }
    }
  });

  it('items without area field are always included', () => {
    const itemsWithNoArea = [
      ...MOCK_ITEMS,
      { id: 'mystery', category: 'food', word: 'x', reading: 'x', meaning: 'x', rarity: 'common', type: 'heal', effect: {}, description: 'test' },
    ];
    const areaIds = ['hajimari-no-hiroba'];
    let sawMystery = false;
    for (let i = 0; i < 50; i++) {
      const offers = rollFriendlyNpcOffers('food', areaIds, itemsWithNoArea);
      if (offers.some(o => o.id === 'mystery')) sawMystery = true;
    }
    assert.ok(sawMystery, 'Item without area field should appear in any area');
  });

  it('areaIds null disables area filtering (backward compat)', () => {
    const offers = rollFriendlyNpcOffers('food', null, MOCK_ITEMS);
    assert.ok(offers.length > 0, 'Should return items when areaIds is null');
  });

  it('returns empty array when no items match area + category', () => {
    const areaIds = ['nonexistent-area'];
    const offers = rollFriendlyNpcOffers('food', areaIds, MOCK_ITEMS);
    assert.strictEqual(offers.length, 0, 'No items should match a nonexistent area');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/item/friendly-npc-offers.test.js`

Expected: FAIL — `rollFriendlyNpcOffers` currently takes `(category, itemPool)` so the `areaIds` argument lands in `itemPool` position, causing wrong behavior.

### Task 2: Update `rollFriendlyNpcOffers` to accept and filter by area IDs

**Files:**
- Modify: `src/game/services/exploration-service.js:52-67`

- [ ] **Step 3: Update the function**

Update the JSDoc (line 46-51) and function at line 52. Change from:

```js
/**
 * Roll 3 item offers for a friendly NPC room.
 * @param {'food'|'equipment'} category - Filters items by their category field
 * @param {Array} [itemPool] - Optional override item pool (defaults to data/items.json)
 * @returns {Array} Up to 3 item objects matching the category
 */
export function rollFriendlyNpcOffers(category, itemPool = null) {
  if (!itemPool) {
    try {
      itemPool = JSON.parse(readFileSync(DEFAULT_ITEMS_PATH, 'utf8'));
    } catch (e) {
      itemPool = [];
    }
  }

  // Filter by item category field (food or equipment)
  const eligible = itemPool.filter(item => item.category === category);

  // Randomly select up to 3 without duplicates
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(item => ({ ...item }));
}
```

To:

```js
/**
 * Roll 3 item offers for a friendly NPC room.
 * @param {'food'|'equipment'} category - Filters items by their category field
 * @param {string[]|null} areaIds - Area IDs the player has reached (cumulative); null disables filtering
 * @param {Array} [itemPool] - Optional override item pool (defaults to data/items.json)
 * @returns {Array} Up to 3 item objects matching the category
 */
export function rollFriendlyNpcOffers(category, areaIds = null, itemPool = null) {
  if (!itemPool) {
    try {
      itemPool = JSON.parse(readFileSync(DEFAULT_ITEMS_PATH, 'utf8'));
    } catch (e) {
      itemPool = [];
    }
  }

  // Filter by category and area progression
  const eligible = itemPool.filter(item =>
    item.category === category &&
    (!areaIds || !item.area || areaIds.includes(item.area))
  );

  // Randomly select up to 3 without duplicates
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(item => ({ ...item }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/item/friendly-npc-offers.test.js`

Expected: All 6 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`

Expected: All tests pass. The signature change is backward-compatible (`areaIds` defaults to `null`, which disables filtering).

- [ ] **Step 6: Commit**

```bash
git add tests/unit/item/friendly-npc-offers.test.js src/game/services/exploration-service.js
git commit -m "feat: add area filtering to rollFriendlyNpcOffers"
```

### Task 3: Update call site to pass area IDs

**Files:**
- Modify: `src/routes/game/run.js:628`

- [ ] **Step 7: Update the call site**

At line 628, change:

```js
        room.friendlyNpc.offered = rollFriendlyNpcOffers(room.friendlyNpc.offerCategory, allItems);
```

To:

```js
        const areaPath = gm.run.areaPath || [];
        const currentAreaId = gm.run.currentArea?.id;
        const areaIds = [...new Set([...areaPath, currentAreaId].filter(Boolean))];
        room.friendlyNpc.offered = rollFriendlyNpcOffers(room.friendlyNpc.offerCategory, areaIds, allItems);
```

- [ ] **Step 8: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`

Expected: `OK`

- [ ] **Step 9: Run full test suite**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: pass cumulative area IDs to NPC shop"
```

### Task 4: Add `area` field to all items in `items.json`

**Files:**
- Modify: `data/items.json`

- [ ] **Step 11: Add `"area"` field to each item**

Add `"area": "hajimari-no-hiroba"` to these items (original area 1):
- ocha, toufu, ringo, tamago, ichigo, sake, raamen, bentou, sushi, wasabi, katana, hon, kutsu, kagami, boushi

Add `"area": "school"` to these items (area 2, school-themed):
- pan, ame, okashi, onigiri, sandoicchi, enpitsu, pen, nooto, kyoukasho, jisho, ryukku, tokei

Place the `"area"` field after `"stage"` in each item object for consistency.

- [ ] **Step 12: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/items.json','utf8')); console.log('OK')"`

Expected: `OK`

- [ ] **Step 13: Run full test suite**

Run: `npm test`

Expected: All tests pass.

- [ ] **Step 14: Commit**

```bash
git add data/items.json
git commit -m "data: add area field to all items for area-based shop filtering"
```
