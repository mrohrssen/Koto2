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
  generateFloorRooms,
  getRoomEntryNarration,
  getRoomActions,
  getAreaSelectionOptions,
  getAreaById,
  createRoom,
  ROOM_TYPES
} from '../rooms.js';

import { addXpToRobot, xpToNextLevel, instantiateRobot, getRobotBuyPrice, getRobotSellPrice, generateDealerRobots } from '../robots.js';
import { logger } from '../../logger.js';

const AREA_BG_COUNT = 20;
function randomAreaBg(areaId) {
  const n = Math.floor(Math.random() * AREA_BG_COUNT) + 1;
  return `areas/${areaId}/${areaId}_${String(n).padStart(2, '0')}.webp`;
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
    this.gm.run.encountersCompleted = 0;
    this.gm.run.encountersNeeded = generateEncounterCount();
    this.gm.run.areaCleared = false;

    // Generate rooms for this area (no boss)
    this.gm.run.rooms = generateFloorRooms(areaId, this.gm.run.encountersNeeded, null, false, forceRoomType);
    this.gm.run.currentRoom = 0;
    this.gm.run.roomsExplored = 0;
    this.gm.run.pendingBranch = false;
    this.gm.run.selectedRooms = [];

    // Set background: random area-specific
    this.gm.run.background = randomAreaBg(areaId);

    // Mark first room as explored
    if (this.gm.run.rooms.length > 0) {
      this.gm.run.rooms[0].explored = true;
      this.gm.run.roomsExplored = 1;
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

    // Check if next room is a branch pair
    if (Array.isArray(nextRoom)) {
      if (forceRoomType && ROOM_TYPES[forceRoomType]) {
        const areaId = this.gm.run.currentArea?.id || 'unknown';
        for (let i = 0; i < nextRoom.length; i++) {
          if (nextRoom[i].type !== forceRoomType) {
            nextRoom[i] = createRoom(forceRoomType, areaId, nextRoom[i].roomNumber, nextRoom[i].totalRooms);
          }
        }
      }
      this.gm.run.pendingBranch = true;
      this.gm.emitState();

      logger.info('[Exploration] Branch point reached:', { roomIndex: this.gm.run.currentRoom });

      return {
        isBranch: true,
        options: [
          { door: 0, type: nextRoom[0].type, room: nextRoom[0] },
          { door: 1, type: nextRoom[1].type, room: nextRoom[1] }
        ]
      };
    }

    // Single room - override type if forceRoomType is set
    if (forceRoomType && ROOM_TYPES[forceRoomType] && nextRoom.type !== forceRoomType) {
      const areaId = this.gm.run.currentArea?.id || 'unknown';
      const replaced = createRoom(forceRoomType, areaId, nextRoom.roomNumber, nextRoom.totalRooms);
      this.gm.run.rooms[this.gm.run.currentRoom] = replaced;
    }
    const room = this.gm.run.rooms[this.gm.run.currentRoom]; // re-read after possible replacement

    // Mark as explored
    room.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Vary background per room
    const areaId = this.gm.run.currentArea?.id || 'okunomori';
    this.gm.run.background = randomAreaBg(areaId);

    // Track room clears for counter chips
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

  /**
   * Select a door at a branch point
   * @param {number} doorIndex - 0 for door 1, 1 for door 2
   */
  selectBranch(doorIndex, forceRoomType = null) {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    if (!this.gm.run.pendingBranch) {
      throw new Error('No branch selection pending');
    }

    const pair = this.gm.run.rooms[this.gm.run.currentRoom];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error('Current room is not a branch pair');
    }

    if (doorIndex !== 0 && doorIndex !== 1) {
      throw new Error('Invalid door index');
    }

    let selectedRoom = pair[doorIndex];

    if (forceRoomType && ROOM_TYPES[forceRoomType] && selectedRoom.type !== forceRoomType) {
      const areaId = this.gm.run.currentArea?.id || 'unknown';
      selectedRoom = createRoom(forceRoomType, areaId, selectedRoom.roomNumber, selectedRoom.totalRooms);
    }

    // Replace pair with selected room
    this.gm.run.rooms[this.gm.run.currentRoom] = selectedRoom;

    // Track the choice
    this.gm.run.selectedRooms.push(doorIndex);

    // Mark as explored
    selectedRoom.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Track room clears for counter chips
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Vary background per room
    const areaId = this.gm.run.currentArea?.id || 'okunomori';
    this.gm.run.background = randomAreaBg(areaId);

    // Clear pending branch
    this.gm.run.pendingBranch = false;

    // Get narration for new room
    const narration = getRoomEntryNarration(selectedRoom);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Branch selected:', { door: doorIndex, roomType: selectedRoom.type });

    return {
      room: selectedRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(selectedRoom),
      narration
    };
  }

  // ============ ROOM INTERACTIONS ============

  useShrine(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    // Find robot in party (active or reserves)
    const allRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean);

    const robot = allRobots.find(r => r.id === robotId);
    if (!robot) {
      throw new Error('Robot not in party');
    }

    const prevLevel = robot.level;
    const prevMaxHp = robot.maxHp;
    const prevAttack = robot.attack;

    // Grant one full level-up worth of XP (cubic curve)
    addXpToRobot(robot, xpToNextLevel(robot.level));

    room.shrine.used = true;
    room.interacted = true;

    logger.info('[Shrine] Robot leveled up:', {
      robot: robot.nameEn, robotId, newLevel: robot.level
    });

    this.gm.narrate(`修練場の力でロボットが強化された！ Lv. ${robot.level}`);
    this.gm.emitState();

    return {
      type: 'shrine_upgrade',
      robotId,
      robotName: robot.nameEn,
      oldLevel: prevLevel,
      newLevel: robot.level,
      maxHp: robot.maxHp,
      attack: robot.attack,
      hpGain: robot.maxHp - prevMaxHp,
      attackGain: robot.attack - prevAttack
    };
  }

  useQuizReward(rewardType, robotId = null) {
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
        if (!robotId) throw new Error('robotId required for heal reward');
        const allRobots = [
          ...this.gm.run.robotParty.active,
          ...this.gm.run.robotParty.reserves
        ].filter(Boolean);
        const robot = allRobots.find(r => r.id === robotId);
        if (!robot) throw new Error('Robot not in party');
        robot.hp = robot.maxHp;
        description = `${robot.nameEn} fully healed!`;
        break;
      }

      case 'levelup': {
        if (!robotId) throw new Error('robotId required for levelup reward');
        const allRobots = [
          ...this.gm.run.robotParty.active,
          ...this.gm.run.robotParty.reserves
        ].filter(Boolean);
        const robot = allRobots.find(r => r.id === robotId);
        if (!robot) throw new Error('Robot not in party');
        addXpToRobot(robot, xpToNextLevel(robot.level));
        description = `${robot.nameEn} leveled up to Lv. ${robot.level}!`;
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

    // Award small XP + credits for robot runs
    const xpGrants = [];
    const levelUps = [];
    if (this.gm.run.robotParty?.active?.length > 0) {
      const BASE_KILL_XP = 10;
      const highestLevel = Math.max(...this.gm.run.robotParty.active.filter(r => r && r.hp > 0).map(r => r.level), 1);
      const discoveryXp = Math.floor(BASE_KILL_XP * highestLevel * (this.gm.run.itemBuffs?.xpMultiplier || 1.0) * 0.2);

      for (const robot of this.gm.run.robotParty.active) {
        if (!robot || robot.hp <= 0) continue;
        const prevLevel = robot.level;
        addXpToRobot(robot, discoveryXp);
        xpGrants.push({ robotId: robot.id, robotName: robot.nameEn, xp: discoveryXp });
        if (robot.level > prevLevel) {
          levelUps.push({
            robotId: robot.id, robotName: robot.nameEn,
            oldLevel: prevLevel, newLevel: robot.level
          });
        }
      }

      // Credits: 20% of an area-scaled amount (base 15 per enemy)
      const creditReward = Math.floor(15 * 0.2) + ((this.gm.run.areasCompleted || 0) + 1);
      this.gm.run.player.credits = (this.gm.run.player.credits || 0) + creditReward;

      logger.info('[WordDiscovery] Robot rewards:', { discoveryXp, creditReward, xpGrants: xpGrants.length });
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

  // ============ DEALER ROOM ============

  /**
   * Get dealer room state with inventory sell prices
   */
  getDealerState() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    // Lazily generate offered robots on first visit
    if (!room.dealer.offeredRobots || room.dealer.offeredRobots.length === 0) {
      const collectionIds = this.gm.player?.robotCollection?.map(r => r.id) || [];
      room.dealer.offeredRobots = generateDealerRobots(collectionIds);
    }

    // Build party inventory with sell prices
    const allRobots = [
      ...this.gm.run.robotParty.active.map((r, i) => r ? { ...r, slot: 'active', slotIndex: i } : null),
      ...this.gm.run.robotParty.reserves.map((r, i) => r ? { ...r, slot: 'reserves', slotIndex: i } : null)
    ].filter(Boolean).map(r => ({
      ...r,
      sellPrice: getRobotSellPrice(r.rarity, r.level)
    }));

    return {
      dealer: room.dealer,
      offeredRobots: room.dealer.purchasedRobot ? [] : room.dealer.offeredRobots,
      partyRobots: allRobots,
      credits: this.gm.run.player.credits || 0,
      canBuy: !room.dealer.purchasedRobot,
      sellCount: room.dealer.soldRobots?.length || 0,
      maxSells: 2
    };
  }

  /**
   * Sell a robot to the dealer
   * @param {string} robotId - ID of robot to sell
   */
  dealerSell(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if ((room.dealer.soldRobots?.length || 0) >= 2) {
      throw new Error('Already sold maximum robots (2)');
    }

    // Find robot in party
    const activeIdx = this.gm.run.robotParty.active.findIndex(r => r?.id === robotId);
    const reserveIdx = this.gm.run.robotParty.reserves.findIndex(r => r?.id === robotId);

    if (activeIdx === -1 && reserveIdx === -1) {
      throw new Error('Robot not in party');
    }

    // Can't sell last robot
    const totalRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean).length;

    if (totalRobots <= 1) {
      throw new Error('Cannot sell your last robot');
    }

    const robot = activeIdx !== -1
      ? this.gm.run.robotParty.active[activeIdx]
      : this.gm.run.robotParty.reserves[reserveIdx];

    const sellPrice = getRobotSellPrice(robot.rarity, robot.level);

    // Remove from party
    if (activeIdx !== -1) {
      this.gm.run.robotParty.active[activeIdx] = null;
      // Auto-fill from reserves if available
      const reserveRobot = this.gm.run.robotParty.reserves.shift();
      if (reserveRobot) {
        this.gm.run.robotParty.active[activeIdx] = reserveRobot;
      }
    } else {
      this.gm.run.robotParty.reserves.splice(reserveIdx, 1);
    }

    // Add credits
    this.gm.run.player.credits = (this.gm.run.player.credits || 0) + sellPrice;

    // Track sold robot
    if (!room.dealer.soldRobots) room.dealer.soldRobots = [];
    room.dealer.soldRobots.push({ robotId, sellPrice });

    logger.info('[Dealer] Robot sold:', { robot: robot.nameEn, robotId, sellPrice });
    this.gm.narrate(`${robot.nameEn}を${sellPrice}クレジットで売却した。`);
    this.gm.emitState();

    return {
      success: true,
      robotId,
      robotName: robot.nameEn,
      creditsGained: sellPrice,
      creditsRemaining: this.gm.run.player.credits
    };
  }

  /**
   * Buy the dealer's offered robot
   */
  dealerBuy(robotId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'dealer') {
      throw new Error('No dealer here');
    }

    if (room.dealer.purchasedRobot) {
      throw new Error('Already purchased from this dealer');
    }

    // Find the offered robot
    const offered = room.dealer.offeredRobots.find(r => r.id === robotId);
    if (!offered) {
      throw new Error('Robot not available at dealer');
    }

    const price = offered.buyPrice;

    // Check credits
    if ((this.gm.run.player.credits || 0) < price) {
      throw new Error('Not enough credits');
    }

    // Check party size (max 6: 3 active + 3 reserves)
    const totalRobots = [
      ...this.gm.run.robotParty.active,
      ...this.gm.run.robotParty.reserves
    ].filter(Boolean).length;

    if (totalRobots >= 6) {
      throw new Error('Party is full (max 6 robots)');
    }

    // Deduct credits
    this.gm.run.player.credits -= price;

    // Add robot to party (mark as temporary -- won't enter collection)
    const newRobot = { ...offered, temporary: true };
    delete newRobot.buyPrice;

    // Add to active if space, otherwise reserves
    const emptyActiveSlot = this.gm.run.robotParty.active.findIndex(r => r === null);
    if (emptyActiveSlot !== -1) {
      this.gm.run.robotParty.active[emptyActiveSlot] = newRobot;
    } else {
      this.gm.run.robotParty.reserves.push(newRobot);
    }

    room.dealer.purchasedRobot = robotId;

    logger.info('[Dealer] Robot purchased:', { robot: offered.nameEn, robotId, price });
    this.gm.narrate(`${offered.nameEn}を${price}クレジットで雇った！`);
    this.gm.emitState();

    return {
      success: true,
      robot: newRobot,
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

    this.gm.narrate('ロボット商人に別れを告げた。');
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
