import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Bug #9 regression guard: when a mini-boss encounter starts with an NPC
// intro, enemies must NOT be on stage while the NPC is speaking. The fix
// mounts BattleScene with enemies:[] and then calls scene.syncCreatures
// AFTER the NPC intro completes, so enemies slide in only after the NPC has
// slid out.
//
// We test playNpcBattleIntro's call sequence: show NPC → narrate → hide NPC →
// reveal enemies via syncCreatures.

const sceneManagerState = { currentScene: null };
const dialogueCards = [];
await mock.module('../../../public/js/scenes/scene-manager.js', {
  namedExports: { getSceneManager: () => sceneManagerState },
});

await mock.module('../../../public/js/ui/combat-dom.js', {
  namedExports: { showFormation: () => {}, hideFormation: () => {} },
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

// Stub narration-box. `show` resolves immediately and records the call.
const narrationLog = [];
await mock.module('../../../public/js/ui/narration-box.js', {
  namedExports: {
    show: async (text, opts) => { narrationLog.push({ text, opts }); },
    forceHide: () => {},
  },
});

await mock.module('../../../public/js/ui/npc-dialogue-card.js', {
  namedExports: {
    showNpcDialogueCard: async options => { dialogueCards.push(options); },
  },
});

await mock.module('../../../public/js/ui/bootstrap-client.js', {
  namedExports: {
    renderEnFirst: (s) => s,
    renderJpSentence: (tokens) => tokens.map(t => t.text || t.surface || '').join(''),
    getKnownWords: () => new Set(),
  },
});

await mock.module('../../../public/js/ui/combat-events.js', {
  namedExports: { combatEvents: { emit: () => {} } },
});

await mock.module('../../../public/js/scenes/exploration-scene.js', {
  namedExports: { ExplorationScene: class {} },
});

const {
  playNpcBattleIntro,
  playTutorialBossInterjection,
} = await import('../../../public/js/ui/room-transition.js');

function buildMockScene(callLog) {
  const scene = {
    disposed: false,
    _exiting: false,
    layers: { npcs: {} },
    npcSprite: null,
    async showNpcSprite(sprite, opts) {
      callLog.push(['showNpcSprite', sprite, opts]);
      scene.npcSprite = { sprite, opts };
    },
    async hideNpcSprite(opts) {
      callLog.push(['hideNpcSprite', opts]);
      scene.npcSprite = null;
    },
    async syncCreatures(args) {
      callLog.push(['syncCreatures', args]);
    },
  };
  return scene;
}

describe('playNpcBattleIntro (Bug #9 fix)', () => {
  beforeEach(() => {
    sceneManagerState.currentScene = null;
    narrationLog.length = 0;
    dialogueCards.length = 0;
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = { getElementById: () => null };
    }
  });

  it('reveals enemies via syncCreatures AFTER NPC slides out, when enemies opt is provided', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    sceneManagerState.currentScene = scene;

    const npcData = {
      id: 'kodomo',
      nameEn: 'Child',
      name: 'こども',
      greeting: 'いくよ！',
    };
    const enemies = [
      { uid: 'e1', id: 'tetsu', hp: 10, maxHp: 10 },
      { uid: 'e2', id: 'tetsu', hp: 10, maxHp: 10 },
      { uid: 'e3', id: 'tetsu', hp: 10, maxHp: 10 },
    ];
    const allies = [{ uid: 'a1', id: 'hi', hp: 10, maxHp: 10 }];

    await playNpcBattleIntro(
      npcData,
      () => {},  // showNpcSpriteFn (DOM side)
      () => {},  // hideNpcSpriteFn (DOM side)
      null,      // npcDialogue — legacy greeting path
      { enemies, allies },
    );

    // Extract scene-API call order (drop any other ops).
    const sceneOps = callLog
      .filter(e => ['showNpcSprite', 'hideNpcSprite', 'syncCreatures'].includes(e[0]))
      .map(e => e[0]);

    assert.deepEqual(sceneOps, [
      'showNpcSprite',
      'hideNpcSprite',
      'syncCreatures',
    ], 'expected: NPC shows → hides → enemies sync');

    // syncCreatures must carry the full enemies array (so they slide in).
    const syncCall = callLog.find(e => e[0] === 'syncCreatures');
    assert.equal(syncCall[1].enemies.length, 3, 'all 3 enemies revealed after NPC intro');
    assert.equal(syncCall[1].allies.length, 1, 'allies forwarded to sync');
    assert.equal(syncCall[1].initial, true, 'initial:true so enemies trigger slide-in animation');
  });

  it('does NOT call syncCreatures when enemies opt is not provided (back-compat: normal NPC intro paths)', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    sceneManagerState.currentScene = scene;

    const npcData = { id: 'kodomo', nameEn: 'Child', name: 'こども', greeting: 'hi' };
    await playNpcBattleIntro(npcData, () => {}, () => {}, null);

    // No syncCreatures call — enemies are assumed to have been placed by the
    // BattleScene mount already (the pre-fix path still works for any caller
    // that hasn't migrated to the new choreography).
    const syncCalls = callLog.filter(e => e[0] === 'syncCreatures');
    assert.equal(syncCalls.length, 0, 'no syncCreatures without enemies opt');
  });

  it('gracefully skips syncCreatures when scene exited during narration', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    sceneManagerState.currentScene = scene;

    // Swap scene to null mid-flight to simulate a scene transition that
    // raced with the narration. playNpcBattleIntro must not throw when it
    // tries to syncCreatures against a missing scene.
    const origShow = scene.showNpcSprite;
    scene.showNpcSprite = async (...args) => {
      await origShow.call(scene, ...args);
      sceneManagerState.currentScene = null;  // scene disappears
    };

    const npcData = { id: 'kodomo', nameEn: 'Child', name: 'こども', greeting: 'hi' };
    await assert.doesNotReject(() =>
      playNpcBattleIntro(npcData, () => {}, () => {}, null, {
        enemies: [{ uid: 'e1' }],
        allies: [],
      })
    );
  });

  it('shows the English strength prompt as a separate line after the word-gated fight start line', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    sceneManagerState.currentScene = scene;

    const npcData = { id: 'kodomo', nameEn: 'Child', name: 'こども', greeting: 'hi' };
    await playNpcBattleIntro(
      npcData,
      () => {},
      () => {},
      {
        fightStart: {
          tokens: [{ text: '行くよ！' }],
          overrides: {},
        },
        useKanji: false,
      },
    );

    assert.equal(dialogueCards[0].speaker, 'Child');
    assert.deepEqual(dialogueCards[0].tokens, [{ text: '行くよ！' }]);
    assert.equal(dialogueCards[1].speaker, 'Child');
    assert.equal(dialogueCards[1].text, "Let's see how strong you are!");
    assert.equal(narrationLog.length, 0);
  });
});

