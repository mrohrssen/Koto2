import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_RANK_PATH = 'data/kanji/sources/jpdb-kanji-frequency-2026-06-01.tsv';
const DEFAULT_KANJIDIC_PATH = 'data/kanji/sources/kanjidic2.xml';
const DEFAULT_OVERRIDES_PATH = 'data/kanji/sources/manual-overrides-legacy-2026-06-04.json';
const DEFAULT_JMDICT_PATH = 'data/latest-jm-dict.json';
const DEFAULT_OUT_PATH = 'output/kanji-keyword-review/koto-kanji-dictionary-legacy-build.json';
const CURATED_DICTIONARY_PATH = 'data/kanji/koto-kanji-dictionary.json';
const CURATED_DICTIONARY_ABSOLUTE_PATH = resolve(REPO_ROOT, CURATED_DICTIONARY_PATH);

const DICTIONARY_SOURCES = Object.freeze([
  {
    id: 'kanjidic2',
    name: 'KANJIDIC2',
    url: 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz',
    license: 'EDRDG / CC BY-SA 4.0',
  },
  {
    id: 'jmdict',
    name: 'JMdict / Koto dictionary-derived examples',
    url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    license: 'EDRDG / CC BY-SA 4.0',
  },
]);

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniq(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}

function normalizeReading(reading) {
  return reading.replace(/[.-].*$/u, '');
}

function looksLikeKana(value) {
  return /^[\u3040-\u30ffー]+$/u.test(value);
}

function primaryDefinition(entry) {
  const definitions = asArray(entry?.definitions);
  return definitions.find(definition => definition?.primary)?.en || definitions[0]?.en || '';
}

