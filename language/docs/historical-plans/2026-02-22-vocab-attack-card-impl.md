# Vocab Attack Card Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current `buildVocabAttackCard` with a split-panel card that shows attacker sprite, furigana-annotated vocab, and click-to-continue pacing.

**Architecture:** Backend adds three missing fields to attack objects. Frontend replaces the card builder with a promise-based `showAttackCardAndWait()` that builds a split card, runs a fast reveal animation, then awaits the player's tap before resolving. All combat loop call sites swap `delay(400)` for this new await.

**Tech Stack:** Vanilla JS (ES6 modules), CSS animations, HTML `<ruby>` for furigana, Node.js test runner.

---

### Task 1: Add `baseReading` to `instantiateRobot()`

**Files:**
- Modify: `src/game/robots.js:63` (add one line after `baseMeaning`)
- Test: `tests/unit/robots.test.js`

**Step 1: Write the failing test**

In `tests/unit/robots.test.js`, add inside the existing `describe('Robot Instantiation')` block after the last `it(...)`:

```js
  it('includes baseReading from template', () => {
    const robot = instantiateRobot('kamedor');
    assert.strictEqual(robot.baseReading, 'かめ');
  });
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/robots.test.js`
Expected: FAIL — `robot.baseReading` is `undefined`

**Step 3: Write minimal implementation**

In `src/game/robots.js:64`, add one line after `baseMeaning: template.baseMeaning,`:

```js
    baseReading: template.baseReading,
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/unit/robots.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/robots.js tests/unit/robots.test.js
git commit -m "feat: add baseReading to instantiateRobot"
```

---

### Task 2: Add new fields to attack objects in `robot-combat-service.js`

**Files:**
- Modify: `src/game/services/robot-combat-service.js:81-97` (player attack builder)
- Modify: `src/game/services/robot-combat-service.js:180-194` (enemy attack builder)
- Test: `tests/unit/robot-combat-service.test.js`

**Step 1: Write the failing tests**

In `tests/unit/robot-combat-service.test.js`, add two new test cases. Inside `describe('Robot Combat - Attack Turn')` after the existing `'includes vocab fields'` test:

```js
  it('includes reading fields and target Japanese name', () => {
    const allies = [instantiateRobot('kamedor')];
    const enemies = [instantiateRobot('kazenoko')];
    const result = processAttackTurn(allies, enemies);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerBaseReading, 'かめ');
    assert.strictEqual(atk.attackerSkillReading, 'かむ');
    assert.strictEqual(atk.targetNameJp, 'カゼノコ');
  });
```

Inside `describe('Robot Combat - Enemy Turn')` after the existing `'includes vocab fields'` test:

```js
  it('includes reading fields and target Japanese name in enemy attacks', () => {
    const allies = [instantiateRobot('hikaribon')];
    const enemies = [instantiateRobot('kamedor')];
    const result = processEnemyTurn(enemies, allies);
    const atk = result.attacks[0];
    assert.strictEqual(atk.attackerBaseReading, 'かめ');
    assert.strictEqual(atk.attackerSkillReading, 'かむ');
    assert.strictEqual(atk.targetNameJp, 'ヒカリボン');
  });
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: 2 FAIL — `attackerBaseReading` is `undefined`

**Step 3: Write minimal implementation**

In `src/game/services/robot-combat-service.js`, add three fields to the player attack object (around line 91, after `targetName: target.nameEn,`):

```js
        targetNameJp: target.name,
        attackerBaseReading: robot.baseReading,
        attackerSkillReading: robot.autoSkill.reading,
```

Add the same three fields to the enemy attack object (around line 190, after `targetName: target.nameEn,`):

```js
        targetNameJp: target.name,
        attackerBaseReading: enemy.baseReading,
        attackerSkillReading: enemy.autoSkill.reading,
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/robot-combat-service.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/game/services/robot-combat-service.js tests/unit/robot-combat-service.test.js
git commit -m "feat: add reading + targetNameJp to attack objects"
```

---

### Task 3: Replace CSS — new `.split-attack-card` styles

**Files:**
- Modify: `public/game.css:908-976` (replace `.vocab-attack-card` block)

**Step 1: Replace the CSS block**

Delete lines 908–976 (the entire `/* ===== VOCAB ATTACK CARD ===== */` section including `@keyframes vocabCardIn` and `@keyframes vocabRowIn`). Replace with:

```css
/* ===== SPLIT ATTACK CARD ===== */
.split-attack-card {
  display: flex;
  max-width: 320px;
  margin: 0 auto;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--sac-border, rgba(255,255,255,0.15));
  animation: sacFadeIn 200ms ease-out;
  position: relative;
  cursor: pointer;
}

