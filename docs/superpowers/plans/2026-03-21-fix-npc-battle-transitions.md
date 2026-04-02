# Fix NPC Battle Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken NPC battle transitions where the NPC flies in, shows no greeting dialogue, and immediately flies out. Make transitions match the spec in `docs/superpowers/specs/2026-03-21-room-transitions-design.md`.

**Architecture:** All fixes are in the existing `room-transition.js` module. Two bugs: (1) NPC sprite flashes at final position before slide animation starts because `showNpcTrainer()` makes element visible before positioning offscreen, (2) greeting narration likely not displaying or being immediately dismissed. Add defensive logging and ensure narration box state is clean before greeting.

**Tech Stack:** anime.js v4 ESM (existing), narration-box module (existing)

**Spec:** `docs/superpowers/specs/2026-03-21-room-transitions-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `public/js/ui/room-transition.js` | Modify | Fix sprite flash + greeting narration in all NPC slide-in paths |

---

### Task 1: Fix NPC sprite flash and greeting narration in `playNpcBattleIntro`

**Files:**
- Modify: `public/js/ui/room-transition.js:210-229`

The `playNpcBattleIntro` function has two bugs:

**Bug 1 — Sprite flash:** `showNpcSpriteFn()` calls `showNpcTrainer()` which adds `.visible` class to `npc-display`, making it appear at its CSS position (center/right of scene) BEFORE `slideFromRight()` can position it offscreen. Fix: pre-position the element offscreen before making it visible.

**Bug 2 — Greeting narration:** The narration box may have stale state from a previous `forceHide()` call or the greeting may not display. Fix: (a) add diagnostic console.log to verify greeting data reaches the client, (b) call `narrationBox.forceHide()` before showing the greeting to ensure clean state, (c) add a small delay after slide-in to let DOM settle before showing narration.

- [ ] **Step 1: Replace the `playNpcBattleIntro` function**

In `public/js/ui/room-transition.js`, replace lines 210-229 (the entire `playNpcBattleIntro` function):

```js
/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Pre-position npc-display offscreen BEFORE making it visible
  // to prevent a flash of the NPC at its final CSS position
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';

  showNpcSpriteFn(npcName, npcData.id, npcData);
  await slideFromRight(npcDisplay);

  // Show greeting narration (click-to-continue)
  console.log('[NpcBattleIntro] npcData.greeting:', npcData.greeting, 'npcName:', npcName);
  if (npcData.greeting) {
    // Clear any stale narration state before showing greeting
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  await slideToRight(npcDisplay);
  hideNpcSpriteFn();
}
```

Key changes:
- Added `npcDisplay.style.transform = 'translateX(100vw)'` BEFORE `showNpcSpriteFn()` — the element starts offscreen so adding `.visible` class doesn't flash it at position 0
- Added `narrationBox.forceHide()` before `narrationBox.show()` — ensures `dismissResolve` is null and no stale click handlers remain
- Added diagnostic `console.log` to verify greeting data

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "fix: NPC battle intro sprite flash and greeting narration not displaying"
```

---

### Task 2: Fix NPC sprite flash in `playRoomTransition` for non-battle NPC rooms

**Files:**
- Modify: `public/js/ui/room-transition.js:147-175`

The same sprite flash bug exists in the `playRoomTransition` function for `friendlyNpc`, `whackAMole`, and `dealer` rooms. The NPC display becomes visible at its CSS position before `slideFromRight` can position it offscreen.

- [ ] **Step 1: Replace the `playRoomTransition` function**

In `public/js/ui/room-transition.js`, replace lines 147-175 (the entire `playRoomTransition` function):

```js
/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 */
export async function playRoomTransition(gameState) {
  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  if (hasCreatures) {
    await bouncePlayerParty(500);
  }

  const roomType = room.type;

  // Pre-position npc-display offscreen before making visible (prevents flash)
  const npcDisplay = document.getElementById('npc-display');

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      await slideFromRight(npcDisplay);
    }
  } else if (roomType === 'whackAMole') {
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showNpcInDisplay('Game Master', '/assets/sprites/npcs/game-master.webp');
    await slideFromRight(npcDisplay);
  } else if (roomType === 'dealer') {
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showDealer();
    await slideFromRight(npcDisplay);
  }
}
```

Key change: Added `npcDisplay.style.transform = 'translateX(100vw)'` before each `show*()` call.

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "fix: NPC sprite flash in room transitions for friendlyNpc, whackAMole, dealer"
```

---

### Task 3: Fix NPC sprite flash in `playNpcSkillAnimation`

**Files:**
- Modify: `public/js/ui/room-transition.js:236-263`

Same flash bug in the mid-combat NPC skill animation.

- [ ] **Step 1: Replace the `playNpcSkillAnimation` function**

In `public/js/ui/room-transition.js`, replace lines 236-263 (the entire `playNpcSkillAnimation` function):

```js
/**
 * Wrap NPC skill activation with slide-in/out animation.
 * Note: showNpcSpriteFn calls showNpcTrainer which destroys enemy formation,
 * so we re-render it after NPC slides out.
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;

  if (enemyFormation) await fadeOut(enemyFormation);

  if (npcData && showNpcSpriteFn) {
    // Pre-position offscreen before making visible
    const npcDisplay = document.getElementById('npc-display');
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showNpcSpriteFn(npcName, npcData.id, npcData);
    await slideFromRight(npcDisplay);
  }

  await skillCallback();

  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay) await slideToRight(npcDisplay);
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  if (enemies?.length) {
    showFormation('enemy', enemies);
  }

  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) {
    freshFormation.style.opacity = '0';
    await fadeIn(freshFormation);
  }
}
```

Key change: Added offscreen pre-positioning before `showNpcSpriteFn()`.

- [ ] **Step 2: Verify syntax**

Run: `node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "fix: NPC sprite flash in mid-combat NPC skill animation"
```

---

### Task 4: Verify fix with dev server

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Wait 3s, then verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: 200

- [ ] **Step 2: Check browser console for diagnostic output**

Open the game in browser, navigate to an NPC battle room (rooms 5, 11, 17, or 23 in a run). Check the browser console for:
```
[NpcBattleIntro] npcData.greeting: こんにちわ! npcName: Child
```

If `npcData.greeting` is `undefined`, the bug is in the server data pipeline. If it's present, the `narrationBox.forceHide()` fix should resolve the narration display issue.

- [ ] **Step 3: Remove diagnostic logging once confirmed**

After confirming the fix works, remove the `console.log` line from `playNpcBattleIntro`:

```js
// Remove this line:
console.log('[NpcBattleIntro] npcData.greeting:', npcData.greeting, 'npcName:', npcName);
```

- [ ] **Step 4: Final commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "fix: remove diagnostic logging from NPC battle intro"
```
