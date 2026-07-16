import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { __intentLog: null };
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    querySelector: () => null,
  }),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, vibrate: () => false },
  configurable: true,
});
globalThis.requestAnimationFrame = callback => setImmediate(() => callback(Date.now()));
globalThis.cancelAnimationFrame = id => clearImmediate(id);

const combatLoop = await import('../../../public/js/ui/combat-loop.js');
const {
  configureExploreSession,
  createExploreSession,
  resetExploreSession,
} = await import('../../../public/js/ui/explore-session.js');
const { setSceneManager } = await import('../../../public/js/scenes/scene-manager.js');
setSceneManager({ currentScene: null, transitioning: false });

function preparedRoom(index, combatId) {
  return {
    index,
    roomId: `room-${index}`,
    actionSeq: index + 1,
    room: { id: `room-${index}`, type: 'encounter' },
    acceptedActions: ['combat.cycle'],
    actionEffects: { 'combat.cycle': ['partyStats'] },
    dependencies: ['partyStats'],
    offlineReady: true,
    interactionPayload: { combatId },
  };
}

function runway(index, combatId) {
  return {
    sessionEpoch: 'ese_playback111111',
    currentRoom: index,
    roomActionSeq: index + 1,
    preparedRooms: [preparedRoom(index, combatId)],
  };
}

function combatState(combatId, roomIndex, enemyHp = 100) {
  const ally = {
    id: 'hi', uid: 'ally-hi', name: '火', nameEn: 'Fire', reading: 'ひ', element: 'fire',
    level: 3, attack: 10, defense: 5, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    moves: [{
      id: 'honoo', name: '炎', nameEn: 'Flame', reading: 'ほのお', element: 'fire',
      category: 'damage', target: 'single_enemy', power: 30, mpCost: 0,
    }],
  };
  const enemy = {
    id: 'enemy', uid: 'enemy-1', name: '敵', nameEn: 'Enemy', reading: 'てき', element: 'water',
    level: 3, attack: 8, defense: 5, hp: enemyHp, maxHp: 100, mp: 10, maxMp: 10,
    moves: [{
      id: 'tap', name: '触る', nameEn: 'Tap', reading: 'さわる', element: 'neutral',
      category: 'damage', target: 'single_enemy', power: 0, mpCost: 0,
    }],
  };
  return {
    phase: 'combat',
    room: { id: `room-${roomIndex}`, type: 'encounter' },
    run: {
      active: true,
      mode: 'standard',
      currentRoom: roomIndex,
      rooms: [{ id: `room-${roomIndex}`, type: 'encounter' }],
      exploreRunway: runway(roomIndex, combatId),
      partySkills: [],
      itemBuffs: { xpMultiplier: 1, xpBalanceStacks: 0 },
      crestMults: {},
      creatureParty: {
        active: [ally],
        reserves: [],
      },
    },
    combat: {
      active: true,
      isCreatureCombat: true,
      allies: [ally],
      enemies: [enemy],
      actionCursor: { side: 'ally', index: 0, opening: false },
      actionCount: 0,
      optimistic: {
        combatId,
        stateVersion: 0,
        nextTurnSeed: 'seed-a',
        turnSeeds: ['seed-a', 'seed-b', 'seed-c'],
      },
    },
  };
}

function initCombatHarness(initialState) {
  let state = initialState;
  const hpUpdateOwners = [];
  const stateUpdateOwners = [];
  combatLoop.init({
    getGameState: () => state,
    updateGameState: next => {
      state = next;
      stateUpdateOwners.push(next?.combat?.optimistic?.combatId ?? null);
    },
    updateUI: () => {},
    settings: { getApiKeys: () => ({}) },
    narration: {},
    characterUI: {
      updateEnemyHPAtIndex: () => {
        hpUpdateOwners.push(state.combat?.optimistic?.combatId ?? null);
      },
      updateEnemyHPBar: () => {
        hpUpdateOwners.push(state.combat?.optimistic?.combatId ?? null);
      },
      updateCreatureHPBars: () => {},
    },
    getEnemyDialogueActive: () => false,
    delay: () => Promise.resolve(),
    setCombatAnimationActive: () => {},
  });
  combatLoop.__combatNetworkTest.setStateAccessors({
    get: () => state,
    update: next => { state = next; },
  });
  return {
    get state() { return state; },
    replaceState(next) { state = next; },
    hpUpdateOwners,
    stateUpdateOwners,
  };
}

