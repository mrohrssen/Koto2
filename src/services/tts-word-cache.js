import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  utimesSync
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export class TtsWordCache {
  constructor(cacheDir, { maxEntries = 2000 } = {}) {
    this.cacheDir = cacheDir;
    this.maxEntries = maxEntries;
    this.lastMtimeMs = 0;
  }

  async synthesizeWord(text, speakerId, speedScale, synthesizeFn) {
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedSpeakerId = Number(speakerId);
    const normalizedSpeed = normalizeSpeedScale(speedScale);
    if (!normalizedText || !Number.isFinite(normalizedSpeakerId) || !synthesizeFn) return null;

    mkdirSync(this.cacheDir, { recursive: true });
    const filename = `${hashKey(normalizedText, normalizedSpeakerId, normalizedSpeed)}.wav`;
    const filePath = join(this.cacheDir, filename);

    if (existsSync(filePath)) {
      this.touch(filePath);
      return { filename, cacheHit: true };
    }

    const wav = await synthesizeFn(normalizedText, normalizedSpeakerId, normalizedSpeed);
    writeFileSync(filePath, wav);
    this.touch(filePath);
    this.evictOldEntries();
    return { filename, cacheHit: false };
  }

  lookup(filename) {
    if (!String(filename || '').match(/^[a-f0-9]{12}\.wav$/)) return null;
    try {
      return readFileSync(join(this.cacheDir, filename));
    } catch {
      return null;
    }
  }

  touch(filePath) {
    const mtimeMs = Math.max(Date.now(), this.lastMtimeMs + 1);
    this.lastMtimeMs = mtimeMs;
    const timestamp = new Date(mtimeMs);
    try {
      utimesSync(filePath, timestamp, timestamp);
    } catch {
      // Cache recency is an optimization; failed touches should not break audio.
    }
  }

  evictOldEntries() {
    if (!Number.isFinite(this.maxEntries) || this.maxEntries <= 0) return;

    let entries = [];
    try {
      entries = readdirSync(this.cacheDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.match(/^[a-f0-9]{12}\.wav$/))
        .map(entry => {
          const filePath = join(this.cacheDir, entry.name);
          const stats = statSync(filePath);
          return { filePath, mtimeMs: stats.mtimeMs, name: entry.name };
        });
    } catch {
      return;
    }

    if (entries.length <= this.maxEntries) return;

    entries.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
    for (const entry of entries.slice(0, entries.length - this.maxEntries)) {
      try {
        unlinkSync(entry.filePath);
      } catch {
        // Another request may have removed it already.
      }
    }
  }
}

function normalizeSpeedScale(speedScale) {
  const speed = Number(speedScale);
  return Number.isFinite(speed) ? Number(speed.toFixed(3)) : 0.9;
}

function hashKey(text, speakerId, speedScale) {
  return createHash('md5')
    .update(`${speakerId}:${speedScale}:${text}`)
    .digest('hex')
    .slice(0, 12);
}
