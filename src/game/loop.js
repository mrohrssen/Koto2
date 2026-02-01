/**
 * @fileoverview GameManager - Game Coordinator
 * @module src/game/loop
 *
 * PURPOSE:
 * Central coordinator for the game. Delegates domain logic to specialized services
 * while managing cross-cutting concerns like state assembly, run lifecycle, and
 * meta-progression. This is the main interface between server endpoints and game logic.
 *
 * ARCHITECTURE:
 * GameManager coordinates two services:
 * - CombatService (~800 lines) - Combat encounters, attacks, victory/defeat
 * - ExplorationService (~950 lines) - Room navigation, shops, inventory
 *
 * GameManager retains:
 * - State assembly (getState, getPhase)
 * - Run lifecycle (startRun, forfeitRun)
 * - Meta-progression (essence, upgrades, achievements) - cross-cutting concern
 * - Player management (createPlayer, loadPlayer)
 * - API surface (delegate methods for server compatibility)
 *
 * KEY EXPORTS:
 * - GameManager (class) - Main coordinator, singleton instance used by server
 * - gameManager (instance) - Pre-instantiated singleton
 *
 * STATE STRUCTURE:
 * - this.player - Base player (persists between runs)
 * - this.run - Current run state (null when in hub)
 * - this.combat - Current combat (null when not fighting)
 * - this.meta - Meta-progression (essence, upgrades, achievements)
 *
 * GAME PHASES (via phase-machine.js):
 * - 'no_save' - No player exists
 * - 'hub' - In town between runs
 * - 'ward_selection' - Choosing starting/next ward
 * - 'exploring' / 'room' / 'room_encounter' - Dungeon navigation
 * - 'combat' / 'victory' / 'defeat' - Battle states
 * - 'post_combat_shop' - Buying drops after combat
 * - 'boss_defeated' / 'run_complete' - Victory states
 *
 * DEPENDENCIES:
 * - ./services/combat-service.js - Combat logic
 * - ./services/exploration-service.js - Exploration logic
 * - ./phase-machine.js - Phase derivation
 * - ./state.js - State factories and meta-progression
 */

import {
  createNewPlayer,
  createNewRun,
  createCombatState,
  createMetaProgression,
  calculateEssenceReward,
  getMetaUpgradeEffects,
  META_UPGRADES,
  ACHIEVEMENTS
} from './state.js';

import { generateEnemy, selectEnemyIntent } from './enemies.js';
import { determineTurnOrder } from './combat.js';
import { getRoomActions, generatePostCombatShop, getStartingWardOptions } from './rooms.js';
import { getItem } from './items.js';
import { derivePhase } from './phase-machine.js';
import { CombatService, ExplorationService } from './services/index.js';
import { logger } from '../logger.js';

// ============ GAME MANAGER ============

