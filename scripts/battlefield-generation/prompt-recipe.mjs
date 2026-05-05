import { DEFAULT_AREA_ID, SCENARIO_MODELS, SKY_KEY, TARGET_SIZE } from './config.mjs';

const STYLE_BIBLE = [
  'bright painterly mobile JRPG battlefield background',
  'soft fantasy meadow',
  'clear readable shapes',
  'gentle morning light',
  'not photorealistic',
  'not generic anime character art',
].join(', ');

const NEGATIVE_PROMPT = [
  'No characters',
  'no creatures',
  'no people',
  'no UI',
  'no text',
  'no labels',
  'no logos',
  'no watermarks',
  'no baked shadows from characters',
].join(', ');

function appendRunDelta(lines, runDelta) {
  if (runDelta) lines.push(`Current iteration focus: ${runDelta}.`);
  return lines;
}

export function buildBattlegroundPrompt({
  runDelta,
  width = TARGET_SIZE.width,
  height = TARGET_SIZE.height,
} = {}) {
  const lines = [
    'Generate the battleground layer for the starter meadow battlefield.',
    `Canvas: ${width}x${height}, wide horizontal side-scrolling strip.`,
    `Style: ${STYLE_BIBLE}.`,
    'The bottom 62% must be readable playable grassy terrain that can hold three ally creatures on the left and three enemy creatures on the right.',
    'The upper 38% may contain trees, hills, mountains, distant village-edge silhouettes, and other meadow scenery.',
    `Any actual sky openings should be pure ${SKY_KEY.hex} so Scenario background removal can cleanly separate the battleground from the sky.`,
    'Do not put white sky color in the playable lower floor. Do not make the floor busy under creature feet.',
    'Keep the center aisle open and avoid literal grid markers, pads, circles, lanes, or board-game spaces.',
    `${NEGATIVE_PROMPT}.`,
  ];
  return appendRunDelta(lines, runDelta).join('\n');
}

export function buildSkyPrompt({
  runDelta,
  width = TARGET_SIZE.width,
  height = TARGET_SIZE.height,
} = {}) {
  const lines = [
    'Generate the sky only layer for the starter meadow battlefield.',
    `Canvas: ${width}x${height}, matching the keyed battleground reference.`,
    `Style: ${STYLE_BIBLE}.`,
    'Use the keyed battleground reference for palette, lighting, and atmosphere.',
    'Create a calm bright sky with soft clouds and gentle fantasy color that fits behind meadow trees and mountains.',
    'No ground, no trees, no mountains, no scenery silhouettes, no characters, no creatures, no UI, no text, no logos.',
  ];
  return appendRunDelta(lines, runDelta).join('\n');
}

export function createPromptManifest({
  areaId = DEFAULT_AREA_ID,
  runId = 'run-001',
  runDelta = '',
  width = TARGET_SIZE.width,
  height = TARGET_SIZE.height,
} = {}) {
  return {
    areaId,
    runId,
    runDelta,
    modelId: SCENARIO_MODELS.generation,
    size: { width, height },
    prompts: {
      battleground: buildBattlegroundPrompt({ runDelta, width, height }),
      sky: buildSkyPrompt({ runDelta, width, height }),
    },
  };
}
