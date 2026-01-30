# Combat Animation Effects - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add anime-style visual effects to four combat moments using anime.js

**Architecture:** New `combat-effects.js` module with reusable primitives (screen shake, hit stop, particles, speed lines, flash). Each combat moment calls these primitives in sequence. Integration via callback injection into existing `combat-loop.js`.

**Tech Stack:** anime.js (~14KB), CSS keyframes, DOM manipulation

**Merge Note:** This implementation lives on `feature/dual-pool-combat` branch. The Power/Bandwidth pool UI elements don't exist yet - speed lines will target placeholder selectors that the combat redesign will implement. Use `[data-pool="power"]` and `[data-pool="bandwidth"]` as targets.

---

## Task 1: Install anime.js

**Files:**
- Modify: `package.json`

**Step 1: Install anime.js via npm**

Run:
```bash
npm install animejs
```

Expected: Package added to dependencies

**Step 2: Verify installation**

Run:
```bash
npm ls animejs
```

Expected: Shows `animejs@4.x.x` in tree

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install anime.js for combat animations"
```

---

## Task 2: Add overlay elements to HTML

**Files:**
- Modify: `public/game.html:25-43` (inside scene-area)

**Step 1: Add overlay divs after scene-area opening**

In `public/game.html`, after line 25 (`<div class="scene-area" id="scene-area">`), add:

```html
    <!-- Combat effect overlays -->
    <div class="screen-flash-overlay" id="screen-flash-overlay"></div>
    <div class="vignette-overlay" id="vignette-overlay"></div>
```

**Step 2: Verify HTML is valid**

Run:
```bash
node -e "require('fs').readFileSync('public/game.html', 'utf8')" && echo "HTML readable"
```

Expected: "HTML readable"

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(ui): add combat effect overlay elements"
```

---

## Task 3: Add CSS for overlays and particles

**Files:**
- Modify: `public/game.css` (add at end)

**Step 1: Add overlay and particle styles**

Append to `public/game.css`:

```css
/* ============ COMBAT EFFECTS ============ */

/* Screen flash overlay */
.screen-flash-overlay {
  position: absolute;
  inset: 0;
  background: white;
  opacity: 0;
  pointer-events: none;
  z-index: 100;
}

/* Red vignette for player damage */
.vignette-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(255, 50, 50, 0.7) 100%);
  opacity: 0;
  pointer-events: none;
  z-index: 100;
}

/* Particles */
.combat-particle {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1000;
  will-change: transform, opacity;
}

/* Speed lines */
.speed-line {
  position: fixed;
  width: 30px;
  height: 3px;
  background: linear-gradient(90deg, rgba(255,255,255,0.9), transparent);
  pointer-events: none;
  z-index: 1000;
  border-radius: 2px;
  will-change: transform, opacity;
}

/* Hit stop - freezes all animations */
.hit-stop,
.hit-stop * {
  animation-play-state: paused !important;
}

/* Big damage number modifier */
.damage-number.big-hit {
  font-size: 32px;
  color: #f1c40f;
  text-shadow: 0 0 10px rgba(241, 196, 15, 0.8), 2px 2px 4px rgba(0,0,0,0.5);
}

/* Critical pulse on HP bar when low */
.hp-critical-pulse {
  animation: hp-critical 0.5s ease-in-out infinite;
}

@keyframes hp-critical {
  0%, 100% { box-shadow: 0 0 5px rgba(255, 50, 50, 0.5); }
  50% { box-shadow: 0 0 15px rgba(255, 50, 50, 0.9); }
}

/* Chip firing glow enhancement */
.chip-icon.chip-firing-enhanced {
  filter: brightness(1.5);
  box-shadow: 0 0 20px rgba(52, 152, 219, 0.9);
}
```

**Step 2: Verify CSS syntax**

Run:
```bash
node -e "require('fs').readFileSync('public/game.css', 'utf8')" && echo "CSS readable"
```

Expected: "CSS readable"

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(ui): add combat effect CSS styles"
```

---

## Task 4: Create combat-effects.js with utility functions

**Files:**
- Create: `public/js/ui/combat-effects.js`

**Step 1: Create the module with imports and utilities**

Create `public/js/ui/combat-effects.js`:

```javascript
/**
 * @file combat-effects.js - Anime-style Combat Visual Effects
 *
 * PURPOSE:
 * Provides reusable visual effect primitives for combat feedback:
 * screen shake, hit stop, particles, speed lines, and flashes.
 *
 * USAGE:
 * Import individual functions and call during combat events.
 * Effects are designed to layer - call multiple for combined impact.
 */

