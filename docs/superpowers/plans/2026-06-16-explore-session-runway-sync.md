# Explore Session Runway Sync Implementation Plan

> **Status 2026-07-03:** partially executed and merged to dev on 2026-06-16 (server runway, `/api/game/explore/sync`, client session, support-room cutover — checkboxes below were never ticked but the work landed; see `git log 02914f7a..fe180dca`). The combat boundary, real acceptance harness, and cleanup were NOT completed. Superseded for all remaining work by `docs/superpowers/specs/2026-07-03-explore-subway-stability-design.md` and its plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild regular explore mode around a server-prepared current-plus-five runway, an in-memory client action log, and one batched checkpoint sync path so prepared rooms remain playable through short network gaps.

**Architecture:** Keep canonical run state on the server, expose a new `exploreRunway` beside the legacy `revealedRooms`, and route new client room actions through `public/js/ui/explore-session.js`. The plan fills the spec review gaps by defining epoch rotation, `roomActionSeq` semantics, dependency pause rules, frame-safe entry payloads, compatibility behavior, and combat-start boundaries. Existing legacy endpoints remain as compatibility paths until the session client is fully cut over.

**Tech Stack:** Node.js, Express routers, ES modules, browser JS modules, `node:test`, Playwright smoke harness, existing Koto game state/services/dialogue/audio systems.

---

## Plan Decisions From Spec Review

- **Epoch lifecycle:** `run.exploreSessionEpoch` is created for active regular explore runs. `GET /api/game/state` rotates it for active regular explore, matching Kanji Kombat reload semantics: a reload loses unsynced local entries and server truth wins. The live client must call `getExploreSession()?.syncNow()` before any reconnect/recovery state refetch so an in-memory log drains before that rotation can invalidate it. `/api/game/explore/sync` does not rotate the epoch on successful checkpoints.
- **Action sequence rule:** `roomActionSeq` is a room-entry sequence. Every entry carries the `actionSeq` that was current when the entry's `roomIndex` became current. Only `proceed` increments `run.roomActionSeq`. Multiple support-room actions in the same room use the same `actionSeq`; entries after a locally predicted `proceed` use `actionSeq + 1`.
- **Runway compatibility:** Keep `run.revealedRooms` current-plus-one for old client paths until cleanup. Add `run.exploreRunway.preparedRooms` current-plus-five for the new client path. Do not replace `revealedRooms` in the server state until all old client renderers stop using it.
- **Frame safety:** New session entry payloads do not ship raw static Japanese room-entry narration from `getRoomEntryNarration()`. Entry payloads may include `narrationFrame: null`; frame-backed room dialogue must come from the frames pipeline and be selected against known vocabulary before it is included.
- **Dependency pause rule:** Locally accepted actions advertise predicted effect tags such as `credits`, `ingredients`, `partyStats`, `partySkills`, `srs`, and `areaProgress`. The server includes an `actionEffects` map on each prepared room so the client does not maintain a second hardcoded action-effect table. A later prepared room advertises dependency tags. If unsynced effect tags intersect the next room's dependencies, the client soft-pauses until checkpoint sync refreshes the runway.
- **Combat boundary:** Encounter, boss, and NPC-battle rooms render from the runway, but starting PvE combat is a checkpoint boundary in this phase. The client may show a responsive button immediately, then must sync before entering combat. `encounter.start`, `npcBattle.start`, and `boss.start` are not locally accepted session-log actions. No offline combat start state is pre-generated in this plan.
- **Support-room replay completeness:** Every action in `acceptedActions` must have a server performer and an `applyExploreEntry()` case in the same task that cuts the client over. This explicitly includes `shrine.choose`, `skillMaster.choose`, `npcBattleSkill.choose`, `dealer.sell`, `dealer.buy`, `dealer.leave`, `campfire.cook`, `campfire.feed`, `campfire.skip`, `speedReview.commit`, `speedReview.complete`, `wordDiscovery.complete`, and the Task 10 `wordDiscovery.review` path.
- **Harness gating:** The Playwright subway harness is committed as an on-demand smoke script and is allowed to fail until the cutover task. It must not enter the default `npm test` gate until Task 12 turns it green.

## File Map

Create:

- `src/game/services/explore-session-contract.js` — shared constants, action validation helpers, clone helpers, dependency tags, epoch helpers, and response builders.
- `src/game/services/friendly-npc-offers.js` — reusable friendly-NPC offer roller; moved out of `exploration-service.js` to avoid an ESM cycle with the runway builder.
- `src/game/services/explore-runway-service.js` — server runway builder and per-room payload builders.
- `src/game/services/explore-session-sync-service.js` — ordered batch replay service for `/api/game/explore/sync`.
- `src/routes/game/explore-session.js` — Express route for the new sync endpoint.
- `public/js/ui/explore-session.js` — client action log, runway store, dependency pause, single-flight syncer, checkpoint/correction handling.
- `tests/unit/game/explore-session-contract.test.js` — unit coverage for sequence, epoch, and response helpers.
- `tests/unit/game/explore-runway-service.test.js` — runway builder coverage.
- `tests/unit/game/explore-session-sync-service.test.js` — batch replay coverage.
- `tests/unit/ui/explore-session.test.js` — client syncer coverage.
- `tests/smoke/explore-subway-runway.test.js` — on-demand Playwright subway harness.

Modify:

- `src/game/loop.js` — expose `exploreRunway`, keep legacy `revealedRooms`, and rotate/update runways during state enrichment.
- `src/game/services/exploration-service.js` — delegate runway preparation and expose reusable action performers for sync.
- `src/routes/game/index.js` — mount `/api/game/explore/sync`.
- `src/routes/game/state.js` — rotate explore session epoch on state fetch for active regular explore.
- `src/routes/game/run.js` — extract payload-building/action helper functions reused by legacy routes and sync.
- `src/routes/game/economy.js` — make dealer leave idempotent via shared action helper.
- `src/routes/game/known-words.js` — expose a reusable review performer for word-discovery sync entries.
- `src/routes/game/cooking.js` — expose campfire payload/action helpers for runway and sync reuse.
- `public/js/api.js` — add `syncExploreSession()` and keep legacy methods for compatibility.
- `public/game.js` — import/pass the explore sync API, wire online/visibility drains, and drain before recovery state refetches.
- `public/js/ui/exploration.js` — adopt the session for proceed, friendly NPC, shrine, skill master, whack-a-mole, speed review, and word discovery.
- `public/js/ui/campfire.js` — accept prepared payloads and record session actions instead of owning `pendingCampfireActionId`.
- `public/js/ui/economy.js` — accept prepared payloads and record session actions instead of owning `pendingDealerActionId`.
- `public/js/ui/connection-banner.js` or `public/js/ui/exploration.js` — show one spotty-connection soft pause.
- `tests/integration/flows/exploration.test.js` — keep legacy reveal assertions and add runway assertions.
- `tests/integration/flows/explore-session-sync.test.js` — integration coverage for `/api/game/explore/sync`.
- `tests/unit/ui/optimistic-run-integration.test.js` — replace old pending-action source assertions with session-source assertions after cutover.

Read-only / preserve:

- `src/game/room-reveal-buffer.js` — preserve current-plus-one legacy reveal behavior unless a later task explicitly changes compatibility tests.

## Contracts To Preserve

### Explore Runway Shape

```js
{
  sessionEpoch: 'ese_0123456789abcdef',
  roomActionSeq: 12,
  currentRoom: 8,
  preparedAhead: 5,
  preparedRooms: [
    {
      index: 8,
      roomId: 'hajimari-no-hiroba_room9',
      actionSeq: 12,
      room: { id: 'hajimari-no-hiroba_room9', type: 'friendlyNpc', interacted: false },
      entryPayload: {
        background: 'areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp',
        subArea: null,
        ingredientDrops: [],
        narrationFrame: null
      },
      interactionPayload: {
        kind: 'friendlyNpc',
        npc: { id: 'cid', name: 'シド', nameEn: 'Cid' },
        offered: [],
        greeting: null
      },
      dependencies: [],
      acceptedActions: ['friendlyNpc.choose'],
      offlineReady: true,
      missingPayloadReasons: []
    }
  ]
}
```

### Explore Session Entry Shape

```js
{
  seq: 17,
  actionId: 'run_es_00000017',
  kind: 'friendlyNpc.choose',
  roomIndex: 8,
  roomId: 'hajimari-no-hiroba_room9',
  actionSeq: 12,
  payload: {
    itemId: 'iron-charm',
    targetCreatureIndex: 0
  },
  predictedEffects: ['partyStats'],
  createdAt: 1780000000000
}
```

### Response Shape

```js
{
  status: 'ok',
  confirmedThroughSeq: 17,
  rejectedSeq: null,
  reason: null,
  results: [{ seq: 17, actionId: 'run_es_00000017', kind: 'friendlyNpc.choose', replayed: false }],
  state,
  exploreRunway
}
```

## Task 0: Create Isolated Implementation Worktree

**Files:**

- Read: `docs/superpowers/specs/2026-06-15-explore-session-runway-sync-design.md`

- [ ] **Step 1: Sync `dev`**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
```

Expected: `Already up to date.` or a fast-forward update from `origin/dev`.

- [ ] **Step 2: Create the feature worktree**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git worktree add ../koto-wt-explore-session-runway -b feature/explore-session-runway-sync
cd ../koto-wt-explore-session-runway
```

Expected: a new worktree on branch `feature/explore-session-runway-sync`.

- [ ] **Step 3: Install dependencies if needed**

Run:

```bash
npm install
```

Expected: dependencies are installed with no audit-breaking install failure.

## Task 1: Shared Contract Helpers

**Files:**

- Create: `src/game/services/explore-session-contract.js`
- Create: `tests/unit/game/explore-session-contract.test.js`

- [ ] **Step 1: Write failing contract tests**

Create `tests/unit/game/explore-session-contract.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_RUNWAY_AHEAD,
  EXPLORE_SESSION_HARD_CAP,
  createExploreSessionEpoch,
  ensureExploreSessionEpoch,
  expectedActionSeqForEntry,
  isExploreSessionActionId,
  makeExploreCorrection,
  predictedEffectsForAction,
  roomDependenciesForType,
} from '../../../src/game/services/explore-session-contract.js';

test('exports runway and client log limits', () => {
  assert.equal(EXPLORE_RUNWAY_AHEAD, 5);
  assert.equal(EXPLORE_SESSION_HARD_CAP, 50);
});

test('creates and preserves explore session epochs', () => {
  const run = {};
  const epoch = ensureExploreSessionEpoch(run);
  assert.match(epoch, /^ese_[0-9a-f]{16}$/);
  assert.equal(ensureExploreSessionEpoch(run), epoch);
  const rotated = createExploreSessionEpoch();
  assert.match(rotated, /^ese_[0-9a-f]{16}$/);
  assert.notEqual(rotated, epoch);
});

test('validates session action ids with the existing run action prefix shape', () => {
  assert.equal(isExploreSessionActionId('run_es_00000001'), true);
  assert.equal(isExploreSessionActionId('bad'), false);
  assert.equal(isExploreSessionActionId('__proto__'), false);
});

test('computes expected action seq from room entry sequence plus predicted proceeds', () => {
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 0 }), 7);
  assert.equal(expectedActionSeqForEntry({ baseActionSeq: 7, localProceedCount: 3 }), 10);
});

test('maps predicted effects and dependencies for pause decisions', () => {
  assert.deepEqual(predictedEffectsForAction('dealer.sell'), ['credits']);
  assert.deepEqual(predictedEffectsForAction('campfire.feed'), ['partyStats', 'ingredients']);
  assert.deepEqual(roomDependenciesForType('dealer'), ['credits']);
  assert.deepEqual(roomDependenciesForType('encounter'), ['partyStats', 'partySkills']);
  assert.deepEqual(predictedEffectsForAction('encounter.start'), []);
});

test('builds complete correction responses', () => {
  const response = makeExploreCorrection({
    reason: 'session_epoch_mismatch',
    rejectedSeq: 3,
    confirmedThroughSeq: 2,
    state: { phase: 'room' },
    exploreRunway: { preparedRooms: [] },
  });
  assert.equal(response.status, 'corrected');
  assert.equal(response.reason, 'session_epoch_mismatch');
  assert.equal(response.rejectedSeq, 3);
  assert.equal(response.confirmedThroughSeq, 2);
  assert.deepEqual(response.state, { phase: 'room' });
  assert.deepEqual(response.exploreRunway, { preparedRooms: [] });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/unit/game/explore-session-contract.test.js
```

Expected: FAIL with `Cannot find module ... explore-session-contract.js`.
The missing module path should end in `src/game/services/explore-session-contract.js`.

- [ ] **Step 3: Implement the contract module**

Create `src/game/services/explore-session-contract.js`:

