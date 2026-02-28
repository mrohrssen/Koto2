import {
  calculateRobotDamage,
  getElementMultiplier,
  rollVariance,
  selectTarget,
  addXpToRobot,
  generateEnemyRobot,
  xpToNextLevel,
  MOVES_BY_ID
} from '../robots.js';
import {
  getBuffedAttack,
  getBuffedElementMultiplier,
  applyDamageReduction
} from './item-service.js';
import {
  applyHeal, applyPoison, tickEffects,
  applySleep, applyStun, applyConfuse,
  applyAttackBuff, applyHaste, applyShield, applyTeamShield, applyTaunt,
  isIncapacitated, isConfused, hasHaste, consumeHaste,
  getAttackMultiplier, getDamageReduction, getTauntTarget, breakSleep,
  getFlatAttackBonus
} from '../combat/effects.js';
export const CREDITS_PER_KILL = 15;
export const BASE_KILL_XP = 10;

/**
 * Build a standard attack-result record used in the attacks[] array.
 */
function buildAttackRecord(robot, robotIndex, move, target, targetIndex, overrides = {}) {
  return {
    attackerIndex: robotIndex,
    attackerId: robot.id,
    attackerName: robot.nameEn,
    attackerNameJp: robot.name,
    moveId: move.id,
    moveName: move.name,
    moveNameEn: move.nameEn,
    moveElement: move.element,
    category: move.category,
    targetIndex,
    targetId: target.id,
    targetName: target.nameEn,
    targetNameJp: target.name,
    damage: 0,
    healAmount: 0,
    effectApplied: null,
    stab: false,
    elementMultiplier: 1.0,
    targetDefeated: false,
    ...overrides
  };
}

/**
 * Resolve targets for a move based on its target type.
 * @param {string} targetType - Move target type (single_enemy, all_enemies, single_ally, all_allies, self)
 * @param {object[]} allies - Player's active robots
 * @param {object[]} enemies - Enemy robots
 * @param {number} targetIndex - Index provided by the player's choice
 * @param {object} caster - The robot casting the move
 * @returns {{ targets: object[], indices: number[] }} Resolved targets and their indices
 */
function resolveTargets(targetType, allies, enemies, targetIndex, caster) {
  switch (targetType) {
    case 'single_enemy': {
      const t = enemies[targetIndex];
      if (t && t.hp > 0) return { targets: [t], indices: [targetIndex] };
      // Fallback: pick first alive enemy
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) return { targets: [enemies[i]], indices: [i] };
      }
      return { targets: [], indices: [] };
    }
    case 'all_enemies': {
      const targets = [];
      const indices = [];
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) { targets.push(enemies[i]); indices.push(i); }
      }
      return { targets, indices };
    }
    case 'single_ally': {
      const t = allies[targetIndex];
      if (t && t.hp > 0) return { targets: [t], indices: [targetIndex] };
      // Fallback: pick first alive ally
      for (let i = 0; i < allies.length; i++) {
        if (allies[i].hp > 0) return { targets: [allies[i]], indices: [i] };
      }
      return { targets: [], indices: [] };
    }
    case 'all_allies': {
      const targets = [];
      const indices = [];
      for (let i = 0; i < allies.length; i++) {
        if (allies[i].hp > 0) { targets.push(allies[i]); indices.push(i); }
      }
      return { targets, indices };
    }
    case 'self': {
      const idx = allies.indexOf(caster);
      return { targets: [caster], indices: [idx >= 0 ? idx : 0] };
    }
    default:
      return { targets: [], indices: [] };
  }
}

/**
 * Try to apply a move's status effect based on statusChance.
 * Returns the effect name if applied, null otherwise.
 */
function tryApplyStatus(move, target, caster, allies) {
  if (!move.statusEffect || !move.statusChance) return null;
  if (Math.random() * 100 >= move.statusChance) return null;

  const sourceId = caster.id;
  const duration = move.statusDuration || 2;

  switch (move.statusEffect) {
    case 'poison': {
      const damagePerTurn = Math.max(1, Math.floor((caster.attack / 10) * move.power * 0.2));
      applyPoison(target, { damagePerTurn, duration, sourceId });
      return 'poison';
    }
    case 'sleep':
      applySleep(target, { duration, sourceId });
      return 'sleep';
    case 'stun':
      applyStun(target, { sourceId });
      return 'stun';
    case 'confuse':
      applyConfuse(target, { duration, sourceId });
      return 'confuse';
    case 'attack_buff':
      applyAttackBuff(target, { percent: move.power || 25, duration, sourceId });
      return 'attack_buff';
    case 'haste':
      applyHaste(target, { sourceId });
      return 'haste';
    case 'shield':
      applyShield(target, { percent: move.power, duration, sourceId });
      return 'shield';
    case 'team_shield':
      applyTeamShield(allies, { percent: move.power, duration, sourceId });
      return 'team_shield';
    case 'taunt':
      applyTaunt(target, { duration, sourceId });
      return 'taunt';
    default:
      return null;
  }
}

