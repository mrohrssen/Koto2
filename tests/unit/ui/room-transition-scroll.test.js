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

await mock.module('../../../public/js/tts.js', {
  namedExports: { speakText: () => {} },
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
  async showNpcSprite() {}
}

const fakeManager = {
  currentScene: null,
  async transition(SceneClass) {
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
});
