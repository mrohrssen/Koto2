# Attack Result Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-23-attack-result-card-redesign-design.md`](../specs/2026-04-23-attack-result-card-redesign-design.md)

**Goal:** Replace the horizontal `.split-attack-card` with a 3-block vertical card — attacker / move / target + inline result — rendered through `renderJpSentence` so hiragana, romaji, and English appear in every block.

**Architecture:** Pure presentation-layer change. `buildSplitAttackCard()` in `public/js/ui/attack-card.js` is rewritten to emit new HTML. The matching CSS block in `public/game.css` is replaced. A small server-side payload extension (`targetBaseReading`, `targetBaseMeaning`) gives the card the hiragana + English gloss it needs for the target word. All entry points (`insertAttackCard`, `insertNpcAttackCard`, `waitForCardTap`, `showAttackCardAndWait`, `ATTACK_CARD_TIMING`, `ELEMENT_THEME`) keep the same signatures so callers don't move.

**Tech Stack:** Vanilla JS (ES modules), template-literal HTML, CSS custom properties, `node:test` for unit tests.

---

## File Structure

### Create
- `tests/unit/ui/attack-card.test.js` — unit tests for pure helpers and `buildSplitAttackCard` DOM output.

### Modify
- `src/game/services/creature-combat-service.js` — extend three attack-record builders with `targetBaseReading` + `targetBaseMeaning`.
- `public/js/ui/attack-card.js` — rewrite `buildSplitAttackCard()`; rename `options.leftHtml` → `options.attackerHtml`; adapt `insertNpcAttackCard`. Keep exports unchanged.
- `public/game.css` — replace the `.sac-*` rule block (lines ~1199–1437) with new rules.

### Not touched
- `public/js/ui/combat-loop.js` and `public/js/ui/combat-vfx.js` (callers) — their imports (`insertAttackCard`, `insertNpcAttackCard`, `waitForCardTap`, `showAttackCardAndWait`, `ATTACK_CARD_TIMING`, `ELEMENT_THEME`) stay valid.
- TTS code path — `prefetchWord` + `playWordPair` still read `attackerBaseWord`; deliberate, out of scope (separate cleanup).
- PvP service code — uses the same attack-record shape via the shared combat service, so extending the target fields there covers PvP automatically.

---

## Task 1: Extend attack payload with target reading + meaning

The card needs the hiragana reading and English gloss for the target word. The payload already carries those for attacker (`attackerBaseReading`, `attackerBaseMeaning`) and move (`attackerSkillReading`, `attackerSkillEn`), but only `targetBaseWord` for the target. Add the two missing fields at all three record-builder sites.

**Files:**
- Test: `tests/unit/combat/creature-combat-service.test.js` (add cases — do NOT replace file)
- Modify: `src/game/services/creature-combat-service.js` (lines 68–100, 619–650, 1150–1180 — three record-builders)

- [ ] **Step 1: Add failing test for player-side target reading/meaning**

Append to `tests/unit/combat/creature-combat-service.test.js` (end of file, before any closing brackets — it's a flat list of `describe` blocks). Use the style already in the file:

```javascript
describe('Attack record — target reading/meaning', () => {
  it('player move record exposes targetBaseReading and targetBaseMeaning', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];
    const result = processMoveTurn(allies, enemies, [
      { creatureIndex: 0, moveId: 'tataku', targetIndex: 0 }
    ]);
    const rec = result.attacks[0];
    assert.strictEqual(rec.targetBaseWord, '木');
    assert.strictEqual(rec.targetBaseReading, 'き');
    assert.strictEqual(rec.targetBaseMeaning, 'tree / wood');
  });

  it('enemy attack record exposes targetBaseReading and targetBaseMeaning', () => {
    const allies = [instantiateCreature('hi')];
    const enemies = [instantiateCreature('ki')];
    // Force enemy to act
    const result = processEnemyTurn(enemies, allies);
    const rec = result.attacks[0];
    assert.strictEqual(rec.targetBaseWord, '火');
    assert.strictEqual(rec.targetBaseReading, 'ひ');
    assert.strictEqual(rec.targetBaseMeaning, 'fire');
  });
});
```

- [ ] **Step 2: Run the new tests — expect failure**

Run: `npm run test:unit -- --test-name-pattern="target reading"`
Expected: both tests fail with `undefined` for `targetBaseReading` and `targetBaseMeaning`.

- [ ] **Step 3: Add fields in `buildAttackRecord` (player-side)**

In `src/game/services/creature-combat-service.js`, in the object returned by `buildAttackRecord` (~line 68), add the two fields next to `targetBaseWord`:

```javascript
    targetBaseWord: target.baseWord,
    targetBaseReading: target.baseReading,
    targetBaseMeaning: target.baseMeaning,
    targetElement: target.element,
```

- [ ] **Step 4: Add fields in the enemy-side record (~line 640)**

In the same file, find the `rec = {` object starting near line 620 (the enemy-attack builder). Add next to its `targetBaseWord`:

```javascript
    targetBaseWord: target.baseWord,
    targetBaseReading: target.baseReading,
    targetBaseMeaning: target.baseMeaning,
    targetElement: target.element,
```

- [ ] **Step 5: Add fields in the counter-attack record (~line 1175)**

In the same file, find the `counterAttack = {` object near line 1154. Add:

```javascript
      targetBaseWord: allyTarget.baseWord,
      targetBaseReading: allyTarget.baseReading,
      targetBaseMeaning: allyTarget.baseMeaning,
      targetElement: allyTarget.element,
```

- [ ] **Step 6: Run the new tests — expect pass**

Run: `npm run test:unit -- --test-name-pattern="target reading"`
Expected: both tests pass.

- [ ] **Step 7: Run the full unit + integration suite to guard regressions**

Run: `npm test`
Expected: all existing tests still pass. (Coverage ratchet must not drop.)

- [ ] **Step 8: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
git commit -m "feat(combat): expose targetBaseReading and targetBaseMeaning on attack records"
```

---

## Task 2: Add pure helpers for result formatting and effectiveness text

These are small pure functions: `formatResultValue(atk)`, `resultTone(atk)`, and `effectivenessText(atk)`. Test them first, then use them in Task 3.

**Files:**
- Create: `tests/unit/ui/attack-card.test.js`
- Modify: `public/js/ui/attack-card.js` (top-level helpers, above `buildSplitAttackCard`)

- [ ] **Step 1: Create the test file with failing cases**

Create `tests/unit/ui/attack-card.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatResultValue,
  resultTone,
  effectivenessText
} from '../../../public/js/ui/attack-card.js';

