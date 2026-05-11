import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeRectangle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

class FakeTexture {
  constructor(options = {}) {
    this.source = options.source;
    this.frame = options.frame;
  }
}
FakeTexture.from = () => new FakeTexture({ source: {} });

await mock.module('pixi.js', {
  namedExports: {
    Rectangle: FakeRectangle,
    Texture: FakeTexture,
  },
});

const {
  chooseAnimationKind,
  frameRectForIndex,
  nextAnimationFrame,
} = await import('../../../public/js/pixi/animated-creature-sprite.js');

describe('animated creature sprite helpers', () => {
  it('maps frame indexes into a 6-column sheet', () => {
    assert.deepEqual(frameRectForIndex(7, {
      frameWidth: 256,
      frameHeight: 256,
      columns: 6,
    }), {
      x: 256,
      y: 256,
      width: 256,
      height: 256,
    });
  });

  it('advances frames based on elapsed milliseconds', () => {
    const state = { fps: 10, frames: 4, frameIndex: 0, elapsedMs: 0 };

    assert.equal(nextAnimationFrame(state, 90), 0);
    assert.equal(nextAnimationFrame(state, 10), 1);
    assert.equal(nextAnimationFrame(state, 300), 0);
  });

  it('chooses walk only when walking is enabled and available', () => {
    assert.equal(chooseAnimationKind({ idle: 'idle.png', walk: 'walk.png' }, true), 'walk');
    assert.equal(chooseAnimationKind({ idle: 'idle.png', walk: 'walk.png' }, false), 'idle');
    assert.equal(chooseAnimationKind({ idle: 'idle.png' }, true), 'idle');
    assert.equal(chooseAnimationKind({ walk: 'walk.png' }, false), 'walk');
  });
});