function splitGloss(gloss) {
  return String(gloss || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
}

export function parseRankSnapshot(text) {
  const lines = text.split(/\r?\n/u).filter(line => line.trim());
  const header = lines.shift();
  if (header !== 'rank\tkanji\tkind') {
    throw new Error('Invalid rank snapshot header; expected rank\\tkanji\\tkind');
  }

  const seenKanji = new Set();
  const rows = lines.map((line, index) => {
    const [rankText, kanji, kind] = line.split('\t');
    const rank = Number(rankText);
    if (!Number.isInteger(rank) || rank !== index + 1) {
      throw new Error(`Invalid rank snapshot rank at row ${index + 2}: ${rankText}`);
    }
    if (!kanji || [...kanji].length !== 1) {
      throw new Error(`Invalid rank snapshot kanji at row ${index + 2}: ${kanji || ''}`);
    }
    if (seenKanji.has(kanji)) {
      throw new Error(`Duplicate rank snapshot kanji: ${kanji}`);
    }
    seenKanji.add(kanji);
    return { rank, kanji, kind: kind || 'Unknown' };
  });

  return rows;
}

export function parseKanjidic2(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  const parsed = parser.parse(xml);
  const characters = asArray(parsed?.kanjidic2?.character);
  const entries = new Map();

  for (const character of characters) {
    const literal = character?.literal;
    if (!literal) continue;
    const rmgroup = character?.reading_meaning?.rmgroup;
    const readings = [];
    const meanings = [];

    for (const reading of asArray(rmgroup?.reading)) {
      const value = typeof reading === 'string' ? reading : reading?.['#text'];
      const type = typeof reading === 'string' ? null : reading?.['@_r_type'];
      if (value && (type === 'ja_on' || type === 'ja_kun')) readings.push(normalizeReading(value));
    }

    for (const meaning of asArray(rmgroup?.meaning)) {
      if (typeof meaning === 'string') {
        meanings.push(meaning);
      } else if (!meaning?.['@_m_lang'] && meaning?.['#text']) {
        meanings.push(meaning['#text']);
      }
    }

    entries.set(literal, {
      literal,
      meanings: uniq(meanings),
      readings: uniq(readings),
    });
  }

  return entries;
}

export function buildExamplesByKanji(jmdictData = {}) {
  const examples = new Map();
  const seenWords = new Set();
  const entries = Object.entries(jmdictData)
    .filter(([word, entry]) => word && entry?.reading && primaryDefinition(entry))
    .sort(([wordA], [wordB]) => wordA.length - wordB.length || wordA.localeCompare(wordB, 'ja'));

  for (const [word, entry] of entries) {
    if (seenWords.has(word)) continue;
    seenWords.add(word);
    const definition = splitGloss(primaryDefinition(entry))[0];
    if (!definition) continue;
    for (const kanji of [...new Set([...word].filter(char => /\p{Script=Han}/u.test(char)))]) {
      const list = examples.get(kanji) || [];
      if (list.length >= 3) continue;
      list.push({
        word,
        reading: entry.reading,
        meaning: definition,
        source: 'jmdict',
      });
      examples.set(kanji, list);
    }
  }

  return examples;
}

function selectPrimaryReading(readings, examples, override) {
  if (override.primaryReading) return override.primaryReading;
  const exactExample = examples.find(example => [...example.word].length === 1);
  if (exactExample?.reading) return exactExample.reading;
  return readings.find(looksLikeKana) || readings[0] || '';
}

function buildEntry(row, kanjidicEntry, override = {}, examples = []) {
  if (!kanjidicEntry) {
    if (!override.primaryMeaning || !override.primaryReading) {
      throw new Error(`Missing KANJIDIC2 entry for ${row.kanji}`);
    }
    kanjidicEntry = { meanings: [], readings: [] };
  }
  const meanings = kanjidicEntry.meanings;
  const readings = kanjidicEntry.readings;
  const primaryMeaning = override.primaryMeaning || meanings[0] || '';
  const secondaryMeanings = override.secondaryMeanings || meanings.filter(meaning => meaning !== primaryMeaning);
  const selectedExamples = override.examples || examples;
  const primaryReading = selectPrimaryReading(readings, selectedExamples, override);
  const secondaryReadings = override.secondaryReadings || readings.filter(reading => reading !== primaryReading);

  if (!primaryMeaning) throw new Error(`Missing primary meaning for ${row.kanji}`);
  if (!primaryReading) throw new Error(`Missing primary reading for ${row.kanji}`);

  return {
    kanji: row.kanji,
    frequencyRank: row.rank,
    kind: row.kind,
    primaryMeaning,
    secondaryMeanings,
    primaryReading,
    secondaryReadings,
    examples: selectedExamples,
    mnemonic: override.mnemonic ?? null,
    notes: override.notes ?? null,
  };
}

export function buildKotoKanjiDictionary({
  rankSnapshot,
  kanjidicXml,
  overrides = {},
  jmdictData = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const ranks = parseRankSnapshot(rankSnapshot);
  const kanjidic = parseKanjidic2(kanjidicXml);
  const examplesByKanji = buildExamplesByKanji(jmdictData);

  return {
    schemaVersion: 1,
    generatedAt,
    sources: DICTIONARY_SOURCES.map(source => ({ ...source })),
    entries: ranks.map(row => buildEntry(row, kanjidic.get(row.kanji), overrides[row.kanji] ?? {}, examplesByKanji.get(row.kanji) ?? [])),
  };
}

function parseArgs(argv) {
  const args = {
    rank: DEFAULT_RANK_PATH,
    kanjidic: DEFAULT_KANJIDIC_PATH,
    overrides: DEFAULT_OVERRIDES_PATH,
    jmdict: DEFAULT_JMDICT_PATH,
    out: DEFAULT_OUT_PATH,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/u, '');
    const value = argv[i + 1];
    if (!key || !value || !Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`Unknown or incomplete argument: ${argv[i] || ''}`);
    }
    args[key] = value;
  }
  return args;
}

function readJsonIfExists(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

export function assertSafeLegacyOutput(path) {
  if (resolve(path) === CURATED_DICTIONARY_ABSOLUTE_PATH) {
    throw new Error('Refusing to write legacy generated output over curated Koto kanji dictionary');
  }
  return true;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  assertSafeLegacyOutput(args.out);
  if (!existsSync(args.kanjidic)) {
    console.error(`Missing KANJIDIC2 source file: ${args.kanjidic}`);
    console.error('Download it from https://www.edrdg.org/kanjidic/kanjidic2.xml.gz, decompress it, and rerun this script.');
    process.exit(1);
  }

  const dictionary = buildKotoKanjiDictionary({
    rankSnapshot: readFileSync(args.rank, 'utf8'),
    kanjidicXml: readFileSync(args.kanjidic, 'utf8'),
    overrides: readJsonIfExists(args.overrides, {}),
    jmdictData: readJsonIfExists(args.jmdict, {}),
    generatedAt: new Date().toISOString(),
  });

  if (dictionary.entries.length !== 4000) {
    throw new Error(`Expected 4000 Koto kanji entries, got ${dictionary.entries.length}`);
  }

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(dictionary, null, 2)}\n`);
  console.log(`Wrote ${dictionary.entries.length} Koto kanji entries to ${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
