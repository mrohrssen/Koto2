# Combat Animation Effects - MVP Design

**Date:** 2026-01-30
**Status:** Ready for Implementation
**Goal:** Make combat feel impactful with anime-style visual effects

---

## Overview

Inspired by Honkai Star Rail's layered visual feedback, this design adds "juice" to four key combat moments. The approach uses anime-style effects: speed lines, impact flashes, screen shake, hit stops, and particle bursts.

**Design philosophy:**
- Layered effects (multiple things happening simultaneously)
- Timing contrast (instant impacts + lingering particles)
- Hit stops create weight (brief pauses before impact resolves)
- Effects scale with intensity (big damage = bigger effects)

---

## Library Choice: Anime.js

**Package:** `animejs` (npm)
**Size:** ~14 KB
**Why:** Simple API, excellent easing functions, timeline sequencing, active maintenance (158K weekly downloads)

```bash
npm install animejs
```

```javascript
import anime from 'animejs';
```

No external API calls - runs entirely client-side.

---

## Core Animation Primitives

Five reusable building blocks that combine to create all combat effects:

### 1. Screen Shake

Brief camera jolt via CSS transform on game container.

| Intensity | Displacement | Duration |
|-----------|--------------|----------|
| Light | 2px | 100ms |
| Medium | 4px | 150ms |
| Heavy | 8px | 200ms |

```javascript
const screenShake = (intensity = 'medium') => {
  const config = { light: 2, medium: 4, heavy: 8 };
  const px = config[intensity];

  anime({
    targets: '.game-container',
    translateX: [0, -px, px, -px/2, px/2, 0],
    duration: intensity === 'heavy' ? 200 : 150,
    easing: 'easeOutQuad'
  });
};
```

### 2. Hit Stop (Freeze Frame)

Pause all animations for 50-100ms on impact. Creates "weight."

```css
.hit-stop * {
  animation-play-state: paused !important;
  transition: none !important;
}
```

```javascript
const hitStop = async (ms = 60) => {
  document.body.classList.add('hit-stop');
  await delay(ms);
  document.body.classList.remove('hit-stop');
};
```

### 3. Impact Flash

White overlay that flashes and fades. Applied to target or full screen.

```javascript
const flashElement = (targets, color = 'white', count = 1) => {
  anime({
    targets,
    filter: [`brightness(1)`, `brightness(${color === 'white' ? 3 : 1.5})`, `brightness(1)`],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
};

const flashScreen = (count = 1) => {
  anime({
    targets: '.screen-flash-overlay',
    opacity: [0, 0.3, 0],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
};
```

### 4. Speed Lines

Lines emanating from source toward target. Used for chip → pool connections.

```javascript
const spawnSpeedLines = (fromEl, toEl, count = 5) => {
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    const line = document.createElement('div');
    line.className = 'speed-line';
    // Position at fromEl, calculate angle to toEl
    document.body.appendChild(line);

    anime({
      targets: line,
      translateX: toRect.x - fromRect.x,
      translateY: toRect.y - fromRect.y,
      opacity: [1, 0],
      duration: 200,
      delay: i * 30, // Stagger
      easing: 'easeOutQuad',
      complete: () => line.remove()
    });
  }
};
```

```css
.speed-line {
  position: fixed;
  width: 20px;
  height: 2px;
  background: linear-gradient(90deg, white, transparent);
  pointer-events: none;
  z-index: 1000;
}
```

### 5. Particle Burst

DOM elements that scatter outward from a point.

```javascript
const spawnParticles = (sourceEl, count = 10, color = '#fff') => {
  const rect = sourceEl.getBoundingClientRect();
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.backgroundColor = color;
    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
    const distance = 50 + Math.random() * 50;

    anime({
      targets: particle,
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1, 0],
      opacity: [1, 0],
      duration: 400 + Math.random() * 200,
      easing: 'easeOutQuad',
      complete: () => particle.remove()
    });
  }
};
```

```css
.particle {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1000;
}
```

---

## The Four Combat Moments

### Moment 1: Chip Firing Sequence

