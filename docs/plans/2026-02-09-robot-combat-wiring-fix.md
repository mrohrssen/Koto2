# Robot Combat Wiring Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the fully-built robot combat system to the live game flow so starter selection happens, robot encounters fire, and the combat loop uses robot endpoints.

**Architecture:** The robot combat backend (data, services, GameManager methods, API routes) and frontend UI (robot-row, befriend cards, starter selection) are complete across 11 commits. Three frontend routing points never call the robot path: (1) level-select skips starter selection, (2) encounter start always uses chip endpoint, (3) combat loop always calls `/combat-cycle` instead of `/robot-combat-cycle`. Additionally room generation rolls non-combat rooms; MVP should be encounters-only.

**Tech Stack:** Express.js backend (ES modules), vanilla HTML/CSS/JS frontend, node:test for unit tests, Playwright for E2E tests.

**Worktree:** `/Users/michia/Documents/jrpg/.worktrees/robot-combat` (branch: `feature/robot-combat`)

---

## Task 1: Update API — selectLevel Accepts starterId

**Files:**
- Modify: `public/js/api.js:140-142`

**Step 1: Update selectLevel to accept and forward starterId**

Change:
```javascript
async function selectLevel(levelId) {
  return apiCall('/levels/select', 'POST', { levelId });
}
```

To:
```javascript
async function selectLevel(levelId, starterId = null) {
  const body = { levelId };
  if (starterId) body.starterId = starterId;
  return apiCall('/levels/select', 'POST', body);
}
```

The backend route (`src/routes/game/run.js:78`) already destructures `{ levelId, starterId }` and passes both to `gameManager.startRun(levelId, starterId)`. No backend changes needed.

**Step 2: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: selectLevel API accepts starterId parameter"
```

---

## Task 2: Wire Starter Selection Into Level-Select Flow

**Files:**
- Modify: `public/js/ui/exploration.js:112-151` (add callbacks), `public/js/ui/exploration.js:226-239` (level click handler)
- Modify: `public/game.js:1065-1104` (pass new callbacks to exploration init)

**Step 1: Add starter callbacks to exploration.js**

After the existing `let apiSelectLevel = null;` (line 114), add:

```javascript
let apiGetStarters = null;
let showStarterSelection = null;
```

In `init()` (after line 150 `apiSelectLevel = callbacks.apiSelectLevel;`), add:

```javascript
  apiGetStarters = callbacks.apiGetStarters;
  showStarterSelection = callbacks.showStarterSelection;
```

**Step 2: Update level-select click handler to show starter selection first**

Replace the click handler body (lines 227-239):

```javascript
    card.addEventListener('click', async () => {
      const levelId = parseInt(card.dataset.levelId);
      playSFX('button-tap');

      // Show starter robot selection before starting the run
      let starterId = null;
      if (apiGetStarters && showStarterSelection) {
        const starterResult = await apiGetStarters();
        const starters = starterResult?.starters;
        if (starters && starters.length > 0) {
          starterId = await showStarterSelection(starters);
          if (!starterId) return; // User somehow cancelled
        }
      }

      const runResult = await apiSelectLevel(levelId, starterId);
      if (runResult?.state) {
        updateGameState(runResult.state);
        updateUI();
        // Skip starting chip shop when robot combat is active
        if (!starterId && runResult.state.run?.startingChipShop?.active) {
          const economyMod = await import('./economy.js');
          await economyMod.renderStartingChipShop();
        }
      }
    });
```

**Step 3: Pass callbacks from game.js to exploration init**

In `game.js` exploration init block (after line 1103 `apiSelectLevel,`), add:

```javascript
    apiGetStarters,
    showStarterSelection,
