import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {
  constructor() { this.children = []; }
  addChild(child) { this.children.push(child); child.parent = this; return child; }
  removeChildren() { const old = this.children; this.children = []; return old; }
}

class FakeTilingSprite {
  constructor({ texture, width, height } = {}) {
    this.texture = texture;
    this.width = width;
    this.height = height;
    this.tilePosition = { x: 0, y: 0 };
    this.tileScale = { x: 1, y: 1, set: (x, y = x) => { this.tileScale.x = x; this.tileScale.y = y; } };
    this.destroyed = false;
  }
  destroy() { this.destroyed = true; }
}

await mock.module('pixi.js', {
  namedExports: { TilingSprite: FakeTilingSprite },
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
      return { width: 2560, height: 1024, path };
    },
  },
});

const {
  loadParallax,
  setScrollState,
  startParallax,
  stopParallax,
  updateParallax,
} = await import('../../../public/js/pixi/parallax.js');

beforeEach(() => {
  loadedPaths.length = 0;
  fakeAppState = {
    app: { screen: { width: 430, height: 464 } },
    layers: { background: new FakeContainer() },
  };
  globalThis.document = { querySelector: () => null };
  stopParallax();
  setScrollState('stopped');
});

describe('two-layer looping area background', () => {
  it('loads only sky and battleground from the area folder', async () => {
    await loadParallax('starter_meadow');

    assert.deepEqual(loadedPaths, [
      '/assets/backgrounds/starter_meadow/sky.webp',
      '/assets/backgrounds/starter_meadow/battleground.webp',
    ]);
    assert.equal(fakeAppState.layers.background.children.length, 2);
  });

  it('scrolls sky slowly and battleground at full speed while walking', async () => {
    await loadParallax('starter_meadow');
    const [sky, battleground] = fakeAppState.layers.background.children;

    startParallax(1);
    setScrollState('scrolling');
    updateParallax(60);

    assert.equal(sky.tilePosition.x, -6);
    assert.equal(battleground.tilePosition.x, -60);
  });

  it('drifts only the sky during encounters', async () => {
    await loadParallax('starter_meadow');
    const [sky, battleground] = fakeAppState.layers.background.children;

    startParallax(1);
    setScrollState('encounter');
    updateParallax(60);

    assert.equal(sky.tilePosition.x, -6);
    assert.equal(battleground.tilePosition.x, 0);
  });
});