```js
import { randomBytes } from 'crypto';
import { isActionId } from '../../shared/action-protocol.js';

export const EXPLORE_RUNWAY_AHEAD = 5;
export const EXPLORE_LEGACY_REVEAL_AHEAD = 1;
export const EXPLORE_SESSION_HARD_CAP = 50;
export const EXPLORE_SESSION_RESUME_AT = 40;
export const EXPLORE_SYNC_DEBOUNCE_MS = 300;
export const EXPLORE_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

export const EXPLORE_EFFECTS = Object.freeze({
  CREDITS: 'credits',
  INGREDIENTS: 'ingredients',
  PARTY_STATS: 'partyStats',
  PARTY_SKILLS: 'partySkills',
  SRS: 'srs',
  AREA_PROGRESS: 'areaProgress',
});

const ACTION_EFFECTS = Object.freeze({
  proceed: [EXPLORE_EFFECTS.INGREDIENTS, EXPLORE_EFFECTS.AREA_PROGRESS],
  'friendlyNpc.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'shrine.choose': [EXPLORE_EFFECTS.PARTY_STATS],
  'skillMaster.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'npcBattleSkill.choose': [EXPLORE_EFFECTS.PARTY_SKILLS],
  'whackAMole.complete': [EXPLORE_EFFECTS.CREDITS],
  'whackAMole.skip': [],
  'campfire.cook': [EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.feed': [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.INGREDIENTS],
  'campfire.skip': [],
  'speedReview.commit': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'speedReview.complete': [EXPLORE_EFFECTS.SRS, EXPLORE_EFFECTS.PARTY_STATS],
  'wordDiscovery.review': [EXPLORE_EFFECTS.SRS],
  'wordDiscovery.complete': [],
  'dealer.sell': [EXPLORE_EFFECTS.CREDITS],
  'dealer.buy': [EXPLORE_EFFECTS.CREDITS, EXPLORE_EFFECTS.PARTY_STATS],
  'dealer.leave': [],
});

const ROOM_DEPENDENCIES = Object.freeze({
  encounter: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
  boss: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
  npcBattle: [EXPLORE_EFFECTS.PARTY_STATS, EXPLORE_EFFECTS.PARTY_SKILLS],
  campfire: [EXPLORE_EFFECTS.INGREDIENTS, EXPLORE_EFFECTS.PARTY_STATS],
  dealer: [EXPLORE_EFFECTS.CREDITS],
  speedReviewRoom: [EXPLORE_EFFECTS.SRS],
  wordDiscovery: [EXPLORE_EFFECTS.SRS],
  friendlyNpc: [],
  shrine: [EXPLORE_EFFECTS.PARTY_STATS],
  skillMaster: [EXPLORE_EFFECTS.PARTY_SKILLS],
  whackAMole: [],
  room: [],
});

export function cloneExploreValue(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function createExploreSessionEpoch() {
  return `ese_${randomBytes(8).toString('hex')}`;
}

export function ensureExploreSessionEpoch(run) {
  if (!run || typeof run !== 'object') return null;
  if (!/^ese_[0-9a-f]{16}$/.test(run.exploreSessionEpoch || '')) {
    run.exploreSessionEpoch = createExploreSessionEpoch();
  }
  return run.exploreSessionEpoch;
}

export function rotateExploreSessionEpoch(run) {
  if (!run || typeof run !== 'object') return null;
  run.exploreSessionEpoch = createExploreSessionEpoch();
  return run.exploreSessionEpoch;
}

export function isExploreSessionActionId(actionId) {
  return isActionId(actionId) && /^run_[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(actionId);
}

export function predictedEffectsForAction(kind) {
  return [...(ACTION_EFFECTS[kind] || [])];
}

export function roomDependenciesForType(type) {
  return [...(ROOM_DEPENDENCIES[type] || [])];
}

export function expectedActionSeqForEntry({ baseActionSeq, localProceedCount }) {
  return Math.max(0, Number(baseActionSeq) || 0) + Math.max(0, Number(localProceedCount) || 0);
}

export function makeExploreCorrection({
  reason,
  rejectedSeq = null,
  confirmedThroughSeq = null,
  results = [],
  state = null,
  exploreRunway = null,
} = {}) {
  return {
    status: 'corrected',
    confirmedThroughSeq,
    rejectedSeq,
    reason: reason || 'explore_session_corrected',
    results,
    state,
    authoritativeState: state,
    exploreRunway,
  };
}

export function makeExploreOk({ confirmedThroughSeq = null, results = [], state = null, exploreRunway = null } = {}) {
  return {
    status: 'ok',
    confirmedThroughSeq,
    rejectedSeq: null,
    reason: null,
    results,
    state,
    exploreRunway,
  };
}
```

- [ ] **Step 4: Verify the contract test passes**

Run:

```bash
node --test tests/unit/game/explore-session-contract.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git add src/game/services/explore-session-contract.js tests/unit/game/explore-session-contract.test.js
/usr/bin/git commit -m "feat: add explore session contract"
```

## Task 2: Server Runway Builder

**Files:**

- Create: `src/game/services/explore-runway-service.js`
- Create: `src/game/services/friendly-npc-offers.js`
- Create: `tests/unit/game/explore-runway-service.test.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/game/services/cooking-service.js`
- Modify: `src/routes/game/run.js`

- [ ] **Step 1: Write failing runway tests**

Create `tests/unit/game/explore-runway-service.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { buildExploreRunway } from '../../../src/game/services/explore-runway-service.js';

function makeGm(roomTypes) {
  const player = { name: 'RunwayTester', hp: 100, maxHp: 100, credits: 50 };
  const run = createNewRun(player);
  run.active = true;
  run.mode = 'standard';
  run.currentArea = {
    id: 'hajimari-no-hiroba',
    nameEn: 'Starting Meadow',
    background: 'areas/hajimari-no-hiroba/hajimari-no-hiroba_01.webp',
  };
  run.currentRoom = 1;
  run.roomActionSeq = 4;
  run.areaPath = ['hajimari-no-hiroba'];
  run.cooking = { ingredients: { mizu: 1, gyuunyuu: 1 }, cookedThisRun: [] };
  run.creatureParty = {
    active: [{ id: 'hi', uid: 'hi-1', hp: 10, maxHp: 20, level: 2, moves: [] }],
    reserves: [],
    maxTotal: 3,
    pendingCaptures: [],
  };
  run.rooms = roomTypes.map((type, index) => createRoom(type, 'hajimari-no-hiroba', index + 1, roomTypes.length));
  return {
    run,
    meta: { levels: { highestUnlocked: 1 }, creatureCollection: ['hi'], creatureCounts: { hi: 1 }, cookingRecipesDiscovered: [] },
    getCurrentRoom: () => run.rooms[run.currentRoom],
  };
}

test('builds current plus five prepared rooms without removing legacy reveal compatibility', async () => {
  const gm = makeGm([
    ROOM_TYPES.encounter,
    ROOM_TYPES.friendlyNpc,
    ROOM_TYPES.shrine,
    ROOM_TYPES.campfire,
    ROOM_TYPES.dealer,
    ROOM_TYPES.whackAMole,
    ROOM_TYPES.boss,
    ROOM_TYPES.encounter,
  ]);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.match(runway.sessionEpoch, /^ese_[0-9a-f]{16}$/);
  assert.equal(runway.currentRoom, 1);
  assert.equal(runway.roomActionSeq, 4);
  assert.equal(runway.preparedAhead, 5);
  assert.deepEqual(runway.preparedRooms.map(entry => entry.index), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(runway.preparedRooms.map(entry => entry.actionSeq), [4, 5, 6, 7, 8, 9]);
  const dealer = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.dealer);
  assert.deepEqual(dealer.actionEffects['dealer.sell'], ['credits']);
  const boss = runway.preparedRooms.find(entry => entry.room.type === ROOM_TYPES.boss);
  assert.deepEqual(boss.acceptedActions, []);
});

test('finalizes random rooms before they enter the runway', async () => {
  const gm = makeGm([
    ROOM_TYPES.encounter,
    ROOM_TYPES.randomRoom,
    ROOM_TYPES.support,
    ROOM_TYPES.boss,
  ]);

  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.notEqual(runway.preparedRooms[0].room.type, ROOM_TYPES.randomRoom);
  assert.notEqual(runway.preparedRooms[1].room.type, ROOM_TYPES.support);
});

test('marks missing payloads instead of pretending offline readiness', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.friendlyNpc]);
  gm.run.rooms[1].friendlyNpc.offered = [];
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  const friendly = runway.preparedRooms[1];
  assert.equal(friendly.room.type, ROOM_TYPES.friendlyNpc);
  assert.equal(friendly.offlineReady, false);
  assert.ok(friendly.missingPayloadReasons.includes('friendlyNpc.offered'));
});

test('does not include raw static Japanese entry narration', async () => {
  const gm = makeGm([ROOM_TYPES.encounter, ROOM_TYPES.shrine]);
  const runway = await buildExploreRunway(gm, {
    userId: 'runway-user',
    getKnownWords: () => [],
    getDialogueCardAudio: async () => null,
  });

  assert.equal(runway.preparedRooms[0].entryPayload.narrationFrame, null);
  assert.equal(Object.hasOwn(runway.preparedRooms[0].entryPayload, 'rawNarration'), false);
});
```

- [ ] **Step 2: Run the failing runway test**

Run:

```bash
node --test tests/unit/game/explore-runway-service.test.js
```

Expected: FAIL with module-not-found for `explore-runway-service.js`.

- [ ] **Step 3: Move friendly-NPC offer rolling to a leaf helper**

Create `src/game/services/friendly-npc-offers.js` by moving the existing `rollFriendlyNpcOffers()` implementation out of `src/game/services/exploration-service.js`. Keep the same function signature:

```js
export function rollFriendlyNpcOffers(category, areaIds = null, itemPool = null) {
  // Move the current implementation here unchanged.
}
```

Then update `src/game/services/exploration-service.js` and `src/routes/game/run.js` to import it:

```js
import { rollFriendlyNpcOffers } from './friendly-npc-offers.js';
```

Use `../../game/services/friendly-npc-offers.js` from `src/routes/game/run.js`. This keeps `explore-runway-service.js` from importing `exploration-service.js` while `exploration-service.js` imports the runway builder.

- [ ] **Step 4: Implement runway builder skeleton and room payload dispatch**

Create `src/game/services/explore-runway-service.js`:

```js
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hydrateCards } from '../bootstrap/word-knowledge.js';
import { getDueCards } from '../internal-srs.js';
import { ROOM_TYPES } from '../rooms.js';
import { ensureRoomActionSeq } from '../room-reveal-buffer.js';
import {
  EXPLORE_RUNWAY_AHEAD,
  cloneExploreValue,
  ensureExploreSessionEpoch,
  predictedEffectsForAction,
  roomDependenciesForType,
} from './explore-session-contract.js';
import { COOKING_INGREDIENTS, COOKING_RECIPES, getCookableRecipeHints } from './cooking-service.js';
import { generateDealerCreatures, getCreatureBuyPrice, getCreatureSellPrice } from '../creatures.js';
import { rollFriendlyNpcOffers } from './friendly-npc-offers.js';
import { entityToToken } from '../token-format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const itemsPath = join(__dirname, '../../../data/items.json');
const allItems = JSON.parse(readFileSync(itemsPath, 'utf8'));

function markReady(payload, requiredFields) {
  const missing = [];
  for (const [path, value] of requiredFields) {
    if (value == null) missing.push(path);
    else if (Array.isArray(value) && value.length === 0) missing.push(path);
  }
  return { offlineReady: missing.length === 0, missingPayloadReasons: missing };
}

function backgroundFor(gm, room) {
  return room?.subArea?.background || gm.run?.currentArea?.background || gm.run?.background || null;
}

function baseEntryPayload(gm, room) {
  return {
    background: backgroundFor(gm, room),
    subArea: room?.subArea || null,
    ingredientDrops: Array.isArray(room?.entryIngredientDrops) ? cloneExploreValue(room.entryIngredientDrops) : [],
    narrationFrame: null,
  };
}

function acceptedActionsForRoom(room) {
  switch (room?.type) {
    case ROOM_TYPES.friendlyNpc: return ['friendlyNpc.choose'];
    case ROOM_TYPES.shrine: return ['shrine.choose'];
    case ROOM_TYPES.skillMaster: return ['skillMaster.choose'];
    case ROOM_TYPES.whackAMole: return ['whackAMole.complete', 'whackAMole.skip'];
    case ROOM_TYPES.campfire: return ['campfire.cook', 'campfire.feed', 'campfire.skip'];
    case ROOM_TYPES.speedReviewRoom: return ['speedReview.commit', 'speedReview.complete'];
    case ROOM_TYPES.wordDiscovery: return ['wordDiscovery.review', 'wordDiscovery.complete'];
    case ROOM_TYPES.dealer: return ['dealer.sell', 'dealer.buy', 'dealer.leave'];
    case ROOM_TYPES.encounter:
    case ROOM_TYPES.npcBattle:
    case ROOM_TYPES.boss:
      return [];
    default: return ['proceed'];
  }
}

function buildFriendlyNpcPayload(gm, room) {
  if (!room.friendlyNpc) room.friendlyNpc = { offerCategory: 'equipment', offered: null, chosenId: null, completed: false };
  if (!Array.isArray(room.friendlyNpc.offered)) {
    const areaPath = gm.run?.areaPath || [];
    const currentAreaId = gm.run?.currentArea?.id;
    const areaIds = [...new Set([...areaPath, currentAreaId].filter(Boolean))];
    room.friendlyNpc.offered = rollFriendlyNpcOffers('equipment', areaIds, allItems);
  }
  for (const item of room.friendlyNpc.offered || []) {
    if (item && !item.nameToken) item.nameToken = entityToToken(item);
  }
  return {
    kind: 'friendlyNpc',
    npc: room.npc || null,
    offered: cloneExploreValue(room.friendlyNpc.offered || []),
    greeting: room.friendlyNpc.greeting || null,
  };
}

function buildCampfirePayload(gm, room) {
  const discoveredIds = new Set(gm.meta?.cookingRecipesDiscovered || []);
  const ingredients = gm.run?.cooking?.ingredients || {};
  return {
    kind: 'campfire',
    ingredients: cloneExploreValue(ingredients),
    ingredientCatalog: COOKING_INGREDIENTS,
    ingredientCount: Object.values(ingredients).reduce((sum, n) => sum + Number(n || 0), 0),
    discoveredRecipes: COOKING_RECIPES.filter(recipe => discoveredIds.has(recipe.id)),
    cookableRecipeHints: getCookableRecipeHints(ingredients),
    room: cloneExploreValue(room.campfire || null),
    yesTokens: null,
    noTokens: null,
  };
}

function buildDealerPayload(gm, room) {
  if (!room.dealer) room.dealer = { visited: false, offeredCreatures: [], soldCreatures: [], purchasedCreature: null };
  if (!Array.isArray(room.dealer.offeredCreatures) || room.dealer.offeredCreatures.length === 0) {
    const collectionIds = gm.meta?.creatureCollection || [];
    room.dealer.offeredCreatures = generateDealerCreatures(collectionIds);
  }
  const partyCreatures = [
    ...(gm.run?.creatureParty?.active || []).map(creature => ({ ...creature, slot: 'active' })),
    ...(gm.run?.creatureParty?.reserves || []).map(creature => ({ ...creature, slot: 'reserve' })),
  ].filter(Boolean).map(creature => ({ ...creature, sellPrice: getCreatureSellPrice(creature) }));
  return {
    kind: 'dealer',
    dealer: cloneExploreValue(room.dealer),
    offeredCreatures: (room.dealer.purchasedCreature ? [] : room.dealer.offeredCreatures).map(creature => ({
      ...cloneExploreValue(creature),
      buyPrice: getCreatureBuyPrice(creature),
    })),
    partyCreatures,
    credits: gm.run?.player?.credits ?? gm.player?.credits ?? 0,
    canBuy: !room.dealer.purchasedCreature,
    sellCount: room.dealer.soldCreatures?.length || 0,
    maxSells: 2,
  };
}

function buildSpeedReviewPayload(gm, room, { userId } = {}) {
  const state = room.speedReviewRoom || {};
  if (!state.snapshotInitialized && userId) {
    const dueWords = hydrateCards(getDueCards(userId, 'vocab')).slice(0, state.targetCards || 10).map(card => ({
      word: card.id,
      reading: card.reading,
      meanings: card.meaning ? [card.meaning] : [],
    }));
    state.snapshotWords = dueWords;
    state.snapshotWordKeys = dueWords.map(word => String(word.word));
    state.snapshotInitialized = true;
  }
  room.speedReviewRoom = state;
  return {
    kind: 'speedReviewRoom',
    snapshotWords: cloneExploreValue(state.snapshotWords || []),
    snapshotWordKeys: cloneExploreValue(state.snapshotWordKeys || []),
    reviewedCards: state.reviewedCards || 0,
    targetCards: state.targetCards || 10,
    requiredCards: Math.min(state.targetCards || 10, state.snapshotWordKeys?.length || 0),
    awardedReviewKeys: cloneExploreValue(state.awardedReviewKeys || []),
    pendingReviewKeys: cloneExploreValue(state.pendingReviewKeys || []),
    completed: state.completed === true,
  };
}

function buildGenericPayload(room) {
  return { kind: room?.type || 'room' };
}

function buildInteractionPayload(gm, room, opts = {}) {
  switch (room?.type) {
    case ROOM_TYPES.friendlyNpc: return buildFriendlyNpcPayload(gm, room, opts);
    case ROOM_TYPES.campfire: return buildCampfirePayload(gm, room, opts);
    case ROOM_TYPES.dealer: return buildDealerPayload(gm, room, opts);
    case ROOM_TYPES.speedReviewRoom: return buildSpeedReviewPayload(gm, room, opts);
    default: return buildGenericPayload(room);
  }
}

export async function buildExploreRunway(gm, opts = {}) {
  const run = gm?.run;
  if (!run?.active || !Array.isArray(run.rooms)) {
    return {
      sessionEpoch: null,
      roomActionSeq: 0,
      currentRoom: 0,
      preparedAhead: EXPLORE_RUNWAY_AHEAD,
      preparedRooms: [],
    };
  }

  const sessionEpoch = ensureExploreSessionEpoch(run);
  const roomActionSeq = ensureRoomActionSeq(run);
  const currentRoom = Number.isInteger(run.currentRoom) ? run.currentRoom : 0;
  const endIndex = Math.min(run.rooms.length - 1, currentRoom + EXPLORE_RUNWAY_AHEAD);
  const preparedRooms = [];

  for (let index = currentRoom; index <= endIndex; index += 1) {
    const room = gm.explorationService?.prepareRoomForReveal?.(index) || run.rooms[index];
    if (!room) continue;
    const interactionPayload = buildInteractionPayload(gm, room, opts);
    const acceptedActions = acceptedActionsForRoom(room);
    const actionEffects = Object.fromEntries(
      acceptedActions.map(kind => [kind, predictedEffectsForAction(kind)])
    );
    const required = [];
    if (room.type === ROOM_TYPES.friendlyNpc) {
      required.push(['friendlyNpc.offered', interactionPayload.offered]);
      required.push(['friendlyNpc.npc', interactionPayload.npc]);
    }
    if (room.type === ROOM_TYPES.speedReviewRoom) {
      required.push(['speedReview.snapshotWords', interactionPayload.snapshotWords]);
    }
    const readiness = markReady(interactionPayload, required);
    preparedRooms.push({
      index,
      roomId: room.id,
      actionSeq: roomActionSeq + (index - currentRoom),
      room: cloneExploreValue(room),
      entryPayload: baseEntryPayload(gm, room),
      interactionPayload,
      dependencies: roomDependenciesForType(room.type),
      acceptedActions,
      actionEffects,
      ...readiness,
    });
  }

  return {
    sessionEpoch,
    roomActionSeq,
    currentRoom,
    preparedAhead: EXPLORE_RUNWAY_AHEAD,
    preparedRooms,
  };
}
```

