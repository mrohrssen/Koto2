import {
  calculateRobotDamage,
  getElementMultiplier,
  rollVariance,
  selectTarget,
  addXpToRobot,
  generateEnemyRobot,
  xpToNextLevel
} from '../robots.js';
import {
  getBuffedAttack,
  getBuffedAutoPower,
  getBuffedUltimatePower,
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

export function processAttackTurn(allies, enemies, itemBuffs = null, robotParty = null) {
  const attacks = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    if (isIncapacitated(robot)) continue;

    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const attackCount = hasHaste(robot) ? 2 : 1;
    if (hasHaste(robot)) consumeHaste(robot);

    for (let strike = 0; strike < attackCount; strike++) {
      const currentAliveEnemies = enemies.filter(e => e.hp > 0);
      if (currentAliveEnemies.length === 0) break;

      let target;
      if (isConfused(robot)) {
        const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c.id !== robot.id);
        target = allAlive[Math.floor(Math.random() * allAlive.length)];
      } else {
        target = selectTarget(robot, currentAliveEnemies);
      }

      const elemMult = getElementMultiplier(robot.autoSkill.element, target.element);
      const variance = rollVariance();
      let buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
      buffedAttack = Math.floor((buffedAttack + getFlatAttackBonus(robot)) * getAttackMultiplier(robot));
      const buffedPower = itemBuffs ? getBuffedAutoPower(robot.autoSkill.power, itemBuffs) : robot.autoSkill.power;
      const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
      let damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);

      // Apply shield/team_shield damage reduction on target
      const shieldReduction = getDamageReduction(target);
      if (shieldReduction > 0) {
        damage = Math.floor(damage * (1 - shieldReduction / 100));
      }

      target.hp = Math.max(0, target.hp - damage);

      if (damage > 0) breakSleep(target);

      // +1 ultimate charge only on first strike
      if (strike === 0) {
        robot.ultimate.charges = Math.min(
          robot.ultimate.charges + 1,
          robot.ultimate.chargesRequired
        );
      }

      const targetDefeated = target.hp <= 0;

      attacks.push({
        attackerId: robot.id,
        attackerName: robot.nameEn,
        attackerNameJp: robot.name,
        attackerBaseWord: robot.baseWord,
        attackerBaseMeaning: robot.baseMeaning,
        attackerSkillName: robot.autoSkill.name,
        attackerSkillEn: robot.autoSkill.nameEn,
        attackerElement: robot.element,
        targetId: target.id,
        targetName: target.nameEn,
        targetNameJp: target.name,
        attackerBaseReading: robot.baseReading,
        attackerSkillReading: robot.autoSkill.reading,
        damage,
        elementMultiplier: elemMult,
        targetDefeated,
        attackerCharges: robot.ultimate.charges,
        attackerChargesRequired: robot.ultimate.chargesRequired,
      });

      if (targetDefeated && !defeatedEnemyIds.has(target.id) && robotParty) {
        defeatedEnemyIds.add(target.id);
        const xpEvent = awardKillXp(robotParty, target.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks);
        xpEvents.push({ enemyId: target.id, enemyName: target.nameEn, ...xpEvent });
      }
    }
  }

  return { attacks, allEnemiesDefeated: enemies.every(e => e.hp <= 0), xpEvents };
}

export function processDefendTurn(allies) {
  const chargeUpdates = [];
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    robot.ultimate.charges = Math.min(
      robot.ultimate.charges + 1,
      robot.ultimate.chargesRequired
    );
    chargeUpdates.push({
      robotId: robot.id,
      charges: robot.ultimate.charges,
      chargesRequired: robot.ultimate.chargesRequired
    });
  }
  return { chargeUpdates };
}

