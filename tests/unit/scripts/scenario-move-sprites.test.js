import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  VISUAL_HINTS,
  buildMoveGridPrompt,
  getMoveVisualHint,
} from '../../../scripts/scenario-move-sprites/prompts.mjs';

const PROJECT_ROOT = resolve(process.cwd());
const BUILD_SCRIPT = resolve(PROJECT_ROOT, 'scripts/scenario-move-sprites/build-jobs.mjs');
const SLICE_SCRIPT = resolve(PROJECT_ROOT, 'scripts/scenario-move-sprites/slice-transparent-grid.mjs');

describe('scenario move sprite prompts', () => {
  it('provides existing visual hints by slug', () => {
    assert.equal(
      getMoveVisualHint('encircle'),
      'arrows circling inward from all directions, surrounding a center point',
    );
    assert.equal(
      getMoveVisualHint('wash-away'),
      'a rushing wave sweeping things away with foam and spray',
    );
  });

  it('returns null for missing visual hints', () => {
    assert.equal(getMoveVisualHint('not-a-real-move'), null);
  });

  it('builds a white-background 3x3 prompt that bans text and frames', () => {
    const prompt = buildMoveGridPrompt([
      { slug: 'encircle', hint: VISUAL_HINTS.encircle },
      { slug: 'throw-away', hint: VISUAL_HINTS['throw-away'] },
      { slug: 'topple', hint: VISUAL_HINTS.topple },
      { slug: 'fire', hint: VISUAL_HINTS.fire },
      { slug: 'pull', hint: VISUAL_HINTS.pull },
      { slug: 'wash-away', hint: VISUAL_HINTS['wash-away'] },
      { slug: 'step-on', hint: VISUAL_HINTS['step-on'] },
      { slug: 'wound', hint: VISUAL_HINTS.wound },
      { slug: 'tear', hint: VISUAL_HINTS.tear },
    ]);

    assert.match(prompt, /Draw EXACTLY 9 compact RPG ability icons/);
    assert.match(prompt, /3x3 layout/);
    assert.match(prompt, /flat white background/i);
    assert.match(prompt, /#FFFFFF/);
    assert.match(prompt, /No text, no labels, no letters, no kana, no numbers, no UI frames/);
    assert.match(prompt, /Row 1: \(1\) arrows circling inward/);
    assert.match(prompt, /Row 3: \(7\) a foot stomping down/);
    assert.doesNotMatch(prompt, /magenta/i);
  });
});

describe('scenario move sprite manifest builder', () => {
  it('lists missing move sprites without generating a manifest', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const actionsDir = join(outRoot, 'actions');
    await mkdir(actionsDir);

    const result = spawnSync('node', [BUILD_SCRIPT, '--list', '--actions-dir', actionsDir], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^slug,nameEn,name,reading,element,category,tier$/m);
    assert.match(result.stdout, /^gnaw,Gnaw,かじる,かじる,wood,damage,1$/m);
  });

  it('writes a Scenario manifest for selected move slugs', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--ids', 'gnaw,impact,seal',
      '--run', 'unit-run',
      '--out', outRoot,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const manifestPath = join(outRoot, 'unit-run', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(manifest.runId, 'unit-run');
    assert.equal(manifest.modelId, 'model_openai-gpt-image-2');
    assert.equal(manifest.backgroundRemovalModelId, 'model_photoroom-background-removal');
    assert.equal(manifest.teamId, 'team_g8yJ6jYJtWj44Um1NrmzYiLC');
    assert.equal(manifest.projectId, 'proj_ZjnKxmdyxtHXaF13xPGsXjWZ');
    assert.equal(manifest.jobs.length, 1);
    assert.equal(manifest.jobs[0].moves.length, 9);
    assert.deepEqual(
      manifest.jobs[0].moves.filter(move => !move.filler).map(move => move.slug),
      ['gnaw', 'impact', 'seal'],
    );
    assert.equal(manifest.jobs[0].parameters.width, 1024);
    assert.equal(manifest.jobs[0].parameters.height, 1024);
    assert.equal(manifest.jobs[0].parameters.numOutputs, 1);
    assert.equal(manifest.jobs[0].parameters.background, 'opaque');
    assert.match(manifest.jobs[0].prompt, /flat white background/);
  });

  it('fails before writing a manifest when selected moves lack hints', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const fakeMovesPath = join(outRoot, 'moves.json');
    await writeFile(fakeMovesPath, JSON.stringify([
      {
        id: 'fake',
        name: '偽',
        nameEn: 'Unhinted Move',
        reading: 'にせ',
        element: 'neutral',
        category: 'damage',
        tier: 1,
      },
    ]));

    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--ids', 'unhinted-move',
      '--moves', fakeMovesPath,
      '--out', outRoot,
      '--run', 'missing-hint',
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing visual hints for selected moves: unhinted-move/);
  });

  it('supports a temp action sprite directory for missing discovery', async () => {
    const outRoot = await mkdtemp(join(tmpdir(), 'scenario-move-sprites-'));
    const actionsDir = join(outRoot, 'actions');
    await mkdir(actionsDir);
    await writeFile(join(actionsDir, 'gnaw.webp'), 'fake');

    const result = spawnSync('node', [
      BUILD_SCRIPT,
      '--list',
      '--actions-dir', actionsDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^gnaw,/m);
  });
});