- [ ] **Step 5: Export runway preparation through ExplorationService**

Modify `src/game/services/exploration-service.js` imports and methods:

```js
import { buildExploreRunway } from './explore-runway-service.js';
```

Add inside `ExplorationService`:

```js
async buildExploreRunway(opts = {}) {
  return buildExploreRunway(this.gm, opts);
}
```

- [ ] **Step 6: Run runway tests**

Run:

```bash
node --test tests/unit/game/explore-runway-service.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
/usr/bin/git add src/game/services/explore-runway-service.js src/game/services/friendly-npc-offers.js src/game/services/exploration-service.js src/routes/game/run.js tests/unit/game/explore-runway-service.test.js
/usr/bin/git commit -m "feat: build explore room runway"
```

## Task 3: State Exposure And Epoch Rotation

**Files:**

- Modify: `src/game/loop.js`
- Modify: `src/routes/game/state.js`
- Modify: `tests/integration/flows/exploration.test.js`
- Modify: `tests/unit/game/exploration-reveal-buffer.test.js`

- [ ] **Step 1: Add tests for compatibility and runway exposure**

In `tests/integration/flows/exploration.test.js`, keep existing `revealedRooms` assertions and add:

```js
assert.ok(res.body.run.exploreRunway, 'client state should include exploreRunway');
assert.equal(res.body.run.exploreRunway.preparedAhead, 5);
assert.ok(
  res.body.run.exploreRunway.preparedRooms.length <= 6,
  'runway includes current room plus at most five ahead'
);
assert.equal(res.body.run.exploreRunway.preparedRooms[0].index, res.body.run.currentRoom);
assert.equal(res.body.run.revealedRooms.length <= 2, true, 'legacy reveal remains current plus one');
```

Add a state-route epoch test in `tests/integration/flows/exploration.test.js`:

```js
it('rotates explore session epoch on state fetch during active regular explore', async () => {
  await client.post('/api/game/start-run', {});
  const first = await client.get('/api/game/state');
  const firstEpoch = first.body.run?.exploreRunway?.sessionEpoch;
  const second = await client.get('/api/game/state');
  const secondEpoch = second.body.run?.exploreRunway?.sessionEpoch;

  assert.match(firstEpoch, /^ese_[0-9a-f]{16}$/);
  assert.match(secondEpoch, /^ese_[0-9a-f]{16}$/);
  assert.notEqual(secondEpoch, firstEpoch);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/integration/flows/exploration.test.js
```

Expected: FAIL because `exploreRunway` is absent.

- [ ] **Step 3: Expose `exploreRunway` in `GameManager.getState()`**

Modify `src/game/loop.js` inside `getState()` after `roomReveal` is built:

```js
    const roomReveal = this.run ? buildClientRoomReveal(this.run) : null;
    const exploreRunway = this.run?.active && this.run.mode !== 'kanjiKombat'
      ? awaitableExploreRunwaySnapshot(this)
      : null;
```

Add a helper near the top-level functions in `src/game/loop.js`:

```js
function awaitableExploreRunwaySnapshot(gm) {
  const cached = gm.run?.exploreRunway;
  if (cached?.sessionEpoch === gm.run?.exploreSessionEpoch) return cached;
  return {
    sessionEpoch: gm.run?.exploreSessionEpoch || null,
    roomActionSeq: gm.run?.roomActionSeq || 0,
    currentRoom: gm.run?.currentRoom || 0,
    preparedAhead: 5,
    preparedRooms: [],
  };
}
```

Then include in the returned `run` object:

```js
        exploreRunway,
```

This helper is intentionally synchronous. The full async builder runs before `getState()` in route/service code so `getState()` remains sync.

- [ ] **Step 4: Build runway before state serialization**

Modify the game middleware or route handlers that call `req.getEnrichedGameState()` by ensuring the active run has a cached runway before responding from state-changing explore routes. Start with `src/routes/game/state.js`:

```js
import { rotateExploreSessionEpoch } from '../../game/services/explore-session-contract.js';
```

Replace the state route handler in `src/routes/game/state.js` with this async shape:

```js
  router.get('/state', async (req, res) => {
    if (req.gameManager.run?.mode === 'kanjiKombat' && req.gameManager.run?.active) {
      rotateKanjiKombatSessionEpoch(req.gameManager.run.kanjiKombat);
      req.saveGame();
    }
    if (req.gameManager.run?.active && req.gameManager.run?.mode !== 'kanjiKombat') {
      rotateExploreSessionEpoch(req.gameManager.run);
      req.gameManager.run.exploreRunway = await req.gameManager.explorationService.buildExploreRunway({
        userId: req.user?.id,
        getDialogueCardAudio: req.app?.locals?.getDialogueCardAudio,
      });
      req.saveGame();
    }
    res.json(req.getEnrichedGameState());
  });
```

- [ ] **Step 5: Cache runway after area entry and proceed**

Keep `enterArea()` and `proceedToNextRoom()` synchronous. Do not call `await this.buildExploreRunway()` inside those methods. Instead, make every route that returns enriched explore state refresh the cached runway immediately before calling `req.getEnrichedGameState()`:

```js
async function refreshExploreRunwayForResponse(req) {
  if (!req.gameManager.run?.active || req.gameManager.run?.mode === 'kanjiKombat') return;
  req.gameManager.run.exploreRunway = await req.gameManager.explorationService.buildExploreRunway({
    userId: req.user?.id,
    getDialogueCardAudio: req.app?.locals?.getDialogueCardAudio,
  });
}
```

Use `await refreshExploreRunwayForResponse(req);` in the new `/explore/sync` route and in legacy explore mutation routes that still return state during rollout.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
node --test tests/unit/game/exploration-reveal-buffer.test.js tests/integration/flows/exploration.test.js
```

Expected: PASS; old reveal buffer tests still pass and new runway assertions pass.

- [ ] **Step 7: Commit**

Run:

```bash
/usr/bin/git add src/game/loop.js src/routes/game/state.js src/game/services/exploration-service.js tests/integration/flows/exploration.test.js tests/unit/game/exploration-reveal-buffer.test.js
/usr/bin/git commit -m "feat: expose explore runway in state"
```

## Task 4: Explore Sync Service Core

**Files:**

- Create: `src/game/services/explore-session-sync-service.js`
- Create: `tests/unit/game/explore-session-sync-service.test.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/routes/game/run.js`

- [ ] **Step 1: Write failing sync service tests**

Create `tests/unit/game/explore-session-sync-service.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNewRun } from '../../../src/game/state.js';
import { createRoom, ROOM_TYPES } from '../../../src/game/rooms.js';
import { ExplorationService } from '../../../src/game/services/exploration-service.js';
import { ensureExploreSessionEpoch } from '../../../src/game/services/explore-session-contract.js';
import { ExploreSessionSyncService } from '../../../src/game/services/explore-session-sync-service.js';
import { createItemBuffs } from '../../../src/game/services/item-service.js';

