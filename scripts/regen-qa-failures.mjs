#!/usr/bin/env node

/**
 * Regenerate QA-Failed Action Icons
 *
 * Reads sprite-qa-failures.json and regenerates all failed icons
 * using Gemini 3.1 Flash with curated style references.
 *
 * Usage:
 *   node scripts/regen-qa-failures.mjs --dry-run     # Preview prompts
 *   node scripts/regen-qa-failures.mjs               # Generate all
 *   node scripts/regen-qa-failures.mjs --batch 0     # Generate specific batch
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
// Improved visual hints based on QA failure analysis
// ---------------------------------------------------------------------------

const VISUAL_HINTS = {
  // === TOTAL 3 (worst) ===
  'catch':     'a hand reaching out to catch a falling ball mid-air',
  'cover':     'a thick blanket being draped over something, covering it completely',
  'launch':    'a rocket blasting off with bright flames and smoke below',
  'shake':     'a hand vigorously shaking something side to side with motion blur lines',
  'stand-up':  'a person pushing themselves up from kneeling to standing, upward arrow',
  'support':   'two hands holding up and supporting a heavy object from below',

  // === TOTAL 4 ===
  'assault':   'a powerful fist striking forward with bold red impact burst',
  'resound':   'a large golden bell ringing with bold concentric sound waves',

  // === TOTAL 5 ===
  'cut':       'a sharp sword cutting clean through a piece of wood',
  'dash':      'a running shoe with bold speed lines trailing behind it',
  'extend':    'an arm stretching outward, reaching far with stretchy motion lines',
  'jump-out':  'a figure bursting out of a box, leaping upward with energy lines',
  'persevere': 'a determined fist raised high with a glowing aura of endurance',
  'recover':   'a wilted flower springing back to life with green sparkles',
  'suffer':    'a cracked heart with a single teardrop falling from it',
  'transform': 'a caterpillar on one side becoming a butterfly on the other, with sparkle trail between',
  'wash':      'a bucket of soapy water with bubbles and a scrub brush',

  // === TOTAL 6 ===
  'encircle':  'a lasso rope forming a complete circle around a target object',
  'exceed':    'a bold arrow smashing upward through a ceiling barrier, debris flying',
  'inhale':    'an open mouth breathing in with visible air stream lines flowing inward',
  'pluck':     'fingers plucking a single flower from a stem with petals scattering',
  'preserve':  'a jar of preserved fruit with a sealed lid and a small leaf',
  'protect':   'a sturdy metal shield with a glowing protective barrier around it',
  'revolve':   'a planet orbiting around a bright sun with a circular orbit trail',
  'shine':     'a brilliant golden star radiating bold colorful light beams outward',
  'steal':     'a gloved hand sneaking into a pocket to grab a coin purse',

  // === TOTAL 7 ===
  'close':     'an open book snapping shut with a visible SLAM impact effect',
  'coil':      'a snake body coiling tightly into a spiral with tension lines',
  'dodge':     'a figure leaning sideways to dodge an incoming projectile, with motion trail',
  'full-moon': 'a large bright yellow full moon with visible craters and a soft glow halo',
  'glitter':   'a cluster of bright colorful gemstones sparkling with bold star-shaped glints',
  'illuminate':'a bright torch with bold flame illuminating the area around it',
  'performance':'a colorful stage spotlight on a microphone with bold music notes',
  'slice':     'a katana blade mid-slice through a watermelon, clean cut visible',
  'stance':    'a martial artist in a wide fighting stance, fists raised and ready',
  'submerge':  'something sinking below a water surface with bubbles rising upward',
  'swarm':     'a dense cloud of bees buzzing together in a swarm formation',
  'tremble':   'a small figure shaking with bold zigzag vibration lines around it',

  // === TOTAL 8 ===
  'conceal':   'an object hidden under a magician cloth with only its outline visible',
  'devour':    'a cartoon monster mouth wide open about to eat a whole cake',
  'enlarge':   'a small mushroom growing into a giant mushroom with size-up arrows',
  'float':     'a balloon drifting upward in the air with a gentle breeze',
  'fly':       'a pair of bird wings spread wide with cloud wisps around them',
  'glare':     'a pair of fierce angry eyes with sharp eyebrows and red glow',
  'help':      'one hand reaching down to pull up another hand, helping them up',
  'peck':      'a sharp bird beak pecking downward at seeds on the ground',
  'pull':      'two hands gripping a rope and pulling it hard with strain lines',
  'rest':      'a cozy pillow with a sleeping cap and ZZZ floating above',
  'swallow-up':'a giant whale mouth open wide swallowing fish whole',

  // === TOTAL 9 ===
  'bewilder':  'a confused face with spiral eyes and question marks and stars orbiting the head',
  'chomp':     'big cheerful cartoon jaws chomping down on a bone with crunch sparks',
  'extinguish':'a candle with its flame being blown out, smoke wisps rising from the wick',
  'fall':      'a person tumbling downward with speed lines and a surprised expression',
  'heal':      'a glowing green heart with a plus symbol and healing sparkles',
  'moon':      'a bold bright crescent moon with visible surface detail and small stars nearby',
  'open':      'a pair of hands pushing open double doors with light streaming through',
  'scratch':   'a cat paw swiping with three bold red claw marks left behind',
  'sleep':     'a cute sleeping face on a pillow with a moon and ZZZ above',
  'speak':     'an open mouth with a colorful speech bubble coming out, containing sound waves',
  'spider':    'a cute friendly cartoon spider with big eyes sitting on a web',
  'stack':     'colorful building blocks stacked in a tower, one block being placed on top',
  'teach':     'a chalkboard with ABC written on it and a pointer stick',
  'warm':      'a cozy campfire with orange flames and visible heat wave lines rising',
  'wash-away': 'a powerful river wave washing away small rocks and debris',

  // === TOTAL 10 (borderline) ===
  'cry':       'a single large teardrop falling from a sad eye with tear streaks',
  'cure':      'a medicine bottle with a green cross pouring out healing liquid drops',
  'grasp':     'a hand tightly grasping and holding onto a glowing orb',
  'hurry':     'a person running fast with extreme speed lines and dust cloud behind',
  'seize':     'a hand forcefully grabbing and squeezing a captured object tightly',
  'speaker':   'a colorful cartoon boombox speaker blasting music notes and sound waves',
  'touch':     'a large fingertip pressing down on a surface with a ripple effect spreading',
  'wound':     'a bandaged arm with a visible red scratch mark and small bandaid',
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      batch:    { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
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
    `Draw 9 small skill/vocabulary icons arranged in a 3×3 layout on a solid white background.`,
    `These are NOT characters or creatures — they are compact skill icons and vocabulary flashcard icons for an RPG.`,
    `Think RPG ability buttons or item icons: simple, symbolic, easy to read at small sizes.`,
    ``,
    `Layout (3 rows, 3 columns):`,
    ...layoutLines,
    ``,
    `CRITICAL STYLE REQUIREMENTS:`,
    `- MUST be clean, well-drawn cartoon illustrations with BOLD dark outlines`,
    `- MUST NOT be pixel art — no visible pixel grid, no blocky edges`,
    `- MUST NOT be abstract/minimal — show recognizable illustrated OBJECTS, not geometric shapes`,
    `- MUST NOT be flat UI icons — these are game illustrations with depth and character`,
    `- Bright, saturated colors with visible shading and highlights`,
    `- Each icon fills most of its cell — no tiny centered objects with huge empty space`,
    ``,
    `LAYOUT:`,
    `- Place each icon in an evenly-spaced 3×3 arrangement`,
    `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on flat white`,
    `- The entire background must be solid white (#FFFFFF) with nothing else on it`,
    `- Each icon must be fully contained in its area, not overlapping neighbors`,
    ``,
    `ART STYLE:`,
    `- Effects like energy, particles, and glow are welcome but MUST be drawn with fully opaque solid pixels`,
    `- NO semi-transparent pixels, NO alpha blending, NO soft feathered edges against the background`,
    `- Every single pixel must be either pure white (#FFFFFF) or fully opaque content — nothing in between`,
    `- Hard crisp edges where the icon meets the white background, no gradual fade-outs`,
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
        console.error(`  Retry ${attempt + 1} after error: ${msg}`);
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
  const { batchIndex, dryRun } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  // Load QA failures
  const failures = JSON.parse(await readFile(resolve(projectRoot, 'data/sprite-qa-failures.json'), 'utf-8'));
  console.error(`Loaded ${failures.length} QA failures`);

  // Build regen list with hints
  const regenIcons = failures.map(f => ({
    slug: f.id,
    hint: VISUAL_HINTS[f.id] || f.wordEn,
    wordEn: f.wordEn,
  }));

  const missing = regenIcons.filter(r => !VISUAL_HINTS[r.slug]);
  if (missing.length > 0) {
    console.error(`WARNING: ${missing.length} icons have no visual hint: ${missing.map(m => m.slug).join(', ')}`);
  }

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < regenIcons.length; i += BATCH_SIZE) {
    const batch = regenIcons.slice(i, i + BATCH_SIZE);
    // Pad to 9 with repeats if needed
    while (batch.length < BATCH_SIZE) {
      batch.push({ ...regenIcons[batch.length % regenIcons.length], _filler: true });
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

    // Use curated action refs
    const refDir = resolve(projectRoot, 'data/quality-refs/actions');
    styleRefParts = await loadStyleRefs(refDir);
    console.error(`Loaded ${styleRefParts.length} style reference(s) from ${refDir}`);
  }

  const outputDir = resolve(projectRoot, 'data/action-icon-staging');
  await mkdir(outputDir, { recursive: true });

  let okCount = 0;
  let failCount = 0;

  for (const idx of toRun) {
    if (idx < 0 || idx >= batches.length) {
      console.error(`Batch ${idx} out of range (0-${batches.length - 1})`);
      continue;
    }
    const batch = batches[idx];
    const itemNames = batch.map(i => `${i.slug}${i._filler ? ' (filler)' : ''}`).join(', ');
    console.error(`\n=== Batch ${idx}/${batches.length - 1}: ${itemNames} ===`);

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
      okCount++;
      console.error(`  OK: ${result.bytes} bytes -> ${result.path}`);
      // Save manifest
      const manifest = batch.map((item, i) => ({
        index: i,
        slug: item.slug,
        hint: item.hint,
        wordEn: item.wordEn,
        filler: !!item._filler,
      }));
      const manifestPath = resolve(outputDir, `regen-batch-${idx}-manifest.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } else {
      failCount++;
      console.error(`  FAILED: ${result.error}`);
    }

    // Delay between batches to avoid rate limiting
    if (toRun.length > 1 && idx !== toRun[toRun.length - 1]) {
      console.error('  Waiting 5s before next batch...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.error(`\nDone! ${okCount} OK, ${failCount} failed`);
  if (!dryRun) {
    console.error('Now run the slicer:');
    console.error('  python3 scripts/slice-action-icons.py');
  }
}

main();