describe('scenario move transparent grid slicer', () => {
  it('slices a transparent 3x3 grid into PNG and WebP icons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'grid.png');
    const manifestPath = join(root, 'manifest.json');
    const outputDir = join(root, 'actions');
    const slicedDir = join(root, 'sliced');

    const sharp = (await import('sharp')).default;
    const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      ${Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) * 100 + 30;
        const y = Math.floor(i / 3) * 100 + 30;
        return `<rect x="${x}" y="${y}" width="40" height="40" fill="rgba(${20 + i * 20},80,180,1)"/>`;
      }).join('')}
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(gridPath);

    const moves = Array.from({ length: 9 }, (_, index) => ({
      index,
      slug: `move-${index}`,
      filler: false,
    }));
    await writeFile(manifestPath, JSON.stringify({ jobs: [{ batchIndex: 0, moves }] }));

    const result = spawnSync('node', [
      SLICE_SCRIPT,
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', outputDir,
      '--sliced', slicedDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    for (let i = 0; i < 9; i++) {
      const pngMeta = await sharp(join(slicedDir, `move-${i}.png`)).metadata();
      const webpMeta = await sharp(join(outputDir, `move-${i}.webp`)).metadata();
      assert.equal(pngMeta.width, 128);
      assert.equal(pngMeta.height, 128);
      assert.equal(pngMeta.hasAlpha, true);
      assert.equal(webpMeta.width, 128);
      assert.equal(webpMeta.height, 128);
      assert.equal(webpMeta.hasAlpha, true);
    }
  });

  it('refuses to slice an opaque grid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'opaque.png');
    const manifestPath = join(root, 'manifest.json');
    const sharp = (await import('sharp')).default;

    await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toFile(gridPath);
    await writeFile(manifestPath, JSON.stringify({
      jobs: [{ batchIndex: 0, moves: [{ index: 0, slug: 'opaque', filler: false }] }],
    }));

    const result = spawnSync('node', [
      SLICE_SCRIPT,
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', join(root, 'actions'),
      '--sliced', join(root, 'sliced'),
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /grid has no transparent pixels/i);
  });

  it('refuses to overwrite existing action sprites without --overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scenario-move-slice-'));
    const gridPath = join(root, 'grid.png');
    const manifestPath = join(root, 'manifest.json');
    const outputDir = join(root, 'actions');
    const slicedDir = join(root, 'sliced');
    await mkdir(outputDir);
    await writeFile(join(outputDir, 'move-0.webp'), 'existing');

    const sharp = (await import('sharp')).default;
    const svg = `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="30" width="40" height="40" fill="red"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(gridPath);
    await writeFile(manifestPath, JSON.stringify({
      jobs: [{ batchIndex: 0, moves: [{ index: 0, slug: 'move-0', filler: false }] }],
    }));

    const result = spawnSync('node', [
      SLICE_SCRIPT,
      '--manifest', manifestPath,
      '--batch', '0',
      '--grid', gridPath,
      '--out', outputDir,
      '--sliced', slicedDir,
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to overwrite existing action sprite: move-0/);
  });
});
