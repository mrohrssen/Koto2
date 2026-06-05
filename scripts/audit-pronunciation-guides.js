import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  katakanaToHiragana,
  pronunciationReadingInfo,
  toRomaji,
} from '../public/js/ui/romaji.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_PATH = join(ROOT, 'tmp', 'pronunciation-guide-audit.json');

const SOURCE_FILES = [
  'data/dialogue/frames.json',
  'data/dialogue/frame-sources.json',
  'data/creatures.json',
  'data/moves.json',
  'data/items.json',
  'data/npcs.json',
  'data/character-cards/npcs.json',
  'data/live-dictionary.json',
  'data/glue-words.json',
  'data/grammar-words.json',
];

function loadJson(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function objectLabel(value = {}, parent = {}) {
  const context = parent || {};
  return value.id || value.base || value.baseForm || value.word || value.name
    || value.surface || value.spelling || context.id || context.raw || '';
}

function displaySurface(value = {}) {
  return value.surface || value.base || value.baseForm || value.word || value.name || value.spelling || '';
}

function candidateReasons(value = {}, reading = '') {
  const reasons = [];
  const surface = displaySurface(value);
  const raw = katakanaToHiragana(reading);

  if (raw.endsWith('は')) reasons.push('candidate-final-ha');
  if (raw.includes('を')) reasons.push('candidate-wo');
  if (raw.includes('ぢ') || raw.includes('づ')) reasons.push('candidate-ji-zu');
  if ((surface === 'は' || surface === 'へ' || surface === 'を') && !value.pos && !value.pos0) {
    reasons.push('candidate-untyped-particle');
  }

  return reasons;
}

function buildEntry({ file, path, value, parent }) {
  const reading = value.reading;
  if (typeof reading !== 'string' || !reading) return null;

  const currentGuide = toRomaji(katakanaToHiragana(reading));
  const pronunciation = pronunciationReadingInfo(reading, value);
  const proposedGuide = toRomaji(pronunciation.reading);
  const changed = currentGuide !== proposedGuide;
  const candidates = candidateReasons(value, reading);

  if (!changed && candidates.length === 0) return null;

  return {
    file,
    path,
    label: objectLabel(value, parent),
    frameId: parent?.id || '',
    raw: parent?.raw || '',
    surface: displaySurface(value),
    reading,
    pos: value.pos || '',
    pos0: value.pos0 || '',
    normalizedForm: value.normalizedForm || '',
    currentGuide,
    proposedReading: pronunciation.reading,
    proposedGuide,
    reasons: [...new Set([...pronunciation.reasons, ...candidates])],
    status: changed ? 'changed-by-rule' : 'candidate-review',
  };
}

function walk(value, visit, path = [], parent = null) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...path, index], parent));
    return;
  }

  if (!value || typeof value !== 'object') return;

  visit(value, path, parent);
  const nextParent = value.raw || value.id || Array.isArray(value.tokens) ? value : parent;
  for (const [key, child] of Object.entries(value)) {
    walk(child, visit, [...path, key], nextParent);
  }
}

const entries = [];
let scannedReadings = 0;

for (const file of SOURCE_FILES) {
  const json = loadJson(file);
  if (!json) continue;

  walk(json, (value, path, parent) => {
    if (typeof value.reading === 'string' && value.reading) scannedReadings++;
    const entry = buildEntry({ file, path: path.join('.'), value, parent });
    if (entry) entries.push(entry);
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  sources: SOURCE_FILES,
  summary: {
    scannedReadings,
    changedByRule: entries.filter(entry => entry.status === 'changed-by-rule').length,
    candidateReview: entries.filter(entry => entry.status === 'candidate-review').length,
  },
  entries,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Wrote ${entries.length} pronunciation guide audit entries to ${OUTPUT_PATH}`);
console.log(JSON.stringify(report.summary, null, 2));
