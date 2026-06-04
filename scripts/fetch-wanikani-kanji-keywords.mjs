#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';

export const DEFAULT_CACHE_PATH = 'output/kanji-keyword-review/wanikani-kanji-cache.json';
export const DEFAULT_OUT_PATH = 'output/kanji-keyword-review/wanikani-kanji-keywords.json';
export const DEFAULT_BASE_URL = 'https://api.wanikani.com/v2/subjects?types=kanji&hidden=false';
export const DEFAULT_PUBLIC_INDEX_URL = 'https://www.wanikani.com/kanji';
export const WANIKANI_REVISION = '20170710';
export const DEFAULT_MAX_429_RETRIES = 5;
export const DEFAULT_MIN_RETRY_DELAY_MS = 1_000;
export const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_RETRY_AFTER_MS = 10_000;
const SUCCESS_PAGE_DELAY_MS = 150;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toText(value) {
  return value == null ? '' : String(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function scrubSecrets(text, token) {
  const source = toText(text);
  const secret = toText(token);
  if (!secret) return source;

  const tokenPattern = new RegExp(escapeRegExp(secret), 'g');
  const bearerPattern = new RegExp(`Bearer\\s+${escapeRegExp(secret)}`, 'gi');
  return source
    .replace(bearerPattern, 'Bearer [REDACTED]')
    .replace(tokenPattern, '[REDACTED]');
}

function decodeHtmlEntities(text) {
  const namedEntities = new Map([
    ['amp', '&'],
    ['apos', "'"],
    ['gt', '>'],
    ['lt', '<'],
    ['nbsp', ' '],
    ['quot', '"'],
  ]);

  return toText(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities.get(normalized) ?? match;
  });
}

function stripTags(html) {
  return toText(html).replace(/<[^>]*>/g, '');
}

function normalizeHtmlText(html) {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

function extractHtmlAttribute(tag, name) {
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = toText(tag).match(pattern);
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function hasHtmlClass(tag, className) {
  const classes = extractHtmlAttribute(tag, 'class')
    .split(/\s+/)
    .filter(Boolean);
  return classes.includes(className);
}

function extractMeaningFromPublicKanjiAnchor(anchorHtml) {
  const spanPattern = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = spanPattern.exec(toText(anchorHtml))) !== null) {
    if (hasHtmlClass(match[1], 'subject-character__meaning')) {
      return normalizeHtmlText(match[2]);
    }
  }
  return '';
}

function resolvePublicKanjiDocument(href, publicIndexUrl) {
  let url;
  try {
    url = new URL(href, publicIndexUrl);
  } catch {
    return null;
  }

  const match = url.pathname.match(/^\/kanji\/([^/?#]+)/);
  if (!match) return null;

  let kanji;
  try {
    kanji = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!kanji) return null;

  return {
    kanji,
    documentUrl: url.toString(),
  };
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

function createAllowedOrigins(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return new Set([origin]);
}

function resolveAllowedUrl(url, { baseUrl, allowedOrigins }) {
  const resolved = new URL(url, baseUrl);
  if (!allowedOrigins.has(resolved.origin)) {
    throw new Error(`Refusing to follow WaniKani URL on unexpected origin: ${resolved.origin}`);
  }
  return resolved.toString();
}

async function readResponseError(response, token) {
  try {
    const text = await response.text();
    const sanitized = scrubSecrets(text, token).slice(0, 300);
    return sanitized ? `: ${sanitized}` : '';
  } catch {
    return '';
  }
}

async function fetchJsonWithRetry(url, token, options = {}) {
  const {
    baseUrl = url,
    allowedOrigins = createAllowedOrigins(baseUrl),
    sleepFn = sleep,
    max429Retries = DEFAULT_MAX_429_RETRIES,
    minRetryDelayMs = DEFAULT_MIN_RETRY_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  } = options;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Wanikani-Revision': WANIKANI_REVISION,
  };

  const allowedUrl = resolveAllowedUrl(url, { baseUrl, allowedOrigins });
  let retryCount = 0;

  for (;;) {
    const response = await fetch(allowedUrl, { headers });

    if (response.status === 429) {
      if (retryCount >= Math.max(0, Number(max429Retries) || 0)) {
        throw new Error(`WaniKani API request rate limit exhausted after ${retryCount} retries for ${scrubSecrets(allowedUrl, token)}`);
      }
      retryCount++;
      const retryAfter = clamp(
        parseRetryAfter(response.headers.get('retry-after')) ?? DEFAULT_RETRY_AFTER_MS,
        minRetryDelayMs,
        maxRetryDelayMs,
      );
      await sleepFn(retryAfter);
      continue;
    }

    if (!response.ok) {
      const details = await readResponseError(response, token);
      throw new Error(`WaniKani API request failed (${response.status} ${response.statusText}) for ${scrubSecrets(allowedUrl, token)}${details}`);
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

export function parseWaniKaniPublicKanjiIndexHtml(html, {
  publicIndexUrl = DEFAULT_PUBLIC_INDEX_URL,
} = {}) {
  const subjects = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(toText(html))) !== null) {
    const href = extractHtmlAttribute(match[1], 'href');
    if (!href) continue;

    const document = resolvePublicKanjiDocument(href, publicIndexUrl);
    if (!document) continue;

    const meaning = extractMeaningFromPublicKanjiAnchor(match[2]);
    if (!meaning) continue;

    subjects.push({
      kanji: document.kanji,
      meaning,
      status: 'matched',
      documentUrl: document.documentUrl,
    });
  }

  return subjects;
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

export async function fetchAllWaniKaniPages({
  token,
  baseUrl = DEFAULT_BASE_URL,
  sleepFn = sleep,
  max429Retries = DEFAULT_MAX_429_RETRIES,
  minRetryDelayMs = DEFAULT_MIN_RETRY_DELAY_MS,
  maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
} = {}) {
  if (!token) {
    throw new Error('WANIKANI_API_TOKEN is required to fetch WaniKani subjects');
  }

  const allowedOrigins = createAllowedOrigins(baseUrl);
  const pages = [];
  let nextUrl = baseUrl;

  while (nextUrl) {
    const page = await fetchJsonWithRetry(nextUrl, token, {
      baseUrl: nextUrl,
      allowedOrigins,
      sleepFn,
      max429Retries,
      minRetryDelayMs,
      maxRetryDelayMs,
    });
    pages.push(page);
    const rawNextUrl = page?.pages?.next_url || null;
    nextUrl = rawNextUrl ? resolveAllowedUrl(rawNextUrl, { baseUrl: nextUrl, allowedOrigins }) : null;
    if (nextUrl) {
      await sleepFn(SUCCESS_PAGE_DELAY_MS);
    }
  }

  return pages;
}

export async function fetchWaniKaniPublicKanjiIndex({
  publicIndexUrl = DEFAULT_PUBLIC_INDEX_URL,
  fetchFn = fetch,
} = {}) {
  const response = await fetchFn(publicIndexUrl);
  if (!response.ok) {
    throw new Error(`WaniKani public kanji index request failed (${response.status} ${response.statusText}) for ${publicIndexUrl}`);
  }
  return parseWaniKaniPublicKanjiIndexHtml(await response.text(), { publicIndexUrl });
}

export function parseArgs(argv) {
  const args = {
    refresh: false,
    cache: DEFAULT_CACHE_PATH,
    out: DEFAULT_OUT_PATH,
    publicIndexUrl: DEFAULT_PUBLIC_INDEX_URL,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--refresh') {
      args.refresh = true;
      continue;
    }
    if (arg === '--cache' || arg === '--out' || arg === '--public-index-url') {
      const value = argv[++i];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      const key = arg === '--public-index-url' ? 'publicIndexUrl' : arg.slice(2);
      args[key] = value;
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

export async function runCli(argv = process.argv.slice(2), {
  fetchFn = fetch,
} = {}) {
  const args = parseArgs(argv);
  const cacheExists = existsSync(args.cache);
  const kotoEntries = getKotoKanjiEntries();

  let subjects;
  if (cacheExists && !args.refresh) {
    const pages = await readJsonFile(args.cache);
    if (!Array.isArray(pages)) {
      throw new Error(`Invalid WaniKani cache at ${args.cache}: expected an array of pages`);
    }
    subjects = pages.flatMap(page => extractWaniKaniKanjiSubjects(page));
  } else {
    const token = process.env.WANIKANI_API_TOKEN;
    if (token) {
      const pages = await fetchAllWaniKaniPages({ token });
      await writeJsonAtomic(args.cache, pages);
      subjects = pages.flatMap(page => extractWaniKaniKanjiSubjects(page));
    } else if (args.refresh) {
      throw new Error('WANIKANI_API_TOKEN is required when refreshing or when the cache is missing');
    } else {
      subjects = await fetchWaniKaniPublicKanjiIndex({
        publicIndexUrl: args.publicIndexUrl,
        fetchFn,
      });
    }
  }

  const normalized = normalizeWaniKaniSubjects(subjects, kotoEntries);
  await writeJsonAtomic(args.out, Object.fromEntries(normalized));

  console.log(`Wrote WaniKani keyword cache for ${kotoEntries.length} Koto kanji to ${args.out}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
