import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';

const exec = promisify(execFile);
const GATE1 = join(import.meta.dirname, '../../../scripts/sprite-gate1.py');

async function runGate1(inputDir, type = 'action') {
  const { stdout } = await exec('python3', [GATE1, '--input', inputDir, '--type', type, '--json']);
  return JSON.parse(stdout);
}

async function runGate1Raw(inputDir, type = 'action') {
  try {
    const { stdout, stderr } = await exec('python3', [GATE1, '--input', inputDir, '--type', type, '--json']);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return { stdout: err.stdout, stderr: err.stderr, code: err.code };
  }
}

/**
 * Create a white 128x128 image with centered colored content.
 * Uses varied colors to pass the visual complexity check (min 4 clusters for action).
 */
async function createValidActionIcon(filePath) {
  const size = 128;
  const squareSize = 40;
  const offset = Math.floor((size - squareSize) / 2);

  // Start with white background
  const pixels = Buffer.alloc(size * size * 3, 255);

  // Draw a colored region in the center with varied colors for complexity
  for (let y = offset; y < offset + squareSize; y++) {
    for (let x = offset; x < offset + squareSize; x++) {
      const idx = (y * size + x) * 3;
      // Create gradient-like variation to produce multiple color clusters
      pixels[idx] = (x * 4 + y * 3) % 200;       // R varies
      pixels[idx + 1] = (x * 6 + y * 2) % 180;   // G varies
      pixels[idx + 2] = (x * 2 + y * 5) % 220;   // B varies
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(filePath);
}

/**
 * Create a valid 1024x1024 creature sprite with centered content.
 */
async function createValidCreatureSprite(filePath) {
  const size = 1024;
  const squareSize = 400;
  const offset = Math.floor((size - squareSize) / 2);

  // Start with white background
  const pixels = Buffer.alloc(size * size * 3, 255);

  // Draw a large colored region in the center with moderate color variation.
  // Uses coarser variation to stay within complexity bounds (30-2000 clusters).
  for (let y = offset; y < offset + squareSize; y++) {
    for (let x = offset; x < offset + squareSize; x++) {
      const idx = (y * size + x) * 3;
      // Quantize positions to reduce unique color count
      const bx = Math.floor(x / 8);
      const by = Math.floor(y / 8);
      pixels[idx] = (bx * 17 + by * 13) % 200;       // R varies
      pixels[idx + 1] = (bx * 23 + by * 7) % 180;    // G varies
      pixels[idx + 2] = (bx * 11 + by * 19) % 220;   // B varies
    }
  }

  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(filePath);
}


describe('Gate 1 — Sprite Technical Validation', () => {
  let tmpDir;

  before(() => {
    tmpDir = join(import.meta.dirname, '_gate1_tmp_' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('valid sprites pass', () => {
    it('passes a valid 128x128 action icon', async () => {
      const subDir = join(tmpDir, 'valid-action');
      mkdirSync(subDir, { recursive: true });
      await createValidActionIcon(join(subDir, 'dash-a.png'));

      const results = await runGate1(subDir, 'action');

      assert.equal(results.length, 1);
      assert.equal(results[0].file, 'dash-a.png');
      assert.equal(results[0].passed, true);

      // All checks should pass
      for (const check of results[0].checks) {
        assert.equal(check.passed, true, `Check "${check.name}" should pass but failed: ${check.detail}`);
      }
    });

    it('accepts a valid 1024x1024 creature', async () => {
      const subDir = join(tmpDir, 'valid-creature');
      mkdirSync(subDir, { recursive: true });
      await createValidCreatureSprite(join(subDir, 'hikaribon.png'));

      const results = await runGate1(subDir, 'creature');

      assert.equal(results.length, 1);
      assert.equal(results[0].file, 'hikaribon.png');
      assert.equal(results[0].passed, true);
    });
  });

  describe('dimension checks', () => {
    it('rejects wrong dimensions (256x256 for action)', async () => {
      const subDir = join(tmpDir, 'wrong-dims');
      mkdirSync(subDir, { recursive: true });

      // Create a 256x256 image (wrong size for action which expects 128x128)
      const size = 256;
      const pixels = Buffer.alloc(size * size * 3, 255);
      // Add some content in the center
      const sq = 80;
      const off = Math.floor((size - sq) / 2);
      for (let y = off; y < off + sq; y++) {
        for (let x = off; x < off + sq; x++) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 100;
          pixels[idx + 1] = 50;
          pixels[idx + 2] = 150;
        }
      }
      await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toFile(join(subDir, 'wrong-size.png'));

      const { stdout, code } = await runGate1Raw(subDir, 'action');
      const results = JSON.parse(stdout);

      assert.equal(results[0].passed, false);
      const dimCheck = results[0].checks.find(c => c.name === 'dimensions');
      assert.equal(dimCheck.passed, false);
      assert.match(dimCheck.detail, /128.*128/);
      assert.notEqual(code, 0, 'Should exit with non-zero code');
    });
  });

  describe('content checks', () => {
    it('rejects near-empty image (~1% content)', async () => {
      const subDir = join(tmpDir, 'near-empty');
      mkdirSync(subDir, { recursive: true });

      const size = 128;
      const pixels = Buffer.alloc(size * size * 3, 255); // all white

      // Add tiny content — ~1% of 128*128 = ~164 pixels = ~13x13 block
      const sq = 13;
      const off = Math.floor((size - sq) / 2);
      for (let y = off; y < off + sq; y++) {
        for (let x = off; x < off + sq; x++) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
        }
      }

      await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toFile(join(subDir, 'near-empty.png'));

      const { stdout } = await runGate1Raw(subDir, 'action');
      const results = JSON.parse(stdout);

      assert.equal(results[0].passed, false);
      const contentCheck = results[0].checks.find(c => c.name === 'content_presence');
      assert.equal(contentCheck.passed, false);
    });
  });

  describe('centering checks', () => {
    it('passes when creature content is centered', async () => {
      const subDir = join(tmpDir, 'centering-pass');
      mkdirSync(subDir, { recursive: true });

      // Create a 1024x1024 creature image with centered content
      await createValidCreatureSprite(join(subDir, 'centered.png'));

      const results = await runGate1(subDir, 'creature');

      assert.equal(results.length, 1);
      const centerCheck = results[0].checks.find(c => c.name === 'centering');
      assert.ok(centerCheck, 'centering check should be present for creature type');
      assert.equal(centerCheck.passed, true, `Centering should pass: ${centerCheck.detail}`);
    });

    it('fails when creature content is pushed far left', async () => {
      const subDir = join(tmpDir, 'centering-fail');
      mkdirSync(subDir, { recursive: true });

      const size = 1024;
      const pixels = Buffer.alloc(size * size * 3, 255); // white background

      // Draw content only in the left 20% of the image (columns 10-200)
      const squareH = 400;
      const yOff = Math.floor((size - squareH) / 2);
      for (let y = yOff; y < yOff + squareH; y++) {
        for (let x = 10; x < 200; x++) {
          const idx = (y * size + x) * 3;
          const bx = Math.floor(x / 8);
          const by = Math.floor(y / 8);
          pixels[idx] = (bx * 17 + by * 13) % 200;
          pixels[idx + 1] = (bx * 23 + by * 7) % 180;
          pixels[idx + 2] = (bx * 11 + by * 19) % 220;
        }
      }

      await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toFile(join(subDir, 'left-heavy.png'));

      const { stdout } = await runGate1Raw(subDir, 'creature');
      const results = JSON.parse(stdout);

      assert.equal(results.length, 1);
      const centerCheck = results[0].checks.find(c => c.name === 'centering');
      assert.ok(centerCheck, 'centering check should be present for creature type');
      assert.equal(centerCheck.passed, false, `Centering should fail for far-left content: ${centerCheck.detail}`);
    });
  });

  describe('connected silhouette checks', () => {
    it('passes when item has one solid block of content', async () => {
      const subDir = join(tmpDir, 'silhouette-pass');
      mkdirSync(subDir, { recursive: true });

      const size = 128;
      const pixels = Buffer.alloc(size * size * 3, 255); // white background

      // Draw one solid centered block of content with coarse color variation
      // to stay within complexity bounds (8-200 clusters for 128x128)
      const sq = 50;
      const off = Math.floor((size - sq) / 2);
      for (let y = off; y < off + sq; y++) {
        for (let x = off; x < off + sq; x++) {
          const idx = (y * size + x) * 3;
          const bx = Math.floor(x / 10);
          const by = Math.floor(y / 10);
          pixels[idx] = (bx * 40 + by * 30) % 200;
          pixels[idx + 1] = (bx * 60 + by * 20) % 180;
          pixels[idx + 2] = (bx * 20 + by * 50) % 220;
        }
      }

      await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toFile(join(subDir, 'connected.png'));

      const results = await runGate1(subDir, 'item');

      assert.equal(results.length, 1);
      const silCheck = results[0].checks.find(c => c.name === 'connected_silhouette');
      assert.ok(silCheck, 'connected_silhouette check should be present for item type');
      assert.equal(silCheck.passed, true, `Connected silhouette should pass: ${silCheck.detail}`);
    });

    it('fails when item has two widely separated content blocks', async () => {
      const subDir = join(tmpDir, 'silhouette-fail');
      mkdirSync(subDir, { recursive: true });

      const size = 128;
      const pixels = Buffer.alloc(size * size * 3, 255); // white background

      // Draw two small separated blocks — top-left and bottom-right
      // Block 1: rows 10-30, cols 10-30
      for (let y = 10; y < 30; y++) {
        for (let x = 10; x < 30; x++) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 50;
          pixels[idx + 1] = 100;
          pixels[idx + 2] = 150;
        }
      }
      // Block 2: rows 90-110, cols 90-110
      for (let y = 90; y < 110; y++) {
        for (let x = 90; x < 110; x++) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 150;
          pixels[idx + 1] = 50;
          pixels[idx + 2] = 100;
        }
      }

      await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .png()
        .toFile(join(subDir, 'disconnected.png'));

      const { stdout } = await runGate1Raw(subDir, 'item');
      const results = JSON.parse(stdout);

      assert.equal(results.length, 1);
      const silCheck = results[0].checks.find(c => c.name === 'connected_silhouette');
      assert.ok(silCheck, 'connected_silhouette check should be present for item type');
      assert.equal(silCheck.passed, false, `Connected silhouette should fail for separated blocks: ${silCheck.detail}`);
    });
  });

  describe('transparency checks', () => {
    it('rejects semi-transparent pixels (alpha=128)', async () => {
      const subDir = join(tmpDir, 'semi-transparent');
      mkdirSync(subDir, { recursive: true });

      const size = 128;
      // 4 channels: RGBA
      const pixels = Buffer.alloc(size * size * 4);

      // Fill with white opaque background
      for (let i = 0; i < size * size; i++) {
        pixels[i * 4] = 255;     // R
        pixels[i * 4 + 1] = 255; // G
        pixels[i * 4 + 2] = 255; // B
        pixels[i * 4 + 3] = 255; // A
      }

      // Add some proper content in center
      const sq = 40;
      const off = Math.floor((size - sq) / 2);
      for (let y = off; y < off + sq; y++) {
        for (let x = off; x < off + sq; x++) {
          const idx = (y * size + x) * 4;
          pixels[idx] = 100;     // R
          pixels[idx + 1] = 50;  // G
          pixels[idx + 2] = 150; // B
          pixels[idx + 3] = 255; // A - fully opaque
        }
      }

      // Add a block of semi-transparent pixels (alpha=128)
      for (let y = 20; y < 30; y++) {
        for (let x = 20; x < 30; x++) {
          const idx = (y * size + x) * 4;
          pixels[idx] = 100;
          pixels[idx + 1] = 100;
          pixels[idx + 2] = 100;
          pixels[idx + 3] = 128; // Semi-transparent
        }
      }

      await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toFile(join(subDir, 'semi-transparent.png'));

      const { stdout } = await runGate1Raw(subDir, 'action');
      const results = JSON.parse(stdout);

      assert.equal(results[0].passed, false);
      const transpCheck = results[0].checks.find(c => c.name === 'fake_transparency');
      assert.equal(transpCheck.passed, false);
    });
  });

  describe('exit codes', () => {
    it('exits 0 when all files pass', async () => {
      const subDir = join(tmpDir, 'exit-pass');
      mkdirSync(subDir, { recursive: true });
      await createValidActionIcon(join(subDir, 'good.png'));

      const { code } = await runGate1Raw(subDir, 'action');
      assert.equal(code, 0);
    });

    it('exits non-zero when any file fails', async () => {
      const subDir = join(tmpDir, 'exit-fail');
      mkdirSync(subDir, { recursive: true });

      // Create an image with wrong dimensions
      const pixels = Buffer.alloc(64 * 64 * 3, 200);
      await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } })
        .png()
        .toFile(join(subDir, 'bad.png'));

      const { code } = await runGate1Raw(subDir, 'action');
      assert.notEqual(code, 0);
    });
  });

  describe('JSON output format', () => {
    it('produces expected JSON structure', async () => {
      const subDir = join(tmpDir, 'json-format');
      mkdirSync(subDir, { recursive: true });
      await createValidActionIcon(join(subDir, 'test.png'));

      const results = await runGate1(subDir, 'action');

      assert.ok(Array.isArray(results), 'Output should be an array');
      assert.equal(results.length, 1);

      const r = results[0];
      assert.ok(typeof r.file === 'string');
      assert.ok(typeof r.passed === 'boolean');
      assert.ok(Array.isArray(r.checks));

      for (const check of r.checks) {
        assert.ok(typeof check.name === 'string', 'Check must have name');
        assert.ok(typeof check.passed === 'boolean', 'Check must have passed boolean');
        assert.ok(typeof check.detail === 'string', 'Check must have detail string');
      }

      // Verify expected check names are present
      const checkNames = r.checks.map(c => c.name);
      assert.ok(checkNames.includes('dimensions'));
      assert.ok(checkNames.includes('background_purity'));
      assert.ok(checkNames.includes('content_presence'));
      assert.ok(checkNames.includes('content_overflow'));
      assert.ok(checkNames.includes('fake_transparency'));
      assert.ok(checkNames.includes('visual_complexity'));
    });
  });
});
