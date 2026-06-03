import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: {
    hideFormation: () => {},
    showFormation: async () => {},
  },
});

await mock.module('../../../public/js/ui/exploration-dom.js', {
  namedExports: {
    showNpcTrainer: () => roomTransitionEvents.push('showNpcTrainer'),
    showNpcInDisplay: () => roomTransitionEvents.push('showNpcInDisplay'),
    showDealer: () => roomTransitionEvents.push('showDealer'),
  },
});

await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: { SPRITE_VERSION: 'test' },
});

// tts.js is loaded transitively through dev's npc-dialogue-card path
// (which calls playDialogueAudio) as well as room-transition's speakText
// fallback. Single mock with both exports.
await mock.module('../../../public/js/tts.js', {
  namedExports: {
    speakText: () => {},
    playDialogueAudio: () => {},
    playDialogueLineAudio: async () => null,
    playNeutralLearnAudio: async () => null,
  },
});

await mock.module('../../../public/js/ui/narration-box.js', {
  namedExports: {
    forceHide: () => {},
    show: async () => {},
  },
});

await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderEnFirst: (value) => value,
    renderJpSentence: () => '',
    getKnownWords: () => [],
    addKnownWord: () => {},
    esc: (value) => value,
  },
});

// Stub transitive imports that the merged dev's NPC dialogue card path
// pulls in via room-transition.js → npc-dialogue-card.js. The scroll-state
// test only needs setScrollState side effects, so these can be inert.
await mock.module('../../../public/js/ui/dialogue-word-lookup.js', {
  namedExports: { attachWordLookup: () => {} },
});
await mock.module('../../../public/js/api.js', {
  namedExports: {
    translateDialogue: async () => ({ translation: '' }),
    learnDialogue: async () => ({ ok: false, error: 'learn_lesson_unavailable' })
  },
});

const combatEvents = { emitted: [], emit: (event) => combatEvents.emitted.push(event) };
await mock.module('../../../public/js/ui/combat-events.js', {
  namedExports: { combatEvents },
});

const roomTransitionEvents = [];
const scrollStates = [];
const startedSpeeds = [];
const ingredientPopupCalls = [];
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    setScrollState: (state) => {
      roomTransitionEvents.push(`setScrollState:${state}`);
      scrollStates.push(state);
    },
    startParallax: (speed) => {
      roomTransitionEvents.push(`startParallax:${speed}`);
      startedSpeeds.push(speed);
    },
    EXPLORATION_SCROLL_SPEED: 0.6,
    ROOM_TRAVEL_DURATION_MS: 2700,
    ROOM_TRAVEL_SCROLL_SPEED: 3.8,
    BATTLE_SKY_DRIFT_SPEED: 0.4,
  },
});

class FakeExplorationScene {
  constructor() {
    this.resetCalls = [];
  }
  async resetForRoom(opts) {
    this.resetCalls.push(opts);
  }
  async showNpcSprite() {
    roomTransitionEvents.push('showNpcSprite');
  }
}

const fakeManager = {
  currentScene: null,
  transitioning: false,
  waitForIdle: null,
  transitionCalls: [],
  async transition(SceneClass) {
    this.transitionCalls.push(SceneClass);
    this.currentScene = new SceneClass();
  },
};

await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: FakeExplorationScene },
});

await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => fakeManager },
});

await mock.module('../../../public/js/ui/word-level-up.js', {
  namedExports: {
    showIngredientDropPopups: (drops, opts) => ingredientPopupCalls.push({ drops, opts }),
  },
});

const { playRoomTransition } = await import('../../../public/js/ui/room-transition.js');

function makeTransitionState({
  currentRoom = 0,
  rooms = [{ type: 'empty' }],
  allies = [{ uid: 'ally', id: 'hi' }],
} = {}) {
  return {
    room: rooms[currentRoom] ?? rooms[0] ?? null,
    run: {
      currentRoom,
      creatureParty: { active: allies },
      totalRooms: rooms.length,
      revealedRooms: rooms.map((room, index) => ({ index, room })),
    },
  };
}

