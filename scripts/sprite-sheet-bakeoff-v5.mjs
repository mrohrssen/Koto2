#!/usr/bin/env node
// Bakeoff v5: 8-frame breathing loop with Gemini 3 Pro
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output';
const MODEL = 'gemini-3-pro-image-preview';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const originalBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

async function callGemini(prompt, images, maxRetries = 4) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: 'image/png', data: img } });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const wait = 10 * attempt;
      console.log(`  Retry ${attempt}/${maxRetries} in ${wait}s...`);
      await new Promise(r => setTimeout(r, wait * 1000));
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })
    });

    if (resp.status === 503 || resp.status === 429) {
      console.log(`  Got ${resp.status}, will retry...`);
      continue;
    }

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
  throw new Error(`Failed after ${maxRetries} retries`);
}

// 8 frames: breathing cycle
// Frame 1 = original (neutral) — we already have this
// Frames 2-8 = generated poses
const FRAMES = [
  // Frame 2: beginning inhale
  {
    name: '02-inhale-start',
    desc: `BARELY beginning to inhale. The creature's body is VERY SLIGHTLY taller than neutral — about 2% expansion. Head tilted up a tiny fraction. This is the most subtle change from neutral.`
  },
  // Frame 3: quarter inhale
  {
    name: '03-inhale-quarter',
    desc: `Quarter way through inhale. The creature's body is about 3-4% taller than neutral. Chest is starting to puff slightly. Head tilting up a bit more.`
  },
  // Frame 4: half inhale
  {
    name: '04-inhale-half',
    desc: `Half way through inhale. The creature's body is about 5% taller than neutral. Chest is noticeably puffed. Head is tilted up. This is a clear mid-point between neutral and full inhale.`
  },
  // Frame 5: full inhale (peak)
  {
    name: '05-inhale-full',
    desc: `FULL INHALE — the peak of the breathing cycle. The creature's body is about 7% taller than neutral. Maximum chest puff. Head is raised. Legs may be slightly more compressed bearing the expanded weight. This is the most expanded the creature gets.`
  },
  // Frame 6: half exhale
  {
    name: '06-exhale-half',
    desc: `Half way through exhale, coming back down. The creature is about 3% taller than neutral — halfway between full inhale and resting. Chest is deflating. Head lowering back.`
  },
  // Frame 7: full exhale (bottom)
  {
    name: '07-exhale-full',
    desc: `FULL EXHALE — the bottom of the breathing cycle. The creature is about 3% SHORTER/more compressed than neutral. Body is slightly squished. Head has dipped slightly below its resting position. This is the most compressed the creature gets.`
  },
  // Frame 8: returning to neutral
  {
    name: '08-returning',
    desc: `Almost back to neutral from exhale. The creature is about 1% shorter than neutral — barely perceptible difference. About to return to the exact neutral pose. This frame must look ALMOST IDENTICAL to the neutral pose for a seamless loop.`
  }
];

async function main() {
  console.log(`8-frame loop with ${MODEL}`);
  console.log(`Creature: ${CREATURE_ID}`);
  console.log(`Generating ${FRAMES.length} frames (+ original = 8 total)\n`);

  const results = [];

  for (let i = 0; i < FRAMES.length; i++) {
    const frame = FRAMES[i];
    const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-8f-${frame.name}.png`);

    // Skip if already generated
    if (fs.existsSync(outPath)) {
      console.log(`[${i+2}/8] ${frame.name} — already exists, skipping`);
      results.push({ name: frame.name, path: outPath });
      continue;
    }

    console.log(`[${i+2}/8] ${frame.name}...`);

    const prompt = `You are creating frame ${i+2} of an 8-frame idle breathing animation loop for a 2D RPG creature sprite.

I'm giving you the ORIGINAL creature image (the neutral resting pose, frame 1). Redraw this EXACT creature in a slightly different breathing pose.

Pose for this frame:
${frame.desc}

CRITICAL CONSISTENCY RULES:
- The creature must look like the EXACT SAME individual as the reference image
- Same shell crack patterns, same colors, same claw shapes, same horn shapes, same facial features
- Same art style, same line quality, same level of detail
- Only the BODY POSTURE changes (vertical expansion/compression from breathing)
- Keep the same framing — creature centered, same approximate size in the image
- Solid magenta (#FF00FF) background

OUTPUT: ONE image of ONE creature. Not a grid. Not a sprite sheet. Just this creature in the described pose.`;

    const start = Date.now();
    const result = await callGemini(prompt, [originalBase64]);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result) {
      fs.writeFileSync(outPath, result);
      console.log(`  Saved (${(result.length / 1024).toFixed(0)} KB) in ${elapsed}s`);
      results.push({ name: frame.name, path: outPath });
    } else {
      console.log(`  FAILED`);
      results.push({ name: frame.name, path: null });
    }
  }

  console.log(`\nDone! ${results.filter(r => r.path).length}/${FRAMES.length} frames generated`);
}

main().catch(console.error);