export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null) {
  const attacks = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (isIncapacitated(enemy)) continue;

    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

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

      const elemMult = getElementMultiplier(enemy.autoSkill.element, target.element);
      const variance = rollVariance();
      let buffedAttack = Math.floor(enemy.attack * getAttackMultiplier(enemy));
      let damage = calculateRobotDamage(buffedAttack, enemy.autoSkill.power, elemMult, variance);

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

      if (strike === 0) {
        enemy.ultimate.charges = Math.min(
          enemy.ultimate.charges + 1,
          enemy.ultimate.chargesRequired
        );
      }

      attacks.push({
        attackerId: enemy.id,
        attackerName: enemy.nameEn,
        attackerNameJp: enemy.name,
        attackerBaseWord: enemy.baseWord,
        attackerBaseMeaning: enemy.baseMeaning,
        attackerSkillName: enemy.autoSkill.name,
        attackerSkillEn: enemy.autoSkill.nameEn,
        attackerElement: enemy.element,
        targetId: target.id,
        targetName: target.nameEn,
        targetNameJp: target.name,
        attackerBaseReading: enemy.baseReading,
        attackerSkillReading: enemy.autoSkill.reading,
        damage,
        elementMultiplier: elemMult,
        targetDefeated: target.hp <= 0,
      });
    }
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

