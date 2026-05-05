import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const { assembleRun } = await import('../../../scripts/battlefield-generation/assemble-run.mjs');
const { exportApproved } = await import('../../../scripts/battlefield-generation/export-approved.mjs');

async function writeLayer(filePath, color) {
  await sharp({
    create: {
      width: 4,
      height: 2,
      channels: 4,
      background: color,
    },
  }).png().toFile(filePath);
}

describe('battlefield two-layer assembly and export', () => {
  it('composites sky behind transparent battleground', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-assemble-'));
    await writeLayer(path.join(dir, 'sky.png'), { r: 10, g: 90, b: 220, alpha: 1 });
    await writeLayer(path.join(dir, 'battleground.png'), { r: 40, g: 180, b: 70, alpha: 0.5 });

    const outputPath = await assembleRun({ runDir: dir, width: 4, height: 2 });
    const metadata = await sharp(outputPath).metadata();

    assert.equal(path.basename(outputPath), 'assembled.png');
    assert.equal(metadata.width, 4);
    assert.equal(metadata.height, 2);
  });

  it('exports only approved sky and battleground webps', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-export-'));
    const outDir = path.join(dir, 'public-assets');
    await writeLayer(path.join(dir, 'sky.png'), { r: 10, g: 90, b: 220, alpha: 1 });
    await writeLayer(path.join(dir, 'battleground.png'), { r: 40, g: 180, b: 70, alpha: 1 });
    await fs.writeFile(path.join(dir, 'scorecard.json'), JSON.stringify({
      approved: true,
      scores: {
        overall: 72,
        floorReadability: 20,
        layerValidity: 20,
        gameplayFit: 20,
      },
    }));

    await exportApproved({ runDir: dir, outDir });
    const entries = (await fs.readdir(outDir)).sort();

    assert.deepEqual(entries, ['battleground.webp', 'sky.webp']);
  });
});
