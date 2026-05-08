#!/usr/bin/env node

/**
 * Item Icon Grid Generator
 *
 * Generates cute food/drink item icon grids using Gemini 3.1 Flash.
 * Items are batched 9 at a time into 3×3 grids on magenta backgrounds.
 * After generation, use scripts/slice-item-grid.py to cut into individual icons.
 *
 * Usage:
 *   node scripts/generate-item-icons.mjs                              # Generate all item batches
 *   node scripts/generate-item-icons.mjs --batch 0                    # Generate specific item batch
 *   node scripts/generate-item-icons.mjs --source ingredients --batch 0 # Generate cooking ingredient batch
 *   node scripts/generate-item-icons.mjs --source recipes --batch 0   # Generate cooking recipe batch
 *   node scripts/generate-item-icons.mjs --source ingredients --only mizu,niku,sakana # Generate selected IDs
 *   node scripts/generate-item-icons.mjs --background white           # Generate on white for background removal
 *   node scripts/generate-item-icons.mjs --batch 0 --dry-run          # Preview prompts only
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';

const BATCH_SIZE = 9;
const GRID_COLS = 3;
const GRID_ROWS = 3;
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const GEMINI_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      batch:    { type: 'string' },
      'dry-run': { type: 'boolean' },
      'style-refs-dir': { type: 'string' },
      'item-type': { type: 'string' },
      only: { type: 'string' },
      background: { type: 'string' },
      source: { type: 'string' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
    styleRefsDir: args.values['style-refs-dir'] || undefined,
    itemType: args.values['item-type'] || null,
    only: args.values.only ? args.values.only.split(',').map(id => id.trim()).filter(Boolean) : null,
    background: args.values.background || 'magenta',
    source: args.values.source || 'items',
  };
}

// ---------------------------------------------------------------------------
// Style reference loading (same as creature forge)
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

function buildPrompt(batch, source = 'items', background = 'magenta') {
  // Build the layout description — always 3×3
  const layoutLines = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowItems = batch.slice(r * GRID_COLS, (r + 1) * GRID_COLS);
    const descriptions = rowItems.map((item, i) => {
      const label = source === 'ingredients' || source === 'recipes' ? item.nameEn : item.meaning;
      return `(${i + 1}) ${label}`;
    });
    layoutLines.push(`Row ${r + 1}: ${descriptions.join(', ')}`);
  }

  const hasIngredients = source === 'ingredients';
  const hasRecipes = source === 'recipes';
  const hasKeepsakes = batch.some(i => i.type === 'keepsake');
  const hasFood = batch.some(i => i.type !== 'keepsake' && !i._filler);

  let category, itemDesc;
  if (hasIngredients) {
    category = 'cooking ingredient icons';
    itemDesc = 'Each icon should be a clean, recognizable depiction of the raw cooking ingredient or natural material — like a polished RPG inventory ingredient.';
  } else if (hasRecipes) {
    category = 'cooked food and drink recipe icons';
    itemDesc = 'Each icon should be a delicious, recognizable depiction of the finished cooked dish or drink — like a polished RPG inventory food icon.';
  } else if (hasKeepsakes && !hasFood) {
    category = 'keepsake / treasure item icons';
    itemDesc = 'Each icon should be a beautiful, detailed depiction of the object — like a polished RPG treasure or equipment icon. Gleaming metals, glowing gems, elegant craftsmanship.';
  } else if (hasKeepsakes && hasFood) {
    category = 'game item icons (mix of food and treasure keepsakes)';
    itemDesc = 'Each icon should be a polished game item icon — food items look delicious, keepsake items look like gleaming RPG treasures.';
  } else {
    category = 'Japanese food and drink item icons';
    itemDesc = 'Each icon should be a delicious, appetizing depiction of the food/drink — like a polished game item icon.';
  }

  const backgroundName = background === 'white' ? 'plain white' : 'solid magenta';
  const backgroundColor = background === 'white' ? '#FFFFFF' : '#FF00FF';

  return [
    `Use the same art style as the reference images — these are creature sprites from the same game.`,
    ``,
    `Draw EXACTLY 9 cute ${category} for a video game inventory, arranged in a 3×3 layout on a ${backgroundName} background.`,
    itemDesc,
    ``,
    `IMAGE FORMAT:`,
    `- Square image, 1024×1024 or 1536×1536`,
    `- EXACTLY 3 columns and EXACTLY 3 rows`,
    `- EXACTLY one icon in each cell`,
    `- Do not add any extra items, extra columns, extra rows, props, plates, bowls, or background objects`,
    ``,
    `Layout (3 rows, 3 columns):`,
    ...layoutLines,
    ``,
    `LAYOUT:`,
    `- Place each icon in an evenly-spaced 3×3 arrangement`,
    `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on a flat background`,
    `- The entire background must be solid flat ${backgroundName} (${backgroundColor}) with nothing else on it`,
    `- Each item must be fully contained in its area, not overlapping neighbors`,
    ``,
    `ART STYLE:`,
    `- Glows, sparkles, and particles are welcome but they MUST be drawn with fully opaque solid pixels`,
    `- NO semi-transparent pixels, NO alpha blending, NO soft feathered edges against the background`,
    `- Every single pixel must be either pure solid ${backgroundName} (${backgroundColor}) or fully opaque content — nothing in between`,
    `- Hard crisp edges where the item meets the background, no gradual fade-outs`,
    `- No text, no labels, no numbers, no UI elements`,
    `- Each item should be immediately recognizable`,
    `- Front-facing, centered in each cell`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Image generation with retry (same pattern as creature forge)
// ---------------------------------------------------------------------------

const RETRYABLE = [/fetch/i, /ECONNRESET/i, /ETIMEDOUT/i, /network/i, /socket hang up/i, /ENOTFOUND/i];

function isRetryable(err) {
  const msg = err?.message || String(err);
  return RETRYABLE.some(p => p.test(msg));
}

async function generateGrid(apiKey, prompt, outputPath, styleRefParts) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestParts = [...styleRefParts, { text: prompt }];
      const payload = {
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      };
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
      }

      const responseParts = result.candidates?.[0]?.content?.parts;
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
  const { batchIndex, dryRun, styleRefsDir, itemType, only, background, source } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  if (!['items', 'ingredients', 'recipes'].includes(source)) {
    console.error(`Unknown source '${source}'. Expected 'items', 'ingredients', or 'recipes'.`);
    process.exit(1);
  }
  if (!['magenta', 'white'].includes(background)) {
    console.error(`Unknown background '${background}'. Expected 'magenta' or 'white'.`);
    process.exit(1);
  }

  // Load items, cooking ingredients, or finished cooking recipes.
  const sourcePath = source === 'ingredients'
    ? resolve(projectRoot, 'data/cooking/ingredients.json')
    : source === 'recipes'
      ? resolve(projectRoot, 'data/cooking/recipes.json')
      : resolve(projectRoot, 'data/items.json');
  let items = JSON.parse(await readFile(sourcePath, 'utf-8'));
  if (itemType) {
    items = items.filter(i => i.type === itemType);
    console.error(`Filtered to ${items.length} items of type '${itemType}'`);
  }
  if (only) {
    const byId = new Map(items.map(item => [item.id, item]));
    const missing = only.filter(id => !byId.has(id));
    if (missing.length) {
      console.error(`Unknown ${source} ID(s): ${missing.join(', ')}`);
      process.exit(1);
    }
    items = only.map(id => byId.get(id));
    console.error(`Filtered to ${items.length} selected ${source}: ${only.join(', ')}`);
  } else {
    console.error(`Loaded ${items.length} ${source} from ${sourcePath}`);
  }

  // Create batches of 9. Pad last batch with dupes from the start to fill 3×3.
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    // Pad to 9 if needed (last batch)
    while (batch.length < BATCH_SIZE) {
      const filler = items[batch.length % items.length];
      batch.push({ ...filler, _filler: true });
    }
    batches.push(batch);
  }
  console.error(`Split into ${batches.length} batches of ${BATCH_SIZE} (${items.length} real items, ${batches.length * BATCH_SIZE - items.length} fillers)`);

  // Determine which batches to run
  const toRun = batchIndex != null ? [batchIndex] : batches.map((_, i) => i);

  // Load API key + style refs once (outside loop)
  let apiKey, styleRefParts;
  if (!dryRun) {
    const keyPath = resolve(projectRoot, 'data', '.creature-forge-gemini-key');
    apiKey = process.env.GEMINI_API_KEY || (await readFile(keyPath, 'utf-8')).trim();
    if (!apiKey) { console.error('No API key'); process.exit(1); }

    const refDir = styleRefsDir || resolve(projectRoot, 'data/creature-forge-style-refs');
    styleRefParts = await loadStyleRefs(refDir);
    console.error(`Loaded ${styleRefParts.length} style reference(s)`);
  }

  for (const idx of toRun) {
    if (idx < 0 || idx >= batches.length) {
      console.error(`Batch ${idx} out of range (0-${batches.length - 1})`);
      continue;
    }
    const batch = batches[idx];
    const itemNames = batch.map(i => `${i.nameEn || i.meaning}${i._filler ? ' (filler)' : ''}`).join(', ');
    console.error(`\n=== Batch ${idx}: ${batch.length} items (${itemNames}) ===`);

    const prompt = buildPrompt(batch, source, background);

    if (dryRun) {
      console.error('\n--- PROMPT ---');
      console.error(prompt);
      console.error('--- END PROMPT ---\n');
      continue;
    }

    const outputDir = resolve(projectRoot, 'data/item-staging-images');
    await mkdir(outputDir, { recursive: true });
    const sourcePrefix = source === 'ingredients' ? 'ingredients-' : source === 'recipes' ? 'recipes-' : '';
    const backgroundPrefix = background === 'white' ? 'white-' : '';
    const prefix = `${backgroundPrefix}${sourcePrefix}${itemType ? `${itemType}-` : ''}`;
    const outputPath = resolve(outputDir, `grid-${prefix}batch-${idx}.png`);

    console.error(`Generating grid → ${outputPath}`);
    const result = await generateGrid(apiKey, prompt, outputPath, styleRefParts);

    if (result.status === 'ok') {
      console.error(`✓ Batch ${idx}: ${result.bytes} bytes → ${result.path}`);
      // Save manifest (mark fillers so slicer can skip them)
      const manifest = batch.map((item, i) => ({
        index: i, id: item.id, meaning: item.meaning, filler: !!item._filler
      }));
      const manifestPath = resolve(outputDir, `grid-${prefix}batch-${idx}-manifest.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.error(`  Manifest → ${manifestPath}`);
    } else {
      console.error(`✗ Batch ${idx} failed: ${result.error}`);
    }
  }

  console.error('\nDone!');
}

main();