describe('attack-card helpers — formatResultValue', () => {
  it('damage category shows -N HP', () => {
    assert.strictEqual(formatResultValue({ category: 'damage', damage: 18 }), '-18 HP');
  });

  it('heal category shows +N HP', () => {
    assert.strictEqual(formatResultValue({ category: 'heal', healAmount: 12 }), '+12 HP');
  });

  it('buff category shows STAT ±N for first stat change', () => {
    assert.strictEqual(
      formatResultValue({ category: 'buff', statChangesApplied: { def: 1 } }),
      'DEF +1'
    );
  });

  it('debuff category shows STAT ±N for stat changes', () => {
    assert.strictEqual(
      formatResultValue({ category: 'debuff', statChangesApplied: { atk: -1 } }),
      'ATK -1'
    );
  });

  it('debuff category falls back to effect label when no stat change', () => {
    assert.strictEqual(
      formatResultValue({ category: 'debuff', effectApplied: 'confuse' }),
      'Confused!'
    );
  });

  it('shield category with no stat change falls back to label', () => {
    assert.strictEqual(
      formatResultValue({ category: 'shield' }),
      'Shielded!'
    );
  });

  it('drain category shows -N HP like damage', () => {
    assert.strictEqual(
      formatResultValue({ category: 'drain', damage: 14, healAmount: 7 }),
      '-14 HP'
    );
  });
});

describe('attack-card helpers — resultTone', () => {
  it('damage → damage tone', () => {
    assert.strictEqual(resultTone({ category: 'damage' }), 'damage');
  });
  it('heal → heal tone', () => {
    assert.strictEqual(resultTone({ category: 'heal' }), 'heal');
  });
  it('buff → buff tone', () => {
    assert.strictEqual(resultTone({ category: 'buff' }), 'buff');
  });
  it('shield → buff tone (shields are a positive buff-like effect)', () => {
    assert.strictEqual(resultTone({ category: 'shield' }), 'buff');
  });
  it('debuff → debuff tone', () => {
    assert.strictEqual(resultTone({ category: 'debuff' }), 'debuff');
  });
  it('drain → damage tone', () => {
    assert.strictEqual(resultTone({ category: 'drain' }), 'damage');
  });
});

