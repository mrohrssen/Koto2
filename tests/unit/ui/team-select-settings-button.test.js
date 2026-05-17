import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf-8');
}

describe('team select settings button', () => {
  it('renders and wires the standard menu button on the collection team select screen', () => {
    const gameJs = read('public/game.js');
    const gameCss = read('public/game.css');

    assert.equal(gameJs.includes('id="collection-menu-btn"'), true);
    assert.equal(gameJs.includes('class="hud-chip hud-btn" id="collection-menu-btn"'), true);
    assert.equal(gameJs.includes("document.getElementById('collection-menu-btn')"), true);
    assert.equal(gameJs.includes('modalsUI.toggleMenu()'), true);
    assert.equal(gameJs.includes('collection-settings-btn'), false);
    assert.equal(gameCss.includes('.collection-settings-btn'), false);
  });
});
