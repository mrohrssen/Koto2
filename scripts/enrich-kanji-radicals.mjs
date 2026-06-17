#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

export const DEFAULT_DICTIONARY_PATH = 'data/kanji/koto-kanji-dictionary.json';
export const DEFAULT_KANJIDIC_PATH = 'data/kanji/sources/kanjidic2.xml';
export const KANJIDIC2_VARIANT_ALIASES = Object.freeze({
  髙: '高',
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return value?.['#text'] == null ? '' : String(value['#text']);
}

function radicalType(value) {
  return typeof value === 'object' && value !== null ? value['@_rad_type'] : null;
}

export function parseKanjidic2ClassicalRadicals(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });
  const parsed = parser.parse(xml);
  const characters = asArray(parsed?.kanjidic2?.character);
  const radicals = new Map();

  for (const character of characters) {
    const literal = character?.literal;
    if (!literal) continue;

    const classicalValues = asArray(character?.radical?.rad_value)
      .filter(value => radicalType(value) === 'classical')
      .map(value => Number(textValue(value)));

    if (
      classicalValues.length === 1
      && Number.isInteger(classicalValues[0])
      && classicalValues[0] >= 1
      && classicalValues[0] <= 214
    ) {
      radicals.set(literal, classicalValues[0]);
    }
  }

  return radicals;
}

function resolveClassicalRadical(kanji, radicalByKanji, aliases = KANJIDIC2_VARIANT_ALIASES) {
  const direct = radicalByKanji.get(kanji);
  if (Number.isInteger(direct)) return direct;

  const alias = aliases[kanji];
  if (alias) {
    const aliased = radicalByKanji.get(alias);
    if (Number.isInteger(aliased)) return aliased;
  }

  throw new Error(`Missing KANJIDIC2 classical radical for ${kanji}`);
}

export function enrichDictionaryWithClassicalRadicals(dictionary, radicalByKanji) {
  const entries = asArray(dictionary?.entries);
  const changed = [];

  const enrichedEntries = entries.map(entry => {
    const radical = resolveClassicalRadical(entry.kanji, radicalByKanji);

    const existing = entry.radicals?.classical;
    if (existing === radical) return entry;

    changed.push({ kanji: entry.kanji, from: existing ?? null, to: radical });
    return {
      ...entry,
      radicals: {
        ...(entry.radicals || {}),
        classical: radical,
      },
    };
  });

  return {
    dictionary: {
      ...dictionary,
      entries: enrichedEntries,
    },
    changed,
  };
}

function valueLabel(value) {
  return value == null ? 'none' : String(value);
}

export function summarizeRadicalChanges(changed) {
  const changes = Array.isArray(changed) ? changed : [];
  if (changes.length === 0) return '0 kanji radical changes';

  const preview = changes.slice(0, 10).map(change =>
    `${change.kanji}: ${valueLabel(change.from)} -> ${valueLabel(change.to)}`
  );
  const suffix = changes.length > preview.length ? `; ${changes.length - preview.length} more` : '';
  return `${changes.length} kanji radical changes: ${preview.join('; ')}${suffix}`;
}

function parseArgs(argv) {
  const args = {
    dictionary: resolve(REPO_ROOT, DEFAULT_DICTIONARY_PATH),
    kanjidic: resolve(REPO_ROOT, DEFAULT_KANJIDIC_PATH),
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dictionary') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --dictionary');
      args.dictionary = resolve(value);
      continue;
    }
    if (arg === '--kanjidic') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --kanjidic');
      args.kanjidic = resolve(value);
      continue;
    }
    if (arg === '--write') {
      args.write = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dictionary = await readJson(args.dictionary);
  const kanjidicXml = await readFile(args.kanjidic, 'utf8');
  const radicals = parseKanjidic2ClassicalRadicals(kanjidicXml);
  const result = enrichDictionaryWithClassicalRadicals(dictionary, radicals);

  console.log(summarizeRadicalChanges(result.changed));

  if (args.write) {
    await writeJsonAtomic(args.dictionary, result.dictionary);
    console.log(`Updated ${args.dictionary}`);
    return;
  }

  console.log('Dry run only; pass --write to update the dictionary');
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
