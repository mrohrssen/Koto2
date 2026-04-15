import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { restoreBefriendQuizEnemyUi } from '../../../public/js/ui/befriend-quiz-state.js';

describe('restoreBefriendQuizEnemyUi', () => {
  it('restores the targeted enemy after Cid overlay hides the formation', () => {
    const calls = [];
    const target = { id: 'tori', hp: 8, befriended: false };

    const restored = restoreBefriendQuizEnemyUi({
      quizData: { targetIndex: 1 },
      result: { enemies: [{ id: 'neko', hp: 0 }, target] },
      hideEnemy: () => calls.push(['hideEnemy']),
      showFormation: (side, creatures) => calls.push([side, creatures]),
    });

    assert.equal(restored, target);
    assert.deepEqual(calls, [
      ['hideEnemy'],
      ['enemy', [target]],
    ]);
  });

  it('falls back to the first living enemy when targetIndex is missing', () => {
    const calls = [];
    const target = { id: 'tori', hp: 8, befriended: false };

    const restored = restoreBefriendQuizEnemyUi({
      quizData: {},
      result: { enemies: [{ id: 'neko', hp: 0 }, target] },
      hideEnemy: () => calls.push(['hideEnemy']),
      showFormation: (side, creatures) => calls.push([side, creatures]),
    });

    assert.equal(restored, target);
    assert.deepEqual(calls, [
      ['hideEnemy'],
      ['enemy', [target]],
    ]);
  });

  it('does not try to render when no living enemy remains', () => {
    const calls = [];

    const restored = restoreBefriendQuizEnemyUi({
      quizData: { targetIndex: 0 },
      result: { enemies: [{ id: 'neko', hp: 0, befriended: false }] },
      hideEnemy: () => calls.push(['hideEnemy']),
      showFormation: (side, creatures) => calls.push([side, creatures]),
    });

    assert.equal(restored, null);
    assert.deepEqual(calls, [['hideEnemy']]);
  });
});
