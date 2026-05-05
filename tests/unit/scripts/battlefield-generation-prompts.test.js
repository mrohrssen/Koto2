import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildBattlegroundPrompt,
  buildSkyPrompt,
  createPromptManifest,
} = await import('../../../scripts/battlefield-generation/prompt-recipe.mjs');

describe('starter meadow battlefield prompt recipe', () => {
  it('builds a battleground prompt with playable lower 62 percent and selective white sky openings', () => {
    const prompt = buildBattlegroundPrompt({ runDelta: 'first layout proof' });

    assert.match(prompt, /starter meadow/i);
    assert.match(prompt, /3840x1024/);
    assert.match(prompt, /bottom 62%/);
    assert.match(prompt, /upper 38%/);
    assert.match(prompt, /#ffffff/);
    assert.match(prompt, /trees, hills, mountains/i);
    assert.doesNotMatch(prompt, /entire upper 38%.*transparent/i);
    assert.doesNotMatch(prompt, /flat pure #ff00ff/i);
  });

  it('builds a sky prompt from the keyed battleground reference', () => {
    const prompt = buildSkyPrompt({ runDelta: 'match meadow lighting' });

    assert.match(prompt, /keyed battleground reference/i);
    assert.match(prompt, /sky only/i);
    assert.match(prompt, /no ground/i);
    assert.match(prompt, /match meadow lighting/i);
  });

  it('creates a manifest with both production layer prompts', () => {
    const manifest = createPromptManifest({ runId: 'run-001', runDelta: 'layout proof' });

    assert.equal(manifest.areaId, 'starter_meadow');
    assert.equal(manifest.runId, 'run-001');
    assert.equal(manifest.modelId, 'model_openai-gpt-image-2');
    assert.deepEqual(Object.keys(manifest.prompts), ['battleground', 'sky']);
  });
});
