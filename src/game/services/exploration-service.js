/**
 * @fileoverview ExplorationService - Dungeon exploration and room interaction
 * @module src/game/services/exploration-service
 *
 * PURPOSE:
 * Handles dungeon exploration logic including area selection,
 * room navigation, shrine interaction, and post-combat shop.
 *
 * KEY EXPORTS:
 * - ExplorationService (class) - Exploration and room interaction service
 *
 * DEPENDENCIES:
 * - GameManager reference (this.gm) for state access and cross-service calls
 * - rooms.js for area/room generation and utilities
 */


import { generateEncounterCount } from '../state.js';

import {
  generateAreaRooms,
  getRoomEntryNarration,
  getRoomActions,
  getAreaSelectionOptions,
  getAreaById,
  createRoom,
  ROOM_TYPES
} from '../rooms.js';

import { addXpToCreature, xpToNextLevel, instantiateCreature, getCreatureBuyPrice, getCreatureSellPrice, generateDealerCreatures } from '../creatures.js';
import { logger } from '../../logger.js';
import { rollSkillMasterOffers, getPartySkillDisplay } from '../party-skills.js';

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
  return activeRoom?.subArea?.background || randomAreaBg(areaId);
}

/**
 * ExplorationService - Handles dungeon exploration and room interactions
 */
export class ExplorationService {
  /**
   * @param {GameManager} gameManager - Reference to parent GameManager
   */
  constructor(gameManager) {
    this.gm = gameManager;
  }

  // ============ AREA SELECTION ============

  /**
   * Get area options for selection
   * @returns {Array} 2 random area options
   */
  getAreaOptions() {
    const excludeId = this.gm.run?.currentArea?.id || null;
    return getAreaSelectionOptions(excludeId);
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
    this.gm.run.encountersNeeded = generateEncounterCount();
    this.gm.run.areaCleared = false;

    // Generate rooms for this area (boss appended if configured)
    this.gm.run.rooms = generateAreaRooms(areaId, this.gm.run.encountersNeeded, null, false, forceRoomType);
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
    }

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

    // Move to next room
    this.gm.run.currentRoom++;

    // Check if we've run out of rooms (area complete)
    if (this.gm.run.currentRoom >= this.gm.run.rooms.length) {
      this.gm.run.areaCleared = true;
      this.gm.run.areasCompleted++;
      this.gm.run.stats.areasCleared = this.gm.run.areasCompleted;
      this.gm.run.areaSelectionRequired = true;

      // Check win condition
      if (this.gm.run.areasCompleted >= this.gm.run.areasToWin) {
        this.gm.run.gameVictoryPending = true;
      }

      const areaName = this.gm.run.currentArea?.nameEn || 'Unknown';
      this.gm.narrate(`${areaName}を制覇した！`);
      this.gm.emitState();

      logger.info('[Exploration] Area cleared:', { areasCompleted: this.gm.run.areasCompleted });

      return {
        areaCleared: true,
        areasCompleted: this.gm.run.areasCompleted,
        areasToWin: this.gm.run.areasToWin,
        gameVictory: this.gm.run.areasCompleted >= this.gm.run.areasToWin
      };
    }

    const nextRoom = this.gm.run.rooms[this.gm.run.currentRoom];

    // Single room - override type if forceRoomType is set
    if (forceRoomType && ROOM_TYPES[forceRoomType] && nextRoom.type !== forceRoomType) {
      const areaId = this.gm.run.currentArea?.id || 'unknown';
      const replaced = createRoom(forceRoomType, areaId, nextRoom.roomNumber, nextRoom.totalRooms);
      if (nextRoom.subArea) replaced.subArea = nextRoom.subArea;
      this.gm.run.rooms[this.gm.run.currentRoom] = replaced;
    }
    const room = this.gm.run.rooms[this.gm.run.currentRoom]; // re-read after possible replacement

    // Mark as explored
    room.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Increment global room counter for enemy scaling (all room types).
    this.gm.run.totalEncounters = (this.gm.run.totalEncounters || 0) + 1;

    // Vary background per room — sub-area-specific if available
    const areaId = this.gm.run.currentArea?.id || 'okunomori';
    this.gm.run.background = getBackgroundForRoom(room, areaId);

    // Track room clears
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(room);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Proceeded to room:', { type: room.type, index: this.gm.run.currentRoom });

