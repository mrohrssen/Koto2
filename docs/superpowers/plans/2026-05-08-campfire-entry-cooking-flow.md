# Campfire Entry Cooking Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear campfire room entry prompt and scene-area campfire animation while reusing the existing campfire cooking UI below the scene.

**Architecture:** Keep cooking mechanics and APIs intact. Extend `GET /campfire` with frame-token yes/no labels, let `public/js/ui/campfire.js` manage a small client-only entry/cooking display state, reuse `renderButtons`, and route completion through the existing proceed flow from `exploration.js`. Add a generated transparent campfire asset and use it both as the room support-object sprite and the zoomed cooking scene visual.

**Tech Stack:** Node/Express ES modules, browser ES modules, Pixi-backed exploration scenes, static dialogue frames, `renderJpSentence`, Node test runner, c8.

---

## File Structure

- Create: `public/assets/sprites/objects/campfire.webp`
  - Transparent pixel-art campfire/fireplace generated through Scenario and background-removed through Scenario.
- Modify: `src/routes/game/cooking.js`
  - Add `yesTokens` and `noTokens` to `GET /campfire` state using existing Game Master yes/no frame data.
- Modify: `public/js/ui/campfire.js`
  - Add entry prompt state, render `Would you like to cook?`, render `renderJpSentence` labels for `はい` / `いいえ`, reuse existing cooking UI after yes, and call a completion callback after decline/skip/feed.
- Modify: `public/js/ui/exploration.js`
  - Pass an existing-proceed-flow callback into `campfireUI.init`.
- Modify: `public/js/ui/room-transition.js`
  - Show the campfire sprite when entering a campfire room.
- Modify: `public/js/ui/sprite-utils.js`
  - Bump `SPRITE_VERSION` because a new immutable `.webp` asset is added under `public/assets`.
- Modify: `public/game.css`
  - Adjust campfire scene styles so cooking mode keeps the live background feel, shows a centered campfire image, hides party/HP through classes, and keeps the five-slot preview visible.
- Test: `tests/unit/routes/cooking-routes.test.js`
  - Verify campfire state returns yes/no frame tokens.
- Test: `tests/unit/ui/campfire.test.js`
  - Verify entry prompt, rendered yes/no labels, existing lower UI reuse, skip/decline/feed completion flow, and cooking scene slots.
- Test: `tests/unit/ui/room-transition-scroll.test.js`
  - Verify campfire rooms show the campfire sprite after travel.

## Preflight: Isolate the Work

- [ ] **Step 1: Confirm repository root**

Run:

```bash
/usr/bin/git rev-parse --show-toplevel
```

Expected: `/Users/michiarohrssen/Documents/Claude/koto-dev`.

- [ ] **Step 2: Create an isolated worktree before editing code**

Run from `/Users/michiarohrssen/Documents/Claude/koto-dev`:

```bash
/usr/bin/git worktree add ../koto-wt-campfire-entry-flow -b feature/campfire-entry-flow
```

Expected: a new worktree at `/Users/michiarohrssen/Documents/Claude/koto-wt-campfire-entry-flow`.

- [ ] **Step 3: Move implementation work into the worktree**

Use `/Users/michiarohrssen/Documents/Claude/koto-wt-campfire-entry-flow` as the working directory for every implementation command below.

## Task 1: Add Campfire Yes/No Tokens To API State

**Files:**
- Modify: `src/routes/game/cooking.js`
- Test: `tests/unit/routes/cooking-routes.test.js`

- [ ] **Step 1: Write the failing route test**

Add this test to `tests/unit/routes/cooking-routes.test.js` after `campfire state rejects non-campfire room`:

```js
  it('campfire state includes rendered-choice token payloads for yes and no', async () => {
    const app = createApp({ authBypass: true });
    const gm = setupRun(createRoom(ROOM_TYPES.campfire, 'test-area', 1, 1));
    gm.run.cooking.ingredients = { mizu: 1 };

    const res = await request(app)
      .get('/api/game/campfire')
      .expect(200);

    assert.ok(Array.isArray(res.body.yesTokens.tokens));
    assert.ok(Array.isArray(res.body.noTokens.tokens));
    assert.equal(res.body.yesTokens.tokens[0].surface, 'はい');
    assert.equal(res.body.noTokens.tokens[0].surface, 'いいえ');
  });
```

