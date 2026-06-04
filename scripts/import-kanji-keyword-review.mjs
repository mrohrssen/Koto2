#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReviewedKeywords, parseCsv } from './lib/kanji-keyword-review.mjs';

export const DEFAULT_DICTIONARY_PATH = 'data/kanji/koto-kanji-dictionary.json';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function toText(value) {
  return value == null ? '' : String(value);
}

export function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseArgs(argv) {
  const args = {
    dictionary: resolve(REPO_ROOT, DEFAULT_DICTIONARY_PATH),
    write: false,
    curationVersion: formatLocalDate(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--dictionary') {
      const value = argv[++i];
      if (!value) {
        throw new Error('Missing value for --dictionary');
      }
      args.dictionary = value;
      continue;
    }

    if (arg === '--csv') {
      const value = argv[++i];
      if (!value) {
        throw new Error('Missing value for --csv');
      }
      args.csv = value;
      continue;
    }

    if (arg === '--write') {
      args.write = true;
      continue;
    }

    if (arg === '--curation-version') {
      const value = argv[++i];
      if (!value) {
        throw new Error('Missing value for --curation-version');
      }
      args.curationVersion = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.csv) {
    throw new Error('Provide --csv output/kanji-keyword-review/user-reviewed.csv');
  }

  return args;
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export function summarizeImportChanges(changed) {
  const changes = Array.isArray(changed) ? changed : [];
  const count = changes.length;
  if (count === 0) return '0 kanji keyword changes';

  const preview = changes.slice(0, 10).map(change =>
    `${toText(change?.kanji)}: ${toText(change?.from)} -> ${toText(change?.to)}`
  );
  const suffix = count > preview.length ? `; ${count - preview.length} more` : '';

  return `${count} kanji keyword ${count === 1 ? 'change' : 'changes'}: ${preview.join('; ')}${suffix}`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dictionaryPath = resolve(args.dictionary);
  const csvPath = resolve(args.csv);

  const dictionary = await readJson(dictionaryPath);
  const csvText = await readFile(csvPath, 'utf8');
  const rows = parseCsv(csvText);
  const result = applyReviewedKeywords(dictionary, rows, { curationVersion: args.curationVersion });

  console.log(summarizeImportChanges(result.changed));

  if (args.write) {
    await writeJsonAtomic(dictionaryPath, result.dictionary);
    console.log(`Updated ${dictionaryPath}`);
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
