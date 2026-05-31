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

    if (gm.run.kanjiKombat.pendingIntro?.card) {
      gm.submitKanjiKombatIntro(gm.run.kanjiKombat.pendingIntro.card.id, 'known');
    }
    const quiz = gm.run.kanjiKombat.currentQuiz;
    assert.ok(quiz, 'Kanji Kombat should have a quiz to answer after intro resolution');
    const correct = quiz.choices.find(choice => choice.correct);
    const result = gm.submitKanjiKombatAnswer(correct.id);

    assert.equal(result.actionType, 'kanjiKombat');
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