function makeGm() {
  const player = { name: 'SyncTester', hp: 100, maxHp: 100, credits: 0 };
  const run = createNewRun(player);
  run.active = true;
  run.mode = 'standard';
  run.currentArea = { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' };
  run.currentRoom = 0;
  run.roomActionSeq = 2;
  run.rooms = [
    createRoom(ROOM_TYPES.friendlyNpc, 'hajimari-no-hiroba', 1, 3),
    createRoom(ROOM_TYPES.shrine, 'hajimari-no-hiroba', 2, 3),
    createRoom(ROOM_TYPES.boss, 'hajimari-no-hiroba', 3, 3),
  ];
  run.rooms[0].friendlyNpc.offered = [{ id: 'iron-charm', category: 'equipment', effect: {}, word: '鉄', reading: 'てつ', meaning: 'iron' }];
  const gm = {
    run,
    meta: { actionLedger: { entries: {}, order: [] }, itemsDiscovered: [] },
    userId: 'explore-sync-user',
    getCurrentRoom: () => run.rooms[run.currentRoom],
    getState: () => ({ phase: run.rooms[run.currentRoom]?.type || 'room', run: { currentRoom: run.currentRoom, roomActionSeq: run.roomActionSeq } }),
    emitState() {},
  };
  gm.explorationService = {
    applyExploreProceed: () => {
      run.currentRoom += 1;
      run.roomActionSeq += 1;
      return { ok: true };
    },
    applyFriendlyNpcChoose: ({ itemId }) => {
      run.rooms[0].friendlyNpc.chosenId = itemId;
      run.rooms[0].friendlyNpc.completed = true;
      run.rooms[0].interacted = true;
      return { chosen: itemId };
    },
    buildExploreRunway: async () => ({ sessionEpoch: run.exploreSessionEpoch, preparedRooms: [] }),
  };
  ensureExploreSessionEpoch(run);
  return gm;
}

test('rejects stale epoch with correction', async () => {
  const gm = makeGm();
  const service = new ExploreSessionSyncService(gm);
  const result = await service.applyExploreSessionSync({
    sessionEpoch: 'ese_deadbeefdeadbeef',
    entries: [{ seq: 1, actionId: 'run_es_1', kind: 'proceed', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: {} }],
  });
  assert.equal(result.status, 'corrected');
  assert.equal(result.reason, 'session_epoch_mismatch');
  assert.equal(result.rejectedSeq, 1);
});

test('commits ordered entries and increments action seq only on proceed', async () => {
  const gm = makeGm();
  const service = new ExploreSessionSyncService(gm);
  const result = await service.applyExploreSessionSync({
    sessionEpoch: gm.run.exploreSessionEpoch,
    entries: [
      { seq: 1, actionId: 'run_es_0001', kind: 'friendlyNpc.choose', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: { itemId: 'iron-charm' } },
      { seq: 2, actionId: 'run_es_0002', kind: 'proceed', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: {} },
      { seq: 3, actionId: 'run_es_0003', kind: 'proceed', roomIndex: 1, roomId: gm.run.rooms[1].id, actionSeq: 3, payload: {} },
    ],
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.confirmedThroughSeq, 3);
  assert.equal(gm.run.currentRoom, 2);
  assert.equal(gm.run.roomActionSeq, 4);
});

test('stops at first stale actionSeq', async () => {
  const gm = makeGm();
  const service = new ExploreSessionSyncService(gm);
  const result = await service.applyExploreSessionSync({
    sessionEpoch: gm.run.exploreSessionEpoch,
    entries: [
      { seq: 1, actionId: 'run_es_0001', kind: 'proceed', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: {} },
      { seq: 2, actionId: 'run_es_0002', kind: 'proceed', roomIndex: 1, roomId: gm.run.rooms[1].id, actionSeq: 99, payload: {} },
    ],
  });
  assert.equal(result.status, 'corrected');
  assert.equal(result.confirmedThroughSeq, 1);
  assert.equal(result.rejectedSeq, 2);
  assert.equal(result.reason, 'stale_room_action_seq');
});

test('friendlyNpc.choose applies the selected equipment effect through the shared performer', async () => {
  const gm = makeGm();
  const item = {
    id: 'training-charm',
    category: 'equipment',
    type: 'boost',
    effect: { field: 'baseAttackBonus', value: 2 },
    word: '力',
    reading: 'ちから',
    meaning: 'strength',
  };
  gm.run.creatureParty = {
    active: [{ id: 'hi', uid: 'hi-1', hp: 10, maxHp: 20, level: 1, moves: [] }],
    reserves: [],
  };
  gm.run.itemBuffs = createItemBuffs();
  gm.run.runSummary = { itemsCollected: 0 };
  gm.run.rooms[0].friendlyNpc.offered = [item];
  gm.explorationService = new ExplorationService(gm);

  const result = gm.explorationService.applyFriendlyNpcChoose({
    itemId: item.id,
    targetCreatureIndex: 0,
  });

  assert.equal(result.applyResult.applied, true);
  assert.equal(gm.run.creatureParty.active[0].itemBuffs.baseAttackBonus, 2);
  assert.equal(gm.run.rooms[0].friendlyNpc.completed, true);
  assert.deepEqual(gm.meta.itemsDiscovered, [item.id]);
  assert.equal(gm.run.runSummary.itemsCollected, 1);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js
```

Expected: FAIL with module-not-found for `explore-session-sync-service.js`.

- [ ] **Step 3: Implement sync service core**

Create `src/game/services/explore-session-sync-service.js`:

```js
import {
  getActionLedgerEntry,
  rememberActionLedgerResult,
} from './action-ledger-service.js';
import {
  cloneExploreValue,
  isExploreSessionActionId,
  makeExploreCorrection,
  makeExploreOk,
  predictedEffectsForAction,
} from './explore-session-contract.js';

function ledgerOwner(gm) {
  if (!gm.meta) gm.meta = {};
  return gm.meta;
}

function validateEntry(gm, entry) {
  const room = gm.run?.rooms?.[entry.roomIndex];
  if (!room) throw new Error('room_not_found');
  if (room.id !== entry.roomId) throw new Error('room_id_mismatch');
  if (entry.actionSeq !== gm.run.roomActionSeq) throw new Error('stale_room_action_seq');
  return room;
}

export class ExploreSessionSyncService {
  constructor(gameManager) {
    this.gm = gameManager;
  }

  async applyExploreEntry(entry) {
    const room = validateEntry(this.gm, entry);
    switch (entry.kind) {
      case 'proceed':
        return this.gm.explorationService.applyExploreProceed(entry.payload || {});
      case 'friendlyNpc.choose':
        return this.gm.explorationService.applyFriendlyNpcChoose(entry.payload || {});
      default:
        throw new Error(`unsupported_explore_entry:${entry.kind}`);
    }
  }

  async applyExploreSessionSync({ sessionEpoch, entries = [] } = {}) {
    const run = this.gm.run;
    if (!run?.active) {
      return makeExploreCorrection({ reason: 'no_active_run', rejectedSeq: entries[0]?.seq ?? null });
    }
    if (!sessionEpoch || sessionEpoch !== run.exploreSessionEpoch) {
      return makeExploreCorrection({
        reason: 'session_epoch_mismatch',
        rejectedSeq: entries[0]?.seq ?? null,
        state: this.gm.getState?.() || null,
        exploreRunway: await this.gm.explorationService?.buildExploreRunway?.(),
      });
    }

    const owner = ledgerOwner(this.gm);
    const results = [];
    let confirmedThroughSeq = null;

    for (const entry of entries) {
      const existing = isExploreSessionActionId(entry.actionId)
        ? getActionLedgerEntry(owner, entry.actionId)
        : null;
      if (existing?.response) {
        results.push({ seq: entry.seq, actionId: entry.actionId, kind: entry.kind, replayed: true });
        confirmedThroughSeq = entry.seq;
        continue;
      }

      try {
        const committed = await this.applyExploreEntry(entry);
        const response = {
          seq: entry.seq,
          actionId: entry.actionId,
          kind: entry.kind,
          replayed: false,
          predictedEffects: predictedEffectsForAction(entry.kind),
          result: cloneExploreValue(committed),
        };
        results.push(response);
        confirmedThroughSeq = entry.seq;
        if (isExploreSessionActionId(entry.actionId)) {
          rememberActionLedgerResult(owner, {
            actionId: entry.actionId,
            actionType: `explore.${entry.kind}`,
            response,
          });
        }
      } catch (error) {
        return makeExploreCorrection({
          reason: error?.message || 'explore_entry_failed',
          confirmedThroughSeq,
          rejectedSeq: entry.seq,
          results,
          state: this.gm.getState?.() || null,
          exploreRunway: await this.gm.explorationService?.buildExploreRunway?.(),
        });
      }
    }

    const exploreRunway = await this.gm.explorationService?.buildExploreRunway?.();
    return makeExploreOk({
      confirmedThroughSeq,
      results,
      state: this.gm.getState?.() || null,
      exploreRunway,
    });
  }
}
```

- [ ] **Step 4: Add reusable action performers**

In `src/game/services/exploration-service.js`, import the item performer:

```js
import { applyItem } from './item-service.js';
```

Then add these methods:

```js
  applyExploreProceed() {
    return this.proceedToNextRoom();
  }

  applyFriendlyNpcChoose({ itemId, targetCreatureIndex } = {}) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== ROOM_TYPES.friendlyNpc) throw new Error('not_friendly_npc_room');
    if (!room.friendlyNpc?.offered) throw new Error('friendly_npc_offers_missing');
    if (room.friendlyNpc.completed) throw new Error('friendly_npc_already_completed');
    const item = room.friendlyNpc.offered.find(candidate => candidate.id === itemId);
    if (!item) throw new Error('invalid_friendly_npc_item');
    if (item.category !== 'equipment') throw new Error('friendly_npc_equipment_only');
    const targetIdx = Number.isInteger(targetCreatureIndex) ? targetCreatureIndex : null;
    const applyResult = applyItem(item, this.gm.run.creatureParty, this.gm.run.itemBuffs, targetIdx);
    if (this.gm.run?.runSummary) {
      this.gm.run.runSummary.itemsCollected++;
    }
    if (this.gm.meta && item?.id) {
      if (!this.gm.meta.itemsDiscovered) this.gm.meta.itemsDiscovered = [];
      if (!this.gm.meta.itemsDiscovered.includes(item.id)) {
        this.gm.meta.itemsDiscovered.push(item.id);
      }
    }
    room.friendlyNpc.chosenId = itemId;
    room.friendlyNpc.completed = true;
    room.interacted = true;
    this.gm.emitState();
    return { chosen: item, applyResult };
  }
```

In `src/routes/game/run.js`, keep the existing request validation but replace the body of `/friendly-npc-choose`'s optimistic `perform` callback with the shared performer:

```js
const result = gm.explorationService.applyFriendlyNpcChoose({ itemId, targetCreatureIndex });
return { ...result, state: req.getEnrichedGameState() };
```

Do not introduce `pendingFriendlyNpcItem`; the session path and the legacy route must both apply the item effect through the same performer.

- [ ] **Step 5: Run sync service tests**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
/usr/bin/git add src/game/services/explore-session-sync-service.js src/game/services/exploration-service.js src/routes/game/run.js tests/unit/game/explore-session-sync-service.test.js
/usr/bin/git commit -m "feat: add explore session sync service"
```

## Task 5: `/api/game/explore/sync` Route

**Files:**

- Create: `src/routes/game/explore-session.js`
- Modify: `src/routes/game/index.js`
- Create: `tests/integration/flows/explore-session-sync.test.js`
- Modify: `public/js/api.js`

- [ ] **Step 1: Write integration route tests**

Create `tests/integration/flows/explore-session-sync.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createApiClient, createTestApp } from '../helpers/test-app.js';

describe('POST /api/game/explore/sync', () => {
  it('rejects missing entries with 400', async () => {
    const app = await createTestApp();
    const client = createApiClient(app.port);
    try {
      const res = await client.post('/api/game/explore/sync', { sessionEpoch: 'ese_missing_entries' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /entries array required/);
    } finally {
      await app.cleanup();
    }
  });

  it('returns corrected for stale epoch with authoritative state', async () => {
    const app = await createTestApp();
    const client = createApiClient(app.port);
    try {
      await client.post('/api/game/start-run', {});
      const stateRes = await client.get('/api/game/state');
      const room = stateRes.body.run.exploreRunway.preparedRooms[0];
      const res = await client.post('/api/game/explore/sync', {
        sessionEpoch: 'ese_deadbeefdeadbeef',
        entries: [{
          seq: 1,
          actionId: 'run_es_00000001',
          kind: 'proceed',
          roomIndex: room.index,
          roomId: room.roomId,
          actionSeq: room.actionSeq,
          payload: {},
        }],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'corrected');
      assert.equal(res.body.reason, 'session_epoch_mismatch');
      assert.ok(res.body.state);
      assert.ok(res.body.exploreRunway);
    } finally {
      await app.cleanup();
    }
  });
});
```

- [ ] **Step 2: Run the failing integration test**

Run:

```bash
node --test tests/integration/flows/explore-session-sync.test.js
```

Expected: FAIL with 404 for `/api/game/explore/sync`.

- [ ] **Step 3: Add route module**

Create `src/routes/game/explore-session.js`:

```js
import { Router } from 'express';
import { ExploreSessionSyncService } from '../../game/services/explore-session-sync-service.js';
import {
  restoreGameManager,
  snapshotGameManager,
} from './optimistic-action-response.js';

export default function createExploreSessionRoutes() {
  const router = Router();

  router.post('/sync', async (req, res) => {
    const { sessionEpoch, entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }

    const snapshot = snapshotGameManager(req.gameManager);
    try {
      const service = new ExploreSessionSyncService(req.gameManager);
      const result = await service.applyExploreSessionSync({ sessionEpoch, entries });
      req.saveGame?.();
      return res.json(result);
    } catch (error) {
      restoreGameManager(req.gameManager, snapshot);
      return res.status(409).json({
        status: 'corrected',
        reason: error.message,
        confirmedThroughSeq: null,
        rejectedSeq: entries[0]?.seq ?? null,
        results: [],
        state: req.getEnrichedGameState?.() || null,
        authoritativeState: req.getEnrichedGameState?.() || null,
        exploreRunway: req.gameManager.run?.exploreRunway || null,
      });
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount route**

Modify `src/routes/game/index.js`:

```js
import createExploreSessionRoutes from './explore-session.js';
```

Add near other mounted routes:

```js
  router.use('/explore', createExploreSessionRoutes());
```

- [ ] **Step 5: Add API wrapper**

Modify `public/js/api.js`:

```js
async function syncExploreSession({ sessionEpoch, entries }) {
  return apiCall('/explore/sync', 'POST', { sessionEpoch, entries }, null, {
    bypassLoadingGate: true,
    returnErrorBody: true,
  });
}
```

Export it from the bottom export list:

```js
  syncExploreSession,
```

- [ ] **Step 6: Run integration tests**

Run:

```bash
node --test tests/integration/flows/explore-session-sync.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
/usr/bin/git add src/routes/game/explore-session.js src/routes/game/index.js public/js/api.js tests/integration/flows/explore-session-sync.test.js
/usr/bin/git commit -m "feat: expose explore session sync endpoint"
```

## Task 6: Client Explore Session Module

**Files:**

- Create: `public/js/ui/explore-session.js`
- Create: `tests/unit/ui/explore-session.test.js`

- [ ] **Step 1: Write failing client session tests**

Create `tests/unit/ui/explore-session.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPLORE_SESSION_HARD_CAP,
  createExploreSession,
} from '../../../public/js/ui/explore-session.js';

function scheduler() {
  const timers = [];
  return {
    schedule(fn, delay) {
      timers.push({ fn, delay });
      return timers.length - 1;
    },
    cancel(id) {
      if (timers[id]) timers[id].fn = null;
    },
    async fire() {
      const pending = timers.splice(0);
      for (const timer of pending) {
        if (timer.fn) await timer.fn();
      }
    },
    delays() {
      return timers.map(timer => timer.delay);
    },
  };
}

test('records actions with room identity and predicted effects', async () => {
  const s = scheduler();
  const calls = [];
  const session = createExploreSession({
    syncRequest: async payload => {
      calls.push(payload);
      return { status: 'ok', confirmedThroughSeq: payload.entries.at(-1).seq, results: [], exploreRunway: payload.exploreRunway };
    },
    schedule: s.schedule,
    cancel: s.cancel,
  });
  session.adoptRunway({
    sessionEpoch: 'ese_1111111111111111',
    currentRoom: 2,
    roomActionSeq: 5,
    preparedRooms: [{
      index: 2,
      roomId: 'room-2',
      actionSeq: 5,
      acceptedActions: ['friendlyNpc.choose'],
      actionEffects: { 'friendlyNpc.choose': ['partyStats'] },
      dependencies: [],
    }],
  });

  const result = session.recordRoomAction('friendlyNpc.choose', { itemId: 'iron-charm' });
  assert.equal(result.accepted, true);
  assert.equal(session.pendingCount(), 1);
  await s.fire();
  assert.equal(calls[0].sessionEpoch, 'ese_1111111111111111');
  assert.equal(calls[0].entries[0].roomIndex, 2);
  assert.equal(calls[0].entries[0].roomId, 'room-2');
  assert.equal(calls[0].entries[0].actionSeq, 5);
  assert.deepEqual(calls[0].entries[0].predictedEffects, ['partyStats']);
});

test('local proceed advances to the next prepared room and increments predicted action seq', () => {
  const session = createExploreSession({ syncRequest: async () => ({ status: 'ok', confirmedThroughSeq: 1 }) });
  session.adoptRunway({
    sessionEpoch: 'ese_2222222222222222',
    currentRoom: 0,
    roomActionSeq: 3,
    preparedRooms: [
      { index: 0, roomId: 'room-0', actionSeq: 3, acceptedActions: ['proceed'], dependencies: [] },
      {
        index: 1,
        roomId: 'room-1',
        actionSeq: 4,
        acceptedActions: ['shrine.choose'],
        actionEffects: { 'shrine.choose': ['partyStats'] },
        dependencies: [],
      },
    ],
  });
  const proceed = session.recordRoomAction('proceed', {});
  assert.equal(proceed.accepted, true);
  assert.equal(session.currentPreparedRoom().index, 1);
  const shrine = session.recordRoomAction('shrine.choose', { rewardType: 'heal_all' });
  assert.equal(shrine.entry.actionSeq, 4);
});

test('pauses when unsynced effects intersect next room dependencies', () => {
  let pause = null;
  const session = createExploreSession({
    syncRequest: async () => { throw new Error('offline'); },
    onPause: event => { pause = event; },
  });
  session.adoptRunway({
    sessionEpoch: 'ese_3333333333333333',
    currentRoom: 0,
    roomActionSeq: 1,
    preparedRooms: [
      {
        index: 0,
        roomId: 'dealer-room',
        actionSeq: 1,
        acceptedActions: ['dealer.sell', 'proceed'],
        actionEffects: { 'dealer.sell': ['credits'], proceed: ['areaProgress'] },
        dependencies: [],
      },
      { index: 1, roomId: 'next-dealer', actionSeq: 2, acceptedActions: ['dealer.buy'], actionEffects: { 'dealer.buy': ['credits', 'partyStats'] }, dependencies: ['credits'] },
    ],
  });
  session.recordRoomAction('dealer.sell', { creatureId: 'hi-1' });
  const proceed = session.recordRoomAction('proceed', {});
  assert.equal(proceed.accepted, false);
  assert.equal(proceed.reason, 'dependencyPause');
  assert.equal(pause.reason, 'dependencyPause');
});

test('hard cap pauses and rejects overflow', () => {
  let paused = 0;
  const session = createExploreSession({
    syncRequest: async () => { throw new Error('offline'); },
    onPause: () => { paused += 1; },
  });
  session.adoptRunway({
    sessionEpoch: 'ese_4444444444444444',
    currentRoom: 0,
    roomActionSeq: 1,
    preparedRooms: [{
      index: 0,
      roomId: 'room-0',
      actionSeq: 1,
      acceptedActions: ['whackAMole.complete'],
      actionEffects: { 'whackAMole.complete': ['credits'] },
      dependencies: [],
    }],
  });
  for (let i = 0; i < EXPLORE_SESSION_HARD_CAP; i += 1) {
    assert.equal(session.recordRoomAction('whackAMole.complete', { score: i }).accepted, true);
  }
  assert.equal(session.recordRoomAction('whackAMole.complete', { score: 99 }).accepted, false);
  assert.equal(paused, 1);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/unit/ui/explore-session.test.js
```

Expected: FAIL with module-not-found for `explore-session.js`.

- [ ] **Step 3: Implement client session module**

Create `public/js/ui/explore-session.js`:

```js
export const EXPLORE_SESSION_HARD_CAP = 50;
export const EXPLORE_SESSION_RESUME_AT = 40;
export const EXPLORE_SYNC_DEBOUNCE_MS = 300;
export const EXPLORE_SYNC_RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];

function defaultSchedule(fn, delay) {
  const timer = setTimeout(fn, delay);
  timer?.unref?.();
  return timer;
}

function notify(callback, ...args) {
  try {
    callback(...args);
  } catch (error) {
    console.error('[ExploreSession] callback failed', error);
  }
}

function createActionId(seq) {
  return `run_es_${String(seq).padStart(8, '0')}`;
}

function effectsFor(room, kind) {
  return [...(room?.actionEffects?.[kind] || [])];
}

function intersects(a = [], b = []) {
  const set = new Set(a);
  return b.some(item => set.has(item));
}

export function createExploreSession({
  syncRequest,
  onCheckpoint = () => {},
  onCorrection = () => {},
  onPause = () => {},
  onResume = () => {},
  schedule = defaultSchedule,
  cancel = id => clearTimeout(id),
} = {}) {
  if (typeof syncRequest !== 'function') throw new Error('syncRequest function required');

  let runway = null;
  let log = [];
  let nextSeq = 1;
  let currentRoomIndex = null;
  let syncing = false;
  let debounceTimer = null;
  let retryTimer = null;
  let attempts = 0;
  let paused = false;
  let generation = 0;

  function currentPreparedRoom() {
    if (!runway) return null;
    return runway.preparedRooms?.find(room => room.index === currentRoomIndex)
      || runway.preparedRooms?.[0]
      || null;
  }

  function pendingEffects() {
    return [...new Set(log.flatMap(entry => entry.predictedEffects || []))];
  }

  function enterPause(reason, extra = {}) {
    if (paused && reason !== 'dependencyPause') return;
    paused = true;
    notify(onPause, { reason, pendingCount: log.length, ...extra });
  }

  function maybeResume() {
    if (paused && log.length <= EXPLORE_SESSION_RESUME_AT) {
      paused = false;
      notify(onResume, { pendingCount: log.length });
    }
  }

  function clearTimers() {
    if (debounceTimer != null) cancel(debounceTimer);
    if (retryTimer != null) cancel(retryTimer);
    debounceTimer = null;
    retryTimer = null;
  }

  function scheduleDrain(delay) {
    if (debounceTimer != null) cancel(debounceTimer);
    debounceTimer = schedule(() => {
      debounceTimer = null;
      void drain();
    }, delay);
  }

  function scheduleRetry() {
    if (retryTimer != null) cancel(retryTimer);
    const index = Math.min(attempts, EXPLORE_SYNC_RETRY_DELAYS_MS.length - 1);
    attempts += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      void drain();
    }, EXPLORE_SYNC_RETRY_DELAYS_MS[index]);
  }

  async function drain() {
    if (syncing || log.length === 0 || !runway?.sessionEpoch) return;
    const myGeneration = generation;
    syncing = true;
    const entries = log.map(entry => ({ ...entry, payload: { ...(entry.payload || {}) } }));
    try {
      const response = await syncRequest({ sessionEpoch: runway.sessionEpoch, entries });
      if (myGeneration !== generation) return;
      if (!response || (response.status !== 'ok' && response.status !== 'corrected')) {
        throw new Error(response?.error || 'explore sync failed');
      }
      attempts = 0;
      if (response.exploreRunway) adoptRunway(response.exploreRunway);
      if (response.status === 'corrected') {
        log = [];
        notify(onCorrection, response);
      } else {
        const confirmed = Number.isInteger(response.confirmedThroughSeq) ? response.confirmedThroughSeq : -1;
        log = log.filter(entry => entry.seq > confirmed);
        notify(onCheckpoint, response, { logEmpty: log.length === 0 });
      }
      maybeResume();
      if (log.length > 0) scheduleDrain(0);
    } catch {
      if (myGeneration !== generation) return;
      scheduleRetry();
    } finally {
      if (myGeneration === generation) syncing = false;
    }
  }

  function adoptRunway(nextRunway) {
    runway = nextRunway || null;
    currentRoomIndex = runway?.currentRoom ?? runway?.preparedRooms?.[0]?.index ?? null;
  }

  function canEnterPreparedRoom(room) {
    if (!room) return { ok: false, reason: 'runwayExhausted' };
    if (room.offlineReady === false) return { ok: false, reason: 'missingPayload', missingPayloadReasons: room.missingPayloadReasons || [] };
    if (intersects(pendingEffects(), room.dependencies || [])) {
      return { ok: false, reason: 'dependencyPause', dependencies: room.dependencies || [], pendingEffects: pendingEffects() };
    }
    return { ok: true };
  }

  function recordRoomAction(kind, payload = {}) {
    if (log.length >= EXPLORE_SESSION_HARD_CAP) {
      enterPause('hardCap');
      return { accepted: false, reason: 'hardCap', pendingCount: log.length };
    }

    const room = currentPreparedRoom();
    if (!room || !(room.acceptedActions || []).includes(kind)) {
      enterPause('missingPayload');
      return { accepted: false, reason: 'missingPayload', pendingCount: log.length };
    }

    if (kind === 'proceed') {
      const nextRoom = runway?.preparedRooms?.find(candidate => candidate.index === room.index + 1) || null;
      const check = canEnterPreparedRoom(nextRoom);
      if (!check.ok) {
        enterPause(check.reason, check);
        return { accepted: false, reason: check.reason, pendingCount: log.length };
      }
    }

    const seq = nextSeq++;
    const entry = {
      seq,
      actionId: createActionId(seq),
      kind,
      roomIndex: room.index,
      roomId: room.roomId,
      actionSeq: room.actionSeq,
      payload,
      predictedEffects: effectsFor(room, kind),
      createdAt: Date.now(),
    };
    log.push(entry);
    if (kind === 'proceed') currentRoomIndex = room.index + 1;
    if (log.length >= EXPLORE_SESSION_HARD_CAP) enterPause('hardCap');
    scheduleDrain(EXPLORE_SYNC_DEBOUNCE_MS);
    return { accepted: true, entry, pendingCount: log.length };
  }

  async function syncNow() {
    if (debounceTimer != null) cancel(debounceTimer);
    debounceTimer = null;
    if (retryTimer != null) cancel(retryTimer);
    retryTimer = null;
    attempts = 0;
    await drain();
  }

  function reset() {
    generation += 1;
    clearTimers();
    runway = null;
    log = [];
    nextSeq = 1;
    currentRoomIndex = null;
    syncing = false;
    attempts = 0;
    paused = false;
  }

  return {
    adoptRunway,
    recordRoomAction,
    currentPreparedRoom,
    pendingCount: () => log.length,
    snapshot: () => log.map(entry => ({ ...entry })),
    syncNow,
    drain,
    reset,
    isPaused: () => paused,
  };
}