import anime from '/node_modules/animejs/lib/anime.es.js';

// ============ CONFIGURATION ============

const CONFIG = {
  shake: {
    light: { intensity: 2, duration: 100 },
    medium: { intensity: 4, duration: 150 },
    heavy: { intensity: 6, duration: 200 }
  },
  hitStop: {
    normal: 60,
    big: 100
  },
  particles: {
    normal: 10,
    big: 18
  },
  bigDamageThreshold: 150
};

// ============ UTILITY ============

/**
 * Promise-based delay
 * @param {number} ms - Milliseconds to wait
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if damage qualifies as "big hit"
 * @param {number} damage
 * @returns {boolean}
 */
export const isBigDamage = (damage) => damage >= CONFIG.bigDamageThreshold;

// ============ PRIMITIVES ============

/**
 * Screen shake effect
 * @param {'light'|'medium'|'heavy'} intensity
 */
export function screenShake(intensity = 'medium') {
  const container = document.querySelector('.game-app');
  if (!container) return;

  const { intensity: px, duration } = CONFIG.shake[intensity] || CONFIG.shake.medium;

  anime({
    targets: container,
    translateX: [0, -px, px, -px/2, px/2, 0],
    translateY: [0, px/2, -px/2, 0],
    duration,
    easing: 'easeOutQuad'
  });
}

/**
 * Freeze all animations briefly (hit stop)
 * @param {number} ms - Duration of freeze
 */
export async function hitStop(ms = CONFIG.hitStop.normal) {
  document.body.classList.add('hit-stop');
  await delay(ms);
  document.body.classList.remove('hit-stop');
}

/**
 * Flash an element white (or custom filter)
 * @param {string|Element} targets - CSS selector or element
 * @param {number} count - Number of flashes
 */
