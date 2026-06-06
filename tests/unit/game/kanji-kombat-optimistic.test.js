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
import { buildOptimisticKanjiKombatAnswer } from '../../../public/js/ui/optimistic-combat-turn.js';

describe('Kanji Kombat optimistic answers', () => {
  it('accepts a matching optimistic answer after recomputing the authoritative grade', () => {
    const gm = createTestKanjiKombatGameManager();
    gm.run.kanjiKombat.streak = 2;
    gm.run.creatureParty.active[0].hp = 80;
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
    assert.deepEqual(result.kanjiStreakReward, { type: 'teamHeal', streak: 3, healPercent: 0.20 });
    assert.deepEqual(result.actionSegments, predicted.transcript.actionSegments);
    assert.equal(gm.run.kanjiKombat.report.correctAnswers, 1);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
  });

  it('returns authoritative XP events when an accepted optimistic answer KOs an enemy', () => {
    const gm = createTestKanjiKombatGameManager();
    const service = gm.kanjiKombatService;
    service.chooseNextWork = () => ({ kind: 'completePrompt' });
    gm.combat.enemies[0].hp = 1;
    gm.combat.enemies[0].level = 1;
    gm.run.creatureParty.active[0].xp = 0;
    gm.run.creatureParty.active[0].level = 1;
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const answerId = 'choice-correct';
    const predicted = resolveKanjiKombatAnswerTurn(
      { combat: gm.combat, run: gm.run, answerCorrect: true },
      { seed },
    );
    const envelope = buildActionEnvelope({
      actionId: 'act_kanji_ko_xp',
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
    assert.equal(result.xpEvents.length, 1);
    assert.equal(result.xpEvents[0].enemyId, 'mizu');
    assert.ok(result.xpEvents[0].xpGrants[0].xp > 0);
    assert.ok(result.xpEvents[0].levelUps.length > 0);
    assert.ok(result.creatureParty.active[0].level > 1);
    assert.equal(result.xpEvents[0].levelUps.at(-1).newLevel, result.creatureParty.active[0].level);
  });

  it('keeps accepted optimistic action segments stable when a correct answer triggers the streak-6 stat reward', () => {
    const gm = createTestKanjiKombatGameManager();
    gm.run.kanjiKombat.streak = 5;
    gm.combat.allies[0].attack = 10;
    gm.run.creatureParty.active[0].attack = 10;
    const service = gm.kanjiKombatService;
    const predicted = buildOptimisticKanjiKombatAnswer({
      state: { combat: gm.combat, run: gm.run },
      answerId: 'choice-correct',
      actionId: 'act_kanji_streak6',
    });
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const result = service.verifyAndCommitOptimisticAnswer(predicted.envelope);

      assert.equal(result.status, 'accepted');
      assert.equal(result.kanjiStreakReward.type, 'statUp');
      assert.equal(result.kanjiStreakReward.stat, 'atk');
      assert.deepEqual(result.actionSegments, predicted.localTranscript.actionSegments);
      assert.equal(result.creatureParty.active[0].statStages.atk, 1);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('accepts browser Kanji predictions when committed Exp Master XP is server-owned', () => {
    const gm = createTestKanjiKombatGameManager();
    gm.run.partySkills = [{ id: 'expMaster', level: 4 }];
    gm.combat.enemies[0].level = 5;
    gm.combat.enemies[0].hp = 1;
    const service = new KanjiKombatService(gm);
    const predicted = buildOptimisticKanjiKombatAnswer({
      state: { combat: gm.combat, run: gm.run },
      answerId: 'choice-correct',
      actionId: 'act_browser_kanji_exp',
    });

    const result = service.verifyAndCommitOptimisticAnswer(predicted.envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(typeof result.stateVersion, 'number');
    assert.equal(result.xpEvents.length, 1);
    assert.equal(result.actionSegments[0].xpEvents.length, 0);
    assert.equal(result.xpEvents[0].xpGrants[0].xp, 500);
  });

  it('rejects duplicate action ids when the Kanji replay envelope differs', () => {
    const gm = createTestKanjiKombatGameManager();
    const service = gm.kanjiKombatService;
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const predicted = buildOptimisticKanjiKombatAnswer({
      state: { combat: gm.combat, run: gm.run },
      answerId: 'choice-correct',
      actionId: 'act_kanji_dupe',
    });

    const first = service.verifyAndCommitOptimisticAnswer(predicted.envelope);
    const versionAfterFirst = gm.combat.optimistic.stateVersion;
    const second = service.verifyAndCommitOptimisticAnswer({
      ...predicted.envelope,
      actionId: 'act_kanji_dupe',
      stateVersion: versionAfterFirst,
      seed: gm.combat.optimistic.nextTurnSeed,
      payload: {
        ...predicted.envelope.payload,
        answerId: 'choice-wrong',
      },
      predictedHash: 'different',
    });

    assert.equal(first.status, 'accepted');
    assert.equal(second.status, 'corrected');
    assert.equal(second.reason, 'duplicate_action_id_mismatch');
    assert.equal(gm.combat.optimistic.stateVersion, versionAfterFirst);
    assert.equal(stateVersion + 1, versionAfterFirst);
    assert.notEqual(gm.combat.optimistic.nextTurnSeed, seed);
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