let activeExploreSession = null;

export function configureExploreSession(options = {}) {
  if (activeExploreSession) activeExploreSession.reset();
  activeExploreSession = createExploreSession(options);
  return activeExploreSession;
}

export function getExploreSession() {
  return activeExploreSession;
}

export function resetExploreSession() {
  if (activeExploreSession) activeExploreSession.reset();
  activeExploreSession = null;
}
```

- [ ] **Step 4: Run client tests**

Run:

```bash
node --test tests/unit/ui/explore-session.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
/usr/bin/git add public/js/ui/explore-session.js tests/unit/ui/explore-session.test.js
/usr/bin/git commit -m "feat: add client explore session"
```

## Task 7: Client Bootstrap And Proceed Cutover

**Files:**

- Modify: `public/js/api.js`
- Modify: `public/game.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `tests/unit/ui/auto-proceed-room-transition.test.js`
- Modify: `tests/unit/ui/room-transition-scroll.test.js`

- [ ] **Step 1: Write proceed cutover assertions**

In `tests/unit/ui/auto-proceed-room-transition.test.js`, replace the old source assertion that hard-codes `apiProceed({ actionId` and load `public/js/ui/exploration.js` as `explorationSrc` for the recovery-drain assertions:

```js
assert.match(autoProceedSrc, /getExploreSession\(\)\?\.recordRoomAction\('proceed'/);
assert.match(autoProceedSrc, /applyExploreSessionProceedResult/);
assert.match(explorationSrc, /addEventListener\('online'[\s\S]*syncNow\(\)/);
assert.match(explorationSrc, /visibilitychange[\s\S]*syncNow\(\)/);
```

- [ ] **Step 2: Run the targeted UI tests and verify failure**

Run:

```bash
node --test tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/room-transition-scroll.test.js
```

Expected: FAIL because `exploration.js` still uses `beginPendingRunAction()`.

- [ ] **Step 3: Configure explore session in exploration init**

Modify imports in `public/js/ui/exploration.js`:

```js
import { configureExploreSession, getExploreSession } from './explore-session.js';
```

In `init(callbacks)`, after API callbacks are assigned:

```js
  configureExploreSession({
    syncRequest: callbacks.apiSyncExploreSession,
    onCheckpoint: response => {
      if (response?.state) updateGameState(response.state);
      if (response?.exploreRunway) getGameState().run.exploreRunway = response.exploreRunway;
    },
    onCorrection: response => {
      if (response?.state || response?.authoritativeState) {
        updateGameState(response.state || response.authoritativeState);
      }
      updateUI();
    },
    onPause: showExploreSoftPause,
    onResume: hideExploreSoftPause,
  });
```

Add soft pause helpers in `public/js/ui/exploration.js`:

```js
function showExploreSoftPause({ reason, missingPayloadReasons = [] } = {}) {
  const detail = missingPayloadReasons.length > 0 ? ` (${missingPayloadReasons.join(', ')})` : '';
  sceneModule?.showNarration?.(`Connection is spotty. Your progress will sync when you reconnect.${detail}`, {
    autoDismiss: 1800,
  });
}

function hideExploreSoftPause() {
  updateUI?.();
}
```

- [ ] **Step 4: Wire reconnect drain triggers**

