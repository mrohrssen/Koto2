#!/usr/bin/env node
// Bakeoff v2: explicit per-frame instructions + sequential generation
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const imageBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

const MODEL = 'gemini-2.5-flash-image'; // faster for iteration

async function callGemini(model, prompt, images = []) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: typeof img === 'string' ? img : img.toString('base64')
      }
    });
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
      if (part.text) {
        console.log(`  Model says: ${part.text.slice(0, 150)}`);
      }
    }
  }
  return null;
}

// ============ TEST 1: Explicit sprite sheet ============
async function testExplicitSpriteSheet() {
  console.log('\n========== TEST 1: EXPLICIT SPRITE SHEET ==========');

  const prompt = `I need you to create a game sprite sheet for an idle animation. This is for a 2D RPG — the creature needs to look like it's BREATHING and ALIVE, not frozen.

Here is the creature. Generate a 4x2 grid sprite sheet (4 columns, 2 rows = 8 frames total).

CRITICAL: Each frame MUST look visibly different from the others. The differences should be OBVIOUS, not subtle. This is frame-by-frame animation.

Frame-by-frame motion breakdown (read left-to-right, top-to-bottom):
- Frame 1 (top-left): NEUTRAL pose. Body relaxed, head level. Match the input image exactly.
- Frame 2: INHALE BEGINS. The creature's chest/body starts expanding upward. Head tilts up slightly. Body is 5% taller than frame 1.
- Frame 3: FULL INHALE. Body is at maximum expansion — visibly puffed up and taller. Head is raised. Feet push down slightly.
- Frame 4: INHALE HOLD. Still puffed up but starting to relax. Head begins lowering.
- Frame 5: EXHALE BEGINS. Body starts compressing downward. Head lowers back to neutral.
- Frame 6: FULL EXHALE. Body is at minimum — slightly compressed/squished compared to frame 1. Head dips slightly below neutral.
- Frame 7: EXHALE HOLD. Still compressed but starting to rise back. Head coming back up.
- Frame 8: RETURNING TO NEUTRAL. Almost identical to frame 1 so the loop is seamless.

Style rules:
- Solid magenta (#FF00FF) background in every cell
- Same creature in every frame — same colors, same details, same art style
- Each cell must be the same size with the creature centered
- The UP/DOWN breathing motion must be CLEARLY VISIBLE when comparing frames side by side`;

  const start = Date.now();
  const result = await callGemini(MODEL, prompt, [imageBase64]);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (result) {
    const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-explicit-sheet.png`);
    fs.writeFileSync(outPath, result);
    console.log(`  Saved: ${outPath} (${(result.length / 1024).toFixed(0)} KB) in ${elapsed}s`);
    return outPath;
  }
  console.log('  FAILED - no image returned');
  return null;
}

// ============ TEST 2: Sequential frame generation ============
async function testSequentialFrames() {
  console.log('\n========== TEST 2: SEQUENTIAL FRAMES ==========');

  const frameDescriptions = [
    'NEUTRAL resting pose. Body relaxed, head level. Reproduce this creature exactly as shown — same size, same pose, same details. Solid magenta (#FF00FF) background.',
    'The creature is BEGINNING TO INHALE. Compared to the previous frame: the body has expanded upward by about 5%, the head has tilted up slightly, and the chest appears slightly puffed. Everything else stays the same. Solid magenta background.',
    'The creature is at FULL INHALE. Compared to the previous frame: the body is visibly puffed up and taller (about 10% taller than the resting pose), the head is raised, feet push down. This is the peak of the breathing cycle. Solid magenta background.',
    'The creature is BEGINNING TO EXHALE. Compared to the previous frame: the body is starting to deflate back down, head is lowering. Still slightly puffed but clearly less than the previous frame. Solid magenta background.',
    'The creature is at FULL EXHALE. Compared to the previous frame: the body is now slightly compressed — shorter than the neutral pose by about 5%. The head has dipped below neutral. This is the bottom of the breathing cycle. Solid magenta background.',
    'The creature is RETURNING TO NEUTRAL. Compared to the previous frame: the body is rising back up toward the resting pose. Almost identical to the first frame. Solid magenta background.',
  ];

  const frames = [];
  let prevFrameBase64 = null;

  for (let i = 0; i < frameDescriptions.length; i++) {
    console.log(`  Generating frame ${i + 1}/${frameDescriptions.length}...`);

    let prompt, images;
    if (i === 0) {
      prompt = `You are creating frame ${i + 1} of a 6-frame idle breathing animation for a 2D RPG creature sprite.

Here is the creature. Redraw it in this exact pose:
${frameDescriptions[i]}

IMPORTANT: Output a single image of just this one creature. Not a grid. Not a sprite sheet. Just one creature on a magenta background.`;
      images = [imageBase64];
    } else {
      prompt = `You are creating frame ${i + 1} of a 6-frame idle breathing animation for a 2D RPG creature sprite.

I'm giving you TWO images:
1. The ORIGINAL creature design (reference for details, colors, proportions)
2. The PREVIOUS animation frame (frame ${i})

Draw the NEXT frame. Here is what should change:
${frameDescriptions[i]}

IMPORTANT:
- Output a single image of just this one creature. Not a grid. Not multiple creatures.
- Keep the SAME art style, colors, and details as the original
- The creature should be the SAME SIZE in the frame as the previous frame (don't shrink or grow the overall image)
- Only the POSE changes — the breathing motion described above
- Solid magenta (#FF00FF) background`;
      images = [imageBase64, prevFrameBase64];
    }

    const start = Date.now();
    const result = await callGemini(MODEL, prompt, images);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (result) {
      const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-seq-frame${i + 1}.png`);
      fs.writeFileSync(outPath, result);
      console.log(`    Saved: ${outPath} (${(result.length / 1024).toFixed(0)} KB) in ${elapsed}s`);
      frames.push(outPath);
      prevFrameBase64 = result.toString('base64');
    } else {
      console.log(`    FAILED - no image returned for frame ${i + 1}`);
      break;
    }
  }

  return frames;
}

async function main() {
  console.log(`Creature: ${CREATURE_ID}`);
  console.log(`Model: ${MODEL}`);

  const sheetPath = await testExplicitSpriteSheet();
  const seqFrames = await testSequentialFrames();

  console.log('\n========== SUMMARY ==========');
  console.log(`Sprite sheet: ${sheetPath || 'FAILED'}`);
  console.log(`Sequential frames: ${seqFrames.length} frames generated`);
}

main().catch(console.error);
