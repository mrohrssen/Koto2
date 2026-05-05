import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_AREA_ID, LAYER_ORDER, SCORE_THRESHOLDS } from './config.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function assertApproved(scorecard) {
  const scores = scorecard?.scores || {};
  const approved = scorecard?.approved === true
    && scores.overall >= SCORE_THRESHOLDS.overall
    && scores.floorReadability >= SCORE_THRESHOLDS.floorReadability
    && scores.layerValidity >= SCORE_THRESHOLDS.layerValidity
    && scores.gameplayFit >= SCORE_THRESHOLDS.gameplayFit;

  if (!approved) {
    throw new Error('Run is not approved or does not meet score thresholds.');
  }
}

export async function exportApproved({ runDir, areaId = DEFAULT_AREA_ID, outDir } = {}) {
  if (!runDir) throw new Error('exportApproved requires runDir.');
  const scorecard = await readJson(path.join(runDir, 'scorecard.json'));
  assertApproved(scorecard);

  const outputDir = outDir || path.resolve('public/assets/backgrounds', areaId);
  await fs.mkdir(outputDir, { recursive: true });

  for (const layer of LAYER_ORDER) {
    await sharp(path.join(runDir, `${layer}.png`))
      .webp({ quality: 90 })
      .toFile(path.join(outputDir, `${layer}.webp`));
  }

  return outputDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [runDir, areaId] = process.argv.slice(2);
  const outDir = await exportApproved({ runDir, areaId });
  console.log(JSON.stringify({ outDir }, null, 2));
}
