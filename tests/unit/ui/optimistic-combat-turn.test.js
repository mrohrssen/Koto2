import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVisualSafePveLocalTranscript,
  buildOptimisticKanjiKombatAnswer,
  buildOptimisticCombatTurn,
  canRunOptimisticKanjiKombatAnswer,
  canRunOptimisticPveTurn,
} from '../../../public/js/ui/optimistic-combat-turn.js';

function createCombatant(overrides = {}) {
  return {
    id: 'hi',
    name: '火',
    nameEn: 'Fire',
    reading: 'ひ',
    element: 'fire',
    level: 3,
    attack: 10,
    defense: 5,
    hp: 100,
    maxHp: 100,
    mp: 10,
    maxMp: 10,
    moves: [{
      id: 'honoo',
      name: '炎',
      nameEn: 'Flame',
      reading: 'ほのお',
      element: 'fire',
      category: 'damage',
      target: 'single_enemy',
      power: 30,
      mpCost: 0,
    }],
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    combat: {
      active: true,
      allies: [createCombatant()],
      enemies: [createCombatant({ id: 'mizu', name: '水', nameEn: 'Water', reading: 'みず', element: 'water' })],
      optimistic: { combatId: 'cmb_test', stateVersion: 0, nextTurnSeed: 'turn-seed' },
      ...overrides.combat,
    },
    run: {
      partySkills: [],
      creatureParty: { active: [], reserves: [] },
      ...overrides.run,
    },
  };
}

function kanjiKombatState(overrides = {}) {
  const ally = createCombatant({ id: 'hi', nameEn: 'Fire', element: 'fire' });
  const enemy = createCombatant({
    id: 'mizu',
    name: '水',
    nameEn: 'Water',
    reading: 'みず',
    element: 'water',
    hp: 100,
    maxHp: 100,
  });
  return state({
    combat: {
      mode: 'kanjiKombat',
      allies: [ally],
      enemies: [enemy],
      actionCursor: { side: 'ally', index: 0, opening: false },
      ...overrides.combat,
    },
    run: {
      mode: 'kanjiKombat',
      creatureParty: { active: [ally], reserves: [] },
      kanjiKombat: {
        currentQuiz: {
          cardId: 'hiragana:あ',
          choices: [
            { id: 'answer-correct', answer: 'a', correct: true },
            { id: 'answer-wrong', answer: 'i', correct: false },
          ],
        },
      },
      ...overrides.run,
    },
  });
}

