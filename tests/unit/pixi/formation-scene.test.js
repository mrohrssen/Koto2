import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Stub pixi.js before the module under test imports it ---
//
// formation.js imports: Sprite, Assets, Container, Texture, Graphics, Text.
// We only need them to be constructible; they don't have to render.
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
      x: 1,
      y: 1,
      set(sx, sy) { this.x = sx; this.y = sy ?? sx; },
    };
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.alpha = 1;
    this.tint = 0xFFFFFF;
    this.rotation = 0;
  }
}

class FakeGraphics extends FakeContainer {
  circle() { return this; }
  roundRect() { return this; }
  fill() { return this; }
  stroke() { return this; }
}

class FakeText extends FakeContainer {
  constructor(opts) { super(); this.text = opts?.text ?? ''; this.width = this.text.length * 6; this.height = 10; }
}

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

// Stub the PIXI app surface. formation.js calls getApp() to read `app`/`layers`.
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

// Unused in the paths we exercise, but formation.js imports from these.
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: { tween: () => Promise.resolve() },
});

// BattleScene calls start/stopParallax in onEnter/beforeExit; stub them.
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    startParallax: () => {},
    stopParallax: () => {},
    resizeParallax: () => {},
  },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: {
    STATUS_ICON_CONFIG: {
      atk_up: { label: 'ATK+', bg: 0, text: 0 },
      atk_down: { label: 'ATK-', bg: 0, text: 0 },
      def_up: { label: 'DEF+', bg: 0, text: 0 },
      def_down: { label: 'DEF-', bg: 0, text: 0 },
      poison: { label: 'PSN', bg: 0, text: 0 },
    },
  },
});

// BattleScene now imports createStatusVfxContext from status-vfx.js (Task 10).
// Stub it so we don't drag in the full status-vfx graph (effects → tween etc.)
// which the formation tests don't exercise.
await mock.module('../../../public/js/pixi/status-vfx.js', {
  namedExports: {
    createStatusVfxContext: (scene) => ({ scene, vfxByUid: scene?.vfxByUid ?? new Map() }),
  },
});

// globalThis.document shim (formation's _spawn reads `.querySelector`/getBoundingClientRect).
// No DOM in node:test — short-circuit so the code falls through to the percentage layout.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };
}

// Import after mocks are registered.
const {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
} = await import('../../../public/js/pixi/formation.js');
const { BattleScene } = await import('../../../public/js/scenes/battle-scene.js');


// --- Helpers ----------------------------------------------------------------

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


// --- Tests ------------------------------------------------------------------

describe('createFormationContext invariants', () => {
  it('throws when scene is missing', () => {
    assert.throws(() => createFormationContext(null), /scene is required/);
    assert.throws(() => createFormationContext(undefined), /scene is required/);
  });

  it('throws when scene.layers.formations is missing', () => {
    const scene = { addContainer: () => new FakeContainer(), layers: {} };
    assert.throws(() => createFormationContext(scene), /formations is required/);
  });

  it('succeeds when scene provides layers.formations', () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    const ctx = createFormationContext(scene);
    assert.ok(ctx);
    assert.ok(ctx.playerContainer);
    assert.ok(ctx.enemyContainer);
    assert.strictEqual(ctx.scene, scene);
  });
});

describe('spawnFormationSprite uid contract', () => {
  function makeSceneCtx() {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    return createFormationContext(scene);
  }

  it('throws when scene ctx receives a creature without uid', async () => {
    const ctx = makeSceneCtx();
    await assert.rejects(
      () => spawnFormationSprite(ctx, 'player', { id: 'foo' }, 0),
      /uid is required/
    );
  });

  it('throws when scene ctx receives null creature', async () => {
    const ctx = makeSceneCtx();
    await assert.rejects(
      () => spawnFormationSprite(ctx, 'player', null, 0),
      /uid is required/
    );
  });
});

describe('removeFormationSprite uid contract', () => {
  it('throws when scene ctx is missing uid', () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    const ctx = createFormationContext(scene);
    assert.throws(() => removeFormationSprite(ctx, 'player', undefined), /uid is required/);
    assert.throws(() => removeFormationSprite(ctx, 'player', null), /uid is required/);
    assert.throws(() => removeFormationSprite(ctx, 'player', ''), /uid is required/);
  });
});

