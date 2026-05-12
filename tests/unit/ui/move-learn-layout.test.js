import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const moveLearnSource = readFileSync(resolve(repoRoot, 'public/js/ui/move-learn.js'), 'utf8');

test('learn move replacement uses the move-select grid with the new move in the rest slot', () => {
  assert.match(moveLearnSource, /import \{ buildMoveCell \} from '\.\/move-select\.js';/);
  assert.match(moveLearnSource, /Which move would you like to forget\?/);
  assert.match(moveLearnSource, /grid\.className = 'move-grid move-learn-grid'/);
  assert.match(moveLearnSource, /buildMoveCell\(newMove,\s*true/);
  assert.doesNotMatch(moveLearnSource, /textContent = "Don't learn"/);
});

test('learn move replacement confirms before resolving the selected move', () => {
  assert.match(moveLearnSource, /Forget \$\{.*?\} and learn \$\{.*?\}\?/s);
  assert.match(moveLearnSource, /textContent = 'No'/);
  assert.match(moveLearnSource, /textContent = 'Yes'/);
  assert.match(moveLearnSource, /resolve\(\{ action: 'replace', replaceIndex \}\)/);
});
