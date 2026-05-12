import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const MANIFESTS = [
  'public/assets/sprites/creatures-animated/manifest.json',
  'public/assets/sprites/npcs-animated/manifest.json',
];

function runtimePathForUrl(url) {
  const { pathname } = new URL(url, 'https://koto.local');
  return path.join(process.cwd(), 'public', pathname.replace(/^\/assets\//, 'assets/'));
}

async function readManifest(manifestPath) {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), manifestPath), 'utf8'));
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), relativePath), 'utf8'));
}

describe('animated sprite runtime assets', () => {
  for (const manifestPath of MANIFESTS) {
    it(`${manifestPath} references existing immutable WebP sheets`, async () => {
      const manifest = await readManifest(manifestPath);
      const rows = manifest.frames / manifest.columns;
      const root = path.dirname(manifestPath);

      assert.equal(Number.isInteger(rows), true);
      assert.equal(manifest.columns, 6);
      assert.equal(manifest.frames, 24);
      assert.equal(manifest.frameWidth, 256);
      assert.equal(manifest.frameHeight, 256);

      for (const [id, animations] of Object.entries(manifest.animations)) {
        const assetMetadata = await readJson(path.join(root, id, 'metadata.json'));

        for (const [kind, url] of Object.entries(animations)) {
          assert.match(url, new RegExp(`\\.webp\\?v=${manifest.version}$`), `${id}.${kind}`);

          const filePath = runtimePathForUrl(url);
          const metadata = await sharp(filePath).metadata();
          const expectedRuntimeSheet = path.relative(process.cwd(), filePath);

          assert.equal(metadata.format, 'webp', `${id}.${kind} format`);
          assert.equal(metadata.width, manifest.frameWidth * manifest.columns, `${id}.${kind} width`);
          assert.equal(metadata.height, manifest.frameHeight * rows, `${id}.${kind} height`);
          assert.equal(metadata.hasAlpha, true, `${id}.${kind} alpha`);
          if (Object.hasOwn(assetMetadata.animations?.[kind] || {}, 'runtimeSheet')) {
            assert.equal(
              assetMetadata.animations[kind].runtimeSheet,
              expectedRuntimeSheet,
              `${id}.${kind} metadata runtimeSheet`
            );
          }
        }
      }
    });
  }
});
