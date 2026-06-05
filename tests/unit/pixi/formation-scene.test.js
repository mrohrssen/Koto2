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
    this.alpha = 1;
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

class FakeRectangle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

class FakeGraphics extends FakeContainer {
  ellipse(x, y, radiusX, radiusY) {
    this.lastEllipse = { x, y, radiusX, radiusY };
    return this;
  }
  circle() { return this; }
  roundRect() { return this; }
  fill() { return this; }
  stroke() { return this; }
}

class FakeText extends FakeContainer {
  constructor(opts) {
    super();
    this.text = opts?.text ?? '';
    this.width = this.text.length * 6;
    this.height = 10;
    this.anchor = { set: (x, y) => { this.anchor.x = x; this.anchor.y = y ?? x; } };
  }
}

class FakeTexture {
  constructor(options = {}) {
    this.source = options.source ?? {};
    this.frame = options.frame ?? null;
    this.width = options.frame?.width ?? options.width ?? 60;
    this.height = options.frame?.height ?? options.height ?? 60;
  }
}
FakeTexture.WHITE = new FakeTexture({ width: 60, height: 60 });
const FakeAssets = {
  _loadImpl: async () => ({ width: 60, height: 60, source: {} }),
  load(path) { return FakeAssets._loadImpl(path); },
};

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    Container: FakeContainer,
    Graphics: FakeGraphics,
    Text: FakeText,
    Texture: FakeTexture,
    Rectangle: FakeRectangle,
    Assets: FakeAssets,
  },
});

await mock.module('pixi-filters', {
  namedExports: {
    GlowFilter: class FakeGlowFilter {
      constructor(opts = {}) {
        Object.assign(this, opts);
        this.outerStrength = opts.outerStrength ?? 0;
      }
      destroy() { this.destroyed = true; }
    },
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
const clearAllStatusVfxCalls = [];
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: { getApp: () => fakeAppState },
});

await mock.module('../../../public/js/pixi/image-loader.js', {
  namedExports: { loadImageTexture: (path) => FakeAssets._loadImpl(path) },
});

let fakeAnimationManifest = null;
await mock.module('../../../public/js/pixi/creature-animation-manifest.js', {
  namedExports: {
    loadCreatureAnimationManifest: async () => fakeAnimationManifest,
    getCreatureAnimationManifestSnapshot: () => fakeAnimationManifest,
    getAnimatedCreatureEntry: (manifest, creatureId) => {
      const entry = manifest?.animations?.[creatureId];
      if (!entry?.idle && !entry?.walk) return null;
      return {
        ...entry,
        frameWidth: manifest.frameWidth,
        frameHeight: manifest.frameHeight,
        columns: manifest.columns,
        frames: manifest.frames,
        fps: manifest.fps,
        renderScale: manifest.renderScale,
      };
    },
  },
});

// Unused in the paths we exercise, but formation.js imports from these.
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: {
    tween: (target, props) => {
      Object.assign(target, props);
      return Promise.resolve();
    },
    wait: () => Promise.resolve(), // mock: resolve immediately for test speed
  },
});

await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: {
    burstParticles: () => {},
    screenFlash: () => {},
    releaseAllInFlight: () => {},
  },
});

