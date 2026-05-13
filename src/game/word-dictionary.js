import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Load the word dictionary.
 *
 * @param {object} opts
 * @param {string} opts.overlayDir - directory containing creatures.json, moves.json, etc.
 * @param {string} opts.liveDictPath - absolute path to the live dictionary JSON file
 * @returns {Map<string, {reading: string, definitions: {en: string, primary?: boolean}[]}>}
 */
export function loadWordDictionary({ overlayDir, liveDictPath }) {
  const dict = new Map();

  // 1. Load base live dictionary
  if (liveDictPath && existsSync(liveDictPath)) {
    try {
      const base = JSON.parse(readFileSync(liveDictPath, 'utf-8'));
      for (const [word, entry] of Object.entries(base)) {
        dict.set(word, entry);
      }
    } catch (e) {
      console.warn('[WordDictionary] Failed to load base dictionary:', e.message);
    }
  }

  // 2. Overlay game data files (always read from overlayDir)
  const overlayConfigs = [
    { file: 'creatures.json', wordField: 'name', readingField: 'reading', meaningField: 'meaning' },
    { file: 'moves.json', wordField: 'name', readingField: 'reading', meaningField: 'meaning' },
    { file: 'items.json', wordField: 'word', readingField: 'reading', meaningField: 'meaning' },
    { file: 'cooking/ingredients.json', wordField: 'word', readingField: 'reading', meaningField: 'meaning' },
    { file: 'npcs.json', wordField: 'name', readingField: 'reading', meaningField: 'meaning' },
    { file: 'npc-skills.json', wordField: 'name', readingField: 'reading', meaningField: 'meaning' },
    { file: 'areas.json', wordField: 'name', readingField: 'reading', meaningField: 'nameEn' },
  ];

  for (const config of overlayConfigs) {
    overlayGameData(dict, join(overlayDir, config.file), config);
  }

  // 3. Overlay curriculum files
  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const filePath = join(overlayDir, file);
    if (!existsSync(filePath)) continue;
    try {
      const entries = JSON.parse(readFileSync(filePath, 'utf-8'));
      for (const entry of entries) {
        dict.set(entry.word, {
          reading: entry.reading,
          definitions: [{ en: entry.en, primary: true }],
        });
      }
    } catch (e) {
      console.warn(`[WordDictionary] Failed to load ${file}:`, e.message);
    }
  }

  return dict;
}

function overlayGameData(dict, filePath, config) {
  if (!existsSync(filePath)) return;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const entries = Array.isArray(raw) ? raw : Object.values(raw);
    for (const entry of entries) {
      const word = firstField(entry, config.wordFields || [config.wordField]);
      const reading = firstField(entry, config.readingFields || [config.readingField]);
      const meaning = firstField(entry, config.meaningFields || [config.meaningField]);
      if (!word || !meaning) continue;
      dict.set(word, {
        reading: reading || word,
        definitions: [{ en: meaning, primary: true }],
      });
    }
  } catch (e) {
    console.warn(`[WordDictionary] Failed to load ${filePath}:`, e.message);
  }
}

function firstField(entry, fields) {
  for (const field of fields) {
    const value = entry[field];
    if (value != null && value !== '') return value;
  }
  return undefined;
}