- [ ] **Step 2: Run the focused route test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/cooking-routes.test.js
```

Expected: FAIL because `res.body.yesTokens` is undefined.

- [ ] **Step 3: Import frame helpers in `src/routes/game/cooking.js`**

Change the imports at the top of `src/routes/game/cooking.js` so they include:

```js
import { entityToToken, getEligibleFrameTokens } from '../../game/token-format.js';
import { getKnownWordsFromFsrs, getWordDict } from '../../game/bootstrap/word-knowledge.js';
import { getGameMasterYesFrame, getGameMasterNoFrame } from '../../game/dialogue-loader.js';
```

This replaces the current single import:

```js
import { entityToToken } from '../../game/token-format.js';
```

- [ ] **Step 4: Add yes/no token payloads to `buildCampfireState`**

Replace `buildCampfireState` in `src/routes/game/cooking.js` with:

```js
function buildCampfireState(req) {
  const gm = req.gameManager;
  const discoveredIds = new Set(gm.meta?.cookingRecipesDiscovered || []);
  const knownWords = getKnownWordsFromFsrs(req.user.id);
  const knownSet = new Set(knownWords);
  const dict = getWordDict();
  return {
    ingredients: gm.run.cooking.ingredients,
    ingredientCatalog: COOKING_INGREDIENTS,
    ingredientCount: getIngredientCount(gm.run.cooking.ingredients),
    discoveredRecipes: COOKING_RECIPES.filter(recipe => discoveredIds.has(recipe.id)),
    room: gm.getCurrentRoom()?.campfire || null,
    yesTokens: getEligibleFrameTokens(getGameMasterYesFrame(), knownSet, { dict }),
    noTokens: getEligibleFrameTokens(getGameMasterNoFrame(), knownSet, { dict }),
    state: req.getEnrichedGameState(),
  };
}
```

- [ ] **Step 5: Run the focused route test and verify pass**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/cooking-routes.test.js
```

Expected: PASS.

## Task 2: Render Campfire Entry Prompt Before Cooking UI

**Files:**
- Modify: `public/js/ui/campfire.js`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Extend `sampleState` with yes/no tokens**

In `tests/unit/ui/campfire.test.js`, update `sampleState` to include these fields before `room`:

```js
    yesTokens: {
      tokens: [{ surface: 'はい', base: 'はい', reading: 'はい', pos: 'Interjection' }],
      overrides: {},
    },
    noTokens: {
      tokens: [{ surface: 'いいえ', base: 'いいえ', reading: 'いいえ', pos: 'Interjection' }],
      overrides: {},
    },
```

- [ ] **Step 2: Write failing entry prompt tests**

Add these tests near the start of the `describe('campfire UI', ...)` block:

```js
  it('starts with an English cooking prompt and rendered Japanese yes/no buttons', () => {
    campfire.renderForTest(sampleState());

    assert.match(renderedHtml(actionArea), /Would you like to cook\?/);
    assert.match(renderedHtml(actionArea), /はい/);
    assert.match(renderedHtml(actionArea), /いいえ/);
    assert.match(renderedHtml(actionArea), /<ruby>/);
    assert.equal(actionArea.querySelectorAll('.ui-btn').length, 2);
    assert.equal(actionArea.querySelector('.campfire-panel'), null);
    assert.equal(actionArea.querySelector('.ui-choice'), null);
  });

  it('choosing yes opens the existing campfire cooking panel and scene slots', () => {
    campfire.renderForTest(sampleState());

    actionArea.querySelector('.ui-btn').click();

    assert.ok(actionArea.querySelector('.campfire-panel'));
    assert.ok(sceneArea.querySelector('.campfire-slot-preview'));
    assert.match(renderedHtml(), />Ingredients</);
    assert.match(renderedHtml(), />Recipes</);
    assert.match(renderedHtml(), />Cook</);
    assert.match(renderedHtml(sceneArea), /Cooking slots/);
  });
```

- [ ] **Step 3: Run the focused UI test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: FAIL because the campfire panel renders immediately instead of the entry prompt.

- [ ] **Step 4: Import `renderButtons` in `public/js/ui/campfire.js`**

Add this import:

```js
import { renderButtons } from './ui-components.js';
```

- [ ] **Step 5: Add client-only display state and label helpers**

Near the existing module state in `public/js/ui/campfire.js`, add:

```js
let displayMode = 'entry';
```

Add these helper functions after `escapeAttribute`:

