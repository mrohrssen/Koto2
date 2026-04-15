import { Router } from 'express';
import {
  readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync,
  unlinkSync, rmSync, statSync
} from 'fs';
import { join, basename } from 'path';
import { randomBytes } from 'crypto';
import http from 'http';
import sharp from 'sharp';

// ── Type config ──────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  creature: {
    dataFiles: ['creatures.json', 'new-creatures-staging.json'],
    spriteDir: 'public/assets/sprites/creatures',
    ext: '.webp',
    idField: 'id',
    // Creature sprites may be named {id}.webp or {id}-idle.webp
    checkExistence(spriteDir, id) {
      return existsSync(join(spriteDir, `${id}.webp`)) ||
             existsSync(join(spriteDir, `${id}-idle.webp`));
    }
  },
  item: {
    dataFiles: ['items.json', 'new-items-staging.json'],
    spriteDir: 'public/assets/sprites/items',
    ext: '.webp',
    idField: 'id',
  },
  move: {
    dataFiles: ['moves.json', 'new-moves-staging.json'],
    spriteDir: 'public/assets/sprites/actions',
    ext: '.webp',
    idField: 'nameEn',
    slugify: true,  // lowercase, spaces→hyphens
  },
  'npc-skill': {
    dataFiles: ['new-npc-skills-staging.json'],
    spriteDir: 'public/assets/sprites/actions',
    ext: '.webp',
    idField: 'nameEn',
    slugify: true,
  },
  npc: {
    dataFiles: ['new-npcs-staging.json'],
    spriteDir: 'public/assets/sprites/npcs',
    ext: '.webp',
    idField: 'id',
  },
  boss: {
    dataFiles: [],  // bosses are embedded, skip scanning
    spriteDir: 'public/assets/sprites/bosses',
    ext: '.webp',
    idField: 'id',
  },
  background: {
    dataFiles: ['areas.json', 'new-areas-staging.json'],
    spriteDir: 'public/assets/backgrounds/areas',
    ext: '', // backgrounds are directories
    idField: 'id',
    // Backgrounds are directories, not files
    checkExistence(spriteDir, id) {
      const dirPath = join(spriteDir, id);
      return existsSync(dirPath) && statSync(dirPath).isDirectory();
    }
  }
};

const DEPLOY_DIRS = {
  creature: 'public/assets/sprites/creatures',
  item: 'public/assets/sprites/items',
  move: 'public/assets/sprites/actions',
  'npc-skill': 'public/assets/sprites/actions',
  boss: 'public/assets/sprites/bosses',
  npc: 'public/assets/sprites/npcs',
  background: 'public/assets/backgrounds/areas',
};

// ── Gemini types vs ComfyUI types ────────────────────────────────────────

const GEMINI_TYPES = new Set(['item', 'move', 'npc-skill', 'creature']);
const COMFYUI_TYPES = new Set(['boss', 'npc', 'background']);

// ── Helpers ──────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Validate an ID/type string against path traversal */
const SAFE_ID_RE = /^[a-z0-9_-]+$/i;
function isSafeId(str) {
  return typeof str === 'string' && str.length > 0 && SAFE_ID_RE.test(str);
}

function generateJobId() {
  const ts = Date.now();
  const rand = randomBytes(4).toString('hex');
  return `sprite_${ts}_${rand}`;
}

function readJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── ComfyUI helpers ──────────────────────────────────────────────────────

const COMFYUI_BASE = 'http://127.0.0.1:8188';

function comfyFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, COMFYUI_BASE);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = http.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.headers['content-type']?.includes('application/json')) {
          try { resolve(JSON.parse(body.toString())); } catch { resolve(body); }
        } else {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      if (Buffer.isBuffer(options.body) || typeof options.body === 'string') {
        req.write(options.body);
      }
    }
    req.end();
  });
}

