import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = resolve('.');
const SCRIPT_PATH = resolve(PROJECT_ROOT, 'scripts/scenario-npc-sprites/build-jobs.mjs');
const PROMPTS_PATH = resolve(PROJECT_ROOT, 'scripts/scenario-npc-sprites/prompts.mjs');
const EXPECTED_NPC_IDS = [
  'kodomo',
  'otona',
  'otokonoko',
  'onnanoko',
  'sensei',
  'kyouju',
  'seito',
  'senpai',
  'cid',
  'game-master',
  'shrine_fox',
];
const FORBIDDEN_CONTEXTUAL_PROMPT_PHRASES = [
  /existing/i,
  /established/i,
  /Koto/i,
  /matching/i,
  /currently wired/i,
  /our game/i,
  /served/i,
];

test('Scenario NPC prompts cover every currently wired NPC full-body sprite', async () => {
  assert.ok(existsSync(PROMPTS_PATH), 'scripts/scenario-npc-sprites/prompts.mjs should exist');

  const { NPCS, buildNpcPrompt } = await import(`${PROMPTS_PATH}?t=${Date.now()}`);
  assert.deepEqual(Object.keys(NPCS), EXPECTED_NPC_IDS);
  for (const [id, description] of Object.entries(NPCS)) {
    for (const phrase of FORBIDDEN_CONTEXTUAL_PROMPT_PHRASES) {
      assert.doesNotMatch(description, phrase, `${id} prompt should be self-contained`);
    }
  }

  const prompt = buildNpcPrompt('cid');
  assert.match(prompt, /facing left/i);
  assert.match(prompt, /single 256x256 full-body sprite image/i);
  assert.match(prompt, /full-body character sprite/i);
  assert.doesNotMatch(prompt, /portrait/i);
  assert.doesNotMatch(prompt, /facing right/i);
});

test('Scenario NPC manifest builder writes gpt-image-2 jobs with left-facing prompts', async () => {
  assert.ok(existsSync(SCRIPT_PATH), 'scripts/scenario-npc-sprites/build-jobs.mjs should exist');

  const outRoot = await mkdtemp(join(tmpdir(), 'npc-sprites-scenario-'));
  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--ids', 'cid,game-master,shrine_fox',
      '--variants', '3',
      '--run', 'unit-test-run',
      '--out', outRoot,
    ]);

    const manifestPath = join(outRoot, 'unit-test-run', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(manifest.modelId, 'model_openai-gpt-image-2');
    assert.deepEqual(manifest.defaults, {
      variants: 3,
      width: 1024,
      height: 1024,
      quality: 'high',
    });
    assert.deepEqual(manifest.jobs.map(job => job.npcId), ['cid', 'game-master', 'shrine_fox']);

    const firstJob = manifest.jobs[0];
    assert.equal(firstJob.parameters.numOutputs, 3);
    assert.match(firstJob.prompt, /facing left/i);
    assert.equal(firstJob.parameters.prompt, firstJob.prompt);
    assert.deepEqual(firstJob.outputs.map(path => path.endsWith('/cid/cid-a.png')), [true, false, false]);
    assert.deepEqual(firstJob.outputs.map(path => path.endsWith('/cid/cid-b.png')), [false, true, false]);
    assert.deepEqual(firstJob.outputs.map(path => path.endsWith('/cid/cid-c.png')), [false, false, true]);
    assert.deepEqual(firstJob.results, { assets: [] });
  } finally {
    await rm(outRoot, { recursive: true, force: true });
  }
});
