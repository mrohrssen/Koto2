# School Area — Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the school area fully playable by implementing the Candy XP grant effect, NPC buff random targeting, creature sprites, and area background.

**Architecture:** Two independent code tasks (item effect + NPC skill fix) and two independent art generation tasks (creature sprites + area background). All four can run in parallel.

**Tech Stack:** Node.js (ES modules), Gemini API (sprites), ComfyUI (background), Python (BiRefNet bg removal)

**Spec:** `docs/superpowers/specs/2026-04-07-school-area-remaining-work-design.md`

---

## Chunk 1: Code Changes

### Task 1: Candy xpGrant:killEquivalent Effect

**Files:**
- Modify: `src/game/services/item-service.js:1` (add import), `src/game/services/item-service.js:143` (add context param + new branch)
- Modify: `src/game/loop.js:1452` (pass context to applyItem)
- Test: `tests/unit/item/xp-grant.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/item/xp-grant.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyItem } from '../../../src/game/services/item-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';

describe('Candy xpGrant:killEquivalent', () => {
  function makeParty() {
    const c1 = instantiateCreature('hi');
    c1.hp = c1.maxHp;
    const c2 = instantiateCreature('mizu');
    c2.hp = c2.maxHp;
    return { active: [c1, c2], reserves: [] };
  }

  it('grants XP to all alive creatures when xpGrant is killEquivalent', () => {
    const party = makeParty();
    const xpBefore = [party.active[0].xp, party.active[1].xp];
    const item = { type: 'xpGrant', effect: { xpGrant: 'killEquivalent' } };

    const result = applyItem(item, party, null, null, { enemyLevel: 3 });

    assert.strictEqual(result.applied, true);
    assert.ok(party.active[0].xp > xpBefore[0], 'creature 1 should gain XP');
    assert.ok(party.active[1].xp > xpBefore[1], 'creature 2 should gain XP');
  });

  it('returns applied:false without context', () => {
    const party = makeParty();
    const item = { type: 'xpGrant', effect: { xpGrant: 'killEquivalent' } };

    const result = applyItem(item, party, null, null);
    assert.strictEqual(result.applied, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/item/xp-grant.test.js`
Expected: FAIL — `applyItem` doesn't handle `type: 'xpGrant'` yet, returns `{ applied: false }`

- [ ] **Step 3: Add import to item-service.js**

At the top of `src/game/services/item-service.js`, after existing imports (line 4), add:

```js
import { awardKillXp } from './creature-combat-service.js';
```

- [ ] **Step 4: Add xpGrant branch to applyItem**

In `src/game/services/item-service.js`, change the function signature at line 143:

```js
export function applyItem(item, creatureParty, _itemBuffs, targetIndex = null, context = null) {
```

Then after the `xpBalance` block (after line 264), before the final `return { applied: false }`, add:

```js
  if (item.type === 'xpGrant') {
    if (!context?.enemyLevel) return { applied: false };
    if (item.effect.xpGrant === 'killEquivalent') {
      const result = awardKillXp(creatureParty, context.enemyLevel);
      return { applied: true, xpGrants: result.xpGrants, levelUps: result.levelUps };
    }
    return { applied: false };
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/unit/item/xp-grant.test.js`
Expected: PASS

- [ ] **Step 6: Wire shop handler to pass context**

In `src/game/loop.js`, at line 1452, change:

```js
applyItem(selectedItem, this.run.creatureParty, null, targetIndex);
```

to:

```js
const totalEncounters = this.run.currentAreaEncounters || 0;
const enemyLevel = getEnemyLevel({ totalEncounters });
const applyResult = applyItem(selectedItem, this.run.creatureParty, null, targetIndex, { enemyLevel });
```

`getEnemyLevel` is already imported at line 63 of loop.js.

- [ ] **Step 7: Run full unit tests**

Run: `npm run test:unit 2>&1 | grep "not ok"`
Expected: only the pre-existing prologue failure, no new failures

- [ ] **Step 8: Commit**

```bash
git add src/game/services/item-service.js src/game/loop.js tests/unit/item/xp-grant.test.js
git commit -m "feat(items): add xpGrant:killEquivalent effect for Candy item"
```

---

### Task 2: NPC Buff Random Target (Memorize Skill)

**Files:**
- Modify: `src/game/services/creature-combat-service.js:496` (random target selection)
- Test: `tests/unit/combat/creature-combat-service.test.js` (add test)

- [ ] **Step 1: Write the failing test**

