import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GameManager } from './loop.js';
import { getDataDir } from '../data-dir.js';
import { CREATURES_BY_ID, backfillCreatureListUids } from './creatures.js';
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
  const saveFile = join(getDataDir(), `.jrpg-save-${userId}.json`);
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
          if (!data.meta.itemsDiscovered) {
            data.meta.itemsDiscovered = [];
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
        if (data.run) {
          manager.run = data.run;
          // Lazy uid backfill — old saves lack per-instance uid on creatures.
          backfillCreatureListUids(manager.run?.creatureParty?.active);
          backfillCreatureListUids(manager.run?.creatureParty?.reserves);
          // Also backfill pendingCaptures (created during combat) and
          // dealer.offeredCreatures (sitting in shop rooms).
          backfillCreatureListUids(manager.run?.creatureParty?.pendingCaptures);
          for (const room of (manager.run?.rooms || [])) {
            backfillCreatureListUids(room?.dealer?.offeredCreatures);
          }
        }
        if (data.combat) {
          manager.combat = data.combat;
          // Re-sync combat.allies → run.creatureParty.active after deserialization.
          // JSON round-trip breaks the shared reference that combat.allies normally
          // holds to run.creatureParty.active, causing mid-round HP mutations on
          // combat.allies to silently diverge from the party state.
          if (manager.run?.creatureParty?.active && manager.combat.allies) {
            manager.combat.allies = manager.run.creatureParty.active;
          }
          // Backfill enemies — they are not shared references, so backfill directly.
          backfillCreatureListUids(manager.combat.enemies);
        }
        // Backfill uids on PvP team snapshots from older saves.
        for (const team of (manager.meta?.pvpTeams || [])) {
          if (team?.creatureParty) {
            backfillCreatureListUids(team.creatureParty.active);
            backfillCreatureListUids(team.creatureParty.reserves);
          }
        }
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

  const saveFile = join(getDataDir(), `.jrpg-save-${userId}.json`);
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
 * Remove all managers from the registry (for test isolation)
 */
export function clearManagersForTest() {
  managers.clear();
}

/**
 * Get the save file path for a user
 * @param {string} userId
 * @returns {string}
 */
export function getSaveFilePath(userId) {
  return join(getDataDir(), `.jrpg-save-${userId}.json`);
}
