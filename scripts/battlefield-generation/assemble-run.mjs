import path from 'node:path';
import sharp from 'sharp';
import { TARGET_SIZE } from './config.mjs';

async function normalizedPng(inputPath, width, height) {
  return sharp(inputPath)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

export async function assembleRun({ runDir, width = TARGET_SIZE.width, height = TARGET_SIZE.height } = {}) {
  if (!runDir) throw new Error('assembleRun requires runDir.');

  const outputPath = path.join(runDir, 'assembled.png');
  const battleground = await normalizedPng(path.join(runDir, 'battleground.png'), width, height);

  await sharp(path.join(runDir, 'sky.png'))
    .resize(width, height, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .composite([{ input: battleground, blend: 'over' }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  const outputPath = await assembleRun({ runDir });
  console.log(JSON.stringify({ outputPath }, null, 2));
}
