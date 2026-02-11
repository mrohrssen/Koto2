import {
  calculateRobotDamage,
  getElementMultiplier,
  rollVariance,
  selectTarget,
  addXpToRobot,
  generateEnemyRobot
} from '../robots.js';
import { readFileSync } from 'fs';
import {
  getBuffedAttack,
  getBuffedAutoPower,
  getBuffedUltimatePower,
  getBuffedElementMultiplier,
  applyDamageReduction
} from './item-service.js';
import { DM_PROMPTS } from '../dm.js';

export function processAttackTurn(allies, enemies, itemBuffs = null, robotParty = null) {
  const attacks = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const target = selectTarget(robot, aliveEnemies);
    const elemMult = getElementMultiplier(robot.autoSkill.element, target.element);
    const variance = rollVariance();
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedPower = itemBuffs ? getBuffedAutoPower(robot.autoSkill.power, itemBuffs) : robot.autoSkill.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
    target.hp = Math.max(0, target.hp - damage);

    // +1 ultimate charge immediately when this robot attacks
    robot.ultimate.charges = Math.min(
      robot.ultimate.charges + 1,
      robot.ultimate.chargesRequired
    );

    const targetDefeated = target.hp <= 0;

    attacks.push({
      attackerId: robot.id,
      attackerName: robot.nameEn,
      attackerElement: robot.element,
      targetId: target.id,
      targetName: target.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated,
      attackerCharges: robot.ultimate.charges,
      attackerChargesRequired: robot.ultimate.chargesRequired
    });

    // Award XP immediately when an enemy is killed (BUG C)
    if (targetDefeated && !defeatedEnemyIds.has(target.id) && robotParty) {
      defeatedEnemyIds.add(target.id);
      const xpEvent = awardKillXp(robotParty, 50);
      xpEvents.push({ enemyId: target.id, enemyName: target.nameEn, ...xpEvent });
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
    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const target = selectTarget(enemy, aliveAllies);
    const elemMult = getElementMultiplier(enemy.autoSkill.element, target.element);
    const variance = rollVariance();
    let damage = calculateRobotDamage(enemy.attack, enemy.autoSkill.power, elemMult, variance);

    if (defendActive) {
      damage = Math.floor(damage * 0.5);
    }
    if (itemBuffs) {
      damage = applyDamageReduction(damage, itemBuffs);
    }

    target.hp = Math.max(0, target.hp - damage);

    // +1 ultimate charge immediately when this enemy attacks
    enemy.ultimate.charges = Math.min(
      enemy.ultimate.charges + 1,
      enemy.ultimate.chargesRequired
    );

    attacks.push({
      attackerId: enemy.id,
      attackerName: enemy.nameEn,
      attackerElement: enemy.element,
      targetId: target.id,
      targetName: target.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: target.hp <= 0
    });
  }
  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0) };
}

export function processBefriend(enemies, robotParty) {
  const totalRobots = robotParty.active.length + robotParty.reserves.length;
  if (totalRobots >= robotParty.maxTotal) {
    return { success: false, reason: 'Party full' };
  }

  const eligible = enemies
    .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));

  if (eligible.length === 0) {
    return { success: false, reason: 'No enemy at <=50% HP' };
  }

  const captured = eligible[0];
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

  const hits = [];
  const xpEvents = [];
  const defeatedEnemyIds = new Set();

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const buffedAttack = itemBuffs ? getBuffedAttack(robot.attack, itemBuffs) : robot.attack;
    const buffedPower = itemBuffs ? getBuffedUltimatePower(robot.ultimate.power, itemBuffs) : robot.ultimate.power;
    const buffedElemMult = itemBuffs ? getBuffedElementMultiplier(elemMult, itemBuffs) : elemMult;
    const damage = calculateRobotDamage(buffedAttack, buffedPower, buffedElemMult, variance);
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
      const xpEvent = awardKillXp(robotParty, 50);
      xpEvents.push({ enemyId: enemy.id, enemyName: enemy.nameEn, ...xpEvent });
    }
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    xpEvents,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
}

/**
 * Award XP to all alive equipped robots when an enemy is killed during combat.
 * Returns per-robot XP amounts and any level-ups that occurred.
 */