Add to the end of `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('executeNpcSkill — single_ally random target', () => {
  it('does not always target index 0 for single_ally skills', () => {
    const npcData = {
      id: 'senpai', name: '先輩', nameEn: 'Older Student',
      attack: 15, element: 'neutral',
      baseWord: '先輩', baseReading: 'せんぱい', baseMeaning: 'senior'
    };
    const buffSkill = {
      id: 'oboeru', name: '覚える', nameEn: 'Memorize',
      element: 'neutral', category: 'buff', target: 'single_ally',
      power: 0, mpCost: 0, statChanges: { atk: 2 },
      statusEffect: null, statusChance: 0, statusDuration: 0
    };

    // 3 alive enemies (NPC's allies from player perspective)
    const enemies = [
      { id: 'e0', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
      { id: 'e1', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
      { id: 'e2', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'fire', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
    ];
    const allies = [
      { id: 'a0', hp: 50, maxHp: 50, attack: 10, defense: 5, element: 'water', level: 3, activeEffects: [], statStages: { atk: 0, def: 0 } },
    ];

    // Run 30 times, track which enemy got buffed
    const buffedIndices = new Set();
    for (let i = 0; i < 30; i++) {
      // Reset stat stages
      enemies.forEach(e => e.statStages = { atk: 0, def: 0 });
      executeNpcSkill(npcData, buffSkill, allies, enemies);
      enemies.forEach((e, idx) => {
        if (e.statStages.atk > 0) buffedIndices.add(idx);
      });
    }

    // With 3 targets and 30 trials, should hit more than just index 0
    assert.ok(buffedIndices.size > 1, `Expected random targeting, but only hit indices: ${[...buffedIndices]}`);
  });
});
```

Make sure `executeNpcSkill` is in the imports at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/combat/creature-combat-service.test.js`
Expected: FAIL — only index 0 gets buffed (hardcoded)

- [ ] **Step 3: Implement random target selection**

In `src/game/services/creature-combat-service.js`, replace line 496:

```js
  const result = executeMove(pseudoCreature, -1, skill, 0, npcAllies, npcEnemies, null, null, defeatedEnemyIndices);
```

with:

```js
  // Pick random alive ally for single_ally targeting (e.g. buff skills)
  let targetIdx = 0;
  if (skill.target === 'single_ally') {
    const aliveIndices = npcAllies.map((c, i) => c.hp > 0 ? i : -1).filter(i => i >= 0);
    if (aliveIndices.length > 0) {
      targetIdx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
    }
  }
  const result = executeMove(pseudoCreature, -1, skill, targetIdx, npcAllies, npcEnemies, null, null, defeatedEnemyIndices);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/combat/creature-combat-service.test.js`
Expected: PASS

- [ ] **Step 5: Run full unit tests**

Run: `npm run test:unit 2>&1 | grep "not ok"`
Expected: only the pre-existing prologue failure

- [ ] **Step 6: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
git commit -m "fix(npc): random target selection for single_ally NPC skills"
```

---

## Chunk 2: Art Generation

### Task 3: Creature Sprites

**Files:**
- Modify: `scripts/generate-creature-sprites.mjs:31-44` (add 6 new creature prompts to CREATURES map)
- Output: `public/assets/sprites/creatures/{tsukue,isu,fukurou,chou,hachi,ari}.webp`

**Pipeline overview:** The sprite pipeline has 3 stages:
1. **Generate** — `scripts/generate-creature-sprites.mjs` calls Gemini to produce 5 PNG variants per creature into `tmp/creature-sprites/`
2. **Background removal** — `scripts/_birefnet-staging.py` runs ComfyUI BiRefNet to remove white backgrounds (requires ComfyUI running at `http://127.0.0.1:8188`)
3. **Pick + convert** — Manually review variants, pick the best, trim whitespace, convert to webp, place in `public/assets/sprites/creatures/`

- [ ] **Step 1: Add creature prompts**

In `scripts/generate-creature-sprites.mjs`, add these entries to the `CREATURES` object (after `hineko` on line 44):

```js
  tsukue:  'A small wooden school desk creature with drawer eyes and pencils sticking up like antennae, short stubby wooden legs,',
  isu:     'A small wooden school chair creature with seat-cushion face and four sturdy legs, slightly tilted playfully,',
  fukurou: 'A small round owl creature with enormous wise eyes and soft feathered body, tiny spectacles perched on beak,',
  chou:    'A small butterfly creature with colorful patterned wings and curious antenna eyes, delicate and graceful,',
  hachi:   'A small round bee creature with fuzzy yellow and black stripes, tiny translucent wings, and determined eyes,',
  ari:     'A small ant creature with a shiny dark body, large determined eyes, and strong mandibles, carrying a tiny leaf,',
```

