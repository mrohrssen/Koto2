#!/usr/bin/env node

/**
 * Build a Scenario MCP run_model manifest for creature sprite generation.
 *
 * Usage:
 *   node scripts/scenario-creature-sprites/build-jobs.mjs --ids hi,mizu,ki
 *   node scripts/scenario-creature-sprites/build-jobs.mjs --ids hi --variants 5 --width 1024 --height 1024 --quality high
 *   node scripts/scenario-creature-sprites/build-jobs.mjs --ids hi --run my-run-name
 *
 * Writes:
 *   tmp/creature-sprites-scenario/<runId>/manifest.json
 *
 * Each job describes one Scenario `run_model` call:
 *   - model_id: model_openai-gpt-image-2
 *   - parameters.numOutputs: <variants>  (default 5)
 *   - parameters.prompt: <creature description> + shared suffix
 *
 * The agent then iterates manifest.jobs, calls run_model via Scenario MCP,
 * fills in `results.assets`, and downloads each asset to job.outputs[i].
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CREATURES, buildCreaturePrompt } from './prompts.mjs';

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
    console.error('Known creature ids:');
    console.error('  ' + Object.keys(CREATURES).join(', '));
    process.exit(1);
  }

  const ids = values.ids.split(',').map(s => s.trim()).filter(Boolean);
  const unknown = ids.filter(id => !(id in CREATURES));
  if (unknown.length) {
    console.error(`Unknown creature ids: ${unknown.join(', ')}`);
    process.exit(1);
  }

  const variants = values.variants ? Number(values.variants) : 5;
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
    : resolve(PROJECT_ROOT, 'tmp/creature-sprites-scenario');

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

function buildJob({ creatureId, variants, width, height, quality, runDir }) {
  const prompt = buildCreaturePrompt(creatureId);
  const outputs = Array.from({ length: variants }, (_, i) => {
    const letter = VARIANT_LETTERS[i] ?? String(i + 1);
    return `${runDir}/${creatureId}/${creatureId}-${letter}.png`;
  });

  return {
    creatureId,
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
      creatureId: id, variants, width, height, quality, runDir,
    })),
  };

  const manifestPath = `${runDir}/manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${manifest.jobs.length} job(s) → ${manifestPath}`);
  console.log(`Model: ${SCENARIO_MODEL_ID}`);
  console.log(`Variants per creature: ${variants}  (${variants * ids.length} images total)`);
  console.log(`Output dir: ${runDir}`);
  console.log('');
  console.log('Next: ask the agent to run the manifest through Scenario MCP.');
  console.log('See scripts/scenario-creature-sprites/README.md for the exact MCP loop.');
}

main();
