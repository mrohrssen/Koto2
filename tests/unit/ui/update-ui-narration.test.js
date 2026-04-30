import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

test('updateUI preserves narration during same-phase refreshes', () => {
  assert.match(
    gameSrc,
    /let\s+lastNarrationHidePhase\s*=/,
    'updateUI should track the last phase that cleared narration'
  );
  assert.match(
    gameSrc,
    /const\s+phaseChangedForNarration\s*=\s*lastNarrationHidePhase\s*!==\s*gameState\.phase/,
    'updateUI should distinguish phase changes from same-phase refreshes'
  );
  assert.match(
    gameSrc,
    /if\s*\(\s*phaseChangedForNarration\s*&&\s*!sceneTransitionActive\s*\)\s*\{\s*narrationBox\.forceHide\(\);/s,
    'updateUI should only force-hide narration on phase changes'
  );
  assert.doesNotMatch(
    gameSrc,
    /if\s*\(\s*!sceneTransitionActive\s*\)\s*\{\s*narrationBox\.forceHide\(\);/s,
    'same-phase updateUI calls must not dismiss active narration'
  );
});
