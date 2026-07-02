import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { GameManager, cleanupDebugSuperAttack } from './loop.js';
import { getDataDir } from '../data-dir.js';
import { CREATURES_BY_ID, backfillCreatureListUids, syncCreatureListMoves, syncPartyCreatureMoves } from './creatures.js';
import { DEFAULT_COLLECTION, ensureCreatureCounts } from './services/creature-collection-service.js';
import { ensureTutorialFusionState } from './services/tutorial-service.js';
import { ensureCrystalMeta } from './services/crystal-wallet-service.js';
import { ensureKanjiKombatOnboardingState } from './state.js';
import { normalizeRankedState } from '../pvp/ranked-rating.js';
import { normalizePartySkills } from './party-skills.js';
import { writeFileAtomicSync } from '../atomic-write.js';
import { clearSrsCache } from './internal-srs.js';
import { clearScriptDeckMemo } from './script-srs.js';

const SAVE_VERSION = 2;

/** @type {Map<string, GameManager>} */
const managers = new Map();
const dirtyUsers = new Set();
const lastAccess = new Map(); // userId -> epoch ms
let flushTimer = null;
let evictionTimer = null;

const FLUSH_INTERVAL_MS = 5000;
const EVICTION_INTERVAL_MS = 60 * 1000;
const IDLE_EVICTION_MS = 30 * 60 * 1000;

/**
 * Get or create a GameManager for a user
 * Loads from .jrpg-save-{userId}.json if it exists
 * @param {string} userId
 * @returns {GameManager}
 */
