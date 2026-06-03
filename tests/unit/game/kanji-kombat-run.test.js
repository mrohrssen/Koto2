import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { State } from 'ts-fsrs';
import { clearSrsCache, configureSrs, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import {
  ensureScriptDeckSeeded,
  getScriptDailyState,
  SCRIPT_DECK,
} from '../../../src/game/script-srs.js';
import { getLocalDateKey, KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
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
    assert.ok(gm.run.kanjiKombat.currentQuiz || gm.run.kanjiKombat.pendingIntro);
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
    assert.equal(gm.run.kanjiKombat.completionChoicePending, true);
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
    assert.equal(gm.run.kanjiKombat.completionChoicePending, true);
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
    const pendingCardId = gm.run.kanjiKombat.pendingIntro.cardId;
    const wrongCardId = loadSrsData(gm.userId)[SCRIPT_DECK].cards
      .find(card => card.id !== pendingCardId && card.type === 'hiragana').id;

    assert.throws(
      () => service.submitIntroChoice(wrongCardId, 'known'),
      /Kanji Kombat intro/
    );

    assert.equal(gm.run.kanjiKombat.pendingIntro.cardId, pendingCardId);
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
      () => service.verifyAndCommitOptimisticAnswer({ actionId: 'act_pending' }),
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

  it('applies streak thresholds and resets after 20', () => {
    const gm = buildGm();
    gm.meta.kanjiKombatOnboarding = { completed: true, knowsHiragana: false, knowsKatakana: false };
    const service = new KanjiKombatService(gm);
    service.startRunWithCreature(fakeCreature('hi', { hp: 10, maxHp: 20 }));
    for (let i = 0; i < 20; i++) service.recordCorrectAnswer();
    assert.equal(gm.run.kanjiKombat.streak, 0);
    assert.equal(gm.run.creatureParty.active.length > 1 || gm.run.creatureParty.active[0].hp === 20, true);
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
});
