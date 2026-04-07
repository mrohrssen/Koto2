#!/usr/bin/env node

/**
 * Generate pixel art creature sprites via Gemini 3.1 Pro.
 *
 * Usage:
 *   node scripts/generate-creature-sprites.mjs                # all 13 creatures
 *   node scripts/generate-creature-sprites.mjs --only mizu    # single creature test
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { GoogleGenerativeAI } from '@google/generative-ai';


import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..');
const API_KEY = (await readFile(resolve(PROJECT_ROOT, 'data/.creature-forge-gemini-key'), 'utf-8')).trim();
const VARIANTS = ['a', 'b', 'c', 'd', 'e'];

// ---------------------------------------------------------------------------
// Creature prompt map
// ---------------------------------------------------------------------------

const PROMPT_SUFFIX = 'set against a solid white background, all rendered in crisp, clean pixels with gentle lighting and smooth gradients. Single 256x256 sprite image showing the creature facing right. This is a creature - not a humanoid. Make it cute and pixel art style.';

const CREATURES = {
  hi:      'A small fire spirit with glowing ember eyes and wispy flames dancing around its body,',
  mizu:    'A small water spirit with bright droplet eyes and gentle streams swirling around its round body,',
  ki:      'A small tree spirit with knot-hole eyes and tiny leaves sprouting from its woody body,',
  ishi:    'A small stone creature with pebble eyes and a sturdy round body made of smooth stacked rocks,',
  tetsu:   'A small iron creature with glinting metallic eyes and a compact body of polished steel plates,',
  kaze:    'A small wind spirit with swirling cloud eyes and a wispy body made of flowing air currents,',
  mushi:   'A small round beetle creature with big curious eyes and tiny colorful wings on its back,',
  hana:    'A small flower creature with petal eyes and a body wrapped in soft blooming petals,',
  tori:    'A small metallic bird with sharp gleaming eyes and sleek silver-tipped feathers,',
  sakana:  'A small round fish with big gentle eyes and flowing bright fins,',
  neko:    'A small playful cat with bright mischievous eyes and a flickering flame-tipped tail,',
  inu:     'A small sturdy dog with loyal determined eyes and dusty brown fur with earthy markings,',
  hineko:  'A small fiery cat with blazing ember eyes and flames flickering along its fur and tail,',
  tsukue:  'A small wooden school desk creature with drawer eyes and pencils sticking up like antennae, short stubby wooden legs,',
  isu:     'A small wooden school chair creature with seat-cushion face and four sturdy legs, slightly tilted playfully,',
  fukurou: 'A small round owl creature with enormous wise eyes and soft feathered body, tiny spectacles perched on beak,',
  chou:    'A small butterfly creature with colorful patterned wings and curious antenna eyes, delicate and graceful,',
  hachi:   'A small round bee creature with fuzzy yellow and black stripes, tiny translucent wings, and determined eyes,',
  ari:     'A small ant creature with a shiny dark body, large determined eyes, and strong mandibles, carrying a tiny leaf,',
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

function isRetryable(err) {
  const msg = err?.message || String(err);
  return RETRYABLE.some(p => p.test(msg));
}

// ---------------------------------------------------------------------------
// Generate one image
// ---------------------------------------------------------------------------

const RATE_LIMIT_PATTERNS = [/high demand/i, /rate limit/i, /quota/i, /429/i, /resource.*exhausted/i];

function isRateLimited(err) {
  const msg = err?.message || String(err);
  return RATE_LIMIT_PATTERNS.some(p => p.test(msg));
}

async function generateOne(model, creatureId, variant, outDir) {
  const description = CREATURES[creatureId];
  const prompt = `${description} ${PROMPT_SUFFIX}`;
  const outPath = `${outDir}/${creatureId}-${variant}.png`;

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
      console.log(`  ✓ ${creatureId}-${variant} (${buffer.length} bytes)`);
      return { status: 'ok', path: outPath, bytes: buffer.length };
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('content policy') || msg.includes('SAFETY') || msg.includes('blocked')) {
        console.log(`  ✗ ${creatureId}-${variant} BLOCKED: ${msg}`);
        return { status: 'blocked', error: msg };
      }
      if (isRateLimited(err)) {
        const wait = Math.min(5000 * (attempt + 1), 30000);
        console.log(`  ⏳ ${creatureId}-${variant} rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/5)...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (isRetryable(err) && attempt < 4) {
        console.log(`  ⟳ ${creatureId}-${variant} network error, retrying in 3s (attempt ${attempt + 1}/5)...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      console.log(`  ✗ ${creatureId}-${variant} FAILED: ${msg}`);
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
  let ids = only ? [only] : Object.keys(CREATURES);
  if (exclude.length) ids = ids.filter(id => !exclude.includes(id));

  if (only && !CREATURES[only]) {
    console.error(`Unknown creature: ${only}`);
    process.exit(1);
  }

  const outDir = only ? `tmp/${only}-test` : 'tmp/creature-sprites';
  await mkdir(outDir, { recursive: true });

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });

  console.log(`Generating ${ids.length} creature(s) × ${VARIANTS.length} variants → ${outDir}/\n`);

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

  if (failed.length) {
    console.log(`⚠ Failed: ${failed.join(', ')}`);
  }

  console.log('Done.');
}

main();
