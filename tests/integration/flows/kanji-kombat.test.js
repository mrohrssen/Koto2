import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureSrs, clearSrsCache } from '../../../src/game/internal-srs.js';

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

    const quiz = gm.run.kanjiKombat.currentQuiz;
    const correct = quiz.choices.find(choice => choice.correct);
    const result = gm.submitKanjiKombatAnswer(correct.id);

    assert.equal(result.actionType, 'kanjiKombat');
    assert.equal(Array.isArray(result.actionSegments), true);
    assert.equal(Array.isArray(result.enemies), true);
    if (result.nextWave) {
      assert.equal(Array.isArray(result.nextWaveEnemies), true);
    }
    assert.equal(gm.run.currentAreaEncounters, 0);
    assert.equal(gm.run.areasCompleted, 0);
    assert.equal(gm.run.postCombatShop == null, true);
  });
});
