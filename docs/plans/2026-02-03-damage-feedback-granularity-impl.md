# Damage Feedback Granularity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace binary damage feedback (150+ threshold) with 5-tier gradient system based on % of enemy max HP.

**Architecture:** Add `getDamageTier()` function to calculate tier from damage/enemyMaxHp. Update `impactEnemyEffect()` to accept tier and apply tiered effects. Add CSS classes for damage number styling per tier.

**Tech Stack:** Vanilla JS (ES6 modules), CSS animations, anime.js for effects

---

## Task 1: Add Tier Configuration and getDamageTier Function

**Files:**
- Modify: `public/js/ui/combat-effects.js:17-48`

**Step 1: Replace CONFIG with tier-based configuration**

Find and replace the CONFIG object (lines 17-32):

```javascript
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
```

Replace with:

```javascript
const CONFIG = {
  shake: {
    none: null,
    light: { intensity: 2, duration: 100 },
    medium: { intensity: 4, duration: 150 },
    heavy: { intensity: 6, duration: 200 }
  },
  // Tier-based effect configuration
  // Tiers: 0=Chip (<10%), 1=Normal (10-20%), 2=Solid (20-35%), 3=Big (35-50%), 4=Massive (50%+)
  tiers: {
    thresholds: [10, 20, 35, 50], // % of enemy HP for tiers 1, 2, 3, 4
    effects: [
      // Tier 0: Chip
      { shake: 'none', hitStop: 0, particles: 4, flash: 'none' },
      // Tier 1: Normal
      { shake: 'light', hitStop: 30, particles: 8, flash: 'none' },
      // Tier 2: Solid
      { shake: 'medium', hitStop: 60, particles: 12, flash: 'element' },
      // Tier 3: Big
      { shake: 'heavy', hitStop: 100, particles: 18, flash: 'both' },
      // Tier 4: Massive
      { shake: 'heavy', hitStop: 150, particles: 25, flash: 'screen2x' }
    ]
  }
};
```

**Step 2: Add getDamageTier function**

Find the `isBigDamage` function (lines 43-47):

```javascript
/**
 * Check if damage qualifies as "big hit"
 * @param {number} damage
 * @returns {boolean}
 */
export const isBigDamage = (damage) => damage >= CONFIG.bigDamageThreshold;
```

Replace with:

```javascript
/**
 * Calculate damage tier based on % of enemy max HP
 * @param {number} damage - Damage dealt
 * @param {number} enemyMaxHp - Enemy's maximum HP
 * @returns {number} Tier 0-4 (Chip, Normal, Solid, Big, Massive)
 */
export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1; // Fallback to Normal
  const percent = (damage / enemyMaxHp) * 100;
  const thresholds = CONFIG.tiers.thresholds;
  if (percent >= thresholds[3]) return 4; // Massive (50%+)
  if (percent >= thresholds[2]) return 3; // Big (35-50%)
  if (percent >= thresholds[1]) return 2; // Solid (20-35%)
  if (percent >= thresholds[0]) return 1; // Normal (10-20%)
  return 0; // Chip (<10%)
}

/**
 * Check if damage qualifies as "big hit" (tier 3+)
 * @param {number} damage - Damage dealt
 * @param {number} enemyMaxHp - Enemy's maximum HP
 * @returns {boolean}
 */
export const isBigDamage = (damage, enemyMaxHp) => getDamageTier(damage, enemyMaxHp) >= 3;

/**
 * Get tier name for CSS class
 * @param {number} tier - Tier 0-4
 * @returns {string} CSS class suffix
 */
export function getTierClassName(tier) {
  const names = ['chip', 'normal', 'solid', 'big', 'massive'];
  return names[tier] || 'normal';
}
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/combat-effects.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/combat-effects.js
git commit -m "feat(combat): add getDamageTier function for 5-tier damage feedback"
```

---

## Task 2: Update impactEnemyEffect to Use Tiers

**Files:**
- Modify: `public/js/ui/combat-effects.js:317-346`

**Step 1: Update impactEnemyEffect function signature and logic**

