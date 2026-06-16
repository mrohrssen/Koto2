import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf-8');
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe('return to hub menu action', () => {
  it('labels the menu action Return to Hub instead of Reset Run', () => {
    const indexHtml = read('public/index.html');

    assert.match(indexHtml, /id="reset-run-btn"[\s\S]*Return to Hub/);
    assert.doesNotMatch(indexHtml, /id="reset-run-btn"[\s\S]*Reset Run/);
  });

  it('shows the adventure report when leaving a run and silently returns when no run is active', () => {
    const gameJs = read('public/game.js');
    const handlerSource = sourceBetween(
      gameJs,
      "dom.resetRunBtn.addEventListener('click', async () => {",
      '\n  });\n}'
    );

    assert.match(handlerSource, /gameState\.run/);
    assert.match(handlerSource, /showAdventureReport\(false(?:,\s*'forfeit')?\)/);
    assert.match(handlerSource, /returnToHub\(\)/);

    const reportIndex = handlerSource.indexOf('showAdventureReport(false');
    const fallbackIndex = handlerSource.indexOf('returnToHub()');
    assert.ok(reportIndex >= 0 && fallbackIndex > reportIndex);
  });
});
