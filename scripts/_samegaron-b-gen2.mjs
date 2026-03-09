#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

const projectRoot = '/Users/michia/Documents/jrpg';
const apiKey = (await readFile(resolve(projectRoot, 'data/.creature-forge-gemini-key'), 'utf8')).trim();

const refDir = resolve(projectRoot, 'data/creature-forge-style-refs');
const files = (await readDir(refDir)).sort();
const styleRefs = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (!['.png','.jpg','.jpeg','.webp'].includes(ext)) continue;
  const data = await readFile(resolve(refDir, f));
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  styleRefs.push({ inlineData: { mimeType: mime, data: data.toString('base64') } });
}
console.log(`Loaded ${styleRefs.length} style refs`);

const prompt = `Design a deep sea shark creature in the same art style as the reference images. Solid magenta (#FF00FF) background, no shadows, full body, front-facing idle pose, ready for animation.`;

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

for (let i = 1; i <= 3; i++) {
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [...styleRefs, { text: prompt }] }],
      generationConfig: { responseModalities: ['image', 'text'] },
    });
    const imagePart = result.response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart) { console.log(`b${i}: no image`); continue; }
    const buf = Buffer.from(imagePart.inlineData.data, 'base64');
    await writeFile(`/tmp/creature-forge-samegaron-b${i}.png`, buf);
    console.log(`b${i}: ok (${buf.length} bytes)`);
  } catch (e) {
    console.log(`b${i}: error - ${e.message}`);
  }
}

async function readDir(dir) { return readdir(dir); }
