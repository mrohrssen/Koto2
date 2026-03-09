#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = 'AIzaSyBtNj9HZDnH_-574DBTKfKv9_EiGbZlm6E';

const airplanePrompts = [
  // PRO (1-5)
  `Anime creature collector style, cel-shaded. A living airplane creature — a recognizable passenger airplane with expressive anime eyes on the cockpit windows, tiny wing-arms, and a cheerful mouth on the nose. Still clearly an airplane silhouette. White background, full body, front-facing idle pose. No text.`,

  `Pokemon creature design. An airplane monster — unmistakably a commercial jet airplane but alive. Big cute eyes where the cockpit windows are, the fuselage has a subtle face, wings slightly angled like arms. Jet engines glow faintly. Clean, simple, Ken Sugimori style. White background, full body. No text.`,

  `Chibi kawaii mascot style. An adorable tiny airplane creature — a round, chubby passenger jet with blushing cheeks, sparkly eyes on the cockpit, stubby little landing gear feet. Still obviously an airplane shape. Pastel colors. White background, full body. No text.`,

  `Japanese yokai tsukumogami style. A 100-year-old airplane spirit — an old propeller plane that has come alive as a tsukumogami. Ghostly wisps trail from its wings, ancient eyes on the cockpit, propeller spins lazily. Still clearly a vintage airplane. Ink wash aesthetic. White background, full body. No text.`,

  `Fantasy RPG creature art. A majestic airplane creature — a large commercial airplane with dragon-like eyes on the cockpit, faintly glowing engine nacelles, vapor trail streaming behind like a tail. The airplane shape is unmistakable and dominant. White background, full body, side-front 3/4 view. No text.`,

  // FLASH (6-10)
  `Anime creature collector style, cel-shaded lighting, expressive eyes. A living commercial airplane creature for a Japanese vocabulary RPG. The creature IS a passenger airplane — same silhouette, same wings, same tail fin — but with cute expressive eyes on the cockpit windows, a subtle smile on the nose cone, and landing gear that acts like little feet. It must be immediately recognizable as an airplane. Solid white (#FFFFFF) background, full body, front-facing idle pose. No text.`,

  `Cute monster illustration. A baby airplane creature hatching from a cloud. It's a small cartoon passenger jet with big round eyes on the cockpit, tiny wings, and a happy expression. The body is clearly airplane-shaped — tube fuselage, swept wings, tail fin. Soft colors, adorable. White background, full body. No text.`,

  `Digimon digital monster style. A sentient airplane — a sleek jet aircraft with cybernetic enhancements, glowing circuitry along the fuselage, sharp determined eyes on the cockpit. Still unmistakably an airplane in shape. Angular sci-fi anime aesthetic. White background, full body. No text.`,

  `Studio Ghibli soft fantasy style. A gentle old airplane spirit — a vintage propeller airplane with a warm, kind face on its nose, patched-up wings showing years of adventure, little birds nesting on its tail. Clearly still an airplane. Warm nostalgic colors. White background, full body. No text.`,

  `Anime game creature, clean cel-shaded art. An ANCIENT airplane creature — a weathered passenger jet covered in moss and vine patterns, ancient runes glowing along the fuselage, wise old eyes on the cockpit. Wings spread wide. The airplane silhouette is completely preserved. Earthy greens and metallic grays. Solid white background, full body, front-facing. No text.`,
];

const blackboardPrompts = [
  // PRO (1-5)
  `Anime creature collector style, cel-shaded. A living blackboard ghost — a floating green chalkboard with a spooky but cute ghostly face drawn in chalk on its surface, chalk dust wisping off like spirit energy, an eraser hovering beside it. Still clearly a rectangular classroom blackboard. White background, full body. No text.`,

  `Pokemon creature design. A blackboard phantom — a classroom chalkboard standing upright on ghostly legs. Its green slate surface has glowing chalk eyes and a wavering mouth. Chalk equations float around it like an aura. Unmistakably a school blackboard shape. Ken Sugimori style. White background, full body. No text.`,

  `Chibi kawaii mascot style. An adorable blackboard spirit — a cute small green chalkboard with blushing cheeks drawn in pink chalk, big sparkly chalk eyes, tiny wooden frame arms. Chalk dust sparkles around it. Obviously still a blackboard. Pastel spooky colors. White background, full body. No text.`,

  `Japanese yokai tsukumogami style. A blackboard tsukumogami — an ancient classroom chalkboard spirit. The chalk on its surface has come alive, forming a ghostly yokai face. Old chalk equations swirl around it like possessed writing. Wooden frame is cracked with age. Ink wash painting aesthetic. White background, full body. No text.`,

  `Fantasy RPG creature art. A blackboard specter — a large classroom chalkboard floating upright, radiating ghostly green-white energy. Chalk symbols orbit it, an ethereal face manifests on the slate surface, the wooden frame glows with runes. Clearly a blackboard in shape. White background, full body. No text.`,

  // FLASH (6-10)
  `Anime creature collector style, cel-shaded lighting, expressive eyes. A blackboard ghost creature for a Japanese vocabulary RPG. The creature IS a classroom green chalkboard — rectangular, wooden frame, chalk tray at the bottom — but haunted and alive. A cute ghostly face appears in chalk on its surface, chalk dust floats around it like ectoplasm, and the eraser moves on its own. Must be immediately recognizable as a classroom blackboard. Solid white (#FFFFFF) background, full body, front-facing. No text.`,

  `Cute Halloween monster style. A haunted school blackboard creature — a green chalkboard floating slightly off the ground with ghostly wisps. Cute spooky chalk eyes and a wobbly smile drawn on its surface. Old math equations appear and disappear. Chalk pieces orbit it. Spooky but adorable. White background, full body. No text.`,

  `Digimon digital monster style. A digital blackboard entity — a school chalkboard with cybernetic frame, holographic chalk writing that glows, sharp digital eyes rendered on its surface. Data streams flow from the chalk tray. Still shaped like a classroom blackboard. Sci-fi anime. White background, full body. No text.`,

  `Studio Ghibli soft fantasy style. A gentle blackboard spirit — an old classroom chalkboard with a warm, friendly chalk-drawn face, little chalk birds flying off its surface, chalk flowers blooming in the corners. Wooden frame weathered with love. Clearly a blackboard. Warm colors. White background, full body. No text.`,

  `Anime game creature, clean cel-shaded art. An ANCIENT blackboard creature — a very old classroom chalkboard, wooden frame overgrown with mystical vines, ancient kanji glowing on the slate surface forming a wise ghostly face, chalk dust shimmering with magic. The blackboard shape is completely preserved. Dark green and gold tones. Solid white background, full body, front-facing. No text.`,
];

