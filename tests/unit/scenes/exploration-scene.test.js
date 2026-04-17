import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Stub pixi.js ------------------------------------------------------------

class FakeContainer {
  constructor() {
    this.children = [];
    this.parent = null;
    this.visible = true;
    this._destroyed = false;
  }
  addChild(c) { this.children.push(c); c.parent = this; return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    if (c.parent === this) c.parent = null;
    return c;
  }
  removeChildren() {
    for (const c of this.children) { if (c.parent === this) c.parent = null; }
    this.children = [];
  }
  destroy() { this._destroyed = true; }
}

class FakeSprite extends FakeContainer {
  constructor(texture) {
    super();
    this.texture = texture;
    this.anchor = { set: (x, y) => { this.anchor.x = x; this.anchor.y = y ?? x; } };
    this.scale = {
      x: 1, y: 1,
      set(sx, sy) { this.x = sx; this.y = sy ?? sx; },
    };
    this.width = 0; this.height = 0;
    this.x = 0; this.y = 0;
    this.alpha = 1; this.tint = 0xFFFFFF; this.rotation = 0;
  }
}
class FakeGraphics extends FakeContainer { circle(){return this;} roundRect(){return this;} fill(){return this;} stroke(){return this;} }
class FakeText extends FakeContainer { constructor(opts){ super(); this.text = opts?.text ?? ''; this.width = this.text.length * 6; this.height = 10; } }

const FakeTexture = { WHITE: { width: 60, height: 60 } };
const FakeAssets = {
  _loadImpl: async () => ({ width: 60, height: 60 }),
  load(path) { return FakeAssets._loadImpl(path); },
};

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    Container: FakeContainer,
    Graphics: FakeGraphics,
    Text: FakeText,
    Texture: FakeTexture,
    Assets: FakeAssets,
  },
});

let fakeAppState = {
  app: {
    screen: { width: 400, height: 600 },
    ticker: { add: () => {}, remove: () => {} },
  },
  layers: {
    labels: new FakeContainer(),
    effects: new FakeContainer(),
    creatures: new FakeContainer(),
  },
};
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: { getApp: () => fakeAppState },
});

await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: {
    tween: () => Promise.resolve(),
    wait: () => Promise.resolve(),
  },
});

// ExplorationScene calls start/stopParallax; stub them.
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    startParallax: () => {},
    stopParallax: () => {},
    resizeParallax: () => {},
  },
});

await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: {
    STATUS_ICON_CONFIG: {},
  },
});

// creature-row.setupCreatureRowListeners reads dom.playerFormation — stub out.
await mock.module('../../../public/js/ui/creature-row.js', {
  namedExports: {
    setupCreatureRowListeners: () => {},
  },
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };
}

const { ExplorationScene } = await import('../../../public/js/scenes/exploration-scene.js');


function makeFakeApp() {
  const listeners = new Set();
  return {
    ticker: {
      add: (fn) => listeners.add(fn),
      remove: (fn) => listeners.delete(fn),
      get count() { return listeners.size; },
    },
    stage: new FakeContainer(),
    screen: { width: 400, height: 600 },
  };
}


describe('ExplorationScene.syncCreatures', () => {
  it('spawns player sprites on initial sync', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    await scene.enter({ roomId: 'room-1', allies: [] });

    const c1 = { uid: 'c1', id: 'a' };
    const c2 = { uid: 'c2', id: 'b' };
    await scene.syncCreatures({ allies: [c1, c2], initial: false });

    assert.strictEqual(scene.formation.creatureSprites.player.size, 2, 'player map has two sprites');
    assert.ok(scene.spritesByUid.has('c1'), 'c1 in scene lookup');
    assert.ok(scene.spritesByUid.has('c2'), 'c2 in scene lookup');
    // Exploration has no enemy side — the map should stay empty.
    assert.strictEqual(scene.formation.creatureSprites.enemy.size, 0);

    scene.exit();
  });

  it('ignores enemies param for API parity with BattleScene', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    await scene.enter({ roomId: 'room-1', allies: [] });

    const c1 = { uid: 'c1', id: 'a' };
    const e1 = { uid: 'e1', id: 'x' };
    // Pass enemies even though ExplorationScene doesn't have enemy formation.
    await scene.syncCreatures({ allies: [c1], enemies: [e1] });

    assert.strictEqual(scene.formation.creatureSprites.player.size, 1);
    assert.strictEqual(scene.formation.creatureSprites.enemy.size, 0, 'enemies ignored');

    scene.exit();
  });

  it('removes sprites for uids no longer present', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    await scene.enter({ roomId: 'room-1', allies: [] });

    const c1 = { uid: 'c1', id: 'a' };
    const c2 = { uid: 'c2', id: 'b' };
    await scene.syncCreatures({ allies: [c1, c2], initial: true });
    assert.strictEqual(scene.formation.creatureSprites.player.size, 2);

    // Remove c1 from the party.
    await scene.syncCreatures({ allies: [c2] });
    assert.strictEqual(scene.formation.creatureSprites.player.size, 1);
    assert.ok(!scene.formation.creatureSprites.player.has('c1'));
    assert.ok(!scene.spritesByUid.has('c1'));

    scene.exit();
  });

  it('onEnter syncs initial allies from opts', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    const c1 = { uid: 'c1', id: 'a' };
    const c2 = { uid: 'c2', id: 'b' };
    await scene.enter({ roomId: 'room-1', allies: [c1, c2] });

    assert.strictEqual(scene.formation.creatureSprites.player.size, 2);
    assert.strictEqual(scene.spritesByUid.size, 2);

    scene.exit();
  });

  it('beforeExit clears spritesByUid (registry handles PIXI disposal)', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    await scene.enter({ roomId: 'room-1', allies: [{ uid: 'c1', id: 'a' }] });
    assert.strictEqual(scene.spritesByUid.size, 1);

    scene.exit();
    assert.strictEqual(scene.spritesByUid.size, 0);
    assert.strictEqual(scene.disposed, true);
  });

  it('onEnter registers a formation updater (walk wobble)', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    await scene.enter({ roomId: 'room-1', allies: [] });

    assert.strictEqual(scene.registry.updaters.size, 1, 'one updater registered');
    assert.strictEqual(scene.formation.walkingEnabled, true, 'walking is on by default');

    scene.exit();
  });

  it('discoveryState is scene-owned (fresh scene = fresh state)', async () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    assert.ok(scene.discoveryState, 'discoveryState initialized');
    assert.strictEqual(scene.discoveryState.fetched, false);
    assert.strictEqual(scene.discoveryState.wordsLearned, 0);
    assert.strictEqual(scene.shrineInProgress, false, 'shrineInProgress initialized');
  });

  it('layers include npcs (for base Scene NPC sprite API)', () => {
    const app = makeFakeApp();
    const scene = new ExplorationScene(app);
    assert.ok(scene.layers.npcs, 'npcs layer exists');
    // NPC sprite API comes from Scene base class now.
    assert.strictEqual(typeof scene.showNpcSprite, 'function');
    assert.strictEqual(typeof scene.hideNpcSprite, 'function');
    scene.exit();
  });
});
