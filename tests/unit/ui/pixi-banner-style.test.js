import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const textConfigs = [];

class FakeText {
  constructor(config) {
    textConfigs.push(config);
    this.anchor = { set() {} };
    this.x = 0;
    this.y = 0;
    this.alpha = 1;
  }

  destroy() {}
}

await mock.module('pixi.js', {
  namedExports: { Text: FakeText },
});

await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({
      app: { screen: { width: 320, height: 640 } },
      layers: { overlay: { addChild() {} } },
    }),
  },
});

await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: {
    tween: async (target, props) => Object.assign(target, props),
    wait: async () => {},
  },
});

await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: {
    screenShake: () => {},
    screenFlash: () => {},
  },
});

const { showBanner } = await import('../../../public/js/pixi/banners.js');

describe('pixi combat banners', () => {
  beforeEach(() => {
    textConfigs.length = 0;
  });

  it('center-aligns multiline banner text', async () => {
    await showBanner('3 In A Row!\nTeam Healed +20%', 'streak');

    assert.equal(textConfigs[0].style.align, 'center');
  });
});