Add module-scoped listener guards in `public/js/ui/exploration.js`, then call `wireExploreSessionRecoveryDrains()` immediately after `configureExploreSession(...)` in `init(callbacks)`:

```js
let exploreSessionOnlineDrainTarget = null;
let exploreSessionVisibilityDrainTarget = null;

function wireExploreSessionRecoveryDrains({
  windowTarget = typeof window !== 'undefined' ? window : null,
  documentTarget = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (windowTarget?.addEventListener && exploreSessionOnlineDrainTarget !== windowTarget) {
    exploreSessionOnlineDrainTarget = windowTarget;
    windowTarget.addEventListener('online', () => {
      void getExploreSession()?.syncNow();
    });
  }
  if (documentTarget?.addEventListener && exploreSessionVisibilityDrainTarget !== documentTarget) {
    exploreSessionVisibilityDrainTarget = documentTarget;
    documentTarget.addEventListener('visibilitychange', () => {
      if (documentTarget.visibilityState !== 'hidden') {
        void getExploreSession()?.syncNow();
      }
    });
  }
}
```

- [ ] **Step 5: Pass `apiSyncExploreSession` from the game bootstrap**

In `public/game.js`, add `syncExploreSession as apiSyncExploreSession` to the named import block from `./js/api.js`.

Also import the session accessor:

```js
import { getExploreSession } from './js/ui/explore-session.js';
```

Where `explorationUI.init()` is called in `public/game.js`, pass:

```js
apiSyncExploreSession,
```

- [ ] **Step 6: Drain before recovery state fetches**

Add a small wrapper near the API helper functions in `public/game.js`:

```js
async function drainExploreSessionBeforeStateFetch(reason = 'stateFetch') {
  const session = getExploreSession?.();
  if (!session || session.pendingCount?.() === 0) return;
  try {
    await session.syncNow({ reason });
  } catch (error) {
    console.warn('[ExploreSession] state fetch drain failed:', error?.message || error);
  }
}

async function apiGetGameStateAfterExploreDrain(reason = 'stateFetch') {
  await drainExploreSessionBeforeStateFetch(reason);
  return apiGetGameState();
}
```

Use `apiGetGameStateAfterExploreDrain()` instead of direct `apiGetGameState()` in `loadGameState()` and the recovery paths in `public/game.js` (`triggerCreatureSelect()` cancellation and `recoverKanjiKombatStartState()`). Initial page load has no adopted runway/log yet, so the wrapper is a no-op there; live reconnects drain before `/api/game/state` rotates the explore epoch.

In `startEncounter()` in `public/game.js`, add the same checkpoint gate before choosing any combat-start API:

```js
  const exploreSession = getExploreSession?.();
  if (exploreSession?.pendingCount?.() > 0) {
    await exploreSession.syncNow({ reason: 'combatStart' });
    if (exploreSession.pendingCount() > 0) {
      narrationBox.show('Connection is spotty. Combat will start when your progress syncs.', { autoDismiss: 1800 });
      encounterStarting = false;
      return;
    }
  }
```

Do not call `recordRoomAction('encounter.start')`, `recordRoomAction('npcBattle.start')`, or `recordRoomAction('boss.start')`; combat start remains an online checkpoint boundary.

- [ ] **Step 7: Adopt runway before rendering explore phases**

At the start of `renderExploring()`, `renderFriendlyNpc()`, `renderShrine()`, `renderSkillMaster()`, `renderWhackAMole()`, `renderSpeedReviewRoom()`, and `renderCampfire()`, add:

```js
  getExploreSession()?.adoptRunway(getGameState()?.run?.exploreRunway || null);
```

- [ ] **Step 8: Replace proceed pending action with session action**

Add this helper in `public/js/ui/exploration.js`:

```js
function applyExploreSessionProceedResult(result) {
  if (!result?.accepted) return null;
  const state = getGameState();
  const draft = structuredClone(state);
  advanceStateToBufferedNextRoom(draft);
  updateGameState(draft);
  return draft;
}
```

Replace the first branch of `proceedWithRevealBuffer()` with:

```js
  const session = getExploreSession();
  session?.adoptRunway(state.run?.exploreRunway || null);
  const sessionResult = session?.recordRoomAction('proceed', {});
  if (sessionResult?.accepted) {
    const draft = applyExploreSessionProceedResult(sessionResult);
    clearActionArea();
    if (draft) {
      await playRoomTransition(draft, { ingredientDrops: [] });
      if (refreshUi) updateUI();
    }
    return { status: 'queued', actionId: sessionResult.entry.actionId };
  }
  if (sessionResult && !sessionResult.accepted) {
    return null;
  }
```

Keep the legacy `apiProceed()` fallback after this block so old states without `exploreRunway` remain playable during rollout.

- [ ] **Step 9: Run syntax and UI tests**

Run:

```bash
node --check public/game.js
node --check public/js/ui/exploration.js
node --test tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/room-transition-scroll.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
/usr/bin/git add public/js/api.js public/game.js public/js/ui/exploration.js tests/unit/ui/auto-proceed-room-transition.test.js tests/unit/ui/room-transition-scroll.test.js
/usr/bin/git commit -m "feat: route explore proceed through session"
```

## Task 8: Server Support Action Performers

**Files:**

- Modify: `src/game/services/exploration-service.js`
- Modify: `src/routes/game/run.js`
- Modify: `src/routes/game/economy.js`
- Modify: `src/routes/game/cooking.js`
- Modify: `src/routes/game/known-words.js`
- Modify: `tests/unit/game/explore-session-sync-service.test.js`
- Modify: `tests/unit/routes/optimistic-run-routes.test.js`

- [ ] **Step 1: Extend sync service tests for support actions**

Add cases to `tests/unit/game/explore-session-sync-service.test.js` for:

```js
test('commits dealer leave idempotently through explore sync', async () => {
  const gm = makeGm();
  gm.run.rooms[0] = createRoom(ROOM_TYPES.dealer, 'hajimari-no-hiroba', 1, 3);
  gm.run.rooms[0].dealer.offeredCreatures = [];
  gm.explorationService.applyDealerLeave = () => {
    gm.run.rooms[0].dealer.visited = true;
    gm.run.rooms[0].interacted = true;
    return { success: true };
  };
  const service = new ExploreSessionSyncService(gm);
  const entry = { seq: 1, actionId: 'run_es_1001', kind: 'dealer.leave', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: {} };
  const first = await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  const replay = await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  assert.equal(first.status, 'ok');
  assert.equal(replay.results[0].replayed, true);
  assert.equal(gm.run.rooms[0].interacted, true);
});
```

Add the helper and explicit replay cases below in the same file:

```js
async function expectSupportReplayOnce({ roomType, kind, payload = {}, installPerformer, assertApplied }) {
  const gm = makeGm();
  gm.run.rooms[0] = createRoom(roomType, 'hajimari-no-hiroba', 1, 3);
  let calls = 0;
  installPerformer(gm, () => { calls += 1; });
  const service = new ExploreSessionSyncService(gm);
  const entry = {
    seq: 1,
    actionId: `run_es_${kind.replace(/[^a-z]/gi, '').slice(0, 8)}1`,
    kind,
    roomIndex: 0,
    roomId: gm.run.rooms[0].id,
    actionSeq: 2,
    payload,
  };
  const first = await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  const replay = await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  assert.equal(first.status, 'ok');
  assert.equal(replay.results[0].replayed, true);
  assert.equal(calls, 1);
  assertApplied(gm);
}

test('campfire.skip replays without double mutation', async () => {
  await expectSupportReplayOnce({
    roomType: ROOM_TYPES.campfire,
    kind: 'campfire.skip',
    installPerformer: (gm, count) => {
      gm.explorationService.applyCampfireSkip = () => {
        count();
        gm.run.rooms[0].campfire.completed = true;
        gm.run.rooms[0].interacted = true;
        return { skipped: true };
      };
    },
    assertApplied: gm => assert.equal(gm.run.rooms[0].campfire.completed, true),
  });
});

test('whackAMole.skip replays without double mutation', async () => {
  await expectSupportReplayOnce({
    roomType: ROOM_TYPES.whackAMole,
    kind: 'whackAMole.skip',
    installPerformer: (gm, count) => {
      gm.explorationService.applyWhackAMoleSkip = () => {
        count();
        gm.run.rooms[0].whackAMole.completed = true;
        gm.run.rooms[0].interacted = true;
        return { skipped: true };
      };
    },
    assertApplied: gm => assert.equal(gm.run.rooms[0].interacted, true),
  });
});

test('speedReview.complete replays without double mutation', async () => {
  await expectSupportReplayOnce({
    roomType: ROOM_TYPES.speedReviewRoom,
    kind: 'speedReview.complete',
    payload: { roomId: 'hajimari-no-hiroba_room1' },
    installPerformer: (gm, count) => {
      gm.explorationService.applySpeedReviewComplete = () => {
        count();
        gm.run.rooms[0].speedReviewRoom.completed = true;
        gm.run.rooms[0].interacted = true;
        return { completed: true };
      };
    },
    assertApplied: gm => assert.equal(gm.run.rooms[0].speedReviewRoom.completed, true),
  });
});

test('wordDiscovery.complete replays without double mutation', async () => {
  await expectSupportReplayOnce({
    roomType: ROOM_TYPES.wordDiscovery,
    kind: 'wordDiscovery.complete',
    installPerformer: (gm, count) => {
      gm.explorationService.applyWordDiscoveryComplete = () => {
        count();
        gm.run.rooms[0].wordDiscovery.completed = true;
        gm.run.rooms[0].interacted = true;
        return { completed: true };
      };
    },
    assertApplied: gm => assert.equal(gm.run.rooms[0].wordDiscovery.completed, true),
  });
});
```

Also add a table-driven guard that every non-review support action cut over in Tasks 8-9 has a sync-service case. `wordDiscovery.review` is covered separately in Task 10 because it needs the known-word review performer extraction. These tests install stub performers so the failure is specifically `unsupported_explore_entry:<kind>` before the sync switch is updated:

```js
test('replays every Task 8 support-room action kind', async () => {
  const cases = [
    {
      roomType: ROOM_TYPES.shrine,
      kind: 'shrine.choose',
      payload: { rewardType: 'heal_all' },
      method: 'applyShrineChoose',
    },
    {
      roomType: ROOM_TYPES.skillMaster,
      kind: 'skillMaster.choose',
      payload: { skillId: 'counterMaster' },
      method: 'applySkillMasterChoose',
    },
    {
      roomType: ROOM_TYPES.npcBattle,
      kind: 'npcBattleSkill.choose',
      payload: { skillId: 'counterMaster' },
      method: 'applyNpcBattleSkillChoose',
      prepare: gm => {
        gm.run.rooms[0].npcBattle = {
          skillSelectionPending: true,
          offered: [{ id: 'counterMaster', level: 1 }],
        };
      },
    },
    {
      roomType: ROOM_TYPES.dealer,
      kind: 'dealer.sell',
      payload: { creatureId: 'hi-1' },
      method: 'applyDealerSell',
    },
    {
      roomType: ROOM_TYPES.dealer,
      kind: 'dealer.buy',
      payload: { creatureId: 'dealer-hi' },
      method: 'applyDealerBuy',
    },
    {
      roomType: ROOM_TYPES.campfire,
      kind: 'campfire.cook',
      payload: { ingredients: [{ id: 'mizu', quantity: 1 }] },
      method: 'applyCampfireCook',
    },
    {
      roomType: ROOM_TYPES.campfire,
      kind: 'campfire.feed',
      payload: { targetCreatureIndex: 0 },
      method: 'applyCampfireFeed',
    },
    {
      roomType: ROOM_TYPES.speedReviewRoom,
      kind: 'speedReview.commit',
      payload: { roomId: 'hajimari-no-hiroba_room1', word: '明るい', commitIndex: 0 },
      method: 'applySpeedReviewCommit',
    },
  ];

  for (const testCase of cases) {
    const gm = makeGm();
    gm.run.rooms[0] = createRoom(testCase.roomType, 'hajimari-no-hiroba', 1, 3);
    testCase.prepare?.(gm);
    let calls = 0;
    gm.explorationService[testCase.method] = payload => {
      calls += 1;
      gm.run.rooms[0].interacted = true;
      return { ok: true, payload };
    };
    const service = new ExploreSessionSyncService(gm);
    const entry = {
      seq: 1,
      actionId: `run_es_${String(cases.indexOf(testCase) + 3000).padStart(8, '0')}`,
      kind: testCase.kind,
      roomIndex: 0,
      roomId: gm.run.rooms[0].id,
      actionSeq: 2,
      payload: testCase.payload,
    };

    const first = await service.applyExploreSessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });
    const replay = await service.applyExploreSessionSync({
      sessionEpoch: gm.run.exploreSessionEpoch,
      entries: [entry],
    });

    assert.equal(first.status, 'ok', testCase.kind);
    assert.equal(replay.results[0].replayed, true, testCase.kind);
    assert.equal(calls, 1, testCase.kind);
  }
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js
```

Expected: FAIL with `unsupported_explore_entry` for new action kinds.

- [ ] **Step 3: Add performer methods to ExplorationService**

Add methods in `src/game/services/exploration-service.js`:

```js
  applyShrineChoose({ rewardType, creatureKey, creatureId } = {}) {
    return this.useShrineReward(rewardType, creatureKey || creatureId || null);
  }

  applySkillMasterChoose({ skillId } = {}) {
    if (!skillId) throw new Error('skill_id_required');
    return this.chooseSkillMasterOffer(skillId);
  }

  applyNpcBattleSkillChoose({ skillId } = {}) {
    if (!skillId) throw new Error('skill_id_required');
    const room = this.getCurrentRoom();
    if (!room || room.type !== ROOM_TYPES.npcBattle) throw new Error('not_npc_battle_room');
    if (!room.npcBattle?.skillSelectionPending) throw new Error('npc_battle_skill_selection_not_pending');
    if (room.npcBattle.chosenSkillId) throw new Error('npc_battle_skill_already_chosen');
    if (!Array.isArray(room.npcBattle.offered)) {
      this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
      room.npcBattle.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 })
        .map(({ id, level }) => ({ id, level }));
    }
    const canonicalSkillId = canonicalPartySkillTreeId(skillId);
    const offeredIds = room.npcBattle.offered.map(canonicalPartySkillTreeId).filter(Boolean);
    if (!canonicalSkillId || !offeredIds.includes(canonicalSkillId)) {
      throw new Error('invalid_npc_battle_skill_choice');
    }
    this.gm.run.partySkills = applyPartySkillChoice(this.gm.run.partySkills || [], canonicalSkillId);
    syncPartySkillHpBonuses(this.gm.run.creatureParty, this.gm.run.partySkills);
    room.npcBattle.chosenSkillId = canonicalSkillId;
    room.npcBattle.skillSelectionPending = false;
    room.interacted = true;
    this.gm.emitState();
    return { chosenId: canonicalSkillId, partySkills: this.gm.run.partySkills };
  }

  applyDealerSell({ creatureId } = {}) {
    if (!creatureId) throw new Error('creature_id_required');
    return this.dealerSell(creatureId);
  }

  applyDealerBuy({ creatureId } = {}) {
    if (!creatureId) throw new Error('creature_id_required');
    return this.dealerBuy(creatureId);
  }

  applyDealerLeave() {
    return this.leaveDealer();
  }

  applyWhackAMoleComplete({ score } = {}) {
    return this.gm.completeWhackAMole(score);
  }

  applyWhackAMoleSkip() {
    return this.gm.skipWhackAMole();
  }

  applySpeedReviewCommit({ roomId, word, commitIndex } = {}) {
    return this.recordSpeedReviewRoomCommit({ roomId, word, commitIndex });
  }

  applySpeedReviewComplete({ roomId } = {}) {
    return this.completeSpeedReviewRoom({ roomId });
  }

  applyWordDiscoveryComplete() {
    return this.gm.completeWordDiscovery();
  }
```

For campfire, move the existing route-local cook/feed/skip logic into pure functions in `src/game/services/cooking-service.js`:

```js
export function ensureCookingRunState(gm) {
  if (!gm.run.cooking) gm.run.cooking = { ingredients: {}, cookedThisRun: [] };
  if (!gm.run.cooking.ingredients) gm.run.cooking.ingredients = {};
  if (!Array.isArray(gm.run.cooking.cookedThisRun)) gm.run.cooking.cookedThisRun = [];
  if (!gm.meta) gm.initMeta?.();
  if (!Array.isArray(gm.meta.cookingRecipesDiscovered)) gm.meta.cookingRecipesDiscovered = [];
}

export function applyCampfireCook(gm, { ingredients = [] } = {}) {
  ensureCookingRunState(gm);
  const room = gm.getCurrentRoom();
  if (!room || room.type !== 'campfire') throw new Error('not_campfire_room');
  if (!room.campfire) room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };
  if (room.campfire.cookedDish) return { dish: room.campfire.cookedDish, alreadyCooked: true };
  if (!hasIngredients(gm.run.cooking.ingredients, ingredients)) throw new Error('not_enough_ingredients');
  const result = resolveCookingSelection(ingredients);
  consumeIngredientsFromBag(gm.run.cooking.ingredients, result.consumed);
  room.campfire.cookedDish = result.dish;
  room.campfire.consumed = result.consumed;
  room.campfire.resultKind = result.kind;
  return { dish: result.dish, consumed: result.consumed, resultKind: result.kind };
}

export function applyCampfireFeed(gm, { targetCreatureIndex } = {}) {
  ensureCookingRunState(gm);
  const room = gm.getCurrentRoom();
  if (!room || room.type !== 'campfire') throw new Error('not_campfire_room');
  if (!room.campfire?.cookedDish) throw new Error('no_cooked_dish_to_feed');
  if (room.campfire.fed) return { dish: room.campfire.cookedDish, alreadyFed: true };
  const targetIndex = Number(targetCreatureIndex);
  if (!Number.isInteger(targetIndex)) throw new Error('target_creature_required');
  const all = [...(gm.run.creatureParty?.active || []), ...(gm.run.creatureParty?.reserves || [])].filter(Boolean);
  const enemyLevel = all.reduce((max, creature) => Math.max(max, creature.level || 1), 1);
  const applyResult = applyCookedDish(room.campfire.cookedDish, gm.run.creatureParty, targetIndex, { enemyLevel });
  if (!applyResult.applied) throw new Error('dish_could_not_be_applied');
  if (room.campfire.resultKind === 'recipe') {
    const discovered = gm.meta.cookingRecipesDiscovered ||= [];
    if (!discovered.includes(room.campfire.cookedDish.id)) discovered.push(room.campfire.cookedDish.id);
  }
  gm.run.cooking.cookedThisRun.push({ id: room.campfire.cookedDish.id, targetCreatureIndex: targetIndex });
  room.campfire.fed = true;
  room.campfire.completed = true;
  room.interacted = true;
  return { dish: room.campfire.cookedDish, applyResult };
}

export function applyCampfireSkip(gm) {
  const room = gm.getCurrentRoom();
  if (!room || room.type !== 'campfire') throw new Error('not_campfire_room');
  if (!room.campfire) room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };
  room.campfire.completed = true;
  room.campfire.skipped = true;
  room.interacted = true;
  return { skipped: true };
}
```

Then import those functions into `src/game/services/exploration-service.js` and add:

```js
  applyCampfireCook(payload = {}) {
    return applyCampfireCook(this.gm, payload);
  }

  applyCampfireFeed(payload = {}) {
    return applyCampfireFeed(this.gm, payload);
  }

  applyCampfireSkip() {
    return applyCampfireSkip(this.gm);
  }
```

Update `src/routes/game/cooking.js` to call the same `applyCampfireCook()`, `applyCampfireFeed()`, and `applyCampfireSkip()` helpers inside its optimistic route wrappers so legacy endpoints and explore sync cannot diverge.

Also update these existing optimistic route callbacks in `src/routes/game/run.js` to call the new shared performers:

```js
// /skill-master-choose
const result = req.gameManager.explorationService.applySkillMasterChoose({ skillId });
return { ...result, state: req.getEnrichedGameState() };

// /npc-battle-skill-choose
const result = req.gameManager.explorationService.applyNpcBattleSkillChoose({ skillId });
return { ...result, state: req.getEnrichedGameState() };

// /shrine-choose
const result = req.gameManager.explorationService.applyShrineChoose({
  rewardType,
  creatureKey,
  creatureId,
});
return { ...result, state: req.getEnrichedGameState() };
```

- [ ] **Step 4: Wire action kinds in sync service**

Extend `applyExploreEntry()` in `src/game/services/explore-session-sync-service.js`:

```js
      case 'shrine.choose':
        return this.gm.explorationService.applyShrineChoose(entry.payload || {});
      case 'skillMaster.choose':
        return this.gm.explorationService.applySkillMasterChoose(entry.payload || {});
      case 'npcBattleSkill.choose':
        return this.gm.explorationService.applyNpcBattleSkillChoose(entry.payload || {});
      case 'dealer.sell':
        return this.gm.explorationService.applyDealerSell(entry.payload || {});
      case 'dealer.buy':
        return this.gm.explorationService.applyDealerBuy(entry.payload || {});
      case 'dealer.leave':
        return this.gm.explorationService.applyDealerLeave(entry.payload || {});
      case 'whackAMole.complete':
        return this.gm.explorationService.applyWhackAMoleComplete(entry.payload || {});
      case 'whackAMole.skip':
        return this.gm.explorationService.applyWhackAMoleSkip(entry.payload || {});
      case 'campfire.skip':
        return this.gm.explorationService.applyCampfireSkip(entry.payload || {});
      case 'campfire.cook':
        return this.gm.explorationService.applyCampfireCook(entry.payload || {});
      case 'campfire.feed':
        return this.gm.explorationService.applyCampfireFeed(entry.payload || {});
      case 'speedReview.commit':
        return this.gm.explorationService.applySpeedReviewCommit(entry.payload || {});
      case 'speedReview.complete':
        return this.gm.explorationService.applySpeedReviewComplete(entry.payload || {});
      case 'wordDiscovery.complete':
        return this.gm.explorationService.applyWordDiscoveryComplete(entry.payload || {});
```

- [ ] **Step 5: Make dealer leave legacy route idempotent**

In `src/routes/game/economy.js`, change `/dealer-leave` to use `runDealerAction`:

```js
  router.post('/dealer-leave', async (req, res) => {
    return runDealerAction(req, res, {
      actionType: 'dealer.leave',
      errorStatusCode: 409,
      legacyErrorStatusCode: 400,
      perform: () => {
        const result = req.gameManager.leaveDealer();
        return { ...result, state: req.getEnrichedGameState() };
      },
    });
  });
```

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js tests/unit/routes/optimistic-run-routes.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
/usr/bin/git add src/game/services/exploration-service.js src/game/services/explore-session-sync-service.js src/game/services/cooking-service.js src/routes/game/economy.js src/routes/game/cooking.js src/routes/game/known-words.js src/routes/game/run.js tests/unit/game/explore-session-sync-service.test.js tests/unit/routes/optimistic-run-routes.test.js
/usr/bin/git commit -m "feat: replay support room actions through explore sync"
```

## Task 9: Support Room Client Cutover

**Files:**

- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/campfire.js`
- Modify: `public/js/ui/economy.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`
- Modify: `tests/unit/ui/exploration-whack-a-mole.test.js`

- [ ] **Step 1: Update source-level tests**

In `tests/unit/ui/optimistic-run-integration.test.js`, replace assertions that require `pendingRunActionId`, `pendingCampfireActionId`, and `pendingDealerActionId` with:

```js
assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('friendlyNpc\.choose'/);
assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('shrine\.choose'/);
assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('skillMaster\.choose'/);
assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('npcBattleSkill\.choose'/);
assert.match(explorationSource, /getExploreSession\(\)\?\.recordRoomAction\('whackAMole\.complete'/);
assert.match(campfireSource, /recordRoomAction\('campfire\.cook'/);
assert.match(campfireSource, /recordRoomAction\('campfire\.feed'/);
assert.match(campfireSource, /recordRoomAction\('campfire\.skip'/);
assert.match(economySource, /recordRoomAction\('dealer\.sell'/);
assert.match(economySource, /recordRoomAction\('dealer\.buy'/);
assert.match(economySource, /recordRoomAction\('dealer\.leave'/);
```

- [ ] **Step 2: Run failing source tests**

Run:

```bash
node --test tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL because client files still use old pending action variables.

- [ ] **Step 3: Use prepared payloads in Friendly NPC, Shrine, Skill Master, Whack-a-Mole**

In each renderer in `public/js/ui/exploration.js`, read:

```js
  const prepared = getExploreSession()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
