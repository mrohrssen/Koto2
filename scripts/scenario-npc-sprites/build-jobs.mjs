#!/usr/bin/env node

/**
 * Build a Scenario MCP run_model manifest for NPC sprite generation.
 *
 * Usage:
 *   node scripts/scenario-npc-sprites/build-jobs.mjs --ids cid,game-master,shrine_fox
 *   node scripts/scenario-npc-sprites/build-jobs.mjs --ids cid --variants 3 --width 1024 --height 1024 --quality high
 *   node scripts/scenario-npc-sprites/build-jobs.mjs --ids cid --run my-run-name
 *
 * Writes:
 *   tmp/npc-sprites-scenario/<runId>/manifest.json
 *
 * Each job describes one Scenario `run_model` call:
 *   - model_id: model_openai-gpt-image-2
 *   - parameters.numOutputs: <variants>  (default 3)
 *   - parameters.prompt: <NPC description> + shared suffix
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NPCS, buildNpcPrompt } from './prompts.mjs';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..', '..');

const VARIANT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const SCENARIO_MODEL_ID = 'model_openai-gpt-image-2';

function parseCli() {
  const { values } = parseArgs({
    options: {
      ids:      { type: 'string' },
      variants: { type: 'string' },
      width:    { type: 'string' },
      height:   { type: 'string' },
      quality:  { type: 'string' },
      run:      { type: 'string' },
      out:      { type: 'string' },
    },
    strict: true,
  });

  if (!values.ids) {
    console.error('Missing required --ids <id1,id2,...>');
    console.error('Known NPC ids:');
    console.error('  ' + Object.keys(NPCS).join(', '));
    process.exit(1);
  }

  const ids = values.ids.split(',').map(s => s.trim()).filter(Boolean);
  const unknown = ids.filter(id => !(id in NPCS));
  if (unknown.length) {
    console.error(`Unknown NPC ids: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const variants = values.variants ? Number(values.variants) : 3;
  if (!Number.isInteger(variants) || variants < 1 || variants > 10) {
    console.error('--variants must be an integer 1-10 (gpt-image-2 max numOutputs is 10).');
    process.exit(1);
  }

  const width   = values.width   ? Number(values.width)   : 1024;
  const height  = values.height  ? Number(values.height)  : 1024;
  const quality = values.quality ?? 'high';

  const runId = values.run || defaultRunId();
  const outRoot = values.out
    ? resolve(values.out)
    : resolve(PROJECT_ROOT, 'tmp/npc-sprites-scenario');

  return { ids, variants, width, height, quality, runId, outRoot };
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

function buildJob({ npcId, variants, width, height, quality, runDir }) {
  const prompt = buildNpcPrompt(npcId);
  const outputs = Array.from({ length: variants }, (_, i) => {
    const letter = VARIANT_LETTERS[i] ?? String(i + 1);
    return `${runDir}/${npcId}/${npcId}-${letter}.png`;
  });

  return {
    npcId,
    prompt,
    parameters: {
      prompt,
      numOutputs: variants,
      width,
      height,
      quality,
    },
    outputs,
    results: {
      assets: [],
    },
  };
}

async function main() {
  const { ids, variants, width, height, quality, runId, outRoot } = parseCli();

  const runDir = `${outRoot}/${runId}`;
  await mkdir(runDir, { recursive: true });

  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    modelId: SCENARIO_MODEL_ID,
    runDir,
    defaults: { variants, width, height, quality },
    jobs: ids.map(id => buildJob({
      npcId: id, variants, width, height, quality, runDir,
    })),
  };

  const manifestPath = `${runDir}/manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${manifest.jobs.length} job(s) -> ${manifestPath}`);
  console.log(`Model: ${SCENARIO_MODEL_ID}`);
  console.log(`Variants per NPC: ${variants}  (${variants * ids.length} images total)`);
  console.log(`Output dir: ${runDir}`);
  console.log('');
  console.log('Next: ask the agent to run the manifest through Scenario MCP.');
  console.log('See scripts/scenario-npc-sprites/README.md for the exact MCP loop.');
}

main();