export class GameManager {
  constructor() {
    this.player = null;
    this.run = null;
    this.combat = null;
    this.meta = null;               // Meta-progression (persists across runs)
    this.narrationCallback = null;  // Called with narration text
    this.stateCallback = null;      // Called when state changes

    // Services (extracted from monolithic GameManager)
    this.combatService = new CombatService(this);
    this.explorationService = new ExplorationService(this);
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

    // HP bonus (percentage)
    if (effects.maxHpPercent > 0) {
      const bonus = Math.floor(player.maxHp * effects.maxHpPercent / 100);
      player.maxHp += bonus;
      player.hp += bonus;
    }

    // Attack bonus
    player.attack += effects.attackBonus || 0;

    // Starting gold
    player.gold += effects.startingGold || 0;

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

    return {
      player: player,
      run: this.run ? {
        floor: this.run.floor,
        maxFloors: this.run.maxFloors,
        background: this.run.background || `floor${this.run.floor}.webp`,
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
        } : null,
        startingChipShop: this.run.startingChipShop ? {
          active: this.run.startingChipShop.active,
          items: this.run.startingChipShop.items
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
   * Delegates to phase-machine.js for centralized phase logic
   */
  getPhase() {
    return derivePhase({
      player: this.player,
      run: this.run,
      combat: this.combat
    });
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
    logger.info('[GameManager] Player created:', { name, hp: this.player.hp });
    this.emitState();
    return this.player;
  }

  /**
   * Load existing player
   */
  loadPlayer(playerData) {
    this.player = playerData;
    logger.debug('[GameManager] Player loaded:', { name: this.player.name, gold: this.player.gold });
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
    logger.info('[GameManager] Run started:', { floor: this.run.floor, playerHp: this.run.player.hp });

    // Apply meta-progression bonuses to the run player
    if (this.meta) {
      this.applyMetaBonuses(this.run.player);
    }

    // Reset HP to full at start of run
    this.run.player.hp = this.run.player.maxHp;

    // Ward selection is required at start
    this.run.wardSelectionRequired = true;

    // Generate starting chip choices (3 free chips to choose from)
    const ownedChipIds = (this.run.player.chips || []).map(c => c.id);
    const startingChips = generatePostCombatShop(1, ownedChipIds);
    // Make them free
    startingChips.forEach(chip => chip.price = 0);
    this.run.startingChipShop = {
      active: true,
      items: startingChips
    };

    this.emitState();

    return {
      run: this.run,
      wardSelectionRequired: true,
      wardOptions: getStartingWardOptions(),
      startingChipShop: this.run.startingChipShop
    };
  }

  /**
   * Claim a free starting chip
   */
  claimStartingChip(itemIndex) {
    if (!this.run?.startingChipShop?.active) {
      throw new Error('No starting chip selection active');
    }

    const shop = this.run.startingChipShop;
    if (itemIndex < 0 || itemIndex >= shop.items.length) {
      throw new Error('Invalid chip selection');
    }

    const item = shop.items[itemIndex];

    // Add chip to player inventory
    if (!this.run.player.chips) {
      this.run.player.chips = [];
    }
    this.run.player.chips.push({
      id: item.itemId,
      name: item.name,
      rarity: item.rarity
    });

    // Auto-equip if weapon has fewer than 5 chips
    const player = this.run.player;
    const equippedChips = player.equipment?.weapon?.equippedChips || [];
    if (equippedChips.length < 5 && !equippedChips.includes(item.itemId)) {
      if (!player.equipment.weapon.equippedChips) {
        player.equipment.weapon.equippedChips = [];
      }
      player.equipment.weapon.equippedChips.push(item.itemId);
    }

    // Clear the starting chip shop
    this.run.startingChipShop.active = false;

    this.emitState();

    return {
      success: true,
      chip: item
    };
  }

  // ============ WARD PATH SELECTION ============

  /**
   * Get starting ward options for run start
   */
  getStartingWardOptions() {
    return this.explorationService.getStartingWardOptions();
  }

  /**
   * Select starting ward for a new run
   * @param {string} wardId - Ward ID (e.g., 'nerima' or 'setagaya')
   */
  selectStartingWard(wardId) {
    return this.explorationService.selectStartingWard(wardId);
  }

  /**
   * Get next ward options after clearing current ward (boss defeated)
   */
  getNextWardOptions() {
    return this.explorationService.getNextWardOptions();
  }

  /**
   * Select next ward after defeating boss
   * @param {string} wardId - Ward ID to advance to
   */
  selectNextWard(wardId) {
    return this.explorationService.selectNextWard(wardId);
  }

  /**
   * Enter a floor
   */
  enterFloor() {
    return this.explorationService.enterFloor();
  }

  // ============ ROOM EXPLORATION ============

  /**
   * Get current room info
   */
  getCurrentRoom() {
    return this.explorationService.getCurrentRoom();
  }

  /**
   * Proceed to next room
   */
  proceedToNextRoom() {
    return this.explorationService.proceedToNextRoom();
  }

  /**
   * Select a branch door in a branching room
   * @param {number} doorIndex - Index of door to select (0 or 1)
   */
  selectBranch(doorIndex) {
    return this.explorationService.selectBranch(doorIndex);
  }

  // ============ POST-COMBAT SHOP ============

  /**
   * Buy an item from the post-combat shop
   * @param {number} itemIndex - Index of item to buy (0, 1, or 2)
   */
  buyFromPostCombatShop(itemIndex) {
    return this.explorationService.buyFromPostCombatShop(itemIndex);
  }

  /**
   * Skip the post-combat shop without buying
   */
  skipShop() {
    return this.explorationService.skipShop();
  }

  /**
   * Refresh the post-combat shop with 3 new random chips
   */
  refreshPostCombatShop() {
    return this.explorationService.refreshPostCombatShop();
  }

  /**
   * Use a shrine to upgrade a chip
   */
  useShrine(chipId) {
    return this.explorationService.useShrine(chipId);
  }

  useQuizReward(rewardType) {
    return this.explorationService.useQuizReward(rewardType);
  }

  /**
   * Mark word discovery room as complete
   */
  completeWordDiscovery() {
    return this.explorationService.completeWordDiscovery();
  }

  /**
   * Start room encounter
   */
  startRoomEncounter() {
    return this.explorationService.startRoomEncounter();
  }


  // ============ ENCOUNTER MANAGEMENT ============

  /**
   * Start a random encounter
   */
  startEncounter() {
    return this.combatService.startEncounter();
  }

  /**
   * Start boss encounter
   */
  startBossEncounter() {
    return this.combatService.startBossEncounter();
  }

  // ============ COMBAT CYCLE ============

  /**
   * Execute one combat cycle (vocab-pause turn-based combat)
   * @param {string} attackerType - 'player' or 'enemy'
   * @returns {object} Result with attack data, HP values, and combat status
   */
  combatCycle(attackerType = 'player') {
    return this.combatService.executeCombatCycle(attackerType);
  }

  // ============ COMBAT RESOLUTION ============

  _handleVictory() {
    return this.combatService.handleVictory();
  }

  _handleDefeat() {
    return this.combatService.handleDefeat();
  }

  _handleGameVictory() {
    return this.combatService.handleGameVictory();
  }

  // ============ FLOOR PROGRESSION ============

  /**
   * Proceed to next floor after boss defeat
   */
  nextFloor() {
    return this.explorationService.nextFloor();
  }

  // ============ UTILITY ============

  /**
   * End the current run (forfeit)
   */
  forfeitRun() {
    if (this.run) {
      logger.info('[GameManager] Run forfeited:', { floor: this.run.floor, roomsExplored: this.run.roomsExplored });
      // Only award essence/stats if run was still active (not already ended by combat defeat)
      if (this.run.active) {
        this.run.active = false;
        this.run.stats.endTime = Date.now();
        this.awardRunEssence(false);
        this.updateLifetimeStats(false);
        this.checkAchievements(this.run.stats);
      }

      this.combat = null;
      this.run = null;
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
