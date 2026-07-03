# Explore Subway Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make regular explore mode complete a full area run (travel, support rooms, encounters, boss) through 60–120s connectivity drops, verified by a full-session subway harness — including offline PvE combat via a pre-committed seed chain batched through `/api/game/explore/sync`.

**Architecture:** Three stages per the spec (`docs/superpowers/specs/2026-07-03-explore-subway-stability-design.md`). Stage 0: full-session Playwright harness committed red. Stage 1: fix what the rooms tier flags, warm TTS for prepared frames, delete the legacy `revealedRooms` parallel path and orphans, land the docs. Stage 2: combat rooms carry a prepared combat start + ~40-seed chain in the runway; `encounter.start`/`npcBattle.start`/`boss.start`/`combat.cycle` become explore-log entries replayed server-side through `CombatCycleService` with transcript-hash verification (mirrors `applySessionEntry`'s quiz branch in `src/game/services/kanji-kombat-service.js:1589-1636`).

**Tech Stack:** Node.js + Express, ES modules, browser JS, `node:test`, Playwright smoke harness, existing shared deterministic combat resolvers (`resolvePveCursorTurn` / `resolvePveTurn`), persisted action ledger.

## Global Constraints

- Forbidden copy on ordinary network drops: `did not save`, `Invalid choice`, `Synced with server`. Soft-pause copy is `Connection is spotty. Your reviews will sync when you reconnect.` (or the explore equivalent already used by `showExploreSoftPause`).
- Every piece of Japanese shown to the player must be i+1-validated via the frames pipeline. Never hand-write tokenizations; never ship raw static Japanese in new payloads (`narrationFrame` stays `null` where no frame category exists — none exists for room entry today).
- Never modify `data/dictionary.json`.
- PvP is untouched: shared resolvers/visuals/mechanics stay identical; only PvE explore transport changes. Do not edit `public/js/ui/pvp-battle.js` or PvP server paths.
- Anti-cheat unchanged: server deterministically replays every combat turn and verifies transcript hashes before committing.
- Use `/usr/bin/git` (never Homebrew git). Work in the feature worktree created in Task 0.
- `npm test` (Tier 1 + 2) must pass before every merge to dev. The subway harness stays on-demand (`EXPLORE_SUBWAY_SMOKE=1`) — it is a smoke gate, not part of `npm test`.
- After editing any `public/js` file run `node --check <file> && echo OK`.
- Exactly two client pause conditions: runway/payload/seed exhaustion (incl. dependency pause) and log hard cap (50, resume at 40). One reconciliation rule: `confirmedThroughSeq` checkpoint vs correction-truncate-and-snap.

---

## Stage 0 — Full-Session Subway Harness (red)

### Task 0: Feature worktree

**Files:** none (git only)

- [ ] **Step 1: Sync dev and create the worktree**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git worktree add ../koto-wt-explore-subway -b feature/explore-subway-stability
cd ../koto-wt-explore-subway
npm install
```

Expected: worktree exists, `npm install` completes.

- [ ] **Step 2: Verify baseline tests pass**

Run: `npm test`
Expected: PASS (same as dev tip). If dev is red, stop and report before proceeding.

---

### Task 1: Replace the stub with the full-session explore subway harness

**Files:**
- Modify: `tests/smoke/explore-subway-runway.test.js` (full rewrite; the 77-line stub is deleted by this rewrite)
- Read for patterns: `tests/smoke/kanji-kombat-subway.test.js` (the 489-line KK harness — window scheduling, stall recovery, forbidden-copy assertions)
- Read before driving UI: `docs/playtest-guide.md`

**Interfaces:**
- Consumes: `devtester`/`test1234` seeded account; Vite dev server at `http://localhost:5173`; `window.__gameState` (exposed by the game bundle); `/api/game/state`; `/api/game/explore/sync`.
- Produces: env-tiered harness — `EXPLORE_SUBWAY_SMOKE=1` runs the rooms tier; `EXPLORE_SUBWAY_COMBAT=1` additionally requires fights to proceed while offline (Stage 2 exit gate). Rooms tier soft-pauses at combat doors during outages and waits for a connectivity window.

- [ ] **Step 1: Read the KK harness end to end**

Run: `sed -n '1,120p' tests/smoke/kanji-kombat-subway.test.js` (and continue through the file). Note: `OFFLINE_WINDOWS` scheduling (never overlap windows), buffer-refill wait before the next window, stall-recovery assertion pattern, `MAX_INTERACTIONS` guard, final server-state assertions, `correctedSyncs` counter via response listener.

- [ ] **Step 2: Write the harness**

Structure (complete driver; adapt selectors from `docs/playtest-guide.md` where they differ at implementation time — verify each selector against the live DOM before relying on it):

```js
import { test, expect } from '@playwright/test';

const LOCAL_URL = process.env.KOTO_BASE_URL || 'http://localhost:5173';
const DEV_USER = 'devtester';
const DEV_PASS = 'test1234';
const ROOMS_TIER = process.env.EXPLORE_SUBWAY_SMOKE === '1';
const COMBAT_TIER = process.env.EXPLORE_SUBWAY_COMBAT === '1';
const TAP_ACK_MS = 250;
const MAX_INTERACTIONS = 400;
// Two offline windows with a slow window between, mirroring the KK harness.
const OFFLINE_WINDOWS = [
  { afterInteractions: 6, durationMs: 75_000 },
  { afterInteractions: 18, durationMs: 100_000 },
];
const FORBIDDEN_COPY = ['did not save', 'Invalid choice', 'Synced with server'];

async function login(page) { /* identical to the KK harness login via /api/auth/login + authToken initScript */ }
async function gameState(page) {
  return page.evaluate(() => window.__gameState || null);
}
async function serverState(page) { /* fetch /api/game/state with bearer token, as in the stub */ }

test.describe('explore subway full session', () => {
  test('full area run survives scripted offline windows', async ({ page, context }) => {
    test.skip(!ROOMS_TIER && !COMBAT_TIER, 'on-demand: EXPLORE_SUBWAY_SMOKE=1 [EXPLORE_SUBWAY_COMBAT=1]');
    await login(page);

    // --- offline window machinery (KK harness pattern) ---
    let offline = false;
    let correctedSyncs = 0;
    page.on('response', async res => {
      if (!res.url().includes('/api/game/explore/sync')) return;
      const body = await res.json().catch(() => null);
      if (body?.status === 'corrected') correctedSyncs += 1;
    });
    async function goOffline() {
      offline = true;
      await context.route('**/api/**', route => route.abort('failed'));
    }
    async function goOnline() {
      offline = false;
      await context.unroute('**/api/**');
    }

    // --- action ledger for the final server comparison ---
    const played = { proceeds: 0, supportActions: 0, combatStarts: 0, combatTurns: 0 };

    // --- per-phase drivers ---
    // Each driver: snapshot state -> find the primary tap -> click -> assert ack < TAP_ACK_MS
    // Ack = any DOM mutation in #action-area or the scene overlay within TAP_ACK_MS.
    async function tapAndAssertAck(locator) {
      const before = await page.locator('#action-area').innerHTML();
      const started = Date.now();
      await locator.click();
      await expect
        .poll(async () => (await page.locator('#action-area').innerHTML()) !== before
          || Date.now() - started < TAP_ACK_MS, { timeout: TAP_ACK_MS + 200 })
        .toBeTruthy();
    }

    async function driveOneInteraction() {
      const state = await gameState(page);
      const phase = state?.phase;
      const roomType = state?.run?.currentRoom?.type
        || state?.run?.exploreRunway?.preparedRooms?.find(r => r.index === state?.run?.currentRoom)?.room?.type;

      // Soft pause visible? Assert it is the sanctioned copy, then wait for resume.
      const pauseVisible = await page.locator('text=Connection is spotty').count();
      if (pauseVisible > 0) {
        expect(offline || (await gameState(page)) !== null, 'pause shown while online with prepared rooms').toBeTruthy();
        await page.waitForTimeout(1000);
        return 'paused';
      }

      // Narration boxes: dismiss by clicking OUTSIDE (playtest guide rule).
      if (await page.locator('.narration-box').count()) {
        await page.evaluate(() => document.querySelector('.scene-area')?.click());
        await page.waitForTimeout(600);
        return 'narration';
      }

      if (phase === 'room_encounter' || roomType === 'encounter' || roomType === 'boss' || roomType === 'npcBattle') {
        const fight = page.locator('button:has-text("戦う")').first();
        if (await fight.count()) {
          if (offline && !COMBAT_TIER) { await page.waitForTimeout(1000); return 'combat-door-wait'; }
          await tapAndAssertAck(fight);
          played.combatStarts += 1;
          return 'combat-start';
        }
        // In combat: flip + swipe attack cards per playtest guide; count turns.
        const card = page.locator('.dual-flash-card.attack').first();
        if (await card.count()) {
          await card.click(); // flip
          const box = await card.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
          await page.mouse.up();
          played.combatTurns += 1;
          return 'combat-turn';
        }
        await page.waitForTimeout(500);
        return 'combat-anim';
      }

      // Support rooms: pick the primary/affirmative button; record it.
      const primary = page.locator('#action-area button').first();
      if (await primary.count()) {
        const label = await primary.innerText();
        await tapAndAssertAck(primary);
        if (label.includes('進む')) played.proceeds += 1; else played.supportActions += 1;
        return 'support';
      }

      // No tap available and no pause copy => blank action area bug.
      const pauseCopy = await page.locator('text=Connection is spotty').count();
      expect(pauseCopy > 0, `blank action area with no pause copy (offline=${offline})`).toBeTruthy();
      return 'waiting';
    }

    // --- main loop ---
    let interactions = 0;
    let windowIndex = 0;
    let restoreAt = null;
    while (interactions < MAX_INTERACTIONS) {
      const state = await gameState(page);
      if (state?.phase === 'area_complete' || state?.run?.victory) break;

      const win = OFFLINE_WINDOWS[windowIndex];
      if (win && interactions >= win.afterInteractions && restoreAt === null) {
        await goOffline();
        restoreAt = Date.now() + win.durationMs;
        windowIndex += 1;
      }
      if (restoreAt !== null && Date.now() >= restoreAt) {
        await goOnline();
        restoreAt = null;
      }

      // Forbidden copy is asserted every iteration.
      const bodyText = await page.locator('body').innerText();
      for (const copy of FORBIDDEN_COPY) {
        expect(bodyText.includes(copy), `forbidden copy "${copy}" (offline=${offline})`).toBeFalsy();
      }

      await driveOneInteraction();
      interactions += 1;
    }

    // --- final assertions ---
    if (restoreAt !== null) await goOnline();
    await page.waitForTimeout(3000); // allow final drain
    const server = await serverState(page);
    expect(server?.run?.currentRoom, 'server room index caught up to played proceeds')
      .toBeGreaterThanOrEqual(played.proceeds);
    expect(correctedSyncs, 'no corrected syncs on the happy path').toBe(0);
    expect(interactions).toBeLessThan(MAX_INTERACTIONS);
  });
});
```

The final server-state comparison must also assert support-room completion: fetch `/api/game/state` and check the current/passed prepared rooms' `interacted`/completion flags match `played.supportActions` in count. Write this as a helper `assertServerMatchesPlayed(server, played)` with explicit expects.

- [ ] **Step 3: Syntax-check and lint the harness**

Run: `node --check tests/smoke/explore-subway-runway.test.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Run the rooms tier against current dev (expect failures)**

```bash
npm run dev &   # wait 5s, verify: curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 → 200
EXPLORE_SUBWAY_SMOKE=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js
```

Expected: FAIL — this is the point. Capture every distinct failure (assertion text, offline/online, phase, room type) verbatim.

- [ ] **Step 5: Write the baseline findings doc**

Create `docs/superpowers/plans/2026-07-03-explore-subway-baseline-findings.md` listing each observed failure: assertion, repro phase/room, offline or online, first guess at owning module. This is Stage 1's work queue.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add tests/smoke/explore-subway-runway.test.js docs/superpowers/plans/2026-07-03-explore-subway-baseline-findings.md
/usr/bin/git commit -m "test: full-session explore subway harness (committed red)"
```

---

## Stage 1 — Rooms Hardening + Cleanup

### Task 2: Wire the session pause UI callbacks (first known suspect)

**Files:**
- Modify: `public/js/ui/exploration.js:411-420` (the `configureExploreSession` call)
- Test: `tests/unit/ui/explore-session-wiring.test.js` (create)

**Interfaces:**
- Consumes: `configureExploreSession({ syncRequest, onCheckpoint, onCorrection, onPause, onResume })` from `public/js/ui/explore-session.js:98-107`; `showExploreSoftPause({ reason })` already exported/used in `exploration.js`.
- Produces: pause/resume UI driven by the session's `onPause`/`onResume` callbacks (today the session pauses internally but may render nothing until the next tap).

- [ ] **Step 1: Verify the suspect**

Run: `sed -n '405,425p' public/js/ui/exploration.js`
If `onPause`/`onResume` are already wired to visible UI, mark this task complete and move on. Otherwise continue.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/ui/explore-session-wiring.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExploreSession } from '../../../public/js/ui/explore-session.js';

