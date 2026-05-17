import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf-8');
}

describe('team select settings button', () => {
  it('renders and wires the settings button on the collection team select screen', () => {
    const gameJs = read('public/game.js');

    assert.equal(gameJs.includes('id="collection-settings-btn"'), true);
    assert.equal(gameJs.includes("document.getElementById('collection-settings-btn')"), true);
    assert.equal(gameJs.includes('modalsUI.openSettings()'), true);
  });
});
