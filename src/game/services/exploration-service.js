import { generateEncounterCount } from '../state.js';
import { ensureRoomActionSeq, getRoomRevealAhead } from '../room-reveal-buffer.js';

import {
  generateAreaRooms,
  getRoomEntryNarration,
  getRoomActions,
  getAreaSelectionOptions,
  getAreaById,
  createRoom,
  ROOM_TYPES,
  popTestRoomType,
  resolveSupportRoom,
  finalizeRandomRoom
} from '../rooms.js';

import { addXpToCreature, xpToNextLevel, instantiateCreature, getCreatureBuyPrice, getCreatureSellPrice, generateDealerCreatures } from '../creatures.js';
import { logger } from '../../logger.js';
import { getDueCards } from '../internal-srs.js';
import { hydrateCards } from '../bootstrap/word-knowledge.js';
import {
  applyPartySkillChoice,
  canonicalPartySkillTreeId,
  getPostCombatRecoveryMultiplier,
  normalizePartySkills,
  rollSkillMasterOffers,
  getPartySkillOfferDisplay,
  syncPartySkillHpBonuses
} from '../party-skills.js';
import { applyHeal } from '../combat/effects.js';
import { loadNpcs } from './npc-service.js';
import { applyCrestBonuses } from './crest-service.js';
import { shouldOverrideSkillOffers, advanceTutorial, shouldFixRoomSequence } from './tutorial-service.js';
import {
  addIngredientsToBag,
  applyCampfireCook as applyCampfireCookMutation,
  applyCampfireFeed as applyCampfireFeedMutation,
  applyCampfireSkip as applyCampfireSkipMutation,
  COOKING_INGREDIENTS,
  rollRoomIngredientDrops
} from './cooking-service.js';
import { buildExploreRunway } from './explore-runway-service.js';
import { rollFriendlyNpcOffers } from './friendly-npc-offers.js';
import { applyItem } from './item-service.js';
import { entityToToken } from '../token-format.js';

const ROOM_HEAL_PERCENT = 0.05; // 5% maxHp on each room entry, skipping KO'd creatures
const STARTING_MEADOW_AREA_ID = 'hajimari-no-hiroba';
const STARTING_MEADOW_TUTORIAL_INGREDIENT_DROPS = Object.freeze([
  'mizu',
  'gyuunyuu',
  'toriniku',
  'jagaimo'
]);
const SHRINE_REWARDS = Object.freeze({
  HEAL_ALL: 'heal_all',
  RESTORE_MP_ALL: 'restore_mp_all',
  LEVEL_UP: 'level_up'
});

function ensureShrineState(room) {
  if (!room.shrine) room.shrine = {};
  room.shrine.used = room.shrine.used === true;
  room.shrine.completed = room.shrine.completed === true || room.shrine.used === true;
  if (!Object.prototype.hasOwnProperty.call(room.shrine, 'chosenReward')) room.shrine.chosenReward = null;
  if (!Object.prototype.hasOwnProperty.call(room.shrine, 'greeting')) room.shrine.greeting = null;
  return room.shrine;
}

function getCreatureKey(creature) {
  return creature?.uid || creature?.instanceId || creature?.id || '';
}

function getAllPartyCreatures(creatureParty) {
  return [
    ...(creatureParty?.active || []),
    ...(creatureParty?.reserves || [])
  ].filter(Boolean);
}

const AREA_BG_COUNT = 20;
function randomAreaBg(areaId) {
  const n = Math.floor(Math.random() * AREA_BG_COUNT) + 1;
  return `areas/${areaId}/${areaId}_${String(n).padStart(2, '0')}.webp`;
}

/**
 * Get background for a room — uses sub-area background if available, otherwise random
 */
function getBackgroundForRoom(room, areaId) {
  const activeRoom = Array.isArray(room) ? room[0] : room;
  if (activeRoom?.subArea?.background) return activeRoom.subArea.background;
  // Fall back to area-level background if available
  const area = getAreaById(areaId);
  if (area?.background) return area.background;
  return randomAreaBg(areaId);
}

function calculateDiscoveryXpForRun(run) {
  const BASE_KILL_XP = 10;
  const livingActives = run?.creatureParty?.active?.filter(creature => creature && creature.hp > 0) || [];
  const highestLevel = livingActives.length > 0
    ? Math.max(...livingActives.map(creature => creature.level), 1)
    : 1;
  return Math.floor(BASE_KILL_XP * highestLevel * (run?.itemBuffs?.xpMultiplier || 1.0) * 0.2);
}

function buildSpeedReviewWordKey(word) {
  return String(word);
}

function getStartingMeadowTutorialIngredientDrops(meta, run, roomIndex = run?.currentRoom || 0) {
  if (!shouldFixRoomSequence(meta)) return null;
  if (run?.currentArea?.id !== STARTING_MEADOW_AREA_ID) return null;

  const ingredientId = STARTING_MEADOW_TUTORIAL_INGREDIENT_DROPS[roomIndex - 1];
  return ingredientId ? [{ id: ingredientId, quantity: 1 }] : null;
}

/**
 * ExplorationService - Handles dungeon exploration and room interactions
 */
export class ExplorationService {
  /**
   * @param {GameManager} gameManager - Reference to parent GameManager
   */
  constructor(gameManager, { ingredientDropRandom = Math.random } = {}) {
    this.gm = gameManager;
    this.ingredientDropRandom = ingredientDropRandom;
  }

  async buildExploreRunway(opts = {}) {
    return buildExploreRunway(this.gm, opts);
  }

  /**
   * Heal living creatures when entering a new room.
   * KO'd creatures (hp <= 0) must remain KO'd unless a revive happens elsewhere.
   */
  _healAllLivingCreaturesForRoomEntry() {
    const party = this.gm.run?.creatureParty;
    if (!party) return;
    syncPartySkillHpBonuses(party, this.gm.run?.partySkills || []);
    const recoveryMultiplier = getPostCombatRecoveryMultiplier(this.gm.run?.partySkills || []);

    const active = Array.isArray(party.active) ? party.active : [];
    const reserves = Array.isArray(party.reserves) ? party.reserves : [];
    const allCreatures = [...active, ...reserves].filter(Boolean);

    for (const creature of allCreatures) {
      if (!creature || typeof creature.hp !== 'number' || creature.hp <= 0) continue; // never revive here
      if (typeof creature.maxHp !== 'number') continue;

      const healAmount = Math.floor(creature.maxHp * ROOM_HEAL_PERCENT * recoveryMultiplier);
      if (healAmount <= 0) continue;
      applyHeal(creature, healAmount);
    }
  }

