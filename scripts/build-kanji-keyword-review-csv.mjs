#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';
import { buildReviewRows, rowsToCsv } from './lib/kanji-keyword-review.mjs';

export const DEFAULT_DIR = 'output/kanji-keyword-review';
export const DEFAULT_SLICE_SIZE = 100;

function toText(value) {
  return value == null ? '' : String(value);
}

function normalizePositiveInteger(value, label) {
  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`Invalid value for ${label}: ${value}`);
  }
  return size;
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return {};
  const text = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function convertJpdbCache(cache) {
  const map = new Map();
  for (const [kanji, item] of Object.entries(cache || {})) {
    map.set(kanji, {
      keyword: toText(item?.keyword || ''),
      status: toText(item?.status || 'not_checked'),
    });
  }
  return map;
}

function convertWanikaniCache(cache) {
  const map = new Map();
  for (const [kanji, item] of Object.entries(cache || {})) {
    map.set(kanji, {
      meaning: toText(item?.meaning || ''),
      status: toText(item?.status || 'not_checked'),
    });
  }
  return map;
}

async function writeTextAtomic(filePath, text) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, text, 'utf8');
  await rename(tempPath, filePath);
}

export function buildSliceManifests(rows, size) {
  const chunkSize = normalizePositiveInteger(size, '--slice-size');
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (sourceRows.length === 0) return [];

  const manifests = [];
  for (let offset = 0; offset < sourceRows.length; offset += chunkSize) {
    const sliceRows = sourceRows.slice(offset, offset + chunkSize);
    if (sliceRows.length === 0) continue;

    manifests.push({
      index: manifests.length + 1,
      startRank: Number(sliceRows[0]?.rank),
      endRank: Number(sliceRows[sliceRows.length - 1]?.rank),
      rows: sliceRows,
    });
  }

  return manifests;
}

export function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    sliceSize: DEFAULT_SLICE_SIZE,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') {
      const value = argv[++i];
      if (!value) {
        throw new Error('Missing value for --dir');
      }
      args.dir = value;
      continue;
    }

    if (arg === '--slice-size') {
      const value = argv[++i];
      if (value == null) {
        throw new Error('Missing value for --slice-size');
      }
      args.sliceSize = normalizePositiveInteger(value, '--slice-size');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const outputDir = args.dir;
  const slicesDir = join(outputDir, 'slices');
  const jpdbCache = await readJsonIfExists(join(outputDir, 'jpdb-kanji-keywords.json'));
  const wanikaniCache = await readJsonIfExists(join(outputDir, 'wanikani-kanji-keywords.json'));

  const rows = buildReviewRows({
    entries: getKotoKanjiEntries(),
    jpdbByKanji: convertJpdbCache(jpdbCache),
    wanikaniByKanji: convertWanikaniCache(wanikaniCache),
  });

  await writeTextAtomic(join(outputDir, 'koto-kanji-keyword-review.csv'), rowsToCsv(rows));

  const slices = buildSliceManifests(rows, args.sliceSize);
  await mkdir(slicesDir, { recursive: true });
  for (const slice of slices) {
    const fileName = `slice-${String(slice.index).padStart(2, '0')}-r${slice.startRank}-${slice.endRank}.csv`;
    await writeTextAtomic(join(slicesDir, fileName), rowsToCsv(slice.rows));
  }

  console.log(`Wrote ${rows.length} review rows to ${args.dir}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
