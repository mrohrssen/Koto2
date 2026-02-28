#!/usr/bin/env node

/**
 * Move Icon Generator
 *
 * Generates action icons for moves defined in data/moves.json that don't
 * already have icons in public/assets/sprites/actions/.
 *
 * Uses Gemini 3.1 Flash (2k) to generate 3×3 grids on magenta backgrounds,
 * then the existing slice + RMBG pipeline handles post-processing.
 *
 * Usage:
 *   node scripts/generate-move-icons.mjs --dry-run        # Preview missing moves & prompts
 *   node scripts/generate-move-icons.mjs --list            # List all missing moves
 *   node scripts/generate-move-icons.mjs --batch 0         # Generate specific batch
 *   node scripts/generate-move-icons.mjs                   # Generate all batches
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
// Visual hints for each move slug
// ---------------------------------------------------------------------------

const VISUAL_HINTS = {
  // === DAMAGE ===
  'encircle':    'arrows circling inward from all directions, surrounding a center point',
  'throw-away':  'a hand flinging something away with a careless toss arc',
  'topple':      'a figure being knocked sideways with impact lines and dust',
  'fire':        'a cute cartoon cannon firing a cannonball with a puff of smoke',
  'pull':        'a hand pulling with a rope, taut motion lines',
  'wash-away':   'a rushing wave sweeping things away with foam and spray',
  'step-on':     'a foot stomping down hard with a ground-crack impact star',
  'wound':       'a red scratch wound mark with small drops',
  'tear':        'fabric or paper being torn apart with ragged edges',
  'launch':      'a rocket projectile launching upward with exhaust flames',
  'wash':        'water splashing in a cleaning swirl',
  'bury':        'a mound of dirt with something half-buried, shovel marks',
  'demolish':    'crumbling brick wall breaking apart with debris flying',
  'pour':        'liquid pouring down from a tilted vessel',
  'thrust':      'a spear thrusting forward with a sharp impact point',
  'overflow':    'water overflowing from a cup or container, splashing out',
  'shoot':       'a bow releasing an arrow with speed lines',
  'assault':     'multiple rapid strike impacts in a burst pattern',
  'roast':       'flames licking upward around a spit, cooking fire',
  'beat':        'a drum being struck with drumsticks, impact rings',
  'penetrate':   'an arrow piercing clean through a wooden target',
  'slice':       'a clean diagonal blade cut with a bright energy trail',
  'snap':        'sharp jaws snapping shut quickly with a click effect',
  'ruin':        'ancient crumbling ruins with dust clouds rising',
  'rip':         'something being ripped apart with force, pieces flying',
  'spin':        'a spinning vortex motion with circular speed lines',
  'swallow-up':  'a whirlpool vortex sucking things inward, spiral',
  'grasp':       'a fist clenching tight with grip pressure lines',

  // === BUFF ===
  'dash':        'horizontal speed lines with a motion blur swoosh',
  'persevere':   'a raised fist glowing with determination, small sparkle',
  'call':        'a megaphone projecting bold sound waves outward',
  'teach':       'a pointer wand tapping a glowing star, knowledge sparkle',
  'approach':    'footprint trail with forward-pointing arrows',
  'hurry':       'a clock face with spinning hands and speed lines',
  'stand-up':    'an upward arrow figure rising with bold upward energy',
  'jump-out':    'bursting outward from a surface with radial speed lines',
  'exceed':      'an upward arrow smashing through a ceiling barrier, shards flying',
  'fly':         'spread feathered wings with wind gusts beneath',
  'leap':        'an upward arc trajectory with spring coil lines at the base',
  'sparkle':     'brilliant multi-pointed sparkle burst with star shapes radiating',
  'challenge':   'two crossed swords with a spark at the intersection',
  'extend':      'an arm or beam extending outward with reach arrows stretching forward',
  'pray':        'two hands clasped together in prayer with a soft halo glow above',
  'stretch':     'an elastic shape stretching outward with extension arrows',
  'stack':       'glowing blocks stacking upward, three layers high',
  'chirp':       'a musical note with a small cute bird beak beside it',
  'speak':       'a speech bubble with small sound wave lines',

  // === DEBUFF ===
  'rage':        'an angry red aura burst with comic fury vein marks',
  'suffer':      'a pained swirl of dark purple energy, anguished',
  'shake':       'zigzag vibration lines shaking back and forth',
  'doubt':       'a large question mark with a narrowed suspicious eye',
  'stare':       'two intense glowing eyes staring forward with focus lines',
  'tremble':     'a shivering shape outline with rapid vibration marks',
  'touch':       'a fingertip touching a surface with a soft ripple ring',
  'cry':         'large teardrops falling from sad eyes',
  'shout':       'a wide-open mouth shouting with bold concentric sound rings',
  'trick':       'a magician top hat with sneaky sparkles and a hidden card',
  'tie':         'thick ropes tied in a tight restricting knot',
  'abandon':     'a broken chain link falling apart with pieces scattering',
  'restrict':    'a padlock snapping shut with a metallic gleam',
  'extinguish':  'a candle flame being blown out, wisps of smoke curling up',
  'freeze':      'ice crystals forming with cold mist spreading outward',
  'pin-down':    'a hand pressing firmly downward with an impact star beneath',
  'catch':       'a swooping net closing around something',
  'melt':        'something dripping and melting with wavy heat lines rising',

  // === HEAL ===
  'cure':        'a glowing green cross symbol with gentle sparkles around it',
  'support':     'open palms cradling upward with a soft warm glow between them',
  'hand-over':   'two hands passing a small glowing orb between them',
  'drink':       'a potion bottle being tilted with liquid pouring out',
  'help':        'a helping hand reaching out with a warm golden glow',
  'heal':        'a heart shape with green healing sparkles and soft light',
  'rest':        'a peaceful cloud with Zzz letters floating above',
  'sleep':       'a crescent moon with Zzz and tiny stars',
  'warm':        'a warm orange glow orb with gentle heat waves rising upward',
  'recover':     'a circular refresh arrow symbol with sparkles around it',
  'sprout':      'a bright green sprout with two leaves unfurling from soil',

  // === SHIELD ===
  'hide':        'a figure silhouette ducking behind a bush, half-hidden',
  'protect':     'a glowing energy shield dome with protective light',
  'enlarge':     'expanding outward arrows radiating from a center point',
  'guard':       'a sturdy metal shield with a defensive cross emblem',
  'cover':       'a protective dome or canopy sheltering from above',
  'submerge':    'something sinking below a water surface line with bubbles rising',
  'revolve':     'an orbiting ring spinning around a central point',
  'stance':      'two firmly planted feet in a wide grounded stance, solid base',
  'preserve':    'a glass jar or protective bubble containing a glowing object',
  'dodge':       'a swift sidestep motion with a fading afterimage trail',
  'endure':      'a solid rock standing firm against crashing waves',
  'conceal':     'a cloak fading into invisibility with shimmering sparkle edges',
  'float':       'a feather floating gently upward with small air bubbles',

  // === DRAIN ===
  'steal':       'a sneaky shadowy hand swiping with a quick-grab motion line',
  'pluck':       'fingers plucking a feather or string with a twang effect',
  'inhale':      'a swirling vortex of air being breathed inward, suction spiral',

  // === BUFF (additional) ===
  'performance': 'musical notes swirling around instruments, a lively concert effect',
};

// ---------------------------------------------------------------------------
// Discover missing icons
// ---------------------------------------------------------------------------

function slugify(nameEn) {
  return nameEn.toLowerCase().replace(/ /g, '-');
}

async function findMissingMoves(projectRoot) {
  // Load moves
  const moves = JSON.parse(await readFile(resolve(projectRoot, 'data/moves.json'), 'utf-8'));

  // Load existing icons
  const iconsDir = resolve(projectRoot, 'public/assets/sprites/actions');
  let existingFiles;
  try { existingFiles = await readdir(iconsDir); } catch { existingFiles = []; }
  const existingSlugs = new Set(
    existingFiles
      .filter(f => f.endsWith('.webp'))
      .map(f => f.replace('.webp', ''))
  );

  // Find moves without icons (deduplicate by slug)
  const missing = [];
  const seenSlugs = new Set();

  for (const move of moves) {
    const slug = slugify(move.nameEn);
    if (existingSlugs.has(slug)) continue;
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const hint = VISUAL_HINTS[slug];
    if (!hint) {
      console.error(`WARNING: No visual hint for slug "${slug}" (${move.nameEn} / ${move.name})`);
    }

    missing.push({
      slug,
      nameEn: move.nameEn,
      name: move.name,
      reading: move.reading,
      element: move.element,
      category: move.category,
      tier: move.tier,
      hint: hint || move.nameEn,
    });
  }

  return { moves, missing, existingCount: existingSlugs.size };
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

  // Discover missing moves
  const { moves, missing, existingCount } = await findMissingMoves(projectRoot);
  console.error(`Loaded ${moves.length} moves from moves.json`);
  console.error(`Existing icons: ${existingCount}, Missing: ${missing.length}`);

  if (missing.length === 0) {
    console.error('All moves have icons!');
    return;
  }

  // --list mode
  if (list) {
    console.log('slug,nameEn,name,reading,element,category,tier');
    for (const m of missing) {
      console.log(`${m.slug},${m.nameEn},${m.name},${m.reading},${m.element},${m.category},${m.tier}`);
    }
    return;
  }

  // Category breakdown
  const byCat = {};
  for (const m of missing) {
    byCat[m.category] = (byCat[m.category] || 0) + 1;
  }
  console.error(`  By category: ${Object.entries(byCat).map(([k,v]) => `${k}=${v}`).join(', ')}`);

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    // Pad to 9 with repeats if needed
    while (batch.length < BATCH_SIZE) {
      batch.push({ ...missing[batch.length % missing.length], _filler: true });
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

    const outputPath = resolve(outputDir, `move-batch-${idx}.png`);

    console.error(`Generating grid -> ${outputPath}`);
    const result = await generateGrid(model, prompt, outputPath, styleRefParts);

    if (result.status === 'ok') {
      console.error(`OK Batch ${idx}: ${result.bytes} bytes -> ${result.path}`);
      // Save manifest
      const manifest = batch.map((item, i) => ({
        index: i,
        slug: item.slug,
        nameEn: item.nameEn,
        name: item.name,
        reading: item.reading,
        element: item.element,
        category: item.category,
        filler: !!item._filler,
      }));
      const manifestPath = resolve(outputDir, `move-batch-${idx}-manifest.json`);
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.error(`  Manifest -> ${manifestPath}`);
    } else {
      console.error(`FAILED Batch ${idx}: ${result.error}`);
    }

    // Small delay between batches to avoid rate limiting
    if (toRun.length > 1 && idx !== toRun[toRun.length - 1]) {
      console.error('  Waiting 3s before next batch...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.error('\nDone! Next steps:');
  console.error('  python3 scripts/slice-action-icons.py     # Slice grids into 128x128 PNGs');
  console.error('  python3 scripts/rembg-action-icons.py     # Remove backgrounds via RMBG');
}

main();