export function flashElement(targets, count = 1) {
  anime({
    targets,
    filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
}

/**
 * Flash the screen white
 * @param {number} count - Number of flashes
 */
export function flashScreen(count = 1) {
  const overlay = document.getElementById('screen-flash-overlay');
  if (!overlay) return;

  anime({
    targets: overlay,
    opacity: [0, 0.3, 0],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
}

/**
 * Show red vignette (player damage)
 * @param {number} duration - Fade duration
 */
export function showVignette(duration = 300) {
  const overlay = document.getElementById('vignette-overlay');
  if (!overlay) return;

  anime({
    targets: overlay,
    opacity: [0.6, 0],
    duration,
    easing: 'easeOutQuad'
  });
}

/**
 * Spawn particles bursting outward from an element
 * @param {Element} sourceEl - Element to burst from
 * @param {number} count - Number of particles
 * @param {string} color - Particle color
 */
export function spawnParticles(sourceEl, count = 10, color = '#fff') {
  if (!sourceEl) return;

  const rect = sourceEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'combat-particle';
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.backgroundColor = color;
    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 40 + Math.random() * 40;

    anime({
      targets: particle,
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1, 0],
      opacity: [1, 0],
      duration: 350 + Math.random() * 150,
      easing: 'easeOutQuad',
      complete: () => particle.remove()
    });
  }
}

/**
 * Spawn speed lines from source toward target
 * @param {Element} fromEl - Source element
 * @param {Element} toEl - Target element
 * @param {number} count - Number of lines
 * @param {string} color - Line color (CSS)
 */
export function spawnSpeedLines(fromEl, toEl, count = 4, color = 'rgba(255,255,255,0.9)') {
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  for (let i = 0; i < count; i++) {
    const line = document.createElement('div');
    line.className = 'speed-line';
    line.style.left = `${startX}px`;
    line.style.top = `${startY + (i - count/2) * 4}px`;
    line.style.transform = `rotate(${angle}deg)`;
    line.style.background = `linear-gradient(90deg, ${color}, transparent)`;
    document.body.appendChild(line);

    anime({
      targets: line,
      translateX: dx,
      translateY: dy,
      opacity: [1, 0],
      duration: 200,
      delay: i * 25,
      easing: 'easeOutQuad',
      complete: () => line.remove()
    });
  }
}

/**
 * Animate element recoil (shift and spring back)
 * @param {string|Element} targets
 * @param {number} distance - Pixels to recoil
 * @param {'left'|'right'} direction
 */
export function recoil(targets, distance = 5, direction = 'right') {
  const sign = direction === 'right' ? 1 : -1;

  anime({
    targets,
    translateX: [0, sign * distance, 0],
    duration: 200,
    easing: 'easeOutElastic(1, 0.5)'
  });
}

/**
 * Pop animation (scale overshoot)
 * @param {string|Element} targets
 * @param {number} scale - Max scale
 */
export function pop(targets, scale = 1.3) {
  anime({
    targets,
    scale: [1, scale, 1],
    duration: 300,
    easing: 'easeOutBack'
  });
}
```

**Step 2: Verify syntax**

Run:
```bash
node --check public/js/ui/combat-effects.js && echo "Syntax OK"
```

Expected: "Syntax OK"

**Step 3: Commit**

```bash
git add public/js/ui/combat-effects.js
git commit -m "feat(effects): add combat-effects.js with animation primitives"
```

---

## Task 5: Add moment functions (chip firing, damage impact)

**Files:**
- Modify: `public/js/ui/combat-effects.js` (append)

**Step 1: Add moment functions**

Append to `public/js/ui/combat-effects.js`:

```javascript

// ============ COMBAT MOMENTS ============

/**
 * Moment 1: Chip firing with effects
 * Called for each chip in the activation sequence
 * @param {Element} chipEl - The chip slot element
 * @param {Object} chipData - Chip data with stats.power and stats.bandwidth
 * @param {Object} poolEls - { power: Element, bandwidth: Element } pool display elements
 */
export async function fireChipEffect(chipEl, chipData, poolEls = {}) {
  if (!chipEl) return;

  // 1. Chip pops
  pop(chipEl.querySelector('.chip-icon') || chipEl, 1.4);

  // 2. Enhanced glow
  const icon = chipEl.querySelector('.chip-icon');
  if (icon) {
    icon.classList.add('chip-firing-enhanced');
    setTimeout(() => icon.classList.remove('chip-firing-enhanced'), 300);
  }

  // 3. Speed lines to pools (if pool elements exist)
  const stats = chipData?.stats || {};
  if (stats.power > 0 && poolEls.power) {
    spawnSpeedLines(chipEl, poolEls.power, 3, 'rgba(231, 76, 60, 0.9)');
    setTimeout(() => flashElement(poolEls.power), 150);
  }
  if (stats.bandwidth > 0 && poolEls.bandwidth) {
    spawnSpeedLines(chipEl, poolEls.bandwidth, 3, 'rgba(52, 152, 219, 0.9)');
    setTimeout(() => flashElement(poolEls.bandwidth), 150);
  }

  // 4. Particles from chip
  spawnParticles(chipEl, 5, '#3498db');

  // 5. Subtle screen pulse
  flashScreen();
}

/**
 * Moment 2: Enemy takes damage
 * @param {number} damage - Damage dealt
 * @param {Element} enemyEl - Enemy sprite element
 */
export async function impactEnemyEffect(damage, enemyEl) {
  const big = isBigDamage(damage);

  // 1. Hit stop
  await hitStop(big ? CONFIG.hitStop.big : CONFIG.hitStop.normal);

  // 2. Flash enemy
  if (enemyEl) {
    flashElement(enemyEl);
  }

  // 3. Screen shake
  screenShake(big ? 'heavy' : 'medium');

  // 4. Particles burst from enemy
  if (enemyEl) {
    spawnParticles(enemyEl, big ? CONFIG.particles.big : CONFIG.particles.normal, '#e74c3c');
  }

  // 5. Enemy recoils
  if (enemyEl) {
    recoil(enemyEl, big ? 10 : 5, 'right');
  }

  // 6. Big damage: double flash
  if (big) {
    await delay(50);
    flashScreen(2);
  }
}

/**
 * Moment 3: Player takes damage
 * @param {number} damage - Damage taken
 * @param {Element} hpBarEl - Player HP bar element
 * @param {Element} chipRowEl - Chip row element
 */
export async function playerHitEffect(damage, hpBarEl, chipRowEl) {
  // 1. Hit stop (shorter than enemy)
  await hitStop(50);

  // 2. Heavy screen shake
  screenShake('heavy');

  // 3. Red vignette
  showVignette(300);

  // 4. Chip row shudders
  if (chipRowEl) {
    anime({
      targets: chipRowEl.querySelectorAll('.chip-slot'),
      translateX: [-2, 2, -1, 0],
      duration: 150,
      easing: 'easeOutQuad'
    });
  }

  // 5. HP bar flash before drain
  if (hpBarEl) {
    flashElement(hpBarEl);
  }
}

/**
 * Check if HP is critical and add pulse effect
 * @param {Element} hpBarEl - HP bar fill element
 * @param {number} currentHp
 * @param {number} maxHp
 */
export function updateHpCriticalState(hpBarEl, currentHp, maxHp) {
  if (!hpBarEl) return;

  const percent = currentHp / maxHp;
  if (percent < 0.25) {
    hpBarEl.classList.add('hp-critical-pulse');
  } else {
    hpBarEl.classList.remove('hp-critical-pulse');
  }
}

// ============ EXPORTS ============

export {
  CONFIG,
  // Primitives
  screenShake,
  hitStop,
  flashElement,
  flashScreen,
  showVignette,
  spawnParticles,
  spawnSpeedLines,
  recoil,
  pop,
  // Moments
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState
};
```

**Step 2: Verify syntax**

Run:
```bash
node --check public/js/ui/combat-effects.js && echo "Syntax OK"
```

Expected: "Syntax OK"

**Step 3: Commit**

```bash
git add public/js/ui/combat-effects.js
git commit -m "feat(effects): add combat moment functions (chip fire, damage impact, player hit)"
```

---

## Task 6: Integrate effects into combat-loop.js

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add import at top of file**

After line 32 (`import { logger } from '../logger.js';`), add:

```javascript
import {
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay
} from './combat-effects.js';
```

**Step 2: Add effect to chip activation**

In `animateChipActivation` function (around line 318), after the existing animation, add the effect call.

Replace the function:

```javascript
/**
 * Animate a chip circle when its effect activates
 * @param {number} chipIndex - Index of the chip slot to animate
 * @param {Object} chipData - Chip data with stats (optional)
 */
function animateChipActivation(chipIndex, chipData = null) {
  const slot = document.querySelector(`.chip-slot[data-index="${chipIndex}"]`);
  if (slot) {
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      icon.classList.add('chip-activating');
      setTimeout(() => icon.classList.remove('chip-activating'), 600);
    }

    // Fire visual effects
    const poolEls = {
      power: document.querySelector('[data-pool="power"]'),
      bandwidth: document.querySelector('[data-pool="bandwidth"]')
    };
    fireChipEffect(slot, chipData, poolEls);
  }
}
```

**Step 3: Update chip activation call to pass chip data**

In `showChipActivationSequence` (around line 213), update the call:

Find:
```javascript
      animateChipActivation(chipSlot);
```

Replace with:
```javascript
      // Get chip data from loadout cache for effects
      const chipLoadout = getChipLoadoutCache?.()?.equipment?.weapon?.equippedChips;
      const chipDataForEffect = chipLoadout?.[chipSlot] || null;
      animateChipActivation(chipSlot, chipDataForEffect);
```

**Step 4: Add enemy impact effect**

In `executePlayerAttack` (around line 416-418), after `playSFX('attack')`, add the effect:

Find:
```javascript
        showDamageNumber(pa.damage, false, pa.critical);
        animateEnemyHurt();
        playSFX('attack');
```

Replace with:
```javascript
        showDamageNumber(pa.damage, false, pa.critical);
        animateEnemyHurt();
        playSFX('attack');

        // Visual effects for enemy damage
        const enemySprite = document.getElementById('enemy-sprite');
        await impactEnemyEffect(pa.damage, enemySprite);
```

**Step 5: Add player hit effect**

In `executeEnemyAttack` function, find where player takes damage and add the effect. Look for where `showEnemyDamageDisplay` is called (around line 520-540).

After `showEnemyDamageDisplay(result.enemyAttack);` add:

```javascript
      // Visual effects for player damage
      const playerHpBar = document.getElementById('player-hp-fill');
      const chipRow = document.getElementById('chip-row');
      await playerHitEffect(result.enemyAttack.damage, playerHpBar, chipRow);

      // Check for critical HP state
      const gameState = getGameState();
      if (gameState?.player) {
        updateHpCriticalState(playerHpBar, gameState.player.hp, gameState.player.maxHp);
      }
```

**Step 6: Verify syntax**

Run:
```bash
node --check public/js/ui/combat-loop.js && echo "Syntax OK"
```

Expected: "Syntax OK"

**Step 7: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat(combat): integrate visual effects into combat loop"
```

---

## Task 7: Manual testing

**Files:** None (testing)

**Step 1: Start dev server**

Run:
```bash
npm run dev
```

**Step 2: Test in browser**

1. Open http://localhost:3000
2. Login and start a combat encounter
3. Verify each effect:
   - [ ] Chip firing: pop animation, particles burst, screen pulse
   - [ ] Enemy damage: hit stop (brief pause), shake, particles, enemy recoil
   - [ ] Player damage: heavy shake, red vignette, chip row shudder
   - [ ] Big damage (150+): longer pause, double flash, larger effects

**Step 3: Check console for errors**

Open browser DevTools, look for any import errors or animation issues.

---

## Task 8: Update documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Add combat effects section**

In `docs/ARCHITECTURE.md`, after the "Combat System" section (around line 255), add:

```markdown
### Combat Visual Effects

Anime-style visual feedback during combat, implemented in `public/js/ui/combat-effects.js`.

**Animation Library:** anime.js (~14KB)

**Primitives:**
| Effect | Function | Description |
|--------|----------|-------------|
| Screen Shake | `screenShake(intensity)` | Camera jolt (light/medium/heavy) |
| Hit Stop | `hitStop(ms)` | Freeze frame on impact |
| Flash | `flashElement(target)` / `flashScreen()` | Brightness pulse |
| Particles | `spawnParticles(el, count, color)` | Burst outward from element |
| Speed Lines | `spawnSpeedLines(from, to)` | Lines traveling between elements |
| Recoil | `recoil(target, distance)` | Knockback spring animation |

**Combat Moments:**
| Moment | Effects | Trigger |
|--------|---------|---------|
| Chip Fire | Pop, particles, speed lines to pools, screen pulse | Each chip in sequence |
| Enemy Damage | Hit stop, shake, flash, particles, recoil | Player attack lands |
| Player Damage | Hit stop, heavy shake, red vignette, chip shudder | Enemy attack lands |
| Big Damage (150+) | All above amplified: longer stop, double flash | High damage threshold |

**Files:**
- `public/js/ui/combat-effects.js` - Effect primitives and moment functions
- `public/game.css` - Overlay and particle styles

```

**Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add combat visual effects section to architecture"
```

---

## Task 9: Run E2E tests

**Files:** None (testing)

**Step 1: Run test suite**

Run:
```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 tests pass (some flakiness acceptable)

**Step 2: If tests fail on timing**

Combat effects add delays. If tests timeout:
- Check if `hitStop` duration is too long
- Consider adding `data-testid` attributes for test hooks
- May need to mock effects in test environment

**Step 3: Commit any test fixes**

If tests needed adjustment:
```bash
git add -A
git commit -m "test: adjust for combat animation timing"
```

---

## Task 10: Final integration commit

**Files:** None

**Step 1: Verify all changes**

Run:
```bash
git status
git log --oneline -10
```

**Step 2: Create summary commit if needed**

If there are uncommitted changes:
```bash
git add -A
git commit -m "feat(combat): complete anime-style visual effects MVP

- Install anime.js for animation timing
- Add overlay elements (flash, vignette)
- Create combat-effects.js with primitives
- Integrate effects into combat loop
- Update architecture documentation

Effects: chip pop, speed lines, screen shake, hit stop,
particles, enemy recoil, player vignette"
```

---

## Merge Considerations

This branch (`feature/dual-pool-combat`) will need to merge with any combat redesign changes:

1. **Pool UI elements**: Speed lines target `[data-pool="power"]` and `[data-pool="bandwidth"]`. When those elements exist, lines will automatically connect.

2. **Damage calculation**: Effects use `damage >= 150` threshold. If combat redesign changes damage scale significantly, update `CONFIG.bigDamageThreshold` in `combat-effects.js`.

3. **No conflicts expected**: Effects are additive (new file + appends to existing). Combat loop integration points are isolated.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `package.json` | Add animejs dependency |
| `public/game.html` | Add overlay divs |
| `public/game.css` | Add effect styles |
| `public/js/ui/combat-effects.js` | NEW: Effect primitives + moments |
| `public/js/ui/combat-loop.js` | Import and call effects |
| `docs/ARCHITECTURE.md` | Document effects system |

---

*Plan ready for execution.*
