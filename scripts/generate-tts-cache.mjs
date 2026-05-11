#!/usr/bin/env node
// scripts/generate-tts-cache.mjs
//
// Pre-generates VOICEVOX audio for all static game words.
// Usage: node scripts/generate-tts-cache.mjs
//
// Requires VOICEVOX running at localhost:50021 (or VOICEVOX_URL env var)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', 'tts-cache');
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const SPEAKER_ID = 11;  // Kurono Takehiro ノーマル
const SPEED_SCALE = 0.9;

function loadWords() {
  const words = new Map(); // text → source label (for logging)

  // Moves
  const moves = JSON.parse(readFileSync(join(ROOT, 'data', 'moves.json'), 'utf-8'));
  for (const move of moves) {
    if (move.name) words.set(move.name, `move:${move.id}`);
  }

  // Creatures
  const creatures = JSON.parse(readFileSync(join(ROOT, 'data', 'creatures.json'), 'utf-8'));
  for (const c of creatures) {
    if (c.name) words.set(c.name, `creature:${c.id}`);
    if (c.modifier?.word) words.set(c.modifier.word, `creature-mod:${c.id}`);
  }

  // Items
  const items = JSON.parse(readFileSync(join(ROOT, 'data', 'items.json'), 'utf-8'));
  for (const item of items) {
    if (item.word) words.set(item.word, `item:${item.id}`);
    if (item.components) {
      for (const comp of item.components) {
        if (comp.word) words.set(comp.word, `item-comp:${item.id}`);
      }
    }
  }

  return words;
}

async function synthesize(text) {
  // Step 1: Audio query
  const queryRes = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER_ID}`,
    { method: 'POST' }
  );
  if (!queryRes.ok) throw new Error(`audio_query failed: ${await queryRes.text()}`);
  const audioQuery = await queryRes.json();
  audioQuery.speedScale = SPEED_SCALE;

  // Step 2: Synthesis
  const synthRes = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${SPEAKER_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery)
    }
  );
  if (!synthRes.ok) throw new Error(`synthesis failed: ${await synthRes.text()}`);
  return Buffer.from(await synthRes.arrayBuffer());
}

function hashText(text) {
  return createHash('md5').update(text).digest('hex').slice(0, 12);
}

async function main() {
  // Check VOICEVOX is running
  try {
    const res = await fetch(`${VOICEVOX_URL}/version`);
    if (!res.ok) throw new Error('not ok');
    console.log(`VOICEVOX version: ${await res.text()}`);
  } catch {
    console.error(`ERROR: VOICEVOX not running at ${VOICEVOX_URL}`);
    console.error('Start VOICEVOX first, or set VOICEVOX_URL env var.');
    process.exit(1);
  }

  const words = loadWords();
  console.log(`Found ${words.size} unique words to cache\n`);

  mkdirSync(CACHE_DIR, { recursive: true });

  // Load existing manifest to skip already-cached words
  const manifestPath = join(CACHE_DIR, 'manifest.json');
  let existing = {};
  if (existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (prev.speakerId === SPEAKER_ID && prev.speedScale === SPEED_SCALE) {
        existing = prev.entries || {};
        console.log(`Existing cache has ${Object.keys(existing).length} words, will skip those\n`);
      }
    } catch {}
  }

  const entries = { ...existing };
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [text, source] of words) {
    if (entries[text]) {
      skipped++;
      continue;
    }

    const filename = `${hashText(text)}.wav`;
    try {
      const wav = await synthesize(text);
      writeFileSync(join(CACHE_DIR, filename), wav);
      entries[text] = filename;
      generated++;
      console.log(`  [${generated}] ${text} (${source}) → ${filename} (${wav.length} bytes)`);
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${text} (${source}) — ${err.message}`);
    }
  }

  // Write manifest
  const manifest = {
    speakerId: SPEAKER_ID,
    speedScale: SPEED_SCALE,
    generatedAt: new Date().toISOString(),
    entries
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Total cached: ${Object.keys(entries).length} words`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
