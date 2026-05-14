import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeImage {
  static instances = [];
  constructor() {
    this.decode = mock.fn(async () => {});
    FakeImage.instances.push(this);
  }
}

globalThis.Image = FakeImage;

await mock.module('pixi.js', {
  namedExports: {
    Texture: {
      from: (img) => ({ img, texture: true }),
    },
  },
});

const {
  loadImageElement,
  loadTexture,
  resetAssetLoaderForTests,
} = await import('../../../public/js/assets/asset-loader.js');

describe('asset loader', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    resetAssetLoaderForTests();
  });

  it('dedupes concurrent image loads by URL and leaves crossOrigin unset', async () => {
    const first = loadImageElement('/assets/sprites/creatures/inu.webp?v=test');
    const second = loadImageElement('/assets/sprites/creatures/inu.webp?v=test');

    assert.equal(first, second);
    const image = await first;

    assert.equal(FakeImage.instances.length, 1);
    assert.equal(image.crossOrigin, undefined);
    assert.equal(image.src, '/assets/sprites/creatures/inu.webp?v=test');
  });

  it('reuses the decoded image when creating textures', async () => {
    const image = await loadImageElement('/assets/sprites/creatures/inu.webp?v=test');
    const texture = await loadTexture('/assets/sprites/creatures/inu.webp?v=test');

    assert.equal(texture.img, image);
    assert.equal(FakeImage.instances.length, 1);
  });
});