// BattleScene calls start/stopParallax + setScrollState in onEnter/beforeExit;
// stub them. BATTLE_SKY_DRIFT_SPEED is a constant the scene imports — match
// the production value so anything reading it sees a sane number.
await mock.module('../../../public/js/pixi/parallax.js', {
  namedExports: {
    startParallax: () => {},
    stopParallax: () => {},
    resizeParallax: () => {},
    setScrollState: () => {},
    BATTLE_SKY_DRIFT_SPEED: 0.4,
  },
});
await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: {
    STATUS_ICON_CONFIG: {
      atk_up: { label: 'ATK+', bg: 0, text: 0 },
      atk_down: { label: 'ATK-', bg: 0, text: 0 },
      def_up: { label: 'DEF+', bg: 0, text: 0 },
      def_down: { label: 'DEF-', bg: 0, text: 0 },
      dex_up: { label: 'DEX+', bg: 0, text: 0 },
      dex_down: { label: 'DEX-', bg: 0, text: 0 },
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
    clearAllStatusVfxForScene: (ctx, side, uid) => {
      clearAllStatusVfxCalls.push({ ctx, side, uid });
      ctx?.vfxByUid?.delete(uid);
    },
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
  getCreatureSpriteForScene,
  animateKOForScene,
  animateLevelUpForScene,
  showActiveGlowForScene,
  clearActiveGlowForScene,
  syncPixiStatusLabelsForScene,
  destroyAllStatusLabels,
} = await import('../../../public/js/pixi/formation.js');
const { SPRITE_VERSION } = await import('../../../public/js/ui/sprite-utils.js');
const { BattleScene } = await import('../../../public/js/scenes/battle-scene.js');
const { rowForFormationIndex } = await import('../../../public/js/pixi/battlefield-layout.js');


// --- Helpers ----------------------------------------------------------------

function makeFakeApp() {
  const listeners = new Set();
  return {
    ticker: {
      add: (fn) => listeners.add(fn),
      remove: (fn) => listeners.delete(fn),
      get count() { return listeners.size; },
    },
    runTickers: () => {
      for (const fn of listeners) fn();
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

describe('spawnFormationSprite opts (IMP-2)', () => {
  function makeSceneCtx() {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    return createFormationContext(scene);
  }

  it('isBoss=true renders at 90px', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(
      ctx, 'enemy', { uid: 'boss', id: 'b' }, 0,
      { isBoss: true, skipEnter: true }
    );
    assert.strictEqual(sprite.width, 90);
    assert.strictEqual(sprite.height, 90);
  });

  it('isBoss=true scales the shadow by 1.5x', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(
      ctx, 'enemy', { uid: 'boss', id: 'b' }, 0,
      { slotI: 1, isBoss: true, skipEnter: true }
    );

    assert.deepEqual(sprite._shadow.lastEllipse, {
      x: 0,
      y: 0,
      radiusX: 40.5,
      radiusY: 10.5,
    });
  });

  it('isBoss=false (default) renders at 60px', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(
      ctx, 'enemy', { uid: 'mob', id: 'm' }, 0,
      { skipEnter: true }
    );
    assert.strictEqual(sprite.width, 60);
    assert.strictEqual(sprite.height, 60);
  });

  it('enemy with skipEnter=false + no prior sprites starts off-screen (slide-in)', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(
      ctx, 'enemy', { uid: 'e1', id: 'x' }, 0,
      { skipEnter: false }
    );
    assert.strictEqual(sprite._entering, true);
    assert.ok(sprite._enterTarget != null, 'enter target stored');
    // Start position should be beyond screen right edge
    assert.ok(sprite.x > 400, `sprite.x=${sprite.x} should be off-screen right`);
  });

  it('player with skipEnter=true is immediately placed at target', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(
      ctx, 'player', { uid: 'p1', id: 'x' }, 0,
      { skipEnter: true }
    );
    assert.strictEqual(sprite._entering, false);
    assert.strictEqual(sprite.x, sprite.baseX);
  });

  it('slotI override positions the sprite at the mapped slot', async () => {
    const ctx = makeSceneCtx();
    // index=0, slotI=1 → 1 creature goes to middle slot
    const sprite = await spawnFormationSprite(
      ctx, 'player', { uid: 'p1', id: 'x' }, 0,
      { slotI: 1, skipEnter: true }
    );
    assert.strictEqual(sprite._slotI, 1);
  });

  it('positions battle sprites on the symmetric battlefield grid', async () => {
    const ctx = makeSceneCtx();
    const sprite = await spawnFormationSprite(ctx, 'enemy', { uid: 'e1', id: 'hi', hp: 10 }, 0, {
      slotI: rowForFormationIndex(0, 3),
      skipEnter: true,
    });

    assert.equal(Math.round(sprite.baseX), 322); // 400 * 0.805
    assert.equal(Math.round(sprite.baseY), 261); // 600 * 0.435
    assert.equal(sprite._rowName, 'top');
  });

  it('anchors contact shadows to row-scaled creature feet', async () => {
    const topCtx = makeSceneCtx();
    const top = await spawnFormationSprite(topCtx, 'player', { uid: 'top', id: 'hi', hp: 10 }, 0, {
      slotI: 0,
      skipEnter: true,
    });

    const middleCtx = makeSceneCtx();
    const middle = await spawnFormationSprite(middleCtx, 'player', { uid: 'middle', id: 'hi', hp: 10 }, 0, {
      slotI: 1,
      skipEnter: true,
    });

    const bottomCtx = makeSceneCtx();
    const bottom = await spawnFormationSprite(bottomCtx, 'player', { uid: 'bottom', id: 'hi', hp: 10 }, 0, {
      slotI: 2,
      skipEnter: true,
    });

    assert.equal(top._shadow.y, top.baseY + 60 * 0.90 * 0.50);
    assert.equal(middle._shadow.y, middle.baseY + 60 * 0.98 * 0.38);
    assert.equal(bottom._shadow.y, bottom.baseY + 60 * 1.08 * 0.50);
  });

  it('pulls animated creature shadows back to the natural foot line', async () => {
    fakeAnimationManifest = {
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 1,
      fps: 12,
      renderScale: 1.85,
      animations: {
        hi: { idle: '/animated-hi.png' },
      },
    };
    const originalLoad = FakeAssets._loadImpl;
    FakeAssets._loadImpl = async () => ({ width: 256, height: 256, source: {} });

    try {
      const topCtx = makeSceneCtx();
      const top = await spawnFormationSprite(topCtx, 'player', { uid: 'top-animated', id: 'hi', hp: 10 }, 0, {
        slotI: 0,
        skipEnter: true,
      });

      const middleCtx = makeSceneCtx();
      const middle = await spawnFormationSprite(middleCtx, 'player', { uid: 'middle-animated', id: 'hi', hp: 10 }, 0, {
        slotI: 1,
        skipEnter: true,
      });

      const bottomCtx = makeSceneCtx();
      const bottom = await spawnFormationSprite(bottomCtx, 'player', { uid: 'bottom-animated', id: 'hi', hp: 10 }, 0, {
        slotI: 2,
        skipEnter: true,
      });

      assert.equal(top._shadow.y, top.baseY + 60 * 1.85 * 0.90 * 0.50 - 23);
      assert.equal(middle._shadow.y, middle.baseY + 60 * 1.85 * 0.98 * 0.38 - 19);
      assert.equal(bottom._shadow.y, bottom.baseY + 60 * 1.85 * 1.08 * 0.50 - 28);
    } finally {
      FakeAssets._loadImpl = originalLoad;
      fakeAnimationManifest = null;
    }
  });

  it('uses static creature sprites for non-animated creatures', async () => {
    const seen = [];
    const originalLoad = FakeAssets._loadImpl;
    FakeAssets._loadImpl = async (path) => {
      seen.push(path);
      return { width: 60, height: 60, path };
    };
    try {
      const ctx = makeSceneCtx();
      const sprite = await spawnFormationSprite(ctx, 'player', { uid: 'p-idle', id: 'kitsunova' }, 0, {
        skipEnter: true,
      });
      assert.equal(sprite.texture.path, `/assets/sprites/creatures/kitsunova.webp?v=${SPRITE_VERSION}`);
      assert.deepEqual(seen, [`/assets/sprites/creatures/kitsunova.webp?v=${SPRITE_VERSION}`]);
    } finally {
      FakeAssets._loadImpl = originalLoad;
    }
  });

  it('uses animated creature sheets first when the animation manifest snapshot is ready', async () => {
    fakeAnimationManifest = {
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 1,
      fps: 12,
      renderScale: 1,
      animations: {
        inu: { idle: '/assets/sprites/creatures-animated/inu/idle.webp?v=test' },
      },
    };
    const loadedPaths = [];
    const originalLoad = FakeAssets._loadImpl;
    FakeAssets._loadImpl = async (path) => {
      loadedPaths.push(path);
      return { width: 256, height: 256, source: {}, path };
    };

    try {
      const ctx = makeSceneCtx();
      const sprite = await spawnFormationSprite(ctx, 'player', { uid: 'p-animated', id: 'inu' }, 0, {
        skipEnter: true,
      });

      assert.equal(sprite._animatedCreature.entry.idle, '/assets/sprites/creatures-animated/inu/idle.webp?v=test');
      assert.deepEqual(loadedPaths, [
        '/assets/sprites/creatures-animated/inu/idle.webp?v=test',
      ]);
    } finally {
      FakeAssets._loadImpl = originalLoad;
      fakeAnimationManifest = null;
    }
  });

  it('does not probe legacy idle sprites before static creature sprites', async () => {
    const seen = [];
    const originalLoad = FakeAssets._loadImpl;
    FakeAssets._loadImpl = async (path) => {
      seen.push(path);
      return { width: 60, height: 60, path };
    };
    try {
      const ctx = makeSceneCtx();
      const sprite = await spawnFormationSprite(ctx, 'player', { uid: 'p-static', id: 'mizu' }, 0, {
        skipEnter: true,
      });
      assert.equal(sprite.texture.path, `/assets/sprites/creatures/mizu.webp?v=${SPRITE_VERSION}`);
      assert.deepEqual(seen, [
        `/assets/sprites/creatures/mizu.webp?v=${SPRITE_VERSION}`,
      ]);
    } finally {
      FakeAssets._loadImpl = originalLoad;
    }
  });
});

