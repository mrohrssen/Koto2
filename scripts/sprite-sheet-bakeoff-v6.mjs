#!/usr/bin/env node
// Bakeoff v6: Stricter prompts + QA pass
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output/v6';
const GEN_MODEL = 'gemini-3-pro-image-preview';
const QA_MODEL = 'gemini-2.5-flash'; // text-only, fast, cheap for QA

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const originalBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

async function callGemini(model, prompt, images, wantImage = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: 'image/png', data: img } });
  }

  const config = wantImage
    ? { responseModalities: ['IMAGE', 'TEXT'] }
    : {};

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) {
      console.log(`    Retry ${attempt}/3 in ${10*attempt}s...`);
      await new Promise(r => setTimeout(r, 10000 * attempt));
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: config })
    });

    if (resp.status === 503 || resp.status === 429) continue;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);

    const data = await resp.json();
    const result = { image: null, text: '' };
    for (const c of data.candidates || []) {
      for (const p of c.content?.parts || []) {
        if (p.inlineData) result.image = Buffer.from(p.inlineData.data, 'base64');
        if (p.text) result.text += p.text;
      }
    }
    return result;
  }
  throw new Error('Failed after retries');
}

function buildStrictPrompt(frameNum, poseDesc) {
  return `You are an expert pixel art animator creating frame ${frameNum} of an 8-frame idle breathing animation for a 2D RPG creature.

I'm providing the ORIGINAL creature sprite (the neutral resting pose). Your task is to redraw this creature with ONLY the described pose change — everything else must be PIXEL-PERFECT identical.

POSE CHANGE FOR THIS FRAME:
${poseDesc}

ABSOLUTE CONSISTENCY REQUIREMENTS — VIOLATIONS WILL BE REJECTED:
1. Do NOT add any new visual elements that aren't in the original (no new shell pieces, no new markings, no new features)
2. Do NOT remove any visual elements that are in the original
3. Do NOT change the number, shape, or position of: shell segments, cracks, horns, claws, toes, eyes, or any other anatomical detail
4. Do NOT change colors, shading style, or line quality
5. The ONLY acceptable difference is the described vertical expansion/compression of the body
6. Think of this as if you physically stretched or compressed a rubber version of the original image — the details warp with the body, they don't change

TECHNICAL REQUIREMENTS:
- ONE creature on solid magenta (#FF00FF) background
- Same framing and creature size as the original
- NOT a grid or sprite sheet — single creature only

Before generating, mentally overlay your output with the original. If ANY detail differs (beyond the pose change), fix it.`;
}

async function qaCheck(originalB64, frameB64, frameName) {
  const prompt = `You are a QA checker for sprite animation frames. I'm showing you two images:

IMAGE 1: The ORIGINAL creature sprite (reference)
IMAGE 2: A generated animation frame that should show the SAME creature in a slightly different breathing pose

Your job: Compare the two images and identify ANY differences besides the expected breathing pose change (slight vertical expansion or compression).

Look specifically for:
- New features that appear in image 2 but NOT in image 1 (e.g., new shell segments, new markings, extra claws)
- Missing features from image 1 that are absent in image 2
- Changed colors or patterns
- Different number of body parts (claws, shell pieces, horns, etc.)

Respond in this EXACT format:
PASS or FAIL
If FAIL, list each specific issue on its own line starting with "- "

Example PASS response:
PASS

Example FAIL response:
FAIL
- New shell piece appeared under the neck that isn't in the original
- Left horn is slightly thicker than the original`;

  const result = await callGemini(QA_MODEL, prompt, [originalB64, frameB64], false);
  return result.text.trim();
}

const FRAMES = [
  { name: '02-inhale-start', pose: 'VERY SLIGHT inhale. Body is about 2% taller than neutral. Head tilted up a tiny fraction. The most subtle change from neutral — barely perceptible.' },
  { name: '03-inhale-quarter', pose: 'Quarter inhale. Body is about 3-4% taller. Chest starting to puff slightly. Head tilting up a bit more.' },
  { name: '04-inhale-half', pose: 'Half inhale. Body is about 5% taller. Chest noticeably puffed. Head tilted up.' },
  { name: '05-inhale-full', pose: 'FULL INHALE — peak of breathing cycle. Body about 7% taller. Maximum chest puff. Head raised. Legs slightly compressed under the weight.' },
  { name: '06-exhale-half', pose: 'Half exhale, coming back down. Body about 3% taller than neutral — halfway between full inhale and resting.' },
  { name: '07-exhale-full', pose: 'FULL EXHALE — bottom of cycle. Body about 3% SHORTER than neutral. Slightly squished/compressed. Head dipped below resting position.' },
  { name: '08-returning', pose: 'Almost back to neutral. Body about 1% shorter than neutral — barely perceptible. Must look NEARLY IDENTICAL to the neutral pose for seamless loop.' },
];

async function main() {
  console.log(`Strict 8-frame gen + QA: ${CREATURE_ID}`);
  console.log(`Gen model: ${GEN_MODEL}`);
  console.log(`QA model: ${QA_MODEL}\n`);

  const MAX_ATTEMPTS = 3;

  for (const frame of FRAMES) {
    const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-${frame.name}.png`);
    const qaPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-${frame.name}.qa.txt`);

    console.log(`\n[${frame.name}]`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}...`);

      // Generate
      const prompt = buildStrictPrompt(frame.name.split('-')[0], frame.pose);
      const start = Date.now();
      const genResult = await callGemini(GEN_MODEL, prompt, [originalBase64], true);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (!genResult.image) {
        console.log(`  Generation failed, no image returned`);
        continue;
      }

      fs.writeFileSync(outPath, genResult.image);
      console.log(`  Generated (${(genResult.image.length/1024).toFixed(0)} KB) in ${elapsed}s`);

      // QA check
      console.log(`  Running QA check...`);
      const qaResult = await qaCheck(originalBase64, genResult.image.toString('base64'), frame.name);
      fs.writeFileSync(qaPath, qaResult);

      if (qaResult.startsWith('PASS')) {
        console.log(`  QA: PASS ✓`);
        break;
      } else {
        console.log(`  QA: FAIL`);
        console.log(`  ${qaResult.split('\n').slice(1).map(l => '  ' + l).join('\n')}`);
        if (attempt < MAX_ATTEMPTS) {
          console.log(`  Requeuing...`);
        } else {
          console.log(`  Max attempts reached, keeping best result`);
        }
      }
    }
  }

  console.log('\n\nDone! Results in:', OUTPUT_DIR);
}

main().catch(console.error);
