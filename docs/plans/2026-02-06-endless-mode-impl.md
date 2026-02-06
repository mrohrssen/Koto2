# Endless Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After beating the Floor 7 boss, players can choose "Keep Going" to enter an endless mode with scaling enemies in "The Outskirts" ward.

**Architecture:** Modify the game victory flow to offer a choice instead of immediately ending the run. Add a new "continue-endless" endpoint. Extend enemy/boss generation to handle floors beyond 7. Add The Outskirts ward to the ward system.

**Tech Stack:** Express.js backend, vanilla JS frontend, existing game state machine.

---

### Task 1: Add The Outskirts Ward to WARD_INFO and WARD_PATHS

**Files:**
- Modify: `src/game/rooms.js:158-189`

**Step 1: Add outskirts entry to WARD_INFO**

In `src/game/rooms.js`, after the `palace` entry (line 166), add:

```javascript
  outskirts: {
    id: 'outskirts',
    name: '外縁部',
    nameEn: 'The Outskirts',
    theme: '荒廃',
    themeEn: 'Wasteland',
    tier: 5,
    description: 'SYSTEMの向こう側。制御を離れた荒野が広がる。'
  }
```

**Step 2: Add outskirts entry to WARD_PATHS**

After the `palace` entry (line 188), add:

```javascript
  outskirts: { next: ['outskirts'], tier: 5 }
```

Also update `palace` to include outskirts as a next option:

```javascript
  palace: { next: ['outskirts'], tier: 5, isFinal: true }
```

**Step 3: Syntax check**

Run: `node --check src/game/rooms.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add src/game/rooms.js
git commit -m "feat(endless): add The Outskirts ward to WARD_INFO and WARD_PATHS"
```

---

### Task 2: Extend Enemy Generation for Endless Floors

**Files:**
- Modify: `src/game/enemies.js:975-1039`

**Step 1: Update `getEnemiesForFloor()` to handle floors > 7**

At `src/game/enemies.js:975`, the current tier mapping caps at tier 4. Change it to scale indefinitely:

```javascript
export function getEnemiesForFloor(floor, useLocations = true) {
  // Determine tier based on floor
  let tier;
  if (floor <= 2) tier = 1;
  else if (floor <= 4) tier = 2;
  else if (floor <= 6) tier = 3;
  else tier = 4;

  // Endless mode (floor > 7): ignore location filtering, return all enemies
  if (floor > 7) {
    return Object.values(ENEMY_TEMPLATES);
  }

  // ... rest unchanged
```

The key insight: for floors 8+, return ALL enemies regardless of tier/location. The `buildEnemy()` function already scales stats from `template.tier`, but for endless mode we want the tier to come from the floor, not the template. We handle that in Step 2.

**Step 2: Update `generateEnemy()` to override tier for endless floors**

At `src/game/enemies.js:1012`:

```javascript
export function generateEnemy(floor) {
  const enemies = getEnemiesForFloor(floor);
  const template = enemies[Math.floor(Math.random() * enemies.length)];

  // For endless floors, override template tier with floor-derived tier
  const effectiveTemplate = floor > 7
    ? { ...template, tier: Math.ceil(floor / 2) }
    : template;

  const enemy = buildEnemy(effectiveTemplate, 0);

  enemy.xpReward = 0;
  enemy.creditReward = template.creditReward || 20;

  return enemy;
}
```

**Step 3: Update `getBossForFloor()` to pick random boss for endless floors**

At `src/game/enemies.js:1027`:

```javascript
export function getBossForFloor(floor) {
  let template;

  if (floor > 7) {
    // Endless mode: pick a random boss, scale to current tier
    const allBosses = Object.values(FLOOR_BOSSES);
    const base = allBosses[Math.floor(Math.random() * allBosses.length)];
    template = { ...base, tier: Math.ceil(floor / 2) };
  } else if (floor === 7) {
    template = FINAL_BOSS;
  } else {
    template = FLOOR_BOSSES[floor];
  }

  if (!template) return null;

  return buildEnemy(template);
}
```

**Step 4: Syntax check**