describe('attack-card helpers — effectivenessText', () => {
  it('returns empty string for neutral matchup on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 1 }), '');
  });
  it('returns super effective for >1 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 2 }), '(Super effective!)');
  });
  it('returns not very effective for <1 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 0.5 }), '(Not very effective…)');
  });
  it('returns no effect for 0 multiplier on damage', () => {
    assert.strictEqual(effectivenessText({ category: 'damage', elementMultiplier: 0 }), '(No effect!)');
  });
  it('returns empty string for non-damage categories regardless of multiplier', () => {
    assert.strictEqual(effectivenessText({ category: 'heal', elementMultiplier: 2 }), '');
    assert.strictEqual(effectivenessText({ category: 'buff', elementMultiplier: 0.5 }), '');
    assert.strictEqual(effectivenessText({ category: 'debuff', elementMultiplier: 2 }), '');
  });
  it('returns super effective for drain on >1 multiplier', () => {
    assert.strictEqual(effectivenessText({ category: 'drain', elementMultiplier: 2 }), '(Super effective!)');
  });
});
```

- [ ] **Step 2: Run — expect failures (imports don't exist yet)**

Run: `npm run test:unit -- --test-name-pattern="attack-card helpers"`
Expected: import errors / "undefined" — none of the three helpers exist yet.

- [ ] **Step 3: Add the three helpers at the top of `public/js/ui/attack-card.js`**

Open `public/js/ui/attack-card.js`. Just under the existing imports (around line 10, after the existing `import` block), **add** these three exported helpers. Do not remove any existing code yet.

```javascript
/** Map move `category` → tone class used by CSS for color. */
export function resultTone(atk) {
  switch (atk?.category) {
    case 'damage': return 'damage';
    case 'drain':  return 'damage';
    case 'heal':   return 'heal';
    case 'buff':   return 'buff';
    case 'shield': return 'buff';
    case 'debuff': return 'debuff';
    default:       return 'damage';
  }
}

/** Capitalize the first letter and append `!`; used for effect labels (e.g. "Confused!"). */
function labelize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1) + '!';
}

/** Format the right-side result string from the attack payload. */
export function formatResultValue(atk) {
  const cat = atk?.category;
  if (cat === 'damage' || cat === 'drain') {
    return `-${atk.damage ?? 0} HP`;
  }
  if (cat === 'heal') {
    return `+${atk.healAmount ?? 0} HP`;
  }
  if (cat === 'buff' || cat === 'debuff' || cat === 'shield') {
    const changes = atk.statChangesApplied;
    if (changes) {
      const [stat, value] = Object.entries(changes)[0];
      const name = (SC_NAMES?.[stat] || stat).toUpperCase();
      return `${name} ${value > 0 ? '+' : ''}${value}`;
    }
    if (atk.effectApplied) return labelize(atk.effectApplied);
    if (cat === 'shield') return 'Shielded!';
    return '';
  }
  return '';
}

/** Effectiveness line shown under the damage number (damage/drain only). */
export function effectivenessText(atk) {
  if (atk?.category !== 'damage' && atk?.category !== 'drain') return '';
  const mult = atk.elementMultiplier;
  if (mult == null || mult === 1) return '';
  if (mult === 0) return '(No effect!)';
  if (mult < 1)   return '(Not very effective…)';
  return '(Super effective!)';
}
```

`SC_NAMES` is already imported from `./combat-ui-utils.js` at the top of the file, so `formatResultValue` can use it directly.

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test:unit -- --test-name-pattern="attack-card helpers"`
Expected: all 18 helper tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/attack-card.js tests/unit/ui/attack-card.test.js
git commit -m "feat(attack-card): add pure helpers for result value, tone, and effectiveness"
```

---

## Task 3: Rewrite `buildSplitAttackCard` with new 3-block DOM

Replace the function body. The signature stays the same (still takes `atk`, `isEnemy`, `options`). The only option shape change: `options.leftHtml` is renamed `options.attackerHtml`. The default animation is preserved via `.sac-row` class + `ATTACK_CARD_TIMING`.

**Files:**
- Modify: `public/js/ui/attack-card.js` (replace function body at lines ~67–130; drop now-dead `actionIconPath` usage on the attacker-base word)
- Test: `tests/unit/ui/attack-card.test.js` (add DOM-output assertions)

- [ ] **Step 1: Add failing DOM-shape tests**

Append to `tests/unit/ui/attack-card.test.js`:

```javascript
import { buildSplitAttackCard } from '../../../public/js/ui/attack-card.js';

// Minimal mock: calling buildSplitAttackCard requires getKnownWords() which
// reads from module state. Seed it via the module's setter if needed, or
// rely on the default empty set (unknown entity render path).
import { _setKnownWordsForTest } from '../../../public/js/ui/bootstrap-client.js';

const SAMPLE_ATTACK = {
  category: 'damage',
  damage: 18,
  elementMultiplier: 2,
  attackerId: 'hi',
  attackerName: 'Fire',
  attackerNameJp: '火',
  attackerElement: 'fire',
  attackerBaseWord: '火',
  attackerBaseReading: 'ひ',
  attackerBaseMeaning: 'fire',
  attackerSkillName: '炎',
  attackerSkillReading: 'ほのお',
  attackerSkillEn: 'flame',
  moveElement: 'fire',
  targetId: 'ki',
  targetName: 'Tree',
  targetNameJp: '木',
  targetBaseWord: '木',
  targetBaseReading: 'き',
  targetBaseMeaning: 'tree',
  targetElement: 'wood',
};

