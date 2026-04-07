import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GameManager } from './loop.js';
import { DATA_DIR } from '../data-dir.js';
import { CREATURES_BY_ID } from './creatures.js';
import { DEFAULT_COLLECTION } from './services/creature-collection-service.js';

const SAVE_VERSION = 2;

/** @type {Map<string, GameManager>} */
const managers = new Map();

/**
 * Get or create a GameManager for a user
 * Loads from .jrpg-save-{userId}.json if it exists
 * @param {string} userId
 * @returns {GameManager}
 */
export function getManager(userId) {
  if (managers.has(userId)) return managers.get(userId);

  const manager = new GameManager();
  manager.userId = userId;
  // Ensure meta always exists (routes may touch gm.meta before a save file exists).
  manager.initMeta();
  const saveFile = join(DATA_DIR, `.jrpg-save-${userId}.json`);
  let needsSave = false;

  if (existsSync(saveFile)) {
    try {
      const data = JSON.parse(readFileSync(saveFile, 'utf-8'));
      if (data.version && data.version >= SAVE_VERSION) {
        if (data.player) manager.loadPlayer(data.player);
        if (data.meta) {
          // Migrate: add levels if missing from old saves
          if (!data.meta.levels) {
            data.meta.levels = {
              highestUnlocked: 1,
              completed: [],
              current: null
            };
          }
          // Migrate: rename robotCollection → creatureCollection (no version bump)
          if (data.meta.robotCollection && !data.meta.creatureCollection) {
            data.meta.creatureCollection = data.meta.robotCollection;
            delete data.meta.robotCollection;
            needsSave = true;
          }
          // Migrate: remove old meta-upgrade fields, add crest fields
          delete data.meta.progressionTokens;
          delete data.meta.upgrades;
          if (!data.meta.elementDrops) {
            data.meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
          }
          if (!data.meta.crests) {
            data.meta.crests = [];
          }
          if (!data.meta.equippedCrests) {
            data.meta.equippedCrests = { fire: null, water: null, earth: null, wood: null, metal: null };
          }
          // Migrate: add tutorial fields for existing accounts
          if (data.meta.tutorialStep === undefined) {
            data.meta.tutorialStep = 7;
            data.meta.tutorialFireDropsGifted = false;
            needsSave = true;
          }
          // Migrate: remove stale creature IDs and ensure defaults
          if (data.meta.creatureCollection) {
            const original = JSON.stringify(data.meta.creatureCollection);
            data.meta.creatureCollection = data.meta.creatureCollection.filter(id => CREATURES_BY_ID[id]);
            for (const id of DEFAULT_COLLECTION) {
              if (!data.meta.creatureCollection.includes(id)) {
                data.meta.creatureCollection.push(id);
              }
            }
            if (JSON.stringify(data.meta.creatureCollection) !== original) {
              needsSave = true;
            }
          }
          manager.initMeta(data.meta);
        }
        if (data.run) manager.run = data.run;
        if (data.combat) manager.combat = data.combat;
      }
      if (needsSave) {
        console.log(`Migrated stale creature IDs for user ${userId}`);
      }
    } catch (e) {
      console.warn(`Failed to load save for ${userId}:`, e.message);
    }
  }

  managers.set(userId, manager);
  if (needsSave) saveManager(userId);
  return manager;
}

/**
 * Save a user's GameManager state to disk
 * @param {string} userId
 */
export function saveManager(userId) {
  const manager = managers.get(userId);
  if (!manager) return;

  const saveFile = join(DATA_DIR, `.jrpg-save-${userId}.json`);
  const state = {
    version: SAVE_VERSION,
    player: manager.player,
    meta: manager.getMeta(),
    run: manager.run || null,
    combat: manager.combat || null,
    savedAt: new Date().toISOString()
  };
  writeFileSync(saveFile, JSON.stringify(state, null, 2));
}

/**
 * Remove a manager from the registry (for cleanup/testing)
 * @param {string} userId
 */
export function removeManager(userId) {
  managers.delete(userId);
}

/**
 * Get the save file path for a user
 * @param {string} userId
 * @returns {string}
 */
export function getSaveFilePath(userId) {
  return join(DATA_DIR, `.jrpg-save-${userId}.json`);
}