```

Where `apiGetStarters` is already imported (line 153) and `showStarterSelection` is already defined (line 467).

**Step 4: Syntax check**

Run: `node --check public/js/ui/exploration.js && node --check public/game.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add public/js/ui/exploration.js public/game.js
git commit -m "feat: show starter selection before level select"
```

---

## Task 3: Route Combat Entry to Robot Endpoint

**Files:**
- Modify: `public/game.js:513-530` (`startEncounter` function)

**Step 1: Update startEncounter to detect robot party**

Replace lines 513-530:

```javascript
async function startEncounter() {
  const hasRobots = gameState.run?.robotParty?.active?.length > 0;

  let result;
  if (hasRobots) {
    result = await apiStartRobotEncounter();
  } else if (gameState.phase === 'room_encounter') {
    result = await apiRoomEncounter();
  } else {
    result = await apiStartEncounter();
  }

  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    const enemy = gameState.combat?.enemy;
    if (result?.dialogue || enemy?.dialogue?.possessed) {
      const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
        ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
        : enemy.dialogue.possessed);
      await showEnemyDialogue(text, 'possessed');
    }
    await delay(300);
    startCombatLoop();
  } else if (result?.enemy) {
    // Robot encounter returns { enemy, allies } without full state refresh
    // Refresh state from server
    const stateResult = await apiGetState();
    if (stateResult?.state) {
      updateGameState(stateResult.state);
      updateUI();
    }
    await delay(300);
    startCombatLoop();
  }
}
```

Note: `apiStartRobotEncounter()` returns `{ enemy, allies, playerGoesFirst }` but the GameManager also calls `emitState()`. We need to check whether the route handler returns `state` or just the combat result. Check `src/routes/game/combat.js` for the `/start-robot-encounter` response shape.

**Step 2: Verify the start-robot-encounter route response**

Read `src/routes/game/combat.js` to find the `/start-robot-encounter` handler and confirm what it returns. If it doesn't return `state: req.getEnrichedGameState()`, update it to match the pattern used by `/start-encounter`.

The route should return:

```javascript
res.json({
  ...result,
  state: req.getEnrichedGameState()
});
```

**Step 3: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/game.js src/routes/game/combat.js
git commit -m "feat: route combat entry to robot endpoint when robot party exists"
```

---

## Task 4: Create Robot Attack Function in Combat Loop

**Files:**
- Modify: `public/js/ui/combat-loop.js` — add `executeRobotPlayerAttack()` after `executePlayerAttack()` (line 706), add `apiRobotCombatCycle` callback

**Step 1: Add callback variable and wire it in init**

After `let setCombatAnimationActive = null;` (line 82), add:

```javascript
let apiRobotCombatCycle = null;
```

In `init()` (after line 123), add:

```javascript
  apiRobotCombatCycle = callbacks.apiRobotCombatCycle;
```

**Step 2: Create executeRobotPlayerAttack function**

Add after `executePlayerAttack()` (after line 706):

```javascript
/**
 * Execute robot player attack — calls /robot-combat-cycle with 'attack'
 */
async function executeRobotPlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

  try {
    const response = await fetch(`${API_BASE}/api/game/robot-combat-cycle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ actionType: 'attack' })
    });
    const result = await response.json();
    logger.info('[CombatLoop] Robot attack result:', { attacks: result.playerAttacks?.length });

    if (result.error) {
      if (result.error === 'No active combat') {
        combatActive = false;
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Robot attack error:', result.error);
      playerAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Show each robot's attack result sequentially
    if (result.playerAttacks?.length > 0) {
      playSFX('attack');
      for (const atk of result.playerAttacks) {
        const effectiveness = atk.elementMultiplier > 1 ? ' (super effective!)' :
                              atk.elementMultiplier < 1 ? ' (not very effective...)' : '';
        const actionArea = document.getElementById('action-area');
        if (actionArea) {
          actionArea.innerHTML = `<div class="combat-robot-attack">${atk.attackerName} deals <strong>${atk.damage}</strong> damage${effectiveness}</div>`;
        }
        showDamageNumber(atk.damage, false, false);
        animateEnemyHurt();
        await delay(600);
      }
    }

    // Update enemy HP from robot data
    if (result.enemies?.[0]) {
      const enemy = result.enemies[0];
      characterUI.updateEnemyHPBar({ current: enemy.hp, max: enemy.maxHp });
    }

    // Update robot slots
    if (result.allies || result.robotParty) {
      updateGameState({ ...getGameState(), run: { ...getGameState().run, robotParty: result.robotParty } });
      updateUI();
    }

    // Check combat end
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Enemy attacks after player, then pause for vocab
    if (combatActive && !getEnemyDialogueActive()) {
      setTimeout(() => {
        executeRobotEnemyAttackThenPause();
      }, 400);
    }

  } catch (error) {
    console.error('Robot attack error:', error);
    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
    }
  }
}
```

**Step 3: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/ui/combat-loop.js
git commit -m "feat: executeRobotPlayerAttack function in combat loop"
```

