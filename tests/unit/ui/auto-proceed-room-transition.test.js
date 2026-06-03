import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const autoProceedSrc = sourceBetween(
  gameSrc,
  'async function autoProceed()',
  '// ============ ENEMY DIALOGUE ============'
);

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

test('autoProceed keeps optimistic verification but delays state commit until after room travel', () => {
  const nextRoomIndex = autoProceedSrc.indexOf('const nextRoom = getNextRoom(gameState)');
  const pendingIndex = autoProceedSrc.indexOf('pending = createPendingRunAction');
  const apiIndex = autoProceedSrc.indexOf('apiProceed({ actionId: pending.actionId, fromRoom, actionSeq })');
  const transitionIndex = autoProceedSrc.indexOf('await playRoomTransition(pending.state');
  const confirmIndex = autoProceedSrc.indexOf('updateGameState(confirmPendingRunAction(pending, result))');
  const correctionIndex = autoProceedSrc.indexOf('updateGameState(correctPendingRunAction(pending, result))');

  assert.ok(nextRoomIndex >= 0, 'autoProceed should read the prepared next room from the reveal buffer');
  assert.ok(pendingIndex > nextRoomIndex, 'autoProceed should create a pending action when a next room is buffered');
  assert.ok(apiIndex > pendingIndex, 'autoProceed should start verified proceed before room travel');
  assert.ok(transitionIndex > apiIndex, 'autoProceed should optimistically play room travel while verification is in flight');
  assert.ok(confirmIndex > transitionIndex, 'autoProceed should commit the accepted state only after room travel');
  assert.ok(correctionIndex > transitionIndex, 'autoProceed should apply corrections only after room travel');

  assert.match(autoProceedSrc, /const fromRoom = gameState\.run\?\.currentRoom/);
  assert.match(autoProceedSrc, /const actionSeq = gameState\.run\?\.roomActionSeq/);
  assert.match(autoProceedSrc, /advanceStateToBufferedNextRoom\(draft\)/);
  assert.match(autoProceedSrc, /isMatchingRunActionResponse\(pending, result\)/);
  assert.doesNotMatch(autoProceedSrc, /updateGameState\(pending\.state\)/);
  assert.doesNotMatch(autoProceedSrc, /updateStatusBar\(\)/);
});
