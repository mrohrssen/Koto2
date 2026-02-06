# Triple Branch Merge Spec

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge combat animations and image optimization into master (dual-pool combat).

**Architecture:** Cherry-pick/merge changes from two feature branches into master, resolving two minor conflicts manually.

**Tech Stack:** Git, anime.js, WebP images

---

## Branches

| Branch | Location | Purpose |
|--------|----------|---------|
| `master` | `/Users/michia/Documents/jrpg` | Dual-pool combat (base) |
| `feature/combat-animations` | `/Users/michia/Documents/jrpg-wt-combat-animations` | Visual effects |
| `feature/image-optimization-clean` | `/Users/michia/Documents/jrpg-wt-image-optimization` | PNG→WebP conversion |

## Conflicts

### 1. `public/js/ui/combat-loop.js` (animations vs dual-pool)

**Cause:** Both branches modified `showChipActivationSequence()` differently.

**Resolution:** Keep master's dual-pool math display, add animation imports and effect calls.

**Changes needed:**
- Add import at top (line ~33)
- Add `fireChipEffect()` call in `animateChipActivation()`
- Add `playerHitEffect()` call in `executeEnemyAttackThenPause()`
- Add `updateHpCriticalState()` call after HP updates

### 2. `public/js/ui/chip-select.js` (webp + name order)

**Cause:** Image optimization uses `.webp` + Japanese-first; master uses `.png` + English-first.

**Resolution:** Keep `.webp` extension AND English-first names.

```javascript
// CORRECT (merged):
const skillName = chip.skill?.nameEn || chip.skill?.name || '';
const skillDesc = chip.skill?.descriptionEn || chip.skill?.description || '';
const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.webp`;
```

## Files from Animation Branch

| File | Action | Notes |
|------|--------|-------|
| `public/js/ui/combat-effects.js` | Copy | New file - all effect primitives |
| `public/js/lib/anime.esm.min.js` | Copy | Bundled library |
| `public/game.css` | Append | 74 lines of effect styles |
| `public/game.html` | Edit | Add 2 overlay divs to scene-area |
| `package.json` | Merge | Add anime.js dependency |

## Files from Image Optimization Branch

| File | Action | Notes |
|------|--------|-------|
| `public/assets/**/*.webp` | Copy | 150+ WebP images |
| `public/game.js` | Merge | .png→.webp references |
| `public/js/ui/chip-row.js` | Merge | .png→.webp references |
| `public/js/ui/exploration.js` | Merge | .png→.webp references |
| `public/js/ui/scene.js` | Merge | .png→.webp references |
| `public/manifest.json` | Merge | .png→.webp icon references |
| `src/game/loop.js` | Merge | .png→.webp references |
| `src/game/services/exploration-service.js` | Merge | .png→.webp references |
| `scripts/optimize-images.js` | Copy | Utility script |
| `.gitignore` | Merge | Add sharp cache |

## Merge Strategy

1. Create fresh worktree from master
2. Merge animation branch first (more complex conflict)
3. Merge image optimization branch second (simpler conflict)
4. Run tests to verify
5. Merge result back to master

## CSS Additions (from animation branch)

```css
/* ============ COMBAT EFFECTS ============ */

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
  background: radial-gradient(ellipse at center, transparent 40%, rgba(255, 50, 50, 0.7) 100%);
  opacity: 0;
  pointer-events: none;
  z-index: 100;
}

.combat-particle {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1000;
  will-change: transform, opacity;
}

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

.hit-stop,
.hit-stop * {
  animation-play-state: paused !important;
}

.damage-number.big-hit {
  font-size: 32px;
  color: #f1c40f;
  text-shadow: 0 0 10px rgba(241, 196, 15, 0.8), 2px 2px 4px rgba(0,0,0,0.5);
}

.hp-critical-pulse {
  animation: hp-critical 0.5s ease-in-out infinite;
}

@keyframes hp-critical {
  0%, 100% { box-shadow: 0 0 5px rgba(255, 50, 50, 0.5); }
  50% { box-shadow: 0 0 15px rgba(255, 50, 50, 0.9); }
}

.chip-icon.chip-firing-enhanced {
  filter: brightness(1.5);
  box-shadow: 0 0 20px rgba(52, 152, 219, 0.9);
}
```

## HTML Additions (from animation branch)

Add inside `.scene-area` before `.scene-background`:

```html
<!-- Combat effect overlays -->
<div class="screen-flash-overlay" id="screen-flash-overlay"></div>
<div class="vignette-overlay" id="vignette-overlay"></div>
```

## combat-loop.js Integration Points

### Import (add after line 33)

```javascript
import {
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay
} from './combat-effects.js';
```

### animateChipActivation() - add effect call

After the existing `icon.classList.add('chip-activating')` block, add:

```javascript
// Fire visual effects
const poolEls = {
  power: document.querySelector('[data-pool="power"]'),
  bandwidth: document.querySelector('[data-pool="bandwidth"]')
};
const chipLoadout = getChipLoadoutCache?.()?.equipment?.weapon?.equippedChips;
const chipData = chipLoadout?.[chipIndex] || null;
fireChipEffect(slot, chipData, poolEls);
```

### executeEnemyAttackThenPause() - add player hit effect

After `showEnemyDamageDisplay(ea)` (around line 626), add:

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

## Verification

After merge:
1. `node --check public/js/ui/combat-loop.js` - syntax check
2. `npm run test:unit` - unit tests pass
3. `./scripts/e2e-test.sh` - e2e tests pass (60+/66 acceptable)
4. Manual: Start combat, verify animations fire on chip activation and player damage
