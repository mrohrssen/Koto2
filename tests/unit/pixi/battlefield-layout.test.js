import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  rowForFormationIndex,
  getBattlefieldSlot,
  getBattlefieldSpriteScale,
  getBattlefieldShadowSpec,
  getBattlefieldLabelRect,
} = await import('../../../public/js/pixi/battlefield-layout.js');

describe('battlefield-layout grid constants', () => {
  it('mirrors ally and enemy columns around center', () => {
    assert.equal(BATTLEFIELD_COLUMNS.player, 0.195);
    assert.equal(BATTLEFIELD_COLUMNS.enemy, 0.805);
    assert.equal(BATTLEFIELD_COLUMNS.player + BATTLEFIELD_COLUMNS.enemy, 1);
  });

  it('uses evenly spaced rows', () => {
    assert.deepEqual(BATTLEFIELD_ROWS.map(row => row.name), ['top', 'middle', 'bottom']);
    assert.equal(BATTLEFIELD_ROWS[0].y, 0.435);
    assert.equal(BATTLEFIELD_ROWS[1].y, 0.652);
    assert.equal(BATTLEFIELD_ROWS[2].y, 0.870);
  });
});

describe('rowForFormationIndex', () => {
  it('maps one creature to the middle row', () => {
    assert.equal(rowForFormationIndex(0, 1), 1);
  });

  it('maps two creatures to top and bottom rows', () => {
    assert.equal(rowForFormationIndex(0, 2), 0);
    assert.equal(rowForFormationIndex(1, 2), 2);
  });

  it('maps three creatures to top, middle, and bottom rows', () => {
    assert.equal(rowForFormationIndex(0, 3), 0);
    assert.equal(rowForFormationIndex(1, 3), 1);
    assert.equal(rowForFormationIndex(2, 3), 2);
  });

  it('clamps unsupported indexes into valid rows', () => {
    assert.equal(rowForFormationIndex(-1, 3), 0);
    assert.equal(rowForFormationIndex(9, 3), 2);
  });
});

describe('getBattlefieldSlot', () => {
  it('converts normalized coordinates to canvas coordinates', () => {
    assert.deepEqual(getBattlefieldSlot('player', 0, 1000, 800), {
      side: 'player',
      rowIndex: 0,
      rowName: 'top',
      x: 195,
      y: 348,
      normalizedX: 0.195,
      normalizedY: 0.435,
    });
    assert.deepEqual(getBattlefieldSlot('enemy', 2, 1000, 800), {
      side: 'enemy',
      rowIndex: 2,
      rowName: 'bottom',
      x: 805,
      y: 696,
      normalizedX: 0.805,
      normalizedY: 0.870,
    });
  });
});

describe('row styling helpers', () => {
  it('returns row-based sprite scales', () => {
    assert.equal(getBattlefieldSpriteScale(0), 0.90);
    assert.equal(getBattlefieldSpriteScale(1), 0.98);
    assert.equal(getBattlefieldSpriteScale(2), 1.08);
  });

  it('returns row-based shadow specs', () => {
    assert.deepEqual(getBattlefieldShadowSpec(0), { width: 46, height: 12, alpha: 0.22 });
    assert.deepEqual(getBattlefieldShadowSpec(1), { width: 54, height: 14, alpha: 0.28 });
    assert.deepEqual(getBattlefieldShadowSpec(2), { width: 64, height: 16, alpha: 0.34 });
  });
});

describe('getBattlefieldLabelRect', () => {
  it('places labels above sprites and clamps them inside the scene', () => {
    const rect = getBattlefieldLabelRect({
      slotX: 50,
      slotY: 120,
      spriteHeight: 80,
      labelWidth: 110,
      labelHeight: 28,
      sceneWidth: 400,
      sceneHeight: 300,
    });
    assert.deepEqual(rect, { left: 4, top: 45, width: 110, height: 28 });
  });
});