describe('playRoomTransition parallax state', () => {
  it('sets scrolling while entering the next room so the battleground moves', async () => {
    scrollStates.length = 0;
    combatEvents.emitted.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition(makeTransitionState({
      rooms: [{ type: 'encounter' }],
    }), {
      waitFn: async () => {},
    });

    assert.equal(scrollStates[0], 'scrolling');
    assert.deepEqual(combatEvents.emitted, ['explore']);
  });

  it('resets an existing exploration scene in place so player sprites do not disappear between rooms', async () => {
    scrollStates.length = 0;
    combatEvents.emitted.length = 0;
    fakeManager.transitionCalls.length = 0;
    const existingScene = new FakeExplorationScene();
    fakeManager.currentScene = existingScene;
    const allies = [{ uid: 'ally', id: 'hi' }];

    await playRoomTransition(makeTransitionState({
      currentRoom: 1,
      rooms: [{ type: 'empty' }, { type: 'friendlyNpc' }],
      allies,
    }), {
      waitFn: async () => {},
    });

    assert.equal(fakeManager.transitionCalls.length, 0);
    assert.equal(existingScene.resetCalls.length, 1);
    assert.deepEqual(existingScene.resetCalls[0], {
      roomId: 1,
      allies,
      parallaxSpeed: 3.8,
    });
  });

  it('waits for an in-flight scene transition before resetting the next room', async () => {
    scrollStates.length = 0;
    combatEvents.emitted.length = 0;
    fakeManager.transitionCalls.length = 0;
    fakeManager.currentScene = null;
    fakeManager.transitioning = true;
    const existingScene = new FakeExplorationScene();
    const events = [];
    fakeManager.waitForIdle = async () => {
      events.push('waitForIdle');
      fakeManager.transitioning = false;
      fakeManager.currentScene = existingScene;
    };
    const allies = [{ uid: 'ally', id: 'hi' }];

    await playRoomTransition(makeTransitionState({
      currentRoom: 1,
      rooms: [{ type: 'empty' }, { type: 'encounter' }],
      allies,
    }), {
      waitFn: async () => {},
    });

    assert.deepEqual(events, ['waitForIdle']);
    assert.equal(fakeManager.transitionCalls.length, 0);
    assert.equal(existingScene.resetCalls.length, 1);
    assert.deepEqual(existingScene.resetCalls[0], {
      roomId: 1,
      allies,
      parallaxSpeed: 3.8,
    });
    fakeManager.waitForIdle = null;
  });

  it('uses approved room travel speed and duration before restoring exploration speed', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;
    fakeManager.transitioning = false;
    const waits = [];

    await playRoomTransition(makeTransitionState({
      rooms: [{ type: 'empty' }],
    }), {
      waitFn: async (ms) => waits.push(ms),
    });

    assert.equal(startedSpeeds[0], 3.8);
    assert.deepEqual(waits, [2700]);
    assert.equal(scrollStates.at(-1), 'stopped');
    assert.equal(startedSpeeds.at(-1), 0.6);
  });

  it('delays support-room sprite arrival until after the travel wait', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition(makeTransitionState({
      rooms: [{
        type: 'friendlyNpc',
        npc: { id: 'nagi', name: 'ナギ', nameEn: 'Nagi' },
      }],
    }), {
      waitFn: async (ms) => roomTransitionEvents.push(`wait:${ms}`),
    });

    assert.deepEqual(roomTransitionEvents, [
      'setScrollState:scrolling',
      'startParallax:3.8',
      'wait:2700',
      'setScrollState:stopped',
      'startParallax:0.6',
      'showNpcTrainer',
      'showNpcSprite',
    ]);
  });

  it('does not spawn the campfire during room travel because the campfire UI owns that sprite', async () => {
    scrollStates.length = 0;
    startedSpeeds.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition(makeTransitionState({
      rooms: [{ type: 'campfire' }],
    }), {
      waitFn: async (ms) => roomTransitionEvents.push(`wait:${ms}`),
    });

    assert.deepEqual(roomTransitionEvents, [
      'setScrollState:scrolling',
      'startParallax:3.8',
      'wait:2700',
      'setScrollState:stopped',
      'startParallax:0.6',
    ]);
  });

  it('schedules ingredient drops at evenly spaced points during room travel', async () => {
    ingredientPopupCalls.length = 0;
    roomTransitionEvents.length = 0;
    fakeManager.currentScene = null;

    const ingredientDrops = [
      { ingredient: { nameEn: 'Water' }, quantity: 1 },
      { ingredient: { nameEn: 'Miso' }, quantity: 1 },
    ];

    await playRoomTransition(makeTransitionState({
      rooms: [{ type: 'empty' }],
    }), {
      ingredientDrops,
      waitFn: async (ms) => roomTransitionEvents.push(`wait:${ms}`),
    });

    assert.equal(ingredientPopupCalls.length, 1);
    assert.equal(ingredientPopupCalls[0].drops, ingredientDrops);
    assert.deepEqual(ingredientPopupCalls[0].opts.delaysMs, [900, 1800]);
    assert.deepEqual(roomTransitionEvents.slice(0, 3), [
      'setScrollState:scrolling',
      'startParallax:3.8',
      'wait:2700',
    ]);
  });

  it('does not schedule ingredient popups when no drops are present', async () => {
    ingredientPopupCalls.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition(makeTransitionState({
      rooms: [{ type: 'empty' }],
    }), {
      ingredientDrops: [],
      waitFn: async () => {},
    });

    assert.equal(ingredientPopupCalls.length, 0);
  });
});