```

Use `payload.offered`, `payload.greeting`, `payload.rewards`, `payload.skillSelectPrompt`, `payload.dialogue`, and `payload.pool` before calling a legacy fetch. Keep the legacy fetch as a fallback only when `payload` is absent.

Cut over all support-room choices that `acceptedActions` advertises in Task 2: `friendlyNpc.choose`, `shrine.choose`, `skillMaster.choose`, `npcBattleSkill.choose`, `whackAMole.complete`, and `whackAMole.skip`.

Replace each successful action call with the session pattern:

```js
const queued = getExploreSession()?.recordRoomAction('friendlyNpc.choose', {
  itemId: item.id,
  targetCreatureIndex: creatureIndex,
});
if (!queued?.accepted) {
  friendlyNpcState.choosing = false;
  return;
}
```

Update local UI state immediately by marking the active room complete in `getGameState()` and calling `updateGameState(draft)`.

- [ ] **Step 4: Cut over campfire**

In `public/js/ui/campfire.js`, remove the module-level `pendingCampfireActionId` and replace `beginCampfireAction()` with:

```js
function recordCampfireAction(kind, payload = {}) {
  const session = callbacks.getExploreSession?.();
  const result = session?.recordRoomAction(kind, payload);
  if (!result?.accepted) {
    showCampfireFailure();
    return null;
  }
  return result;
}
```

Pass `getExploreSession` from `exploration.init()` when calling `campfireUI.init()`.

For skip:

```js
const queued = recordCampfireAction('campfire.skip', {});
if (queued) {
  campfireState.room.completed = true;
  clearCampfireUi();
  callbacks.updateUI?.();
}
```

For cook and feed, record `campfire.cook` and `campfire.feed`, update local `campfireState` deterministically from selected ingredients and chosen target, and leave durable state to checkpoint.

- [ ] **Step 5: Cut over dealer**

In `public/js/ui/economy.js`, remove `pendingDealerActionId` and wire buttons through:

```js
function recordDealerAction(kind, payload = {}) {
  const session = getExploreSession?.();
  const result = session?.recordRoomAction(kind, payload);
  if (!result?.accepted) return null;
  return result;
}
```

Pass `getExploreSession` through `economy.init()` from the game bootstrap. For leave:

```js
const queued = recordDealerAction('dealer.leave', {});
if (queued) {
  const draft = structuredClone(getGameState());
  const room = draft.room || draft.run?.exploreRunway?.preparedRooms?.find(entry => entry.index === draft.run.currentRoom)?.room;
  if (room?.dealer) room.dealer.visited = true;
  if (room) room.interacted = true;
  updateGameState(draft);
  updateUI();
}
```

- [ ] **Step 6: Run syntax and UI tests**

Run:

```bash
node --check public/js/ui/exploration.js
node --check public/js/ui/campfire.js
node --check public/js/ui/economy.js
node --test tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/exploration-whack-a-mole.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
/usr/bin/git add public/js/ui/exploration.js public/js/ui/campfire.js public/js/ui/economy.js tests/unit/ui/optimistic-run-integration.test.js tests/unit/ui/exploration-whack-a-mole.test.js
/usr/bin/git commit -m "feat: cut support rooms over to explore session"
```

## Task 10: Review And Discovery Sync Entries

**Files:**

- Modify: `src/routes/game/known-words.js`
- Modify: `src/game/services/exploration-service.js`
- Modify: `src/game/services/explore-session-sync-service.js`
- Modify: `public/js/ui/exploration.js`
- Modify: `tests/unit/known-words-review.test.js`
- Modify: `tests/unit/game/explore-session-sync-service.test.js`

- [ ] **Step 1: Write review replay tests**

Add to `tests/unit/game/explore-session-sync-service.test.js`:

```js
test('wordDiscovery.review replays without double grading', async () => {
  const gm = makeGm();
  gm.run.rooms[0] = createRoom(ROOM_TYPES.wordDiscovery, 'hajimari-no-hiroba', 1, 3);
  let reviewCount = 0;
  gm.explorationService.applyWordDiscoveryReview = ({ word, grade }) => {
    reviewCount += 1;
    return { ok: true, word, grade };
  };
  const service = new ExploreSessionSyncService(gm);
  const entry = { seq: 1, actionId: 'run_es_2001', kind: 'wordDiscovery.review', roomIndex: 0, roomId: gm.run.rooms[0].id, actionSeq: 2, payload: { word: '明るい', grade: 'good' } };
  await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  const replay = await service.applyExploreSessionSync({ sessionEpoch: gm.run.exploreSessionEpoch, entries: [entry] });
  assert.equal(reviewCount, 1);
  assert.equal(replay.results[0].replayed, true);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js
```

Expected: FAIL with unsupported `wordDiscovery.review`.

- [ ] **Step 3: Extract known-word review performer**

In `src/routes/game/known-words.js`, extract the body of `performReview` into an exported function:

```js
export function performKnownWordReview(req, {
  word,
  grade,
  isDiscovery,
  reviewFusionCoreRandom = Math.random,
} = {}) {
  if (!word || !['good', 'again'].includes(grade)) {
    throw new Error('word and grade (good|again) required');
  }
  const userId = req.user?.id || 'default';
  const settings = req.getSettings?.() || {};
  const dailyLimit = settings.dailyWordLimit ?? 10;

  if (isDiscovery) {
    const status = getDiscoveryStatus(userId, dailyLimit);
    if (status.atLimit) {
      return { ok: false, atLimit: true, todayCount: status.todayCount };
    }
  }

  const existingCards = getDeckCards(req.user.id, 'vocab');
  const preReviewCard = existingCards.find(card => card.id === word) || null;
  const fusionCoreEligible = isReviewFusionCoreEligible({
    grade,
    isDiscovery,
    preReviewCard,
  });

  if (!preReviewCard) {
    createCard(req.user.id, 'vocab', word, { word });
  }
  const updatedCard = gradeCard(req.user.id, 'vocab', word, grade);
  addReview(userId);

  const baseResponse = {
    ok: true,
    mastered: grade === 'good',
    card: {
      state: updatedCard.state,
      due: updatedCard.due,
      lapses: updatedCard.lapses,
    },
  };

  const response = isDiscovery
    ? {
        ...baseResponse,
        ...incrementDiscoveryCount(userId, dailyLimit),
      }
    : baseResponse;

  const meta = req.gameManager?.getMeta?.() || req.gameManager?.meta;
  if (!meta) return response;
  const fusionCoreDrop = rollReviewFusionCoreDrop(meta, {
    eligible: fusionCoreEligible,
    random: reviewFusionCoreRandom,
  });
  if (!fusionCoreDrop) return response;
  req.saveGame?.();
  return {
    ...response,
    fusionCoreDrop,
    state: req.getEnrichedGameState?.(),
  };
}
```

Then make the route call:

```js
const performReview = () => performKnownWordReview(req, {
  word,
  grade,
  isDiscovery,
  reviewFusionCoreRandom,
});
```

- [ ] **Step 4: Add sync performer**

In `src/game/services/exploration-service.js`, add:

```js
  applyWordDiscoveryReview({ word, grade } = {}) {
    if (!word || !['good', 'again'].includes(grade)) throw new Error('invalid_word_discovery_review');
    if (!this.gm.run?.pendingWordDiscoveryReviews) this.gm.run.pendingWordDiscoveryReviews = [];
    this.gm.run.pendingWordDiscoveryReviews.push({ word, grade });
    return { ok: true, word, grade };
  }
```

The sync route will call the extracted route performer in the integration layer when a real `req` is available. The service-level fallback records the review intent for unit tests and correction safety.

- [ ] **Step 5: Wire sync service**

Extend `applyExploreEntry()`:

```js
      case 'wordDiscovery.review':
        return this.gm.explorationService.applyWordDiscoveryReview(entry.payload || {});
```

- [ ] **Step 6: Cut over discovery client reviews**

In `public/js/ui/exploration.js`, in word discovery swipe handling, replace direct `apiSwipeWord(word, grade, true, { actionId })` with:

```js
const queued = getExploreSession()?.recordRoomAction('wordDiscovery.review', {
  word: detail.word,
  grade: detail.knew ? 'good' : 'again',
});
if (!queued?.accepted) {
  showExploreSoftPause({ reason: queued?.reason || 'missingPayload' });
  return;
}
```

Continue to update local `discoveryState.wordsLearned` immediately. Do not call the legacy review endpoint from the new path.

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/unit/game/explore-session-sync-service.test.js tests/unit/known-words-review.test.js
node --check public/js/ui/exploration.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
/usr/bin/git add src/routes/game/known-words.js src/game/services/exploration-service.js src/game/services/explore-session-sync-service.js public/js/ui/exploration.js tests/unit/known-words-review.test.js tests/unit/game/explore-session-sync-service.test.js
/usr/bin/git commit -m "feat: sync discovery and review room entries"
```

## Task 11: Cleanup Legacy Pending Layers

**Files:**

- Modify: `public/js/ui/exploration.js`
- Modify: `public/js/ui/campfire.js`
- Modify: `public/js/ui/economy.js`
- Modify: `tests/unit/ui/optimistic-run-integration.test.js`

- [ ] **Step 1: Add deletion assertions**

In `tests/unit/ui/optimistic-run-integration.test.js`, add:

```js
assert.doesNotMatch(explorationSource, /pendingRunActionId/);
assert.doesNotMatch(campfireSource, /pendingCampfireActionId/);
assert.doesNotMatch(economySource, /pendingDealerActionId/);
assert.doesNotMatch(explorationSource, /did not save\. Please/);
```

- [ ] **Step 2: Run failing source test**

Run:

```bash
node --test tests/unit/ui/optimistic-run-integration.test.js
```

Expected: FAIL while old pending variables or forbidden copy remain.

- [ ] **Step 3: Delete old helpers and forbidden copy**

Remove these symbols and all direct call sites from `public/js/ui/exploration.js`:

```text
pendingRunActionId
beginPendingRunAction
clearPendingRunAction
isCurrentPendingRunAction
reconcilePendingRunAction
rollbackPendingRunAction
WORD_DISCOVERY_SAVE_FAILURE_COPY
SPEED_REVIEW_SAVE_FAILURE_COPY
WHACK_A_MOLE_SAVE_FAILURE_COPY
```

Remove from `public/js/ui/campfire.js`:

```js
let pendingCampfireActionId = null;
```

Remove from `public/js/ui/economy.js`:

```js
let pendingDealerActionId = null;
```

Replace ordinary network-drop copy with:

```js
const EXPLORE_SPOTTY_COPY = 'Connection is spotty. Your progress will sync when you reconnect.';
```

- [ ] **Step 4: Keep legacy endpoints server-side with comments**

Above legacy route handlers in `src/routes/game/run.js`, `src/routes/game/economy.js`, and `src/routes/game/cooking.js`, add:

```js
// Compatibility path for clients that have not adopted /api/game/explore/sync.
// The session client should not call this endpoint after explore runway cutover.
```

- [ ] **Step 5: Run cleanup checks**

Run:

```bash
rg "pendingRunActionId|pendingCampfireActionId|pendingDealerActionId|did not save\\. Please" public/js/ui
node --check public/js/ui/exploration.js
node --check public/js/ui/campfire.js
node --check public/js/ui/economy.js
node --test tests/unit/ui/optimistic-run-integration.test.js
```

Expected: `rg` returns no matches; syntax checks and unit test pass.

- [ ] **Step 6: Commit**

Run:

```bash
/usr/bin/git add public/js/ui/exploration.js public/js/ui/campfire.js public/js/ui/economy.js src/routes/game/run.js src/routes/game/economy.js src/routes/game/cooking.js tests/unit/ui/optimistic-run-integration.test.js
/usr/bin/git commit -m "refactor: remove explore pending action layers"
```

## Task 12: Subway Harness And Final Verification

**Files:**

- Create: `tests/smoke/explore-subway-runway.test.js`
- Modify: `tests/README.md`
- Read: `docs/playtest-guide.md`

- [ ] **Step 1: Read playtest guide**

Run:

```bash
sed -n '1,260p' docs/playtest-guide.md
```

Expected: guide loads. Follow its room interaction instructions during manual validation.

- [ ] **Step 2: Add on-demand smoke harness**

Create `tests/smoke/explore-subway-runway.test.js`:

```js
import { test, expect } from '@playwright/test';

const DEV_USER = 'devtester';
const DEV_PASS = 'test1234';
const LOCAL_URL = process.env.KOTO_BASE_URL || 'http://localhost:5173';

async function login(page) {
  await page.goto(LOCAL_URL, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/username/i).fill(DEV_USER);
  await page.getByLabel(/password/i).fill(DEV_PASS);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForFunction(() => window.__gameState?.phase);
}

async function goOfflineForApi(page) {
  await page.route('**/api/game/**', route => route.abort('failed'));
}

async function restoreApi(page) {
  await page.unroute('**/api/game/**');
}

async function tapAndMeasure(page, selector) {
  const started = Date.now();
  await page.locator(selector).first().click();
  await page.waitForTimeout(50);
  return Date.now() - started;
}

test.describe('explore subway runway smoke', () => {
  test('prepared explore rooms acknowledge taps during API outage', async ({ page }) => {
    test.skip(process.env.EXPLORE_SUBWAY_SMOKE !== '1', 'On-demand until explore session cutover is complete');
    await login(page);
    await page.addStyleTag({ path: 'public/dev-safe-area.css' });

    await expect.poll(
      () => page.evaluate(() => window.__gameState?.run?.exploreRunway?.preparedRooms?.length || 0),
      { timeout: 10000 }
    ).toBeGreaterThan(1);

    await goOfflineForApi(page);
    const elapsed = await tapAndMeasure(page, 'button:has-text("進む"), button:has-text("Explore"), button:has-text("Yes")');
    expect(elapsed).toBeLessThan(250);

    const text = await page.locator('body').innerText();
    expect(text).not.toContain('did not save');
    expect(text).not.toContain('Invalid choice');
    expect(await page.locator('#action-area').innerHTML()).not.toEqual('');

    await restoreApi(page);
    await page.waitForResponse(response => response.url().includes('/api/game/explore/sync'), { timeout: 15000 });
  });
});
```

- [ ] **Step 3: Document the harness**

In `tests/README.md`, add:

```md
### Explore Subway Runway Smoke

Run this after the explore session runway cutover:

```bash
EXPLORE_SUBWAY_SMOKE=1 KOTO_BASE_URL=http://localhost:5173 npx playwright test tests/smoke/explore-subway-runway.test.js
```

The test is skipped by default because it requires the local Vite + Express dev server and the seeded `devtester` account.
```

- [ ] **Step 4: Run full automated checks**

Run:

```bash
npm test
node --check public/game.js
node --check public/js/ui/explore-session.js
node --check public/js/ui/exploration.js
node --check public/js/ui/campfire.js
node --check public/js/ui/economy.js
```

Expected: all commands pass.

- [ ] **Step 5: Run the dev server for manual validation**

Run:

```bash
npm run dev
```

Expected: Vite is available at `http://localhost:5173`.

- [ ] **Step 6: Verify dev server health**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200`.

- [ ] **Step 7: Manual playtest**

Use the Playwright MCP browser only after user approval. Navigate to `http://localhost:5173`, inject `public/dev-safe-area.css`, log in as `devtester` / `test1234`, enter regular explore, and verify:

- Current room plus five prepared rooms appear in `window.__gameState.run.exploreRunway.preparedRooms`.
- Proceed acknowledges immediately during a blocked `/api/game/explore/sync` request.
- Friendly NPC, shrine, campfire, whack-a-mole, speed review, word discovery, and dealer render from prepared payloads without blank action areas.
- Ordinary network drops show the spotty-connection copy and not room-specific "did not save" copy.
- Combat rooms pause at start if a checkpoint is required.
- Reconnect drains multiple queued entries in one `/api/game/explore/sync` request.

- [ ] **Step 8: Commit verification harness**

Run:

```bash
/usr/bin/git add tests/smoke/explore-subway-runway.test.js tests/README.md
/usr/bin/git commit -m "test: add explore subway runway smoke harness"
```

## Final Integration

- [ ] **Step 1: Run final merge gate**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Review worktree diff**

Run:

```bash
/usr/bin/git status --short
/usr/bin/git log --oneline --decorate -12
```

Expected: only intended files are changed; task commits are visible on `feature/explore-session-runway-sync`.

- [ ] **Step 3: Merge back to dev**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/explore-session-runway-sync
npm test
/usr/bin/git push origin dev
```

Expected: merge succeeds, tests pass, and `dev` pushes.

- [ ] **Step 4: Advance master after dev push**

Run:

```bash
/usr/bin/git push origin dev:master
```

Expected: master fast-forwards to the same SHA as dev.

- [ ] **Step 5: Clean up feature worktree after merge**

Run:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git worktree remove ../koto-wt-explore-session-runway
/usr/bin/git branch -d feature/explore-session-runway-sync
```

Expected: feature worktree and local branch are removed.

## Self-Review Notes

- Spec coverage: runway size, i+1/frame-safe payload rule, audio metadata, batch sync, idempotent action ledger replay, correction handling, pause conditions, deletion targets, tests, and rollout phases are covered by Tasks 1-12.
- Gaps intentionally resolved in plan: epoch lifecycle, `roomActionSeq` semantics, compatibility with `revealedRooms`, dependency pause tags, combat-start boundary, and smoke harness gating.
- Dictionary safety: no task edits `data/dictionary.json`.
- Static Japanese safety: no task adds new static Japanese text; session entry narration uses `narrationFrame: null` unless frame-backed copy exists.