export function awardKillXp(robotParty, baseXp) {
  const activeCount = robotParty.active.filter(r => r && r.hp > 0).length;
  const reserveCount = robotParty.reserves.length;
  const totalShares = activeCount * 2 + reserveCount * 1;
  if (totalShares === 0) return { xpGrants: [], levelUps: [] };

  const perShare = baseXp / totalShares;
  const xpGrants = [];
  const levelUps = [];

  for (const robot of robotParty.active) {
    if (!robot || robot.hp <= 0) continue;
    const xpAmount = Math.floor(perShare * 2);
    const prevLevel = robot.level;
    addXpToRobot(robot, xpAmount);
    xpGrants.push({ robotId: robot.id, robotName: robot.nameEn, xp: xpAmount });
    if (robot.level > prevLevel) {
      levelUps.push({
        robotId: robot.id,
        robotName: robot.nameEn,
        oldLevel: prevLevel,
        newLevel: robot.level,
        maxHp: robot.maxHp,
        attack: robot.attack
      });
    }
  }

  for (const robot of robotParty.reserves) {
    if (!robot) continue;
    const xpAmount = Math.floor(perShare);
    const prevLevel = robot.level;
    addXpToRobot(robot, xpAmount);
    xpGrants.push({ robotId: robot.id, robotName: robot.nameEn, xp: xpAmount });
    if (robot.level > prevLevel) {
      levelUps.push({
        robotId: robot.id,
        robotName: robot.nameEn,
        oldLevel: prevLevel,
        newLevel: robot.level,
        maxHp: robot.maxHp,
        attack: robot.attack
      });
    }
  }

  return { xpGrants, levelUps };
}

export function awardBattleXp(robotParty, baseXp) {
  const activeCount = robotParty.active.filter(r => r).length;
  const reserveCount = robotParty.reserves.length;
  const totalShares = activeCount * 2 + reserveCount * 1;
  if (totalShares === 0) return;

  const perShare = baseXp / totalShares;
  for (const robot of robotParty.active) {
    if (robot) addXpToRobot(robot, Math.floor(perShare * 2));
  }
  for (const robot of robotParty.reserves) {
    addXpToRobot(robot, Math.floor(perShare));
  }
}

export function handleRobotKO(robotParty, koRobotIndex) {
  if (robotParty.reserves.length === 0) return null;
  const replacement = robotParty.reserves.shift();
  robotParty.active[koRobotIndex] = replacement;
  return replacement;
}

/**
 * Generate befriend conversation rounds for a target enemy robot.
 * Tries AI generation first, falls back to static data.
 * @param {object} robot - The enemy robot to converse with
 * @param {string[]} vocabulary - Player's known vocabulary
 * @param {object} aiConfig - { chat, provider, apiKey, openaiModel, openrouterModel, jlptLevel }
 * @returns {object[]} Array of 3 rounds: { speaker, options, correctIndex }
 */
export async function generateBefriendConversation(robot, vocabulary, aiConfig = {}) {
  // Try AI generation
  if (aiConfig.chat && aiConfig.apiKey && vocabulary.length > 0) {
    try {
      const prompt = DM_PROMPTS.befriendConversation({ robot });
      const response = await aiConfig.chat({
        provider: aiConfig.provider || 'openai',
        apiKey: aiConfig.apiKey,
        messages: [{ role: 'user', content: prompt }],
        vocabulary,
        jlptLevel: aiConfig.jlptLevel || 'N4',
        personaName: robot.name || robot.nameEn,
        openaiModel: aiConfig.openaiModel,
        openrouterModel: aiConfig.openrouterModel,
        purpose: 'other'
      });

      // Try to extract JSON from response (may have markdown fences)
      let jsonStr = response;
      const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      const parsed = JSON.parse(jsonStr.trim());
      if (Array.isArray(parsed) && parsed.length === 3) {
        const valid = parsed.every(r =>
          r.speaker && Array.isArray(r.options) && r.options.length === 3 &&
          typeof r.correctIndex === 'number' && r.correctIndex >= 0 && r.correctIndex <= 2
        );
        if (valid) return parsed;
      }
    } catch (e) {
      console.warn('[Befriend] AI conversation generation failed, using fallback:', e.message);
    }
  }

  // Fallback to static data
  return getStaticConversation(robot.id);
}

function getStaticConversation(robotId) {
  try {
    const data = JSON.parse(readFileSync('data/befriend-conversations.json', 'utf8'));
    if (data[robotId]?.rounds) {
      return data[robotId].rounds;
    }
  } catch (e) {
    console.warn('[Befriend] Failed to load static conversations:', e.message);
  }

  // Ultimate fallback
  return [
    { speaker: '友達になりたい？', options: ['うん、なろう！', '魚が好き。', '靴を買った。'], correctIndex: 0 },
    { speaker: '一緒に遊ぼう！', options: ['テレビを見た。', 'いいね、遊ぼう！', '車が速い。'], correctIndex: 1 },
    { speaker: '仲間だね！', options: ['昨日は暑かった。', 'お金がない。', 'ずっと仲間だよ！'], correctIndex: 2 }
  ];
}
