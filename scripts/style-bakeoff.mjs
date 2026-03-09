#!/usr/bin/env node
/**
 * Style Bakeoff — Redraw a creature sprite in famous art styles using Gemini 3.1 Flash.
 *
 * Usage:
 *   node scripts/style-bakeoff.mjs [creature] [--styles style1,style2,...]
 *
 * Examples:
 *   node scripts/style-bakeoff.mjs hebiveil
 *   node scripts/style-bakeoff.mjs hebiveil --styles "Akira Toriyama,Ghibli"
 *   node scripts/style-bakeoff.mjs hebiveil --styles all
 *
 * API key read from data/.creature-forge-gemini-key
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const STYLES = [
  {
    name: 'Akira Toriyama (Dragon Ball / Chrono Trigger)',
    prompt: `Completely reimagine this creature as if Akira Toriyama himself designed it for Dragon Ball or Chrono Trigger. Use his signature thick black outlines, bold flat cel-shading with hard shadow edges, exaggerated muscular or goofy proportions, and his trademark expressive beady eyes. Give it that iconic Toriyama personality — cheeky, confident, a little goofy. Use his bright saturated color palette. The creature should look like it stepped out of a Dragon Ball manga panel. Do NOT just copy the original design with slight changes — fully redesign it in Toriyama's visual language.`
  },
  {
    name: 'Studio Ghibli (Hayao Miyazaki)',
    prompt: `Completely reimagine this creature as if it appeared in a Studio Ghibli film by Hayao Miyazaki. Use soft watercolor-like rendering, gentle pastel tones, delicate thin linework, and Ghibli's signature warm naturalistic lighting. Give it a peaceful, wise, slightly mysterious forest-spirit personality — like a Kodama or small Totoro. The proportions should be round, soft, and huggable. Add environmental details like small flowers, moss, or dappled sunlight. It should feel like a gentle nature spirit you'd encounter in a Miyazaki forest. Do NOT keep the original art style at all — this should look hand-painted for a Ghibli film.`
  },
  {
    name: 'Pokémon Sleep',
    prompt: `Completely reimagine this creature in the Pokémon Sleep art style — extremely cute, round, simplified shapes with a sleepy/cozy vibe. Use the soft pastel color palette of Pokémon Sleep (dreamy lavenders, soft blues, warm creams). Give it closed or half-lidded drowsy eyes, a relaxed curled-up sleeping pose, maybe a tiny nightcap or pillow. Minimal detail, maximum cuteness. Smooth gradients, no harsh lines. It should look like an official Pokémon Sleep creature — adorable, marketable, something you'd see on pajamas. Do NOT preserve the original's complexity — simplify everything dramatically.`
  },
  {
    name: 'Genshin Impact',
    prompt: `Completely reimagine this creature in the Genshin Impact art style. Use the game's signature anime-meets-fantasy aesthetic: detailed cel-shading with colorful rim lighting, intricate ornamental details (elemental gems, flowing ribbons, glowing runes), and a dynamic action-ready pose. Give it Genshin's trademark glowing elemental effects (Dendro green particles, vine patterns). The design should be elaborate and ornate — like a creature you'd fight in Sumeru. Use Genshin's rich saturated colors with that characteristic blue-purple ambient glow. Make it look like official Genshin concept art, not a simple cartoon.`
  },
  {
    name: 'Dragon Quest Monsters',
    prompt: `Completely reimagine this creature as a Dragon Quest monster. Use Toriyama's DQ-specific style which is different from Dragon Ball — rounder, friendlier, more whimsical. Give it the classic DQ monster look: slightly dopey but charming expression, smooth rounded forms, bright primary colors, and that trademark DQ "approachable monster" personality (like a Slime or Dracky). Add DQ-specific design elements like a slightly cartoonish exaggerated feature. Clean bold outlines, simple flat shading. It should look like it belongs in the DQ monster compendium alongside Slimes and Drackies.`
  },
  {
    name: 'Final Fantasy (Yoshitaka Amano)',
    prompt: `Completely reimagine this creature in Yoshitaka Amano's iconic Final Fantasy illustration style. Use his signature wispy, ethereal ink brushwork with flowing organic lines that trail off into abstract swirls. The color palette should be moody and sophisticated — deep purples, midnight blues, gold accents, with splashes of vivid color. Give it an otherworldly, elegant, almost ghostly quality. The creature should look like a haunting watercolor/ink painting — delicate, ornate, and dreamlike. Add Amano's characteristic flowing decorative elements, long trailing tendrils or fins. This should look NOTHING like a cartoon — it should look like fine art illustration.`
  },
];

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'tmp', 'style-bakeoff');

async function main() {
  const keyPath = path.join(ROOT, 'data', '.creature-forge-gemini-key');
  const apiKey = (await readFile(keyPath, 'utf-8')).trim();
  if (!apiKey) {
    console.error('ERROR: No API key in', keyPath);
    process.exit(1);
  }

  // Parse args
  const args = process.argv.slice(2);
  const creature = args.find(a => !a.startsWith('--')) || 'hebiveil';
  const stylesFlag = args.find(a => a.startsWith('--styles='))?.split('=')[1]
    || (args.includes('--styles') ? args[args.indexOf('--styles') + 1] : null);

  let styles = STYLES;
  if (stylesFlag && stylesFlag !== 'all') {
    const names = stylesFlag.split(',').map(s => s.trim().toLowerCase());
    styles = STYLES.filter(s => names.some(n => s.name.toLowerCase().includes(n)));
    if (styles.length === 0) {
      console.error('No matching styles. Available:', STYLES.map(s => s.name).join(', '));
      process.exit(1);
    }
  }

  // Find creature sprite
  const spritePath = path.join(ROOT, 'public/assets/sprites/creatures', `${creature}.webp`);
  if (!fs.existsSync(spritePath)) {
    console.error(`ERROR: Sprite not found: ${spritePath}`);
    console.error('Available creatures:');
    const files = fs.readdirSync(path.join(ROOT, 'public/assets/sprites/creatures'))
      .filter(f => f.endsWith('.webp') && !f.includes('-idle'))
      .map(f => f.replace('.webp', ''))
      .sort();
    console.error(files.join(', '));
    process.exit(1);
  }

  // Read sprite as base64
  const imageData = fs.readFileSync(spritePath);
  const base64Image = imageData.toString('base64');

  // Setup output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Init Gemini
  const ai = new GoogleGenAI({ apiKey });

  console.log(`\n🎨 Style Bakeoff: ${creature}`);
  console.log(`   Sprite: ${spritePath}`);
  console.log(`   Styles: ${styles.length}`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  for (const style of styles) {
    const slug = style.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const outputFile = path.join(OUTPUT_DIR, `${creature}-${slug}.png`);

    const prompt = `${style.prompt}\n\nUse this image as the source creature to redesign. Put the final result on a plain white background.`;

    console.log(`⏳ ${style.name}...`);
    console.log(`   Prompt: "${prompt.slice(0, 120)}..."\n`);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/webp',
                  data: base64Image,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      let saved = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(`   Gemini says: ${part.text.slice(0, 200)}`);
        }
        if (part.inlineData) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(outputFile, buffer);
          console.log(`   ✅ Saved: ${outputFile} (${(buffer.length / 1024).toFixed(0)} KB)`);
          saved = true;
        }
      }

      if (!saved) {
        console.log(`   ⚠️  No image returned for this style`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }

    console.log();
  }

  console.log(`\nDone! Results in ${OUTPUT_DIR}`);
}

main();
