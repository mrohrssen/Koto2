/**
 * @fileoverview GameManager class - core game orchestration and state machine
 * @module src/game/loop
 *
 * PURPOSE:
 * Central orchestrator for the entire game. Contains the GameManager class which
 * manages player state, dungeon runs, combat encounters, room exploration, shops,
 * and meta-progression. This is the main interface between the server endpoints
 * and the game logic modules.
 *
 * KEY EXPORTS:
 * - GameManager (class) - Main game orchestration class, singleton instance used by server
 *
 * GAMEMANAGER METHODS:
 * Meta-progression:
 * - initMeta(data) - Initialize or load meta-progression
 * - purchaseUpgrade(id) - Buy permanent upgrades with essence
 * - awardRunEssence(isVictory) - Calculate and award end-of-run essence
 * - checkAchievements() - Check and unlock achievements
 *
 * Player/Run Management:
 * - createPlayer(name, stats, points) - Create new player character
 * - startRun() - Begin new dungeon run
 * - forfeitRun() - Abandon current run
 * - reset() / fullReset() - Reset run or entire game
 *
 * Ward/Floor Navigation:
 * - getStartingWardOptions() / selectStartingWard(id) - Initial ward selection
 * - getNextWardOptions() / selectNextWard(id) - Post-boss ward selection
 * - enterFloor() - Generate rooms for current floor
 * - nextFloor() - Advance to next floor after boss
 *
 * Room Exploration:
 * - getCurrentRoom() / proceedToNextRoom() - Room navigation
 * - disarmTrap() / triggerTrap() - Trap handling
 * - lootBody() / openTreasure() - Loot interactions
 * - useShrine() - Shrine healing/buffs
 *
 * Combat:
 * - startEncounter() / startBossEncounter() - Begin battles
 * - attack(type) / defend() / magic(id) / useItem(id) / flee() - Player actions
 * - enemyTurn() - Process enemy action
 * - realtimeAttackCycle(type) - Timer-based combat mode
 *
 * Economy:
 * - getShopInventory() / buyFromShop(id) - Town shop
 * - buyFromPostCombatShop(index) - Post-combat drops
 * - refineEquipment(slot) - Blacksmith refinement
 * - getChipUpgradePreview() / performChipUpgrade(chipId) - Blacksmith chip upgrade
 *
 * DEPENDENCIES:
 * - ./state.js - State factories (createNewPlayer, createNewRun, createCombatState)
 * - ./enemies.js - Enemy generation and boss definitions
 * - ./combat.js - Combat mechanics (attack, defend, magic, status effects)
 * - ./rooms.js - Room generation, ward system, traps, loot
 * - ./items.js - Item/equipment data and bonuses
 * - ./stats.js - Stat calculations
 * - ./dm.js - Fallback narration
 *
 * STATE STRUCTURE:
 * - this.player - Base player (persists between runs)
 * - this.run - Current run state (null when in hub)
 * - this.combat - Current combat (null when not fighting)
 * - this.meta - Meta-progression (essence, upgrades, achievements)
 *
 * GAME PHASES (returned by getPhase()):
 * - 'no_save' - No player exists
 * - 'hub' - In town between runs
 * - 'ward_selection' - Choosing starting/next ward
 * - 'exploring' - In dungeon, navigating rooms
 * - 'combat' - In battle (also 'victory', 'defeat')
 * - 'shop' / 'blacksmith' - Economic interactions
 * - 'post_combat_shop' - Buying drops after combat
 * - 'boss_defeated' - Just beat floor boss
 * - 'run_complete' - Beat final boss
 *
 * ARCHITECTURE NOTES:
 * - GameManager is instantiated once by server.js
 * - State changes emit via onStateChange() callbacks
 * - Narration emits via onNarration() callbacks (server adds AI narration)
 * - Combat can be turn-based or realtime (realtimeAttackCycle)
 * - Meta-progression persists via server file saves
 * - Run state deep-clones player to allow death without losing base progress
 *
 * CLAUDE HINTS:
 * - For combat damage formulas, see combat/mechanics.js
 * - For enemy AI/intents, see enemies.js selectEnemyIntent()
 * - For room types and generation, see rooms.js
 * - Server endpoints mostly call GameManager methods directly
 * - Equipment bonuses recalculated via recalculatePlayerResources() after changes
 */

import {
  createNewPlayer,
  createNewRun,
  createCombatState,
  generateEncounterCount,
  checkLevelUp,
  createMetaProgression,
  calculateEssenceReward,
  getMetaUpgradeEffects,
  recalculatePlayerResources,
  META_UPGRADES,
  ACHIEVEMENTS
} from './state.js';

import {
  generateEnemy,
  getBossForFloor,
  getBossDrop,
  FINAL_BOSS,
  selectEnemyIntent,
  INTENT_TYPES,
  pickRandomVoiceLine
} from './enemies.js';

import {
  executeAttack,
  executePlayerAttack,
  PLAYER_ATTACK_TYPES,
  executeMagic,
  executeItem,
  executeDefend,
  attemptFlee,
  executeEnemyTurn,
  determineTurnOrder,
  tickStatusEffects,
  processVictory,
  processBossVictory,
  isEnemyDefending,
  applyDamageToEnemy,
  checkEnemyAbility,
  getPassiveDamageReduction,
  checkEnemyBarrier,
  breakEnemyBarrier,
  isEnemyVanished,
  tickEnemyVanish,
  hasStatusEffect,
  removeStatusEffect,
  attemptRefinement,
  getRefinementPreview
} from './combat.js';

import { getSimpleNarration } from './dm.js';

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
  // Ward path system
  STARTING_WARDS,
  WARD_INFO,
  WARD_PATHS,
  getStartingWardOptions,
  getNextWardOptions,
  getWardTier,
  getWardInfo
} from './rooms.js';

import { getItem, calculateEquipmentBonuses, processOnRoomEnterChips, getEquippedChips } from './items.js';

import { getEntityAttackInterval } from './stats.js';

import {
  getNextRarity,
  getUpgradeCost,
  getUpgradeFailureChance,
  createUpgradedChip,
  attemptChipUpgrade,
  CHIP_RARITIES
} from './items/chips.js';

// ============ GAME MANAGER ============

export class GameManager {
  constructor() {
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;               // Meta-progression (persists across runs)
    this.narrationCallback = null;  // Called with narration text
    this.stateCallback = null;      // Called when state changes
  }

  // ============ META-PROGRESSION ============

  /**
   * Initialize or load meta-progression
   */
  initMeta(metaData = null) {
    this.meta = metaData || createMetaProgression();
    return this.meta;
  }

  /**
   * Get meta-progression state
   */
  getMeta() {
    return this.meta || createMetaProgression();
  }

  /**
   * Get all upgrade effects for display
   */
  getMetaEffects() {
    return getMetaUpgradeEffects(this.meta);
  }

  /**
   * Get available upgrades with current levels and costs
   */
  getAvailableUpgrades() {
    const upgrades = [];
    const currentUpgrades = this.meta?.upgrades || {};

    for (const [id, upgrade] of Object.entries(META_UPGRADES)) {
      const currentLevel = currentUpgrades[id] || 0;
      const nextLevel = currentLevel + 1;
      const canUpgrade = nextLevel <= upgrade.maxLevel;
      const cost = canUpgrade ? upgrade.costPerLevel[currentLevel] : null;

      upgrades.push({
        id,
        name: upgrade.name,
        nameEn: upgrade.nameEn,
        description: upgrade.description,
        currentLevel,
        maxLevel: upgrade.maxLevel,
        nextCost: cost,
        canAfford: cost !== null && (this.meta?.essence || 0) >= cost,
        maxed: !canUpgrade
      });
    }

    return upgrades;
  }

  /**
   * Purchase an upgrade
   */
  purchaseUpgrade(upgradeId) {
    if (!this.meta) {
      return { success: false, error: 'No meta-progression initialized' };
    }

    const upgrade = META_UPGRADES[upgradeId];
    if (!upgrade) {
      return { success: false, error: 'Unknown upgrade' };
    }

    const currentLevel = this.meta.upgrades[upgradeId] || 0;
    if (currentLevel >= upgrade.maxLevel) {
      return { success: false, error: 'Upgrade already maxed' };
    }

    const cost = upgrade.costPerLevel[currentLevel];
    if (this.meta.essence < cost) {
      return { success: false, error: 'Not enough essence' };
    }

    // Purchase!
    this.meta.essence -= cost;
    this.meta.upgrades[upgradeId] = currentLevel + 1;

    this.emitState();

    return {
      success: true,
      upgrade: {
        id: upgradeId,
        newLevel: currentLevel + 1,
        cost
      }
    };
  }