```js
function renderFrameTokens(framePayload, fallback) {
  if (framePayload?.tokens?.length) {
    return renderJpSentence(framePayload.tokens, getKnownWords(), null, framePayload.overrides || {}, false);
  }
  console.warn(`[campfire] Missing frame tokens for ${fallback}; using literal fallback`);
  return fallback;
}

function yesLabel() {
  return renderFrameTokens(campfireState?.yesTokens, 'はい');
}

function noLabel() {
  return renderFrameTokens(campfireState?.noTokens, 'いいえ');
}
```

- [ ] **Step 6: Reset display mode in `show` and `renderForTest`**

Update `show` and `renderForTest` so both set `displayMode = 'entry'` before calling `render()`:

```js
export async function show() {
  campfireState = await callbacks.apiGetCampfire();
  selected = {};
  activeTab = 'ingredients';
  displayMode = campfireState?.room?.cookedDish ? 'cooking' : 'entry';
  render();
}
```

```js
export function renderForTest(state, cbs = {}) {
  callbacks = cbs;
  campfireState = state;
  selected = {};
  activeTab = 'ingredients';
  displayMode = campfireState?.room?.cookedDish ? 'cooking' : 'entry';
  render();
}
```

- [ ] **Step 7: Add the entry prompt renderer**

Add this function before `render()`:

```js
function renderEntryPrompt() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;
  cleanup();
  actionArea.innerHTML = '<div class="campfire-entry-heading">Would you like to cook?</div>';
  renderButtons([
    {
      label: yesLabel(),
      primary: true,
      onClick: () => {
        displayMode = 'cooking';
        render();
      },
    },
    {
      label: noLabel(),
      onClick: () => completeCampfire(apiSkipCampfire),
    },
  ], { container: actionArea, append: true });
}
```

- [ ] **Step 8: Gate `render()` on entry mode**

At the start of `render()` after the `actionArea` null guard, add:

```js
  if (displayMode === 'entry' && !campfireState?.room?.cookedDish) {
    renderEntryPrompt();
    return;
  }
```

- [ ] **Step 9: Run the focused UI test and verify pass**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: PASS for the new entry prompt tests. If older tests now fail because they expected immediate cooking UI, update those tests to click the first `.ui-btn` before interacting with ingredient cards.

## Task 3: Reuse Existing Proceed Flow After Decline, Skip, And Feed

**Files:**
- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/campfire.js`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Write failing completion-flow tests**

Add these tests to `tests/unit/ui/campfire.test.js` after the entry tests:

```js
  it('choosing no skips the campfire and invokes the completion proceed callback', async () => {
    let skipCalled = false;
    let proceeded = false;
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => {
        skipCalled = true;
        return { state: { phase: 'room' }, skipped: true };
      },
      completeCampfireAndProceed: async state => {
        proceeded = state.phase === 'room';
      },
    });

    await actionArea.querySelectorAll('.ui-btn')[1].click();

    assert.equal(skipCalled, true);
    assert.equal(proceeded, true);
  });
```

Update the existing `skip completes the campfire without cooking and clears the campfire scene` test so it clicks yes before clicking skip, and so it expects `completeCampfireAndProceed` instead of `updateUI`:

```js
  it('skip completes the campfire without cooking and clears the campfire scene', async () => {
    let skipCalled = false;
    let proceeded = false;
    sceneArea.innerHTML = '<canvas class="pixi-canvas"></canvas>';
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => {
        skipCalled = true;
        return { state: { phase: 'room' } };
      },
      completeCampfireAndProceed: async state => { proceeded = state.phase === 'room'; },
    });

    actionArea.querySelector('.ui-btn').click();
    await actionArea.querySelector('.campfire-skip-btn').click();

    assert.equal(skipCalled, true);
    assert.equal(proceeded, true);
    assert.equal(sceneArea.querySelector('.campfire-scene'), null);
    assert.ok(sceneArea.querySelector('.pixi-canvas'));
  });
```

Update the feed callback test so it provides `completeCampfireAndProceed` and asserts it was called.

- [ ] **Step 2: Run the focused UI test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: FAIL because `completeCampfireAndProceed` is not called yet.

- [ ] **Step 3: Add a completion helper to `public/js/ui/campfire.js`**

Add this helper before `skipCampfire`:

```js
async function completeCampfire(action) {
  const result = await action?.();
  if (result?.state) {
    cleanup();
    if (callbacks.completeCampfireAndProceed) {
      await callbacks.completeCampfireAndProceed(result.state);
    } else {
      callbacks.updateGameState?.(result.state);
      callbacks.updateUI?.();
    }
  }
}
```

Replace `skipCampfire` with:

```js
async function skipCampfire() {
  await completeCampfire(callbacks.apiSkipCampfire);
}
```

In `renderCookedDish`, replace the success block with:

```js
    if (result?.state) {
      cleanup();
      if (callbacks.completeCampfireAndProceed) {
        await callbacks.completeCampfireAndProceed(result.state);
      } else {
        callbacks.updateGameState?.(result.state);
        callbacks.updateUI?.();
      }
    }