  /**
   * Clear combat-scoped buffs/debuffs (stat stages + activeEffects) on every
   * room entry. Mirrors the user's rule: "All buffs and debuffs should clear
   * on room transitions." Previously cleared at combat-end, which made pills
   * vanish mid-playback; deferring to room entry keeps them visible through
   * the victory modal / friendlyNpc reward screen until the user moves on.
   */
  _clearCombatBuffsForRoomEntry() {
    const party = this.gm.run?.creatureParty;
    if (!party) return;

    const active = Array.isArray(party.active) ? party.active : [];
    const reserves = Array.isArray(party.reserves) ? party.reserves : [];
    for (const creature of [...active, ...reserves]) {
      if (!creature) continue;
      creature.statStages = { atk: 0, def: 0, dex: 0 };
      creature.activeEffects = [];
    }
  }

  _assignFriendlyNpcIfNeeded(room) {
    if (room?.type !== 'friendlyNpc' || room.npc) return;
    try {
      const npcs = loadNpcs();
      const npcAreaId = this.gm.run.currentArea?.id || null;
      const areaNpcs = Object.values(npcs).filter(n => !npcAreaId || n.area === npcAreaId || !n.area);
      if (areaNpcs.length > 0) {
        const picked = areaNpcs[Math.floor(Math.random() * areaNpcs.length)];
        room.npc = { id: picked.id, name: picked.name, nameEn: picked.nameEn };
      }
    } catch (err) {
      logger.error('[Exploration] Failed to assign NPC to friendlyNpc room:', err.message);
    }
  }

  prepareRoomForReveal(roomIndex) {
    const run = this.gm.run;
    if (!run?.rooms?.length || !Number.isInteger(roomIndex)) return null;
    const room = run.rooms[roomIndex];
    if (!room) return null;

    resolveSupportRoom(room, run);
    finalizeRandomRoom(room, run);
    const prepared = run.rooms[roomIndex];
    this._assignFriendlyNpcIfNeeded(prepared);
    return prepared;
  }

  prepareRoomRevealBuffer() {
    const run = this.gm.run;
    if (!run?.rooms?.length) return [];

    ensureRoomActionSeq(run);
    const currentRoom = Number.isInteger(run.currentRoom) ? run.currentRoom : 0;
    const revealAhead = getRoomRevealAhead(run);
    const endIndex = Math.min(run.rooms.length - 1, currentRoom + revealAhead);
    const prepared = [];

    for (let index = currentRoom; index <= endIndex; index += 1) {
      const room = this.prepareRoomForReveal(index);
      if (room) prepared.push(room);
    }

    return prepared;
  }

