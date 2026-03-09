#!/usr/bin/env node
// Bakeoff: test Gemini models for sprite sheet generation from a creature image
import fs from 'fs';
import path from 'path';

const API_KEY = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();
const CREATURE_ID = process.argv[2] || 'kamedor';
const IMAGE_PATH = `data/creature-staging-images/${CREATURE_ID}.png`;
const OUTPUT_DIR = 'bakeoff-output';

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`Image not found: ${IMAGE_PATH}`);
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const imageBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');

const MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
];

const PROMPT = `You are a professional pixel art animator. I'm giving you a creature sprite for a 2D RPG game.

Generate a sprite sheet showing this exact creature in 8 frames of an idle breathing animation loop.

Requirements:
- Layout: 4 columns x 2 rows grid, each cell the same size
- Frame 1 (top-left): The creature in its neutral resting pose (match the input image exactly)
- Frames 2-7: Gradual subtle breathing motion — slight body expansion on inhale, contraction on exhale
- Frame 8 (bottom-right): Nearly identical to frame 1 so the animation loops seamlessly
- Every frame must show the SAME creature with consistent colors, proportions, and details
- Solid magenta (#FF00FF) background behind the creature in every frame
- Each frame should have the creature centered in its cell
- The motion should be subtle and natural — this is a gentle idle animation, not an action pose
- Maintain the exact art style, color palette, and level of detail from the input image`;

async function generateSpriteSheet(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        {
          inline_data: {
            mime_type: 'image/png',
            data: imageBase64
          }
        }
      ]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  };

  console.log(`\n=== Testing ${model} ===`);
  console.log(`Sending request...`);

  const start = Date.now();

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`HTTP ${resp.status}: ${errText.slice(0, 500)}`);
      return null;
    }

    const data = await resp.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Response received in ${elapsed}s`);

    // Extract image from response
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          const imgData = part.inlineData.data;
          const mimeType = part.inlineData.mimeType;
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const outPath = path.join(OUTPUT_DIR, `${CREATURE_ID}-spritesheet-${model.replace(/[^a-z0-9]/g, '-')}.${ext}`);
          fs.writeFileSync(outPath, Buffer.from(imgData, 'base64'));
          console.log(`Saved: ${outPath} (${(Buffer.from(imgData, 'base64').length / 1024).toFixed(0)} KB)`);
          return outPath;
        }
        if (part.text) {
          console.log(`Model text: ${part.text.slice(0, 200)}`);
        }
      }
    }

    console.error('No image in response');
    console.log('Full response structure:', JSON.stringify(data, null, 2).slice(0, 1000));
    return null;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`Creature: ${CREATURE_ID}`);
  console.log(`Image: ${IMAGE_PATH}`);
  console.log(`Models: ${MODELS.join(', ')}`);

  const results = [];

  for (const model of MODELS) {
    const outPath = await generateSpriteSheet(model);
    results.push({ model, outPath });
  }

  console.log('\n=== Results ===');
  for (const { model, outPath } of results) {
    console.log(`${model}: ${outPath || 'FAILED'}`);
  }
}

main().catch(console.error);