function installBlockingAttackCard() {
  const originalGetElementById = document.getElementById;
  const classNames = new Set();
  const listeners = new Set();
  const continueLabel = { textContent: '' };
  const rows = Array.from({ length: 3 }, () => ({ classList: { add() {} } }));
  const card = {
    isConnected: true,
    classList: {
      add: (...names) => names.forEach(name => classNames.add(name)),
      contains: name => classNames.has(name),
    },
    closest: selector => selector === '#action-area' ? actionArea : null,
    contains: target => target === card || target === continueLabel,
    querySelector: selector => selector === '.sac-continue' ? continueLabel : null,
    querySelectorAll: selector => selector === '.sac-row' ? rows : [],
  };
  const actionArea = {
    innerHTML: '',
    firstElementChild: card,
    querySelector: selector => selector === '.split-attack-card' ? card : null,
    addEventListener: (type, listener) => {
      if (type === 'click') listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'click') listeners.delete(listener);
    },
  };
  document.getElementById = id => (
    id === 'action-area' ? actionArea : originalGetElementById(id)
  );
  return {
    card,
    restore() {
      card.isConnected = false;
      document.getElementById = originalGetElementById;
    },
  };
}

test('response adoption does not self-deadlock inside non-playback animation work', async () => {
  const session = createExploreSession({
    syncRequest: async () => ({ status: 'ok', confirmedThroughSeq: 1, results: [] }),
    beforeResponseAdoption: () => combatLoop.waitForExploreCombatPlaybackIdle(),
  });
  session.adoptRunway(runway(0, 'combat-a'));
  assert.equal(session.recordRoomAction('combat.cycle', { actionType: 'attack' }).accepted, true);

  await combatLoop.__combatNetworkTest.withAnimationActive(async () => {
    await session.syncNow();
  });

  assert.equal(session.pendingCount(), 0);
});

test('real player playback keeps checkpoint adoption on combat A until its internal impact await ends', async () => {
  resetExploreSession();
  const combatA = combatState('combat-a', 0, 100);
  const combatB = combatState('combat-b', 1, 100);
  const harness = initCombatHarness(combatA);
  let releaseImpact;
  let markImpactStarted;
  const impactStarted = new Promise(resolve => { markImpactStarted = resolve; });
  const impactGate = new Promise(resolve => { releaseImpact = resolve; });
  const session = configureExploreSession({
    syncRequest: async () => ({
      status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: combatB,
      exploreRunway: runway(1, 'combat-b'),
    }),
    beforeResponseAdoption: () => combatLoop.waitForExploreCombatPlaybackIdle(),
    onCheckpoint: response => harness.replaceState(response.state),
  });
  session.adoptRunway(runway(0, 'combat-a'));
  combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => ({
    status: 'accepted',
    stateVersion: 1,
    nextSeed: 'seed-b',
  }));
  combatLoop.__combatNetworkTest.setCombatActive(true);

  const playback = combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
    actionType: 'attack',
    moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
    turnTiming: {
      actionType: 'attack',
      startedAt: 0,
      animationStartedAt: null,
      requestMs: null,
      logged: false,
    },
    playback: async () => combatLoop.__combatNetworkTest.playOnePlayerAttackInMoveTurn(
      {
        enemies: combatA.combat.enemies,
        allies: combatA.combat.allies,
        creatureParty: combatA.run.creatureParty,
      },
      {
        attackerId: 'hi',
        targetId: 'enemy',
        targetIndex: 0,
        moveElement: 'fire',
        category: 'damage',
        damage: 10,
      },
      { 0: { index: 0, hp: 100, maxHp: 100 } },
      new Set(),
      [],
      {
        skipAttackCards: true,
        fireAttackEffect: async (...args) => {
          const impact = args.at(-1);
          markImpactStarted();
          await impactGate;
          impact();
        },
      },
    ),
    startMoveSelection: () => {},
    stopCombatLoop: () => {},
  });
  await impactStarted;
  const drain = session.syncNow();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.state, combatA, 'combat B must not be adopted during combat A impact playback');
  assert.equal(session.currentPreparedRoom().index, 0);

  releaseImpact();
  await playback;
  await drain;

  assert.deepEqual(harness.hpUpdateOwners, ['combat-a']);
  assert.equal(harness.state, combatB);
  assert.equal(harness.state.combat.enemies[0].hp, 100, 'combat A impact must not mutate combat B');
  assert.equal(session.currentPreparedRoom().index, 1);
  resetExploreSession();
});

