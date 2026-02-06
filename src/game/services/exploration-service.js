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
import { generateEncounterCount, MAX_INVENTORY_SIZE } from '../state.js';
import { getChipLevel, setChipLevel, getChipPrice, CHIP_RARITIES, equipChip } from '../items/chips.js';

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

import { logger } from '../../logger.js';




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
      logger.warn('[Exploration] Invalid starting ward attempted:', { wardId });
      throw new Error(`Invalid starting ward: ${wardId}`);
    }

    this.gm.run.currentWard = wardId;
    this.gm.run.wardPath = [wardId];
    this.gm.run.floor = 1;
    this.gm.run.wardSelectionRequired = false;

    // Now enter the floor
    this.enterFloor();

    const wardInfo = getWardInfo(wardId);

    logger.info('[Exploration] Starting ward selected:', { ward: wardId, floor: this.gm.run.floor });

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

    // Set floor background image
    if (this.gm.run.floor > 7) {
      this.gm.run.background = 'outskirts.webp';
    } else {
      this.gm.run.background = `floor${this.gm.run.floor}.webp`;
    }

    // Mark first room as explored
    if (this.gm.run.rooms.length > 0) {
      this.gm.run.rooms[0].explored = true;
      this.gm.run.roomsExplored = 1;
    }

    this.gm.narrate(getSimpleNarration('enterFloor', this.gm.run.floor));

    logger.info('[Exploration] Entered floor:', { floor: this.gm.run.floor, ward: this.gm.run.currentWard });
    logger.debug('[Exploration] Floor rooms:', { roomCount: this.gm.run.rooms?.length });

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

  /**
   * Continue to next endless floor after boss defeat
   */
  continueEndless() {
    if (!this.gm.run?.bossDefeated && !this.gm.run?.gameVictoryPending) {
      throw new Error('Boss not defeated');
    }

    // Clear the victory pending flag if coming from Floor 7
    this.gm.run.gameVictoryPending = false;

    this.gm.run.floor++;
    this.gm.run.currentWard = 'outskirts';
    if (!this.gm.run.wardPath.includes('outskirts')) {
      this.gm.run.wardPath.push('outskirts');
    }
    this.gm.run.wardSelectionRequired = false;

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

    // Check if next room is a branch pair
    if (Array.isArray(nextRoom)) {
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

    // Single room - mark as explored (existing logic)
    nextRoom.explored = true;
    this.gm.run.roomsExplored++;
    this.gm.run.stats.roomsExplored++;

    // Vary background per room (floor1_1.webp through floor1_5.webp, cycling)
    const bgVariant = ((this.gm.run.currentRoom - 1) % 5) + 1;
    this.gm.run.background = `floor${this.gm.run.floor}_${bgVariant}.webp`;

    // Track room clears for counter chips
    if (this.gm.run.runStats) {
      this.gm.run.runStats.roomsCleared++;
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(nextRoom);
    this.gm.narrate(narration);
    this.gm.emitState();

    logger.info('[Exploration] Proceeded to room:', { type: nextRoom.type, index: this.gm.run.currentRoom });

    return {
      room: nextRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(nextRoom),
      narration
    };
  }

  /**
   * Select a door at a branch point
   * @param {number} doorIndex - 0 for door 1, 1 for door 2
   */
  selectBranch(doorIndex) {
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

    const selectedRoom = pair[doorIndex];

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
    const bgVariant = ((this.gm.run.currentRoom - 1) % 5) + 1;
    this.gm.run.background = `floor${this.gm.run.floor}_${bgVariant}.webp`;

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

  /**
   * Use a shrine to upgrade a chip
   * @param {string} chipId - ID of the chip to upgrade
   */
  useShrine(chipId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    const player = this.gm.run.player;
    const equippedChips = player.equipment?.weapon?.equippedChips || [];

    if (!equippedChips.includes(chipId)) {
      throw new Error('Chip not equipped');
    }

    const currentLevel = getChipLevel(player, chipId);

    if (currentLevel >= 7) {
      throw new Error('Chip already at max level');
    }

    const newLevel = currentLevel + 1;
    setChipLevel(player, chipId, newLevel);
    room.shrine.used = true;
    room.interacted = true;

    logger.info('[Shrine] Chip upgraded:', { chip: chipId, newLevel: newLevel });

    this.gm.narrate(`狐の祠の力でチップが強化された！ Lv. ${newLevel}`);
    this.gm.emitState();

    return { type: 'shrine_upgrade', chipId, newLevel };
  }

  useQuizReward(rewardType) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'quiz') {
      throw new Error('No quiz here');
    }

    if (room.quiz.rewarded) {
      throw new Error('Quiz reward already claimed');
    }

    const player = this.gm.run.player;
    let description;

    switch (rewardType) {
      case 'max_hp':
        player.maxHp += 25;
        player.hp += 25;
        description = 'Max HP +25!';
        break;

      case 'heal_hp':
        player.hp = Math.min(player.hp + 75, player.maxHp);
        description = 'HP restored +75!';
        break;

      case 'chip_charges': {
        const equippedChips = player.equipment?.weapon?.equippedChips || [];
        if (!player._chipCharges) player._chipCharges = {};
        for (const chipId of equippedChips) {
          player._chipCharges[chipId] = (player._chipCharges[chipId] || 0) + 3;
        }
        description = 'All Chip Skills +3 Charges!';
        break;
      }

      default:
        throw new Error('Invalid reward type');
    }

    room.quiz.rewarded = true;
    room.interacted = true;

    this.gm.narrate(`クイズマスター：「正解！」 ${description}`);
    this.gm.emitState();

    return { type: 'quiz_reward', rewardType, description, player: { hp: player.hp, maxHp: player.maxHp } };
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
      // Already completed, just return success
      return { type: 'word_discovery_complete', alreadyComplete: true };
    }

    room.wordDiscovery.completed = true;
    room.interacted = true;

    logger.info('[WordDiscovery] Room completed');
    this.gm.emitState();

    return { type: 'word_discovery_complete' };
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
    const price = item.price || 0;

    // Check if player can afford the chip
    if (player.credits < price) {
      throw new Error('Not enough credits');
    }

    // Check inventory cap (unequipped chips only)
    const equippedChipIds = new Set(player.equipment?.weapon?.equippedChips || []);
    const unequippedCount = (player.chips || []).filter(c => !equippedChipIds.has(c.id)).length;
    if (unequippedCount >= MAX_INVENTORY_SIZE) {
      throw new Error('Inventory full - sell chips to make room');
    }

    // Deduct credits
    player.credits -= price;

    // Add chip to player's chip inventory (unique only)
    if (!player.chips) {
      player.chips = [];
    }
    const alreadyOwned = player.chips.some(c => c.id === item.itemId);
    if (!alreadyOwned) {
      player.chips.push({
        id: item.itemId,
        baseId: item.baseId || item.itemId,
        name: item.name,
        nameEn: item.nameEn,
        category: item.category,
        rarity: item.rarity,
        effects: item.effects,
        stats: item.stats
      });
    }

    // Auto-equip if weapon has fewer than 5 chips (use equipChip to apply HP bonus)
    const equippedChips = player.equipment?.weapon?.equippedChips || [];
    if (equippedChips.length < 5 && !equippedChips.includes(item.itemId)) {
      equipChip(player, 'weapon', item.itemId);
    }

    // Close shop
    this.gm.run.postCombatShop.active = false;

    logger.info('[Shop] Chip acquired:', { chip: item.name, chipId: item.itemId, price });

    this.gm.narrate(`${item.name}を${price}クレジットで購入した！`);
    this.gm.emitState();

    return {
      success: true,
      item: item,
      creditsSpent: price,
      creditsRemaining: player.credits
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
   * First refresh is free, subsequent refreshes cost 25 credits
   */
  refreshPostCombatShop() {
    if (!this.gm.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    const shop = this.gm.run.postCombatShop;
    const player = this.gm.run.player;
    const REFRESH_COST = 25;

    // Check if free refresh has been used
    let creditsSpent = 0;
    if (shop.freeRefreshUsed) {
      // Charge for refresh
      if (player.credits < REFRESH_COST) {
        throw new Error('Not enough credits for refresh');
      }
      player.credits -= REFRESH_COST;
      creditsSpent = REFRESH_COST;
    } else {
      // Mark free refresh as used
      shop.freeRefreshUsed = true;
    }

    // Generate new shop items (excluding already owned chips)
    const ownedChipIds = (this.gm.run.player.chips || []).map(c => c.id);
    const shopItems = generatePostCombatShop(this.gm.run.floor, ownedChipIds);

    shop.items = shopItems;

    if (creditsSpent > 0) {
      this.gm.narrate(`${REFRESH_COST}クレジットで商人が新しい品を出してきた。`);
    } else {
      this.gm.narrate('商人が新しい品を出してきた。');
    }
    this.gm.emitState();

    return {
      success: true,
      items: shopItems,
      creditsSpent,
      creditsRemaining: player.credits,
      freeRefreshUsed: shop.freeRefreshUsed
    };
  }

  // ============ INVENTORY HELPERS ============

  /**
   * Sell a chip from inventory for 50% of its buy price
   * @param {string} chipId - ID of chip to sell
   */
  sellChip(chipId) {
    const player = this.gm.run?.player;
    if (!player) {
      throw new Error('No active run');
    }

    // Find chip in inventory
    const chipIndex = player.chips?.findIndex(c => c.id === chipId);
    if (chipIndex === -1 || chipIndex === undefined) {
      throw new Error('Chip not in inventory');
    }

    const chip = player.chips[chipIndex];

    // Cannot sell equipped chips
    const equippedChipIds = player.equipment?.weapon?.equippedChips || [];
    if (equippedChipIds.includes(chipId)) {
      throw new Error('Cannot sell equipped chip - unequip first');
    }

    // Calculate sell price (50% of buy price)
    const buyPrice = chip.price || getChipPrice(chipId);
    const sellPrice = Math.floor(buyPrice * 0.5);

    // Remove from inventory
    player.chips.splice(chipIndex, 1);

    // Add credits
    player.credits += sellPrice;

    logger.info('[Shop] Chip sold:', { chip: chip.name, chipId, sellPrice });

    this.gm.narrate(`${chip.name || chip.nameEn}を${sellPrice}クレジットで売却した。`);
    this.gm.emitState();

    return {
      success: true,
      chipId,
      chipName: chip.name || chip.nameEn,
      creditsGained: sellPrice,
      creditsRemaining: player.credits
    };
  }

  /**
   * Get current inventory status
   */
  getInventoryStatus() {
    const player = this.gm.run?.player;
    if (!player) {
      return { unequippedCount: 0, maxInventory: MAX_INVENTORY_SIZE, isFull: false };
    }

    const equippedChipIds = new Set(player.equipment?.weapon?.equippedChips || []);
    const unequippedCount = (player.chips || []).filter(c => !equippedChipIds.has(c.id)).length;

    return {
      unequippedCount,
      maxInventory: MAX_INVENTORY_SIZE,
      isFull: unequippedCount >= MAX_INVENTORY_SIZE
    };
  }
}
