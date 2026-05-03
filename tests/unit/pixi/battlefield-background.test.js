import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {
  constructor() { this.children = []; }
  addChild(child) { this.children.push(child); child.parent = this; return child; }
  removeChildren() { const old = this.children; this.children = []; return old; }
}

class FakeSprite {
  constructor({ texture } = {}) {
    this.texture = texture;
    this.width = 0;
    this.height = 0;
    this.x = 0;
    this.y = 0;
    this.scale = { x: 1, y: 1, set: (x, y = x) => { this.scale.x = x; this.scale.y = y; } };
    this.tilePosition = { x: 0, y: 0 };
    this.tileScale = { x: 1, y: 1, set: (x, y = x) => { this.tileScale.x = x; this.tileScale.y = y; } };
    this.destroyed = false;
  }
  destroy() { this.destroyed = true; }
}

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    TilingSprite: FakeSprite,
  },
});

let fakeAppState;
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: { getApp: () => fakeAppState },
});

const loadedPaths = [];
await mock.module('../../../public/js/pixi/image-loader.js', {
  namedExports: {
    loadImageTexture: async (path) => {
      loadedPaths.push(path);
      return { width: 4096, height: 1024, path };
    },
  },
});

const {
  loadBattlefieldBackground,
  updateBattlefieldBackground,
  resizeBattlefieldBackground,
  clearBattlefieldBackground,
  startSkyDrift,
  stopSkyDrift,
  _getBattlefieldBackgroundState,
} = await import('../../../public/js/pixi/battlefield-background.js');

beforeEach(() => {
  loadedPaths.length = 0;
  fakeAppState = {
    app: { screen: { width: 390, height: 347 } },
    layers: { background: new FakeContainer() },
  };
  clearBattlefieldBackground();
});

describe('battlefield-background', () => {
  it('loads sky, background, and battleground in render order', async () => {
    await loadBattlefieldBackground('starter_meadow');
    assert.deepEqual(loadedPaths, [
      '/assets/backgrounds/starter_meadow/sky.webp',
      '/assets/backgrounds/starter_meadow/background.webp',
      '/assets/backgrounds/starter_meadow/battleground.webp',
    ]);
    assert.equal(fakeAppState.layers.background.children.length, 3);
  });

  it('drifts only the sky when enabled', async () => {
    await loadBattlefieldBackground('starter_meadow');
    const state = _getBattlefieldBackgroundState();
    startSkyDrift(1);
    updateBattlefieldBackground(60);
    assert.ok(state.sky.tilePosition.x < 0);
    assert.equal(state.scenery.x, 0);
    assert.equal(state.battleground.x, 0);
  });

  it('does not drift when stopped', async () => {
    await loadBattlefieldBackground('starter_meadow');
    const state = _getBattlefieldBackgroundState();
    stopSkyDrift();
    updateBattlefieldBackground(60);
    assert.equal(state.sky.tilePosition.x, 0);
  });

  it('resizes all layers to screen size', async () => {
    await loadBattlefieldBackground('starter_meadow');
    resizeBattlefieldBackground(800, 450);
    const state = _getBattlefieldBackgroundState();
    assert.equal(state.sky.width, 800);
    assert.equal(state.sky.height, 450);
    assert.equal(state.scenery.width, 800);
    assert.equal(state.battleground.height, 450);
  });
});
