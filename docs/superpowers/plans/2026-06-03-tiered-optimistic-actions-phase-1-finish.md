# Tiered Optimistic Actions Phase 1 Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the shipped Phase 1 optimistic-action blockers so Koto can safely move to medium-risk room and minigame optimistic commits.

**Architecture:** Keep the server authoritative and finish only the already-shipped or partially-shipped surfaces: confirmed PvP team selection, post-combat shop source consistency, cursor-era defend prediction, reveal-buffer proceed edges, and regression gates. This plan does not migrate Campfire, Word Discovery, Speed Review, Whack-a-Mole completion/skip, Kanji Kombat intro/completion, daily crystals, chests, crests, or fusion actions.

**Tech Stack:** Node.js, Express, Socket.IO, browser ES modules, shared deterministic combat modules, `node:test`, Koto optimistic action ledger and reveal-buffer helpers.

---

## Phase Boundary

Phase 1 is complete only when:

- PvP matchmaking ignores browser-sent team data and uses confirmed server-saved teams.
- Post-combat shop selection reads the same saved offer source that the UI renders on recovery.
- Cursor-era PvE defend prediction either runs through the existing shared full-defend resolver or has tests proving it is intentionally server-confirmed. This plan implements it.
- Remaining room-completion proceed paths either use the reveal-buffer optimistic envelope or have a documented server-confirmed fallback when no next room is buffered.
- Focused optimistic-action tests and `npm test` pass.
- `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md` is updated so its status section matches the implemented reality.

## File Map

Modify:

- `src/pvp/socket-handler.js` - resolve PvP selected teams from server-saved `gm.meta.pvpTeams`.
- `src/pvp/match-manager.js` - deep-clone selected team snapshots before storing them in active matches.
- `public/js/pvp-socket.js` - emit only the selected slot index.
- `public/js/ui/pvp-lobby.js` - stop sending browser-held `teamData`.
- `src/game/services/combat-cycle-service.js` - align post-combat shop roll/select sources.
- `public/js/ui/optimistic-combat-turn.js` - allow defend prediction while an ally action cursor is active.
- `public/js/ui/exploration.js` - centralize reveal-buffer proceed behavior and replace bare completion proceeds.
- `public/js/ui/whack-a-mole.js` - preserve existing completion handling after the centralized proceed wrapper is injected.
- `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md` - update Phase 1 status.
- `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md` - mark the Phase 1 gate complete after verification.

Create:

- `tests/unit/game/post-combat-shop-service.test.js` - service-level shop source tests.
- `tests/unit/pvp/socket-handler-team-selection.test.js` - socket helper tests for server-owned team selection.

Modify tests:

- `tests/unit/pvp/match-manager.test.js`
- `tests/unit/ui/optimistic-combat-turn.test.js`
- `tests/unit/game/combat-action-state.test.js`
- `tests/unit/ui/optimistic-run-integration.test.js`
- `tests/unit/ui/auto-proceed-room-transition.test.js`
- `tests/unit/ui/exploration-whack-a-mole.test.js`
- `tests/unit/routes/optimistic-run-routes.test.js`

## Task 1: Enforce Server-Saved PvP Teams

**Files:**

- Modify: `src/pvp/socket-handler.js`
- Modify: `src/pvp/match-manager.js`
- Modify: `public/js/pvp-socket.js`
- Modify: `public/js/ui/pvp-lobby.js`
- Create: `tests/unit/pvp/socket-handler-team-selection.test.js`
- Modify: `tests/unit/pvp/match-manager.test.js`

- [ ] **Step 1: Write failing socket selection helper tests**