test('cleanup settles a real blocked attack card and stale playback cannot mutate the replacement combat', async () => {
  resetExploreSession();
  const combatA = combatState('combat-a', 0, 100);
  const combatB = combatState('combat-b', 1, 100);
  const harness = initCombatHarness(combatA);
  const blockingCard = installBlockingAttackCard();
  const session = configureExploreSession({
    syncRequest: async () => ({
      status: 'ok',
      confirmedThroughSeq: 1,
      results: [],
      state: combatB,
      exploreRunway: runway(1, 'combat-b'),
    }),
    beforeResponseAdoption: () => combatLoop.waitForExploreCombatPlaybackIdle(),
    onCheckpoint: response => harness.replaceState(response.state),
  });
  session.adoptRunway(runway(0, 'combat-a'));
  combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => ({
    status: 'accepted',
    stateVersion: 1,
    nextSeed: 'seed-b',
  }));
  combatLoop.__combatNetworkTest.setCombatActive(true);

  try {
    const playback = combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: {
        actionType: 'attack',
        startedAt: 0,
        animationStartedAt: null,
        requestMs: null,
        logged: false,
      },
      playback: async () => combatLoop.__combatNetworkTest.playOnePlayerAttackInMoveTurn(
        {
          enemies: combatA.combat.enemies,
          allies: combatA.combat.allies,
          creatureParty: combatA.run.creatureParty,
        },
        {
          attackerId: 'hi',
          attackerName: 'Fire',
          attackerWord: '火',
          attackerSkillName: '休む',
          attackerSkillEn: 'Rest',
          targetId: 'hi',
          targetName: 'Fire',
          targetWord: '火',
          targetIndex: 0,
          category: 'rest',
          attackerMp: 10,
          attackerMaxMp: 10,
          damage: 0,
        },
        {},
        new Set(),
        [],
      ),
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
    });

    for (let i = 0; i < 10 && !blockingCard.card.classList.contains('sac-continue-ready'); i += 1) {
      await Promise.resolve();
    }
    assert.equal(blockingCard.card.classList.contains('sac-continue-ready'), true);

    const drain = session.syncNow();
    let drainSettled = false;
    drain.then(() => { drainSettled = true; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(drainSettled, false, 'checkpoint waits behind the active card playback');

    const updateCountBeforeCleanup = harness.stateUpdateOwners.length;
    combatLoop.cleanupCombat();
    harness.replaceState(combatB);

    const outcome = await Promise.race([
      Promise.all([playback, drain]).then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 100)),
    ]);
    assert.equal(outcome, 'settled', 'cleanup must release the real card and playback barrier');
    assert.deepEqual(
      harness.stateUpdateOwners.slice(updateCountBeforeCleanup),
      [],
      'the cancelled combat A continuation must not write after combat B is installed',
    );
    assert.equal(harness.state, combatB);
    assert.equal(session.currentPreparedRoom().index, 1);
  } finally {
    blockingCard.restore();
    combatLoop.cleanupCombat();
    resetExploreSession();
  }
});
