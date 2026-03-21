# Pokemon-Style Battle Formation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "enemies above / player row below" layout with a Pokemon-style diagonal formation where both teams render inside the scene-area.

**Architecture:** The `creature-row` element is removed. A new `battle-stage` container inside `scene-area` holds two `formation` divs (player-left, enemy-right). Each formation stacks up to 3 creatures vertically with a left-to-right diagonal stagger. A separate `npc-display` container handles centered NPC rendering. All CSS for the old creature-row and multi-enemy-row is replaced with formation styles.

**Tech Stack:** Vanilla JS (ES6 modules), CSS flexbox, existing sprite system

**Spec:** `docs/superpowers/specs/2026-03-21-pokemon-battle-formation-design.md`

---

### Task 1: HTML and DOM foundation

**Files:**
- Modify: `public/game.html:51-66`
- Modify: `public/js/dom.js:29-43`

- [ ] **Step 1: Update game.html — replace enemy-sprite-container and creature-row with battle-stage + npc-display**

In `public/game.html`, replace lines 51-66:

```html
<!-- OLD: enemy-sprite-container (line 51-53) -->
<div class="enemy-sprite-container" id="enemy-sprite-container">
  <img id="enemy-sprite" class="enemy-sprite" src="" alt="">
</div>
```
and
```html
<!-- OLD: creature-row (line 64-66) -->
<div class="creature-row" id="creature-row">
  <!-- 3 creature slots rendered by JS -->
</div>
```

Replace the `enemy-sprite-container` block with:
```html
<div class="battle-stage" id="battle-stage">
  <div class="formation player-formation" id="player-formation"></div>
  <div class="formation enemy-formation" id="enemy-formation"></div>
</div>
<div class="npc-display" id="npc-display">
  <img id="enemy-sprite" class="enemy-sprite" src="" alt="">
</div>
```

Delete the `creature-row` div entirely.

- [ ] **Step 2: Update dom.js — swap references**

In `public/js/dom.js`, remove these getter lines:
- Line 37: `enemySpriteContainer` → `get('enemy-sprite-container')`
- Line 43: `creatureRow` → `get('creature-row')`

Add new getters:
```javascript
battleStage: get('battle-stage'),
playerFormation: get('player-formation'),
enemyFormation: get('enemy-formation'),
npcDisplay: get('npc-display'),
```

Keep `enemySprite: get('enemy-sprite')` — it still exists inside `npc-display`.

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/dom.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/game.html public/js/dom.js
git commit -m "refactor: replace creature-row and enemy-sprite-container with battle-stage + npc-display in HTML/DOM"
```

---

### Task 2: CSS — formation styles and cleanup

**Files:**
- Modify: `public/game.css`

- [ ] **Step 1: Remove scene-background fade mask**

In `public/game.css`, in the `.scene-background` rule (~line 217-228):
- Remove `mask-image: linear-gradient(to bottom, black 60%, transparent 100%);`
- Remove `-webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);`
- Change `bottom: -80px` to `bottom: 0`

- [ ] **Step 2: Remove old enemy-sprite-container CSS**

Delete the `.enemy-sprite-container` rule block (~lines 304-313).

- [ ] **Step 3: Remove old creature-enemy and multi-enemy CSS**

Delete these rule blocks:
- `.creature-enemy` and all its children (~lines 361-421)
- `.multi-enemy-row` and all its children (~lines 424-453)
- `.enemy-creature-slot` and children (`.defeated`, `.befriended`, `.enemy-creature-icon`, `.enemy-creature-sprite`, `.enemy-creature-name`, `.enemy-creature-hp-bar`, `.enemy-creature-hp-fill`)

- [ ] **Step 4: Remove old creature-row and creature-slot CSS**

Delete these rule blocks (search for each selector):
- `.creature-row` base rule (~line 695)
- `.creature-row:has(.creature-slot)` (~line 2914)
- `.creature-slot` (~line 2919)
- `.creature-icon` and its variants `.ko`, `.empty`, `.charged`, `.level-up-glow` (~lines 2927-2971+)
- `.creature-slot.creature-dying`, `@keyframes creature-death` (~lines 2949-2957)
- `.creature-slot.creature-swapping-in`, `@keyframes creature-swap-in` (~lines 2959-2967)
- `.creature-slot.charged` children rules (~lines 2973-2985)
- `.creature-ultimate-label` (~line 2987+)
- `.creature-slot-name` and variants (~lines 3008-3027)
- `.creature-hp-bar`, `.creature-hp-fill` (~lines 3040-3052)
- `.creature-xp-bar`, `.creature-xp-fill` (~lines 3054+)
- `.creature-mp-bar` and children (~line 5130)
- `.creature-level-badge` (~line 3076+)
- `.creature-xp-popup`, `.creature-levelup-popup` (~lines 3083-3109)
- `@keyframes name-charged-glow` (~line 2982)
- `@keyframes levelUpGlow` (~line 3116)

- [ ] **Step 5: Add battle-stage and formation CSS**

Both `battle-stage` and `npc-display` use `position: absolute` to overlay inside scene-area (like scene-background does). This prevents them from doubling the scene-area height when both exist as siblings.

Add after the scene-area rules section:

```css
/* ===== BATTLE STAGE ===== */
.battle-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  padding: 40px 12px 8px;
}