Find the `impactEnemyEffect` function (around line 317):

```javascript
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
```

Replace with:

```javascript
/**
 * Moment 2: Enemy takes damage with tiered feedback
 * @param {number} damage - Damage dealt
 * @param {Element} enemyEl - Enemy sprite element
 * @param {number} enemyMaxHp - Enemy's maximum HP (for tier calculation)
 */
export async function impactEnemyEffect(damage, enemyEl, enemyMaxHp = 0) {
  const tier = getDamageTier(damage, enemyMaxHp);
  const effects = CONFIG.tiers.effects[tier];

  // 1. Hit stop (scaled by tier)
  if (effects.hitStop > 0) {
    await hitStop(effects.hitStop);
  }

  // 2. Flash enemy (tier 2+)
  if (enemyEl && effects.flash !== 'none') {
    flashElement(enemyEl);
  }

  // 3. Screen shake (tier 1+)
  if (effects.shake !== 'none') {
    screenShake(effects.shake);
    // Tier 4: Extra shake after brief delay
    if (tier === 4) {
      await delay(100);
      screenShake('medium');
    }
  }

  // 4. Particles burst from enemy
  if (enemyEl) {
    // Higher tier = brighter particle color
    const colors = ['#999', '#e74c3c', '#0ff', '#0ff', '#ffd700'];
    spawnParticles(enemyEl, effects.particles, colors[tier]);
  }

  // 5. Enemy recoils (scaled by tier)
  if (enemyEl) {
    const recoilDistance = [2, 4, 6, 8, 12][tier];
    recoil(enemyEl, recoilDistance, 'right');
  }

  // 6. Screen flash based on tier
  if (effects.flash === 'both') {
    await delay(50);
    flashScreen(1);
  } else if (effects.flash === 'screen2x') {
    await delay(50);
    flashScreen(2);
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/combat-effects.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/ui/combat-effects.js
git commit -m "feat(combat): update impactEnemyEffect to use 5-tier feedback system"
```

---

## Task 3: Add CSS Classes for Damage Number Tiers

**Files:**
- Modify: `public/game.css` (after line 1298, before settings)

**Step 1: Add tier-based damage number styles**

Find the damage-number section (around line 1274-1298):

```css
/* ===== DAMAGE NUMBERS ===== */
.damage-number {
  position: absolute;
  font-weight: 700;
  font-size: 24px;
  color: var(--accent-red);
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  animation: damage-float 1s ease-out forwards;
  pointer-events: none;
  z-index: 30;
}

.damage-number.crit {
  font-size: 32px;
  color: var(--accent-orange);
}

.damage-number.heal {
  color: var(--accent-green);
}

@keyframes damage-float {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40px); }
}
```

Replace with:

```css
/* ===== DAMAGE NUMBERS ===== */
.damage-number {
  position: absolute;
  font-weight: 700;
  font-size: 24px;
  color: var(--accent-red);
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  animation: damage-float 1s ease-out forwards;
  pointer-events: none;
  z-index: 30;
}

.damage-number.crit {
  font-size: 32px;
  color: var(--accent-orange);
}

.damage-number.heal {
  color: var(--accent-green);
}

/* Tier 0: Chip damage - subdued */
.damage-number.dmg-chip {
  font-size: 20px;
  color: #888;
  text-shadow: none;
}

/* Tier 1: Normal damage - default styling */
.damage-number.dmg-normal {
  color: #fff;
}

/* Tier 2: Solid damage - cyan glow */
.damage-number.dmg-solid {
  font-size: 28px;
  color: #0ff;
  text-shadow: 0 0 8px #0ff;
  animation: damage-float-solid 1s ease-out forwards;
}

/* Tier 3: Big damage - strong cyan glow, pop animation */
.damage-number.dmg-big {
  font-size: 32px;
  color: #0ff;
  text-shadow: 0 0 12px #0ff, 0 0 24px #0ff;
  animation: damage-float-big 1s ease-out forwards;
}

/* Tier 4: Massive damage - gold glow, dramatic animation */
.damage-number.dmg-massive {
  font-size: 38px;
  color: #ffd700;
  text-shadow: 0 0 16px #ffd700, 0 0 32px #ff8c00;
  animation: damage-float-massive 1.5s ease-out forwards;
}

@keyframes damage-float {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40px); }
}

@keyframes damage-float-solid {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  15% { transform: translateY(-5px) scale(1.1); }
  100% { opacity: 0; transform: translateY(-40px) scale(1); }
}

@keyframes damage-float-big {
  0% { opacity: 1; transform: translateY(0) scale(0); }
  20% { transform: translateY(-8px) scale(1.2); }
  35% { transform: translateY(-12px) scale(1); }
  100% { opacity: 0; transform: translateY(-50px) scale(1); }
}

@keyframes damage-float-massive {
  0% { opacity: 1; transform: translateY(0) scale(0); }
  15% { transform: translateY(-10px) scale(1.4); }
  30% { transform: translateY(-15px) scale(1); }
  45% { transform: translateY(-20px) scale(1.1); }
  60% { transform: translateY(-25px) scale(1); }
  100% { opacity: 0; transform: translateY(-60px) scale(1); }
}
```

