#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';

export const DEFAULT_CACHE_PATH = 'output/kanji-keyword-review/wanikani-kanji-cache.json';
export const DEFAULT_OUT_PATH = 'output/kanji-keyword-review/wanikani-kanji-keywords.json';
export const DEFAULT_BASE_URL = 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false';
export const WANIKANI_REVISION = '20170710';
const DEFAULT_RETRY_AFTER_MS = 10_000;
const SUCCESS_PAGE_DELAY_MS = 150;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toText(value) {
  return value == null ? '' : String(value);
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber * 1000);
  }

  const retryDate = Date.parse(headerValue);
  if (Number.isNaN(retryDate)) return null;
  return Math.max(0, retryDate - Date.now());
}

async function readResponseError(response) {
  try {
    const text = await response.text();
    return text ? `: ${text.slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

async function fetchJsonWithRetry(url, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Wanikani-Revision': WANIKANI_REVISION,
  };

  for (;;) {
    const response = await fetch(url, { headers });

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after')) ?? DEFAULT_RETRY_AFTER_MS;
      await sleep(retryAfter);
      continue;
    }

    if (!response.ok) {
      const details = await readResponseError(response);
      throw new Error(`WaniKani API request failed (${response.status} ${response.statusText}) for ${url}${details}`);
    }

    return response.json();
  }
}

export function extractWaniKaniKanjiSubjects(page) {
  const subjects = Array.isArray(page?.data) ? page.data : [];
  const extracted = [];

  for (const subject of subjects) {
    if (!subject || (Object.prototype.hasOwnProperty.call(subject, 'object') && subject.object !== 'kanji')) {
      continue;
    }

    const kanji = toText(subject.data?.characters);
    if (!kanji) continue;

    const primaryMeaning = Array.isArray(subject.data?.meanings)
      ? subject.data.meanings.find(meaning => meaning?.primary)?.meaning || ''
      : '';

    extracted.push({
      kanji,
      meaning: primaryMeaning,
      status: primaryMeaning ? 'matched' : 'no_primary_meaning',
      level: subject.data?.level ?? null,
      subjectId: subject.id,
      dataUpdatedAt: subject.data_updated_at || null,
      documentUrl: subject.data?.document_url || null,
    });
  }

  return extracted;
}

export function normalizeWaniKaniSubjects(subjects, entries) {
  const normalized = new Map();

  for (const subject of Array.isArray(subjects) ? subjects : []) {
    const kanji = toText(subject?.kanji);
    if (!kanji) continue;

    const existing = normalized.get(kanji);
    if (!existing) {
      normalized.set(kanji, subject);
      continue;
    }

    if (existing.status !== 'matched' && subject.status === 'matched') {
      normalized.set(kanji, subject);
    }
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const kanji = toText(entry?.kanji);
    if (!kanji || normalized.has(kanji)) continue;
    normalized.set(kanji, {
      kanji,
      meaning: '',
      status: 'missing_from_wanikani',
    });
  }

  return normalized;
}

export async function fetchAllWaniKaniPages({ token, baseUrl = DEFAULT_BASE_URL } = {}) {
  if (!token) {
    throw new Error('WANIKANI_API_TOKEN is required to fetch WaniKani subjects');
  }

  const pages = [];
  let nextUrl = baseUrl;

  while (nextUrl) {
    const page = await fetchJsonWithRetry(nextUrl, token);
    pages.push(page);
    nextUrl = page?.pages?.next_url || null;
    if (nextUrl) {
      await sleep(SUCCESS_PAGE_DELAY_MS);
    }
  }

  return pages;
}

export function parseArgs(argv) {
  const args = {
    refresh: false,
    cache: DEFAULT_CACHE_PATH,
    out: DEFAULT_OUT_PATH,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--refresh') {
      args.refresh = true;
      continue;
    }
    if (arg === '--cache' || arg === '--out') {
      const value = argv[++i];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[arg.slice(2)] = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function writeJsonAtomic(filePath, value) {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tempPath, payload, 'utf8');
  await rename(tempPath, filePath);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cacheExists = existsSync(args.cache);

  let pages;
  if (cacheExists && !args.refresh) {
    pages = await readJsonFile(args.cache);
  } else {
    const token = process.env.WANIKANI_API_TOKEN;
    if (!token) {
      throw new Error('WANIKANI_API_TOKEN is required when refreshing or when the cache is missing');
    }
    pages = await fetchAllWaniKaniPages({ token });
    await writeJsonAtomic(args.cache, pages);
  }

  if (!Array.isArray(pages)) {
    throw new Error(`Invalid WaniKani cache at ${args.cache}: expected an array of pages`);
  }

  const subjects = pages.flatMap(page => extractWaniKaniKanjiSubjects(page));
  const normalized = normalizeWaniKaniSubjects(subjects, getKotoKanjiEntries());
  await writeJsonAtomic(args.out, Object.fromEntries(normalized));

  console.log(`Wrote WaniKani keyword cache for ${getKotoKanjiEntries().length} Koto kanji to ${args.out}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
