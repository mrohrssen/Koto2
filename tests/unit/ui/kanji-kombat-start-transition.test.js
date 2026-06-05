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

test('Kanji Kombat keeps creature select covering hub until the battle scene starts', () => {
  const setupSource = sourceBetween(
    gameSrc,
    'async function startKanjiKombatSetup()',
    'function showCollectionSelect'
  );

  const startApiIndex = setupSource.indexOf('apiStartKanjiKombat(creatureId)');
  const startLoopIndex = setupSource.indexOf('await combatLoopUI.startCombatLoop()');
  const removeOverlayIndex = setupSource.lastIndexOf('removeCollectionOverlay()');
  const updateUiIndex = setupSource.lastIndexOf('updateUI()');

  assert.ok(startApiIndex >= 0, 'Kanji Kombat setup should call the start API');
  assert.ok(startLoopIndex > startApiIndex, 'battle scene startup should wait for the start API state');
  assert.ok(
    removeOverlayIndex > startLoopIndex,
    'creature select overlay should remain visible until the battle scene start has been awaited'
  );
  assert.ok(updateUiIndex > removeOverlayIndex, 'the final UI refresh should happen after removing the overlay');
});

test('creature select disables its confirm path after resolving', () => {
  const selectSource = sourceBetween(
    gameSrc,
    'function showCollectionSelect',
    'function showCollectionToast'
  );

  assert.match(selectSource, /let confirming = false/);
  assert.match(selectSource, /if \(confirming\) return/);
  assert.match(selectSource, /confirming = true/);
  assert.match(selectSource, /overlay\.classList\.add\('collection-select--pending'\)/);
  assert.match(selectSource, /confirmBtn\.disabled = confirming \|\| selected\.size === 0/);
});
