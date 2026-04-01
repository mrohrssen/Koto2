# Playtesting Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 bugs found during March 31 dev playtesting session.

**Architecture:** Each fix is an independent commit. Ordered from quickest/safest to most complex. All fixes target existing files — no new modules needed.

**Tech Stack:** Vanilla JS (ES6 modules), CSS animations, Node.js server

**Spec:** `docs/superpowers/specs/2026-04-01-playtesting-bug-fixes-design.md`

---

## Chunk 1: Quick CSS & Dead Code Fixes (Tasks 1-3)

### Task 1: Bug 6 — Dead enemies disappear fully instead of shrinking

**Files:**
- Modify: `public/game.css:452-457`

The `.defeated` class uses `opacity: 0; transform: scale(0.5)` transition, but the shrunken element remains visible as a tiny remnant. Switch to a keyframe animation that ends with `display: none`.

- [ ] **Step 1: Replace the transition with a keyframe animation**

In `public/game.css`, replace the `.defeated` rule (lines 452-457):

```css
/* OLD */
.enemy-formation .formation-slot.defeated {
  opacity: 0;
  transform: scale(0.5) translateY(20px);
  transition: opacity 0.5s, transform 0.5s;
  pointer-events: none;
}

/* NEW */
.enemy-formation .formation-slot.defeated {
  animation: enemy-defeated 0.5s ease-out forwards;
  pointer-events: none;
}

@keyframes enemy-defeated {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.5) translateY(20px); display: none; }
}
```

Note: CSS `display: none` in keyframes only applies at the end with `forwards` fill. This ensures the element fully disappears after the animation.

- [ ] **Step 2: Verify with syntax check**

Run: `node --check public/game.css 2>&1 || echo "CSS doesn't support --check, visual verify needed"`

CSS files don't have a syntax checker — visual verification will happen during playtesting.

- [ ] **Step 3: Commit**

```bash
git add public/game.css
git commit -m "fix: dead enemies fully disappear instead of shrinking (bug 6)"
```

---

### Task 2: Bug 2 — Start button renders raw HTML

**Files:**
- Modify: `public/game.js:932`

The `t('startRun', ...)` function returns HTML (from the `tagged` i18n property, which renders `<ruby>` and `<span>` tags via `renderEnFirst()`). But line 932 assigns it via `confirmBtn.textContent`, which escapes the HTML and shows raw tags.

- [ ] **Step 1: Change textContent to innerHTML**

In `public/game.js`, line 932, change:

```js
// OLD
confirmBtn.textContent = t('startRun', selected.size, selected.size !== 1 ? 's' : '');

// NEW
confirmBtn.innerHTML = t('startRun', selected.size, selected.size !== 1 ? 's' : '');
```

The `t()` function already escapes interpolation args via `escHtml()` (i18n.js:228), so this is safe from XSS.

- [ ] **Step 2: Verify with syntax check**

Run: `node --check public/game.js && echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "fix: start button renders HTML instead of raw tags (bug 2)"
```

---

### Task 3: Bug 5 — Remove old NPC skill text announcement

**Files:**
- Modify: `public/js/ui/combat-loop.js:1866-1871`

`showNpcSkillAttacksAnimated()` shows an old text announcement (`"NPC uses Skill!"`) in the action area with a 600ms delay BEFORE showing the proper split attack card. The card contains all the same info — the text announcement is redundant.

- [ ] **Step 1: Remove the old text announcement block**

In `public/js/ui/combat-loop.js`, in `showNpcSkillAttacksAnimated()`, remove lines 1866-1871:

```js
// DELETE these lines:
  // Brief NPC skill announcement
  const actionArea = document.getElementById('action-area');
  if (actionArea && result.npcSkillUsed) {
    actionArea.innerHTML = `<div class="combat-creature-attack" style="color:#FFB74D;font-weight:bold">${result.npcSkillUsed.npcNameJp || result.npcSkillUsed.npcName} uses ${result.npcSkillUsed.skillNameEn}!</div>`;
    await delay(600);
  }
```

The function should go straight from the `if (!result.npcSkillAttacks?.length) return;` guard to the `for (const atk of result.npcSkillAttacks)` loop.

