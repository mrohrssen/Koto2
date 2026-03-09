#!/usr/bin/env node
/**
 * Generate individual item icons for hourglass and balance-scales
 * using Gemini 2.5 Flash, then save to sliced directory for RMBG.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PROJECT_ROOT = '/Users/michia/Documents/jrpg';
const STYLE_REFS_DIR = resolve(PROJECT_ROOT, 'data/creature-forge-style-refs');
const OUTPUT_DIR = resolve(PROJECT_ROOT, 'data/item-staging-images/sliced');

const ITEMS = [
  {
    id: 'hourglass',
    meaning: 'hourglass',
    prompt: `Use the same art style as the reference images — these are creature sprites from the same game.

Draw a single beautiful hourglass (砂時計) icon for a video game inventory, centered on a solid white (#FFFFFF) background.

The hourglass should look like a precious, magical artifact — ornate golden frame, glowing sand flowing inside, perhaps with subtle sparkles or magical particles around it. It should feel like a legendary RPG item.

ART STYLE:
- Polished game item icon style matching the reference sprites
- Rich detail — gleaming metals, luminous sand, elegant craftsmanship
- The item should be immediately recognizable as an hourglass
- Front-facing, centered in the image
- NO text, no labels, no numbers, no UI elements
- The entire background must be solid flat white (#FFFFFF)
- Hard crisp edges where the item meets the white background`
  },
  {
    id: 'balance-scales',
    meaning: 'balance scales',
    prompt: `Use the same art style as the reference images — these are creature sprites from the same game.

Draw a single beautiful balance scales (天秤) icon for a video game inventory, centered on a solid white (#FFFFFF) background.

The scales should look like a precious, magical artifact — ornate golden beam and chains, glowing pans, perhaps with subtle sparkles or magical energy. It should feel like a legendary RPG item that brings harmony and equilibrium.

ART STYLE:
- Polished game item icon style matching the reference sprites
- Rich detail — gleaming metals, luminous glow, elegant craftsmanship
- The item should be immediately recognizable as a balance / weighing scales
- Front-facing, centered in the image
- NO text, no labels, no numbers, no UI elements
- The entire background must be solid flat white (#FFFFFF)
- Hard crisp edges where the item meets the white background`
  }
];

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
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

async function main() {
  const apiKey = (await readFile(resolve(PROJECT_ROOT, 'data/.creature-forge-gemini-key'), 'utf-8')).trim();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  const styleRefs = await loadStyleRefs(STYLE_REFS_DIR);
  console.error(`Loaded ${styleRefs.length} style refs`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const item of ITEMS) {
    console.error(`\nGenerating ${item.id}...`);
    try {
      const parts = [...styleRefs, { text: item.prompt }];
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const responseParts = result.response.candidates?.[0]?.content?.parts;
      if (!responseParts) throw new Error('No parts in response');

      const imagePart = responseParts.find(p => p.inlineData);
      if (!imagePart) {
        const textPart = responseParts.find(p => p.text);
        throw new Error(`No image: ${textPart?.text || 'unknown'}`);
      }

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const outPath = resolve(OUTPUT_DIR, `${item.id}.png`);
      await writeFile(outPath, buffer);
      console.error(`  ✓ ${item.id}: ${buffer.length} bytes → ${outPath}`);
    } catch (err) {
      console.error(`  ✗ ${item.id} failed: ${err.message}`);
    }
  }

  console.error('\nDone generating icons!');
}

main();
