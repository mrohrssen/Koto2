# Room Transition Animations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add animated room transitions where player creatures bounce, NPCs slide in from the right, and enemy creatures enter one-by-one with TTS name announcements.

**Architecture:** New `room-transition.js` module with 3 reusable animation primitives (bounce, slide, fade) composed by an orchestrator function. Integrates at two points: exploration.js (between apiProceed and updateUI) for the bounce + NPC slide, and game.js startEncounter() for enemy creature entrances.

**Tech Stack:** anime.js v4 ESM (existing), VOICEVOX TTS (existing), CSS utility class

**Spec:** `docs/superpowers/specs/2026-03-21-room-transitions-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `public/js/ui/room-transition.js` | Create | Animation primitives + orchestrator |
| `public/game.css` | Modify | Add `.off-right` utility class |
| `public/js/ui/scene.js` | Modify | Export `showNpcInDisplay` |
| `src/game/loop.js` | Modify | Enrich npcData with greeting/speakerId |
| `src/game/services/exploration-service.js` | Modify | Assign area NPC to friendlyNpc rooms |
| `public/js/ui/exploration.js` | Modify | Insert transition between apiProceed → updateUI |
| `public/game.js` | Modify | Update `updateScene()` for NPC phases + modify `startEncounter()` for creature entrance animations + autoProceed |
| `public/js/ui/combat-loop.js` | Modify | Wrap NPC skill phase with slide-in/out animation |

---

### Task 1: Create animation primitives module

**Files:**
- Create: `public/js/ui/room-transition.js`

- [ ] **Step 1: Create the module with anime.js import and bouncePlayerParty**

Note: anime.js v4's `animate()` return value is not reliably controllable with `.pause()` in this codebase. Use the same fire-and-forget + setTimeout cleanup pattern as `screenShake()` in `combat-effects.js`.

```js
// public/js/ui/room-transition.js
import { animate as anime } from '../lib/anime.esm.min.js';

/**
 * Bounce player formation slots in place.
 * Resolves after the given duration.
 */
export function bouncePlayerParty(duration = 500) {
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  if (!slots.length) return Promise.resolve();

  // Fire-and-forget looping bounce
  anime(slots, {
    translateY: [0, -8, 0],
  }, {
    duration: 300,
    loop: true,
    ease: 'inOutSine',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      // Reset transform (same pattern as screenShake cleanup)
      slots.forEach(s => s.style.transform = '');
      resolve();
    }, duration);
  });
}
```

- [ ] **Step 2: Add slideFromRight and slideToRight**

```js
/**
 * Slide an element in from off-screen right.
 * Sets initial position off-screen, then animates to translateX(0).
 */
export function slideFromRight(element, duration = 400) {
  if (!element) return Promise.resolve();
  element.style.transform = 'translateX(100vw)';
  element.style.opacity = '1';

  return new Promise(resolve => {
    anime(element, {
      translateX: [window.innerWidth, 0],
    }, {
      duration,
      ease: 'outBack',
      onComplete: () => {
        element.style.transform = '';
        resolve();
      }
    });
  });
}

/**
 * Slide an element out to off-screen right.
 */
export function slideToRight(element, duration = 300) {
  if (!element) return Promise.resolve();

  return new Promise(resolve => {
    anime(element, {
      translateX: [0, window.innerWidth],
    }, {
      duration,
      ease: 'inQuad',
      onComplete: () => {
        element.style.transform = 'translateX(100vw)';
        resolve();
      }
    });
  });
}
```

- [ ] **Step 3: Add fadeIn and fadeOut**

```js
/**
 * Fade an element in (opacity 0 → 1).
 */
export function fadeIn(element, duration = 300) {
  if (!element) return Promise.resolve();
  element.style.opacity = '0';

  return new Promise(resolve => {
    anime(element, {
      opacity: [0, 1],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: resolve
    });
  });
}

/**
 * Fade an element out (opacity 1 → 0).
 */