- [ ] **Step 2: Generate sprite variants**

```bash
# Generate only the new creatures (one at a time to manage rate limits)
node scripts/generate-creature-sprites.mjs --only tsukue
node scripts/generate-creature-sprites.mjs --only isu
node scripts/generate-creature-sprites.mjs --only fukurou
node scripts/generate-creature-sprites.mjs --only chou
node scripts/generate-creature-sprites.mjs --only hachi
node scripts/generate-creature-sprites.mjs --only ari
```

Each produces 5 variants in `tmp/{id}-test/`. Check the Gemini API key exists at `data/.creature-forge-gemini-key`.

- [ ] **Step 3: Review variants and pick best**

Open each variant PNG (serve via `python3 -m http.server 9999 --directory tmp/` and browse in Playwright). Pick the best variant for each creature.

- [ ] **Step 4: Background removal + trim + convert**

For each picked variant:

```bash
# Background removal via BiRefNet (requires ComfyUI at 127.0.0.1:8188)
# Then trim + convert:
python3 -c "
from PIL import Image
import subprocess
img = Image.open('tmp/tsukue-test/tsukue-a.png')  # replace with picked variant
img = img.crop(img.getbbox())  # trim whitespace
img.save('public/assets/sprites/creatures/tsukue.webp', 'WEBP', quality=90)
print('Done')
"
```

Repeat for all 6 creatures. If BiRefNet is unavailable, the white background from Gemini generation may need manual removal or a fallback approach.

- [ ] **Step 5: Verify sprites exist**

```bash
ls -la public/assets/sprites/creatures/{tsukue,isu,fukurou,chou,hachi,ari}.webp
```

All 6 files should exist and be reasonable sizes (5-50KB each).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-creature-sprites.mjs public/assets/sprites/creatures/{tsukue,isu,fukurou,chou,hachi,ari}.webp
git commit -m "art(creatures): add school area creature sprites"
```

---

### Task 4: Area Background

**Files:**
- Output: `public/assets/backgrounds/areas/school/school_01.webp`

**Pipeline overview:** Area backgrounds are generated via ComfyUI (at `http://127.0.0.1:8188`) using the style from `scripts/generate_area_backgrounds.py`. 1536x1024, anime game art style, no characters.

- [ ] **Step 1: Generate background via ComfyUI**

Queue a txt2img workflow on ComfyUI with this prompt:

**Positive:** `bright Japanese school hallway with clean tile floors, shoe lockers lining the walls, warm afternoon sunlight streaming through tall windows, classroom doors along one side, bulletin board with colorful papers, potted plants on windowsills, cherry blossom petals drifting through an open window, anime game background art, bright vibrant colors, warm sunlight, soft cel-shaded lighting, painterly detail, lush and inviting atmosphere, fantasy adventure game environment, no people, no characters, no text, slightly magical, gentle bloom lighting, rich saturated palette, high quality, detailed, clean composition, wide landscape shot`

**Negative:** `neon lights, cyberpunk, dark gritty, rain, night, people, characters, person, text, watermark, UI, HUD, blurry, low quality, desaturated, gloomy, horror, scary, pokeball, poke ball, realistic photo, 3D render, chibi, logo, frame, border, vignette, split screen`

**Settings:** 1536x1024, using the same checkpoint as existing area backgrounds.

```bash
mkdir -p public/assets/backgrounds/areas/school
```

Use the workflow pattern from `scripts/generate_area_backgrounds.py` adapted for a single image, or queue manually via ComfyUI API.

- [ ] **Step 2: Convert to webp**

```bash
python3 -c "
from PIL import Image
img = Image.open('tmp/school_bg.png')  # adjust path to ComfyUI output
img.save('public/assets/backgrounds/areas/school/school_01.webp', 'WEBP', quality=85)
print('Done:', img.size)
"
```

- [ ] **Step 3: Verify background exists**

```bash
ls -la public/assets/backgrounds/areas/school/school_01.webp
# Should be ~100-500KB, 1536x1024
```

- [ ] **Step 4: Commit**

```bash
git add public/assets/backgrounds/areas/school/school_01.webp
git commit -m "art(areas): add school area background"
```
