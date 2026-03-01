#!/usr/bin/env node

/**
 * Gate 2 — AI Vision Judge (CLI)
 *
 * Uses a multimodal AI model (Gemini) to evaluate sprite candidates that
 * passed Gate 1. Each candidate is scored on concept clarity, style
 * consistency, and readability. Any score < 3 = fail.
 *
 * Usage:
 *   node scripts/sprite-gate2.mjs \
 *     --input <dir>          # Directory containing candidate images
 *     --type <type>          # Sprite type: action|item|creature|boss|npc|background
 *     --refs <refs-dir>      # Directory with 4-6 gold-standard reference sprites
 *     --manifest <path>      # JSON manifest mapping filenames to word/wordEn
 *     [--output <path>]      # Output path (default: <input>/gate2-results.json)
 *
 * The manifest should be an array of objects with at least:
 *   { id/slug, word/name, wordEn/nameEn }
 *
 * Results are written as JSON. Exit code is always 0; Gate 3 uses the scores.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve, extname, basename } from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

import {
  buildJudgePrompt,
  parseJudgeResponse,
} from './sprite-gate2-lib.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      input:    { type: 'string' },
      type:     { type: 'string' },
      refs:     { type: 'string' },
      manifest: { type: 'string' },
      output:   { type: 'string' },
    },
    strict: true,
  });

  const input = args.values.input;
  const type = args.values.type;
  const refs = args.values.refs;
  const manifest = args.values.manifest;

  if (!input || !type || !refs || !manifest) {
    console.error('Usage: node scripts/sprite-gate2.mjs --input <dir> --type <type> --refs <refs-dir> --manifest <manifest.json> [--output <path>]');
    process.exit(1);
  }

  const output = args.values.output || resolve(input, 'gate2-results.json');

  return { input, type, refs, manifest, output };
}

// ---------------------------------------------------------------------------
// Image loading helpers
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function mimeForExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Load reference images from a directory as Gemini inline data parts.
 */
async function loadReferenceImages(dir) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const refs = [];
  for (const f of files.sort()) {
    const ext = extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const data = await readFile(resolve(dir, f));
    refs.push({
      inlineData: {
        mimeType: mimeForExt(ext),
        data: data.toString('base64'),
      },
    });
  }
  return refs;
}

/**
 * Load a single candidate image as a Gemini inline data part.
 */
async function loadCandidateImage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const data = await readFile(filePath);
  return {
    inlineData: {
      mimeType: mimeForExt(ext),
      data: data.toString('base64'),
    },
  };
}

/**
 * Load candidate image files from the input directory.
 */
async function loadCandidateFiles(dir) {
  const files = await readdir(dir);
  return files
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort();
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

/**
 * Load and normalize the manifest.
 * Supports objects with id/slug and word/name, wordEn/nameEn fields.
 * Returns a Map keyed by slug/id for easy lookup.
 */
async function loadManifest(manifestPath) {
  const raw = JSON.parse(await readFile(manifestPath, 'utf-8'));

  if (!Array.isArray(raw)) {
    throw new Error(`Manifest must be an array, got ${typeof raw}`);
  }

  const map = new Map();
  for (const entry of raw) {
    const slug = entry.slug || entry.id;
    const word = entry.word || entry.name || '';
    const wordEn = entry.wordEn || entry.nameEn || '';
    if (slug) {
      map.set(slug, { slug, word, wordEn });
    }
  }
  return map;
}

/**
 * Try to find a manifest entry for a given filename.
 * Matches by checking if the filename (without extension) starts with a slug.
 */
function findManifestEntry(filename, manifestMap) {
  const base = basename(filename, extname(filename));

  // Try exact match first
  if (manifestMap.has(base)) return manifestMap.get(base);

  // Try matching slug as prefix (e.g., "bite-a.png" matches slug "bite")
  for (const [slug, entry] of manifestMap) {
    if (base === slug || base.startsWith(slug + '-') || base.startsWith(slug + '_')) {
      return entry;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Rate-limited delay
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { input, type, refs, manifest, output } = parseCli();

  // Load reference images
  const refParts = await loadReferenceImages(refs);
  if (refParts.length === 0) {
    console.error("No reference images found. Curate 4-6 gold-standard sprites first.");
    process.exit(1);
  }
  console.error(`Loaded ${refParts.length} reference image(s) from ${refs}`);

  // Load manifest
  const manifestMap = await loadManifest(manifest);
  console.error(`Loaded manifest with ${manifestMap.size} entries from ${manifest}`);

  // Load candidate filenames
  const candidateFiles = await loadCandidateFiles(input);
  if (candidateFiles.length === 0) {
    console.error(`No image files found in ${input}`);
    const results = [];
    await writeFile(output, JSON.stringify(results, null, 2));
    process.exit(0);
  }
  console.error(`Found ${candidateFiles.length} candidate(s) in ${input}`);

  // Set up Gemini
  const apiKey = process.env.GEMINI_API_KEY
    || await readFile(resolve(import.meta.dirname, '..', 'data', '.creature-forge-gemini-key'), 'utf-8').then(s => s.trim()).catch(() => '');

  if (!apiKey) {
    console.error('No Gemini API key found. Set GEMINI_API_KEY or place key in data/.creature-forge-gemini-key');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Evaluate each candidate individually
  const results = [];

  for (let i = 0; i < candidateFiles.length; i++) {
    const filename = candidateFiles[i];
    const filePath = resolve(input, filename);

    // Find manifest entry for this file
    const entry = findManifestEntry(filename, manifestMap);
    const word = entry?.word || '';
    const wordEn = entry?.wordEn || basename(filename, extname(filename));

    console.error(`\n[${i + 1}/${candidateFiles.length}] Evaluating: ${filename} (${wordEn})`);

    try {
      // Build prompt
      const promptText = buildJudgePrompt({ type, wordEn, word });

      // Load candidate image
      const candidatePart = await loadCandidateImage(filePath);

      // Build request parts: reference images + prompt label + candidate image + prompt
      const requestParts = [
        { text: 'Reference images (gold-standard examples of the target art style):' },
        ...refParts,
        { text: 'Candidate image to evaluate:' },
        candidatePart,
        { text: promptText },
      ];

      // Call Gemini
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: requestParts }],
      });

      const responseText = result.response.text();
      console.error(`  Response: ${responseText.slice(0, 120)}...`);

      // Parse response
      const parsed = parseJudgeResponse(responseText);

      results.push({
        file: filename,
        word,
        wordEn,
        ...parsed,
      });

      console.error(`  Scores: concept=${parsed.concept} style=${parsed.style} readability=${parsed.readability} total=${parsed.total} passed=${parsed.passed}`);

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({
        file: filename,
        word,
        wordEn,
        concept: 0,
        style: 0,
        readability: 0,
        total: 0,
        passed: false,
        reasoning: `Error: ${err.message}`,
      });
    }

    // Rate limiting: 1-second delay between API calls
    if (i < candidateFiles.length - 1) {
      await delay(1000);
    }
  }

  // Write results
  await writeFile(output, JSON.stringify(results, null, 2));
  console.error(`\nResults written to ${output}`);

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.error(`Summary: ${passed} passed, ${failed} failed out of ${results.length} candidates`);
}

main();