function comfyUploadImage(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + randomBytes(8).toString('hex');
    const fileName = basename(filePath);
    const fileData = readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const req = http.request({
      hostname: '127.0.0.1',
      port: 8188,
      path: '/upload/image',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error('Failed to parse ComfyUI upload response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function comfyQueueAndWait(workflow, timeout = 120000) {
  const result = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  const promptId = result.prompt_id;
  if (!promptId) throw new Error('No prompt_id from ComfyUI');

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const history = await comfyFetch(`/history/${promptId}`);
      if (history[promptId]) {
        if (history[promptId].status?.status_str === 'error') {
          const msgs = history[promptId].status?.messages || [];
          const errMsg = msgs.find(m => m[0] === 'execution_error');
          const detail = errMsg?.[1]?.exception_message || 'unknown';
          console.error(`[SpriteForge] ComfyUI workflow error: ${detail}`);
          throw new Error(`ComfyUI workflow error: ${detail}`);
        }
        if (history[promptId].outputs) return history[promptId];
      }
    } catch (e) {
      if (e.message.startsWith('ComfyUI workflow error')) throw e;
    }
  }
  throw new Error('ComfyUI generation timed out');
}

function comfyDownloadImage(history, nodeId) {
  const outputs = history.outputs?.[nodeId];
  if (!outputs?.images?.[0]) {
    throw new Error(`No image output for node ${nodeId}`);
  }
  const img = outputs.images[0];
  return comfyFetch(`/view?filename=${encodeURIComponent(img.filename)}&type=${img.type || 'output'}`);
}

// ── Gemini helpers ───────────────────────────────────────────────────────

let _geminiModel = null;

async function getGeminiModel(projectRoot) {
  if (_geminiModel) return _geminiModel;
  const keyPath = join(projectRoot, 'data', '.creature-forge-gemini-key');
  if (!existsSync(keyPath)) {
    throw new Error('Gemini API key not found at data/.creature-forge-gemini-key');
  }
  const apiKey = readFileSync(keyPath, 'utf8').trim();

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  _geminiModel = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-image-preview',
    generationConfig: { responseModalities: ['image', 'text'] },
  });
  return _geminiModel;
}

async function geminiGenerate(projectRoot, prompt, styleRefParts = []) {
  const model = await getGeminiModel(projectRoot);

  const parts = [...styleRefParts, { text: prompt }];
  const result = await model.generateContent(parts);
  const response = result.response;

  // Extract image from response
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }
  throw new Error('No image in Gemini response');
}

const QUALITY_REF_DIRS = {
  creature: 'data/quality-refs/creatures',
  item: 'data/quality-refs/items',
  move: 'data/quality-refs/actions',
  'npc-skill': 'data/quality-refs/actions',
  npc: 'data/quality-refs/npcs',
  boss: 'data/quality-refs/bosses',
  background: 'data/quality-refs/backgrounds',
};

function loadStyleRefs(projectRoot, type) {
  const refDir = QUALITY_REF_DIRS[type];
  const dir = refDir
    ? join(projectRoot, refDir)
    : join(projectRoot, 'data', 'creature-forge-style-refs');
  if (!existsSync(dir)) return [];

  const parts = [];
  const files = readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
  for (const file of files.slice(0, 4)) { // limit to 4 refs
    const data = readFileSync(join(dir, file));
    const mimeType = file.endsWith('.png') ? 'image/png' :
                     file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    parts.push({ inlineData: { data: data.toString('base64'), mimeType } });
  }
  return parts;
}

// ── RMBG via ComfyUI ─────────────────────────────────────────────────────

async function rmbgViaComfyUI(inputPngPath) {
  // Upload image to ComfyUI
  const uploadResult = await comfyUploadImage(inputPngPath);
  const uploadedName = uploadResult.name;

  // Build RMBG workflow
  const workflow = {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: uploadedName }
    },
    '2': {
      class_type: 'RMBG',
      inputs: {
        image: ['1', 0],
        model: 'RMBG-2.0',
        sensitivity: 1.0,
        process_res: 1024,
        mask_blur: 0,
        mask_offset: 0,
        invert_output: false,
        refine_foreground: false,
        background: 'Alpha',
        background_color: '#222222',
      }
    },
    '3': {
      class_type: 'SaveImage',
      inputs: {
        images: ['2', 0],
        filename_prefix: 'rmbg_output'
      }
    }
  };

  const history = await comfyQueueAndWait(workflow);
  const imageBuffer = await comfyDownloadImage(history, '3');
  return imageBuffer;
}

// ── Prompt builders ──────────────────────────────────────────────────────

