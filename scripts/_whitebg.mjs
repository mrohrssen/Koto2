import fs from 'fs';

const imgB64 = fs.readFileSync('data/creature-staging-images/kamedor.png').toString('base64');
const apiKey = fs.readFileSync('data/.creature-forge-gemini-key', 'utf8').trim();

const payload = {
  contents: [{
    parts: [
      { inlineData: { mimeType: 'image/png', data: imgB64 } },
      { text: 'Return this exact image back to me with the background changed to perfect white (#FFFFFF). Do not alter the creature pixels in any way — only replace the background with solid white. Keep the same resolution and aspect ratio.' }
    ]
  }],
  generationConfig: { responseModalities: ['image', 'text'] }
};

console.log('Sending to Gemini 2.5 Flash...');
const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
  body: JSON.stringify(payload),
});

const result = await resp.json();
const parts = result.candidates?.[0]?.content?.parts || [];

for (const part of parts) {
  if (part.inlineData) {
    const buf = Buffer.from(part.inlineData.data, 'base64');
    const ext = part.inlineData.mimeType?.includes('png') ? 'png' : 'jpg';
    const outPath = `output/animated-sprites/kamedor/kamedor-whitebg.${ext}`;
    fs.writeFileSync(outPath, buf);
    console.log(`Saved: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
  }
  if (part.text) console.log('Gemini:', part.text.slice(0, 300));
}

if (!parts.length) {
  console.log('No parts in response:', JSON.stringify(result).slice(0, 500));
}