When chips activate in slot order (1 → 2 → 3 → 4 → 5).

**Effects per chip:**
1. Chip POPS (scale 1 → 1.4 → 1, easeOutBack overshoot)
2. Glow intensifies (box-shadow pulse)
3. Speed lines burst from chip toward pool holders:
   - PWR contribution → lines toward Power pool display
   - BW contribution → lines toward Bandwidth pool display
   - Both → split burst
4. Target pool holder flashes when lines arrive
5. Particle scatter from chip (4-6 particles)
6. Subtle screen pulse (white overlay 0.1 opacity, 80ms)

**Timing:** 400ms per chip

```javascript
const fireChip = async (chipEl, chipData, poolEls) => {
  const { power, bandwidth } = chipData.stats;

  // 1. Chip pop
  anime({
    targets: chipEl,
    scale: [1, 1.4, 1],
    duration: 300,
    easing: 'easeOutBack'
  });

  // 2. Glow pulse (CSS class toggle)
  chipEl.classList.add('chip-firing');
  setTimeout(() => chipEl.classList.remove('chip-firing'), 300);

  // 3. Speed lines to pools
  if (power > 0) {
    spawnSpeedLines(chipEl, poolEls.power, 3);
    setTimeout(() => flashElement(poolEls.power), 150);
  }
  if (bandwidth > 0) {
    spawnSpeedLines(chipEl, poolEls.bandwidth, 3);
    setTimeout(() => flashElement(poolEls.bandwidth), 150);
  }

  // 4. Particles
  spawnParticles(chipEl, 5, '#3498db');

  // 5. Screen pulse
  flashScreen();

  await delay(400);
};
```

### Moment 2: Damage Impact (Enemy)

When final damage lands on the enemy.

**Effects:**
1. Hit stop: 60ms freeze
2. Impact flash: Enemy sprite flashes white
3. Screen shake: Medium (4px, 150ms)
4. Damage number: Pops with scale overshoot (0.5 → 1.2 → 1)
5. Particle burst: 8-12 particles scatter from enemy
6. Enemy recoil: Sprite shifts 5px right, springs back
7. HP drain: 150ms delay, then smooth decrease

```javascript
const impactEnemy = async (damage, enemyEl) => {
  const big = damage > 150;

  // 1. Hit stop
  await hitStop(big ? 100 : 60);

  // 2. Flash enemy
  flashElement(enemyEl);

  // 3. Screen shake
  screenShake(big ? 'heavy' : 'medium');

  // 4. Damage number
  const dmgEl = showDamageNumber(damage, enemyEl, { big });
  anime({
    targets: dmgEl,
    scale: [0.5, big ? 1.3 : 1.2, 1],
    opacity: [0, 1],
    duration: 200,
    easing: 'easeOutBack'
  });

  // 5. Particles
  spawnParticles(enemyEl, big ? 18 : 10);

  // 6. Enemy recoil
  anime({
    targets: enemyEl,
    translateX: [0, big ? 10 : 5, 0],
    duration: 200,
    easing: 'easeOutElastic(1, .5)'
  });

  // 7. HP drain (delayed)
  await delay(150);
  drainEnemyHp(damage);

  // Big damage extras
  if (big) {
    flashScreen(2); // Double flash
  }
};
```

### Moment 3: Player Getting Hit

When enemy damages the player.

**Effects:**
1. Hit stop: 50ms freeze
2. Screen shake: Heavy (6px, 200ms) - more visceral
3. Red vignette: Screen edges flash red, fade 300ms
4. Damage number: Red text pops near HP bar
5. HP bar reaction:
   - Flash white before draining
   - Slower drain animation
   - Pulse red if HP < 25%
6. Chip row shudder: All chips jitter briefly

