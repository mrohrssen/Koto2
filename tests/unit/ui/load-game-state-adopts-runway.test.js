import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Combat-tier cutover invariant (explore subway): a full state reload mid-run
 * must adopt the fresh explore runway into the live explore session.
 *
 * Root cause this locks: `loadGameState` calls `apiGetGameStateAfterExploreDrain`,
 * which drains the session (empties the log) and then does a raw `GET /state`.
 * `GET /api/game/state` ROTATES the explore session epoch server-side
 * (src/routes/game/state.js) and rebuilds the runway under the new epoch. If the
 * client never adopts that fresh runway, its explore session keeps the OLD epoch,
 * and the next entry it records (the next room's proceed / combat) syncs under a
 * stale epoch → the server rejects it as `session_epoch_mismatch` → a `corrected`
 * sync (and a cascading `room_index_mismatch`). This fired on EVERY combat
 * victory in session mode because the victory modal reloads state.
 *
 * The drain empties the log before the rotation, so adopting the fresh runway on
 * an empty log is lossless — it only re-syncs the epoch. Source-ordering
 * assertion (same technique as kanji-kombat-start-transition.test.js): no browser,
 * no game.js import graph.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('loadGameState adopts the fresh explore runway after fetching rotated server state', () => {
  // loadGameState() body ends where the next top-level declaration begins:
  // `async function claimDailyCrystalBonus` immediately follows it in game.js.
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus'
  );

  const fetchIndex = loadGameStateSource.indexOf('apiGetGameStateAfterExploreDrain(');
  const updateStateIndex = loadGameStateSource.indexOf('updateGameState(data)');
  const adoptIndex = loadGameStateSource.indexOf('adoptRunway');

  assert.ok(fetchIndex >= 0, 'loadGameState should fetch fresh state via apiGetGameStateAfterExploreDrain');
  assert.ok(updateStateIndex >= 0, 'loadGameState should update client game state from the fresh data');
  assert.ok(
    adoptIndex >= 0,
    'loadGameState MUST adopt the explore runway from the fresh state so the client picks up the '
    + 'epoch rotated by GET /state — otherwise mid-run session syncs fail with session_epoch_mismatch',
  );
  assert.ok(
    adoptIndex > fetchIndex,
    'the runway adopt must happen AFTER the state fetch (which carries the rotated epoch)',
  );
});

test('loadGameState routes captured pause recovery through the adoption helper', () => {
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus',
  );
  const helperIndex = loadGameStateSource.indexOf('adoptCapturedExploreRecoveryState({ capture, data, updateGameState })');
  const preloadIndex = loadGameStateSource.indexOf('assetPreloader.enqueue');

  assert.ok(helperIndex >= 0, 'captured recovery must call the executable adoption helper');
  assert.ok(preloadIndex >= 0, 'state publication path must continue to preload authoritative assets');
  assert.ok(
    helperIndex < preloadIndex,
    'the helper must complete fenced adoption and authoritative state installation before related state work',
  );
});

