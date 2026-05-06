import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

class FakeContainer {}
class FakeSprite {}
class FakeGraphics {}
class FakeText {}
class FakeTilingSprite {}
class FakeApplication {}
class FakeGlowFilter { destroy() {} }

await mock.module('pixi.js', {
  namedExports: {
    Sprite: FakeSprite,
    Container: FakeContainer,
    Texture: { WHITE: {} },
    Graphics: FakeGraphics,
    Text: FakeText,
    TilingSprite: FakeTilingSprite,
    Application: FakeApplication,
  },
});

await mock.module('pixi-filters', {
  namedExports: { GlowFilter: FakeGlowFilter },
});

const { setFormationTravelOffset } = await import('../../../public/js/pixi/formation.js');

function makeCtx() {
  const sprite = {
    baseX: 100,
    x: 100,
    _entering: false,
    _travelOffsetX: 0,
    _shadow: { x: 100 },
    statusLabels: [{ x: 80 }, { x: 120 }],
  };
  return {
    creatureSprites: {
      player: new Map([['ally', sprite]]),
      enemy: new Map(),
    },
    sprite,
  };
}

describe('setFormationTravelOffset', () => {
  it('moves player sprites, shadows, and status labels by the travel offset', () => {
    const ctx = makeCtx();

    setFormationTravelOffset(ctx, 48);

    assert.equal(ctx.sprite.x, 148);
    assert.equal(ctx.sprite._shadow.x, 148);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [128, 168]);
  });

  it('applies offset deltas without accumulating label drift', () => {
    const ctx = makeCtx();

    setFormationTravelOffset(ctx, 48);
    setFormationTravelOffset(ctx, 12);
    setFormationTravelOffset(ctx, 0);

    assert.equal(ctx.sprite.x, 100);
    assert.equal(ctx.sprite._shadow.x, 100);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [80, 120]);
  });

  it('does not disturb sprites that are currently entering', () => {
    const ctx = makeCtx();
    ctx.sprite._entering = true;

    setFormationTravelOffset(ctx, 48);

    assert.equal(ctx.sprite.x, 100);
    assert.equal(ctx.sprite._shadow.x, 100);
    assert.deepEqual(ctx.sprite.statusLabels.map(label => label.x), [80, 120]);
  });
});