describe('optimistic combat turn client', () => {
  it('builds a real local transcript and server envelope', () => {
    const result = buildOptimisticCombatTurn({
      state: state(),
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_test',
    });

    assert.equal(result.localTranscript.actionType, 'attack');
    assert.equal(result.envelope.actionId, 'act_test');
    assert.equal(result.envelope.combatId, 'cmb_test');
    assert.equal(result.envelope.stateVersion, 0);
    assert.equal(result.envelope.seed, 'turn-seed');
    assert.equal(result.envelope.payload.moveChoices[0].moveId, 'honoo');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
    assert.equal(typeof result.envelope.predictedHash, 'string');
    assert.equal('predictedTranscript' in result.envelope, false);
    assert.equal(result.localTranscript.allies.length, 1);
    assert.equal(result.localTranscript.enemies.length, 1);
  });

  it('predicts ally action-cursor turns with cursor action segments', () => {
    const cursorState = state({
      combat: {
        actionCursor: { side: 'ally', index: 0, opening: false },
      },
    });

    assert.equal(canRunOptimisticPveTurn(cursorState, 'attack'), true);
    const result = buildOptimisticCombatTurn({
      state: cursorState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_cursor',
    });

    assert.equal(result.localTranscript.actionType, 'attack');
    assert.equal(result.localTranscript.actionSegments[0].actor.side, 'ally');
    assert.equal(result.localTranscript.actionSegments[0].actor.index, 0);
    assert.equal(result.localTranscript.playerAttacks.length, 1);
    assert.equal(result.localNextCombat.actionCursor.side, 'ally');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
  });

  it('predicts NPC battle action-cursor turns because live NPC battles use the same cursor flow', () => {
    const npcCursorState = state({
      combat: {
        actionCursor: { side: 'ally', index: 0, opening: false },
        npcId: 'kodomo',
        npcData: { id: 'kodomo', nameEn: 'Child' },
      },
    });

    assert.equal(canRunOptimisticPveTurn(npcCursorState, 'attack'), true);
    const result = buildOptimisticCombatTurn({
      state: npcCursorState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_npc_cursor',
    });

    assert.equal(result.localTranscript.actionSegments[0].actor.side, 'ally');
    assert.equal(result.envelope.payload.predictionMode, 'shared-pve-turn-v1');
  });

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

  it('predicts final-hit KO visuals for deterministic PvE attacks', () => {
    const koState = state({
      combat: {
        enemies: [
          createCombatant({ id: 'mizu', hp: 1, maxHp: 30 }),
          createCombatant({ id: 'kusa', hp: 100, maxHp: 100 }),
        ],
      },
    });
    const cursorKoState = state({
      combat: {
        isBoss: true,
        actionCursor: { side: 'ally', index: 0, opening: false },
        enemies: [createCombatant({ id: 'mizu', hp: 1, maxHp: 30 })],
      },
    });

    const multiEnemyResult = buildOptimisticCombatTurn({
      state: koState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_ko',
    });
    const cursorResult = buildOptimisticCombatTurn({
      state: cursorKoState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_cursor_ko',
    });

    assert.ok(multiEnemyResult);
    assert.equal(multiEnemyResult.localTranscript.playerAttacks[0].targetDefeated, true);
    assert.equal(multiEnemyResult.localTranscript.allEnemiesDefeated, false);
    assert.ok(cursorResult);
    assert.equal(cursorResult.localTranscript.actionSegments[0].attacks[0].targetDefeated, true);
  });

  it('builds terminal final-hit prediction as a pending local shell while posting only the transcript hash', () => {
    const terminalState = state({
      combat: {
        isBoss: true,
        enemies: [createCombatant({ id: 'mizu', hp: 1, maxHp: 30 })],
      },
    });

    const result = buildOptimisticCombatTurn({
      state: terminalState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_terminal',
    });

    assert.ok(result);
    assert.equal(typeof result.envelope.predictedHash, 'string');
    assert.equal('predictedTranscript' in result.envelope, false);
    assert.equal(result.localTranscript.pendingCombatEnd.victory, true);
    assert.equal(result.localTranscript.pendingCombatEnd.defeat, false);
    assert.equal(result.localTranscript.combatEnded, false);
    assert.equal(result.localTranscript.allEnemiesDefeated, false);
    assert.equal(result.localTranscript.allAlliesDefeated, false);
    assert.equal('xpEvents' in result.localTranscript, false);
    assert.equal('reward' in result.localTranscript, false);
    assert.equal('rewards' in result.localTranscript, false);
    assert.equal('postCombatShop' in result.localTranscript, false);
    assert.equal('pendingMoveLearn' in result.localTranscript, false);
    assert.equal('moveLearnPrompts' in result.localTranscript, false);
    assert.equal('newCollectionAdditions' in result.localTranscript, false);
    assert.equal('tutorialRewards' in result.localTranscript, false);
    assert.equal('elementDropsCollected' in result.localTranscript, false);
    assert.equal(result.localTranscript.playerAttacks[0].targetDefeated, true);
  });

  it('refuses befriend-eligible terminal final-hit prediction', () => {
    const terminalState = state({
      combat: {
        isBoss: false,
        enemies: [createCombatant({ id: 'mizu', hp: 1, maxHp: 30 })],
      },
      run: {
        creatureParty: { active: [createCombatant()], reserves: [] },
      },
    });

    assert.equal(buildOptimisticCombatTurn({
      state: terminalState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_befriend_terminal',
    }), null);
  });

  it('strips server-owned feedback fields from visual-safe local transcripts', () => {
    const ally = createCombatant({ hp: 8 });
    const enemy = createCombatant({ id: 'mizu', hp: 0, maxHp: 30 });
    const predictedTranscript = {
      actionType: 'attack',
      playerAttacks: [{ targetDefeated: true }],
      actionSegments: [{
        attacks: [{ targetDefeated: true }],
        xpEvents: [{ enemyId: 'mizu' }],
      }],
      combatEnded: true,
      victory: true,
      allEnemiesDefeated: true,
      allAlliesDefeated: false,
      xpEvents: [{ enemyId: 'mizu' }],
      newCollectionAdditions: [{ id: 'mizu' }],
      tutorialRewards: [{ id: 'first-win' }],
      elementDropsCollected: ['water'],
      reward: { credits: 10 },
      rewards: [{ credits: 10 }],
      postCombatShop: { active: true },
      pendingMoveLearn: { creatureId: 'hi' },
      moveLearnPrompts: [{ creatureId: 'hi' }],
    };

    const localTranscript = buildVisualSafePveLocalTranscript({
      predictedTranscript,
      nextCombat: { allies: [ally], enemies: [enemy] },
      run: { creatureParty: { active: [ally], reserves: [] } },
    });

    assert.equal(localTranscript.pendingCombatEnd.victory, true);
    assert.equal(localTranscript.pendingCombatEnd.defeat, false);
    assert.equal(localTranscript.combatEnded, false);
    assert.equal(localTranscript.allEnemiesDefeated, false);
    assert.equal(localTranscript.allAlliesDefeated, false);
    assert.equal('xpEvents' in localTranscript, false);
    assert.equal('xpEvents' in localTranscript.actionSegments[0], false);
    assert.equal('newCollectionAdditions' in localTranscript, false);
    assert.equal('tutorialRewards' in localTranscript, false);
    assert.equal('elementDropsCollected' in localTranscript, false);
    assert.equal('reward' in localTranscript, false);
    assert.equal('rewards' in localTranscript, false);
    assert.equal('postCombatShop' in localTranscript, false);
    assert.equal('pendingMoveLearn' in localTranscript, false);
    assert.equal('moveLearnPrompts' in localTranscript, false);
    assert.deepEqual(predictedTranscript.xpEvents, [{ enemyId: 'mizu' }]);
  });

  it('refuses optimistic prediction for unsafe PvE blockers', () => {
    const activeAlly = createCombatant({ id: 'hi', hp: 1, maxHp: 100 });
    const reserveAlly = createCombatant({ id: 'kaze', hp: 100, maxHp: 100 });
    const koSwapState = state({
      combat: {
        allies: [activeAlly],
        enemies: [createCombatant({ id: 'mizu', attack: 200 })],
      },
      run: {
        creatureParty: { active: [activeAlly], reserves: [reserveAlly] },
      },
    });

    assert.equal(buildOptimisticCombatTurn({
      state: koSwapState,
      actionType: 'defend',
      moveChoices: [],
      actionId: 'act_ko_swap',
    }), null);
  });

  it('refuses attack prediction when shared resolver exposes KO swaps', () => {
    const activeAlly = createCombatant({ id: 'hi', hp: 1, maxHp: 100 });
    const reserveAlly = createCombatant({ id: 'kaze', hp: 100, maxHp: 100 });
    const koSwapState = state({
      combat: {
        allies: [activeAlly],
        enemies: [createCombatant({
          id: 'mizu',
          attack: 200,
          moves: [{
            id: 'slam',
            name: '打つ',
            nameEn: 'Hit',
            reading: 'うつ',
            element: 'neutral',
            category: 'damage',
            target: 'single_enemy',
            power: 200,
            mpCost: 0,
            accuracy: 100,
          }],
        })],
      },
      run: {
        creatureParty: { active: [activeAlly], reserves: [reserveAlly] },
      },
    });

    assert.equal(buildOptimisticCombatTurn({
      state: koSwapState,
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      actionId: 'act_attack_ko_swap',
    }), null);
  });

  it('builds optimistic Kanji Kombat answer envelopes from the visible quiz', () => {
    const kkState = kanjiKombatState();

    assert.equal(canRunOptimisticKanjiKombatAnswer(kkState, 'answer-correct'), true);
    const result = buildOptimisticKanjiKombatAnswer({
      state: kkState,
      answerId: 'answer-correct',
      actionId: 'act_kanji',
    });

    assert.equal(result.localTranscript.actionType, 'kanjiKombat');
    assert.equal(result.localTranscript.kanjiAnswerCorrect, true);
    assert.equal(result.localTranscript.actionSegments[0].actor.side, 'ally');
    assert.equal(result.envelope.actionId, 'act_kanji');
    assert.equal(result.envelope.actionType, 'kanjiKombat.answer');
    assert.equal(result.envelope.combatId, 'cmb_test');
    assert.equal(result.envelope.stateVersion, 0);
    assert.equal(result.envelope.seed, 'turn-seed');
    assert.equal(result.envelope.payload.answerId, 'answer-correct');
    assert.equal(result.envelope.payload.correct, true);
    assert.equal(result.envelope.payload.predictionMode, 'shared-kanji-kombat-v1');
    assert.equal(typeof result.envelope.predictedHash, 'string');
  });

  it('includes buffered prompt metadata in Kanji Kombat answer envelopes', () => {
    const kkState = kanjiKombatState();
    const result = buildOptimisticKanjiKombatAnswer({
      state: kkState,
      answerId: 'answer-correct',
      actionId: 'act_kanji_prompt',
      promptRef: { promptId: 'kkp_quiz', sequence: 4, cardId: 'hiragana:あ' },
    });

    assert.equal(result.envelope.payload.promptId, 'kkp_quiz');
    assert.equal(result.envelope.payload.promptSequence, 4);
    assert.equal(result.envelope.payload.cardId, 'hiragana:あ');
    assert.deepEqual(result.envelope.payload.promptRef, {
      promptId: 'kkp_quiz',
      sequence: 4,
      cardId: 'hiragana:あ',
    });
  });

  it('refuses optimistic Kanji Kombat answers when visible quiz choices omit correctness', () => {
    const kkState = kanjiKombatState({
      run: {
        kanjiKombat: {
          currentQuiz: {
            cardId: 'hiragana:あ',
            choices: [
              { id: 'answer-correct', answer: 'a' },
              { id: 'answer-wrong', answer: 'i' },
            ],
          },
        },
      },
    });

    assert.equal(canRunOptimisticKanjiKombatAnswer(kkState, 'answer-correct'), false);
    assert.equal(buildOptimisticKanjiKombatAnswer({
      state: kkState,
      answerId: 'answer-correct',
      actionId: 'act_unknown_kanji',
    }), null);
  });
});