```javascript
const playerTakesDamage = async (damage, playerHpEl, chipRowEl) => {
  // 1. Hit stop
  await hitStop(50);

  // 2. Heavy shake
  screenShake('heavy');

  // 3. Red vignette
  anime({
    targets: '.vignette-overlay',
    opacity: [0.5, 0],
    duration: 300,
    easing: 'easeOutQuad'
  });

  // 4. Damage number
  const dmgEl = showDamageNumber(damage, playerHpEl, { color: 'red' });
  anime({
    targets: dmgEl,
    scale: [0.5, 1.2, 1],
    opacity: [0, 1],
    duration: 200,
    easing: 'easeOutBack'
  });

  // 5. HP bar
  flashElement(playerHpEl, 'white');
  await delay(100);
  drainPlayerHp(damage, { duration: 400 });

  // Pulse if low HP
  if (getPlayerHpPercent() < 0.25) {
    playerHpEl.classList.add('hp-critical-pulse');
  }

  // 6. Chip row shudder
  anime({
    targets: `${chipRowEl} .chip`,
    translateX: [-2, 2, -1, 0],
    duration: 150,
    easing: 'easeOutQuad'
  });
};
```

### Moment 4: Big Damage Celebration

When damage exceeds threshold (150+), scale up all effects.

**Scaled values:**

| Property | Normal | Big Damage |
|----------|--------|------------|
| Hit stop | 60ms | 100ms |
| Screen shake | 4px | 8px |
| Particles | 10 | 18 |
| Enemy recoil | 5px | 10px |
| Screen flash | 1x | 2x (double tap) |
| Damage number | White, 1x size | Gold, 1.5x size |
| Number duration | 1000ms | 1500ms |

**Implementation:** Big damage is handled within `impactEnemy()` via the `big` flag - not a separate function.

---

## Required HTML Elements

Add these overlay elements to `game.html`:

```html
<!-- Inside .game-container -->
<div class="screen-flash-overlay"></div>
<div class="vignette-overlay"></div>
```

```css
.screen-flash-overlay {
  position: absolute;
  inset: 0;
  background: white;
  opacity: 0;
  pointer-events: none;
  z-index: 100;
}

.vignette-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(255, 0, 0, 0.6) 100%);
  opacity: 0;
  pointer-events: none;
  z-index: 100;
}
```

---

## New File Structure

```
public/js/ui/
  combat-effects.js    # New file: all animation primitives + moment functions
  combat-loop.js       # Modify: call combat-effects functions at appropriate points
```

**combat-effects.js exports:**
- `screenShake(intensity)`
- `hitStop(ms)`
- `flashElement(targets, color, count)`
- `flashScreen(count)`
- `spawnSpeedLines(fromEl, toEl, count)`
- `spawnParticles(sourceEl, count, color)`
- `fireChip(chipEl, chipData, poolEls)`
- `impactEnemy(damage, enemyEl)`
- `playerTakesDamage(damage, playerHpEl, chipRowEl)`

---

## Integration Points

Modify `combat-loop.js` to call effects:

1. **Chip firing** (around line 318 where `chip-activate` animation runs):
   ```javascript
   import { fireChip } from './combat-effects.js';
   // Replace current chip animation with fireChip()
   ```

2. **Enemy damage** (around line 170-259 where damage math displays):
   ```javascript
   import { impactEnemy } from './combat-effects.js';
   // Call after damage calculation, before HP update
   ```

3. **Player damage** (around line 298-312 where enemy damage displays):
   ```javascript
   import { playerTakesDamage } from './combat-effects.js';
   // Call when enemy attacks player
   ```

---

## MVP Scope

**In scope:**
- Install anime.js
- Create combat-effects.js with primitives
- Implement all four moments at basic level
- Add overlay HTML elements

**Out of scope (future enhancements):**
- Per-chip unique effects (fire particles for Fireworks Bot, etc.)
- Sound synchronization
- Reduced motion accessibility toggle
- Performance optimization for low-end devices

---

## Success Criteria

Combat should feel noticeably more satisfying:
- Each chip firing has visible feedback
- Damage impacts have "weight" (hit stop + shake)
- Player damage feels threatening (red vignette + heavy shake)
- Big hits feel celebratory (extra flash + larger numbers)

---

## Dependencies

- **Combat redesign branch:** Speed lines targeting Power/Bandwidth pool holders requires those UI elements to exist. Coordinate with that implementation.

---

*Ready for implementation.*
