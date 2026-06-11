import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearSrsCache, configureSrs } from '../../../src/game/internal-srs.js';
import { createNewRun } from '../../../src/game/state.js';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { createCombatState } from '../../../src/game/state.js';
import { createPveOpeningCursor } from '../../../src/game/combat/action-cursor.js';
import {
  KanjiKombatService,
  getKanjiKombatActivePrompt,
  getLocalDateKey,
  rotateKanjiKombatSessionEpoch,
  createInitialKanjiKombatState,
  ensureKanjiKombatTurnSeeds,
} from '../../../src/game/services/kanji-kombat-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { createSeededRng } from '../../../src/shared/deterministic-rng.js';
import { hashTranscript, isActionId } from '../../../src/shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../../src/shared/combat/pve-turn-resolver.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const TEST_USER = 'kk-session-sync-user';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-sync-'));
  configureSrs({ dataDir: tempDir });
  clearSrsCache(TEST_USER);
});

afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

function fakeCreature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

/**
 * Builds a fully wired gm that has an active Kanji Kombat run with a filled
 * prompt buffer and session epoch set.  Uses the same structure as
 * kanji-kombat-optimistic.test.js so CombatCycleService works.
 */
function buildGm() {
  const ally = fakeCreature('hi');
  const enemy = fakeCreature('mizu');
  const combat = createCombatState(enemy);
  combat.mode = 'kanjiKombat';
  combat.isCreatureCombat = true;
  combat.allies = [ally];
  combat.enemies = [enemy];
  combat.actionCursor = createPveOpeningCursor({ allies: [ally], enemies: [enemy] });
  combat.actionCount = 0;
  combat.cycleCount = 0;
  combat.optimistic = {
    combatId: 'cmb_sync_test',
    stateVersion: 0,
    nextTurnSeed: 'sync_seed_1',
    acceptedActionIds: {},
  };

  const kk = createInitialKanjiKombatState({ localDate: getLocalDateKey() });
  rotateKanjiKombatSessionEpoch(kk);

  const run = {
    active: true,
    mode: 'kanjiKombat',
    player: { credits: 0 },
    creatureParty: { active: [ally], reserves: [], maxTotal: 3, pendingCaptures: [] },
    partySkills: [],
    itemBuffs: {
      attackMult: 1,
      hpMult: 1,
      elementEdge: 0,
      flatDamageReduction: 0,
      xpMultiplier: 1,
      xpBalanceStacks: 0,
      baseAttackBonus: 0,
      baseHpBonus: 0,
      baseMpBonus: 0,
    },
    crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
    runSummary: {},
    stats: {},
    kanjiKombat: kk,
  };

  const gm = {
    userId: TEST_USER,
    player: { name: 'Tester', hp: 100, maxHp: 100, credits: 0 },
    combat,
    run,
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'mizu'],
      creatureCounts: { hi: 1, mizu: 1 },
      kanjiKombatOnboarding: { completed: true, knowsHiragana: false, knowsKatakana: false },
    },
    emitState() {},
  };

  gm.combatCycleService = new CombatCycleService(gm);
  const service = new KanjiKombatService(gm);
  // CombatCycleService calls gm.kanjiKombatService.queueNextPrompt() internally
  gm.kanjiKombatService = service;

  // Fill the prompt buffer and ensure turn seeds
  service.refillPromptBuffer();
  ensureKanjiKombatTurnSeeds(combat);

  return { gm, service };
}

function createKanjiKombatTestService() {
  return buildGm().service;
}

// ---------------------------------------------------------------------------
// actionId counter — format must satisfy isActionId: prefix_middle_suffix
// ---------------------------------------------------------------------------
let actionCounter = 0;
function nextActionId() {
  actionCounter += 1;
  const n = String(actionCounter).padStart(8, '0');
  return `run_st_${n}`;
}

// Make sure the generated ids are valid before running tests
assert.ok(isActionId('run_st_00000001'), 'nextActionId format must satisfy isActionId');

/**
 * Advances through intro prompts at the head of the buffer using submitIntroChoice
 * until the head is a quiz (or the buffer is exhausted).  Returns the number of
 * intros consumed.
 */
function advanceToQuiz(service) {
  const kk = service.gm.run.kanjiKombat;
  let consumed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const head = getKanjiKombatActivePrompt(kk);
    if (!head || head.kind === 'quiz') break;
    if (head.kind === 'completePrompt') break;
    if (head.kind === 'intro') {
      service.submitIntroChoice(head.cardId, 'unknown', {
        promptId: head.promptId,
        sequence: head.sequence,
        cardId: head.cardId,
      });
      consumed += 1;
    } else {
      break;
    }
  }
  return consumed;
}

/**
 * Builds a valid quiz sync entry from the current prompt-buffer head.
 * Assumes the head is a quiz prompt.
 */
