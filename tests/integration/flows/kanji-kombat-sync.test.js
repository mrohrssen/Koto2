/**
 * Integration tests for POST /api/game/kanji-kombat/sync
 *
 * Tests hit the real Express app (no mocks inside game logic) and cover:
 *  1. Two-entry quiz batch — status 'ok', cardsReviewed === 2
 *  2. Replay the same batch — still 'ok', still cardsReviewed === 2 (idempotent)
 *  3. Stale sessionEpoch → status 'corrected', reason 'session_epoch_mismatch'
 *  4. Missing entries array → 400
 *  5. Empty entries array → 400
 *  6. Cross-path dedupe guard: same actionId via /answer then /sync
 *
 * The SRS module has its own dataDir independent of the app's dataDir, so we
 * call configureSrs({ dataDir: tmpDir }) in beforeEach for isolation and
 * restore the default path in afterEach.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import {
  configureSrs,
  clearSrsCache,
  loadSrsData,
  saveSrsData,
} from '../../../src/game/internal-srs.js';
import {
  clearScriptDeckMemo,
  ensureScriptDeckSeeded,
  SCRIPT_DECK,
} from '../../../src/game/script-srs.js';
import {
  hashTranscript,
  isActionId,
  buildActionEnvelope,
  KANJI_KOMBAT_PREDICTION_MODE,
} from '../../../src/shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../../src/shared/combat/pve-turn-resolver.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_TEAM = ['hi', 'mizu', 'ki'];
const SRS_DEFAULT_DIR = 'data/';

// ---------------------------------------------------------------------------
// Save file seed helper (mirrors combat.test.js pattern)
// ---------------------------------------------------------------------------

function seedSaveFile(tmpDir, userId) {
  writeFileSync(
    join(tmpDir, `.jrpg-save-${userId}.json`),
    JSON.stringify({
      version: 2,
      player: null,
      meta: {
        lifetimeStats: {
          totalRuns: 0, runsCompleted: 0, runsFailed: 0,
          totalDamageDealt: 0, totalDamageTaken: 0, totalCreditsEarned: 0,
          highestAreasCleared: 0, totalPlayTime: 0,
          firstPlayDate: null, lastPlayDate: null,
        },
        unlocks: [], achievements: [],
        creatureCollection: TEST_TEAM,
        befriendCount: {},
        levels: { highestUnlocked: 1, completed: [], current: null },
        prologueComplete: true,
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
        kanaMode: false, pvpTeams: [null, null, null],
        tutorialStep: 7, tutorialFireDropsGifted: false, itemsDiscovered: [],
        // Onboarding already completed — run goes straight to prompts
        kanjiKombatOnboarding: {
          completed: true,
          knowsHiragana: false,
          knowsKatakana: false,
        },
      },
      run: null, combat: null, savedAt: new Date().toISOString(),
    }, null, 2)
  );
}

/**
 * Pre-seed the SRS deck so the first two hiragana cards are past-due.
 * This ensures quiz prompts appear at the head of the prompt buffer
 * (rather than intros, which are generated for brand-new cards).
 */
function seedSrsDueCards(userId) {
  const merged = ensureScriptDeckSeeded(userId);
  const srsData = loadSrsData(userId);
  if (!srsData[SCRIPT_DECK]) srsData[SCRIPT_DECK] = { cards: [] };
  srsData[SCRIPT_DECK].cards = merged.slice(0, 2).map(card => ({
    id: card.id,
    type: card.type,
    reps: 1,
    due: '2000-01-01T00:00:00.000Z',
    last_review: '2000-01-01T00:00:00.000Z',
  }));
  saveSrsData(userId, srsData);
  clearSrsCache(userId);
  clearScriptDeckMemo(userId);
}

// ---------------------------------------------------------------------------
// Action ID counter
// ---------------------------------------------------------------------------

let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  return `kks_it_${String(actionCounter).padStart(8, '0')}`;
}

assert.ok(isActionId('kks_it_00000001'), 'nextActionId format must satisfy isActionId');

// ---------------------------------------------------------------------------
// Bootstrap helper: register + seed + start KK run + onboard + GET /state
// ---------------------------------------------------------------------------

/**
 * Full KK run bootstrap over HTTP.
 * Returns { userId, sessionEpoch, state } where state is the enriched game
 * state after GET /state (which rotates the session epoch).
 */
