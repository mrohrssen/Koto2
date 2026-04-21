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
  namedExports: { STATUS_ICON_CONFIG: {} },
});

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
  };
}

const { Scene } = await import('../../../public/js/scenes/scene.js');

function makeFakeApp() {
  return {
    ticker: { add: () => {}, remove: () => {}, count: 0 },
    stage: new FakeContainer(),
    screen: { width: 400, height: 600 },
  };
}

// Minimal Scene subclass that provides layers.npcs (required by base class
// showNpcSprite).
class HarnessScene extends Scene {
  constructor(app) {
    super('Harness', app);
    this.layers = {
      npcs: this.addContainer(new FakeContainer(), app.stage),
    };
  }
}


describe('Scene.showNpcSprite / hideNpcSprite (base class)', () => {
  it('showNpcSprite mounts a sprite into layers.npcs', async () => {
    const scene = new HarnessScene(makeFakeApp());
    const sprite = await scene.showNpcSprite('/foo.webp');
    assert.ok(sprite, 'returns a sprite');
    assert.strictEqual(sprite.parent, scene.layers.npcs, 'mounted in npcs layer');
    assert.strictEqual(scene.npcSprite, sprite, 'scene.npcSprite set');
    scene.exit();
  });

  it('showNpcSprite removes any prior sprite before spawning a new one', async () => {
    const scene = new HarnessScene(makeFakeApp());
    const a = await scene.showNpcSprite('/a.webp');
    const b = await scene.showNpcSprite('/b.webp');
    assert.notStrictEqual(a, b, 'new sprite returned');
    assert.strictEqual(a._destroyed, true, 'prior sprite destroyed (fixes bug #3)');
    assert.strictEqual(scene.npcSprite, b);
    assert.strictEqual(scene.layers.npcs.children.length, 1);
    scene.exit();
  });

  it('hideNpcSprite removes the sprite and clears the ref', async () => {
    const scene = new HarnessScene(makeFakeApp());
    const sprite = await scene.showNpcSprite('/foo.webp');
    await scene.hideNpcSprite();
    assert.strictEqual(scene.npcSprite, null, 'ref cleared');
    assert.strictEqual(sprite._destroyed, true, 'sprite destroyed');
    assert.strictEqual(scene.layers.npcs.children.length, 0);
    scene.exit();
  });

  it('hideNpcSprite is a no-op when no sprite is present', async () => {
    const scene = new HarnessScene(makeFakeApp());
    await assert.doesNotReject(() => scene.hideNpcSprite());
    await assert.doesNotReject(() => scene.hideNpcSprite({ slideOut: true }));
    scene.exit();
  });

  it('hideNpcSprite with slideOut calls scene.tween', async () => {
    const scene = new HarnessScene(makeFakeApp());
    await scene.showNpcSprite('/foo.webp');
    let tweenArgs = null;
    const origTween = scene.tween.bind(scene);
    scene.tween = (...args) => { tweenArgs = args; return Promise.resolve(); };
    await scene.hideNpcSprite({ slideOut: true });
    assert.ok(tweenArgs, 'tween called');
    assert.ok(tweenArgs[1].x >= 400 + 170, 'slides off-screen right');
    assert.strictEqual(scene.npcSprite, null);
    scene.exit();
  });

  it('exit() clears scene.npcSprite reference', async () => {
    const scene = new HarnessScene(makeFakeApp());
    await scene.showNpcSprite('/foo.webp');
    assert.ok(scene.npcSprite, 'sprite present before exit');
    scene.exit();
    assert.strictEqual(scene.npcSprite, null, 'ref cleared by base exit()');
    assert.strictEqual(scene.disposed, true);
  });

  it('showNpcSprite after exit throws SceneDisposedError', async () => {
    const scene = new HarnessScene(makeFakeApp());
    scene.exit();
    await assert.rejects(() => scene.showNpcSprite('/foo.webp'), /disposed|after exit/i);
  });
});