/**
 * Execute a single move for one robot. Returns array of attack records and xpEvents.
 */
function executeMove(robot, robotIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIds) {
  const attacks = [];
  const xpEvents = [];
  const stab = move.element !== 'neutral' && move.element === robot.element;
  const stabMult = stab ? 1.5 : 1.0;

  switch (move.category) {
    case 'damage': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const elemMult = getElementMultiplier(move.element, target.element);
        const variance = rollVariance();
        let buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
        buffedAttack = Math.floor((buffedAttack + getFlatAttackBonus(robot)) * getAttackMultiplier(robot));
        const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult * stabMult, itemBuffs) : elemMult * stabMult;
        let damage = calculateRobotDamage(buffedAttack, move.power, buffedElemMult, variance);

        const shieldReduction = getDamageReduction(target);
        if (shieldReduction > 0) {
          damage = Math.floor(damage * (1 - shieldReduction / 100));
        }

        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) breakSleep(target);

        const effectApplied = move.statusEffect ? tryApplyStatus(move, target, robot, allies) : null;
        const targetDefeated = target.hp <= 0;

        attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
          damage, stab, elementMultiplier: elemMult, targetDefeated, effectApplied
        }));

        if (targetDefeated && !defeatedEnemyIds.has(target.id) && creatureParty) {
          defeatedEnemyIds.add(target.id);
          const xpEvent = awardKillXp(creatureParty, target.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks);
          xpEvents.push({ enemyId: target.id, enemyName: target.nameEn, ...xpEvent });
        }
      }
      break;
    }

    case 'drain': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const elemMult = getElementMultiplier(move.element, target.element);
        const variance = rollVariance();
        let buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
        buffedAttack = Math.floor((buffedAttack + getFlatAttackBonus(robot)) * getAttackMultiplier(robot));
        const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult * stabMult, itemBuffs) : elemMult * stabMult;
        let damage = calculateRobotDamage(buffedAttack, move.power, buffedElemMult, variance);

        const shieldReduction = getDamageReduction(target);
        if (shieldReduction > 0) {
          damage = Math.floor(damage * (1 - shieldReduction / 100));
        }

        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) breakSleep(target);

        // Heal attacker for 50% of damage dealt
        const healAmount = applyHeal(robot, Math.floor(damage * 0.5));

        const effectApplied = move.statusEffect ? tryApplyStatus(move, target, robot, allies) : null;
        const targetDefeated = target.hp <= 0;

        attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
          damage, healAmount, stab, elementMultiplier: elemMult, targetDefeated, effectApplied
        }));

        if (targetDefeated && !defeatedEnemyIds.has(target.id) && creatureParty) {
          defeatedEnemyIds.add(target.id);
          const xpEvent = awardKillXp(creatureParty, target.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks);
          xpEvents.push({ enemyId: target.id, enemyName: target.nameEn, ...xpEvent });
        }
      }
      break;
    }

    case 'heal': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const variance = rollVariance();
        const healAmount = applyHeal(target, Math.floor((robot.attack / 10) * move.power * variance));

        attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
          healAmount
        }));
      }
      break;
    }

    case 'buff': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const effectApplied = tryApplyStatus(move, target, robot, allies);

        attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
          effectApplied
        }));
      }
      break;
    }

    case 'shield': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      if (move.target === 'all_allies') {
        // Use applyTeamShield for all_allies
        applyTeamShield(allies.filter(a => a.hp > 0), {
          percent: move.power,
          duration: move.statusDuration || 2,
          sourceId: robot.id
        });
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const tIdx = indices[i];
          attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
            effectApplied: 'team_shield'
          }));
        }
      } else {
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const tIdx = indices[i];
          applyShield(target, {
            percent: move.power,
            duration: move.statusDuration || 2,
            sourceId: robot.id
          });
          attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
            effectApplied: 'shield'
          }));
        }
      }
      break;
    }

    case 'debuff': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, robot);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const effectApplied = tryApplyStatus(move, target, robot, allies);

        attacks.push(buildAttackRecord(robot, robotIndex, move, target, tIdx, {
          effectApplied
        }));
      }
      break;
    }

    default:
      break;
  }

  return { attacks, xpEvents };
}

