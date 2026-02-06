import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GameManager } from './loop.js';
import { DATA_DIR } from '../data-dir.js';

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
  const saveFile = join(DATA_DIR, `.jrpg-save-${userId}.json`);

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
          manager.initMeta(data.meta);
        }
      }
    } catch (e) {
      console.warn(`Failed to load save for ${userId}:`, e.message);
    }
  }

  managers.set(userId, manager);
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
