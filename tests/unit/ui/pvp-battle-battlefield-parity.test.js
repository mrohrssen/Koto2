import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/pvp-socket.js', {
  namedExports: { on: () => {}, off: () => {}, emit: () => {} },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} },
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: { showMoves: () => {}, setActiveLabel: () => {} },
});
await mock.module('../../../public/js/ui/target-select.js', {
  namedExports: { init: () => {}, showEnemies: () => {}, showAllies: () => {} },
});
await mock.module('../../../public/js/ui/combat-loop.js', {
  namedExports: { showAttackDisplay: () => {} },
});
await mock.module('../../../public/js/ui/combat-ui-utils.js', {
  namedExports: { getHpColor: () => 'green' },
});
class FakeBattleScene {}
await mock.module('../../../public/js/scenes/battle-scene.js', {
  namedExports: { BattleScene: FakeBattleScene },
});
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: {
    getSceneManager: () => ({
      currentScene: null,
      transition: async () => {},
    }),
  },
});

const { init, startPvpBattle } = await import('../../../public/js/ui/pvp-battle.js');

describe('PvP battlefield layout parity', () => {
  it('renders PvP formations through the shared showFormation path', () => {
    const calls = [];
    init({
      getGameState: () => ({}),
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        setBackground: () => {},
        showFormation: (side, creatures, opts) => calls.push({ side, creatures, opts }),
      },
      onPvpBattleStart: () => {},
    });

    startPvpBattle({
      yourTeam: [{ id: 'a', hp: 10 }, { id: 'b', hp: 10 }, { id: 'c', hp: 10 }],
      opponentTeam: [{ id: 'x', hp: 10 }, { id: 'y', hp: 10 }, { id: 'z', hp: 10 }],
      opponentName: 'Rival',
      mySide: 'sideA',
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].side, 'player');
    assert.equal(calls[1].side, 'enemy');
    assert.equal(calls[0].creatures.length, 3);
    assert.equal(calls[1].creatures.length, 3);
  });
});
