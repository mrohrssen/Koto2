import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {
  constructor() { this.children = []; this.parent = null; this._destroyed = false; this.visible = true; }
  addChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    if (c.parent === this) c.parent = null;
    return c;
  }
  removeChildren() { for (const c of this.children) { if (c.parent === this) c.parent = null; } this.children = []; }
  destroy() { this._destroyed = true; }
}

await mock.module('pixi.js', { namedExports: { Container: FakeContainer } });
// Stub the pixi/app + pixi/tween modules that scene.js pulls in — otherwise
// the real modules load and drag in effects.js which requires `Graphics` from
// pixi.js (not provided by the minimal Container-only stub above).
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({
      app: { screen: { width: 400, height: 600 }, ticker: { add() {}, remove() {} } },
      layers: { labels: new FakeContainer(), effects: new FakeContainer(), creatures: new FakeContainer() },
    }),
  },
});
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: { tween: () => Promise.resolve(), wait: () => Promise.resolve() },
});
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: { startParallax: () => {}, stopParallax: () => {} },
});
const formationMock = await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: {
    createFormationContext: (scene) => ({
      scene,
      playerContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
      enemyContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
      creatureSprites: { player: new Map(), enemy: new Map() },
      lastFormationInput: { player: null, enemy: null },
      walkingEnabled: false,
      walkTime: 0,
    }),
    _updateFormations: () => {},
    spawnFormationSprite: async () => null,
    removeFormationSprite: () => {},
    updateFormationSprite: () => {},
    // scene.js imports these for showNpcSprite / hideNpcSprite.
    spawnNpcSprite: async () => null,
    removeNpcSprite: () => {},
  },
});
await mock.module('../../../public/js/ui/creature-row.js', {
  namedExports: { setupCreatureRowListeners: () => {} },
});

const { HubScene } = await import('../../../public/js/scenes/hub-scene.js');

function makeFakeApp() {
  return {
    ticker: { add() {}, remove() {} },
    stage: new FakeContainer(),
    screen: { width: 400, height: 600 },
  };
}

describe('HubScene', () => {
  it('exposes background, npcs, formations, labels layers', () => {
    const scene = new HubScene(makeFakeApp());
    assert.ok(scene.layers.background, 'background layer present');
    assert.ok(scene.layers.npcs,       'npcs layer present');
    assert.ok(scene.layers.formations, 'formations layer present');
    assert.ok(scene.layers.labels,     'labels layer present');
    scene.exit();
  });

  it('syncCreatures is callable (delegates to formation ctx)', async () => {
    const scene = new HubScene(makeFakeApp());
    await scene.enter({ allies: [] });
    await assert.doesNotReject(() => scene.syncCreatures({ allies: [] }));
    scene.exit();
  });

  it('dispose clears scene.npcSprite and marks disposed', async () => {
    const scene = new HubScene(makeFakeApp());
    await scene.enter({ allies: [] });
    scene.exit();
    assert.strictEqual(scene.disposed, true);
    assert.strictEqual(scene.npcSprite, null);
  });

  it('syncCreatures with one ally records it in spritesByUid via formation ctx', async () => {
    // Intercept spawnFormationSprite so we don't rely on Pixi asset loading.
    // The real formation.spawnFormationSprite returns a Sprite; we return a
    // sentinel so the test asserts the plumbing, not the rendering.
    const sentinel = { _uid: 'hi-1' };
    // node:test forbids re-mocking an already-mocked module; restore the
    // file-level formation mock before re-mocking with sibling-safe stubs.
    formationMock.restore();
    await mock.module('../../../public/js/pixi/formation.js', {
      namedExports: {
        createFormationContext: (scene) => ({
          scene,
          playerContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
          enemyContainer: scene.addContainer(new FakeContainer(), scene.layers.formations),
          creatureSprites: { player: new Map(), enemy: new Map() },
          lastFormationInput: { player: null, enemy: null },
          walkingEnabled: false,
          walkTime: 0,
        }),
        _updateFormations: () => {},
        spawnFormationSprite: async () => sentinel,
        removeFormationSprite: () => {},
        updateFormationSprite: () => {},
        // spawnNpcSprite + removeNpcSprite are imported by base Scene and
        // must be mocked even though this test doesn't exercise NPC paths.
        spawnNpcSprite: async () => null,
        removeNpcSprite: () => {},
      },
    });
    const { HubScene: HS } = await import(`../../../public/js/scenes/hub-scene.js?v=${Date.now()}`);
    const scene = new HS(makeFakeApp());
    await scene.enter({ allies: [{ uid: 'hi-1', id: 'hi', hp: 10, maxHp: 10 }] });
    assert.strictEqual(scene.spritesByUid.size, 1, 'sprite recorded');
    assert.strictEqual(scene.spritesByUid.get('hi-1'), sentinel);
    scene.exit();
  });
});
