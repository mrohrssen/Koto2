/**
 * Loads the word dictionary at server startup.
 * 1. Load base dictionary (data/dictionary.json, 30-50k entries from JMdict)
 * 2. Overlay game data: creatures, moves, items, npcs, npc-skills, areas, glue-words, grammar-words
 * 3. Game entries replace base entries for their words
 * Returns Map<baseForm, { reading: string, definitions: [{ en: string, primary?: boolean }] }>
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadWordDictionary(dataDir) {
  const dict = new Map();

  // 1. Load base dictionary
  const basePath = join(dataDir, 'dictionary.json');
  if (existsSync(basePath)) {
    try {
      const base = JSON.parse(readFileSync(basePath, 'utf-8'));
      for (const [word, entry] of Object.entries(base)) {
        dict.set(word, entry);
      }
    } catch (e) {
      console.warn('[WordDictionary] Failed to load base dictionary:', e.message);
    }
  }

  // 2. Overlay game data files
  const overlayConfigs = [
    { file: 'creatures.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'moves.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'items.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npcs.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'npc-skills.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
    { file: 'areas.json', wordField: 'baseWord', readingField: 'baseReading', meaningField: 'baseMeaning' },
  ];

  for (const config of overlayConfigs) {
    overlayGameData(dict, join(dataDir, config.file), config);
  }

  // 3. Overlay curriculum files (glue-words, grammar-words)
  for (const file of ['glue-words.json', 'grammar-words.json']) {
    const filePath = join(dataDir, file);
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
      const word = entry[config.wordField];
      const reading = entry[config.readingField];
      const meaning = entry[config.meaningField];
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