Create `tests/unit/pvp/socket-handler-team-selection.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSavedPvpTeamSelection } from '../../../src/pvp/socket-handler.js';

function savedTeam(id) {
  return {
    creatureParty: {
      active: [{ id, hp: 10, maxHp: 10, level: 3 }],
      reserves: [],
    },
    partySkills: ['momentum'],
    itemBuffs: {},
  };
}

describe('resolveSavedPvpTeamSelection', () => {
  it('returns a deep clone of the saved team for a valid slot', () => {
    const gm = { meta: { pvpTeams: [savedTeam('hikaribon'), null, null] } };
    const selected = resolveSavedPvpTeamSelection(gm, 0);

    assert.equal(selected.creatureParty.active[0].id, 'hikaribon');
    selected.creatureParty.active[0].id = 'tampered';
    assert.equal(gm.meta.pvpTeams[0].creatureParty.active[0].id, 'hikaribon');
  });

  it('returns null for invalid or empty slots', () => {
    const gm = { meta: { pvpTeams: [savedTeam('hikaribon'), null, null] } };

    assert.equal(resolveSavedPvpTeamSelection(gm, 1), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, 3), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, -1), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, '0'), null);
    assert.equal(resolveSavedPvpTeamSelection(null, 0), null);
  });
});
```

- [ ] **Step 2: Write failing match-manager clone test**

Append this test inside the `selectTeam` describe block in `tests/unit/pvp/match-manager.test.js`. If there is no `selectTeam` describe block, place it near the existing team selection tests:

```js
  it('stores selected team data as a clone', () => {
    const mgr = new MatchManager();
    const code = mgr.createMatch('user1', 'sock1');
    const team = {
      creatureParty: {
        active: [{ id: 'hikaribon', hp: 10 }],
        reserves: [],
      },
      partySkills: ['momentum'],
    };

    assert.equal(mgr.selectTeam(code, 'user1', team), true);
    team.creatureParty.active[0].id = 'fake-client-mutation';

    assert.equal(mgr.getMatch(code).player1.team.creatureParty.active[0].id, 'hikaribon');
  });
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/pvp/socket-handler-team-selection.test.js tests/unit/pvp/match-manager.test.js
```

Expected: FAIL because `resolveSavedPvpTeamSelection` is not exported and `MatchManager.selectTeam()` stores the browser object by reference.

- [ ] **Step 4: Implement server-saved team resolution**

In `src/pvp/socket-handler.js`, add this exported helper near the top-level helper functions:

```js
function clonePvpTeam(team) {
  return team == null ? null : JSON.parse(JSON.stringify(team));
}

export function resolveSavedPvpTeamSelection(gm, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) return null;
  const team = gm?.meta?.pvpTeams?.[slotIndex] || null;
  return team ? clonePvpTeam(team) : null;
}
```

Replace the `pvp:select-team` socket handler with:

```js
    socket.on('pvp:select-team', ({ slotIndex } = {}) => {
      const found = mm.findMatchBySocket(socket.id);
      if (!found) return;

      const gm = getManager(socket.userId);
      const team = resolveSavedPvpTeamSelection(gm, slotIndex);
      if (!team) {
        socket.emit('pvp:error', { message: 'Choose a saved PvP team first' });
        return;
      }

      const selected = mm.selectTeam(found.code, socket.userId, team);
      if (!selected) {
        socket.emit('pvp:error', { message: 'Could not select that team' });
      }
    });
```

- [ ] **Step 5: Clone teams in the match manager**

In `src/pvp/match-manager.js`, add this helper near the constants:

```js
function cloneTeamData(teamData) {
  return teamData == null ? null : JSON.parse(JSON.stringify(teamData));
}
```

Change `selectTeam()` from:

```js
    player.team = teamData;
```

to:

```js
    player.team = cloneTeamData(teamData);
```

- [ ] **Step 6: Stop sending browser-held team snapshots**

In `public/js/pvp-socket.js`, replace:

```js
/** Send selected team data to server. */
export function selectTeam(slotIndex, teamData) {
  socket?.emit('pvp:select-team', { slotIndex, teamData });
}
```

with:

```js
/** Send selected saved team slot to server. */
export function selectTeam(slotIndex) {
  socket?.emit('pvp:select-team', { slotIndex });
}
```

In `public/js/ui/pvp-lobby.js`, replace:

```js
      const team = teams[selectedSlot];
      pvpSocket.selectTeam(selectedSlot, team);
```

