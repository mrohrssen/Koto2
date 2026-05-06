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
    showNpcTrainer: () => {},
    showNpcInDisplay: () => {},
    showDealer: () => {},
  },
});

await mock.module('../../../public/js/ui/sprite-utils.js', {
  namedExports: { SPRITE_VERSION: 'test' },
});

// tts.js is loaded transitively through dev's npc-dialogue-card path
// (which calls playDialogueAudio) as well as room-transition's speakText
// fallback. Single mock with both exports.
await mock.module('../../../public/js/tts.js', {
  namedExports: { speakText: () => {}, playDialogueAudio: () => {} },
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

const scrollStates = [];
const startedSpeeds = [];
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    setScrollState: (state) => scrollStates.push(state),
    startParallax: (speed) => startedSpeeds.push(speed),
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
  async showNpcSprite() {}
}

const fakeManager = {
  currentScene: null,
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

const { playRoomTransition } = await import('../../../public/js/ui/room-transition.js');

describe('playRoomTransition parallax state', () => {
  it('sets scrolling while entering the next room so the battleground moves', async () => {
    scrollStates.length = 0;
    combatEvents.emitted.length = 0;
    fakeManager.currentScene = null;

    await playRoomTransition({
      run: {
        currentRoom: 0,
        creatureParty: { active: [{ uid: 'ally', id: 'hi' }] },
        rooms: [{ type: 'encounter' }],
      },
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

    await playRoomTransition({
      run: {
        currentRoom: 1,
        creatureParty: { active: allies },
        rooms: [{ type: 'empty' }, { type: 'friendlyNpc' }],
      },
    });

    assert.equal(fakeManager.transitionCalls.length, 0);
    assert.equal(existingScene.resetCalls.length, 1);
    assert.deepEqual(existingScene.resetCalls[0], {
      roomId: 1,
      allies,
    });
  });
});
