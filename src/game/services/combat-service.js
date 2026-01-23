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
 * - ../enemies.js - Enemy generation, boss drops
 * - ../combat/index.js - Combat mechanics, victory processing
 * - ../rooms.js - Post-combat shop, ward navigation
 * - ../dm.js - Narration helpers
 */


import { createCombatState } from '../state.js';
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
  processBossVictory,
  executePlayerAttack,
  executeEnemyTurn,
  tickStatusEffects
} from '../combat/index.js';
import { generatePostCombatShop, getNextWardOptions } from '../rooms.js';
import { resetChipCharge, incrementAllEquippedCharges } from '../items/chips.js';
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


    return {
      enemy: this.gm.combat.enemy,
      intent: this.gm.combat.intent,
      playerGoesFirst: this.gm.combat.turn === 'player',
      isFinalBoss: isFinal,
      dialogue: pickRandomVoiceLine(boss.dialogue?.possessed)  // SYSTEM-controlled dialogue
    };
  }

  /**
   * Execute one combat cycle (vocab-pause turn-based combat)
   * Each cycle processes one attack (player or enemy) and returns updated state
   * @param {string} attackerType - 'player' or 'enemy'
   * @returns {object} Result with attack data, HP values, and combat status
   */
  executeCombatCycle(attackerType = 'player') {
    if (!this.gm.combat?.active) {
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
      goldGained: 0,
      loot: [],
      leveledUp: false,
      newLevel: null
    };

    // Execute attack based on attackerType
    if (attackerType === 'player') {
      // Player attack
      const playerResult = executePlayerAttack(this.gm.run.player, this.gm.combat.enemy, 'normal');

      // Handle SACRIFICE - permanently destroy sacrificed chips
      if (playerResult.pipelineResult?.sacrificedChips?.length > 0) {
        for (const chipId of playerResult.pipelineResult.sacrificedChips) {
          // Remove from player's chip inventory
          const chipIndex = this.gm.run.player.chips?.findIndex(c => c.id === chipId);
          if (chipIndex >= 0) {
            this.gm.run.player.chips.splice(chipIndex, 1);
          }
          // Remove from weapon's equipped chips
          const weapon = this.gm.run.player.equipment?.weapon;
          if (weapon?.equippedChips) {
            const eqIndex = weapon.equippedChips.indexOf(chipId);
            if (eqIndex >= 0) {
              weapon.equippedChips.splice(eqIndex, 1);
            }
          }
          resetChipCharge(this.gm.run.player, chipId);
          // Track total chips destroyed for Phoenix chip
          this.gm.run.player._runChipsDestroyed = (this.gm.run.player._runChipsDestroyed || 0) + 1;
        }
        playerResult.chipsDestroyed = playerResult.pipelineResult.sacrificedChips;
      }

      // Handle LIFELINK/SIPHON healing from pipeline chips
      if (playerResult.pipelineResult?.healPlayer > 0) {
        const healAmount = playerResult.pipelineResult.healPlayer;
        const oldHp = this.gm.run.player.hp;
        this.gm.run.player.hp = Math.min(this.gm.run.player.maxHp, this.gm.run.player.hp + healAmount);
        const actualHeal = this.gm.run.player.hp - oldHp;
        if (actualHeal > 0) {
          playerResult.pipelineHeal = actualHeal;
        }
      }

      // Handle FIREWORKS BOT - random chip destruction
      if (playerResult.pipelineResult?.randomDestroyTriggered) {
        const weapon = this.gm.run.player.equipment?.weapon;
        const equippedChips = weapon?.equippedChips || [];
        const destroyableChips = equippedChips.filter(id =>
          !playerResult.pipelineResult.sacrificedChips?.includes(id) && id !== 'fireworks'
        );
        if (destroyableChips.length > 0) {
          const randomIndex = Math.floor(Math.random() * destroyableChips.length);
          const victimId = destroyableChips[randomIndex];
          const chipIndex = this.gm.run.player.chips?.findIndex(c => c.id === victimId);
          if (chipIndex >= 0) this.gm.run.player.chips.splice(chipIndex, 1);
          const eqIndex = weapon.equippedChips.indexOf(victimId);
          if (eqIndex >= 0) weapon.equippedChips.splice(eqIndex, 1);
          resetChipCharge(this.gm.run.player, victimId);
          this.gm.run.player._runChipsDestroyed = (this.gm.run.player._runChipsDestroyed || 0) + 1;
          playerResult.randomChipDestroyed = victimId;
        }
      }

      // Handle cascade effect (pachinkoBall chip) - bonus hit with same damage
      if (playerResult.cascadeTriggered && playerResult.anyHit && !playerResult.enemyDefeated) {
        const cascadeDamage = playerResult.totalDamage;
        this.gm.combat.enemy.hp = Math.max(0, this.gm.combat.enemy.hp - cascadeDamage);
        playerResult.cascadeDamage = cascadeDamage;
        playerResult.totalDamage += cascadeDamage;
        playerResult.enemyDefeated = this.gm.combat.enemy.hp <= 0;
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
      const enemyTickResult = tickStatusEffects(this.gm.combat.enemy);
      if (enemyTickResult.dotDamage > 0) {
        result.playerAttack.dotDamage = enemyTickResult.dotDamage;
        result.playerAttack.dotSources = enemyTickResult.dotSources;
        // Check if DoT killed the enemy
        if (enemyTickResult.targetDefeated) {
          playerResult.enemyDefeated = true;
        }
      }

      // Update enemy HP in result
      result.enemyHp.current = this.gm.combat.enemy.hp;

      // Track damage dealt
      this.gm.run.stats.damageDealt += playerResult.totalDamage;

      // Track counter chip stats
      if (this.gm.run.runStats) {
        if (result.playerAttack.critical) {
          this.gm.run.runStats.critsLanded++;
        }
        this.gm.run.runStats.damageDealt += playerResult.totalDamage;

        // Track status applications for counter chips
        if (playerResult.chipEffects) {
          for (const effect of playerResult.chipEffects) {
            if (effect.status && this.gm.run.runStats.statusesApplied.hasOwnProperty(effect.status)) {
              this.gm.run.runStats.statusesApplied[effect.status]++;
            }
          }
        }
        if (playerResult.statusInflicted?.status) {
          const status = playerResult.statusInflicted.status;
          if (this.gm.run.runStats.statusesApplied.hasOwnProperty(status)) {
            this.gm.run.runStats.statusesApplied[status]++;
          }
        }
      }

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

        // Reset combat stacks (for Stack Overflow, Burst Cycle chips)
        this.gm.run.player._combatStacks = {};

        // Increment kill count for Bounty Hunter chip
        this.gm.run.player._runKills = (this.gm.run.player._runKills || 0) + 1;

        // Track kill for counter chips
        if (this.gm.run.runStats) {
          this.gm.run.runStats.kills++;
        }

        // Process victory rewards (but don't narrate)
        const enemy = this.gm.combat.enemy;
        result.liberatedDialogue = pickRandomVoiceLine(enemy.dialogue?.liberated);
        const isBoss = enemy.isBoss;

        let rewards;
        if (isBoss) {
          const drop = getBossDrop(this.gm.run.floor);
          rewards = processBossVictory(this.gm.run.player, enemy, this.gm.run.floor, drop, this.gm.run);
          this.gm.run.bossDefeated = true;
        } else {
          rewards = processVictory(this.gm.run.player, enemy, this.gm.run);
          this.gm.run.encountersCompleted++;

          // Mark room encounter as completed
          const currentRoom = this.gm.getCurrentRoom();
          if (currentRoom && currentRoom.type === 'encounter') {
            currentRoom.interacted = true;
          }

          // Generate post-combat shop with 3 random chips
          const ownedChipIds = (this.gm.run.player.chips || []).map(c => c.id);
          const shopItems = generatePostCombatShop(this.gm.run.floor, ownedChipIds);
          this.gm.run.postCombatShop = {
            active: true,
            items: shopItems
          };
        }

        result.expGained = rewards.xp;
        result.goldGained = rewards.gold;
        result.loot = rewards.drops || [];
        result.isBoss = isBoss;

        // End combat
        this.gm.combat.active = false;


        // Update player HP in result
        result.playerHp.current = this.gm.run.player.hp;

        return result;
      }
    } else if (attackerType === 'enemy') {
      // Enemy attack
      const enemyResult = executeEnemyTurn(this.gm.combat.enemy, this.gm.run.player, { id: 'attack', damageMultiplier: 1.0 });
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

      // Track dodges for counter chips
      if (this.gm.run.runStats && (enemyResult.dodge || enemyResult.perfectDodge)) {
        this.gm.run.runStats.dodges++;
      }

      // Increment chip charges after enemy turn (round complete)
      incrementAllEquippedCharges(this.gm.run.player);

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