test('hard cap pause fires onPause and resume fires onResume', async () => {
  const events = [];
  const session = createExploreSession({
    syncRequest: async () => { throw new Error('offline'); },
    onPause: info => events.push(['pause', info.reason]),
    onResume: info => events.push(['resume', info.reason]),
    schedule: () => null, cancel: () => {},
  });
  session.adoptRunway({
    sessionEpoch: 'ese_0000000000000000', currentRoom: 0, preparedRooms: [{
      index: 0, roomId: 'r0', actionSeq: 0, room: { id: 'r0', type: 'shrine' },
      acceptedActions: ['shrine.choose'], actionEffects: {}, dependencies: [], offlineReady: true,
    }],
  });
  for (let i = 0; i < 50; i++) session.recordRoomAction('shrine.choose', { i });
  assert.deepEqual(events.at(-1), ['pause', 'hardCap']);
});
```

- [ ] **Step 3: Run it**

Run: `node --test tests/unit/ui/explore-session-wiring.test.js`
Expected: PASS (the module already fires callbacks). This test pins the contract; the real fix is the wiring below.

- [ ] **Step 4: Wire the callbacks in exploration.js**

In the `configureExploreSession({...})` call add:

```js
onPause: info => showExploreSoftPause({ reason: info?.reason }),
onResume: () => { updateUI(); },
```

Use the exact local names in scope (`showExploreSoftPause`, `updateUI` — both already imported/defined in `exploration.js`; verify with `grep -n "function showExploreSoftPause\|updateUI" public/js/ui/exploration.js`).

- [ ] **Step 5: Syntax check, run unit tests, commit**

```bash
node --check public/js/ui/exploration.js && echo OK
node --test tests/unit/ui/explore-session-wiring.test.js
/usr/bin/git add public/js/ui/exploration.js tests/unit/ui/explore-session-wiring.test.js
/usr/bin/git commit -m "fix: render soft pause from explore session pause callbacks"
```

---

### Task 3: Harness-driven fix loop (rooms tier)

**Files:** determined by the baseline findings doc from Task 1 Step 5. Likely: `public/js/ui/exploration.js`, `public/js/ui/explore-session.js`, `src/game/services/explore-runway-service.js`, `public/js/ui/campfire.js`, `public/js/ui/economy.js`.

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-07-03-explore-subway-baseline-findings.md`.
- Produces: rooms tier green.

