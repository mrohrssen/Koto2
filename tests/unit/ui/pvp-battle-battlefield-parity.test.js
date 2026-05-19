import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const socketHandlers = {};
const moveSelections = [];

await mock.module('../../../public/js/pvp-socket.js', {
  namedExports: {
    on: (event, handler) => { socketHandlers[event] = handler; },
    off: (event) => { delete socketHandlers[event]; },
    emit: () => {},
    submitAction: () => {},
  },
});
await mock.module('../../../public/js/audio.js', {
  namedExports: { playSFX: () => {} },
});
await mock.module('../../../public/js/ui/move-select.js', {
  namedExports: {
    showMoves: (creature, creatureIndex, options) => {
      moveSelections.push({ creature, creatureIndex, options });
    },
    setActiveLabel: () => {}
  },
});
await mock.module('../../../public/js/ui/html-utils.js', {
  namedExports: { escapeHtml: (value) => String(value) },
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
  beforeEach(() => {
    for (const event of Object.keys(socketHandlers)) delete socketHandlers[event];
    moveSelections.length = 0;
  });

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

  it('keeps opening move selection active when the opponent submits first', () => {
    const contentRenders = [];
    init({
      getGameState: () => ({}),
      updateUI: () => {},
      actions: { setContent: (html) => contentRenders.push(html) },
      scene: {
        setBackground: () => {},
        showFormation: () => {},
      },
      onPvpBattleStart: () => {},
    });

    startPvpBattle({
      yourTeam: [{ id: 'a', hp: 10, dex: 5, moves: [] }],
      opponentTeam: [{ id: 'x', hp: 10, dex: 5, moves: [] }],
      opponentName: 'Rival',
      mySide: 'sideB',
      openingResolved: false,
    });

    assert.equal(moveSelections.length, 1, 'opening move picker should be shown');

    socketHandlers['pvp:opening-action-submitted']?.();

    assert.equal(
      contentRenders.length,
      0,
      'opponent opening submission must not replace the local move picker with a waiting screen'
    );
    assert.equal(moveSelections.length, 1, 'move picker remains the active UI');
  });
});