/**
 * Process a move-based attack turn. Each ally robot uses a specific move
 * chosen by the player against a specific target.
 *
 * @param {object[]} allies - Player's active robots
 * @param {object[]} enemies - Enemy robots
 * @param {object[]} moveChoices - Array of { robotIndex, moveId, targetIndex }
 * @param {object|null} itemBuffs - Active item buffs
 * @param {object|null} creatureParty - Full robot party (for XP awards)
 * @returns {object} { attacks, allEnemiesDefeated, xpEvents, mpRegens }
 */
export function processMoveTurn(allies, enemies, moveChoices, itemBuffs = null, creatureParty = null) {
  const attacks = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  // Collect robots that have haste (before processing moves)
  const hastedRobotIndices = new Set();
  for (let i = 0; i < allies.length; i++) {
    if (allies[i] && allies[i].hp > 0 && hasHaste(allies[i])) {
      hastedRobotIndices.add(i);
      consumeHaste(allies[i]);
    }
  }

  // Process each move choice
  for (const choice of moveChoices) {
    const robot = allies[choice.robotIndex];
    if (!robot || robot.hp <= 0) continue;
    if (isIncapacitated(robot)) continue;

    // If all enemies are dead, stop processing damage-oriented moves
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (robot.moves || []).find(m => m.id === choice.moveId);
    if (!move) continue;

    // Check MP
    if ((robot.mp || 0) < move.mpCost) continue;

    // Deduct MP
    robot.mp = (robot.mp || 0) - move.mpCost;

    // Execute the move
    const result = executeMove(robot, choice.robotIndex, move, choice.targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIds);
    attacks.push(...result.attacks);
    xpEvents.push(...result.xpEvents);

    // If this robot had haste, execute the same move a second time
    if (hastedRobotIndices.has(choice.robotIndex)) {
      // Don't charge MP again for haste extra action
      const result2 = executeMove(robot, choice.robotIndex, move, choice.targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIds);
      attacks.push(...result2.attacks);
      xpEvents.push(...result2.xpEvents);
    }
  }

  // MP regen: each alive ally gets 12% of maxMp back
  const mpRegens = [];
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    const regen = Math.floor((robot.maxMp || 0) * 0.12);
    robot.mp = Math.min(robot.maxMp || 0, (robot.mp || 0) + regen);
    mpRegens.push({ robotId: robot.id, mp: robot.mp, maxMp: robot.maxMp, regen });
  }

  return {
    attacks,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0),
    xpEvents,
    mpRegens
  };
}

export function processDefendTurn(allies) {
  // MP regen on defend (12% of maxMp)
  const mpRegens = [];
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    const regen = Math.floor((robot.maxMp || 0) * 0.12);
    robot.mp = Math.min(robot.maxMp || 0, (robot.mp || 0) + regen);
    mpRegens.push({ robotId: robot.id, mp: robot.mp, maxMp: robot.maxMp, regen });
  }
  return { mpRegens };
}

export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null) {
  const attacks = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (isIncapacitated(enemy)) continue;

    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const move = (enemy.moves && enemy.moves.length > 0) ? enemy.moves[0] : null;
    if (!move) continue;

    const attackCount = hasHaste(enemy) ? 2 : 1;
    if (hasHaste(enemy)) consumeHaste(enemy);

    for (let strike = 0; strike < attackCount; strike++) {
      const currentAliveAllies = allies.filter(a => a.hp > 0);
      if (currentAliveAllies.length === 0) break;

      let target;
      if (isConfused(enemy)) {
        const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c.id !== enemy.id);
        target = allAlive[Math.floor(Math.random() * allAlive.length)];
      } else {
        const taunter = getTauntTarget(currentAliveAllies);
        target = taunter || selectTarget(enemy, currentAliveAllies);
      }

      const elemMult = getElementMultiplier(move.element, target.element);
      const variance = rollVariance();
      let buffedAttack = Math.floor(enemy.attack * getAttackMultiplier(enemy));
      let damage = calculateRobotDamage(buffedAttack, move.power, elemMult, variance);

      if (defendActive) {
        damage = Math.floor(damage * 0.5);
      }
      if (itemBuffs) {
        damage = applyDamageReduction(damage, itemBuffs);
      }

      const shieldReduction = getDamageReduction(target);
      if (shieldReduction > 0) {
        damage = Math.floor(damage * (1 - shieldReduction / 100));
      }

      target.hp = Math.max(0, target.hp - damage);

      if (damage > 0) breakSleep(target);

      attacks.push({
        attackerId: enemy.id,
        attackerName: enemy.nameEn,
        attackerNameJp: enemy.name,
        moveId: move.id,
        moveName: move.name,
        moveNameEn: move.nameEn,
        moveElement: move.element,
        category: 'damage',
        targetId: target.id,
        targetName: target.nameEn,
        targetNameJp: target.name,
        damage,
        elementMultiplier: elemMult,
        targetDefeated: target.hp <= 0,
      });
    }
  }

  // MP regen for enemies (12% of maxMp)
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const regen = Math.floor((enemy.maxMp || 0) * 0.12);
    enemy.mp = Math.min(enemy.maxMp || 0, (enemy.mp || 0) + regen);
  }

  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0) };
}