with:

```js
      pvpSocket.selectTeam(selectedSlot);
```

- [ ] **Step 7: Run focused verification**

Run:

```bash
npm run test:unit -- tests/unit/pvp/socket-handler-team-selection.test.js tests/unit/pvp/match-manager.test.js
node --check src/pvp/socket-handler.js && node --check src/pvp/match-manager.js && node --check public/js/pvp-socket.js && node --check public/js/ui/pvp-lobby.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add src/pvp/socket-handler.js src/pvp/match-manager.js public/js/pvp-socket.js public/js/ui/pvp-lobby.js tests/unit/pvp/socket-handler-team-selection.test.js tests/unit/pvp/match-manager.test.js
/usr/bin/git commit -m "fix: select pvp teams from saved server state"
```

## Task 2: Align Post-Combat Shop Offer Source

**Files:**

- Modify: `src/game/services/combat-cycle-service.js`
- Create: `tests/unit/game/post-combat-shop-service.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`
- Modify: `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md`

This task keeps the post-combat shop disabled as a random post-victory reward, matching the current MVP comment. It finishes Phase 1 by making the persisted recovery source and selection source consistent whenever `run.postCombatShop.active` exists.

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/game/post-combat-shop-service.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';

function makeCreature(overrides = {}) {
  return {
    id: 'hikaribon',
    name: '光',
    nameEn: 'Hikaribon',
    level: 3,
    hp: 5,
    maxHp: 10,
    mp: 2,
    maxMp: 10,
    ...overrides,
  };
}

function makeGameManager(item) {
  return {
    run: {
      currentAreaEncounters: 0,
      runSummary: { itemsCollected: 0 },
      creatureParty: {
        active: [makeCreature()],
        reserves: [],
      },
      postCombatShop: {
        active: true,
        items: [item],
      },
    },
    meta: { itemsDiscovered: [] },
    emitState() {},
  };
}

describe('post-combat shop source consistency', () => {
  it('returns persisted postCombatShop items for reload recovery', () => {
    const item = {
      id: 'small-heal',
      word: '薬',
      rarity: 'common',
      type: 'heal',
      effect: { healPercent: 0.5 },
    };
    const gm = makeGameManager(item);
    const service = new CombatCycleService(gm);

    assert.deepEqual(service.rollPostCombatShop(), { items: [item] });
  });

  it('selects from persisted postCombatShop items and clears the active shop', () => {
    const item = {
      id: 'small-heal',
      word: '薬',
      rarity: 'common',
      type: 'heal',
      effect: { healPercent: 0.5 },
    };
    const gm = makeGameManager(item);
    const service = new CombatCycleService(gm);

    const result = service.selectShopItem(0, 0);

    assert.equal(result.selected.id, 'small-heal');
    assert.equal(gm.run.creatureParty.active[0].hp, 10);
    assert.equal(gm.run.postCombatShop, null);
    assert.equal(gm.run._pendingShopItems, null);
    assert.equal(gm.run.runSummary.itemsCollected, 1);
    assert.deepEqual(gm.meta.itemsDiscovered, ['small-heal']);
  });

  it('keeps the disabled random roll path disabled when no shop is active', () => {
    const gm = makeGameManager({ id: 'small-heal', type: 'heal', effect: { healPercent: 0.5 } });
    gm.run.postCombatShop = null;
    const service = new CombatCycleService(gm);

    assert.equal(service.rollPostCombatShop(), null);
  });
});
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
npm run test:unit -- tests/unit/game/post-combat-shop-service.test.js
```

Expected: FAIL because `selectShopItem()` reads `run._pendingShopItems` instead of `run.postCombatShop.items`.

- [ ] **Step 3: Implement a canonical active shop helper**

In `src/game/services/combat-cycle-service.js`, add this helper near `serializeBefriendPrompt()` or above the class:

```js
function getActivePostCombatShopItems(run) {
  if (!run) return null;
  if (run.postCombatShop?.active === true && Array.isArray(run.postCombatShop.items)) {
    return run.postCombatShop.items;
  }
  if (Array.isArray(run._pendingShopItems) && run._pendingShopItems.length > 0) {
    run.postCombatShop = { active: true, items: run._pendingShopItems };
    return run.postCombatShop.items;
  }
  return null;
}
```

Replace `rollPostCombatShop()` with:

```js
  rollPostCombatShop() {
    const items = getActivePostCombatShopItems(this.gm.run);
    return items?.length ? { items } : null;
  }