function buildItemPrompt(entry) {
  return [
    'Use the same art style as the reference images — these are creature sprites from the same game.',
    'Draw a single cute Japanese food/drink item icon for a video game inventory on a solid magenta (#FF00FF) background.',
    `The item is: ${entry.nameEn}.${entry.notes ? ' ' + entry.notes : ''}`,
    entry.description || '',
    'The icon should be fully opaque (no transparency within the item shape).',
    'No text, no labels, no UI frames. Just the item on a flat magenta field.',
    'This game does not use pixel art, match the reference images.',
    'Designed to read clearly at 128×128 pixels.',
  ].filter(Boolean).join('\n');
}

function buildMovePrompt(entry) {
  const lines = [
    'Use the same art style as the reference images — these are action icons from the same game.',
    'Draw a single skill/vocabulary icon for a video game ability button on a solid white background.',
    `The ability is: ${entry.nameEn}. A new language learner should know the meaning of the word just by seeing this icon.`,
    'This is NOT a character — it is an RPG ability button icon.',
    'No text, no labels, no UI frames. Just the icon on a flat white background.',
    'No semi transparent pixels or glow allowed.',
    'This game does not use pixel art, match the reference images.',
    'Designed to read clearly at 128×128 pixels.',
  ];
  if (entry.notes) {
    lines.push(`IMPORTANT FEEDBACK: ${entry.notes}`);
  }
  return lines.join('\n');
}

function buildCreaturePrompt(entry) {
  return [
    entry.description || `A creature called ${entry.nameEn}.`,
    entry.notes || '',
    'Solid white (#FFFFFF) background, no shadows, full body, front-facing idle pose.',
    'No text, no UI elements.',
    'This game does not use pixel art, match the reference images.',
  ].filter(Boolean).join('\n');
}

function buildComfyCharacterPrompt(entry) {
  const base = entry.description || `A character named ${entry.nameEn}`;
  const notes = entry.notes || '';
  return {
    positive: `solo, one person, single character, ${base} ${notes}, dynamic pose standing upright, anime style, game character portrait, detailed, high quality, full body, transparent background`.trim(),
    negative: 'text, watermark, signature, blurry, low quality, deformed, extra limbs, bad anatomy, frame, border, multiple people',
  };
}

function buildComfyBackgroundPrompt(entry) {
  const base = entry.description || `A fantasy game area: ${entry.nameEn}`;
  const notes = entry.notes || '';
  return {
    positive: `${base} ${notes}, anime style, game background, detailed scenery, atmospheric, wide shot, no characters`.trim(),
    negative: 'text, watermark, signature, blurry, low quality, deformed, frame, border, people, characters',
  };
}

// ── ComfyUI SDXL workflow builders ────────────────────────────────────────

const SDXL_MODEL = 'novaAnimeXL_ilV160.safetensors';

function buildCharacterWorkflow(positive, negative) {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: SDXL_MODEL }
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: positive, clip: ['1', 1] }
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['1', 1] }
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 1024, height: 1024, batch_size: 1 }
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 30,
        cfg: 7.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1.0
      }
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] }
    },
    '7': {
      class_type: 'RMBG',
      inputs: {
        image: ['6', 0],
        model: 'RMBG-2.0',
        sensitivity: 1.0,
        process_res: 1024,
        mask_blur: 0,
        mask_offset: 0,
        invert_output: false,
        refine_foreground: false,
        background: 'Alpha',
        background_color: '#222222',
      }
    },
    '8': {
      class_type: 'SaveImage',
      inputs: {
        images: ['7', 0],
        filename_prefix: 'sprite_forge_char'
      }
    }
  };
}

function buildBackgroundWorkflow(positive, negative) {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: SDXL_MODEL }
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: positive, clip: ['1', 1] }
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['1', 1] }
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 1536, height: 1024, batch_size: 1 }
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 30,
        cfg: 7.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1.0
      }
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] }
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        images: ['6', 0],
        filename_prefix: 'sprite_forge_bg'
      }
    }
  };
}

// ── Generation pipelines ─────────────────────────────────────────────────

