import { beforeEach, describe, it, mock } from 'node:test';
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
  ellipse(x, y, radiusX, radiusY) {
    this.lastEllipse = { x, y, radiusX, radiusY };
    return this;
  }
  circle() { return this; }
  roundRect() { return this; }
  fill(opts) { this.lastFill = opts; return this; }
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

await mock.module('pixi-filters', {
  namedExports: {
    GlowFilter: class FakeGlowFilter {
      constructor() { this.outerStrength = 0; }
      destroy() {}
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

let loadImageTextureImpl = async () => ({ width: 170, height: 170 });
let npcAnimationEntry = null;
let requestedNpcId = null;
let tickCalls = [];

await mock.module('../../../public/js/pixi/image-loader.js', {
  namedExports: {
    loadImageTexture: (...args) => loadImageTextureImpl(...args),
  },
});

await mock.module('../../../public/js/pixi/npc-animation-manifest.js', {
  namedExports: {
    loadNpcAnimationManifest: async () => ({ animations: {} }),
    getAnimatedNpcEntry: (_manifest, npcId) => {
      requestedNpcId = npcId;
      return npcAnimationEntry;
    },
  },
});

await mock.module('../../../public/js/pixi/animated-creature-sprite.js', {
  namedExports: {
    createAnimatedCreatureState: async (entry) => ({
      entry,
      textures: {
        idle: entry.idle ? [{ kind: 'idle', frame: 0 }] : [],
        walk: entry.walk ? [{ kind: 'walk', frame: 0 }] : [],
      },
      kind: null,
      frameIndex: 0,
      elapsedMs: 0,
      fps: entry.fps,
      frames: entry.frames,
    }),
    applyAnimationKind: (sprite, state, kind) => {
      if (!kind || !state.textures[kind]?.length) return;
      state.kind = kind;
      sprite.texture = state.textures[kind][0];
    },
    tickAnimatedCreatureSprite: (sprite, state, deltaMS, walkingEnabled) => {
      tickCalls.push({ sprite, state, deltaMS, walkingEnabled });
    },
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

beforeEach(() => {
  loadImageTextureImpl = async () => ({ width: 170, height: 170 });
  npcAnimationEntry = null;
  requestedNpcId = null;
  tickCalls = [];
});

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
    assert.strictEqual(npcs.children.length, 2);
    assert.strictEqual(npcs.children[0], sprite._shadow, 'shadow renders behind sprite');
    assert.strictEqual(npcs.children[1], sprite, 'sprite renders above shadow');
    // x positioned at 70% of screen width (400 * 0.7 = 280).
    assert.strictEqual(sprite.x, 280);
    assert.strictEqual(sprite._shadow.x, sprite.x);
    // NPC sprites are authored facing the intended direction; do not mirror them.
    assert.ok(sprite.scale.x > 0, 'sprite keeps authored orientation');
  });

  it('uses scene.tween for slide-in animation', async () => {
    const npcs = new FakeContainer();
    const tweenCalls = [];
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async (...args) => { tweenCalls.push(args); return Promise.resolve(); },
    };

    const sprite = await spawnNpcSprite(scene, '/foo.webp', { slideIn: true });
    assert.ok(sprite);
    assert.strictEqual(tweenCalls.length, 2, 'scene.tween should be called for sprite and shadow');
    assert.strictEqual(tweenCalls[0][0], sprite, 'tweens the spawned sprite');
    assert.strictEqual(tweenCalls[1][0], sprite._shadow, 'tweens the shadow with the sprite');
    // screenW = 400 per fake app stub; 400 * 0.7 = 280.
    assert.deepStrictEqual(tweenCalls[0][1], { x: 280 }, 'sprite target position is screenW * 0.7');
    assert.deepStrictEqual(tweenCalls[1][1], { x: 280 }, 'shadow target position is screenW * 0.7');
    assert.strictEqual(tweenCalls[0][2].duration, 400);
    assert.strictEqual(tweenCalls[0][2].ease, 'easeOut');
  });

  it('uses walk animation during slide-in, then switches to idle', async () => {
    const npcs = new FakeContainer();
    npcAnimationEntry = {
      idle: '/assets/sprites/npcs-animated/cid/idle.webp?v=test',
      walk: '/assets/sprites/npcs-animated/cid/walk.webp?v=test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1,
    };
    let textureDuringTween = null;
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async (sprite) => {
        if (sprite.texture) textureDuringTween = sprite.texture;
      },
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test', { slideIn: true });

    assert.equal(requestedNpcId, 'cid');
    assert.deepEqual(textureDuringTween, { kind: 'walk', frame: 0 });
    assert.deepEqual(sprite.texture, { kind: 'idle', frame: 0 });
    assert.equal(sprite._animatedNpc.kind, 'idle');
  });

  it('uses idle animation immediately when spawned without slide-in', async () => {
    const npcs = new FakeContainer();
    npcAnimationEntry = {
      idle: '/assets/sprites/npcs-animated/cid/idle.webp?v=test',
      walk: '/assets/sprites/npcs-animated/cid/walk.webp?v=test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1,
    };
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test');

    assert.equal(requestedNpcId, 'cid');
    assert.deepEqual(sprite.texture, { kind: 'idle', frame: 0 });
    assert.equal(sprite._animatedNpc.kind, 'idle');
  });

  it('scales animated NPCs by the manifest renderScale', async () => {
    const npcs = new FakeContainer();
    npcAnimationEntry = {
      idle: '/assets/sprites/npcs-animated/cid/idle.webp?v=test',
      walk: '/assets/sprites/npcs-animated/cid/walk.webp?v=test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1.6,
    };
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test');

    assert.equal(sprite.width, 272);
    assert.equal(sprite.height, 272);
  });

  it('places NPCs on the middle battlefield row', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test');

    assert.equal(sprite.y, 391.2);
  });

  it('adds a compact middle-row contact shadow for NPCs', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test');

    assert.ok(sprite._shadow, 'NPC has a shadow');
    assert.equal(sprite._shadow.lastEllipse.x, 0);
    assert.equal(sprite._shadow.lastEllipse.y, 0);
    assert.equal(sprite._shadow.lastEllipse.radiusX, 39);
    assert.equal(sprite._shadow.lastEllipse.radiusY, 8);
    assert.deepEqual(sprite._shadow.lastFill, { color: 0x000000, alpha: 0.28 });
    assert.equal(sprite._shadow.y, 391.2 + 170 * 0.38);
  });

  it('keeps shorter NPC shadows compact while positioning them by visual height', async () => {
    const npcs = new FakeContainer();
    loadImageTextureImpl = async () => ({ width: 170, height: 100 });
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/short.webp?v=test');

    assert.equal(sprite.width, 170);
    assert.equal(sprite.height, 100);
    assert.deepEqual(sprite._shadow.lastEllipse, {
      x: 0,
      y: 0,
      radiusX: 39,
      radiusY: 8,
    });
    assert.equal(sprite._shadow.y, 391.2 + 100 * 0.38);
  });

  it('places animated NPC shadows at the measured sprite feet', async () => {
    const npcs = new FakeContainer();
    npcAnimationEntry = {
      idle: '/assets/sprites/npcs-animated/cid/idle.webp?v=test',
      walk: '/assets/sprites/npcs-animated/cid/walk.webp?v=test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1.6,
    };
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test');

    assert.equal(sprite.height, 272);
    assert.equal(sprite._shadow.y, 391.2 + 272 * (63 / 256));
  });

  it('uses a 70px-wide contact shadow for the seated shrine fox', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/shrine_fox.webp?v=test');

    assert.equal(sprite.width, 170);
    assert.equal(sprite.height, 170);
    assert.deepEqual(sprite._shadow.lastEllipse, {
      x: 0,
      y: 0,
      radiusX: 35,
      radiusY: 7,
    });
    assert.equal(sprite._shadow.y, 391.2 + 170 * 0.62 * 0.38 + 2);
  });

  it('ticks animated NPCs as walking during slide-in and idle after arrival', async () => {
    const npcs = new FakeContainer();
    npcAnimationEntry = {
      idle: '/assets/sprites/npcs-animated/cid/idle.webp?v=test',
      walk: '/assets/sprites/npcs-animated/cid/walk.webp?v=test',
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
      frames: 24,
      fps: 12,
      renderScale: 1,
    };
    let updater = null;
    const scene = {
      disposed: false,
      layers: { npcs },
      addUpdater: (fn) => { updater = fn; },
      tween: async (target) => {
        if (target.texture) updater(1, 16.6667);
      },
    };

    const sprite = await spawnNpcSprite(scene, '/assets/sprites/npcs/cid.webp?v=test', { slideIn: true });
    updater(1, 16.6667);

    assert.equal(tickCalls.length, 2);
    assert.equal(tickCalls[0].sprite, sprite);
    assert.equal(tickCalls[0].walkingEnabled, true);
    assert.equal(tickCalls[1].walkingEnabled, false);
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

  it('returns null if scene disposes during texture load', async () => {
    const npcs = new FakeContainer();
    const scene = {
      disposed: false,
      layers: { npcs },
      tween: async () => {},
    };

    const priorLoad = loadImageTextureImpl;
    let loadResolve;
    loadImageTextureImpl = () => new Promise(r => { loadResolve = r; });

    try {
      const promise = spawnNpcSprite(scene, '/foo.webp');
      scene.disposed = true;
      loadResolve({ width: 170, height: 170 });
      const result = await promise;
      assert.equal(result, null, 'should return null on disposed scene');
      assert.equal(npcs.children.length, 0, 'no sprite added to disposed layer');
    } finally {
      loadImageTextureImpl = priorLoad;
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

  it('removes and destroys the NPC shadow with the sprite', () => {
    const parent = new FakeContainer();
    const shadow = new FakeGraphics();
    const sprite = new FakeSprite({ width: 170, height: 170 });
    sprite._shadow = shadow;
    parent.addChild(shadow);
    parent.addChild(sprite);

    removeNpcSprite(null, sprite);

    assert.strictEqual(shadow.parent, null, 'shadow removed from parent');
    assert.strictEqual(sprite.parent, null, 'sprite removed from parent');
    assert.strictEqual(shadow._destroyed, true, 'shadow destroyed');
    assert.strictEqual(sprite._destroyed, true, 'sprite destroyed');
  });
});