Run: `node --check src/game/enemies.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add src/game/enemies.js
git commit -m "feat(endless): extend enemy/boss generation for floors beyond 7"
```

---

### Task 3: Modify Game Victory to Offer "Keep Going" Choice

**Files:**
- Modify: `src/game/services/combat-service.js:499-502, 559-586`

**Step 1: Change the Floor 7 boss victory check**

At `src/game/services/combat-service.js:499-503`, instead of calling `handleGameVictory()` immediately, set a flag and return a result that includes the choice:

```javascript
    if (isBoss) {
      if (this.gm.run.floor === 7) {
        // Game complete — offer endless mode choice
        this.gm.run.gameVictoryPending = true;
        this.gm.run.bossDefeated = true;
        this.gm.narrate(getSimpleNarration('gameVictory', this.gm.run.player));
      } else if (this.gm.run.floor > 7) {
        // Endless mode floor cleared — auto-continue to next floor
        this.gm.run.wardSelectionRequired = false;
        this.gm.narrate(getSimpleNarration('floorClear', this.gm.run.floor));
      } else {
        // Normal floor cleared
        this.gm.run.wardSelectionRequired = true;
        nextWardOptions = getNextWardOptions(this.gm.run.currentWard);
        this.gm.narrate(getSimpleNarration('floorClear', this.gm.run.floor));
      }
    }
```

**Step 2: Syntax check**

Run: `node --check src/game/services/combat-service.js && echo "OK"`
Expected: OK

**Step 3: Commit**

```bash
git add src/game/services/combat-service.js
git commit -m "feat(endless): offer keep-going choice after Floor 7 boss"
```

---

### Task 4: Add Phase Support for Endless Mode

**Files:**
- Modify: `src/game/phase-machine.js:182-246`

**Step 1: Handle `gameVictoryPending` in `derivePhase()`**

In `src/game/phase-machine.js`, add a check for `gameVictoryPending` in `derivePhase()`. After the `bossDefeated` check (line 207), add before it:

```javascript
  // Game victory pending — player choosing between hub and endless
  if (run.gameVictoryPending) return PHASES.RUN_COMPLETE;
```

**Step 2: Add endless mode transition from RUN_COMPLETE**

Update `VALID_TRANSITIONS` at line 153:

```javascript
  [PHASES.RUN_COMPLETE]: [
    PHASES.HUB,             // Return to hub
    PHASES.EXPLORING        // Continue to endless mode
  ],
```

**Step 3: Also handle endless floor_complete (floor > 7 boss defeated)**

The `derivePhase` already returns `PHASES.FLOOR_COMPLETE` when `run.bossDefeated` is true, which is fine for endless floors too — the frontend will call the continue-endless endpoint instead of ward selection.

**Step 4: Syntax check**

Run: `node --check src/game/phase-machine.js && echo "OK"`
Expected: OK

**Step 5: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat(endless): add phase support for endless mode transitions"
```

---

### Task 5: Add GameManager Methods for Endless Mode

**Files:**
- Modify: `src/game/loop.js`
- Modify: `src/game/services/exploration-service.js:139-194`

**Step 1: Add `continueEndless()` to ExplorationService**

In `src/game/services/exploration-service.js`, after `nextFloor()` (line 194), add:

```javascript
  /**
   * Continue to next endless floor after boss defeat
   */
  continueEndless() {
    if (!this.gm.run?.bossDefeated && !this.gm.run?.gameVictoryPending) {
      throw new Error('Boss not defeated');
    }

    // Clear the victory pending flag if coming from Floor 7
    this.gm.run.gameVictoryPending = false;

    this.gm.run.floor++;
    this.gm.run.currentWard = 'outskirts';
    if (!this.gm.run.wardPath.includes('outskirts')) {
      this.gm.run.wardPath.push('outskirts');
    }
    this.gm.run.wardSelectionRequired = false;

    return this.enterFloor();
  }
```

**Step 2: Update `enterFloor()` to use outskirts background for endless floors**

In `src/game/services/exploration-service.js:154-155`, update the background line:

```javascript
    // Set floor background image
    if (this.gm.run.floor > 7) {
      this.gm.run.background = 'outskirts.webp';
    } else {
      this.gm.run.background = `floor${this.gm.run.floor}.webp`;
    }
