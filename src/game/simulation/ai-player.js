/**
 * @fileoverview Simple AI player for game simulation
 * @module src/game/simulation/ai-player
 *
 * Heuristic-based combat AI for automated playtesting.
 * Makes reasonable decisions without being optimal.
 */

/**
 * AI Player for automated gameplay
 */
export class AIPlayer {
  constructor(config = {}) {
    this.config = config;
    // Thresholds for decision making
    this.fleeThreshold = 0.15;     // Flee if HP < 15%
    this.healThreshold = 0.25;     // Use heal if HP < 25%
    this.defendThreshold = 0.30;   // Defend if HP < 30% and enemy attacking
    this.heavyThreshold = 0.70;    // Use heavy attack if HP > 70%
  }

  /**
   * Decide what action to take in combat
   * @param {GameManager} gm - Game manager instance
   * @returns {Object} Action to take { type, attackType?, skillId?, itemId? }
   */
  decideCombatAction(gm) {
    const player = gm.run?.player;
    const enemy = gm.combat?.enemy;
    const intent = gm.combat?.enemy?.intent;

    if (!player || !enemy) {
      return { type: 'attack', attackType: 'normal' };
    }

    const hpPercent = player.hp / player.maxHp;
    const enemyHpPercent = enemy.hp / enemy.maxHp;
    const isBoss = enemy.isBoss;

    // 1. Check if we should flee (non-boss only)
    if (!isBoss && hpPercent < this.fleeThreshold) {
      return { type: 'flee' };
    }

    // 2. Check if we should heal
    if (hpPercent < this.healThreshold) {
      const healItem = this.findHealItem(player);
      if (healItem) {
        if (this.config?.verbose) {
          console.log(`  AI: Healing with ${healItem.id} (HP: ${Math.floor(hpPercent*100)}%)`);
        }
        return { type: 'item', itemId: healItem.id };
      }
    }

    // 3. Check if we should defend (low HP and enemy is attacking)
    if (hpPercent < this.defendThreshold && this.isEnemyAttacking(intent)) {
      return { type: 'defend' };
    }

    // 4. Check if we should use magic (high SP and have offensive spells)
    if (player.sp > 10) {
      const offensiveSkill = this.findOffensiveSkill(player);
      if (offensiveSkill && Math.random() < 0.3) {
        return { type: 'magic', skillId: offensiveSkill.id };
      }
    }

    // 5. Choose attack type based on situation
    return this.chooseAttackType(hpPercent, enemyHpPercent, isBoss);
  }

  /**
   * Choose between quick, normal, and heavy attacks
   */
  chooseAttackType(hpPercent, enemyHpPercent, isBoss) {
    // Heavy attack if healthy and enemy is low (finish them)
    if (hpPercent > this.heavyThreshold && enemyHpPercent < 0.3) {
      return { type: 'attack', attackType: 'heavy' };
    }

    // Heavy attack if very healthy
    if (hpPercent > 0.85) {
      return { type: 'attack', attackType: 'heavy' };
    }

    // Quick attack to try to stagger if enemy is dangerous
    if (isBoss && hpPercent < 0.5) {
      return { type: 'attack', attackType: 'quick' };
    }

    // Default to normal attack
    return { type: 'attack', attackType: 'normal' };
  }

  /**
   * Check if enemy intent indicates an attack
   */
  isEnemyAttacking(intent) {
    if (!intent) return false;
    const attackIntents = ['attack', 'heavy_attack', 'multi_strike', 'charge'];
    return attackIntents.includes(intent);
  }

  /**
   * Find a healing item in player inventory
   */
  findHealItem(player) {
    const items = player.items || [];
    return items.find(item =>
      item.id.includes('potion') ||
      item.id.includes('heal') ||
      item.id === 'onigiri'
    );
  }

  /**
   * Find an offensive magic skill
   */
  findOffensiveSkill(player) {
    const skills = player.skills || [];
    return skills.find(skill =>
      skill.type === 'damage' ||
      skill.id.includes('fire') ||
      skill.id.includes('ice') ||
      skill.id.includes('lightning')
    );
  }

  /**
   * Decide whether to disarm a trap
   * @param {GameManager} gm - Game manager instance
   * @returns {boolean} True to disarm, false to trigger
   */
  shouldDisarmTrap(gm) {
    const player = gm.run?.player;
    if (!player) return false;

    // Disarm if we have good DEX (higher success chance)
    const dex = player.stats?.dex || 5;
    const hpPercent = player.hp / player.maxHp;

    // Always try to disarm if low HP
    if (hpPercent < 0.3) return true;

    // Disarm if DEX is decent
    if (dex >= 6) return true;

    // Otherwise just trigger it (faster)
    return false;
  }

  /**
   * Decide whether to buy from shop
   * Currently always returns false (skip shops for speed)
   */
  shouldBuyFromShop(gm, item) {
    return false;
  }
}
