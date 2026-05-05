import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_AREA_ID, SCORE_THRESHOLDS } from './config.mjs';
import { createPromptManifest } from './prompt-recipe.mjs';

async function nextRunId(areaDir) {
  await fs.mkdir(areaDir, { recursive: true });
  const entries = await fs.readdir(areaDir, { withFileTypes: true });
  const max = entries
    .filter(entry => entry.isDirectory() && /^run-\d+$/.test(entry.name))
    .map(entry => Number(entry.name.slice(4)))
    .reduce((highest, value) => Math.max(highest, value), 0);
  return `run-${String(max + 1).padStart(3, '0')}`;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function createRun({
  rootDir = path.resolve('tmp/battlefield-generation'),
  areaId = DEFAULT_AREA_ID,
  runId,
  runDelta = 'layout proof',
} = {}) {
  const areaDir = path.join(rootDir, areaId);
  const id = runId || await nextRunId(areaDir);
  const runDir = path.join(areaDir, id);
  await fs.mkdir(runDir, { recursive: true });

  await writeJson(path.join(runDir, 'prompts.json'), createPromptManifest({
    areaId,
    runId: id,
    runDelta,
  }));

  await writeJson(path.join(runDir, 'scenario-assets.json'), {
    areaId,
    runId: id,
    jobs: {},
    assets: {},
    notes: [],
  });

  await writeJson(path.join(runDir, 'scorecard.json'), {
    areaId,
    runId: id,
    approved: false,
    scores: {
      overall: 0,
      floorReadability: 0,
      layerValidity: 0,
      gameplayFit: 0,
    },
    thresholds: SCORE_THRESHOLDS,
    critique: '',
    weakestLayer: '',
    nextPromptDelta: runDelta,
  });

  return { runDir, runId: id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const deltaIndex = process.argv.indexOf('--delta');
  const runDelta = deltaIndex >= 0 ? process.argv[deltaIndex + 1] : undefined;
  const result = await createRun({ runDelta });
  console.log(JSON.stringify(result, null, 2));
}