---

## Task 5: Create Robot Enemy Attack + Defend Functions

**Files:**
- Modify: `public/js/ui/combat-loop.js` — add `executeRobotEnemyAttackThenPause()` and `executeRobotDefendThenPause()`

**Step 1: Add executeRobotEnemyAttackThenPause**

This is a private function called after the player's robot attack. The enemy turn is already included in the `robotCombatCycle('attack')` response from Task 4 — the backend processes both player and enemy phases in one call. So this function reads enemy attacks from the same response.

Wait — re-reading `loop.js:877-966`, the `robotCombatCycle` returns `{ playerAttacks, enemyAttacks, combatEnded, ... }` in a single response. The enemy phase happens server-side in the same call. So `executeRobotPlayerAttack` already receives enemy attack results.

**Update the executeRobotPlayerAttack from Task 4** to also display enemy attacks from the same response (after showing player attacks). Add this block before the combat-end check:

```javascript
    // Show enemy robot attacks (already processed server-side in same cycle)
    if (result.enemyAttacks?.length > 0) {
      await delay(400);
      for (const atk of result.enemyAttacks) {
        const effectiveness = atk.elementMultiplier > 1 ? ' (super effective!)' :
                              atk.elementMultiplier < 1 ? ' (not very effective...)' : '';
        const actionArea = document.getElementById('action-area');
        if (actionArea) {
          actionArea.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong>${effectiveness}</div>`;
        }
        showDamageNumber(atk.damage, true, false);
        animatePlayerHurt();
        playSFX('player-hit');
        await delay(600);
      }
    }
```

Since both phases happen in one API call, we don't need a separate `executeRobotEnemyAttackThenPause`. Remove the `setTimeout` call to `executeRobotEnemyAttackThenPause()` from Task 4 and instead, after showing enemy attacks, pause for vocab:

Replace the end of `executeRobotPlayerAttack` (after updating robot slots, before combat end check) with the combined flow, then after the combat-end check:

```javascript
    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Pause for next vocab review
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();
```

**Step 2: Create executeRobotDefendThenPause**

Add after `executeRobotPlayerAttack`:

```javascript
/**
 * Execute robot defend — calls /robot-combat-cycle with 'defend'
 * Defend: all robots gain +1 ultimate charge, enemies attack with 50% damage
 */
async function executeRobotDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

  try {
    const response = await fetch(`${API_BASE}/api/game/robot-combat-cycle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ actionType: 'defend' })
    });
    const result = await response.json();
    logger.info('[CombatLoop] Robot defend result:', { enemyAttacks: result.enemyAttacks?.length });

    if (result.error) {
      if (result.error === 'No active combat') {
        combatActive = false;
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Robot defend error:', result.error);
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Show defend indicator
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = '<div class="combat-defend-indicator">DEFENDING — 50% damage, +1 charge</div>';
    }
    await delay(600);

    // Show enemy attacks (50% damage already applied server-side)
    if (result.enemyAttacks?.length > 0) {
      for (const atk of result.enemyAttacks) {
        const actionArea2 = document.getElementById('action-area');
        if (actionArea2) {
          actionArea2.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong> (halved)</div>`;
        }
        showDamageNumber(atk.damage, true, false);
        animatePlayerHurt();
        playSFX('player-hit');
        await delay(600);
      }
    }

    // Update enemy HP
    if (result.enemies?.[0]) {
      const enemy = result.enemies[0];
      characterUI.updateEnemyHPBar({ current: enemy.hp, max: enemy.maxHp });
    }

    // Update robot slots (charges changed)
    if (result.robotParty) {
      const gs = getGameState();
      updateGameState({ ...gs, run: { ...gs.run, robotParty: result.robotParty } });
      updateUI();
    }

    // Check combat end
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();

  } catch (error) {
    console.error('Robot defend error:', error);
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
    }
  }
}
```

**Step 3: Update resumeCombatAfterVocab routing**

Change lines 929-945:

```javascript
export function resumeCombatAfterVocab(grade, actionType = 'attack') {
  if (!combatActive || !combatPausedForVocab) return;

  logger.info('[CombatLoop] Word reviewed, continuing:', { grade, actionType });
  combatPausedForVocab = false;
  pendingActionType = actionType;

  const state = getGameState();
  const isRobotCombat = state.combat?.isRobotCombat;

  if (actionType === 'befriend') {
    executeBefriendAction();
  } else if (isRobotCombat) {
    // Robot combat: use robot-specific functions
    if (actionType === 'defend') {
      executeRobotDefendThenPause();
    } else {
      executeRobotPlayerAttack();
    }
  } else {
    // Chip combat: use original functions
    if (actionType === 'defend') {
      executeDefendThenPause();
    } else {
      executePlayerAttack();
    }
  }
}
```

**Step 4: Wire apiRobotCombatCycle callback in game.js**

In `game.js` combat loop init (after line 1164 `setCombatAnimationActive`), add:

```javascript
    apiRobotCombatCycle,
