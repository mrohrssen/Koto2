#!/usr/bin/env node
/**
 * One-off: regenerate specific keepsake icons with better descriptions.
 * Reads a custom items JSON, generates a 3x3 grid, saves to staging.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PROJECT = '/Users/michia/Documents/jrpg';
const STAGING = resolve(PROJECT, 'data/item-staging-images');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
  const files = (await readdir(dir)).sort();
  const refs = [];
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const data = await readFile(resolve(dir, f));
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    refs.push({ inlineData: { mimeType, data: data.toString('base64') } });
  }
  return refs;
}

const items = JSON.parse(await readFile('/tmp/keepsake-fixes.json', 'utf-8'));

const layoutLines = [];
for (let r = 0; r < 3; r++) {
  const row = items.slice(r * 3, (r + 1) * 3);
  layoutLines.push(`Row ${r + 1}: ${row.map((it, i) => `(${i + 1}) ${it.meaning}`).join(', ')}`);
}

const prompt = [
  `Use the same art style as the reference images — these are item icons from the same game.`,
  ``,
  `Draw 9 cute game item icons for a video game inventory, arranged in a 3×3 layout on a solid magenta background.`,
  `Each icon should be a beautiful, simple, cute depiction of the object — matching the kawaii anime style of the reference food icons.`,
  ``,
  `Layout (3 rows, 3 columns):`,
  ...layoutLines,
  ``,
  `CRITICAL:`,
  `- Do NOT draw any text, kanji, letters, numbers, or symbols ON the items`,
  `- Do NOT draw steam, smoke, or aura effects`,
  `- Keep each item simple and clean — just the object itself`,
  ``,
  `LAYOUT:`,
  `- Place each icon in an evenly-spaced 3×3 arrangement`,
  `- DO NOT draw any grid lines, borders, dividers, or frames — just the icons on flat magenta`,
  `- The entire background must be solid flat magenta (#FF00FF) with nothing else on it`,
  `- Each item must be fully contained in its area, not overlapping neighbors`,
  ``,
  `ART STYLE:`,
  `- Sparkles are OK but NO semi-transparent pixels, NO alpha blending, NO soft feathered edges`,
  `- Every pixel must be either pure solid magenta (#FF00FF) or fully opaque content`,
  `- Hard crisp edges, no gradual fade-outs`,
  `- No text, no labels, no numbers, no UI elements, no kanji`,
  `- Each item should be immediately recognizable`,
  `- Front-facing, centered in each cell`,
].join('\n');

console.error('Prompt:\n', prompt, '\n');

const apiKey = (await readFile(resolve(PROJECT, 'data/.creature-forge-gemini-key'), 'utf-8')).trim();
const styleRefs = await loadStyleRefs('/tmp/keepsake-style-refs');
console.error(`Loaded ${styleRefs.length} style refs`);

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

const result = await model.generateContent({
  contents: [{ role: 'user', parts: [...styleRefs, { text: prompt }] }],
  generationConfig: { responseModalities: ['image', 'text'] },
});

const parts = result.response.candidates?.[0]?.content?.parts;
const imagePart = parts?.find(p => p.inlineData);
if (!imagePart) {
  console.error('No image in response:', parts?.find(p => p.text)?.text);
  process.exit(1);
}

await mkdir(STAGING, { recursive: true });
const outPath = resolve(STAGING, 'grid-keepsake-fixes.png');
const buf = Buffer.from(imagePart.inlineData.data, 'base64');
await writeFile(outPath, buf);
console.error(`✓ ${buf.length} bytes → ${outPath}`);

// Write manifest
const manifest = items.map((it, i) => ({ index: i, id: it.id, meaning: it.meaning, filler: !!it._filler }));
await writeFile(resolve(STAGING, 'grid-keepsake-fixes-manifest.json'), JSON.stringify(manifest, null, 2));