```

Replace the first lines of `selectShopItem()`:

```js
    const items = this.gm.run._pendingShopItems;
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');
```

with:

```js
    const items = getActivePostCombatShopItems(this.gm.run);
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');
```

Keep the existing cleanup:

```js
    this.gm.run._pendingShopItems = null;
    this.gm.run.postCombatShop = null;
```

- [ ] **Step 4: Update route duplicate test coverage**

In `tests/unit/routes/optimistic-run-routes.test.js`, add this test near the existing post-combat shop route tests:

```js
  it('selects post-combat shop items from persisted active shop state', async () => {
    const item = { id: 'small-heal', type: 'heal', effect: { healPercent: 0.5 }, rarity: 'common' };
    const run = {
      postCombatShop: { active: true, items: [item] },
      creatureParty: { active: [{ id: 'hi', hp: 5, maxHp: 10, level: 1 }], reserves: [] },
      runSummary: { itemsCollected: 0 },
      currentAreaEncounters: 0,
    };
    const gm = {
      run,
      meta: { actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
      emitState() {},
    };
    gm.combatCycleService = new CombatCycleService(gm);
    const handler = getHandler(createCombatRouter(), 'post', '/creature-shop-select');
    const res = makeRes();

    await handler({
      body: { actionId: actionId('shopactive'), itemIndex: 0, targetIndex: 0 },
      gameManager: gm,
      saveGame: () => {},
      getEnrichedGameState: () => ({ phase: 'room', run: { postCombatShop: run.postCombatShop } }),
    }, res);

    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.selected.id, 'small-heal');
    assert.equal(run.creatureParty.active[0].hp, 10);
    assert.equal(run.postCombatShop, null);
  });
```

Add this import to the top of the same file:

```js
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
```

- [ ] **Step 5: Update the design spec status**

In `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md`, replace the post-combat shop status sentence in **Current Optimistic Actions** with:

```md
Post-combat shop selection is wired through the optimistic route, API, UI, and tests. The random post-victory shop remains disabled for the current MVP, but reload recovery and selection now use the same persisted `run.postCombatShop.items` source when an active shop is present.
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:unit -- tests/unit/game/post-combat-shop-service.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/post-combat-shop.test.js
node --check src/game/services/combat-cycle-service.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add src/game/services/combat-cycle-service.js tests/unit/game/post-combat-shop-service.test.js tests/unit/routes/optimistic-run-routes.test.js docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md
/usr/bin/git commit -m "fix: align post combat shop selection source"
```

## Task 3: Enable Cursor-Era Defend Prediction

**Files:**

- Modify: `public/js/ui/optimistic-combat-turn.js`
- Modify: `tests/unit/ui/optimistic-combat-turn.test.js`
- Modify: `tests/unit/game/combat-action-state.test.js`
- Modify: `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md`

- [ ] **Step 1: Write failing browser-side prediction test**

Append this test in `tests/unit/ui/optimistic-combat-turn.test.js` near the existing cursor tests:

```js
  it('predicts defend while an ally action cursor is active by using the full defend resolver', () => {
    const move = {
      id: 'tap',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 5,
      mpCost: 0,
      accuracy: 100,
    };
    const ally = {
      id: 'hi',
      name: '火',
      nameEn: 'Fire',
      reading: 'ひ',
      element: 'fire',
      hp: 20,
      maxHp: 20,
      mp: 5,
      maxMp: 10,
      level: 2,
      attack: 10,
      defense: 10,
      dex: 10,
      moves: [move],
    };
    const enemy = {
      id: 'mizu',
      name: '水',
      nameEn: 'Water',
      reading: 'みず',
      element: 'water',
      hp: 20,
      maxHp: 20,
      mp: 5,
      maxMp: 10,
      level: 1,
      attack: 5,
      defense: 5,
      dex: 5,
      moves: [move],
    };
    const cursorState = state({
      combat: {
        active: true,
        allies: [ally],
        enemies: [enemy],
        actionCursor: { side: 'ally', index: 0, opening: false },
        optimistic: { combatId: 'cmb_defend_cursor', stateVersion: 3, nextTurnSeed: 'seed_defend_cursor' },
      },
      run: {
        creatureParty: { active: [ally], reserves: [] },
        partySkills: [],
        itemBuffs: null,
      },
    });

    assert.equal(canRunOptimisticPveTurn(cursorState, 'defend'), true);
    const result = buildOptimisticCombatTurn({
      state: cursorState,
      actionType: 'defend',
      moveChoices: [],
      actionId: 'act_defend_cursor',
    });

    assert.ok(result);
    assert.equal(result.envelope.payload.actionType, 'defend');
    assert.equal(result.localTranscript.actionType, 'defend');
    assert.equal(result.localTranscript.playerAttacks.length, 0);
    assert.ok(result.localTranscript.enemyAttacks.length > 0);
  });