  prepareRoomEntryIngredientDrops(roomIndex) {
    const run = this.gm.run;
    if (!run?.rooms?.length || !Number.isInteger(roomIndex)) return [];
    const room = run.rooms[roomIndex];
    if (!room) return [];
    if (Array.isArray(room.entryIngredientDrops)) return room.entryIngredientDrops;

    const drops = getStartingMeadowTutorialIngredientDrops(this.gm.meta, run, roomIndex)
      || rollRoomIngredientDrops({ rng: this.ingredientDropRandom });
    const ingredientsById = new Map(COOKING_INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));
    room.entryIngredientDrops = drops.map(drop => {
      const ingredient = ingredientsById.get(drop.id);
      return { ...drop, ingredient, nameToken: entityToToken(ingredient) };
    });
    return room.entryIngredientDrops;
  }

  _rollRoomIngredientDrops() {
    if (!this.gm.run.cooking) this.gm.run.cooking = { ingredients: {}, cookedThisRun: [] };
    if (!this.gm.run.cooking.ingredients) this.gm.run.cooking.ingredients = {};
    if (!Array.isArray(this.gm.run.cooking.cookedThisRun)) this.gm.run.cooking.cookedThisRun = [];

    const drops = this.prepareRoomEntryIngredientDrops(this.gm.run.currentRoom);
    if (drops.length === 0) return [];

    addIngredientsToBag(this.gm.run.cooking.ingredients, drops);
    if (this.gm.run.runSummary) {
      this.gm.run.runSummary.itemsCollected += drops.reduce((sum, drop) => sum + drop.quantity, 0);
    }
    const room = this.gm.run.rooms?.[this.gm.run.currentRoom];
    if (room) room.entryIngredientDropsAwarded = true;
    return drops;
  }

  // ============ AREA SELECTION ============

  /**
   * Get area options for selection
   * @returns {Array} 2 random area options
   */
  getAreaOptions() {
    const excludeId = this.gm.run?.currentArea?.id || null;
    const highestUnlocked = this.gm.meta?.levels?.highestUnlocked || 1;
    return getAreaSelectionOptions(excludeId, highestUnlocked);
  }

  /**
   * Select an area (works for both start and between areas)
   * @param {string} areaId - Area ID to select
   */
  selectArea(areaId, forceRoomType = null) {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    const area = getAreaById(areaId);
    if (!area) {
      throw new Error(`Invalid area: ${areaId}`);
    }

    this.gm.run.currentArea = area;
    this.gm.run.areaPath.push(areaId);
    this.gm.run.areaSelectionRequired = false;
    this.gm.run.areaCleared = false;

    // Enter the area
    this.enterArea(forceRoomType);

    logger.info('[Exploration] Area selected:', { area: areaId, areasCompleted: this.gm.run.areasCompleted });

    return {
      success: true,
      area,
      areasCompleted: this.gm.run.areasCompleted
    };
  }

  /**
   * Enter an area — generate rooms, set background, reset per-area state
   */
  enterArea(forceRoomType = null) {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    const areaId = this.gm.run.currentArea?.id || 'unknown';

    // Reset per-area state
    this.gm.run.currentAreaEncounters = 0;
    this.gm.run.areaCleared = false;

    // Generate rooms for this area (area-defined count, defaulting to 30)
    const tutorialMode = shouldFixRoomSequence(this.gm.meta);
    this.gm.run.rooms = generateAreaRooms(areaId, undefined, undefined, undefined, undefined, tutorialMode);
    if (this.gm.run.rooms[0]) {
      finalizeRandomRoom(this.gm.run.rooms[0], this.gm.run);
      this._assignFriendlyNpcIfNeeded(this.gm.run.rooms[0]);
    }
    // encountersNeeded is kept for backwards-compat with other code.
    this.gm.run.encountersNeeded = this.gm.run.rooms.length;
    this.gm.run.currentRoom = 0;
    this.gm.run.roomsExplored = 0;

    // Set background: sub-area-specific if available, otherwise random
    const firstRoom = this.gm.run.rooms[0];
    this.gm.run.background = getBackgroundForRoom(firstRoom, areaId);

    // Mark first room as explored
    if (this.gm.run.rooms.length > 0) {
      this.gm.run.rooms[0].explored = true;
      this.gm.run.roomsExplored = 1;
      // totalEncounters is used as a global "rooms entered" counter for scaling.
      // Count the first room immediately when entering an area.
      this.gm.run.totalEncounters = (this.gm.run.totalEncounters || 0) + 1;

      // Per-room regen: heal all living creatures on first room entry too.
      this._healAllLivingCreaturesForRoomEntry();
      // Clear combat-scoped buffs/debuffs so stat pills don't leak across
      // areas (e.g. def+1 from the prior area's final combat).
      this._clearCombatBuffsForRoomEntry();
    }

    ensureRoomActionSeq(this.gm.run);
    this.prepareRoomRevealBuffer();

    const areaName = this.gm.run.currentArea?.nameEn || areaId;
    this.gm.narrate(`${areaName}に到着した。探索を開始する...`);

    logger.info('[Exploration] Entered area:', { areaId, rooms: this.gm.run.rooms?.length });

    this.gm.emitState();

    return {
      areaId,
      totalRooms: this.gm.run.rooms.length,
      encountersNeeded: this.gm.run.encountersNeeded,
      firstRoom: this.gm.run.rooms[0]
    };
  }

  // ============ ROOM NAVIGATION ============

  /**
   * Get current room info
   */
  getCurrentRoom() {
    if (!this.gm.run?.rooms?.length) {
      return null;
    }
    return this.gm.run.rooms[this.gm.run.currentRoom];
  }

  /**
   * Proceed to next room
   */
  proceedToNextRoom(forceRoomType = null) {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    const currentRoom = this.getCurrentRoom();
    if (!currentRoom) {
      throw new Error('No current room');
    }

    // Can't proceed if encounter not completed
    if (currentRoom.type === 'encounter' && !currentRoom.interacted) {
      throw new Error('Must complete encounter before proceeding');
    }

    if (currentRoom.type === 'skillMaster' && currentRoom.skillMaster?.completed !== true) {
      throw new Error('Must complete Skill Master before proceeding');
    }

    // Move to next room
    this.gm.run.currentRoom++;
    this.gm.run.roomActionSeq = ensureRoomActionSeq(this.gm.run) + 1;

    // Check if we've run out of rooms (area complete)
    if (this.gm.run.currentRoom >= this.gm.run.rooms.length) {
      this.gm.run.areaCleared = true;
      this.gm.run.areasCompleted++;
      this.gm.run.stats.areasCleared = this.gm.run.areasCompleted;

      const areaName = this.gm.run.currentArea?.nameEn || 'Unknown';
      this.gm.narrate(`${areaName}を制覇した！`);

      logger.info('[Exploration] Area cleared:', { areasCompleted: this.gm.run.areasCompleted });

      // Check win condition — run ends, show run-complete screen
      if (this.gm.run.areasCompleted >= this.gm.run.areasToWin) {
        this.gm.run.gameVictoryPending = true;
        this.gm.emitState();
        return {
          areaCleared: true,
          areasCompleted: this.gm.run.areasCompleted,
          areasToWin: this.gm.run.areasToWin,
          gameVictory: true
        };
      }

      // Run continues — auto-select when only one area option available
      const areaOptions = this.getAreaOptions();
      if (areaOptions.length === 1) {
        logger.info('[Exploration] Single area available — auto-selecting:', { areaId: areaOptions[0].id });
        this.selectArea(areaOptions[0].id);
        return {
          areaCleared: true,
          areasCompleted: this.gm.run.areasCompleted,
          areasToWin: this.gm.run.areasToWin,
          gameVictory: false,
          autoSelectedArea: areaOptions[0].id
        };
      }

      this.gm.run.areaSelectionRequired = true;
      this.gm.emitState();

      return {
        areaCleared: true,
        areasCompleted: this.gm.run.areasCompleted,
        areasToWin: this.gm.run.areasToWin,
        gameVictory: false
      };
    }

    const nextRoom = this.gm.run.rooms[this.gm.run.currentRoom];

    // Test queue override — pop queued room type (NODE_ENV=test or debug mode)
    const queuedType = popTestRoomType();
    if (queuedType && ROOM_TYPES[queuedType] && nextRoom.type !== queuedType) {
      const areaId = this.gm.run.currentArea?.id || 'unknown';
      const replaced = createRoom(queuedType, areaId, nextRoom.roomNumber, nextRoom.totalRooms);
      if (nextRoom.subArea) replaced.subArea = nextRoom.subArea;
      this.gm.run.rooms[this.gm.run.currentRoom] = replaced;
    }

    // Single room - override type if forceRoomType is set
    if (forceRoomType && ROOM_TYPES[forceRoomType] && nextRoom.type !== forceRoomType) {
      const areaId = this.gm.run.currentArea?.id || 'unknown';
      const replaced = createRoom(forceRoomType, areaId, nextRoom.roomNumber, nextRoom.totalRooms);
      if (nextRoom.subArea) replaced.subArea = nextRoom.subArea;
      this.gm.run.rooms[this.gm.run.currentRoom] = replaced;
    }
    let room = this.gm.run.rooms[this.gm.run.currentRoom]; // re-read after possible replacement
    resolveSupportRoom(room, this.gm.run);
    finalizeRandomRoom(room, this.gm.run);
    room = this.gm.run.rooms[this.gm.run.currentRoom];

    // Mark as explored
    room.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Increment global room counter for enemy scaling (all room types).
    this.gm.run.totalEncounters = (this.gm.run.totalEncounters || 0) + 1;

    // Per-room regen: heal all living creatures between rooms.
    this._healAllLivingCreaturesForRoomEntry();
    // Clear combat-scoped buffs/debuffs on every room transition. Kept here
    // (not at combat-end) so stat pills stay visible through the victory
    // modal / friendlyNpc reward screen and clear only when the user
    // physically moves on. See the note in resolution.js:finalizeCombatVictory.
    this._clearCombatBuffsForRoomEntry();
    const ingredientDrops = this._rollRoomIngredientDrops();

    // Vary background per room — sub-area-specific if available
    const areaId = this.gm.run.currentArea?.id || 'okunomori';
    this.gm.run.background = getBackgroundForRoom(room, areaId);

    // Track room clears
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Assign area NPC to friendlyNpc rooms for transition display
    this._assignFriendlyNpcIfNeeded(room);
    this.prepareRoomRevealBuffer();

    // Get narration for new room
    const narration = getRoomEntryNarration(room);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Proceeded to room:', { type: room.type, index: this.gm.run.currentRoom, hasNpc: !!room.npc, npcId: room.npc?.id });

    return {
      room,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(room),
      narration,
      ingredientDrops
    };
  }

  applyExploreProceed() {
    return this.proceedToNextRoom();
  }

  // ============ ROOM INTERACTIONS ============

  applyFriendlyNpcChoose({ itemId, targetCreatureIndex } = {}) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'friendlyNpc') {
      throw new Error('Not in a friendly NPC room');
    }
    if (!room.friendlyNpc.offered) {
      throw new Error('No offers generated yet');
    }
    if (room.friendlyNpc.completed) {
      throw new Error('Friendly NPC already completed');
    }

    const item = room.friendlyNpc.offered.find(i => i.id === itemId);
    if (!item) {
      throw new Error('Invalid item choice');
    }
    if (item.category !== 'equipment') {
      throw new Error('Friendly NPC shops only offer equipment');
    }

    const targetIdx = Number.isInteger(targetCreatureIndex) ? targetCreatureIndex : null;
    const applyResult = applyItem(item, this.gm.run.creatureParty, this.gm.run.itemBuffs, targetIdx);
    if (this.gm.run?.runSummary) {
      this.gm.run.runSummary.itemsCollected++;
    }
    if (this.gm.meta && item?.id) {
      if (!this.gm.meta.itemsDiscovered) this.gm.meta.itemsDiscovered = [];
      if (!this.gm.meta.itemsDiscovered.includes(item.id)) {
        this.gm.meta.itemsDiscovered.push(item.id);
      }
    }

    room.friendlyNpc.chosenId = itemId;
    room.friendlyNpc.completed = true;
    room.interacted = true;
    this.gm.emitState();

    return { chosen: item, applyResult };
  }

  applyShrineChoose({ rewardType, creatureKey, creatureId } = {}) {
    return this.useShrineReward(rewardType, creatureKey || creatureId || null);
  }

  useShrine(creatureId) {
    return this.useShrineReward(SHRINE_REWARDS.LEVEL_UP, creatureId);
  }

  useShrineReward(rewardType, creatureKey = null) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    const shrine = ensureShrineState(room);
    if (shrine.completed || shrine.used) {
      throw new Error('Shrine already used');
    }

    const allCreatures = getAllPartyCreatures(this.gm.run?.creatureParty);
    let result;

    switch (rewardType) {
      case SHRINE_REWARDS.HEAL_ALL:
        result = this._applyShrineHealAll(allCreatures);
        break;
      case SHRINE_REWARDS.RESTORE_MP_ALL:
        result = this._applyShrineRestoreMpAll(allCreatures);
        break;
      case SHRINE_REWARDS.LEVEL_UP:
        result = this._applyShrineLevelUp(allCreatures, creatureKey);
        break;
      default:
        throw new Error('Invalid shrine reward');
    }

    shrine.used = true;
    shrine.completed = true;
    shrine.chosenReward = rewardType;
    room.interacted = true;

    logger.info('[Shrine] Reward claimed:', {
      rewardType,
      affected: result.affectedCreatures?.length || (result.levelUp ? 1 : 0)
    });

    this.gm.narrate('The shrine glow fades.');
    this.gm.emitState();

    return {
      type: 'shrine_reward',
      rewardType,
      affectedCreatures: result.affectedCreatures || [],
      levelUp: result.levelUp || null
    };
  }

  _applyShrineHealAll(allCreatures) {
    const affectedCreatures = [];
    for (const creature of allCreatures) {
      if ((creature.hp || 0) <= 0) continue;
      const maxHp = Math.max(0, Math.floor(Number(creature.maxHp) || 0));
      const beforeHp = Math.max(0, Math.floor(Number(creature.hp) || 0));
      const healAmount = Math.floor(maxHp * 0.5);
      creature.hp = Math.min(maxHp, beforeHp + healAmount);
      affectedCreatures.push({
        creatureKey: getCreatureKey(creature),
        creatureName: creature.nameEn || creature.name || creature.id,
        oldHp: beforeHp,
        newHp: creature.hp
      });
    }
    return { affectedCreatures };
  }

  _applyShrineRestoreMpAll(allCreatures) {
    const affectedCreatures = [];
    for (const creature of allCreatures) {
      if ((creature.hp || 0) <= 0) continue;
      const maxMp = Math.max(0, Math.floor(Number(creature.maxMp) || 0));
      const beforeMp = Math.max(0, Math.floor(Number(creature.mp) || 0));
      creature.mp = maxMp;
      affectedCreatures.push({
        creatureKey: getCreatureKey(creature),
        creatureName: creature.nameEn || creature.name || creature.id,
        oldMp: beforeMp,
        newMp: creature.mp
      });
    }
    return { affectedCreatures };
  }

  _applyShrineLevelUp(allCreatures, creatureKey) {
    if (!creatureKey) throw new Error('creatureKey required for level up reward');
    const creature = allCreatures.find(candidate =>
      getCreatureKey(candidate) === creatureKey || candidate.id === creatureKey
    );
    if (!creature) throw new Error('Creature not in party');
    if ((creature.hp || 0) <= 0) throw new Error('Cannot use shrine on a fainted creature');

    const prevLevel = creature.level;
    const prevMaxHp = creature.maxHp;
    const prevAttack = creature.attack;

    addXpToCreature(creature, xpToNextLevel(creature.level), null, this.gm.run?.itemBuffs);

    return {
      levelUp: {
        creatureKey: getCreatureKey(creature),
        creatureId: creature.id,
        creatureName: creature.nameEn || creature.name || creature.id,
        oldLevel: prevLevel,
        newLevel: creature.level,
        maxHp: creature.maxHp,
        attack: creature.attack,
        hpGain: creature.maxHp - prevMaxHp,
        attackGain: creature.attack - prevAttack
      }
    };
  }

  useQuizReward(rewardType, creatureId = null) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'quiz') {
      throw new Error('No quiz here');
    }

    if (room.quiz.rewarded) {
      throw new Error('Quiz reward already claimed');
    }

    let description;

    switch (rewardType) {
      case 'heal': {
        if (!creatureId) throw new Error('creatureId required for heal reward');
        const allCreatures = [
          ...this.gm.run.creatureParty.active,
          ...this.gm.run.creatureParty.reserves
        ].filter(Boolean);
        const creature = allCreatures.find(r => r.id === creatureId);
        if (!creature) throw new Error('Creature not in party');
        creature.hp = creature.maxHp;
        description = `${creature.nameEn} fully healed!`;
        break;
      }

      case 'levelup': {
        if (!creatureId) throw new Error('creatureId required for levelup reward');
        const allCreatures = [
          ...this.gm.run.creatureParty.active,
          ...this.gm.run.creatureParty.reserves
        ].filter(Boolean);
        const creature = allCreatures.find(r => r.id === creatureId);
        if (!creature) throw new Error('Creature not in party');
        if (creature.hp <= 0) throw new Error('Cannot level up a fainted creature');
        addXpToCreature(creature, xpToNextLevel(creature.level), null, this.gm.run?.itemBuffs);
        description = `${creature.nameEn} leveled up to Lv. ${creature.level}!`;
        break;
      }

      case 'credits': {
        const areaNum = (this.gm.run.areasCompleted || 0) + 1;
        const creditReward = 20 + (areaNum * 10);
        this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditReward;
        description = `${creditReward} credits earned!`;
        break;
      }

      default:
        throw new Error('Invalid reward type');
    }

    room.quiz.rewarded = true;
    room.interacted = true;

    this.gm.narrate(`クイズマスター：「正解！」 ${description}`);
    this.gm.emitState();

    return { type: 'quiz_reward', rewardType, description };
  }

  /**
   * Mark word discovery room as complete
   */
  completeWordDiscovery() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'wordDiscovery') {
      throw new Error('No word discovery room here');
    }

    if (room.interacted) {
      return { type: 'word_discovery_complete', alreadyComplete: true };
    }

    room.wordDiscovery.completed = true;
    room.interacted = true;

    // Award small XP + credits for creature runs
    const xpGrants = [];
    const levelUps = [];
    if (this.gm.run.creatureParty?.active?.length > 0) {
      const discoveryXp = calculateDiscoveryXpForRun(this.gm.run);

      for (const creature of this.gm.run.creatureParty.active) {
        if (!creature || creature.hp <= 0) continue;
        const prevLevel = creature.level;
        addXpToCreature(creature, discoveryXp, null, this.gm.run?.itemBuffs);
        xpGrants.push({ creatureId: creature.id, creatureName: creature.nameEn, xp: discoveryXp });
        if (creature.level > prevLevel) {
          levelUps.push({
            creatureId: creature.id, creatureName: creature.nameEn,
            oldLevel: prevLevel, newLevel: creature.level
          });
        }
      }

      // Credits: 20% of an area-scaled amount (base 15 per enemy)
      const creditReward = Math.floor(15 * 0.2) + ((this.gm.run.areasCompleted || 0) + 1);
      this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditReward;

      logger.info('[WordDiscovery] Creature rewards:', { discoveryXp, creditReward, xpGrants: xpGrants.length });
    }

    logger.info('[WordDiscovery] Room completed');
    this.gm.emitState();

    return { type: 'word_discovery_complete', xpGrants, levelUps };
  }

  applyWordDiscoveryComplete() {
    return this.completeWordDiscovery();
  }

  /**
   * Complete whack-a-mole game and award XP per successful flip to all party
   */
  completeWhackAMole(score) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'whackAMole') {
      throw new Error('No whack-a-mole room here');
    }

    if (room.interacted) {
      return { type: 'whack_a_mole_complete', alreadyComplete: true, score: room.whackAMole.score, creditsAwarded: 0, xpGrants: [], levelUps: [] };
    }

    const clampedScore = Math.max(0, Math.floor(score || 0));
    room.whackAMole.score = clampedScore;
    room.whackAMole.completed = true;
    room.interacted = true;

    // Award 1 credit per point
    const creditsAwarded = clampedScore;
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditsAwarded;

    // Award per-flip XP to all party (active + reserves)
    const xpGrants = [];
    const levelUps = [];
    const perFlipXp = calculateDiscoveryXpForRun(this.gm.run);
    const totalXp = perFlipXp * clampedScore;

    if (totalXp > 0) {
      const allCreatures = [
        ...(this.gm.run.creatureParty?.active || []),
        ...(this.gm.run.creatureParty?.reserves || [])
      ].filter(c => c != null && c.hp > 0);

      for (const creature of allCreatures) {
        const prevLevel = creature.level;
        addXpToCreature(creature, totalXp, null, this.gm.run?.itemBuffs);
        xpGrants.push({ creatureId: creature.id, creatureName: creature.nameEn, xp: totalXp });
        if (creature.level > prevLevel) {
          levelUps.push({
            creatureId: creature.id, creatureName: creature.nameEn,
            oldLevel: prevLevel, newLevel: creature.level
          });
        }
      }
    }

    return { type: 'whack_a_mole_complete', score: clampedScore, creditsAwarded, xpGrants, levelUps };
  }

  applyWhackAMoleComplete({ score } = {}) {
    return this.completeWhackAMole(score);
  }

  skipWhackAMole() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'whackAMole') {
      throw new Error('No whack-a-mole room here');
    }

    if (room.interacted) {
      return { type: 'whack_a_mole_skipped', alreadySkipped: true };
    }

    room.whackAMole ||= {};
    room.whackAMole.completed = true;
    room.whackAMole.skipped = true;
    room.interacted = true;

    const proceedResult = this.proceedToNextRoom();
    return { type: 'whack_a_mole_skipped', ...proceedResult };
  }

  applyWhackAMoleSkip() {
    return this.skipWhackAMole();
  }

  applyCampfireCook(payload = {}) {
    return applyCampfireCookMutation(this.gm, payload);
  }

  applyCampfireFeed(payload = {}) {
    return applyCampfireFeedMutation(this.gm, payload);
  }

  applyCampfireSkip() {
    return applyCampfireSkipMutation(this.gm);
  }

  // ============ SKILL MASTER ROOM ============

  getSkillMasterOffers() {
    // Initial pick (before first room) uses run.initialSkillPick
    const pick = this.gm.run?.initialSkillPick;
    const isInitialPick = pick && !pick.chosenId;

    if (isInitialPick) {
      // Tutorial step 0: offer 3 hardcoded skills (counter first)
      if (shouldOverrideSkillOffers(this.gm.meta)) {
        const offered = [
          { id: 'counterMaster', level: 1 },
          { id: 'arcStrike', level: 1 },
          { id: 'buffMaster', level: 1 }
        ]
          .map(offer => getPartySkillOfferDisplay(offer, this.gm.run?.partySkills || []))
          .filter(Boolean);
        pick.offered = offered.map(({ id, level }) => ({ id, level }));
        this.gm.emitState();
        return { offered };
      }
      if (!Array.isArray(pick.offered)) {
        this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
        pick.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 })
          .map(({ id, level }) => ({ id, level }));
      }
      const offered = (pick.offered || [])
        .map(offer => getPartySkillOfferDisplay(offer, this.gm.run?.partySkills || []))
        .filter(Boolean);
      this.gm.emitState();
      return { offered };
    }

    // Room-based skill master
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'skillMaster') {
      throw new Error('No Skill Master here');
    }
    if (!room.skillMaster) {
      room.skillMaster = { offered: null, chosenId: null, completed: false };
    }

    // Idempotent within room: once offered IDs exist, keep them
    if (!Array.isArray(room.skillMaster.offered)) {
      this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
      room.skillMaster.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 })
        .map(({ id, level }) => ({ id, level }));
    }

    const offered = (room.skillMaster.offered || [])
      .map(offer => getPartySkillOfferDisplay(offer, this.gm.run?.partySkills || []))
      .filter(Boolean);

    this.gm.emitState();
    return { offered };
  }

  chooseSkillMasterOffer(skillId) {
    // Initial pick (before first room)
    const pick = this.gm.run?.initialSkillPick;
    const isInitialPick = pick && !pick.chosenId;

    if (isInitialPick) {
      const canonicalSkillId = canonicalPartySkillTreeId(skillId);
      const offeredIds = Array.isArray(pick.offered) ? pick.offered.map(canonicalPartySkillTreeId).filter(Boolean) : [];
      if (!canonicalSkillId || !offeredIds.includes(canonicalSkillId)) {
        throw new Error('Invalid Skill Master offer');
      }
      if (!this.gm.run) throw new Error('No active run');
      this.gm.run.partySkills = applyPartySkillChoice(this.gm.run.partySkills || [], canonicalSkillId);
      syncPartySkillHpBonuses(this.gm.run.creatureParty, this.gm.run.partySkills);
      pick.chosenId = canonicalSkillId;
      // Tutorial step 0 → 1: advance after first skill pick
      if (shouldOverrideSkillOffers(this.gm.meta)) {
        advanceTutorial(this.gm.meta);
      }
      this.gm.emitState();
      return { chosenId: canonicalSkillId, partySkills: this.gm.run.partySkills };
    }

    // Room-based skill master
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'skillMaster') {
      throw new Error('No Skill Master here');
    }
    if (!room.skillMaster) {
      room.skillMaster = { offered: null, chosenId: null, completed: false };
    }

    const canonicalSkillId = canonicalPartySkillTreeId(skillId);
    if (room.skillMaster.completed === true && room.skillMaster.chosenId) {
      const chosenTreeId = canonicalPartySkillTreeId(room.skillMaster.chosenId);
      if (canonicalSkillId && canonicalSkillId === chosenTreeId) {
        if (!this.gm.run) throw new Error('No active run');
        if (!Array.isArray(this.gm.run.partySkills)) this.gm.run.partySkills = [];
        return {
          chosenId: chosenTreeId,
          partySkills: this.gm.run.partySkills
        };
      }
      throw new Error('Skill Master already completed');
    }

    const offeredIds = Array.isArray(room.skillMaster.offered)
      ? room.skillMaster.offered.map(canonicalPartySkillTreeId).filter(Boolean)
      : [];
    if (!canonicalSkillId || !offeredIds.includes(canonicalSkillId)) {
      throw new Error('Invalid Skill Master offer');
    }

    if (!this.gm.run) throw new Error('No active run');
    this.gm.run.partySkills = applyPartySkillChoice(this.gm.run.partySkills || [], canonicalSkillId);
    syncPartySkillHpBonuses(this.gm.run.creatureParty, this.gm.run.partySkills);

    room.skillMaster.chosenId = canonicalSkillId;
    room.skillMaster.completed = true;
    room.interacted = true;

    this.gm.emitState();
    return {
      chosenId: canonicalSkillId,
      partySkills: this.gm.run.partySkills
    };
  }

  applySkillMasterChoose({ skillId } = {}) {
    if (!skillId) throw new Error('skill_id_required');
    return this.chooseSkillMasterOffer(skillId);
  }

  applyNpcBattleSkillChoose({ skillId } = {}) {
    if (!skillId) throw new Error('skill_id_required');

    const room = this.getCurrentRoom();
    if (!room || room.type !== ROOM_TYPES.npcBattle) {
      throw new Error('Not in an NPC battle room');
    }
    if (!room.npcBattle?.skillSelectionPending) {
      throw new Error('NPC battle skill selection not pending');
    }
    if (room.npcBattle.chosenSkillId) {
      throw new Error('Skill already chosen for this room');
    }

    if (!Array.isArray(room.npcBattle.offered)) {
      logger.warn('[npc-battle-skill-choose] offered not set — generating on demand',
        { skillId, npcBattle: JSON.stringify(room.npcBattle) });
      this.gm.run.partySkills = normalizePartySkills(this.gm.run?.partySkills || []);
      room.npcBattle.offered = rollSkillMasterOffers({ ownedSkillIds: this.gm.run.partySkills, count: 3 })
        .map(({ id, level }) => ({ id, level }));
    }

    const canonicalSkillId = canonicalPartySkillTreeId(skillId);
    const offeredIds = room.npcBattle.offered.map(canonicalPartySkillTreeId).filter(Boolean);
    if (!canonicalSkillId || !offeredIds.includes(canonicalSkillId)) {
      logger.warn('[npc-battle-skill-choose] skillId not in offered',
        { skillId, offeredIds, typeof_skillId: typeof skillId });
      throw new Error('Invalid skill choice');
    }

    if (!this.gm.run) throw new Error('No active run');
    this.gm.run.partySkills = applyPartySkillChoice(this.gm.run.partySkills || [], canonicalSkillId);
    syncPartySkillHpBonuses(this.gm.run.creatureParty, this.gm.run.partySkills);

    room.npcBattle.chosenSkillId = canonicalSkillId;
    room.npcBattle.skillSelectionPending = false;
    room.interacted = true;

    this.gm.emitState();
    return { chosenId: canonicalSkillId, partySkills: this.gm.run.partySkills };
  }

  // ============ DEALER ROOM ============

  /**
   * Get dealer room state with inventory sell prices
   */
  getDealerState() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    // Lazily generate offered creatures on first visit
    if (!room.dealer.offeredCreatures || room.dealer.offeredCreatures.length === 0) {
      const collectionIds = this.gm.player?.creatureCollection?.map(r => r.id) || [];
      room.dealer.offeredCreatures = generateDealerCreatures(collectionIds);
    }

    // Build party inventory with sell prices
    const allCreatures = [
      ...this.gm.run.creatureParty.active.map((r, i) => r ? { ...r, slot: 'active', slotIndex: i } : null),
      ...this.gm.run.creatureParty.reserves.map((r, i) => r ? { ...r, slot: 'reserves', slotIndex: i } : null)
    ].filter(Boolean).map(r => ({
      ...r,
      sellPrice: getCreatureSellPrice(r.rarity, r.level)
    }));

    return {
      dealer: room.dealer,
      offeredCreatures: room.dealer.purchasedCreature ? [] : room.dealer.offeredCreatures,
      partyCreatures: allCreatures,
      credits: this.gm.run.player.credits || 0,
      canBuy: !room.dealer.purchasedCreature,
      sellCount: room.dealer.soldCreatures?.length || 0,
      maxSells: 2
    };
  }

  /**
   * Sell a creature to the dealer
   * @param {string} creatureId - ID of creature to sell
   */
  dealerSell(creatureId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if ((room.dealer.soldCreatures?.length || 0) >= 2) {
      throw new Error('Already sold maximum creatures (2)');
    }

    // Find creature in party
    const activeIdx = this.gm.run.creatureParty.active.findIndex(r => r?.id === creatureId);
    const reserveIdx = this.gm.run.creatureParty.reserves.findIndex(r => r?.id === creatureId);

    if (activeIdx === -1 && reserveIdx === -1) {
      throw new Error('Creature not in party');
    }

    // Can't sell last creature
    const totalCreatures = [
      ...this.gm.run.creatureParty.active,
      ...this.gm.run.creatureParty.reserves
    ].filter(Boolean).length;

    if (totalCreatures <= 1) {
      throw new Error('Cannot sell your last creature');
    }

    const creature = activeIdx !== -1
      ? this.gm.run.creatureParty.active[activeIdx]
      : this.gm.run.creatureParty.reserves[reserveIdx];

    const sellPrice = getCreatureSellPrice(creature.rarity, creature.level);

    // Remove from party
    if (activeIdx !== -1) {
      this.gm.run.creatureParty.active[activeIdx] = null;
      // Auto-fill from reserves if available
      const reserveCreature = this.gm.run.creatureParty.reserves.shift();
      if (reserveCreature) {
        this.gm.run.creatureParty.active[activeIdx] = reserveCreature;
      }
    } else {
      this.gm.run.creatureParty.reserves.splice(reserveIdx, 1);
    }

    // Add credits
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + sellPrice;

    // Track sold creature
    if (!room.dealer.soldCreatures) room.dealer.soldCreatures = [];
    room.dealer.soldCreatures.push({ creatureId, sellPrice });

    logger.info('[Dealer] Creature sold:', { creature: creature.nameEn, creatureId, sellPrice });
    this.gm.narrate(`${creature.nameEn}を${sellPrice}クレジットで売却した。`);
    this.gm.emitState();

    return {
      success: true,
      creatureId,
      creatureName: creature.nameEn,
      creditsGained: sellPrice,
      creditsRemaining: this.gm.run.player.credits
    };
  }

  applyDealerSell({ creatureId } = {}) {
    if (!creatureId) throw new Error('creature_id_required');
    return this.dealerSell(creatureId);
  }

  /**
   * Buy the dealer's offered creature
   */
  dealerBuy(creatureId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if (room.dealer.purchasedCreature) {
      throw new Error('Already purchased from this dealer');
    }

    // Find the offered creature
    const offered = room.dealer.offeredCreatures.find(r => r.id === creatureId);
    if (!offered) {
      throw new Error('Creature not available at dealer');
    }

    const price = offered.buyPrice;

    // Check credits
    if ((this.gm.run.player.credits || 0) < price) {
      throw new Error('Not enough credits');
    }

    // Check party size (max 6: 3 active + 3 reserves)
    const totalCreatures = [
      ...this.gm.run.creatureParty.active,
      ...this.gm.run.creatureParty.reserves
    ].filter(Boolean).length;

    if (totalCreatures >= 6) {
      throw new Error('Party is full (max 6 creatures)');
    }

    // Deduct credits
    this.gm.run.player.credits -= price;

    // Add creature to party (mark as temporary -- won't enter collection).
    // Fresh uid: the party-bound instance is distinct from the offered display
    // shell that may still be referenced by dealer.offeredCreatures.
    const newCreature = { ...offered, uid: crypto.randomUUID(), temporary: true };
    delete newCreature.buyPrice;

    // Add to active if space, otherwise reserves
    const emptyActiveSlot = this.gm.run.creatureParty.active.findIndex(r => r === null);
    if (emptyActiveSlot !== -1) {
      this.gm.run.creatureParty.active[emptyActiveSlot] = newCreature;
    } else {
      this.gm.run.creatureParty.reserves.push(newCreature);
    }

    // Apply crest progression bonuses to purchased creature
    applyCrestBonuses(newCreature, this.gm.run.crestMults);

    room.dealer.purchasedCreature = creatureId;

    logger.info('[Dealer] Creature purchased:', { creature: offered.nameEn, creatureId, price });
    this.gm.narrate(`${offered.nameEn}を${price}クレジットで雇った！`);
    this.gm.emitState();

    return {
      success: true,
      creature: newCreature,
      creditsSpent: price,
      creditsRemaining: this.gm.run.player.credits
    };
  }

  applyDealerBuy({ creatureId } = {}) {
    if (!creatureId) throw new Error('creature_id_required');
    return this.dealerBuy(creatureId);
  }

  /**
   * Leave the dealer room without further interaction
   */
  leaveDealer() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    room.dealer.visited = true;
    room.interacted = true;

    this.gm.narrate('行商人に別れを告げた。');
    this.gm.emitState();

    return { success: true };
  }

  applyDealerLeave() {
    return this.leaveDealer();
  }

  /**
   * Start room encounter - triggers combat
   */
  startRoomEncounter() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'encounter') {
      throw new Error('No encounter in this room');
    }

    if (room.interacted) {
      throw new Error('Encounter already completed');
    }

    // Mark as interacted (will be fully marked after combat)
    room.encounterStarted = true;

    // Start encounter using CombatService via GameManager
    return this.gm.startEncounter();
  }

  _getSpeedReviewRoomById(roomId) {
    if (!this.gm.run?.rooms?.length) {
      throw new Error('No active run');
    }
    const room = this.gm.run.rooms.find(candidate => candidate.id === roomId);
    if (!room) {
      throw new Error('Speed review room not found');
    }
    if (room.type !== ROOM_TYPES.speedReviewRoom) {
      throw new Error('Room is not a speed review room');
    }
    if (!room.speedReviewRoom) {
      throw new Error('Speed review room state missing');
    }
    return room;
  }

  _sanitizeSpeedReviewWord(word) {
    return {
      word: word.word,
      reading: word.reading,
      meanings: Array.isArray(word.meanings) ? word.meanings : []
    };
  }

  _getSpeedReviewCompletionTarget(roomState) {
    return Math.min(roomState.targetCards || 0, roomState.snapshotWordKeys?.length || 0);
  }

  _syncSpeedReviewCompletion(room) {
    const roomState = room.speedReviewRoom;
    const completionTarget = this._getSpeedReviewCompletionTarget(roomState);
    if ((roomState.reviewedCards || 0) >= completionTarget) {
      roomState.completed = true;
      room.interacted = true;
    }
    return completionTarget;
  }

  _buildSpeedReviewRoomResponse(room, extras = {}) {
    const roomState = room.speedReviewRoom;
    const completionTarget = this._getSpeedReviewCompletionTarget(roomState);
    return {
      roomId: room.id,
      snapshotWords: Array.isArray(roomState.snapshotWords) ? roomState.snapshotWords : [],
      snapshotWordKeys: Array.isArray(roomState.snapshotWordKeys) ? roomState.snapshotWordKeys : [],
      reviewedCards: roomState.reviewedCards || 0,
      targetCards: roomState.targetCards || 0,
      requiredCards: completionTarget,
      awardedReviewKeys: Array.isArray(roomState.awardedReviewKeys) ? roomState.awardedReviewKeys : [],
      pendingReviewKeys: Array.isArray(roomState.pendingReviewKeys) ? roomState.pendingReviewKeys : [],
      settled: roomState.settled !== false,
      completed: !!roomState.completed,
      interacted: !!room.interacted,
      ...extras
    };
  }

  _applySpeedReviewXpForReviewKey(room, reviewKey) {
    const roomState = room.speedReviewRoom;
    if (roomState.awardedReviewKeys.includes(reviewKey)) {
      return { reviewKey, xpAwarded: false, alreadyAwarded: true };
    }

    const livingActives = this.gm.run?.creatureParty?.active?.filter(creature => creature && creature.hp > 0) || [];
    const discoveryXp = calculateDiscoveryXpForRun(this.gm.run);
    for (const creature of livingActives) {
      addXpToCreature(creature, discoveryXp, null, this.gm.run?.itemBuffs);
    }

    roomState.awardedReviewKeys.push(reviewKey);
    return {
      reviewKey,
      xpAwarded: true,
      xpPerCreature: discoveryXp,
      rewardedCreatureIds: livingActives.map(creature => creature.id)
    };
  }

  settleSpeedReviewRoomPendingRewards({ roomId } = {}) {
    if (!this.gm.run?.rooms?.length) {
      return { settled: true, pendingReviewKeys: [] };
    }

    const roomsToSettle = roomId
      ? [this._getSpeedReviewRoomById(roomId)]
      : this.gm.run.rooms.filter(room => room.type === ROOM_TYPES.speedReviewRoom && room.speedReviewRoom);

    let settled = true;
    const settledReviewKeys = [];

    for (const room of roomsToSettle) {
      const roomState = room.speedReviewRoom;
      const pendingReviewKeys = Array.isArray(roomState.pendingReviewKeys) ? roomState.pendingReviewKeys : [];
      const nextPending = [];

      for (const reviewKey of pendingReviewKeys) {
        if (roomState.awardedReviewKeys.includes(reviewKey)) {
          continue;
        }

        try {
          this._applySpeedReviewXpForReviewKey(room, reviewKey);
          settledReviewKeys.push(reviewKey);
        } catch (error) {
          settled = false;
          nextPending.push(reviewKey);
        }
      }

      roomState.pendingReviewKeys = nextPending;
      roomState.settled = nextPending.length === 0;
    }

    if (settledReviewKeys.length > 0) {
      this.gm.emitState();
    }

    return {
      settled,
      settledReviewKeys
    };
  }

  async startSpeedReviewRoom({ roomId, userId, dueWordsProvider } = {}) {
    if (!roomId) {
      throw new Error('roomId is required');
    }

    const room = this._getSpeedReviewRoomById(roomId);
    const roomState = room.speedReviewRoom;

    this.settleSpeedReviewRoomPendingRewards({ roomId: room.id });

    if (roomState.snapshotInitialized) {
      this._syncSpeedReviewCompletion(room);
      return this._buildSpeedReviewRoomResponse(room, { reusedSnapshot: true });
    }

    const targetCards = Math.max(0, Number(roomState.targetCards) || 10);
    let dueWords = [];

    if (dueWordsProvider) {
      const result = await dueWordsProvider(userId);
      dueWords = Array.isArray(result?.words) ? result.words : (Array.isArray(result) ? result : []);
    } else if (userId) {
      const dueCards = hydrateCards(getDueCards(userId, 'vocab'));
      dueWords = dueCards.map(c => ({
        word: c.id,
        reading: c.reading,
        meanings: c.meaning ? [c.meaning] : [],
      }));
    }

    const snapshotWords = dueWords.slice(0, targetCards).map(word => this._sanitizeSpeedReviewWord(word));
    roomState.snapshotWords = snapshotWords;
    roomState.snapshotWordKeys = snapshotWords.map(word => buildSpeedReviewWordKey(word.word));
    roomState.snapshotInitialized = true;
    roomState.reviewedCards = Math.max(0, Number(roomState.reviewedCards) || 0);
    roomState.awardedReviewKeys = Array.isArray(roomState.awardedReviewKeys) ? roomState.awardedReviewKeys : [];
    roomState.pendingReviewKeys = Array.isArray(roomState.pendingReviewKeys) ? roomState.pendingReviewKeys : [];
    roomState.settled = roomState.pendingReviewKeys.length === 0;

    this._syncSpeedReviewCompletion(room);
    this.gm.emitState();

    return this._buildSpeedReviewRoomResponse(room, { reusedSnapshot: false });
  }

  recordSpeedReviewRoomCommit({ roomId, word, commitIndex } = {}) {
    if (!roomId) {
      throw new Error('roomId is required');
    }
    if (!Number.isInteger(commitIndex) || commitIndex < 0) {
      throw new Error('commitIndex must be an integer >= 0');
    }

    const room = this._getSpeedReviewRoomById(roomId);
    const roomState = room.speedReviewRoom;
    if (!roomState.snapshotInitialized) {
      throw new Error('Speed review snapshot not initialized');
    }

    this.settleSpeedReviewRoomPendingRewards({ roomId: room.id });

    const completionTarget = this._getSpeedReviewCompletionTarget(roomState);
    if (commitIndex >= completionTarget) {
      throw new Error('commitIndex is outside snapshot bounds');
    }

    const expectedWordKey = roomState.snapshotWordKeys[commitIndex];
    const committedWordKey = buildSpeedReviewWordKey(word);
    if (expectedWordKey !== committedWordKey) {
      throw new Error('Commit does not match server snapshot order');
    }

    const reviewKey = `${room.id}:${commitIndex}:${word}`;
    if (roomState.awardedReviewKeys.includes(reviewKey) || roomState.pendingReviewKeys.includes(reviewKey)) {
      this._syncSpeedReviewCompletion(room);
      return this._buildSpeedReviewRoomResponse(room, {
        reviewKey,
        alreadyCommitted: true
      });
    }

    roomState.reviewedCards = (roomState.reviewedCards || 0) + 1;
    roomState.pendingReviewKeys.push(reviewKey);

    this.settleSpeedReviewRoomPendingRewards({ roomId: room.id });
    this._syncSpeedReviewCompletion(room);
    this.gm.emitState();

    return this._buildSpeedReviewRoomResponse(room, {
      reviewKey,
      alreadyCommitted: false
    });
  }

  completeSpeedReviewRoom({ roomId } = {}) {
    if (!roomId) {
      throw new Error('roomId is required');
    }
    const room = this._getSpeedReviewRoomById(roomId);

    this.settleSpeedReviewRoomPendingRewards({ roomId: room.id });
    this._syncSpeedReviewCompletion(room);
    this.gm.emitState();

    return this._buildSpeedReviewRoomResponse(room);
  }

  applySpeedReviewCommit(payload = {}) {
    return this.recordSpeedReviewRoomCommit(payload);
  }

  applySpeedReviewComplete(payload = {}) {
    return this.completeSpeedReviewRoom(payload);
  }

}
