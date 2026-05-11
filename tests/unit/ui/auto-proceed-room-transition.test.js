import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

test('autoProceed routes ingredient drops through room travel', () => {
  assert.doesNotMatch(
    gameSrc,
    /explorationUI\.showProceedIngredientDrops/,
    'autoProceed must not call the removed ingredient popup helper'
  );
  assert.match(
    gameSrc,
    /await\s+playRoomTransition\(result\.state,\s*\{\s*ingredientDrops:\s*result\.ingredientDrops\s*\|\|\s*result\.room\?\.ingredientDrops\s*\|\|\s*\[\],\s*\}\s*\)/s,
    'autoProceed should pass proceed ingredient drops into playRoomTransition'
  );
});