  /**
   * Award essence for a completed run
   */
  awardRunEssence(isVictory = false) {
    if (!this.meta || !this.run) return { essence: 0 };

    const essence = calculateEssenceReward(
      this.run.stats,
      this.run.floor,
      isVictory
    );

    this.meta.essence += essence;
    this.meta.lifetimeStats.totalEssenceEarned += essence;

    return { essence };
  }

  /**
   * Update lifetime stats after a run
   */
  updateLifetimeStats(isVictory = false) {
    if (!this.meta || !this.run) return;

    const stats = this.meta.lifetimeStats;
    const runStats = this.run.stats;

    stats.totalRuns++;
    if (isVictory) {
      stats.runsCompleted++;
    } else {
      stats.runsFailed++;
    }

    stats.totalEnemiesDefeated += runStats.enemiesDefeated || 0;
    stats.totalBossesDefeated += runStats.bossesDefeated || 0;
    stats.totalDamageDealt += runStats.damageDealt || 0;
    stats.totalDamageTaken += runStats.damageTaken || 0;
    stats.totalGoldEarned += runStats.goldEarned || 0;

    if (this.run.floor > stats.highestFloor) {
      stats.highestFloor = this.run.floor;
    }
    if (this.run.player?.level > stats.highestLevel) {
      stats.highestLevel = this.run.player.level;
    }

    // Play time
    if (runStats.startTime && runStats.endTime) {
      stats.totalPlayTime += (runStats.endTime - runStats.startTime);
    }

    stats.lastPlayDate = new Date().toISOString();
    if (!stats.firstPlayDate) {
      stats.firstPlayDate = stats.lastPlayDate;
    }
  }

  /**
   * Check and award new achievements
   */
  checkAchievements(runStats = null) {
    if (!this.meta) return [];

    const newAchievements = [];
    const stats = this.meta.lifetimeStats;

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      // Skip if already earned
      if (this.meta.achievements.includes(id)) continue;

      // Check if earned
      if (achievement.check(stats, runStats)) {
        this.meta.achievements.push(id);

        // Award essence
        if (achievement.reward?.essence) {
          this.meta.essence += achievement.reward.essence;
          this.meta.lifetimeStats.totalEssenceEarned += achievement.reward.essence;
        }

        newAchievements.push({
          id,
          name: achievement.name,
          nameEn: achievement.nameEn,
          description: achievement.description,
          reward: achievement.reward
        });
      }
    }

