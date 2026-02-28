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
 * - 'area_selection' - Choosing area
 * - 'exploring' / 'room' / 'room_encounter' - Dungeon navigation
 * - 'combat' / 'victory' / 'defeat' - Battle states
 * - 'post_combat_shop' - Buying drops after combat
 * - 'area_complete' / 'run_complete' - Victory states
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
import { getRoomActions, getAreaSelectionOptions } from './rooms.js';
import { derivePhase } from './phase-machine.js';
import { CombatService, ExplorationService } from './services/index.js';
import { logger } from '../logger.js';
import { instantiateCreature, generateEnemyCreature, generateEnemyCreatures } from './creatures.js';
import { processMoveTurn, processDefendTurn, processEnemyTurn, processBefriend, awardBattleXp, handleCreatureKO, tickAllEffects, CREDITS_PER_KILL } from './services/creature-combat-service.js';
import { rollShopItems, applyItem } from './services/item-service.js';
import { addToCollection } from './services/creature-collection-service.js';
import { selectNpcForEncounter, updateBond, recordEncounter } from './services/npc-service.js';

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
    // Ensure creatureCollection exists for saves created before this feature
    if (!this.meta.creatureCollection) {
      this.meta.creatureCollection = ['hikaribon', 'hanatchi', 'tsukimochi'];
    }
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
      this.run.areasCompleted || 0,
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

    const areasCleared = this.run.areasCompleted || 0;
    if (areasCleared > (stats.highestAreasCleared || 0)) {
      stats.highestAreasCleared = areasCleared;
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
        // Area system
        currentArea: this.run.currentArea,
        areasCompleted: this.run.areasCompleted,
        areasToWin: this.run.areasToWin,
        areaPath: this.run.areaPath,
        areaSelectionRequired: this.run.areaSelectionRequired,
        areaCleared: this.run.areaCleared,
        background: this.run.background || 'floor1.webp',
        // Room state
        currentRoom: this.run.currentRoom,
        totalRooms: this.run.rooms?.length || 0,
        roomsExplored: this.run.roomsExplored,
        encountersCompleted: this.run.encountersCompleted,
        encountersNeeded: this.run.encountersNeeded,
        active: this.run.active,
        levelId: this.run.levelId,
        stats: this.run.stats,
        pendingBranch: this.run.pendingBranch,
        selectedRooms: this.run.selectedRooms,
        rooms: this.run.rooms,
        runStats: this.run.runStats,
        creatureParty: this.run.creatureParty,
        itemBuffs: this.run.itemBuffs || null,
        npcDialogue: this.run?.npcDialogue || null,
        postCombatShop: null,
        startingChipShop: null
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
        isCreatureCombat: this.combat.isCreatureCombat || false,
        intent: this.combat.intent,
        lastAction: this.combat.lastAction,
        npcId: this.combat.npcId || null,
        npcData: this.combat.npcData || null
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

    logger.info('[GameManager] Run started:', { playerHp: this.run.player.hp });

    // Reset credits to base starting value (before meta bonuses)
    this.run.player.credits = BASE_STARTING_CREDITS;

    // Apply meta-progression bonuses to the run player
    if (this.meta) {
      this.applyMetaBonuses(this.run.player);
    }

    // Reset HP to full at start of run
    this.run.player.hp = this.run.player.maxHp;

    // Area selection is required at start
    this.run.areaSelectionRequired = true;

    // Initialize creature starter(s) if provided
    const ids = starterIds || (starterId ? [starterId] : null);
    if (ids && ids.length > 0) {
      this.run.creatureParty.active = ids.map(id => instantiateCreature(id));
    }

    this.emitState();

    return {
      run: this.run,
      areaSelectionRequired: true,
      areaOptions: getAreaSelectionOptions()
    };
  }

  // ============ AREA SELECTION ============

  getAreaOptions() {
    return this.explorationService.getAreaOptions();
  }

  selectArea(areaId, forceRoomType = null) {
    return this.explorationService.selectArea(areaId, forceRoomType);
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
  proceedToNextRoom(forceRoomType = null) {
    return this.explorationService.proceedToNextRoom(forceRoomType);
  }

  /**
   * Select a branch door in a branching room
   * @param {number} doorIndex - Index of door to select (0 or 1)
   */
  selectBranch(doorIndex, forceRoomType = null) {
    return this.explorationService.selectBranch(doorIndex, forceRoomType);
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
   * Use a shrine to level up a creature
   */
  useShrine(creatureId) {
    return this.explorationService.useShrine(creatureId);
  }

  useQuizReward(rewardType, creatureId) {
    return this.explorationService.useQuizReward(rewardType, creatureId);
  }

  /**
   * Mark word discovery room as complete
   */
  completeWordDiscovery() {
    return this.explorationService.completeWordDiscovery();
  }

  completeWhackAMole(score) {
    return this.explorationService.completeWhackAMole(score);
  }

  // Dealer room delegates
  getDealerState() {
    return this.explorationService.getDealerState();
  }

  dealerSell(creatureId) {
    return this.explorationService.dealerSell(creatureId);
  }

  dealerBuy(creatureId) {
    return this.explorationService.dealerBuy(creatureId);
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


  // ============ CREATURE COMBAT ============

  /**
   * Start a creature encounter
   * Generates an enemy creature and sets up combat state
   */
  startCreatureEncounter() {
    if (!this.run || !this.run.active) {
      throw new Error('No active run');
    }
    if (this.combat?.active) {
      throw new Error('Combat already active');
    }

    const highestLevel = Math.max(...this.run.creatureParty.active.map(r => r.level), 1);
    const isFirstBattle = (this.run.encountersCompleted || 0) === 0;
    const creaturePool = this.run.currentArea?.creatures || null;
    const enemyCreatures = generateEnemyCreatures(highestLevel, {
      maxEnemies: isFirstBattle ? 2 : undefined,
      creaturePool
    });

    this.combat = createCombatState(enemyCreatures[0]);
    this.combat.allies = this.run.creatureParty.active;
    this.combat.enemies = enemyCreatures;
    this.combat.isCreatureCombat = true;
    this.combat.swapPhase = true; // Free swap available before first action

    // Assign area-locked NPC to this encounter
    // - Never on the first encounter of a run
    // - ~15% chance per encounter after the first
    // - One NPC per area, skipped if already met
    const NPC_ENCOUNTER_CHANCE = 0.15;
    const areaId = this.run.currentArea?.id || null;
    const usedNpcIds = this.run.usedNpcIds || [];
    const npcRoll = !isFirstBattle && Math.random() < NPC_ENCOUNTER_CHANCE;
    const npc = npcRoll ? selectNpcForEncounter(areaId, usedNpcIds) : null;
    if (npc) {
      this.combat.npcId = npc.id;
      this.combat.npcData = {
        id: npc.id,
        name: npc.name,
        nameEn: npc.nameEn,
        greeting: npc.greeting,
        defeatLine: npc.defeatLine
      };
      if (!this.run.usedNpcIds) this.run.usedNpcIds = [];
      this.run.usedNpcIds.push(npc.id);
    }

    this.emitState();

    return {
      enemy: enemyCreatures[0],
      enemies: enemyCreatures,
      allies: this.run.creatureParty.active,
      playerGoesFirst: true,
      npc: this.combat.npcData
    };
  }

  /**
   * Complete NPC dialogue and update bond
   */
  completeNpcDialogue() {
    if (!this.run?.npcDialogue) return;
    const { npcId, totalDelta } = this.run.npcDialogue;
    updateBond(this.meta, npcId, totalDelta);
    recordEncounter(this.meta, npcId);
    this.run.npcDialogue = null;
    this.emitState();
  }

  /**
   * Move pending captures into party and collection after victory.
   * @returns {Array} New collection additions
   */
  _flushPendingCaptures() {
    const pending = this.run.creatureParty.pendingCaptures || [];
    const newAdditions = [];
    for (const creature of pending) {
      const total = this.run.creatureParty.active.length + this.run.creatureParty.reserves.length;
      if (total >= this.run.creatureParty.maxTotal) break;
      if (this.run.creatureParty.active.length < 3) {
        this.run.creatureParty.active.push(creature);
      } else {
        this.run.creatureParty.reserves.push(creature);
      }
      if (this.meta && !creature.temporary) {
        // Increment befriend counter (always, even if already owned)
        if (!this.meta.befriendCount) this.meta.befriendCount = {};
        this.meta.befriendCount[creature.id] = (this.meta.befriendCount[creature.id] || 0) + 1;

        const result = addToCollection(this.meta.creatureCollection || [], creature.id);
        if (result.added) {
          this.meta.creatureCollection = result.collection;
          newAdditions.push({ id: creature.id, name: creature.name, nameEn: creature.nameEn, element: creature.element, rarity: creature.rarity });
        }
      }
    }
    this.run.creatureParty.pendingCaptures = [];
    return newAdditions;
  }

  /**
   * Execute one creature combat cycle
   * @param {string} actionType - 'attack' | 'defend' | 'befriend'
   */
  creatureCombatCycle(actionType = 'attack', moveChoices = []) {
    if (!this.combat?.active) {
      throw new Error('No active combat');
    }

    // Once an action is committed, free swap window closes
    this.combat.swapPhase = false;

    // Tick active effects at start of round (poison damage, etc.)
    const effectEvents = tickAllEffects(this.combat.allies, this.combat.enemies);

    switch (actionType) {
      case 'attack':  return this._handleCreatureAttackTurn(effectEvents, moveChoices);
      case 'defend':  return this._handleCreatureDefendTurn(effectEvents);
      case 'befriend': return this._handleCreatureBefriendTurn(effectEvents);
      default: throw new Error(`Unknown action: ${actionType}`);
    }
  }

  /**
   * Handle attack action in creature combat.
   * Player attacks, checks victory, then enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureAttackTurn(effectEvents, moveChoices) {
    const playerResult = processMoveTurn(this.combat.allies, this.combat.enemies, moveChoices, this.run.itemBuffs, this.run.creatureParty);

    // Award credits for kills
    if (playerResult.xpEvents?.length > 0) {
      const killCredits = playerResult.xpEvents.length * CREDITS_PER_KILL;
      this.run.player.credits = (this.run.player.credits || 0) + killCredits;
    }

    // Check if all enemies defeated after player attack
    if (playerResult.allEnemiesDefeated) {
      // XP already awarded per-kill in processMoveTurn
      const newCollectionAdditions = this._flushPendingCaptures();
      this.combat.active = false;
      this.run.encountersCompleted++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }
      this.emitState();
      return {
        actionType: 'attack',
        playerAttacks: playerResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions
      };
    }

    // Enemy phase
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, false, this.run.itemBuffs);

    // Handle KO'd allies — swap reserves in
    const koSwaps = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        }
      }
    }
    this.combat.allies = this.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this.emitState();
      return {
        actionType: 'attack',
        playerAttacks: playerResult.attacks || [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: playerResult.xpEvents || [],
        mpRegens: playerResult.mpRegens || [],
        effectEvents,
        koSwaps,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.emitState();

    return {
      actionType: 'attack',
      playerAttacks: playerResult.attacks || [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: playerResult.xpEvents || [],
      mpRegens: playerResult.mpRegens || [],
      effectEvents,
      befriend: null,
      koSwaps,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Handle defend action in creature combat.
   * Player defends (reduces incoming damage), then enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureDefendTurn(effectEvents) {
    processDefendTurn(this.combat.allies);

    // Enemy phase (defendActive = true reduces damage)
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, true, this.run.itemBuffs);

    // Handle KO'd allies — swap reserves in
    const koSwaps = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        }
      }
    }
    this.combat.allies = this.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this.emitState();
      return {
        actionType: 'defend',
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: [],
        effectEvents,
        koSwaps,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.emitState();

    return {
      actionType: 'defend',
      playerAttacks: [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: [],
      effectEvents,
      befriend: null,
      koSwaps,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
    };
  }

  /**
   * Handle befriend action in creature combat.
   * Attempt to capture an enemy. If last enemy captured, victory.
   * Otherwise, enemy turn with defeat/continuation.
   * @param {Array} effectEvents - Effect tick events from start of round
   * @returns {Object} Combat cycle result
   * @private
   */
  _handleCreatureBefriendTurn(effectEvents) {
    const targetIdx = this.combat.befriendConversation?.targetEnemyIndex;
    // Preserve targetEnemyIndex for befriendReplace (party-full flow)
    if (typeof targetIdx === 'number') this.combat.lastBefriendTargetIndex = targetIdx;
    const befriendResult = processBefriend(this.combat.enemies, this.run.creatureParty, targetIdx);

    // Captured last enemy — immediate victory
    if (befriendResult.success && befriendResult.allEnemiesDefeated) {
      awardBattleXp(this.run.creatureParty);
      const newCollectionAdditions = this._flushPendingCaptures();
      this.combat.active = false;
      this.run.encountersCompleted++;
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }
      this.emitState();
      return {
        actionType: 'befriend',
        befriend: befriendResult,
        effectEvents,
        combatEnded: true,
        victory: true,
        creatureParty: this.run.creatureParty,
        enemies: this.combat.enemies,
        newCollectionAdditions
      };
    }

    // Enemy phase
    const enemyResult = processEnemyTurn(this.combat.enemies, this.combat.allies, false, this.run.itemBuffs);

    // Handle KO'd allies — swap reserves in
    const koSwaps = [];
    for (let i = 0; i < this.combat.allies.length; i++) {
      if (this.combat.allies[i] && this.combat.allies[i].hp <= 0) {
        const replacement = handleCreatureKO(this.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
          logger.info('[CreatureCombat] KO swap: slot', i, '→', replacement.nameEn);
        }
      }
    }
    this.combat.allies = this.run.creatureParty.active;

    // Check defeat — only if ALL allies (including swapped-in reserves) are KO'd
    const allAlliesKO = this.combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      // Save any befriended creatures to permanent collection before defeat
      const pending = this.run.creatureParty.pendingCaptures || [];
      for (const creature of pending) {
        if (this.meta && !creature.temporary) {
          const result = addToCollection(this.meta.creatureCollection || [], creature.id);
          if (result.added) {
            this.meta.creatureCollection = result.collection;
          }
        }
      }
      this.run.creatureParty.pendingCaptures = [];

      this.combat.active = false;
      this.run.active = false;
      this.emitState();
      return {
        actionType: 'befriend',
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        xpEvents: [],
        effectEvents,
        koSwaps,
        combatEnded: true,
        victory: false,
        turnCount: this.combat.turnCount,
        creatureParty: this.run.creatureParty
      };
    }

    this.combat.turnCount++;
    this.combat.swapPhase = true;
    this.emitState();

    return {
      actionType: 'befriend',
      playerAttacks: [],
      enemyAttacks: enemyResult.attacks || [],
      xpEvents: [],
      effectEvents,
      befriend: befriendResult,
      koSwaps,
      combatEnded: false,
      turnCount: this.combat.turnCount,
      allies: this.combat.allies,
      enemies: this.combat.enemies,
      creatureParty: this.run.creatureParty
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
    applyItem(selectedItem, this.run.creatureParty, this.run.itemBuffs);
    this.run._pendingShopItems = null;

    this.emitState();
    return {
      selected: selectedItem,
      creatureParty: this.run.creatureParty,
      itemBuffs: this.run.itemBuffs
    };
  }

  /**
   * Swap an active creature with a reserve
   * @param {number} activeIndex - Index in creatureParty.active (0-2)
   * @param {number} reserveIndex - Index in creatureParty.reserves (0-2)
   * @returns {Object} Result with updated party and whether enemy attacks
   */
  swapCreature(activeIndex, reserveIndex) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.creatureParty) throw new Error('No creature party');

    const party = this.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

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
          handleCreatureKO(this.run.creatureParty, i);
        }
      }
      this.combat.allies = this.run.creatureParty.active;

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
        creatureParty: party,
        allies: this.combat.allies,
        enemies: this.combat.enemies
      };
    }

    this.emitState();
    return {
      swapped: true,
      freeSwap: true,
      creatureParty: party,
      allies: this.combat.allies,
      enemies: this.combat.enemies
    };
  }

  /**
   * Rearrange two active creatures by swapping their positions (no reserves needed).
   * Works both in and out of combat.
   * @param {number} indexA - First active slot index (0-2)
   * @param {number} indexB - Second active slot index (0-2)
   * @returns {Object} Result with updated party
   */
  rearrangeCreatures(indexA, indexB) {
    if (!this.run?.creatureParty) throw new Error('No creature party');
    const party = this.run.creatureParty;
    if (!party.active[indexA]) throw new Error('Invalid creature index A');
    if (!party.active[indexB]) throw new Error('Invalid creature index B');

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
      creatureParty: party
    };
  }

  /**
   * Swap an active creature with a reserve OUTSIDE of combat (equip screen).
   * @param {number} activeIndex - Index in creatureParty.active (0-2)
   * @param {number} reserveIndex - Index in creatureParty.reserves (0-2)
   * @returns {Object} Result with updated party
   */
  swapCreatureOutOfCombat(activeIndex, reserveIndex) {
    if (!this.run?.creatureParty) throw new Error('No creature party');
    const party = this.run.creatureParty;
    if (!party.active[activeIndex]) throw new Error('Invalid active creature index');
    if (!party.reserves[reserveIndex]) throw new Error('Invalid reserve creature index');

    // Perform the swap
    const temp = party.active[activeIndex];
    party.active[activeIndex] = party.reserves[reserveIndex];
    party.reserves[reserveIndex] = temp;

    this.emitState();
    return {
      swapped: true,
      creatureParty: party
    };
  }

  /**
   * Replace an existing creature with a befriended creature when roster is full.
   * @param {string} releaseCreatureId - ID of creature to release (must be in party)
   * @param {Object} capturedCreature - The befriended enemy creature to add
   * @returns {Object} Result with updated party
   */
  befriendReplace(releaseCreatureId) {
    if (!this.combat?.active) throw new Error('No active combat');
    if (!this.run?.creatureParty) throw new Error('No creature party');

    const party = this.run.creatureParty;
    const enemies = this.combat.enemies;

    // Use the stored target from the befriend conversation
    const targetIdx = this.combat.lastBefriendTargetIndex;
    let captured;
    if (typeof targetIdx === 'number' && enemies[targetIdx]?.hp > 0 && !enemies[targetIdx]?.befriended) {
      captured = enemies[targetIdx];
    } else {
      // Fallback: find any eligible enemy
      const eligible = enemies
        .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      if (eligible.length === 0) {
        return { success: false, reason: 'No enemy at <=50% HP' };
      }
      captured = eligible[0];
    }

    // Find the creature to release
    let releaseIndex = party.active.findIndex(r => r && r.id === releaseCreatureId);
    let releaseFrom = 'active';
    if (releaseIndex === -1) {
      releaseIndex = party.reserves.findIndex(r => r && r.id === releaseCreatureId);
      releaseFrom = 'reserves';
    }
    if (releaseIndex === -1) {
      return { success: false, reason: 'Creature to release not found in party' };
    }

    // Mark enemy as befriended (don't splice — preserve indices for frontend)
    captured.hp = 0;
    captured.befriended = true;

    // Create a clean copy for when it joins the party after combat
    const capturedCopy = { ...captured, hp: captured.maxHp, befriended: false };
    capturedCopy.ultimate = { ...captured.ultimate, charges: 0 };

    // Release the old creature and queue the captured one for post-combat
    if (releaseFrom === 'active') {
      party.active.splice(releaseIndex, 1);
    } else {
      party.reserves.splice(releaseIndex, 1);
    }
    if (!party.pendingCaptures) party.pendingCaptures = [];
    party.pendingCaptures.push(capturedCopy);

    // Refresh combat allies reference
    this.combat.allies = party.active;

    const allEnemiesDefeated = enemies.filter(e => e.hp > 0 && !e.befriended).length === 0;

    let newCollectionAdditions = [];
    if (allEnemiesDefeated) {
      awardBattleXp(party);
      newCollectionAdditions = this._flushPendingCaptures();
      this.combat.active = false;
      this.run.encountersCompleted++;
      // Mark room as interacted
      const currentRoom = this.run.rooms?.[this.run.currentRoom];
      if (currentRoom) {
        currentRoom.interacted = true;
      }
    }

    this.emitState();
    return {
      success: true,
      captured: capturedCopy,
      released: releaseCreatureId,
      allEnemiesDefeated,
      combatEnded: allEnemiesDefeated,
      victory: allEnemiesDefeated,
      creatureParty: party,
      enemies,
      newCollectionAdditions
    };
  }

  // ============ UTILITY ============

  /**
   * End the current run (forfeit)
   */
  forfeitRun() {
    if (this.run) {
      logger.info('[GameManager] Run forfeited:', { areasCompleted: this.run.areasCompleted, roomsExplored: this.run.roomsExplored });
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
      // Auto-select first area for testing
      if (this.run.areaSelectionRequired) {
        this.selectArea('okunomori');
      }
    }

    // Generate enemy using real enemy generation
    const enemy = generateEnemy(1);

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