.formation {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 4px;
}

/* Diagonal stagger — both lean same direction (back=left, front=right) */
.formation .formation-slot:nth-child(1) { margin-left: 24px; }
.formation .formation-slot:nth-child(2) { margin-left: 36px; }
.formation .formation-slot:nth-child(3) { margin-left: 48px; }

/* Subtle depth scaling: back 90%, mid 95%, front 100% */
.formation .formation-slot:nth-child(1) { transform: scale(0.9); }
.formation .formation-slot:nth-child(2) { transform: scale(0.95); }
.formation .formation-slot:nth-child(3) { /* scale(1.0) is default */ }

/* Enemy sprites flipped to face left */
.enemy-formation .formation-sprite img,
.enemy-formation .formation-sprite {
  transform: scaleX(-1);
}

/* ===== FORMATION SLOTS ===== */
.formation-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  position: relative;
}

.formation-sprite {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
}

.formation-slot-name {
  font-size: 13px;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  color: #fff;
  text-align: center;
  white-space: nowrap;
}

.formation-hp-bar {
  width: 56px;
  height: 5px;
  background: rgba(0,0,0,0.3);
  border-radius: 3px;
  overflow: hidden;
}

.formation-hp-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

/* ===== FORMATION ANIMATIONS ===== */
.formation-slot.creature-dying {
  animation: creature-death 0.6s ease-out forwards;
}

@keyframes creature-death {
  0% { opacity: 1; transform: scale(1); }
  30% { opacity: 0.8; transform: scale(1.05); filter: brightness(2); }
  100% { opacity: 0; transform: scale(0.5) translateY(10px); }
}

.formation-slot.creature-swapping-in {
  animation: creature-swap-in 0.5s ease-out forwards;
}