**Step 2: Remove the old big-hit class**

Find and delete the old `.damage-number.big-hit` rule (around line 1866):

```css
/* Big damage number modifier */
.damage-number.big-hit {
  font-size: 32px;
  color: #f1c40f;
  text-shadow: 0 0 10px rgba(241, 196, 15, 0.8), 2px 2px 4px rgba(0,0,0,0.5);
}
```

Delete this entire block.

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(combat): add CSS classes for 5-tier damage number styling"
```

---

## Task 4: Update showDamageNumber in scene.js to Accept Tier

**Files:**
- Modify: `public/js/ui/scene.js:136-150`

**Step 1: Update showDamageNumber function**

Find the function (around line 137):

```javascript
/** Show damage number floating up from enemy */
export function showDamageNumber(amount, { isCrit = false, isHeal = false } = {}) {
  const el = document.createElement('div');
  el.className = `damage-number${isCrit ? ' crit' : ''}${isHeal ? ' heal' : ''}`;
  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near enemy sprite
  const container = dom.enemySpriteContainer;
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  setTimeout(() => el.remove(), 1000);
}
```

Replace with:

```javascript
/** Show damage number floating up from enemy
 * @param {number} amount - Damage amount
 * @param {Object} options - Display options
 * @param {boolean} options.isCrit - Is critical hit
 * @param {boolean} options.isHeal - Is healing
 * @param {string} options.tierClass - Tier CSS class (dmg-chip, dmg-normal, dmg-solid, dmg-big, dmg-massive)
 */