export function getManager(userId) {
  lastAccess.set(userId, Date.now());
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
            needsSave = true;
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
          if (!Number.isFinite(data.meta.fusionCores)) {
            data.meta.fusionCores = 0;
          }
          const beforeCrystals = JSON.stringify({
            crystals: data.meta.crystals,
            lastCrystalLoginDate: data.meta.lastCrystalLoginDate,
            crystalCharges: data.meta.crystalCharges
          });
          ensureCrystalMeta(data.meta);
          const afterCrystals = JSON.stringify({
            crystals: data.meta.crystals,
            lastCrystalLoginDate: data.meta.lastCrystalLoginDate,
            crystalCharges: data.meta.crystalCharges
          });
          if (beforeCrystals !== afterCrystals) {
            needsSave = true;
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
          if (!Array.isArray(data.meta.bossesDefeated)) {
            data.meta.bossesDefeated = [];
            needsSave = true;
          }
          // Migrate: add tutorial fields for existing accounts
          if (data.meta.tutorialStep === undefined) {
            data.meta.tutorialStep = 6;
            data.meta.tutorialFireDropsGifted = false;
            needsSave = true;
          }
          const beforeTutorialFusion = JSON.stringify({
            tutorialFusionDataUnlocked: data.meta.tutorialFusionDataUnlocked,
            tutorialFusionCoreAwarded: data.meta.tutorialFusionCoreAwarded,
            tutorialFusionComplete: data.meta.tutorialFusionComplete,
            tutorialPostFusionNarrationShown: data.meta.tutorialPostFusionNarrationShown
          });
          ensureTutorialFusionState(data.meta);
          const afterTutorialFusion = JSON.stringify({
            tutorialFusionDataUnlocked: data.meta.tutorialFusionDataUnlocked,
            tutorialFusionCoreAwarded: data.meta.tutorialFusionCoreAwarded,
            tutorialFusionComplete: data.meta.tutorialFusionComplete,
            tutorialPostFusionNarrationShown: data.meta.tutorialPostFusionNarrationShown
          });
          if (beforeTutorialFusion !== afterTutorialFusion) {
            needsSave = true;
          }
          const beforeKanjiKombatOnboarding = JSON.stringify(data.meta.kanjiKombatOnboarding);
          ensureKanjiKombatOnboardingState(data.meta);
          if (JSON.stringify(data.meta.kanjiKombatOnboarding) !== beforeKanjiKombatOnboarding) {
            needsSave = true;
          }
          // Migrate: remove stale creature IDs and ensure defaults
          if (data.meta.creatureCollection) {
            const original = JSON.stringify(data.meta.creatureCollection);
            const originalCounts = JSON.stringify(data.meta.creatureCounts || {});
            data.meta.creatureCollection = data.meta.creatureCollection.filter(id => CREATURES_BY_ID[id]);
            for (const id of DEFAULT_COLLECTION) {
              if (!data.meta.creatureCollection.includes(id)) {
                data.meta.creatureCollection.push(id);
              }
            }
            if (!data.meta.creatureCounts || typeof data.meta.creatureCounts !== 'object' || Array.isArray(data.meta.creatureCounts)) {
              data.meta.creatureCounts = {};
            }
            for (const id of Object.keys(data.meta.creatureCounts)) {
              if (!CREATURES_BY_ID[id]) delete data.meta.creatureCounts[id];
            }
            ensureCreatureCounts(data.meta);
            if (
              JSON.stringify(data.meta.creatureCollection) !== original
              || JSON.stringify(data.meta.creatureCounts || {}) !== originalCounts
            ) {
              needsSave = true;
            }
          }
          const beforeRanked = JSON.stringify(data.meta.pvpRanked || null);
          data.meta.pvpRanked = normalizeRankedState(data.meta.pvpRanked);
          if (JSON.stringify(data.meta.pvpRanked) !== beforeRanked) {
            needsSave = true;
          }
          manager.initMeta(data.meta);
        }
        if (data.run) {
          manager.run = data.run;
          if (Array.isArray(manager.run?.partySkills)) {
            const normalized = normalizePartySkills(manager.run.partySkills);
            if (JSON.stringify(normalized) !== JSON.stringify(manager.run.partySkills)) {
              manager.run.partySkills = normalized;
              needsSave = true;
            }
          }
          // Lazy uid backfill — old saves lack per-instance uid on creatures.
          backfillCreatureListUids(manager.run?.creatureParty?.active);
          backfillCreatureListUids(manager.run?.creatureParty?.reserves);
          // Also backfill pendingCaptures (created during combat) and
          // dealer.offeredCreatures (sitting in shop rooms).
          backfillCreatureListUids(manager.run?.creatureParty?.pendingCaptures);
          needsSave = syncPartyCreatureMoves(manager.run?.creatureParty) || needsSave;
          // Strip lingering +100 ATK debug buffs from saves made when the
          // global debugSuperAttack toggle was on.
          needsSave = cleanupDebugSuperAttack(manager.run?.creatureParty?.active) || needsSave;
          needsSave = cleanupDebugSuperAttack(manager.run?.creatureParty?.reserves) || needsSave;
          needsSave = cleanupDebugSuperAttack(manager.run?.creatureParty?.pendingCaptures) || needsSave;
          for (const room of (manager.run?.rooms || [])) {
            backfillCreatureListUids(room?.dealer?.offeredCreatures);
            needsSave = syncCreatureListMoves(room?.dealer?.offeredCreatures) || needsSave;
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
          } else {
            // No run to share refs with — clean any stale debug buffs on the
            // standalone combat.allies copy.
            needsSave = cleanupDebugSuperAttack(manager.combat.allies) || needsSave;
          }
          // Backfill enemies — they are not shared references, so backfill directly.
          backfillCreatureListUids(manager.combat.enemies);
          needsSave = syncCreatureListMoves(manager.combat.enemies) || needsSave;
        }
        // Backfill uids on PvP team snapshots from older saves.
        for (const team of (manager.meta?.pvpTeams || [])) {
          if (team?.creatureParty) {
            backfillCreatureListUids(team.creatureParty.active);
            backfillCreatureListUids(team.creatureParty.reserves);
            needsSave = syncPartyCreatureMoves(team.creatureParty) || needsSave;
            needsSave = cleanupDebugSuperAttack(team.creatureParty.active) || needsSave;
            needsSave = cleanupDebugSuperAttack(team.creatureParty.reserves) || needsSave;
          }
          if (Array.isArray(team?.partySkills)) {
            const normalized = normalizePartySkills(team.partySkills);
            if (JSON.stringify(normalized) !== JSON.stringify(team.partySkills)) {
              team.partySkills = normalized;
              needsSave = true;
            }
          }
        }
      }
      if (needsSave) {
        console.log(`Migrated save data for user ${userId}`);
      }
    } catch (e) {
      console.warn(`Failed to load save for ${userId}:`, e.message);
    }
  }

  managers.set(userId, manager);
  if (needsSave) flushManager(userId);
  return manager;
}