This task is a strict loop, repeated until the rooms tier passes. For EACH finding, in order:

- [ ] **Step 1: Reproduce minimally** — use superpowers:systematic-debugging. Read the failing assertion, find the owning module, and write a focused failing `node:test` unit or integration test that reproduces the bug WITHOUT the browser (fake runway/fake sync like `tests/unit/ui/explore-session.test.js` does). The harness failure alone is not a spec; the unit test is.
- [ ] **Step 2: Run the new test, verify it fails** for the reason the harness showed.
- [ ] **Step 3: Fix minimally** — smallest change in the owning module. Do not restructure; Stage 1 is stabilization.
- [ ] **Step 4: Run the new test + the module's existing suite** (`node --test tests/unit/ui/explore-session.test.js tests/unit/game/explore-runway-service.test.js tests/unit/game/explore-session-sync-service.test.js` plus the new file). Expected: PASS.
- [ ] **Step 5: Commit** — `fix: <symptom> (explore subway rooms tier)` with the test in the same commit.
- [ ] **Step 6: Re-run the rooms tier harness**; strike the finding from the findings doc; commit the doc update. Loop until green.

Known suspects to check against findings (verify, don't assume):
- Legacy fallback swallowing offline taps: `proceedWithRevealBuffer` falls back to `await apiProceed()` when `isExploreRunwaySessionCapable` is false (`public/js/ui/exploration.js:1015-1031`) — offline, that throws into `showExploreSoftPause()` but leaves no retry trigger.
- `renderExploring` renders 戦う/進む from `gameState.run.currentRoom` (legacy state), not the prepared room — divergence after locally predicted proceeds.
- Word discovery / speed review swipes during outages: confirm `speedReview.commit` entries drain in order and the UI does not fetch at render time.
- Reconnect drains: `wireExploreSessionRecoveryDrains` (`exploration.js:156-183`) — confirm `online` and `visibilitychange` actually reach `syncNow()` in the built page (harness can toggle `context.setOffline` and assert a `/explore/sync` request follows).

- [ ] **Final step: rooms tier green**

Run: `EXPLORE_SUBWAY_SMOKE=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js`
Expected: PASS. Commit the final findings-doc update marking baseline cleared.

---

### Task 4: Warm dialogue TTS for prepared runway frames

**Files:**
- Modify: `src/game/services/explore-runway-service.js` (after payload build)
- Investigate first: `grep -rn "greetingTts\|ttsDialogueCache" src/ | head -20` to locate the dialogue TTS synthesis/cache entry point used by NPC dialogue.
- Test: `tests/unit/game/explore-runway-service.test.js` (extend)

**Interfaces:**
- Spec note (entry narration, resolved): no frames-pipeline category exists for room-entry narration (`frame-sources.json` categories verified 2026-07-03: barks, befriend, cid, gameMaster, npc, npcDefeat, shop, shrine, skill_select). Per the spec, `entryPayload.narrationFrame` therefore stays `null` and rooms render without entry narration offline; authoring a `roomEntry` category is optional content work outside this plan. The harness's no-blank-screen assertion covers the render path.
- Consumes: prepared `interactionPayload.greeting` frames (friendly NPC `explore-runway-service.js:253-263`, shrine `:272-282`); the dialogue TTS cache located by the grep above.
- Produces: `buildExploreRunway(gm, opts)` accepts `opts.warmTts` (a `(frame) => void` fire-and-forget callback); the route/state layer passes a warmer that enqueues synthesis into the existing dialogue TTS cache so audio is cached by the time the player reaches the room. No response-shape change; no client change (the client already requests audio when the dialogue shows and degrades silently on failure).

- [ ] **Step 1: Locate the cache entry point** with the grep above; identify the function that synthesizes-and-caches by (userId, text/key). Record it in the task commit message.
- [ ] **Step 2: Write the failing test** — extend the runway service test: building a runway with a friendly-NPC room and a stub `warmTts` spy receives each prepared greeting frame exactly once (idempotent across rebuilds: a second `buildExploreRunway` call for the same prepared room must not re-warm; track warmed frame keys on the room, e.g. `room.friendlyNpc.greetingTtsWarmed = true`).
- [ ] **Step 3: Run it** — `node --test tests/unit/game/explore-runway-service.test.js` — expected FAIL (`warmTts` never called).
- [ ] **Step 4: Implement** — in the friendly-NPC and shrine payload builders, after a greeting frame is first selected, call `opts.warmTts?.(frame)` guarded by the warmed flag; wrap in try/catch (warming must never fail a runway build). Wire the real warmer where `buildExploreRunway` is called with route context (find call sites: `grep -rn "buildExploreRunway" src/`).
- [ ] **Step 5: Run tests, syntax check, commit** — `feat: warm dialogue tts for prepared runway frames`.

---

### Task 5: Delete the legacy parallel layers

**Files:**
- Modify: `public/js/ui/exploration.js` (revealedRooms reads at `:198`, `:939-946`), `src/game/phase-machine.js`, `public/js/ui/room-transition.js`, `src/game/loop.js` (stop exposing `revealedRooms` once readers are migrated), `src/game/room-reveal-buffer.js` (keep `ensureRoomActionSeq`; the reveal-window builders become sync-service-internal or are deleted if unused)
- Delete: `public/js/ui/optimistic-run-action.js`
- Test: `tests/unit/ui/explore-session-cleanup.test.js` (create — source-level deletion assertions, same pattern the 06-16 plan used), plus existing suites.

**Interfaces:**
- Consumes: `exploreRunway.preparedRooms[]` (`index`, `roomId`, `room`, `actionSeq`) as the only client room-reveal source.
- Produces: `getState()` without `run.revealedRooms`; all client renderers reading prepared rooms.

- [ ] **Step 1: Enumerate every reader** — `grep -rn "revealedRooms" public/js src tests | grep -v exploreRunway`. List each hit in the commit message.
- [ ] **Step 2: Write failing source assertions**

```js
// tests/unit/ui/explore-session-cleanup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('legacy optimistic-run-action module is deleted', () => {
  assert.equal(existsSync('public/js/ui/optimistic-run-action.js'), false);
});
test('client no longer reads run.revealedRooms', () => {
  for (const file of ['public/js/ui/exploration.js', 'public/js/ui/room-transition.js']) {
    assert.ok(!readFileSync(file, 'utf8').includes('revealedRooms'), `${file} still reads revealedRooms`);
  }
});
```

- [ ] **Step 3: Run — expect FAIL.** `node --test tests/unit/ui/explore-session-cleanup.test.js`
- [ ] **Step 4: Migrate each reader** to the prepared-room equivalents (`preparedRooms.find(r => r.index === i)?.room`). In `phase-machine.js` and server code, read `run.rooms` directly (server owns canonical rooms; `revealedRooms` was only the client-narrowing layer). Then remove the `revealedRooms` field from `getState()` enrichment in `src/game/loop.js` and delete `public/js/ui/optimistic-run-action.js`.
- [ ] **Step 4b: Legacy endpoint hygiene** — add a `// Compatibility path: superseded by /api/game/explore/sync (2026-07-03 spec); remove after one release of soak.` comment on each legacy room-mutation route the session replaced (list them via `grep -rn "router.post" src/routes/game/run.js src/routes/game/economy.js src/routes/game/cooking.js`). For the client-side `await apiProceed()` fallback in `proceedWithRevealBuffer` (`exploration.js:1015-1031`): keep it ONLY if a reproducible state exists where an active regular explore run has no session-capable runway (check `isExploreRunwaySessionCapable` failure modes); otherwise delete the fallback and let the soft pause own that path. Record the decision in the commit message.
- [ ] **Step 5: Run the full suite** — `npm test` — expected: PASS after updating any legacy-reveal assertions in `tests/integration/flows/exploration.test.js` to assert runway presence instead. Fix fallout minimally.
- [ ] **Step 6: Re-run rooms-tier harness (must stay green), syntax checks, commit** — `refactor: retire legacy revealedRooms layer and orphaned optimistic-run-action`.

---

### Task 6: Land the docs + Stage 1 merge gate

**Files:**
- Add: `docs/superpowers/plans/2026-06-16-explore-session-runway-sync.md` (currently untracked), status headers pointing to the 2026-07-03 spec.
- Commit: the modified `docs/superpowers/specs/2026-06-03-tiered-optimistic-game-actions-design.md` and `docs/superpowers/specs/2026-06-15-explore-session-runway-sync-design.md` (status-audit edits already in the working tree of `koto-dev` — cherry-pick the content, they may need copying into this worktree).
- Modify: `tests/README.md` — document the two harness tiers and env flags.

- [ ] **Step 1: Add a status header** to the top of the 06-16 plan: `> Status 2026-07-03: partially executed and merged (runway/sync/session/support rooms); superseded for remaining work by docs/superpowers/specs/2026-07-03-explore-subway-stability-design.md.`
- [ ] **Step 2: Commit docs** — `docs: land explore session plan and spec status audits`.
- [ ] **Step 3: Stage 1 gate** — run `npm test` AND the rooms-tier harness; both green. Then merge per the repo workflow:

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/explore-subway-stability
npm test   # gate again on the merge result
/usr/bin/git push origin dev
```

(Keep the worktree/branch for Stage 2.) Do NOT advance master until the final task.

---

## Stage 2 — Offline PvE Combat via the Session

### Task 7: Shared combat seed-chain module

**Files:**
- Create: `src/game/services/combat-seed-chain.js`
- Modify: `src/game/services/kanji-kombat-service.js:79-116` (re-export from the new module; delete the local bodies)
- Test: `tests/unit/game/combat-seed-chain.test.js` (create)

**Interfaces:**
- Produces: `ensureTurnSeeds(combat, { target })` and `advanceTurnSeeds(optimistic, { target })` — verbatim behavior of `ensureKanjiKombatTurnSeeds` / `advanceKanjiKombatTurnSeeds` (`kanji-kombat-service.js:90-116`), plus `PVE_TURN_SEED_CHAIN_TARGET = 40` and the existing `TURN_SEED_CHAIN_TARGET = 30`.
- Consumes: `createServerSeed` (import from the same module `kanji-kombat-service.js` imports it from — check its import block).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/game/combat-seed-chain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureTurnSeeds, advanceTurnSeeds, PVE_TURN_SEED_CHAIN_TARGET } from '../../../src/game/services/combat-seed-chain.js';

test('ensureTurnSeeds fills the chain to target with nextTurnSeed at head', () => {
  const combat = { optimistic: { nextTurnSeed: 'seed-a', stateVersion: 0 } };
  const seeds = ensureTurnSeeds(combat, { target: PVE_TURN_SEED_CHAIN_TARGET });
  assert.equal(seeds.length, 40);
  assert.equal(seeds[0], 'seed-a');
  assert.equal(combat.optimistic.nextTurnSeed, 'seed-a');
});

test('advanceTurnSeeds shifts the head, bumps stateVersion, and refills', () => {
  const combat = { optimistic: { nextTurnSeed: 'seed-a', stateVersion: 3 } };
  ensureTurnSeeds(combat, { target: 5 });
  const second = combat.optimistic.turnSeeds[1];
  advanceTurnSeeds(combat.optimistic, { target: 5 });
  assert.equal(combat.optimistic.stateVersion, 4);
  assert.equal(combat.optimistic.nextTurnSeed, second);
  assert.equal(combat.optimistic.turnSeeds.length, 5);
});

test('kanji-kombat re-exports stay compatible', async () => {
  const kk = await import('../../../src/game/services/kanji-kombat-service.js');
  assert.equal(typeof kk.ensureKanjiKombatTurnSeeds, 'function');
  assert.equal(typeof kk.advanceKanjiKombatTurnSeeds, 'function');
});
```

- [ ] **Step 2: Run — expect FAIL** (`module not found`). `node --test tests/unit/game/combat-seed-chain.test.js`
- [ ] **Step 3: Implement** — move the two function bodies verbatim into `combat-seed-chain.js` (names `ensureTurnSeeds`/`advanceTurnSeeds`); in `kanji-kombat-service.js` replace the bodies with `export { ensureTurnSeeds as ensureKanjiKombatTurnSeeds, advanceTurnSeeds as advanceKanjiKombatTurnSeeds, TURN_SEED_CHAIN_TARGET } from './combat-seed-chain.js';` (keep `PREROLL_TURN_SEED_COUNT` etc. where they are).
- [ ] **Step 4: Run the new test + existing KK suites** — `node --test tests/unit/game/combat-seed-chain.test.js tests/unit/game/kanji-kombat-*.test.js` — expected PASS.
- [ ] **Step 5: Commit** — `refactor: extract shared combat turn-seed chain module`.

---

### Task 8: Prepared combat start in the runway

**Files:**
- Modify: `src/game/services/combat-cycle-service.js` (add `prepareCombatStart(room)`; make `startCreatureEncounter()` consume it), `src/game/services/explore-runway-service.js` (encounter/boss/npcBattle interaction payloads + acceptedActions + offlineReady), `src/game/services/explore-session-contract.js` (ACTION_EFFECTS `combat.cycle: [PARTY_STATS]`; ROOM_DEPENDENCIES `encounter/boss/npcBattle: []` — prepared rolls pin them, same rationale as KK's pre-rolled wave)
- Test: `tests/unit/game/explore-runway-combat.test.js` (create), existing runway tests must stay green.

**Interfaces:**
- Produces (server + payload):
  - `CombatCycleService.prepareCombatStart(room)` → stores `room.preparedCombat = { combatId, enemies, npcId, npcData, turnSeeds, isBoss, isNpcBattle }` (idempotent: returns existing if present). Enemy rolling reuses the exact branch of `startCreatureEncounter` (`combat-cycle-service.js:280-298`), NPC pick reuses `:332-345`; extract those two blocks into private methods `_rollEncounterEnemies(currentRoom)` / `_rollNpcForBattle()` used by BOTH prepare and start so there is one roll implementation.
  - `startCreatureEncounter()` consumes `currentRoom.preparedCombat` when present: uses its enemies/npc/combatId, sets `optimistic.turnSeeds = prepared.turnSeeds`, `nextTurnSeed = turnSeeds[0]`, then deletes `currentRoom.preparedCombat` (single-use), else rolls exactly as today.
  - Runway `interactionPayload` for combat rooms: `{ kind: 'encounter'|'boss'|'npcBattle', combatStart: <clone of what startCreatureEncounter returns, minus server-internal fields>, seedChain: turnSeeds, combatId, initialStateVersion: 0 }`. `acceptedActions: ['<kind>.start', 'combat.cycle']`. `offlineReady` only when `preparedCombat` exists with `turnSeeds.length >= 1`.
  - Trade-off (documented in code comment): enemy stat blocks for runway combat rooms are visible to the client up to 5 rooms early — same accepted class as KK's pre-rolled wave; rewards/XP remain server-owned.
- Consumes: `ensureTurnSeeds` from Task 7 (`target: PVE_TURN_SEED_CHAIN_TARGET`).

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/game/explore-runway-combat.test.js — core cases (build gm via the same
// fixture helpers the existing explore-runway-service.test.js uses; copy its setup):
test('prepareCombatStart is idempotent and start consumes the prepared roll', () => {
  const room = { type: 'encounter', id: 'r5' };
  const first = svc.prepareCombatStart(room);
  const second = svc.prepareCombatStart(room);
  assert.equal(first.combatId, second.combatId);
  // position gm on the room, then:
  const started = svc.startCreatureEncounter();
  assert.equal(started.optimistic.combatId, first.combatId);
  assert.deepEqual(gm.combat.optimistic.turnSeeds, first.turnSeeds);
  assert.equal(room.preparedCombat, undefined); // single-use
});
test('runway marks combat rooms offlineReady with combatStart + seedChain', async () => {
  const runway = await buildExploreRunway(gm, {});
  const combatRoom = runway.preparedRooms.find(r => r.room.type === 'encounter');
  assert.equal(combatRoom.offlineReady, true);
  assert.ok(combatRoom.interactionPayload.combatStart.enemies.length >= 1);
  assert.ok(combatRoom.interactionPayload.seedChain.length >= 1);
  assert.deepEqual(combatRoom.acceptedActions, ['encounter.start', 'combat.cycle']);
});
```

- [ ] **Step 2: Run — expect FAIL.** `node --test tests/unit/game/explore-runway-combat.test.js`
- [ ] **Step 3: Implement** exactly per the Produces block. In the runway builder, call `gm.combatCycleService.prepareCombatStart(room)` for combat-type rooms inside the prepared window (persisted on `run.rooms[i]`, so `responseContext`'s rebuild after replay reuses it rather than re-rolling).
- [ ] **Step 4: Run new + existing runway/combat suites.** `node --test tests/unit/game/explore-runway-combat.test.js tests/unit/game/explore-runway-service.test.js` and the combat suites (`ls tests/unit/game | grep -i combat`). Expected PASS.
- [ ] **Step 5: Syntax check, commit** — `feat: prepared combat start and seed chain in explore runway`.

---

### Task 9: Combat entries in the sync replay

**Files:**
- Modify: `src/game/services/explore-session-sync-service.js` (`applyExploreEntry` cases), `src/game/services/exploration-service.js` (performers `applyCombatStart(entry)`, `applyCombatCycle(payload)`), `src/game/services/combat-cycle-service.js` (add `replayCombatCycleEntry({ actionType, moveChoices, predictedHash })`)
- Test: `tests/unit/game/explore-session-sync-combat.test.js` (create), `tests/integration/flows/explore-session-sync.test.js` (extend)

**Interfaces:**
- Produces:
  - `applyCombatStart(entry)`: validates `run.rooms[run.currentRoom].type` matches the entry kind (`encounter.start` ⇔ `encounter`, etc.) and no combat already active with a different `combatId`; calls `startCreatureEncounter()` (consumes prepared roll); returns `{ started: true, combatId, isBoss, isNpcBattle }`.
  - `replayCombatCycleEntry(...)` mirrors the KK quiz replay branch (`kanji-kombat-service.js:1589-1636`) with the PvE resolver dispatch from `verifyAndCommitCreatureCombatCycle` (`combat-cycle-service.js:479-545`):

```js
replayCombatCycleEntry({ actionType = 'attack', moveChoices = [], predictedHash } = {}) {
  const optimistic = this.gm.combat?.optimistic;
  if (!optimistic) throw new Error('no_active_creature_combat');
  ensureTurnSeeds(this.gm.combat, { target: PVE_TURN_SEED_CHAIN_TARGET });
  const seed = optimistic.nextTurnSeed;
  const resolved = actionType === 'attack' && this.gm.combat?.actionCursor
    ? resolvePveCursorTurn({ combat: this.gm.combat, run: this.gm.run, moveChoices }, { actionType, seed })
    : resolvePveTurn({ snapshot: { combat: this.gm.combat, run: this.gm.run }, actionType, moveChoices, seed, processKoSwaps: true });
  const serverHash = hashTranscript(resolved.transcript);
  const hashMatches = serverHash === predictedHash;
  const committed = this.creatureCombatCycle(actionType, moveChoices, {
    rng: createSeededRng(seed), verifiedSeed: seed, suppressBarks: true, deferXpAwards: true,
  });
  advanceTurnSeeds(optimistic, { target: PVE_TURN_SEED_CHAIN_TARGET });
  if (!hashMatches) {
    const error = new Error('transcript_mismatch');
    error.committed = committed; // grade landed — confirm seq, stop batch (KK pattern)
    throw error;
  }
  return committed; // includes combatEnded/victory/rewards fields from creatureCombatCycle
}
```

  - `applyCombatCycle(payload)` in `exploration-service.js` is a one-line delegate: `return this.gm.combatCycleService.replayCombatCycleEntry(payload);` (keeps the sync service's performer indirection consistent with support rooms).
  - `applyExploreEntry` cases: the three `*.start` kinds → `applyCombatStart(entry)`; `'combat.cycle'` → `applyCombatCycle(entry.payload)`. The sync loop's existing `error.committed` handling must mirror KK (`kanji-kombat-service.js:1687-1698`): confirm the seq, remember a `corrected: true` ledger entry, return a correction. Extend the correction branch in `applySessionSync` (`explore-session-sync-service.js:254-264`) with that `error.committed` path.
  - The `/api/game/explore/sync` route must already snapshot/restore around replay — verify (`sed -n '1,60p' src/routes/game/explore-session.js`); if it does not, wrap replay with `snapshotGameManager`/`restoreGameManager` on thrown (non-correction) errors, matching the KK sync route.
- Consumes: Task 7 chain functions; Task 8 prepared rolls; existing `hashTranscript`, `createSeededRng`, resolver imports already present in `combat-cycle-service.js`.

- [ ] **Step 1: Write failing unit tests** — offline-style batch: `[encounter.start, combat.cycle × N]` replays to a finished or in-progress combat; duplicate actionId replays from ledger without double-commit; tampered `predictedHash` → correction with `confirmedThroughSeq` including the mismatched entry (grade committed) and `rejectedSeq` set; batch stops at first invalid entry; support-room entry after `combat.cycle` in one batch replays fine when combat ended. Use the fixture style of `tests/unit/game/explore-session-sync-service.test.js`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** per the Produces block.
- [ ] **Step 4: Extend the integration test** — POST a mixed batch to `/api/game/explore/sync` (proceed → encounter.start → cycles → proceed) and assert per-entry results, final server room/combat state, and idempotent re-POST of the same batch.
- [ ] **Step 5: Run all sync suites + `npm test`. Commit** — `feat: replay combat entries through explore session sync`.

---

### Task 10: Client — combat start and turns through the session

**Files:**
- Create: `public/js/ui/combat-local-prediction.js` (shared local-prediction helpers extracted from the KK path)
- Modify: `public/js/ui/combat-loop.js` (PvE session branch in `runOptimisticCreatureCombatTurn` `:644-700`; extract `advanceLocalKanjiKombatChain` `:707-714` and `applyLocalKanjiKombatDeferredKillXp` `:732-773` into the new module and re-use), `public/game.js` (`startEncounter` callback — session-first branch), `public/js/ui/exploration.js` (`renderExploring` 戦う path passes through the session; checkpoint handler finishes pending combat ends)
- Test: `tests/unit/ui/combat-session-local.test.js` (create), existing `tests/unit/ui/optimistic-*.test.js` stay green.

**Interfaces:**
- Consumes: `buildOptimisticCombatTurn({ state, actionType, moveChoices })` (`public/js/ui/optimistic-combat-turn.js:187`) — returns `{ envelope, localTranscript, localNextCombat }` (verified at `optimistic-combat-turn.js:235-239`) or `null` for unsafe turns; `getExploreSession()` / `recordRoomAction`; prepared `interactionPayload.combatStart` + `seedChain` from Task 8.
- Produces:
  - `combat-local-prediction.js`: `advanceLocalChain(state)` (generalized copy of `advanceLocalKanjiKombatChain`), `applyLocalDeferredKillXp(state, transcript, seed)` (generalized copy of the KK deferred-XP visitor — it is already game-mode-agnostic: it walks `actionSegments` ally attacks and applies `applyKillXpToParty` with `createSeededRng(\`${seed}:xp\`)`).
  - Combat start: when the current prepared room advertises `encounter.start`-family AND `interactionPayload.combatStart` exists, the 戦う handler records `session.recordRoomAction('<kind>.start', {})`; on `accepted`, it clones `combatStart` into the local game state draft (`draft.combat = ...` shaped exactly like the state after a live `/start-creature-encounter` — set `optimistic.turnSeeds` from `seedChain`), calls the same combat-entry UI path the live response uses, and lets the sync drain in the background. Refactor the existing `startEncounter` response handling in `public/game.js` into `enterCreatureCombatFromStart(startResult)` reused by both branches (locate with `grep -n "startEncounter\|start-creature-encounter" public/game.js`).
  - Combat turn (session mode = explore session active AND `state.combat.optimistic.turnSeeds?.length > 1`): in `runOptimisticCreatureCombatTurn`, replace the awaited `verifyCreatureCombatCycle` with: playback → build local next state (mirror the KK ordering: `draft.combat = optimistic.localNextCombat`, `advanceLocalChain(draft)`, `applyLocalDeferredKillXp(draft, optimistic.localTranscript, optimistic.envelope.seed)`, `updateGameState(draft)`) → `session.recordRoomAction('combat.cycle', { actionType, moveChoices, predictedHash: optimistic.envelope.predictedHash })` → return control immediately.
  - Unsafe turn (`buildOptimisticCombatTurn` returns `null`) in session mode: call `getExploreSession()?.syncNow()`; if online the legacy per-turn path runs as today; if offline show the soft pause. No garbage entries.
  - Combat end: when `localTranscript.combatEnded`, show the pending victory/defeat shell (existing `pendingCombatEnd` flow) and DO NOT grant rewards locally; the explore checkpoint handler (`onExploreSessionCheckpoint` in `exploration.js:123-130`) scans `response.results` for the matching `combat.cycle` result with `combatEnded === true` and calls the existing `finishCombatLoop(serverResult)` path with it.
- PvP guard: the session branch is gated on `getExploreSession()` presence + explore-run combat; `pvp-battle.js` untouched.

- [ ] **Step 1: Write failing unit tests** — with a fake session and fake state: (a) session-mode turn records a `combat.cycle` entry with the envelope hash and does not call the verify API (inject a spy); (b) local state after the turn has `stateVersion + 1`, chain head shifted, and enemies matching `resolved.nextCombat`; (c) `null` optimistic build in session mode triggers `syncNow` and no entry; (d) combat-end turn records the entry and marks the pending shell without granting XP locally beyond the deferred-kill mirror.
- [ ] **Step 2: Run — expect FAIL.** `node --test tests/unit/ui/combat-session-local.test.js`
- [ ] **Step 3: Implement** per the Produces block. Keep the existing online per-turn path fully intact for non-session contexts (PvP, any non-explore combat).
- [ ] **Step 4: Syntax checks on every touched public/js file; run the new + existing UI suites.**
- [ ] **Step 5: Commit** — `feat: pve combat turns flow through the explore session log`.

---

### Task 11: Befriend/talk online-only gating

**Files:**
- Modify: `public/js/ui/befriend.js` (and the action-area render that offers the talk option — locate with `grep -n "befriend\|talk" public/js/ui/actions.js public/js/ui/combat-dom.js | head`)
- Test: `tests/unit/ui/befriend-gating.test.js` (create)

**Interfaces:**
- Produces: `canStartBefriendTalk()` → `false` when `navigator.onLine === false` OR `getExploreSession()?.pendingCount() > 0` has unsynced `combat.cycle`/`*.start` entries (expose `getExploreSession().snapshot()` scan in a helper `sessionHasPendingCombat()`). When gated: the talk control renders disabled with copy `Connection needed to talk.` (English UI chrome, not Japanese dialogue — frames pipeline not required) and a tap triggers `getExploreSession()?.syncNow()` so a working connection re-enables it on the next render.

- [ ] **Step 1: Failing test** — fake session with a pending `combat.cycle` entry → `canStartBefriendTalk()` false; empty log + online → true.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement + wire the disabled state into the talk button render.**
- [ ] **Step 4: Run tests + syntax check. Commit** — `feat: gate befriend talk while combat entries are unsynced or offline`.

---

### Task 12: Combat-tier harness green + explore per-turn cutover

**Files:**
- Modify: `tests/smoke/explore-subway-runway.test.js` (only if driver gaps surface — e.g., befriend button appearing mid-fight: the driver must ignore the disabled talk control), `public/js/ui/combat-loop.js` (remove the explore-PvE call into `verifyCreatureCombatCycle` once the session path fully covers it; the verify route itself stays server-side for one release), findings doc.

- [ ] **Step 1: Run the combat tier**

```bash
EXPLORE_SUBWAY_SMOKE=1 EXPLORE_SUBWAY_COMBAT=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js
```

Expected initially: may FAIL. Apply the same fix-loop protocol as Task 3 (systematic-debugging → focused failing test → minimal fix → commit) until green. Every fight inside an offline window must proceed turn-by-turn with tap-ack < 250ms and zero corrected syncs.

- [ ] **Step 2: Cut over** — in session mode the explore PvE turn path no longer falls back to per-turn verification when online (one model; online just drains faster). Delete the now-dead session-mode verification branch. `node --check public/js/ui/combat-loop.js && echo OK`.
- [ ] **Step 3: Re-run BOTH tiers + `npm test` — all green. Commit** — `feat: explore pve combat cutover to session sync (combat tier green)`.

---

### Task 13: Final verification, docs, merge, master

**Files:** docs updates; git operations. Use superpowers:verification-before-completion and superpowers:finishing-a-development-branch.

- [ ] **Step 1: Full gates** — `npm test`; rooms tier; combat tier. All green. Load watchpoint (spec): if `/explore/sync` batches feel slow during the playtest, spot-check with the `tests/load/` harness pattern before merging; otherwise no load work is required.
- [ ] **Step 2: Manual throttled playtest** per `docs/playtest-guide.md` (ask the user before launching Playwright/Chrome): one area run with dev-tools throttling, verifying: offline proceeds + support rooms + a fight, the soft pause at runway exhaustion, disabled talk copy, pending victory shell resolving on reconnect. Screenshot each state, show the user, then `rm` the screenshots.
- [ ] **Step 3: Update the playtest guide** — add a short "explore offline behavior" section (what testers should expect offline: continued play, soft pause, online-only talk).
- [ ] **Step 4: Close the superseded worktree** — `fix/offline-combat-sync` at `.worktrees/offline-combat-sync` holds an uncommitted per-turn retry attempt. Confirm with the user, then `/usr/bin/git -C .worktrees/offline-combat-sync stash && /usr/bin/git worktree remove .worktrees/offline-combat-sync && /usr/bin/git branch -D fix/offline-combat-sync` (stash preserves the diff in case anything is wanted later).
- [ ] **Step 5: Merge and advance master**

```bash
cd /Users/michiarohrssen/Documents/Claude/koto-dev
/usr/bin/git pull origin dev
/usr/bin/git merge feature/explore-subway-stability
npm test
/usr/bin/git push origin dev
/usr/bin/git push origin dev:master
/usr/bin/git worktree remove ../koto-wt-explore-subway
/usr/bin/git branch -d feature/explore-subway-stability
```

- [ ] **Step 6: Report** — summarize to the user: harness status (both tiers), what the baseline findings were and how each was fixed, the combat transport change, and the one-release soak note for the legacy per-turn verify path.
