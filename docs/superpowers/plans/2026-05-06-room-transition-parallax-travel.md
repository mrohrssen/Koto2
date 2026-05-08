# Room Transition Parallax Travel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make room-to-room transitions last 2.7 seconds and cover enough parallax ground to feel like the party crosses real terrain.

**Architecture:** Keep ownership in the existing Pixi scene stack. `parallax.js` owns named motion constants and scroll speed, `room-transition.js` owns the travel beat before room-specific arrivals, and `formation.js` exposes a small travel-offset helper so exploration creatures can move with the transition without changing combat anchors.

**Tech Stack:** ES modules, PixiJS, Node test runner with `node --experimental-test-module-mocks --test`, c8 for unit coverage, Vite dev server for manual visual verification.

---

## File Structure

- Modify `public/js/pixi/parallax.js`: export room-travel constants and a named exploration scroll speed constant.
- Modify `public/js/scenes/exploration-scene.js`: use the named exploration speed and expose a scene method that can animate/reset the player formation travel offset.
- Modify `public/js/pixi/formation.js`: add a tiny travel-offset field/helper for player sprites, shadows, and status labels.
- Modify `public/js/ui/room-transition.js`: run the 2.7s travel beat before friendly NPC/shrine/whack-a-mole/dealer arrivals.
- Modify `tests/unit/pixi/parallax-background.test.js`: verify the new constants and 3.8x travel scroll distance.
- Modify `tests/unit/ui/room-transition-scroll.test.js`: verify travel speed/duration and delayed support-room sprite arrival.
- Add `tests/unit/pixi/formation-travel-offset.test.js`: verify formation travel offset moves sprites, shadows, and labels together.

Do not modify combat attack loops. PvE/PvP parity is preserved by leaving combat `encounter` state and `BATTLE_SKY_DRIFT_SPEED` behavior unchanged.

### Task 1: Parallax Travel Constants

**Files:**
- Modify: `public/js/pixi/parallax.js`
- Modify: `tests/unit/pixi/parallax-background.test.js`

- [ ] **Step 1: Write the failing parallax constants test**

Add the new constant imports in `tests/unit/pixi/parallax-background.test.js`:

```js
const {
  loadParallax,
  setScrollState,
  startParallax,
  stopParallax,
  updateParallax,
  BACKGROUND_VERSION,
  EXPLORATION_SCROLL_SPEED,
  ROOM_TRAVEL_DURATION_MS,
  ROOM_TRAVEL_SCROLL_SPEED,
  ROOM_TRAVEL_GROUND_DISTANCE_PX,
} = await import('../../../public/js/pixi/parallax.js');
```

Add this test after the existing walking scroll test:

```js
  it('exports the approved room travel motion target', async () => {
    assert.equal(EXPLORATION_SCROLL_SPEED, 0.6);
    assert.equal(ROOM_TRAVEL_DURATION_MS, 2700);
    assert.equal(ROOM_TRAVEL_SCROLL_SPEED, 3.8);
    assert.equal(ROOM_TRAVEL_GROUND_DISTANCE_PX, 620);
  });
```

Add this test after the constants test:

```js
  it('scrolls battleground at the approved room-travel speed', async () => {
    await loadParallax('starter_meadow');
    const [sky, battleground] = fakeAppState.layers.background.children;

    startParallax(ROOM_TRAVEL_SCROLL_SPEED);
    setScrollState('scrolling');
    updateParallax(60);

    assert.equal(sky.tilePosition.x, -22.8);
    assert.equal(battleground.tilePosition.x, -228);
  });
```

- [ ] **Step 2: Run the parallax test and verify it fails**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/parallax-background.test.js
```

Expected: FAIL because `EXPLORATION_SCROLL_SPEED`, `ROOM_TRAVEL_DURATION_MS`, `ROOM_TRAVEL_SCROLL_SPEED`, and `ROOM_TRAVEL_GROUND_DISTANCE_PX` are not exported.

- [ ] **Step 3: Add the parallax constants**

In `public/js/pixi/parallax.js`, replace the battle speed block:

```js
// Per-scene speed multiplier used by BattleScene. The battleground is held
// frozen while a battle is up (scrollState='encounter'), so this only scales
// the sky drift the player sees during combat. Lower than ExplorationScene's
// default 0.6 so the sky visibly slows when fighting starts.
export const BATTLE_SKY_DRIFT_SPEED = 0.4;
```

with:

```js
// Default ExplorationScene walking speed outside authored room transitions.
export const EXPLORATION_SCROLL_SPEED = 0.6;

