#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKotoKanjiEntries } from '../src/game/koto-kanji-dictionary.js';

export const DEFAULT_CACHE_PATH = 'output/kanji-keyword-review/jpdb-kanji-keywords.json';
export const DEFAULT_DELAY_MS = 1_000;
const RATE_LIMIT_DELAY_MS = 60_000;
const REUSABLE_CACHE_STATUSES = new Set(['matched', 'missing']);
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function toText(value) {
  return value == null ? '' : String(value);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripScriptAndStyle(html) {
  return toText(html)
    .replace(/<script\b[\s\S]*?<\/script>/giu, '')
    .replace(/<style\b[\s\S]*?<\/style>/giu, '');
}

function decodeHtmlEntities(text) {
  return toText(text)
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

function stripTagsToText(html) {
  return decodeHtmlEntities(toText(html).replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasMeaningfulText(text) {
  return decodeHtmlEntities(text)
    .replace(/\s+/gu, ' ')
    .trim() !== '';
}

function parseTagName(tagContent) {
  const stripped = toText(tagContent)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
  if (!stripped) return '';

  const match = stripped.match(/^[^\s/>]+/u);
  return match ? match[0].toLowerCase() : '';
}

function isSelfClosingTag(tagContent, tagName) {
  if (!tagName) return true;
  if (VOID_TAGS.has(tagName)) return true;
  return /\/\s*$/u.test(toText(tagContent));
}

function extractKeywordBlockText(html, fromIndex) {
  let depth = 0;
  let headingDepth = 0;
  let output = '';
  let index = fromIndex;

  while (index < html.length) {
    const openIndex = html.indexOf('<', index);
    if (openIndex < 0) {
      if (headingDepth === 0) {
        output += html.slice(index);
      }
      break;
    }
    const closeIndex = html.indexOf('>', openIndex + 1);
    if (closeIndex < 0) {
      if (headingDepth === 0) {
        output += html.slice(index);
      }
      break;
    }

    if (headingDepth === 0) {
      output += html.slice(index, openIndex);
    }

    const tagContent = html.slice(openIndex + 1, closeIndex).trim();
    const lowerTagContent = tagContent.toLowerCase();

    if (lowerTagContent.startsWith('!--')) {
      if (headingDepth === 0) output += ' ';
      index = closeIndex + 1;
      continue;
    }

    if (lowerTagContent.startsWith('/')) {
      const tagName = parseTagName(tagContent);
      if ((tagName === 'body' || tagName === 'html') && depth === 0) {
        break;
      }
      if (tagName === 'h6' && headingDepth > 0) {
        headingDepth--;
      }
      if (depth > 0) depth--;
      if (headingDepth === 0) output += ' ';
      index = closeIndex + 1;
      continue;
    }

    const tagName = parseTagName(tagContent);
    if (tagName === 'h6' && (depth === 0 || hasMeaningfulText(output))) {
      break;
    }

    if (tagName === 'h6' && depth > 0) {
      headingDepth++;
    }

    if (!isSelfClosingTag(tagContent, tagName)) {
      depth++;
    }

    if (headingDepth === 0) output += ' ';

    index = closeIndex + 1;
  }

  return decodeHtmlEntities(output)
    .replace(/\s+/gu, ' ')
    .trim();
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

export function extractJpdbKeywordFromHtml(html) {
  const cleaned = stripScriptAndStyle(html);
  const pattern = /<h6\b[^>]*>([\s\S]*?)<\/h6>/giu;

  for (const match of cleaned.matchAll(pattern)) {
    if (stripTagsToText(match[1]).toLowerCase() !== 'keyword') continue;
    const startIndex = (match.index ?? 0) + match[0].length;
    return extractKeywordBlockText(cleaned, startIndex);
  }

  return '';
}

export function normalizeJpdbResults(results, entries) {
  const normalized = new Map();

  for (const result of Array.isArray(results) ? results : []) {
    const kanji = toText(result?.kanji);
    if (!kanji) continue;

    const existing = normalized.get(kanji);
    if (!existing) {
      normalized.set(kanji, result);
      continue;
    }

    if (existing.status !== 'matched' && result?.status === 'matched') {
      normalized.set(kanji, result);
    }
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const kanji = toText(entry?.kanji);
    if (!kanji || normalized.has(kanji)) continue;
    normalized.set(kanji, { kanji, keyword: '', status: 'missing' });
  }

  return normalized;
}

export async function fetchJpdbKeyword(kanji, fetchFn = fetch) {
  const sourceUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;

  try {
    const response = await fetchFn(sourceUrl);

    if (response.status === 429) {
      return { kanji, keyword: '', status: 'rate_limited', sourceUrl };
    }

    if (response.status === 404) {
      return { kanji, keyword: '', status: 'missing', sourceUrl };
    }

    if (!response.ok) {
      return { kanji, keyword: '', status: 'fetch_failed', sourceUrl, error: String(response.status) };
    }

    const keyword = extractJpdbKeywordFromHtml(await response.text());
    return {
      kanji,
      keyword,
      status: keyword ? 'matched' : 'parse_failed',
      sourceUrl,
    };
  } catch (error) {
    return {
      kanji,
      keyword: '',
      status: 'fetch_failed',
      sourceUrl,
      error: String(error instanceof Error ? error.message : error),
    };
  }
}

function isReusableCachedResult(result) {
  return REUSABLE_CACHE_STATUSES.has(toText(result?.status));
}

export function parseArgs(argv) {
  const args = {
    refresh: false,
    cache: DEFAULT_CACHE_PATH,
    limit: null,
    delayMs: DEFAULT_DELAY_MS,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--refresh') {
      args.refresh = true;
      continue;
    }

    if (arg === '--cache' || arg === '--limit' || arg === '--delay-ms') {
      const value = argv[++i];
      if (value == null) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === '--cache') {
        args.cache = value;
      } else if (arg === '--limit') {
        const limit = Number(value);
        if (!Number.isFinite(limit) || limit < 0) {
          throw new Error(`Invalid value for ${arg}: ${value}`);
        }
        args.limit = Math.floor(limit);
      } else {
        const delayMs = Number(value);
        if (!Number.isFinite(delayMs) || delayMs < 0) {
          throw new Error(`Invalid value for ${arg}: ${value}`);
        }
        args.delayMs = Math.floor(delayMs);
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readJson(filePath);
}

export async function runCli(argv = process.argv.slice(2), { fetchFn = fetch, sleepFn = sleep } = {}) {
  const args = parseArgs(argv);
  const allEntries = getKotoKanjiEntries();
  const entries = allEntries.slice(0, args.limit ?? undefined);
  const cached = args.refresh ? null : await readJsonIfExists(args.cache);
  const results = new Map();

  if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
    for (const [kanji, result] of Object.entries(cached)) {
      results.set(kanji, result);
    }
  }

  for (const entry of entries) {
    const kanji = toText(entry?.kanji);
    const cachedResult = results.get(kanji);
    if (!kanji || (cachedResult && isReusableCachedResult(cachedResult))) continue;

    const result = await fetchJpdbKeyword(kanji, fetchFn);
    results.set(kanji, result);
    await writeJsonAtomic(args.cache, Object.fromEntries(results));
    await sleepFn(result.status === 'rate_limited' ? RATE_LIMIT_DELAY_MS : args.delayMs);
  }

  const normalizedEntries = args.limit == null ? allEntries : entries;
  const normalized = normalizeJpdbResults([...results.values()], normalizedEntries);
  await writeJsonAtomic(args.cache, Object.fromEntries(normalized));
  console.log(`Wrote JPDB keyword cache to ${args.cache}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