```

- [ ] **Step 2: Write failing server acceptance test**

Append this test in `tests/unit/game/combat-action-state.test.js` near the existing defend prediction tests:

```js
  it('accepts browser shared-core optimistic defend predictions when action cursor is active', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'defend',
      moveChoices: [],
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_cursor_defend',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.defend',
      payload: { actionType: 'defend', moveChoices: [], predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.actionType, 'defend');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
  });
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-combat-turn.test.js tests/unit/game/combat-action-state.test.js
```

Expected: FAIL because `canPredictActionCursor()` rejects defend and `buildOptimisticCombatTurn()` calls `resolvePveCursorTurn()` for defend.

- [ ] **Step 4: Implement defend prediction on the client**

In `public/js/ui/optimistic-combat-turn.js`, replace `canPredictActionCursor()` with:

```js
function canPredictActionCursor(state, actionType) {
  const cursor = state?.combat?.actionCursor;
  if (!cursor) return true;
  if (actionType === 'defend') {
    return cursor.side === 'ally' && Number.isInteger(cursor.index);
  }
  return actionType === 'attack'
    && cursor.side === 'ally'
    && Number.isInteger(cursor.index);
}
```

In `buildOptimisticCombatTurn()`, replace the resolver choice:

```js
    resolved = state.combat.actionCursor
      ? resolvePveCursorTurn(
          { combat: state.combat, run: state.run, moveChoices },
          { actionType, seed },
        )
      : resolvePveTurn({
          snapshot: { combat: state.combat, run: state.run },
          actionType,
          moveChoices,
          seed,
          processKoSwaps: true,
        });
```

with:

```js
    resolved = state.combat.actionCursor && actionType === 'attack'
      ? resolvePveCursorTurn(
          { combat: state.combat, run: state.run, moveChoices },
          { actionType, seed },
        )
      : resolvePveTurn({
          snapshot: { combat: state.combat, run: state.run },
          actionType,
          moveChoices,
          seed,
          processKoSwaps: true,
        });
```

The server already uses the same `actionType === 'attack' && actionCursor` condition in `verifyAndCommitCreatureCombatCycle()`, so no server code change should be needed unless the new test exposes a mismatch.

- [ ] **Step 5: Update the design spec status**

In the spec's `Partial` section, remove or rewrite the cursor-era defend sentence so it states:

```md
PvE defend prediction supports cursor-era creature encounters by predicting the full defend turn through the shared deterministic resolver. Unsafe KO swap/removal cases still correct through the existing safe-prediction blockers.
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-combat-turn.test.js tests/unit/game/combat-action-state.test.js tests/unit/ui/combat-network-hardening.test.js
node --check public/js/ui/optimistic-combat-turn.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add public/js/ui/optimistic-combat-turn.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/game/combat-action-state.test.js docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md
/usr/bin/git commit -m "fix: predict cursor-era defend turns"
```

## Task 4: Convert Remaining Room Proceed Edges

**Files:**

- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/whack-a-mole.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`
- Modify: `tests/unit/ui/auto-proceed-room-transition.test.js`
- Modify: `tests/unit/ui/exploration-whack-a-mole.test.js`