/**
 * Mark a user's state dirty. Persisted by the maintenance loop (~5s),
 * by flushManager/flushAllDirty, on removeManager, and at shutdown.
 * Keeps the historical name because ~10 call sites treat "saveManager"
 * as "persist this user's state".
 * @param {string} userId
 */
export function saveManager(userId) {
  if (!managers.has(userId)) return;
  lastAccess.set(userId, Date.now());
  dirtyUsers.add(userId);
}

/**
 * Immediately serialize and atomically persist one user's state.
 * @param {string} userId
 */
export function flushManager(userId) {
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
  const json = process.env.NODE_ENV === 'production'
    ? JSON.stringify(state)
    : JSON.stringify(state, null, 2);
  writeFileAtomicSync(saveFile, json);
  dirtyUsers.delete(userId);
}

/**
 * Flush every dirty manager. Never throws (logs and continues).
 */
export function flushAllDirty() {
  for (const userId of [...dirtyUsers]) {
    try {
      flushManager(userId);
    } catch (e) {
      console.warn(`[Registry] Flush failed for ${userId}:`, e.message);
    }
  }
}

/**
 * Flush-if-dirty then drop managers idle longer than idleMs.
 * @param {{ now?: number, idleMs?: number }} [options]
 * @returns {number} count of evicted managers
 */
export function evictIdleManagers({ now = Date.now(), idleMs = IDLE_EVICTION_MS } = {}) {
  let evicted = 0;
  for (const [userId] of managers) {
    const last = lastAccess.get(userId) || 0;
    if (now - last < idleMs) continue;
    try {
      if (dirtyUsers.has(userId)) flushManager(userId);
      managers.delete(userId);
      lastAccess.delete(userId);
      clearSrsCache(userId);
      clearScriptDeckMemo(userId);
      evicted += 1;
    } catch (e) {
      console.warn(`[Registry] Eviction failed for ${userId}:`, e.message);
    }
  }
  return evicted;
}

/**
 * Started by server.js only. Timers are unref'd so they never hold the process open.
 * @param {{ flushIntervalMs?: number, evictionIntervalMs?: number }} [options]
 */
export function startMaintenanceLoop({ flushIntervalMs = FLUSH_INTERVAL_MS, evictionIntervalMs = EVICTION_INTERVAL_MS } = {}) {
  stopMaintenanceLoop();
  flushTimer = setInterval(flushAllDirty, flushIntervalMs);
  flushTimer.unref?.();
  evictionTimer = setInterval(() => evictIdleManagers(), evictionIntervalMs);
  evictionTimer.unref?.();
}

export function stopMaintenanceLoop() {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (evictionTimer) { clearInterval(evictionTimer); evictionTimer = null; }
}

/**
 * Remove a manager from the registry (for cleanup/testing).
 * Flushes dirty state first so callers that expect immediate-persist
 * semantics (ranked-bot-seeder, user-data-reset) keep working unchanged.
 * @param {string} userId
 */
export function removeManager(userId) {
  if (dirtyUsers.has(userId)) {
    try { flushManager(userId); } catch (e) {
      console.warn(`[Registry] Flush-on-remove failed for ${userId}:`, e.message);
    }
  }
  managers.delete(userId);
  lastAccess.delete(userId);
  dirtyUsers.delete(userId);
}

/**
 * Remove all managers from the registry (for test isolation).
 * Stops maintenance timers and clears state WITHOUT writing.
 */
export function clearManagersForTest() {
  stopMaintenanceLoop();
  managers.clear();
  dirtyUsers.clear();
  lastAccess.clear();
}

/**
 * Get the save file path for a user
 * @param {string} userId
 * @returns {string}
 */
export function getSaveFilePath(userId) {
  return join(getDataDir(), `.jrpg-save-${userId}.json`);
}
