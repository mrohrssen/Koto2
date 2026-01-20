/**
 * @fileoverview ExplorationService - Dungeon exploration and room interaction
 * @module src/game/services/exploration-service
 *
 * PURPOSE:
 * Handles all dungeon exploration logic including ward/floor selection,
 * room navigation, room interactions (traps, bodies, treasures, shrines),
 * shops (post-combat and merchant), and blacksmith services.
 *
 * KEY EXPORTS:
 * - ExplorationService (class) - Exploration and room interaction service
 *
 * DEPENDENCIES:
 * - GameManager reference (this.gm) for state access and cross-service calls
 * - rooms.js for ward/room generation and utilities
 * - items.js for inventory and equipment management
 * - combat.js for refinement mechanics
 * - items/chips.js for chip upgrade mechanics
 * - events.js for event bus notifications
 */

import { eventBus, GameEvents } from '../events.js';
import { getSimpleNarration } from '../dm.js';
import { generateEncounterCount, recalculatePlayerResources } from '../state.js';

import {
  generateFloorRooms,
  getRoomEntryNarration,
  getRoomActions,
  generateBodyLoot,
  generateChestLoot,
  attemptDisarm,
  attemptAvoid,
  calculateTrapDamage,
  TRAP_TYPES,
  generatePostCombatShop,
  STARTING_WARDS,
  getStartingWardOptions,
  getNextWardOptions,
  getWardInfo
} from '../rooms.js';

import {
  getItem,
  calculateEquipmentBonuses,
  processOnRoomEnterChips,
  getEquippedChips
} from '../items.js';

import {
  attemptRefinement,
  getRefinementPreview
} from '../combat.js';

