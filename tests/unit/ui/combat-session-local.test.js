import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatRecoveryGate } from '../../../public/js/ui/combat-recovery-gate.js';

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
const { createExploreSession } = await import('../../../public/js/ui/explore-session.js');
function makeFakeSession({ acceptsCombatCycle = true, combatId = 'cmb_sess' } = {}) {
  const recorded = [];
  let syncNowCalls = 0;
  let currentCombatId = combatId;
  let currentRoomIndex = 0;
  let currentRoomId = 'room-0';
  let paused = false;
  let pauseReason = null;
  return {
    recorded,
    get syncNowCalls() { return syncNowCalls; },
    currentPreparedRoom: () => ({
      index: currentRoomIndex,
      roomId: currentRoomId,
      acceptedActions: acceptsCombatCycle ? ['encounter.start', 'combat.cycle'] : ['proceed'],
      interactionPayload: {
        combatId: currentCombatId,
        combatStart: { optimistic: { combatId: currentCombatId } },
      },
    }),
    setCombatId: nextCombatId => { currentCombatId = nextCombatId; },
    setRoom: (index, roomId) => {
      currentRoomIndex = index;
      currentRoomId = roomId;
    },
    recordRoomAction: (kind, payload) => {
      if (paused) {
        return { accepted: false, reason: pauseReason, pendingCount: recorded.length };
      }
      recorded.push({ kind, payload });
      return { accepted: true, pendingCount: recorded.length };
    },
    pendingCount: () => recorded.length,
    isPaused: () => paused,
    getPauseReason: () => pauseReason,
    getLocalRevision: () => recorded.length,
    pause: reason => {
      paused = true;
      pauseReason = reason;
    },
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
const { clearSceneManager, setSceneManager } = await import('../../../public/js/scenes/scene-manager.js');

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
      currentRoom: 0,
      rooms: [{ id: 'room-0', type: 'encounter' }],
      partySkills: [],
      itemBuffs: { xpMultiplier: 1, xpBalanceStacks: 0 },
      crestMults: {},
      creatureParty: { active: [ally], reserves: [] },
    },
  };
}