describe('buildSplitAttackCard — new 3-block layout', () => {
  it('renders three .sac-row elements in attacker → move → target order', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    const rows = html.match(/class="sac-row"/g);
    assert.strictEqual(rows?.length, 3, 'should have exactly 3 sac-row elements');
  });

  it('includes the attacker hiragana reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ひ'), 'attacker reading missing');
    assert.ok(html.includes('fire'), 'attacker English missing');
  });

  it('includes the move reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('ほのお'), 'move reading missing');
    assert.ok(html.includes('flame'), 'move English missing');
  });

  it('includes the target reading and English gloss', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('き'), 'target reading missing');
    assert.ok(html.includes('tree'), 'target English missing');
  });

  it('renders the result value and effectiveness line for super-effective damage', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('-18 HP'), 'damage number missing');
    assert.ok(html.includes('(Super effective!)'), 'effectiveness line missing');
  });

  it('omits effectiveness line for neutral damage', () => {
    const html = buildSplitAttackCard({ ...SAMPLE_ATTACK, elementMultiplier: 1 }, false);
    assert.ok(!html.includes('Super effective'), 'should not show super effective at mult=1');
    assert.ok(!html.includes('Not very effective'), 'should not show not-very-effective at mult=1');
  });

  it('renders heal category with +N HP and no effectiveness', () => {
    const html = buildSplitAttackCard(
      { ...SAMPLE_ATTACK, category: 'heal', healAmount: 12, elementMultiplier: 2 },
      false
    );
    assert.ok(html.includes('+12 HP'));
    assert.ok(!html.includes('Super effective'));
  });

  it('renders down-arrow chevrons between rows 1-2 and 2-3 only', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    const arrows = html.match(/class="sac-down-arrow"/g);
    assert.strictEqual(arrows?.length, 2, 'expected exactly 2 down arrows');
  });

  it('renders a tap-to-continue strip at the bottom', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('sac-continue-strip'));
    assert.ok(html.includes('tap to continue'));
  });

  it('applies the element theme via CSS variables', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false);
    assert.ok(html.includes('--sac-accent:'));
    assert.ok(html.includes('--sac-bg:'));
    assert.ok(html.includes('--sac-border:'));
  });

  it('honors options.attackerHtml as an override for the attacker row', () => {
    const html = buildSplitAttackCard(SAMPLE_ATTACK, false, {
      attackerHtml: '<div class="mock-npc-attacker">CUSTOM</div>'
    });
    assert.ok(html.includes('mock-npc-attacker'));
    assert.ok(html.includes('CUSTOM'));
  });
});
```

Note: if `_setKnownWordsForTest` does not exist, the test file's import must be removed — `getKnownWords` defaults to an empty `Set` on module init, which is exactly the "unknown entity" render path we want to exercise. Verify in Step 2.

- [ ] **Step 2: Run tests — confirm they fail for the right reason**

Run: `npm run test:unit -- --test-name-pattern="buildSplitAttackCard"`
Expected: tests fail because the current function still emits the old HTML (no `sac-down-arrow`, no `sac-continue-strip`, still has `sac-left`/`sac-tag`, etc).

If the import of `_setKnownWordsForTest` fails: delete that line from the test file. The empty-set default is fine.

- [ ] **Step 3: Rewrite `buildSplitAttackCard` in `public/js/ui/attack-card.js`**

Replace the existing function (currently ~lines 67–130) with:

```javascript
export function buildSplitAttackCard(atk, isEnemy, options = {}) {
  const theme = options.theme != null
    ? options.theme
    : (ELEMENT_THEME[atk.attackerElement] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' });

  const knownWords = getKnownWords();
  const wordDict = new Map();

  const attackerToken = entityToToken({
    word: atk.attackerBaseWord || atk.attackerNameJp || atk.attackerName,
    reading: atk.attackerBaseReading,
    nameEn: atk.attackerBaseMeaning || atk.attackerName,
  });
  const moveToken = entityToToken({
    word: atk.attackerSkillName || atk.moveName,
    reading: atk.attackerSkillReading,
    nameEn: atk.attackerSkillEn || atk.moveNameEn,
  });
  const targetToken = entityToToken({
    word: atk.targetBaseWord || atk.targetNameJp || atk.targetName,
    reading: atk.targetBaseReading,
    nameEn: atk.targetBaseMeaning || atk.targetName,
  });

  const attackerWordHtml = renderJpSentence([attackerToken], knownWords, wordDict);
  const moveWordHtml     = renderJpSentence([moveToken], knownWords, wordDict);
  const targetWordHtml   = renderJpSentence([targetToken], knownWords, wordDict);

  const spriteWord = atk.attackerBaseWord || atk.attackerName || '？';
  const attackerSpriteHtml = creatureSpriteHtml(atk.attackerId, spriteWord, atk.attackerElement, 'sac-sprite');

  const moveIcon = actionIconPath(atk.attackerSkillEn || atk.moveNameEn);
  const moveIconHtml = moveIcon
    ? `<img class="sac-sprite" src="${moveIcon}" alt="" onerror="this.style.display='none'">`
    : '';

  const isSelfTarget = atk.targetId === atk.attackerId && atk.targetIndex === atk.attackerIndex;
  const targetSpriteClass = isSelfTarget ? 'sac-sprite' : (isEnemy ? 'sac-sprite' : 'sac-sprite sac-sprite-enemy');
  const targetSpriteWord = atk.targetBaseWord || atk.targetName || '？';
  const targetSpriteHtml = creatureSpriteHtml(atk.targetId, targetSpriteWord, atk.targetElement, targetSpriteClass);

  const resultValue = formatResultValue(atk);
  const tone = resultTone(atk);
  const effText = effectivenessText(atk);
  const effHtml = effText
    ? `<span class="sac-effectiveness sac-fx-${tone}">${effText}</span>`
    : '';

  // Drain: small secondary "self-heal" line under the damage number
  const drainHealHtml = (atk.category === 'drain' && atk.healAmount > 0)
    ? `<span class="sac-drain-self">+${atk.healAmount} HP self</span>`
    : '';

  const attackerRowInner = options.attackerHtml !== undefined
    ? options.attackerHtml
    : `<div class="sac-sprite-tile">${attackerSpriteHtml}</div>
       <div class="sac-body">${attackerWordHtml}</div>`;

  return `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-bg:${theme.bg};--sac-accent:${theme.accent};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-row" data-row="0">
      ${attackerRowInner}
      <span class="sac-down-arrow">»</span>
    </div>
    <div class="sac-row" data-row="1">
      <div class="sac-sprite-tile">${moveIconHtml}</div>
      <div class="sac-body">${moveWordHtml}</div>
      <span class="sac-down-arrow">»</span>
    </div>
    <div class="sac-row" data-row="2">
      <div class="sac-sprite-tile">${targetSpriteHtml}</div>
      <div class="sac-body">
        ${targetWordHtml}
        <div class="sac-result">
          <span class="sac-result-value sac-tone-${tone}">${resultValue}</span>
          ${effHtml}
          ${drainHealHtml}
        </div>
      </div>
    </div>
    <div class="sac-continue-strip">
      <span class="sac-continue">tap to continue</span>
    </div>
  </div>`;
}
```

Remove the now-dead helpers inside the function (everything in the old body: `wrapWithRuby`, `baseIcon`, `skillIcon`, `cat`, `defaultTagByCat`, `tagByCat`, `tagLabel`, `tagClass`, `damageClass`, `attackerWord`, `targetWord`, `targetSpriteClass` in its old form, `leftColumnInner`). Keep the `wrapWithRuby` **function definition** at the top of the file for now — `insertNpcAttackCard` still uses it for the NPC attacker name display in Task 4, and removing it now would break the intermediate state.

Actually — `wrapWithRuby` is only used inside `buildSplitAttackCard` and `insertNpcAttackCard`. After Task 4 rewrites the NPC path, `wrapWithRuby` becomes dead. Remove it then. For this task, leave it in place.

Same for `escHtml`: kept for `insertNpcAttackCard` in its current form; removed in Task 4.

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test:unit -- --test-name-pattern="buildSplitAttackCard"`
Expected: all DOM-shape tests pass.

- [ ] **Step 5: Syntax check the module**

Run: `node --check public/js/ui/attack-card.js && echo "OK"`
Expected: `OK`.

- [ ] **Step 6: Run the full unit suite to catch collateral damage**

Run: `npm run test:unit`
Expected: all pass. (Watch especially `combat-vfx.test.js` — it imports from this module.)

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/attack-card.js tests/unit/ui/attack-card.test.js
git commit -m "feat(attack-card): rewrite card with 3-block vertical layout"
```

---

## Task 4: Update `insertNpcAttackCard` for renamed option and drop dead NPC-name wrapping

`insertNpcAttackCard` currently builds an HTML string for the left column that includes `wrapWithRuby(attackerNameJp, …)` + the NPC sprite + an attacker-name div. The new structure uses the same `attackerHtml` override slot, but the default shape should match the creature row (sprite tile + `sac-body` containing `renderJpSentence`). The visible "attacker-name" div is no longer needed — the sentence renderer handles the name.

**Files:**
- Modify: `public/js/ui/attack-card.js` — `insertNpcAttackCard` body only; also delete `wrapWithRuby` and `escHtml` if no longer referenced.
- Test: `tests/unit/ui/attack-card.test.js` (one case).

- [ ] **Step 1: Add a failing test for NPC attacker-row output**

Append to `tests/unit/ui/attack-card.test.js`:

```javascript
describe('insertNpcAttackCard (via buildSplitAttackCard attackerHtml shape)', () => {
  it('NPC attacker row uses sprite tile + sac-body with renderJpSentence', () => {
    const atk = {
      ...SAMPLE_ATTACK,
      category: 'damage',
      attackerId: 'mentor',
      attackerName: 'Mentor',
      attackerNameJp: '先生',
      attackerBaseWord: '先生',
      attackerBaseReading: 'せんせい',
      attackerBaseMeaning: 'teacher',
    };
    // Simulate what insertNpcAttackCard builds for attackerHtml — a sprite tile
    // with the NPC image + a sac-body with the renderJpSentence output.
    const npcAttackerHtml =
      `<div class="sac-sprite-tile"><img class="sac-sprite" src="/assets/sprites/npcs/mentor.webp" alt=""></div>` +
      `<div class="sac-body">MOCK_NPC_WORD</div>`;
    const html = buildSplitAttackCard(atk, true, { attackerHtml: npcAttackerHtml });
    assert.ok(html.includes('MOCK_NPC_WORD'));
    assert.ok(html.includes('mentor.webp'));
    // No legacy .sac-attacker-name element should appear
    assert.ok(!html.includes('sac-attacker-name'));
  });
});
```

- [ ] **Step 2: Run — confirm failure**

Run: `npm run test:unit -- --test-name-pattern="insertNpcAttackCard"`
Expected: fails because the current `insertNpcAttackCard` builds a different `leftHtml` shape; since we renamed the option in Task 3, it now produces the DEFAULT creature-sprite attacker row instead of using the NPC sprite. The test specifically passes `attackerHtml`, so after Task 3 it should actually pass — **but** we want to verify the NPC entry point itself uses the correct shape. Since we can't easily run DOM side-effecting `insertNpcAttackCard` in node:test, the test above only verifies the shape through `buildSplitAttackCard`. The actual `insertNpcAttackCard` code change is validated by Step 3 (source inspection + manual playtest in Task 6).

If the test already passes after Task 3: good — move to Step 3 and fix the source.

- [ ] **Step 3: Update `insertNpcAttackCard` to build the new attackerHtml**

In `public/js/ui/attack-card.js`, replace the body of `insertNpcAttackCard` (currently ~lines 164–196):

```javascript
export function insertNpcAttackCard(atk) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return null;

  const theme = ELEMENT_THEME[atk.moveElement] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' };
  const spriteUrl = npcSpritePath(atk.attackerId);

  const knownWords = getKnownWords();
  const npcToken = entityToToken({
    word: atk.attackerBaseWord || atk.attackerNameJp || atk.attackerName,
    reading: atk.attackerBaseReading,
    nameEn: atk.attackerBaseMeaning || atk.attackerName,
  });
  const attackerWordHtml = renderJpSentence([npcToken], knownWords, new Map());

  const attackerHtml =
    `<div class="sac-sprite-tile"><img class="sac-sprite" src="${spriteUrl}" alt="" onerror="this.style.display='none'"></div>` +
    `<div class="sac-body">${attackerWordHtml}</div>`;

  actionArea.innerHTML = buildSplitAttackCard(atk, true, { theme, attackerHtml });

  const card = actionArea.querySelector('.split-attack-card');
  if (!card) return null;

  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  const baseWord = atk.attackerBaseWord;
  const skillName = atk.attackerSkillName || atk.moveName;
  if (baseWord) prefetchWord(baseWord);
  if (skillName) prefetchWord(skillName);
  setTimeout(() => playWordPair(baseWord, skillName), 50);

  return card;
}
```

- [ ] **Step 4: Delete now-dead helpers at the top of the file**

After the rewrite, `wrapWithRuby`, `escHtml`, and the local `KANJI_RE` / `KATAKANA_RE` regexes are unused. Delete them. Also delete the `tagLabelsByCategory` / `defaultCategoryTagLabel` options from the JSDoc — they no longer have any effect. Verify no remaining callsites:

Run: `grep -n "wrapWithRuby\|escHtml\|KANJI_RE\|KATAKANA_RE\|tagLabelsByCategory\|defaultCategoryTagLabel" public/js/ui/attack-card.js`
Expected: no output (all dead).

- [ ] **Step 5: Syntax check and run tests**

Run: `node --check public/js/ui/attack-card.js && echo "OK"`
Run: `npm run test:unit`
Expected: `OK` and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/attack-card.js tests/unit/ui/attack-card.test.js
git commit -m "refactor(attack-card): adapt NPC path to attackerHtml and drop dead helpers"
```

