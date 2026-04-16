# Game Master Tile Flip Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After tapping a whack-a-mole tile, stamp a checkmark/X icon and immediately flip it face-down so the board stays dynamic.

**Architecture:** Two-file change. CSS adds a result icon overlay with a scale-in + fade-out animation. JS rewrites `_handleTileTap()` to show the icon, flip the tile down, then clean up. No server changes.

**Tech Stack:** CSS keyframes, anime.js (existing), DOM overlays

---

## Chunk 1: Implementation

### Task 1: Add CSS for result icon overlay

**Files:**
- Modify: `public/game.css:4222` (after the `.wam-plus-one` / `wam-float-up` block)

- [ ] **Step 1: Add result icon styles**

Insert after the `@keyframes wam-float-up` block (line ~4222):

```css
/* Result icon (correct/incorrect) — overlays tile during flip-down */
.wam-result-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  font-size: 1.5rem;
  font-weight: var(--font-weight-bold);
  pointer-events: none;
  z-index: 10;
  animation: wam-icon-pop 0.25s ease-out forwards;
}
.wam-result-icon.correct { color: #4caf50; }
.wam-result-icon.incorrect { color: #ef5350; }

@keyframes wam-icon-pop {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
  40% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
```

- [ ] **Step 2: Commit CSS**

```bash
git add public/game.css
git commit -m "style: add wam result icon overlay for tile tap feedback"
```

---

### Task 2: Rewrite `_handleTileTap()` to flip tiles down with icon feedback

**Files:**
- Modify: `public/js/ui/whack-a-mole.js:248-300`

The current `_handleTileTap()` keeps tiles face-up after tapping. Replace it so that:
- A result icon (checkmark/X) is stamped onto the tile
- The tile flips face-down immediately via `_setTileFaceDown()`
- The +1 float-up is preserved for correct hits
- The time penalty is preserved for incorrect hits
- The icon element is cleaned up after its animation ends

- [ ] **Step 1: Add `_showResultIcon` helper method**

Add this new method to the `WhackAMoleGame` class, right before `_handleTileTap` (around line 247):

```js
_showResultIcon(tileEl, isCorrect) {
  const icon = document.createElement('div');
  icon.className = `wam-result-icon ${isCorrect ? 'correct' : 'incorrect'}`;
  icon.textContent = isCorrect ? '\u2713' : '\u2717';
  tileEl.appendChild(icon);
  icon.addEventListener('animationend', () => icon.remove());
}
```

- [ ] **Step 2: Rewrite `_handleTileTap` method**

Replace the entire `_handleTileTap` method (lines 248-300) with:

```js
_handleTileTap(index) {
  if (this.gameOver) return;
  const tile = this.tiles[index];
  if (!tile.faceUp) return;

  const tileEl = document.querySelector(`.wam-tile[data-index="${index}"]`);

  if (this._isCorrectTile(index)) {
    this.score++;
    this._updateScoreDisplay();

    if (tileEl) {
      this._showResultIcon(tileEl, true);
      const plus = document.createElement('div');
      plus.className = 'wam-plus-one';
      plus.textContent = '+1';
      tileEl.appendChild(plus);
      plus.addEventListener('animationend', () => plus.remove());
    }

    this._setTileFaceDown(index);
    this._advanceToNextWord();
    try { this.playSFX('correct'); } catch (e) { /* sfx optional */ }
  } else {
    this.timeLeft = Math.max(0, this.timeLeft - 3);
    this._updateTimerDisplay();

    if (tileEl) {
      this._showResultIcon(tileEl, false);
    }

    this._setTileFaceDown(index);
    this._ensureCorrectTileVisible();
    try { this.playSFX('wrong'); } catch (e) { /* sfx optional */ }

    if (this.timeLeft <= 0) this._endGame();
  }
}
```

Key changes from current code:
- **Correct hit:** No more `anime()` scale+rotate that kept tile face-up. Icon + `_setTileFaceDown()` instead. `+1` cleanup uses `animationend` instead of anime.js `onComplete`. `_advanceToNextWord()` handles ensuring the new target is visible.
- **Incorrect hit:** No more `anime()` shake that kept tile face-up. Icon + `_setTileFaceDown()` instead. `_ensureCorrectTileVisible()` called after flip-down to maintain board density — without this, rapid incorrect taps could drain the board faster than the 1-2s flip scheduler can recover.
- **Both:** `_setTileFaceDown()` called immediately — the CSS transition on `.wam-tile-inner` (0.3s) handles the visual 3D flip. The icon sits on `.wam-tile` (not `.wam-tile-inner`), so it stays visible as the inner part rotates.

- [ ] **Step 3: Syntax check**

Run: `node --check public/js/ui/whack-a-mole.js && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit JS**

```bash
git add public/js/ui/whack-a-mole.js
git commit -m "feat: flip tiles face-down after tap with correct/incorrect icon"
```

---

### Task 3: Remove dead CSS from old tile-tap animations

**Files:**
- Modify: `public/game.css:4179-4203`

The new `_handleTileTap` no longer adds `wam-hit` or `wam-miss` classes. Remove the dead rules.

- [ ] **Step 1: Delete dead CSS**

Remove these blocks (lines 4179-4203):
- `.wam-hit` (z-index)
- `.wam-hit .wam-tile-back` (gold glow border)
- `.wam-miss .wam-tile-inner` (shake animation)
- `.wam-miss .wam-tile-back` (red border)
- `@keyframes wam-shake`

- [ ] **Step 2: Commit**

```bash
git add public/game.css
git commit -m "chore: remove dead wam-hit/wam-miss CSS (replaced by result icon)"
```

---

### Task 4: Run tests and verify

- [ ] **Step 1: Run existing tests**

Run: `npm test`
Expected: All tests pass (changes are client-side only, server tests unaffected)
