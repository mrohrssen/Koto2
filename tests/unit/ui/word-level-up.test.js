import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const wordLevelUp = await import('../../../public/js/ui/word-level-up.js');

describe('battle reward anchor selection', () => {
  it('centers battle rewards on the battle stage instead of the enemy formation', () => {
    const battleStage = { id: 'battle-stage' };
    const enemyFormation = { id: 'enemy-formation' };
    const fakeDocument = {
      body: { id: 'body' },
      querySelector: (selector) => selector === '.battle-stage' ? battleStage : null,
      getElementById: (id) => id === 'enemy-formation' ? enemyFormation : null
    };

    assert.equal(typeof wordLevelUp.getBattleRewardAnchor, 'function');
    assert.equal(wordLevelUp.getBattleRewardAnchor(fakeDocument), battleStage);
  });

  it('falls back to the scene area before the enemy formation', () => {
    const sceneArea = { id: 'scene-area' };
    const enemyFormation = { id: 'enemy-formation' };
    const fakeDocument = {
      body: { id: 'body' },
      querySelector: () => null,
      getElementById: (id) => {
        if (id === 'scene-area') return sceneArea;
        if (id === 'enemy-formation') return enemyFormation;
        return null;
      }
    };

    assert.equal(wordLevelUp.getBattleRewardAnchor(fakeDocument), sceneArea);
  });
});

describe('ingredient drop reward message', () => {
  it('uses the decorated English ingredient name', () => {
    const drop = { ingredient: { word: '海老', reading: 'えび', nameEn: 'Shrimp' } };

    assert.equal(wordLevelUp.getIngredientDropMessage(drop, false), 'Found Shrimp!');
    assert.equal(wordLevelUp.getIngredientDropMessage(drop, true), 'Found Shrimp!');
  });

  it('does not fall back to Japanese labels when nameEn is missing', () => {
    const drop = { ingredient: { word: '海老', reading: 'えび' } };

    assert.equal(wordLevelUp.getIngredientDropMessage(drop, false), '');
    assert.equal(wordLevelUp.getIngredientDropMessage(drop, true), '');
  });
});

describe('ingredient drop popup scheduling', () => {
  it('uses explicit per-drop delays when provided', () => {
    const originalSetTimeout = globalThis.setTimeout;
    const calls = [];
    globalThis.setTimeout = (callback, delayMs) => {
      calls.push(delayMs);
      return 1;
    };

    try {
      wordLevelUp.showIngredientDropPopups([
        { ingredient: { nameEn: 'Water' } },
        { ingredient: { nameEn: 'Miso' } },
      ], { delaysMs: [900, 1800] });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }

    assert.deepEqual(calls, [900, 1800]);
  });
});
