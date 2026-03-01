/**
 * @fileoverview Load and serve hand-authored bootstrap narration scenes
 * @module src/game/bootstrap-narrations
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const NARRATIONS_DIR = join(import.meta.dirname, '../../data/bootstrap-narrations');

let _prologue = null;

function loadPrologue() {
  if (!_prologue) {
    _prologue = JSON.parse(readFileSync(join(NARRATIONS_DIR, 'prologue.json'), 'utf8'));
  }
  return _prologue;
}

/** Get the number of prologue scenes */
export function getPrologueSceneCount() {
  return loadPrologue().length;
}

/** Get a specific prologue scene by index (0-based), or null if out of range */
export function getPrologueScene(index) {
  const scenes = loadPrologue();
  return scenes[index] ?? null;
}
