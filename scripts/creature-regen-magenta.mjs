#!/usr/bin/env node

/**
 * Batch regenerate all creature staging images via Gemini 2.5 Flash image-to-image.
 * Backs up originals as {name}-old.png, sends to Gemini with magenta BG cleanup prompt.
 *
 * Usage: node scripts/creature-regen-magenta.mjs [--dry-run] [--only name1,name2]
 */

import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve, basename } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const STAGING_DIR = resolve(import.meta.dirname, '..', 'data', 'creature-staging-images');
const KEY_PATH = resolve(import.meta.dirname, '..', 'data', '.creature-forge-gemini-key');

const PROMPT = `Update the image so the character is completely isolated on a solid, pure magenta background (Hex #FF00FF) with sharp, crisp edges and no lighting bleed, glow, or shadows. No shadow underneath the character. Full body shot, ready for animation.

Keep the character's design, colors, proportions, and style exactly the same — only change the background and edge quality. Preserve particles around the character but ensure no light leak or light bleeding. The creature itself must not contain any magenta (#FF00FF). Remove any ground plane, shadow beneath the creature, gradient, or ambient lighting effects. The result should look like a clean game sprite on a perfectly flat, uniform magenta field.`;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const BETWEEN_CALLS_MS = 2000; // rate limit buffer

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function regenerateImage(model, imagePath) {
  const imageBytes = await readFile(imagePath);
  const base64 = imageBytes.toString('base64');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64 } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const parts = result.response.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error('No parts in response');

      const imagePart = parts.find(p => p.inlineData);
      if (!imagePart) {
        const textPart = parts.find(p => p.text);
        throw new Error(`No image returned: ${textPart?.text || 'unknown reason'}`);
      }

      return Buffer.from(imagePart.inlineData.data, 'base64');
    } catch (err) {
      const msg = err?.message || String(err);
      // Don't retry safety blocks
      if (msg.includes('SAFETY') || msg.includes('blocked') || msg.includes('content policy')) {
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        console.error(`  Attempt ${attempt + 1} failed (${msg}), retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  const args = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      only: { type: 'string' },
    },
    strict: true,
  });

  const dryRun = args.values['dry-run'];
  const onlyFilter = args.values.only ? args.values.only.split(',').map(s => s.trim()) : null;

  // Read API key
  const apiKey = (await readFile(KEY_PATH, 'utf-8')).trim();
  if (!apiKey) {
    console.error('No API key found');
    process.exit(1);
  }

  // List staging images (exclude -old backups)
  const files = await readdir(STAGING_DIR);
  let pngFiles = files
    .filter(f => f.endsWith('.png') && !f.includes('-old'))
    .sort();

  if (onlyFilter) {
    pngFiles = pngFiles.filter(f => {
      const name = basename(f, '.png');
      return onlyFilter.includes(name);
    });
  }

  console.log(`Found ${pngFiles.length} creature images to regenerate`);
  if (dryRun) {
    pngFiles.forEach(f => console.log(`  [dry-run] Would process: ${f}`));
    return;
  }

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  const results = { ok: [], failed: [] };

  for (const file of pngFiles) {
    const name = basename(file, '.png');
    const currentPath = resolve(STAGING_DIR, file);
    const oldPath = resolve(STAGING_DIR, `${name}-old.png`);
    const old2Path = resolve(STAGING_DIR, `${name}-old2.png`);

    console.log(`\n[${results.ok.length + results.failed.length + 1}/${pngFiles.length}] Processing: ${name}`);

    // Preserve current regen as -old2, send the original (-old) to Gemini
    await copyFile(currentPath, old2Path);
    console.log(`  Preserved current → ${name}-old2.png`);

    // Verify -old.png (original) exists as our source
    try {
      await readFile(oldPath, { flag: 'r' });
    } catch {
      console.error(`  ✗ SKIPPED: ${name}-old.png not found (no original to regenerate from)`);
      results.failed.push({ name, error: 'no -old.png source' });
      continue;
    }

    try {
      const newImage = await regenerateImage(model, oldPath);
      await writeFile(currentPath, newImage);
      console.log(`  ✓ Regenerated from original (${(newImage.length / 1024).toFixed(0)} KB)`);
      results.ok.push(name);
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      results.failed.push({ name, error: err.message });
    }

    // Rate limit pause between calls
    if (results.ok.length + results.failed.length < pngFiles.length) {
      await sleep(BETWEEN_CALLS_MS);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done! ${results.ok.length} succeeded, ${results.failed.length} failed`);
  if (results.failed.length > 0) {
    console.log('Failed creatures:');
    results.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
