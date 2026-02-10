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
  ACHIEVEMENTS,
  BASE_STARTING_CREDITS
} from './state.js';

import { generateEnemy, selectEnemyIntent } from './enemies.js';
import { determineTurnOrder } from './combat.js';
import { getRoomActions, generatePostCombatShop, getStartingWardOptions } from './rooms.js';
import { getItem } from './items.js';
import { derivePhase } from './phase-machine.js';
import { CombatService, ExplorationService } from './services/index.js';
import { calculateChipBonusHP, equipChip, incrementAllEquippedCharges } from './items/chips.js';
import { logger } from '../logger.js';
import { instantiateRobot, getStarterRobots, generateEnemyRobot, generateEnemyRobots } from './robots.js';
import { processAttackTurn, processDefendTurn, processEnemyTurn, processBefriend, processUltimate, awardBattleXp, handleRobotKO } from './services/robot-combat-service.js';
import { rollShopItems, applyItem } from './services/item-service.js';

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
    stats.totalCreditsEarned += runStats.creditsEarned || 0;

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

    // HP bonus (percentage from vitality upgrade)
    if (effects.maxHpPercent > 0) {
      const bonus = Math.floor(player.maxHp * effects.maxHpPercent / 100);
      player.maxHp += bonus;
      player.hp += bonus;
    }

    // HP bonus from equipped chips
    const chipHPBonus = calculateChipBonusHP(player);
    if (chipHPBonus > 0) {
      player.maxHp += chipHPBonus;
      player.hp += chipHPBonus;
    }

    // Attack bonus
    player.attack += effects.attackBonus || 0;

    // Starting credits
    player.credits += effects.startingCredits || 0;

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
        levelId: this.run.levelId,
        stats: this.run.stats,
        // Ward path system (Phase 12)
        currentWard: this.run.currentWard,
        wardPath: this.run.wardPath,
        wardSelectionRequired: this.run.wardSelectionRequired,
        // Branch selection system
        pendingBranch: this.run.pendingBranch,
        selectedRooms: this.run.selectedRooms,
        rooms: this.run.rooms,
        // Counter chip tracking (Phase 10)
        runStats: this.run.runStats,
        robotParty: this.run.robotParty,
        itemBuffs: this.run.itemBuffs || null,
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
              creditFind: itemData?.creditFind || 0,
              statusInflict: itemData?.statusInflict || null,
              setId: itemData?.setId || null
            };
          })
        } : null,
        startingChipShop: this.run.startingChipShop ? {
          active: this.run.startingChipShop.active,
          items: this.run.startingChipShop.items.map(item => {
            const itemData = getItem(item.itemId);
            return {
              ...item,
              name: itemData?.name || item.name,
              nameEn: itemData?.nameEn || item.nameEn || item.itemId,
              description: itemData?.description || item.description || '',
              descriptionEn: itemData?.descriptionEn || item.descriptionEn || '',
              rarity: itemData?.rarity || item.rarity || 'common',
              price: item.price || 0,
              stats: item.stats || itemData?.stats || { power: 0, bandwidth: 0 },
              skill: item.skill || itemData?.skill || null
            };
          }),
          freeRefreshUsed: this.run.startingChipShop.freeRefreshUsed || false
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
        allies: this.combat.allies || [],
        enemies: this.combat.enemies || [],
        isRobotCombat: this.combat.isRobotCombat || false,
        intent: this.combat.intent,
        lastAction: this.combat.lastAction
      } : null,
      meta: this.meta ? {
        essence: this.meta.essence,
        lifetimeStats: this.meta.lifetimeStats,
        achievements: this.meta.achievements,
        levels: this.meta.levels || { highestUnlocked: 1, completed: [], current: null }
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
    logger.debug('[GameManager] Player loaded:', { name: this.player.name, credits: this.player.credits });
    this.emitState();
    return this.player;
  }

  // ============ RUN MANAGEMENT ============

  /**
   * Start a new dungeon run
   */
  startRun(levelId = null, starterId = null, starterIds = null) {
    if (!this.player) {
      throw new Error('No player exists');
    }

    this.run = createNewRun(this.player);

    // Track which level this run belongs to
    if (levelId !== null) {
      this.run.levelId = levelId;
      if (this.meta?.levels) {
        this.meta.levels.current = levelId;
      }
    }

    logger.info('[GameManager] Run started:', { floor: this.run.floor, playerHp: this.run.player.hp });

    // Reset credits to base starting value (before meta bonuses)
    this.run.player.credits = BASE_STARTING_CREDITS;

    // Apply meta-progression bonuses to the run player
    if (this.meta) {
      this.applyMetaBonuses(this.run.player);
    }

    // Reset HP to full at start of run
    this.run.player.hp = this.run.player.maxHp;

    // Ward selection is required at start
    this.run.wardSelectionRequired = true;

    // Initialize robot starter(s) if provided
    const ids = starterIds || (starterId ? [starterId] : null);
    if (ids && ids.length > 0) {
      this.run.robotParty.active = ids.map(id => instantiateRobot(id));
      this.run.encountersOnly = true;
    }

    // Generate starting chip choices (skip for robot combat - robots don't use chips)
    if (!ids) {
      const ownedChipIds = (this.run.player.chips || []).map(c => c.id);
      const startingChips = generatePostCombatShop(1, ownedChipIds, 'common');
      this.run.startingChipShop = {
        active: true,
        items: startingChips,
        freeRefreshUsed: false
      };
    }

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

    // Add chip to player inventory (include all properties for HP calculation)
    if (!this.run.player.chips) {
      this.run.player.chips = [];
    }
    this.run.player.chips.push({
      id: item.itemId,
      name: item.name,
      nameEn: item.nameEn,
      rarity: item.rarity,
      category: item.category,
      effects: item.effects,
      stats: item.stats
    });

    // Auto-equip if weapon has fewer than 5 chips (use equipChip to apply HP bonus)
    const player = this.run.player;
    const equippedChips = player.equipment?.weapon?.equippedChips || [];
    if (equippedChips.length < 5 && !equippedChips.includes(item.itemId)) {
      equipChip(player, 'weapon', item.itemId);
    }

    // Clear the starting chip shop
    this.run.startingChipShop.active = false;

    this.emitState();

    return {
      success: true,
      chip: item
    };
  }

  /**
   * Refresh the starting chip shop with new chips
   * First refresh is free, subsequent refreshes cost 25 credits
   */
  refreshStartingChipShop() {
    if (!this.run?.startingChipShop?.active) {
      throw new Error('No starting chip selection active');
    }

    const shop = this.run.startingChipShop;
    const player = this.run.player;
    const REFRESH_COST = 25;

    let creditsSpent = 0;
    if (shop.freeRefreshUsed) {
      if (player.credits < REFRESH_COST) {
        throw new Error('Not enough credits for refresh');
      }
      player.credits -= REFRESH_COST;
      creditsSpent = REFRESH_COST;
    } else {
      shop.freeRefreshUsed = true;
    }

    // Generate new chips (common only for starting shop)
    const ownedChipIds = (player.chips || []).map(c => c.id);
    shop.items = generatePostCombatShop(1, ownedChipIds, 'common');

    this.emitState();

    return {
      success: true,
      creditsSpent,
      items: shop.items
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
   * Sell a chip from inventory
   */
  sellChip(chipId) {
    return this.explorationService.sellChip(chipId);
  }

  /**
   * Get inventory status
   */
  getInventoryStatus() {
    return this.explorationService.getInventoryStatus();
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

  // Dealer room delegates
  getDealerState() {
    return this.explorationService.getDealerState();
  }

  dealerSell(chipId) {
    return this.explorationService.dealerSell(chipId);
  }

  dealerBuy() {
    return this.explorationService.dealerBuy();
  }

  leaveDealer() {
    return this.explorationService.leaveDealer();
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
   * @param {string} actionType - 'attack' or 'defend'
   * @returns {object} Result with attack data, HP values, and combat status
   */
  combatCycle(attackerType = 'player', actionType = 'attack') {
    return this.combatService.executeCombatCycle(attackerType, actionType);
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

  /**
   * Continue to next endless floor
   */
  continueEndless() {
    return this.explorationService.continueEndless();
  }

  /**
   * Return to hub after game victory (declining endless mode)
   */
  returnToHubFromVictory() {
    if (!this.run?.gameVictoryPending) {
      throw new Error('No pending game victory');
    }
    return this.combatService.handleGameVictory();
  }

  // ============ ROBOT COMBAT ============

  /**
   * Start a robot encounter
   * Generates an enemy robot and sets up combat state
   */
  startRobotEncounter() {
    if (!this.run || !this.run.active) {
      throw new Error('No active run');
    }
    if (this.combat?.active) {
      throw new Error('Combat already active');
    }

    const highestLevel = Math.max(...this.run.robotParty.active.map(r => r.level), 1);
    const enemyRobots = generateEnemyRobots(highestLevel);

    this.combat = createCombatState(enemyRobots[0]);
    this.combat.allies = this.run.robotParty.active;
    this.combat.enemies = enemyRobots;
    this.combat.isRobotCombat = true;
    this.combat.swapPhase = true; // Free swap available before first action

    this.emitState();

    return {
      enemy: enemyRobots[0],
      enemies: enemyRobots,
      allies: this.run.robotParty.active,
      playerGoesFirst: true
    };
  }

  /**
   * Execute one robot combat cycle
   * @param {string} actionType - 'attack' | 'defend' | 'befriend'
   */
  robotCombatCycle(actionType = 'attack') {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }

    // Once an action is committed, free swap window closes
    this.combat.swapPhase = false;

    let playerResult = {};
    let enemyResult = {};
    let befriendResult = null;
    const defendActive = actionType === 'defend';

    // Player phase
    if (actionType === 'attack') {
      playerResult = processAttackTurn(this.combat.allies, this.combat.enemies, this.run.itemBuffs, this.run.robotParty);
    } else if (actionType === 'defend') {
      processDefendTurn(this.combat.allies);
    } else if (actionType === 'befriend') {
      befriendResult = processBefriend(this.combat.enemies, this.run.robotParty);
      if (befriendResult.success && befriendResult.allEnemiesDefeated) {
        // Captured last enemy — victory
        awardBattleXp(this.run.robotParty, 100);
        this.combat.active = false;
        this.run.encountersCompleted++;
        this.emitState();
        return {
          actionType: 'befriend',
          befriend: befriendResult,
          combatEnded: true,
          victory: true,
          robotParty: this.run.robotParty
        };
      }
    }

    // Check if all enemies defeated after player attack
    if (playerResult.allEnemiesDefeated) {
      // XP already awarded per-kill in processAttackTurn (BUG C fix)
      this.combat.active = false;
      this.run.encountersCompleted++;
      // Mark room as interacted and handle boss defeat
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
        if (currentRoom.isBossRoom) {
          this.run.bossDefeated = true;
        }
      }
      this.emitState();
      return {
        actionType,
        playerAttacks: playerResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        combatEnded: true,
        victory: true,
        isBoss: currentRoom?.isBossRoom || false,
        robotParty: this.run.robotParty
      };
    }

    // Enemy phase
    enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, defendActive, this.run.itemBuffs);

    // Handle KO'd allies — swap reserves in
    const koSwaps = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const replacement = handleRobotKO(this.run.robotParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[RobotCombat] KO swap: slot', i, '→', replacement.nameEn);
        }
      }
    }
    // Refresh allies reference after swaps
    this.combat.allies = this.run.robotParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      this.combat.active = false;
      this.run.active = false;
      this.emitState();
      return {
        actionType,
        playerAttacks: playerResult.attacks || [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        koSwaps,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        robotParty: this.run.robotParty
      };
    }

    // Increment chip skill charges each combat cycle
    if (this.run.player) {
      incrementAllEquippedCharges(this.run.player);
    }

    this.combat.turnCount++;

    // Reset swap phase for next turn (free swaps available again)
    this.combat.swapPhase = true;

    this.emitState();

    return {
      actionType,
      playerAttacks: playerResult.attacks || [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: playerResult.xpEvents || [],
      befriend: befriendResult,
      koSwaps,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      robotParty: this.run.robotParty,
      chipCharges: this.run.player?._chipCharges || {}
    };
  }

  /**
   * Use a robot's ultimate ability
   * @param {number} robotIndex - Index in allies array
   */
  useRobotUltimate(robotIndex) {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }
    const robot = this.combat.allies[robotIndex];
    if (!robot) {
      throw new Error('Invalid robot index');
    }

    const result = processUltimate(robot, this.combat.enemies, this.run.itemBuffs, this.run.robotParty);
    if (!result.success) {
      return result;
    }

    // Check if all enemies defeated
    if (result.allEnemiesDefeated) {
      // XP already awarded per-kill in processUltimate (BUG C fix)
      this.combat.active = false;
      this.run.encountersCompleted++;
    }

    this.emitState();
    return {
      ...result,
      combatEnded: result.allEnemiesDefeated,
      victory: result.allEnemiesDefeated ? true : undefined,
      robotParty: this.run.robotParty,
      enemies: this.combat.enemies
    };
  }

  /**
   * Roll 3 random items for the post-combat shop
   */
  rollPostCombatShop() {
    if (!this.run) throw new Error('No run');
    const items = rollShopItems();
    this.run._pendingShopItems = items;
    return { items };
  }

  /**
   * Player selects one item from the post-combat shop
   * @param {number} itemIndex - 0, 1, or 2
   */
  selectShopItem(itemIndex) {
    if (!this.run) throw new Error('No run');
    const items = this.run._pendingShopItems;
    if (!items || !items[itemIndex]) throw new Error('Invalid shop item');

    const selectedItem = items[itemIndex];
    applyItem(selectedItem, this.run.robotParty, this.run.itemBuffs);
    this.run._pendingShopItems = null;

    this.emitState();
    return {
      selected: selectedItem,
      robotParty: this.run.robotParty,
      itemBuffs: this.run.itemBuffs
    };
  }

  /**
   * Swap an active robot with a reserve
   * @param {number} activeIndex - Index in robotParty.active (0-2)
   * @param {number} reserveIndex - Index in robotParty.reserves (0-2)
   * @returns {Object} Result with updated party and whether enemy attacks
   */
  swapRobot(activeIndex, reserveIndex) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.robotParty) throw new Error('No robot party');

    const party = this.run.robotParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active robot index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve robot index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const isFreeSwap = this.combat.swapPhase;

    if (!isFreeSwap) {
      // Paid swap: enemy attacks, no player action
      const enemyResult = processEnemyTurn(
        this.combat.enemies,
        this.combat.allies,
        false,
        this.run.itemBuffs
      );

      // Handle KO'd allies after enemy attack
      for (let i = 0; i < this.combat.allies.length; i++) {
        if (this.combat.allies[i].hp <= 0) {
          handleRobotKO(this.run.robotParty, i);
        }
      }
      this.combat.allies = this.run.robotParty.active;

      // Check defeat
      const allAlliesKO = this.combat.allies.every(a => a.hp <= 0);
      if (allAlliesKO) {
        this.combat.active = false;
        this.run.active = false;
      }

      this.combat.turnCount++;
      this.emitState();

      return {
        swapped: true,
        freeSwap: false,
        enemyAttacks: enemyResult.attacks,
        combatEnded: allAlliesKO,
        victory: false,
        robotParty: party,
        allies: this.combat.allies,
        enemies: this.combat.enemies
      };
    }

    this.emitState();
    return {
      swapped: true,
      freeSwap: true,
      robotParty: party,
      allies: this.combat.allies,
      enemies: this.combat.enemies
    };
  }

  /**
   * Rearrange two active robots by swapping their positions (no reserves needed).
   * Works both in and out of combat.
   * @param {number} indexA - First active slot index (0-2)
   * @param {number} indexB - Second active slot index (0-2)
   * @returns {Object} Result with updated party
   */
  rearrangeRobots(indexA, indexB) {
    if (!this.run?.robotParty) throw new Error('No robot party');
    const party = this.run.robotParty;
    if (!party.active[indexA]) throw new Error('Invalid robot index A');
    if (!party.active[indexB]) throw new Error('Invalid robot index B');

    // Swap positions
    const temp = party.active[indexA];
    party.active[indexA] = party.active[indexB];
    party.active[indexB] = temp;

    // Refresh combat allies reference if in combat
    if (this.combat?.active) {
      this.combat.allies = party.active;
    }

    this.emitState();
    return {
      rearranged: true,
      robotParty: party
    };
  }

  /**
   * Swap an active robot with a reserve OUTSIDE of combat (equip screen).
   * @param {number} activeIndex - Index in robotParty.active (0-2)
   * @param {number} reserveIndex - Index in robotParty.reserves (0-2)
   * @returns {Object} Result with updated party
   */
  swapRobotOutOfCombat(activeIndex, reserveIndex) {
    if (!this.run?.robotParty) throw new Error('No robot party');
    const party = this.run.robotParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active robot index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve robot index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    this.emitState();
    return {
      swapped: true,
      robotParty: party
    };
  }

  /**
   * Replace an existing robot with a befriended robot when roster is full.
   * @param {string} releaseRobotId - ID of robot to release (must be in party)
   * @param {Object} capturedRobot - The befriended enemy robot to add
   * @returns {Object} Result with updated party
   */
  befriendReplace(releaseRobotId) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.robotParty) throw new Error('No robot party');

    const party = this.run.robotParty;
    const enemies = this.combat.enemies;

    // Find the befriendable enemy (same logic as processBefriend)
    const eligible = enemies
      .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (eligible.length === 0) {
      return { success: false, reason: 'No enemy at <=50% HP' };
    }

    // Find the robot to release
    let releaseIndex = party.active.findIndex(r => r && r.id === releaseRobotId);
    let releaseFrom = 'active';
    if (releaseIndex === -1) {
      releaseIndex = party.reserves.findIndex(r => r && r.id === releaseRobotId);
      releaseFrom = 'reserves';
    }
    if (releaseIndex === -1) {
      return { success: false, reason: 'Robot to release not found in party' };
    }

    // Capture the enemy
    const captured = eligible[0];
    const idx = enemies.indexOf(captured);
    enemies.splice(idx, 1);
    captured.hp = captured.maxHp;
    captured.ultimate.charges = 0;

    // Replace the released robot with the captured one
    if (releaseFrom === 'active') {
      party.active[releaseIndex] = captured;
    } else {
      party.reserves[releaseIndex] = captured;
    }

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const allEnemiesDefeated = enemies.filter(e => e.hp > 0).length === 0;

    if (allEnemiesDefeated) {
      awardBattleXp(party, 100);
      this.combat.active = false;
      this.run.encountersCompleted++;
    }

    this.emitState();
    return {
      success: true,
      captured,
      released: releaseRobotId,
      allEnemiesDefeated,
      combatEnded: allEnemiesDefeated,
      victory: allEnemiesDefeated,
      robotParty: party,
      enemies
    };
  }

  /**
   * Get available starter robots
   */
  getStarters() {
    return getStarterRobots();
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
        // Clear current level tracking
        if (this.meta?.levels) {
          this.meta.levels.current = null;
        }
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
