# Sprite Forge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Sprites" tab to the Forge dashboard for bulk image generation, review, and approval across all sprite types (items, moves, creatures, bosses, backgrounds, NPCs).

**Architecture:** New Express router (`src/routes/sprite-forge.js`) handles API endpoints for scanning missing sprites, dispatching generation jobs (Gemini Flash for items/moves/creatures, ComfyUI SDXL for bosses/backgrounds/NPCs), and approving results. Job state is held in memory with variant files staged in `data/sprite-staging/`. The UI is added as a new tab section in `forge.html`.

**Tech Stack:** Express, `@google/generative-ai` (Gemini Flash), ComfyUI REST API (SDXL + RMBG-2.0), sharp (image slicing), PIL-equivalent via sharp for grid slicing on the server.

---

### Task 1: Sprite Forge Router — Missing Sprites Scanner

**Files:**
- Create: `src/routes/sprite-forge.js`
- Modify: `server.js:715-718` (mount the new router)

**Step 1: Write the failing test**

Create: `tests/unit/sprite-forge-missing.test.js`

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSpritForgeRouter } from '../../src/routes/sprite-forge.js';

describe('GET /missing', () => {
  it('should be importable', () => {
    assert.equal(typeof createSpritForgeRouter, 'function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/unit/sprite-forge-missing.test.js`
Expected: FAIL — module not found

**Step 3: Create the sprite-forge router with GET /missing endpoint**

```js
// src/routes/sprite-forge.js
import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SPRITE_TYPES = {
  creature: {
    dataFiles: ['creatures.json', 'new-creatures-staging.json'],
    spriteDir: 'public/assets/sprites/creatures',
    spriteExt: '.webp',
    idField: 'id',
  },
  item: {
    dataFiles: ['items.json', 'new-items-staging.json'],
    spriteDir: 'public/assets/sprites/items',
    spriteExt: '.webp',
    idField: 'id',
  },
  move: {
    dataFiles: ['moves.json'],
    spriteDir: 'public/assets/sprites/actions',
    spriteExt: '.webp',
    idField: 'nameEn',
    slugify: name => name.toLowerCase().replace(/ /g, '-'),
  },
  boss: {
    dataFiles: [],  // bosses don't have a separate JSON yet
    spriteDir: 'public/assets/sprites/bosses',
    spriteExt: '.webp',
    idField: 'id',
  },
  npc: {
    dataFiles: ['new-npcs-staging.json'],
    spriteDir: 'public/assets/sprites/npcs',
    spriteExt: '.webp',
    idField: 'id',
  },
  background: {
    dataFiles: ['areas.json', 'new-areas-staging.json'],
    spriteDir: 'public/assets/backgrounds/areas',
    spriteExt: '.webp',
    idField: 'id',
  },
};

export function createSpriteForgeRouter({ projectRoot }) {
  const router = Router();
  const dataDir = join(projectRoot, 'data');

  // GET /missing — scan all types for entries missing sprites
  router.get('/missing', (_req, res) => {
    try {
      const result = {};

      for (const [type, config] of Object.entries(SPRITE_TYPES)) {
        // Load all entries from data files
        const entries = [];
        for (const file of config.dataFiles) {
          const filePath = join(dataDir, file);
          if (!existsSync(filePath)) continue;
          try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            const arr = Array.isArray(data) ? data : [];
            for (const entry of arr) {
              const slug = config.slugify
                ? config.slugify(entry[config.idField])
                : entry[config.idField];
              if (slug) {
                entries.push({
                  id: slug,
                  name: entry.name || entry.word || slug,
                  nameEn: entry.nameEn || entry.meaning || slug,
                  source: file,
                  description: entry.description || '',
                });
              }
            }
          } catch { /* skip bad files */ }
        }

        // Check which have sprites
        const spriteDir = join(projectRoot, config.spriteDir);
        const existingSprites = new Set();
        if (existsSync(spriteDir)) {
          for (const f of readdirSync(spriteDir)) {
            if (f.endsWith(config.spriteExt)) {
              existingSprites.add(f.replace(config.spriteExt, '').replace('-idle', ''));
            }
          }
        }

        const missing = entries.filter(e => !existingSprites.has(e.id));
        const existing = entries.filter(e => existingSprites.has(e.id));

        result[type] = {
          total: entries.length,
          missing: missing.length,
          existing: existing.length,
          items: missing,
        };
      }

      res.json(result);
    } catch (error) {
      console.error('[SpriteForge] Error scanning:', error);
      res.status(500).json({ error: 'Failed to scan for missing sprites' });
    }
  });

  return router;
}
```

**Step 4: Mount in server.js**

Add after the forge router mount (~line 718):

```js
import { createSpriteForgeRouter } from './src/routes/sprite-forge.js';

// ... after forge mount ...
app.use('/api/sprite-forge', createSpriteForgeRouter({
  projectRoot: __dirname
}));
```

**Step 5: Run test to verify it passes**

Run: `node --test tests/unit/sprite-forge-missing.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/routes/sprite-forge.js server.js tests/unit/sprite-forge-missing.test.js
git commit -m "feat: add sprite-forge router with missing sprites scanner"
```

---

### Task 2: Gemini Image Generation Endpoint (Items, Moves, Creatures)

**Files:**
- Modify: `src/routes/sprite-forge.js`

**Step 1: Add in-memory job store and POST /generate endpoint**

The endpoint accepts a list of items to generate, creates jobs, and kicks off async generation. Jobs track status through stages: `queued → generating → slicing → rmbg → done` (or `error`).

```js
// Add to sprite-forge.js

import { mkdir, readFile, writeFile, readdir } from 'fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

// In-memory job store
const jobs = new Map();

// POST /generate — queue generation jobs
router.post('/generate', async (req, res) => {
  const { items } = req.body;
  // items: [{ id, type, name, nameEn, description, variants, notes }]
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing items array' });
  }

  const created = [];
  for (const item of items) {
    const jobId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id: jobId,
      type: item.type,       // creature, item, move, boss, npc, background
      itemId: item.id,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description || '',
      notes: item.notes || '',
      variants: item.variants || 1,
      status: 'queued',
      stage: 'queued',
      variantResults: [],
      error: null,
      createdAt: new Date().toISOString(),
    };
    jobs.set(jobId, job);
    created.push(job);

    // Fire and forget — run generation async
    runGenerationPipeline(job, projectRoot).catch(err => {
      job.status = 'error';
      job.stage = 'error';
      job.error = err.message;
    });
  }

  res.json({ success: true, jobs: created });
});
```

**Step 2: Implement Gemini generation pipeline function**

```js
async function runGenerationPipeline(job, projectRoot) {
  const stagingDir = join(projectRoot, 'data', 'sprite-staging', job.type, job.itemId);
  await mkdir(stagingDir, { recursive: true });

  job.status = 'running';
  job.stage = 'generating';

  const generator = GENERATORS[job.type];
  if (!generator) throw new Error(`No generator for type: ${job.type}`);

  await generator(job, stagingDir, projectRoot);
}

const GENERATORS = {
  item: generateGeminiGrid,
  move: generateGeminiGrid,
  creature: generateGeminiIndividual,
  boss: generateComfyUI,
  npc: generateComfyUI,
  background: generateComfyUI,
};
```

**Step 3: Implement Gemini grid generator (items/moves)**

```js
async function loadGeminiModel(projectRoot) {
  const keyPath = join(projectRoot, 'data', '.creature-forge-gemini-key');
  const apiKey = (await readFile(keyPath, 'utf-8')).trim();
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });
}

async function loadStyleRefs(projectRoot) {
  const dir = join(projectRoot, 'data', 'creature-forge-style-refs');
  const refs = [];
  try {
    const files = (await readdir(dir)).sort();
    for (const f of files) {
      const ext = f.split('.').pop().toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) continue;
      const data = await readFile(join(dir, f));
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      refs.push({ inlineData: { mimeType, data: data.toString('base64') } });
    }
  } catch { /* no refs */ }
  return refs;
}

async function generateGeminiGrid(job, stagingDir, projectRoot) {
  const model = await loadGeminiModel(projectRoot);
  const styleRefs = await loadStyleRefs(projectRoot);

  for (let v = 0; v < job.variants; v++) {
    job.stage = `generating variant ${v + 1}/${job.variants}`;

    const isMove = job.type === 'move';
    const prompt = isMove
      ? buildMovePrompt(job)
      : buildItemPrompt(job);

    try {
      const requestParts = [...styleRefs, { text: prompt }];
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const parts = result.response.candidates?.[0]?.content?.parts;
      const imagePart = parts?.find(p => p.inlineData);
      if (!imagePart) throw new Error('No image in response');

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const variantPath = join(stagingDir, `variant-${v}.png`);
      await writeFile(variantPath, buffer);

      // For single-item generation (not grid), skip slicing
      // For grid, we'd slice — but for sprite forge we generate one item at a time
      // on a magenta background, then RMBG

      job.stage = `rmbg variant ${v + 1}/${job.variants}`;
      const rmbgPath = join(stagingDir, `variant-${v}-rmbg.png`);
      const rmbgOk = await runRMBG(variantPath, rmbgPath, job.itemId, v);

      if (rmbgOk) {
        // Convert to webp
        const webpPath = join(stagingDir, `variant-${v}.webp`);
        await sharp(rmbgPath).webp({ quality: 90 }).toFile(webpPath);
        job.variantResults.push({
          variant: v,
          path: `variant-${v}.webp`,
          fullPath: webpPath,
        });
      } else {
        job.variantResults.push({
          variant: v,
          path: `variant-${v}.png`,
          fullPath: variantPath,
          rmbgFailed: true,
        });
      }
    } catch (err) {
      job.variantResults.push({
        variant: v,
        error: err.message,
      });
    }
  }

  job.status = job.variantResults.some(v => !v.error) ? 'done' : 'error';
  job.stage = job.status === 'done' ? 'done' : 'error';
}

function buildItemPrompt(job) {
  const extra = job.notes ? ` ${job.notes}` : '';
  return [
    'Use the same art style as the reference images — these are creature sprites from the same game.',
    '',
    `Draw a single cute Japanese food/drink item icon for a video game inventory on a solid magenta (#FF00FF) background.`,
    `The item is: ${job.nameEn || job.name}.${extra}`,
    `${job.description}`,
    '',
    'ART STYLE:',
    '- Fully opaque solid pixels, NO semi-transparent edges against background',
    '- Every pixel must be either pure solid magenta (#FF00FF) or fully opaque content',
    '- Hard crisp edges, no gradual fade-outs',
    '- No text, no labels, no numbers, no UI elements',
    '- Front-facing, centered, immediately recognizable',
    '- Designed to read well at 128×128 pixels',
  ].join('\n');
}

function buildMovePrompt(job) {
  const extra = job.notes ? ` ${job.notes}` : '';
  return [
    'Use the same art style as the reference images — these icons are for the same game.',
    '',
    `Draw a single small skill/vocabulary icon on a solid magenta (#FF00FF) background.`,
    `The skill is: ${job.nameEn || job.name}.${extra}`,
    `${job.description}`,
    '',
    'This is NOT a character or creature — it is a compact skill icon for an RPG.',
    'Think RPG ability button: simple, symbolic, easy to read at small sizes.',
    '',
    'ART STYLE:',
    '- Fully opaque solid pixels, NO semi-transparent edges against background',
    '- Every pixel must be either pure solid magenta (#FF00FF) or fully opaque content',
    '- Hard crisp edges, no gradual fade-outs',
    '- No text, no labels, no numbers, no UI elements',
    '- Front-facing, centered, compact design that reads well at 128×128 pixels',
  ].join('\n');
}
```

**Step 4: Implement creature generator (individual, not grid)**

```js
async function generateGeminiIndividual(job, stagingDir, projectRoot) {
  const model = await loadGeminiModel(projectRoot);
  const styleRefs = await loadStyleRefs(projectRoot);

  for (let v = 0; v < job.variants; v++) {
    job.stage = `generating variant ${v + 1}/${job.variants}`;

    const extra = job.notes ? ` ${job.notes}` : '';
    const prompt = [
      styleRefs.length > 0
        ? 'Design in the same art style as the reference images.'
        : 'Anime creature collector style — cel-shaded lighting, expressive eyes.',
      `${job.description}${extra}`,
      'Solid white (#FFFFFF) background, no shadows, no light glow, no transparent pixels,',
      'full body, front-facing idle pose, ready for animation. No text, no UI elements.',
    ].join(' ');

    try {
      const requestParts = [...styleRefs, { text: prompt }];
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });

      const parts = result.response.candidates?.[0]?.content?.parts;
      const imagePart = parts?.find(p => p.inlineData);
      if (!imagePart) throw new Error('No image in response');

      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const variantPath = join(stagingDir, `variant-${v}.png`);
      await writeFile(variantPath, buffer);

      job.stage = `rmbg variant ${v + 1}/${job.variants}`;
      const rmbgPath = join(stagingDir, `variant-${v}-rmbg.png`);
      const rmbgOk = await runRMBG(variantPath, rmbgPath, job.itemId, v);

      const webpPath = join(stagingDir, `variant-${v}.webp`);
      if (rmbgOk) {
        await sharp(rmbgPath).webp({ quality: 90 }).toFile(webpPath);
      } else {
        await sharp(variantPath).webp({ quality: 90 }).toFile(webpPath);
      }

      job.variantResults.push({
        variant: v,
        path: `variant-${v}.webp`,
        fullPath: webpPath,
        rmbgFailed: !rmbgOk,
      });
    } catch (err) {
      job.variantResults.push({ variant: v, error: err.message });
    }
  }

  job.status = job.variantResults.some(v => !v.error) ? 'done' : 'error';
  job.stage = job.status === 'done' ? 'done' : 'error';
}
```

**Step 5: Commit**

```bash
git add src/routes/sprite-forge.js
git commit -m "feat: add Gemini generation pipeline for items, moves, creatures"
```

---

### Task 3: ComfyUI Generation Pipeline (Bosses, NPCs, Backgrounds)

**Files:**
- Modify: `src/routes/sprite-forge.js`

**Step 1: Add ComfyUI helper functions**

```js
import http from 'http';

const COMFYUI_URL = 'http://127.0.0.1:8188';

function comfyFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, COMFYUI_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (options.raw) return resolve(body);
        try { resolve(JSON.parse(body.toString())); }
        catch { resolve(body.toString()); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ComfyUI timeout')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

async function comfyUploadImage(filePath) {
  const fileData = await readFile(filePath);
  const filename = filePath.split('/').pop();
  const boundary = '----SpriteForge' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return comfyFetch('/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

async function comfyQueueAndWait(workflow, timeoutMs = 180000) {
  const { prompt_id } = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const history = await comfyFetch(`/history/${prompt_id}`);
      if (history[prompt_id]) {
        const status = history[prompt_id]?.status?.status_str;
        if (status === 'error') throw new Error('ComfyUI workflow error');
        if (history[prompt_id].outputs) return history[prompt_id];
      }
    } catch (e) {
      if (e.message === 'ComfyUI workflow error') throw e;
    }
  }
  throw new Error('ComfyUI generation timed out');
}

async function comfyDownloadImage(history, nodeId) {
  const images = history.outputs?.[nodeId]?.images;
  if (!images || images.length === 0) throw new Error('No output images');

  const img = images[0];
  const params = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder || '',
    type: 'output',
  });

  return comfyFetch(`/view?${params}`, { raw: true });
}
```

**Step 2: Implement ComfyUI SDXL generator**

```js
async function generateComfyUI(job, stagingDir, projectRoot) {
  const isBackground = job.type === 'background';
  const width = isBackground ? 1536 : 1024;
  const height = 1024;

  const STYLE = 'solo, single character, anime character illustration, full body dynamic pose, white background, clean lines, anime game character style, vibrant saturated colors, colorful, warm lighting, game character art, high quality, sharp details';
  const BG_STYLE = 'anime game background art, bright vibrant colors, warm sunlight, detailed environment, game environment concept art, high quality';
  const NEGATIVE = 'dark, gritty, realistic, horror, scary, nude, nsfw, text, watermark, blurry, low quality, chibi, multiple characters, blood, monochrome, silhouette, grayscale, sketch';

  for (let v = 0; v < job.variants; v++) {
    job.stage = `generating variant ${v + 1}/${job.variants}`;

    const extra = job.notes ? ` ${job.notes}` : '';
    const prompt = isBackground
      ? `${BG_STYLE}, ${job.description}${extra}`
      : `${STYLE}, ${job.description}${extra}`;

    const seed = Math.floor(Math.random() * 999999999);

    const workflow = {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'waiIllustriousSDXL_v160.safetensors' },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: { text: prompt, clip: ['1', 1] },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: { text: NEGATIVE, clip: ['1', 1] },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: { width, height, batch_size: 1 },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed, steps: 30, cfg: 7.5,
          sampler_name: 'dpmpp_2m', scheduler: 'karras',
          denoise: 1.0,
          model: ['1', 0], positive: ['2', 0],
          negative: ['3', 0], latent_image: ['4', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: { samples: ['5', 0], vae: ['1', 2] },
      },
    };

    // Add RMBG for non-backgrounds
    if (!isBackground) {
      workflow['7'] = {
        class_type: 'RMBG',
        inputs: {
          image: ['6', 0], model: 'RMBG-2.0',
          sensitivity: 1.0, process_res: 1024,
          mask_blur: 0, mask_offset: 0,
          invert_output: false, background: 'Alpha',
        },
      };
      workflow['8'] = {
        class_type: 'SaveImage',
        inputs: {
          images: ['7', 0],
          filename_prefix: `sprite_forge/${job.itemId}_v${v}`,
        },
      };
    } else {
      workflow['8'] = {
        class_type: 'SaveImage',
        inputs: {
          images: ['6', 0],
          filename_prefix: `sprite_forge/${job.itemId}_v${v}`,
        },
      };
    }

    try {
      const history = await comfyQueueAndWait(workflow);
      const saveNodeId = '8';
      const imageBuffer = await comfyDownloadImage(history, saveNodeId);

      const variantPath = join(stagingDir, `variant-${v}.png`);
      await writeFile(variantPath, imageBuffer);

      const webpPath = join(stagingDir, `variant-${v}.webp`);
      await sharp(variantPath).webp({ quality: 90 }).toFile(webpPath);

      job.variantResults.push({
        variant: v,
        path: `variant-${v}.webp`,
        fullPath: webpPath,
      });
    } catch (err) {
      job.variantResults.push({ variant: v, error: err.message });
    }
  }

  job.status = job.variantResults.some(v => !v.error) ? 'done' : 'error';
  job.stage = job.status === 'done' ? 'done' : 'error';
}
```

**Step 3: Implement RMBG helper for Gemini sprites**

```js
async function runRMBG(inputPath, outputPath, itemId, variantIdx) {
  try {
    // Upload to ComfyUI
    const uploadResult = await comfyUploadImage(inputPath);
    const serverFilename = uploadResult.name || inputPath.split('/').pop();

    const workflow = {
      '1': {
        class_type: 'LoadImage',
        inputs: { image: serverFilename },
      },
      '2': {
        class_type: 'RMBG',
        inputs: {
          image: ['1', 0], model: 'RMBG-2.0',
          sensitivity: 1.0, process_res: 1024,
          mask_blur: 0, mask_offset: 0,
          invert_output: false, background: 'Alpha',
        },
      },
      '3': {
        class_type: 'SaveImage',
        inputs: {
          images: ['2', 0],
          filename_prefix: `sprite_forge_rmbg/${itemId}_v${variantIdx}`,
        },
      },
    };

    const history = await comfyQueueAndWait(workflow, 60000);
    const imageBuffer = await comfyDownloadImage(history, '3');
    await writeFile(outputPath, imageBuffer);
    return true;
  } catch (err) {
    console.error(`[SpriteForge] RMBG failed for ${itemId}:`, err.message);
    return false;
  }
}
```

**Step 4: Commit**

```bash
git add src/routes/sprite-forge.js
git commit -m "feat: add ComfyUI generation pipeline for bosses, NPCs, backgrounds"
```

---

### Task 4: Job Status, Approve, and Discard Endpoints

**Files:**
- Modify: `src/routes/sprite-forge.js`

**Step 1: Add GET /jobs endpoint**

```js
// GET /jobs — poll job status
router.get('/jobs', (_req, res) => {
  const allJobs = [...jobs.values()].map(j => ({
    id: j.id,
    type: j.type,
    itemId: j.itemId,
    name: j.name,
    nameEn: j.nameEn,
    status: j.status,
    stage: j.stage,
    variants: j.variants,
    variantResults: j.variantResults,
    error: j.error,
    createdAt: j.createdAt,
  }));
  res.json({ jobs: allJobs });
});
```

**Step 2: Add GET /jobs/:id/variant/:v — serve variant image**

```js
router.get('/jobs/:id/variant/:v', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const v = parseInt(req.params.v, 10);
  const variant = job.variantResults.find(r => r.variant === v);
  if (!variant || variant.error) {
    return res.status(404).json({ error: 'Variant not found' });
  }

  try {
    const imgPath = variant.fullPath;
    const data = await readFile(imgPath);
    const ext = imgPath.endsWith('.webp') ? 'webp' : 'png';
    res.set('Content-Type', `image/${ext}`);
    res.send(data);
  } catch {
    res.status(404).json({ error: 'Variant file not found' });
  }
});
```

**Step 3: Add POST /approve — deploy winning variant**

```js
import { copyFileSync } from 'fs';

