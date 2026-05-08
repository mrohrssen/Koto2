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
  it('uses hiragana readings outside kanji mode', () => {
    const drop = { ingredient: { word: '海老', reading: 'えび' } };

    assert.equal(wordLevelUp.getIngredientDropMessage(drop, false), 'Obtained えび');
  });

  it('uses the kanji word in kanji mode', () => {
    const drop = { ingredient: { word: '海老', reading: 'えび' } };

    assert.equal(wordLevelUp.getIngredientDropMessage(drop, true), 'Obtained 海老');
  });
});
