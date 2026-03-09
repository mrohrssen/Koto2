#!/usr/bin/env node

/**
 * Targeted Action Icon Regeneration
 *
 * Regenerates specific action icons that need fixes.
 * Groups them into 3×3 batches, generates via Gemini, slices, and replaces.
 *
 * Usage:
 *   node scripts/regen-action-icons.mjs --dry-run     # Preview prompts
 *   node scripts/regen-action-icons.mjs               # Generate all
 *   node scripts/regen-action-icons.mjs --batch 0     # Generate specific batch
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
// Icons to regenerate with updated visual hints
// ---------------------------------------------------------------------------

const REGEN_ICONS = [
  { slug: 'blanket',    hint: 'a soft folded blanket, cozy and plush with visible fabric texture' },
  { slug: 'chomp',      hint: 'massive powerful jaws snapping shut, teeth interlocking with impact sparks' },
  { slug: 'close',      hint: 'a heavy iron door slamming shut, dust puffs from the impact' },
  { slug: 'coil',       hint: 'a tight metal spring coiled up with visible tension lines radiating outward' },
  { slug: 'cut',        hint: 'a clean diagonal blade slash with a bright energy trail' },
  { slug: 'deceive',    hint: 'a theatrical mask split in two — one smiling, one sinister, with swirling shadows' },
  { slug: 'embrace',    hint: 'two people hugging warmly with a small solid pink heart between them' },
  { slug: 'full-moon',  hint: 'a large bright full moon with visible craters, solid disc, no sky background' },
  { slug: 'gallop',     hint: 'a full horse mid-gallop kicking up dust clouds, seen from the side' },
  { slug: 'jump',       hint: 'a full human jumping upward with bold speed lines' },
  { slug: 'knock',      hint: 'a fist knocking on a wooden door with concentric impact ripple rings' },
  { slug: 'lick',       hint: 'a big pink tongue sticking out and licking, with a single saliva drip' },
  { slug: 'light',      hint: 'a solid orb of warm golden light with short crisp rays' },
  { slug: 'moon',       hint: 'a sharp crescent moon shape, solid white-yellow, no sky background' },
  { slug: 'peck',       hint: 'a sharp pointed bird beak jabbing downward with impact star lines, no bird body' },
  { slug: 'rampage',    hint: 'a trail of destruction — cracked ground, flying debris chunks, shockwave rings' },
  { slug: 'resound',    hint: 'concentric bold sound wave rings expanding outward from a central point' },
  { slug: 'swim',       hint: 'a human doing a swimming breaststroke through water with solid splash droplets' },
  { slug: 'throw',      hint: 'a baseball being thrown by an arm with a curved dotted trajectory arc' },
  { slug: 'tighten',    hint: 'a rope knot being tightened, fibers straining visibly' },
  { slug: 'transform',  hint: 'a human on the left transforming into an animal on the right with a magical arrow between the two, sparkles and magic dust' },
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      batch:    { type: 'string' },
      'dry-run': { type: 'boolean' },
      'style-refs-dir': { type: 'string' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
    styleRefsDir: args.values['style-refs-dir'] || undefined,
  };
}

// ---------------------------------------------------------------------------
// Style reference loading
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
  if (!dir) return [];
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
    `Draw 9 small skill/vocabulary icons arranged in a 3×3 layout on a solid magenta background.`,
    `These are NOT characters or creatures — they are compact skill icons and vocabulary flashcard icons for an RPG.`,
    `Think RPG ability buttons or item icons: simple, symbolic, easy to read at small sizes.`,
    `Do NOT draw any full characters, animals, or creatures. Only draw the CONCEPT or ACTION abstractly.`,
    `For animal base words (fox, frog), draw the animal's face/head only — NOT a full character with personality.`,
    ``,
    `Layout (3 rows, 3 columns):`,
    ...layoutLines,
    ``,
    `LAYOUT:`,
    `- Place each icon in an evenly-spaced 3×3 arrangement`,
    `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on flat magenta`,
    `- The entire background must be solid flat magenta (#FF00FF) with nothing else on it`,
    `- Each icon must be fully contained in its area, not overlapping neighbors`,
    ``,
    `ART STYLE:`,
    `- Effects like energy, particles, and glow are welcome but MUST be drawn with fully opaque solid pixels`,
    `- NO semi-transparent pixels, NO alpha blending, NO soft feathered edges against the background`,
    `- Every single pixel must be either pure solid magenta (#FF00FF) or fully opaque content — nothing in between`,
    `- Hard crisp edges where the icon meets the magenta background, no gradual fade-outs`,
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
  for (let attempt = 0; attempt < 2; attempt++) {
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
      if (attempt === 0 && isRetryable(err)) {
        await new Promise(r => setTimeout(r, 2000));
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
  const { batchIndex, dryRun, styleRefsDir } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  console.error(`Regenerating ${REGEN_ICONS.length} action icons`);

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < REGEN_ICONS.length; i += BATCH_SIZE) {
    const batch = REGEN_ICONS.slice(i, i + BATCH_SIZE);
    // Pad to 9 with repeats if needed
    while (batch.length < BATCH_SIZE) {
      batch.push({ ...REGEN_ICONS[batch.length % REGEN_ICONS.length], _filler: true });
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

    const refDir = styleRefsDir || resolve(projectRoot, 'data/creature-forge-style-refs');
    styleRefParts = await loadStyleRefs(refDir);
    console.error(`Loaded ${styleRefParts.length} style reference(s)`);
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
    console.error(`\n=== Regen Batch ${idx}: ${itemNames} ===`);

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
      console.error(`OK Regen Batch ${idx}: ${result.bytes} bytes -> ${result.path}`);
      // Save manifest
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
      console.error(`FAILED Regen Batch ${idx}: ${result.error}`);
    }

    // Small delay between batches to avoid rate limiting
    if (toRun.length > 1 && idx !== toRun[toRun.length - 1]) {
      console.error('  Waiting 3s before next batch...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.error('\nDone! Now run the slicer:');
  console.error('  python3 scripts/slice-regen-icons.py');
}

main();
