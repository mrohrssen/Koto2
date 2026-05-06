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
  BACKGROUND_VERSION,
  EXPLORATION_SCROLL_SPEED,
  ROOM_TRAVEL_DURATION_MS,
  ROOM_TRAVEL_SCROLL_SPEED,
  ROOM_TRAVEL_GROUND_DISTANCE_PX,
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
  it('loads only sky and battleground from the area folder, with cache-bust version suffix', async () => {
    await loadParallax('starter_meadow');

    assert.deepEqual(loadedPaths, [
      `/assets/backgrounds/starter_meadow/sky.webp?v=${BACKGROUND_VERSION}`,
      `/assets/backgrounds/starter_meadow/battleground.webp?v=${BACKGROUND_VERSION}`,
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

  it('exports the approved room travel motion target', async () => {
    assert.equal(EXPLORATION_SCROLL_SPEED, 0.6);
    assert.equal(ROOM_TRAVEL_DURATION_MS, 2700);
    assert.equal(ROOM_TRAVEL_SCROLL_SPEED, 3.8);
    assert.equal(ROOM_TRAVEL_GROUND_DISTANCE_PX, 620);
  });

  it('scrolls battleground at the approved room-travel speed', async () => {
    await loadParallax('starter_meadow');
    const [sky, battleground] = fakeAppState.layers.background.children;

    startParallax(ROOM_TRAVEL_SCROLL_SPEED);
    setScrollState('scrolling');
    updateParallax(60);

    assert.equal(sky.tilePosition.x, -22.8);
    assert.equal(battleground.tilePosition.x, -228);
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
