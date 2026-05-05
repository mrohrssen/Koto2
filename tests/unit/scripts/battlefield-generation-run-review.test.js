import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { createRun } = await import('../../../scripts/battlefield-generation/create-run.mjs');
const { generateReview } = await import('../../../scripts/battlefield-generation/generate-review.mjs');

describe('battlefield generation run and review files', () => {
  it('creates a run directory with prompts, scenario metadata, and scorecard', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-run-'));
    const result = await createRun({ rootDir, runId: 'run-001', runDelta: 'layout proof' });

    assert.equal(result.runId, 'run-001');
    assert.equal(path.basename(result.runDir), 'run-001');

    const prompts = JSON.parse(await fs.readFile(path.join(result.runDir, 'prompts.json'), 'utf8'));
    const metadata = JSON.parse(await fs.readFile(path.join(result.runDir, 'scenario-assets.json'), 'utf8'));
    const scorecard = JSON.parse(await fs.readFile(path.join(result.runDir, 'scorecard.json'), 'utf8'));

    assert.equal(prompts.areaId, 'starter_meadow');
    assert.equal(metadata.areaId, 'starter_meadow');
    assert.equal(scorecard.approved, false);
  });

  it('writes a review page for assembled sky and battleground output', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'battlefield-review-'));
    await fs.writeFile(path.join(runDir, 'prompts.json'), JSON.stringify({ areaId: 'starter_meadow', runId: 'run-001' }));
    await fs.writeFile(path.join(runDir, 'scorecard.json'), JSON.stringify({
      scores: { overall: 0, floorReadability: 0, layerValidity: 0, gameplayFit: 0 },
      critique: 'Needs iteration.',
      weakestLayer: 'battleground',
      nextPromptDelta: 'make the floor clearer',
    }));

    const reviewPath = await generateReview({ runDir });
    const html = await fs.readFile(reviewPath, 'utf8');

    assert.match(html, /starter_meadow/);
    assert.match(html, /assembled.png/);
    assert.match(html, /sky.png/);
    assert.match(html, /battleground.png/);
    assert.doesNotMatch(html, /background.png/);
  });
});