```

- [ ] **Step 4: Add a reusable proceed helper in `public/js/ui/exploration.js`**

Add this function near `renderExploring`:

```js
async function proceedToNextRoom() {
  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    showProceedIngredientDrops(result, result.state);
    await playRoomTransition(result.state);
    updateUI();
  }
}
```

Replace the inline proceed body inside the `➡️ 進む` button with:

```js
    { label: '➡️ 進む', onClick: proceedToNextRoom, primary: true },
```

In `init`, pass the campfire completion callback:

```js
    completeCampfireAndProceed: async (completedState) => {
      updateGameState(completedState);
      await proceedToNextRoom();
    },
```

- [ ] **Step 5: Run focused UI tests and syntax checks**

Run:

```bash
node --check public/js/ui/campfire.js && node --check public/js/ui/exploration.js && node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: syntax checks pass and campfire UI tests pass.

## Task 4: Add The Campfire Scene Asset

**Files:**
- Create: `public/assets/sprites/objects/campfire.webp`
- Modify: `public/js/ui/sprite-utils.js`

- [ ] **Step 1: Generate the campfire asset through Scenario**

Before calling Scenario MCP tools, read the current tool descriptors for `project-0-koto-dev-scenario`. Use Scenario to generate a transparent or background-removable pixel-art campfire/fireplace sprite.

Prompt content:

```text
Single cozy pixel-art campfire for a bright sci-fi fantasy Japanese vocabulary RPG, warm orange flame, small stacked logs, readable silhouette at mobile game scale, game sprite style matching existing Koto creature sprites, centered object, no character, no text, no frame, isolated on simple removable background.
```

Use Scenario background removal after generation if the model output is not already transparent.

- [ ] **Step 2: Save the final transparent runtime asset**

Save the final asset at:

```text
public/assets/sprites/objects/campfire.webp
```

If the `objects` directory does not exist, create it.

- [ ] **Step 3: Bump `SPRITE_VERSION`**

In `public/js/ui/sprite-utils.js`, change:

```js
export const SPRITE_VERSION = '20260508-favorites';
```

to:

```js
export const SPRITE_VERSION = '20260508-campfire-entry';
```

- [ ] **Step 4: Verify the asset exists**

Run:

```bash
ls public/assets/sprites/objects/campfire.webp
```

Expected: the file path prints exactly once.

## Task 5: Show Campfire Sprite On Room Entry

**Files:**
- Modify: `public/js/ui/room-transition.js`
- Test: `tests/unit/ui/room-transition-scroll.test.js`

- [ ] **Step 1: Write the failing room transition test**

Add this test to `tests/unit/ui/room-transition-scroll.test.js` after the friendly NPC support-room sprite test:

```js
  it('shows the campfire sprite after entering a campfire room', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition({
      run: {
        currentRoom: 0,
        creatureParty: { active: [{ uid: 'ally', id: 'hi' }] },
        rooms: [{ type: 'campfire' }],
      },
    }, {
      waitFn: async (ms) => roomTransitionEvents.push(`wait:${ms}`),
    });

    assert.deepEqual(roomTransitionEvents, [
      'setScrollState:scrolling',
      'startParallax:3.8',
      'wait:2700',
      'startParallax:0.6',
      'showNpcInDisplay',
      'showNpcSprite',
    ]);
  });
```