test('legacy combat seed fallback drains without ignored sync metadata', () => {
  const combatLoopSrc = readFileSync(resolve(repoRoot, 'public/js/ui/combat-loop.js'), 'utf8');
  const fenceSource = sourceBetween(
    combatLoopSrc,
    'async function fenceExploreSessionBeforeLegacyCombat(',
    'function buildSessionCreatureCombatTurn',
  );

  assert.match(fenceSource, /await session\?\.syncNow\?\.\(\)/);
  assert.doesNotMatch(
    combatLoopSrc,
    /syncNow\??\.\s*\(\s*\{[^}]*\breason\b/,
    'Task 10 permits ownership options only; combat-loop sync calls must not supply ignored reason metadata',
  );
});

/**
 * Combat-tier cutover invariant (explore subway): the epoch-rotating GET /state
 * fetch must be SKIPPED while the explore session still has pending entries.
 *
 * Root cause this locks: GET /state rotates the explore session epoch. On a
 * combat victory the modal reloads state through apiGetGameStateAfterExploreDrain,
 * which drains then fetches. When the drain does NOT clear the log — offline, a
 * transient sync failure, or optimistic progress queued ahead — fetching rotates
 * the epoch out from under those still-pending entries, and their next drain is
 * rejected as `session_epoch_mismatch` (a corrected sync). The adopt guard cannot
 * help once /state has rotated, so the fetch itself must be gated: if entries are
 * pending after the drain, return null (keep the optimistic state) and let them
 * drain under the unrotated epoch first.
 */
test('apiGetGameStateAfterExploreDrain skips the epoch-rotating /state fetch while entries are pending', () => {
  const drainFetchSource = sourceBetween(
    gameSrc,
    'async function apiGetGameStateAfterExploreDrain',
    'async function loadGameState('
  );

  const pendingGuardIndex = drainFetchSource.indexOf('pendingCount');
  const returnNullIndex = drainFetchSource.indexOf('return null');
  const captureTokenIndex = drainFetchSource.indexOf('captureGameStateFetchFence(session');
  const fetchIndex = drainFetchSource.indexOf('apiGetGameState({ adoptSession })');
  const fencedStepIndex = drainFetchSource.indexOf("capture.fence.step('fetch game state'");

  assert.ok(
    pendingGuardIndex >= 0,
    'apiGetGameStateAfterExploreDrain MUST check the explore session pendingCount before fetching /state',
  );
  assert.ok(returnNullIndex >= 0, 'it must return null (skip the fetch) when entries remain pending');
  assert.ok(captureTokenIndex >= 0, 'it must capture the live session before fetching /state');
  assert.ok(fetchIndex >= 0, 'it still fetches /state when the log is clear');
  assert.ok(fencedStepIndex >= 0, 'it must reject a stale response through the captured ownership fence');
  assert.ok(
    pendingGuardIndex < captureTokenIndex && returnNullIndex < captureTokenIndex,
    'the pending-entries guard + null return must come BEFORE the /state fetch — otherwise /state '
    + 'rotates the epoch out from under the queued entries and their next drain fails as '
    + 'session_epoch_mismatch',
  );
  assert.ok(
    captureTokenIndex < fencedStepIndex
      && fencedStepIndex < fetchIndex,
    'the wrapper must capture the session, enter the fenced fetch step, and reject stale responses',
  );

  // loadGameState must treat the skipped fetch (null) as "keep current state", not a failure.
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus'
  );
  assert.ok(
    loadGameStateSource.indexOf('data === null') >= 0,
    'loadGameState must handle the null (fetch-skipped) return by keeping the current optimistic state',
  );
});

/**
 * Epoch contract (task 12e): explore session epochs mark RELOAD boundaries only.
 * `GET /state` rotates the epoch ONLY on a bare fetch (boot/reload). Every
 * IN-SESSION state fetch must pass the `adoptSession=1` signal so the server
 * PRESERVES the epoch (create-if-absent, never rotate) — otherwise a mid-run
 * reload (combat victory modal, post-combat-shop recovery, combat null-POST
 * recovery) rotates the epoch out from under offline-queued entries and their
 * next drain is rejected as `session_epoch_mismatch` (the 12d drain→rotate→adopt
 * race).
 *
 * Layering (defense-in-depth, both layers required):
 *  - Layer 1 (primary): in-session fetches pass adoptSession=1 → no rotation.
 *  - Layer 2 (kept): the pending-entries guard still SKIPS the fetch entirely
 *    while the drain left entries queued — even a non-rotating fetch returns a
 *    server snapshot that predates the queued entries, and adopting it would
 *    roll back optimistic progress.
 */