async function bootstrapKanjiKombatRun(client, tmpDir) {
  // Username: 2-20 chars. Use last 6 digits of timestamp + 4 random digits.
  const suffix = String(Date.now()).slice(-6) + String(Math.random()).slice(2, 6);
  const username = `kks${suffix}`;
  const password = 'test-pass-123';

  // Register returns a token directly — avoids the module-level login rate limiter
  // (which caps at 5 attempts/minute/IP across all tests in the same process).
  const regRes = await client.post('/api/auth/register', {
    username,
    password,
    inviteCode: 'neo-tokyo-friends',
    aiDataSharingConsent: true,
  });
  assert.equal(regRes.status, 200, `register failed: ${JSON.stringify(regRes.body)}`);
  const userId = regRes.body?.user?.id;
  assert.ok(userId, `register must return a user.id; got: ${JSON.stringify(regRes.body)}`);
  // Store the token from registration (no need to call login separately)
  client.setToken(regRes.body.token);

  // Pre-seed game save and SRS data
  seedSaveFile(tmpDir, userId);
  seedSrsDueCards(userId);

  // Create player (first game call — loads our seeded save)
  const createRes = await client.createPlayer('SyncTester');
  assert.equal(createRes.status, 200, `create-player: ${JSON.stringify(createRes.body)}`);

  // Start KK run
  const startRes = await client.post('/api/game/kanji-kombat/start', { creatureId: 'hi' });
  assert.equal(startRes.status, 200, `kk/start: ${JSON.stringify(startRes.body)}`);

  // Complete onboarding (run was seeded with completed=true in save file, but the route
  // checks the live meta — startRunWithCreatureId reads from gm.meta.kanjiKombatOnboarding
  // which is seeded in the save file as completed:true, so onboarding won't be pending).
  // If pending, submit it:
  const startState = startRes.body.state;
  if (startState?.run?.kanjiKombat?.onboardingPending) {
    const onboardRes = await client.post('/api/game/kanji-kombat/onboarding', {
      knowsHiragana: false,
      knowsKatakana: false,
    });
    assert.equal(onboardRes.status, 200, `kk/onboarding: ${JSON.stringify(onboardRes.body)}`);
  }

  // GET /state — rotates session epoch and returns enriched state
  const stateRes = await client.getState();
  assert.equal(stateRes.status, 200, `GET /state: ${JSON.stringify(stateRes.body)}`);
  const state = stateRes.body;

  const sessionEpoch = state.run?.kanjiKombat?.sessionEpoch;
  assert.ok(sessionEpoch, 'state.run.kanjiKombat.sessionEpoch must be set after GET /state');

  return { userId, sessionEpoch, state };
}

// ---------------------------------------------------------------------------
// Entry builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid quiz sync entry.
 * Returns { entry, resolved } so the caller can use resolved.nextCombat
 * as the combat state for the next entry (the client simulation pattern).
 *
 * @param {object} prompt — a quiz prompt from the buffer (kind === 'quiz')
 * @param {object} combat — combat state (with optimistic.nextTurnSeed etc.)
 * @param {object} run — run state
 * @param {number} seq — entry sequence number
 * @param {boolean} [correct=true] — pick correct vs wrong answer
 */
function buildQuizEntry(prompt, combat, run, seq, correct = true) {
  assert.equal(prompt.kind, 'quiz', `Expected quiz prompt but got '${prompt?.kind}'`);
  const choice = prompt.quiz.choices.find(c => c.correct === correct);
  assert.ok(choice, `No choice with correct=${correct} in quiz`);
  const seed = combat.optimistic.nextTurnSeed;
  const resolved = resolveKanjiKombatAnswerTurn(
    { combat, run, answerCorrect: correct },
    { seed },
  );
  const entry = {
    seq,
    actionId: nextActionId(),
    kind: 'quiz',
    promptId: prompt.promptId,
    sequence: prompt.sequence,
    cardId: prompt.cardId,
    answerId: choice.id,
    predictedHash: hashTranscript(resolved.transcript),
  };
  return { entry, resolved };
}

/**
 * Find the first quiz prompt in the buffer.
 */
function findFirstQuizPrompt(promptBuffer) {
  const found = promptBuffer.find(p => p.kind === 'quiz');
  if (!found) {
    throw new Error(
      `No quiz found in prompt buffer (${promptBuffer.length} entries): `
      + JSON.stringify(promptBuffer.map(p => p.kind))
    );
  }
  return found;
}