export function processBefriend(enemies, robotParty, targetEnemyIndex) {
  const totalRobots = robotParty.active.length + robotParty.reserves.length + (robotParty.pendingCaptures?.length || 0);
  if (totalRobots >= robotParty.maxTotal) {
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
  const capturedCopy = { ...captured, hp: captured.maxHp, befriended: false };
  capturedCopy.ultimate = { ...captured.ultimate, charges: 0 };

  // Store in pending list — added to party AFTER combat ends
  if (!robotParty.pendingCaptures) robotParty.pendingCaptures = [];
  robotParty.pendingCaptures.push(capturedCopy);

  return {
    success: true,
    captured,
    capturedId: captured.id,
    allEnemiesDefeated: enemies.filter(e => e.hp > 0 && !e.befriended).length === 0
  };
}

export function processUltimate(robot, enemies, itemBuffs = null, robotParty = null) {
  if (robot.ultimate.charges < robot.ultimate.chargesRequired) {
    return { success: false, reason: 'Not enough charges' };
  }

  const ultType = robot.ultimate.type || 'damage';
  const ultTarget = robot.ultimate.target || 'all_enemies';

  // Delegate non-damage types to their stub handlers
  if (ultType === 'heal') {
    return processHealUltimate(robot, enemies, itemBuffs, robotParty);
  }
  if (ultType === 'poison') {
    return processPoisonUltimate(robot, enemies, itemBuffs, robotParty);
  }

  // Status effect ultimates
  const STATUS_EFFECT_TYPES = ['sleep', 'stun', 'confuse', 'attack_buff', 'haste', 'shield', 'team_shield', 'taunt'];
  if (STATUS_EFFECT_TYPES.includes(ultType)) {
    return processStatusEffectUltimate(robot, ultType, enemies, robotParty);
  }

  // Determine targets based on targeting mode
  let targets;
  if (ultTarget === 'single_enemy') {
    const selected = selectTarget(robot, enemies.filter(e => e.hp > 0));
    targets = selected ? [selected] : [];
  } else {
    targets = enemies.filter(e => e.hp > 0);
  }

  const hits = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  for (const enemy of targets) {
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const baseAttack = (itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack) + getFlatAttackBonus(robot);
    const buffedPower = itemBuffs ? getBuffedUltimatePower(robot.ultimate.power, itemBuffs) : robot.ultimate.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(baseAttack, buffedPower, buffedElemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    const targetDefeated = enemy.hp <= 0;
    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated
    });

    // Award XP immediately when an enemy is killed by ultimate
    if (targetDefeated && !defeatedEnemyIds.has(enemy.id) && robotParty) {
      defeatedEnemyIds.add(enemy.id);
      const xpEvent = awardKillXp(robotParty, enemy.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks);
      xpEvents.push({ enemyId: enemy.id, enemyName: enemy.nameEn, ...xpEvent });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'damage',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    xpEvents,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}

function processHealUltimate(robot, enemies, itemBuffs, robotParty) {
  const healPower = robot.ultimate.power || 40;
  const ultTarget = robot.ultimate.target || 'single_ally';
  const healEvents = [];

  if (ultTarget === 'single_ally') {
    // Pick the alive ally with lowest HP% that has HP < maxHp
    const candidates = (robotParty?.active || [])
      .filter(r => r.hp > 0 && r.hp < r.maxHp);
    if (candidates.length > 0) {
      candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      const target = candidates[0];
      const variance = rollVariance();
      const healAmount = Math.max(1, Math.floor((robot.attack / 10) * healPower * variance));
      const actualHealed = applyHeal(target, healAmount);
      healEvents.push({
        targetId: target.id,
        targetName: target.nameEn,
        healAmount: actualHealed,
        targetHp: target.hp,
        targetMaxHp: target.maxHp
      });
    }
  } else {
    // all_allies: target all alive allies
    const targets = (robotParty?.active || []).filter(r => r.hp > 0);
    for (const target of targets) {
      const variance = rollVariance();
      const healAmount = Math.max(1, Math.floor((robot.attack / 10) * healPower * variance));
      const actualHealed = applyHeal(target, healAmount);
      healEvents.push({
        targetId: target.id,
        targetName: target.nameEn,
        healAmount: actualHealed,
        targetHp: target.hp,
        targetMaxHp: target.maxHp
      });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'heal',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    healEvents,
    hits: [],
    xpEvents: [],
    allEnemiesDefeated: false
  };
}

function processPoisonUltimate(robot, enemies, itemBuffs, robotParty) {
  const aliveEnemies = enemies.filter(e => e.hp > 0);
  const ultTarget = robot.ultimate.target || 'all_enemies';

  // Determine targets based on targeting mode
  let targets;
  if (ultTarget === 'single_enemy') {
    const selected = selectTarget(robot, aliveEnemies);
    targets = selected ? [selected] : [];
  } else {
    targets = aliveEnemies;
  }

  // Immediate damage uses half power
  const immediatePower = Math.floor((robot.ultimate.power || 30) * 0.5);
  // Poison damage-per-turn scales with attack and ultimate power
  const damagePerTurn = Math.max(1, Math.floor((robot.attack / 10) * (robot.ultimate.power || 30) * 0.2));

  const hits = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  for (const enemy of targets) {
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, immediatePower, buffedElemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);

    const targetDefeated = enemy.hp <= 0;

    // Apply poison only if target survived the immediate damage
    if (!targetDefeated) {
      applyPoison(enemy, { damagePerTurn, duration: 3, sourceId: robot.id });
    }

    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated,
      poisonApplied: !targetDefeated
    });

    // Award XP immediately when an enemy is killed
    if (targetDefeated && !defeatedEnemyIds.has(enemy.id) && robotParty) {
      defeatedEnemyIds.add(enemy.id);
      const xpEvent = awardKillXp(robotParty, enemy.level, itemBuffs?.xpMultiplier, itemBuffs?.xpBalanceStacks);
      xpEvents.push({ enemyId: enemy.id, enemyName: enemy.nameEn, ...xpEvent });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: 'poison',
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    xpEvents,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}

function processStatusEffectUltimate(robot, effectType, enemies, robotParty) {
  const ultTarget = robot.ultimate.target || 'single_enemy';
  const power = robot.ultimate.power || 0;
  const effectEvents = [];
  const allies = robotParty?.active || [];

  // Debuffs target enemies
  if (['sleep', 'stun', 'confuse'].includes(effectType)) {
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    let targets;
    if (ultTarget === 'all_enemies') {
      targets = aliveEnemies;
    } else {
      const selected = selectTarget(robot, aliveEnemies);
      targets = selected ? [selected] : [];
    }

    for (const target of targets) {
      if (effectType === 'sleep') applySleep(target, { duration: 2, sourceId: robot.id });
      else if (effectType === 'stun') applyStun(target, { sourceId: robot.id });
      else if (effectType === 'confuse') applyConfuse(target, { duration: 2, sourceId: robot.id });

      effectEvents.push({
        type: effectType,
        targetId: target.id,
        targetName: target.nameEn,
      });
    }
  }

  // Buffs target allies
  if (['attack_buff', 'haste', 'shield'].includes(effectType)) {
    let targets;
    if (ultTarget === 'all_allies') {
      targets = allies.filter(r => r.hp > 0);
    } else {
      // single_ally: pick ally with lowest HP%
      const candidates = allies.filter(r => r.hp > 0);
      candidates.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      targets = candidates.length > 0 ? [candidates[0]] : [];
    }

    for (const target of targets) {
      if (effectType === 'attack_buff') applyAttackBuff(target, { percent: power, duration: 2, sourceId: robot.id });
      else if (effectType === 'haste') applyHaste(target, { sourceId: robot.id });
      else if (effectType === 'shield') applyShield(target, { percent: power, duration: 2, sourceId: robot.id });

      effectEvents.push({
        type: effectType,
        targetId: target.id,
        targetName: target.nameEn,
        percent: power || undefined,
      });
    }
  }

  // team_shield: all allies
  if (effectType === 'team_shield') {
    applyTeamShield(allies, { percent: power, duration: 2, sourceId: robot.id });
    for (const ally of allies.filter(r => r.hp > 0)) {
      effectEvents.push({
        type: 'team_shield',
        targetId: ally.id,
        targetName: ally.nameEn,
        percent: power,
      });
    }
  }

  // taunt: self
  if (effectType === 'taunt') {
    applyTaunt(robot, { duration: 2, sourceId: robot.id });
    effectEvents.push({
      type: 'taunt',
      targetId: robot.id,
      targetName: robot.nameEn,
    });
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    type: effectType,
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    effectEvents,
    hits: [],
    xpEvents: [],
    allEnemiesDefeated: false,
  };
}

/**
 * Award XP to all alive equipped robots when an enemy is killed during combat.
 * XP scales with enemy level: BASE_KILL_XP * enemyLevel * xpMultiplier.
 * Active robots get 2 shares, reserves get 1 share.
 * When xpBalanceStacks > 0, XP is redistributed from overleveled to underleveled robots.
 * Returns per-robot XP amounts and any level-ups that occurred.
 */
export function awardKillXp(robotParty, enemyLevel, xpMultiplier = 1.0, xpBalanceStacks = 0) {
  const baseXp = Math.floor(BASE_KILL_XP * enemyLevel * xpMultiplier);
  const activeRobots = robotParty.active.filter(r => r && r.hp > 0);
  const reserveRobots = robotParty.reserves.filter(r => r != null);
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
        hpGain: lu.hpGain
      });
    }
  }

  return { xpGrants, levelUps };
}

export function awardBattleXp(robotParty) {
  // Befriend victory: each robot gains 1 full level worth of XP
  for (const robot of robotParty.active) {
    if (robot) addXpToRobot(robot, xpToNextLevel(robot.level));
  }
  for (const robot of robotParty.reserves) {
    if (robot) addXpToRobot(robot, xpToNextLevel(robot.level));
  }
}

export function handleRobotKO(robotParty, koRobotIndex) {
  if (robotParty.reserves.length === 0) return null;
  const replacement = robotParty.reserves.shift();
  robotParty.active[koRobotIndex] = replacement;
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
        const replacement = handleRobotKO(gameManager.run.robotParty, i);
        if (replacement) {
          koSwaps.push({ slot: i, replacement: replacement.nameEn });
        }
      }
    }
    combat.allies = gameManager.run.robotParty.active;

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
      robotParty: result.robotParty,
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
