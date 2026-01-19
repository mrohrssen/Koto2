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
 * - ../state.js - Combat state factory
 * - ../enemies.js - Enemy generation
 * - ../combat/index.js - Combat mechanics
 * - ../dm.js - Narration helpers
 */

import { eventBus, GameEvents } from '../events.js';
import { createCombatState } from '../state.js';
import {
  generateEnemy,
  getBossForFloor,
  selectEnemyIntent,
  pickRandomVoiceLine
} from '../enemies.js';
import { determineTurnOrder } from '../combat/index.js';
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
   * Handle combat victory
   * @returns {object} Victory rewards
   */
  handleVictory() {
    // TODO: move from GameManager
  }

  /**
   * Handle player defeat
   * @returns {object} Defeat result
   */
  handleDefeat() {
    // TODO: move from GameManager
  }
}