async function generateGeminiVariant(projectRoot, entry, variantIndex, stagingDir, job) {
  const type = entry.type;
  let prompt;
  if (job?.promptOverride) {
    prompt = job.promptOverride;
  } else if (type === 'item') prompt = buildItemPrompt(entry);
  else if (type === 'move' || type === 'npc-skill') prompt = buildMovePrompt(entry);
  else prompt = buildCreaturePrompt(entry);

  // Store the prompt used on the job for display/editing
  if (job) job.prompt = prompt;

  // Load type-appropriate style refs
  const styleRefs = loadStyleRefs(projectRoot, type);

  const imageBuffer = await geminiGenerate(projectRoot, prompt, styleRefs);

  // Save raw PNG
  const rawPngPath = join(stagingDir, `variant-${variantIndex}-raw.png`);
  writeFileSync(rawPngPath, imageBuffer);

  // RMBG via ComfyUI
  let rmbgBuffer;
  try {
    rmbgBuffer = await rmbgViaComfyUI(rawPngPath);
  } catch (err) {
    console.warn(`[SpriteForge] RMBG failed for variant ${variantIndex}, using raw image:`, err.message);
    rmbgBuffer = imageBuffer;
  }

  // Save RMBG PNG
  const pngPath = join(stagingDir, `variant-${variantIndex}.png`);
  if (Buffer.isBuffer(rmbgBuffer)) {
    writeFileSync(pngPath, rmbgBuffer);
  } else {
    writeFileSync(pngPath, imageBuffer);
  }

  // Convert to webp
  const webpPath = join(stagingDir, `variant-${variantIndex}.webp`);
  await sharp(pngPath).webp({ quality: 90 }).toFile(webpPath);

  return { variant: variantIndex, path: `variant-${variantIndex}.webp`, fullPath: webpPath };
}

async function generateComfyVariant(entry, variantIndex, stagingDir, job) {
  const type = entry.type;
  const isBackground = type === 'background';

  let prompts;
  if (job?.promptOverride) {
    // promptOverride is { positive, negative } for ComfyUI types
    prompts = job.promptOverride;
  } else {
    prompts = isBackground
      ? buildComfyBackgroundPrompt(entry)
      : buildComfyCharacterPrompt(entry);
  }

  // Store the prompt used on the job for display/editing
  if (job) job.prompt = { positive: prompts.positive, negative: prompts.negative };

  const workflow = isBackground
    ? buildBackgroundWorkflow(prompts.positive, prompts.negative)
    : buildCharacterWorkflow(prompts.positive, prompts.negative);

  // The save node is the last node
  const saveNodeId = isBackground ? '7' : '8';

  const history = await comfyQueueAndWait(workflow, 180000);
  const imageBuffer = await comfyDownloadImage(history, saveNodeId);

  // Save PNG
  const pngPath = join(stagingDir, `variant-${variantIndex}.png`);
  writeFileSync(pngPath, imageBuffer);

  // Convert to webp
  const webpPath = join(stagingDir, `variant-${variantIndex}.webp`);
  await sharp(pngPath).webp({ quality: 90 }).toFile(webpPath);

  return { variant: variantIndex, path: `variant-${variantIndex}.webp`, fullPath: webpPath };
}

// ═══════════════════════════════════════════════════════════════════════════
// Router factory
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Sprite Forge router
 * @param {object} opts
 * @param {string} opts.projectRoot - Path to project root
 * @returns {Router}
 */