test('in-session state fetches pass the adoptSession signal; boot stays bare', () => {
  // api.js getGameState must accept the signal and put it on the query string.
  const apiSrc = readFileSync(resolve(repoRoot, 'public/js/api.js'), 'utf8');
  const getGameStateSource = sourceBetween(
    apiSrc,
    'async function getGameState(',
    'function isTransientGameStateFailure'
  );
  assert.ok(
    getGameStateSource.indexOf('adoptSession') >= 0
      && getGameStateSource.indexOf('adoptSession=1') >= 0,
    'api.js getGameState must accept an adoptSession option and pass ?adoptSession=1 to GET /state',
  );

  // apiGetGameStateAfterExploreDrain must thread the signal through to the fetch.
  const drainFetchSource = sourceBetween(
    gameSrc,
    'async function apiGetGameStateAfterExploreDrain',
    'async function loadGameState('
  );
  assert.ok(
    drainFetchSource.indexOf('adoptSession') >= 0,
    'apiGetGameStateAfterExploreDrain must thread the adoptSession option to apiGetGameState',
  );

  // loadGameState must accept and thread the signal.
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus'
  );
  assert.ok(
    loadGameStateSource.indexOf('adoptSession') >= 0,
    'loadGameState must accept an adoptSession option and thread it to the drain+fetch helper',
  );

  // The combat-victory state reload (showVictoryModal) is IN-SESSION: it must
  // pass adoptSession — this is the exact path that stranded offline entries.
  const victoryModalSource = sourceBetween(
    gameSrc,
    'function showVictoryModal(',
    'async function showAdventureReport(',
  );
  assert.ok(
    victoryModalSource.indexOf('loadGameState({ adoptSession: true })') >= 0,
    'showVictoryModal must reload state with adoptSession: true (in-session fetch — must not rotate the epoch)',
  );

  // The post-combat-shop reload-recovery refresh is also in-session by the time
  // it fires (the shop flow just completed inside a live run).
  const shopRecoveryStart = gameSrc.indexOf('postCombatShopRecoveryDone = true');
  assert.ok(shopRecoveryStart >= 0, 'post-combat-shop recovery block should exist');
  const shopRecoverySource = gameSrc.slice(shopRecoveryStart, gameSrc.indexOf('break;', shopRecoveryStart));
  assert.ok(
    shopRecoverySource.indexOf('loadGameState({ adoptSession: true })') >= 0,
    'the post-combat-shop recovery refresh must pass adoptSession: true',
  );
  assert.doesNotMatch(
    shopRecoverySource,
    /updateGameState\(state\)/,
    'loadGameState already validates and adopts the post-combat-shop response',
  );
  assert.match(
    shopRecoverySource,
    /if \(state\) updateUI\(\)/,
    'post-combat-shop recovery should render only after loadGameState returns a usable state',
  );

  // Empty-log runway recovery still belongs to the active Explore run.
  const recoveryInitSource = sourceBetween(
    gameSrc,
    'refreshRunwayState:',
    'apiGetAreaOptions,',
  );
  assert.match(
    recoveryInitSource,
    /loadGameState\(\{\s*adoptSession:\s*true\s*,\s*capture\s*\}\)/,
    'empty-log runway recovery is in-session and must preserve the epoch',
  );

  // Boot-time initial load stays BARE — a reload is exactly where rotation is
  // correct (losing the pre-reload offline log is by design).
  assert.ok(
    gameSrc.indexOf('const loadedState = await loadGameState();') >= 0,
    'the boot-time initial loadGameState call must stay bare (no adoptSession) so a reload rotates the epoch',
  );

  const returnToHubSource = sourceBetween(
    gameSrc,
    'async function returnToHub()',
    '// ============ COMBAT ============',
  );
  assert.match(
    returnToHubSource,
    /await apiForfeitRun\(\)[\s\S]*await loadGameState\(\)/,
    'return-to-hub after forfeit is an intentional reload boundary',
  );

  const adventureReportSource = sourceBetween(
    gameSrc,
    'async function showAdventureReport(',
    'function showGameOverModal(',
  );
  assert.match(
    adventureReportSource,
    /apiForfeitRun\(isVictory\)[\s\S]*await loadGameState\(\)/,
    'adventure-report return after forfeit is an intentional reload boundary',
  );

  assert.equal(
    (gameSrc.match(/\bloadGameState\(\)/g) || []).length,
    3,
    'only boot and the two post-forfeit reload boundaries may issue a bare loadGameState call',
  );

  // Task 8 routes a standard Explore null-POST recovery through its captured
  // coordinator. The coordinator owns the fenced authoritative fetch; combat
  // loop keeps the nonstandard fallback separate.
  const combatLoopSrc = readFileSync(resolve(repoRoot, 'public/js/ui/combat-loop.js'), 'utf8');
  const recoverySource = sourceBetween(
    combatLoopSrc,
    'async function recoverFromNullCombatPost(',
    'async function handleOptimisticCombatVerification(',
  );
  const coordinatorSource = sourceBetween(
    combatLoopSrc,
    'function configureCombatRecoveryCoordinator()',
    'function preservesRecoveryInputOwnership',
  );
  assert.match(
    coordinatorSource,
    /fetchAuthoritativeState:\s*options\s*=>\s*apiGetGameState\(options\)/,
    'the Task 8 coordinator owns the authoritative state fetch supplied by combat-loop',
  );
  assert.match(
    recoverySource,
    /combatRecoveryCoordinator\.recover\(\{\s*actionType,\s*capturedOwner:\s*options\.capturedOwner\s*\|\|\s*recoveryOwnerFromState\(\),\s*capture:\s*options\.recoveryCapture,/,
    'standard Explore recovery must give the coordinator the exact captured owner and fence',
  );
  assert.match(
    recoverySource,
    /!getActiveStandardExploreSession\(\)\s*\|\|\s*!combatRecoveryCoordinator[\s\S]*recoverNonExploreNullCombatPost\(/,
    'only nonstandard combat keeps the direct legacy recovery fallback',
  );
  assert.doesNotMatch(
    recoverySource,
    /await apiGetGameState\(/,
    'standard Explore recovery must not bypass the coordinator with a direct state fetch',
  );
  assert.doesNotMatch(
    combatLoopSrc,
    /apiGetGameState\(\s*\)/,
    'combat recovery must never issue a bare state GET',
  );
});

test('loadGameState preserves the current run for HTTP error envelopes', () => {
  const loadGameStateSource = sourceBetween(
    gameSrc,
    'async function loadGameState(',
    'async function claimDailyCrystalBonus',
  );
  const errorGuardIndex = loadGameStateSource.indexOf(
    'isGameStateErrorResponse(data)',
  );
  const playerBranchIndex = loadGameStateSource.indexOf('if (data.player)');
  const noSaveIndex = loadGameStateSource.indexOf(
    "phase: data.phase || 'no_save'",
  );

  assert.ok(errorGuardIndex >= 0, 'loadGameState must reject error envelopes');
  assert.ok(playerBranchIndex >= 0 && noSaveIndex >= 0, 'state adoption branches exist');
  assert.ok(
    errorGuardIndex < playerBranchIndex && errorGuardIndex < noSaveIndex,
    'the HTTP error guard must return before player/no-save state adoption',
  );
});

test('creature-selection cancellation rejects error envelopes before state adoption', () => {
  const cancellationSource = sourceBetween(
    gameSrc,
    'async function triggerCreatureSelect()',
    'async function startKanjiKombatSetup()',
  );
  const errorGuardIndex = cancellationSource.indexOf('!isGameStateErrorResponse(state)');
  const updateIndex = cancellationSource.indexOf('updateGameState(state)');

  assert.ok(errorGuardIndex >= 0, 'creature-selection cancellation must reject error envelopes');
  assert.ok(updateIndex >= 0, 'creature-selection cancellation still adopts usable state');
  assert.ok(
    errorGuardIndex < updateIndex,
    'the cancellation error guard must run before state adoption',
  );
});