---

## Task 5: Replace CSS for the card

Delete the old `.sac-*` CSS block (roughly lines 1199–1437 in `public/game.css`) and insert the new block. The new classes were specified during visual iteration; reproduce them faithfully so the live card matches the locked mockup.

**Files:**
- Modify: `public/game.css` (replace one contiguous block).

- [ ] **Step 1: Find the exact boundaries of the existing block**

Run: `grep -n "\.split-attack-card\|\.sac-" public/game.css | head -60`
Expected: a contiguous range starting at the `.split-attack-card {` line (~1199) and ending at the closing `@keyframes sacFadeIn` block (~1437).

Record the exact line numbers for the replacement. (The file may have shifted; confirm before editing.)

- [ ] **Step 2: Replace the block**

Delete the range identified in Step 1 and insert the following. The new block keeps the `--sac-border`, `--sac-bg`, `--sac-accent`, `--sac-row-dur` CSS variables so the JS side doesn't need to change theming.

```css
/* ── Split Attack Card — 3-block vertical layout ─────────────────── */
.split-attack-card {
  --sac-continue-bg: rgba(49,183,224,0.08);
  display: flex;
  flex-direction: column;
  max-width: 300px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--sac-border, rgba(0,0,0,0.1));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  animation: sacFadeIn 200ms ease-out;
  position: relative;
  cursor: pointer;
  color: var(--text-primary);
}
.split-attack-card.sac-fading-out {
  opacity: 0;
  transition: opacity 100ms ease-out;
}

.sac-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-top: 1px solid rgba(0,0,0,0.06);
  opacity: 0;
  transform: translateX(-8px);
  transition: opacity var(--sac-row-dur, 100ms) ease-out,
              transform var(--sac-row-dur, 100ms) ease-out;
}
.sac-row:first-of-type { border-top: none; }
.sac-row.sac-visible {
  opacity: 1;
  transform: translateX(0);
}

.sac-sprite-tile {
  width: 64px; height: 64px;
  background: var(--sac-bg, #f5f7fa);
  border: 1px solid var(--sac-border, rgba(0,0,0,0.1));
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sac-sprite-tile .sac-sprite,
.sac-sprite-tile img {
  width: 60px; height: 60px;
  object-fit: contain;
  image-rendering: pixelated;
}
.sac-sprite-enemy { transform: scaleX(-1); }

.sac-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 600;
}

/* Constrain ruby + gloss to natural column inside the card (override
   the sentence renderer's absolute-positioned gloss which is tuned for
   inline flow where neighbouring words mustn't be pushed aside). */
.split-attack-card .jp-entity,
.split-attack-card .jp-unknown {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.split-attack-card .jp-entity .jp-stack-en,
.split-attack-card .jp-unknown .jp-stack-en {
  position: static;
  transform: none;
  width: auto;
  margin-top: 1px;
  text-align: left;
}
.split-attack-card .sac-body ruby {
  line-height: 1.15;
  ruby-align: start;
}
.split-attack-card .sac-body ruby rt { text-align: left; }

/* Down-arrow chevrons between rows (hidden on last row) */
.sac-down-arrow {
  position: absolute;
  right: 24px;
  bottom: -14px;
  color: var(--sac-accent, var(--text-secondary));
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
  transform: rotate(90deg);
  letter-spacing: -4px;
  z-index: 2;
  background: #fff;
  padding: 2px 6px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.sac-row:last-of-type .sac-down-arrow { display: none; }

/* Inline result on the target row */
.sac-result {
  margin-left: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
}
.sac-result-value {
  font-size: 22px;
  font-weight: 800;
}
.sac-tone-damage { color: #ef5350; }
.sac-tone-heal   { color: #388E3C; }
.sac-tone-buff   { color: #1976D2; }
.sac-tone-debuff { color: #7B1FA2; }

.sac-effectiveness {
  font-size: 10.5px;
  font-style: italic;
  margin-top: 3px;
  white-space: nowrap;
}
.sac-fx-damage { color: #D32F2F; }
.sac-fx-heal   { color: #388E3C; }
.sac-fx-buff   { color: #1976D2; }
.sac-fx-debuff { color: #7B1FA2; }

.sac-drain-self {
  font-size: 10.5px;
  color: #388E3C;
  margin-top: 2px;
  white-space: nowrap;
}

/* Tap-to-continue strip */
.sac-continue-strip {
  border-top: 1px solid rgba(0,0,0,0.08);
  background: var(--sac-continue-bg);
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sac-continue {
  color: rgba(22,130,170,0.95);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sac-continue::before {
  content: '▼';
  font-size: 8px;
  transform: translateY(-0.5px);
}

@keyframes sacFadeIn {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 3: Confirm no old class names remain referenced outside this module**

Run: `grep -rn "sac-left\|sac-right\|sac-tag\|sac-impact\|sac-attacker-name\|sac-action-icon\|sac-meaning\|sac-damage\b\|sac-heal\b\|sac-text-sprite" public/ src/ 2>/dev/null`
Expected: no output, or only from this CSS file's preserved compatibility aliases (there shouldn't be any). If anything shows up in JS: delete those references — they're dead.

- [ ] **Step 4: Smoke-check page load (no Playwright yet)**

Run: `npm run dev` in the background, then
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173`
Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add public/game.css
git commit -m "style(attack-card): replace .sac-* rules for new 3-block layout"
```

---

## Task 6: Manual Playwright playtest + visual verification

Per the repo's **Visual Verification Rule** (see CLAUDE.md), CSS / visual changes are not done until a browser screenshot confirms them. Before running Playwright, **ask the user for permission** (CLAUDE.md: "Don't launch Playwright without asking first").

Follow [`docs/playtest-guide.md`](../../playtest-guide.md). Screenshots must be `rm`-ed in the same tool-call block where they are taken.

**Files:**
- (no source edits)

- [ ] **Step 1: Ask the user for permission to launch Playwright**

> "Ready to visually verify. OK to launch Playwright on `http://localhost:5173`?"

