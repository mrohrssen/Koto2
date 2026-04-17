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

const FakeTexture = { WHITE: { width: 170, height: 170 } };
const FakeAssets = {
  _loadImpl: async () => ({ width: 170, height: 170 }),
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

await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: {
    tween: () => Promise.resolve(),
    wait: () => Promise.resolve(),
  },
});

await mock.module('../../../public/js/ui/event-popup.js', {
  namedExports: {
    STATUS_ICON_CONFIG: {},
  },
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };
}

// Import after mocks are registered.
const {
  spawnNpcSprite,
  removeNpcSprite,
} = await import('../../../public/js/pixi/formation.js');


// --- Tests ------------------------------------------------------------------

describe('spawnNpcSprite scene contract', () => {
  it('throws when scene is null', async () => {
    await assert.rejects(
      () => spawnNpcSprite(null, '/foo.webp'),
      /scene is required/,
    );
  });

  it('throws when scene is undefined', async () => {
    await assert.rejects(
      () => spawnNpcSprite(undefined, '/foo.webp'),
      /scene is required/,
    );
  });

  it('throws when scene.layers is missing', async () => {
    const scene = { tween: async () => {} };
    await assert.rejects(
      () => spawnNpcSprite(scene, '/foo.webp'),
      /layers\.npcs is required/,
    );
  });

  it('throws when scene.layers.npcs is missing', async () => {
    const scene = { layers: { world: new FakeContainer() }, tween: async () => {} };
    await assert.rejects(
      () => spawnNpcSprite(scene, '/foo.webp'),
      /layers\.npcs is required/,
    );
  });

  it('spawns a sprite into scene.layers.npcs (no slideIn)', async () => {
    const npcs = new FakeContainer();
    const scene = { layers: { npcs }, tween: async () => {} };

    const sprite = await spawnNpcSprite(scene, '/foo.webp');
    assert.ok(sprite, 'returns a sprite');
    assert.strictEqual(sprite.parent, npcs, 'sprite mounted in scene.layers.npcs');
    assert.strictEqual(npcs.children.length, 1);
    // x positioned at 70% of screen width (400 * 0.7 = 280).
    assert.strictEqual(sprite.x, 280);
    // scale.x flipped to face left.
    assert.ok(sprite.scale.x < 0, 'sprite faces left (negative scale.x)');
  });

  it('uses scene.tween for slide-in animation', async () => {
    const npcs = new FakeContainer();
    let tweenArgs = null;
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async (...args) => { tweenArgs = args; return Promise.resolve(); },
    };

    const sprite = await spawnNpcSprite(scene, '/foo.webp', { slideIn: true });
    assert.ok(sprite);
    assert.ok(tweenArgs, 'scene.tween should be called for slide-in');
    assert.strictEqual(tweenArgs[0], sprite, 'tweens the spawned sprite');
    // screenW = 400 per fake app stub; 400 * 0.7 = 280.
    assert.deepStrictEqual(tweenArgs[1], { x: 280 }, 'target position is screenW * 0.7');
    assert.strictEqual(tweenArgs[2].duration, 400);
    assert.strictEqual(tweenArgs[2].ease, 'easeOut');
  });

  it('does NOT use scene.tween when slideIn is false (default)', async () => {
    let tweenCalled = false;
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => { tweenCalled = true; },
    };
    await spawnNpcSprite(scene, '/foo.webp'); // slideIn default false
    assert.strictEqual(tweenCalled, false);
  });

  it('returns null if scene disposes during Assets.load', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    // Replace Assets.load with a promise we can resolve manually after we
    // flip scene.disposed, so the post-await disposal check fires.
    const priorLoad = FakeAssets._loadImpl;
    let loadResolve;
    FakeAssets._loadImpl = () => new Promise(r => { loadResolve = r; });

    try {
      const promise = spawnNpcSprite(scene, '/foo.webp');
      scene.disposed = true;
      loadResolve({ width: 170, height: 170 });
      const result = await promise;
      assert.strictEqual(result, null, 'should return null on disposed scene');
      assert.strictEqual(npcs.children.length, 0, 'no sprite added to disposed layer');
    } finally {
      FakeAssets._loadImpl = priorLoad;
    }
  });

  it('slide-in tween rejection removes and destroys the sprite', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => { throw new Error('tween rejected'); },
    };

    await assert.rejects(
      () => spawnNpcSprite(scene, '/foo.webp', { slideIn: true }),
      /tween rejected/,
    );
    assert.strictEqual(npcs.children.length, 0, 'sprite should be removed on tween reject');
  });
});

describe('removeNpcSprite', () => {
  it('is a no-op when sprite is null', () => {
    assert.doesNotThrow(() => removeNpcSprite(null, null));
    assert.doesNotThrow(() => removeNpcSprite({}, undefined));
  });

  it('removes sprite from parent and destroys it', () => {
    const parent = new FakeContainer();
    const sprite = new FakeSprite({ width: 170, height: 170 });
    parent.addChild(sprite);
    assert.strictEqual(sprite.parent, parent);

    removeNpcSprite(null, sprite);

    assert.strictEqual(sprite.parent, null, 'removed from parent');
    assert.strictEqual(sprite._destroyed, true, 'sprite destroyed');
  });
});
