import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictionaryPath = join(__dirname, '../../data/kanji/koto-kanji-dictionary.json');
const dictionary = JSON.parse(readFileSync(dictionaryPath, 'utf8'));

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an array`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} is required`);
  }
}

function validateExample(example, label) {
  if (!example || typeof example !== 'object') {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  assertString(example.word, `${label}.word`);
  assertString(example.reading, `${label}.reading`);
  assertString(example.meaning, `${label}.meaning`);
  assertString(example.source, `${label}.source`);
}

function validateRadicals(radicals, label) {
  if (!radicals || typeof radicals !== 'object' || Array.isArray(radicals)) {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  if (
    !Number.isInteger(radicals.classical)
    || radicals.classical < 1
    || radicals.classical > 214
  ) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.classical must be an integer from 1 to 214`);
  }
}

function validateEntry(entry, index) {
  const label = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid Koto kanji dictionary: ${label} must be an object`);
  }
  assertString(entry.kanji, `${label}.kanji`);
  if ([...entry.kanji].length !== 1) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.kanji must be one character`);
  }
  if (!Number.isInteger(entry.frequencyRank) || entry.frequencyRank < 1) {
    throw new Error(`Invalid Koto kanji dictionary: ${label}.frequencyRank must be a positive integer`);
  }
  assertString(entry.kind, `${label}.kind`);
  assertString(entry.primaryMeaning, `${label}.primaryMeaning`);
  assertArray(entry.secondaryMeanings, `${label}.secondaryMeanings`);
  assertString(entry.primaryReading, `${label}.primaryReading`);
  assertArray(entry.secondaryReadings, `${label}.secondaryReadings`);
  assertArray(entry.examples, `${label}.examples`);
  entry.examples.forEach((example, exampleIndex) => validateExample(example, `${label}.examples[${exampleIndex}]`));
  validateRadicals(entry.radicals, `${label}.radicals`);

  for (const forbidden of ['onYomi', 'kunYomi', 'strokeCount']) {
    if (Object.prototype.hasOwnProperty.call(entry, forbidden)) {
      throw new Error(`Invalid Koto kanji dictionary: ${label}.${forbidden} must not be stored`);
    }
  }
}

function validateDictionary(data) {
  if (data.schemaVersion !== 2) {
    throw new Error('Invalid Koto kanji dictionary: schemaVersion must be 2');
  }
  assertString(data.curationVersion, 'curationVersion');
  if (data.maintainer !== 'Koto') {
    throw new Error('Invalid Koto kanji dictionary: maintainer must be Koto');
  }
  if (data.status !== 'hand-curated') {
    throw new Error('Invalid Koto kanji dictionary: status must be hand-curated');
  }
  for (const forbidden of ['generatedAt', 'sources', 'referenceSources']) {
    if (Object.prototype.hasOwnProperty.call(data, forbidden)) {
      throw new Error(`Invalid Koto kanji dictionary: ${forbidden} must not be stored`);
    }
  }
  assertArray(data.entries, 'entries');

  const seenKanji = new Set();
  const seenRanks = new Set();
  data.entries.forEach((entry, index) => {
    validateEntry(entry, index);
    if (seenKanji.has(entry.kanji)) throw new Error(`Duplicate Koto kanji entry: ${entry.kanji}`);
    if (seenRanks.has(entry.frequencyRank)) throw new Error(`Duplicate Koto kanji rank: ${entry.frequencyRank}`);
    seenKanji.add(entry.kanji);
    seenRanks.add(entry.frequencyRank);
  });
}

export function validateKotoKanjiDictionary(data) {
  validateDictionary(data);
  return true;
}

validateKotoKanjiDictionary(dictionary);

const entries = Object.freeze([...dictionary.entries].sort((a, b) => a.frequencyRank - b.frequencyRank));
const metadata = Object.freeze({
  schemaVersion: dictionary.schemaVersion,
  curationVersion: dictionary.curationVersion,
  maintainer: dictionary.maintainer,
  status: dictionary.status,
});
const entriesByKanji = new Map(entries.map(entry => [entry.kanji, entry]));

export function getKotoKanjiEntries() {
  return entries;
}

export function getKotoKanjiMetadata() {
  return metadata;
}

export function getKotoKanjiEntry(kanji) {
  const entry = entriesByKanji.get(kanji);
  if (!entry) throw new Error(`Unknown Koto kanji: ${kanji}`);
  return entry;
}
