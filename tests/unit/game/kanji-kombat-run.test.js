import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State } from 'ts-fsrs';
import { clearSrsCache, configureSrs, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import {
  DAILY_NEW_LIMIT,
  ensureScriptDeckSeeded,
  getScriptDailyState,
  SCRIPT_DECK,
} from '../../../src/game/script-srs.js';
import {
  createInitialKanjiKombatState,
  getLocalDateKey,
  KanjiKombatService,
} from '../../../src/game/services/kanji-kombat-service.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { createNewRun } from '../../../src/game/state.js';

const WEAK_MOVE = {
  id: 'poke',
  name: '突く',
  nameEn: 'Poke',
  reading: 'つく',
  element: 'neutral',
  category: 'damage',
  target: 'single_enemy',
  power: 1,
  mpCost: 0,
  accuracy: 100,
};

function fakeCreature(id, overrides = {}) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp: 20,
    maxHp: 20,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
    ...overrides,
  };
}

function buildGm() {
  const player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
  const gm = {
    userId: 'kk-run-user',
    player,
    run: null,
    combat: null,
    meta: {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi', 'neko', 'inu'],
      creatureCounts: { hi: 1, neko: 1, inu: 1 },
      kanjiKombatOnboarding: { completed: false, knowsHiragana: null, knowsKatakana: null },
    },
    emitState() {},
  };
  gm.run = createNewRun(player);
  gm.run.creatureParty.active = [fakeCreature('hi')];
  return gm;
}

