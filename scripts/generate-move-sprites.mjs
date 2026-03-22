#!/usr/bin/env node

/**
 * Generate pixel art move sprites via Gemini 3 Pro.
 * 3 variations per move, individual 256x256 images on white background.
 *
 * Usage:
 *   node scripts/generate-move-sprites.mjs                  # all moves
 *   node scripts/generate-move-sprites.mjs --only strike    # single move
 *   node scripts/generate-move-sprites.mjs --exclude strike,flame  # skip some
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..');
const API_KEY = (await readFile(resolve(PROJECT_ROOT, 'data/.creature-forge-gemini-key'), 'utf-8')).trim();
const VARIANTS = ['a', 'b', 'c'];

// ---------------------------------------------------------------------------
// Move prompt map — short visual descriptions for each move
// ---------------------------------------------------------------------------

const PROMPT_SUFFIX = 'rendered in crisp, clean pixels with gentle lighting and smooth gradients, set against a solid white background. Single 256x256 sprite image. This is an icon representing an ability in a JRPG game. Make it pixel art style with bold, readable shapes. Do not add any text, letters, or words to the image.';

const MOVES = {
  strike:     'A clenched fist with motion lines. Do not include any text or letters,',
  flame:      'A bright orange flame,',
  burn:       'A large bonfire,',
  guard:      'A round shield with a cross emblem,',
  leap:       'A human jumping,',
  cry:        'A small bird chirping,',
  sleep:      'A crescent moon with small Zzz letters,',
  'wash-away':'A crashing wave of water,',
  encircle:   'A ring of thorny vines,',
  grasp:      'A hand gripping tightly,',
  cut:        'A diagonal sword slash,',
  call:       'A person cupping their hands and calling out. Do not include any text or letters,',
  drink:      'A person gulping down a drink,',
  rage:       'An angry person visibly raging,',
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      only: { type: 'string' },
      exclude: { type: 'string' },
    },
    strict: true,
  });
  return {
    only: args.values.only || null,
    exclude: args.values.exclude ? args.values.exclude.split(',') : [],
  };
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

const RETRYABLE = [/fetch/i, /ECONNRESET/i, /ETIMEDOUT/i, /network/i, /socket hang up/i, /ENOTFOUND/i];
const RATE_LIMIT_PATTERNS = [/high demand/i, /rate limit/i, /quota/i, /429/i, /resource.*exhausted/i];

function isRetryable(err) {
  const msg = err?.message || String(err);
  return RETRYABLE.some(p => p.test(msg));
}

function isRateLimited(err) {
  const msg = err?.message || String(err);
  return RATE_LIMIT_PATTERNS.some(p => p.test(msg));
}

// ---------------------------------------------------------------------------
// Generate one image
// ---------------------------------------------------------------------------

async function generateOne(model, moveId, variant, outDir) {
  const description = MOVES[moveId];
  const prompt = `${description} ${PROMPT_SUFFIX}`;
  const outPath = `${outDir}/${moveId}-${variant}.png`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const parts = result.response.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error('No parts in response');

      const imagePart = parts.find(p => p.inlineData);
      if (!imagePart) {
        const textPart = parts.find(p => p.text);
        throw new Error(`content policy: ${textPart?.text || 'No image data'}`);
      }

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      await writeFile(outPath, buffer);
      console.log(`  ✓ ${moveId}-${variant} (${buffer.length} bytes)`);
      return { status: 'ok', path: outPath, bytes: buffer.length };
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('content policy') || msg.includes('SAFETY') || msg.includes('blocked')) {
        console.log(`  ✗ ${moveId}-${variant} BLOCKED: ${msg}`);
        return { status: 'blocked', error: msg };
      }
      if (isRateLimited(err)) {
        const wait = Math.min(5000 * (attempt + 1), 30000);
        console.log(`  ⏳ ${moveId}-${variant} rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/5)...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (isRetryable(err) && attempt < 4) {
        console.log(`  ⟳ ${moveId}-${variant} network error, retrying in 3s (attempt ${attempt + 1}/5)...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      console.log(`  ✗ ${moveId}-${variant} FAILED: ${msg}`);
      return { status: 'failed', error: msg };
    }
  }
  return { status: 'failed', error: 'max retries exceeded' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { only, exclude } = parseCli();
  let ids = only ? [only] : Object.keys(MOVES);
  if (exclude.length) ids = ids.filter(id => !exclude.includes(id));

  if (only && !MOVES[only]) {
    console.error(`Unknown move: ${only}. Available: ${Object.keys(MOVES).join(', ')}`);
    process.exit(1);
  }

  const outDir = 'tmp/move-sprites';
  await mkdir(outDir, { recursive: true });

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });

  console.log(`Generating ${ids.length} move(s) × ${VARIANTS.length} variants → ${outDir}/\n`);

  let total = 0;
  const totalExpected = ids.length * VARIANTS.length;
  const failed = [];

  for (const id of ids) {
    console.log(`${id}:`);
    for (const v of VARIANTS) {
      const result = await generateOne(model, id, v, outDir);
      total++;
      if (result.status !== 'ok') failed.push(`${id}-${v}`);
      // Rate limit: 3s pause between calls
      if (total < totalExpected) await new Promise(r => setTimeout(r, 3000));
    }
    console.log();
  }

  console.log(`\n${total - failed.length}/${total} succeeded.`);
  if (failed.length) {
    console.log(`⚠ Failed: ${failed.join(', ')}`);
  }

  // Generate review HTML
  await generateReviewHtml(ids, outDir);
  console.log(`\nReview page: ${outDir}/review.html`);
  console.log('Done.');
}

// ---------------------------------------------------------------------------
// Review HTML — shows all variants side by side for easy picking
// ---------------------------------------------------------------------------

async function generateReviewHtml(ids, outDir) {
  const rows = [];
  for (const id of ids) {
    const cells = [];
    for (const v of VARIANTS) {
      const filePath = resolve(outDir, `${id}-${v}.png`);
      try {
        const data = await readFile(filePath);
        const b64 = data.toString('base64');
        cells.push(`<td style="text-align:center;padding:8px;">
          <img src="data:image/png;base64,${b64}" style="width:128px;height:128px;image-rendering:pixelated;background:#eee;border:1px solid #ccc;" />
          <div style="font-size:12px;color:#666;">${v}</div>
        </td>`);
      } catch {
        cells.push(`<td style="text-align:center;padding:8px;color:red;">missing</td>`);
      }
    }
    rows.push(`<tr><td style="font-weight:bold;padding:8px;vertical-align:middle;">${id}</td>${cells.join('')}</tr>`);
  }

  const html = `<!DOCTYPE html>
<html><head><title>Move Sprite Review</title>
<style>body{font-family:monospace;background:#fff;margin:20px;}table{border-collapse:collapse;}td{border:1px solid #ddd;}</style>
</head><body>
<h1>Move Sprite Variants</h1>
<p>Pick the best variant for each move.</p>
<table><tr><th>Move</th>${VARIANTS.map(v => `<th>${v}</th>`).join('')}</tr>
${rows.join('\n')}</table>
</body></html>`;

  await writeFile(`${outDir}/review.html`, html);
}

main();