Wait for confirmation before proceeding.

- [ ] **Step 2: Start dev server (if not already running)**

Run: `npm run dev` in a background terminal.
Expected: Vite + Express come up; confirm `http://localhost:5173` returns 200.

- [ ] **Step 3: Playtest — damage with super-effective matchup**

Navigate to the game, start a run with a Fire creature, reach a combat where a Fire move hits a Wood enemy.

Expected on the card:
- 3 vertical blocks: attacker (Fire creature sprite + reading + English)
- move block (flame action icon + reading + English)
- target block (Wood creature sprite, horizontally flipped, + reading + English + `-X HP` + `(Super effective!)`)
- Two `»` chevrons between blocks, right-aligned
- "tap to continue" tinted strip at the bottom

Take screenshot. Inspect. `rm` the screenshot.

- [ ] **Step 4: Playtest — neutral damage (no effectiveness line)**

Reach a combat where element matchup is 1.0 (e.g. Fire vs Water is resisted — pick a known-neutral pair, or force via debug tools).

Expected: no effectiveness line under the damage number.

Screenshot, inspect, `rm`.

- [ ] **Step 5: Playtest — heal on self**

Use a heal move (e.g. Sleep) on self. Expected:
- Target block shows the same creature as attacker (no horizontal flip).
- Result: `+N HP` in green, no effectiveness line.

