# Triple Branch Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge combat animations and image optimization branches into master (dual-pool combat system).

**Architecture:** Create a fresh merge worktree, sequentially merge both feature branches, resolve two conflicts manually, verify with tests.

**Tech Stack:** Git worktrees, anime.js, WebP images

---

## Pre-Flight

**Branches to merge:**
- `master` at `/Users/michia/Documents/jrpg` - dual-pool combat (base)
- `feature/combat-animations` at `/Users/michia/Documents/jrpg-wt-combat-animations`
- `feature/image-optimization-clean` at `/Users/michia/Documents/jrpg-wt-image-optimization`

**Conflicts to resolve:**
1. `public/js/ui/combat-loop.js` - keep dual-pool math, add animation effects
2. `public/js/ui/chip-select.js` - keep English-first names, use .webp extension

---

### Task 1: Create Merge Worktree

**Files:**
- Create: worktree at `/Users/michia/Documents/jrpg-wt-triple-merge`

**Step 1: Create worktree from master**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git worktree add ../jrpg-wt-triple-merge -b feature/triple-merge
```

**Step 2: Verify worktree created**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
/usr/bin/git branch --show-current
```

Expected: `feature/triple-merge`

**Step 3: Install dependencies**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
npm install
```

---

### Task 2: Merge Animation Branch

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Attempt merge**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
/usr/bin/git merge feature/combat-animations --no-edit
```

Expected: Conflict in `public/js/ui/combat-loop.js`

**Step 2: Check conflict markers**

```bash
grep -n "<<<<<<" public/js/ui/combat-loop.js
```

Expected: Shows line numbers with conflict markers

---

### Task 3: Resolve combat-loop.js Conflict

**Files:**
- Modify: `public/js/ui/combat-loop.js:31-40` (imports)
- Modify: `public/js/ui/combat-loop.js:327-344` (animateChipActivation)
- Modify: `public/js/ui/combat-loop.js:610-650` (executeEnemyAttackThenPause)

**Step 1: Open file and locate conflicts**

The conflict is in `showChipActivationSequence()`. We keep master's version (dual-pool math display) and only add the animation integration points.

**Step 2: Add animation imports after line 33**

Find this line:
```javascript
import { logger } from '../logger.js';
```

Add immediately after:
```javascript
import {
  fireChipEffect,
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay
} from './combat-effects.js';
```

**Step 3: Update animateChipActivation function**

Find the `animateChipActivation` function (around line 327). Replace the entire function with:

```javascript
/**
 * Animate a chip circle when its effect activates
 * @param {number} chipIndex - Index of the chip slot to animate
 */
function animateChipActivation(chipIndex) {
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
    const chipLoadout = getChipLoadoutCache?.()?.equipment?.weapon?.equippedChips;
    const chipData = chipLoadout?.[chipIndex] || null;
    fireChipEffect(slot, chipData, poolEls);
  }
}
```

**Step 4: Add player hit effects in executeEnemyAttackThenPause**

Find `executeEnemyAttackThenPause` function. Locate this block (around line 625):

```javascript
      // Show enemy damage in action area (big red text)
      showEnemyDamageDisplay(ea);
    }

    // Update HP bars
```

Add after `showEnemyDamageDisplay(ea);` and before the closing brace:

```javascript
      // Visual effects for player damage
      if (!ea.perfectDodge && !ea.dodged && !ea.miss) {
        const playerHpBar = document.getElementById('player-hp-fill');
        const chipRow = document.getElementById('chip-row');
        await playerHitEffect(ea.damage, playerHpBar, chipRow);
      }
```

**Step 5: Add critical HP check after HP bar updates**

Find this block in `executeEnemyAttackThenPause` (around line 630):

```javascript
    // Update HP bars
    characterUI.updateEnemyHPBar(result.enemyHp);
    characterUI.updatePlayerHPBar(result.playerHp);
```

Add immediately after:

```javascript
    // Check for critical HP state
    const gameState = getGameState();
    if (gameState?.player) {
      const playerHpBar = document.getElementById('player-hp-fill');
      updateHpCriticalState(playerHpBar, gameState.player.hp, gameState.player.maxHp);
    }
```

**Step 6: Remove conflict markers**

Search for and remove any remaining `<<<<<<<`, `=======`, `>>>>>>>` markers.

**Step 7: Verify syntax**

```bash
node --check public/js/ui/combat-loop.js && echo "Syntax OK"
```

Expected: `Syntax OK`

**Step 8: Stage resolved file**

```bash
/usr/bin/git add public/js/ui/combat-loop.js
```

---

### Task 4: Complete Animation Merge

**Step 1: Verify all conflicts resolved**

```bash
/usr/bin/git diff --name-only --diff-filter=U
```

Expected: No output (no unmerged files)

**Step 2: Complete the merge**

```bash
/usr/bin/git commit -m "Merge feature/combat-animations into feature/triple-merge

- Add anime.js visual effects library
- Add combat-effects.js with screen shake, particles, hit stop
- Integrate effects into combat-loop.js
- Keep dual-pool math display from master"
```

**Step 3: Verify animation files present**

```bash
ls -la public/js/ui/combat-effects.js public/js/lib/anime.esm.min.js
```

