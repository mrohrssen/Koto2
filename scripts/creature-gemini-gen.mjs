#!/usr/bin/env node

/**
 * Gemini Image Generation CLI for Creature Forge
 *
 * Generates 3 creature concept art images (variants a/b/c) via Gemini Flash
 * image generation, writing PNGs to /tmp and outputting results as JSON.
 *
 * Usage:
 *   node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json> [--style-refs-dir <dir>] [--use-art-briefs]
 *
 * Options:
 *   --style-refs-dir  Directory of .png/.jpg/.jpeg/.webp style reference images.
 *                     If omitted, checks data/creature-forge-style-refs/ in project root.
 *   --use-art-briefs  Use artBriefs.a/b/c from descriptions JSON instead of top-level a/b/c.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const USAGE = 'Usage: node scripts/creature-gemini-gen.mjs --id <id> --visual-tier <tier> --descriptions <path.json> [--style-refs-dir <dir>] [--use-art-briefs]';

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
        id:              { type: 'string' },
        'visual-tier':   { type: 'string' },
        descriptions:    { type: 'string' },
        'style-refs-dir': { type: 'string' },
        'use-art-briefs': { type: 'boolean' },
      },
      strict: true,
    });
  } catch {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  const id            = args.values.id;
  const visualTier    = args.values['visual-tier'];
  const descPath      = args.values.descriptions;
  const styleRefsDir  = args.values['style-refs-dir'] || undefined;
  const useArtBriefs  = args.values['use-art-briefs'] || false;

  if (!id || !visualTier || !descPath) {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  if (!TIER_DIRECTIVES[visualTier]) {
    process.stderr.write(`Error: Invalid visual-tier "${visualTier}". Must be one of: ${Object.keys(TIER_DIRECTIVES).join(', ')}\n`);
    process.exit(1);
  }

  return { id, visualTier, descPath, styleRefsDir, useArtBriefs };
}

// ---------------------------------------------------------------------------
// Style reference image loading
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
  if (!dir) return [];
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return []; // directory doesn't exist
  }
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

function buildPrompt(meta, visualTier, descriptionText, hasStyleRefs) {
  const tierDirective = TIER_DIRECTIVES[visualTier];

  const styleBlock = hasStyleRefs
    ? `ART STYLE (match the reference images exactly — same line weight, same shading, same level of detail):
- Crisp black outlines, uniform weight
- Cel-shaded flat coloring: base color + one shadow tone per surface
- No gradients, no soft brushwork, no painterly textures, no airbrushing
- Large expressive eyes with single white catchlight
- Limited palette: 5-6 body colors maximum plus black outlines and white highlights
- Clean readable silhouette suitable for a game UI thumbnail
- Compact appealing proportions — not hyper-detailed or realistic`
    : `ART STYLE:
Anime creature collector style — cel-shaded lighting, expressive eyes.
NOT chibi — proper proportions but still stylized.`;

  return `${styleBlock}

TECHNICAL:
- Character is completely isolated on a solid, pure magenta background (Hex #FF00FF) with sharp, crisp edges and no lighting bleed, glow, or shadows. No shadow underneath the character. Full body shot, ready for animation.
- Front-facing idle pose, single character only
- No text, no UI elements, no humans
- Creature must not contain any magenta (#FF00FF) in its own colors

CREATURE IDENTITY:
This creature represents "${meta.baseMeaning}". Looking at it, a viewer must immediately think "${meta.baseMeaning}".
The creature must visually BE ${meta.baseMeaning}, not be a different animal/object that relates to it.

Rarity: ${visualTier} — ${tierDirective}
Name: ${meta.name} the ${meta.modifier} ${meta.baseMeaning}
Element: ${meta.element} | Archetype: ${meta.archetype}
Moves: ${meta.attack} / ${meta.ultimate}

Appearance: ${descriptionText}`;
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

async function generateImage(model, prompt, outputPath, styleRefParts) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestParts = [...styleRefParts, { text: prompt }];
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const responseParts = result.response.candidates?.[0]?.content?.parts;
      if (!responseParts) {
        throw new Error('No parts in response');
      }

      // Find the image part with inlineData
      const imagePart = responseParts.find(p => p.inlineData);
      if (!imagePart) {
        // Check if there's a text part that might indicate a content policy block
        const textPart = responseParts.find(p => p.text);
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
  const { id, visualTier, descPath, styleRefsDir, useArtBriefs } = parseCli();

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

  // Determine description source: artBriefs (if --use-art-briefs) or top-level a/b/c
  const descSource = (useArtBriefs && descriptions.artBriefs) ? descriptions.artBriefs : descriptions;

  // Validate description variants exist
  for (const v of VARIANTS) {
    if (!descSource[v]) {
      const location = (useArtBriefs && descriptions.artBriefs) ? `artBriefs.${v}` : v;
      process.stderr.write(JSON.stringify({ error: `Missing description key "${location}" in ${descPath}` }) + '\n');
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

  // Load style reference images
  const resolvedStyleDir = styleRefsDir || resolve(projectRoot, 'data/creature-forge-style-refs');
  const styleRefParts = await loadStyleRefs(resolvedStyleDir);
  if (styleRefParts.length > 0) {
    process.stderr.write(`Loaded ${styleRefParts.length} style reference image(s) from ${resolvedStyleDir}\n`);
  }
  const hasStyleRefs = styleRefParts.length > 0;

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-image-generation',
  });

  // Generate all 3 images concurrently
  const results = await Promise.allSettled(
    VARIANTS.map(variant => {
      const prompt = buildPrompt(meta, visualTier, descSource[variant], hasStyleRefs);
      const outputPath = `/tmp/creature-forge-${id}-${variant}.png`;
      return generateImage(model, prompt, outputPath, styleRefParts);
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