@keyframes creature-swap-in {
  0% { opacity: 0; transform: scale(0.5) translateY(20px); }
  60% { opacity: 1; transform: scale(1.1) translateY(-5px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.formation-slot.charged .formation-slot-name {
  animation: name-charged-glow 1.5s ease-in-out infinite;
  color: #FFD54F;
}

@keyframes name-charged-glow {
  0%, 100% { text-shadow: 0 0 4px rgba(255, 215, 0, 0.4); }
  50% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.8); }
}

.formation-sprite.ko {
  opacity: 0.3;
  filter: grayscale(1);
}

.formation-sprite.charged {
  box-shadow: 0 0 6px rgba(255, 215, 0, 0.3);
}

.enemy-formation .formation-slot.defeated {
  opacity: 0;
  transform: scale(0.5) translateY(20px);
  transition: opacity 0.5s, transform 0.5s;
  pointer-events: none;
}

.enemy-formation .formation-slot.befriended {
  opacity: 0;
  transform: translateY(-40px) scale(0.8);
  transition: opacity 0.6s, transform 0.6s;
  pointer-events: none;
}

.formation-sprite.level-up-glow {
  animation: levelUpGlow 1.5s ease-out;
}

@keyframes levelUpGlow {
  0% { filter: brightness(1); }
  30% { filter: brightness(1.8) drop-shadow(0 0 8px rgba(130, 100, 255, 0.6)); }
  100% { filter: brightness(1); }
}

/* ===== NPC DISPLAY ===== */
.npc-display {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: none;
  align-items: flex-end;
  justify-content: center;
  padding-top: 40px;
}

.npc-display.visible {
  display: flex;
}
```

- [ ] **Step 6: Verify CSS parses**

Run: `node -e "const fs = require('fs'); const css = fs.readFileSync('public/game.css','utf8'); console.log('CSS length:', css.length, 'OK')"`
Expected: CSS length and OK

- [ ] **Step 7: Commit**

```bash
git add public/game.css
git commit -m "refactor: replace creature-row/enemy CSS with battle formation styles"
```

---

### Task 3: scene.js — unified formation rendering + NPC display migration

**Files:**
- Modify: `public/js/ui/scene.js`

- [ ] **Step 1: Add showFormation() function**

Add new formation rendering function near the top of scene.js (after imports/constants). This is the core rendering function for both player and enemy formations.

```javascript
/**
 * Render creatures into a formation container (player or enemy side).
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 */
export function showFormation(side, creatures) {
  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;
  container.innerHTML = '';

  if (!creatures || creatures.length === 0) return;

  // Slot placement: 1→middle, 2→top+bottom, 3→all three
  let slots;
  if (creatures.length === 1) {
    slots = [null, creatures[0], null];
  } else if (creatures.length === 2) {
    slots = [creatures[0], null, creatures[1]];
  } else {
    slots = [creatures[0], creatures[1], creatures[2]];
  }

  slots.forEach((creature, visualIndex) => {
    if (!creature) return;

    const dataIndex = creatures.indexOf(creature);
    const slotEl = document.createElement('div');
    slotEl.className = 'formation-slot';
    slotEl.dataset.index = dataIndex;
    slotEl.dataset.creatureId = creature.id || '';

    // Sprite
    const spriteEl = document.createElement('div');
    spriteEl.className = 'formation-sprite';
    if (creature.currentHp <= 0) spriteEl.classList.add('ko');
    const spriteText = creature.sprite || creature.name || '?';
    if (creature.spriteImg) {
      const img = document.createElement('img');
      img.src = creature.spriteImg;
      img.alt = creature.name || '';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      spriteEl.appendChild(img);
    } else {
      spriteEl.textContent = spriteText;
    }
    slotEl.appendChild(spriteEl);

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'formation-slot-name';
    nameEl.textContent = creature.name || '';
    slotEl.appendChild(nameEl);

    // HP bar
    const hpBar = document.createElement('div');
    hpBar.className = 'formation-hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'formation-hp-fill';
    const hpPct = creature.maxHp > 0 ? Math.max(0, creature.currentHp / creature.maxHp * 100) : 0;
    hpFill.style.width = hpPct + '%';
    hpFill.style.backgroundColor = hpPct > 50 ? 'var(--hp-green)' : hpPct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
    hpBar.appendChild(hpFill);
    slotEl.appendChild(hpBar);

    // Charged state
    if (creature.ultimateCharge >= (creature.ultimateChargeMax || 100)) {
      slotEl.classList.add('charged');
      spriteEl.classList.add('charged');
    }

    container.appendChild(slotEl);
  });
}

export function showPlayerFormation(creatures) {
  showFormation('player', creatures);
}

export function hideFormation(side) {
  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;
  container.innerHTML = '';
}
```

- [ ] **Step 2: Update showEnemy() to use showFormation for creature enemies**

Modify the existing `showEnemy()` function (~line 64-124). For creature-type enemies, call `showFormation('enemy', [enemy])` instead of building custom DOM. For non-creature enemies (NPCs), show in `dom.npcDisplay` instead of `dom.enemySpriteContainer`.

Replace the creature-enemy branch to call `showFormation('enemy', [enemy])`.

For the NPC branch: replace `dom.enemySpriteContainer` references with `dom.npcDisplay`. Add `dom.npcDisplay.classList.add('visible')` and hide battle-stage enemy formation as needed.

- [ ] **Step 3: Update showEnemies() to use showFormation**

Replace the body of `showEnemies()` (~lines 142-195) with:

```javascript
export function showEnemies(enemies) {
  if (!enemies || enemies.length === 0) return;
  dom.npcDisplay.classList.remove('visible');
  showFormation('enemy', enemies);
}
```

- [ ] **Step 4: Update hideEnemy() and hideEnemies()**

Update `hideEnemy()` (~line 414-423) to also hide `dom.npcDisplay`:
```javascript
export function hideEnemy() {
  dom.npcDisplay.classList.remove('visible');
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.style.display = 'none';
  dom.enemySkillBar.innerHTML = '';
  hideFormation('enemy');
}
```

Update `hideEnemies()` (~line 216-219) to call `hideFormation('enemy')` and clean up.

- [ ] **Step 5: Update NPC show functions to use npc-display**

For each NPC function (showShrineFox, showQuizMaster, showWordDiscoveryNpc, showCid, showDealer, showChippy, showNpcTrainer): replace all references to `dom.enemySpriteContainer` with `dom.npcDisplay`, and add `dom.npcDisplay.classList.add('visible')` at the start of each.

- [ ] **Step 6: Update showDamageNumber() for formation-aware routing**

Update `showDamageNumber()` (~line 451) to accept an optional `targetEl` parameter. If provided, position damage number relative to that element. If not, fall back to enemy formation or npc-display (for NPC boss fights where enemy formation is empty).

```javascript
export function showDamageNumber(amount, opts = {}) {
  const { isCrit, isHeal, tierClass, targetEl } = opts;
  // Fallback chain: explicit target → enemy formation → npc display
  const container = targetEl
    || dom.enemyFormation.querySelector('.formation-slot')
    || (dom.npcDisplay.classList.contains('visible') ? dom.npcDisplay : dom.enemyFormation);
  // ... rest of positioning logic uses container.getBoundingClientRect()
}
```

- [ ] **Step 7: Update updateEnemyHPAtIndex() for formation slots**

Replace the multi-enemy HP update to target formation slots:

```javascript
export function updateEnemyHPAtIndex(index, current, max) {
  const slot = dom.enemyFormation.querySelector(`.formation-slot[data-index="${index}"]`);
  if (!slot) return;
  const fill = slot.querySelector('.formation-hp-fill');
  if (!fill) return;
  const pct = max > 0 ? Math.max(0, current / max * 100) : 0;
  fill.style.width = pct + '%';
  fill.style.backgroundColor = pct > 50 ? 'var(--hp-green)' : pct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
}
```

- [ ] **Step 8: Remove dead code**

Remove `updateCompactEnemyHP()` and `removeCompactOverlays()` — these referenced `.enemy-compact-hp-fill` inside the old `enemySpriteContainer` and are dead code after the refactor. Also remove any internal helper functions only used by the old `showEnemy()` creature-enemy branch (compact overlay builders).

- [ ] **Step 9: Syntax check**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

- [ ] **Step 10: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: unified formation rendering in scene.js with NPC display migration"
```

---

### Task 4: creature-row.js — delegate rendering to scene.js

**Files:**
- Modify: `public/js/ui/creature-row.js`

- [ ] **Step 1: Import showFormation from scene.js**

Add import at top of creature-row.js:
```javascript
import { showFormation, hideFormation } from './scene.js';
```

- [ ] **Step 2: Rewrite render() to delegate to showFormation**

Replace the body of `render(creatures)` (~lines 152-202). Instead of building `.creature-slot` DOM in `dom.creatureRow`, call `showFormation('player', creatures)` and then attach click handlers for the popup system.

```javascript
export function render(creatures) {
  _creatures = creatures;
  showFormation('player', creatures);

  // Attach popup click handlers to formation slots
  const slots = dom.playerFormation.querySelectorAll('.formation-slot');
  slots.forEach(slot => {
    const idx = parseInt(slot.dataset.index, 10);
    slot.addEventListener('click', () => {
      if (_creatures[idx]) togglePopup(idx, _creatures[idx]);
    });
  });
}
```

- [ ] **Step 3: Update popup positioning**

In `showPopup()` (~line 214+), change positioning logic. Instead of anchoring below-viewport relative to creature-row, anchor relative to the formation slot within the scene-area:

```javascript
function showPopup(index, creature) {
  // ... build popup innerHTML same as before ...

  // Position relative to formation slot
  const slot = dom.playerFormation.querySelector(`.formation-slot[data-index="${index}"]`);
  if (slot) {
    const rect = slot.getBoundingClientRect();
    dom.creaturePopup.style.position = 'fixed';
    dom.creaturePopup.style.left = rect.left + 'px';
    dom.creaturePopup.style.top = (rect.bottom + 8) + 'px';
    dom.creaturePopup.style.bottom = 'auto';
  }
  dom.creaturePopup.classList.add('visible');
}
```

- [ ] **Step 4: Update init() global click listener**

In `init()` (~line 134), the document-level click listener checks `.creature-slot` to dismiss the popup. Update to `.formation-slot`:

```javascript
// Old:
if (!e.target.closest('.creature-slot') && !e.target.closest('.creature-popup')) {
// New:
if (!e.target.closest('.formation-slot') && !e.target.closest('.creature-popup')) {
```

- [ ] **Step 5: Remove all dom.creatureRow references**

Search creature-row.js for any remaining `dom.creatureRow` references and replace with `dom.playerFormation`.

- [ ] **Step 6: Preserve ELEMENT_COLORS and ELEMENT_ICONS exports**

These constants are imported by `target-select.js` and `game.js`. Verify they remain exported. No change needed if they're already top-level `export const`.

- [ ] **Step 7: Syntax check**

Run: `node --check public/js/ui/creature-row.js && echo "OK"`
Expected: OK

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/creature-row.js
git commit -m "refactor: creature-row.js delegates rendering to scene.js formation system"
```

---

### Task 5: game.js — remove creature-row DOM manipulation

**Files:**
- Modify: `public/game.js`

- [ ] **Step 1: Update updateCreatureRow()**

In `public/game.js`, find `updateCreatureRow()` (~lines 348-364). Replace `dom.creatureRow.innerHTML = ''` calls with `hideFormation('player')` calls.

Import `hideFormation` from scene.js at the top if not already imported:
```javascript
import { hideFormation } from './js/ui/scene.js';
```

Replace line ~351 `dom.creatureRow.innerHTML = ''` with `hideFormation('player')`.
Replace line ~363 `dom.creatureRow.innerHTML = ''` with `hideFormation('player')`.

- [ ] **Step 2: Update showDamageNumber callback wiring**

In game.js, find the `showDamageNumber` callback (~line 1492). Stop discarding the `isPlayer` flag. Pass it through to scene.js:

```javascript
showDamageNumber: (dmg, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => {
  // Find the target formation slot for positioning
  const formation = isPlayer ? dom.playerFormation : dom.enemyFormation;
  const targetEl = formation.querySelector('.formation-slot') || formation;
  scene.showDamageNumber(dmg, { isCrit, isHeal, tierClass, targetEl });
},
```

- [ ] **Step 3: Verify no other dom.creatureRow references remain**

Search game.js for `creatureRow` — should find zero remaining.

- [ ] **Step 4: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "refactor: game.js uses formation system instead of creature-row DOM"
```

---

### Task 6: combat-loop.js — update all creature-row and enemy-creature-slot selectors

**Files:**
- Modify: `public/js/ui/combat-loop.js`

This task covers TWO categories of selectors:
- **Player side:** `#creature-row .creature-slot` → `#player-formation .formation-slot`
- **Enemy side:** `.enemy-creature-slot` → `#enemy-formation .formation-slot`

Data attribute mapping:
- Old enemy: `data-enemy-index`, `data-enemy-id`
- New formation: `data-index`, `data-creature-id`

- [ ] **Step 1: Update findCreatureSlotByAttackerId() (line ~939)**

Replace:
```javascript
const slots = document.querySelectorAll('#creature-row .creature-slot');
```
With:
```javascript
const slots = document.querySelectorAll('#player-formation .formation-slot');
```

Update the match logic to use `slot.dataset.creatureId` instead of checking internal creature data attributes.

- [ ] **Step 2: Update updateCreatureHpBars() (line ~985)**

Replace:
```javascript
const slots = document.querySelectorAll('#creature-row .creature-slot');
```
With:
```javascript
const slots = document.querySelectorAll('#player-formation .formation-slot');
```

Update internal selectors:
- `.creature-hp-fill` → `.formation-hp-fill`
- `.creature-icon` → `.formation-sprite` (for KO state: `.ko` class)

**MP bar update removal:** Lines ~1006-1010 update `.creature-mp-fill` inside creature slots. Formation slots do not have MP bars (MP is visible in the creature popup only). Remove the MP bar update code from this function — it will no-op anyway since `.creature-mp-fill` won't exist, but removing it keeps the code clean.

- [ ] **Step 3: Update handleXpEvents() (line ~1049)**

Replace:
```javascript
const slots = document.querySelectorAll('#creature-row .creature-slot');
```
With:
```javascript
const slots = document.querySelectorAll('#player-formation .formation-slot');
```

XP popup positioning should use the formation slot's bounding rect.

- [ ] **Step 4: Update animateKoSwaps() (lines ~1485, ~1500)**

Replace both instances:
```javascript
const slots = document.querySelectorAll('#creature-row .creature-slot');
```
With:
```javascript
const slots = document.querySelectorAll('#player-formation .formation-slot');
```

Update internal selectors:
- `.creature-sprite-icon` → `.formation-sprite img` (line ~1507)
- `.creature-icon` → `.formation-sprite` (line ~1516)
- `.creature-hp-fill` → `.formation-hp-fill` (line ~1510)

- [ ] **Step 5: Update attacker slot lookup (line ~1805)**

Replace:
```javascript
document.querySelectorAll('#creature-row .creature-slot')[attackerSlotIdx]
```
With:
```javascript
document.querySelectorAll('#player-formation .formation-slot')[attackerSlotIdx]
```

Also remove the MP bar update at line ~1807 that queries `.creature-mp-fill` on the attacker slot (formation slots don't have MP bars).

- [ ] **Step 6: Update findEnemyTargetElement() (line ~951-969)**

This function returns `.enemy-creature-slot` or `#enemy-sprite-container`. Update to return `.formation-slot` from `#enemy-formation`. For NPC boss fights (non-creature enemies), fall back to `npc-display`:

```javascript
function findEnemyTargetElement(targetId, enemies, enemyIndex) {
  const slot = document.querySelector(`#enemy-formation .formation-slot[data-index="${enemyIndex}"]`);
  if (slot) return slot;
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay && npcDisplay.classList.contains('visible')) return npcDisplay;
  return document.getElementById('enemy-formation');
}
```

- [ ] **Step 7: Update ALL enemy-creature-slot selectors throughout combat-loop.js**

This is the biggest sub-step. Search for every `enemy-creature-slot` reference and update:

| Line | Old Selector | New Selector |
|------|-------------|-------------|
| ~960 | `.enemy-creature-slot[data-enemy-index="${idx}"]` | `#enemy-formation .formation-slot[data-index="${idx}"]` |
| ~964 | `.enemy-creature-slot:not(.defeated):not(.befriended)` | `#enemy-formation .formation-slot:not(.defeated):not(.befriended)` |
| ~1299 | `.enemy-creature-slot[data-enemy-index="${event.targetIndex}"]` | `#enemy-formation .formation-slot[data-index="${event.targetIndex}"]` |
| ~1327 | `.enemy-creature-slot[data-enemy-index="${event.targetIndex}"]` | `#enemy-formation .formation-slot[data-index="${event.targetIndex}"]` |
| ~2320 | `.enemy-creature-slot[data-enemy-index="${capturedIdx}"]` | `#enemy-formation .formation-slot[data-index="${capturedIdx}"]` |
| ~2322 | `.enemy-creature-slot[data-enemy-id="${capturedId}"]` | `#enemy-formation .formation-slot[data-creature-id="${capturedId}"]` |
| ~2593 | `.enemy-creature-slot` (querySelectorAll) | `#enemy-formation .formation-slot` |
| ~2659 | `.enemy-creature-slot[data-enemy-index="${capturedIdx}"]` | `#enemy-formation .formation-slot[data-index="${capturedIdx}"]` |
| ~2661 | `.enemy-creature-slot[data-enemy-id="${capturedId}"]` | `#enemy-formation .formation-slot[data-creature-id="${capturedId}"]` |
| ~2719 | `.enemy-creature-slot[data-enemy-index="${targetEnemyIndex}"]` | `#enemy-formation .formation-slot[data-index="${targetEnemyIndex}"]` |
| ~2721 | `.enemy-creature-slot[data-enemy-id="${captured.id}"]` | `#enemy-formation .formation-slot[data-creature-id="${captured.id}"]` |

Also update any `.enemy-creature-hp-fill` queries within these blocks to `.formation-hp-fill`.

**Verify completeness:** After making all changes, run:
```bash
grep -n 'enemy-creature-slot\|data-enemy-index\|data-enemy-id\|enemy-sprite-container\|creature-row\|creature-slot\|creature-icon\|creature-hp-fill\|creature-mp-fill' public/js/ui/combat-loop.js
```
Expected: Zero hits.

- [ ] **Step 8: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

- [ ] **Step 9: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "refactor: combat-loop.js targets formation slots instead of creature-row and enemy-creature-slot"
```

---

### Task 7: combat-effects.js — update all animation targets

**Files:**
- Modify: `public/js/ui/combat-effects.js`

- [ ] **Step 1: Update fireCreatureAttackEffect() (line ~427)**

Replace `.creature-icon` query with `.formation-sprite`:

```javascript
// Old:
const iconEl = creatureSlotEl.querySelector('.creature-icon');
// New:
const iconEl = creatureSlotEl.querySelector('.formation-sprite');
```

- [ ] **Step 2: Update enemyCreatureAttackEffect() (line ~456)**

Replace `.creature-icon` query with `.formation-sprite`:

```javascript
// Old:
const targetIcon = creatureSlotEl.querySelector('.creature-icon');
// New:
const targetIcon = creatureSlotEl.querySelector('.formation-sprite');
```

- [ ] **Step 3: Update playerHitEffect() (line ~381)**

Replace `.creature-slot` query with `.formation-slot`:

```javascript
// Old:
anime(creatureRowEl.querySelectorAll('.creature-slot'), { ... });
// New:
const playerFormation = document.getElementById('player-formation');
anime(playerFormation.querySelectorAll('.formation-slot'), { ... });
```

(The `creatureRowEl` parameter can be ignored/removed since we always target `#player-formation`.)

- [ ] **Step 4: Update healEffect() (line ~526)**

Replace `.creature-icon` query with `.formation-sprite`:

```javascript
// Old:
flashElement(creatureSlotEl.querySelector('.creature-icon'), 1);
// New:
flashElement(creatureSlotEl.querySelector('.formation-sprite'), 1);
```

- [ ] **Step 5: Update showLevelUpPopup() (line ~585)**

Replace `.creature-icon` and `.creature-level-badge` queries:

```javascript
// Old:
const iconEl = creatureSlotEl.querySelector('.creature-icon');
iconEl.classList.add('level-up-glow');
// New:
const iconEl = creatureSlotEl.querySelector('.formation-sprite');
iconEl.classList.add('level-up-glow');
```

For the `.creature-level-badge` query at line ~592: formation slots don't have a level badge element. Remove or guard this line — the level-up popup and glow animation are sufficient visual feedback without the badge pop.

- [ ] **Step 6: Verify completeness**

```bash
grep -n 'creature-icon\|creature-slot\|creature-row\|creature-level-badge' public/js/ui/combat-effects.js
```
Expected: Zero hits (or only the internal `ELEMENT_COLORS` constant which is unrelated).

- [ ] **Step 7: Syntax check**

Run: `node --check public/js/ui/combat-effects.js && echo "OK"`
Expected: OK

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/combat-effects.js
git commit -m "refactor: combat-effects.js targets formation-sprite instead of creature-icon"
```

---

### Task 8: Smoke test and cleanup

**Files:**
- Modify: various (cleanup only)

- [ ] **Step 1: Run full syntax check on all modified files**

```bash
for f in public/js/dom.js public/js/ui/scene.js public/js/ui/creature-row.js public/js/ui/combat-loop.js public/js/ui/combat-effects.js public/game.js; do
  node --check "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: All OK

- [ ] **Step 2: Run unit tests**

```bash
npm test
```

Expected: All existing tests pass (none touch the UI modules directly).

- [ ] **Step 3: Search for stale references in JS**

```bash
grep -rn 'creature-row\|creatureRow\|enemy-sprite-container\|enemySpriteContainer\|creature-slot\b\|\.creature-icon\|enemy-creature-slot\|data-enemy-index\|data-enemy-id' public/js/ --include='*.js' | grep -v node_modules
```

Expected: Zero hits (or only in comments/strings that don't matter). Fix any remaining references.

- [ ] **Step 4: Search CSS for stale selectors**

```bash
grep -n 'creature-row\|creature-slot\|\.creature-icon\|multi-enemy-row\|enemy-creature-slot\|\.creature-enemy\|creature-hp-fill\|creature-mp' public/game.css
```

Expected: Zero hits. If any remain, delete them.

- [ ] **Step 5: Update mockup HTML files**

`public/mockup-combat-area-header.html` and `public/mockup-vocab-cards.html` reference `.creature-row`. Update or delete these mockups to match the new formation structure.

- [ ] **Step 6: Commit cleanup**

```bash
git add -A
git commit -m "chore: clean up stale creature-row and enemy-sprite-container references"
```

- [ ] **Step 7: Manual playtest**

Start dev server: `npm run dev`

Test these scenarios in the browser:
1. **Hub screen** — player formation should show on left side of scene area
2. **Exploration** — entering an area, player formation visible on left
3. **Combat (1 enemy)** — enemy appears in middle slot on right, player party on left
4. **Combat (3 enemies)** — all three enemy slots populated on right
5. **NPC encounter** — NPC appears centered, player formation may be visible on left
6. **Creature death** — death animation plays on formation slot
7. **Creature swap** — swap-in animation plays on formation slot
8. **Damage numbers** — float above the correct formation slot
9. **Creature popup** — tap a player creature, popup appears near it