function quizEntryFromHead(service, seq, { correct = true } = {}) {
  const kk = service.gm.run.kanjiKombat;
  const head = getKanjiKombatActivePrompt(kk);
  assert.equal(head.kind, 'quiz', `Expected quiz head but got ${head?.kind}`);
  const choice = head.quiz.choices.find(c => c.correct === correct);
  assert.ok(choice, `No choice with correct=${correct} in quiz`);
  const seed = service.gm.combat.optimistic.nextTurnSeed;
  const resolved = resolveKanjiKombatAnswerTurn(
    { combat: service.gm.combat, run: service.gm.run, answerCorrect: correct },
    { seed },
  );
  return {
    seq,
    actionId: nextActionId(),
    kind: 'quiz',
    promptId: head.promptId,
    sequence: head.sequence,
    cardId: head.cardId,
    answerId: choice.id,
    predictedHash: hashTranscript(resolved.transcript),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('applySessionSync rejects a stale session epoch', () => {
  const service = createKanjiKombatTestService();
  advanceToQuiz(service);
  const entry = quizEntryFromHead(service, 1);
  const result = service.applySessionSync({ sessionEpoch: 'kse_stale', entries: [entry] });
  assert.equal(result.status, 'corrected');
  assert.equal(result.reason, 'session_epoch_mismatch');
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 0);
});

test('applySessionSync rejects a missing session epoch', () => {
  const service = createKanjiKombatTestService();
  advanceToQuiz(service);
  const entry = quizEntryFromHead(service, 1);
  const result = service.applySessionSync({ sessionEpoch: undefined, entries: [entry] });
  assert.equal(result.status, 'corrected');
  assert.equal(result.reason, 'session_epoch_mismatch');
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 0);
});

test('applySessionSync commits an ordered quiz batch and confirms through the last seq', () => {
  const service = createKanjiKombatTestService();
  advanceToQuiz(service);
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;

  // First entry
  const entry1 = quizEntryFromHead(service, 1);
  const result1 = service.applySessionSync({ sessionEpoch: epoch, entries: [entry1] });
  assert.equal(result1.status, 'ok');
  assert.equal(result1.confirmedThroughSeq, 1);
  assert.equal(result1.sessionEpoch, epoch);
  assert.equal(result1.results.length, 1);

  // Second entry — built from post-entry1 state
  const entry2 = quizEntryFromHead(service, 2);
  const result2 = service.applySessionSync({ sessionEpoch: epoch, entries: [entry2] });
  assert.equal(result2.status, 'ok');
  assert.equal(result2.confirmedThroughSeq, 2);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 2);
});

test('applySessionSync replays duplicate actionIds without double grading', () => {
  const service = createKanjiKombatTestService();
  advanceToQuiz(service);
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;

  const entry = quizEntryFromHead(service, 1);
  service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  const reviewed = service.gm.run.kanjiKombat.report.cardsReviewed;

  const replay = service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  assert.equal(replay.status, 'ok');
  assert.equal(replay.confirmedThroughSeq, 1);
  assert.equal(replay.results[0].replayed, true);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, reviewed);
});

test('applySessionSync stops at the first invalid entry and reports rejectedSeq', () => {
  const service = createKanjiKombatTestService();
  advanceToQuiz(service);
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;

  const good = quizEntryFromHead(service, 1);
  // Build bad BEFORE committing good, so its promptId/sequence will be wrong after good commits
  const bad = { ...quizEntryFromHead(service, 2), promptId: 'kkp_wrong', seq: 2 };

  const result = service.applySessionSync({ sessionEpoch: epoch, entries: [good, bad] });
  assert.equal(result.status, 'corrected');
  assert.equal(result.confirmedThroughSeq, 1);
  assert.equal(result.rejectedSeq, 2);
  assert.equal(service.gm.run.kanjiKombat.report.cardsReviewed, 1);
});

test('applySessionSync commits intro entries', () => {
  const service = createKanjiKombatTestService();
  const kk = service.gm.run.kanjiKombat;
  const epoch = kk.sessionEpoch;

  // The fixture starts with an intro as the first head
  const head = getKanjiKombatActivePrompt(kk);
  assert.equal(head.kind, 'intro', `Expected intro head but got ${head?.kind}`);

  const result = service.applySessionSync({
    sessionEpoch: epoch,
    entries: [{
      seq: 1,
      actionId: nextActionId(),
      kind: 'intro',
      promptId: head.promptId,
      sequence: head.sequence,
      cardId: head.cardId,
      choice: 'unknown',
    }],
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.confirmedThroughSeq, 1);
  assert.equal(kk.report.newCardsIntroduced, 1);
});

test('applySessionSync returns sessionEpoch in all responses', () => {
  const service = createKanjiKombatTestService();
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  advanceToQuiz(service);
  const entry = quizEntryFromHead(service, 1);

  const ok = service.applySessionSync({ sessionEpoch: epoch, entries: [entry] });
  assert.equal(ok.sessionEpoch, epoch);

  const corrected = service.applySessionSync({ sessionEpoch: 'kse_bad', entries: [entry] });
  assert.equal(corrected.sessionEpoch, epoch);
});

test('applySessionSync with empty entries returns ok with null confirmedThroughSeq', () => {
  const service = createKanjiKombatTestService();
  const epoch = service.gm.run.kanjiKombat.sessionEpoch;
  const result = service.applySessionSync({ sessionEpoch: epoch, entries: [] });
  assert.equal(result.status, 'ok');
  assert.equal(result.confirmedThroughSeq, null);
  assert.deepEqual(result.results, []);
});
