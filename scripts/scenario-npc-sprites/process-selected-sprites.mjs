#!/usr/bin/env node

/**
 * Trim background-removed NPC PNGs and write game-ready 256x256 WebP sprites.
 *
 * Usage:
 *   node scripts/scenario-npc-sprites/process-selected-sprites.mjs
 *   node scripts/scenario-npc-sprites/process-selected-sprites.mjs --input tmp/npc-sprites-scenario/bg-removed
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
];

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    ids: { type: 'string' },
    size: { type: 'string' },
    subject: { type: 'string' },
  },
  strict: true,
});

const inputDir = values.input || 'tmp/npc-sprites-scenario/bg-removed';
const size = Number(values.size || 256);
const subjectSize = Number(values.subject || 232);
const ids = values.ids ? values.ids.split(',').map(id => id.trim()).filter(Boolean) : DEFAULT_IDS;

function outputPath(id) {
  if (id === 'shrine_fox') return 'public/assets/sprites/shrine_fox.webp';
  return `public/assets/sprites/npcs/${id}.webp`;
}

async function processOne(id) {
  const input = `${inputDir}/${id}.png`;
  const outPath = outputPath(id);
  if (id !== 'shrine_fox') await mkdir('public/assets/sprites/npcs', { recursive: true });

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

for (const id of ids) {
  await processOne(id);
}