- [ ] **Step 2: Run the focused room transition test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/room-transition-scroll.test.js
```

Expected: FAIL because campfire rooms do not currently call `showNpcInDisplay` or `showNpcSprite`.

- [ ] **Step 3: Add the campfire sprite path constant**

Near `NPC_BATTLE_STRENGTH_PROMPT` in `public/js/ui/room-transition.js`, add:

```js
const CAMPFIRE_SPRITE_PATH = `/assets/sprites/objects/campfire.webp?v=${SPRITE_VERSION}`;
```

- [ ] **Step 4: Add the campfire branch in `playRoomTransition`**

After the `whackAMole` branch and before the `dealer` branch, add:

```js
  } else if (roomType === 'campfire') {
    showNpcInDisplay('Campfire', CAMPFIRE_SPRITE_PATH, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(CAMPFIRE_SPRITE_PATH, { slideIn: true });
```

- [ ] **Step 5: Run focused room transition tests and syntax check**

Run:

```bash
node --check public/js/ui/room-transition.js && node --experimental-test-module-mocks --test tests/unit/ui/room-transition-scroll.test.js
```

Expected: syntax check passes and room transition tests pass.

## Task 6: Replace The CSS-Only Cooking Fire With The New Scene-Area Presentation

**Files:**
- Modify: `public/js/ui/campfire.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Write failing scene presentation assertions**

Update the `choosing yes opens the existing campfire cooking panel and scene slots` test to include:

```js
    assert.ok(sceneArea.querySelector('.campfire-scene--cooking'));
    assert.match(renderedHtml(sceneArea), /\/assets\/sprites\/objects\/campfire\.webp/);
```

- [ ] **Step 2: Run the focused UI test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: FAIL because the scene still uses CSS-only `.campfire-flame` markup.

- [ ] **Step 3: Add a campfire image helper in `public/js/ui/campfire.js`**

Add this helper after `renderIngredientIcon`:

```js
function renderCampfireImage() {
  return `
    <img
      class="campfire-fireplace-img"
      src="/assets/sprites/objects/campfire.webp?v=${SPRITE_VERSION}"
      alt="Campfire"
      onerror="this.outerHTML='<div class=\\'campfire-fireplace-fallback\\'>🔥</div>'"
    >
  `;
}
```

- [ ] **Step 4: Update `renderSlotPreview` scene markup**

In `renderSlotPreview`, replace:

```js
    <div class="campfire-scene">
      <div class="campfire-scene-bg"></div>
      <div class="campfire-scene-ground"></div>
      <div class="campfire-flame-wrap">
        <div class="campfire-flame"></div>
        <div class="campfire-logs"></div>
      </div>
      <div class="campfire-slot-preview">
```

with:

```js
    <div class="campfire-scene campfire-scene--cooking">
      <div class="campfire-focus-wrap">
        ${renderCampfireImage()}
      </div>
      <div class="campfire-slot-preview">
```

- [ ] **Step 5: Update `renderCookedDishScene` scene markup**

In `renderCookedDishScene`, replace the same CSS-only background/flame block with:

```js
    <div class="campfire-scene campfire-scene--cooking">
      <div class="campfire-focus-wrap">
        ${renderCampfireImage()}
      </div>
      <div class="campfire-cooked-dish-display">
```

- [ ] **Step 6: Update `public/game.css` scene styles**

Adjust the campfire scene CSS so the overlay no longer paints its own full replacement background:

```css
.campfire-scene {
  position: absolute;
  inset: 0;
  z-index: 8;
  overflow: hidden;
  color: #fff;
  pointer-events: auto;
}

.campfire-scene--cooking {
  background: radial-gradient(circle at 50% 46%, rgba(255, 184, 76, 0.26), transparent 34%);
}

.campfire-focus-wrap {
  position: absolute;
  left: 50%;
  bottom: 34%;
  display: grid;
  width: 148px;
  height: 128px;
  place-items: center;
  transform: translateX(-50%) scale(1);
  animation: campfire-focus-in 320ms ease-out both;
}

.campfire-fireplace-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 0 18px rgba(255, 149, 49, 0.72));
}

.campfire-fireplace-fallback {
  display: grid;
  width: 96px;
  height: 96px;
  place-items: center;
  border-radius: 24px;
  background: rgba(255, 149, 49, 0.18);
  font-size: 3rem;
}

@keyframes campfire-focus-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.72);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}
```

Keep `.campfire-slot-preview`, `.campfire-slot-row`, `.campfire-slot`, and the lower `.campfire-panel` styles intact.

- [ ] **Step 7: Run focused UI tests and syntax/style sanity checks**

Run:

```bash
node --check public/js/ui/campfire.js && node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: syntax check passes and campfire UI tests pass.

## Task 7: Hide Exploration Party UI During Cooking Focus

**Files:**
- Modify: `public/js/ui/campfire.js`
- Modify: `public/game.css`
- Test: `tests/unit/ui/campfire.test.js`

- [ ] **Step 1: Write failing class-toggle tests**

Add this test after the yes-entry test:

```js
  it('toggles cooking focus class on the scene area only while cooking', async () => {
    campfire.renderForTest(sampleState(), {
      apiSkipCampfire: async () => ({ state: { phase: 'room' } }),
      completeCampfireAndProceed: async () => {},
    });

    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);

    actionArea.querySelector('.ui-btn').click();
    assert.match(sceneArea.className, /campfire-focus-active/);

    await actionArea.querySelector('.campfire-skip-btn').click();
    assert.doesNotMatch(sceneArea.className, /campfire-focus-active/);
  });
```

- [ ] **Step 2: Run the focused UI test and verify failure**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: FAIL because `campfire-focus-active` is never toggled.

- [ ] **Step 3: Add focus class helpers to `public/js/ui/campfire.js`**

Add these helpers near `renderCampfireScene`:

```js
function setCookingFocusActive(active) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;
  sceneArea.classList[active ? 'add' : 'remove']('campfire-focus-active');
}
```

Update `renderCampfireScene`:

```js
function renderCampfireScene(html) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;
  cleanup();
  setCookingFocusActive(true);
  sceneArea.insertAdjacentHTML('beforeend', html);
}
```

Update `cleanup`:

```js
export function cleanup() {
  const sceneArea = document.getElementById('scene-area');
  sceneArea?.querySelector('.campfire-scene')?.remove();
  setCookingFocusActive(false);
}
```

- [ ] **Step 4: Add CSS to fade player formation/HP during cooking**

Add to `public/game.css` near the campfire scene CSS:

```css
#scene-area.campfire-focus-active .player-formation,
#scene-area.campfire-focus-active .formation.player,
#scene-area.campfire-focus-active .creature-formation.player,
#scene-area.campfire-focus-active .hp-bar,
#scene-area.campfire-focus-active .mp-bar {
  opacity: 0;
  transition: opacity 220ms ease;
  pointer-events: none;
}
```

If the actual DOM class names differ during implementation, inspect the rendered formation markup and use the real existing class names. Do not add new HP bar systems.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --check public/js/ui/campfire.js && node --experimental-test-module-mocks --test tests/unit/ui/campfire.test.js
```