Screenshot, inspect, `rm`.

- [ ] **Step 6: Playtest — buff on self (Guard)**

Use Guard on self. Expected:
- Result: `DEF +1` in blue, no effectiveness line.

Screenshot, inspect, `rm`.

- [ ] **Step 7: Playtest — debuff on enemy (Rage → confuse)**

Use Rage; when confusion lands, expect the card's result to read `Confused!` in purple.

Screenshot, inspect, `rm`.

- [ ] **Step 8: Playtest — NPC skill hit**

Trigger a friendly NPC using a skill on an enemy (or an enemy NPC hitting you). Expected:
- Attacker block shows the NPC sprite (not a creature sprite) + NPC name word.
- Move block shows the NPC skill.
- Target block shows the target creature with result.

Screenshot, inspect, `rm`.

- [ ] **Step 9: Playtest — PvP parity sanity check**

If possible (queue a PvP match), verify the card also renders correctly in PvP mode. Same 3 blocks, same data.

Screenshot, inspect, `rm`.

- [ ] **Step 10: Close Playwright, stop dev server**

Stop any background processes you started. Do not commit anything in Task 6 unless you discover a bug and fix it — report findings directly to the user.

---

## Self-review (completed before plan was saved)

1. **Spec coverage** — every section of the spec maps to a task:
   - Visual layout → Task 3 (JS) + Task 5 (CSS)
   - Result block per category → Task 2 (helpers) + Task 3 (wiring)
   - Effectiveness line → Task 2 + Task 3
   - Self-targeting → Task 3 (`isSelfTarget` branch)
   - NPC attacks → Task 4
   - Animation & interaction → preserved (Task 3 keeps `sac-row` + `sac-visible` + `ATTACK_CARD_TIMING`; Task 5 keeps matching CSS)
   - Files changed → Tasks 1, 3, 4, 5
   - Testing plan → Task 2 (helpers), Task 3 (DOM), Task 6 (visual)
   - Open questions (reading/meaning on target) → resolved by Task 1 (payload extension)

2. **Placeholder scan** — none found. Every step has concrete code or concrete commands.

3. **Type consistency** — `formatResultValue` / `resultTone` / `effectivenessText` signatures match between Task 2 definition and Task 3 usage. `options.attackerHtml` name is consistent across Task 3 and Task 4. `sac-tone-*` and `sac-fx-*` class names match between Task 3 JS output and Task 5 CSS rules.
