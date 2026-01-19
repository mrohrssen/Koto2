/**
 * @fileoverview CombatService - Combat encounter management
 * @module src/game/services/combat-service
 *
 * PURPOSE:
 * Manages combat encounters, delegating to combat/* modules for mechanics.
 * Extracted from GameManager to provide a focused combat interface.
 *
 * KEY EXPORTS:
 * - CombatService (class) - Combat lifecycle management
 *
 * DEPENDENCIES:
 * - ../events.js - Event bus for combat notifications
 * - ../state.js - Combat state factory, level up checks
 * - ../enemies.js - Enemy generation, boss drops
 * - ../combat/index.js - Combat mechanics, victory processing
 * - ../rooms.js - Post-combat shop, ward navigation
 * - ../dm.js - Narration helpers
 */

import { eventBus, GameEvents } from '../events.js';
import { createCombatState, checkLevelUp } from '../state.js';
import {
  generateEnemy,
  getBossForFloor,
  getBossDrop,
  selectEnemyIntent,
  pickRandomVoiceLine
} from '../enemies.js';
import {
  determineTurnOrder,
  processVictory,
  processBossVictory
} from '../combat/index.js';
import { generatePostCombatShop, getNextWardOptions } from '../rooms.js';
import { getSimpleNarration } from '../dm.js';

/**
 * Service for managing combat encounters
 * Handles encounter lifecycle: start, attacks, victory/defeat
 */
export class CombatService {
  /**
   * @param {object} gm - Reference to GameManager instance
   */
  constructor(gm) {
    this.gm = gm;
  }

