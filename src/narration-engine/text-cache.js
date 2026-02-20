import { readFileSync, writeFileSync, existsSync } from 'fs';
import { isVocabStale } from './vocab-constraints.js';
import { dataPath } from '../data-dir.js';
import { getEntityType } from './entity-types/index.js';

export class TextCache {
  constructor({ userId, entityType = 'npc', inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._entityType = entityType;
    this._data = {};

    if (!inMemory && userId) {
      const { cachePrefix } = getEntityType(entityType);
      this._filePath = dataPath(`${cachePrefix}-${userId}.json`);
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
  isStale(entityId, currentVocabCount, currentMemorySnapshot) {
    const cached = this._data[entityId];
    if (!cached) return true;

    if (isVocabStale(cached.vocabSnapshot || 0, currentVocabCount)) {
      return true;
    }

    const snap = cached.memorySnapshot || {};
    for (const key of Object.keys(currentMemorySnapshot || {})) {
      if (snap[key] !== currentMemorySnapshot[key]) return true;
    }

    return false;
  }

  /**
   * Extract previously generated lines for anti-repetition.
   * Dispatches to the entity type's getPreviousLines implementation.
   */
  getPreviousLines(entityId) {
    const cached = this._data[entityId];
    if (!cached) return [];
    return getEntityType(this._entityType).getPreviousLines(cached);
  }
}
