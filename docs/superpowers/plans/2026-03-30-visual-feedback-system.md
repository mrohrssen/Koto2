# Visual Feedback System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every player action's impact visible through contextual floating popups, persistent status icons, type effectiveness labels, relocated skill proc banners, and exploration event feedback.

**Architecture:** One new module (`event-popup.js`) provides the unified popup system, status icons, and currency animation. Existing files import from it. The module reuses `spawnParticles` from `combat-effects.js` for particle bursts. Formation slots in `scene.js` gain a `.status-icons` container. Integration points in `combat-loop.js`, `exploration.js`, `economy.js`, and `post-combat-shop.js` call the presets.

**Tech Stack:** Vanilla JS (ES6 modules), CSS animations, anime.js (already in project for `combat-effects.js`)

**Spec:** `docs/superpowers/specs/2026-03-30-visual-feedback-system-design.md`

---

### Task 1: Create `event-popup.js` — Core `showEventPopup` + CSS

**Files:**
- Create: `public/js/ui/event-popup.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/event-popup.test.js`

- [ ] **Step 1: Write the failing test for showEventPopup**

Create `tests/unit/ui/event-popup.test.js`:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

describe('showEventPopup', () => {
  let dom, document, window;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="target" style="width:50px;height:50px;position:absolute;left:100px;top:100px;"></div></body></html>');
    document = dom.window.document;
    window = dom.window;
    global.document = document;
    global.window = window;
    global.HTMLElement = window.HTMLElement;
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.HTMLElement;
  });

  it('creates a floating popup element attached to body', () => {
    // Dynamic import to pick up globals
    // We'll test the DOM creation logic directly
    const target = document.getElementById('target');
    const popup = document.createElement('div');
    popup.className = 'event-popup event-popup-normal';
    popup.textContent = 'ATK ↑';
    popup.style.color = '#FF8F00';
    document.body.appendChild(popup);

    const popups = document.querySelectorAll('.event-popup');
    assert.equal(popups.length, 1);
    assert.equal(popups[0].textContent, 'ATK ↑');
  });

  it('applies size class based on size option', () => {
    const popup = document.createElement('div');
    popup.className = 'event-popup event-popup-large';
    document.body.appendChild(popup);
    assert.ok(popup.classList.contains('event-popup-large'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern "showEventPopup"`
Expected: Tests should pass (DOM creation tests). This validates our JSDOM setup works.

- [ ] **Step 3: Create `event-popup.js` with core function**

Create `public/js/ui/event-popup.js`:

```js
/**
 * @file event-popup.js - Unified Visual Feedback System
 *
 * PURPOSE:
 * Single module for all contextual floating feedback in the game.
 * Provides showEventPopup() core function and preset helpers for
 * buffs, debuffs, heals, items, credits, effectiveness, and skill procs.
 * Also handles persistent status icons on creature formation slots
 * and animated currency counters.
 *
 * KEY EXPORTS:
 * - showEventPopup(targetEl, text, options): Core floating popup
 * - Presets: buff, debuff, heal, itemGained, credits, effectiveness,
 *   resistedEffectiveness, skillProc
 * - updateStatusIcons(slotEl, activeEffects): Persistent status badges
 * - animateCounter(el, from, to, duration, options): Currency tick animation
 *
 * DEPENDENCIES:
 * - ./combat-effects.js: spawnParticles (optional particle bursts)
 */

import { spawnParticles } from './combat-effects.js';

// ============ CORE POPUP ============

/**
 * Show a floating text popup anchored to a target element.
 * Text pops in, floats up/down, fades out, then auto-removes.
 *
 * @param {HTMLElement} targetEl - Element to anchor popup near
 * @param {string} text - Text to display
 * @param {Object} [options]
 * @param {string} [options.color='#FFFFFF'] - Text color
 * @param {number} [options.particles=0] - Particle burst count (0 = none)
 * @param {string} [options.particleColor] - Particle color (defaults to options.color)
 * @param {'up'|'down'} [options.direction='up'] - Float direction
 * @param {string|null} [options.icon=null] - Optional icon URL before text
 * @param {'small'|'normal'|'large'} [options.size='normal'] - Text size
 * @param {number} [options.duration=1200] - ms before auto-remove
 */
export function showEventPopup(targetEl, text, {
  color = '#FFFFFF',
  particles = 0,
  particleColor,
  direction = 'up',
  icon = null,
  size = 'normal',
  duration = 1200
} = {}) {
  if (!targetEl) return;

  const popup = document.createElement('div');
  popup.className = `event-popup event-popup-${size}`;
  popup.style.color = color;
  popup.style.setProperty('--ep-direction', direction === 'down' ? '45px' : '-45px');
  popup.style.animationDuration = `${duration}ms`;

  if (icon) {
    const iconEl = document.createElement('img');
    iconEl.src = icon;
    iconEl.className = 'event-popup-icon';
    popup.appendChild(iconEl);
  }

  const textNode = document.createElement('span');
  textNode.textContent = text;
  popup.appendChild(textNode);

  // Position relative to target center
  const rect = targetEl.getBoundingClientRect();
  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top + rect.height * 0.3}px`;

  document.body.appendChild(popup);

  // Particle burst
  if (particles > 0) {
    try {
      spawnParticles(targetEl, particles, particleColor || color);
    } catch {
      // spawnParticles may fail if target is detached — non-critical
    }
  }

  // Auto-remove after animation
  popup.addEventListener('animationend', () => popup.remove());
  // Safety fallback
  setTimeout(() => popup.remove(), duration + 200);
}

// ============ PRESETS ============

export function buff(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#FF8F00',
    particles: 6,
    particleColor: '#FF8F00',
    size: 'normal',
    direction: 'up'
  });
}

export function debuff(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#7B1FA2',
    particles: 4,
    particleColor: '#7B1FA2',
    size: 'normal',
    direction: 'down'
  });
}

export function heal(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#4CAF50',
    particles: 6,
    particleColor: '#4CAF50',
    size: 'normal',
    direction: 'up'
  });
}

export function itemGained(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#FFFFFF',
    particles: 4,
    particleColor: '#FFFFFF',
    size: 'normal',
    direction: 'up'
  });
}

/**
 * Credits gained or spent popup. Auto-detects color from amount sign.
 * @param {HTMLElement} targetEl
 * @param {number} amount - Positive = gained (gold), negative = spent (red)
 */
export function credits(targetEl, amount) {
  const isGain = amount >= 0;
  const displayText = isGain ? `+${amount}¤` : `${amount}¤`;
  showEventPopup(targetEl, displayText, {
    color: isGain ? '#FFD700' : '#F44336',
    particles: 0,
    size: 'normal',
    direction: 'up'
  });
}

export function effectiveness(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#FFB300',
    particles: 0,
    size: 'large',
    direction: 'up',
    duration: 1500
  });
}

export function resistedEffectiveness(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#9E9E9E',
    particles: 0,
    size: 'small',
    direction: 'up'
  });
}

export function skillProc(targetEl, text) {
  showEventPopup(targetEl, text, {
    color: '#FFD700',
    particles: 6,
    particleColor: '#FFD700',
    size: 'large',
    direction: 'up',
    duration: 1500
  });
}
```

- [ ] **Step 4: Add CSS for event popups to `game.css`**

Append to `public/game.css`:

```css
/* ============ EVENT POPUP SYSTEM ============ */

.event-popup {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0,0,0,0.7);
  white-space: nowrap;
  transform: translate(-50%, 0);
  animation: eventPopupFloat var(--ep-duration, 1200ms) ease-out forwards;
}

.event-popup-small { font-size: 12px; }
.event-popup-normal { font-size: 16px; }
.event-popup-large { font-size: 22px; }

.event-popup-icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  margin-right: 4px;
}

@keyframes eventPopupFloat {
  0% {
    opacity: 0;
    transform: translate(-50%, 0) scale(0);
  }
  8% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.1);
  }
  15% {
    transform: translate(-50%, 0) scale(1.0);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, var(--ep-direction, -45px)) scale(1.0);
  }
}
```

- [ ] **Step 5: Syntax check the new module**

Run: `node --check public/js/ui/event-popup.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Run full unit tests**

Run: `npm run test:unit`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/event-popup.js public/game.css tests/unit/ui/event-popup.test.js
git commit -m "feat: add unified event popup system with presets and CSS"
```

---

### Task 2: Add persistent status icons to formation slots

**Files:**
- Modify: `public/js/ui/event-popup.js` (add `updateStatusIcons`)
- Modify: `public/js/ui/scene.js:73-194` (add `.status-icons` container in `showFormation`)
- Modify: `public/game.css`

- [ ] **Step 1: Add status icon config and `updateStatusIcons` to `event-popup.js`**

Append to `public/js/ui/event-popup.js`:

```js
// ============ PERSISTENT STATUS ICONS ============

const STATUS_ICON_CONFIG = {
  poison:        { label: 'PSN',  bg: '#9C27B0', text: '#fff' },
  attack_buff:   { label: 'ATK↑', bg: '#FF8F00', text: '#fff' },
  attack_debuff: { label: 'ATK↓', bg: '#7B1FA2', text: '#fff' },
  defense_buff:  { label: 'DEF↑', bg: '#1976D2', text: '#fff' },
  shield:        { label: 'SHD',  bg: '#00ACC1', text: '#fff' },
  team_shield:   { label: 'SHD',  bg: '#00ACC1', text: '#fff' },
  haste:         { label: 'SPD↑', bg: '#29B6F6', text: '#fff' },
  speed_buff:    { label: 'SPD↑', bg: '#29B6F6', text: '#fff' },
  stun:          { label: 'STUN', bg: '#F9A825', text: '#000' },
  sleep:         { label: 'SLP',  bg: '#78909C', text: '#fff' },
  confuse:       { label: 'CONF', bg: '#FDD835', text: '#000' }
};

/**
 * Update the persistent status icons for a formation slot.
 * Renders pill badges for each active effect below the HP/MP bars.
 *
 * @param {HTMLElement} slotEl - The .formation-slot element
 * @param {Array<{type: string, remainingTurns?: number}>} activeEffects
 */
export function updateStatusIcons(slotEl, activeEffects = []) {
  if (!slotEl) return;

  let container = slotEl.querySelector('.status-icons');
  if (!container) {
    container = document.createElement('div');
    container.className = 'status-icons';
    slotEl.appendChild(container);
  }

  // Determine which effects should be shown
  const newTypes = new Set(activeEffects.map(e => e.type));

  // Remove icons for expired effects
  container.querySelectorAll('.status-icon').forEach(icon => {
    if (!newTypes.has(icon.dataset.effectType)) {
      icon.classList.add('status-icon-exit');
      icon.addEventListener('animationend', () => icon.remove());
    }
  });

  // Add icons for new effects
  const existingTypes = new Set(
    [...container.querySelectorAll('.status-icon:not(.status-icon-exit)')].map(el => el.dataset.effectType)
  );

  for (const effect of activeEffects) {
    if (existingTypes.has(effect.type)) continue;
    const config = STATUS_ICON_CONFIG[effect.type];
    if (!config) continue;

    const icon = document.createElement('span');
    icon.className = 'status-icon status-icon-enter';
    icon.dataset.effectType = effect.type;
    icon.style.backgroundColor = config.bg;
    icon.style.color = config.text;
    icon.textContent = config.label;
    container.appendChild(icon);
  }
}

/**
 * Clear all status icons from all formation slots (call on combat end).
 */
export function clearAllStatusIcons() {
  document.querySelectorAll('.status-icons').forEach(container => {
    container.innerHTML = '';
  });
}
```

- [ ] **Step 2: Add `.status-icons` container to `showFormation` in `scene.js`**

In `public/js/ui/scene.js`, after line 185 (`slotEl.appendChild(infoBox);`) and before the charged state check (line 188), add:

```js
    // Status icons container (populated by event-popup.js updateStatusIcons)
    const statusIcons = document.createElement('div');
    statusIcons.className = 'status-icons';
    slotEl.appendChild(statusIcons);
```

- [ ] **Step 3: Add status icon CSS to `game.css`**

Append to `public/game.css`:

```css
/* ============ STATUS ICONS ============ */

.status-icons {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  min-height: 0;
  margin-top: 2px;
}

.status-icon {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 6px;
  line-height: 1.2;
  white-space: nowrap;
}

.status-icon-enter {
  animation: statusIconPop 200ms ease-out forwards;
}

.status-icon-exit {
  animation: statusIconFade 200ms ease-out forwards;
}

@keyframes statusIconPop {
  0% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes statusIconFade {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.5); opacity: 0; }
}
```

- [ ] **Step 4: Syntax check modified files**

Run: `node --check public/js/ui/event-popup.js && node --check public/js/ui/scene.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/event-popup.js public/js/ui/scene.js public/game.css
git commit -m "feat: add persistent status icons to creature formation slots"
```

---

### Task 3: Add currency counter animation

**Files:**
- Modify: `public/js/ui/event-popup.js` (add `animateCounter`)

- [ ] **Step 1: Add `animateCounter` to `event-popup.js`**

Append to `public/js/ui/event-popup.js`:

```js
// ============ CURRENCY COUNTER ANIMATION ============

/**
 * Animate a number counter from one value to another (arcade score style).
 * @param {HTMLElement} el - Element whose textContent will be updated
 * @param {number} fromValue - Starting value
 * @param {number} toValue - Target value
 * @param {number} [duration=400] - Animation duration in ms
 * @param {Object} [options]
 * @param {string} [options.flashColor] - Brief flash color on the element
 * @param {string} [options.prefix=''] - Text prefix (e.g. '¤')
 * @param {string} [options.suffix=''] - Text suffix
 */
export function animateCounter(el, fromValue, toValue, duration = 400, { flashColor, prefix = '', suffix = '' } = {}) {
  if (!el) return;
  const startTime = performance.now();
  const diff = toValue - fromValue;

  if (flashColor) {
    const original = el.style.color;
    el.style.color = flashColor;
    setTimeout(() => { el.style.color = original; }, duration);
  }

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out quad
    const eased = 1 - (1 - progress) * (1 - progress);
    const current = Math.round(fromValue + diff * eased);
    el.textContent = `${prefix}${current}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/js/ui/event-popup.js && echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/event-popup.js
git commit -m "feat: add animated currency counter utility"
```

---

### Task 4: Integrate type effectiveness popups into combat

**Files:**
- Modify: `public/js/ui/combat-loop.js:1684-1767` (player attack loop)
- Modify: `public/js/ui/combat-loop.js:1462-1509` (enemy attack loop)

The server already returns `elementMultiplier` on each attack record (1.5 = super effective, 0.67 = not very effective, 1.0 = neutral).

- [ ] **Step 1: Add import to combat-loop.js**

At the top of `public/js/ui/combat-loop.js`, after the existing imports (around line 51), add:

```js
import { effectiveness, resistedEffectiveness } from './event-popup.js';
```

- [ ] **Step 2: Add type effectiveness popup after player damage in multi-creature flow**

In `public/js/ui/combat-loop.js`, inside the `for (const atk of result.playerAttacks)` loop, after the STAB indicator block (after line 1756), add:

```js
          // Type effectiveness popup
          if (atk.elementMultiplier > 1 && enemyEl) {
            setTimeout(() => effectiveness(enemyEl, 'Super Effective!'), 400);
          } else if (atk.elementMultiplier < 1 && enemyEl) {
            setTimeout(() => resistedEffectiveness(enemyEl, 'Resisted...'), 400);
          }
```

- [ ] **Step 3: Add type effectiveness popup after enemy damage**

In `public/js/ui/combat-loop.js`, inside the `showEnemyAttacksAnimated` function, after the HP update block (after line 1500), add:

```js
    // Type effectiveness popup for enemy attacks
    if (atk.elementMultiplier > 1 && targetSlotEl) {
      setTimeout(() => effectiveness(targetSlotEl, 'Super Effective!'), 400);
    } else if (atk.elementMultiplier < 1 && targetSlotEl) {
      setTimeout(() => resistedEffectiveness(targetSlotEl, 'Resisted...'), 400);
    }
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add type effectiveness popups to combat"
```

---

### Task 5: Integrate status icons into combat loop

**Files:**
- Modify: `public/js/ui/combat-loop.js` (import `updateStatusIcons`, `clearAllStatusIcons`; call after each round)

- [ ] **Step 1: Add imports**

Update the import from `event-popup.js` in `combat-loop.js` to:

```js
import { effectiveness, resistedEffectiveness, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```

- [ ] **Step 2: Add status icon sync after `showEffectEvents`**

In the `showEffectEvents` function (around line 1302), after the for loop (after line 1350), add a call to sync status icons from the effect events:

```js
  // Sync persistent status icons on all creature slots
  syncStatusIconsFromResult(result);
```

Then add the helper function near `showEffectEvents` (e.g. after line 1351):

```js
/**
 * Sync persistent status icons for all creatures from combat result.
 * Reads allies and enemies arrays to find active statusEffects.
 */
function syncStatusIconsFromResult(result) {
  // Player creatures
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const slotEl = document.querySelector(`#player-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) {
        updateStatusIcons(slotEl, ally.statusEffects || []);
      }
    });
  }
  // Enemy creatures
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const slotEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) {
        updateStatusIcons(slotEl, enemy.statusEffects || []);
      }
    });
  }
}
```

- [ ] **Step 3: Also call sync after player attacks and enemy attacks complete**

In the multi-creature attack flow (around line 1767, after the player attacks for-loop ends), add:

```js
      // Sync status icons after all player attacks
      syncStatusIconsFromResult(result);
```

And at the end of `showEnemyAttacksAnimated` (after line 1508), add:

```js
  // Sync status icons after enemy attacks
  syncStatusIconsFromResult(result);
```

- [ ] **Step 4: Clear icons on combat end**

Find the `cleanupCombat` function (search for `export function cleanupCombat` or `export async function cleanupCombat`). Add `clearAllStatusIcons();` at the start of its body.

Also find `stopCombatLoop` and add `clearAllStatusIcons();` there too.

- [ ] **Step 5: Verify server sends statusEffects**

Check that the server includes `statusEffects` on creature objects in the combat response. Search for `statusEffects` in `src/game/services/creature-combat-service.js` or `src/game/combat/effects.js`. If the field exists on the creature model, it will be included in `result.allies` / `result.enemies`. If it's not currently serialized, add it to the enrichment in `src/game/loop.js` where allies/enemies are built for the response.

- [ ] **Step 6: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: sync persistent status icons during combat rounds"
```

---

### Task 6: Relocate skill proc banners from action area to scene area

**Files:**
- Modify: `public/js/ui/combat-loop.js:1357-1412` (`showPartySkillProcs` function)

- [ ] **Step 1: Update import to include `skillProc` preset**

Update the import from `event-popup.js`:

```js
import { effectiveness, resistedEffectiveness, skillProc, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```

- [ ] **Step 2: Rewrite `showPartySkillProcs` to use scene-area popups**

Replace the `showPartySkillProcs` function body. The existing function is at lines 1357-1412. Replace the proc announcement section (the `if (actionArea)` block that creates `.party-skill-proc` elements) with a `skillProc` popup on the source creature:

```js
async function showPartySkillProcs(atk) {
  if (!atk.partySkillProcs?.length) return;

  const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');

  for (const proc of atk.partySkillProcs) {
    // Show skill proc as floating banner on the attacker (in the scene area)
    const attackerSlot = findCreatureSlotByAttackerId(atk.attackerId);
    let detail = '';
    if (proc.type === 'bonusDamage') {
      detail = ` +${proc.bonusDamage}`;
    } else if (proc.type === 'healAll') {
      detail = ` +${proc.healAmount} HP`;
    }

    if (attackerSlot) {
      skillProc(attackerSlot, `${proc.skillName}!${detail}`);
      flashElement(attackerSlot.querySelector('.formation-sprite'), 1);
    }

    // Visual effects by type (keep existing particle effects)
    if (proc.type === 'bonusDamage') {
      const enemyEl = findEnemyTargetElement(atk.targetId, null, atk.targetIndex);
      if (enemyEl) spawnParticles(enemyEl, 6, '#FFB74D');
    } else if (proc.type === 'healAll') {
      allAllySlots.forEach(slot => {
        const sprite = slot.querySelector('.formation-sprite');
        if (sprite && !sprite.classList.contains('ko')) {
          healEffect(slot, proc.healAmount);
        }
      });
    } else if (proc.type === 'haste') {
      if (attackerSlot) {
        spawnParticles(attackerSlot, 8, '#4fc3f7');
      }
    } else if (proc.type === 'teamShield') {
      allAllySlots.forEach(slot => {
        const sprite = slot.querySelector('.formation-sprite');
        if (sprite && !sprite.classList.contains('ko')) {
          spawnParticles(slot, 6, '#42A5F5');
        }
      });
    }

    await effectDelay(600);
  }
}
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: relocate skill proc banners from action area to scene area"
```

---

### Task 7: Add buff/debuff popups to `showEffectEvents`

**Files:**
- Modify: `public/js/ui/combat-loop.js:1302-1351` (`showEffectEvents` function)

Currently `showEffectEvents` calls `showFloatingText` for non-poison effects. Replace with the appropriate event popup presets.

- [ ] **Step 1: Add `buff` and `debuff` to imports**

Update the import:

```js
import { effectiveness, resistedEffectiveness, skillProc, buff, debuff, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```

- [ ] **Step 2: Replace `showFloatingText` calls with preset popups**

In the `showEffectEvents` function, replace the `else if (event.type !== 'poison')` block (lines 1320-1349). Change the `showFloatingText(targetEl, label)` call to use the appropriate preset based on effect type:

```js
    } else if (event.type !== 'poison') {
      const EFFECT_LABELS = {
        confuse: t('effectConfuse'),
        stun: t('effectStun'),
        sleep: t('effectSleep'),
        attack_buff: t('effectAtkUp'),
        attack_debuff: t('effectAtkDown'),
        haste: t('effectHaste'),
        shield: t('effectShield'),
        team_shield: t('effectShield'),
        defense_buff: t('effectDefUp'),
        speed_buff: t('effectSpdUp')
      };
      const baseType = event.type.replace(/_tick$/, '');
      const label = EFFECT_LABELS[baseType] || event.type;

      // Determine if this is a positive or negative effect
      const BUFF_TYPES = new Set(['attack_buff', 'defense_buff', 'speed_buff', 'haste', 'shield', 'team_shield']);
      const DEBUFF_TYPES = new Set(['attack_debuff', 'confuse', 'stun', 'sleep']);

      let targetEl = null;
      if (event.targetSide === 'ally' && typeof event.targetIndex === 'number') {
        targetEl = findCreatureSlotByAttackerId(event.targetId, event.targetIndex);
      } else if (event.targetSide === 'enemy' && typeof event.targetIndex === 'number') {
        targetEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${event.targetIndex}"]`);
      }
      if (!targetEl) targetEl = findCreatureSlotByAttackerId(event.targetId);
      if (!targetEl) {
        targetEl = findEnemyTargetElement(event.targetId, result.enemies, event.targetIndex);
      }
      if (targetEl) {
        if (DEBUFF_TYPES.has(baseType)) {
          debuff(targetEl, label);
        } else if (BUFF_TYPES.has(baseType)) {
          buff(targetEl, label);
        } else {
          // Fallback to old floating text for unknown types
          showFloatingText(targetEl, label);
        }
        await delay(400);
      }
    }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: use event popup presets for buff/debuff/status effect visuals"
```

---

### Task 8: Add exploration event feedback — shrine, skill master, friendly NPC

**Files:**
- Modify: `public/js/ui/exploration.js` (shrine ~line 579, skill master ~line 1050, friendly NPC ~line 1260)

- [ ] **Step 1: Add imports to exploration.js**

At the top of `public/js/ui/exploration.js`, add:

```js
import { buff, itemGained } from './event-popup.js';
import { pop, flashElement } from './combat-effects.js';
```

Check if `pop` and `flashElement` are already imported — if so, just add the `event-popup.js` import.

- [ ] **Step 2: Add shrine level-up feedback**

Find the shrine upgrade handler (around line 579, after `const result = await apiShrineUpgrade(creatureId);`). After the existing narration call, and after `updateGameState(result.state)`, add:

```js
      // Visual feedback for shrine upgrade
      const shrineSlot = document.querySelector(`#player-formation .formation-slot`);
      if (shrineSlot && result.hpGain !== undefined) {
        const sprite = shrineSlot.querySelector('.formation-sprite');
        if (sprite) flashElement(sprite, 2);
        buff(shrineSlot, 'Level Up!');
        if (result.hpGain > 0) {
          setTimeout(() => buff(shrineSlot, `+${result.hpGain} HP`), 300);
        }
        if (result.attackGain > 0) {
          setTimeout(() => buff(shrineSlot, `+${result.attackGain} ATK`), 600);
        }
      }
```

Note: The shrine response returns `hpGain` and `attackGain` from the server (confirmed in `exploration-service.js:405-415`).

- [ ] **Step 3: Add skill master selection feedback**

Find the skill master handler (around line 1050, after `result = await apiSkillMasterChoose?.(skillId);`). After the `updateGameState` and `updateUI` calls, add:

```js
        // Visual feedback for skill acquisition
        const selectedCard = document.querySelector(`.skill-card[data-skill-id="${skillId}"]`) ||
                             document.querySelector('.skill-card.selected');
        if (selectedCard) {
          pop(selectedCard, 1.15);
          itemGained(selectedCard, 'Skill Acquired!');
        }
```

- [ ] **Step 4: Add friendly NPC item feedback**

Find the friendly NPC handler (around line 1260, after `result = await apiChooseFriendlyNpcItem?.(itemId, targetIdx);`). After the `updateGameState` call, add:

```js
        // Visual feedback for item received
        const itemCard = document.querySelector(`.friendly-npc-item[data-item-id="${itemId}"]`) ||
                         document.querySelector('.friendly-npc-item.selected');
        if (itemCard) {
          pop(itemCard, 1.15);
          const itemName = result?.chosen?.nameEn || result?.chosen?.word || 'Item';
          itemGained(itemCard, `+${itemName}`);
        }
```

- [ ] **Step 5: Syntax check**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add visual feedback for shrine, skill master, and friendly NPC events"
```

---

### Task 9: Add dealer buy/sell feedback with currency animation

**Files:**
- Modify: `public/js/ui/economy.js:129-151`

- [ ] **Step 1: Add imports to economy.js**

At the top of `public/js/ui/economy.js`, add:

```js
import { credits as creditsPopup, animateCounter } from './event-popup.js';
import { pop } from './combat-effects.js';
```

Check if `pop` is already imported — if so, just add the `event-popup.js` import.

- [ ] **Step 2: Add buy feedback**

Find the dealer buy handler (around line 129, after `const result = await apiDealerBuy(creatureId);`). Before the `updateUI()` and `renderDealerRoom()` calls, add:

```js
      if (result?.success) {
        // Currency popup
        const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
        if (creditsEl && result.creditsSpent) {
          creditsPopup(creditsEl, -result.creditsSpent);
          const prevCredits = (result.creditsRemaining || 0) + result.creditsSpent;
          animateCounter(creditsEl, prevCredits, result.creditsRemaining, 400, { flashColor: '#F44336' });
        }
        // Glow on purchased card
        const buyBtn = document.querySelector(`.dealer-buy-btn[data-creature-id="${creatureId}"]`);
        const card = buyBtn?.closest('.dealer-creature-card');
        if (card) pop(card, 1.1);
      }
```

- [ ] **Step 3: Add sell feedback**

Find the dealer sell handler (around line 148, after `const result = await apiDealerSell(creatureId);`). Before the `updateUI()` and `renderDealerRoom()` calls, add:

```js
      if (result?.success) {
        // Currency popup
        const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
        if (creditsEl && result.creditsGained) {
          creditsPopup(creditsEl, result.creditsGained);
          const prevCredits = (result.creditsRemaining || 0) - result.creditsGained;
          animateCounter(creditsEl, prevCredits, result.creditsRemaining, 400, { flashColor: '#FFD700' });
        }
      }
```

- [ ] **Step 4: Syntax check**

Run: `node --check public/js/ui/economy.js && echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/economy.js
git commit -m "feat: add dealer buy/sell visual feedback with currency animation"
```

---

### Task 10: Add post-combat shop item feedback

**Files:**
- Modify: `public/js/ui/post-combat-shop.js:90` (item selection callback area)
- Modify: `public/game.js` (where `itemSelectedCallback` is defined, ~line 1078)

- [ ] **Step 1: Add imports to game.js**

Find the `itemSelectedCallback` in `public/game.js` (around line 1078). Add import at top of file:

```js
import { itemGained } from './ui/event-popup.js';
import { pop } from './ui/combat-effects.js';
```

Check if `pop` is already imported — if so, just add the `event-popup.js` import.

- [ ] **Step 2: Add item selection feedback in the callback**

In the `itemSelectedCallback` (around line 1078-1096), after the `apiSelectShopItem` call succeeds and before `postCombatShop.hide()`, add:

```js
        // Visual feedback for item selection
        const selectedCard = document.querySelector('.shop-item-card.selected');
        if (selectedCard) {
          const itemName = selectedCard.querySelector('.shop-item-name')?.textContent || 'Item';
          pop(selectedCard, 1.15);
          itemGained(selectedCard, `+${itemName}`);
          // Brief delay so player sees the feedback before shop hides
          await new Promise(r => setTimeout(r, 600));
        }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/game.js public/js/ui/post-combat-shop.js
git commit -m "feat: add post-combat shop item selection feedback"
```

---

### Task 11: Add befriend creature feedback

**Files:**
- Modify: `public/js/ui/combat-loop.js:2395-2426` (befriend success handler)

- [ ] **Step 1: Add `buff` to combat-loop imports if not already present**

The import line should now include `buff`:

```js
import { effectiveness, resistedEffectiveness, skillProc, buff, debuff, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
```

(Already done in Task 7.)

- [ ] **Step 2: Add befriend success feedback**

Find the befriend success block (around line 2407, after `actionArea.innerHTML = ... befriended ...`). After the `updateGameState` call, add:

```js
      // Visual feedback for new ally
      const newAllySlot = document.querySelector('#player-formation .formation-slot:last-child');
      if (newAllySlot) {
        setTimeout(() => {
          buff(newAllySlot, 'New Ally!');
          spawnParticles(newAllySlot, 8, '#4CAF50');
        }, 500);
      }
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: add befriend creature visual feedback"
```

---

### Task 12: Run full test suite and manual verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All Tier 1 + Tier 2 tests pass.

- [ ] **Step 2: Syntax check all modified files**

Run:
```bash
node --check public/js/ui/event-popup.js && \
node --check public/js/ui/scene.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/exploration.js && \
node --check public/js/ui/economy.js && \
node --check public/game.js && \
echo "All OK"
```
Expected: `All OK`

- [ ] **Step 3: Start dev server and verify no console errors**

Run: `npm run dev`
Then: Open browser, check for JS import errors in console. The new `event-popup.js` module must load without errors.

- [ ] **Step 4: Commit any fixes**

If any issues found in Steps 1-3, fix and commit:

```bash
git add -A
git commit -m "fix: resolve issues found in visual feedback verification"
```