// Approved room-to-room travel target from
// docs/superpowers/specs/2026-05-06-room-transition-parallax-travel-design.md.
export const ROOM_TRAVEL_DURATION_MS = 2700;
export const ROOM_TRAVEL_SCROLL_SPEED = 3.8;
export const ROOM_TRAVEL_GROUND_DISTANCE_PX = 620;

// Per-scene speed multiplier used by BattleScene. The battleground is held
// frozen while a battle is up (scrollState='encounter'), so this only scales
// the sky drift the player sees during combat. Lower than ExplorationScene's
// default so the sky visibly slows when fighting starts.
export const BATTLE_SKY_DRIFT_SPEED = 0.4;
```

- [ ] **Step 4: Run the parallax test and verify it passes**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/parallax-background.test.js
```

Expected: PASS.

- [ ] **Step 5: Optional commit checkpoint**

Only run this if the user has explicitly asked for commits:

```bash
git add public/js/pixi/parallax.js tests/unit/pixi/parallax-background.test.js
git commit -m "$(cat <<'EOF'
Add room travel parallax constants

EOF
)"
```

### Task 2: Room Transition Travel Beat

**Files:**
- Modify: `public/js/ui/room-transition.js`
- Modify: `tests/unit/ui/room-transition-scroll.test.js`

- [ ] **Step 1: Write failing room-transition tests**

In `tests/unit/ui/room-transition-scroll.test.js`, add call recording near the existing `scrollStates`/`startedSpeeds` arrays:

```js
const roomTransitionEvents = [];
const scrollStates = [];
const startedSpeeds = [];
```

Change the exploration DOM mock to record support-room DOM arrival:

```js
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: {
    showNpcTrainer: () => roomTransitionEvents.push('showNpcTrainer'),
    showNpcInDisplay: () => roomTransitionEvents.push('showNpcInDisplay'),
    showDealer: () => roomTransitionEvents.push('showDealer'),
  },
});
```

Change the parallax mock to export the new constants:

```js
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    setScrollState: (state) => {
      roomTransitionEvents.push(`setScrollState:${state}`);
      scrollStates.push(state);
    },
    startParallax: (speed) => {
      roomTransitionEvents.push(`startParallax:${speed}`);
      startedSpeeds.push(speed);
    },
    EXPLORATION_SCROLL_SPEED: 0.6,
    ROOM_TRAVEL_DURATION_MS: 2700,
    ROOM_TRAVEL_SCROLL_SPEED: 3.8,
    BATTLE_SKY_DRIFT_SPEED: 0.4,
  },
});
```

Change `FakeExplorationScene.showNpcSprite()` to record Pixi arrival:

```js
  async showNpcSprite() {
    roomTransitionEvents.push('showNpcSprite');
  }
```

Update the first test to pass an immediate wait function:

```js
    await playRoomTransition({
      run: {
        currentRoom: 0,
        creatureParty: { active: [{ uid: 'ally', id: 'hi' }] },
        rooms: [{ type: 'encounter' }],
      },
    }, {
      waitFn: async () => {},
    });
```

Update the second test similarly:

```js
    await playRoomTransition({
      run: {
        currentRoom: 1,
        creatureParty: { active: allies },
        rooms: [{ type: 'empty' }, { type: 'friendlyNpc' }],
      },
    }, {
      waitFn: async () => {},
    });
```

Also update that test's reset assertion to include the room-travel speed:

```js
    assert.deepEqual(existingScene.resetCalls[0], {
      roomId: 1,
      allies,
      parallaxSpeed: 3.8,
    });
```

Add these tests:

```js
  it('uses approved room travel speed and duration before restoring exploration speed', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;
    const waits = [];

    await playRoomTransition({
      run: {
        currentRoom: 0,
        creatureParty: { active: [{ uid: 'ally', id: 'hi' }] },
        rooms: [{ type: 'empty' }],
      },
    }, {
      waitFn: async (ms) => waits.push(ms),
    });

    assert.equal(startedSpeeds[0], 3.8);
    assert.deepEqual(waits, [2700]);
    assert.equal(startedSpeeds.at(-1), 0.6);
  });

  it('delays support-room sprite arrival until after the travel wait', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition({
      run: {
        currentRoom: 0,
        creatureParty: { active: [{ uid: 'ally', id: 'hi' }] },
        rooms: [{
          type: 'friendlyNpc',
          npc: { id: 'nagi', name: 'ナギ', nameEn: 'Nagi' },
        }],
      },
    }, {
      waitFn: async (ms) => roomTransitionEvents.push(`wait:${ms}`),
    });

    assert.deepEqual(roomTransitionEvents, [
      'setScrollState:scrolling',
      'startParallax:3.8',
      'wait:2700',
      'startParallax:0.6',
      'showNpcTrainer',
      'showNpcSprite',
    ]);
  });
```

