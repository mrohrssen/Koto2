#!/usr/bin/env node
// Bakeoff v3: minimal 2-frame approach - just neutral + inhale
// Test if AI can maintain consistency for even ONE frame change
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const imageBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

async function callGemini(model, prompt, images = []) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: 'image/png', data: img } });
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    })
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  for (const c of data.candidates || []) {
    for (const p of c.content?.parts || []) {
      if (p.inlineData) return Buffer.from(p.inlineData.data, 'base64');
      if (p.text) console.log(`  Model: ${p.text.slice(0, 100)}`);
    }
  }
  return null;
}

async function main() {
  console.log(`Testing minimal 2-frame approach with ${CREATURE_ID}`);

  // Test with both models
  for (const model of ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview']) {
    console.log(`\n=== ${model} ===`);

    const prompt = `I'm giving you a creature sprite for a 2D RPG game. I need you to create ONE single image that shows this EXACT same creature, but in a slightly different pose — as if it just took a breath in.

WHAT MUST CHANGE:
- The creature's body should be slightly taller/more expanded (as if its chest puffed up with air)
- The head should be tilted very slightly upward

WHAT MUST NOT CHANGE (this is critical):
- The exact same colors, patterns, cracks, and textures on the shell
- The exact same number and shape of claws/toes
- The exact same horns/facial features
- The exact same art style and line quality
- The exact same background color (magenta #FF00FF)
- The overall composition and framing

Think of it like the SAME drawing, but someone slightly stretched it vertically by 5% from the center. The creature is breathing in.

Output: ONE image of ONE creature. Not a grid. Not multiple frames. Just this creature in the "breathing in" pose.`;

    const start = Date.now();
    const result = await callGemini(model, prompt, [imageBase64]);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result) {
      const safeName = model.replace(/[^a-z0-9]/g, '-');
      const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-inhale-${safeName}.png`);
      fs.writeFileSync(outPath, result);
      console.log(`  Saved: ${outPath} (${(result.length / 1024).toFixed(0)} KB) in ${elapsed}s`);
    } else {
      console.log('  FAILED');
    }
  }
}

main().catch(console.error);