export function fadeOut(element, duration = 300) {
  if (!element) return Promise.resolve();

  return new Promise(resolve => {
    anime(element, {
      opacity: [1, 0],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: resolve
    });
  });
}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "feat: add room-transition.js with animation primitives (bounce, slide, fade)"
```

---

### Task 2: Add CSS utility class and export showNpcInDisplay

**Files:**
- Modify: `public/game.css`
- Modify: `public/js/ui/scene.js:282`

- [ ] **Step 1: Add .off-right class to game.css**

Add near the existing `@keyframes` blocks:

```css
/* Room transition: initial off-screen-right positioning */
.off-right {
  transform: translateX(100vw);
}
```

- [ ] **Step 2: Export showNpcInDisplay from scene.js**

In `public/js/ui/scene.js` at line 282, change:
```js
// BEFORE:
function showNpcInDisplay(name, spritePath) {
// AFTER:
export function showNpcInDisplay(name, spritePath) {
```

- [ ] **Step 3: Verify syntax**

Run: `node --check public/js/ui/scene.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add public/game.css public/js/ui/scene.js
git commit -m "feat: add .off-right CSS utility, export showNpcInDisplay from scene.js"
```

---

### Task 3: Enrich NPC data on server side

**Files:**
- Modify: `src/game/loop.js:590`

The server currently only sends `{ id, name, nameEn }` in `npcData`. The client needs `greeting` and `speakerId` for the NPC battle intro transition.

- [ ] **Step 1: Enrich npcData in startCreatureEncounter()**

In `src/game/loop.js` at line 590, change:

```js
// BEFORE:
        this.combat.npcData = { id: npc.id, name: npc.name, nameEn: npc.nameEn };

// AFTER:
        this.combat.npcData = {
          id: npc.id, name: npc.name, nameEn: npc.nameEn,
          greeting: npc.greeting, speakerId: npc.speakerId
        };
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/game/loop.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add src/game/loop.js
git commit -m "feat: include greeting and speakerId in npcData sent to client"
```

---

### Task 4: Assign area NPCs to friendlyNpc rooms

**Files:**
- Modify: `src/game/services/exploration-service.js`

FriendlyNpc rooms need an NPC from the area pool for the transition animation. Assign at room entry time (when player advances to the room) so the NPC data flows to the client via game state.

- [ ] **Step 1: Read exploration-service.js to find the proceed/advance handler**

Read `src/game/services/exploration-service.js` and find the method that advances the player to the next room (likely `proceedToNextRoom` or similar around line 239). Find where `emitState()` is called after advancing.

- [ ] **Step 2: Add NPC assignment for friendlyNpc rooms**

After the room is determined but before `emitState()`, add:

```js
// Assign area NPC to friendlyNpc rooms for transition display
if (room.type === 'friendlyNpc' && !room.npc) {
  const { loadNpcs } = await import('./npc-service.js');
  const npcs = loadNpcs();
  const areaId = this.gm.run.currentArea?.id || null;
  const areaNpcs = Object.values(npcs).filter(n => !areaId || n.area === areaId || !n.area);
  if (areaNpcs.length > 0) {
    const picked = areaNpcs[Math.floor(Math.random() * areaNpcs.length)];
    room.npc = { id: picked.id, name: picked.name, nameEn: picked.nameEn };
  }
}
```

Note: `loadNpcs()` is synchronous (cached) — check the import style used elsewhere in the file. If `npc-service.js` is already imported, use the existing import.

- [ ] **Step 3: Verify syntax**

Run: `node --check src/game/services/exploration-service.js && echo "OK"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "feat: assign area NPC to friendlyNpc rooms for transition display"
```

---

### Task 5: Add room transition orchestrator

**Files:**
- Modify: `public/js/ui/room-transition.js`

- [ ] **Step 1: Add imports and the playRoomTransition orchestrator**

Add these imports and the orchestrator function. This handles bounce + NPC slide-in for non-encounter NPC rooms. Encounter rooms handle their own creature entrance in `startEncounter()`.

```js
import { showNpcTrainer, showNpcInDisplay, showDealer } from './scene.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst } from './bootstrap-client.js';

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 *
 * @param {object} gameState - The updated game state after apiProceed()
 */
export async function playRoomTransition(gameState) {
  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  // Bounce player party (skip in prologue)
  if (hasCreatures) {
    await bouncePlayerParty(500);
  }

  const roomType = room.type;

  // NPC slide-in for non-combat NPC rooms
  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      const npcDisplay = document.getElementById('npc-display');
      await slideFromRight(npcDisplay);
    }
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', '/assets/sprites/npcs/game-master.webp');
    const npcDisplay = document.getElementById('npc-display');
    await slideFromRight(npcDisplay);
  } else if (roomType === 'dealer') {
    showDealer();
    const npcDisplay = document.getElementById('npc-display');
    await slideFromRight(npcDisplay);
  }
  // encounter/boss/npcBattle: creature entrance handled by startEncounter()
  // speedReviewRoom/wordDiscovery: bounce only, no NPC
}
```

- [ ] **Step 2: Add enterEnemiesOneByOne**

Uses `speakText()` (not `playWord()`) for TTS since creature names aren't pre-cached. `speakText()` does live synthesis and auto-plays.

```js
/**
 * Animate enemy creatures entering one-by-one from the right.
 * Call AFTER showFormation('enemy', enemies) has rendered the slots.
 * Each creature slides in and announces its name via TTS.
 *
 * @param {Array} enemies - Array of enemy creature objects
 */
