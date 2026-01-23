/**
 * @fileoverview ExplorationService - Dungeon exploration and room interaction
 * @module src/game/services/exploration-service
 *
 * PURPOSE:
 * Handles dungeon exploration logic including ward/floor selection,
 * room navigation, shrine interaction, and post-combat chip shop.
 *
 * KEY EXPORTS:
 * - ExplorationService (class) - Exploration and room interaction service
 *
 * DEPENDENCIES:
 * - GameManager reference (this.gm) for state access and cross-service calls
 * - rooms.js for ward/room generation and utilities
 * - items.js for item lookup
 */


import { getSimpleNarration } from '../dm.js';
import { generateEncounterCount } from '../state.js';

import {
  generateFloorRooms,
  getRoomEntryNarration,
  getRoomActions,
  generatePostCombatShop,
  STARTING_WARDS,
  getStartingWardOptions,
  getNextWardOptions,
  getWardInfo
} from '../rooms.js';




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

  // ============ WARD PATH SELECTION ============

  /**
   * Get starting ward options for run start
   */
  getStartingWardOptions() {
    return getStartingWardOptions();
  }

  /**
   * Select starting ward for a new run
   * @param {string} wardId - Ward ID (e.g., 'nerima' or 'setagaya')
   */
  selectStartingWard(wardId) {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    if (!STARTING_WARDS.includes(wardId)) {
      throw new Error(`Invalid starting ward: ${wardId}`);
    }

    this.gm.run.currentWard = wardId;
    this.gm.run.wardPath = [wardId];
    this.gm.run.floor = 1;
    this.gm.run.wardSelectionRequired = false;

    // Now enter the floor
    this.enterFloor();

    const wardInfo = getWardInfo(wardId);


    return {
      success: true,
      ward: wardInfo,
      floor: this.gm.run.floor
    };
  }

  /**
   * Get next ward options after clearing current ward (boss defeated)
   */
  getNextWardOptions() {
    if (!this.gm.run?.currentWard) {
      return [];
    }
    return getNextWardOptions(this.gm.run.currentWard);
  }

  /**
   * Select next ward after defeating boss
   * @param {string} wardId - Ward ID to advance to
   */
  selectNextWard(wardId) {
    if (!this.gm.run?.bossDefeated) {
      throw new Error('Boss not defeated');
    }

    const options = getNextWardOptions(this.gm.run.currentWard);
    const validOption = options.find(o => o.id === wardId);

    if (!validOption) {
      throw new Error(`Invalid ward selection: ${wardId}`);
    }

    this.gm.run.currentWard = wardId;
    this.gm.run.wardPath.push(wardId);
    this.gm.run.floor++;
    this.gm.run.wardSelectionRequired = false;

    // Enter the new floor
    this.enterFloor();

    const wardInfo = getWardInfo(wardId);


    return {
      success: true,
      ward: wardInfo,
      floor: this.gm.run.floor
    };
  }

  /**
   * Enter a floor
   */
  enterFloor() {
    if (!this.gm.run) {
      throw new Error('No active run');
    }

    // Reset floor state
    this.gm.run.encountersCompleted = 0;
    this.gm.run.encountersNeeded = generateEncounterCount(this.gm.run.floor);
    this.gm.run.bossDefeated = false;

    // Generate rooms for this floor
    this.gm.run.rooms = generateFloorRooms(this.gm.run.floor, this.gm.run.encountersNeeded);
    this.gm.run.currentRoom = 0;
    this.gm.run.roomsExplored = 0;

    // Mark first room as explored
    if (this.gm.run.rooms.length > 0) {
      this.gm.run.rooms[0].explored = true;
      this.gm.run.roomsExplored = 1;
    }

    this.gm.narrate(getSimpleNarration('enterFloor', this.gm.run.floor));
    this.gm.emitState();

    return {
      floor: this.gm.run.floor,
      totalRooms: this.gm.run.rooms.length,
      encountersNeeded: this.gm.run.encountersNeeded,
      firstRoom: this.gm.run.rooms[0]
    };
  }

  /**
   * Proceed to next floor after boss defeat
   */
  nextFloor() {
    if (!this.gm.run?.bossDefeated) {
      throw new Error('Boss not defeated');
    }

    if (this.gm.run.floor >= 7) {
      throw new Error('Already at final floor');
    }

    this.gm.run.floor++;


    return this.enterFloor();
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
  proceedToNextRoom() {
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

    // Can't proceed from boss room (use nextFloor instead)
    if (currentRoom.isBossRoom) {
      throw new Error('Cannot proceed past boss room');
    }

    // Move to next room
    this.gm.run.currentRoom++;
    const nextRoom = this.gm.run.rooms[this.gm.run.currentRoom];

    if (!nextRoom) {
      throw new Error('No more rooms');
    }

    // Mark as explored
    nextRoom.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Track room clears for counter chips
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(nextRoom);
    this.gm.narrate(narration);
    this.gm.emitState();


    return {
      room: nextRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(nextRoom),
      narration
    };
  }

  // ============ ROOM INTERACTIONS ============

  /**
   * Use a shrine to heal
   */
  useShrine() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    room.shrine.used = true;
    room.interacted = true;

    const healAmount = Math.floor(this.gm.run.player.maxHp * room.shrine.healPercent);
    const actualHeal = Math.min(healAmount, this.gm.run.player.maxHp - this.gm.run.player.hp);
    this.gm.run.player.hp = Math.min(this.gm.run.player.maxHp, this.gm.run.player.hp + healAmount);

    // Track healing for counter chips
    if (this.gm.run.runStats && actualHeal > 0) {
      this.gm.run.runStats.damageHealed += actualHeal;
    }

    this.gm.narrate(`祠に祈りを捧げた。${actualHeal} HPが回復した！`);

    this.gm.emitState();
    return { type: 'shrine', healed: actualHeal };
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

  // ============ POST-COMBAT SHOP ============

  /**
   * Buy an item from the post-combat shop
   * @param {number} itemIndex - Index of item to buy (0, 1, or 2)
   */
  buyFromPostCombatShop(itemIndex) {
    if (!this.gm.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    const shop = this.gm.run.postCombatShop;
    if (itemIndex < 0 || itemIndex >= shop.items.length) {
      throw new Error('Invalid item index');
    }

    const item = shop.items[itemIndex];
    const player = this.gm.run.player;

    // Add chip to player's chip inventory (unique only)
    if (!player.chips) {
      player.chips = [];
    }
    const alreadyOwned = player.chips.some(c => c.id === item.itemId);
    if (!alreadyOwned) {
      player.chips.push({
        id: item.itemId,
        name: item.name,
        nameEn: item.nameEn,
        category: item.category,
        rarity: item.rarity,
        effects: item.effects
      });
    }

    // Auto-equip if weapon has fewer than 5 chips
    const equippedChips = player.equipment?.weapon?.equippedChips || [];
    if (equippedChips.length < 5 && !equippedChips.includes(item.itemId)) {
      if (!player.equipment.weapon.equippedChips) {
        player.equipment.weapon.equippedChips = [];
      }
      player.equipment.weapon.equippedChips.push(item.itemId);
    }

    // Close shop
    this.gm.run.postCombatShop.active = false;

    this.gm.narrate(`${item.name}を獲得した！`);
    this.gm.emitState();

    return {
      success: true,
      item: item,
      goldSpent: 0,
      goldRemaining: player.gold
    };
  }

  /**
   * Skip the post-combat shop without buying
   */
  skipShop() {
    if (!this.gm.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    // Close shop without buying
    this.gm.run.postCombatShop.active = false;

    this.gm.narrate('先に進むことにした。');
    this.gm.emitState();

    return {
      success: true,
      skipped: true
    };
  }

  /**
   * Refresh the post-combat shop with 3 new random chips
   */
  refreshPostCombatShop() {
    if (!this.gm.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    // Generate new shop items (excluding already owned chips)
    const ownedChipIds = (this.gm.run.player.chips || []).map(c => c.id);
    const shopItems = generatePostCombatShop(this.gm.run.floor, ownedChipIds);

    this.gm.run.postCombatShop.items = shopItems;

    this.gm.narrate('商人が新しい品を出してきた。');
    this.gm.emitState();

    return {
      success: true,
      items: shopItems
    };
  }

  // ============ INVENTORY HELPERS ============

}