    return newAchievements;
  }

  /**
   * Apply meta bonuses to player
   */
  applyMetaBonuses(player) {
    if (!this.meta) return player;

    const effects = getMetaUpgradeEffects(this.meta);

    // HP/MP bonuses (percentage)
    if (effects.maxHpPercent > 0) {
      const bonus = Math.floor(player.maxHp * effects.maxHpPercent / 100);
      player.maxHp += bonus;
      player.hp += bonus;
    }
    if (effects.maxMpPercent > 0) {
      const bonus = Math.floor(player.maxMp * effects.maxMpPercent / 100);
      player.maxMp += bonus;
      player.mp += bonus;
    }

    // Flat stat bonuses
    player.attack += effects.attackBonus || 0;
    player.defense += effects.defenseBonus || 0;
    player.magic += effects.magicBonus || 0;
    player.speed += effects.speedBonus || 0;

    // Starting gold
    player.gold += effects.startingGold || 0;

    // Starting potions
    if (effects.startingPotions > 0) {
      const potionItem = player.items.find(i => i.id === 'potion');
      if (potionItem) {
        potionItem.quantity += effects.startingPotions;
      } else {
        player.items.push({ id: 'potion', quantity: effects.startingPotions });
      }
    }

    // Unlocked skills
    for (const skillId of effects.unlockedSkills) {
      if (!player.skills.find(s => s.id === skillId)) {
        player.skills.push({ id: skillId });
      }
    }

    return player;
  }

  /**
   * Set callback for narration updates
   */
  onNarration(callback) {
    this.narrationCallback = callback;
  }

  /**
   * Set callback for state changes
   */
  onStateChange(callback) {
    this.stateCallback = callback;
  }

  /**
   * Emit narration
   */
  narrate(text) {
    if (this.narrationCallback) {
      this.narrationCallback(text);
    }
  }

  /**
   * Emit state change
   */
  emitState() {
    if (this.stateCallback) {
      this.stateCallback(this.getState());
    }
  }

  /**
   * Get current game state
   */
  getState() {
    const currentRoom = this.run?.rooms?.[this.run?.currentRoom] || null;
    const player = this.run?.player || this.player;
    const equipBonuses = player ? calculateEquipmentBonuses(player) : null;

    return {
      player: player,
      equipmentBonuses: equipBonuses,
      run: this.run ? {
        floor: this.run.floor,
        maxFloors: this.run.maxFloors,
        currentRoom: this.run.currentRoom,
        totalRooms: this.run.rooms?.length || 0,
        roomsExplored: this.run.roomsExplored,
        encountersCompleted: this.run.encountersCompleted,
        encountersNeeded: this.run.encountersNeeded,
        bossDefeated: this.run.bossDefeated,
        active: this.run.active,
        stats: this.run.stats,
        // Ward path system (Phase 12)
        currentWard: this.run.currentWard,
        wardPath: this.run.wardPath,
        wardSelectionRequired: this.run.wardSelectionRequired,
        // Counter chip tracking (Phase 10)
        runStats: this.run.runStats,
        postCombatShop: this.run.postCombatShop ? {
          active: this.run.postCombatShop.active,
          items: this.run.postCombatShop.items.map(item => {
            const itemData = getItem(item.itemId);
            return {
              ...item,
              name: itemData?.name || item.name,
              nameEn: itemData?.nameEn || item.nameEn || item.itemId,
              description: itemData?.description || item.description || '',
              rarity: itemData?.rarity || item.rarity || 'common',
              slot: itemData?.slot || null,
              // Combat stats
              atk: itemData?.atk || 0,
              def: itemData?.def || 0,
              matk: itemData?.matk || 0,
              mdef: itemData?.mdef || 0,
              hit: itemData?.hit || 0,
              flee: itemData?.flee || 0,
              crit: itemData?.crit || 0,
              // Base stats
              str: itemData?.str || 0,
              agi: itemData?.agi || 0,
              vit: itemData?.vit || 0,
              int: itemData?.int || 0,
              dex: itemData?.dex || 0,
              luk: itemData?.luk || 0,
              // Special effects
              doubleStrike: itemData?.doubleStrike || 0,
              armorPen: itemData?.armorPen || 0,
              onKillHp: itemData?.onKillHp || 0,
              onKillSp: itemData?.onKillSp || 0,
              healingBonus: itemData?.healingBonus || 0,
              goldFind: itemData?.goldFind || 0,
              statusInflict: itemData?.statusInflict || null,
              setId: itemData?.setId || null
            };
          })
        } : null
      } : null,
      room: currentRoom ? {
        ...currentRoom,
        actions: getRoomActions(currentRoom)
      } : null,
      combat: this.combat ? {
        active: this.combat.active,
        turn: this.combat.turn,
        turnCount: this.combat.turnCount,
        enemy: this.combat.enemy,
        intent: this.combat.intent,
        lastAction: this.combat.lastAction
      } : null,
      meta: this.meta ? {
        essence: this.meta.essence,
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements
      } : null,
      phase: this.getPhase()
    };
  }

  /**
   * Get current game phase
   */
  getPhase() {
    if (!this.player) return 'no_save';
    if (!this.run) return 'hub';
    if (!this.run.active) return 'run_ended';

    // Ward selection required at start or between floors
    if (this.run.wardSelectionRequired) return 'ward_selection';

    if (this.combat?.active) return 'combat';
    if (this.run.postCombatShop?.active) return 'post_combat_shop';
    if (this.run.bossDefeated) return 'floor_complete';

    // Room-based phases
    const currentRoom = this.run.rooms?.[this.run.currentRoom];
    if (currentRoom) {
      if (currentRoom.isBossRoom) return 'boss_ready';
      if (currentRoom.type === 'encounter' && !currentRoom.interacted) return 'room_encounter';
      return 'room';
    }

    // Fallback for old system
    if (this.run.encountersCompleted >= this.run.encountersNeeded) return 'boss_ready';
    return 'exploring';
  }

  // ============ INITIALIZATION ============

  /**
   * Create a new player save
   * @param {string} name - Player name
   * @param {object} stats - Custom stats from character creation (optional)
   * @param {number} statPoints - Remaining stat points (optional)
   */
  createPlayer(name = 'Hunter', stats = null, statPoints = null) {
    this.player = createNewPlayer(name, stats, statPoints);
    this.emitState();
    return this.player;
  }

  /**
   * Load existing player
   */
  loadPlayer(playerData) {
    this.player = playerData;
    this.emitState();
    return this.player;
  }

  // ============ RUN MANAGEMENT ============

  /**
   * Start a new dungeon run
   */
  startRun() {
    if (!this.player) {
      throw new Error('No player exists');
    }

    this.run = createNewRun(this.player);

    // Apply meta-progression bonuses to the run player
    if (this.meta) {
      this.applyMetaBonuses(this.run.player);
    }

    // Recalculate max HP/SP (in case formula changed or equipment bonuses)
    const equipBonuses = calculateEquipmentBonuses(this.run.player);
    recalculatePlayerResources(this.run.player, equipBonuses, false);

    // Reset HP/SP to full at start of run
    this.run.player.hp = this.run.player.maxHp;
    this.run.player.sp = this.run.player.maxSp;

    // Ward selection is required at start
    this.run.wardSelectionRequired = true;

    this.emitState();

    return {
      run: this.run,
      wardSelectionRequired: true,
      wardOptions: getStartingWardOptions()
    };
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
    if (!this.run) {
      throw new Error('No active run');
    }

    if (!STARTING_WARDS.includes(wardId)) {
      throw new Error(`Invalid starting ward: ${wardId}`);
    }

    this.run.currentWard = wardId;
    this.run.wardPath = [wardId];
    this.run.floor = 1;
    this.run.wardSelectionRequired = false;

    // Now enter the floor
    this.enterFloor();

    const wardInfo = getWardInfo(wardId);

    return {
      success: true,
      ward: wardInfo,
      floor: this.run.floor
    };
  }

  /**
   * Get next ward options after clearing current ward (boss defeated)
   */
  getNextWardOptions() {
    if (!this.run?.currentWard) {
      return [];
    }
    return getNextWardOptions(this.run.currentWard);
  }

  /**
   * Select next ward after defeating boss
   * @param {string} wardId - Ward ID to advance to
   */
  selectNextWard(wardId) {
    if (!this.run?.bossDefeated) {
      throw new Error('Boss not defeated');
    }

    const options = getNextWardOptions(this.run.currentWard);
    const validOption = options.find(o => o.id === wardId);

    if (!validOption) {
      throw new Error(`Invalid ward selection: ${wardId}`);
    }

    this.run.currentWard = wardId;
    this.run.wardPath.push(wardId);
    this.run.floor++;
    this.run.wardSelectionRequired = false;

    // Enter the new floor
    this.enterFloor();

    const wardInfo = getWardInfo(wardId);

    return {
      success: true,
      ward: wardInfo,
      floor: this.run.floor
    };
  }

  /**
   * Enter a floor
   */
  enterFloor() {
    if (!this.run) {
      throw new Error('No active run');
    }

    // Reset floor state
    this.run.encountersCompleted = 0;
    this.run.encountersNeeded = generateEncounterCount(this.run.floor);
    this.run.bossDefeated = false;

    // Generate rooms for this floor
    this.run.rooms = generateFloorRooms(this.run.floor, this.run.encountersNeeded);
    this.run.currentRoom = 0;
    this.run.roomsExplored = 0;

    // Mark first room as explored
    if (this.run.rooms.length > 0) {
      this.run.rooms[0].explored = true;
      this.run.roomsExplored = 1;
    }

    this.narrate(getSimpleNarration('enterFloor', this.run.floor));
    this.emitState();

    return {
      floor: this.run.floor,
      totalRooms: this.run.rooms.length,
      encountersNeeded: this.run.encountersNeeded,
      firstRoom: this.run.rooms[0]
    };
  }

  // ============ ROOM EXPLORATION ============

  /**
   * Get current room info
   */
  getCurrentRoom() {
    if (!this.run?.rooms?.length) {
      return null;
    }
    return this.run.rooms[this.run.currentRoom];
  }

  /**
   * Proceed to next room
   */
  proceedToNextRoom() {
    if (!this.run || !this.run.active) {
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
    this.run.currentRoom++;
    const nextRoom = this.run.rooms[this.run.currentRoom];

    if (!nextRoom) {
      throw new Error('No more rooms');
    }

    // Mark as explored
    nextRoom.explored = true;
    this.run.roomsExplored++;
    this.run.stats.roomsExplored++;

    // Track room clears for counter chips
    if (this.run.runStats) {
      this.run.runStats.roomsCleared++;
    }

    // Process on-room-enter chip effects
    const roomEnterEffects = {};
    const equippedChips = getEquippedChips(this.run.player);
    if (equippedChips.length > 0) {
      const roomEffects = processOnRoomEnterChips(equippedChips);
      if (roomEffects.heal > 0) {
        const hpBefore = this.run.player.hp;
        this.run.player.hp = Math.min(this.run.player.maxHp, this.run.player.hp + roomEffects.heal);
        roomEnterEffects.heal = this.run.player.hp - hpBefore;
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
        this.run.player.stealth = true;
      }
      if (roomEffects.stunAllEnemies > 0) {
        roomEnterEffects.stunAllEnemies = roomEffects.stunAllEnemies;
      }
    }

    // Get narration for new room
    const narration = getRoomEntryNarration(nextRoom);
    this.narrate(narration);
    this.emitState();

    return {
      room: nextRoom,
      roomNumber: this.run.currentRoom + 1,
      totalRooms: this.run.rooms.length,
      actions: getRoomActions(nextRoom),
      narration,
      chipEffects: Object.keys(roomEnterEffects).length > 0 ? roomEnterEffects : null
    };
  }

  // ============ POST-COMBAT SHOP ============

  /**
   * Buy an item from the post-combat shop
   * @param {number} itemIndex - Index of item to buy (0, 1, or 2)
   */
  buyFromPostCombatShop(itemIndex) {
    if (!this.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    const shop = this.run.postCombatShop;
    if (itemIndex < 0 || itemIndex >= shop.items.length) {
      throw new Error('Invalid item index');
    }

    const item = shop.items[itemIndex];
    const player = this.run.player;

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
    this.run.postCombatShop.active = false;

    this.narrate(`${item.name}を購入した！`);
    this.emitState();

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
    if (!this.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    // Close shop without buying
    this.run.postCombatShop.active = false;

    this.narrate('先に進むことにした。');
    this.emitState();

    return {
      success: true,
      skipped: true
    };
  }

  /**
   * Refresh the post-combat shop with 3 new random chips
   */
  refreshPostCombatShop() {
    if (!this.run?.postCombatShop?.active) {
      throw new Error('No active shop');
    }

    // Generate new shop items (excluding already owned chips)
    const ownedChipIds = (this.run.player.chips || []).map(c => c.id);
    const shopItems = generatePostCombatShop(this.run.floor, ownedChipIds);

    this.run.postCombatShop.items = shopItems;

    this.narrate('商人が新しい品を出してきた。');
    this.emitState();

    return {
      success: true,
      items: shopItems
    };
  }

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

    const result = attemptDisarm(room.trap, this.run.player);

    if (result.success) {
      room.trap.disarmed = true;
      room.interacted = true;
      this.run.stats.trapsDisarmed++;
      this.run.player.xp += result.xpReward;
      this.narrate(`罠を解除した！${result.xpReward} XPを獲得！`);
    } else {
      room.trap.triggered = true;
      room.interacted = true;
      this.run.player.hp = Math.max(0, this.run.player.hp - result.damage);
      this.run.stats.damageTaken += result.damage;
      this.narrate(`罠の解除に失敗！${result.damage}ダメージ！`);

      if (this.run.player.hp <= 0) {
        return this._handleDefeat();
      }
    }

    this.emitState();
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

    const result = attemptAvoid(room.trap, this.run.player);
    room.trap.triggered = true;
    room.interacted = true;

    if (result.avoided) {
      this.narrate('罠を避けた！素早く通り抜けた。');
    } else {
      this.run.player.hp = Math.max(0, this.run.player.hp - result.damage);
      this.run.stats.damageTaken += result.damage;
      this.narrate(`罠に引っかかった！${result.damage}ダメージ！`);

      if (this.run.player.hp <= 0) {
        return this._handleDefeat();
      }
    }

    this.emitState();
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
      this.run.player.hp = Math.max(0, this.run.player.hp - trapDamage);
      this.run.stats.damageTaken += trapDamage;
      trapTriggered = true;
      this.narrate(`遺体を調べた...罠だ！${trapDamage}ダメージ！`);

      if (this.run.player.hp <= 0) {
        return this._handleDefeat();
      }
    }

    const loot = generateBodyLoot(room.body.lootTier);

    // Add loot to player inventory
    for (const item of loot) {
      this._addItemToInventory(item.itemId, item.quantity);
    }

    const lootDesc = loot.length > 0
      ? `見つけた: ${loot.map(l => `${l.itemId}×${l.quantity}`).join(', ')}`
      : '何も見つからなかった。';

    if (!trapTriggered) {
      this.narrate(`遺体を調べた。${lootDesc}`);
    } else {
      this.narrate(`それでも...${lootDesc}`);
    }

    this.emitState();
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
    this.narrate('遺体を無視して進むことにした。');

    this.emitState();
    return { type: 'skip', skipped: 'body' };
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
    this.narrate('宝箱を無視して進むことにした。怪しすぎる。');

    this.emitState();
    return { type: 'skip', skipped: 'treasure' };
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
    this.run.stats.treasuresOpened++;

    // Check for trap
    if (room.treasure.trapped) {
      const trap = TRAP_TYPES[room.treasure.trapType];
      const damage = calculateTrapDamage(trap);
      this.run.player.hp = Math.max(0, this.run.player.hp - damage);
      this.run.stats.damageTaken += damage;
      this.narrate(`宝箱を開けた...罠だ！${damage}ダメージ！`);

      if (this.run.player.hp <= 0) {
        return this._handleDefeat();
      }
    }

    const loot = generateChestLoot(room.treasure.tier);

    // Add loot to player inventory
    for (const item of loot) {
      this._addItemToInventory(item.itemId, item.quantity);
    }

    const lootDesc = loot.length > 0
      ? `見つけた: ${loot.map(l => `${l.itemId}×${l.quantity}`).join(', ')}`
      : '空だった...';

    if (!room.treasure.trapped) {
      this.narrate(`宝箱を開けた！${lootDesc}`);
    } else {
      this.narrate(`それでも...${lootDesc}`);
    }

    this.emitState();
    return { type: 'treasure', loot, trapped: room.treasure.trapped };
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

    const healAmount = Math.floor(this.run.player.maxHp * room.shrine.healPercent);
    const actualHeal = Math.min(healAmount, this.run.player.maxHp - this.run.player.hp);
    this.run.player.hp = Math.min(this.run.player.maxHp, this.run.player.hp + healAmount);

    // Track healing for counter chips
    if (this.run.runStats && actualHeal > 0) {
      this.run.runStats.damageHealed += actualHeal;
    }

    this.narrate(`祠に祈りを捧げた。${actualHeal} HPが回復した！`);

    this.emitState();
    return { type: 'shrine', healed: actualHeal };
  }

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
      playerGold: this.run.player.gold
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
    if (this.run.player.gold < totalCost) {
      throw new Error('Not enough gold');
    }

    // Make the purchase
    this.run.player.gold -= totalCost;
    shopItem.quantity -= quantity;

    // Remove item from shop if sold out
    if (shopItem.quantity <= 0) {
      room.merchant.inventory = room.merchant.inventory.filter(i => i.itemId !== itemId);
    }

    // Add item to player inventory
    this._addItemToInventory(itemId, quantity);

    this.narrate(`${quantity}個を${totalCost}Gで買った。`);

    this.emitState();
    return {
      type: 'purchase',
      itemId,
      quantity,
      cost: totalCost,
      remainingGold: this.run.player.gold
    };
  }

  // ============ BLACKSMITH / REFINEMENT ============

  /**
   * Get refinement preview for all equipped items
   */
  getRefinePreview() {
    if (!this.run || !this.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const previews = {};
    const slots = ['weapon', 'body', 'shield', 'accessory'];

    for (const slot of slots) {
      const preview = getRefinementPreview(this.run.player, slot);
      if (preview) {
        previews[slot] = preview;
      }
    }

    return {
      previews,
      playerGold: this.run.player.gold,
      floorBonus: room.blacksmith?.successBonus || 0
    };
  }

  /**
   * Attempt to refine an equipped item
   * @param {string} slot - Equipment slot to refine
   */
  refineEquipment(slot) {
    if (!this.run || !this.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const floorBonus = room.blacksmith?.successBonus || 0;
    const result = attemptRefinement(this.run.player, slot, floorBonus);

    if (result.error) {
      throw new Error(result.error);
    }

    // Mark blacksmith as interacted
    if (room.blacksmith) {
      room.blacksmith.interacted = true;
    }

    this.emitState();
    return result;
  }

  /**
   * Get chip upgrade preview for blacksmith
   * Returns 3 random upgradeable chips from player inventory
   * @returns {object} { chips: Array, playerGold: number }
   */
  getChipUpgradePreview() {
    console.log('[getChipUpgradePreview] Called');
    if (!this.run || !this.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    console.log('[getChipUpgradePreview] Room type:', room?.type, 'Room:', room);
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    const player = this.run.player;
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
    if (!this.run || !this.run.player) {
      throw new Error('No active run');
    }

    const room = this.getCurrentRoom();
    if (!room || room.type !== 'blacksmith') {
      throw new Error('No blacksmith here');
    }

    if (room.blacksmith?.interacted) {
      throw new Error('Blacksmith already used');
    }

    const player = this.run.player;
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

      this.emitNarration(`「よし、成功だ。」${chip.name || chip.nameEn}が${CHIP_RARITIES[result.newRarity].name}に強化された！`);
      this.emitState();

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

      this.emitNarration(`「...失敗だ。チップは壊れた。」${chip.name || chip.nameEn}は破壊された...`);
      this.emitState();

      return {
        success: false,
        message: `${chip.name || chip.nameEn}は破壊された...`,
        destroyedChip: chip
      };
    }
  }

  /**
   * Start room encounter
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

    // Start encounter using existing method
    return this.startEncounter();
  }

  /**
   * Add item to player inventory
   */
  _addItemToInventory(itemId, quantity) {
    if (itemId === 'gold') {
      this.run.player.gold += quantity;
      this.run.stats.goldEarned += quantity;
      return;
    }

    const existing = this.run.player.items.find(i => i.id === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.run.player.items.push({ id: itemId, quantity });
    }
  }

  /**
   * Equip an item from inventory
   * @param {string} itemId - ID of item to equip
   * @returns {object} Result with equipped item info
   */
  equipItem(itemId) {
    const player = this.run?.player || this.player;
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
    if (this.run?.player && this.player) {
      this.player.equipment = { ...player.equipment };
      this.player.items = [...player.items];
    }

    // Note: saveGame is handled by the server after equipItem returns
    this.emitState();

    return {
      equipped: itemDef.name,
      slot: slot,
      unequipped: currentEquipped ? getItem(currentEquipped.id || currentEquipped)?.name : null
    };
  }

  // ============ ENCOUNTER MANAGEMENT ============

  /**
   * Start a random encounter
   */
  startEncounter() {
    if (!this.run || !this.run.active) {
      throw new Error('No active run');
    }

    // Passive HP recovery between encounters (rest) - small amount
    const player = this.run.player;
    const restHeal = Math.floor(player.maxHp * 0.05);
    player.hp = Math.min(player.maxHp, player.hp + restHeal);

    const enemy = generateEnemy(this.run.floor);
    this.combat = createCombatState(enemy);
    this.run.player._combatStacks = {};  // Reset stacking chip counters
    if (this.run.player._runKills === undefined) this.run.player._runKills = 0;  // Init kill counter
    this.combat.turn = determineTurnOrder(this.run.player, enemy);

    // Select initial enemy intent
    this.combat.intent = selectEnemyIntent(enemy, 1);

    this.narrate(getSimpleNarration('combatStart', enemy));
    this.emitState();

    return {
      enemy: this.combat.enemy,
      intent: this.combat.intent,
      playerGoesFirst: this.combat.turn === 'player',
      dialogue: pickRandomVoiceLine(enemy.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  /**
   * Start boss encounter
   */
  startBossEncounter() {
    if (!this.run || !this.run.active) {
      throw new Error('No active run');
    }

    const boss = getBossForFloor(this.run.floor);
    this.combat = createCombatState(boss);
    this.run.player._combatStacks = {};  // Reset stacking chip counters
    this.combat.turn = determineTurnOrder(this.run.player, boss);

    // Select initial boss intent
    this.combat.intent = selectEnemyIntent(boss, 1);

    const isFinal = this.run.floor === 7;
    this.narrate(getSimpleNarration(isFinal ? 'finalBossAppear' : 'bossAppear', boss));
    this.emitState();

    return {
      enemy: this.combat.enemy,
      intent: this.combat.intent,
      playerGoesFirst: this.combat.turn === 'player',
      isFinalBoss: isFinal,
      dialogue: pickRandomVoiceLine(boss.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  // ============ REALTIME COMBAT ============

  /**
   * Execute one realtime combat attack
   * Used by the realtime combat system - no narration, just mechanics
   * @param {string} attackerType - 'player' or 'enemy' (defaults to player)
   * @returns {object} Result with attack results and HP values
   */
  realtimeAttackCycle(attackerType = 'player') {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }

    // Calculate attack intervals based on ASPD
    const playerInterval = getEntityAttackInterval(this.run.player);
    const enemyInterval = getEntityAttackInterval(this.combat.enemy);

    const result = {
      playerAttack: null,
      enemyAttack: null,
      playerHp: { current: this.run.player.hp, max: this.run.player.maxHp },
      enemyHp: { current: this.combat.enemy.hp, max: this.combat.enemy.maxHp },
      playerInterval,  // Attack interval for player in ms
      enemyInterval,   // Attack interval for enemy in ms
      combatEnded: false,
      victory: null,
      // Victory rewards (populated if victory)
      expGained: 0,
      goldGained: 0,
      loot: [],
      leveledUp: false,
      newLevel: null
    };

    // Execute attack based on attackerType
    if (attackerType === 'player') {
      // Player attack
      const playerResult = executePlayerAttack(this.run.player, this.combat.enemy, 'normal');

      // Handle SACRIFICE - permanently destroy sacrificed chips
      if (playerResult.pipelineResult?.sacrificedChips?.length > 0) {
        for (const chipId of playerResult.pipelineResult.sacrificedChips) {
          // Remove from player's chip inventory
          const chipIndex = this.run.player.chips?.findIndex(c => c.id === chipId);
          if (chipIndex >= 0) {
            this.run.player.chips.splice(chipIndex, 1);
          }
          // Remove from weapon's equipped chips
          const weapon = this.run.player.equipment?.weapon;
          if (weapon?.equippedChips) {
            const eqIndex = weapon.equippedChips.indexOf(chipId);
            if (eqIndex >= 0) {
              weapon.equippedChips.splice(eqIndex, 1);
            }
          }
          // Track total chips destroyed for Phoenix chip
          this.run.player._runChipsDestroyed = (this.run.player._runChipsDestroyed || 0) + 1;
        }
        playerResult.chipsDestroyed = playerResult.pipelineResult.sacrificedChips;
      }

      // Handle LIFELINK/SIPHON healing from pipeline chips
      if (playerResult.pipelineResult?.healPlayer > 0) {
        const healAmount = playerResult.pipelineResult.healPlayer;
        const oldHp = this.run.player.hp;
        this.run.player.hp = Math.min(this.run.player.maxHp, this.run.player.hp + healAmount);
        const actualHeal = this.run.player.hp - oldHp;
        if (actualHeal > 0) {
          playerResult.pipelineHeal = actualHeal;
        }
      }

      // Handle UNSTABLE CORE - random chip destruction
      if (playerResult.pipelineResult?.randomDestroyTriggered) {
        const weapon = this.run.player.equipment?.weapon;
        const equippedChips = weapon?.equippedChips || [];
        const destroyableChips = equippedChips.filter(id =>
          !playerResult.pipelineResult.sacrificedChips?.includes(id) && id !== 'unstable'
        );
        if (destroyableChips.length > 0) {
          const randomIndex = Math.floor(Math.random() * destroyableChips.length);
          const victimId = destroyableChips[randomIndex];
          const chipIndex = this.run.player.chips?.findIndex(c => c.id === victimId);
          if (chipIndex >= 0) this.run.player.chips.splice(chipIndex, 1);
          const eqIndex = weapon.equippedChips.indexOf(victimId);
          if (eqIndex >= 0) weapon.equippedChips.splice(eqIndex, 1);
          this.run.player._runChipsDestroyed = (this.run.player._runChipsDestroyed || 0) + 1;
          playerResult.randomChipDestroyed = victimId;
        }
      }

      // Handle cascade effect (pachinkoBall chip) - bonus hit with same damage
      if (playerResult.cascadeTriggered && playerResult.anyHit && !playerResult.enemyDefeated) {
        const cascadeDamage = playerResult.totalDamage;
        this.combat.enemy.hp = Math.max(0, this.combat.enemy.hp - cascadeDamage);
        playerResult.cascadeDamage = cascadeDamage;
        playerResult.totalDamage += cascadeDamage;
        playerResult.enemyDefeated = this.combat.enemy.hp <= 0;
        if (!playerResult.chipEffects) playerResult.chipEffects = [];
        playerResult.chipEffects.push({
          chipName: 'パチンコ玉', // Pachinko Ball
          special: 'cascade',
          bonusDamage: cascadeDamage
        });
      }

      result.playerAttack = {
        damage: playerResult.totalDamage,
        critical: playerResult.anyCritical,
        miss: !playerResult.anyHit && !playerResult.anyDodge && !playerResult.anyPerfectDodge,
        dodged: playerResult.anyDodge,
        perfectDodge: playerResult.anyPerfectDodge,
        chipEffects: playerResult.chipEffects || [],
        cascadeTriggered: playerResult.cascadeTriggered,
        cascadeDamage: playerResult.cascadeDamage,
        pipelineResult: playerResult.pipelineResult || null
      };

      // Tick enemy status effects (DoT damage from defrag, overheated, etc.)
      const enemyTickResult = tickStatusEffects(this.combat.enemy);
      if (enemyTickResult.dotDamage > 0) {
        result.playerAttack.dotDamage = enemyTickResult.dotDamage;
        result.playerAttack.dotSources = enemyTickResult.dotSources;
        // Check if DoT killed the enemy
        if (enemyTickResult.targetDefeated) {
          playerResult.enemyDefeated = true;
        }
      }

      // Update enemy HP in result
      result.enemyHp.current = this.combat.enemy.hp;

      // Track damage dealt
      this.run.stats.damageDealt += playerResult.totalDamage;

      // Track counter chip stats
      if (this.run.runStats) {
        if (result.playerAttack.critical) {
          this.run.runStats.critsLanded++;
        }
        this.run.runStats.damageDealt += playerResult.totalDamage;

        // Track status applications for counter chips
        if (playerResult.chipEffects) {
          for (const effect of playerResult.chipEffects) {
            if (effect.status && this.run.runStats.statusesApplied.hasOwnProperty(effect.status)) {
              this.run.runStats.statusesApplied[effect.status]++;
            }
          }
        }
        if (playerResult.statusInflicted?.status) {
          const status = playerResult.statusInflicted.status;
          if (this.run.runStats.statusesApplied.hasOwnProperty(status)) {
            this.run.runStats.statusesApplied[status]++;
          }
        }
      }

      // Check if enemy is glitching (HP < 30% but not defeated)
      const hpPercent = this.combat.enemy.hp / this.combat.enemy.maxHp;
      if (hpPercent > 0 && hpPercent <= 0.3 && !this.combat.glitchingShown) {
        result.enemyGlitching = true;
        result.glitchingDialogue = pickRandomVoiceLine(this.combat.enemy.dialogue?.glitching);
        this.combat.glitchingShown = true;  // Only show once per combat
      }

      // Check if enemy defeated
      if (playerResult.enemyDefeated) {
        result.combatEnded = true;
        result.victory = true;

        // Reset combat stacks (for Stack Overflow, Burst Cycle chips)
        this.run.player._combatStacks = {};

        // Increment kill count for Bounty Hunter chip
        this.run.player._runKills = (this.run.player._runKills || 0) + 1;

        // Track kill for counter chips
        if (this.run.runStats) {
          this.run.runStats.kills++;
        }

        // Process victory rewards (but don't narrate)
        const enemy = this.combat.enemy;
        result.liberatedDialogue = pickRandomVoiceLine(enemy.dialogue?.liberated);
        const isBoss = enemy.isBoss;

        let rewards;
        if (isBoss) {
          const drop = getBossDrop(this.run.floor);
          rewards = processBossVictory(this.run.player, enemy, this.run.floor, drop, this.run);
          this.run.bossDefeated = true;
        } else {
          rewards = processVictory(this.run.player, enemy, this.run);
          this.run.encountersCompleted++;

          // Mark room encounter as completed
          const currentRoom = this.getCurrentRoom();
          if (currentRoom && currentRoom.type === 'encounter') {
            currentRoom.interacted = true;
          }

          // Generate post-combat shop with 3 random chips
          const ownedChipIds = (this.run.player.chips || []).map(c => c.id);
          const shopItems = generatePostCombatShop(this.run.floor, ownedChipIds);
          this.run.postCombatShop = {
            active: true,
            items: shopItems
          };
        }

        result.expGained = rewards.xp;
        result.goldGained = rewards.gold;
        result.loot = rewards.drops || [];
        result.isBoss = isBoss;

        // Check level up
        const levelUps = checkLevelUp(this.run.player);
        if (levelUps.length > 0) {
          result.leveledUp = true;
          result.newLevel = levelUps[levelUps.length - 1].newLevel;
        }

        // End combat
        this.combat.active = false;

        // Update player HP in result
        result.playerHp.current = this.run.player.hp;

        return result;
      }
    } else if (attackerType === 'enemy') {
      // Enemy attack
      const enemyResult = executeEnemyTurn(this.combat.enemy, this.run.player, { id: 'attack', damageMultiplier: 1.0 });
      result.enemyAttack = {
        damage: enemyResult.damage,
        critical: enemyResult.critical,
        miss: enemyResult.miss && !enemyResult.dodge && !enemyResult.perfectDodge,
        dodged: enemyResult.dodge,
        perfectDodge: enemyResult.perfectDodge
      };

      // Update player HP in result
      result.playerHp.current = this.run.player.hp;

      // Track damage taken
      this.run.stats.damageTaken += enemyResult.damage || 0;

      // Track dodges for counter chips
      if (this.run.runStats && (enemyResult.dodge || enemyResult.perfectDodge)) {
        this.run.runStats.dodges++;
      }

      // Check if player defeated
      if (enemyResult.playerDefeated) {
        result.combatEnded = true;
        result.victory = false;

        // End combat and run
        this.combat.active = false;
        this.run.active = false;
        this.run.stats.endTime = Date.now();

        // Award essence and update meta stats
        const essenceReward = this.awardRunEssence(false);
        this.updateLifetimeStats(false);
        result.essenceEarned = essenceReward.essence;

        return result;
      }
    }

    // Combat continues
    return result;
  }

  // ============ COMBAT ACTIONS ============

  /**
   * Player attacks with attack type
   * @param {string} attackType - 'quick', 'normal', or 'heavy'
   */
  attack(attackType = 'normal') {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    if (this.combat.turn !== 'player') {
      throw new Error('Not player turn');
    }

    // Check if player is stunned (from exhaustion or other effects - must skip turn)
    if (hasStatusEffect(this.run.player, 'stun')) {
      this.narrate('疲労で動けない...！体が重い。次のターンまで休むしかない。');
      this.combat.turn = 'enemy';
      this.emitState();
      return { type: 'exhausted', skipped: true, continue: true };
    }

    // Check if player is asleep (must skip turn)
    if (hasStatusEffect(this.run.player, 'sleep')) {
      this.narrate('眠りに落ちている...動けない！');
      this.combat.turn = 'enemy';
      this.emitState();
      return { type: 'sleeping', skipped: true, continue: true };
    }

    // Check if enemy is vanished (untargetable)
    if (isEnemyVanished(this.combat.enemy)) {
      this.narrate(`${this.combat.enemy.name}の姿が見えない！攻撃が空を切る！`);
      this.combat.turn = 'enemy';
      this.emitState();
      return { type: 'miss', reason: 'vanished', continue: true };
    }

    // Check if enemy has barrier
    if (checkEnemyBarrier(this.combat.enemy)) {
      const absorbed = breakEnemyBarrier(this.combat.enemy);
      if (absorbed) {
        this.narrate(`${this.combat.enemy.name}の魔法障壁が攻撃を吸収した！`);
        this.combat.turn = 'enemy';
        this.emitState();
        return { type: 'blocked', reason: 'barrier', continue: true };
      }
    }

    // Execute the attack with the specified type
    const result = executePlayerAttack(this.run.player, this.combat.enemy, attackType);
    this.combat.lastAction = result;

    // Handle SACRIFICE - permanently destroy sacrificed chips
    if (result.pipelineResult?.sacrificedChips?.length > 0) {
      for (const chipId of result.pipelineResult.sacrificedChips) {
        // Remove from player's chip inventory
        const chipIndex = this.run.player.chips?.findIndex(c => c.id === chipId);
        if (chipIndex >= 0) {
          this.run.player.chips.splice(chipIndex, 1);
        }
        // Remove from weapon's equipped chips
        const weapon = this.run.player.equipment?.weapon;
        if (weapon?.equippedChips) {
          const eqIndex = weapon.equippedChips.indexOf(chipId);
          if (eqIndex >= 0) {
            weapon.equippedChips.splice(eqIndex, 1);
          }
        }
        // Track total chips destroyed for Phoenix chip
        this.run.player._runChipsDestroyed = (this.run.player._runChipsDestroyed || 0) + 1;
      }
      // Mark in result for UI feedback
      result.chipsDestroyed = result.pipelineResult.sacrificedChips;
    }

    // Handle LIFELINK healing from pipeline chips
    if (result.pipelineResult?.healPlayer > 0) {
      const healAmount = result.pipelineResult.healPlayer;
      const oldHp = this.run.player.hp;
      this.run.player.hp = Math.min(this.run.player.maxHp, this.run.player.hp + healAmount);
      const actualHeal = this.run.player.hp - oldHp;
      if (actualHeal > 0) {
        result.pipelineHeal = actualHeal;
      }
    }

    // Handle UNSTABLE CORE - random chip destruction
    if (result.pipelineResult?.randomDestroyTriggered) {
      const weapon = this.run.player.equipment?.weapon;
      const equippedChips = weapon?.equippedChips || [];
      // Filter out chips that were already sacrificed this attack, and unstable itself
      const destroyableChips = equippedChips.filter(id => 
        !result.pipelineResult.sacrificedChips?.includes(id) && id !== 'unstable'
      );
      if (destroyableChips.length > 0) {
        const randomIndex = Math.floor(Math.random() * destroyableChips.length);
        const victimId = destroyableChips[randomIndex];
        // Remove from inventory
        const chipIndex = this.run.player.chips?.findIndex(c => c.id === victimId);
        if (chipIndex >= 0) this.run.player.chips.splice(chipIndex, 1);
        // Remove from weapon
        const eqIndex = weapon.equippedChips.indexOf(victimId);
        if (eqIndex >= 0) weapon.equippedChips.splice(eqIndex, 1);
        // Track for Phoenix
        this.run.player._runChipsDestroyed = (this.run.player._runChipsDestroyed || 0) + 1;
        result.randomChipDestroyed = victimId;
      }
    }

    // Handle cascade effect (pachinkoBall chip) - bonus hit with same damage
    if (result.cascadeTriggered && result.anyHit && !result.enemyDefeated) {
      const cascadeDamage = result.totalDamage;
      this.combat.enemy.hp = Math.max(0, this.combat.enemy.hp - cascadeDamage);
      result.cascadeDamage = cascadeDamage;
      result.totalDamage += cascadeDamage;
      result.enemyDefeated = this.combat.enemy.hp <= 0;
      if (!result.chipEffects) result.chipEffects = [];
      result.chipEffects.push({
        chipName: 'パチンコ玉', // Pachinko Ball
        special: 'cascade',
        bonusDamage: cascadeDamage
      });
    }

    // Apply passive damage reduction (e.g., golem's stone form)
    const reduction = getPassiveDamageReduction(this.combat.enemy);
    if (reduction > 0 && result.totalDamage > 0) {
      const reducedAmount = Math.floor(result.totalDamage * reduction);
      result.totalDamage -= reducedAmount;
      result.damageReduced = reducedAmount;
      this.combat.enemy.hp = Math.min(this.combat.enemy.maxHp,
        this.combat.enemy.hp + reducedAmount);
    }

    this.run.stats.damageDealt += result.totalDamage;

    // Narrate based on attack type
    if (result.staggered) {
      this.narrate(`速攻！${this.combat.enemy.name}がよろめいた！次の攻撃が遅れる！`);
    } else if (result.playerExhausted) {
      this.narrate(`強撃！しかし、全力を出しすぎた...次のターンは動けない！`);
    }

    // Check for onDeath ability (skeleton revive)
    if (result.enemyDefeated) {
      const deathAbility = checkEnemyAbility(this.combat.enemy, this.run.player, 'onDeath', {});
      if (deathAbility?.revive) {
        result.enemyDefeated = false;
        result.abilityTriggered = deathAbility;
        this.narrate(deathAbility.effects[0]?.message || `${this.combat.enemy.name}が復活した！`);
      }
    }

    // Check for onLowHp ability
    if (!result.enemyDefeated) {
      const lowHpAbility = checkEnemyAbility(this.combat.enemy, this.run.player, 'onLowHp', {});
      if (lowHpAbility) {
        result.abilityTriggered = lowHpAbility;
        if (lowHpAbility.effects?.length > 0) {
          this.narrate(lowHpAbility.effects[0].message);
        }
      }
    }

    this.narrate(getSimpleNarration('playerAttack', result));

    if (result.enemyDefeated) {
      return this._handleVictory();
    }

    this.combat.turn = 'enemy';
    this.emitState();

    return { type: 'attack', attackType, result, continue: true };
  }

  /**
   * Player defends - reduces incoming damage and recovers SP
   */
  defend() {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    if (this.combat.turn !== 'player') {
      throw new Error('Not player turn');
    }

    // Check if player is stunned (from exhaustion or other effects - must skip turn)
    if (hasStatusEffect(this.run.player, 'stun')) {
      this.narrate('疲労で動けない...！体が重い。');
      this.combat.turn = 'enemy';
      this.emitState();
      return { type: 'exhausted', skipped: true, continue: true };
    }

    // Check if player is asleep (must skip turn)
    if (hasStatusEffect(this.run.player, 'sleep')) {
      this.narrate('眠りに落ちている...動けない！');
      this.combat.turn = 'enemy';
      this.emitState();
      return { type: 'sleeping', skipped: true, continue: true };
    }

    const result = executeDefend(this.run.player);
    this.combat.lastAction = result;

    this.narrate(`防御！体を守る構えを取った。${result.spRecovered > 0 ? `SP ${result.spRecovered} 回復。` : ''}`);

    this.combat.turn = 'enemy';
    this.emitState();

    return { type: 'defend', result, continue: true };
  }

  /**
   * Player uses magic
   */
  magic(skillId) {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    if (this.combat.turn !== 'player') {
      throw new Error('Not player turn');
    }

    const result = executeMagic(this.run.player, this.combat.enemy, skillId);

    if (result.error) {
      return { type: 'error', error: result.error };
    }

    this.combat.lastAction = result;

    if (result.damage) {
      this.run.stats.damageDealt += result.damage;
    }

    this.narrate(getSimpleNarration('playerMagic', result));

    if (result.enemyDefeated) {
      return this._handleVictory();
    }

    this.combat.turn = 'enemy';
    this.emitState();

    return { type: 'magic', result, continue: true };
  }

  /**
   * Player uses item
   */
  useItem(itemId) {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    if (this.combat.turn !== 'player') {
      throw new Error('Not player turn');
    }

    const result = executeItem(this.run.player, this.combat.enemy, itemId);

    if (result.error) {
      return { type: 'error', error: result.error };
    }

    this.combat.lastAction = result;
    this.run.stats.itemsUsed++;

    this.narrate(getSimpleNarration('playerItem', result));

    // Smoke bomb = instant flee
    if (result.flee) {
      return this._handleFlee(true);
    }

    if (result.enemyDefeated) {
      return this._handleVictory();
    }

    this.combat.turn = 'enemy';
    this.emitState();

    return { type: 'item', result, continue: true };
  }

  /**
   * Player attempts to flee
   */
  flee() {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    if (this.combat.turn !== 'player') {
      throw new Error('Not player turn');
    }

    // Can't flee from bosses
    if (this.combat.enemy.isBoss) {
      return { type: 'error', error: 'Cannot flee from boss!' };
    }

    const result = attemptFlee(this.run.player, this.combat.enemy);
    this.combat.lastAction = result;

    if (result.success) {
      return this._handleFlee(true);
    }

    this.narrate(getSimpleNarration('fleeFail'));
    this.combat.turn = 'enemy';
    this.emitState();

    return { type: 'flee', result, continue: true };
  }

  /**
   * Execute enemy turn based on current intent
   */
  enemyTurn() {
    if (!this.combat?.active || this.combat.turn !== 'enemy') {
      throw new Error('Not enemy turn');
    }

    // Check if enemy is stunned (from stagger or other effects - skip their turn)
    if (hasStatusEffect(this.combat.enemy, 'stun')) {
      this.narrate(`${this.combat.enemy.name}はよろめいている！攻撃できない！`);

      // Still tick effects and select next intent (uses _endEnemyTurn for consistency)
      this._endEnemyTurn();

      return {
        type: 'enemy_staggered',
        skipped: true,
        nextIntent: this.combat.intent,
        continue: true
      };
    }

    // Check if enemy is asleep (skip their turn, but can be broken by damage)
    if (hasStatusEffect(this.combat.enemy, 'sleep')) {
      this.narrate(`${this.combat.enemy.name}は眠っている...`);

      // Still tick effects and select next intent
      this._endEnemyTurn();

      return {
        type: 'enemy_sleeping',
        skipped: true,
        nextIntent: this.combat.intent,
        continue: true
      };
    }

    // Check if enemy has buffer overflow (from pepper chip - skip their turn)
    if (hasStatusEffect(this.combat.enemy, 'bufferOverflow')) {
      this.narrate(`${this.combat.enemy.name}のシステムがオーバーロード！攻撃できない！`);

      // Still tick effects and select next intent
      this._endEnemyTurn();

      return {
        type: 'enemy_overloaded',
        skipped: true,
        nextIntent: this.combat.intent,
        continue: true
      };
    }

    // Tick vanish duration (shadow reappears)
    const vanishEnded = tickEnemyVanish(this.combat.enemy);
    if (vanishEnded) {
      this.narrate(`${this.combat.enemy.name}が姿を現した！`);
    }

    // Check for onTurn abilities (goblin backup on turn 4, mage barrier every 3 turns)
    const turnAbility = checkEnemyAbility(this.combat.enemy, this.run.player, 'onTurn', {
      turnCount: this.combat.turnCount
    });
    if (turnAbility) {
      if (turnAbility.effects?.length > 0) {
        this.narrate(turnAbility.effects[0].message);
      }
      // Note: summon would need special handling to add enemy to combat
    }

    // Execute enemy action based on current intent
    const currentIntent = this.combat.intent;

    // Check for special ability if using special intent
    if (currentIntent.id === 'special') {
      const specialAbility = checkEnemyAbility(this.combat.enemy, this.run.player, 'special', {
        intent: currentIntent
      });
      if (specialAbility) {
        // Handle special ability results
        const result = {
          action: 'enemy_special',
          ability: specialAbility,
          damage: specialAbility.damage || 0,
          playerDefeated: specialAbility.playerDefeated || false
        };
        this.combat.lastAction = result;

        if (specialAbility.effects?.length > 0) {
          this.narrate(specialAbility.effects[0].message);
        }

        this.run.stats.damageTaken += result.damage || 0;

        if (result.playerDefeated) {
          return this._handleDefeat();
        }

        // Proceed with turn end
        this._endEnemyTurn();
        return {
          type: 'enemy_special',
          result,
          ability: specialAbility,
          nextIntent: this.combat.intent,
          continue: true
        };
      }
    }

    const result = executeEnemyTurn(this.combat.enemy, this.run.player, currentIntent);
    this.combat.lastAction = result;

    this.run.stats.damageTaken += result.damage || 0;

    // Narrate based on intent type
    const narrationContext = {
      ...result,
      name: this.combat.enemy.name,
      intent: currentIntent,
      nextIntent: this.combat.intent
    };
    this.narrate(getSimpleNarration('enemyAttack', narrationContext));

    if (result.playerDefeated) {
      return this._handleDefeat();
    }

    this._endEnemyTurn();

    return {
      type: 'enemy_attack',
      result,
      nextIntent: this.combat.intent,
      continue: true
    };
  }

  /**
   * End enemy turn - tick effects and select next intent
   */
  _endEnemyTurn() {
    // Tick status effects for player (handles DoT damage)
    const playerTickResult = tickStatusEffects(this.run.player);
    if (playerTickResult.dotDamage > 0) {
      const sources = playerTickResult.dotSources.map(s => s.id).join(', ');
      this.narrate(`${sources}のダメージ！${playerTickResult.dotDamage}ダメージを受けた！`);
      if (playerTickResult.targetDefeated) {
        this._handleDefeat();
        return;
      }
    }

    // Tick status effects for enemy (handles DoT damage)
    const enemyTickResult = tickStatusEffects(this.combat.enemy);
    if (enemyTickResult.dotDamage > 0) {
      this.narrate(`${this.combat.enemy.name}に継続ダメージ！${enemyTickResult.dotDamage}！`);
      if (enemyTickResult.targetDefeated) {
        this._handleVictory();
        return;
      }
    }

    this.combat.turnCount++;
    this.combat.turn = 'player';

    // Select next intent for the enemy
    this.combat.intent = selectEnemyIntent(this.combat.enemy, this.combat.turnCount);

    this.emitState();
  }

  // ============ COMBAT RESOLUTION ============

  _handleVictory() {
    // Reset combat stacks (for Stack Overflow chip)
    this.run.player._combatStacks = {};
    
    // Increment kill count for Bounty Hunter chip
    this.run.player._runKills = (this.run.player._runKills || 0) + 1;
    
    const enemy = this.combat.enemy;
    const isBoss = enemy.isBoss;

    let rewards;
    let shopItems = null;

    if (isBoss) {
      const drop = getBossDrop(this.run.floor);
      rewards = processBossVictory(this.run.player, enemy, this.run.floor, drop, this.run);
      this.narrate(getSimpleNarration('bossVictory', { ...enemy, rewards }));
      this.run.bossDefeated = true;

      // Award essence immediately on boss defeat
      const baseEssence = Math.floor(Math.random() * 16) + 10; // 10-25
      const floorBonus = this.run.floor * 3; // +3 per floor (3-21)
      const essenceDrop = baseEssence + floorBonus; // Total: 13-46
      this.meta.essence += essenceDrop;
      this.meta.lifetimeStats.totalEssenceEarned += essenceDrop;
      rewards.essenceDrop = essenceDrop;
    } else {
      rewards = processVictory(this.run.player, enemy, this.run);
      this.narrate(getSimpleNarration('victory', { ...enemy, rewards }));
      this.run.encountersCompleted++;

      // Mark room encounter as completed
      const currentRoom = this.getCurrentRoom();
      if (currentRoom && currentRoom.type === 'encounter') {
        currentRoom.interacted = true;
      }

      // Generate post-combat shop with 3 random chips (excluding already owned)
      const ownedChipIds = (this.run.player.chips || []).map(c => c.id);
      shopItems = generatePostCombatShop(this.run.floor, ownedChipIds);
      this.run.postCombatShop = {
        active: true,
        items: shopItems
      };
    }

    // Check level up
    const levelUps = checkLevelUp(this.run.player);
    for (const lu of levelUps) {
      this.narrate(getSimpleNarration('levelUp', { level: lu.newLevel }));
    }

    // Track liberation in meta-progression
    if (this.meta?.lifetimeStats) {
      if (!this.meta.lifetimeStats.liberationTracker) {
        this.meta.lifetimeStats.liberationTracker = {};
      }
      const tracker = this.meta.lifetimeStats.liberationTracker;
      const enemyId = enemy.id;

      if (!tracker[enemyId]) {
        tracker[enemyId] = {
          count: 0,
          firstLiberated: new Date().toISOString()
        };
      }
      tracker[enemyId].count++;
    }

    // End combat
    this.combat.active = false;

    // Check if floor complete
    let nextWardOptions = null;
    if (isBoss) {
      if (this.run.floor === 7) {
        // Game complete!
        return this._handleGameVictory();
      }

      // Ward selection required for next floor
      this.run.wardSelectionRequired = true;
      nextWardOptions = getNextWardOptions(this.run.currentWard);

      this.narrate(getSimpleNarration('floorClear', this.run.floor));
    }

    this.emitState();

    return {
      type: 'victory',
      rewards,
      levelUps,
      isBoss,
      floorComplete: isBoss,
      shopItems,
      // Ward path info
      wardSelectionRequired: isBoss,
      nextWardOptions
    };
  }

  _handleFlee(success) {
    this.combat.active = false;

    if (success) {
      this.narrate(getSimpleNarration('fleeSuccess'));
      // Still count as encounter done
      this.run.encountersCompleted++;

      // Mark room encounter as completed (fled)
      const currentRoom = this.getCurrentRoom();
      if (currentRoom && currentRoom.type === 'encounter') {
        currentRoom.interacted = true;
      }
    }

    this.emitState();

    return {
      type: 'flee',
      success
    };
  }

  _handleDefeat() {
    this.combat.active = false;
    this.run.active = false;
    this.run.stats.endTime = Date.now();

    // Award essence and update meta stats
    const essenceReward = this.awardRunEssence(false);
    this.updateLifetimeStats(false);
    const newAchievements = this.checkAchievements(this.run.stats);

    this.narrate(getSimpleNarration('defeat', this.combat.enemy));
    this.emitState();

    return {
      type: 'defeat',
      stats: this.run.stats,
      essenceEarned: essenceReward.essence,
      newAchievements
    };
  }

  _handleGameVictory() {
    this.combat.active = false;
    this.run.active = false;
    this.run.stats.endTime = Date.now();
    this.run.stats.floorsCleared = 7;

    // Award essence and update meta stats (victory!)
    const essenceReward = this.awardRunEssence(true);
    this.updateLifetimeStats(true);
    const newAchievements = this.checkAchievements(this.run.stats);

    this.narrate(getSimpleNarration('gameVictory', this.run.player));

    // Update persistent player with run rewards
    this.player.gold += this.run.player.gold;
    this.player.level = this.run.player.level;
    this.player.xp = this.run.player.xp;
    // Keep best rank
    const ranks = ['E', 'D', 'C', 'B', 'A', 'S'];
    if (ranks.indexOf(this.run.player.rank) > ranks.indexOf(this.player.rank)) {
      this.player.rank = this.run.player.rank;
    }

    this.emitState();

    return {
      type: 'game_victory',
      stats: this.run.stats,
      player: this.run.player,
      essenceEarned: essenceReward.essence,
      newAchievements
    };
  }

  // ============ FLOOR PROGRESSION ============

  /**
   * Proceed to next floor after boss defeat
   */
  nextFloor() {
    if (!this.run?.bossDefeated) {
      throw new Error('Boss not defeated');
    }

    if (this.run.floor >= 7) {
      throw new Error('Already at final floor');
    }

    this.run.floor++;
    return this.enterFloor();
  }

  // ============ UTILITY ============

  /**
   * End the current run (forfeit)
   */
  forfeitRun() {
    if (this.run) {
      this.run.active = false;
      this.run.stats.endTime = Date.now();

      // Award essence and update meta stats (counts as failed run)
      this.awardRunEssence(false);
      this.updateLifetimeStats(false);
      this.checkAchievements(this.run.stats);

      this.combat = null;
    }
    this.emitState();
  }

  /**
   * Reset everything (including player)
   * Note: Preserves meta-progression!
   */
  reset() {
    this.player = null;
    this.run = null;
    this.combat = null;
    // Note: we keep this.meta - meta-progression persists
    this.emitState();
  }

  /**
   * Full reset including meta-progression
   */
  fullReset() {
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;
    this.emitState();
  }

  // ============ DEBUG/TESTING ============

  /**
   * Force enter combat state for e2e testing
   * Only works when debug mode is enabled
   * @param {string} enemyId - Optional specific enemy ID to spawn
   */
  debugForceCombat(enemyId = null) {
    // Ensure player exists
    if (!this.player) {
      this.createPlayer('TestPlayer');
    }

    // Ensure we have an active run
    if (!this.run || !this.run.active) {
      this.startRun();
      // Auto-select first ward for testing
      if (this.run.wardSelectionRequired) {
        this.selectStartingWard('nerima');
      }
    }

    // Generate enemy using real enemy generation
    const enemy = generateEnemy(this.run.floor);

    // Create real combat state
    this.combat = createCombatState(enemy);
    this.combat.turn = determineTurnOrder(this.run.player, enemy);
    this.combat.intent = selectEnemyIntent(enemy, 1);

    // Ensure current room reflects combat state
    const currentRoom = this.getCurrentRoom();
    if (currentRoom) {
      currentRoom.type = 'encounter';
      currentRoom.enemy = enemy;
      currentRoom.interacted = false;
    }

    this.emitState();

    return {
      success: true,
      enemy: {
        name: enemy.name,
        nameEn: enemy.nameEn,
        hp: enemy.hp,
        maxHp: enemy.maxHp
      },
      phase: this.getPhase()
    };
  }
}

// Export singleton instance
export const gameManager = new GameManager();