export async function enterEnemiesOneByOne(enemies) {
  const formation = document.getElementById('enemy-formation');
  if (!formation) return;

  const slots = formation.querySelectorAll('.formation-slot');
  if (!slots.length) return;

  // Position all slots off-screen immediately (before browser paint)
  slots.forEach(slot => {
    slot.style.transform = 'translateX(100vw)';
  });

  // Animate each slot in sequentially
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const creature = enemies[i];

    await slideFromRight(slot, 400);

    // TTS: announce creature name (fire-and-forget, auto-plays)
    if (creature) {
      speakText(creature.baseReading || creature.baseWord || creature.name);
    }

    // Stagger delay before next creature (skip after last)
    if (i < slots.length - 1) {
      await new Promise(r => setTimeout(r, 700));
    }
  }

  // Brief settle
  await new Promise(r => setTimeout(r, 200));
}
```

- [ ] **Step 3: Add playNpcBattleIntro**

Uses `speakText()` for TTS (auto-plays, no cache needed). Uses `renderEnFirst` + `html: true` for proper i18n rendering in the narration box.

```js
/**
 * Play the NPC battle intro: NPC slides in, says greeting, slides out.
 * Called from startEncounter() in game.js before creature entrance.
 *
 * @param {object} npcData - NPC data with id, name, nameEn, greeting, speakerId
 * @param {function} showNpcSpriteFn - scene.showNpcTrainer callback
 * @param {function} hideNpcSpriteFn - scene.hideNpcTrainer callback
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Show NPC sprite and slide in
  showNpcSpriteFn(npcName, npcData.id, npcData);
  const npcDisplay = document.getElementById('npc-display');
  await slideFromRight(npcDisplay);

  // Show greeting in narration box + TTS (click-to-continue)
  if (npcData.greeting) {
    // Fire-and-forget TTS
    speakText(npcData.greeting);
    // Narration with i18n rendering
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  // Slide NPC out
  await slideToRight(npcDisplay);
  hideNpcSpriteFn();
}
```

- [ ] **Step 4: Add playNpcSkillAnimation**

Note: `showNpcSpriteFn` calls `scene.showNpcTrainer` which internally calls `hideFormation('enemy')`, destroying enemy formation DOM nodes. After the NPC slides out, we must re-render the enemy formation before fading it back in.

```js
import { showFormation } from './scene.js';

/**
 * Wrap NPC skill activation with slide-in/out animation.
 * Fades enemies out, slides NPC in, runs skill callback, slides NPC out,
 * re-renders enemies, fades them back in.
 *
 * @param {object} npcData - NPC data object
 * @param {function} showNpcSpriteFn - scene.showNpcTrainer callback
 * @param {function} hideNpcSpriteFn - scene.hideNpcTrainer callback
 * @param {function} skillCallback - async function that runs the actual skill effects
 * @param {Array} enemies - current enemy creatures for re-rendering formation
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;

  // Fade out enemies
  if (enemyFormation) await fadeOut(enemyFormation);

  // Slide NPC in (this destroys enemy formation DOM via hideFormation)
  if (npcData && showNpcSpriteFn) {
    showNpcSpriteFn(npcName, npcData.id, npcData);
    const npcDisplay = document.getElementById('npc-display');
    await slideFromRight(npcDisplay);
  }

  // Run the actual skill effects
  await skillCallback();

  // Slide NPC out
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay) await slideToRight(npcDisplay);
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  // Re-render enemy formation (was destroyed by showNpcTrainer's hideFormation call)
  if (enemies?.length) {
    showFormation('enemy', enemies);
  }

  // Fade enemies back in
  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) {
    freshFormation.style.opacity = '0';
    await fadeIn(freshFormation);
  }
}
```

- [ ] **Step 5: Verify syntax**

Run: `node --check public/js/ui/room-transition.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/room-transition.js
git commit -m "feat: add room transition orchestrator, enemy entrance, NPC battle intro, and NPC skill animation"
```

---

### Task 6: Update updateScene() to preserve NPC sprites

**Files:**
- Modify: `public/game.js:307-332`

- [ ] **Step 1: Add friendlyNpc and whackAMole cases to updateScene()**

In `updateScene()` (line 307), add cases before the `else` fallthrough. Note: `game.js` imports scene as `import * as scene from './js/ui/scene.js'`, so `scene.showNpcInDisplay()` works once exported.

```js
// BEFORE (lines 328-332):
  } else if (gameState.phase === 'dealer') {
    scene.showDealer();
  } else {
    scene.hideEnemies();
  }

// AFTER:
  } else if (gameState.phase === 'dealer') {
    scene.showDealer();
  } else if (gameState.phase === 'friendlyNpc') {
    // Preserve NPC sprite placed by room transition
    const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
    const npc = room?.npc;
    if (npc) {
      scene.showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
    }
  } else if (gameState.phase === 'whackAMole') {
    scene.showNpcInDisplay('Game Master', '/assets/sprites/npcs/game-master.webp');
  } else {
    scene.hideEnemies();
  }
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat: updateScene() preserves NPC sprites for friendlyNpc and whackAMole phases"
```

---

### Task 7: Integrate bounce transition into exploration.js

**Files:**
- Modify: `public/js/ui/exploration.js`

- [ ] **Step 1: Import playRoomTransition at top of exploration.js**

Add with the other imports (near line 30):

```js
import { playRoomTransition } from './room-transition.js';
```

- [ ] **Step 2: Modify the main proceed button handler (~line 449-455)**

```js
// BEFORE:
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });

// AFTER:
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      await playRoomTransition(result.state);
      updateUI();
    }
  });
```

- [ ] **Step 3: Modify all other apiProceed() call sites**

Apply the same pattern to every other `apiProceed()` call site in exploration.js. Search for `apiProceed()` and at each site, insert `await playRoomTransition(result.state);` between `updateGameState` and `updateUI`. The affected sites are approximately:

- Line ~510 (shrine skip proceed)
- Line ~586 (quiz auto-proceed)
- Line ~632 (word discovery proceed)

Each follows the same pattern:
```js
// BEFORE:
if (result?.state) { updateGameState(result.state); updateUI(); }
// AFTER:
if (result?.state) { updateGameState(result.state); await playRoomTransition(result.state); updateUI(); }
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/js/ui/exploration.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: integrate bounce transition into exploration proceed flow"
```

---

### Task 8: Integrate creature entrance into startEncounter()

**Files:**
- Modify: `public/game.js:897-932`

- [ ] **Step 1: Import transition functions in game.js**

Add with the other imports at the top of game.js:

```js
import { enterEnemiesOneByOne, playNpcBattleIntro, playRoomTransition } from './js/ui/room-transition.js';
```

- [ ] **Step 2: Modify startEncounter() to add creature entrance animation**

Replace the existing `startEncounter()` function (lines 897-932). Key changes:
1. For NPC battles: play NPC intro (slide in → greeting → slide out) BEFORE `updateUI()` renders combat
2. After `updateUI()` renders enemy formation, hide formation immediately, then animate enemies in one-by-one
3. Remove the existing `combatLoopUI.showNpcGreeting()` call (replaced by `playNpcBattleIntro`)

```js
async function startEncounter() {
  if (encounterStarting) return;
  encounterStarting = true;
  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;

  let result;
  if (hasCreatures) {
    result = await apiStartCreatureEncounter();
  } else if (gameState.phase === 'room_encounter') {
    result = await apiRoomEncounter();
  } else {
    result = await apiStartEncounter();
  }

  encounterStarting = false;
  if (result?.state) {
    updateGameState(result.state);

    // For NPC battles: play NPC intro before rendering combat
    if (result?.npc && hasCreatures) {
      await playNpcBattleIntro(
        result.npc,
        (name, id, npc) => scene.showNpcTrainer(name, id, npc),
        () => scene.hideNpcTrainer()
      );
    }

    // For creature encounters: hide enemy formation before updateUI
    // to prevent a visual flash of enemies at final positions
    if (hasCreatures && gameState.combat?.enemies?.length) {
      const ef = document.getElementById('enemy-formation');
      if (ef) ef.style.visibility = 'hidden';
    }

    updateUI(); // This renders enemy formation via updateScene()

    // Non-creature encounters: show possessed dialogue (legacy path)
    if (!hasCreatures) {
      const enemy = gameState.combat?.enemy;
      if (result?.dialogue || enemy?.dialogue?.possessed) {
        const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
          ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
          : enemy.dialogue.possessed);
        await showEnemyDialogue(text, 'possessed');
      }
    }

    // Creature encounters: animate enemies entering one-by-one
    if (hasCreatures && gameState.combat?.enemies?.length) {
      const ef = document.getElementById('enemy-formation');
      if (ef) ef.style.visibility = 'visible';
      await enterEnemiesOneByOne(gameState.combat.enemies);
    }

    await delay(300);
    startCombatLoop();
  }
}
```

- [ ] **Step 3: Also modify autoProceed() in the same file (~line 457)**

```js
// BEFORE:
async function autoProceed() {
  if (autoProceedInFlight) return;
  autoProceedInFlight = true;
  try {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  } finally {
    autoProceedInFlight = false;
  }
}

// AFTER:
async function autoProceed() {
  if (autoProceedInFlight) return;
  autoProceedInFlight = true;
  try {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      await playRoomTransition(result.state);
      updateUI();
    }
  } finally {
    autoProceedInFlight = false;
  }
}
```

- [ ] **Step 4: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

- [ ] **Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: animate enemy creature entrance and NPC battle intro in startEncounter(), add transition to autoProceed()"
```

---

### Task 9: Integrate NPC skill animation into combat-loop

**Files:**
- Modify: `public/js/ui/combat-loop.js`

- [ ] **Step 1: Import playNpcSkillAnimation at top of combat-loop.js**

Add with the other imports (near line 27):

```js
import { playNpcSkillAnimation } from './room-transition.js';
```

- [ ] **Step 2: Add getCombatNpcData and getCombatEnemies helper functions**

Add near the other helper functions in combat-loop.js:

```js
/** Get NPC data from current combat state */
function getCombatNpcData() {
  const state = getGameState();
  return state?.combat?.npcData || null;
}