Expected: syntax check passes and campfire UI tests pass.

## Task 8: Final Verification

**Files:**
- Verify all modified JS files
- Verify focused unit tests
- Manual visual verification after user approval to open Playwright

- [ ] **Step 1: Run syntax checks**

Run:

```bash
node --check public/js/ui/campfire.js && node --check public/js/ui/exploration.js && node --check public/js/ui/room-transition.js && node --check src/routes/game/cooking.js
```

Expected: all checks pass with no output except successful command completion.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --experimental-test-module-mocks --test tests/unit/routes/cooking-routes.test.js tests/unit/ui/campfire.test.js tests/unit/ui/room-transition-scroll.test.js
```

Expected: all focused tests pass.

- [ ] **Step 3: Run broader unit tests if focused tests pass**

Run:

```bash
npm run test:unit
```

Expected: unit test suite passes.

- [ ] **Step 4: Ask before opening Playwright**

Ask the user for permission before opening a browser session for visual verification.

- [ ] **Step 5: Run dev server for manual verification**

After user approval, check existing terminals first. If no dev server is already running, run:

```bash
npm run dev
```

Verify Vite responds:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 6: Capture required screenshots and clean them up**

In Playwright/browser verification, navigate to a campfire room and capture screenshots for:

- campfire room entry with campfire sprite, party visible, English header, and `renderJpSentence`-rendered `はい` / `いいえ`;
- cooking zoom state with centered campfire, party hidden, scene-area five slots visible, and lower campfire ingredient UI visible;
- post-skip or post-feed progression into the next room.

Delete screenshot files immediately after they are shown.

## Self-Review

- Spec coverage: Covered API tokens, English header, rendered Japanese yes/no labels, no new prompt helper, generated transparent campfire asset, scene entry sprite, zoomed campfire scene, five scene slots, lower campfire UI reuse, completion/proceed flow, automated tests, and manual visual verification.
- Placeholder scan: No unresolved placeholder markers or open-ended implementation steps remain.
- Type consistency: The plan consistently uses `yesTokens`, `noTokens`, `displayMode`, `completeCampfireAndProceed`, `renderButtons`, `renderJpSentence`, and `CAMPFIRE_SPRITE_PATH`.
