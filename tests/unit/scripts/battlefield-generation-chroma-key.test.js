import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const { chromaKeyBattleground } = await import('../../../scripts/battlefield-generation/chroma-key-battleground.mjs');

describe('chromaKeyBattleground', () => {
  it('turns white sky openings transparent while preserving meadow pixels', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-key-'));
    const inputPath = path.join(dir, 'battleground-opaque.png');
    const outputPath = path.join(dir, 'battleground.png');

    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        { input: Buffer.from([255, 255, 255, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 0, top: 0 },
        { input: Buffer.from([40, 160, 70, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 0 },
        { input: Buffer.from([80, 180, 60, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 0, top: 1 },
        { input: Buffer.from([90, 130, 50, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 1 },
      ])
      .png()
      .toFile(inputPath);

    const result = await chromaKeyBattleground({ inputPath, outputPath, floorTopRatio: 0.5 });
    const pixels = await sharp(outputPath).raw().toBuffer();

    assert.equal(result.keyedPixels, 1);
    assert.equal(result.floorKeyedPixels, 0);
    assert.equal(pixels[3], 0);
    assert.equal(pixels[7], 255);
    assert.equal(pixels[11], 255);
    assert.equal(pixels[15], 255);
  });

  it('also keys near-white GPT sky pixels', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-key-near-'));
    const inputPath = path.join(dir, 'battleground-opaque.png');
    const outputPath = path.join(dir, 'battleground.png');

    await sharp({
      create: {
        width: 1,
        height: 2,
        channels: 4,
        background: { r: 20, g: 150, b: 60, alpha: 1 },
      },
    })
      .composite([
        { input: Buffer.from([245, 246, 242, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 0, top: 0 },
      ])
      .png()
      .toFile(inputPath);

    const result = await chromaKeyBattleground({ inputPath, outputPath, floorTopRatio: 0.5 });
    const pixels = await sharp(outputPath).raw().toBuffer();

    assert.equal(result.keyedPixels, 1);
    assert.equal(pixels[3], 0);
    assert.equal(pixels[7], 255);
  });

  it('rejects white key leaking into the playable floor', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-key-floor-'));
    const inputPath = path.join(dir, 'battleground-opaque.png');
    const outputPath = path.join(dir, 'battleground.png');

    await sharp({
      create: {
        width: 1,
        height: 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).png().toFile(inputPath);

    await assert.rejects(
      chromaKeyBattleground({ inputPath, outputPath, floorTopRatio: 0.5 }),
      /Sky key leaked into playable floor/
    );
  });
});
