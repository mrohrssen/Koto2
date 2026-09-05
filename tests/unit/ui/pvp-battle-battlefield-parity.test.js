import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isCombatAutoEnabled, setCombatAutoEnabled, setPvpCombatAutoContext } from '../../../public/js/ui/combat-auto-mode.js';

const socketHandlers = {};
const moveSelections = [];
let attackDisplayImpl = () => {};
let effectEventsImpl = async () => {};

await mock.module('../../../public/js/pvp-socket.js', {
  namedExports: {
    on: (event, handler) => { socketHandlers[event] = handler; },
    off: (event) => { delete socketHandlers[event]; },
    emit: () => {},
    submitAction: () => {},
    leaveMatch: () => {},
    disconnect: () => {},
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
  namedExports: { showAttackDisplay: (...args) => attackDisplayImpl(...args) },
});
await mock.module('../../../public/js/ui/combat-vfx.js', {
  namedExports: { showEffectEvents: (...args) => effectEventsImpl(...args) },
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
    setPvpCombatAutoContext(false);
    setCombatAutoEnabled(false);
    attackDisplayImpl = () => {};
    effectEventsImpl = async () => {};
    globalThis.document = {
      getElementById: () => null,
      querySelector: () => null,
    };
    globalThis.performance = { now: () => 0 };
    globalThis.requestAnimationFrame = () => {};
  });

  it('makes Auto available for a match and clears it after results and return', () => {
    const clickHandlers = {};
    const state = { phase: 'pvp_lobby' };
    globalThis.document.getElementById = (id) => ({
      addEventListener: (event, handler) => { clickHandlers[id] = handler; },
    });
    init({
      getGameState: () => state,
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: { showFormation: () => {} },
    });
    setCombatAutoEnabled(true);
    const match = { yourTeam: [{ hp: 10 }], opponentTeam: [{ hp: 10 }], opponentName: 'Rival' };
    startPvpBattle(match);
    assert.equal(isCombatAutoEnabled(), true);
    socketHandlers['pvp:match-end']({ winnerId: 'rival', winnerName: 'Rival' });
    assert.equal(isCombatAutoEnabled(), false);
    clickHandlers['pvp-result-hub-btn']();
    assert.equal(state.phase, 'hub');
    assert.equal(isCombatAutoEnabled(), false);
    startPvpBattle(match);
    assert.equal(isCombatAutoEnabled(), true, 'the next match restores the session preference');
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

  it('waits for terminal action playback before rendering match end', async () => {
    const contentRenders = [];
    setCombatAutoEnabled(true);
    let finishAttackDisplay;
    attackDisplayImpl = () => new Promise(resolve => { finishAttackDisplay = resolve; });

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
      yourTeam: [{ id: 'a', hp: 10, maxHp: 10, dex: 5, moves: [] }],
      opponentTeam: [{ id: 'x', hp: 10, maxHp: 10, dex: 5, moves: [] }],
      opponentName: 'RankedBot',
      mySide: 'sideA',
      openingResolved: true,
      actionCursor: { side: 'sideB', index: 0 },
    });

    socketHandlers['pvp:action-result']?.({
      actionSegments: [{
        actor: { side: 'sideB', index: 0 },
        attacks: [{ side: 'sideB', attackerIndex: 0, targetIndex: 0, damage: 10 }],
      }],
      allies: [{ id: 'a', hp: 0, maxHp: 10, dex: 5, moves: [] }],
      enemies: [{ id: 'x', hp: 10, maxHp: 10, dex: 5, moves: [] }],
      winner: 'sideB',
      actionCursor: null,
      openingResolved: true,
    });

    socketHandlers['pvp:match-end']?.({
      winnerId: 'bot-user',
      winnerName: 'RankedBot',
      rankedResult: {
        rating: 1190,
        lastMatch: { ratingBefore: 1200, ratingAfter: 1190 },
      },
    });

    assert.equal(
      contentRenders.some(html => html.includes('Defeat')),
      false,
      'terminal result must not render while action playback can still repaint combat UI'
    );

    assert.equal(isCombatAutoEnabled(), true, 'Auto remains usable until the last attack finishes');
    finishAttackDisplay();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(isCombatAutoEnabled(), false, 'Auto hides when the final result renders');
    assert.equal(
      contentRenders.some(html => html.includes('Defeat')),
      true,
      'terminal result should render after action playback settles'
    );
  });

  it('serializes rapid PvP action results from bot follow-up turns', async () => {
    const displayOrder = [];
    let finishOpeningDisplay;
    attackDisplayImpl = (atk) => {
      displayOrder.push(atk.moveId);
      if (atk.moveId === 'opening-hit') {
        return new Promise(resolve => { finishOpeningDisplay = resolve; });
      }
      return Promise.resolve();
    };

    init({
      getGameState: () => ({}),
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        setBackground: () => {},
        showFormation: () => {},
      },
      onPvpBattleStart: () => {},
    });

    startPvpBattle({
      yourTeam: [{ id: 'a', hp: 10, maxHp: 10, dex: 5, moves: [] }],
      opponentTeam: [{ id: 'x', hp: 10, maxHp: 10, dex: 8, moves: [] }],
      opponentName: 'RankedBot',
      mySide: 'sideA',
      openingResolved: false,
    });

    socketHandlers['pvp:action-result']?.({
      actionSegments: [{
        actor: { side: 'sideB', index: 0 },
        attacks: [{ side: 'sideB', attackerIndex: 0, targetIndex: 0, damage: 1, moveId: 'opening-hit' }],
      }],
      allies: [{ id: 'a', hp: 9, maxHp: 10, dex: 5, moves: [] }],
      enemies: [{ id: 'x', hp: 10, maxHp: 10, dex: 8, moves: [] }],
      winner: null,
      actionCursor: { side: 'sideB', index: 0 },
      openingResolved: true,
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    socketHandlers['pvp:action-result']?.({
      actionSegments: [{
        actor: { side: 'sideB', index: 0 },
        attacks: [{ side: 'sideB', attackerIndex: 0, targetIndex: 0, damage: 1, moveId: 'bot-follow-up' }],
      }],
      allies: [{ id: 'a', hp: 8, maxHp: 10, dex: 5, moves: [] }],
      enemies: [{ id: 'x', hp: 10, maxHp: 10, dex: 8, moves: [] }],
      winner: null,
      actionCursor: { side: 'sideA', index: 0 },
      openingResolved: true,
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(
      displayOrder,
      ['opening-hit'],
      'bot follow-up playback must wait until the opening playback finishes'
    );

    finishOpeningDisplay();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(displayOrder, ['opening-hit', 'bot-follow-up']);
  });

  it('renders action segment effect events without sending them to attack display', async () => {
    const displayOrder = [];
    const effectOrder = [];
    const playbackOrder = [];
    attackDisplayImpl = (atk) => {
      const label = atk.type || atk.moveId || atk.category;
      displayOrder.push(label);
      playbackOrder.push(label);
      return Promise.resolve();
    };
    effectEventsImpl = (result) => {
      for (const event of result.effectEvents || []) {
        effectOrder.push(event.type);
        playbackOrder.push(event.type);
      }
      return Promise.resolve();
    };

    init({
      getGameState: () => ({}),
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        setBackground: () => {},
        showFormation: () => {},
      },
      onPvpBattleStart: () => {},
    });

    startPvpBattle({
      yourTeam: [
        { id: 'a', hp: 20, maxHp: 20, dex: 5, moves: [] },
        { id: 'a-ally', hp: 20, maxHp: 20, dex: 1, moves: [] }
      ],
      opponentTeam: [{ id: 'b', hp: 30, maxHp: 30, dex: 5, moves: [] }],
      opponentName: 'RankedBot',
      mySide: 'sideA',
      openingResolved: true,
      actionCursor: { side: 'sideB', index: 0 },
    });

    await socketHandlers['pvp:action-result']?.({
      actionSegments: [{
        actor: { side: 'sideA', index: 0 },
        attacks: [{
          side: 'sideA',
          attackerIndex: 0,
          targetIndex: 0,
          damage: 5,
          moveId: 'slash',
          playbackIndex: 0
        }],
        effectEvents: [{
          type: 'debuffMasterSelfSabotage',
          side: 'sideA',
          targetSide: 'sideA',
          targetIndex: 1,
          stat: 'atk',
          change: -1,
          playbackIndex: 1
        }],
        counterAttacks: [{
          type: 'counter',
          side: 'sideB',
          attackerIndex: 0,
          targetIndex: 0,
          damage: 20,
          playbackIndex: 2
        }],
      }],
      allies: [
        { id: 'a', hp: 0, maxHp: 20, dex: 5, moves: [] },
        { id: 'a-ally', hp: 20, maxHp: 20, dex: 1, moves: [] }
      ],
      enemies: [{ id: 'b', hp: 25, maxHp: 30, dex: 5, moves: [] }],
      winner: null,
      actionCursor: { side: 'sideA', index: 1 },
      openingResolved: true,
    });

    assert.deepEqual(displayOrder, ['slash', 'counter']);
    assert.deepEqual(effectOrder, ['debuffMasterSelfSabotage']);
    assert.deepEqual(playbackOrder, ['slash', 'debuffMasterSelfSabotage', 'counter']);
  });
});
