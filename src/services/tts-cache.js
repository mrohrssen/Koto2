import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SPEAKER_ID = 11;   // 玄野武宏 ノーマル
const SPEED_SCALE = 0.9;

export class TtsCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.manifest = null;
    this.generating = false;
  }

  load() {
    const manifestPath = join(this.cacheDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      console.log('[TTS Cache] No manifest found, cache disabled');
      return;
    }
    try {
      this.manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      console.log(`[TTS Cache] Loaded ${Object.keys(this.manifest.entries).length} cached words`);
    } catch (err) {
      console.error('[TTS Cache] Failed to load manifest:', err.message);
      this.manifest = null;
    }
  }

  lookup(text, speakerId, speedScale) {
    if (!this.manifest) return null;
    if (speakerId !== this.manifest.speakerId) return null;
    if (speedScale !== this.manifest.speedScale) return null;

    const filename = this.manifest.entries[text];
    if (!filename) return null;

    const filePath = join(this.cacheDir, filename);
    try {
      return readFileSync(filePath);
    } catch {
      return null;
    }
  }

  getStats() {
    return {
      loaded: this.manifest !== null,
      generating: this.generating,
      wordCount: this.manifest ? Object.keys(this.manifest.entries).length : 0
    };
  }

  /**
   * Auto-generate cache if manifest is missing and VOICEVOX is available.
   * Runs in the background — does not block server startup.
   */
  async generateIfMissing(dataDir, voicevoxUrl = 'http://localhost:50021') {
    if (this.manifest || this.generating) return;

    // Check if VOICEVOX is reachable
    try {
      const res = await fetch(`${voicevoxUrl}/version`);
      if (!res.ok) return;
      console.log(`[TTS Cache] VOICEVOX found (v${await res.text()}), generating cache...`);
    } catch {
      console.log('[TTS Cache] VOICEVOX not available, skipping cache generation');
      return;
    }

    this.generating = true;
    mkdirSync(this.cacheDir, { recursive: true });

    const words = loadGameWords(dataDir);
    console.log(`[TTS Cache] Generating audio for ${words.size} words...`);

    const entries = {};
    let generated = 0;
    let failed = 0;

    for (const [text, source] of words) {
      const filename = `${hashText(text)}.wav`;
      try {
        const wav = await synthesizeWord(text, voicevoxUrl);
        writeFileSync(join(this.cacheDir, filename), wav);
        entries[text] = filename;
        generated++;
        if (generated % 50 === 0) {
          console.log(`[TTS Cache] Progress: ${generated}/${words.size}`);
        }
      } catch (err) {
        failed++;
        console.error(`[TTS Cache] Failed: ${text} (${source}) — ${err.message}`);
      }
    }

    // Write manifest
    const manifest = {
      speakerId: SPEAKER_ID,
      speedScale: SPEED_SCALE,
      generatedAt: new Date().toISOString(),
      entries
    };
    writeFileSync(join(this.cacheDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    this.manifest = manifest;
    this.generating = false;

    console.log(`[TTS Cache] Done! Generated: ${generated}, Failed: ${failed}, Total: ${Object.keys(entries).length}`);
  }
}

/**
 * Load all static game words from JSON data files.
 */
export function loadGameWords(dataDir) {
  const words = new Map();

  // Moves
  const movesPath = join(dataDir, 'moves.json');
  if (existsSync(movesPath)) {
    const moves = JSON.parse(readFileSync(movesPath, 'utf-8'));
    for (const move of moves) {
      if (move.name) words.set(move.name, `move:${move.id}`);
    }
  }

  // Creatures
  const creaturesPath = join(dataDir, 'creatures.json');
  if (existsSync(creaturesPath)) {
    const creatures = JSON.parse(readFileSync(creaturesPath, 'utf-8'));
    for (const c of creatures) {
      const word = c.name || c.baseWord;
      if (word) words.set(word, `creature:${c.id}`);
      if (c.modifier?.word) words.set(c.modifier.word, `creature-mod:${c.id}`);
    }
  }

  // Items
  const itemsPath = join(dataDir, 'items.json');
  if (existsSync(itemsPath)) {
    const items = JSON.parse(readFileSync(itemsPath, 'utf-8'));
    for (const item of items) {
      if (item.word) words.set(item.word, `item:${item.id}`);
      if (item.components) {
        for (const comp of item.components) {
          if (comp.word) words.set(comp.word, `item-comp:${item.id}`);
        }
      }
    }
  }

  return words;
}

/**
 * Synthesize a single word via VOICEVOX (audio_query → synthesis).
 */
export async function synthesizeWord(text, voicevoxUrl) {
  const queryRes = await fetch(
    `${voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER_ID}`,
    { method: 'POST' }
  );
  if (!queryRes.ok) throw new Error(`audio_query failed: ${await queryRes.text()}`);
  const audioQuery = await queryRes.json();
  audioQuery.speedScale = SPEED_SCALE;

  const synthRes = await fetch(
    `${voicevoxUrl}/synthesis?speaker=${SPEAKER_ID}`,
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
