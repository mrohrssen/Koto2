#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { buildMoveGridPrompt, getMoveVisualHint } from './prompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');

const BATCH_SIZE = 9;
const SCENARIO_MODEL_ID = 'model_openai-gpt-image-2';
const BACKGROUND_REMOVAL_MODEL_ID = 'model_photoroom-background-removal';
const TEAM_ID = 'team_g8yJ6jYJtWj44Um1NrmzYiLC';
const PROJECT_ID = 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ';

function parseCli() {
  const { values } = parseArgs({
    options: {
      ids: { type: 'string' },
      list: { type: 'boolean' },
      run: { type: 'string' },
      out: { type: 'string' },
      moves: { type: 'string' },
      'actions-dir': { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      quality: { type: 'string' },
    },
    strict: true,
  });

  return {
    ids: values.ids ? values.ids.split(',').map(s => s.trim()).filter(Boolean) : null,
    list: values.list || false,
    runId: values.run || defaultRunId(),
    outRoot: values.out ? resolve(values.out) : resolve(PROJECT_ROOT, 'tmp/move-sprites-scenario'),
    movesPath: values.moves ? resolve(values.moves) : resolve(PROJECT_ROOT, 'data/moves.json'),
    actionsDir: values['actions-dir'] ? resolve(values['actions-dir']) : resolve(PROJECT_ROOT, 'public/assets/sprites/actions'),
    width: values.width ? Number(values.width) : 1024,
    height: values.height ? Number(values.height) : 1024,
    quality: values.quality || 'high',
  };
}

function defaultRunId() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}

function slugify(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function loadMoves(movesPath) {
  const moves = JSON.parse(await readFile(movesPath, 'utf8'));
  if (!Array.isArray(moves)) throw new Error(`Expected move array in ${movesPath}`);

  const bySlug = new Map();
  for (const move of moves) {
    if (!move.nameEn) continue;
    const slug = slugify(move.nameEn);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { ...move, slug });
    }
  }
  return [...bySlug.values()];
}

async function loadExistingActionSlugs(actionsDir) {
  let files = [];
  try {
    files = await readdir(actionsDir);
  } catch {
    return new Set();
  }
  return new Set(files.filter(file => file.endsWith('.webp')).map(file => file.replace(/\.webp$/, '')));
}

async function discoverMoves({ movesPath, actionsDir, ids }) {
  const moves = await loadMoves(movesPath);
  const existing = await loadExistingActionSlugs(actionsDir);
  const selected = ids
    ? ids.map(id => {
        const move = moves.find(item => item.slug === id);
        if (!move) throw new Error(`Unknown move slug: ${id}`);
        return move;
      })
    : moves.filter(move => !existing.has(move.slug));

  return selected.map(move => ({
    slug: move.slug,
    id: move.id,
    nameEn: move.nameEn,
    name: move.name,
    reading: move.reading,
    element: move.element,
    category: move.category,
    tier: move.tier,
    hint: getMoveVisualHint(move.slug),
  }));
}

function validateHints(moves) {
  const missing = moves.filter(move => !move.hint).map(move => move.slug);
  if (missing.length) {
    throw new Error(`Missing visual hints for selected moves: ${missing.join(', ')}`);
  }
}

function padBatches(moves) {
  const batches = [];
  for (let i = 0; i < moves.length; i += BATCH_SIZE) {
    const batch = moves.slice(i, i + BATCH_SIZE).map((move, index) => ({
      ...move,
      index,
      filler: false,
    }));

    while (batch.length < BATCH_SIZE) {
      const source = moves[batch.length % moves.length] || moves[0];
      batch.push({
        ...source,
        index: batch.length,
        filler: true,
      });
    }
    batches.push(batch);
  }
  return batches;
}

function buildJob({ batch, batchIndex, runDir, width, height, quality }) {
  const prompt = buildMoveGridPrompt(batch);
  return {
    batchIndex,
    prompt,
    parameters: {
      prompt,
      numOutputs: 1,
      width,
      height,
      quality,
      background: 'opaque',
    },
    moves: batch,
    outputs: {
      whiteGrid: `${runDir}/batch-${batchIndex}-white.png`,
      transparentGrid: `${runDir}/batch-${batchIndex}-transparent.png`,
      slicedDir: `${runDir}/sliced`,
    },
    scenario: {
      generationJobId: null,
      whiteGridAssetId: null,
      backgroundRemovalJobId: null,
      transparentGridAssetId: null,
    },
    results: {
      savedAt: null,
      sliced: [],
    },
  };
}

async function main() {
  const opts = parseCli();
  const selected = await discoverMoves(opts);
  validateHints(selected);

  if (opts.list) {
    console.log('slug,nameEn,name,reading,element,category,tier');
    for (const move of selected) {
      console.log(`${move.slug},${move.nameEn},${move.name},${move.reading},${move.element},${move.category},${move.tier}`);
    }
    return;
  }

  if (selected.length === 0) {
    console.error('No moves selected.');
    return;
  }

  const runDir = `${opts.outRoot}/${opts.runId}`;
  await mkdir(runDir, { recursive: true });

  const batches = padBatches(selected);
  const manifest = {
    runId: opts.runId,
    createdAt: new Date().toISOString(),
    modelId: SCENARIO_MODEL_ID,
    backgroundRemovalModelId: BACKGROUND_REMOVAL_MODEL_ID,
    teamId: TEAM_ID,
    projectId: PROJECT_ID,
    runDir,
    defaults: {
      width: opts.width,
      height: opts.height,
      quality: opts.quality,
      background: 'opaque',
    },
    jobs: batches.map((batch, batchIndex) => buildJob({
      batch,
      batchIndex,
      runDir,
      width: opts.width,
      height: opts.height,
      quality: opts.quality,
    })),
  };

  const manifestPath = `${runDir}/manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.jobs.length} job(s) -> ${manifestPath}`);
  console.log(`Selected moves: ${selected.length}`);
  console.log(`Model: ${SCENARIO_MODEL_ID}`);
  console.log(`Background removal: ${BACKGROUND_REMOVAL_MODEL_ID}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
