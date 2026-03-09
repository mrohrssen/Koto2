#!/usr/bin/env node

/**
 * Batch reimagine creature images via Gemini 2.5 Flash.
 * Sends the existing staging image + style refs, asks Gemini to reimagine.
 * Generates 5 variants per creature to /tmp/creature-regen-{id}-{1..5}.png
 *
 * Usage:
 *   node scripts/creature-regen-batch.mjs
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const CREATURES = [
  'hikaribon',
  'tsukimochi',
  'irukami',
  'hoshirin',
  'hanatchi',
  'ranpuuru',
];

const VARIANTS = 5;
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

async function loadCreatureImage(id) {
  const path = resolve(projectRoot, 'data/creature-staging-images', `${id}.png`);
  const data = await readFile(path);
  return { inlineData: { mimeType: 'image/png', data: data.toString('base64') } };
}

const STYLE_REF_LABEL = { text: `STYLE REFERENCES — these 8 images show the art style to match. Do NOT redesign any of these. Just use them as a style guide:` };

const CREATURE_LABEL = { text: `TARGET CREATURE — this is the ONE creature to reimagine. Give me a fresh design for THIS creature only:` };

const INSTRUCTIONS = { text: `Redesign the TARGET CREATURE above in a new concept. Keep the same general theme/animal but give it a fresh design that matches the art style of the STYLE REFERENCES.

Requirements:
- Match the art style of the 8 reference images exactly (anime creature collector, cel-shaded, expressive)
- Solid magenta (#FF00FF) background
- No glow effects, no light emission, no bloom, no aura
- No transparent or translucent body parts — everything must be fully opaque and solidly colored
- Rich, vibrant, saturated colors — not washed out or desaturated
- No shadows on the background
- Full body, front-facing idle pose, ready for animation
- No text, no UI elements` };

async function generateImage(model, prompt, outputPath, parts) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
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
      return { status: 'ok', bytes: buffer.length };
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('content policy') || msg.includes('SAFETY') || msg.includes('blocked')) {
        return { status: 'failed', error: msg };
      }
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { status: 'failed', error: msg };
    }
  }
}

async function main() {
  const apiKey = (await readFile(resolve(projectRoot, 'data', '.creature-forge-gemini-key'), 'utf-8')).trim();
  const styleRefParts = await loadStyleRefs(resolve(projectRoot, 'data/creature-forge-style-refs'));
  console.error(`Loaded ${styleRefParts.length} style reference images`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  for (const id of CREATURES) {
    console.error(`\n--- ${id} (5 variants) ---`);
    const creatureImg = await loadCreatureImage(id);
    const parts = [
      STYLE_REF_LABEL,
      ...styleRefParts,
      CREATURE_LABEL,
      creatureImg,
      INSTRUCTIONS,
    ];

    const results = await Promise.allSettled(
      Array.from({ length: VARIANTS }, (_, i) => {
        const v = i + 1;
        const outputPath = `/tmp/creature-regen-${id}-${v}.png`;
        return generateImage(model, null, outputPath, parts)
          .then(r => ({ variant: v, ...r }));
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { variant, ...rest } = r.value;
        const icon = rest.status === 'ok' ? '✓' : '✗';
        console.error(`  ${id}-${variant}: ${icon} ${rest.status === 'ok' ? `${rest.bytes} bytes` : rest.error}`);
      } else {
        console.error(`  ${id}-?: ✗ ${r.reason}`);
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.error('\nDone!');
}

main();
