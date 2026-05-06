import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dataPath } from '../data-dir.js';

const DEFAULT_CACHE_FILE = 'dialogue-learn-cache.json';

export class DialogueLearnCache {
  static keyFor(sourceText, entitySignature = '', schemaVersion = 1) {
    const version = Number.isInteger(schemaVersion) && schemaVersion > 0 ? schemaVersion : 1;
    const text = String(sourceText || '').trim();
    const signature = String(entitySignature || '').trim();
    const base = `v${version}::${text}`;
    return signature ? `${base}\n::entities::${signature}` : base;
  }

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

  get(cacheKey) {
    return this._data[cacheKey] || null;
  }

  set(cacheKey, lesson, {
    sourceText = lesson?.sourceText || cacheKey,
    entitySignature = '',
    provider = '',
    model = ''
  } = {}) {
    const now = new Date().toISOString();
    const previous = this._data[cacheKey] || {};
    const entry = {
      sourceText,
      entitySignature,
      lesson,
      provider,
      model,
      createdAt: previous.createdAt || now,
      updatedAt: now
    };
    this._data[cacheKey] = entry;
    this._save();
    return entry;
  }

  getAll() {
    return { ...this._data };
  }
}
