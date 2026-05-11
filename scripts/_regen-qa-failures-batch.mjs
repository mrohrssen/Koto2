#!/usr/bin/env node

/**
 * Regenerate QA-failed action icons via Gemini 3.1 Flash.
 *
 * Reads a JSON list of { slug, hint } entries, generates 3×3 grids
 * with style references from data/quality-refs/actions/, then slices
 * into individual 128×128 PNGs.
 *
 * Usage:
 *   node scripts/_regen-qa-failures-batch.mjs --dry-run
 *   node scripts/_regen-qa-failures-batch.mjs
 *   node scripts/_regen-qa-failures-batch.mjs --batch 0
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BATCH_SIZE = 9;
const GRID_COLS = 3;
const GRID_ROWS = 3;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      batch:    { type: 'string' },
      'dry-run': { type: 'boolean' },
      input:    { type: 'string' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
    input: args.values.input || 'data/action-icon-staging/regen-failures.json',
  };
}

// ---------------------------------------------------------------------------
// Style reference loading
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
  let files;
  try { files = await readdir(dir); } catch { return []; }
  const refs = [];
  for (const f of files.sort()) {
    const ext = extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const data = await readFile(resolve(dir, f));
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    refs.push({ inlineData: { mimeType, data: data.toString('base64') } });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(batch) {
  const layoutLines = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowItems = batch.slice(r * GRID_COLS, (r + 1) * GRID_COLS);
    const descriptions = rowItems.map((item, i) => {
      return `(${i + 1}) ${item.hint}`;
    });
    layoutLines.push(`Row ${r + 1}: ${descriptions.join(', ')}`);
  }

  return [
    `Use the same art style as the reference images — these icons are for the same game.`,
    ``,
    `Draw 9 small skill/vocabulary icons arranged in a 3×3 layout on a solid white background.`,
    `These are NOT characters or creatures — they are compact skill icons and vocabulary flashcard icons for an RPG.`,
    `Think RPG ability buttons or item icons: simple, symbolic, easy to read at small sizes.`,
    `For animal words (fox, bear, frog), draw the animal's face/head only — NOT a full character.`,
    ``,
    `Layout (3 rows, 3 columns):`,
    ...layoutLines,
    ``,
    `LAYOUT:`,
    `- Place each icon in an evenly-spaced 3×3 arrangement`,
    `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on flat white`,
    `- The entire background must be solid flat white (#FFFFFF) with nothing else on it`,
    `- Each icon must be fully contained in its area, not overlapping neighbors`,
    ``,
    `ART STYLE:`,
    `- Match the anime/manga illustration style of the reference images exactly`,
    `- Bold black outlines, vibrant colors, clean cell-shading`,
    `- NO pixel art, NO flat clipart, NO gradient-only designs, NO photorealistic`,
    `- Effects like energy, particles, and glow are welcome but MUST be drawn with solid opaque strokes`,
    `- No text, no labels, no numbers, no UI elements`,
    `- Each icon should be instantly recognizable as the concept it represents`,
    `- Front-facing, centered in each cell`,
    `- Small, compact designs that read well at 128×128 pixels`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Image generation with retry
// ---------------------------------------------------------------------------

const RETRYABLE = [/fetch/i, /ECONNRESET/i, /ETIMEDOUT/i, /network/i, /socket hang up/i, /ENOTFOUND/i];

function isRetryable(err) {
  const msg = err?.message || String(err);
  return RETRYABLE.some(p => p.test(msg));
}

async function generateGrid(model, prompt, outputPath, styleRefParts) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const requestParts = [...styleRefParts, { text: prompt }];
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const responseParts = result.response.candidates?.[0]?.content?.parts;
      if (!responseParts) throw new Error('No parts in response');

      const imagePart = responseParts.find(p => p.inlineData);
      if (!imagePart) {
        const textPart = responseParts.find(p => p.text);
        throw new Error(`content policy: ${textPart?.text || 'No image data'}`);
      }

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      await writeFile(outputPath, buffer);
      return { status: 'ok', bytes: buffer.length, path: outputPath };
    } catch (err) {
      lastError = err;
      const msg = err?.message || String(err);
      if (msg.includes('content policy') || msg.includes('SAFETY') || msg.includes('blocked')) break;
      if (attempt < 2 && isRetryable(err)) {
        console.error(`  Retrying (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      break;
    }
  }
  return { status: 'failed', error: lastError?.message || String(lastError) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { batchIndex, dryRun, input } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  // Load failure list
  const icons = JSON.parse(await readFile(resolve(projectRoot, input), 'utf-8'));
  console.error(`Loaded ${icons.length} icons to regenerate from ${input}`);

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < icons.length; i += BATCH_SIZE) {
    const batch = icons.slice(i, i + BATCH_SIZE);
    while (batch.length < BATCH_SIZE) {
      batch.push({ ...icons[batch.length % icons.length], _filler: true });
    }
    batches.push(batch);
  }
  console.error(`Split into ${batches.length} batches of ${BATCH_SIZE}`);

  const toRun = batchIndex != null ? [batchIndex] : batches.map((_, i) => i);

  // Load API key + style refs
  let apiKey, styleRefParts;
  if (!dryRun) {
    const keyPath = resolve(projectRoot, 'data', '.creature-forge-gemini-key');
    apiKey = (await readFile(keyPath, 'utf-8')).trim();
    if (!apiKey) { console.error('No API key'); process.exit(1); }

    const refDir = resolve(projectRoot, 'data/quality-refs/actions');
    styleRefParts = await loadStyleRefs(refDir);
    console.error(`Loaded ${styleRefParts.length} style reference(s) from ${refDir}`);
  }

  const outputDir = resolve(projectRoot, 'data/action-icon-staging');
  await mkdir(outputDir, { recursive: true });

  for (const idx of toRun) {
    if (idx < 0 || idx >= batches.length) {
      console.error(`Batch ${idx} out of range (0-${batches.length - 1})`);
      continue;
    }
    const batch = batches[idx];
    const itemNames = batch.map(i => `${i.slug}${i._filler ? ' (filler)' : ''}`).join(', ');
    console.error(`\n=== Batch ${idx}: ${itemNames} ===`);

    const prompt = buildPrompt(batch);

    if (dryRun) {
      console.error('\n--- PROMPT ---');
      console.error(prompt);
      console.error('--- END PROMPT ---\n');
      continue;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

    const outputPath = resolve(outputDir, `regen-batch-${idx}.png`);

    console.error(`Generating grid -> ${outputPath}`);
    const result = await generateGrid(model, prompt, outputPath, styleRefParts);

    if (result.status === 'ok') {
      console.error(`OK Batch ${idx}: ${result.bytes} bytes -> ${result.path}`);
      const manifest = batch.map((item, i) => ({
        index: i,
        slug: item.slug,
        hint: item.hint,
        filler: !!item._filler,
      }));
      const manifestPath = resolve(outputDir, `regen-batch-${idx}-manifest.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.error(`  Manifest -> ${manifestPath}`);
    } else {
      console.error(`FAILED Batch ${idx}: ${result.error}`);
    }

    // Rate limiting between batches
    if (toRun.length > 1 && idx !== toRun[toRun.length - 1]) {
      console.error('  Waiting 5s before next batch...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.error('\nDone! Now slice with:');
  console.error('  python3 scripts/slice-regen-icons.py');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