describe('KanjiKombatService run lifecycle helpers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-run-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('kk-run-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('starts an onboarding-pending run without queueing a prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    service.startRunWithCreature(fakeCreature('hi'));

    assert.equal(gm.run.kanjiKombat.onboardingPending, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.combat.mode, 'kanjiKombat');
  });

  it('submits onboarding, saves reversible preferences, and queues first prompt', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    const result = service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: true,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.ok(gm.run.kanjiKombat.promptBuffer.length > 0);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.report.scriptDeck, 'kanji');
    assert.equal(result.onboarding.completed, true);
    assert.equal(result.kanjiKombat, gm.run.kanjiKombat);
  });

  it('rejects onboarding submit outside a pending Kanji Kombat run', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);

    assert.throws(
      () => service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true }),
      /No pending Kanji Kombat onboarding/
    );
  });

  it('saves onboarding and shows completion choice when the daily deck is already complete', () => {
    const gm = buildGm();
    saveSrsData(gm.userId, {
      kana: { cards: [] },
      kanjiKombatDaily: { date: getLocalDateKey(), introducedCount: 0, completed: true },
    });
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    const result = service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });

    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: true,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.kind, 'completePrompt');
    assert.equal(result.next, 'completePrompt');
  });

  it('saves onboarding and shows completion choice when no script work is available', () => {
    const gm = buildGm();
    ensureScriptDeckSeeded(gm.userId);
    const data = loadSrsData(gm.userId);
    for (const card of data[SCRIPT_DECK].cards.filter(candidate => candidate.type === 'kanji')) {
      card.reps = 1;
      card.state = State.Learning;
      card.due = new Date('2100-01-01T00:00:00Z');
    }
    saveSrsData(gm.userId, data);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));

    const result = service.submitOnboarding({ knowsHiragana: true, knowsKatakana: true });

    assert.equal(
      getScriptDailyState(gm.userId, getLocalDateKey()).completed,
      true,
      'normal no-work completion should persist daily completion after onboarding is saved'
    );
    assert.deepEqual(gm.meta.kanjiKombatOnboarding, {
      completed: true,
      knowsHiragana: true,
      knowsKatakana: true,
    });
    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.kind, 'completePrompt');
    assert.equal(result.next, 'completePrompt');
  });

  it('rejects intro choices while onboarding is pending without touching intro card progress', () => {
    const gm = buildGm();
    const cards = ensureScriptDeckSeeded(gm.userId);
    const card = cards.find(candidate => candidate.id === 'hiragana:あ');
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.pendingIntro = { cardId: card.id, card, source: 'test' };

    assert.throws(
      () => service.submitIntroChoice(card.id, 'known'),
      /Kanji Kombat onboarding/
    );

    assert.equal(gm.run.kanjiKombat.pendingIntro.cardId, card.id);
    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(candidate => candidate.id === card.id);
    assert.equal(savedCard.reps || 0, 0);
  });

  it('rejects stale intro card ids without grading arbitrary cards', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    ensureScriptDeckSeeded(gm.userId);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const pendingCardId = gm.run.kanjiKombat.promptBuffer[0].cardId;
    const wrongCardId = loadSrsData(gm.userId)[SCRIPT_DECK].cards
      .find(card => card.id !== pendingCardId && card.type === 'hiragana').id;

    assert.throws(
      () => service.submitIntroChoice(wrongCardId, 'known'),
      /No pending Kanji Kombat intro/
    );

    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0].cardId, pendingCardId);
    const wrongCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === wrongCardId);
    assert.equal(wrongCard.reps || 0, 0);
  });

  it('rejects direct and optimistic answers while onboarding is pending', () => {
    const gm = buildGm();
    ensureScriptDeckSeeded(gm.userId);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.combatCycleService = {
      resolveKanjiKombatCursorAction: () => ({ actionType: 'kanjiKombat' }),
    };
    gm.run.kanjiKombat.currentQuiz = {
      cardId: 'hiragana:あ',
      choices: [
        { id: 'choice-correct', answer: 'a', correct: true },
        { id: 'choice-wrong', answer: 'i', correct: false },
      ],
    };
    gm.combat.optimistic = {
      combatId: 'cmb_kanji_pending',
      stateVersion: 0,
      nextTurnSeed: 'seed_pending',
      acceptedActionIds: {},
    };

    assert.throws(
      () => service.submitAnswer('choice-correct'),
      /Kanji Kombat onboarding/
    );
    assert.throws(
      () => service.verifyAndCommitOptimisticAnswer({ actionId: 'act_pending_test' }),
      /Kanji Kombat onboarding/
    );

    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === 'hiragana:あ');
    assert.equal(savedCard.reps || 0, 0);
  });

  it('rejects completion choices while onboarding is pending', () => {
    const gm = buildGm();
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.completionChoicePending = true;

    assert.throws(
      () => service.resolveCompletionChoice(false),
      /Kanji Kombat onboarding/
    );

    assert.equal(gm.run.kanjiKombat.completionChoicePending, true);
  });

  it('rejects normal combat-cycle actions while onboarding is pending without advancing combat', () => {
    const gm = buildGm();
    const kanjiService = new KanjiKombatService(gm);
    kanjiService.startRunWithCreature(fakeCreature('hi', { moves: [WEAK_MOVE] }));
    const combatService = new CombatCycleService(gm);
    const moveChoices = [{ creatureIndex: 0, moveId: WEAK_MOVE.id, targetIndex: 0 }];
    const actionCount = gm.combat.actionCount;
    const actionCursor = JSON.parse(JSON.stringify(gm.combat.actionCursor));

    assert.throws(
      () => combatService.creatureCombatCycle('attack', moveChoices),
      /Kanji Kombat onboarding/
    );

    assert.equal(gm.combat.actionCount, actionCount);
    assert.deepEqual(gm.combat.actionCursor, actionCursor);
  });

  it('marks a run as Kanji Kombat and starts with one selected creature', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('neko'));
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.run.creatureParty.active.length, 1);
    assert.equal(gm.run.creatureParty.active[0].id, 'neko');
    assert.equal(gm.run.initialSkillPick.chosenId, 'kanjiKombat');
    assert.equal(gm.combat.mode, 'kanjiKombat');
  });

  it('applies streak rewards at 3/6/9/12 and levels the party before resetting at 15', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi', { hp: 10, maxHp: 20, level: 3, xp: 0 }));

    const active = gm.run.creatureParty.active;
    active.push(
      fakeCreature('neko', { hp: 8, maxHp: 20, level: 4, xp: 0 }),
      fakeCreature('inu', { hp: 5, maxHp: 20, level: 5, xp: 0 }),
    );
    gm.run.creatureParty.reserves.push(
      fakeCreature('reserve-hi', { id: 'hi', hp: 6, maxHp: 20, level: 2, xp: 0 }),
    );

    for (let i = 0; i < 3; i++) service.recordCorrectAnswer();
    assert.deepEqual(active.map(creature => creature.hp), [14, 12, 9]);
    assert.equal(gm.run.kanjiKombat.streak, 3);

    for (let i = 0; i < 3; i++) service.recordCorrectAnswer();
    const buffStages = active.reduce((total, creature) => (
      total + (creature.statStages?.atk || 0)
        + (creature.statStages?.def || 0)
        + (creature.statStages?.dex || 0)
    ), 0);
    assert.equal(buffStages, 1);
    assert.equal(gm.run.kanjiKombat.streak, 6);

    for (let i = 0; i < 3; i++) service.recordCorrectAnswer();
    assert.deepEqual(active.map(creature => creature.hp), [20, 20, 19]);
    assert.equal(gm.run.kanjiKombat.streak, 9);

    for (let i = 0; i < 3; i++) service.recordCorrectAnswer();
    assert.deepEqual(active.map(creature => creature.hp), [20, 20, 20]);
    assert.equal(gm.run.kanjiKombat.streak, 12);

    const allParty = [...active, ...gm.run.creatureParty.reserves];
    const levelsBeforeFifteen = allParty.map(creature => creature.level);
    for (let i = 0; i < 3; i++) service.recordCorrectAnswer();

    assert.equal(gm.run.kanjiKombat.streak, 0);
    assert.deepEqual(
      allParty.map(creature => creature.level),
      levelsBeforeFifteen.map(level => level + 1),
    );
  });

  it('records wave completion without room fields', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.currentAreaEncounters = 0;
    gm.run.rooms = [{ type: 'encounter', interacted: false }];
    service.recordWaveClear({ miniboss: true });
    assert.equal(gm.run.kanjiKombat.wave, 2);
    assert.equal(gm.run.kanjiKombat.report.wavesCleared, 1);
    assert.equal(gm.run.kanjiKombat.report.minibossesDefeated, 1);
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.rooms[0].interacted, false);
  });

  it('starts with a run-scoped creature that has normal combat fields', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    gm.meta.crests = [];
    gm.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
    const service = new KanjiKombatService(gm);

    service.startRunWithCreatureId('hi');

    const ally = gm.run.creatureParty.active[0];
    assert.equal(ally.id, 'hi');
    assert.equal(ally.level, 5);
    assert.equal(typeof ally.uid, 'string');
    assert.equal(Array.isArray(ally.moves), true);
    assert.equal(ally.hp, ally.maxHp);
    assert.equal(ally.mp, ally.maxMp);
  });

  it('starts an onboarding-complete run with a prompt buffer and inert legacy prompt fields', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);

    service.startRunWithCreature(fakeCreature('hi'));

    assert.equal(gm.run.kanjiKombat.onboardingPending, false);
    assert.ok(gm.run.kanjiKombat.promptBuffer.length > 0);
    assert.equal(gm.run.kanjiKombat.promptBuffer.length <= 60, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
  });

  it('intro prompt commits consume one prompt and refill the server buffer', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    const result = service.submitIntroChoice(head.cardId, 'unknown', {
      promptId: head.promptId,
      sequence: head.sequence,
    });

    assert.equal(result.graded.id, head.cardId);
    assert.notEqual(gm.run.kanjiKombat.promptBuffer[0]?.promptId, head.promptId);
    assert.equal(gm.run.kanjiKombat.promptBuffer.length <= 60, true);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
  });

  it('buffered no-due intro commits preserve the practice queue while refilling', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    ensureScriptDeckSeeded(gm.userId);
    const data = loadSrsData(gm.userId);
    data.kanjiKombatDaily = {
      date: getLocalDateKey(),
      introducedCount: DAILY_NEW_LIMIT - 1,
      completed: false,
    };
    saveSrsData(gm.userId, data);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];
    assert.equal(head.kind, 'intro');
    assert.equal(head.source, 'noDueBatch');

    service.submitIntroChoice(head.cardId, 'unknown', {
      promptId: head.promptId,
      sequence: head.sequence,
    });

    const kk = gm.run.kanjiKombat;
    assert.equal(kk.noDuePracticeQueue.includes(head.cardId), true);
    assert.notEqual(kk.promptBuffer[0]?.promptId, head.promptId);
    assert.equal(kk.currentQuiz, null);
    assert.equal(kk.pendingIntro, null);
    assert.equal(kk.completionChoicePending, false);
  });

  it('does not commit an intro from a stale pendingIntro mirror without an active prompt', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const card = ensureScriptDeckSeeded(gm.userId).find(candidate => candidate.id === 'hiragana:あ');
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.promptBuffer = [];
    gm.run.kanjiKombat.pendingIntro = { cardId: card.id, card, source: 'legacy' };

    assert.throws(
      () => service.submitIntroChoice(card.id, 'known'),
      /No active Kanji Kombat prompt|No pending Kanji Kombat intro/
    );
  });

  it('rejects stale buffered intro prompt commits without grading', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    assert.throws(
      () => service.submitIntroChoice(head.cardId, 'known', {
        promptId: 'kkp_stale',
        sequence: head.sequence,
      }),
      /Kanji Kombat prompt mismatch/
    );

    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === head.cardId);
    assert.equal(savedCard.reps || 0, 0);
  });

  it('rejects supplied empty intro prompt ids without grading or consuming', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    assert.throws(
      () => service.submitIntroChoice(head.cardId, 'known', {
        promptId: '',
        sequence: head.sequence,
      }),
      /Kanji Kombat prompt mismatch/
    );

    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === head.cardId);
    assert.equal(savedCard.reps || 0, 0);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.promptId, head.promptId);
  });

  it('rejects supplied intro prompt card id mismatches without grading or consuming', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    const head = gm.run.kanjiKombat.promptBuffer[0];

    assert.throws(
      () => service.submitIntroChoice(head.cardId, 'known', {
        promptId: head.promptId,
        sequence: head.sequence,
        cardId: '',
      }),
      /Kanji Kombat prompt mismatch/
    );

    const savedCard = loadSrsData(gm.userId)[SCRIPT_DECK].cards.find(card => card.id === head.cardId);
    assert.equal(savedCard.reps || 0, 0);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.promptId, head.promptId);
  });

  it('marks daily complete when a buffered complete prompt becomes active after an answer', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const card = ensureScriptDeckSeeded(gm.userId).find(candidate => candidate.id === 'hiragana:あ');
    const quiz = {
      cardId: card.id,
      choices: [
        { id: 'choice-correct', answer: card.answer, correct: true },
        { id: 'choice-wrong', answer: 'wrong', correct: false },
      ],
    };
    gm.run.mode = 'kanjiKombat';
    gm.run.kanjiKombat = createInitialKanjiKombatState({ localDate: getLocalDateKey() });
    gm.run.kanjiKombat.report.scriptDeck = 'hiragana';
    gm.run.kanjiKombat.currentQuiz = quiz;
    gm.run.kanjiKombat.promptBuffer = [
      { promptId: 'kkp_final_quiz', sequence: 1, kind: 'quiz', cardId: card.id, quiz },
      { promptId: 'kkp_final_complete', sequence: 2, kind: 'completePrompt', cardId: null, source: 'dailyComplete' },
    ];
    gm.run.kanjiKombat.promptBufferSeq = 2;
    gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [{ hp: 1, id: 'enemy' }] };
    gm.combatCycleService = {
      resolveKanjiKombatCursorAction: () => ({ actionType: 'kanjiKombat' }),
    };
    const service = new KanjiKombatService(gm);

    service.submitAnswer('choice-correct', {
      promptRef: { promptId: 'kkp_final_quiz', sequence: 1, cardId: card.id },
    });

    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.kind, 'completePrompt');
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.report.completedDaily, true);
    assert.equal(getScriptDailyState(gm.userId, getLocalDateKey()).completed, true);
  });

  it('does not commit an answer from a stale currentQuiz mirror without an active prompt', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const card = ensureScriptDeckSeeded(gm.userId).find(candidate => candidate.id === 'hiragana:あ');
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.promptBuffer = [];
    gm.run.kanjiKombat.currentQuiz = {
      cardId: card.id,
      choices: [
        { id: 'choice-correct', answer: card.answer, correct: true },
        { id: 'choice-wrong', answer: 'wrong', correct: false },
      ],
    };
    gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [{ hp: 1, id: 'enemy' }] };
    gm.combatCycleService = {
      resolveKanjiKombatCursorAction: () => ({ actionType: 'kanjiKombat' }),
    };

    assert.throws(
      () => service.submitAnswer('choice-correct'),
      /No active Kanji Kombat prompt|No active Kanji Kombat quiz/
    );
  });

  it('accepts a buffered completion prompt with keep-going and queues endless work', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    ensureScriptDeckSeeded(gm.userId);
    const data = loadSrsData(gm.userId);
    for (const card of data[SCRIPT_DECK].cards.filter(candidate => candidate.type === 'hiragana')) {
      card.reps = 1;
      card.due = new Date('2100-01-01T00:00:00Z');
    }
    data.kanjiKombatDaily = { date: getLocalDateKey(), introducedCount: DAILY_NEW_LIMIT, completed: true };
    saveSrsData(gm.userId, data);
    gm.run.mode = 'kanjiKombat';
    gm.run.kanjiKombat = createInitialKanjiKombatState({ localDate: getLocalDateKey() });
    gm.run.kanjiKombat.report.completedDaily = true;
    gm.run.kanjiKombat.promptBuffer = [
      { promptId: 'kkp_keep_going_complete', sequence: 1, kind: 'completePrompt', cardId: null, source: 'dailyComplete' },
    ];
    gm.run.kanjiKombat.promptBufferSeq = 1;
    gm.combat = { active: true, allies: gm.run.creatureParty.active, enemies: [{ hp: 1, id: 'enemy' }] };
    const service = new KanjiKombatService(gm);

    const result = service.resolveCompletionChoice(true);

    assert.equal(result.combatEnded, false);
    assert.equal(gm.run.active, true);
    assert.equal(gm.combat.active, true);
    assert.equal(gm.run.kanjiKombat.endlessMode, true);
    assert.equal(gm.run.kanjiKombat.completionChoicePending, false);
    assert.equal(gm.run.kanjiKombat.currentQuiz, null);
    assert.equal(gm.run.kanjiKombat.pendingIntro, null);
    assert.equal(gm.run.kanjiKombat.promptBuffer[0]?.kind, 'quiz');
  });

  it('does not commit a completion choice from a stale legacy flag without an active prompt', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    ensureScriptDeckSeeded(gm.userId);
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.promptBuffer = [];
    gm.run.kanjiKombat.completionChoicePending = true;

    assert.throws(
      () => service.resolveCompletionChoice(true),
      /No active Kanji Kombat prompt|No Kanji Kombat completion choice is pending/
    );
  });

  it('validates buffered completion prompt choices before resolving', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi'));
    gm.run.kanjiKombat.promptBuffer = [{
      promptId: 'kkp_complete',
      sequence: 1,
      kind: 'completePrompt',
      cardId: null,
      source: 'dailyComplete',
    }];

    assert.throws(
      () => service.resolveCompletionChoice(true, { promptId: 'kkp_wrong', sequence: 1 }),
      /Kanji Kombat prompt mismatch/
    );

    const result = service.resolveCompletionChoice(true, { promptId: 'kkp_complete', sequence: 1 });

    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(gm.run.kanjiKombat.endlessMode, true);
    assert.notEqual(gm.run.kanjiKombat.promptBuffer[0]?.promptId, 'kkp_complete');
  });
});
