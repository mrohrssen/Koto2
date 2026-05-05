import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_AREA_ID,
  FALLBACK_WIDTHS,
  FLOOR_BAND,
  LAYER_ORDER,
  SKY_KEY,
  SCENARIO_MODELS,
  TARGET_SIZE,
} = await import('../../../scripts/battlefield-generation/config.mjs');

describe('battlefield generation config', () => {
  it('targets starter meadow with a two-layer contract', () => {
    assert.equal(DEFAULT_AREA_ID, 'starter_meadow');
    assert.deepEqual(LAYER_ORDER, ['sky', 'battleground']);
  });

  it('uses GPT Image 2 at the widest useful size with fallbacks', () => {
    assert.equal(SCENARIO_MODELS.generation, 'model_openai-gpt-image-2');
    assert.deepEqual(TARGET_SIZE, { width: 3840, height: 1024 });
    assert.deepEqual(FALLBACK_WIDTHS, [3584, 3328, 3072, 2816, 2560, 2304, 2048]);
  });

  it('defines the bottom 62 percent as playable floor', () => {
    assert.deepEqual(FLOOR_BAND, {
      topRatio: 0.38,
      heightRatio: 0.62,
      topPx: 389,
      bottomPx: 1024,
    });
  });

  it('uses pure white as the sky key color', () => {
    assert.deepEqual(SKY_KEY, { r: 255, g: 255, b: 255, hex: '#ffffff', tolerance: 24 });
  });
});
