import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Stub pixi.js before the module under test imports it -------------------
//
// status-vfx.js imports: Graphics, Text, Container. Only need them to be
// constructible.

class FakeContainer {
  constructor() {
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.x = 0;
    this.y = 0;
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

class FakeGraphics extends FakeContainer {
  circle() { return this; }
  stroke() { return this; }
  fill() { return this; }
}

class FakeText extends FakeContainer {
  constructor(opts) {
    super();
    this.text = opts?.text ?? '';
    this.anchor = { set: (x, y) => { this.anchor.x = x; this.anchor.y = y ?? x; } };
    this._age = 0;
  }
}

await mock.module('pixi.js', {
  namedExports: {
    Graphics: FakeGraphics,
    Text: FakeText,
    Container: FakeContainer,
  },
});

// Stub the PIXI app + layers surface. status-vfx.js calls getApp() in the
// legacy path only; scene-ctx path reads layers via ctx.scene.layers.
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({
      app: { ticker: { add: () => {}, remove: () => {} } },
      layers: { effects: new FakeContainer() },
    }),
  },
});

// Status-vfx imports these utility modules for the one-shot phase only; the
// tests below don't exercise that path, but the imports must resolve.
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: {
    tween: () => Promise.resolve(),
    wait: () => Promise.resolve(),
  },
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: {
    burstParticles: () => {},
    screenFlash: () => {},
    ELEMENT_COLORS: {},
  },
});
await mock.module('../../../public/js/pixi/text.js', {
  namedExports: {
    showEventPopup: () => {},
  },
});
// formation.js imports in status-vfx.js — only getCreatureSprite is used by
// the legacy path, which these tests do not invoke.
await mock.module('../../../public/js/pixi/formation.js', {
  namedExports: {
    getCreatureSprite: () => null,
  },
});

const {
  createStatusVfxContext,
  playStatusAppliedForScene,
  clearStatusVfxForScene,
} = await import('../../../public/js/pixi/status-vfx.js');


// --- Tests ------------------------------------------------------------------

describe('createStatusVfxContext invariants', () => {
  it('throws when scene is missing', () => {
    assert.throws(() => createStatusVfxContext(null), /scene is required/);
    assert.throws(() => createStatusVfxContext(undefined), /scene is required/);
  });

  it('throws when scene.vfxByUid is missing', () => {
    // Scene-shaped object but no vfxByUid Map. Defensive check — if a future
    // scene variant forgets to allocate it, fail loud.
    const scene = { layers: { effects: new FakeContainer() } };
    assert.throws(() => createStatusVfxContext(scene), /vfxByUid is required/);
  });

  it('returns a ctx whose vfxByUid references the scene.vfxByUid Map', () => {
    const sceneVfx = new Map();
    const scene = {
      vfxByUid: sceneVfx,
      layers: { effects: new FakeContainer() },
    };
    const ctx = createStatusVfxContext(scene);
    assert.strictEqual(ctx.scene, scene);
    assert.strictEqual(ctx.vfxByUid, sceneVfx, 'ctx.vfxByUid is the same Map instance as scene.vfxByUid');

    // And writes via the scene are visible through ctx, confirming it's not a copy.
    sceneVfx.set('probe', { tag: 'x' });
    assert.strictEqual(ctx.vfxByUid.get('probe')?.tag, 'x');
  });
});

describe('playStatusAppliedForScene uid contract', () => {
  it('throws when uid is missing (null/undefined/empty)', async () => {
    const scene = {
      vfxByUid: new Map(),
      layers: { effects: new FakeContainer() },
      getSprite: () => null,
    };
    const ctx = createStatusVfxContext(scene);

    await assert.rejects(
      () => playStatusAppliedForScene(ctx, 'player', null, 'sleep'),
      /uid is required/
    );
    await assert.rejects(
      () => playStatusAppliedForScene(ctx, 'player', undefined, 'sleep'),
      /uid is required/
    );
    await assert.rejects(
      () => playStatusAppliedForScene(ctx, 'player', '', 'sleep'),
      /uid is required/
    );
  });
});

describe('clearStatusVfxForScene uid contract', () => {
  it('throws when uid is missing', () => {
    const scene = {
      vfxByUid: new Map(),
      layers: { effects: new FakeContainer() },
      getSprite: () => null,
    };
    const ctx = createStatusVfxContext(scene);

    assert.throws(
      () => clearStatusVfxForScene(ctx, 'player', null, 'sleep'),
      /uid is required/
    );
    assert.throws(
      () => clearStatusVfxForScene(ctx, 'player', undefined, 'sleep'),
      /uid is required/
    );
    assert.throws(
      () => clearStatusVfxForScene(ctx, 'player', '', 'sleep'),
      /uid is required/
    );
  });

  it('is a no-op when no entry exists for the uid+effectType', () => {
    const scene = {
      vfxByUid: new Map(),
      layers: { effects: new FakeContainer() },
      getSprite: () => null,
    };
    const ctx = createStatusVfxContext(scene);
    // Should not throw for a missing entry — invariant is uid presence, not tracked state.
    clearStatusVfxForScene(ctx, 'player', 'never-registered', 'sleep');
  });
});
