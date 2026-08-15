import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeExploreV1OkTransport } from '../../helpers/explore-sync-transport.js';

const sceneManagerState = { currentScene: null };
let renderedChoices = null;
let renderedButtons = [];
let dialogueCalls = [];
let dialogueGate = null;
let tutorialNarrationPages = ['first Cid line'];

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

function createElementStub() {
  return {
    className: '',
    tabIndex: 0,
    style: {},
    innerHTML: '',
    children: [],
    classList: {
      add() {},
      remove() {},
    },
    setAttribute() {},
    remove() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
    },
    querySelector: () => ({ addEventListener() {} }),
    querySelectorAll: () => [],
    set textContent(value) {
      this.innerHTML = String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    },
    get textContent() {
      return this.innerHTML;
    },
  };
}

function makeNpcRewardState({ currentRoom, rewardResolved, active = false, mode = 'standard' }) {
  const room = {
    id: `npc-room-${currentRoom}`,
    type: 'npcBattle',
    interacted: true,
    npcBattle: {
      skillSelectionPending: !rewardResolved,
      rewardResolved,
    },
  };
  const next = {
    id: `room-${currentRoom + 1}`,
    type: 'friendlyNpc',
    interacted: false,
  };
  const rooms = [];
  rooms[currentRoom] = room;
  rooms[currentRoom + 1] = next;
  const runway = {
    sessionEpoch: 'ese_7777777777777777',
    currentRoom,
    roomActionSeq: 10,
    preparedRooms: [
      {
        index: currentRoom,
        roomId: room.id,
        actionSeq: 10,
        room: structuredClone(room),
        acceptedActions: rewardResolved
          ? ['proceed']
          : ['npcBattleSkill.choose'],
        actionEffects: rewardResolved
          ? { proceed: ['ingredients', 'areaProgress'] }
          : { 'npcBattleSkill.choose': ['partySkills'] },
        dependencies: ['partyStats'],
        offlineReady: true,
      },
      {
        index: currentRoom + 1,
        roomId: next.id,
        actionSeq: 11,
        room: structuredClone(next),
        acceptedActions: ['friendlyNpc.choose', 'proceed'],
        actionEffects: {
          'friendlyNpc.choose': ['partyStats'],
          proceed: ['ingredients', 'areaProgress'],
        },
        dependencies: [],
        offlineReady: true,
      },
    ],
  };
  return {
    phase: rewardResolved ? 'room' : 'npc_skill_selection',
    room,
    run: {
      active,
      mode,
      currentRoom,
      roomActionSeq: 10,
      rooms,
      creatureParty: { active: [], reserves: [] },
      partySkills: [],
      exploreRunway: runway,
    },
  };
}

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});
await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});
await mock.module('../../../public/js/ui/speed-review.js', { namedExports: {} });
await mock.module('../../../public/js/ui/whack-a-mole.js', {
  namedExports: { WhackAMoleGame: class {} },
});
await mock.module('../../../public/js/audio.js', { namedExports: { playSFX: () => {} } });
await mock.module('../../../public/js/native/index.js', { namedExports: { hapticLight: () => {} } });
await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: {
    creatureBgUrl: () => '', itemSpriteHtml: () => '', creatureStaticPath: () => '',
    SPRITE_VERSION: 'test',
  },
});
await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { hideEnemy: () => {}, showFormation: () => {}, hideFormation: () => {} },
});
await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: { showNpcInDisplay: () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  namedExports: { t: (...a) => a.join(' '), isJapanified: () => false },
});
await mock.module('../../../public/js/ui/chests.js', { namedExports: {} });
await mock.module('../../../public/js/ui/crests-equip.js', { namedExports: {} });
await mock.module('../../../public/js/ui/item-effect-pills.js', {
  namedExports: { buildItemEffectPills: () => '' },
});
await mock.module('../../../public/js/ui/room-transition.js', {
  namedExports: { playRoomTransition: async () => {} },
});
await mock.module('../../../public/js/ui/ui-components.js', {
  namedExports: {
    renderButtons: buttons => { renderedButtons = buttons; },
    renderChoices: options => {
      renderedChoices = options;
      const el = options.container || globalThis.document?.getElementById?.('action-area');
      if (el) {
        el.innerHTML = `
          ${options.heading ? `<div class="ui-choice-heading">${options.heading}</div>` : ''}
          ${(options.cards || []).map(card => `
            <div class="ui-choice">
              <div class="ui-choice__title">${card.title}</div>
              ${card.subtitle ? `<div class="ui-choice__subtitle">${card.subtitle}</div>` : ''}
            </div>
          `).join('')}
        `;
      }
    },
  },
});
await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => {
      dialogueCalls.push(options);
      await dialogueGate?.promise;
    },
  },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: { buff: () => {}, itemGained: () => {} },
});
await mock.module('../../../public/js/ui/dom-effects.js', {
  namedExports: { pop: () => {}, flashElement: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: { savePvpTeam: async () => {}, getPvpTeams: async () => [] },
});
await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: { renderJpSentence: () => '', getKnownWords: () => new Set(), entityToToken: value => value },
});
await mock.module('../../../public/js/ui/tutorial-copy.js', {
  namedExports: {
    getTutorialNarration: () => tutorialNarrationPages,
    getFormationNarration: () => '',
    getPostHinonekoReviewNarration: () => [],
    getFusionCoreNarration: () => [],
    getPostFusionNarration: () => [],
  },
});

const {
  init,
  renderExploring,
  renderSkillMaster,
  renderNpcBattleSkillSelection,
  showTutorialNarration,
} = await import('../../../public/js/ui/exploration.js');

const {
  configureExploreSession,
  getExploreSession,
  resetExploreSession,
} = await import('../../../public/js/ui/explore-session.js');