Expected: Both files exist

---

### Task 5: Merge Image Optimization Branch

**Step 1: Attempt merge**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
/usr/bin/git merge feature/image-optimization-clean --no-edit
```

Expected: Conflict in `public/js/ui/chip-select.js`

**Step 2: Check conflict**

```bash
grep -n "<<<<<<" public/js/ui/chip-select.js
```

---

### Task 6: Resolve chip-select.js Conflict

**Files:**
- Modify: `public/js/ui/chip-select.js:64-72`

**Step 1: Locate the conflict**

The conflict is in `renderChipCard()` function around line 67. It looks like:

```javascript
<<<<<<< HEAD
  const skillName = chip.skill?.nameEn || chip.skill?.name || '';
  const skillDesc = chip.skill?.descriptionEn || chip.skill?.description || '';
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.png`;
=======
  const skillName = chip.skill?.name || chip.skill?.nameEn || '';
  const skillDesc = chip.skill?.description || chip.skill?.descriptionEn || '';
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.webp`;
>>>>>>> feature/image-optimization-clean
```

**Step 2: Replace with merged version**

Keep English-first names (from HEAD/master) but use .webp extension (from image-optimization):

```javascript
  const skillName = chip.skill?.nameEn || chip.skill?.name || '';
  const skillDesc = chip.skill?.descriptionEn || chip.skill?.description || '';
  const iconPath = `/assets/icons/chips/${chip.itemId || chip.id}.webp`;
```

**Step 3: Verify syntax**

```bash
node --check public/js/ui/chip-select.js && echo "Syntax OK"
```

Expected: `Syntax OK`

**Step 4: Stage resolved file**

```bash
/usr/bin/git add public/js/ui/chip-select.js
```

---

### Task 7: Complete Image Optimization Merge

**Step 1: Verify all conflicts resolved**

```bash
/usr/bin/git diff --name-only --diff-filter=U
```

Expected: No output

**Step 2: Complete the merge**

```bash
/usr/bin/git commit -m "Merge feature/image-optimization-clean into feature/triple-merge

- Convert all PNG images to WebP format (~60% size reduction)
- Update all image references to use .webp extension
- Keep English-first name display from master"
```

**Step 3: Verify WebP images present**

```bash
ls public/assets/backgrounds/*.webp | wc -l
```

Expected: ~50+ files

---

### Task 8: Run Unit Tests

**Step 1: Run unit tests**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
npm run test:unit
```

Expected: 150+ tests pass

**Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: 14 tests pass

---

### Task 9: Run E2E Tests

**Step 1: Run e2e test suite**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
./scripts/e2e-test.sh
```

Expected: 60+/66 tests pass (known flakiness acceptable)

**Step 2: If tests fail, check for syntax errors first**

```bash
node --check public/js/ui/combat-loop.js
node --check public/js/ui/chip-select.js
node --check public/js/ui/combat-effects.js
```

---

### Task 10: Manual Verification

**Step 1: Start dev server**

```bash
cd /Users/michia/Documents/jrpg-wt-triple-merge
npm run dev
```

**Step 2: Open game in browser**

Navigate to `http://localhost:3000`

**Step 3: Verify animations work**

1. Start a combat encounter
2. Review a word to trigger player attack
3. Watch for: chip icon pop, particles, screen flash when chips fire
4. Take damage from enemy
5. Watch for: screen shake, red vignette, HP bar flash
6. If HP drops below 25%, verify HP bar pulses red

**Step 4: Verify images load**

1. Check browser Network tab for .webp requests
2. Verify no 404s for image files
3. Check enemy sprites, backgrounds, chip icons all display

---

### Task 11: Merge to Master

**Step 1: Go to main repo**

```bash
cd /Users/michia/Documents/jrpg
```

**Step 2: Ensure master is up to date**

```bash
/usr/bin/git checkout master
/usr/bin/git pull origin master
```

**Step 3: Merge the feature branch**

```bash
/usr/bin/git merge feature/triple-merge -m "Merge feature/triple-merge: animations + image optimization

- Combat animations with anime.js (screen shake, particles, hit stop)
- All images converted to WebP format
- Both integrated with dual-pool combat system"
```

**Step 4: Push to origin**

```bash
/usr/bin/git push origin master
```

---

### Task 12: Cleanup Worktrees

**Step 1: Remove merge worktree**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git worktree remove ../jrpg-wt-triple-merge
/usr/bin/git branch -d feature/triple-merge
```

**Step 2: Remove animation worktree**

```bash
/usr/bin/git worktree remove ../jrpg-wt-combat-animations
/usr/bin/git branch -d feature/combat-animations
```

**Step 3: Remove image optimization worktree**

```bash
/usr/bin/git worktree remove ../jrpg-wt-image-optimization
/usr/bin/git branch -d feature/image-optimization-clean
```

**Step 4: Verify cleanup**

```bash
/usr/bin/git worktree list
```

Expected: Only main repo listed

---

## Rollback

If something goes wrong after merging to master:

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git log --oneline -5  # Find the commit before merge
/usr/bin/git reset --hard <commit-before-merge>
/usr/bin/git push origin master --force-with-lease
```
