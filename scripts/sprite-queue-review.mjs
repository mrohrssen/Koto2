#!/usr/bin/env node

/**
 * Review Queue Manager (CLI)
 *
 * Reads Gate 1 and Gate 2 results from a staging directory, builds review
 * queue entries, and merges them into the persistent review queue JSON file
 * that the dashboard reads for its "Needs Review" tab.
 *
 * Usage:
 *   node scripts/sprite-queue-review.mjs --type <type> --staging <dir>
 *
 * Expects:
 *   <dir>/gate1-results.json  — Array of Gate 1 result objects
 *   <dir>/gate2-results.json  — Array of Gate 2 result objects
 *
 * Outputs:
 *   data/sprite-review-queue.json — Updated review queue (created if missing)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';

import { buildQueueEntry, mergeIntoQueue } from './sprite-queue-review-lib.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCli() {
  const args = parseArgs({
    options: {
      type:    { type: 'string' },
      staging: { type: 'string' },
    },
    strict: true,
  });

  const type = args.values.type;
  const staging = args.values.staging;

  if (!type || !staging) {
    console.error('Usage: node scripts/sprite-queue-review.mjs --type <type> --staging <dir>');
    process.exit(1);
  }

  return { type, staging };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the sprite ID from a filename by stripping the variant suffix
 * (e.g. '-a', '-b', '-c') and the file extension.
 *
 * Examples:
 *   'dash-a.png'  -> 'dash'
 *   'dash-b.webp' -> 'dash'
 *   'heal.png'    -> 'heal'
 */
function spriteIdFromFile(filename) {
  return filename.replace(/(-[a-z])?\.\w+$/, '');
}

/**
 * Load a JSON file, returning a fallback value if the file does not exist.
 */
async function loadJsonOrDefault(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { type, staging } = parseCli();

  // Load gate results
  const gate1Path = resolve(staging, 'gate1-results.json');
  const gate2Path = resolve(staging, 'gate2-results.json');

  const gate1Results = JSON.parse(await readFile(gate1Path, 'utf-8'));
  const gate2Results = JSON.parse(await readFile(gate2Path, 'utf-8'));

  console.error(`Loaded ${gate1Results.length} Gate 1 result(s), ${gate2Results.length} Gate 2 result(s)`);

  // Group results by sprite ID
  const gate1ById = new Map();
  const gate2ById = new Map();

  for (const r of gate1Results) {
    const id = spriteIdFromFile(r.file);
    if (!gate1ById.has(id)) gate1ById.set(id, []);
    gate1ById.get(id).push(r);
  }

  for (const r of gate2Results) {
    const id = spriteIdFromFile(r.file);
    if (!gate2ById.has(id)) gate2ById.set(id, []);
    gate2ById.get(id).push(r);
  }

  // Build queue entries for each sprite
  const newEntries = [];

  for (const [id, g1Results] of gate1ById) {
    const g2Results = gate2ById.get(id) || [];

    // Use word/wordEn from gate2 results if available, else from gate1
    const sample = g2Results[0] || g1Results[0] || {};
    const word = sample.word || '';
    const wordEn = sample.wordEn || id;

    const entry = buildQueueEntry({
      id,
      type,
      word,
      wordEn,
      gate1Results: g1Results,
      gate2Results: g2Results,
    });

    newEntries.push(entry);
  }

  // Load existing queue (or create empty)
  const queuePath = resolve(import.meta.dirname, '..', 'data', 'sprite-review-queue.json');
  const existingQueue = await loadJsonOrDefault(queuePath, { pending: [] });

  // Merge and write
  const merged = mergeIntoQueue(existingQueue, newEntries);
  await writeFile(queuePath, JSON.stringify(merged, null, 2));

  // Summary
  const totalCandidates = newEntries.reduce((sum, e) => sum + e.candidates.length, 0);
  console.log(`${newEntries.length} icons ready for review at /dev/sprites → Needs Review tab`);
  console.error(`Queue updated: ${merged.pending.length} total entries (${totalCandidates} new candidates)`);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