- [ ] **Step 2: Run the room-transition test and verify it fails**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/room-transition-scroll.test.js
```

Expected: FAIL because `playRoomTransition()` does not accept `waitFn`, does not start travel at `3.8`, and does not delay room-specific arrivals.

- [ ] **Step 3: Implement travel orchestration in `room-transition.js`**

Change the parallax import:

```js
import {
  setScrollState,
  startParallax,
  EXPLORATION_SCROLL_SPEED,
  ROOM_TRAVEL_DURATION_MS,
  ROOM_TRAVEL_SCROLL_SPEED,
  BATTLE_SKY_DRIFT_SPEED,
} from '../pixi/parallax.js';
```

Add this helper after `NPC_BATTLE_STRENGTH_PROMPT`:

```js
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

Change the function signature:

```js
export async function playRoomTransition(gameState, { waitFn = wait } = {}) {
```

Replace the initial scroll setup:

```js
  hideFormation('enemy');
  setScrollState('scrolling');
```

with:

```js
  hideFormation('enemy');
  setScrollState('scrolling');
  startParallax(ROOM_TRAVEL_SCROLL_SPEED);
```

Change the scene reset/transition calls:

```js
      await currentScene.resetForRoom({ roomId, allies });
```

to:

```js
      await currentScene.resetForRoom({ roomId, allies, parallaxSpeed: ROOM_TRAVEL_SCROLL_SPEED });
```

and:

```js
      await mgr.transition(ExplorationScene, { roomId, allies });
```

to:

```js
      await mgr.transition(ExplorationScene, { roomId, allies, parallaxSpeed: ROOM_TRAVEL_SCROLL_SPEED });
```

Insert this block immediately after `const canShowNpc = scene instanceof ExplorationScene;` and before `const roomType = room.type;`:

```js
  if (canShowNpc && typeof scene.playRoomTravel === 'function') {
    await scene.playRoomTravel({ durationMs: ROOM_TRAVEL_DURATION_MS, waitFn });
  } else {
    await waitFn(ROOM_TRAVEL_DURATION_MS);
  }
  startParallax(EXPLORATION_SCROLL_SPEED);
```

- [ ] **Step 4: Run the room-transition test and verify it passes**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/room-transition-scroll.test.js
```

Expected: PASS.

- [ ] **Step 5: Optional commit checkpoint**

Only run this if the user has explicitly asked for commits:

```bash
git add public/js/ui/room-transition.js tests/unit/ui/room-transition-scroll.test.js
git commit -m "$(cat <<'EOF'
Add authored room travel beat

EOF
)"
```

### Task 3: Exploration Creature Travel Offset

**Files:**
- Modify: `public/js/pixi/formation.js`
- Modify: `public/js/scenes/exploration-scene.js`
- Add: `tests/unit/pixi/formation-travel-offset.test.js`
- Modify: `tests/unit/scenes/exploration-scene.test.js`

- [ ] **Step 1: Write the failing formation-offset test**

Create `tests/unit/pixi/formation-travel-offset.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {}
class FakeSprite {}
class FakeGraphics {}
class FakeText {}
class FakeGlowFilter { destroy() {} }

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    Container: FakeContainer,
    Texture: { WHITE: {} },
    Graphics: FakeGraphics,
    Text: FakeText,
  },
});

await mock.module('pixi-filters', {
  namedExports: { GlowFilter: FakeGlowFilter },
});

const { setFormationTravelOffset } = await import('../../../public/js/pixi/formation.js');

function makeCtx() {
  const sprite = {
    baseX: 100,
    x: 100,
    _entering: false,
    _travelOffsetX: 0,
    _shadow: { x: 100 },
    statusLabels: [{ x: 80 }, { x: 120 }],
  };
  return {
    creatureSprites: {
      player: new Map([['ally', sprite]]),
      enemy: new Map(),
    },
    sprite,
  };
}