.split-attack-card.sac-fading-out {
  opacity: 0;
  transition: opacity 100ms ease-out;
}

/* Left panel: sprite */
.sac-left {
  width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  background: var(--sac-gradient, linear-gradient(135deg, rgba(255,255,255,0.06), rgba(0,0,0,0.3)));
  flex-shrink: 0;
}

.sac-sprite {
  width: 52px;
  height: 52px;
  object-fit: contain;
  image-rendering: pixelated;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.3);
}

.sac-attacker-name {
  font-size: 9px;
  margin-top: 4px;
  color: var(--sac-light, #aaa);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 68px;
}

/* Right panel: vocab rows */
.sac-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.3);
  min-width: 0;
}

.sac-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  gap: 6px;
  opacity: 0;
  transform: translateX(-8px);
  transition: opacity var(--sac-row-dur, 100ms) ease-out,
              transform var(--sac-row-dur, 100ms) ease-out;
}

.sac-row.sac-visible {
  opacity: 1;
  transform: translateX(0);
}

.sac-row + .sac-row {
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* Vocab text with ruby */
.sac-vocab {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  line-height: 1.4;
}

.sac-vocab rt {
  font-size: 8px;
  font-weight: 400;
  color: rgba(255,255,255,0.6);
}

.sac-meaning {
  font-size: 10px;
  color: #888;
  white-space: nowrap;
}

/* Tag pills */
.sac-tag {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.sac-tag-base {
  background: rgba(255,255,255,0.08);
  color: #888;
}

.sac-tag-atk {
  background: rgba(244,67,54,0.3);
  color: #EF9A9A;
}

/* Impact row */
.sac-impact {
  background: rgba(239,83,80,0.06);
  border-top: 1px solid rgba(239,83,80,0.1);
}

.sac-impact-arrow {
  color: var(--sac-light, #aaa);
  font-size: 14px;
  flex-shrink: 0;
}

.sac-impact-sprite {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: contain;
  image-rendering: pixelated;
  border: 1px solid rgba(239,83,80,0.3);
  flex-shrink: 0;
}

.sac-impact-name {
  font-size: 12px;
  color: #ccc;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sac-damage {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-red, #ff5252);
  flex-shrink: 0;
}

/* Continue indicator */
.sac-continue {
  position: absolute;
  bottom: 4px;
  right: 8px;
  color: rgba(49, 183, 224, 0.75);
  font-size: 10px;
  font-weight: 700;
  text-shadow: 0 0 8px rgba(85, 196, 233, 0.45);
  animation: narration-glow 2s ease-in-out infinite;
}

/* Element theming (set via CSS custom properties in JS) */
@keyframes sacFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
(CSS doesn't have a syntax check, but we verify JS still parses since we haven't touched it yet.)

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "style: replace vocab-attack-card CSS with split-attack-card"
```

---

### Task 4: Build `wrapWithRuby()` helper and new card HTML builder

**Files:**
- Modify: `public/js/ui/combat-loop.js:49-91` (replace `ELEMENT_COLORS_VOCAB`, `ACTION_ICON_BASE`, and `buildVocabAttackCard`)

**Step 1: Replace the card builder section**

Delete lines 49–91 (from `// ============ VOCAB ATTACK CARD ============` through the closing `}` of `buildVocabAttackCard`). Replace with:

```js
// ============ SPLIT ATTACK CARD ============

const ATTACK_CARD_TIMING = {
  ROW_STAGGER: 50,
  ROW_ANIM_DURATION: 100,
  FADE_OUT_DURATION: 100
};

const ELEMENT_THEME = {
  water:  { border: 'rgba(33,150,243,0.4)',  bg: 'rgba(33,150,243,0.15)',  light: '#64B5F6' },
  fire:   { border: 'rgba(244,67,54,0.4)',   bg: 'rgba(244,67,54,0.15)',   light: '#EF9A9A' },
  earth:  { border: 'rgba(141,110,99,0.4)',  bg: 'rgba(141,110,99,0.15)',  light: '#BCAAA4' },
  metal:  { border: 'rgba(158,158,158,0.4)', bg: 'rgba(158,158,158,0.15)', light: '#BDBDBD' },
  wood:   { border: 'rgba(76,175,80,0.4)',   bg: 'rgba(76,175,80,0.15)',   light: '#A5D6A7' }
};

const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/;

function wrapWithRuby(word, reading) {
  if (!word || !reading || word === reading || !KANJI_RE.test(word)) return word || '';
  return `<ruby>${word}<rt>${reading}</rt></ruby>`;
}

function buildSplitAttackCard(atk, isEnemy) {
  const theme = ELEMENT_THEME[atk.attackerElement] || { border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.06)', light: '#aaa' };
  const spriteUrl = `/assets/sprites/robots/${atk.attackerId}-idle.webp`;
  const spriteFallback = `/assets/sprites/robots/${atk.attackerId}.webp`;
  const targetSprite = `/assets/sprites/robots/${atk.targetId}-idle.webp`;
  const targetSpriteFallback = `/assets/sprites/robots/${atk.targetId}.webp`;

  const baseWordHtml = wrapWithRuby(atk.attackerBaseWord, atk.attackerBaseReading);
  const skillNameHtml = wrapWithRuby(atk.attackerSkillName, atk.attackerSkillReading);

  const damageSign = atk.damage > 0 ? `-${atk.damage}` : '0';
  const targetDisplayName = atk.targetNameJp || atk.targetName || '';

  return `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-gradient:linear-gradient(135deg,${theme.bg},rgba(0,0,0,0.3));--sac-light:${theme.light};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-left">
      <img class="sac-sprite" src="${spriteUrl}" onerror="this.onerror=null;this.src='${spriteFallback}'" alt="">
      <div class="sac-attacker-name">${atk.attackerNameJp || atk.attackerName}</div>
    </div>
    <div class="sac-right">
      <div class="sac-row" data-row="0">
        <span class="sac-vocab">${baseWordHtml}</span>
        <span class="sac-meaning">${atk.attackerBaseMeaning || ''}</span>
        <span class="sac-tag sac-tag-base">BASE</span>
      </div>
      <div class="sac-row" data-row="1">
        <span class="sac-vocab">${skillNameHtml}</span>
        <span class="sac-meaning">${atk.attackerSkillEn || ''}</span>
        <span class="sac-tag sac-tag-atk">ATK</span>
      </div>
      <div class="sac-row sac-impact" data-row="2">
        <span class="sac-impact-arrow">→</span>
        <img class="sac-impact-sprite" src="${targetSprite}" onerror="this.onerror=null;this.src='${targetSpriteFallback}'" alt="">
        <span class="sac-impact-name">${targetDisplayName}</span>
        <span class="sac-damage">${damageSign}</span>
      </div>
    </div>
    <span class="sac-continue" style="display:none">▼</span>
  </div>`;
}
```

**Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

**Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add wrapWithRuby helper and buildSplitAttackCard builder"
```

---

### Task 5: Build `showAttackCardAndWait()` — the promise-based tap gate

**Files:**
- Modify: `public/js/ui/combat-loop.js` (add new function after `buildSplitAttackCard`)

**Step 1: Add the async function**

Insert this immediately after the `buildSplitAttackCard` function (before the `// ============ MODULE STATE ============` comment):

```js
/**
 * Show the split attack card with staggered reveal and wait for player tap.
 * Returns a Promise that resolves when the player clicks to continue.
 * @param {Object} atk - Attack object from server
 * @param {boolean} isEnemy - Whether this is an enemy attack
 * @returns {Promise<void>}
 */
function showAttackCardAndWait(atk, isEnemy) {
  return new Promise((resolve) => {
    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(); return; }

    actionArea.innerHTML = buildSplitAttackCard(atk, isEnemy);

    const card = actionArea.querySelector('.split-attack-card');
    if (!card) { resolve(); return; }

    // Staggered row reveal
    const rows = card.querySelectorAll('.sac-row');
    rows.forEach((row, i) => {
      setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
    });

    // Show continue indicator after all rows visible
    const totalRevealTime = rows.length * ATTACK_CARD_TIMING.ROW_STAGGER + ATTACK_CARD_TIMING.ROW_ANIM_DURATION;
    setTimeout(() => {
      const indicator = card.querySelector('.sac-continue');
      if (indicator) indicator.style.display = '';
    }, totalRevealTime);

    // Wait for tap
    let resolved = false;
    const onTap = () => {
      if (resolved) return;
      resolved = true;
      actionArea.removeEventListener('click', onTap);

      // Fade out
      card.classList.add('sac-fading-out');
      setTimeout(() => {
        resolve();
      }, ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    };

    // Allow tap any time (even during reveal for speed players)
    actionArea.addEventListener('click', onTap);
  });
}
```

**Step 2: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

**Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add showAttackCardAndWait promise-based tap gate"
```

---

### Task 6: Wire up player attack paths to use new card

**Files:**
- Modify: `public/js/ui/combat-loop.js` — multiple functions

This task replaces calls to `buildVocabAttackCard` + `delay(400)` with `showAttackCardAndWait`.

**Step 1: Update `executeRobotPlayerAttack` (robot combat — player attacks)**

In the `for` loop around line 807–878, find the block that builds the vocab card and awaits delay. Currently:

```js
          const actionArea = document.getElementById('action-area');
          if (actionArea) {
            actionArea.innerHTML = atk.attackerNameJp
              ? buildVocabAttackCard(atk, false, effectKey)
              : `<div class="combat-robot-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
          }
```

And later: `await delay(400);`

Replace the `actionArea.innerHTML` block with:

```js
          if (atk.attackerNameJp) {
            await showAttackCardAndWait(atk, false);
          } else {
            const actionArea = document.getElementById('action-area');
            if (actionArea) {
              actionArea.innerHTML = `<div class="combat-robot-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
            }
          }
```

And **remove** the `await delay(400);` at the end of the loop body (around line 877). The card's tap gate replaces it. If the fallback (no `attackerNameJp`) is used, add `await delay(400);` only in the `else` branch.

Full replacement pattern for the inner loop body — find and replace the section from `const actionArea` through `await delay(400)` with the logic that either uses `showAttackCardAndWait` or falls back to the old text + delay.

**Step 2: Update `showEnemyAttacksAnimated` (robot combat — enemy attacks)**

In `showEnemyAttacksAnimated` (around line 632–665), find:

```js
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = atk.attackerNameJp
        ? buildVocabAttackCard(atk, true, effectKey)
        : `<div class="combat-robot-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
    }
```

And later: `await delay(400);`

Replace with the same pattern:

```js
    if (atk.attackerNameJp) {
      await showAttackCardAndWait(atk, true);
    } else {
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-robot-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
      }
      await delay(400);
    }
```

Remove the standalone `await delay(400);` that was after the old block.

**Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wire robot combat attack paths to split attack card"
```

---

### Task 7: Wire up legacy combat paths to use new card

**Files:**
- Modify: `public/js/ui/combat-loop.js` — `executePlayerAttack` and `executeEnemyAttackThenPause`

**Step 1: Update `executePlayerAttack` (legacy single-creature combat)**

In `executePlayerAttack` around line 504–531, the current code shows damage directly without using `buildVocabAttackCard`. This path uses `showDamageNumber` + `animateEnemyHurt` + `impactEnemyEffect`. After the impact effect, there's a `setTimeout(() => executeEnemyAttackThenPause(), 400)`.

For the legacy path, we don't need to change the damage display (it doesn't use the vocab card). However, the `setTimeout(() => executeEnemyAttackThenPause(), 400)` delay at line 564 should remain — legacy combat doesn't use the split card for player attacks since it doesn't have vocab fields on player attacks.

**No changes needed for `executePlayerAttack`** — it doesn't use `buildVocabAttackCard`. Skip this.

**Step 2: Verify `executeEnemyAttackThenPause` doesn't use the old card**

Check: the legacy enemy attack path uses `showEnemyDamageDisplay(ea)` not `buildVocabAttackCard`. **No changes needed** for the legacy path.

**Step 3: Clean up — remove the old `buildVocabAttackCard` function**

Verify no remaining references to `buildVocabAttackCard` in the file:

Run: `grep -n "buildVocabAttackCard" public/js/ui/combat-loop.js`

If no results (it was replaced in Tasks 4 and 6), this is already clean. If any remain, replace them.

**Step 4: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: "OK"

**Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "refactor: remove old buildVocabAttackCard, clean up legacy paths"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: All existing tests pass (some pre-existing failures on dual-pool-pipeline and chip stats are expected per CLAUDE.md)

**Step 2: Run integration tests**

Run: `npm run test:integration`
Expected: PASS

**Step 3: Syntax check all modified JS files**

```bash
node --check public/js/ui/combat-loop.js && node --check src/game/robots.js && node --check src/game/services/robot-combat-service.js && echo "ALL OK"
```
Expected: "ALL OK"

**Step 4: Final commit if any fixes were needed**

If tests revealed issues, fix and commit with descriptive message.

---

### Task 9: Manual playtest verification

**Pre-requisite:** Start the dev server with `npm run dev` or `npm start`.

**Step 1: Enter robot combat**

Navigate through the game to encounter a wild robot fight. Verify:
- The split card appears for each player robot's attack
- Furigana shows above kanji (e.g., かめ above 亀)
- The `▼` indicator appears after rows reveal
- Tapping the card dismisses it and advances to next attack
- Enemy attacks also show the split card
- Damage effects still fire (shake, hurt animation, SFX)

**Step 2: Speed test**

Tap cards as fast as possible. Verify combat flows faster than the old 400ms delays.

**Step 3: Reading test**

Don't tap — let cards sit. Verify they stay on screen indefinitely until tapped.
