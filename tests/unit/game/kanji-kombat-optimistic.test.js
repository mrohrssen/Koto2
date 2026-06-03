import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCombatState } from '../../../src/game/state.js';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';
import {
  buildActionEnvelope,
  KANJI_KOMBAT_PREDICTION_MODE,
} from '../../../src/shared/action-protocol.js';
import { resolveKanjiKombatAnswerTurn } from '../../../src/shared/combat/pve-turn-resolver.js';

describe('Kanji Kombat optimistic answers', () => {
  it('accepts a matching optimistic answer after recomputing the authoritative grade', () => {
    const gm = createTestKanjiKombatGameManager();
    const service = new KanjiKombatService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const answerId = 'choice-correct';
    const predicted = resolveKanjiKombatAnswerTurn(
      { combat: gm.combat, run: gm.run, answerCorrect: true },
      { seed },
    );
    const envelope = buildActionEnvelope({
      actionId: 'act_kanji_answer',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'kanjiKombat.answer',
      payload: {
        answerId,
        correct: true,
        predictionMode: KANJI_KOMBAT_PREDICTION_MODE,
      },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitOptimisticAnswer(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.kanjiAnswerCorrect, true);
    assert.deepEqual(result.actionSegments, predicted.transcript.actionSegments);
    assert.equal(gm.run.kanjiKombat.report.correctAnswers, 1);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
  });
});

function createTestKanjiKombatGameManager() {
  const weakMove = {
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
  const ally = instantiateCreature('hi');
  ally.moves = [weakMove];
  ally.hp = ally.maxHp = 100;
  ally.mp = ally.maxMp = 100;
  const enemy = instantiateCreature('mizu');
  enemy.moves = [weakMove];
  enemy.hp = enemy.maxHp = 100;
  enemy.mp = enemy.maxMp = 100;
  const combat = createCombatState(enemy);
  combat.mode = 'kanjiKombat';
  combat.isCreatureCombat = true;
  combat.allies = [ally];
  combat.enemies = [enemy];
  combat.actionCursor = { side: 'ally', index: 0, opening: false };
  combat.actionCount = 0;
  combat.cycleCount = 0;
  combat.optimistic = {
    combatId: 'cmb_kanji',
    stateVersion: 0,
    nextTurnSeed: 'kanji_seed_1',
    acceptedActionIds: {},
  };
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
    kanjiKombat: {
      wave: 1,
      waveReached: 1,
      streak: 0,
      highestStreak: 0,
      reviewsSinceIntro: 0,
      nextIntroAfter: 3,
      noDueDiscoveryChainCount: 0,
      noDuePracticeQueue: [],
      completionChoicePending: false,
      endlessMode: false,
      localDate: '2026-06-03',
      pendingIntro: null,
      currentQuiz: {
        cardId: 'hiragana:あ',
        choices: [
          { id: 'choice-correct', answer: 'a', correct: true },
          { id: 'choice-wrong', answer: 'i', correct: false },
        ],
      },
      report: {
        wavesCleared: 0,
        minibossesDefeated: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        cardsReviewed: 0,
        newCardsIntroduced: 0,
        scriptDeck: 'hiragana',
        completedDaily: false,
      },
    },
  };
  const gm = {
    combat,
    run,
    meta: { creatureCollection: ['hi'] },
    userId: 'test-user-kanji-optimistic',
    emitState() {},
  };
  gm.combatCycleService = new CombatCycleService(gm);
  gm.kanjiKombatService = new KanjiKombatService(gm);
  return gm;
}