describe('setFormationTravelOffset', () => {
  it('moves player sprites, shadows, and status labels by the travel offset', () => {
    const ctx = makeCtx();

    setFormationTravelOffset(ctx, 48);

    assert.equal(ctx.sprite.x, 148);
    assert.equal(ctx.sprite._shadow.x, 148);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [128, 168]);
  });

  it('applies offset deltas without accumulating label drift', () => {
    const ctx = makeCtx();

    setFormationTravelOffset(ctx, 48);
    setFormationTravelOffset(ctx, 12);
    setFormationTravelOffset(ctx, 0);

    assert.equal(ctx.sprite.x, 100);
    assert.equal(ctx.sprite._shadow.x, 100);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [80, 120]);
  });

  it('does not disturb sprites that are currently entering', () => {
    const ctx = makeCtx();
    ctx.sprite._entering = true;

    setFormationTravelOffset(ctx, 48);

    assert.equal(ctx.sprite.x, 100);
    assert.equal(ctx.sprite._shadow.x, 100);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [80, 120]);
  });
});
```

- [ ] **Step 2: Run the formation-offset test and verify it fails**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/formation-travel-offset.test.js
```

Expected: FAIL because `setFormationTravelOffset` is not exported.

- [ ] **Step 3: Implement `setFormationTravelOffset()`**

In `public/js/pixi/formation.js`, add `travelOffsetX: 0` to `_newContext(scene)`:

```js
    walkingEnabled: false,
    walkTime: 0,
    travelOffsetX: 0,
```

Add this exported helper before `_updateFormations()`:

```js
export function setFormationTravelOffset(ctx, offsetX = 0) {
  if (!ctx?.creatureSprites?.player) return;
  ctx.travelOffsetX = offsetX;

  for (const sprite of _spritesArray(ctx, 'player')) {
    if (!sprite || sprite._entering) continue;
    const previousOffset = sprite._travelOffsetX || 0;
    const delta = offsetX - previousOffset;
    sprite.x = sprite.baseX + offsetX;
    if (sprite._shadow) sprite._shadow.x += delta;
    if (Array.isArray(sprite.statusLabels)) {
      for (const label of sprite.statusLabels) {
        label.x += delta;
      }
    }
    sprite._travelOffsetX = offsetX;
  }
}
```

