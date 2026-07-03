import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Fake PIXI Text that records destroy options ---
class FakeText {
  constructor(opts = {}) {
    this.text = opts.text ?? '';
    this.style = opts.style ?? {};
    this.x = 0;
    this.y = 0;
    this.alpha = 1;
    this.anchor = { set: () => {} };
    this.scale = { x: 1, y: 1, set(sx, sy) { this.x = sx; this.y = sy ?? sx; } };
    this.destroyed = false;
    this.destroyArgs = undefined;
    FakeText.instances.push(this);
  }
  destroy(opts) {
    this.destroyed = true;
    this.destroyArgs = opts;
  }
}
FakeText.instances = [];

await mock.module('pixi.js', {
  namedExports: { Text: FakeText },
});
await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({
      app: { screen: { width: 400, height: 800 } },
      layers: { overlay: { addChild: () => {}, removeChild: () => {} } },
    }),
  },
});
await mock.module('../../../public/js/pixi/tween.js', {
  namedExports: { tween: async () => {}, wait: async () => {} },
});
await mock.module('../../../public/js/pixi/effects.js', {
  namedExports: { screenShake: () => {}, screenFlash: () => {} },
});
await mock.module('../../../public/js/pixi/combat-effects-util.js', {
  namedExports: { TIER_FONT_SIZES: [12, 16, 20, 26, 32] },
});

const { destroyText, showDamageNumber, showEventPopup } =
  await import('../../../public/js/pixi/text.js');
const { showBanner } = await import('../../../public/js/pixi/banners.js');

const TEXTURE_OPTS = { texture: true, textureSource: true };

describe('destroyText', () => {
  it('destroys with texture and textureSource so GPU memory is reclaimed', () => {
    const t = new FakeText({ text: 'x' });
    destroyText(t);
    assert.equal(t.destroyed, true);
    assert.deepEqual(t.destroyArgs, TEXTURE_OPTS);
  });
});

describe('floating text teardown frees GPU textures', () => {
  beforeEach(() => {
    FakeText.instances.length = 0;
  });

  it('showDamageNumber destroys its Text with texture options', async () => {
    await showDamageNumber(12, { x: 100, y: 200 });
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });

  it('showEventPopup destroys its Text with texture options', async () => {
    await showEventPopup('Guard up!', { x: 100, y: 200 });
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });

  it('showBanner destroys its Text with texture options', async () => {
    await showBanner('Correct!', 'weak');
    assert.equal(FakeText.instances.length, 1);
    assert.deepEqual(FakeText.instances[0].destroyArgs, TEXTURE_OPTS);
  });
});
