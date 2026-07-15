import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal DOM/global shims so combat-loop.js imports cleanly (headless) ---
globalThis.window = { __intentLog: null };
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ style: {}, className: '', dataset: {}, textContent: '', classList: { add() {}, remove() {} }, appendChild() {}, remove() {} }),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, vibrate: () => false },
  configurable: true,
});
globalThis.requestAnimationFrame = cb => setImmediate(() => cb(Date.now()));
globalThis.cancelAnimationFrame = id => clearImmediate(id);

// --- Fake explore session, injected via module mock ---
// A combat prepared room accepts 'combat.cycle'; recordRoomAction/syncNow are spies.
let fakeSession = null;
function makeFakeSession({ acceptsCombatCycle = true } = {}) {
  const recorded = [];
  let syncNowCalls = 0;
  return {
    recorded,
    get syncNowCalls() { return syncNowCalls; },
    currentPreparedRoom: () => ({
      acceptedActions: acceptsCombatCycle ? ['encounter.start', 'combat.cycle'] : ['proceed'],
    }),
    recordRoomAction: (kind, payload) => {
      recorded.push({ kind, payload });
      return { accepted: true, pendingCount: recorded.length };
    },
    pendingCount: () => recorded.length,
    isPaused: () => false,
    getLocalRevision: () => recorded.length,
    pause: () => {},
    syncNow: () => { syncNowCalls += 1; return Promise.resolve(); },
  };
}

await mock.module('../../../public/js/ui/explore-session.js', {
  namedExports: {
    getExploreSession: () => fakeSession,
    configureExploreSession: () => fakeSession,
    resetExploreSession: () => {},
  },
});

// Controllable optimistic builder: when `forceNullSessionBuild` is true, the
// session-policy build returns null (emulating an unsafe turn — befriendQuiz /
// nextWave). Otherwise delegate to the real implementation.
let forceNullSessionBuild = false;
const realOptimistic = await import('../../../public/js/ui/optimistic-combat-turn.js');
await mock.module('../../../public/js/ui/optimistic-combat-turn.js', {
  namedExports: {
    ...realOptimistic,
    buildOptimisticCombatTurn: (args) => {
      if (forceNullSessionBuild && args?.predictionPolicy === 'session') return null;
      return realOptimistic.buildOptimisticCombatTurn(args);
    },
  },
});

const combatLoop = await import('../../../public/js/ui/combat-loop.js');
const { clearSceneManager } = await import('../../../public/js/scenes/scene-manager.js');

function combatant(overrides = {}) {
  return {
    id: 'hi', name: '火', nameEn: 'Fire', reading: 'ひ', element: 'fire',
    level: 3, attack: 10, defense: 5, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    moves: [{ id: 'honoo', name: '炎', nameEn: 'Flame', reading: 'ほのお', element: 'fire', category: 'damage', target: 'single_enemy', power: 30, mpCost: 0 }],
    ...overrides,
  };
}

// A combat state with a live turn-seed chain (length > 1 → session mode eligible).
function sessionCombatState({ enemyHp = 100, turnSeeds = ['seed-a', 'seed-b', 'seed-c'] } = {}) {
  const ally = combatant();
  const enemy = combatant({ id: 'mizu', name: '水', nameEn: 'Water', reading: 'みず', element: 'water', hp: enemyHp, maxHp: 100, moves: [{ id: 'tap', name: '触る', nameEn: 'Tap', reading: 'さわる', element: 'neutral', category: 'damage', target: 'single_enemy', power: 0, mpCost: 0 }] });
  return {
    phase: 'combat',
    combat: {
      active: true,
      isCreatureCombat: true,
      allies: [ally],
      enemies: [enemy],
      actionCursor: { side: 'ally', index: 0, opening: false },
      actionCount: 0,
      optimistic: { combatId: 'cmb_sess', stateVersion: 0, nextTurnSeed: 'seed-a', turnSeeds },
    },
    run: {
      active: true,
      mode: 'standard',
      partySkills: [],
      itemBuffs: { xpMultiplier: 1, xpBalanceStacks: 0 },
      crestMults: {},
      creatureParty: { active: [ally], reserves: [] },
    },
  };
}