describe('renderSkillMaster tutorial Cid narration', () => {
  beforeEach(() => {
    resetExploreSession();
    sceneManagerState.currentScene = null;
    sceneManagerState.transitioning = false;
    renderedChoices = null;
    renderedButtons = [];
    dialogueCalls = [];
    dialogueGate = null;
    tutorialNarrationPages = ['first Cid line'];
  });

  function makePreparedSkillMasterState(roomId, currentRoom = 0, variant = roomId) {
    const room = {
      id: roomId,
      type: 'skillMaster',
      interacted: false,
      skillMaster: { completed: false, chosenId: null },
    };
    const offered = [{ id: 'hpMaster', title: `Skill ${variant}`, name: `Skill ${variant}`, desc: 'Prepared skill.' }];
    const rooms = [];
    rooms[currentRoom] = room;
    return {
      room,
      offered,
      state: {
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        room,
        run: {
          active: true,
          mode: 'standard',
          currentRoom,
          roomActionSeq: 60 + currentRoom,
          stats: { startTime: 6000 },
          initialSkillPick: { chosenId: 'starter' },
          partySkills: [],
          creatureParty: { active: [], reserves: [] },
          rooms,
          exploreRunway: {
            sessionEpoch: 'ese_skillowner0001',
            currentRoom,
            roomActionSeq: 60 + currentRoom,
            preparedRooms: [{
              index: currentRoom,
              roomId,
              actionSeq: 60 + currentRoom,
              room,
              acceptedActions: ['skillMaster.choose', 'proceed'],
              offlineReady: true,
              interactionPayload: {
                kind: 'skillMaster',
                roomId,
                offered,
                skillSelectPrompt: { tokens: [{ text: `Prompt ${variant}` }], overrides: {} },
                completed: false,
                chosenId: null,
              },
            }],
          },
        },
      },
    };
  }

  function makePreparedNpcRewardState(roomId, currentRoom = 0, variant = roomId) {
    const room = {
      id: roomId,
      type: 'npcBattle',
      interacted: true,
      npc: { id: `npc-${roomId}`, nameEn: `NPC ${roomId}` },
      npcBattle: { skillSelectionPending: true, rewardResolved: false },
    };
    const offered = [{ id: 'hpMaster', title: `Reward ${variant}`, name: `Reward ${variant}`, desc: 'Prepared reward.' }];
    const rooms = [];
    rooms[currentRoom] = room;
    return {
      room,
      offered,
      state: {
        phase: 'npc_skill_selection',
        room,
        run: {
          active: true,
          mode: 'standard',
          currentRoom,
          roomActionSeq: 70 + currentRoom,
          partySkills: [],
          creatureParty: { active: [], reserves: [] },
          rooms,
          exploreRunway: {
            sessionEpoch: 'ese_npcowner000001',
            currentRoom,
            roomActionSeq: 70 + currentRoom,
            preparedRooms: [{
              index: currentRoom,
              roomId,
              actionSeq: 70 + currentRoom,
              room,
              acceptedActions: ['npcBattleSkill.choose'],
              offlineReady: true,
              interactionPayload: {
                kind: 'npcBattle',
                roomId,
                lifecycle: 'resolved',
                rewardPending: true,
                offered,
                skillSelectPrompt: { tokens: [{ text: `Reward prompt ${variant}` }], overrides: {} },
              },
            }],
          },
        },
      },
    };
  }

  it('uses strict prepared skill-master offers in an active standard session', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const room = { id: 'skill-standard-ready', type: 'skillMaster', skillMaster: { completed: false } };
    const payload = {
      kind: 'skillMaster',
      roomId: room.id,
      offered: [{ id: 'hpMaster', title: 'HP Master', name: 'HP Master', desc: 'More HP.' }],
      skillSelectPrompt: { tokens: [{ text: 'Safe prompt' }], overrides: {} },
      completed: false,
      chosenId: null,
    };
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        stats: { startTime: 991 },
        rooms: [room],
        creatureParty: { active: [] },
        exploreRunway: {
          sessionEpoch: 'ese_5555555555555555',
          currentRoom: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            room,
            acceptedActions: ['skillMaster.choose', 'proceed'],
            offlineReady: true,
            interactionPayload: payload,
          }],
        },
      },
    };
    let legacyCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(legacyCalls, 0);
    assert.equal(getExploreSession().isPaused(), false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
  });

  it('clears and pauses malformed standard skill-master data without a legacy fetch', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const room = { id: 'skill-standard-bad', type: 'skillMaster', skillMaster: { completed: false } };
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        stats: { startTime: 992 },
        rooms: [room],
        creatureParty: { active: [] },
        exploreRunway: {
          sessionEpoch: 'ese_6666666666666666',
          currentRoom: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            room,
            acceptedActions: ['skillMaster.choose', 'proceed'],
            offlineReady: false,
            missingPayloadReasons: ['skillMaster.offered'],
            interactionPayload: {
              kind: 'skillMaster',
              roomId: room.id,
              offered: [],
              skillSelectPrompt: null,
              completed: false,
            },
          }],
        },
      },
    };
    let legacyCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => { actionArea.innerHTML = ''; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(legacyCalls, 0);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(actionArea.innerHTML, '');
    assert.equal(renderedChoices, null);
  });

  it('does not publish skill-master choices when the session pauses during its prompt', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const owner = makePreparedSkillMasterState('skill-paused-prompt');
    let clearCalls = 0;
    let legacyCalls = 0;
    dialogueGate = deferred();
    init({
      getGameState: () => owner.state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { clearCalls += 1; actionArea.innerHTML = ''; renderedChoices = null; },
      },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      const rendering = renderSkillMaster();
      for (let i = 0; i < 4 && dialogueCalls.length === 0; i += 1) await Promise.resolve();
      assert.equal(dialogueCalls.length, 1, 'skill prompt should be awaiting dismissal');
      getExploreSession().pause('missingPayload');
      dialogueGate.resolve();
      await rendering;
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(renderedChoices, null);
    assert.ok(clearCalls > 0);
    assert.equal(legacyCalls, 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('rejects a skill-master choice after a same-kind capability successor takes ownership', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const ownerA = makePreparedSkillMasterState('skill-owner-a', 0);
    let currentState = ownerA.state;
    let legacyCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; renderedChoices = null; },
      },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderSkillMaster();
      const ownerChoices = renderedChoices;
      const ownerB = makePreparedSkillMasterState('skill-owner-b', 1);
      currentState = ownerB.state;
      getExploreSession().adoptRunway(ownerB.state.run.exploreRunway);
      await ownerChoices.onSelect(0);

      assert.deepEqual(getExploreSession().snapshot(), []);
      assert.equal(currentState.room.id, ownerB.room.id);
      assert.equal(currentState.room.interacted, false);
      assert.equal(currentState.room.skillMaster.completed, false);
      assert.equal(currentState.run.partySkills.length, 0);
      assert.equal(getExploreSession().isPaused(), false);
      assert.equal(legacyCalls, 0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('replaces cached skill-master offers and prompt for a new same-room capability', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const roomId = 'skill-same-room-owner';
    let currentState = makePreparedSkillMasterState(roomId, 0, 'alpha').state;
    let legacyCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => { legacyCalls += 1; return null; },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderSkillMaster();
      assert.match(renderedChoices.cards[0].title, /alpha/);

      currentState = makePreparedSkillMasterState(roomId, 0, 'beta').state;
      getExploreSession().adoptRunway(currentState.run.exploreRunway);
      await renderSkillMaster();

      assert.match(renderedChoices.cards[0].title, /beta/);
      assert.match(dialogueCalls.at(-1).tokens[0].text, /beta/);
      assert.equal(legacyCalls, 0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('restarts an orphaned same-owner legacy skill offer fetch on rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      run: {
        currentRoom: 0,
        stats: { startTime: 9301 },
        initialSkillPick: { chosenId: null },
        creatureParty: { active: [], reserves: [] },
      },
    };
    const gates = [];
    let fetchCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => {
        fetchCalls += 1;
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
      },
    });

    try {
      const firstRender = renderSkillMaster();
      await Promise.resolve();
      assert.equal(fetchCalls, 1);

      const secondRender = renderSkillMaster();
      await Promise.resolve();
      assert.equal(fetchCalls, 2, 'new render must re-own an unresolved cache load');

      gates[1].resolve({
        offered: [{ id: 'hpMaster', title: 'Current skill', desc: 'Current.' }],
      });
      await secondRender;
      const currentChoices = renderedChoices;
      assert.match(currentChoices.cards[0].title, /Current/);

      gates[0].resolve({
        offered: [{ id: 'hpMaster', title: 'Old skill', desc: 'Old.' }],
      });
      await firstRender;
      assert.equal(renderedChoices, currentChoices);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('does not restart Cid entrance narration on same-room rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNpcSpriteCalls = 0;
    let showNarrationCalls = 0;
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {
        showNpcSpriteCalls += 1;
      },
      async hideNpcSprite() {},
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 111 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }

    assert.equal(showNpcSpriteCalls, 1);
    assert.equal(showNarrationCalls, 1);
  });

  it('continues the same tutorial narration across a benign same-owner rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    tutorialNarrationPages = ['first Cid line', 'second Cid line'];
    const firstPageGate = deferred();
    const shownPages = [];
    let hideNpcSpriteCalls = 0;
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 0 },
      run: {
        stats: { startTime: 8181 },
        initialSkillPick: { chosenId: null },
        creatureParty: { active: [] },
      },
    };
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      npcSprite: null,
      async showNpcSprite() { this.npcSprite = {}; },
      async hideNpcSprite() { hideNpcSpriteCalls += 1; this.npcSprite = null; },
    };
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: {
        showNarration: async page => {
          shownPages.push(page);
          if (page === 'first Cid line') await firstPageGate.promise;
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'hpMaster', title: 'HP Master', desc: 'More HP.' },
          { id: 'guard', title: 'Guard', desc: 'Defend.' },
          { id: 'haste', title: 'Haste', desc: 'Speed up.' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      assert.deepEqual(shownPages, ['first Cid line']);
      await renderSkillMaster();
      firstPageGate.resolve();
      for (let i = 0; i < 6 && hideNpcSpriteCalls === 0; i += 1) await Promise.resolve();

      assert.deepEqual(shownPages, ['first Cid line', 'second Cid line']);
      assert.equal(hideNpcSpriteCalls, 1);
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }
  });

  it('does not let stale tutorial narration hide the successor scene NPC', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const narrationGate = deferred();
    let currentState = {
      phase: 'skillMaster',
      meta: { tutorialStep: 0 },
      run: {
        stats: { startTime: 9191 },
        initialSkillPick: { chosenId: null },
        creatureParty: { active: [] },
      },
    };
    const skillScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      npcSprite: null,
      async showNpcSprite() { this.npcSprite = {}; },
      async hideNpcSprite() { this.npcSprite = null; },
    };
    let successorHideCalls = 0;
    const successorScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      npcSprite: { id: 'successor-npc' },
      async showNpcSprite() {},
      async hideNpcSprite() { successorHideCalls += 1; },
    };
    sceneManagerState.currentScene = skillScene;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: async () => narrationGate.promise },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'hpMaster', title: 'HP Master', desc: 'More HP.' },
          { id: 'guard', title: 'Guard', desc: 'Defend.' },
          { id: 'haste', title: 'Haste', desc: 'Speed up.' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      for (let i = 0; i < 4 && skillScene.npcSprite == null; i += 1) await Promise.resolve();
      assert.ok(skillScene.npcSprite, 'tutorial narration should own the original scene sprite');

      currentState = {
        phase: 'hub',
        meta: { tutorialStep: 1 },
        run: { stats: { startTime: 9191 }, creatureParty: { active: [] } },
      };
      sceneManagerState.currentScene = successorScene;
      narrationGate.resolve();
      for (let i = 0; i < 4; i += 1) await Promise.resolve();

      assert.equal(successorHideCalls, 0);
      assert.equal(successorScene.npcSprite.id, 'successor-npc');
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
    }
  });

  it('waits for an in-flight scene transition before spawning Cid', async () => {
    let showNpcSpriteCalls = 0;
    let showNarrationCalls = 0;
    const scene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {
        showNpcSpriteCalls += 1;
      },
      async hideNpcSprite() {},
    };
    sceneManagerState.transitioning = true;

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 444 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: () => {} },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return Promise.resolve();
        },
      },
    });

    try {
      const narrationPromise = showTutorialNarration(['first Cid line'], { showSprite: true });
      setTimeout(() => {
        sceneManagerState.currentScene = scene;
        sceneManagerState.transitioning = false;
      }, 0);
      await narrationPromise;
    } finally {
      sceneManagerState.currentScene = null;
      sceneManagerState.transitioning = false;
    }

    assert.equal(showNpcSpriteCalls, 1);
    assert.equal(showNarrationCalls, 1);
  });

  it('does not restart tutorial narration when initial skill pick is inferred from server state', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 0 },
        run: {
          stats: { startTime: 222 },
          creatureParty: { active: [] },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: {
        showNarration: () => {
          showNarrationCalls += 1;
          return new Promise(() => {});
        },
      },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 1);
  });

  it('renders fetched offers when the initial pick is inferred over a non-skill first room', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    const firstRoom = { id: 'first-whack-room', type: 'whackAMole' };
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      room: firstRoom,
      run: {
        currentRoom: 0,
        stats: { startTime: 223 },
        creatureParty: { active: [] },
        rooms: [firstRoom],
      },
    };

    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', title: 'Arc Strike', desc: 'Arc damage.' },
          { id: 'guard', name: 'Guard', title: 'Guard', desc: 'Defend.' },
          { id: 'haste', name: 'Haste', title: 'Haste', desc: 'Speed up.' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike/);
  });

  it('does not consume room-zero Skill Master payloads before the initial party skill exists', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    const firstRoom = {
      id: 'first-skill-room',
      type: 'skillMaster',
      interacted: false,
      skillMaster: { completed: false, chosenId: null },
    };
    const preparedOffer = {
      id: 'preparedRoomSkill',
      name: 'Prepared Room Skill',
      title: 'Prepared Room Skill',
      desc: 'This belongs to room zero.',
    };
    const state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      room: firstRoom,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        roomActionSeq: 1,
        stats: { startTime: 224 },
        partySkills: [],
        creatureParty: { active: [] },
        rooms: [firstRoom],
        exploreRunway: {
          sessionEpoch: 'ese_initialskill001',
          currentRoom: 0,
          roomActionSeq: 1,
          preparedRooms: [{
            index: 0,
            roomId: firstRoom.id,
            actionSeq: 1,
            room: firstRoom,
            acceptedActions: ['skillMaster.choose', 'proceed'],
            offlineReady: true,
            interactionPayload: {
              kind: 'skillMaster',
              roomId: firstRoom.id,
              offered: [preparedOffer],
              skillSelectPrompt: { tokens: [{ text: 'Prepared prompt' }], overrides: {} },
              completed: false,
              chosenId: null,
            },
          }],
        },
      },
    };

    configureExploreSession({ syncRequest: async request => makeExploreV1OkTransport(request) });
    let offersCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => {
        offersCalls += 1;
        return {
          offered: [{
            id: 'initialArcStrike',
            name: 'Initial Arc Strike',
            title: 'Initial Arc Strike',
            desc: 'This is the initial pick.',
          }],
        };
      },
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.equal(offersCalls, 1);
    assert.match(actionArea.innerHTML, /Initial Arc Strike/);
    assert.doesNotMatch(actionArea.innerHTML, /Prepared Room Skill/);
  });

  it('labels non-tutorial skill choices with Choose a skill', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        run: {
          stats: { startTime: 333 },
          creatureParty: { active: [] },
        },
        room: { id: 'skill-room-heading', type: 'skillMaster' },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
    assert.match(actionArea.innerHTML, /30% damage/);
  });

  it('renders leveled and escaped party skill inventory entries', () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    let appendedOverlay = null;
    globalThis.document = {
      getElementById: id => {
        if (id === 'action-area') return actionArea;
        if (id === 'inventory-overlay') return appendedOverlay;
        if (id === 'inventory-close-btn') return { addEventListener() {} };
        return null;
      },
      createElement: () => createElementStub(),
      body: {
        appendChild(el) {
          appendedOverlay = el;
        },
      },
    };

    init({
      getGameState: () => ({
        phase: 'room',
        creatureParty: { active: [] },
        run: {
          itemBuffs: {},
          partySkills: [
            { id: 'hpMaster', level: 1 },
            {
              id: 'customSkill',
              level: 2,
              name: 'Custom <Skill>',
              desc: 'Unsafe <desc>',
            },
          ],
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      startEncounter: () => {},
    });

    try {
      renderExploring();
      renderedButtons.find(button => button.label.includes('インベントリ')).onClick();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.match(appendedOverlay.innerHTML, /HP Master - Lvl\. 1/);
    assert.match(appendedOverlay.innerHTML, /max HP increases by 25%/);
    assert.match(appendedOverlay.innerHTML, /Custom &lt;Skill&gt; Lvl\. 2/);
    assert.match(appendedOverlay.innerHTML, /Unsafe &lt;desc&gt;/);
  });

  it('shows the non-tutorial skill select prompt with the standard dialogue card', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;
    const prompt = {
      tokens: [{ base: '能力', text: 'のうりょく' }],
      overrides: { 能力: 'ability' },
    };

    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        run: {
          stats: { startTime: 555 },
          creatureParty: { active: [] },
        },
        room: { id: 'skill-room-dialogue', type: 'skillMaster' },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => { showNarrationCalls += 1; } },
      apiSkillMasterOffers: async () => ({
        skillSelectPrompt: prompt,
        offered: [
          { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 0);
    assert.equal(dialogueCalls.length, 1);
    assert.equal(dialogueCalls[0].speaker, 'Cid');
    assert.equal(dialogueCalls[0].tokens, prompt.tokens);
    assert.equal(dialogueCalls[0].overrides, prompt.overrides);
    assert.equal(dialogueCalls[0].useKanji, false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
  });

  it('resets Cid from the scene before rendering the first room after initial skill pick', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    const events = [];
    const oldRunway = {
      sessionEpoch: 'ese_5555555555555555',
      currentRoom: 0,
      roomActionSeq: 0,
      preparedRooms: [{
        index: 0,
        roomId: 'old-room',
        actionSeq: 0,
        room: { id: 'old-room', type: 'friendlyNpc' },
        acceptedActions: ['friendlyNpc.choose'],
        offlineReady: true,
      }],
    };
    const responseRunway = {
      ...oldRunway,
      preparedRooms: [{
        index: 0,
        roomId: 'room-from-skill-choice-response',
        actionSeq: 0,
        room: { id: 'room-from-skill-choice-response', type: 'encounter' },
        acceptedActions: ['encounter.start', 'combat.cycle'],
        offlineReady: true,
      }],
    };
    let state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      run: {
        currentRoom: 0,
        stats: { startTime: 777 },
        initialSkillPick: { chosenId: null },
        creatureParty: { active: [{ uid: 'ally-1', id: 'nekorin' }] },
        exploreRunway: oldRunway,
      },
      room: { id: 'first-friendly', type: 'friendlyNpc' },
    };
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    sceneManagerState.currentScene = {
      disposed: false,
      _exiting: false,
      layers: { npcs: {} },
      async showNpcSprite() {},
      async hideNpcSprite() {},
      async resetForRoom(opts) {
        events.push(['resetForRoom', opts]);
      },
    };
    const session = configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    session.adoptRunway(oldRunway);

    init({
      getGameState: () => state,
      updateGameState: nextState => { state = nextState; },
      updateUI: () => events.push([
        'updateUI',
        getExploreSession().currentPreparedRoom()?.roomId,
      ]),
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => ({
        offered: [
          { id: 'arcStrike', name: 'Arc Strike', desc: 'Chain hit' },
          { id: 'guard', name: 'Guard', desc: 'Defend' },
          { id: 'haste', name: 'Haste', desc: 'Speed up' },
        ],
      }),
      apiSkillMasterChoose: async (skillId, options = {}) => ({
        actionId: options.actionId,
        chosenId: skillId,
        state: {
          ...state,
          phase: 'friendlyNpc',
          run: {
            ...state.run,
            pendingSkillChoice: undefined,
            initialSkillPick: { chosenId: skillId },
            exploreRunway: responseRunway,
          },
        },
      }),
    });

    try {
      await renderSkillMaster();
      assert.equal(renderedChoices?.heading, 'Choose a skill');

      await renderedChoices.onSelect(0);
    } finally {
      globalThis.document = originalDocument;
      sceneManagerState.currentScene = null;
      resetExploreSession();
    }

    assert.deepEqual(events, [
      ['resetForRoom', {
        roomId: 0,
        allies: [{ uid: 'ally-1', id: 'nekorin' }],
      }],
      ['updateUI', 'room-from-skill-choice-response'],
    ]);
  });

  it('drops an initial skill response that outlives its legacy render owner', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const chooseGate = deferred();
    const initialState = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      run: {
        stats: { startTime: 7001 },
        initialSkillPick: { chosenId: null },
        creatureParty: { active: [], reserves: [] },
      },
    };
    let currentState = initialState;
    let updateUiCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => { updateUiCalls += 1; },
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => ({
        offered: [{ id: 'hpMaster', title: 'HP Master', name: 'HP Master', desc: 'More HP.' }],
      }),
      apiSkillMasterChoose: async () => chooseGate.promise,
    });

    try {
      await renderSkillMaster();
      const choosing = renderedChoices.onSelect(0);
      await Promise.resolve();

      const successorState = {
        phase: 'hub',
        meta: { tutorialStep: 2 },
        run: { stats: { startTime: 8002 }, creatureParty: { active: [], reserves: [] } },
      };
      currentState = successorState;
      chooseGate.resolve({
        state: {
          ...initialState,
          phase: 'friendlyNpc',
          run: { ...initialState.run, initialSkillPick: { chosenId: 'hpMaster' } },
        },
      });
      await choosing;

      assert.equal(currentState, successorState);
      assert.equal(updateUiCalls, 0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('shows the NPC battle skill select prompt with the standard dialogue card', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    let showNarrationCalls = 0;
    const prompt = {
      tokens: [{ base: '能力', text: 'のうりょく' }],
      overrides: { 能力: 'ability' },
    };

    init({
      getGameState: () => ({
        phase: 'npcSkillSelection',
        run: {
          stats: { startTime: 666 },
          creatureParty: { active: [] },
        },
        room: {
          id: 'npc-battle-dialogue',
          type: 'npcBattle',
          npcBattle: {
            skillSelectionPending: true,
            npc: { id: 'nagi', name: 'ナギ', nameEn: 'Nagi' },
          },
        },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => { showNarrationCalls += 1; } },
    });

    let fetchCalls = 0;
    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => {
          fetchCalls += 1;
          return {
            skillSelectPrompt: prompt,
            offered: [
              { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
              { id: 'guard', name: 'Guard', desc: 'Defend' },
              { id: 'haste', name: 'Haste', desc: 'Speed up' },
            ],
          };
        },
        onSkillChosen: async () => {},
      });
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(showNarrationCalls, 0);
    assert.equal(fetchCalls, 1, 'no-session NPC rewards retain the legacy offer API');
    assert.equal(dialogueCalls.length, 1);
    assert.equal(dialogueCalls[0].speaker, 'Nagi');
    assert.equal(dialogueCalls[0].speakerId, 'nagi');
    assert.equal(dialogueCalls[0].tokens, prompt.tokens);
    assert.equal(dialogueCalls[0].overrides, prompt.overrides);
    assert.equal(dialogueCalls[0].useKanji, false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
    assert.match(actionArea.innerHTML, /30% damage/);
  });

  it('uses prepared NPC reward offers without a legacy fetch in a standard session', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const room = {
      id: 'npc-prepared-reward',
      type: 'npcBattle',
      interacted: true,
      npcBattle: { skillSelectionPending: true, rewardResolved: false },
    };
    const payload = {
      kind: 'npcBattle',
      roomId: room.id,
      lifecycle: 'resolved',
      rewardPending: true,
      offered: [{ id: 'hpMaster', title: 'HP Master', name: 'HP Master', desc: 'More HP.' }],
      skillSelectPrompt: { tokens: [{ text: 'Safe prompt' }], overrides: {} },
    };
    const state = {
      phase: 'npc_skill_selection',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        rooms: [room],
        creatureParty: { active: [] },
        exploreRunway: {
          sessionEpoch: 'ese_7777777777777777',
          currentRoom: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            room,
            acceptedActions: ['npcBattleSkill.choose'],
            offlineReady: true,
            interactionPayload: payload,
          }],
        },
      },
    };
    let fetchCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => { actionArea.innerHTML = ''; } },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { fetchCalls += 1; return null; },
      });
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(fetchCalls, 0);
    assert.equal(getExploreSession().isPaused(), false);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
  });

  it('clears and pauses malformed standard NPC reward payloads without fetching', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const room = {
      id: 'npc-malformed-reward',
      type: 'npcBattle',
      interacted: true,
      npcBattle: { skillSelectionPending: true, rewardResolved: false },
    };
    const state = {
      phase: 'npc_skill_selection',
      room,
      run: {
        active: true,
        mode: 'standard',
        currentRoom: 0,
        rooms: [room],
        creatureParty: { active: [] },
        exploreRunway: {
          sessionEpoch: 'ese_8888888888888888',
          currentRoom: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            room,
            acceptedActions: ['npcBattleSkill.choose'],
            offlineReady: false,
            missingPayloadReasons: ['npcBattle.skillSelectPrompt'],
            interactionPayload: {
              kind: 'npcBattle',
              roomId: room.id,
              lifecycle: 'resolved',
              rewardPending: true,
              offered: [],
              skillSelectPrompt: null,
            },
          }],
        },
      },
    };
    let fetchCalls = 0;
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => { actionArea.innerHTML = ''; } },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { fetchCalls += 1; return null; },
      });
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(fetchCalls, 0);
    assert.equal(getExploreSession().isPaused(), true);
    assert.equal(actionArea.innerHTML, '');
    assert.equal(renderedChoices, null);
  });

  it('does not publish NPC reward choices when the session pauses during its prompt', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const owner = makePreparedNpcRewardState('npc-paused-prompt');
    let clearCalls = 0;
    let legacyCalls = 0;
    dialogueGate = deferred();
    init({
      getGameState: () => owner.state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { clearCalls += 1; actionArea.innerHTML = ''; renderedChoices = null; },
      },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      const rendering = renderNpcBattleSkillSelection({
        fetchOffers: async () => { legacyCalls += 1; return null; },
      });
      for (let i = 0; i < 4 && dialogueCalls.length === 0; i += 1) await Promise.resolve();
      assert.equal(dialogueCalls.length, 1, 'reward prompt should be awaiting dismissal');
      getExploreSession().pause('missingPayload');
      dialogueGate.resolve();
      await rendering;
    } finally {
      globalThis.document = originalDocument;
    }

    assert.equal(renderedChoices, null);
    assert.ok(clearCalls > 0);
    assert.equal(legacyCalls, 0);
    assert.equal(getExploreSession().isPaused(), true);
  });

  it('rejects an NPC reward choice after a same-kind capability successor takes ownership', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const ownerA = makePreparedNpcRewardState('npc-owner-a', 0);
    let currentState = ownerA.state;
    let legacyCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; renderedChoices = null; },
      },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { legacyCalls += 1; return null; },
      });
      const ownerChoices = renderedChoices;
      const ownerB = makePreparedNpcRewardState('npc-owner-b', 1);
      currentState = ownerB.state;
      getExploreSession().adoptRunway(ownerB.state.run.exploreRunway);
      await ownerChoices.onSelect(0);

      assert.deepEqual(getExploreSession().snapshot(), []);
      assert.equal(currentState.room.id, ownerB.room.id);
      assert.equal(currentState.room.interacted, true);
      assert.equal(currentState.room.npcBattle.skillSelectionPending, true);
      assert.equal(currentState.run.partySkills.length, 0);
      assert.equal(getExploreSession().isPaused(), false);
      assert.equal(legacyCalls, 0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('replaces cached NPC reward offers and prompt for a new same-room capability', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const roomId = 'npc-same-room-owner';
    let currentState = makePreparedNpcRewardState(roomId, 0, 'alpha').state;
    let legacyCalls = 0;
    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
      apiSyncExploreSession: async request => makeExploreV1OkTransport(request),
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { legacyCalls += 1; return null; },
      });
      assert.match(renderedChoices.cards[0].title, /alpha/);

      currentState = makePreparedNpcRewardState(roomId, 0, 'beta').state;
      getExploreSession().adoptRunway(currentState.run.exploreRunway);
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { legacyCalls += 1; return null; },
      });

      assert.match(renderedChoices.cards[0].title, /beta/);
      assert.match(dialogueCalls.at(-1).tokens[0].text, /beta/);
      assert.equal(legacyCalls, 0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('restarts an orphaned same-owner legacy NPC reward fetch on rerender', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    const state = makeNpcRewardState({ currentRoom: 18, rewardResolved: false });
    state.run.stats = { startTime: 9401 };
    const gates = [];
    let fetchCalls = 0;
    const fetchOffers = async () => {
      fetchCalls += 1;
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    };
    init({
      getGameState: () => state,
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; }, clear: () => {} },
      scene: { showNarration: () => {} },
    });

    try {
      const firstRender = renderNpcBattleSkillSelection({ fetchOffers });
      await Promise.resolve();
      assert.equal(fetchCalls, 1);

      const secondRender = renderNpcBattleSkillSelection({ fetchOffers });
      await Promise.resolve();
      assert.equal(fetchCalls, 2, 'new render must re-own an unresolved cache load');

      gates[1].resolve({
        offered: [{ id: 'hpMaster', title: 'Current reward', desc: 'Current.' }],
      });
      await secondRender;
      const currentChoices = renderedChoices;
      assert.match(currentChoices.cards[0].title, /Current/);

      gates[0].resolve({
        offered: [{ id: 'hpMaster', title: 'Old reward', desc: 'Old.' }],
      });
      await firstRender;
      assert.equal(renderedChoices, currentChoices);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  // Regression (explore subway rooms tier): zero eligible skills must resolve on
  // the server. The client adopts that exact state/runway before proceeding and
  // never clears the still-server-owned reward guard in a local-only draft.
  it('adopts canonical zero-offer resolution before auto-proceeding', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    const canonicalResolvedState = makeNpcRewardState({
      currentRoom: 5,
      rewardResolved: true,
    });
    const events = [];
    let canonicalStateAdopted = false;
    let currentState = makeNpcRewardState({
      currentRoom: 5,
      rewardResolved: false,
    });
    const session = configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    const originalAdopt = session.adoptRunway;
    session.adoptRunway = runway => {
      if (runway === canonicalResolvedState.run.exploreRunway) {
        events.push('adopt-canonical-runway');
      }
      return originalAdopt(runway);
    };

    init({
      getGameState: () => currentState,
      updateGameState: next => {
        if (next === canonicalResolvedState) {
          canonicalStateAdopted = true;
          events.push('update-canonical-state');
        } else if (
          !canonicalStateAdopted
          && next?.room?.npcBattle?.skillSelectionPending === false
        ) {
          events.push('local-clear-before-canonical');
        }
        if (next?.run?.currentRoom === 6) events.push('proceed');
        currentState = next;
      },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; },
      },
      scene: { showNarration: () => {} },
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => ({
          offered: [],
          rewardResolved: true,
          state: canonicalResolvedState,
        }),
      });
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    const updateIndex = events.indexOf('update-canonical-state');
    const adoptIndex = events.indexOf('adopt-canonical-runway');
    const proceedIndex = events.indexOf('proceed');
    assert.ok(updateIndex >= 0, 'the exact canonical response state is adopted');
    assert.ok(adoptIndex > updateIndex, 'the canonical runway follows canonical state adoption');
    assert.ok(proceedIndex > adoptIndex, 'proceed follows canonical state and runway adoption');
    assert.equal(events.includes('local-clear-before-canonical'), false);
    assert.equal(currentState.run.currentRoom, 6);
  });

  it('adopts canonical NPC offer state while the reward remains unresolved', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    const initialState = makeNpcRewardState({ currentRoom: 8, rewardResolved: false });
    const canonicalPendingState = makeNpcRewardState({ currentRoom: 8, rewardResolved: false });
    let currentState = initialState;
    let adoptedCanonicalRunway = false;
    const session = configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    const originalAdopt = session.adoptRunway;
    session.adoptRunway = runway => {
      if (runway === canonicalPendingState.run.exploreRunway) {
        adoptedCanonicalRunway = true;
      }
      return originalAdopt(runway);
    };

    init({
      getGameState: () => currentState,
      updateGameState: next => { currentState = next; },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; },
      },
      scene: { showNarration: () => {} },
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => ({
          offered: [{ id: 'hpMaster', level: 1, title: 'HP Master' }],
          rewardResolved: false,
          state: canonicalPendingState,
        }),
      });
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.equal(currentState, canonicalPendingState);
    assert.equal(adoptedCanonicalRunway, true);
    assert.equal(renderedChoices?.heading, 'Choose a skill');
  });

  it('ignores a stale NPC reward response after canonical room advancement', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    const initialState = makeNpcRewardState({ currentRoom: 11, rewardResolved: false });
    const staleResolvedState = makeNpcRewardState({ currentRoom: 11, rewardResolved: true });
    const advancedState = makeNpcRewardState({ currentRoom: 12, rewardResolved: false });
    let currentState = initialState;
    let resolveOffers;
    let adoptedStaleState = false;
    let adoptedStaleRunway = false;
    const session = configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    const originalAdopt = session.adoptRunway;
    session.adoptRunway = runway => {
      if (runway === staleResolvedState.run.exploreRunway) {
        adoptedStaleRunway = true;
      }
      return originalAdopt(runway);
    };

    init({
      getGameState: () => currentState,
      updateGameState: next => {
        if (next === staleResolvedState) adoptedStaleState = true;
        currentState = next;
      },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; },
      },
      scene: { showNarration: () => {} },
    });

    try {
      const renderPromise = renderNpcBattleSkillSelection({
        fetchOffers: () => new Promise(resolve => { resolveOffers = resolve; }),
      });
      await Promise.resolve();
      assert.equal(typeof resolveOffers, 'function');

      // A sync response advances the canonical state before the older offer
      // request settles, but no rerender has reset the per-room module cache yet.
      currentState = advancedState;
      resolveOffers({
        offered: [],
        rewardResolved: true,
        state: staleResolvedState,
      });
      await renderPromise;
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.equal(adoptedStaleState, false);
    assert.equal(adoptedStaleRunway, false);
    assert.equal(currentState, advancedState);
  });

  // Regression (2026-07-04 dev bug reports): the run-entry initial skill pick
  // fires the skillMaster PHASE while the explore runway's cursor points at
  // room 0 — a different room type. renderSkillMaster consumed room 0's
  // interactionPayload as if it were skill offers: a friendlyNpc room 0
  // rendered its item ids as bare "skills" (tokei/kyoukasho/nooto), and a
  // payload without an offered array (combat/whackAMole/campfire room 0)
  // dead-ended on "Failed to load offers." with a Retry that never reached
  // the network. The initial pick must always fetch real offers via the API.
  it('fetches real offers for the initial pick even when room 0 has a prepared friendlyNpc payload', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };

    configureExploreSession({ syncRequest: async request => makeExploreV1OkTransport(request) });

    let offersCalls = 0;
    init({
      getGameState: () => ({
        phase: 'skillMaster',
        meta: { tutorialStep: 1 },
        run: {
          stats: { startTime: 888 },
          initialSkillPick: { chosenId: null },
          creatureParty: { active: [] },
          exploreRunway: {
            sessionEpoch: 'epoch-initial-pick',
            currentRoom: 0,
            preparedRooms: [{
              index: 0,
              roomId: 'first-friendly',
              actionSeq: 1,
              room: { id: 'first-friendly', type: 'friendlyNpc' },
              interactionPayload: {
                kind: 'friendlyNpc',
                npc: { id: 'ami' },
                offered: [{ id: 'tokei' }, { id: 'kyoukasho' }, { id: 'nooto' }],
              },
              acceptedActions: ['friendlyNpc.choose', 'proceed'],
            }],
          },
        },
        room: { id: 'first-friendly', type: 'friendlyNpc' },
      }),
      updateGameState: () => {},
      updateUI: () => {},
      actions: { setContent: html => { actionArea.innerHTML = html; } },
      scene: { showNarration: () => {} },
      apiSkillMasterOffers: async () => {
        offersCalls += 1;
        return {
          offered: [
            { id: 'arcStrike', level: 1, name: 'Arc Strike', title: 'Arc Strike - Lvl. 1', desc: 'Your attacks arc to another enemy for 30% damage.' },
            { id: 'guard', name: 'Guard', desc: 'Defend' },
            { id: 'haste', name: 'Haste', desc: 'Speed up' },
          ],
        };
      },
    });

    try {
      await renderSkillMaster();
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.equal(offersCalls, 1, "initial pick must fetch skill offers from the API, not consume room 0's prepared payload");
    assert.equal(renderedChoices?.heading, 'Choose a skill');
    assert.match(actionArea.innerHTML, /Arc Strike - Lvl\. 1/);
    assert.doesNotMatch(actionArea.innerHTML, /tokei/);
  });

  it('optimistically applies one HP Master level before marking Skill Master complete', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    const room = {
      id: 'skill-parity-room',
      type: 'skillMaster',
      interacted: false,
      skillMaster: { completed: false, chosenId: null },
    };
    let state = {
      phase: 'skillMaster',
      meta: { tutorialStep: 1 },
      room,
      run: {
        active: true,
        mode: 'standard',
        stats: { startTime: 901 },
        currentRoom: 0,
        roomActionSeq: 0,
        initialSkillPick: { chosenId: 'arcStrike' },
        partySkills: [],
        creatureParty: {
          active: [{ id: 'hi', hp: 80, maxHp: 100 }],
          reserves: [],
        },
        rooms: [structuredClone(room)],
        exploreRunway: {
          sessionEpoch: 'ese_skillparity111',
          currentRoom: 0,
          roomActionSeq: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            actionSeq: 0,
            room: structuredClone(room),
            acceptedActions: ['skillMaster.choose', 'proceed'],
            actionEffects: {
              'skillMaster.choose': ['partySkills'],
              proceed: ['areaProgress'],
            },
            dependencies: ['partySkills'],
            offlineReady: true,
            interactionPayload: {
              kind: 'skillMaster',
              roomId: room.id,
              offered: [{ id: 'hpMaster', level: 1, title: 'HP Master', name: 'HP Master', desc: 'More HP.' }],
              skillSelectPrompt: { tokens: [{ text: 'Safe prompt' }], overrides: {} },
              completed: false,
              chosenId: null,
            },
          }],
        },
      },
    };
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    init({
      getGameState: () => state,
      updateGameState: next => { state = next; },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; },
      },
      scene: { showNarration: () => {} },
    });

    try {
      await renderSkillMaster();
      await renderedChoices.onSelect(0);
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.deepEqual(state.run.partySkills, [{ id: 'hpMaster', level: 1 }]);
    assert.equal(state.run.creatureParty.active[0].maxHp, 125);
    assert.equal(state.run.creatureParty.active[0].hp, 100);
  });

  it('optimistically applies one HP Master level for an NPC battle reward', async () => {
    const originalDocument = globalThis.document;
    const actionArea = createElementStub();
    const room = {
      id: 'npc-skill-parity-room',
      type: 'npcBattle',
      interacted: true,
      npcBattle: { skillSelectionPending: true },
    };
    let state = {
      phase: 'npc_skill_selection',
      room,
      run: {
        active: true,
        mode: 'standard',
        stats: { startTime: 902 },
        currentRoom: 0,
        roomActionSeq: 0,
        partySkills: [],
        creatureParty: {
          active: [{ id: 'hi', hp: 80, maxHp: 100 }],
          reserves: [],
        },
        rooms: [structuredClone(room)],
        exploreRunway: {
          sessionEpoch: 'ese_npcskillpar11',
          currentRoom: 0,
          roomActionSeq: 0,
          preparedRooms: [{
            index: 0,
            roomId: room.id,
            actionSeq: 0,
            room: structuredClone(room),
            acceptedActions: ['npcBattleSkill.choose'],
            actionEffects: { 'npcBattleSkill.choose': ['partySkills'] },
            dependencies: ['partySkills'],
            offlineReady: true,
            interactionPayload: {
              kind: 'npcBattle',
              roomId: room.id,
              lifecycle: 'resolved',
              rewardPending: true,
              offered: [{ id: 'hpMaster', level: 1, title: 'HP Master', name: 'HP Master', desc: 'More HP.' }],
              skillSelectPrompt: { tokens: [{ text: 'Safe prompt' }], overrides: {} },
            },
          }],
        },
      },
    };
    globalThis.document = {
      getElementById: id => (id === 'action-area' ? actionArea : null),
      createElement: () => createElementStub(),
    };
    configureExploreSession({
      syncRequest: async request => makeExploreV1OkTransport(request),
    });
    init({
      getGameState: () => state,
      updateGameState: next => { state = next; },
      updateUI: () => {},
      actions: {
        setContent: html => { actionArea.innerHTML = html; },
        clear: () => { actionArea.innerHTML = ''; },
      },
      scene: { showNarration: () => {} },
    });

    try {
      await renderNpcBattleSkillSelection({
        fetchOffers: async () => { throw new Error('prepared payload expected'); },
      });
      await renderedChoices.onSelect(0);
    } finally {
      globalThis.document = originalDocument;
      resetExploreSession();
    }

    assert.deepEqual(state.run.partySkills, [{ id: 'hpMaster', level: 1 }]);
    assert.equal(state.run.creatureParty.active[0].maxHp, 125);
    assert.equal(state.run.creatureParty.active[0].hp, 100);
  });
});
