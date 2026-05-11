#!/usr/bin/env node

/**
 * Action Icon Grid Generator
 *
 * Generates game action/concept icons using Gemini 2.5 Flash.
 * Icons represent creature names, auto attacks, and ultimate abilities.
 * Each icon depicts the CONCEPT (e.g., "bite" = teeth biting), not the creature.
 *
 * Reads creatures.json, extracts all unique Japanese words, deduplicates,
 * and generates 3×3 grids on magenta backgrounds.
 *
 * Usage:
 *   node scripts/generate-action-icons.mjs --dry-run        # Preview words & prompts
 *   node scripts/generate-action-icons.mjs --batch 0        # Generate specific batch
 *   node scripts/generate-action-icons.mjs                  # Generate all batches
 *   node scripts/generate-action-icons.mjs --list           # List all words & slugs
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
      list:     { type: 'boolean' },
      'style-refs-dir': { type: 'string' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
    list: args.values.list || false,
    styleRefsDir: args.values['style-refs-dir'] || undefined,
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
// Word extraction & deduplication
// ---------------------------------------------------------------------------

/** Visual hint overrides for words that are hard to depict as a simple icon */
const VISUAL_HINTS = {
  // Actions that need clarification
  'bite': 'sharp teeth biting down',
  'kick': 'a powerful leg kick impact',
  'dance': 'graceful dancing motion with swirls',
  'seize': 'a hand grabbing tightly',
  'scream': 'a mouth screaming with sound waves',
  'blow': 'wind blowing with motion lines',
  'shine': 'bright light rays shining outward',
  'deceive': 'a sly mask with a hidden face',
  'illuminate': 'a beam of light illuminating',
  'burn': 'flames burning intensely',
  'lick': 'a tongue licking',
  'coil': 'something coiling in a spiral',
  'leap': 'upward leaping motion with speed lines',
  'scratch': 'sharp claw scratch marks',
  'strike': 'a fist or weapon striking with impact',
  'peck': 'a beak pecking downward',
  'bounce': 'bouncing motion with spring effect',
  'chomp': 'massive powerful jaws chomping shut',
  'throw': 'an arm throwing with motion arc',
  'entangle': 'tangled vines or ropes wrapping',
  'knock': 'knocking impact with ripple effect',
  'cut': 'a blade slicing cleanly',
  'swing': 'a sweeping swing motion arc',
  'open': 'something opening outward with light',
  'aim': 'a target crosshair being aimed at',
  'slide': 'sliding forward motion on ice',
  'swim': 'swimming motion through water',
  'fall': 'something falling downward with speed lines',
  'wrap': 'wrapping around in soft folds',
  'dive': 'diving downward into water/depths',
  'resound': 'sound waves echoing outward in rings',
  // Ultimate abilities
  'harden': 'a hardened crystalline shield',
  'gallop': 'galloping hooves with dust clouds',
  'bewilder': 'swirling confusion spirals and stars',
  'tighten': 'something squeezing tighter, constricting',
  'crush': 'a heavy weight crushing downward',
  'curse': 'a dark skull with purple energy',
  'blow-away': 'a powerful gust blowing things away',
  'glitter': 'brilliant sparkling light in all directions',
  'transform': 'a silhouette morphing and shifting shape',
  'full-moon': 'a glowing full moon in the sky',
  'explosion': 'a fiery explosion with debris',
  'swallow': 'a wide mouth swallowing whole',
  'capture': 'a net or cage capturing',
  'roar': 'a powerful roar with shockwave rings',
  'devour': 'ravenous jaws devouring',
  'blizzard': 'a swirling snowstorm blizzard',
  'wish': 'a shooting star with a wish sparkle',
  'bloom': 'a flower blooming open with petals',
  'smash': 'a fist smashing with shattered fragments',
  'glare': 'fierce glowing eyes glaring intensely',
  'burst': 'an energy burst exploding outward',
  'pierce': 'a sharp point piercing through',
  'punch': 'a powerful fist punching forward',
  'swarm': 'a swarm of many small creatures',
  'tear-apart': 'something being torn apart violently',
  'rampage': 'wild destructive rampage energy',
  'bind': 'chains or ropes binding tightly',
  'destroy': 'total destruction with crumbling debris',
  'slash': 'a sharp blade slash with energy trail',
  'block': 'a solid shield blocking an attack',
  'close': 'something snapping shut forcefully',
  'embrace': 'warm arms embracing softly',
  'scorch': 'scorching burn marks with embers',
  'performance': 'musical notes and instruments playing',
  // Creature nouns
  'turtle': 'a cute turtle',
  'horse': 'a horse head',
  'butterfly': 'a beautiful butterfly',
  'snake': 'a coiled snake',
  'bear': 'a bear face',
  'ghost': 'a cute floating ghost',
  'wind': 'swirling wind gusts',
  'light': 'a glowing orb of light',
  'fox': 'a cunning fox face',
  'moon': 'a crescent moon',
  'sun': 'a bright shining sun',
  'frog': 'a cute frog',
  'spider': 'a spider with web',
  'lion': 'a majestic lion face',
  'wolf': 'a wolf howling',
  'penguin': 'a cute penguin',
  'dolphin': 'a leaping dolphin',
  'star': 'a twinkling star',
  'flower': 'a blooming flower',
  'whale': 'a large whale',
  'cat': 'a cat face',
  'lightning': 'a lightning bolt',
  'crow': 'a black crow',
  'rabbit': 'a cute rabbit',
  'mouse': 'a small mouse',
  'shark': 'a fierce shark',
  'monkey': 'a playful monkey',
  'octopus': 'an octopus with tentacles',
  'dragon': 'a dragon head breathing fire',
  'scissors': 'a pair of scissors',
  'umbrella': 'an open umbrella',
  'book': 'an open book with glowing pages',
  'pillow': 'a soft fluffy pillow',
  'lamp': 'a glowing lamp',
  'speaker': 'a speaker with sound waves',
  'bomb': 'a round bomb with lit fuse',
  'blanket': 'a folded cozy blanket',
};

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractUniqueWords(creatures) {
  const seen = new Map(); // Japanese word → entry

  for (const c of creatures) {
    // Creature name
    if (!seen.has(c.name)) {
      seen.set(c.name, {
        word: c.name,
        reading: c.reading,
        english: c.meaning,
        category: 'creature',
      });
    }

    // Auto skill
    if (c.autoSkill && !seen.has(c.autoSkill.word)) {
      seen.set(c.autoSkill.word, {
        word: c.autoSkill.word,
        reading: c.autoSkill.reading,
        english: c.autoSkill.nameEn,
        category: 'auto',
      });
    }

    // Ultimate
    if (c.ultimate && !seen.has(c.ultimate.word)) {
      seen.set(c.ultimate.word, {
        word: c.ultimate.word,
        reading: c.ultimate.reading,
        english: c.ultimate.nameEn,
        category: 'ultimate',
      });
    }
  }

  // Assign unique slugs — handle collisions where different Japanese words
  // have the same English name (e.g., 噛む=Bite vs 食いつく=Bite)
  const SLUG_OVERRIDES = {
    '食いつく': 'chomp',     // 食いつく Bite → chomp (vs 噛む Bite → bite)
    '跳ねる': 'bounce',      // 跳ねる Jump → bounce (vs 飛ぶ Jump → jump)
    '叩く': 'knock',         // 叩く Strike → knock (vs 打つ Strike → strike)
  };

  const words = [...seen.values()];
  const usedSlugs = new Set();
  for (const w of words) {
    let slug = SLUG_OVERRIDES[w.word] || slugify(w.english);
    // Safety: if still colliding, append a number
    let finalSlug = slug;
    let n = 2;
    while (usedSlugs.has(finalSlug)) {
      finalSlug = `${slug}-${n++}`;
    }
    usedSlugs.add(finalSlug);
    w.slug = finalSlug;
  }

  return words;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(batch) {
  const layoutLines = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowItems = batch.slice(r * GRID_COLS, (r + 1) * GRID_COLS);
    const descriptions = rowItems.map((item, i) => {
      const hint = VISUAL_HINTS[item.slug] || VISUAL_HINTS[slugify(item.english)] || item.english;
      return `(${i + 1}) ${hint}`;
    });
    layoutLines.push(`Row ${r + 1}: ${descriptions.join(', ')}`);
  }

  return [
    `Use the same art style as the reference images — these icons are for the same game.`,
    ``,
    `Draw 9 small skill/vocabulary icons arranged in a 3×3 layout on a solid magenta background.`,
    `These are NOT characters or creatures — they are compact skill icons and vocabulary flashcard icons for an RPG.`,
    `Think RPG ability buttons or item icons: simple, symbolic, easy to read at small sizes.`,
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
  const { batchIndex, dryRun, list, styleRefsDir } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  // Load creatures
  const creatures = JSON.parse(await readFile(resolve(projectRoot, 'data/creatures.json'), 'utf-8'));
  console.error(`Loaded ${creatures.length} creatures from creatures.json`);

  // Extract unique words
  const words = extractUniqueWords(creatures);
  console.error(`Extracted ${words.length} unique words (base + auto + ultimate)`);

  const creatureCount = words.filter(w => w.category === 'creature').length;
  const autoCount = words.filter(w => w.category === 'auto').length;
  const ultCount = words.filter(w => w.category === 'ultimate').length;
  console.error(`  ${creatureCount} creature names, ${autoCount} auto skills, ${ultCount} ultimates`);

  // --list mode: just print all words and exit
  if (list) {
    console.log('slug,word,reading,english,category');
    for (const w of words) {
      console.log(`${w.slug},${w.word},${w.reading},${w.english},${w.category}`);
    }
    return;
  }

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    while (batch.length < BATCH_SIZE) {
      const filler = words[batch.length % words.length];
      batch.push({ ...filler, _filler: true });
    }
    batches.push(batch);
  }
  console.error(`Split into ${batches.length} batches of ${BATCH_SIZE}`);

  // Determine which batches to run
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
    const itemNames = batch.map(i => `${i.english}${i._filler ? ' (filler)' : ''}`).join(', ');
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

    const outputPath = resolve(outputDir, `grid-batch-${idx}.png`);

    console.error(`Generating grid -> ${outputPath}`);
    const result = await generateGrid(model, prompt, outputPath, styleRefParts);

    if (result.status === 'ok') {
      console.error(`OK Batch ${idx}: ${result.bytes} bytes -> ${result.path}`);
      // Save manifest
      const manifest = batch.map((item, i) => ({
        index: i,
        slug: item.slug,
        word: item.word,
        reading: item.reading,
        english: item.english,
        category: item.category,
        filler: !!item._filler,
      }));
      const manifestPath = resolve(outputDir, `grid-batch-${idx}-manifest.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.error(`  Manifest -> ${manifestPath}`);
    } else {
      console.error(`FAILED Batch ${idx}: ${result.error}`);
    }
  }

  console.error('\nDone!');
}

main();
