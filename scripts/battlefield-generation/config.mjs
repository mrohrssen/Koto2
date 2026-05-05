export const SCENARIO_MODELS = {
  generation: 'model_openai-gpt-image-2',
};

export const TARGET_SIZE = {
  width: 3840,
  height: 1024,
};

export const FALLBACK_WIDTHS = [3584, 3328, 3072, 2816, 2560, 2304, 2048];

export const DEFAULT_AREA_ID = 'starter_meadow';

export const LAYER_ORDER = ['sky', 'battleground'];

export const FLOOR_BAND = {
  topRatio: 0.38,
  heightRatio: 0.62,
  topPx: Math.round(TARGET_SIZE.height * 0.38),
  bottomPx: TARGET_SIZE.height,
};

export const SKY_KEY = {
  r: 255,
  g: 255,
  b: 255,
  hex: '#ffffff',
  tolerance: 24,
};

export const SCORE_THRESHOLDS = {
  overall: 70,
  floorReadability: 18,
  layerValidity: 18,
  gameplayFit: 18,
};
