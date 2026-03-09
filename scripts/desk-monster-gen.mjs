#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = 'AIzaSyBtNj9HZDnH_-574DBTKfKv9_EiGbZlm6E';

const prompts = [
  // 1. Anime creature collector (our current style)
  `Anime creature collector style — cel-shaded lighting, expressive eyes. A small desk monster — a living wooden school desk with stubby legs, one drawer slightly open like a mouth with pencils for teeth, big curious eyes on the desk surface. Solid white (#FFFFFF) background, full body, front-facing idle pose. No text.`,

  // 2. Yokai / tsukumogami style
  `Japanese yokai tsukumogami illustration style. A tsukugami desk spirit — an old wooden school desk that has come alive after 100 years. It has a ghostly face on its surface, drawers rattling, papers floating around it. Ink wash painting aesthetic with soft watercolor tones. White background, full body. No text.`,

  // 3. Chibi / cute mascot
  `Chibi kawaii mascot style. An adorable desk creature — a tiny rounded school desk with blushing cheeks, sparkly anime eyes, and little stubby wooden legs. It carries books on its back like a shell. Pastel colors, very cute and round. White background, full body. No text.`,

  // 4. Pokemon-inspired
  `Pokemon creature design style. TSUKUEMON — a Wood-type desk creature. A compact living desk with bark-like wooden texture, leaf-shaped drawer handles, and glowing green eyes. Its four legs are like tree roots. Simple, clean design ready for a game sprite. White background, full body, front-facing. No text.`,

  // 5. Digimon-inspired (more mechanical/angular)
  `Digimon digital monster style. A digital desk creature — a school desk fused with circuitry, one drawer open revealing a glowing data core, angular geometric legs, holographic papers orbiting it. Sci-fi anime aesthetic. White background, full body. No text.`,

  // 6. Studio Ghibli inspired
  `Studio Ghibli soft fantasy style. A gentle desk spirit — a worn wooden school desk with a warm, friendly face, carrying a stack of beloved old books. Mushrooms and tiny flowers grow from its surface. Warm, nostalgic colors. White background, full body. No text.`,

  // 7. Paper/origami style
  `Origami paper craft illustration style. A desk creature made entirely of folded paper — geometric paper desk shape with origami legs, paper crane wings folded from notebook pages, pencil antenna. Clean flat colors. White background, full body. No text.`,

  // 8. Stained glass / gem style
  `Fantasy crystal creature style. A crystallized desk monster — a school desk transformed into living crystal/gemstone, faceted surfaces catching light, glowing runes where writing used to be, crystal legs. Jewel tones, magical. White background, full body. No text.`,

  // 9. Spooky/haunted cute
  `Cute Halloween monster style. A haunted desk creature — a rickety old school desk floating slightly off the ground, ghost-like wisps coming from its drawers, one eye peeking from under the lid, chalk equations floating around it. Spooky but adorable. White background, full body. No text.`,

  // 10. Our game style with modifier
  `Anime creature collector style — cel-shaded lighting, expressive eyes. An ANCIENT DESK creature for a Japanese vocabulary RPG. A weathered wooden school desk covered in carved kanji, moss growing in its grain, ancient scrolls tucked in its drawers, wise old eyes on its surface. Earthy brown and green tones. Solid white (#FFFFFF) background, full body, front-facing idle pose. No text.`,
];

const STYLE_NAMES = [
  '01-anime-collector',
  '02-yokai-tsukumogami',
  '03-chibi-kawaii',
  '04-pokemon-style',
  '05-digimon-style',
  '06-ghibli-style',
  '07-origami-paper',
  '08-crystal-gem',
  '09-haunted-cute',
  '10-ancient-desk-game',
];

async function main() {
  const genAI = new GoogleGenerativeAI(API_KEY);
  // Use pro for first 5, flash for last 5 to compare
  const proModel = genAI.getGenerativeModel({
    model: 'gemini-3-pro-image-preview',
  });
  const flashModel = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-image-preview',
  });

  console.log('Generating 10 desk monster variants (1-5 pro, 6-10 flash)...\n');

  // Generate 1 at a time to avoid rate limits on image models
  for (let batch = 0; batch < 5; batch++) {
    const indices = [batch * 2, batch * 2 + 1];
    const results = await Promise.allSettled(
      indices.map(async (i) => {
        const name = STYLE_NAMES[i];
        const model = i < 5 ? proModel : flashModel;
        const tag = i < 5 ? '[PRO]' : '[FLASH]';
        console.log(`  Starting ${tag}: ${name}...`);
        try {
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompts[i] }] }],
            generationConfig: { responseModalities: ['image', 'text'] },
          });

          const parts = result.response.candidates?.[0]?.content?.parts;
          const imagePart = parts?.find(p => p.inlineData);
          if (!imagePart) {
            const textPart = parts?.find(p => p.text);
            throw new Error(`No image: ${textPart?.text || 'unknown'}`);
          }

          const outPath = `/tmp/desk-monster-${name}.png`;
          await writeFile(outPath, Buffer.from(imagePart.inlineData.data, 'base64'));
          console.log(`  ✓ ${name} → ${outPath}`);
          return { name, path: outPath, status: 'ok' };
        } catch (err) {
          console.error(`  ✗ ${name}: ${err.message}`);
          return { name, status: 'failed', error: err.message };
        }
      })
    );

    // Brief pause between batches
    if (batch < 4) await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\nDone! Building review page...');

  // Build HTML review page
  const images = STYLE_NAMES.map(name => `/tmp/desk-monster-${name}.png`);
  let html = `<!DOCTYPE html><html><head><title>Desk Monster Bakeoff</title>
<style>
  body { background: #1a1a2e; color: #eee; font-family: system-ui; padding: 20px; }
  h1 { text-align: center; color: #e94560; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
  .card { background: #16213e; border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: white; }
  .card .label { padding: 12px; text-align: center; font-weight: bold; font-size: 14px; }
</style></head><body>
<h1>机 (tsukue) — Desk Monster Bakeoff</h1>
<p style="text-align:center;opacity:0.7">10 style variants for a tsukumogami desk creature • Gemini 2.0 Flash</p>
<div class="grid">`;

  for (const name of STYLE_NAMES) {
    html += `<div class="card"><img src="desk-monster-${name}.png"><div class="label">${name.replace(/^\d+-/, '').replace(/-/g, ' ')}</div></div>`;
  }

  html += `</div></body></html>`;
  await writeFile('/tmp/desk-monster-review.html', html);
  console.log('Review page: /tmp/desk-monster-review.html');
}

main();
