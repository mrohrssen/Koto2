#!/usr/bin/env node

/**
 * Gemini Image Generation CLI for Creature Forge
 *
 * Generates 3 creature concept art images (variants a/b/c) via Gemini Flash
 * image generation, writing PNGs to /tmp and outputting results as JSON.
 *
 * Usage:
 *   node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const USAGE = 'Usage: node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json>';

const TIER_DIRECTIVES = {
  common: 'Cute mascot creature — round, simple, big eyes, soft colors, huggable, like a Bangboo or Mini Seelie. Minimal detail, maximum charm.',
  uncommon: 'Companion creature — balanced proportions, moderate detail, developing elemental identity. Approachable but with personality.',
  rare: 'Impressive creature — striking design, complex details, strong elemental effects, commanding presence. Noble or fierce.',
  epic: 'Powerful creature — grand proportions, dramatic effects, elaborate armor or energy. Imposing boss-tier presence.',
  legendary: 'Mythical creature — otherworldly, cosmic grandeur, maximum visual complexity, flowing energy, divine or primordial aura.',
};

const VARIANTS = ['a', 'b', 'c'];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCli() {
  let args;
  try {
    args = parseArgs({
      options: {
        id:            { type: 'string' },
        'visual-tier': { type: 'string' },
        descriptions:  { type: 'string' },
      },
      strict: true,
    });
  } catch {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  const id          = args.values.id;
  const visualTier  = args.values['visual-tier'];
  const descPath    = args.values.descriptions;

  if (!id || !visualTier || !descPath) {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  if (!TIER_DIRECTIVES[visualTier]) {
    process.stderr.write(`Error: Invalid visual-tier "${visualTier}". Must be one of: ${Object.keys(TIER_DIRECTIVES).join(', ')}\n`);
    process.exit(1);
  }

  return { id, visualTier, descPath };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(meta, visualTier, descriptionText) {
  const tierDirective = TIER_DIRECTIVES[visualTier];

  return `Game-ready creature sprite, single character on a solid magenta (#FF00FF) background.
The background MUST be perfectly flat, uniform magenta with NO gradients, shadows, or ground.
Full body, front-facing idle pose. Anime creature collector style
(Pokemon meets Genshin Impact) — cel-shaded lighting, expressive eyes.
NOT chibi — proper proportions but still stylized.
No text, no UI, no humans. The creature must not contain any magenta (#FF00FF) in its own design.

CRITICAL — This is for a language learning game. The creature represents the word "${meta.baseMeaning}".
Looking at this creature, a viewer must immediately think "${meta.baseMeaning}" — not any other noun.
The creature should visually BE ${meta.baseMeaning}, not be a different animal/object that relates to it.
Do NOT draw a real-world animal or object unless the base word IS that animal/object.

Rarity: ${visualTier} — ${tierDirective}
Creature: ${meta.name} the ${meta.modifier} ${meta.baseMeaning}
Element: ${meta.element}
Archetype: ${meta.archetype}
Moves: ${meta.attack} / ${meta.ultimate}

Visual description: ${descriptionText}`;
}

// ---------------------------------------------------------------------------
// Image generation with retry
// ---------------------------------------------------------------------------

const RETRYABLE_PATTERNS = [
  /fetch/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /network/i,
  /socket hang up/i,
  /ENOTFOUND/i,
];

function isRetryable(err) {
  const msg = err?.message || String(err);
  return RETRYABLE_PATTERNS.some(pat => pat.test(msg));
}

async function generateImage(model, prompt, outputPath) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const parts = result.response.candidates?.[0]?.content?.parts;
      if (!parts) {
        throw new Error('No parts in response');
      }

      // Find the image part with inlineData
      const imagePart = parts.find(p => p.inlineData);
      if (!imagePart) {
        // Check if there's a text part that might indicate a content policy block
        const textPart = parts.find(p => p.text);
        const reason = textPart?.text || 'No image data in response';
        throw new Error(`content policy: ${reason}`);
      }

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      await writeFile(outputPath, buffer);

      return { status: 'ok', bytes: buffer.length };
    } catch (err) {
      lastError = err;

      // Don't retry content policy blocks
      const msg = err?.message || String(err);
      if (msg.includes('content policy') || msg.includes('SAFETY') || msg.includes('blocked')) {
        break;
      }

      // Only retry on network errors, and only once
      if (attempt === 0 && isRetryable(err)) {
        // Brief pause before retry
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
  const { id, visualTier, descPath } = parseCli();

  // Resolve project root (one level up from scripts/)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, '..');

  // Read API key
  const keyPath = resolve(projectRoot, 'data', '.creature-forge-gemini-key');
  let apiKey;
  try {
    apiKey = (await readFile(keyPath, 'utf-8')).trim();
  } catch {
    process.stderr.write(JSON.stringify({ error: `No API key found at ${keyPath}` }) + '\n');
    process.exit(1);
  }

  if (!apiKey) {
    process.stderr.write(JSON.stringify({ error: `No API key found at ${keyPath}` }) + '\n');
    process.exit(1);
  }

  // Read descriptions JSON
  let descriptions;
  try {
    descriptions = JSON.parse(await readFile(descPath, 'utf-8'));
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: `Failed to read descriptions: ${err.message}` }) + '\n');
    process.exit(1);
  }

  // Validate description variants exist
  for (const v of VARIANTS) {
    if (!descriptions[v]) {
      process.stderr.write(JSON.stringify({ error: `Missing description key "${v}" in ${descPath}` }) + '\n');
      process.exit(1);
    }
  }

  // Build metadata from descriptions JSON
  const meta = {
    name:        descriptions.name        || id,
    modifier:    descriptions.modifier    || '',
    baseMeaning: descriptions.baseMeaning || '',
    element:     descriptions.element     || '',
    archetype:   descriptions.archetype   || '',
    attack:      descriptions.attack      || '',
    ultimate:    descriptions.ultimate    || '',
  };

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-image-generation',
  });

  // Generate all 3 images concurrently
  const results = await Promise.allSettled(
    VARIANTS.map(variant => {
      const prompt = buildPrompt(meta, visualTier, descriptions[variant]);
      const outputPath = `/tmp/creature-forge-${id}-${variant}.png`;
      return generateImage(model, prompt, outputPath);
    })
  );

  // Assemble output
  const output = {};
  for (let i = 0; i < VARIANTS.length; i++) {
    const variant = VARIANTS[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      output[variant] = result.value;
    } else {
      output[variant] = { status: 'failed', error: result.reason?.message || String(result.reason) };
    }
  }

  // Write structured JSON to stdout
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main();
