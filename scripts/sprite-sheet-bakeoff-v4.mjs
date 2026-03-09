#!/usr/bin/env node
// Bakeoff v4: 4-frame sequential with Gemini 3 Pro
// neutral → half inhale → full inhale → half exhale → loop
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output';
const MODEL = 'gemini-3-pro-image-preview';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const originalBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

async function callGemini(prompt, images) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
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

const FRAMES = [
  {
    name: 'half-inhale',
    desc: `This creature is BEGINNING to breathe in. Compared to the reference pose:
- The body/torso has risen SLIGHTLY — about 3% taller
- The head has tilted up just a tiny bit
- The chest appears very slightly puffed
- Everything else is IDENTICAL: same shell cracks, same colors, same claws, same horn shapes, same art style
This is a VERY SUBTLE change — like the difference between two adjacent animation frames.`
  },
  {
    name: 'full-inhale',
    desc: `This creature is at FULL INHALE — the peak of the breathing cycle. Compared to the reference pose:
- The body/torso is about 5-7% taller/more expanded
- The head is tilted up slightly
- The chest is visibly puffed
- The legs may be slightly more compressed (bearing the expanded weight)
- Everything else is IDENTICAL: same shell cracks, same colors, same claws, same horn shapes, same art style
The motion is vertical expansion — the creature breathed in and puffed up.`
  },
  {
    name: 'half-exhale',
    desc: `This creature is in the EXHALE phase — between full inhale and resting. Compared to the reference pose:
- The body/torso is about 2-3% shorter/more compressed than neutral
- The head has dipped very slightly below its resting position
- The body looks a bit squished compared to neutral
- Everything else is IDENTICAL: same shell cracks, same colors, same claws, same horn shapes, same art style
This is a VERY SUBTLE change from neutral — just slightly compressed.`
  }
];

async function main() {
  console.log(`4-frame sequential with ${MODEL}`);
  console.log(`Creature: ${CREATURE_ID}\n`);

  const generatedFrames = [];

  for (let i = 0; i < FRAMES.length; i++) {
    const frame = FRAMES[i];
    console.log(`Generating frame ${i + 2}/4: ${frame.name}...`);

    const prompt = `You are creating one frame of a 4-frame idle breathing animation for a 2D RPG creature sprite.

I'm giving you the ORIGINAL creature image (the neutral resting pose). Your job is to redraw this EXACT creature but in a slightly different pose.

${frame.desc}

CRITICAL RULES:
- Output ONE image of ONE creature on a solid magenta (#FF00FF) background
- NOT a grid, NOT a sprite sheet, NOT multiple creatures
- The creature MUST look like the same individual — same patterns, same details, same style
- Only the POSE changes (breathing motion), nothing else
- Keep the same framing and creature size in the image`;

    const start = Date.now();
    // Always reference the original image to prevent drift
    const result = await callGemini(prompt, [originalBase64]);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result) {
      const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-4f-${frame.name}.png`);
      fs.writeFileSync(outPath, result);
      console.log(`  Saved: ${outPath} (${(result.length / 1024).toFixed(0)} KB) in ${elapsed}s`);
      generatedFrames.push({ name: frame.name, path: outPath });
    } else {
      console.log(`  FAILED`);
    }
  }

  console.log(`\nDone! Generated ${generatedFrames.length} frames + original = 4 total`);
}

main().catch(console.error);