```

**Step 3: Remove the floor >= 7 guard in `nextFloor()`**

At `src/game/services/exploration-service.js:186-188`, the guard `if (this.gm.run.floor >= 7)` prevents advancing past floor 7. We still want `nextFloor()` for floors 1-7, but endless uses `continueEndless()`, so this guard can stay.

**Step 4: Add `continueEndless()` to GameManager**

In `src/game/loop.js`, find the `nextFloor()` method and add after it:

```javascript
  continueEndless() {
    return this.explorationService.continueEndless();
  }
```

**Step 5: Add `returnToHubFromVictory()` to GameManager**

This handles the "Return to Hub" choice after the Floor 7 boss:

```javascript
  returnToHubFromVictory() {
    if (!this.run?.gameVictoryPending) {
      throw new Error('No pending game victory');
    }
    return this.combatService.handleGameVictory();
  }
```

**Step 6: Syntax check both files**

Run: `node --check src/game/services/exploration-service.js && node --check src/game/loop.js && echo "OK"`
Expected: OK

**Step 7: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js
git commit -m "feat(endless): add continueEndless and returnToHubFromVictory methods"
```

---

### Task 6: Add Server Endpoint for Endless Mode

**Files:**
- Modify: `src/routes/game/run.js:203-217`

**Step 1: Add `/continue-endless` endpoint**

After the `/next-floor` endpoint (line 217), add:

```javascript
  // Continue to next endless floor
  router.post('/continue-endless', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const floor = gameManager.continueEndless();
      const narration = await generateGameNarration('floorEnter', {
        floor: gameManager.run.floor,
        player: gameManager.run.player
      }, req.userKeys);

      req.saveGame();
      res.json({ state: req.getEnrichedGameState(), narration });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 2: Add `/return-to-hub-from-victory` endpoint**

```javascript
  // Return to hub after game victory (choosing not to continue)
  router.post('/return-to-hub-from-victory', async (req, res) => {
    const gameManager = req.gameManager;
    try {
      const result = gameManager.returnToHubFromVictory();
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 3: Syntax check**

Run: `node --check src/routes/game/run.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat(endless): add continue-endless and return-to-hub endpoints"
```

---

### Task 7: Add Frontend API Functions

**Files:**
- Modify: `public/js/api.js`

**Step 1: Add `continueEndless()` API function**

After `nextFloor()` (line 424), add:

```javascript
/** Continue to next endless floor */
async function continueEndless() {
  return apiCall('/continue-endless', 'POST');
}

/** Return to hub after game victory (declining endless) */
async function returnToHubFromVictory() {
  return apiCall('/return-to-hub-from-victory', 'POST');
}
```

**Step 2: Add to exports**

In the export block (line 575), add `continueEndless` and `returnToHubFromVictory`:

```javascript
  nextFloor,
  continueEndless,
  returnToHubFromVictory,
  getChipLoadout,
```

**Step 3: Syntax check**

Run: `node --check public/js/api.js && echo "OK"`
Expected: OK

**Step 4: Commit**

```bash
git add public/js/api.js
git commit -m "feat(endless): add frontend API functions for endless mode"
```

---

### Task 8: Update Frontend Game Victory + Floor Complete UI

**Files:**
- Modify: `public/game.js` (imports, wiring)
- Modify: `public/js/ui/exploration.js` (render functions)

**Step 1: Import new API functions in `public/game.js`**

Add to the API imports (around line 123):

```javascript
  continueEndless as apiContinueEndless,
  returnToHubFromVictory as apiReturnToHubFromVictory,
```

**Step 2: Add `continueEndless()` and `returnToHubFromVictory()` game action functions**

After `nextFloor()` (line 453-459):

```javascript
async function continueEndless() {
  const result = await apiContinueEndless();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}

async function returnToHubFromVictory() {
  const result = await apiReturnToHubFromVictory();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}
```

**Step 3: Pass new functions to exploration UI init**

In the `explorationUI.init()` call (around line 929), add:

```javascript
    continueEndless,
    returnToHubFromVictory,
```

**Step 4: Handle `run_complete` phase in `updateGameContent()`**

In `public/game.js:288`, add a new case to the switch:

```javascript
    case 'run_complete':
      explorationUI.renderRunComplete();
      break;
```

**Step 5: Update `renderFloorComplete()` in `public/js/ui/exploration.js`**

At line 319, update to handle endless floors:

```javascript
export function renderFloorComplete() {
  const gameState = getGameState();
  if (gameState.run?.floor > 7) {
    // Endless mode — auto-continue
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="endless-continue-btn">続ける</button>
    `);
    document.getElementById('endless-continue-btn')?.addEventListener('click', () => {
      continueEndless();
    });
  } else {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="next-floor-btn">続ける</button>
    `);
    document.getElementById('next-floor-btn')?.addEventListener('click', () => {
      nextFloor();
    });
  }
}
```

**Step 6: Add `renderRunComplete()` function in `public/js/ui/exploration.js`**

After `renderRunEnded()` (line 336), add:

```javascript
/** Run complete (game victory) — show Keep Going / Return to Hub */
export function renderRunComplete() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="endless-btn">まだまだ</button>
    <button class="action-btn action-btn-secondary" id="victory-hub-btn">ハブに戻る</button>
  `);
  document.getElementById('endless-btn')?.addEventListener('click', () => {
    continueEndless();
  });
  document.getElementById('victory-hub-btn')?.addEventListener('click', () => {
    returnToHubFromVictory();
  });
}
```

**Step 7: Wire up `continueEndless` and `returnToHubFromVictory` in exploration.js init**

The `exploration.js` `init()` function receives callbacks. Add the new functions to the destructured params at the top of the file, and capture them in the init function alongside `nextFloor`, `returnToHub`, etc.

**Step 8: Syntax check**

Run: `node --check public/game.js && node --check public/js/ui/exploration.js && echo "OK"`
Expected: OK

**Step 9: Commit**

```bash
git add public/game.js public/js/ui/exploration.js
git commit -m "feat(endless): add frontend UI for endless mode choice and floor progression"
```

---

### Task 9: Add Outskirts Background Image

**Files:**
- Create: `public/assets/backgrounds/outskirts.webp`

**Step 1: Generate a placeholder background**

Use an AI image generator or create a placeholder image. The theme is "wasteland beyond Neo Tokyo" — dark, desolate, cyberpunk ruins.

For now, copy an existing background as placeholder:

```bash
cp public/assets/backgrounds/floor7.webp public/assets/backgrounds/outskirts.webp
```

**Step 2: Commit**

```bash
git add public/assets/backgrounds/outskirts.webp
git commit -m "feat(endless): add placeholder outskirts background"
```

---

### Task 10: Integration Test — End-to-End Verification

**Step 1: Run unit tests**

```bash
npm run test:unit
```

Expected: All 154+ tests pass

**Step 2: Syntax-check all modified files**

```bash
node --check src/game/rooms.js && \
node --check src/game/enemies.js && \
node --check src/game/services/combat-service.js && \
node --check src/game/phase-machine.js && \
node --check src/game/services/exploration-service.js && \
node --check src/game/loop.js && \
node --check src/routes/game/run.js && \
node --check public/js/api.js && \
node --check public/game.js && \
node --check public/js/ui/exploration.js && \
echo "ALL OK"
```

**Step 3: Run e2e tests**

```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 pass (existing threshold)

**Step 4: Manual smoke test**

1. Start dev server: `npm run dev`
2. Play through to Floor 7 boss
3. Beat the boss — verify "まだまだ" / "ハブに戻る" buttons appear
4. Click "まだまだ" — verify floor increments to 8, outskirts background loads, rooms generate
5. Fight enemies — verify scaling works (should be tougher than floor 7)
6. Beat floor 8 boss — verify auto-continue button appears
7. Die — verify normal run-end flow, essence awarded, back to hub
8. Check lifetime stats — verify highestFloor > 7

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(endless): integration test fixes"
```