export function createSpriteForgeRouter({ projectRoot }) {
  const router = Router();
  const dataDir = join(projectRoot, 'data');
  const stagingRoot = join(dataDir, 'sprite-staging');

  // In-memory job store
  const jobs = new Map();

  // Ensure staging root exists
  if (!existsSync(stagingRoot)) {
    mkdirSync(stagingRoot, { recursive: true });
  }

  // ── GET /missing ─────────────────────────────────────────────────────

  function getMissing(_req, res) {
    try {
      const missing = [];

      for (const [type, config] of Object.entries(TYPE_CONFIG)) {
        // Skip types with no data files (like boss)
        if (config.dataFiles.length === 0) continue;

        // Load and merge entries from all data files
        const seen = new Set();
        const allEntries = [];

        for (const file of config.dataFiles) {
          const filePath = join(dataDir, file);
          const entries = readJsonSafe(filePath);
          for (const entry of entries) {
            const idValue = entry[config.idField];
            if (!idValue) continue;
            const normalizedId = config.slugify ? slugify(idValue) : idValue;
            if (seen.has(normalizedId)) continue;
            seen.add(normalizedId);
            allEntries.push({ ...entry, _source: file, _spriteId: normalizedId });
          }
        }

        // Check which entries are missing sprites
        const spriteDir = join(projectRoot, config.spriteDir);

        for (const entry of allEntries) {
          const id = entry._spriteId;
          let exists;

          if (config.checkExistence) {
            exists = config.checkExistence(spriteDir, id);
          } else {
            exists = existsSync(join(spriteDir, `${id}${config.ext}`));
          }

          if (!exists) {
            // Build a rich description for NPCs from their personality/modifier data
            let description = entry.description || '';
            if (!description && type === 'npc') {
              const parts = [];
              const role = entry.baseMeaning || '';
              const mod = entry.modifier?.meaning?.toLowerCase() || '';
              const gender = entry.gender || '';
              // Role as standalone phrase: "teacher at the school", "researcher at the aquarium"
              if (role) parts.push(role);
              if (gender) parts.push(gender);
              if (mod) parts.push(mod);
              const traits = entry.personality?.traits;
              if (Array.isArray(traits) && traits.length > 0) {
                parts.push(traits.join(', '));
              }
              description = parts.join(', ');
            }

            missing.push({
              type,
              id: entry._spriteId,
              name: entry.name || entry.word || '',
              nameEn: entry.nameEn || entry.meaning || '',
              reading: entry.baseReading || entry.reading || '',
              source: entry._source,
              description,
            });
          }

          // For background type, also scan sub-areas
          if (type === 'background' && Array.isArray(entry.subAreas)) {
            const bgRoot = join(projectRoot, 'public/assets/backgrounds');
            for (const sub of entry.subAreas) {
              if (!sub.id || !sub.background) continue;
              const bgPath = join(bgRoot, sub.background);
              if (!existsSync(bgPath)) {
                missing.push({
                  type: 'background',
                  id: sub.id,
                  name: sub.name || '',
                  nameEn: sub.nameEn || '',
                  reading: sub.reading || '',
                  source: entry._source,
                  description: sub.description || '',
                  parentArea: entry._spriteId,
                });
              }
            }
          }
        }
      }

      res.json({ missing });
    } catch (error) {
      console.error('[SpriteForge] Error scanning missing:', error);
      res.status(500).json({ error: 'Failed to scan missing sprites', details: error.message });
    }
  }

  // ── POST /generate ───────────────────────────────────────────────────

  function postGenerate(req, res) {
    try {
      const { items } = req.body || {};
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing or empty required field: items' });
      }

      const createdJobs = [];

      for (const item of items) {
        if (!item.id || !item.type) {
          continue; // skip invalid items
        }
        if (!isSafeId(item.id) || !isSafeId(item.type)) {
          return res.status(400).json({ error: `Invalid id or type: must match ${SAFE_ID_RE}` });
        }

        const job = {
          id: generateJobId(),
          type: item.type,
          itemId: item.id,
          name: item.name || '',
          nameEn: item.nameEn || '',
          description: item.description || '',
          notes: item.notes || '',
          variants: Math.min(Math.max(item.variants || 2, 1), 4),
          status: 'queued',
          stage: 'queued',
          variantResults: [],
          error: null,
          createdAt: new Date().toISOString(),
        };

        jobs.set(job.id, job);
        createdJobs.push(job);

        // Fire async generation
        runGenerationPipeline(job).catch(err => {
          console.error(`[SpriteForge] Pipeline error for ${job.id}:`, err);
        });
      }

      res.json({ success: true, jobs: createdJobs });
    } catch (error) {
      console.error('[SpriteForge] Error queuing generation:', error);
      res.status(500).json({ error: 'Failed to queue generation', details: error.message });
    }
  }

  // ── POST /generate-freeform ──────────────────────────────────────────

  function postGenerateFreeform(req, res) {
    try {
      const { id, type, name, nameEn, description, notes, variants } = req.body || {};
      if (!id || !type) {
        return res.status(400).json({ error: 'Missing required fields: id, type' });
      }
      if (!isSafeId(id) || !isSafeId(type)) {
        return res.status(400).json({ error: `Invalid id or type: must match ${SAFE_ID_RE}` });
      }

      const job = {
        id: generateJobId(),
        type,
        itemId: id,
        name: name || '',
        nameEn: nameEn || '',
        description: description || '',
        notes: notes || '',
        variants: Math.min(Math.max(variants || 2, 1), 4),
        status: 'queued',
        stage: 'queued',
        variantResults: [],
        error: null,
        createdAt: new Date().toISOString(),
      };

      jobs.set(job.id, job);

      // Fire async generation
      runGenerationPipeline(job).catch(err => {
        console.error(`[SpriteForge] Pipeline error for ${job.id}:`, err);
      });

      res.json({ success: true, job });
    } catch (error) {
      console.error('[SpriteForge] Error queuing freeform generation:', error);
      res.status(500).json({ error: 'Failed to queue generation', details: error.message });
    }
  }

  // ── Async generation pipeline ────────────────────────────────────────

  async function runGenerationPipeline(job) {
    job.status = 'running';
    const stagingDir = join(stagingRoot, job.type, job.itemId);
    mkdirSync(stagingDir, { recursive: true });

    const useGemini = GEMINI_TYPES.has(job.type);

    try {
      for (let v = 0; v < job.variants; v++) {
        job.stage = `generating variant ${v + 1}/${job.variants}`;

        try {
          let result;
          if (useGemini) {
            result = await generateGeminiVariant(projectRoot, {
              ...job,
              type: job.type,
            }, v, stagingDir, job);
            job.stage = `rmbg variant ${v + 1}/${job.variants}`;
          } else {
            result = await generateComfyVariant({
              ...job,
              type: job.type,
            }, v, stagingDir, job);
          }
          job.variantResults.push(result);
        } catch (err) {
          console.error(`[SpriteForge] Variant ${v} failed for ${job.id}:`, err.message);
          job.variantResults.push({
            variant: v,
            path: null,
            fullPath: null,
            error: err.message,
          });
        }
      }

      // If at least one variant succeeded, mark done
      const successes = job.variantResults.filter(r => !r.error);
      if (successes.length > 0) {
        job.status = 'done';
        job.stage = 'done';
      } else {
        job.status = 'error';
        job.stage = 'error';
        job.error = 'All variants failed';
      }
    } catch (err) {
      job.status = 'error';
      job.stage = 'error';
      job.error = err.message;
    }
  }

  // ── GET /jobs ────────────────────────────────────────────────────────

  function getJobs(_req, res) {
    try {
      const allJobs = Array.from(jobs.values()).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      res.json({ jobs: allJobs });
    } catch (error) {
      console.error('[SpriteForge] Error listing jobs:', error);
      res.status(500).json({ error: 'Failed to list jobs', details: error.message });
    }
  }

  // ── GET /jobs/:id/variant/:v ─────────────────────────────────────────

  function getVariantImage(req, res) {
    try {
      const { id, v } = req.params;
      const job = jobs.get(id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const variantResult = job.variantResults.find(r => r.variant === parseInt(v));
      if (!variantResult || !variantResult.fullPath) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      if (!existsSync(variantResult.fullPath)) {
        return res.status(404).json({ error: 'Variant file not found on disk' });
      }

      const ext = variantResult.fullPath.endsWith('.webp') ? 'webp' : 'png';
      res.setHeader('Content-Type', `image/${ext}`);
      res.sendFile(variantResult.fullPath);
    } catch (error) {
      console.error('[SpriteForge] Error serving variant:', error);
      res.status(500).json({ error: 'Failed to serve variant', details: error.message });
    }
  }

  // ── POST /approve ────────────────────────────────────────────────────

  async function postApprove(req, res) {
    try {
      const { jobId, variant } = req.body || {};
      if (!jobId) {
        return res.status(400).json({ error: 'Missing required field: jobId' });
      }
      if (variant === undefined || variant === null) {
        return res.status(400).json({ error: 'Missing required field: variant' });
      }

      const job = jobs.get(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const variantResult = job.variantResults.find(r => r.variant === parseInt(variant));
      if (!variantResult || !variantResult.fullPath) {
        return res.status(404).json({ error: 'Variant not found or has no file' });
      }

      if (!existsSync(variantResult.fullPath)) {
        return res.status(404).json({ error: 'Variant file not found on disk' });
      }

      // Determine deploy directory
      const deployDir = DEPLOY_DIRS[job.type];
      if (!deployDir) {
        return res.status(400).json({ error: `Unknown type: ${job.type}` });
      }
      const fullDeployDir = join(projectRoot, deployDir);
      mkdirSync(fullDeployDir, { recursive: true });

      // Determine filename
      let fileName;
      if (job.type === 'move') {
        fileName = slugify(job.nameEn || job.itemId);
      } else {
        fileName = job.itemId;
      }

      // Copy webp to production
      const webpSource = variantResult.fullPath;
      const webpDest = join(fullDeployDir, `${fileName}.webp`);
      const webpData = readFileSync(webpSource);
      writeFileSync(webpDest, webpData);

      // Also save PNG version
      const pngSource = variantResult.fullPath.replace('.webp', '.png');
      if (existsSync(pngSource)) {
        const pngDest = join(fullDeployDir, `${fileName}.png`);
        writeFileSync(pngDest, readFileSync(pngSource));
      }

      // Update job status
      job.status = 'approved';

      res.json({
        success: true,
        deployed: `${deployDir}/${fileName}.webp`,
        type: job.type,
        itemId: job.itemId,
      });
    } catch (error) {
      console.error('[SpriteForge] Error approving:', error);
      res.status(500).json({ error: 'Failed to approve variant', details: error.message });
    }
  }

  // ── POST /discard ────────────────────────────────────────────────────

  function postDiscard(req, res) {
    try {
      const { jobId } = req.body || {};
      if (!jobId) {
        return res.status(400).json({ error: 'Missing required field: jobId' });
      }

      const job = jobs.get(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Remove staging directory
      const stagingDir = join(stagingRoot, job.type, job.itemId);
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }

      // Remove job from memory
      jobs.delete(jobId);

      res.json({ success: true });
    } catch (error) {
      console.error('[SpriteForge] Error discarding:', error);
      res.status(500).json({ error: 'Failed to discard job', details: error.message });
    }
  }

  // ── POST /regenerate ─────────────────────────────────────────────────

  function postRegenerate(req, res) {
    try {
      const { jobId, notes, prompt } = req.body || {};
      if (!jobId) {
        return res.status(400).json({ error: 'Missing required field: jobId' });
      }

      const oldJob = jobs.get(jobId);
      if (!oldJob) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Clean up old staging files
      const oldStagingDir = join(stagingRoot, oldJob.type, oldJob.itemId);
      if (existsSync(oldStagingDir)) {
        rmSync(oldStagingDir, { recursive: true, force: true });
      }

      // Create new job with feedback notes appended
      const newJob = {
        id: generateJobId(),
        type: oldJob.type,
        itemId: oldJob.itemId,
        name: oldJob.name,
        nameEn: oldJob.nameEn,
        description: oldJob.description,
        notes: notes || oldJob.notes || '',
        promptOverride: prompt || null,
        variants: oldJob.variants,
        status: 'queued',
        stage: 'queued',
        variantResults: [],
        error: null,
        createdAt: new Date().toISOString(),
      };

      // Remove old job, add new one
      jobs.delete(jobId);
      jobs.set(newJob.id, newJob);

      // Fire async generation
      runGenerationPipeline(newJob).catch(err => {
        console.error(`[SpriteForge] Pipeline error for ${newJob.id}:`, err);
      });

      res.json({ success: true, job: newJob });
    } catch (error) {
      console.error('[SpriteForge] Error regenerating:', error);
      res.status(500).json({ error: 'Failed to regenerate', details: error.message });
    }
  }

  // ── Mount routes ─────────────────────────────────────────────────────

  router.get('/missing', getMissing);
  router.get('/jobs', getJobs);
  router.get('/jobs/:id/variant/:v', getVariantImage);
  router.post('/generate', postGenerate);
  router.post('/generate-freeform', postGenerateFreeform);
  router.post('/approve', postApprove);
  router.post('/discard', postDiscard);
  router.post('/regenerate', postRegenerate);

  return router;
}