/**
 * Tick active effects on all robots (allies and enemies) at start of a combat round.
 * Wraps tickEffects for each alive robot and collects all events.
 *
 * @param {object[]} allies - Player's active robots
 * @param {object[]} enemies - Enemy robots
 * @returns {object[]} Array of effect events (poison damage, etc.)
 */
export function tickAllEffects(allies, enemies) {
  const events = [];
  for (const robot of [...allies, ...enemies]) {
    if (robot && robot.hp > 0) {
      const robotEvents = tickEffects(robot);
      events.push(...robotEvents);
    }
  }
  return events;
}

export function processBefriend(enemies, creatureParty, targetEnemyIndex) {
  const totalRobots = creatureParty.active.length + creatureParty.reserves.length + (creatureParty.pendingCaptures?.length || 0);
  if (totalRobots >= creatureParty.maxTotal) {
    return { success: false, reason: 'Party full' };
  }

  let captured;
  if (typeof targetEnemyIndex === 'number' && targetEnemyIndex >= 0) {
    const target = enemies[targetEnemyIndex];
    if (!target || target.hp <= 0 || target.befriended || (target.hp / target.maxHp) > 0.5) {
      return { success: false, reason: 'Target not eligible' };
    }
    captured = target;
  } else {
    // Fallback: pick lowest HP eligible (legacy behavior)
    const eligible = enemies
      .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (eligible.length === 0) {
      return { success: false, reason: 'No enemy at <=50% HP' };
    }
    captured = eligible[0];
  }

  // Mark as captured but don't remove from array (preserve indices for frontend targeting)
  captured.hp = 0;
  captured.befriended = true;

  // Reset for when it joins the party after combat
  const capturedCopy = { ...captured, hp: captured.maxHp, mp: captured.maxMp, befriended: false };

  // Store in pending list — added to party AFTER combat ends
  if (!creatureParty.pendingCaptures) creatureParty.pendingCaptures = [];
  creatureParty.pendingCaptures.push(capturedCopy);

  return {
    success: true,
    captured,
    capturedId: captured.id,
    allEnemiesDefeated: enemies.filter(e => e.hp > 0 && !e.befriended).length === 0
  };
}

/**
 * Award XP to all alive equipped robots when an enemy is killed during combat.
 * XP scales with enemy level: BASE_KILL_XP * enemyLevel * xpMultiplier.
 * Active robots get 2 shares, reserves get 1 share.
 * When xpBalanceStacks > 0, XP is redistributed from overleveled to underleveled robots.
 * Returns per-robot XP amounts and any level-ups that occurred.
 */
export function awardKillXp(creatureParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0) {
  const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * xpMultiplier);
  const activeRobots = creatureParty.active.filter(r => r && r.hp > 0);
  const reserveRobots = creatureParty.reserves.filter(r => r != null);
  const totalShares = activeRobots.length * 2 + reserveRobots.length * 1;
  if (totalShares === 0) return { xpGrants: [], levelUps: [] };

  const perShare = baseXp / totalShares;

  // Compute initial XP shares per robot
  const entries = [];
  for (const robot of activeRobots) {
    entries.push({ robot, xp: Math.floor(perShare * 2) });
  }
  for (const robot of reserveRobots) {
    entries.push({ robot, xp: Math.floor(perShare * 1) });
  }

  // Apply EXP Balance redistribution
  if (xpBalanceStacks > 0 && entries.length > 1) {
    const totalLevel = entries.reduce((sum, e) => sum + e.robot.level, 0);
    const meanLevel = Math.floor(totalLevel / entries.length);
    const totalXp = entries.reduce((sum, e) => sum + e.xp, 0);
    const recipientCount = entries.filter(e => e.robot.level <= meanLevel).length;

    if (recipientCount > 0) {
      const splitXp = totalXp / recipientCount;
      const t = Math.min(0.2 * xpBalanceStacks, 0.8);

      for (const entry of entries) {
        const isRecipient = entry.robot.level <= meanLevel;
        const target = isRecipient ? splitXp : 0;
        entry.xp = Math.floor(entry.xp + (target - entry.xp) * t);
      }
    }
  }

  // Award XP to robots and collect results
  const xpGrants = [];
  const levelUps = [];

  for (const entry of entries) {
    const prevLevel = entry.robot.level;
    const robotLevelUps = addXpToRobot(entry.robot, entry.xp);
    xpGrants.push({ robotId: entry.robot.id, robotName: entry.robot.nameEn, xp: entry.xp });
    for (const lu of robotLevelUps) {
      levelUps.push({
        robotId: entry.robot.id,
        robotName: entry.robot.nameEn,
        oldLevel: prevLevel,
        newLevel: lu.level,
        maxHp: lu.maxHp,
        attack: lu.attack,
        hpGain: lu.hpGain,
        maxMp: lu.maxMp,
        mpGain: lu.mpGain,
        newMove: lu.newMove
      });
    }
  }

  return { xpGrants, levelUps };
}