```

Where `apiRobotCombatCycle` is already imported at line 151.

**Step 5: Syntax check**

Run: `node --check public/js/ui/combat-loop.js && node --check public/game.js && echo "OK"`
Expected: OK

**Step 6: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.js
git commit -m "feat: robot combat loop with attack, defend, and routing"
```

---

## Task 6: Hide Player HP Bar During Robot Combat

**Files:**
- Modify: `public/game.js:303-310` (`updatePlayerHP` function)

**Step 1: Hide HP bar when robot party is active**

Replace lines 303-310:

```javascript
function updatePlayerHP() {
  // In robot combat, individual robot HP bars handle health display
  if (gameState.run?.robotParty?.active?.length > 0) {
    hpBar.setVisible(false);
    return;
  }
  if (gameState.player) {
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
    hpBar.setVisible(true);
  } else {
    hpBar.setVisible(false);
  }
}
```

**Step 2: Syntax check**

Run: `node --check public/game.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat: hide player HP bar during robot combat"
```

---

## Task 7: Encounters-Only Room Generation

**Files:**
- Modify: `src/game/loop.js:522-525` (in `startRun`)
- Modify: `src/game/rooms.js:284-319` (`generateSingleRoom`)
- Modify: `src/game/rooms.js:355` (`generateFloorRooms` signature)
- Modify: `src/game/services/exploration-service.js:150` (pass flag)

**Step 1: Set encountersOnly flag in startRun**

In `src/game/loop.js`, after line 525 (`this.run.robotParty.active = [starter];`), inside the `if (starterId)` block, add:

```javascript
      this.run.encountersOnly = true;
```

**Step 2: Thread encountersOnly through generateFloorRooms**

In `src/game/rooms.js`, update `generateFloorRooms` signature (line 355):

```javascript
export function generateFloorRooms(floor, encountersNeeded = 3, lastSpecialType = null, encountersOnly = false) {
```

Update the call to `generateSingleRoom` inside (line 365):

```javascript
      const room = generateSingleRoom(floor, roomNumber, totalSlots, prevSpecialType, encountersOnly);
```

Update `generateBranchPair` calls (line 372):

```javascript
      const pair = generateBranchPair(floor, roomNumber, totalSlots, prevSpecialType, encountersOnly);
```

**Step 3: Thread encountersOnly through generateBranchPair**

Update `generateBranchPair` signature (line 333):

```javascript
function generateBranchPair(floor, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false) {
```

Update the two `generateSingleRoom` calls inside (lines 334, 342):

```javascript
  const room1 = generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType, encountersOnly);
  // ...
  const room2 = generateSingleRoom(floor, roomNumber, totalRooms, room2ExcludeType, encountersOnly);
```

**Step 4: Respect encountersOnly in generateSingleRoom**

Update `generateSingleRoom` signature (line 284):

```javascript
function generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false) {
```

At the top of the function body, after the test queue check (line 296), add an early return:

```javascript
  if (encountersOnly && !queuedType) {
    type = ROOM_TYPES.encounter;
  } else if (queuedType && ROOM_TYPES[queuedType]) {
```

This means: if `encountersOnly`, force encounter type (unless test queue overrides). Restructure the if/else to:

```javascript
  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else if (encountersOnly) {
    type = ROOM_TYPES.encounter;
  } else {
    // Existing random generation logic...
  }
```

**Step 5: Pass flag from exploration-service**

In `src/game/services/exploration-service.js:150`, update the call:

```javascript
    this.gm.run.rooms = generateFloorRooms(this.gm.run.floor, this.gm.run.encountersNeeded, null, this.gm.run.encountersOnly || false);
```

**Step 6: Syntax check**

Run: `node --check src/game/loop.js && node --check src/game/rooms.js && node --check src/game/services/exploration-service.js && echo "OK"`
Expected: OK

**Step 7: Commit**

```bash
git add src/game/loop.js src/game/rooms.js src/game/services/exploration-service.js
git commit -m "feat: encounters-only room generation for robot combat runs"
```

---

## Task 8: Verify Start-Robot-Encounter Route Response

**Files:**
- Modify: `src/routes/game/combat.js` (if needed)

**Step 1: Check the response format**

Read the `/start-robot-encounter` route in `src/routes/game/combat.js`. Verify it returns `state: req.getEnrichedGameState()` alongside the combat result. If it only returns `{ enemy, allies, playerGoesFirst }`, update it to also include `state`.

The response should look like:

```javascript
router.post('/start-robot-encounter', async (req, res) => {
  try {
    const result = req.gameManager.startRobotEncounter();
    req.saveGame();
    res.json({
      ...result,
      state: req.getEnrichedGameState()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 2: Also verify the `/robot-combat-cycle` route returns state**

Same pattern — ensure it returns `state: req.getEnrichedGameState()` so the frontend can update `gameState` properly.

**Step 3: Syntax check**

Run: `node --check src/routes/game/combat.js && echo "OK"`
Expected: OK

**Step 4: Commit (if changes needed)**

```bash
git add src/routes/game/combat.js
git commit -m "fix: robot combat routes return enriched game state"
```

---

## Task 9: Verify and Test

**Step 1: Syntax check all modified files**

Run:
```bash
node --check public/js/api.js && \
node --check public/js/ui/exploration.js && \
node --check public/game.js && \
node --check public/js/ui/combat-loop.js && \
node --check src/game/loop.js && \
node --check src/game/rooms.js && \
node --check src/game/services/exploration-service.js && \
node --check src/routes/game/combat.js && \
echo "ALL OK"
```
Expected: ALL OK

**Step 2: Run unit tests**

Run: `cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && npm run test:unit`
Expected: 154+ tests pass (robot tests already passing)

**Step 3: Restart server and test manually**

```bash
pkill -f "node server.js" 2>/dev/null
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat && npm start &
sleep 3
```

Manual test flow:
1. Open http://localhost:3000
2. Log in / create character
3. Click "潜入" (Infiltrate)
4. Select a level
5. **Verify**: Starter selection screen appears with 3 robot cards
6. Pick a starter
7. Proceed through ward selection
8. **Verify**: First room is an encounter (not shrine/quiz/etc)
9. Enter encounter
10. **Verify**: Robot combat fires — action cards appear, attack uses robot endpoint
11. Complete combat
12. **Verify**: Victory/defeat works correctly

**Step 4: Run E2E tests**

```bash
cd /Users/michia/Documents/jrpg/.worktrees/robot-combat
./scripts/e2e-test.sh
```
Expected: 60+/66 pass. Some tests may fail if they expect chip combat behavior in encounters.

**Step 5: Commit any test fixes**

```bash
git add -A
git commit -m "fix: test adjustments for robot combat integration"
```

---

## Summary

| Task | Files | What |
|------|-------|------|
| 1 | api.js | selectLevel accepts starterId |
| 2 | exploration.js, game.js | Starter selection before level select |
| 3 | game.js | Combat entry routes to robot endpoint |
| 4 | combat-loop.js | executeRobotPlayerAttack function |
| 5 | combat-loop.js, game.js | Robot defend, enemy attacks, routing |
| 6 | game.js | Hide player HP bar in robot combat |
| 7 | loop.js, rooms.js, exploration-service.js | Encounters-only for robot runs |
| 8 | routes/game/combat.js | Verify route response includes state |
| 9 | — | Syntax checks, unit tests, manual test, E2E |
