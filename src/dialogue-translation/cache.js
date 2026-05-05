import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dataPath } from '../data-dir.js';

const DEFAULT_CACHE_FILE = 'dialogue-translation-cache.json';

export class DialogueTranslationCache {
  constructor({ inMemory = false, fileName = DEFAULT_CACHE_FILE } = {}) {
    this._inMemory = inMemory;
    this._filePath = inMemory ? null : dataPath(fileName);
    this._data = {};
    this._load();
  }

  _load() {
    if (this._inMemory || !this._filePath || !existsSync(this._filePath)) return;
    try {
      this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
    } catch {
      this._data = {};
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  get(sourceText) {
    return this._data[sourceText] || null;
  }

  set(sourceText, translation, { provider = '', model = '' } = {}) {
    const now = new Date().toISOString();
    const previous = this._data[sourceText] || {};
    const entry = {
      sourceText,
      translation,
      provider,
      model,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };

    this._data[sourceText] = entry;
    this._save();
    return entry;
  }

  getAll() {
    return { ...this._data };
  }
}