  /**
   * Start a regular enemy encounter
   * @returns {object} Combat state with enemy, intent, turn order, dialogue
   */
  startEncounter() {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    // Passive HP recovery between encounters (rest) - small amount
    const player = this.gm.run.player;
    const restHeal = Math.floor(player.maxHp * 0.05);
    player.hp = Math.min(player.maxHp, player.hp + restHeal);

    const enemy = generateEnemy(this.gm.run.floor);
    this.gm.combat = createCombatState(enemy);
    this.gm.run.player._combatStacks = {};  // Reset stacking chip counters
    if (this.gm.run.player._runKills === undefined) this.gm.run.player._runKills = 0;  // Init kill counter
    this.gm.combat.turn = determineTurnOrder(this.gm.run.player, enemy);

    // Select initial enemy intent
    this.gm.combat.intent = selectEnemyIntent(enemy, 1);

    this.gm.narrate(getSimpleNarration('combatStart', enemy));
    this.gm.emitState();

    // Emit event for other services
    eventBus.emit(GameEvents.COMBAT_STARTED, {
      enemy: this.gm.combat.enemy,
      isBoss: false,
      isAmbush: false
    });

    return {
      enemy: this.gm.combat.enemy,
      intent: this.gm.combat.intent,
      playerGoesFirst: this.gm.combat.turn === 'player',
      dialogue: pickRandomVoiceLine(enemy.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  /**
   * Start a boss encounter
   * @returns {object} Combat state with boss, intent, turn order, dialogue
   */
  startBossEncounter() {
    if (!this.gm.run || !this.gm.run.active) {
      throw new Error('No active run');
    }

    const boss = getBossForFloor(this.gm.run.floor);
    this.gm.combat = createCombatState(boss);
    this.gm.run.player._combatStacks = {};  // Reset stacking chip counters
    this.gm.combat.turn = determineTurnOrder(this.gm.run.player, boss);

    // Select initial boss intent
    this.gm.combat.intent = selectEnemyIntent(boss, 1);

    const isFinal = this.gm.run.floor === 7;
    this.gm.narrate(getSimpleNarration(isFinal ? 'finalBossAppear' : 'bossAppear', boss));
    this.gm.emitState();

    // Emit event for other services
    eventBus.emit(GameEvents.COMBAT_STARTED, {
      enemy: this.gm.combat.enemy,
      isBoss: true,
      isAmbush: false
    });

    return {
      enemy: this.gm.combat.enemy,
      intent: this.gm.combat.intent,
      playerGoesFirst: this.gm.combat.turn === 'player',
      isFinalBoss: isFinal,
      dialogue: pickRandomVoiceLine(boss.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  /**
   * Execute a player attack
   * @param {string} attackType - Type of attack (physical, magic, etc.)
   * @returns {object} Attack result
   */
  executeAttack(attackType) {
    // TODO: move from GameManager
  }

  /**
   * Handle combat victory (regular enemy or boss)
   * @returns {object} Victory result with rewards, level ups, shop items
   */
  handleVictory() {
    // Reset combat stacks (for Stack Overflow chip)
    this.gm.run.player._combatStacks = {};

    // Increment kill count for Bounty Hunter chip
    this.gm.run.player._runKills = (this.gm.run.player._runKills || 0) + 1;

    const enemy = this.gm.combat.enemy;
    const isBoss = enemy.isBoss;

    let rewards;
    let shopItems = null;

    if (isBoss) {
      const drop = getBossDrop(this.gm.run.floor);
      rewards = processBossVictory(this.gm.run.player, enemy, this.gm.run.floor, drop, this.gm.run);
      this.gm.narrate(getSimpleNarration('bossVictory', { ...enemy, rewards }));
      this.gm.run.bossDefeated = true;

      // Award essence immediately on boss defeat
      const baseEssence = Math.floor(Math.random() * 16) + 10; // 10-25
      const floorBonus = this.gm.run.floor * 3; // +3 per floor (3-21)
      const essenceDrop = baseEssence + floorBonus; // Total: 13-46
      this.gm.meta.essence += essenceDrop;
      this.gm.meta.lifetimeStats.totalEssenceEarned += essenceDrop;
      rewards.essenceDrop = essenceDrop;
    } else {
      rewards = processVictory(this.gm.run.player, enemy, this.gm.run);
      this.gm.narrate(getSimpleNarration('victory', { ...enemy, rewards }));
      this.gm.run.encountersCompleted++;

      // Mark room encounter as completed
      const currentRoom = this.gm.getCurrentRoom();
      if (currentRoom && currentRoom.type === 'encounter') {
        currentRoom.interacted = true;
      }

      // Generate post-combat shop with 3 random chips (excluding already owned)
      const ownedChipIds = (this.gm.run.player.chips || []).map(c => c.id);
      shopItems = generatePostCombatShop(this.gm.run.floor, ownedChipIds);
      this.gm.run.postCombatShop = {
        active: true,
        items: shopItems
      };
    }

    // Check level up
    const levelUps = checkLevelUp(this.gm.run.player);
    for (const lu of levelUps) {
      this.gm.narrate(getSimpleNarration('levelUp', { level: lu.newLevel }));
    }

    // Track liberation in meta-progression
    if (this.gm.meta?.lifetimeStats) {
      if (!this.gm.meta.lifetimeStats.liberationTracker) {
        this.gm.meta.lifetimeStats.liberationTracker = {};
      }
      const tracker = this.gm.meta.lifetimeStats.liberationTracker;
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
    this.gm.combat.active = false;

    // Check if floor complete
    let nextWardOptions = null;
    if (isBoss) {
      if (this.gm.run.floor === 7) {
        // Game complete!
        return this.handleGameVictory();
      }

      // Ward selection required for next floor
      this.gm.run.wardSelectionRequired = true;
      nextWardOptions = getNextWardOptions(this.gm.run.currentWard);

      this.gm.narrate(getSimpleNarration('floorClear', this.gm.run.floor));
    }

    this.gm.emitState();

    // Emit event for other services
    eventBus.emit(GameEvents.COMBAT_ENDED, {
      outcome: 'victory',
      isBoss,
      rewards: { gold: rewards.goldGained, xp: rewards.xpGained, chips: rewards.chipsDropped }
    });

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

  /**
   * Handle player defeat (death)
   * @returns {object} Defeat result with stats and essence earned
   */
  handleDefeat() {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.stats.endTime = Date.now();

    // Award essence and update meta stats (delegated to GameManager)
    const essenceReward = this.gm.awardRunEssence(false);
    this.gm.updateLifetimeStats(false);
    const newAchievements = this.gm.checkAchievements(this.gm.run.stats);

    this.gm.narrate(getSimpleNarration('defeat', this.gm.combat.enemy));
    this.gm.emitState();

    // Emit event for other services
    eventBus.emit(GameEvents.COMBAT_ENDED, {
      outcome: 'defeat'
    });

    return {
      type: 'defeat',
      stats: this.gm.run.stats,
      essenceEarned: essenceReward.essence,
      newAchievements
    };
  }

  /**
   * Handle final boss victory (game complete)
   * @returns {object} Game victory result with final stats
   */
  handleGameVictory() {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    this.gm.run.stats.endTime = Date.now();
    this.gm.run.stats.floorsCleared = 7;

    // Award essence and update meta stats (victory!)
    const essenceReward = this.gm.awardRunEssence(true);
    this.gm.updateLifetimeStats(true);
    const newAchievements = this.gm.checkAchievements(this.gm.run.stats);

    this.gm.narrate(getSimpleNarration('gameVictory', this.gm.run.player));

    // Update persistent player with run rewards
    this.gm.player.gold += this.gm.run.player.gold;
    this.gm.player.level = this.gm.run.player.level;
    this.gm.player.xp = this.gm.run.player.xp;
    // Keep best rank
    const ranks = ['E', 'D', 'C', 'B', 'A', 'S'];
    if (ranks.indexOf(this.gm.run.player.rank) > ranks.indexOf(this.gm.player.rank)) {
      this.gm.player.rank = this.gm.run.player.rank;
    }

    this.gm.emitState();

    // Emit event for other services
    eventBus.emit(GameEvents.COMBAT_ENDED, {
      outcome: 'game_victory'
    });

    return {
      type: 'game_victory',
      stats: this.gm.run.stats,
      player: this.gm.run.player,
      essenceEarned: essenceReward.essence,
      newAchievements
    };
  }
}
