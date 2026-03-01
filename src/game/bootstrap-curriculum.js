/**
 * @fileoverview Bootstrap curriculum loader and lookup
 * @module src/game/bootstrap-curriculum
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const CURRICULUM_PATH = join(import.meta.dirname, '../../data/bootstrap-curriculum.json');

let _curriculum = null;
let _kanjiIndex = null;

function ensureLoaded() {
  if (!_curriculum) {
    _curriculum = JSON.parse(readFileSync(CURRICULUM_PATH, 'utf8'));
    _kanjiIndex = new Map(_curriculum.map(w => [w.kanji, w]));
  }
}

/** Get the full curriculum array */
export function getCurriculum() {
  ensureLoaded();
  return _curriculum;
}

/** Get words introduced in the prologue */
export function getPrologueWords() {
  ensureLoaded();
  return _curriculum.filter(w => w.introducedIn === 'prologue');
}

/** Get words introduced in a specific run (1, 2, or 3) */
export function getRunWords(runNumber) {
  ensureLoaded();
  return _curriculum.filter(w => w.introducedIn === `run-${runNumber}`);
}

/** Look up word info by kanji */
export function getWordInfo(kanji) {
  ensureLoaded();
  return _kanjiIndex.get(kanji) ?? null;
}