- [ ] **Step 1: Add source-level tests for bare proceed removal**

In `tests/unit/ui/optimistic-run-integration.test.js`, add:

```js
  it('uses the reveal-buffer proceed helper for completed room flows', () => {
    assert.match(explorationSource, /export async function proceedWithRevealBuffer/);
    assert.match(explorationSource, /renderQuiz[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /discovery\.completed[\s\S]*proceedWithRevealBuffer\(\)/);
    assert.match(explorationSource, /room\?\.interacted[\s\S]*proceedWithRevealBuffer\(\)/);
  });
```

In `tests/unit/ui/auto-proceed-room-transition.test.js`, keep the existing assertion that optimistic proceed sends:

```js
apiProceed({ actionId: pending.actionId, fromRoom, actionSeq })
```

and add an assertion that the helper starts verification before transition:

```js
const verificationIndex = autoProceedSrc.indexOf('const verification = apiProceed({ actionId: pending.actionId, fromRoom, actionSeq })');
const transitionIndex = autoProceedSrc.indexOf('await playRoomTransition(pending.state');
assert.ok(verificationIndex >= 0 && verificationIndex < transitionIndex);
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/exploration-whack-a-mole.test.js
```

Expected: FAIL because completed-room paths still call bare `apiProceed()`.

- [ ] **Step 3: Extract the shared proceed helper**

In `public/js/ui/exploration.js`, replace the private `async function proceedToNextRoom()` declaration with:

```js
export async function proceedWithRevealBuffer({ refreshUi = true } = {}) {
  const state = getGameState();
  const fromRoom = state.run?.currentRoom;
  const actionSeq = state.run?.roomActionSeq;
  const nextRoom = getNextRoom(state);
  if (nextRoom) {
    const pending = beginPendingRunAction({
      actionType: 'run.proceed',
      applyLocal: draft => {
        advanceStateToBufferedNextRoom(draft);
      },
    });
    if (!pending) return null;

    clearActionArea();
    const verification = apiProceed({ actionId: pending.actionId, fromRoom, actionSeq })
      .then(result => ({ result }))
      .catch(error => ({ error }));

    try {
      await playRoomTransition(pending.state, { ingredientDrops: [] });
      const { result, error } = await verification;
      if (error) throw error;
      if (!reconcilePendingRunAction(pending, result)) {
        rollbackPendingRunAction(pending);
        return result || null;
      }
      const ingredientDrops = result?.ingredientDrops || result?.room?.ingredientDrops || [];
      if (ingredientDrops.length > 0) {
        showIngredientDropPopups(ingredientDrops);
      }
      if (refreshUi) updateUI();
      return result || null;
    } catch {
      rollbackPendingRunAction(pending);
      if (refreshUi) updateUI();
      return null;
    }
  }

  const result = await apiProceed();
  if (result?.state) {
    updateGameState(result.state);
    await playRoomTransition(result.state, {
      ingredientDrops: result.ingredientDrops || result.room?.ingredientDrops || [],
    });
    if (refreshUi) updateUI();
  }
  return result || null;
}

async function proceedToNextRoom() {
  return proceedWithRevealBuffer();
}
```

- [ ] **Step 4: Replace completed-room bare proceeds**

In `renderQuiz()`, replace the whole bare `apiProceed()` block with:

```js
  await proceedWithRevealBuffer();
```

In the `if (discovery.completed)` button handler, replace the bare `apiProceed()` block with:

```js
        await proceedWithRevealBuffer();
```

