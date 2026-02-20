import { readFileSync, writeFileSync, existsSync } from 'fs';
import { isVocabStale } from './vocab-constraints.js';
import { dataPath } from '../data-dir.js';

export class TextCache {
  constructor({ userId, inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._data = {};

    if (!inMemory && userId) {
      this._filePath = dataPath(`npc-dialogue-cache-${userId}.json`);
      this._load();
    }
  }

  _load() {
    if (this._inMemory || !this._filePath) return;
    if (existsSync(this._filePath)) {
      try {
        this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
      } catch {
        this._data = {};
      }
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  getAll() {
    return { ...this._data };
  }

  get(npcId) {
    return this._data[npcId] || null;
  }

  set(npcId, dialogue) {
    this._data[npcId] = dialogue;
    this._save();
  }

  remove(npcId) {
    delete this._data[npcId];
    this._save();
  }

  clear() {
    this._data = {};
    this._save();
  }

  /**
   * Check if cached dialogue is stale.
   * Stale if: missing, vocab grew past threshold, or memory changed.
   */
  isStale(npcId, currentVocabCount, currentMemorySnapshot) {
    const cached = this._data[npcId];
    if (!cached) return true;

    if (isVocabStale(cached.vocabSnapshot || 0, currentVocabCount)) {
      return true;
    }

    const snap = cached.memorySnapshot || {};
    if (snap.encounters !== currentMemorySnapshot.encounters ||
        snap.bond !== currentMemorySnapshot.bond ||
        snap.liberated !== currentMemorySnapshot.liberated) {
      return true;
    }

    return false;
  }

  /**
   * Extract previously generated lines for anti-repetition.
   */
  getPreviousLines(npcId) {
    const cached = this._data[npcId];
    if (!cached) return [];

    const lines = [];
    if (cached.greeting) lines.push(cached.greeting);
    if (cached.defeatLine) lines.push(cached.defeatLine);
    if (cached.freedLine) lines.push(cached.freedLine);
    if (cached.rounds) {
      for (const round of cached.rounds) {
        if (round.npcLine) lines.push(round.npcLine);
      }
    }
    return lines;
  }
}