/**
 * Find the first two quiz prompts in the buffer.
 * Returns [prompt1, prompt2].
 */
function findFirstTwoQuizPrompts(promptBuffer) {
  const quizzes = promptBuffer.filter(p => p.kind === 'quiz');
  if (quizzes.length < 2) {
    throw new Error(
      `Need 2 quiz prompts but found ${quizzes.length} in buffer (${promptBuffer.length} entries): `
      + JSON.stringify(promptBuffer.map(p => p.kind))
    );
  }
  return [quizzes[0], quizzes[1]];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/game/kanji-kombat/sync', () => {
  let client;
  let cleanup;
  let tmpDir;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    tmpDir = testApp.tmpDir;
    actionCounter = 0;
    // Redirect SRS reads/writes to the isolated tmpDir for this test
    configureSrs({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await cleanup();
    // Restore SRS to the default data directory
    configureSrs({ dataDir: SRS_DEFAULT_DIR });
  });

  // -------------------------------------------------------------------------
  // Test 1: Two-entry quiz batch → 'ok', cardsReviewed === 2
  //
  // Approach: building a two-entry batch where entry2's predictedHash matches
  // the server's hash requires knowing the post-entry1 combat state (HP deltas,
  // potential wave transitions after KO, updated actionCursor, etc.).  The
  // shared resolver (`resolveKanjiKombatAnswerTurn`) does not simulate wave
  // transitions, so a fully local simulation is infeasible for the general case.
  //
  // Accepted fallback (per task spec): send entry1 first, read the server's
  // returned state, build entry2 from that, then send [entry1, entry2] together.
  // entry1 replays from the ledger (idempotent), entry2 is fresh.  The batch
  // exercises: replay-then-fresh in one call, confirmedThroughSeq === 2, and
  // the final cardsReviewed === 2.
  // -------------------------------------------------------------------------

  it('two-entry quiz batch returns ok with cardsReviewed === 2', async () => {
    const { sessionEpoch, state } = await bootstrapKanjiKombatRun(client, tmpDir);

    const promptBuffer = state.run.kanjiKombat.promptBuffer;
    assert.ok(Array.isArray(promptBuffer) && promptBuffer.length >= 1,
      `promptBuffer must be non-empty; got: ${JSON.stringify(promptBuffer?.map(p => p.kind))}`);

    const q1prompt = findFirstQuizPrompt(promptBuffer);

    // Step 1: build + send entry1 alone to get the authoritative post-entry1 state
    const { entry: entry1 } = buildQuizEntry(q1prompt, state.combat, state.run, 1);
    const sync1 = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch,
      entries: [entry1],
    });
    assert.equal(sync1.status, 200, `sync1: ${JSON.stringify(sync1.body)}`);
    assert.equal(sync1.body.status, 'ok', `sync1 must be ok: ${JSON.stringify(sync1.body)}`);
    assert.equal(sync1.body.state.run.kanjiKombat.report.cardsReviewed, 1);

    // Step 2: read the server's authoritative state after entry1
    const state2 = sync1.body.state;
    const q2prompt = findFirstQuizPrompt(state2.run.kanjiKombat.promptBuffer);

    // Step 3: build entry2 from post-entry1 state (server truth — no local simulation needed)
    const { entry: entry2 } = buildQuizEntry(q2prompt, state2.combat, state2.run, 2);

    // Step 4: send [entry1, entry2] in one batch
    // entry1 replays from the ledger, entry2 is fresh → combined result exercises both paths
    const sync2 = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch,
      entries: [entry1, entry2],
    });

    assert.equal(sync2.status, 200, `sync2: ${JSON.stringify(sync2.body)}`);
    assert.equal(sync2.body.status, 'ok',
      `expected ok, got: ${JSON.stringify(sync2.body)}`);
    assert.equal(sync2.body.confirmedThroughSeq, 2);
    assert.equal(Array.isArray(sync2.body.results), true);
    assert.equal(sync2.body.results.length, 2);
    assert.ok(sync2.body.state, 'sync response must include state');
    // entry1 replayed (no double-grade), entry2 freshly graded → 2 total
    assert.equal(
      sync2.body.state.run.kanjiKombat.report.cardsReviewed, 2,
      `cardsReviewed should be 2; report: ${JSON.stringify(sync2.body.state.run.kanjiKombat.report)}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: POST same batch again → 'ok', both replayed, cardsReviewed still 2
  // -------------------------------------------------------------------------

  it('replaying the same batch returns ok with cardsReviewed unchanged', async () => {
    const { sessionEpoch, state } = await bootstrapKanjiKombatRun(client, tmpDir);

    const q1prompt = findFirstQuizPrompt(state.run.kanjiKombat.promptBuffer);

    // Commit entry1 to get post-entry1 state
    const { entry: entry1 } = buildQuizEntry(q1prompt, state.combat, state.run, 1);
    const sync1 = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch, entries: [entry1],
    });
    assert.equal(sync1.status, 200);
    assert.equal(sync1.body.status, 'ok');

    const state2 = sync1.body.state;
    const q2prompt = findFirstQuizPrompt(state2.run.kanjiKombat.promptBuffer);
    const { entry: entry2 } = buildQuizEntry(q2prompt, state2.combat, state2.run, 2);

    // Commit entry2
    const sync2 = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch, entries: [entry2],
    });
    assert.equal(sync2.status, 200);
    assert.equal(sync2.body.status, 'ok');
    assert.equal(sync2.body.state.run.kanjiKombat.report.cardsReviewed, 2);

    // Replay [entry1, entry2] — both should come back as replayed
    const replay = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch,
      entries: [entry1, entry2],
    });

    assert.equal(replay.status, 200, `replay: ${JSON.stringify(replay.body)}`);
    assert.equal(replay.body.status, 'ok');
    assert.equal(replay.body.confirmedThroughSeq, 2);
    assert.equal(replay.body.results.length, 2);
    assert.equal(replay.body.results[0].replayed, true, 'entry1 must be marked replayed');
    assert.equal(replay.body.results[1].replayed, true, 'entry2 must be marked replayed');
    assert.equal(
      replay.body.state.run.kanjiKombat.report.cardsReviewed, 2,
      'cardsReviewed must not increase on replay'
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Stale sessionEpoch → 'corrected', reason 'session_epoch_mismatch'
  // -------------------------------------------------------------------------

  it('stale sessionEpoch returns corrected with session_epoch_mismatch', async () => {
    const { state } = await bootstrapKanjiKombatRun(client, tmpDir);

    const promptBuffer = state.run.kanjiKombat.promptBuffer;
    const q1prompt = findFirstQuizPrompt(promptBuffer);
    const { entry } = buildQuizEntry(q1prompt, state.combat, state.run, 1);

    const syncRes = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch: 'kse_stale_epoch_does_not_exist',
      entries: [entry],
    });

    assert.equal(syncRes.status, 200,
      `sync with stale epoch: ${JSON.stringify(syncRes.body)}`);
    assert.equal(syncRes.body.status, 'corrected');
    assert.equal(syncRes.body.reason, 'session_epoch_mismatch');
    // Corrected response must include authoritative state
    assert.ok(
      syncRes.body.authoritativeState || syncRes.body.state,
      'corrected response must include authoritativeState or state'
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Missing entries → 400
  // -------------------------------------------------------------------------

  it('missing entries array returns 400', async () => {
    await bootstrapKanjiKombatRun(client, tmpDir);

    const syncRes = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch: 'kse_any',
    });

    assert.equal(syncRes.status, 400);
    assert.ok(syncRes.body.error, 'must return an error message');
  });

  // -------------------------------------------------------------------------
  // Test 5: Empty entries array → 400
  // -------------------------------------------------------------------------

  it('empty entries array returns 400', async () => {
    await bootstrapKanjiKombatRun(client, tmpDir);

    const syncRes = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch: 'kse_any',
      entries: [],
    });

    assert.equal(syncRes.status, 400);
    assert.ok(syncRes.body.error, 'must return an error message');
  });

  // -------------------------------------------------------------------------
  // Test 6: Cross-path dedupe — same actionId via /answer then /sync
  //
  // The /answer route (optimistic path) records in combat.optimistic.acceptedActionIds.
  // The /sync route records in gm.meta.actionLedger.
  // These are DIFFERENT stores. This test documents whether the same actionId
  // submitted through both paths is graded once or twice.
  //
  // Per the task plan: if double-grading is detected, assert.fail() surfaces the
  // evidence — do NOT change service code in this task.
  // -------------------------------------------------------------------------

  it('cross-path dedupe: same actionId via /answer then /sync is not double-graded', async () => {
    const { sessionEpoch: initialEpoch, state } = await bootstrapKanjiKombatRun(client, tmpDir);

    const promptBuffer = state.run.kanjiKombat.promptBuffer;
    const q1prompt = findFirstQuizPrompt(promptBuffer);
    assert.equal(q1prompt.kind, 'quiz', 'need a quiz prompt for cross-path test');

    const choice = q1prompt.quiz.choices.find(c => c.correct === true);
    assert.ok(choice, 'quiz must have a correct choice');

    const seed = state.combat.optimistic.nextTurnSeed;
    const stateVersion = state.combat.optimistic.stateVersion;
    const combatId = state.combat.optimistic.combatId;

    const resolved = resolveKanjiKombatAnswerTurn(
      { combat: state.combat, run: state.run, answerCorrect: true },
      { seed },
    );

    // The shared actionId used across both routes
    const sharedActionId = nextActionId();
    assert.ok(isActionId(sharedActionId));

    // Build and POST the optimistic envelope to /answer
    const envelope = buildActionEnvelope({
      actionId: sharedActionId,
      combatId,
      stateVersion,
      seed,
      actionType: 'kanjiKombat.answer',
      payload: {
        answerId: choice.id,
        correct: true,
        predictionMode: KANJI_KOMBAT_PREDICTION_MODE,
        promptRef: {
          promptId: q1prompt.promptId,
          sequence: q1prompt.sequence,
          cardId: q1prompt.cardId,
        },
      },
      predictedTranscript: resolved.transcript,
    });

    const answerRes = await client.post('/api/game/kanji-kombat/answer', envelope);
    assert.equal(answerRes.status, 200,
      `/answer failed: ${JSON.stringify(answerRes.body)}`);

    const cardsReviewedAfterAnswer =
      answerRes.body.state?.run?.kanjiKombat?.report?.cardsReviewed ?? 0;

    // GET /state to rotate the epoch (it changes on each GET /state call)
    const stateRes2 = await client.getState();
    assert.equal(stateRes2.status, 200);
    const freshEpoch = stateRes2.body.run?.kanjiKombat?.sessionEpoch;
    assert.ok(freshEpoch, 'must have a fresh session epoch');

    // Build a /sync entry with the SAME actionId
    // The prompt may already be consumed by /answer, so this is the true cross-path test.
    const syncEntry = {
      seq: 1,
      actionId: sharedActionId,    // same actionId as the /answer call
      kind: 'quiz',
      promptId: q1prompt.promptId,
      sequence: q1prompt.sequence,
      cardId: q1prompt.cardId,
      answerId: choice.id,
      predictedHash: hashTranscript(resolved.transcript),
    };

    const syncRes = await client.post('/api/game/kanji-kombat/sync', {
      sessionEpoch: freshEpoch,
      entries: [syncEntry],
    });

    // Determine the outcome
    const isReplayed =
      syncRes.body.status === 'ok'
      && Array.isArray(syncRes.body.results)
      && syncRes.body.results[0]?.replayed === true;

    const isCorrected = syncRes.body.status === 'corrected';

    const cardsReviewedAfterSync =
      syncRes.body.state?.run?.kanjiKombat?.report?.cardsReviewed
      ?? syncRes.body.authoritativeState?.run?.kanjiKombat?.report?.cardsReviewed
      ?? cardsReviewedAfterAnswer;   // fallback: assume unchanged if not returned

    // Unconditional: cross-path entry must NEVER add a review regardless of outcome
    assert.strictEqual(
      cardsReviewedAfterSync,
      cardsReviewedAfterAnswer,
      `CROSS-PATH DEDUPE FAILURE: actionId "${sharedActionId}" graded twice. ` +
      `cardsReviewed: ${cardsReviewedAfterAnswer} → ${cardsReviewedAfterSync}. ` +
      `/answer records in combat.optimistic.acceptedActionIds; ` +
      `/sync records in gm.meta.actionLedger — these are separate stores.`
    );

    // Safe outcome: replayed (deduped by ledger) or corrected (prompt already consumed)
    assert.ok(
      isReplayed || isCorrected,
      `Expected replayed or corrected for cross-path dedupe, ` +
      `got status=${syncRes.body.status} results=${JSON.stringify(syncRes.body.results)}`
    );
  });
});
