import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class TtsCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.manifest = null;
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
      wordCount: this.manifest ? Object.keys(this.manifest.entries).length : 0
    };
  }
}