function initHarness(initialState) {
  let state = initialState;
  const updates = [];
  combatLoop.init({
    getGameState: () => state,
    updateGameState: next => { state = next; updates.push(next); },
    updateUI: () => {},
    settings: { getApiKeys: () => ({}) },
    narration: {},
    characterUI: {},
    getEnemyDialogueActive: () => false,
    delay: () => Promise.resolve(),
  });
  // Route state accessors used by the network-test surface too.
  combatLoop.__combatNetworkTest.setStateAccessors({
    get: () => state,
    update: next => { state = next; updates.push(next); },
  });
  return { get state() { return state; }, updates };
}

describe('explore-session local combat turns', () => {
  let verifyCalls;
  let playbackCalls;
  const originalConsoleLog = console.log;
  beforeEach(() => {
    console.log = () => {};
    fakeSession = makeFakeSession();
    verifyCalls = [];
    playbackCalls = [];
    combatLoop.__combatNetworkTest.setCreatureCombatApi(null);
    // A verify API is required for buildOptimisticCreatureCombatRequest to arm,
    // but the session path must NOT call it. Inject a spy that records calls.
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async (envelope) => {
      verifyCalls.push(envelope);
      return { status: 'accepted', stateVersion: 1, nextSeed: 'seed-b' };
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);
  });
  afterEach(() => {
    console.log = originalConsoleLog;
    clearSceneManager();
    combatLoop.__combatNetworkTest.resetPendingFlags();
  });

  async function runTurn(
    harness,
    playback,
    { pendingFlag = 'player' } = {},
  ) {
    return combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      pendingFlag,
      playback: playback || (async (transcript) => { playbackCalls.push(transcript); }),
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
    });
  }

  it('records a combat.cycle entry with the envelope hash and does NOT call verify', async () => {
    const harness = initHarness(sessionCombatState());
    const handled = await runTurn(harness);

    assert.equal(handled, true);
    assert.equal(verifyCalls.length, 0, 'session mode must not hit the verify API');
    assert.equal(fakeSession.recorded.length, 1);
    const entry = fakeSession.recorded[0];
    assert.equal(entry.kind, 'combat.cycle');
    assert.equal(entry.payload.actionType, 'attack');
    assert.equal(entry.payload.moveChoices[0].moveId, 'honoo');
    assert.equal(typeof entry.payload.predictedHash, 'string');
    assert.ok(entry.payload.predictedHash.length > 0);
    assert.equal(playbackCalls.length, 1, 'the local transcript was played back once');
  });

  it('commits local state: stateVersion+1, chain head shifted, enemies from resolved.nextCombat', async () => {
    const harness = initHarness(sessionCombatState({ enemyHp: 100 }));
    await runTurn(harness);

    const opt = harness.state.combat.optimistic;
    assert.equal(opt.stateVersion, 1, 'stateVersion incremented');
    assert.equal(opt.nextTurnSeed, 'seed-b', 'chain head shifted to the next prepared seed');
    assert.deepEqual(opt.turnSeeds, ['seed-b', 'seed-c']);
    // Enemy took the 30-power hit: hp dropped from the resolved next combat.
    assert.ok(harness.state.combat.enemies[0].hp < 100, 'enemy HP reflects the resolved turn');
  });

  it('does not play, mutate, or leave attack pending when append is rejected', async () => {
    fakeSession.recordRoomAction = () => ({
      accepted: false,
      reason: 'hardCap',
      pendingCount: 50,
    });
    fakeSession.isPaused = () => true;
    const harness = initHarness(sessionCombatState());
    const before = structuredClone(harness.state);
    let plays = 0;
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true });

    const handled = await runTurn(harness, async () => { plays += 1; });

    assert.equal(handled, true);
    assert.equal(plays, 0);
    assert.deepEqual(harness.state, before);
    assert.equal(verifyCalls.length, 0);
    assert.deepEqual(
      combatLoop.__combatNetworkTest.getPendingFlags(),
      { player: false, enemy: false },
    );
  });

  it('plays a cap-reaching accepted turn once without reopening move selection', async () => {
    let restarts = 0;
    fakeSession.isPaused = () => true;
    const harness = initHarness(sessionCombatState());

    await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async transcript => { playbackCalls.push(transcript); },
      startMoveSelection: () => { restarts += 1; },
      stopCombatLoop: () => {},
    });

    assert.equal(fakeSession.recorded.length, 1);
    assert.equal(playbackCalls.length, 1);
    assert.equal(harness.state.combat.optimistic.stateVersion, 1);
    assert.equal(restarts, 0);
  });

  it('drains the session before using the legacy verifier at seed exhaustion', async () => {
    const events = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    fakeSession.pendingCount = () => 1;
    fakeSession.getLocalRevision = () => 1;
    fakeSession.isPaused = () => false;
    fakeSession.syncNow = async () => {
      events.push('sync:start');
      await gate;
      events.push('sync:end');
      fakeSession.pendingCount = () => 0;
    };
    const harness = initHarness(sessionCombatState({ turnSeeds: ['seed-a'] }));
    combatLoop.__combatNetworkTest.setVerifyCreatureCombatApi(async () => {
      events.push('verify');
      return { status: 'accepted', stateVersion: 1, nextSeed: 'seed-b' };
    });

    const turn = runTurn(harness);
    await Promise.resolve();
    assert.deepEqual(events, ['sync:start']);
    release();
    await turn;
    assert.deepEqual(events.slice(0, 3), ['sync:start', 'sync:end', 'verify']);
  });

  it('does not verify when the session fence cannot clear its log', async () => {
    const pauses = [];
    fakeSession.pendingCount = () => 1;
    fakeSession.getLocalRevision = () => 7;
    fakeSession.isPaused = () => false;
    fakeSession.syncNow = async () => {};
    fakeSession.pause = reason => { pauses.push(reason); };
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true });
    const harness = initHarness(sessionCombatState({ turnSeeds: ['seed-a'] }));

    const handled = await runTurn(harness, async () => {
      throw new Error('playback must not run');
    });

    assert.equal(handled, true);
    assert.equal(verifyCalls.length, 0);
    assert.deepEqual(pauses, ['syncPending']);
    assert.deepEqual(
      combatLoop.__combatNetworkTest.getPendingFlags(),
      { player: false, enemy: false },
    );
  });

  it('pauses instead of calling legacy verify when combat capability is missing', async () => {
    const pauses = [];
    fakeSession.currentPreparedRoom = () => ({ acceptedActions: [] });
    fakeSession.pause = reason => { pauses.push(reason); };
    combatLoop.__combatNetworkTest.setPendingFlags({ enemy: true });
    const harness = initHarness(sessionCombatState({
      turnSeeds: ['seed-a', 'seed-b'],
    }));

    const handled = await runTurn(harness, async () => {
      throw new Error('playback must not run');
    }, { pendingFlag: 'enemy' });

    assert.equal(handled, true);
    assert.equal(verifyCalls.length, 0);
    assert.deepEqual(pauses, ['missingPayload']);
    assert.deepEqual(
      combatLoop.__combatNetworkTest.getPendingFlags(),
      { player: false, enemy: false },
    );
  });

  it('null optimistic build (unsafe turn) in session mode fires syncNow and records no entry', async () => {
    forceNullSessionBuild = true;
    navigator.onLine = false; // offline: no legacy path to fall through to
    try {
      const harness = initHarness(sessionCombatState());
      const handled = await runTurn(harness);

      assert.equal(handled, true, 'offline unsafe turn is handled (soft pause, no fall-through)');
      assert.equal(fakeSession.recorded.length, 0, 'no garbage combat.cycle entry');
      assert.equal(fakeSession.syncNowCalls, 1, 'syncNow fired to drain what we have');
      assert.equal(verifyCalls.length, 0, 'offline: never hits verify');
    } finally {
      forceNullSessionBuild = false;
      navigator.onLine = true;
    }
  });

  it('a terminal-victory turn records the entry and stops the loop without local finish', async () => {
    let stopCalls = 0;
    const harness = initHarness(sessionCombatState({ enemyHp: 0 }));
    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async (transcript) => { playbackCalls.push(transcript); },
      startMoveSelection: () => {},
      stopCombatLoop: () => { stopCalls += 1; },
    });

    assert.equal(handled, true);
    assert.equal(fakeSession.recorded.length, 1, 'the terminal cycle is still logged');
    assert.equal(verifyCalls.length, 0);
    assert.equal(stopCalls, 0, 'finishCombatLoop is NOT called locally — the checkpoint does it');
    // The played-back transcript carries the pendingCombatEnd shell (victory).
    const played = playbackCalls[0];
    assert.ok(played.pendingCombatEnd, 'pending combat-end shell present');
    assert.equal(played.pendingCombatEnd.victory, true);
    assert.equal(played.combatEnded, false, 'shell suppresses the real combatEnded flag');
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), false, 'loop marked inactive pending server confirm');
  });
});
