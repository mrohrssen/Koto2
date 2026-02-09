import {
  calculateRobotDamage,
  getElementMultiplier,
  rollVariance,
  selectTarget,
  addXpToRobot,
  generateEnemyRobot
} from '../robots.js';

export function processAttackTurn(allies, enemies) {
  const attacks = [];
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const target = selectTarget(robot, aliveEnemies);
    const elemMult = getElementMultiplier(robot.autoSkill.element, target.element);
    const variance = rollVariance();
    const damage = calculateRobotDamage(robot.attack, robot.autoSkill.power, elemMult, variance);
    target.hp = Math.max(0, target.hp - damage);

    attacks.push({
      attackerId: robot.id,
      attackerName: robot.nameEn,
      targetId: target.id,
      targetName: target.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: target.hp <= 0
    });
  }
  return { attacks, allEnemiesDefeated: enemies.every(e => e.hp <= 0) };
}

export function processDefendTurn(allies) {
  for (const robot of allies) {
    if (robot.hp <= 0) continue;
    robot.ultimate.charges = Math.min(
      robot.ultimate.charges + 1,
      robot.ultimate.chargesRequired
    );
  }
}

export function processEnemyTurn(enemies, allies, defendActive = false) {
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

    target.hp = Math.max(0, target.hp - damage);

    attacks.push({
      attackerId: enemy.id,
      attackerName: enemy.nameEn,
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
    .filter(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.3)
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));

  if (eligible.length === 0) {
    return { success: false, reason: 'No enemy at <=30% HP' };
  }

  const captured = eligible[0];
  const idx = enemies.indexOf(captured);
  enemies.splice(idx, 1);

  captured.hp = captured.maxHp;
  captured.ultimate.charges = 0;

  if (robotParty.active.length < 3) {
    robotParty.active.push(captured);
  } else {
    robotParty.reserves.push(captured);
  }

  return {
    success: true,
    captured,
    allEnemiesDefeated: enemies.filter(e => e.hp > 0).length === 0
  };
}

export function processUltimate(robot, enemies) {
  if (robot.ultimate.charges < robot.ultimate.chargesRequired) {
    return { success: false, reason: 'Not enough charges' };
  }

  const hits = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const elemMult = getElementMultiplier(robot.ultimate.element, enemy.element);
    const variance = rollVariance();
    const damage = calculateRobotDamage(robot.attack, robot.ultimate.power, elemMult, variance);
    enemy.hp = Math.max(0, enemy.hp - damage);
    hits.push({
      targetId: enemy.id,
      targetName: enemy.nameEn,
      damage,
      elementMultiplier: elemMult,
      targetDefeated: enemy.hp <= 0
    });
  }

  robot.ultimate.charges = 0;

  return {
    success: true,
    robotId: robot.id,
    robotName: robot.nameEn,
    ultimateName: robot.ultimate.nameEn,
    hits,
    allEnemiesDefeated: enemies.every(e => e.hp <= 0)
  };
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