function initHarness(initialState, { setCombatAnimationActive, updateUI = () => {} } = {}) {
  let state = initialState;
  const updates = [];
  combatLoop.init({
    getGameState: () => state,
    updateGameState: next => { state = next; updates.push(next); },
    updateUI,
    settings: { getApiKeys: () => ({}) },
    narration: {},
    characterUI: {
      updateEnemyHPAtIndex: () => {},
      updateEnemyHPBar: () => {},
    },
    getEnemyDialogueActive: () => false,
    delay: () => Promise.resolve(),
    setCombatAnimationActive,
  });
  // Route state accessors used by the network-test surface too.
  combatLoop.__combatNetworkTest.setStateAccessors({
    get: () => state,
    update: next => { state = next; updates.push(next); },
  });
  return {
    get state() { return state; },
    replaceState(next) { state = next; },
    updates,
  };
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

  it('keeps post-turn party HP and MP when a mid-fight kill awards deferred XP', async () => {
    const initialState = sessionCombatState();
    const ally = initialState.run.creatureParty.active[0];
    const costlyFinisher = {
      ...ally.moves[0],
      id: 'costly-finisher',
      nameEn: 'Costly Finisher',
      element: 'neutral',
      power: 999,
      mpCost: 3,
      accuracy: 100,
    };
    Object.assign(ally, {
      level: 10,
      xp: 0,
      attack: 50,
      defense: 10,
      dex: 100,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      moves: [costlyFinisher],
    });

    const enemyMove = {
      ...costlyFinisher,
      id: 'tap',
      nameEn: 'Tap',
      power: 10,
      mpCost: 0,
    };
    initialState.combat.isBoss = true;
    initialState.combat.enemies = [
      combatant({
        id: 'mizu',
        nameEn: 'Water',
        element: 'water',
        level: 1,
        dex: 1,
        hp: 1,
        maxHp: 1,
        moves: [enemyMove],
      }),
      combatant({
        id: 'kusa',
        nameEn: 'Grass',
        element: 'earth',
        level: 1,
        dex: 1,
        hp: 9999,
        maxHp: 9999,
        moves: [enemyMove],
      }),
    ];

    const harness = initHarness(initialState);
    let predictedTurn = null;
    await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: costlyFinisher.id, targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async transcript => { predictedTurn = structuredClone(transcript); },
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
    });

    assert.ok(predictedTurn, 'the session turn must resolve locally');
    assert.equal(predictedTurn.enemies[0].hp, 0, 'the first enemy is defeated');
    assert.ok(predictedTurn.enemies[1].hp > 0, 'the second enemy keeps the fight active');
    assert.equal(predictedTurn.pendingCombatEnd, undefined, 'the kill is non-terminal');
    const predictedAlly = predictedTurn.creatureParty.active[0];
    assert.ok(predictedAlly.hp < 100, 'the surviving enemy damages the resolved ally');
    assert.equal(predictedAlly.mp, 7, 'the resolved party retains the move MP cost');

    const finalParty = harness.state.run.creatureParty;
    const finalAlly = finalParty.active[0];
    assert.ok(finalAlly.xp > 0, 'the defeated enemy awards deferred XP');
    assert.equal(finalAlly.level, 10, 'the fixture must not hide stale state behind a level-up restore');
    assert.equal(finalAlly.hp, predictedAlly.hp, 'deferred XP must not restore pre-turn HP');
    assert.equal(finalAlly.mp, predictedAlly.mp, 'deferred XP must not restore pre-turn MP');
    assert.strictEqual(harness.state.combat.allies, finalParty.active,
      'combat allies must stay aliased to the committed party');
    assert.strictEqual(harness.state.combat.allies[0], finalAlly,
      'the active combatant must be the committed party creature');
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

  it('holds an accepted turn when playback rejects instead of appending the unchanged seed twice', async () => {
    const harness = initHarness(sessionCombatState());
    const before = structuredClone(harness.state);
    let playbackCalls = 0;
    let selectionRestarts = 0;
    let pauseIdleProbe = null;
    const reportedErrors = [];
    const originalPause = fakeSession.pause;
    fakeSession.pause = reason => {
      pauseIdleProbe = Promise.race([
        combatLoop.waitForExploreCombatPlaybackIdle().then(() => 'idle'),
        Promise.resolve('playback-held'),
      ]);
      originalPause(reason);
    };
    const options = {
      exploreOwnerContext: {
        combatId: 'cmb_sess',
        roomIndex: 0,
        roomId: 'room-0',
      },
      playback: async () => {
        playbackCalls += 1;
        throw new Error('accepted turn playback failed');
      },
      restartMoveSelection: () => { selectionRestarts += 1; },
      reportError: (...args) => { reportedErrors.push(args); },
    };
    const choices = [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }];

    await combatLoop.__combatNetworkTest.executeCreatureMovesTurn(choices, options);

    assert.equal(fakeSession.recorded.length, 1, 'the accepted action remains queued once');
    assert.deepEqual(harness.state, before, 'failed playback must not commit its local prediction');
    assert.equal(fakeSession.isPaused(), true, 'the accepted-but-uncommitted session is held');
    assert.equal(fakeSession.getPauseReason(), 'combatPlaybackFailed');
    const heldRecoveryState = combatLoop.getExploreCombatPlaybackRecoveryState();
    const prematureRecovery = heldRecoveryState === 'ready'
      && combatLoop.consumeExploreCombatPlaybackRecovery() === true;
    const combatRecoveryDone = false;
    const wouldRestartWithUnusedReloadGate = prematureRecovery
      || (heldRecoveryState === 'none' && !combatRecoveryDone);
    assert.equal(heldRecoveryState, 'pending');
    assert.equal(wouldRestartWithUnusedReloadGate, false,
      'a pending permit must suppress ordinary combat recovery before confirmation');
    assert.equal(combatLoop.consumeExploreCombatPlaybackRecovery(), false,
      'the recovery permit must stay held until the queued action is confirmed');
    assert.equal(await pauseIdleProbe, 'playback-held',
      'the session must pause before the playback token releases checkpoint adoption');
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().player, false,
      'the failed input lock must be released safely');
    assert.equal(selectionRestarts, 0, 'unchanged seed selection must not reopen');

    await combatLoop.__combatNetworkTest.executeCreatureMovesTurn(choices, options);

    assert.equal(fakeSession.recorded.length, 1, 'the held session must reject a second append');
    assert.equal(playbackCalls, 1, 'a rejected retry must not replay the same prediction');
    assert.equal(selectionRestarts, 0);
    assert.equal(reportedErrors.length, 1, 'the accepted playback failure is still reported once');
    assert.deepEqual(harness.state, before);
  });

  it('cleans up before a waiting real-session checkpoint and re-arms from authoritative state on resume', async () => {
    const initialState = sessionCombatState();
    const authoritativeState = structuredClone(initialState);
    authoritativeState.combat.optimistic = {
      combatId: 'cmb_sess',
      stateVersion: 1,
      nextTurnSeed: 'seed-b',
      turnSeeds: ['seed-b', 'seed-c'],
    };
    authoritativeState.combat.enemies[0].hp = 71;
    const runway = {
      sessionEpoch: 'ese_playback_failure',
      currentRoom: 0,
      roomActionSeq: 0,
      preparedRooms: [{
        index: 0,
        roomId: 'room-0',
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['combatState', 'partyStats'] },
        dependencies: ['combatState', 'partyStats'],
        interactionPayload: {
          combatId: 'cmb_sess',
          combatStart: { optimistic: { combatId: 'cmb_sess' } },
        },
      }],
    };
    const events = [];
    let harness;
    let checkpointPending = null;
    let checkpointCombatActive = null;
    let recoveryStarts = 0;
    let combatRecoveryDone = true;
    let markResponseReady;
    let markAdoptionWaiting;
    const responseReady = new Promise(resolve => { markResponseReady = resolve; });
    const adoptionWaiting = new Promise(resolve => { markAdoptionWaiting = resolve; });
    fakeSession = createExploreSession({
      syncRequest: async ({ entries }) => {
        events.push('sync-ready');
        markResponseReady();
        return {
          status: 'ok',
          confirmedThroughSeq: entries.at(-1).seq,
          results: [],
          state: authoritativeState,
          exploreRunway: runway,
        };
      },
      beforeResponseAdoption: async () => {
        events.push('adoption-wait');
        markAdoptionWaiting();
        await combatLoop.waitForExploreCombatPlaybackIdle();
        events.push('adoption-unblocked');
      },
      onCheckpoint: response => {
        checkpointPending = combatLoop.__combatNetworkTest.getPendingFlags().player;
        checkpointCombatActive = combatLoop.__combatNetworkTest.isCombatActive();
        events.push('checkpoint');
        harness.replaceState(response.state);
      },
      onPause: ({ reason }) => { events.push(`pause:${reason}`); },
      onResume: ({ reason }) => {
        events.push(`resume:${reason}`);
        // Mirror game.js's combat case with its page-reload recovery gate
        // already consumed. The owner-checked playback permit must bypass it.
        const combatIsActive = combatLoop.__combatNetworkTest.isCombatActive();
        const playbackRecoveryState = !combatIsActive
          ? combatLoop.getExploreCombatPlaybackRecoveryState()
          : 'none';
        const playbackRecovery = playbackRecoveryState === 'ready'
          && combatLoop.consumeExploreCombatPlaybackRecovery() === true;
        const playbackRecoveryHeld = playbackRecoveryState !== 'none';
        if (
          !combatIsActive
          && (playbackRecovery || (!playbackRecoveryHeld && !combatRecoveryDone))
        ) {
          combatRecoveryDone = true;
          recoveryStarts += 1;
          combatLoop.__combatNetworkTest.setCombatActive(true);
          events.push('rearmed');
        }
      },
      schedule: fn => {
        queueMicrotask(fn);
        return fn;
      },
      cancel: () => {},
    });
    fakeSession.adoptRunway(runway);
    harness = initHarness(initialState);
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: false, enemy: false });
    let markPlaybackStarted;
    let rejectPlayback;
    const playbackStarted = new Promise(resolve => { markPlaybackStarted = resolve; });
    const playbackGate = new Promise((resolve, reject) => { rejectPlayback = reject; });
    let selectionRestarts = 0;

    const turn = combatLoop.__combatNetworkTest.executeCreatureMovesTurn(
      [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      {
        playback: async () => {
          events.push('playback');
          markPlaybackStarted();
          await playbackGate;
        },
        restartMoveSelection: () => { selectionRestarts += 1; },
        reportError: () => { events.push('reported'); },
      },
    );

    await playbackStarted;
    await responseReady;
    await adoptionWaiting;
    rejectPlayback(new Error('accepted turn playback failed'));
    await turn;

    assert.equal(checkpointPending, false,
      'accepted-turn input cleanup must happen before checkpoint adoption');
    assert.equal(checkpointCombatActive, false,
      'the failed local loop must be inactive before checkpoint adoption');
    assert.equal(recoveryStarts, 1,
      'authoritative checkpoint resume must automatically re-arm combat input');
    assert.equal(selectionRestarts, 0, 'the unchanged local seed must never restart');
    assert.equal(fakeSession.pendingCount(), 0);
    assert.equal(fakeSession.isPaused(), false);
    assert.equal(harness.state, authoritativeState);
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().player, false);
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), true);
    assert.ok(events.indexOf('pause:combatPlaybackFailed') < events.indexOf('adoption-unblocked'));
    assert.ok(events.indexOf('checkpoint') < events.indexOf('resume:combatPlaybackFailed'));
    assert.ok(events.indexOf('resume:combatPlaybackFailed') < events.indexOf('rearmed'));
  });

  it('re-arms corrected combat B once after reload-recovered combat A playback fails', async () => {
    const combatA = sessionCombatState();
    const combatB = sessionCombatState();
    combatB.run.currentRoom = 1;
    combatB.run.rooms = [
      { id: 'room-0', type: 'encounter' },
      { id: 'room-b', type: 'encounter' },
    ];
    combatB.combat.optimistic = {
      combatId: 'cmb_b',
      stateVersion: 0,
      nextTurnSeed: 'seed-b-0',
      turnSeeds: ['seed-b-0', 'seed-b-1'],
    };
    const runwayA = {
      sessionEpoch: 'ese_correction_to_b',
      currentRoom: 0,
      roomActionSeq: 0,
      preparedRooms: [{
        index: 0,
        roomId: 'room-0',
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['combatState', 'partyStats'] },
        dependencies: ['combatState', 'partyStats'],
        interactionPayload: {
          combatId: 'cmb_sess',
          combatStart: { optimistic: { combatId: 'cmb_sess' } },
        },
      }],
    };
    const runwayB = {
      sessionEpoch: 'ese_correction_to_b',
      currentRoom: 1,
      roomActionSeq: 0,
      preparedRooms: [{
        index: 1,
        roomId: 'room-b',
        actionSeq: 0,
        offlineReady: true,
        acceptedActions: ['combat.cycle'],
        actionEffects: { 'combat.cycle': ['combatState', 'partyStats'] },
        dependencies: ['combatState', 'partyStats'],
        interactionPayload: {
          combatId: 'cmb_b',
          combatStart: { optimistic: { combatId: 'cmb_b' } },
        },
      }],
    };
    const recoveryGate = createCombatRecoveryGate();
    const recoveryStarts = ['cmb_sess'];
    const events = [];
    let harness;

    function driveCombatRecovery() {
      const combatIsActive = combatLoop.__combatNetworkTest.isCombatActive();
      const playbackRecoveryState = !combatIsActive
        ? combatLoop.getExploreCombatPlaybackRecoveryState()
        : 'none';
      const playbackRecovery = playbackRecoveryState === 'ready'
        && combatLoop.consumeExploreCombatPlaybackRecovery() === true;
      const playbackRecoveryHeld = playbackRecoveryState !== 'none';
      if (recoveryGate.shouldRecover(harness.state, {
        combatActive: combatIsActive,
        playbackRecovery,
        playbackRecoveryHeld,
      })) {
        recoveryGate.markDone(harness.state);
        recoveryStarts.push(harness.state.combat.optimistic.combatId);
        combatLoop.__combatNetworkTest.setCombatActive(true);
        combatLoop.__combatNetworkTest.setPendingFlags({ player: true, enemy: false });
      }
    }

    let markResponseReady;
    let markAdoptionWaiting;
    let markCorrectionAdopted;
    const responseReady = new Promise(resolve => { markResponseReady = resolve; });
    const adoptionWaiting = new Promise(resolve => { markAdoptionWaiting = resolve; });
    const correctionAdopted = new Promise(resolve => { markCorrectionAdopted = resolve; });
    fakeSession = createExploreSession({
      syncRequest: async () => {
        markResponseReady();
        return {
          status: 'corrected',
          reason: 'authoritative_successor',
          state: combatB,
          exploreRunway: runwayB,
        };
      },
      beforeResponseAdoption: async () => {
        markAdoptionWaiting();
        await combatLoop.waitForExploreCombatPlaybackIdle();
      },
      onCorrection: response => {
        events.push('correction');
        harness.replaceState(response.state);
        driveCombatRecovery();
        markCorrectionAdopted();
      },
      onPause: ({ reason }) => { events.push(`pause:${reason}`); },
      onResume: ({ reason }) => {
        events.push(`resume:${reason}`);
        driveCombatRecovery();
      },
      schedule: fn => {
        queueMicrotask(fn);
        return fn;
      },
      cancel: () => {},
    });
    fakeSession.adoptRunway(runwayA);
    harness = initHarness(combatA);
    recoveryGate.markDone(combatA);
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: false, enemy: false });

    let markPlaybackStarted;
    let rejectPlayback;
    const playbackStarted = new Promise(resolve => { markPlaybackStarted = resolve; });
    const playbackGate = new Promise((resolve, reject) => { rejectPlayback = reject; });
    let selectionRestarts = 0;
    const turn = combatLoop.__combatNetworkTest.executeCreatureMovesTurn(
      [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      {
        playback: async () => {
          markPlaybackStarted();
          await playbackGate;
        },
        restartMoveSelection: () => { selectionRestarts += 1; },
        reportError: () => { events.push('reported'); },
      },
    );

    await playbackStarted;
    await responseReady;
    await adoptionWaiting;
    rejectPlayback(new Error('combat A playback failed before correction to B'));
    await correctionAdopted;
    await turn;

    driveCombatRecovery();
    assert.deepEqual(recoveryStarts, ['cmb_sess', 'cmb_b'],
      'the corrected successor should consume exactly one fresh recovery gate');
    assert.equal(harness.state, combatB);
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), true);
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().player, true,
      'combat A outer catch must not clear combat B input ownership');
    assert.equal(selectionRestarts, 0, 'combat A must not redraw combat B selection');
    assert.equal(fakeSession.pendingCount(), 0);
    assert.equal(fakeSession.isPaused(), false);
    assert.ok(events.indexOf('pause:combatPlaybackFailed') < events.indexOf('correction'));
    assert.ok(events.indexOf('correction') < events.indexOf('resume:combatPlaybackFailed'));
  });

  it('keeps generic pre-append failures on the existing current-owner recovery path', async () => {
    const harness = initHarness(sessionCombatState());
    fakeSession.recordRoomAction = () => {
      throw new Error('append failed before acceptance');
    };
    let selectionRestarts = 0;
    const reportedErrors = [];

    await combatLoop.__combatNetworkTest.executeCreatureMovesTurn(
      [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      {
        playback: async () => { throw new Error('playback must not run'); },
        restartMoveSelection: () => { selectionRestarts += 1; },
        reportError: (...args) => { reportedErrors.push(args); },
      },
    );

    assert.equal(fakeSession.isPaused(), false);
    assert.equal(fakeSession.recorded.length, 0);
    assert.equal(combatLoop.__combatNetworkTest.getPendingFlags().player, false);
    assert.equal(selectionRestarts, 1, 'pre-append failures retain generic recovery');
    assert.equal(reportedErrors.length, 1);
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

  it('does not let combat A terminal playback overwrite or restart combat B', async () => {
    const combatA = sessionCombatState({ enemyHp: 1 });
    combatA.run.currentRoom = 4;
    combatA.run.rooms = Array.from({ length: 5 }, (_, index) => ({
      id: index === 4 ? 'room-a' : `room-${index}`,
      type: 'encounter',
    }));
    fakeSession.setRoom(4, 'room-a');
    const harness = initHarness(combatA);
    let releasePlayback;
    let markPlaybackStarted;
    const playbackStarted = new Promise(resolve => { markPlaybackStarted = resolve; });
    const playbackGate = new Promise(resolve => { releasePlayback = resolve; });
    let selectionRestarts = 0;

    const turn = combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async (transcript, { isCurrent } = {}) => {
        assert.deepEqual(transcript.pendingCombatEnd, { victory: true, defeat: false });
        markPlaybackStarted();
        await playbackGate;
        combatLoop.__combatNetworkTest.syncFinalState(transcript, { isCurrent });
      },
      startMoveSelection: () => { selectionRestarts += 1; },
      stopCombatLoop: () => {},
    });

    await playbackStarted;

    const combatB = sessionCombatState({ enemyHp: 100 });
    combatB.run.currentRoom = 5;
    combatB.run.rooms = Array.from({ length: 6 }, (_, index) => ({
      id: index === 5 ? 'room-b' : `room-${index}`,
      type: 'encounter',
    }));
    combatB.combat.optimistic = {
      combatId: 'cmb_next',
      stateVersion: 0,
      nextTurnSeed: 'seed-next-a',
      turnSeeds: ['seed-next-a', 'seed-next-b'],
    };
    harness.replaceState(combatB);
    fakeSession.setCombatId('cmb_next');
    fakeSession.setRoom(5, 'room-b');
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true });

    releasePlayback();
    await turn;

    assert.equal(harness.updates.length, 0, 'combat A continuation must not publish over combat B');
    assert.equal(harness.state, combatB, 'the live combat-B state object must remain current');
    assert.equal(selectionRestarts, 0, 'combat A continuation must not render combat-B selection');
    assert.equal(fakeSession.recorded.length, 1, 'combat A continuation must not submit another move');
    assert.equal(fakeSession.recorded[0].kind, 'combat.cycle');
    assert.equal(combatLoop.__combatNetworkTest.isCombatActive(), true, 'combat B must stay active');
    assert.equal(
      combatLoop.__combatNetworkTest.getPendingFlags().player,
      true,
      'combat A continuation must not clear combat B pending input lock',
    );
  });

  it('does not submit a stale combat-A move after the prepared owner advances to combat B', async () => {
    const staleCombatA = sessionCombatState({ enemyHp: 100 });
    staleCombatA.run.currentRoom = 5;
    const harness = initHarness(staleCombatA);
    fakeSession.setCombatId('cmb_next');
    let playbackCount = 0;
    let selectionRestarts = 0;

    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async () => { playbackCount += 1; },
      startMoveSelection: () => { selectionRestarts += 1; },
      stopCombatLoop: () => {},
    });

    assert.equal(handled, true, 'the stale click is consumed without falling through to legacy combat');
    assert.equal(fakeSession.recorded.length, 0, 'the stale move must not enter combat B session history');
    assert.equal(playbackCount, 0, 'the stale move must not render a predicted transcript');
    assert.equal(harness.updates.length, 0, 'the stale move must not mutate live state');
    assert.equal(selectionRestarts, 0, 'the stale move must not restart selection');
  });

  it('allows a live combat turn when the legacy prepared-room shell has no combat id', async () => {
    const harness = initHarness(sessionCombatState({ enemyHp: 100 }));
    fakeSession.setCombatId(null);

    const handled = await runTurn(harness);

    assert.equal(handled, true);
    assert.equal(fakeSession.recorded.length, 1, 'unknown prepared owner must not look like a mismatch');
    assert.equal(playbackCalls.length, 1, 'the valid live combat turn should still play');
    assert.equal(harness.updates.length, 1, 'the valid live combat turn should still commit');
  });

  it('accepts the serialized current-room identity when run.rooms is omitted', async () => {
    const serializedState = sessionCombatState({ enemyHp: 100 });
    serializedState.room = { id: 'room-0', type: 'encounter' };
    delete serializedState.run.rooms;
    const harness = initHarness(serializedState);

    const handled = await runTurn(harness);

    assert.equal(handled, true);
    assert.equal(fakeSession.recorded.length, 1, 'live serialized room identity must own the action');
    assert.equal(playbackCalls.length, 1, 'valid first-room combat should render playback');
    assert.equal(harness.updates.length, 1, 'valid first-room combat should commit locally');
  });

  it('rejects a stale room-A control in room B when the prepared shell has no combat id', async () => {
    const hybridState = sessionCombatState({ enemyHp: 100 });
    hybridState.run.currentRoom = 5;
    hybridState.run.rooms = Array.from({ length: 6 }, (_, index) => ({
      id: index === 5 ? 'room-b' : `room-${index}`,
      type: 'encounter',
    }));
    const harness = initHarness(hybridState);
    fakeSession.setCombatId(null);
    fakeSession.setRoom(5, 'room-b');
    let playbackCount = 0;

    const handled = await combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async () => { playbackCount += 1; },
      startMoveSelection: () => {},
      stopCombatLoop: () => {},
      exploreOwnerContext: {
        combatId: 'cmb_sess',
        roomIndex: 4,
        roomId: 'room-a',
      },
    });

    assert.equal(handled, true);
    assert.equal(fakeSession.recorded.length, 0, 'room A action must not append to room B');
    assert.equal(playbackCount, 0, 'room A action must not render in room B');
    assert.equal(harness.updates.length, 0, 'room A action must not mutate room B');
  });

  it('preserves an adopted same-combat checkpoint that lands during playback', async () => {
    const harness = initHarness(sessionCombatState({ enemyHp: 100 }));
    let releasePlayback;
    let markPlaybackStarted;
    const playbackStarted = new Promise(resolve => { markPlaybackStarted = resolve; });
    const playbackGate = new Promise(resolve => { releasePlayback = resolve; });
    let selectionRestarts = 0;

    const turn = combatLoop.__combatNetworkTest.runOptimisticCreatureCombatTurn({
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
      turnTiming: { actionType: 'attack', startedAt: 0, animationStartedAt: null, requestMs: null, logged: false },
      playback: async (transcript, { isCurrent, canFinalizeState } = {}) => {
        markPlaybackStarted();
        await playbackGate;
        combatLoop.__combatNetworkTest.syncFinalState(transcript, {
          isCurrent: () => isCurrent?.() !== false && canFinalizeState?.() !== false,
        });
      },
      startMoveSelection: () => { selectionRestarts += 1; },
      stopCombatLoop: () => {},
    });

    await playbackStarted;
    const checkpoint = structuredClone(harness.state);
    checkpoint.combat.optimistic = {
      ...checkpoint.combat.optimistic,
      stateVersion: 1,
      nextTurnSeed: 'seed-b',
      turnSeeds: ['seed-b', 'seed-c'],
    };
    checkpoint.run.creatureParty.active[0].xp = 777;
    checkpoint.meta = { serverOnlyReward: 'preserve-me' };
    harness.replaceState(checkpoint);

    releasePlayback();
    await turn;

    assert.equal(harness.updates.length, 0, 'predicted turn must not reapply over an adopted checkpoint');
    assert.equal(harness.state, checkpoint, 'the adopted checkpoint object must remain current');
    assert.equal(harness.state.run.creatureParty.active[0].xp, 777, 'server XP must be preserved');
    assert.equal(harness.state.meta.serverOnlyReward, 'preserve-me');
    assert.equal(selectionRestarts, 1, 'same-combat checkpoint should continue the valid UI flow');
  });

  for (const {
    actionName,
    pendingFlag,
  } of [
    { actionName: 'attack', pendingFlag: 'player' },
    { actionName: 'defend', pendingFlag: 'enemy' },
  ]) {
    it(`does not let stale combat-A ${actionName} rejection recover into combat B`, () => {
      const harness = initHarness(sessionCombatState({ enemyHp: 100 }));
      const operation = combatLoop.__combatNetworkTest.captureExploreCombatOperation({
        combatId: 'cmb_sess',
        roomIndex: 0,
        roomId: 'room-0',
      });

      const combatB = sessionCombatState({ enemyHp: 100 });
      combatB.run.currentRoom = 1;
      combatB.run.rooms = [
        { id: 'room-0', type: 'encounter' },
        { id: 'room-b', type: 'encounter' },
      ];
      combatB.combat.optimistic = {
        combatId: 'cmb_next',
        stateVersion: 0,
        nextTurnSeed: 'seed-next-a',
        turnSeeds: ['seed-next-a', 'seed-next-b'],
      };
      harness.replaceState(combatB);
      fakeSession.setCombatId('cmb_next');
      fakeSession.setRoom(1, 'room-b');
      combatLoop.__combatNetworkTest.setCombatActive(true);
      combatLoop.__combatNetworkTest.setPendingFlags({
        player: pendingFlag === 'player',
        enemy: pendingFlag === 'enemy',
      });

      const timing = {
        actionType: actionName,
        startedAt: 0,
        animationStartedAt: null,
        requestMs: null,
        logged: false,
      };
      let selectionRestarts = 0;
      const reportedErrors = [];
      const recovered = combatLoop.__combatNetworkTest.handleCreatureTurnFailure({
        label: actionName === 'defend' ? 'Creature defend error:' : 'Move turn error:',
        error: new Error('combat A playback rejected'),
        pendingFlag,
        turnTiming: timing,
        exploreOperation: operation,
        restartMoveSelection: () => { selectionRestarts += 1; },
        reportError: (...args) => { reportedErrors.push(args); },
      });

      assert.equal(recovered, false, 'stale rejection must be consumed without recovery side effects');
      assert.equal(
        combatLoop.__combatNetworkTest.getPendingFlags()[pendingFlag],
        true,
        'combat B pending input ownership must remain locked',
      );
      assert.equal(selectionRestarts, 0, 'combat A must not redraw combat B selection');
      assert.equal(reportedErrors.length, 0, 'combat A must not surface its stale error into combat B');
      assert.equal(timing.logged, false, 'combat A must not append stale timing diagnostics into combat B');
    });

    it(`keeps current-owner ${actionName} rejection recovery`, () => {
      initHarness(sessionCombatState({ enemyHp: 100 }));
      const operation = combatLoop.__combatNetworkTest.captureExploreCombatOperation({
        combatId: 'cmb_sess',
        roomIndex: 0,
        roomId: 'room-0',
      });
      combatLoop.__combatNetworkTest.setPendingFlags({
        player: pendingFlag === 'player',
        enemy: pendingFlag === 'enemy',
      });

      const timing = {
        actionType: actionName,
        startedAt: performance.now(),
        animationStartedAt: null,
        requestMs: null,
        logged: false,
      };
      let selectionRestarts = 0;
      const reportedErrors = [];
      const recovered = combatLoop.__combatNetworkTest.handleCreatureTurnFailure({
        label: actionName === 'defend' ? 'Creature defend error:' : 'Move turn error:',
        error: new Error('current playback rejected'),
        pendingFlag,
        turnTiming: timing,
        exploreOperation: operation,
        restartMoveSelection: () => { selectionRestarts += 1; },
        reportError: (...args) => { reportedErrors.push(args); },
      });

      assert.equal(recovered, true);
      assert.equal(combatLoop.__combatNetworkTest.getPendingFlags()[pendingFlag], false);
      assert.equal(selectionRestarts, 1);
      assert.equal(reportedErrors.length, 1);
      assert.equal(timing.logged, true);
    });
  }

  it('keeps the newer combat animation active when an older animation rejects', async () => {
    const animationStates = [];
    initHarness(sessionCombatState({ enemyHp: 100 }), {
      setCombatAnimationActive: active => { animationStates.push(active); },
    });
    let releaseA;
    let releaseB;
    const gateA = new Promise(resolve => { releaseA = resolve; });
    const gateB = new Promise(resolve => { releaseB = resolve; });

    const animationA = combatLoop.__combatNetworkTest.withAnimationActive(async () => {
      await gateA;
      throw new Error('combat A animation rejected');
    });
    const animationB = combatLoop.__combatNetworkTest.withAnimationActive(async () => {
      await gateB;
    });

    releaseA();
    await assert.rejects(animationA, /combat A animation rejected/);
    assert.equal(
      animationStates.at(-1),
      true,
      'combat A finalizer must not clear combat B animation ownership',
    );

    releaseB();
    await animationB;
    assert.equal(animationStates.at(-1), false, 'animation flag clears when the final owner settles');
  });

  it('does not let combat A victory cleanup resume into combat B after an await', async () => {
    const harness = initHarness(sessionCombatState({ enemyHp: 0 }));
    let releaseDialogue;
    const dialogueGate = new Promise(resolve => { releaseDialogue = resolve; });
    const downstream = [];

    combatLoop.init({
      getGameState: () => harness.state,
      updateGameState: next => { harness.replaceState(next); },
      updateUI: () => { downstream.push('updateUI'); },
      settings: { getApiKeys: () => ({}) },
      narration: {},
      characterUI: {},
      getEnemyDialogueActive: () => false,
      getDialogueDismissPromise: () => dialogueGate,
      delay: () => Promise.resolve(),
      animateEnemyDefeat: () => { downstream.push('animateEnemyDefeat'); },
      showVictoryModal: async () => { downstream.push('showVictoryModal'); },
      showGameOverModal: async () => { downstream.push('showGameOverModal'); },
      showPostCombatShop: async () => { downstream.push('showPostCombatShop'); },
    });
    setSceneManager({
      currentScene: null,
      transitioning: false,
      transition: async () => { downstream.push('transition'); },
    });
    combatLoop.__combatNetworkTest.setCombatActive(true);

    const cleanupA = combatLoop.stopCombatLoop({
      combatEnded: true,
      victory: true,
      turnCount: 2,
    });
    await Promise.resolve();

    const combatB = sessionCombatState({ enemyHp: 100 });
    combatB.run.currentRoom = 1;
    combatB.run.rooms = [
      { id: 'room-0', type: 'encounter' },
      { id: 'room-b', type: 'npcBattle' },
    ];
    combatB.combat.optimistic = {
      combatId: 'cmb_next',
      stateVersion: 0,
      nextTurnSeed: 'seed-next-a',
      turnSeeds: ['seed-next-a', 'seed-next-b'],
    };
    harness.replaceState(combatB);
    fakeSession.setCombatId('cmb_next');
    fakeSession.setRoom(1, 'room-b');
    combatLoop.__combatNetworkTest.setCombatActive(true);

    releaseDialogue();
    await cleanupA;

    assert.deepEqual(
      downstream,
      [],
      'combat A must not animate, show rewards/modals, update, or transition after combat B owns the screen',
    );
    assert.equal(harness.state.combat.optimistic.combatId, 'cmb_next');
    assert.equal(combatLoop.isCombatActive(), true, 'combat A cleanup must not deactivate combat B');
  });

  it('reconciles corrected combat ownership without preserving A or tearing down live B', () => {
    const harness = initHarness(sessionCombatState({ enemyHp: 100 }));
    const combatA = harness.state;
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true, enemy: true });

    const inactiveA = structuredClone(combatA);
    inactiveA.phase = 'room';
    inactiveA.combat.active = false;
    harness.replaceState(inactiveA);
    assert.equal(combatLoop.reconcileExploreCombatCorrection(combatA, inactiveA), true);
    assert.equal(combatLoop.isCombatActive(), false);
    assert.deepEqual(combatLoop.__combatNetworkTest.getPendingFlags(), { player: false, enemy: false });

    const combatB = sessionCombatState({ enemyHp: 100 });
    combatB.run.currentRoom = 1;
    combatB.run.rooms = [
      { id: 'room-0', type: 'encounter' },
      { id: 'room-b', type: 'encounter' },
    ];
    combatB.combat.optimistic.combatId = 'cmb-b';
    harness.replaceState(combatB);
    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true });

    assert.equal(combatLoop.reconcileExploreCombatCorrection(combatA, combatB), true);
    assert.equal(combatLoop.isCombatActive(), false, 'A ownership is released so updateUI can start B');
    assert.deepEqual(combatLoop.__combatNetworkTest.getPendingFlags(), { player: false, enemy: false });

    combatLoop.__combatNetworkTest.setCombatActive(true);
    combatLoop.__combatNetworkTest.setPendingFlags({ player: true });
    assert.equal(combatLoop.reconcileExploreCombatCorrection(combatB, combatB), false);
    assert.equal(combatLoop.isCombatActive(), true, 'same-owner correction keeps B live');
    assert.deepEqual(combatLoop.__combatNetworkTest.getPendingFlags(), { player: true, enemy: false });
  });

  for (const {
    actionName,
    pendingFlag,
  } of [
    { actionName: 'attack', pendingFlag: 'player' },
    { actionName: 'defend', pendingFlag: 'enemy' },
  ]) {
    it(`contains a deferred stale ${actionName} rejection in the real outer wrapper`, async () => {
      const animationStates = [];
      const harness = initHarness(sessionCombatState({ enemyHp: 100 }), {
        setCombatAnimationActive: active => { animationStates.push(active); },
      });
      const owner = {
        combatId: 'cmb_sess',
        roomIndex: 0,
        roomId: 'room-0',
      };
      let markPlaybackStarted;
      let rejectPlayback;
      const playbackStarted = new Promise(resolve => { markPlaybackStarted = resolve; });
      const playbackGate = new Promise((resolve, reject) => { rejectPlayback = reject; });
      let selectionRestarts = 0;
      const reportedErrors = [];
      const playback = async () => {
        markPlaybackStarted();
        await playbackGate;
      };

      const combatATurn = actionName === 'attack'
        ? combatLoop.__combatNetworkTest.executeCreatureMovesTurn(
            [{ creatureIndex: 0, moveId: 'honoo', targetIndex: 0 }],
            {
              exploreOwnerContext: owner,
              playback,
              restartMoveSelection: () => { selectionRestarts += 1; },
              reportError: (...args) => { reportedErrors.push(args); },
            },
          )
        : combatLoop.__combatNetworkTest.executeCreatureDefendThenPause({
            exploreOwnerContext: owner,
            playback,
            restartMoveSelection: () => { selectionRestarts += 1; },
            reportError: (...args) => { reportedErrors.push(args); },
          });

      await playbackStarted;

      const combatB = sessionCombatState({ enemyHp: 100 });
      combatB.run.currentRoom = 1;
      combatB.run.rooms = [
        { id: 'room-0', type: 'encounter' },
        { id: 'room-b', type: 'encounter' },
      ];
      combatB.combat.optimistic = {
        combatId: 'cmb_next',
        stateVersion: 0,
        nextTurnSeed: 'seed-next-a',
        turnSeeds: ['seed-next-a', 'seed-next-b'],
      };
      harness.replaceState(combatB);
      fakeSession.setCombatId('cmb_next');
      fakeSession.setRoom(1, 'room-b');
      combatLoop.__combatNetworkTest.setCombatActive(true);
      combatLoop.__combatNetworkTest.setPendingFlags({
        player: pendingFlag === 'player',
        enemy: pendingFlag === 'enemy',
      });

      let releaseCombatBAnimation;
      const combatBAnimationGate = new Promise(resolve => { releaseCombatBAnimation = resolve; });
      const combatBAnimation = combatLoop.__combatNetworkTest.withAnimationActive(
        () => combatBAnimationGate,
      );

      rejectPlayback(new Error('combat A playback rejected after combat B started'));
      await combatATurn;

      assert.equal(
        combatLoop.__combatNetworkTest.getPendingFlags()[pendingFlag],
        true,
        'combat A catch must leave combat B input pending',
      );
      assert.equal(selectionRestarts, 0, 'combat A catch must not restart combat B selection');
      assert.equal(reportedErrors.length, 0, 'combat A catch must suppress its stale error');
      assert.equal(fakeSession.isPaused(), false, 'stale combat A must not pause combat B session');
      assert.equal(animationStates.at(-1), true, 'combat A finally must leave B animation active');

      releaseCombatBAnimation();
      await combatBAnimation;
      assert.equal(animationStates.at(-1), false);
    });
  }
});