    return {
      room,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(room),
      narration
    };
  }

  // ============ ROOM INTERACTIONS ============

  useShrine(creatureId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    // Find creature in party (active or reserves)
    const allCreatures = [
      ...this.gm.run.creatureParty.active,
      ...this.gm.run.creatureParty.reserves
    ].filter(Boolean);

    const creature = allCreatures.find(r => r.id === creatureId);
    if (!creature) {
      throw new Error('Creature not in party');
    }

    const prevLevel = creature.level;
    const prevMaxHp = creature.maxHp;
    const prevAttack = creature.attack;

    // Grant one full level-up worth of XP (cubic curve)
    addXpToCreature(creature, xpToNextLevel(creature.level));

    room.shrine.used = true;
    room.interacted = true;

    logger.info('[Shrine] Creature leveled up:', {
      creature: creature.nameEn, creatureId, newLevel: creature.level
    });

    this.gm.narrate(`修練場の力でモンスターが強化された！ Lv. ${creature.level}`);
    this.gm.emitState();

    return {
      type: 'shrine_upgrade',
      creatureId,
      creatureName: creature.nameEn,
      oldLevel: prevLevel,
      newLevel: creature.level,
      maxHp: creature.maxHp,
      attack: creature.attack,
      hpGain: creature.maxHp - prevMaxHp,
      attackGain: creature.attack - prevAttack
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
        addXpToCreature(creature, xpToNextLevel(creature.level));
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
      const BASE_KILL_XP = 10;
      const highestLevel = Math.max(...this.gm.run.creatureParty.active.filter(r => r && r.hp > 0).map(r => r.level), 1);
      const discoveryXp = Math.floor(BASE_KILL_XP * highestLevel * (this.gm.run.itemBuffs?.xpMultiplier || 1.0) * 0.2);

      for (const creature of this.gm.run.creatureParty.active) {
        if (!creature || creature.hp <= 0) continue;
        const prevLevel = creature.level;
        addXpToCreature(creature, discoveryXp);
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

  /**
   * Complete whack-a-mole game and award credits
   */
  completeWhackAMole(score) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'whackAMole') {
      throw new Error('No whack-a-mole room here');
    }

    if (room.interacted) {
      return { type: 'whack_a_mole_complete', alreadyComplete: true, score: room.whackAMole.score, creditsAwarded: 0 };
    }

    const clampedScore = Math.max(0, Math.floor(score || 0));
    room.whackAMole.score = clampedScore;
    room.whackAMole.completed = true;
    room.interacted = true;

    // Award 1 credit per point
    const creditsAwarded = clampedScore;
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditsAwarded;

    return { type: 'whack_a_mole_complete', score: clampedScore, creditsAwarded };
  }

  // ============ SKILL MASTER ROOM ============

  getSkillMasterOffers() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'skillMaster') {
      throw new Error('No Skill Master here');
    }
    if (!room.skillMaster) {
      room.skillMaster = { offered: null, chosenId: null, completed: false };
    }

    // Idempotent within room: once offered IDs exist, keep them
    if (!Array.isArray(room.skillMaster.offered)) {
      const ownedSkillIds = (this.gm.run?.partySkills || []).map(s => s?.id).filter(Boolean);
      const offeredIds = rollSkillMasterOffers({ ownedSkillIds, count: 3 });
      room.skillMaster.offered = offeredIds;
    }

    const offered = (room.skillMaster.offered || [])
      .map(id => getPartySkillDisplay(id))
      .filter(Boolean);

    this.gm.emitState();
    return { offered };
  }

  chooseSkillMasterOffer(skillId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'skillMaster') {
      throw new Error('No Skill Master here');
    }
    if (!room.skillMaster) {
      room.skillMaster = { offered: null, chosenId: null, completed: false };
    }

    const offeredIds = Array.isArray(room.skillMaster.offered) ? room.skillMaster.offered : [];
    if (!offeredIds.includes(skillId)) {
      throw new Error('Invalid Skill Master offer');
    }

    if (!this.gm.run) throw new Error('No active run');
    if (!Array.isArray(this.gm.run.partySkills)) this.gm.run.partySkills = [];

    // No duplicates: choosing an already-owned skill is a no-op
    const alreadyOwned = this.gm.run.partySkills.some(s => s?.id === skillId);
    if (!alreadyOwned) {
      this.gm.run.partySkills.push({ id: skillId });
    }

    room.skillMaster.chosenId = skillId;
    room.skillMaster.completed = true;
    room.interacted = true;

    this.gm.emitState();
    return {
      chosenId: skillId,
      partySkills: this.gm.run.partySkills
    };
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

    // Add creature to party (mark as temporary -- won't enter collection)
    const newCreature = { ...offered, temporary: true };
    delete newCreature.buyPrice;

    // Add to active if space, otherwise reserves
    const emptyActiveSlot = this.gm.run.creatureParty.active.findIndex(r => r === null);
    if (emptyActiveSlot !== -1) {
      this.gm.run.creatureParty.active[emptyActiveSlot] = newCreature;
    } else {
      this.gm.run.creatureParty.reserves.push(newCreature);
    }

    // Apply meta progression bonuses to purchased creature
    if (this.gm.run.metaHpMult > 1) {
      newCreature.maxHp = Math.floor(newCreature.maxHp * this.gm.run.metaHpMult);
      newCreature.hp = newCreature.maxHp;
    }
    if (this.gm.run.metaAtkMult > 1) {
      newCreature.attack = Math.floor(newCreature.attack * this.gm.run.metaAtkMult);
    }

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

}