import {
  getNextRarity,
  getUpgradeCost,
  getUpgradeFailureChance,
  attemptChipUpgrade,
  CHIP_RARITIES
} from '../items/chips.js';

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

    eventBus.emit(GameEvents.WARD_SELECTED, { wardId, wardInfo, floor: 1 });

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

    eventBus.emit(GameEvents.WARD_SELECTED, { wardId, wardInfo, floor: this.gm.run.floor });
    eventBus.emit(GameEvents.FLOOR_ENTERED, { floor: this.gm.run.floor, ward: wardId });

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

    eventBus.emit(GameEvents.FLOOR_ENTERED, { floor: this.gm.run.floor });

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

    // Process on-room-enter chip effects
    const roomEnterEffects = {};
    const equippedChips = getEquippedChips(this.gm.run.player);
    if (equippedChips.length > 0) {
      const roomEffects = processOnRoomEnterChips(equippedChips);
      if (roomEffects.heal > 0) {
        const hpBefore = this.gm.run.player.hp;
        this.gm.run.player.hp = Math.min(this.gm.run.player.maxHp, this.gm.run.player.hp + roomEffects.heal);
        roomEnterEffects.heal = this.gm.run.player.hp - hpBefore;
      }
      if (roomEffects.buffs.length > 0) {
        roomEnterEffects.buffs = roomEffects.buffs;
      }
      if (roomEffects.rareSpawn) {
        roomEnterEffects.rareSpawn = true;
      }
      if (roomEffects.stealth) {
        roomEnterEffects.stealth = true;
        // Mark player as stealthed for potential combat avoidance
        this.gm.run.player.stealth = true;
      }
      if (roomEffects.stunAllEnemies > 0) {
        roomEnterEffects.stunAllEnemies = roomEffects.stunAllEnemies;
      }
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(nextRoom);
    this.gm.narrate(narration);
    this.gm.emitState();

    eventBus.emit(GameEvents.ROOM_ENTERED, { room: nextRoom, roomNumber: this.gm.run.currentRoom + 1 });

    return {
      room: nextRoom,
      roomNumber: this.gm.run.currentRoom + 1,
      totalRooms: this.gm.run.rooms.length,
      actions: getRoomActions(nextRoom),
      narration,
      chipEffects: Object.keys(roomEnterEffects).length > 0 ? roomEnterEffects : null
    };
  }

  // ============ ROOM INTERACTIONS ============

  /**
   * Interact with trap - attempt to disarm
   */
  disarmTrap() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'trap') {
      throw new Error('No trap to disarm');
    }

    if (room.trap.triggered || room.trap.disarmed) {
      throw new Error('Trap already handled');
    }

    const result = attemptDisarm(room.trap, this.gm.run.player);

    if (result.success) {
      room.trap.disarmed = true;
      room.interacted = true;
      this.gm.run.stats.trapsDisarmed++;
      this.gm.run.player.xp += result.xpReward;
      this.gm.narrate(`罠を解除した！${result.xpReward} XPを獲得！`);
    } else {
      room.trap.triggered = true;
      room.interacted = true;
      this.gm.run.player.hp = Math.max(0, this.gm.run.player.hp - result.damage);
      this.gm.run.stats.damageTaken += result.damage;
      this.gm.narrate(`罠の解除に失敗！${result.damage}ダメージ！`);

      if (this.gm.run.player.hp <= 0) {
        return this.gm._handleDefeat();
      }
    }

    this.gm.emitState();
    return { type: result.success ? 'disarm_success' : 'disarm_fail', ...result };
  }

  /**
   * Interact with trap - attempt to avoid/trigger
   */
  triggerTrap() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'trap') {
      throw new Error('No trap to trigger');
    }

    if (room.trap.triggered || room.trap.disarmed) {
      throw new Error('Trap already handled');
    }

    const result = attemptAvoid(room.trap, this.gm.run.player);
    room.trap.triggered = true;
    room.interacted = true;

    if (result.avoided) {
      this.gm.narrate('罠を避けた！素早く通り抜けた。');
    } else {
      this.gm.run.player.hp = Math.max(0, this.gm.run.player.hp - result.damage);
      this.gm.run.stats.damageTaken += result.damage;
      this.gm.narrate(`罠に引っかかった！${result.damage}ダメージ！`);

      if (this.gm.run.player.hp <= 0) {
        return this.gm._handleDefeat();
      }
    }

    this.gm.emitState();
    return { type: result.avoided ? 'avoid_success' : 'avoid_fail', ...result };
  }

  /**
   * Loot a body
   */
  lootBody() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'body') {
      throw new Error('No body to loot');
    }

    if (room.body.looted) {
      throw new Error('Body already looted');
    }

    if (room.body.skipped) {
      throw new Error('Body was ignored');
    }

    room.body.looted = true;
    room.interacted = true;

    // Check for trap
    let trapTriggered = false;
    let trapDamage = 0;
    if (room.body.trapped) {
      const trap = TRAP_TYPES[room.body.trapType];
      trapDamage = calculateTrapDamage(trap);
      this.gm.run.player.hp = Math.max(0, this.gm.run.player.hp - trapDamage);
      this.gm.run.stats.damageTaken += trapDamage;
      trapTriggered = true;
      this.gm.narrate(`遺体を調べた...罠だ！${trapDamage}ダメージ！`);

      if (this.gm.run.player.hp <= 0) {
        return this.gm._handleDefeat();
      }
    }

    const loot = generateBodyLoot(room.body.lootTier);

    // Add loot to player inventory
    for (const item of loot) {
      this.addItemToInventory(item.itemId, item.quantity);
    }

    const lootDesc = loot.length > 0
      ? `見つけた: ${loot.map(l => `${l.itemId}×${l.quantity}`).join(', ')}`
      : '何も見つからなかった。';

    if (!trapTriggered) {
      this.gm.narrate(`遺体を調べた。${lootDesc}`);
    } else {
      this.gm.narrate(`それでも...${lootDesc}`);
    }

    this.gm.emitState();
    return { type: 'loot', loot, trapped: trapTriggered, damage: trapDamage };
  }

  /**
   * Skip looting a body (ignore it)
   */
  skipBody() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'body') {
      throw new Error('No body to skip');
    }

    if (room.body.looted || room.body.skipped) {
      throw new Error('Body already interacted with');
    }

    room.body.skipped = true;
    room.interacted = true;
    this.gm.narrate('遺体を無視して進むことにした。');

    this.gm.emitState();
    return { type: 'skip', skipped: 'body' };
  }

  /**
   * Open a treasure chest
   */
  openTreasure() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'treasure') {
      throw new Error('No treasure to open');
    }

    if (room.treasure.opened) {
      throw new Error('Treasure already opened');
    }

    room.treasure.opened = true;
    room.interacted = true;
    this.gm.run.stats.treasuresOpened++;

    // Check for trap
    if (room.treasure.trapped) {
      const trap = TRAP_TYPES[room.treasure.trapType];
      const damage = calculateTrapDamage(trap);
      this.gm.run.player.hp = Math.max(0, this.gm.run.player.hp - damage);
      this.gm.run.stats.damageTaken += damage;
      this.gm.narrate(`宝箱を開けた...罠だ！${damage}ダメージ！`);

      if (this.gm.run.player.hp <= 0) {
        return this.gm._handleDefeat();
      }
    }

    const loot = generateChestLoot(room.treasure.tier);

    // Add loot to player inventory
    for (const item of loot) {
      this.addItemToInventory(item.itemId, item.quantity);
    }

    const lootDesc = loot.length > 0
      ? `見つけた: ${loot.map(l => `${l.itemId}×${l.quantity}`).join(', ')}`
      : '空だった...';

    if (!room.treasure.trapped) {
      this.gm.narrate(`宝箱を開けた！${lootDesc}`);
    } else {
      this.gm.narrate(`それでも...${lootDesc}`);
    }

    this.gm.emitState();
    return { type: 'treasure', loot, trapped: room.treasure.trapped };
  }

  /**
   * Skip opening a treasure chest (ignore it)
   */
  skipTreasure() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'treasure') {
      throw new Error('No treasure to skip');
    }

    if (room.treasure.opened || room.treasure.skipped) {
      throw new Error('Treasure already interacted with');
    }

    room.treasure.skipped = true;
    room.interacted = true;
    this.gm.narrate('宝箱を無視して進むことにした。怪しすぎる。');

    this.gm.emitState();
    return { type: 'skip', skipped: 'treasure' };
  }

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

    // Check if player has enough gold
    if (player.gold < item.price) {
      throw new Error('Not enough gold');
    }

    // Deduct gold
    player.gold -= item.price;

    // Handle item based on type
    if (item.type === 'chip') {
      // Add chip to player's chip inventory (unique only)
      if (!player.chips) {
        player.chips = [];
      }
      // Check if player already owns this chip
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
    } else {
      // Legacy handling for equipment/consumables
      const itemData = getItem(item.itemId);
      if (itemData) {
        if (item.type === 'equipment') {
          if (!player.equipmentInventory) {
            player.equipmentInventory = [];
          }
          player.equipmentInventory.push({ id: item.itemId });
        } else {
          const existing = player.items.find(i => i.id === item.itemId);
          if (existing) {
            existing.quantity = (existing.quantity || 1) + 1;
          } else {
            player.items.push({ id: item.itemId, quantity: 1 });
          }
        }
      }
    }

    // Recalculate all stats in case item has passive bonuses (chips add stats)
    const equipBonuses = calculateEquipmentBonuses(player);
    recalculatePlayerResources(player, equipBonuses, true);

    // Close shop
    this.gm.run.postCombatShop.active = false;

    this.gm.narrate(`${item.name}を購入した！`);
    this.gm.emitState();

    eventBus.emit(GameEvents.ITEM_PURCHASED, { item, gold: item.price });

    return {
      success: true,
      item: item,
      goldSpent: item.price,
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

  // ============ MERCHANT SHOP ============

  /**
   * Get merchant inventory for current room
   */
  getShopInventory() {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'merchant') {
      throw new Error('No merchant here');
    }

    return {
      inventory: room.merchant.inventory,
      playerGold: this.gm.run.player.gold
    };
  }

  /**
   * Buy item from merchant
   */
  buyFromShop(itemId, quantity = 1) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'merchant') {
      throw new Error('No merchant here');
    }

    // Find item in merchant inventory
    const shopItem = room.merchant.inventory.find(i => i.itemId === itemId);
    if (!shopItem) {
      throw new Error('Item not available');
    }

    if (shopItem.quantity < quantity) {
      throw new Error('Not enough stock');
    }

    const totalCost = shopItem.price * quantity;
    if (this.gm.run.player.gold < totalCost) {
      throw new Error('Not enough gold');
    }

    // Make the purchase
    this.gm.run.player.gold -= totalCost;
    shopItem.quantity -= quantity;

    // Remove item from shop if sold out
    if (shopItem.quantity <= 0) {
      room.merchant.inventory = room.merchant.inventory.filter(i => i.itemId !== itemId);
    }

    // Add item to player inventory
    this.addItemToInventory(itemId, quantity);

    this.gm.narrate(`${quantity}個を${totalCost}Gで買った。`);

    this.gm.emitState();

    eventBus.emit(GameEvents.ITEM_PURCHASED, { itemId, quantity, gold: totalCost });

    return {
      type: 'purchase',
      itemId,
      quantity,
      cost: totalCost,
      remainingGold: this.gm.run.player.gold
    };
  }

  // ============ BLACKSMITH / REFINEMENT ============

  /**
   * Get refinement preview for all equipped items
   */
  getRefinePreview() {
    if (!this.gm.run || !this.gm.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const previews = {};
    const slots = ['weapon', 'body', 'shield', 'accessory'];

    for (const slot of slots) {
      const preview = getRefinementPreview(this.gm.run.player, slot);
      if (preview) {
        previews[slot] = preview;
      }
    }

    return {
      previews,
      playerGold: this.gm.run.player.gold,
      floorBonus: room.blacksmith?.successBonus || 0
    };
  }

  /**
   * Attempt to refine an equipped item
   * @param {string} slot - Equipment slot to refine
   */
  refineEquipment(slot) {
    if (!this.gm.run || !this.gm.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const floorBonus = room.blacksmith?.successBonus || 0;
    const result = attemptRefinement(this.gm.run.player, slot, floorBonus);

    if (result.error) {
      throw new Error(result.error);
    }

    // Mark blacksmith as interacted
    if (room.blacksmith) {
      room.blacksmith.interacted = true;
    }

    this.gm.emitState();
    return result;
  }

  /**
   * Get chip upgrade preview for blacksmith
   * Returns 3 random upgradeable chips from player inventory
   * @returns {object} { chips: Array, playerGold: number }
   */
  getChipUpgradePreview() {
    console.log('[getChipUpgradePreview] Called');
    if (!this.gm.run || !this.gm.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    console.log('[getChipUpgradePreview] Room type:', room?.type, 'Room:', room);
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const player = this.gm.run.player;
    const floorBonus = room.blacksmith?.successBonus || 0;

    // All chips are in player.chips (both equipped and unequipped)
    // Get upgradeable chips (not legendary)
    const upgradeableChips = (player.chips || []).filter(chip => {
      const nextRarity = getNextRarity(chip.rarity);
      return nextRarity !== null; // Can upgrade if not legendary
    });

    // Shuffle and pick up to 3
    const shuffled = [...upgradeableChips].sort(() => Math.random() - 0.5);
    const selectedChips = shuffled.slice(0, 3);

    // Add upgrade info to each chip
    const chipsWithInfo = selectedChips.map(chip => ({
      ...chip,
      upgradeCost: getUpgradeCost(chip),
      failureChance: getUpgradeFailureChance(chip, floorBonus),
      nextRarity: getNextRarity(chip.rarity),
      nextRarityInfo: CHIP_RARITIES[getNextRarity(chip.rarity)]
    }));

    // Store selected chips in room for validation
    room.blacksmith.selectedChipIds = chipsWithInfo.map(c => c.id);

    return {
      chips: chipsWithInfo,
      playerGold: player.gold,
      floorBonus,
      greeting: '「チップを強化してやろうか？失敗すると...まあ、分かるだろ？」'
    };
  }

  /**
   * Attempt to upgrade a chip at the blacksmith
   * @param {string} chipId - ID of chip to upgrade
   * @returns {object} { success: boolean, message: string, chip?: object }
   */
  performChipUpgrade(chipId) {
    if (!this.gm.run || !this.gm.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    if (room.blacksmith?.interacted) {
      throw new Error('Blacksmith already used');
    }

    const player = this.gm.run.player;
    const floorBonus = room.blacksmith?.successBonus || 0;

    // Validate chip is in the offered selection
    if (!room.blacksmith?.selectedChipIds?.includes(chipId)) {
      throw new Error('Invalid chip selection');
    }

    // Find chip in player inventory
    const chipIndex = player.chips.findIndex(c => c.id === chipId);
    if (chipIndex === -1) {
      throw new Error('Chip not found in inventory');
    }

    const chip = player.chips[chipIndex];
    const upgradeCost = getUpgradeCost(chip);

    // Check player has enough gold
    if (player.gold < upgradeCost) {
      throw new Error('Not enough credits');
    }

    // Deduct gold
    player.gold -= upgradeCost;

    // Attempt upgrade
    const result = attemptChipUpgrade(chip, floorBonus);

    // Mark blacksmith as interacted
    room.blacksmith.interacted = true;

    // Find if chip is equipped to any equipment slot
    const slots = ['weapon', 'body', 'shield', 'accessory'];
    let equippedSlot = null;
    for (const slot of slots) {
      const equipment = player.equipment?.[slot];
      if (equipment?.equippedChips?.includes(chipId)) {
        equippedSlot = slot;
        break;
      }
    }

    if (result.success) {
      // Remove old chip
      player.chips.splice(chipIndex, 1);
      // Add upgraded chip
      player.chips.push(result.upgradedChip);

      // Update equipment reference if chip was equipped
      if (equippedSlot) {
        const equipment = player.equipment[equippedSlot];
        const chipIdx = equipment.equippedChips.indexOf(chipId);
        if (chipIdx !== -1) {
          equipment.equippedChips[chipIdx] = result.upgradedChip.id;
        }
      }

      this.gm.emitNarration(`「よし、成功だ。」${chip.name || chip.nameEn}が${CHIP_RARITIES[result.newRarity].name}に強化された！`);
      this.gm.emitState();

      return {
        success: true,
        message: `${chip.name || chip.nameEn}が${CHIP_RARITIES[result.newRarity].name}に強化された！`,
        chip: result.upgradedChip,
        previousRarity: result.previousRarity,
        newRarity: result.newRarity
      };
    } else {
      // Remove destroyed chip
      player.chips.splice(chipIndex, 1);

      // Remove from equipment if chip was equipped
      if (equippedSlot) {
        const equipment = player.equipment[equippedSlot];
        equipment.equippedChips = equipment.equippedChips.filter(id => id !== chipId);
      }

      this.gm.emitNarration(`「...失敗だ。チップは壊れた。」${chip.name || chip.nameEn}は破壊された...`);
      this.gm.emitState();

      return {
        success: false,
        message: `${chip.name || chip.nameEn}は破壊された...`,
        destroyedChip: chip
      };
    }
  }

  // ============ INVENTORY HELPERS ============

  /**
   * Add item to player inventory
   */
  addItemToInventory(itemId, quantity) {
    if (itemId === 'gold') {
      this.gm.run.player.gold += quantity;
      this.gm.run.stats.goldEarned += quantity;
      return;
    }

    const existing = this.gm.run.player.items.find(i => i.id === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.gm.run.player.items.push({ id: itemId, quantity });
    }
  }

  /**
   * Equip an item from inventory
   * @param {string} itemId - ID of item to equip
   * @returns {object} Result with equipped item info
   */
  equipItem(itemId) {
    const player = this.gm.run?.player || this.gm.player;
    if (!player) {
      throw new Error('No player found');
    }

    // Find item in inventory
    const invItem = player.items.find(i => i.id === itemId);
    if (!invItem || invItem.quantity <= 0) {
      throw new Error('Item not in inventory');
    }

    // Get item definition
    const itemDef = getItem(itemId);
    if (!itemDef) {
      throw new Error('Unknown item');
    }

    // Check if it's equipment
    if (!itemDef.slot) {
      throw new Error('Item cannot be equipped');
    }

    const slot = itemDef.slot;
    const currentEquipped = player.equipment[slot];

    // Unequip current item if any (put back in inventory)
    if (currentEquipped) {
      const currentId = currentEquipped.id || currentEquipped;
      const existingInv = player.items.find(i => i.id === currentId);
      if (existingInv) {
        existingInv.quantity += 1;
      } else {
        player.items.push({ id: currentId, quantity: 1 });
      }
    }

    // Equip new item
    player.equipment[slot] = { id: itemId, refinement: invItem.refinement || 0 };

    // Remove from inventory
    invItem.quantity -= 1;
    if (invItem.quantity <= 0) {
      player.items = player.items.filter(i => i.id !== itemId);
    }

    // Sync to base player if in run
    if (this.gm.run?.player && this.gm.player) {
      this.gm.player.equipment = { ...player.equipment };
      this.gm.player.items = [...player.items];
    }

    // Note: saveGame is handled by the server after equipItem returns
    this.gm.emitState();

    return {
      equipped: itemDef.name,
      slot: slot,
      unequipped: currentEquipped ? getItem(currentEquipped.id || currentEquipped)?.name : null
    };
  }
}