describe('updateFormationSprite repositioning (IMP-4)', () => {
  function makeSceneCtx() {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    return createFormationContext(scene);
  }

  it('repositions sprite when slotI changes', async () => {
    const ctx = makeSceneCtx();
    const creature = { uid: 'c1', id: 'x' };
    const sprite = await spawnFormationSprite(
      ctx, 'player', creature, 0, { slotI: 0, skipEnter: true }
    );
    const origX = sprite.x;
    const origY = sprite.y;
    assert.strictEqual(sprite._slotI, 0);

    updateFormationSprite(ctx, 'player', creature, 0, { slotI: 2 });

    assert.strictEqual(sprite._slotI, 2, 'slot moved');
    // With DOM mocked to return null, fallback layout differs per slot.
    const moved = (sprite.x !== origX) || (sprite.y !== origY);
    assert.ok(moved, `sprite did not reposition (x:${origX}→${sprite.x}, y:${origY}→${sprite.y})`);
    assert.equal(sprite._shadow.y, sprite.baseY + 60 * 1.08 * 0.50);
  });

  it('does not reposition when slotI is unchanged', async () => {
    const ctx = makeSceneCtx();
    const creature = { uid: 'c1', id: 'x' };
    const sprite = await spawnFormationSprite(
      ctx, 'player', creature, 0, { slotI: 1, skipEnter: true }
    );
    const origX = sprite.x;
    const origY = sprite.y;

    // Scale may have been changed by external animation (e.g. animateKO).
    // An update with the same slot must NOT overwrite it.
    sprite.scale.x = 0.5;
    sprite.scale.y = 0.5;

    updateFormationSprite(ctx, 'player', creature, 0, { slotI: 1 });

    assert.strictEqual(sprite.x, origX, 'x preserved');
    assert.strictEqual(sprite.y, origY, 'y preserved');
    assert.strictEqual(sprite.scale.x, 0.5, 'scale.x preserved');
    assert.strictEqual(sprite.scale.y, 0.5, 'scale.y preserved');
  });

  it('updates creatureData and applies KO alpha/tint regardless of slot', async () => {
    const ctx = makeSceneCtx();
    const creature = { uid: 'c1', id: 'x', currentHp: 10 };
    const sprite = await spawnFormationSprite(
      ctx, 'player', creature, 0, { slotI: 1, skipEnter: true }
    );
    assert.strictEqual(sprite.alpha, 1);
    assert.strictEqual(sprite.tint, 0xFFFFFF);

    const dead = { uid: 'c1', id: 'x', currentHp: 0 };
    updateFormationSprite(ctx, 'player', dead, 0, { slotI: 1 });
    assert.strictEqual(sprite.tint, 0x888888, 'KO tint applied');
    assert.ok(sprite.alpha <= 0.3, `alpha clamped: ${sprite.alpha}`);
    assert.strictEqual(sprite.creatureData, dead);
  });

  it('repositions on first update when sprite lacks prior _slotI (legacy-path sprite)', async () => {
    const ctx = makeSceneCtx();
    const creature = { uid: 'c1', id: 'x' };
    const sprite = await spawnFormationSprite(
      ctx, 'player', creature, 0, { slotI: 0, skipEnter: true }
    );
    // Simulate a sprite born on the legacy _showFormation path that never
    // sets _slotI. The scene-path update must still reposition it on the
    // first call rather than short-circuiting on a nullish prevSlot.
    delete sprite._slotI;
    // Move sprite away from its spawn-time layout so we can detect the
    // reposition even when the defaulted slotI (= index) matches what a
    // fresh spawn would pick.
    sprite.x = -9999;
    sprite.y = -9999;

    // Default slotI via `opts.slotI ?? index` (0 here). The null-safe guard
    // triggers on `prevSlot == null` regardless of slotI value, so a
    // legacy-path sprite always gets positioned on its first scene update.
    updateFormationSprite(ctx, 'player', creature, 0, { slotI: undefined });

    assert.strictEqual(sprite._slotI, 0, 'slotI recorded');
    assert.notStrictEqual(sprite.x, -9999, 'x repositioned');
    assert.notStrictEqual(sprite.y, -9999, 'y repositioned');
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

  it('clears the active glow ticker when the battle scene exits', async () => {
    const app = makeFakeApp();
    fakeAppState = {
      ...fakeAppState,
      app,
    };
    const scene = new BattleScene(app);
    const creature = { uid: 'active', id: 'hi' };

    await scene.syncCreatures({ allies: [creature], enemies: [], initial: true });
    scene.formation.lastFormationInput.player = { creatures: [creature], opts: {} };

    showActiveGlowForScene(scene, 0);
    assert.equal(app.ticker.count, 1);

    scene.exit();

    assert.equal(app.ticker.count, 0);
  });
});

describe('scene-facing sprite-lookup variants null-scene guards', () => {
  function makeSceneCtx() {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c /* container */, _parent) => c,
    };
    return createFormationContext(scene);
  }

  it('getCreatureSpriteForScene returns null when scene is null', () => {
    assert.strictEqual(getCreatureSpriteForScene(null, 'player', 0), null);
    assert.strictEqual(getCreatureSpriteForScene(undefined, 'enemy', 2), null);
    assert.strictEqual(getCreatureSpriteForScene({}, 'player', 0), null);
  });

  it('animateKOForScene / animateLevelUpForScene resolve to undefined for null scene', async () => {
    assert.strictEqual(await animateKOForScene(null, 'player', 0), undefined);
    assert.strictEqual(await animateLevelUpForScene(null, 'enemy', 1), undefined);
    assert.strictEqual(await animateKOForScene({}, 'player', 0), undefined);
  });

  it('animateKOForScene fades the creature shadow with the sprite', async () => {
    const ctx = makeSceneCtx();
    const creature = { uid: 'ko-shadow', id: 'hi', hp: 10 };
    const sprite = await spawnFormationSprite(ctx, 'enemy', creature, 0, {
      slotI: 1,
      skipEnter: true,
    });
    ctx.lastFormationInput.enemy = { creatures: [creature], opts: {} };

    assert.equal(sprite.alpha, 1);
    assert.equal(sprite._shadow.alpha, 1);

    await animateKOForScene({ formation: ctx }, 'enemy', 0);

    assert.equal(sprite.alpha, 0);
    assert.equal(sprite._shadow.alpha, 0);
  });

  it('animateKOForScene clears ongoing status VFX for the KO target uid', async () => {
    clearAllStatusVfxCalls.length = 0;

    const ctx = makeSceneCtx();
    const creature = { uid: 'taunted-enemy', id: 'hi', hp: 10 };
    const sprite = await spawnFormationSprite(ctx, 'enemy', creature, 0, {
      slotI: 1,
      skipEnter: true,
    });
    ctx.lastFormationInput.enemy = { creatures: [creature], opts: {} };

    const statusVfx = {
      vfxByUid: new Map([
        ['taunted-enemy', { taunt: { tag: 'ring' } }],
        ['other-enemy', { taunt: { tag: 'keep' } }],
      ]),
    };

    await animateKOForScene({ formation: ctx, statusVfx }, 'enemy', 0);

    assert.equal(sprite.alpha, 0);
    assert.deepEqual(clearAllStatusVfxCalls, [
      { ctx: statusVfx, side: 'enemy', uid: 'taunted-enemy' },
    ]);
    assert.equal(statusVfx.vfxByUid.has('taunted-enemy'), false);
    assert.ok(statusVfx.vfxByUid.get('other-enemy')?.taunt);
  });

  it('showActiveGlowForScene / clearActiveGlowForScene no-op when scene.formation is missing', () => {
    // Should not throw
    showActiveGlowForScene(null, 0);
    clearActiveGlowForScene(null);
    showActiveGlowForScene({}, 1);
    clearActiveGlowForScene({});
    assert.ok(true);
  });

  it('uses the stronger active-turn glow strength', async () => {
    const app = makeFakeApp();
    fakeAppState = {
      ...fakeAppState,
      app,
    };
    const scene = {
      layers: { formations: new FakeContainer() },
      addContainer: (c) => c,
    };
    scene.formation = createFormationContext(scene);
    const creature = { uid: 'p1', id: 'hi' };
    const sprite = await spawnFormationSprite(
      scene.formation,
      'player',
      creature,
      0,
      { slotI: 0, skipEnter: true }
    );
    scene.formation.lastFormationInput.player = { creatures: [creature] };

    showActiveGlowForScene(scene, 0);

    const filter = sprite.filters?.[0];
    assert.equal(filter.outerStrength, 2.4);

    const originalNow = Date.now;
    Date.now = () => 500;
    try {
      app.runTickers();
      assert.equal(filter.outerStrength, 5.6);
    } finally {
      Date.now = originalNow;
      clearActiveGlowForScene(scene);
    }
  });

  it('syncPixiStatusLabelsForScene no-ops when scene is null/missing', () => {
    // Should not throw and should return undefined
    assert.strictEqual(syncPixiStatusLabelsForScene(null, 'player', 0, [], {}), undefined);
    assert.strictEqual(syncPixiStatusLabelsForScene(undefined, 'enemy', 1, ['poison'], {}), undefined);
    assert.strictEqual(syncPixiStatusLabelsForScene({}, 'player', 0, [], {}), undefined);
  });

  it('renders dex stat-stage pills with numeric stage labels', async () => {
    fakeAppState.layers.labels = new FakeContainer();
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c) => c,
    };
    scene.formation = createFormationContext(scene);

    const creature = { uid: 'p1', id: 'hi', hp: 10, statStages: { dex: 2 } };
    const sprite = await spawnFormationSprite(
      scene.formation,
      'player',
      creature,
      0,
      { slotI: 0, skipEnter: true }
    );
    scene.formation.lastFormationInput.player = { creatures: [creature] };

    syncPixiStatusLabelsForScene(scene, 'player', 0, ['dex_up'], creature.statStages);

    assert.equal(sprite.statusLabels.length, 1);
    const text = sprite.statusLabels[0].children.find(child => child instanceof FakeText);
    assert.equal(text?.text, 'DEX +2');
  });
});

