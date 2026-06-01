import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureSrs, clearSrsCache, loadSrsData, saveSrsData } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded, SCRIPT_DECK } from '../../../src/game/script-srs.js';

describe('Kanji Kombat integration flow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-integration-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('kk-integration-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('starts, answers a quiz, and keeps normal room state untouched', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const gm = new GameManager();
    gm.userId = 'kk-integration-user';
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    assert.equal(gm.run.mode, 'kanjiKombat');
    assert.equal(gm.combat.mode, 'kanjiKombat');

    for (let guard = 0; guard < 6 && gm.run.kanjiKombat.pendingIntro?.card; guard++) {
      gm.submitKanjiKombatIntro(gm.run.kanjiKombat.pendingIntro.card.id, 'known');
    }
    const quiz = gm.run.kanjiKombat.currentQuiz;
    assert.ok(quiz, 'Kanji Kombat should have a quiz to answer after intro resolution');
    const correct = quiz.choices.find(choice => choice.correct);
    const result = gm.submitKanjiKombatAnswer(correct.id);

    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(result.kanjiAnswerCorrect, true);
    assert.equal(Array.isArray(result.actionSegments), true);
    assert.equal(Array.isArray(result.enemies), true);
    if (result.nextWave) {
      assert.equal(Array.isArray(result.nextWaveEnemies), true);
    }
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.areasCompleted, 0);
    assert.equal(gm.run.postCombatShop == null, true);
    if (!result.combatEnded) {
      assert.ok(
        gm.run.kanjiKombat.currentQuiz || gm.run.kanjiKombat.pendingIntro,
        'continuing Kanji Kombat combat should queue the next script prompt'
      );
    }
  });

  it('records no-due discoveries in the user script deck and queues them for practice', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    const introCard = gm.run.kanjiKombat.pendingIntro?.card;
    assert.ok(introCard, 'fresh no-due run should introduce a script card');
    const before = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === introCard.id);
    assert.ok(before, 'introduced card exists in the persisted script deck');
    assert.equal(before.reps || 0, 0);

    gm.submitKanjiKombatIntro(introCard.id, 'known');

    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === introCard.id);
    assert.equal(after.reps, 1);
    assert.ok(after.last_review instanceof Date);
    assert.equal(gm.run.kanjiKombat.noDuePracticeQueue.includes(introCard.id), true);
  });

  it('records correct quiz answers as good FSRS reviews', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map((card, index) => ({
      ...card,
      reps: 1,
      due: index === 0 ? new Date('2000-01-01') : new Date('2100-01-01'),
    }));
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    const quiz = gm.run.kanjiKombat.currentQuiz;
    assert.ok(quiz, 'precondition: due script card should produce a quiz');
    const before = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === quiz.cardId);
    const correct = quiz.choices.find(choice => choice.correct);

    gm.submitKanjiKombatAnswer(correct.id);

    const after = loadSrsData(userId)[SCRIPT_DECK].cards.find(card => card.id === quiz.cardId);
    assert.equal(after.reps, before.reps + 1);
    assert.equal(after.lapses || 0, before.lapses || 0);
    assert.ok(after.last_review instanceof Date);
  });

  it('hydrates saved pending intro cards before exposing state to the UI', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    const cards = ensureScriptDeckSeeded(userId);
    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    gm.run.kanjiKombat.currentQuiz = null;
    gm.run.kanjiKombat.pendingIntro = { cardId: cards[0].id };

    const state = gm.getState();

    assert.equal(state.run.kanjiKombat.pendingIntro.card.id, cards[0].id);
    assert.equal(state.run.kanjiKombat.pendingIntro.card.answer, cards[0].answer);
  });

  it('ends cleanly when the script queue is exhausted mid-wave', async () => {
    const { GameManager } = await import('../../../src/game/loop.js');
    const userId = 'kk-integration-user';
    ensureScriptDeckSeeded(userId);
    const data = loadSrsData(userId);
    data[SCRIPT_DECK].cards = data[SCRIPT_DECK].cards.map((card, index) => ({
      ...card,
      reps: 1,
      due: index === 0 ? new Date('2000-01-01') : new Date('2100-01-01'),
    }));
    saveSrsData(userId, data);

    const gm = new GameManager();
    gm.userId = userId;
    gm.player = { name: 'Tester', hp: 100, maxHp: 100, credits: 0 };
    gm.meta = {
      levels: { highestUnlocked: 1 },
      creatureCollection: ['hi'],
      creatureCounts: { hi: 1 },
      bossesDefeated: [],
      lifetimeStats: {},
    };

    gm.kanjiKombatService.startRunWithCreatureId('hi');
    gm.combat.enemies.forEach(enemy => {
      enemy.hp = 999;
      enemy.maxHp = 999;
    });

    const quiz = gm.run.kanjiKombat.currentQuiz;
    assert.ok(quiz, 'precondition: one due quiz should be available');
    const correct = quiz.choices.find(choice => choice.correct);
    const result = gm.submitKanjiKombatAnswer(correct.id);

    assert.equal(result.combatEnded, true);
    assert.equal(result.victory, true);
    assert.equal(gm.run.active, false);
    assert.equal(gm.combat.active, false);
    assert.equal(gm.run.kanjiKombat.report.completedDaily, true);
  });
});