In `renderWhackAMole()`, inside the `if (room?.interacted)` branch, replace the bare `apiProceed()` block with:

```js
      await proceedWithRevealBuffer();
```

Keep the existing `catch` and `updateUI()` recovery behavior for that branch.

- [ ] **Step 5: Pass the helper into Whack-a-Mole completion**

In `startWhackAMoleGame()` in `public/js/ui/exploration.js`, replace:

```js
    apiProceed,
```

with:

```js
    apiProceed: () => proceedWithRevealBuffer({ refreshUi: false }),
```

In `public/js/ui/whack-a-mole.js`, after `const advanced = await this.apiProceed();`, keep the existing `advanced?.state` handling. The helper returns the same server response when verification succeeds; if it already updated local state during the optimistic path, re-applying `advanced.state` is harmless and preserves existing test expectations.

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:unit -- tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/room-reveal-buffer-client.test.js
node --check public/js/ui/exploration.js && node --check public/js/ui/whack-a-mole.js
```

Expected: PASS.

Manual visual verification is required because this changes room travel. Ask the user before opening a browser. Verify one normal `Proceed` and one already-completed room auto-proceed with screenshots, then delete screenshot files before completion.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add public/js/ui/exploration.js public/js/ui/whack-a-mole.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/exploration-whack-a-mole.test.js
/usr/bin/git commit -m "fix: use reveal buffer proceed on completion edges"
```

## Task 5: Baseline Gate And Status Update

**Files:**

- Modify: `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md`
- Modify: `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`

- [ ] **Step 1: Run focused optimistic-action tests**

Run:

```bash
npm run test:unit -- tests/unit/game/action-ledger-service.test.js tests/unit/routes/optimistic-action-response.test.js tests/unit/routes/optimistic-run-routes.test.js tests/unit/ui/optimistic-run-action.test.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/optimistic-combat-turn.test.js tests/unit/ui/combat-network-hardening.test.js tests/unit/pvp/socket-handler-team-selection.test.js tests/unit/game/post-combat-shop-service.test.js
```

Expected: PASS.

- [ ] **Step 2: Run touched-area tests**

Run:

```bash
npm run test:unit -- tests/unit/routes/pvp.test.js tests/unit/pvp/match-manager.test.js tests/unit/ui/pvp-team-save-feedback.test.js tests/unit/ui/exploration-skill-master.test.js tests/unit/ui/exploration-shrine.test.js tests/unit/ui/exploration-friendly-npc.test.js tests/unit/ui/exploration-whack-a-mole.test.js tests/unit/ui/post-combat-shop.test.js tests/unit/game/combat-action-state.test.js
```

Expected: PASS.

- [ ] **Step 3: Run the full merge gate**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Update status docs**

In `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md`:

- Move PvP matchmaking from `Still Needed` to `Completed`.
- Move cursor-era PvE defend prediction from `Partial` to `Completed`.
- Change post-combat shop from `Partial` to "wired and source-consistent when active; random post-victory shop remains disabled for MVP."
- Change reveal-buffer edge paths from `Partial` to "main and completed-room proceed paths use reveal-buffer envelopes; no full future `run.rooms` exposure."

In `docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md`, mark Phase 1 complete and add a progress log row with the focused test command, touched-area command, and `npm test` result.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md docs/superpowers/plans/2026-06-03-tiered-optimistic-actions-stability-roadmap.md
/usr/bin/git commit -m "docs: mark optimistic actions phase 1 complete"
```

## Execution Notes

Before executing this plan, create an isolated worktree from `dev`:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-optimistic-phase-1-finish -b fix/optimistic-phase-1-finish
cd ../koto-wt-optimistic-phase-1-finish
```

If a task changes visible UI or animation, ask before launching browser playtesting. Use `npm run dev`, navigate to `http://localhost:5173`, capture screenshots for evidence, and delete screenshot files in the same session.

After all tasks pass and are committed, run:

```bash
/usr/bin/git status --short --branch
```

Expected: clean worktree except for unrelated pre-existing files.