describe('playTutorialBossInterjection', () => {
  beforeEach(() => {
    sceneManagerState.currentScene = null;
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = { getElementById: () => null };
    }
  });

  it('settles on the boss, plays Cid like an NPC skill interjection, then restores enemies', async () => {
    const callLog = [];
    const scene = buildMockScene(callLog);
    scene.formation = {
      enemyContainer: { visible: true },
      creatureSprites: { enemy: new Map() },
    };
    sceneManagerState.currentScene = scene;
    globalThis.document = { getElementById: () => null };

    const lines = [
      'Hey, this creature looks strong.',
      'Try using your strongest creature first.',
    ];
    const enemies = [{ uid: 'boss', id: 'hinoneko', hp: 20, maxHp: 20 }];

    await playTutorialBossInterjection(
      lines,
      () => callLog.push(['domShowCid']),
      () => callLog.push(['domHideCid']),
      async (line, opts) => {
        callLog.push(['narration', line, opts]);
        callLog.push(['enemyVisibleDuringNarration', scene.formation.enemyContainer.visible]);
      },
      enemies,
      { waitFn: async (ms) => callLog.push(['wait', ms]) },
    );

    assert.deepEqual(callLog.map(([op]) => op), [
      'wait',
      'domShowCid',
      'showNpcSprite',
      'narration',
      'enemyVisibleDuringNarration',
      'narration',
      'enemyVisibleDuringNarration',
      'hideNpcSprite',
      'domHideCid',
    ]);
    assert.deepEqual(callLog[0], ['wait', 500]);
    assert.equal(callLog[4][1], false, 'enemy formation hidden while Cid speaks');
    assert.equal(callLog[6][1], false, 'enemy formation stays hidden for all Cid lines');
    assert.equal(scene.formation.enemyContainer.visible, true, 'enemy formation restored after Cid leaves');
  });
});