- [ ] **Step 2: Verify with syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "fix: remove old NPC skill text announcement before attack card (bug 5)"
```

---

## Chunk 2: UI Cleanup Fixes (Tasks 4-6)

### Task 4: Bug 4 — Clear action buttons after NPC item target selection

**Files:**
- Modify: `public/js/ui/exploration.js:1134-1148`

After selecting which creature receives the friendly NPC item, the API call completes and `updateUI()` fires, but the creature selection cards can persist. Fix: clear the action area before `updateUI()`.

- [ ] **Step 1: Add action area clear before updateUI**

In `public/js/ui/exploration.js`, inside `renderFriendlyNpc()`, in the inner `onSelect` callback (the creature selection callback around line 1134), add a clear before `updateUI()`:

```js
// Find this block (around line 1144):
          if (result?.state) {
            updateGameState(result.state);
            friendlyNpcState.choosing = false;
            updateUI();

// Change to:
          if (result?.state) {
            updateGameState(result.state);
            friendlyNpcState.choosing = false;
            actions.clear();
            updateUI();
```

The `actions` module is already imported/available in this file (used on line 1040).

- [ ] **Step 2: Also clear on the error path**

In the same function, the error path (around line 1139-1141) should also clear:

```js
          } catch (err) {
            friendlyNpcState.choosing = false;
            actions.clear();
            sceneModule?.showNarration?.('Failed to choose item.', { autoDismiss: 1800 });
            renderFriendlyNpc();
            return;
          }
```

- [ ] **Step 3: Verify with syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "fix: clear action buttons after NPC item target selection (bug 4)"
```

---

### Task 5: Bug 7 — Target selection uses standard full-width cards

**Files:**
- Modify: `public/js/ui/target-select.js`
- Modify: `public/game.css` (remove `.target-header` styles if present)

The target selection creates a custom `.target-header` div and separate `btnContainer` for the Back button. No other screen does this. Fix: remove the custom header, render cards directly into the action area (like post-combat-shop and friendly NPC), and append the Back button inline.

- [ ] **Step 1: Simplify showTargets to remove custom header**

Rewrite `showTargets()` in `public/js/ui/target-select.js`:

```js
function showTargets(targets, move, type) {
  const container = dom.actionArea;
  container.innerHTML = '';

  // Filter valid targets
  const validTargets = [];
  const validIndices = [];
  targets.forEach((target, i) => {
    if (target.hp <= 0) return;
    if (type === 'enemy' && target.befriended) return;
    validTargets.push(target);
    validIndices.push(i);
  });

  if (validTargets.length === 0) {
    console.warn('[TargetSelect] No targetable enemies found — auto-cancelling');
    if (onCancel) onCancel();
    return;
  }

  renderChoices({
    cards: validTargets.map(target => {
      const elemColor = ELEMENT_COLORS[target.element] || '#888';
      const elemKanji = ELEMENT_KANJI[target.element] || '—';
      const spriteHtml = `<img src="${creatureStaticPath(target.id)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'">`;
      return {
        sprite: spriteHtml,
        title: target.name,
        subtitle: `${target.nameEn} · Lv${target.level}`,
        badge: { text: elemKanji, color: elemColor },
      };
    }),
    onSelect: (index) => {
      if (onTargetSelect) onTargetSelect(validIndices[index]);
    },
  });

  // Back button — appended after renderChoices
  renderButtons([
    { label: 'Back', onClick: () => { if (onCancel) onCancel(); } },
  ]);
}
```

Key changes:
- Removed the `header` div creation (lines 49-53 old)
- Removed the `choiceContainer` wrapper — renderChoices writes directly to `#action-area`
- Removed the `btnContainer` wrapper — renderButtons appends directly to `#action-area`
- The `renderJpFirst` import can be removed since the header is gone

- [ ] **Step 2: Remove unused import**

Remove `renderJpFirst` from the import line since it was only used in the header:

```js
// OLD
import { renderJpFirst } from './bootstrap-client.js';

// DELETE this import entirely
```

- [ ] **Step 3: Remove .target-header CSS**

In `public/game.css`, find and remove the `.target-header` and `.target-move-name` rules (around lines 4562-4572):

```css
/* DELETE these rules */
.target-header {
  text-align: center;
  padding: 10px;
  color: #aaa;
  font-size: 13px;
}

.target-move-name {
  color: #fff;
  font-weight: bold;
}
```

- [ ] **Step 4: Verify with syntax check**

Run: `node --check public/js/ui/target-select.js && echo "OK"`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/target-select.js public/game.css
git commit -m "fix: target selection uses standard full-width choice cards (bug 7)"
```

---

### Task 6: Bug 3 — NPC shop greeting + remove static header

**Files:**
- Modify: `data/npcs.json` (add `shopGreetings` array to each NPC)
- Modify: `src/game/services/exploration-service.js:341-342` (include greeting in room.npc)
- Modify: `public/js/ui/exploration.js:1023-1110` (show greeting, remove header)

- [ ] **Step 1: Add `shopGreetings` to each NPC in npcs.json**

In `data/npcs.json`, add a `shopGreetings` array to each NPC object. Default: `["こんにちは！"]`. Example for `kodomo`:

```json
{
  "kodomo": {
    "id": "kodomo",
    "name": "子供",
    "nameEn": "Child",
    ...
    "greeting": "こんにちわ!",
    "shopGreetings": ["こんにちは！"],
    ...
  }
}
```

Add `"shopGreetings": ["こんにちは！"]` to ALL NPCs in the file.

- [ ] **Step 2: Include shopGreetings in room.npc assignment**

In `src/game/services/exploration-service.js`, line 342, add `shopGreetings` to the NPC data sent to the client:

```js
// OLD (line 342)
room.npc = { id: picked.id, name: picked.name, nameEn: picked.nameEn };

// NEW
room.npc = {
  id: picked.id,
  name: picked.name,
  nameEn: picked.nameEn,
  shopGreetings: picked.shopGreetings || ['こんにちは！']
};
```

- [ ] **Step 3: Show greeting and remove header in renderFriendlyNpc**

In `public/js/ui/exploration.js`, modify `renderFriendlyNpc()`:

1. Remove the static header "フレンドリーNPC / Choose a gift." from the loading state (lines 1050-1056) and all other static header text.

2. After offers are fetched (around line 1107), before rendering choice cards, show a greeting via the narration box:

```js
  // After friendlyNpcState.offered = offered; (line 1103)
  // Show NPC greeting before item cards
  const room = gameState.room || getActiveRoomFromRun(gameState.run);
  const npc = room?.npc;
  if (npc && sceneModule?.narrationBox) {
    const greetings = npc.shopGreetings || ['こんにちは！'];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    await sceneModule.narrationBox.show(greeting, { speaker: npc.nameEn || npc.name, html: false });
  }

  const offers = friendlyNpcState.offered || [];
  // ... renderChoices follows
```

3. Replace the loading state (lines 1050-1056) with a simple loading spinner or nothing (the narration box + item cards will be the UI):

```js
  // Show loading state immediately — just a subtle loader, no header
  actions.setContent(`
    <div style="display:flex;justify-content:center;padding:20px;">
      <div style="color:var(--text-muted);font-size:12px;">Loading...</div>
    </div>
  `);
```

4. Also remove headers from the error state blocks (lines 1068-1073 and 1089-1094) — replace with simple messages.

- [ ] **Step 4: Verify with syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Run: `node -e "JSON.parse(require('fs').readFileSync('data/npcs.json'))" && echo "JSON OK"`

- [ ] **Step 5: Commit**

```bash
git add data/npcs.json src/game/services/exploration-service.js public/js/ui/exploration.js
git commit -m "feat: NPC shop greeting via narration box, remove static header (bug 3)"
```

---

## Chunk 3: Combat Logic Fixes (Tasks 7-8)

### Task 7: Bug 10 — Dead creature cannot take combat turns

**Files:**
- Modify: `src/game/services/creature-combat-service.js:544` (add defensive HP check)
- Test: `tests/unit/combat/creature-combat-service.test.js`

The enemy turn loop checks `if (enemy.hp <= 0) continue;` at line 518, but a creature could die mid-turn from effects or counters. Add a second check immediately before the attack strike executes.

- [ ] **Step 1: Write failing test**

Add to `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('Dead creature cannot attack', () => {
  it('enemy with 0 hp produces no attacks', () => {
    const ally = instantiateCreature('hi');
    ally.hp = 50;
    const enemy = instantiateCreature('ki');
    enemy.hp = 0; // Dead

    const result = processEnemyTurn([enemy], [ally]);

    assert.strictEqual(result.attacks.length, 0, 'dead enemy should not attack');
    assert.strictEqual(ally.hp, 50, 'ally HP should be unchanged');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (existing check should catch this)**

Run: `npm run test:unit -- --test-name-pattern "Dead creature cannot attack"`

This test should already pass since line 518 has the check. If it does, the bug is a mid-turn death race condition.

- [ ] **Step 3: Add defensive check before strike execution**

In `src/game/services/creature-combat-service.js`, inside the `for (let strike = 0; strike < attackCount; strike++)` loop (line 544), add a re-check at the top:

```js
    for (let strike = 0; strike < attackCount; strike++) {
      // Defensive re-check: creature may have died from effects mid-turn
      if (enemy.hp <= 0) break;

      const currentAliveAllies = allies.filter(a => a.hp > 0);
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/game/services/creature-combat-service.js tests/unit/combat/creature-combat-service.test.js
git commit -m "fix: defensive HP check prevents dead creatures from attacking mid-turn (bug 10)"
```

---

### Task 8: Bug 9 — Befriend quiz targets the last killed creature

**Files:**
- Modify: `src/game/loop.js:741` (use attack records to find actual last kill)
- Test: `tests/unit/combat/creature-combat-service.test.js`

The current code uses `[...enemies].reverse().find(e => e.hp <= 0)` to find the "last killed" enemy, but this just picks the highest-index dead enemy — not the one the player actually killed last. When the player kills enemy at index 0 last but enemies at index 1 and 2 were already dead, the quiz targets the wrong creature.

Additionally, `generateBefriendQuiz()` picks wrong-answer options from the global creature catalog. Wrong answers should come from other creatures in the current encounter for contextual relevance.

- [ ] **Step 1: Write test for generateBefriendQuiz using encounter creatures**

Add to `tests/unit/combat/creature-combat-service.test.js`:

```js
describe('generateBefriendQuiz', () => {
  it('wrong answers come from encounter creatures when provided', () => {
    const target = instantiateCreature('hi');  // Fire
    const others = [instantiateCreature('ki'), instantiateCreature('mizu')]; // Wood, Water

    const quiz = generateBefriendQuiz(target, others);

    assert.strictEqual(quiz.creatureId, target.id);
    const wrongOptions = quiz.options.filter(o => !o.correct);
    assert.strictEqual(wrongOptions.length, 2);
    // Wrong answers should be from the encounter creatures
    const encounterNames = others.map(c => c.nameEn);
    for (const wrong of wrongOptions) {
      assert.ok(encounterNames.includes(wrong.name),
        `wrong answer "${wrong.name}" should be from encounter creatures`);
    }
  });

  it('falls back to catalog when encounter has too few creatures', () => {
    const target = instantiateCreature('hi');
    const others = []; // No other encounter creatures

    const quiz = generateBefriendQuiz(target, others);

    assert.strictEqual(quiz.options.length, 3);
    assert.strictEqual(quiz.options.filter(o => o.correct).length, 1);
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `npm run test:unit -- --test-name-pattern "generateBefriendQuiz"`
Expected: FAIL — `generateBefriendQuiz` doesn't accept a second argument yet.

- [ ] **Step 3: Update generateBefriendQuiz to accept encounter creatures**

In `src/game/services/creature-combat-service.js`, modify `generateBefriendQuiz()` (line 678):

```js
/**
 * Generate a name quiz for a creature.
 * @param {object} creature - The enemy creature to quiz about
 * @param {object[]} [encounterCreatures] - Other creatures in the encounter (preferred for wrong answers)
 */
export function generateBefriendQuiz(creature, encounterCreatures = []) {
  // Prefer wrong answers from encounter creatures
  let wrongCandidates = encounterCreatures
    .filter(c => c.id !== creature.id)
    .map(c => c.nameEn)
    .filter(Boolean);

  // Deduplicate
  wrongCandidates = [...new Set(wrongCandidates)];

  // Fall back to global catalog if not enough encounter creatures
  if (wrongCandidates.length < 2) {
    const allCreatureIds = Object.keys(CREATURES_BY_ID);
    const catalogCandidates = allCreatureIds
      .filter(id => id !== creature.id)
      .map(id => CREATURES_BY_ID[id])
      .filter(Boolean)
      .map(c => c.nameEn)
      .filter(name => !wrongCandidates.includes(name));
    const shuffled = catalogCandidates.sort(() => Math.random() - 0.5);
    wrongCandidates.push(...shuffled);
  }

  // Shuffle and take 2
  const shuffled = wrongCandidates.sort(() => Math.random() - 0.5);
  const wrongNames = shuffled.slice(0, 2);

  while (wrongNames.length < 2) {
    wrongNames.push(wrongNames.length === 0 ? 'Unknown Creature' : 'Mystery Beast');
  }

  const options = [
    { id: creature.id, name: creature.nameEn, correct: true },
    { id: 'wrong-1', name: wrongNames[0], correct: false },
    { id: 'wrong-2', name: wrongNames[1], correct: false }
  ].sort(() => Math.random() - 0.5);

  return { creatureId: creature.id, creatureName: creature.name, creatureNameEn: creature.nameEn, creatureBaseReading: creature.baseReading, options };
}
```

- [ ] **Step 4: Fix lastKilled logic in loop.js**

In `src/game/loop.js`, around line 741, replace the reverse-find with attack-record-based lookup:

```js
// OLD (line 741):
const lastKilled = [...this.combat.enemies].reverse().find(e => e.hp <= 0 && !e.befriended);

// NEW: Find the creature killed by the player's last killing blow
const killingAttacks = (playerResult.attacks || []).filter(a => a.targetDefeated);
const lastKillAtk = killingAttacks[killingAttacks.length - 1];
const lastKilled = lastKillAtk
  ? this.combat.enemies[lastKillAtk.targetIndex]
  : [...this.combat.enemies].reverse().find(e => e.hp <= 0 && !e.befriended);
```

- [ ] **Step 5: Pass encounter creatures to generateBefriendQuiz**

In `src/game/loop.js`, around line 753, pass encounter enemies:

```js
// OLD:
const quiz = generateBefriendQuiz(lastKilled);

// NEW:
const quiz = generateBefriendQuiz(lastKilled, this.combat.enemies);
```

- [ ] **Step 6: Run tests**

Run: `npm run test:unit`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/game/services/creature-combat-service.js src/game/loop.js tests/unit/combat/creature-combat-service.test.js
git commit -m "fix: befriend quiz targets last killed creature with encounter-based options (bug 9)"
```

---

## Chunk 4: Visual UX Improvements (Task 9)

### Task 9: Bug 8 — "Super effective!" center screen + counter slam animation

**Files:**
- Modify: `public/js/ui/combat-loop.js:364-370` and `2101-2108` (replace STAB indicator)
- Modify: `public/js/ui/combat-loop.js:1694-1710` (add counter slam)
- Modify: `public/js/ui/combat-effects.js` (add `lunge` animation)
- Modify: `public/game.css` (replace `.stab-indicator` with `.super-effective-banner`)

Note: There is already a `Super Effective!` popup via `effectiveness(targetEl, 'Super Effective!')` at lines 373-374 for element type advantage (`elementMultiplier > 1`). STAB is a separate mechanic (move element matches attacker element). The user wants STAB to ALSO show "Super effective!" as a big center-screen banner.

- [ ] **Step 1: Add CSS for the center-screen banner**

In `public/game.css`, replace the `.stab-indicator` rules (around lines 1407-1422) with:

```css
/* OLD .stab-indicator rules — DELETE */

/* NEW: center-screen STAB banner */
.super-effective-banner {
  position: fixed;
  top: 35%;
  left: 50%;
  transform: translate(-50%, -50%) scale(1.5);
  font-size: 24px;
  font-weight: 900;
  color: #FFD700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.5);
  z-index: 100;
  pointer-events: none;
  animation: super-effective-anim 1s ease-out forwards;
  letter-spacing: 0.02em;
}

@keyframes super-effective-anim {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  60% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
}
```

- [ ] **Step 2: Replace STAB indicator with center-screen banner in combat-loop.js**

In `public/js/ui/combat-loop.js`, replace BOTH STAB indicator blocks.

**First block (around line 364-370):**

```js
// OLD
  if (atk.stab) {
    const stabEl = document.createElement('div');
    stabEl.className = 'stab-indicator';
    stabEl.textContent = 'STAB!';
    document.getElementById('action-area')?.appendChild(stabEl);
  }

// NEW
  if (atk.stab) {
    const banner = document.createElement('div');
    banner.className = 'super-effective-banner';
    banner.textContent = 'Super effective!';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 1100);
  }
```

**Second block (around line 2101-2108):**

```js
// OLD
          if (atk.stab) {
            const stabEl = document.createElement('div');
            stabEl.className = 'stab-indicator';
            stabEl.textContent = 'STAB!';
            const actionArea2 = document.getElementById('action-area');
            if (actionArea2) actionArea2.appendChild(stabEl);
          }

// NEW
          if (atk.stab) {
            const banner = document.createElement('div');
            banner.className = 'super-effective-banner';
            banner.textContent = 'Super effective!';
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 1100);
          }
```

- [ ] **Step 3: Add `lunge` animation to combat-effects.js**

In `public/js/ui/combat-effects.js`, after the `recoil` function (around line 345), add:

```js
/**
 * Lunge animation — creature moves forward toward a target then returns.
 * Used for counter-attacks.
 * @param {Element} el - The element to lunge
 * @param {number} distance - Pixels to move forward (positive = right, negative = left)
 * @param {number} duration - Total duration in ms
 */
export function lunge(el, distance = 30, duration = 300) {
  if (!el) return Promise.resolve();
  return new Promise(resolve => {
    const cleanup = () => {
      if (el?.style) el.style.transform = '';
      resolve();
    };
    anime(el, {
      translateX: [0, distance, 0],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: cleanup
    });
    setTimeout(cleanup, duration + 50);
  });
}
```

- [ ] **Step 4: Wire lunge into counter attack display**

In `public/js/ui/combat-loop.js`, at the top import section, add `lunge` to the combat-effects import:

```js
// Find the import from combat-effects.js and add lunge
import { ..., lunge } from './combat-effects.js';
```

Then modify `showCounterAttacks()` (around line 1694-1710):

```js
async function showCounterAttacks(result) {
  if (!result.counterAttacks?.length) return;

  for (const counter of result.counterAttacks) {
    const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
    const defenderEl = allAllySlots[counter.defenderIndex];
    const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
    const targetEl = allEnemySlots[counter.targetIndex];

    if (defenderEl) {
      skillProc(defenderEl, 'COUNTER!');
      // Lunge toward enemy (positive X = right = toward enemy side)
      const sprite = defenderEl.querySelector('.formation-sprite');
      if (sprite) await lunge(sprite, 40, 300);
      flashElement(defenderEl.querySelector('.formation-sprite'), 1);
    }

    if (targetEl && counter.damage > 0) {
      spawnParticles(targetEl, 6, '#FF7043');
      if (showDamageNumber) showDamageNumber(counter.damage, false, false);
    }
    // ... rest of the function stays the same
```

- [ ] **Step 5: Verify with syntax checks**

Run: `node --check public/js/ui/combat-loop.js && node --check public/js/ui/combat-effects.js && echo "OK"`

- [ ] **Step 6: Commit**

```bash
git add public/game.css public/js/ui/combat-loop.js public/js/ui/combat-effects.js
git commit -m "feat: 'Super effective!' center banner for STAB + counter slam animation (bug 8)"
```

---

## Chunk 5: XP Distribution Fix (Task 10)

### Task 10: Bug 12 — Dead creatures excluded from XP, alive get more

**Files:**
- Modify: `src/game/services/exploration-service.js:554-558` (whack-a-mole)
- Modify: `src/game/services/exploration-service.js:383-386` (shrine)
- Modify: `src/game/services/exploration-service.js:444-452` (quiz reward)
- Modify: `src/game/creatures.js:198` (defensive guard)
- Test: `tests/unit/game/exploration-xp.test.js`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/game/exploration-xp.test.js`:

```js
describe('Dead creatures excluded from XP', () => {
  it('addXpToCreature does not increase HP for dead creatures on level-up', () => {
    const creature = instantiateCreature('hi');
    creature.level = 5;
    creature.xp = 0;
    creature.hp = 0; // Dead

    const xpNeeded = xpToNextLevel(creature.level);
    addXpToCreature(creature, xpNeeded);

    assert.strictEqual(creature.level, 6, 'should still level up');
    assert.strictEqual(creature.hp, 0, 'dead creature HP must stay 0');
  });

  it('addXpToCreature increases HP for alive creatures normally', () => {
    const creature = instantiateCreature('hi');
    creature.level = 5;
    creature.xp = 0;
    const hpBefore = creature.hp;

    const xpNeeded = xpToNextLevel(creature.level);
    addXpToCreature(creature, xpNeeded);

    assert.strictEqual(creature.level, 6);
    assert.ok(creature.hp >= hpBefore, 'alive creature should gain HP on level-up');
  });
});
```

- [ ] **Step 2: Run test — should fail for dead creature**

Run: `npm run test:unit -- --test-name-pattern "Dead creatures excluded"`
Expected: FAIL — dead creature's HP increases from 0 to ~10.

- [ ] **Step 3: Add defensive guard in addXpToCreature**

In `src/game/creatures.js`, line 198, wrap the HP increase:

```js
// OLD (line 198)
    creature.hp += hpDiff;

// NEW
    if (creature.hp > 0) {
      creature.hp += hpDiff;
    }
```

This allows dead creatures to level up (stats/moves update) but prevents resurrection. Dead creatures stay dead.

- [ ] **Step 4: Run test — should pass now**

Run: `npm run test:unit -- --test-name-pattern "Dead creatures excluded"`
Expected: PASS

- [ ] **Step 5: Filter dead creatures in whack-a-mole XP**

In `src/game/services/exploration-service.js`, `completeWhackAMole()` around line 554-558:

```js
// OLD
      const allCreatures = [
        ...(this.gm.run.creatureParty?.active || []),
        ...(this.gm.run.creatureParty?.reserves || [])
      ].filter(c => c != null);

// NEW
      const allCreatures = [
        ...(this.gm.run.creatureParty?.active || []),
        ...(this.gm.run.creatureParty?.reserves || [])
      ].filter(c => c != null && c.hp > 0);
```

The total XP pool stays the same (`totalXp`), but it's now split among fewer (alive) creatures — each alive creature gets more.

- [ ] **Step 6: Guard shrine against dead creatures**

In `src/game/services/exploration-service.js`, `useShrine()` around line 383-386:

```js
// After finding the creature (line 383-386):
    const creature = allCreatures.find(r => r.id === creatureId);
    if (!creature) {
      throw new Error('Creature not in party');
    }
    // ADD:
    if (creature.hp <= 0) {
      throw new Error('Cannot use shrine on a fainted creature');
    }
```

- [ ] **Step 7: Guard quiz levelup reward against dead creatures**

In `src/game/services/exploration-service.js`, `useQuizReward()` case 'levelup' around line 450-451:

```js
      case 'levelup': {
        if (!creatureId) throw new Error('creatureId required for levelup reward');
        const allCreatures = [
          ...this.gm.run.creatureParty.active,
          ...this.gm.run.creatureParty.reserves
        ].filter(Boolean);
        const creature = allCreatures.find(r => r.id === creatureId);
        if (!creature) throw new Error('Creature not in party');
        // ADD:
        if (creature.hp <= 0) throw new Error('Cannot level up a fainted creature');
        addXpToCreature(creature, xpToNextLevel(creature.level), null, this.gm.run?.itemBuffs);
```

- [ ] **Step 8: Run full test suite**

Run: `npm test`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add src/game/creatures.js src/game/services/exploration-service.js tests/unit/game/exploration-xp.test.js
git commit -m "fix: dead creatures excluded from XP, alive get more; no resurrection on level-up (bug 12)"
```

---

## Final Verification

- [ ] **Run full test suite:** `npm test`
- [ ] **Syntax check all modified JS files:**
  ```bash
  node --check public/game.js && \
  node --check public/js/ui/combat-loop.js && \
  node --check public/js/ui/exploration.js && \
  node --check public/js/ui/target-select.js && \
  node --check public/js/ui/combat-effects.js && \
  echo "All OK"
  ```