export function showDamageNumber(amount, { isCrit = false, isHeal = false, tierClass = '' } = {}) {
  const el = document.createElement('div');

  // Build class list: base + tier + modifiers
  let classes = 'damage-number';
  if (tierClass) classes += ` ${tierClass}`;
  if (isCrit) classes += ' crit';
  if (isHeal) classes += ' heal';
  el.className = classes;

  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near enemy sprite
  const container = dom.enemySpriteContainer;
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  // Tier 4 (massive) stays longer
  const duration = tierClass === 'dmg-massive' ? 1500 : 1000;
  setTimeout(() => el.remove(), duration);
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat(combat): update showDamageNumber to accept tier class"
```

---

## Task 5: Update combat-loop.js to Pass Enemy MaxHP and Tier

**Files:**
- Modify: `public/js/ui/combat-loop.js:34-40` (imports)
- Modify: `public/js/ui/combat-loop.js:569-578` (player attack display)

**Step 1: Update imports to include getDamageTier and getTierClassName**

Find the imports (around line 34):

```javascript
import {
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay
} from './combat-effects.js';
```

Replace with:

```javascript
import {
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay,
  getDamageTier,
  getTierClassName
} from './combat-effects.js';
```

**Step 2: Update player attack damage display**

Find the player attack result handling (around line 565-578):

```javascript
        // Play attack sound immediately
        playSFX('attack');

        // Sequential chip activation with progressive math display
        await showChipActivationSequence(pa);

        // Show damage at same time as final damage reveal
        showDamageNumber(pa.damage, false, pa.critical);
        animateEnemyHurt();

        // Visual effects for enemy damage
        const enemySprite = document.getElementById('enemy-sprite');
        await impactEnemyEffect(pa.damage, enemySprite);
```

Replace with:

```javascript
        // Play attack sound immediately
        playSFX('attack');

        // Sequential chip activation with progressive math display
        await showChipActivationSequence(pa);

        // Calculate damage tier for visual feedback
        const state = getGameState();
        const enemyMaxHp = state.combat?.enemy?.maxHp || 100;
        const tier = getDamageTier(pa.damage, enemyMaxHp);
        const tierClass = `dmg-${getTierClassName(tier)}`;

        // Show damage at same time as final damage reveal
        showDamageNumber(pa.damage, false, pa.critical, false, false, null, tierClass);
        animateEnemyHurt();

        // Visual effects for enemy damage (pass enemyMaxHp for tier-based effects)
        const enemySprite = document.getElementById('enemy-sprite');
        await impactEnemyEffect(pa.damage, enemySprite, enemyMaxHp);
```

**Step 3: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat(combat): integrate tier-based damage feedback in combat loop"
```

---

## Task 6: Update game.js showDamageNumber Wrapper

**Files:**
- Modify: `public/js/game.js` (find showDamageNumber wrapper function)

**Step 1: Find and update the showDamageNumber wrapper**

Search for where `showDamageNumber` is defined or wrapped in game.js. It's passed as a callback to combat-loop.js. Find the function that wraps scene.showDamageNumber and update it to pass through the tierClass parameter.

The wrapper likely looks like:
```javascript
showDamageNumber: (amount, isPlayer, isCrit, ...) => ...
```

Update it to accept and pass through the tierClass parameter:
```javascript
showDamageNumber: (amount, isPlayer, isCrit, isDot, isHeal, specialType, tierClass) => {
  if (!isPlayer) {
    scene.showDamageNumber(amount, { isCrit, isHeal, tierClass });
  }
  // ... rest of logic
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/game.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/game.js
git commit -m "feat(combat): update showDamageNumber wrapper to pass tier class"
```

---

## Task 7: Manual Testing

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test damage tiers visually**

1. Start a new run or load existing save
2. Enter combat with a weak enemy (Ward 1)
3. Attack with minimal chips - should see Tier 0-1 (gray/white numbers, minimal effects)
4. Attack with full chip loadout - should see Tier 2-4 (cyan/gold numbers, heavy effects)

**Step 3: Test against different enemy HP values**

1. Fight Ward 1 enemy (~50-100 HP) - same damage should show higher tier
2. Fight Ward 3+ enemy (~200-400 HP) - same damage should show lower tier
3. Fight boss (~500+ HP) - need bigger hits for high tiers

**Step 4: Verify visual feedback scales**

- Tier 0 (Chip): Gray number, no shake, few particles
- Tier 1 (Normal): White number, light shake
- Tier 2 (Solid): Cyan number with glow, medium shake, element flash
- Tier 3 (Big): Cyan with strong glow, heavy shake, pop animation
- Tier 4 (Massive): Gold number, double shake, screen flash x2, dramatic animation

**Step 5: Commit final verification**

```bash
git add -A
git commit -m "test: verify damage feedback granularity working correctly"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | combat-effects.js | Add tier config and getDamageTier function |
| 2 | combat-effects.js | Update impactEnemyEffect for tier-based effects |
| 3 | game.css | Add CSS classes for 5-tier damage numbers |
| 4 | scene.js | Update showDamageNumber to accept tierClass |
| 5 | combat-loop.js | Pass enemy maxHP and calculate tier |
| 6 | game.js | Update showDamageNumber wrapper |
| 7 | Manual | Test all tiers visually |

**Total estimated changes:** ~150 lines added/modified across 5 files
