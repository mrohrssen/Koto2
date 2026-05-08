#!/usr/bin/env node

/**
 * Trim background-removed dialogue headshots and write game-ready WebP files.
 *
 * Usage:
 *   node scripts/scenario-npc-sprites/process-headshots.mjs
 *   node scripts/scenario-npc-sprites/process-headshots.mjs --input tmp/npc-sprites-scenario/headshots/raw-bg-removed
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const DEFAULT_IDS = [
  'cid',
  'game-master',
  'kodomo',
  'kyouju',
  'onnanoko',
  'otokonoko',
  'otona',
  'seito',
  'senpai',
  'sensei',
  'shrine_fox',
  'you-male',
  'you-female',
];

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    ids: { type: 'string' },
    size: { type: 'string' },
    subject: { type: 'string' },
  },
  strict: true,
});

const inputDir = values.input || 'tmp/npc-sprites-scenario/headshots/raw-bg-removed';
const outputDir = values.output || 'public/assets/dialogue/headshots';
const size = Number(values.size || 256);
const subjectSize = Number(values.subject || 232);
const ids = values.ids ? values.ids.split(',').map(id => id.trim()).filter(Boolean) : DEFAULT_IDS;

await mkdir(outputDir, { recursive: true });

for (const id of ids) {
  const input = `${inputDir}/${id}.png`;
  const outPath = `${outputDir}/${id}.webp`;
  const trimmed = await sharp(input)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(subjectSize, subjectSize, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, gravity: 'center' }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log(`${id} -> ${outPath} (${meta.width}x${meta.height}, alpha=${meta.hasAlpha})`);
}