router.post('/approve', async (req, res) => {
  const { jobId, variant } = req.body;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const v = variant ?? 0;
  const vResult = job.variantResults.find(r => r.variant === v);
  if (!vResult || vResult.error) {
    return res.status(400).json({ error: 'Variant not available' });
  }

  try {
    // Determine target path based on type
    const DEPLOY_DIRS = {
      creature: 'public/assets/sprites/creatures',
      item: 'public/assets/sprites/items',
      move: 'public/assets/sprites/actions',
      boss: 'public/assets/sprites/bosses',
      npc: 'public/assets/sprites/npcs',
      background: 'public/assets/backgrounds/areas',
    };

    const deployDir = join(projectRoot, DEPLOY_DIRS[job.type]);
    await mkdir(deployDir, { recursive: true });

    // Copy webp to production
    const ext = vResult.path.endsWith('.webp') ? '.webp' : '.png';
    const destPath = join(deployDir, `${job.itemId}${ext}`);

    // Also save as PNG for compatibility
    const srcBuffer = await readFile(vResult.fullPath);
    await writeFile(destPath, srcBuffer);

    if (ext === '.webp') {
      // Also save PNG version
      const pngPath = join(deployDir, `${job.itemId}.png`);
      await sharp(vResult.fullPath).png().toFile(pngPath);
    }

    job.status = 'approved';
    job.stage = 'approved';

    res.json({ success: true, deployed: destPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 4: Add POST /discard — clean up variants**

```js
import { rmSync } from 'fs';

router.post('/discard', (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Clean up staging directory
  const stagingDir = join(projectRoot, 'data', 'sprite-staging', job.type, job.itemId);
  try { rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ok */ }

  jobs.delete(jobId);
  res.json({ success: true });
});
```

**Step 5: Add POST /generate-freeform — for one-off items not in any JSON**

```js
router.post('/generate-freeform', async (req, res) => {
  const { id, type, name, nameEn, description, notes, variants } = req.body;
  if (!id || !type) {
    return res.status(400).json({ error: 'Missing id and type' });
  }

  // Reuse the same /generate logic
  const jobId = `sprite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id: jobId,
    type,
    itemId: id,
    name: name || id,
    nameEn: nameEn || name || id,
    description: description || '',
    notes: notes || '',
    variants: variants || 1,
    status: 'queued',
    stage: 'queued',
    variantResults: [],
    error: null,
    createdAt: new Date().toISOString(),
    freeform: true,
  };
  jobs.set(jobId, job);

  runGenerationPipeline(job, projectRoot).catch(err => {
    job.status = 'error';
    job.stage = 'error';
    job.error = err.message;
  });

  res.json({ success: true, job });
});
```

**Step 6: Commit**

```bash
git add src/routes/sprite-forge.js
git commit -m "feat: add job status, approve, discard, and freeform endpoints"
```

---

### Task 5: Frontend — Sprites Tab in Forge Dashboard

**Files:**
- Modify: `public/forge.html`

**Step 1: Add Sprites nav tab**

In the `.dev-nav` section, add a link:

```html
<a href="/forge.html?tab=sprites" id="navSprites">Sprites</a>
```

**Step 2: Add Sprites section HTML**

Add after the results section:

```html
<div id="spritesSection" style="display:none">
  <!-- Stats bar -->
  <div class="filter-bar" id="spriteTypeFilter"></div>

  <!-- Missing sprites list -->
  <div class="section" id="spriteMissingList">
    <div class="section-title">Missing Sprites <span id="spriteMissingCount" class="progress-text"></span></div>
    <div id="spriteMissingItems" class="word-list"></div>
  </div>

  <!-- Bulk controls -->
  <div class="batch-panel visible" id="spriteBulkPanel" style="display:none">
    <div class="batch-header">
      <h3>Generate <span id="spriteSelectedCount">0</span> sprites</h3>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <label style="font-size:13px;color:#889">Variants each:</label>
      <select id="spriteVariantCount" class="batch-role-select">
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3" selected>3</option>
        <option value="4">4</option>
      </select>
      <textarea id="spriteGlobalNotes" class="batch-notes" placeholder="Additional visual notes for all..." rows="1"></textarea>
      <button class="btn btn-primary" id="spriteGenerateBtn" disabled>Generate Selected</button>
    </div>
  </div>

  <!-- Freeform -->
  <div class="section">
    <div class="section-title">Freeform Generation</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0">
      <input id="freeformId" class="batch-notes" placeholder="ID (e.g. fire-sword)" style="min-width:120px;flex:1">
      <select id="freeformType" class="batch-role-select">
        <option value="item">Item</option>
        <option value="move">Move</option>
        <option value="creature">Creature</option>
        <option value="boss">Boss</option>
        <option value="npc">NPC</option>
        <option value="background">Background</option>
      </select>
      <input id="freeformName" class="batch-notes" placeholder="Display name" style="flex:1">
      <textarea id="freeformDesc" class="batch-notes" placeholder="Visual description..." style="flex:2;min-width:200px" rows="1"></textarea>
      <select id="freeformVariants" class="batch-role-select">
        <option value="1">1 var</option>
        <option value="2">2 var</option>
        <option value="3" selected>3 var</option>
      </select>
      <button class="btn btn-primary" id="freeformGenBtn">Generate</button>
    </div>
  </div>

  <!-- Active jobs -->
  <div class="section" id="spriteJobsSection">
    <div class="section-title">Generation Jobs</div>
    <div id="spriteJobsList" class="word-list"></div>
  </div>
</div>
```

**Step 3: Add CSS for sprite-specific elements**

```css
/* Sprite variant grid */
.variant-grid{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0}
.variant-card{position:relative;width:128px;height:128px;border:2px solid #1e2d4a;border-radius:8px;overflow:hidden;cursor:pointer;transition:all .15s;background:#0a0a1a}
.variant-card:hover{border-color:#0f3460}
.variant-card.selected{border-color:#4ade80;box-shadow:0 0 8px rgba(74,222,128,.3)}
.variant-card img{width:100%;height:100%;object-fit:contain}
.variant-card.error{border-color:#ef4444;opacity:.5}
.variant-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#ef4444;text-align:center;padding:4px}

/* Job card */
.sprite-job{background:#16213e;border-radius:8px;padding:12px;margin-bottom:8px}
.sprite-job-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.sprite-job-status{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600}
.sprite-job-status.queued{background:rgba(251,191,36,.2);color:#fbbf24}
.sprite-job-status.running{background:rgba(96,165,250,.2);color:#60a5fa}
.sprite-job-status.done{background:rgba(74,222,128,.2);color:#4ade80}
.sprite-job-status.error{background:rgba(239,68,68,.2);color:#ef4444}
.sprite-job-status.approved{background:rgba(167,139,250,.2);color:#a78bfa}
.sprite-job-actions{display:flex;gap:6px;margin-top:8px}

/* Sprite item row */
.sprite-row{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#16213e;border-radius:8px;min-height:48px;transition:background .15s}
.sprite-row:hover{background:#1e2d4a}
.sprite-row.selected{background:#0f3460;border:1px solid #2a6090}
.sprite-preview{width:40px;height:40px;border-radius:4px;background:#0a0a1a;overflow:hidden;flex-shrink:0}
.sprite-preview img{width:100%;height:100%;object-fit:contain}
```

**Step 4: Add JavaScript for the sprites tab**

```js
// Sprite Forge tab logic
let spriteData = null;
let selectedSpriteIds = new Set();
let activeTypeFilter = 'all';
let jobPollInterval = null;

async function loadSpritesTab() {
  document.getElementById('spritesSection').style.display = '';
  // Hide other sections
  document.getElementById('wordListSection').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'none';

  await refreshMissing();
  startJobPolling();
}

async function refreshMissing() {
  const res = await fetch('/api/sprite-forge/missing');
  spriteData = await res.json();
  renderTypeFilter();
  renderMissingList();
}

function renderTypeFilter() {
  const bar = document.getElementById('spriteTypeFilter');
  const types = Object.entries(spriteData);
  let totalMissing = types.reduce((s, [, v]) => s + v.missing, 0);

  let html = `<button class="filter-btn ${activeTypeFilter === 'all' ? 'active' : ''}" data-type="all">All (${totalMissing})</button>`;
  for (const [type, data] of types) {
    if (data.total === 0 && data.missing === 0) continue;
    html += `<button class="filter-btn ${activeTypeFilter === type ? 'active' : ''}" data-type="${type}">${type} (${data.missing})</button>`;
  }
  bar.innerHTML = html;
  bar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      activeTypeFilter = btn.dataset.type;
      renderTypeFilter();
      renderMissingList();
    };
  });
}

function renderMissingList() {
  const container = document.getElementById('spriteMissingItems');
  let items = [];
  for (const [type, data] of Object.entries(spriteData)) {
    if (activeTypeFilter !== 'all' && activeTypeFilter !== type) continue;
    for (const item of data.items) {
      items.push({ ...item, type });
    }
  }

  document.getElementById('spriteMissingCount').textContent = `(${items.length} missing)`;

  container.innerHTML = items.map(item => `
    <div class="sprite-row ${selectedSpriteIds.has(item.type + ':' + item.id) ? 'selected' : ''}"
         data-id="${item.id}" data-type="${item.type}">
      <input type="checkbox" class="word-check sprite-check"
             ${selectedSpriteIds.has(item.type + ':' + item.id) ? 'checked' : ''}>
      <span class="role-badge ${item.type}">${item.type}</span>
      <span class="word-jp">${item.name}</span>
      <span class="word-meaning">${item.nameEn}</span>
      <span class="word-reading">${item.id}</span>
    </div>
  `).join('');

  // Click handlers
  container.querySelectorAll('.sprite-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const key = row.dataset.type + ':' + row.dataset.id;
      const cb = row.querySelector('.sprite-check');
      if (selectedSpriteIds.has(key)) {
        selectedSpriteIds.delete(key);
        cb.checked = false;
        row.classList.remove('selected');
      } else {
        selectedSpriteIds.add(key);
        cb.checked = true;
        row.classList.add('selected');
      }
      updateBulkPanel();
    };
    row.querySelector('.sprite-check').onchange = (e) => {
      const key = row.dataset.type + ':' + row.dataset.id;
      if (e.target.checked) {
        selectedSpriteIds.add(key);
        row.classList.add('selected');
      } else {
        selectedSpriteIds.delete(key);
        row.classList.remove('selected');
      }
      updateBulkPanel();
    };
  });

  updateBulkPanel();
}

function updateBulkPanel() {
  const panel = document.getElementById('spriteBulkPanel');
  const count = selectedSpriteIds.size;
  panel.style.display = count > 0 ? '' : 'none';
  document.getElementById('spriteSelectedCount').textContent = count;
  document.getElementById('spriteGenerateBtn').disabled = count === 0;
}

// Generate selected sprites
document.getElementById('spriteGenerateBtn').onclick = async () => {
  const variants = parseInt(document.getElementById('spriteVariantCount').value, 10);
  const notes = document.getElementById('spriteGlobalNotes').value.trim();

  const items = [];
  for (const key of selectedSpriteIds) {
    const [type, id] = key.split(':');
    // Find the item data
    const typeData = spriteData[type];
    const item = typeData?.items?.find(i => i.id === id);
    if (item) {
      items.push({
        id, type,
        name: item.name,
        nameEn: item.nameEn,
        description: item.description || '',
        notes,
        variants,
      });
    }
  }

  const res = await fetch('/api/sprite-forge/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (data.success) {
    selectedSpriteIds.clear();
    updateBulkPanel();
    renderMissingList();
  }
};

// Freeform generation
document.getElementById('freeformGenBtn').onclick = async () => {
  const id = document.getElementById('freeformId').value.trim();
  const type = document.getElementById('freeformType').value;
  const name = document.getElementById('freeformName').value.trim();
  const description = document.getElementById('freeformDesc').value.trim();
  const variants = parseInt(document.getElementById('freeformVariants').value, 10);

  if (!id) return alert('ID is required');

  await fetch('/api/sprite-forge/generate-freeform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, type, name: name || id, nameEn: name || id, description, variants }),
  });

  // Clear form
  document.getElementById('freeformId').value = '';
  document.getElementById('freeformName').value = '';
  document.getElementById('freeformDesc').value = '';
};

// Job polling
function startJobPolling() {
  if (jobPollInterval) clearInterval(jobPollInterval);
  jobPollInterval = setInterval(refreshJobs, 3000);
  refreshJobs();
}

async function refreshJobs() {
  const res = await fetch('/api/sprite-forge/jobs');
  const data = await res.json();
  renderJobs(data.jobs);
}

function renderJobs(jobList) {
  const container = document.getElementById('spriteJobsList');
  if (jobList.length === 0) {
    container.innerHTML = '<div style="color:#556;padding:12px;font-size:13px">No active jobs</div>';
    return;
  }

  // Sort: running first, then done, then error, then approved
  const order = { running: 0, queued: 1, done: 2, error: 3, approved: 4 };
  jobList.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  container.innerHTML = jobList.map(job => {
    const variantsHtml = job.status === 'done' || job.status === 'approved'
      ? `<div class="variant-grid">${job.variantResults.map(v =>
          v.error
            ? `<div class="variant-card error"><div class="variant-error">${v.error}</div></div>`
            : `<div class="variant-card ${job._selectedVariant === v.variant ? 'selected' : ''}"
                   data-job="${job.id}" data-variant="${v.variant}">
                 <img src="/api/sprite-forge/jobs/${job.id}/variant/${v.variant}" loading="lazy">
               </div>`
        ).join('')}</div>`
      : '';

    const actionsHtml = job.status === 'done'
      ? `<div class="sprite-job-actions">
           <button class="btn btn-success btn-approve" data-job="${job.id}">Approve Selected</button>
           <button class="btn btn-danger" style="background:#7f1d1d;color:#fca5a5" data-job="${job.id}" onclick="discardJob('${job.id}')">Discard</button>
         </div>`
      : '';

    return `
      <div class="sprite-job" data-job-id="${job.id}">
        <div class="sprite-job-header">
          <span class="role-badge ${job.type}">${job.type}</span>
          <strong>${job.nameEn || job.name}</strong>
          <span style="color:#667;font-size:12px">${job.itemId}</span>
          <span class="sprite-job-status ${job.status}">${job.status === 'running' ? job.stage : job.status}</span>
        </div>
        ${variantsHtml}
        ${actionsHtml}
      </div>
    `;
  }).join('');

  // Variant click handlers
  container.querySelectorAll('.variant-card:not(.error)').forEach(card => {
    card.onclick = () => {
      const jobId = card.dataset.job;
      const variant = parseInt(card.dataset.variant, 10);
      // Deselect siblings
      card.closest('.variant-grid').querySelectorAll('.variant-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      // Store selection
      const job = jobList.find(j => j.id === jobId);
      if (job) job._selectedVariant = variant;
    };
  });

  // Approve handlers
  container.querySelectorAll('.btn-approve').forEach(btn => {
    btn.onclick = async () => {
      const jobId = btn.dataset.job;
      const job = jobList.find(j => j.id === jobId);
      const variant = job?._selectedVariant ?? 0;
      const res = await fetch('/api/sprite-forge/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, variant }),
      });
      if ((await res.json()).success) refreshJobs();
    };
  });
}

async function discardJob(jobId) {
  await fetch('/api/sprite-forge/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  refreshJobs();
}

// Tab routing
function initSpriteTab() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'sprites') {
    loadSpritesTab();
    document.getElementById('navSprites')?.classList.add('active');
  }
}
```

**Step 5: Wire up tab switching in the existing init code**

Add `initSpriteTab()` call in the existing DOMContentLoaded handler, and update nav click handlers to support the sprites tab.

**Step 6: Commit**

```bash
git add public/forge.html
git commit -m "feat: add Sprites tab UI to Forge dashboard"
```

---

### Task 6: Integration Test & Manual Verification

**Files:**
- Create: `tests/integration/sprite-forge.test.js`

**Step 1: Write integration test for GET /missing**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSpriteForgeRouter } from '../../src/routes/sprite-forge.js';
import express from 'express';
import request from 'supertest';

describe('Sprite Forge API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/sprite-forge', createSpriteForgeRouter({
    projectRoot: process.cwd(),
  }));

  it('GET /missing returns type breakdown', async () => {
    const res = await request(app).get('/api/sprite-forge/missing');
    assert.equal(res.status, 200);
    assert.ok(res.body.creature);
    assert.ok(res.body.item);
    assert.ok(res.body.move);
    assert.equal(typeof res.body.creature.missing, 'number');
    assert.equal(typeof res.body.creature.total, 'number');
  });

  it('POST /generate validates input', async () => {
    const res = await request(app)
      .post('/api/sprite-forge/generate')
      .send({});
    assert.equal(res.status, 400);
  });

  it('GET /jobs returns empty initially', async () => {
    const res = await request(app).get('/api/sprite-forge/jobs');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.jobs));
  });
});
```

**Step 2: Run integration test**

Run: `node --test tests/integration/sprite-forge.test.js`
Expected: PASS

**Step 3: Manual verification**

1. Start server: `npm run dev`
2. Navigate to `http://76.13.220.142:3000/forge.html?tab=sprites`
3. Verify missing sprites list shows correct counts
4. Test freeform generation with a test item
5. Verify job status polling works
6. Verify variant selection and approval deploys correctly

**Step 4: Commit**

```bash
git add tests/integration/sprite-forge.test.js
git commit -m "test: add integration tests for sprite-forge API"
```

---

### Task 7: Install sharp dependency

**Step 1: Check if sharp is already installed**

Run: `node -e "require('sharp')" 2>&1`

**Step 2: Install if needed**

Run: `npm install sharp`

**Step 3: Verify**

Run: `node -e "const s = require('sharp'); console.log('sharp OK', s.versions)"`

**Step 4: Commit if package.json changed**

```bash
git add package.json package-lock.json
git commit -m "chore: add sharp dependency for image processing"
```

---

## Execution Notes

- **Task 7 should run first** — sharp is needed by the router
- **Tasks 1-4** build the backend incrementally
- **Task 5** builds the frontend
- **Task 6** validates everything together
- The `data/sprite-staging/` directory should be added to `.gitignore`
- ComfyUI tunnel must be active for RMBG and ComfyUI generation to work
- Gemini API key must exist at `data/.creature-forge-gemini-key`
