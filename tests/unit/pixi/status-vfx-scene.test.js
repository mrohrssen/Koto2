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
// status-vfx.js no longer imports from formation.js after Task 18 (the
// legacy getCreatureSprite wrapper was deleted along with the _defaultCtx
// path). No formation mock is required; scene ctxs own sprite lookup.

const {
  createStatusVfxContext,
  playStatusAppliedForScene,
  clearStatusVfxForScene,
  clearAllStatusVfxForScene,
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

describe('clearAllStatusVfxForScene behavioral', () => {
  it('tears down every ongoing status entry for a uid', async () => {
    assert.equal(typeof clearAllStatusVfxForScene, 'function');

    const sprite = makeSprite();
    const scene = makeScene({ sprite });
    const ctx = createStatusVfxContext(scene);

    await playStatusAppliedForScene(ctx, 'enemy', 'enemy-1', 'taunt');
    await playStatusAppliedForScene(ctx, 'enemy', 'enemy-1', 'shield');
    await playStatusAppliedForScene(ctx, 'enemy', 'enemy-2', 'taunt');

    assert.ok(ctx.vfxByUid.get('enemy-1')?.taunt);
    assert.ok(ctx.vfxByUid.get('enemy-1')?.shield);

    clearAllStatusVfxForScene(ctx, 'enemy', 'enemy-1');

    assert.equal(ctx.vfxByUid.has('enemy-1'), false);
    assert.ok(ctx.vfxByUid.get('enemy-2')?.taunt, 'other creatures keep their VFX');
  });

  it('self-cancels ring updaters when the tracked sprite was destroyed mid-scene', async () => {
    const sprite = makeSprite();
    let x = 0;
    let y = 0;
    Object.defineProperties(sprite, {
      x: {
        get() {
          if (sprite.destroyed) throw new TypeError("Cannot read properties of null (reading 'x')");
          return x;
        },
        set(value) { x = value; },
      },
      y: {
        get() {
          if (sprite.destroyed) throw new TypeError("Cannot read properties of null (reading 'y')");
          return y;
        },
        set(value) { y = value; },
      },
    });

    const scene = makeScene({ sprite });
    const ctx = createStatusVfxContext(scene);
    const entry = await playStatusAppliedForScene(ctx, 'enemy', 'enemy-1', 'taunt');
    const [updater] = scene._updaters;

    assert.ok(entry?.container, 'taunt registers an ongoing ring container');
    assert.equal(scene._updaters.size, 1);

    sprite.destroyed = true;

    assert.doesNotThrow(() => updater(1, 16));
    assert.equal(scene._updaters.size, 0, 'dead-target updater cancels itself');
    assert.equal(entry.container._destroyed, true, 'orphaned ring container is destroyed');
  });
});

// --- Helpers shared by behavioral tests below -------------------------------

/**
 * Minimal "sprite" fixture: has x/y/tint/alpha/rotation plus a parent so the
 * shared _startOngoingInto path can read sprite.parent?.x in the tick bodies.
 */
function makeSprite() {
  return {
    x: 0,
    y: 0,
    alpha: 1,
    rotation: 0,
    tint: 0xFFFFFF,
    destroyed: false,
    transform: {},
    parent: { x: 0, y: 0 },
  };
}

/**
 * Minimal scene surface sufficient for playStatusAppliedForScene /
 * clearStatusVfxForScene. Does NOT extend the real Scene class — these tests
 * exercise the status-vfx contract, not scene lifecycle. addUpdater returns a
 * real cancel; updaters are stored so tests can inspect them if desired.
 */
function makeScene({ disposed = false, sprite = null } = {}) {
  const updaters = new Set();
  return {
    disposed,
    vfxByUid: new Map(),
    layers: { effects: new FakeContainer() },
    getSprite: () => sprite,
    addUpdater(fn) {
      updaters.add(fn);
      return () => updaters.delete(fn);
    },
    _updaters: updaters, // test-only introspection
  };
}

describe('playStatusAppliedForScene / clearStatusVfxForScene behavioral', () => {
  it('apply-then-sync-clear removes the effect (B2 regression)', async () => {
    // The ongoing VFX registration must happen BEFORE the one-shot await so
    // that a synchronous clearStatusVfxForScene called immediately after
    // playStatusAppliedForScene finds the entry and removes it.
    const sprite = makeSprite();
    const scene = makeScene({ sprite });
    const ctx = createStatusVfxContext(scene);

    // Kick off the apply. The internal _playAppliedOneShot is fire-and-forget,
    // but the wrapper returns a Promise resolving to the ongoing entry.
    const promise = playStatusAppliedForScene(ctx, 'player', 'uid-1', 'stun');
    // Synchronously clear — pre-fix, the ongoing entry would not yet be in
    // vfxByUid (because the apply was still suspended on the one-shot await)
    // and the clear would no-op. Post-fix, the entry is registered before the
    // fire-and-forget one-shot, so the clear finds and removes it.
    clearStatusVfxForScene(ctx, 'player', 'uid-1', 'stun');

    // Let any pending microtasks (the .catch handler on the one-shot) settle.
    await promise;

    // Entry must be gone. Either the inner map is missing entirely (because
    // deleting the last effect drops the outer map entry) or the stun slot is
    // undefined.
    const map = ctx.vfxByUid.get('uid-1');
    assert.ok(!map || !map.stun, 'stun entry should have been cleared');
  });

  it('returns null and clear no-ops when scene is disposed (B3)', async () => {
    const sprite = makeSprite();
    const scene = makeScene({ disposed: true, sprite });
    const ctx = createStatusVfxContext(scene);

    const result = await playStatusAppliedForScene(ctx, 'player', 'uid-1', 'stun');
    assert.equal(result, null, 'disposed scene should make apply return null');

    // Nothing should have been registered.
    assert.equal(ctx.vfxByUid.has('uid-1'), false);

    // And the clear path should not throw on a disposed scene.
    assert.doesNotThrow(() => clearStatusVfxForScene(ctx, 'player', 'uid-1', 'stun'));
  });

  it('double-start on same (uid, effectType) returns null (I-3)', async () => {
    const sprite = makeSprite();
    const scene = makeScene({ sprite });
    const ctx = createStatusVfxContext(scene);

    const first = await playStatusAppliedForScene(ctx, 'player', 'uid-1', 'stun');
    assert.ok(first !== null, 'first call should register and return the entry');

    const second = await playStatusAppliedForScene(ctx, 'player', 'uid-1', 'stun');
    assert.equal(second, null, 'second call should return null, not the existing entry');

    // The existing entry should still be present (guard leaves it alone).
    assert.ok(ctx.vfxByUid.get('uid-1')?.stun, 'existing entry still tracked');
  });
});