const AIRPLANE_NAMES = [
  '01-anime-collector-PRO', '02-pokemon-PRO', '03-chibi-PRO',
  '04-yokai-PRO', '05-fantasy-rpg-PRO',
  '06-anime-game-FLASH', '07-baby-cloud-FLASH', '08-digimon-FLASH',
  '09-ghibli-FLASH', '10-ancient-FLASH',
];

const BLACKBOARD_NAMES = [
  '01-anime-collector-PRO', '02-pokemon-PRO', '03-chibi-PRO',
  '04-yokai-PRO', '05-fantasy-rpg-PRO',
  '06-anime-game-FLASH', '07-halloween-FLASH', '08-digimon-FLASH',
  '09-ghibli-FLASH', '10-ancient-FLASH',
];

async function generateOne(model, prompt, outPath, label) {
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['image', 'text'] },
    });
    const parts = result.response.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find(p => p.inlineData);
    if (!imagePart) {
      const textPart = parts?.find(p => p.text);
      throw new Error(`No image: ${(textPart?.text || 'unknown').slice(0, 80)}`);
    }
    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    await writeFile(outPath, buffer);
    console.log(`  ✓ ${label}`);
    return 'ok';
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message.slice(0, 120)}`);
    return 'failed';
  }
}

async function main() {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const pro = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });
  const flash = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  console.log('=== AIRPLANE CREATURES (10) ===\n');
  for (let i = 0; i < 10; i++) {
    const model = i < 5 ? pro : flash;
    const name = AIRPLANE_NAMES[i];
    const outPath = `/tmp/airplane-${name}.png`;
    await generateOne(model, airplanePrompts[i], outPath, name);
    // Rate limit pause
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n=== BLACKBOARD CREATURES (10) ===\n');
  for (let i = 0; i < 10; i++) {
    const model = i < 5 ? pro : flash;
    const name = BLACKBOARD_NAMES[i];
    const outPath = `/tmp/blackboard-${name}.png`;
    await generateOne(model, blackboardPrompts[i], outPath, name);
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\nBuilding review pages...');

  // Airplane HTML
  let html = `<!DOCTYPE html><html><head><title>Airplane Monster Bakeoff</title>
<style>
  body { background: #1a1a2e; color: #eee; font-family: system-ui; padding: 20px; }
  h1 { text-align: center; color: #e94560; }
  p.sub { text-align: center; opacity: 0.7; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
  .card { background: #16213e; border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: white; }
  .card .label { padding: 12px; text-align: center; font-weight: bold; font-size: 14px; }
</style></head><body>
<h1>飛行機 (hikōki) — Airplane Monster Bakeoff</h1>
<p class="sub">Must be obviously an airplane! 10 style variants • PRO (1-5) vs FLASH (6-10)</p>
<div class="grid">`;
  for (const name of AIRPLANE_NAMES) {
    html += `<div class="card"><img src="airplane-${name}.png"><div class="label">${name}</div></div>`;
  }
  html += `</div></body></html>`;
  await writeFile('/tmp/airplane-review.html', html);

  // Blackboard HTML
  html = `<!DOCTYPE html><html><head><title>Blackboard Ghost Bakeoff</title>
<style>
  body { background: #1a1a2e; color: #eee; font-family: system-ui; padding: 20px; }
  h1 { text-align: center; color: #e94560; }
  p.sub { text-align: center; opacity: 0.7; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
  .card { background: #16213e; border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: white; }
  .card .label { padding: 12px; text-align: center; font-weight: bold; font-size: 14px; }
</style></head><body>
<h1>黒板 (kokuban) — Blackboard Ghost Bakeoff</h1>
<p class="sub">Must be obviously a blackboard! 10 style variants • PRO (1-5) vs FLASH (6-10)</p>
<div class="grid">`;
  for (const name of BLACKBOARD_NAMES) {
    html += `<div class="card"><img src="blackboard-${name}.png"><div class="label">${name}</div></div>`;
  }
  html += `</div></body></html>`;
  await writeFile('/tmp/blackboard-review.html', html);

  console.log('Review pages:');
  console.log('  Airplane:   /tmp/airplane-review.html');
  console.log('  Blackboard: /tmp/blackboard-review.html');
}

main();