- [ ] **Step 4: Run the formation-offset test and verify it passes**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/formation-travel-offset.test.js
```

Expected: PASS.

- [ ] **Step 5: Add the `ExplorationScene.playRoomTravel()` method**

In `tests/unit/scenes/exploration-scene.test.js`, update the parallax mock to include the named exploration speed:

```js
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    startParallax: () => {},
    stopParallax: () => {},
    isParallaxMoving: () => false,
    EXPLORATION_SCROLL_SPEED: 0.6,
  },
});
```

In `public/js/scenes/exploration-scene.js`, change the imports:

```js
import { startParallax, stopParallax, isParallaxMoving, EXPLORATION_SCROLL_SPEED } from '../pixi/parallax.js';
```

and:

```js
  _updateFormations,
  setFormationTravelOffset,
} from '../pixi/formation.js';
```

Change both default `parallaxSpeed = 0.6` values to:

```js
  async onEnter({ roomId = null, allies = [], parallaxSpeed = EXPLORATION_SCROLL_SPEED } = {}) {
```

and:

```js
  async resetForRoom({ roomId = null, allies = [], parallaxSpeed = EXPLORATION_SCROLL_SPEED } = {}) {
```

Add this method before `beforeExit()`:

```js
  async playRoomTravel({ durationMs, waitFn }) {
    this._guard('playRoomTravel');
    const travelDistance = 48;
    const token = Symbol('roomTravel');
    this._roomTravelToken = token;
    const start = performance.now();
    this.formation.walkingEnabled = true;

    const animate = () => {
      if (this.disposed || this._exiting) return;
      if (this._roomTravelToken !== token) return;
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setFormationTravelOffset(this.formation, travelDistance * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    await waitFn(durationMs);
    if (!this.disposed && !this._exiting && this._roomTravelToken === token) {
      this._roomTravelToken = null;
      setFormationTravelOffset(this.formation, 0);
    }
  }
```

This is intentionally small: it gives the creatures a readable forward surge during the 2.7s travel beat, then returns them to normal exploration anchors before room interaction starts.

- [ ] **Step 6: Run syntax checks**

Run:

```bash
node --check public/js/scenes/exploration-scene.js && node --check public/js/pixi/formation.js
```

Expected: both commands exit 0 with no syntax errors.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/formation-travel-offset.test.js tests/unit/scenes/exploration-scene.test.js tests/unit/ui/room-transition-scroll.test.js
```

Expected: PASS.

- [ ] **Step 8: Optional commit checkpoint**

Only run this if the user has explicitly asked for commits:

```bash
git add public/js/pixi/formation.js public/js/scenes/exploration-scene.js tests/unit/pixi/formation-travel-offset.test.js tests/unit/scenes/exploration-scene.test.js
git commit -m "$(cat <<'EOF'
Move party sprites during room travel

EOF
)"
```

### Task 4: Full Verification And Manual Visual Check

**Files:**
- Verify: `public/js/pixi/parallax.js`
- Verify: `public/js/ui/room-transition.js`
- Verify: `public/js/scenes/exploration-scene.js`
- Verify: `public/js/pixi/formation.js`
- Verify: `tests/unit/pixi/parallax-background.test.js`
- Verify: `tests/unit/ui/room-transition-scroll.test.js`
- Verify: `tests/unit/pixi/formation-travel-offset.test.js`

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm run test:unit -- tests/unit/pixi/parallax-background.test.js tests/unit/ui/room-transition-scroll.test.js tests/unit/pixi/formation-travel-offset.test.js tests/unit/scenes/exploration-scene.test.js
```

Expected: PASS. If the npm script does not forward file arguments in this repo, run the direct Node command:

```bash
node --experimental-test-module-mocks --test tests/unit/pixi/parallax-background.test.js tests/unit/ui/room-transition-scroll.test.js tests/unit/pixi/formation-travel-offset.test.js tests/unit/scenes/exploration-scene.test.js
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks for changed browser modules**

Run:

```bash
node --check public/js/pixi/parallax.js && node --check public/js/ui/room-transition.js && node --check public/js/scenes/exploration-scene.js && node --check public/js/pixi/formation.js
```

Expected: all commands exit 0.

- [ ] **Step 3: Ask before opening Playwright**

Before browser automation, ask the user:

```text
This is a visual/motion change. May I open the Playwright browser to verify three consecutive room transitions?
```

Expected: user explicitly approves before browser launch.

- [ ] **Step 4: Start the dev server if not already running**

First check existing terminals for a running dev server. If none is running, run:

```bash
npm run dev
```

Use `block_until_ms: 0` because the dev server is long-running.

Then verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 5: Manual browser verification**

Using the Playwright MCP browser after user approval:

1. Navigate to `http://localhost:5173`.
2. Reach an active run with visible room transitions.
3. Trigger at least three `進む` room transitions.
4. Confirm the party travels for about `2.7s`.
5. Confirm the battleground covers visibly more distance than before.
6. Confirm friendly NPC/shrine/dealer/whack-a-mole arrivals happen after the travel beat when those room types appear.
7. Take a screenshot for visual evidence, then delete the screenshot file in the same tool-call block.

Expected: the transition reads as crossing terrain, not a short hop, and repeated transitions do not feel sluggish.

- [ ] **Step 6: Run lints for edited files**

Use `ReadLints` on:

```text
public/js/pixi/parallax.js
public/js/ui/room-transition.js
public/js/scenes/exploration-scene.js
public/js/pixi/formation.js
tests/unit/pixi/parallax-background.test.js
tests/unit/ui/room-transition-scroll.test.js
tests/unit/pixi/formation-travel-offset.test.js
```

Expected: no new linter errors.

- [ ] **Step 7: Optional final commit**

Only run this if the user has explicitly asked for commits:

```bash
git add public/js/pixi/parallax.js public/js/ui/room-transition.js public/js/scenes/exploration-scene.js public/js/pixi/formation.js tests/unit/pixi/parallax-background.test.js tests/unit/ui/room-transition-scroll.test.js tests/unit/pixi/formation-travel-offset.test.js tests/unit/scenes/exploration-scene.test.js docs/superpowers/specs/2026-05-06-room-transition-parallax-travel-design.md docs/superpowers/plans/2026-05-06-room-transition-parallax-travel.md
git commit -m "$(cat <<'EOF'
Improve room transition travel feel

EOF
)"
```