/** Get current enemy creatures for re-rendering after NPC skill animation */
function getCombatEnemies() {
  const state = getGameState();
  return state?.combat?.enemies || [];
}
```

- [ ] **Step 3: Wrap first NPC skill phase block (~line 1691-1696)**

```js
// BEFORE:
      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcAllyHpMap = buildAllyHpMap(result);
        await delay(400);
        await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
      }

// AFTER:
      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcAllyHpMap = buildAllyHpMap(result);
        const npcData = getCombatNpcData();
        if (npcData) {
          await playNpcSkillAnimation(npcData, showNpcSprite, hideNpcSprite, async () => {
            await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
          }, getCombatEnemies());
        } else {
          await delay(400);
          await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
        }
      }
```

- [ ] **Step 4: Apply the same wrapping to second NPC skill phase block (~line 1846-1851)**

Same change as step 3, applied to the second identical block.

- [ ] **Step 5: Verify syntax**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: wrap NPC skill phase with slide-in/out animation"
```

---

### Task 10: Manual playtest and polish

**Files:**
- May modify: `public/js/ui/room-transition.js` (timing tweaks)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test regular encounter transition**

Play through to an encounter room. Verify:
- Player creatures bounce for ~0.5s
- Enemy creatures slide in one-by-one from the right (no flash of enemies at final positions)
- TTS announces each creature name via `speakText()`
- Combat starts normally after entrance completes

