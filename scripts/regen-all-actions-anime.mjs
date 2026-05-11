#!/usr/bin/env node

/**
 * Regenerate ALL action icons in anime style (matching food item icons)
 *
 * Uses food item sprites (bento, cake, etc.) as style references to generate
 * action icons that match the anime aesthetic of the rest of the game.
 *
 * Usage:
 *   node scripts/regen-all-actions-anime.mjs --dry-run           # Preview prompts
 *   node scripts/regen-all-actions-anime.mjs --test              # Generate 1 test batch
 *   node scripts/regen-all-actions-anime.mjs --batch 0           # Generate specific batch
 *   node scripts/regen-all-actions-anime.mjs                     # Generate all batches
 *   node scripts/regen-all-actions-anime.mjs --list              # List all icons
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
      test:     { type: 'boolean' },
    },
    strict: true,
  });
  return {
    batchIndex: args.values.batch != null ? parseInt(args.values.batch, 10) : null,
    dryRun: args.values['dry-run'] || false,
    list: args.values.list || false,
    test: args.values.test || false,
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
    if (f === '.gitkeep') continue;
    const data = await readFile(resolve(dir, f));
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    refs.push({ inlineData: { mimeType, data: data.toString('base64') } });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Visual hints — every action icon concept gets a concrete description
// ---------------------------------------------------------------------------

const VISUAL_HINTS = {
  // --- Creature names (nouns) ---
  'turtle': 'a cute turtle with a patterned shell',
  'horse': 'a horse head with flowing mane',
  'butterfly': 'a beautiful butterfly with colorful wings',
  'snake': 'a coiled snake with scales',
  'bear': 'a bear face with round ears',
  'ghost': 'a cute floating ghost with a wispy tail',
  'wind': 'swirling wind gusts with leaves',
  'light': 'a bright lantern with a flame inside',
  'fox': 'a cunning fox face with pointy ears',
  'moon': 'a bright crescent moon with small stars',
  'sun': 'a bright warm sun with rays',
  'frog': 'a cute green frog sitting',
  'spider': 'a cute cartoon spider on a web',
  'lion': 'a majestic lion face with mane',
  'wolf': 'a wolf howling at the sky',
  'penguin': 'a cute penguin standing',
  'dolphin': 'a leaping dolphin with water splash',
  'star': 'a twinkling golden star',
  'flower': 'a blooming colorful flower',
  'whale': 'a large friendly whale',
  'cat': 'a cute cat face with whiskers',
  'lightning': 'a bright lightning bolt',
  'crow': 'a black crow perched',
  'rabbit': 'a cute fluffy rabbit',
  'mouse': 'a small cute mouse',
  'shark': 'a fierce shark with teeth showing',
  'monkey': 'a playful monkey face',
  'octopus': 'an octopus with curling tentacles',
  'dragon': 'a dragon head with small flames',
  'scissors': 'a pair of open scissors',
  'umbrella': 'a colorful open umbrella',
  'book': 'an open book with colorful pages',
  'pillow': 'a soft fluffy pillow',
  'lamp': 'a warm oil lamp with a bright flame',
  'speaker': 'a speaker with music notes',
  'bomb': 'a round cartoon bomb with lit fuse',
  'blanket': 'a folded cozy blanket',

  // --- Action verbs ---
  'abandon': 'a door left wide open with footprints leading away',
  'approach': 'footsteps moving closer toward a target',
  'assault': 'a powerful fist punching forward with impact burst',
  'beat': 'a taiko drum being struck with drumsticks',
  'bewilder': 'a confused face with spiral eyes and question marks',
  'bind': 'heavy chains wrapping around tightly',
  'bite': 'sharp cartoon teeth biting down',
  'blizzard': 'a swirling snowstorm with ice crystals',
  'block': 'a sturdy shield blocking with impact sparks',
  'bloom': 'a flower bud opening into full bloom with petals',
  'blow': 'a face blowing wind with motion lines',
  'blow-away': 'a powerful gust blowing leaves and debris away',
  'bounce': 'a ball bouncing with spring motion lines',
  'burn': 'bright flames burning intensely',
  'burst': 'an energy burst exploding outward with fragments',
  'bury': 'something being buried under a dirt mound with a shovel',
  'call': 'a megaphone with sound wave lines coming out',
  'capture': 'a net swooping down to catch something',
  'catch': 'a hand reaching out to catch a falling ball',
  'challenge': 'two crossed swords with a spark at the intersection',
  'chirp': 'a small bird chirping with music notes',
  'chomp': 'big cheerful cartoon jaws chomping on a bone',
  'close': 'a book snapping shut with a small impact effect',
  'coil': 'a snake body coiling into a tight spiral',
  'conceal': 'an object hidden under a magician cloth',
  'cover': 'a thick blanket being draped over something',
  'crush': 'a heavy weight pressing down and crushing',
  'cry': 'a large teardrop falling from a sad eye',
  'cure': 'a medicine bottle with a green cross pouring healing drops',
  'curse': 'a dark skull with swirling purple energy',
  'cut': 'a sharp blade slicing cleanly through something',
  'dance': 'graceful dancing motion with musical swirls',
  'dash': 'a running shoe with bold speed lines trailing behind',
  'deceive': 'a sly fox mask with a hidden face behind it',
  'demolish': 'a wrecking ball smashing into a wall',
  'destroy': 'crumbling debris from total destruction',
  'devour': 'a cartoon monster mouth open wide eating cake',
  'dive': 'a figure diving downward into water with splash',
  'dodge': 'a figure leaning sideways dodging a projectile',
  'doubt': 'a thought bubble with a large question mark',
  'drink': 'a cute cup being sipped with steam rising',
  'embrace': 'warm arms hugging with a heart above',
  'encircle': 'a lasso rope forming a circle around a target',
  'endure': 'a cracked but still standing shield with determination sparks',
  'enlarge': 'a small mushroom growing into a giant one with arrows',
  'entangle': 'tangled vines wrapping around tightly',
  'exceed': 'a bold arrow smashing upward through a barrier',
  'explosion': 'a bright fiery explosion with debris',
  'extend': 'an arm stretching far outward with motion lines',
  'extinguish': 'a candle flame being blown out with smoke wisps',
  'fall': 'something tumbling downward with speed lines',
  'fire': 'a bright ball of fire',
  'float': 'a balloon drifting gently upward',
  'fly': 'a pair of spread wings with cloud wisps',
  'freeze': 'ice crystals forming and freezing over',
  'full-moon': 'a large bright yellow full moon with craters',
  'gallop': 'galloping hooves kicking up dust',
  'glare': 'fierce angry eyes with sharp eyebrows and red irises',
  'glitter': 'bright colorful gemstones sparkling with star glints',
  'grasp': 'a hand tightly grasping a bright crystal orb',
  'guard': 'a knight shield raised in defensive position',
  'hand-over': 'one hand passing an object to another hand',
  'harden': 'a surface crystallizing and becoming diamond-hard',
  'heal': 'a green heart with sparkles and a plus sign',
  'help': 'one hand reaching down to pull up another hand',
  'hide': 'a figure peeking out from behind a large bush',
  'hit': 'a fist making contact with a bold impact star',
  'hurry': 'a person running fast with speed lines and dust cloud',
  'illuminate': 'a bright torch with bold flame lighting the area',
  'inhale': 'an open mouth with visible air stream flowing inward',
  'jump': 'a figure jumping upward with motion lines below',
  'jump-out': 'a figure bursting out of a box leaping upward',
  'kick': 'a powerful leg kick with impact burst',
  'knock': 'a fist knocking on a door with ripple lines',
  'launch': 'a rocket blasting off with bright flames below',
  'leap': 'a figure leaping high with an upward arc',
  'lick': 'a playful tongue licking',
  'melt': 'an ice cube melting into a puddle',
  'musical-performance': 'musical instruments playing with colorful notes',
  'open': 'hands pushing open double doors with light streaming in',
  'overflow': 'water overflowing from a cup with splashes',
  'peck': 'a sharp bird beak pecking at seeds on the ground',
  'penetrate': 'an arrow piercing through a target cleanly',
  'performance': 'a spotlight on a microphone with bold music notes',
  'persevere': 'a determined raised fist with bold energy lines',
  'pierce': 'a sharp spear tip piercing through',
  'pin-down': 'a large hand pressing down on something holding it flat',
  'pluck': 'fingers plucking a flower from a stem with petals falling',
  'pour': 'liquid pouring from a pitcher with a graceful stream',
  'pray': 'hands pressed together in prayer with soft light above',
  'preserve': 'a jar of preserved fruit with a sealed lid',
  'protect': 'a sturdy ornate shield with a magical crest',
  'pull': 'hands gripping a rope pulling hard with strain lines',
  'punch': 'a powerful fist punching forward with impact',
  'rage': 'an angry red aura with flames around clenched fists',
  'rampage': 'wild destructive energy with debris flying',
  'recover': 'a wilted flower springing back to life with green sparkles',
  'resound': 'a golden bell ringing with bold sound waves',
  'rest': 'a cozy pillow with a sleeping cap and ZZZ above',
  'restrict': 'a padlock with chains restricting movement',
  'revolve': 'a planet orbiting a bright sun with trail',
  'rip': 'something being torn apart with jagged edges',
  'roar': 'a powerful open mouth roaring with shockwave rings',
  'roast': 'food roasting over a flame with sizzle marks',
  'ruin': 'crumbling ancient ruins with cracks',
  'scorch': 'scorching burn marks with bright embers',
  'scratch': 'a cat paw swiping with three bold red claw marks',
  'scream': 'a mouth wide open screaming with sound waves',
  'seize': 'a hand forcefully grabbing and squeezing an object',
  'shake': 'a hand vigorously shaking with motion blur lines',
  'shine': 'a brilliant golden star radiating colorful light beams',
  'shoot': 'an arrow being shot from a bow with motion trail',
  'shout': 'a face shouting with bold sound effect lines',
  'slash': 'a sharp blade slash with energy trail',
  'sleep': 'a cute sleeping face on a pillow with moon and ZZZ',
  'slice': 'a katana slicing through a watermelon cleanly',
  'slide': 'a figure sliding forward on ice with motion lines',
  'smash': 'a fist smashing with shattered fragments flying',
  'snap': 'a twig snapping in half with a crack effect',
  'sparkle': 'brilliant sparkles and star glints shimmering',
  'speak': 'an open mouth with a colorful speech bubble',
  'spin': 'a spinning top with circular motion lines',
  'sprout': 'a cute green sprout growing from soil',
  'stack': 'colorful blocks stacked in a tower',
  'stance': 'a martial artist in a wide fighting stance',
  'stand-up': 'a figure pushing up from kneeling to standing',
  'stare': 'large unblinking eyes staring intensely',
  'steal': 'a gloved hand sneaking into a pocket for a coin',
  'step-on': 'a foot stepping down firmly with impact marks',
  'stretch': 'arms and legs stretching outward with flexibility lines',
  'strike': 'a fist or weapon striking with bold impact',
  'submerge': 'something sinking below water with bubbles rising',
  'suffer': 'a cracked heart with a teardrop falling',
  'support': 'two hands holding up a heavy object from below',
  'swallow': 'a wide throat swallowing with gulp motion',
  'swallow-up': 'a giant whale mouth open wide swallowing fish',
  'swarm': 'a dense cloud of bees buzzing in formation',
  'swim': 'a figure swimming through water with splashes',
  'swing': 'a sweeping swing arc with motion trail',
  'teach': 'a chalkboard with writing and a pointer stick',
  'tear': 'something being torn with jagged tear marks',
  'tear-apart': 'something being violently torn in two pieces',
  'throw': 'an arm throwing with a motion arc',
  'throw-away': 'something being tossed into a trash bin',
  'thrust': 'a spear thrusting forward with force lines',
  'tie': 'a rope being tied into a tight knot',
  'tighten': 'something squeezing and constricting tightly',
  'topple': 'a tower of blocks falling over',
  'touch': 'a fingertip pressing on a surface with a ripple effect',
  'transform': 'a caterpillar becoming a butterfly with sparkle trail',
  'tremble': 'a small figure shaking with zigzag vibration lines',
  'trick': 'a magician hat with a rabbit peeking out',
  'warm': 'a cozy campfire with orange flames and heat waves',
  'wash': 'a bucket of soapy water with bubbles and a brush',
  'wash-away': 'a wave washing away small rocks and debris',
  'wish': 'a shooting star with a sparkle trail',
  'wound': 'a bandaged arm with a red scratch and bandaid',
  'wrap': 'wrapping around in soft colorful folds',
};

// ---------------------------------------------------------------------------
// Word extraction & deduplication
// ---------------------------------------------------------------------------

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const SLUG_OVERRIDES = {
  '食いつく': 'chomp',
  '跳ねる': 'bounce',
  '叩く': 'knock',
};

function extractAllWords(creatures) {
  const seen = new Map();

  for (const c of creatures) {
    if (!seen.has(c.name)) {
      seen.set(c.name, {
        word: c.name,
        reading: c.reading,
        english: c.meaning,
        category: 'creature',
      });
    }
    if (c.autoSkill && !seen.has(c.autoSkill.word)) {
      seen.set(c.autoSkill.word, {
        word: c.autoSkill.word,
        reading: c.autoSkill.reading,
        english: c.autoSkill.nameEn,
        category: 'auto',
      });
    }
    if (c.ultimate && !seen.has(c.ultimate.word)) {
      seen.set(c.ultimate.word, {
        word: c.ultimate.word,
        reading: c.ultimate.reading,
        english: c.ultimate.nameEn,
        category: 'ultimate',
      });
    }
  }

  const words = [...seen.values()];
  const usedSlugs = new Set();
  for (const w of words) {
    let slug = SLUG_OVERRIDES[w.word] || slugify(w.english);
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

/** Get the full list of action icon slugs (creature words + moves on disk) */
async function getAllIconSlugs(projectRoot) {
  // Start with creature names
  const creatures = JSON.parse(await readFile(resolve(projectRoot, 'data/creatures.json'), 'utf-8'));
  const creatureWords = extractAllWords(creatures);

  // Add all icons that exist on disk (move/ability icons)
  const actionsDir = resolve(projectRoot, 'public/assets/sprites/actions');
  const diskFiles = await readdir(actionsDir);
  const diskSlugs = new Set(diskFiles.filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', '')));
  const creatureSlugs = new Set(creatureWords.map(w => w.slug));

  const allIcons = [...creatureWords.map(w => ({
    slug: w.slug,
    word: w.word,
    english: w.english,
    category: w.category,
  }))];

  // Add non-creature icons from disk
  for (const slug of diskSlugs) {
    if (!creatureSlugs.has(slug)) {
      allIcons.push({
        slug,
        word: null,
        english: slug.replace(/-/g, ' '),
        category: 'move',
      });
    }
  }

  return allIcons;
}

// ---------------------------------------------------------------------------
// Prompt construction — anime style matching food items
// ---------------------------------------------------------------------------

function buildPrompt(batch) {
  const layoutLines = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowItems = batch.slice(r * GRID_COLS, (r + 1) * GRID_COLS);
    const descriptions = rowItems.map((item, i) => {
      const hint = VISUAL_HINTS[item.slug] || item.english;
      return `(${i + 1}) ${hint}`;
    });
    layoutLines.push(`Row ${r + 1}: ${descriptions.join(', ')}`);
  }

  return [
    `Use the EXACT same art style as the reference images — soft anime illustration style with gentle shading, warm colors, and clean outlines. These icons are for the same game as the reference food items.`,
    ``,
    `Draw 9 small game icons arranged in a 3×3 layout on a solid white background.`,
    `These are skill icons and vocabulary flashcard icons for a Japanese-themed RPG.`,
    ``,
    `Layout (3 rows, 3 columns):`,
    ...layoutLines,
    ``,
    `ART STYLE (CRITICAL — must match the reference images exactly):`,
    `- Soft anime/manga illustration style with GENTLE shading and warm highlights`,
    `- Clean dark outlines, but NOT harsh or thick — smooth and elegant`,
    `- Warm, inviting color palette — pastels and saturated tones working together`,
    `- Subtle gradients and soft lighting, NOT flat/cell-shaded`,
    `- Each icon should feel like a polished Japanese game item icon`,
    `- Cute and appealing aesthetic — NOT gritty, NOT western cartoon, NOT pixel art`,
    `- Think: Genshin Impact item icons, or Japanese RPG ability icons`,
    ``,
    `LAYOUT:`,
    `- Place each icon in an evenly-spaced 3×3 arrangement`,
    `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on flat white`,
    `- The entire background must be solid white (#FFFFFF) with nothing else on it`,
    `- Each icon must be fully contained in its area, not overlapping neighbors`,
    ``,
    `TECHNICAL:`,
    `- Every pixel must be either pure white (#FFFFFF) or fully opaque content`,
    `- Hard crisp edges where the icon meets the white background — no gradual fade-outs`,
    `- NO glow effects, NO soft halos, NO radiant auras, NO light bloom — these bleed into the background and break background removal`,
    `- NO semi-transparent gradients fading into the background`,
    `- No text, no labels, no numbers, no UI elements`,
    `- Each icon should be instantly recognizable as the concept it represents`,
    `- Front-facing, centered in each cell`,
    `- Compact designs that read well at 128×128 pixels`,
    `- Each icon fills most of its cell — no tiny objects with huge empty space`,
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
  const { batchIndex, dryRun, list, test } = parseCli();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  // Get all icon slugs
  const allIcons = await getAllIconSlugs(projectRoot);
  console.error(`Total action icons to generate: ${allIcons.length}`);

  // --list mode
  if (list) {
    console.log('slug,english,category,has_hint');
    for (const icon of allIcons) {
      console.log(`${icon.slug},${icon.english},${icon.category},${VISUAL_HINTS[icon.slug] ? 'yes' : 'NO'}`);
    }
    const missing = allIcons.filter(i => !VISUAL_HINTS[i.slug]);
    console.error(`\n${missing.length} icons without visual hints`);
    return;
  }

  // Build items with hints
  const items = allIcons.map(icon => ({
    slug: icon.slug,
    hint: VISUAL_HINTS[icon.slug] || icon.english,
    english: icon.english,
    category: icon.category,
  }));

  // Create batches of 9
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    while (batch.length < BATCH_SIZE) {
      batch.push({ ...items[batch.length % items.length], _filler: true });
    }
    batches.push(batch);
  }
  console.error(`Split into ${batches.length} batches of ${BATCH_SIZE}`);

  // Determine which batches to run
  let toRun;
  if (test) {
    // Test mode: just batch 0 (first 9 icons)
    toRun = [0];
    console.error('TEST MODE: generating batch 0 only');
  } else if (batchIndex != null) {
    toRun = [batchIndex];
  } else {
    toRun = batches.map((_, i) => i);
  }

  // Load API key + style refs (food items!)
  let apiKey, styleRefParts;
  if (!dryRun) {
    const keyPath = resolve(projectRoot, 'data', '.creature-forge-gemini-key');
    apiKey = (await readFile(keyPath, 'utf-8')).trim();
    if (!apiKey) { console.error('No API key'); process.exit(1); }

    // Use FOOD ITEM sprites as style references (anime style)
    const refDir = resolve(projectRoot, 'data/quality-refs/items');
    styleRefParts = await loadStyleRefs(refDir);
    console.error(`Loaded ${styleRefParts.length} anime style reference(s) from ${refDir}`);
  }

  const outputDir = resolve(projectRoot, 'data/action-icon-staging-anime');
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

    const outputPath = resolve(outputDir, `anime-batch-${idx}.png`);

    console.error(`Generating grid -> ${outputPath}`);
    const result = await generateGrid(model, prompt, outputPath, styleRefParts);

    if (result.status === 'ok') {
      okCount++;
      console.error(`  OK: ${result.bytes} bytes -> ${result.path}`);
      const manifest = batch.map((item, i) => ({
        index: i,
        slug: item.slug,
        hint: item.hint,
        english: item.english,
        category: item.category,
        filler: !!item._filler,
      }));
      const manifestPath = resolve(outputDir, `anime-batch-${idx}-manifest.json`);
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
    console.error('  python3 scripts/slice-anime-action-icons.py');
  }
}

main();
