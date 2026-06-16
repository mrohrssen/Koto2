import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSrc = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');
const explorationSrc = readFileSync(resolve(repoRoot, 'public/js/ui/exploration.js'), 'utf8');

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

const proceedWithRevealBufferSrc = sourceBetween(
  explorationSrc,
  'export async function proceedWithRevealBuffer',
  'async function proceedToNextRoom()'
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

test('proceedWithRevealBuffer queues buffered proceed through explore session before legacy fallback', () => {
  const sessionIndex = proceedWithRevealBufferSrc.indexOf("getExploreSession()?.recordRoomAction('proceed'");
  const applyIndex = proceedWithRevealBufferSrc.indexOf('applyExploreSessionProceedResult');
  const legacyIndex = proceedWithRevealBufferSrc.indexOf('apiProceed({');

  assert.ok(sessionIndex >= 0, 'proceedWithRevealBuffer should queue proceed in the explore session');
  assert.ok(applyIndex > sessionIndex, 'proceedWithRevealBuffer should apply the accepted session result locally');
  assert.ok(legacyIndex > applyIndex, 'legacy verified apiProceed fallback should remain after the session path');

  assert.match(proceedWithRevealBufferSrc, /getExploreSession\(\)\?\.recordRoomAction\('proceed'/);
  assert.match(proceedWithRevealBufferSrc, /applyExploreSessionProceedResult/);
  assert.match(proceedWithRevealBufferSrc, /advanceStateToBufferedNextRoom\(draft\)/);
});

test('exploration wires explore session recovery drains', () => {
  assert.match(
    explorationSrc,
    /addEventListener\('online'[\s\S]*syncNow\(\)/,
    'online recovery should drain the explore session'
  );
  assert.match(
    explorationSrc,
    /visibilitychange[\s\S]*syncNow\(\)/,
    'visibility restore should drain the explore session'
  );
});
