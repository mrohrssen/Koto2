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
 * - ../state.js - Combat state factory, level up checks
 * - ../enemies.js - Enemy generation
 * - ../combat/index.js - Combat mechanics, victory processing
 * - ../dm.js - Narration helpers
 */


import { createCombatState } from '../state.js';
import {
  generateEnemy,
  selectEnemyIntent,
  pickRandomVoiceLine
} from '../enemies.js';
import {
  determineTurnOrder,
  processVictory,
  executePlayerAttack,
  executeEnemyTurn
} from '../combat/index.js';
import { getSimpleNarration } from '../dm.js';
import { logger } from '../../logger.js';

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

    const enemy = generateEnemy(1);

    // Apply compounding HP scaling (10% per enemy defeated in this run)
    const runKills = this.gm.run.player._runKills || 0;
    const hpMultiplier = Math.pow(1.1, runKills);
    enemy.maxHp = Math.floor(enemy.maxHp * hpMultiplier);
    enemy.hp = enemy.maxHp;

    this.gm.combat = createCombatState(enemy);
    logger.info('[Combat] Started encounter:', { enemy: enemy.nameEn, hp: enemy.hp, hpMultiplier: hpMultiplier.toFixed(2) });
    if (this.gm.run.player._runKills === undefined) this.gm.run.player._runKills = 0;  // Init kill counter
    this.gm.combat.turn = determineTurnOrder(this.gm.run.player, enemy);

    // Select initial enemy intent
    this.gm.combat.intent = selectEnemyIntent(enemy, 1);

    this.gm.narrate(getSimpleNarration('combatStart', enemy));
    this.gm.emitState();


    return {
      enemy: this.gm.combat.enemy,
      intent: this.gm.combat.intent,
      playerGoesFirst: this.gm.combat.turn === 'player',
      dialogue: pickRandomVoiceLine(enemy.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  /**
   * Execute one combat cycle (vocab-pause turn-based combat)
   * Each cycle processes one attack (player or enemy) and returns updated state
   * @param {string} attackerType - 'player' or 'enemy'
   * @param {string} actionType - 'attack' or 'defend'
   * @returns {object} Result with attack data, HP values, and combat status
   */
  executeCombatCycle(attackerType = 'player', actionType = 'attack') {
    if (!this.gm.combat?.active) {
      logger.warn('[Combat] Attempted action on inactive combat');
      throw new Error('No active combat');
    }

    const result = {
      playerAttack: null,
      enemyAttack: null,
      playerHp: { current: this.gm.run.player.hp, max: this.gm.run.player.maxHp },
      enemyHp: { current: this.gm.combat.enemy.hp, max: this.gm.combat.enemy.maxHp },
      combatEnded: false,
      victory: null,
      // Victory rewards (populated if victory)
      expGained: 0,
      creditsGained: 0,
      loot: [],
      leveledUp: false,
      newLevel: null
    };

    // Execute attack based on attackerType
    if (attackerType === 'player') {
      // Player attack
      const playerResult = executePlayerAttack(this.gm.run.player, this.gm.combat.enemy, 'normal');
      logger.info('[Combat] Player attacked:', { damage: playerResult.totalDamage, critical: playerResult.anyCritical });

      result.playerAttack = {
        damage: playerResult.totalDamage,
        critical: playerResult.anyCritical,
        miss: !playerResult.anyHit && !playerResult.anyDodge && !playerResult.anyPerfectDodge,
        dodged: playerResult.anyDodge,
        perfectDodge: playerResult.anyPerfectDodge
      };

      // Update enemy HP in result
      result.enemyHp.current = this.gm.combat.enemy.hp;

      // Track damage dealt
      this.gm.run.stats.damageDealt += playerResult.totalDamage;

      // Check if enemy is glitching (HP < 30% but not defeated)
      const hpPercent = this.gm.combat.enemy.hp / this.gm.combat.enemy.maxHp;
      if (hpPercent > 0 && hpPercent <= 0.3 && !this.gm.combat.glitchingShown) {
        result.enemyGlitching = true;
        result.glitchingDialogue = pickRandomVoiceLine(this.gm.combat.enemy.dialogue?.glitching);
        this.gm.combat.glitchingShown = true;  // Only show once per combat
      }

      // Check if enemy defeated
      if (playerResult.enemyDefeated) {
        result.combatEnded = true;
        result.victory = true;

        // Increment kill count
        this.gm.run.player._runKills = (this.gm.run.player._runKills || 0) + 1;

        if (this.gm.run.runStats) {
          this.gm.run.runStats.kills++;
        }

        // Process victory rewards (but don't narrate)
        const enemy = this.gm.combat.enemy;
        result.liberatedDialogue = pickRandomVoiceLine(enemy.dialogue?.liberated);

        const rewards = processVictory(this.gm.run.player, enemy, this.gm.run);
        this.gm.run.encountersCompleted++;

        // Mark room encounter as completed
        const currentRoom = this.gm.getCurrentRoom();
        if (currentRoom && currentRoom.type === 'encounter') {
          currentRoom.interacted = true;
        }

        result.expGained = rewards.xp;
        result.creditsGained = rewards.credits;
        result.loot = rewards.drops || [];

        // End combat
        this.gm.combat.active = false;

        // Update player HP in result
        result.playerHp.current = this.gm.run.player.hp;

        return result;
      }
    } else if (attackerType === 'enemy') {
      // Enemy attack - apply defend reduction via damage multiplier
      const damageMultiplier = actionType === 'defend' ? 0.5 : 1.0;
      const enemyResult = executeEnemyTurn(this.gm.combat.enemy, this.gm.run.player, { id: 'attack', damageMultiplier });
      logger.info('[Combat] Enemy attacked:', { damage: enemyResult.damage, playerHp: this.gm.run.player.hp, defending: actionType === 'defend' });
      result.enemyAttack = {
        damage: enemyResult.damage,
        critical: enemyResult.critical,
        miss: enemyResult.miss && !enemyResult.dodge && !enemyResult.perfectDodge,
        dodged: enemyResult.dodge,
        perfectDodge: enemyResult.perfectDodge
      };

      // Update player HP in result
      result.playerHp.current = this.gm.run.player.hp;

      // Track damage taken
      this.gm.run.stats.damageTaken += enemyResult.damage || 0;

      // Track dodges
      if (this.gm.run.runStats && (enemyResult.dodge || enemyResult.perfectDodge)) {
        this.gm.run.runStats.dodges++;
      }

      // Check if player defeated
      if (enemyResult.playerDefeated) {
        result.combatEnded = true;
        result.victory = false;

        // End combat and run
        this.gm.combat.active = false;
        this.gm.run.active = false;
        this.gm.run.stats.endTime = Date.now();

        // Award essence and update meta stats
        const essenceReward = this.gm.awardRunEssence(false);
        this.gm.updateLifetimeStats(false);
        result.essenceEarned = essenceReward.essence;


        return result;
      }
    }

    // Combat continues
    return result;
  }

  /**
   * Handle combat victory (regular enemy or boss)
   * @returns {object} Victory result with rewards, level ups, shop items
   */
  handleVictory() {
    // Increment kill count
    this.gm.run.player._runKills = (this.gm.run.player._runKills || 0) + 1;

    const enemy = this.gm.combat.enemy;
    logger.info('[Combat] Victory:', { enemy: enemy.nameEn, areasCompleted: this.gm.run.areasCompleted });

    const rewards = processVictory(this.gm.run.player, enemy, this.gm.run);
    this.gm.narrate(getSimpleNarration('victory', { ...enemy, rewards }));
    this.gm.run.encountersCompleted++;

    // Mark room encounter as completed
    const currentRoom = this.gm.getCurrentRoom();
    if (currentRoom && currentRoom.type === 'encounter') {
      currentRoom.interacted = true;
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
    this.gm.emitState();

    return {
      type: 'victory',
      rewards
    };
  }

  /**
   * Handle player defeat (death)
   * @returns {object} Defeat result with stats and essence earned
   */
  handleDefeat() {
    this.gm.combat.active = false;
    this.gm.run.active = false;
    logger.info('[Combat] Defeat:', { areasCompleted: this.gm.run.areasCompleted, stats: this.gm.run.stats });
    this.gm.run.stats.endTime = Date.now();

    // Award essence and update meta stats (delegated to GameManager)
    const essenceReward = this.gm.awardRunEssence(false);
    this.gm.updateLifetimeStats(false);
    const newAchievements = this.gm.checkAchievements(this.gm.run.stats);

    this.gm.narrate(getSimpleNarration('defeat', this.gm.combat.enemy));
    this.gm.emitState();


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
    this.gm.run.stats.areasCleared = this.gm.run.areasCompleted || 0;

    // Award essence and update meta stats (victory!)
    const essenceReward = this.gm.awardRunEssence(true);
    this.gm.updateLifetimeStats(true);
    const newAchievements = this.gm.checkAchievements(this.gm.run.stats);

    // Level progression: mark level as completed and unlock next
    const levelId = this.gm.run.levelId;
    if (levelId !== null && this.gm.meta?.levels) {
      const levels = this.gm.meta.levels;
      if (!levels.completed.includes(levelId)) {
        levels.completed.push(levelId);
      }
      if (levelId >= levels.highestUnlocked) {
        levels.highestUnlocked = levelId + 1;
      }
      levels.current = null;
    }

    this.gm.narrate(getSimpleNarration('gameVictory', this.gm.run.player));

    // Update persistent player with run rewards
    this.gm.player.credits += this.gm.run.player.credits;

    this.gm.emitState();



    return {
      type: 'game_victory',
      stats: this.gm.run.stats,
      player: this.gm.run.player,
      essenceEarned: essenceReward.essence,
      newAchievements
    };
  }
}