export function awardBattleXp(creatureParty) {
  // Befriend victory: each robot gains 1 full level worth of XP
  for (const robot of creatureParty.active) {
    if (robot) addXpToRobot(robot, xpToNextLevel(robot.level));
  }
  for (const robot of creatureParty.reserves) {
    if (robot) addXpToRobot(robot, xpToNextLevel(robot.level));
  }
}

export function handleRobotKO(creatureParty, koRobotIndex) {
  if (creatureParty.reserves.length === 0) return null;
  const replacement = creatureParty.reserves.shift();
  creatureParty.active[koRobotIndex] = replacement;
  return replacement;
}

/**
 * Process a befriend conversation answer.
 * Pure game logic extracted from the /befriend-answer route.
 *
 * @param {object} gameManager - The GameManager instance
 * @param {object} params - { roundIndex, selectedIndex }
 * @returns {object} Result object with response data, or { error, statusCode } on validation failure
 */
export function handleBefriendAnswer(gameManager, { roundIndex, selectedIndex }) {
  const combat = gameManager.combat;

  if (!combat?.active || !combat.befriendConversation?.active) {
    return { error: 'No active befriend conversation', statusCode: 400 };
  }

  const convo = combat.befriendConversation;
  const targetEnemy = combat.enemies[convo.targetEnemyIndex];

  if (roundIndex !== convo.currentRound) {
    return { error: 'Wrong round index', statusCode: 400 };
  }

  const round = convo.rounds[roundIndex];
  if (!round) {
    return { error: 'Invalid round', statusCode: 400 };
  }

  const correct = selectedIndex === round.correctIndex;

  if (!correct) {
    // Failure: clear conversation, enemies attack
    combat.befriendConversation = null;

    const enemyResult = processEnemyTurn(
      combat.enemies, combat.allies, false, gameManager.run?.itemBuffs
    );

    // Handle KO'd allies
    const koSwaps = [];
    for (let i = 0; i < combat.allies.length; i++) {
      if (combat.allies[i] && combat.allies[i].hp <= 0) {
        const replacement = handleRobotKO(gameManager.run.creatureParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
        }
      }
    }
    combat.allies = gameManager.run.creatureParty.active;

    const allAlliesKO = combat.allies.every(a => !a || a.hp <= 0);
    if (allAlliesKO) {
      combat.active = false;
      gameManager.run.active = false;
    }

    return {
      correct: false,
      correctIndex: round.correctIndex,
      enemyAttacks: enemyResult.attacks || [],
      koSwaps,
      combatEnded: allAlliesKO,
      victory: false,
      allies: combat.allies,
      enemies: combat.enemies,
      targetEnemy,
      needsDialogueRegen: true
    };
  }

  // Correct answer
  convo.currentRound++;

  if (convo.currentRound >= 3) {
    // All 3 rounds correct -- use existing befriend cycle
    combat.befriendConversation = null;

    const result = gameManager.robotCombatCycle('befriend');

    return {
      correct: true,
      correctIndex: round.correctIndex,
      conversationComplete: true,
      befriend: result.befriend,
      combatEnded: result.combatEnded || false,
      victory: result.victory || false,
      creatureParty: result.creatureParty,
      enemies: combat.enemies,
      targetEnemy,
      needsDialogueRegen: true
    };
  }

  // Correct but more rounds to go
  return {
    correct: true,
    correctIndex: round.correctIndex,
    conversationComplete: false,
    currentRound: convo.currentRound
  };
}