describe('destroyAllStatusLabels (scene dispose cleanup)', () => {
  function makeSpriteWithLabels(n) {
    const pills = [];
    for (let i = 0; i < n; i++) pills.push(new FakeContainer());
    const sprite = new FakeSprite({});
    sprite.statusLabels = pills;
    return sprite;
  }

  it('destroys every pill across both sides of a ctx and empties the arrays', () => {
    const formations = new FakeContainer();
    const scene = {
      layers: { formations },
      addContainer: (c) => c,
    };
    const ctx = createFormationContext(scene);

    const s1 = makeSpriteWithLabels(2);
    const s2 = makeSpriteWithLabels(3);
    const e1 = makeSpriteWithLabels(1);
    ctx.creatureSprites.player.set('p1', s1);
    ctx.creatureSprites.player.set('p2', s2);
    ctx.creatureSprites.enemy.set('e1', e1);

    const allPills = [...s1.statusLabels, ...s2.statusLabels, ...e1.statusLabels];
    destroyAllStatusLabels(ctx);

    for (const pill of allPills) {
      assert.equal(pill._destroyed, true, 'pill should be destroyed');
    }
    assert.equal(s1.statusLabels.length, 0);
    assert.equal(s2.statusLabels.length, 0);
    assert.equal(e1.statusLabels.length, 0);
  });

  it('is idempotent — calling twice is a no-op the second time', () => {
    const formations = new FakeContainer();
    const scene = { layers: { formations }, addContainer: (c) => c };
    const ctx = createFormationContext(scene);
    const sprite = makeSpriteWithLabels(2);
    ctx.creatureSprites.player.set('p1', sprite);

    destroyAllStatusLabels(ctx);
    assert.doesNotThrow(() => destroyAllStatusLabels(ctx));
    assert.equal(sprite.statusLabels.length, 0);
  });

  it('no-ops when ctx is nullish or has no creatureSprites', () => {
    assert.doesNotThrow(() => destroyAllStatusLabels(null));
    assert.doesNotThrow(() => destroyAllStatusLabels(undefined));
    assert.doesNotThrow(() => destroyAllStatusLabels({}));
    assert.doesNotThrow(() => destroyAllStatusLabels({ creatureSprites: null }));
  });

  it('skips sprites without statusLabels gracefully', () => {
    const formations = new FakeContainer();
    const scene = { layers: { formations }, addContainer: (c) => c };
    const ctx = createFormationContext(scene);
    const bare = new FakeSprite({});
    ctx.creatureSprites.player.set('p1', bare);
    assert.doesNotThrow(() => destroyAllStatusLabels(ctx));
  });
});