describe('updateFormationSprite uid contract', () => {
  it('throws when scene ctx receives a creature without uid', () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    const ctx = createFormationContext(scene);
    assert.throws(
      () => updateFormationSprite(ctx, 'player', { id: 'foo' }, 0),
      /uid is required/
    );
  });
});

describe('spawnFormationSprite parallel spawns (CRIT-1 regression)', () => {
  it('N parallel spawns all populate the Map (no self-cancellation)', async () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    const ctx = createFormationContext(scene);

    const creatures = [
      { uid: 'uid-a', id: 'a' },
      { uid: 'uid-b', id: 'b' },
      { uid: 'uid-c', id: 'c' },
    ];

    // Fire all three in parallel. Before the CRIT-1 fix each call
    // incremented loadRequestId synchronously; by the time their
    // awaits resolved, only the last spawn's requestId matched.
    const sprites = await Promise.all(
      creatures.map((c, i) => spawnFormationSprite(ctx, 'player', c, i))
    );

    assert.strictEqual(sprites.filter(Boolean).length, 3, 'all three spawns returned a sprite');
    assert.strictEqual(ctx.creatureSprites.player.size, 3, 'all three sprites registered in Map');
    for (const c of creatures) {
      assert.ok(ctx.creatureSprites.player.has(c.uid), `uid ${c.uid} present in Map`);
    }
  });

  it('re-spawning the same uid removes the prior sprite (IMP-6)', async () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    const ctx = createFormationContext(scene);
    const creature = { uid: 'uid-dup', id: 'x' };

    const first = await spawnFormationSprite(ctx, 'player', creature, 0);
    const second = await spawnFormationSprite(ctx, 'player', creature, 0);

    assert.notStrictEqual(first, second, 'a new sprite was produced');
    assert.strictEqual(ctx.creatureSprites.player.size, 1, 'Map holds exactly one sprite for the uid');
    assert.strictEqual(ctx.creatureSprites.player.get('uid-dup'), second, 'stored sprite is the latest');
    assert.strictEqual(first._destroyed, true, 'prior sprite destroyed');
  });
});

describe('BattleScene._diff lifecycle', () => {
  it('removes sprites for uids that leave the party', async () => {
    const app = makeFakeApp();
    const scene = new BattleScene(app);

    // First sync: [c1, c2, c3]
    const c1 = { uid: 'c1', id: 'a' };
    const c2 = { uid: 'c2', id: 'b' };
    const c3 = { uid: 'c3', id: 'c' };
    await scene.syncCreatures({ allies: [c1, c2, c3], enemies: [], initial: true });
    assert.strictEqual(scene.formation.creatureSprites.player.size, 3);
    assert.strictEqual(scene.spritesByUid.size, 3);

    // Second sync: [c1, c3] — c2 left the party
    await scene.syncCreatures({ allies: [c1, c3], enemies: [] });
    assert.strictEqual(scene.formation.creatureSprites.player.size, 2, 'Map shrank by one');
    assert.ok(scene.formation.creatureSprites.player.has('c1'));
    assert.ok(scene.formation.creatureSprites.player.has('c3'));
    assert.ok(!scene.formation.creatureSprites.player.has('c2'), 'c2 removed');
    assert.ok(!scene.spritesByUid.has('c2'), 'c2 removed from scene lookup');

    scene.exit();
  });

  it('isolates spawn rejection so siblings still register (MIN-2)', async () => {
    const app = makeFakeApp();
    const scene = new BattleScene(app);

    // A creature with no uid will cause spawnFormationSprite to throw
    // the uid-required assertion. With MIN-2's .catch wrapper that rejection
    // must NOT take down sibling spawns. Without it, Promise.all rejects
    // as a whole and syncCreatures throws.
    const origErr = console.error;
    let errCount = 0;
    console.error = () => { errCount++; };

    try {
      const c1 = { uid: 'c1', id: 'a' };
      const cBad = { /* no uid */ id: 'b' };
      const c3 = { uid: 'c3', id: 'c' };

      // syncCreatures must not throw; each failing spawn is swallowed
      // per the MIN-2 .catch handler in BattleScene._diff.
      await scene.syncCreatures({ allies: [c1, cBad, c3], enemies: [], initial: true });

      assert.ok(scene.formation.creatureSprites.player.has('c1'), 'c1 registered');
      assert.ok(scene.formation.creatureSprites.player.has('c3'), 'c3 registered');
      assert.ok(errCount >= 1, 'error was logged by _diff .catch');
    } finally {
      console.error = origErr;
      scene.exit();
    }
  });
});