- [ ] **Step 3: Test NPC battle transition**

Advance to an npcBattle room (indices 5, 11, 17, 23). Verify:
- Player creatures bounce
- NPC slides in from right
- Greeting shows in narration box (with i18n rendering) + TTS plays
- Click to continue dismisses greeting
- NPC slides back out to right
- Enemy creatures bounce in one-by-one with TTS
- Combat starts normally

- [ ] **Step 4: Test NPC skill activation**

During an NPC battle, wait for the NPC to use their skill (25% chance per turn). Verify:
- Enemy creatures fade out
- NPC slides in from right
- Skill attack cards display normally
- NPC slides back out
- Enemy creatures re-render and fade back in (no missing sprites)

- [ ] **Step 5: Test friendlyNpc room**

Advance to a friendlyNpc room. Verify:
- Player creatures bounce
- Area NPC slides in from right (using NPC from area pool)
- Item offering cards render normally
- NPC sprite persists during item selection (not destroyed by updateScene)

- [ ] **Step 6: Test whackAMole and dealer rooms**

If encountered, verify:
- Player creatures bounce
- Game Master (whackAMole) or Traveling Merchant (dealer) slides in from right
- Room UI renders normally

- [ ] **Step 7: Adjust timings if needed**

Based on playtesting, tune animation durations in `room-transition.js`:
- `bouncePlayerParty` duration (default 500ms)
- `slideFromRight` duration (default 400ms)
- `slideToRight` duration (default 300ms)
- Creature stagger delay (default 700ms)
- Settle delay (default 200ms)

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "polish: tune room transition timings after playtest"
```
