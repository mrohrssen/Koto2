#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';

const [,, inputPath, outputPath, ...promptWords] = process.argv;
if (!inputPath || !outputPath || !promptWords.length) {
  console.error('Usage: node _edit-creature.mjs <input.png> <output.png> <edit prompt...>');
  process.exit(1);
}

const prompt = promptWords.join(' ');
const apiKey = (await readFile('/Users/michia/Documents/jrpg/data/.creature-forge-gemini-key', 'utf-8')).trim();
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

const imageData = await readFile(inputPath);
const base64 = imageData.toString('base64');

const result = await model.generateContent({
  contents: [{
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/png', data: base64 } },
      { text: prompt }
    ]
  }],
  generationConfig: { responseModalities: ['image', 'text'] }
});

const parts = result.response.candidates?.[0]?.content?.parts;
const imagePart = parts?.find(p => p.inlineData);
if (!imagePart) {
  const textPart = parts?.find(p => p.text);
  console.error('No image returned:', textPart?.text || 'unknown error');
  process.exit(1);
}

const buf = Buffer.from(imagePart.inlineData.data, 'base64');
await writeFile(outputPath, buf);
console.log(`Saved: ${buf.length} bytes → ${outputPath}`);
