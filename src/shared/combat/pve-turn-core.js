import {
  calculateCreatureDamage,
  getElementMultiplier,
  getBuffedAttack,
  getBuffedElementMultiplier,
  applyDamageReduction,
  rollVariance,
} from './creature-math.js';
import {
  applyHeal,
  applyPoison,
  applySleep,
  applyStun,
  applyConfuse,
  applyTaunt,
  applyCleanse,
  applyStatChange,
  applyStatChanges,
  initStatStages,
  isIncapacitated,
  isConfused,
  getAttackMultiplier,
  getDefenseMultiplier,
  getTauntTarget,
  getEffectiveDex,
  breakSleep,
  rollCritical,
  rollDodge,
  tickEffects,
} from '../../game/combat/effects.js';
import {
  applyAfterPlayerAttacks as applyPartySkillsAfterPlayerAttacks,
  applyEnemySelfSabotage,
  checkAfflictionBurstCounter,
  computeInlineCounter,
  toActivePartySkillIdSet,
} from '../../game/combat/party-skill-engine.js';
import { getHealingMultiplier, getPartySkillLevel } from '../../game/party-skills.js';
import { REST_MOVE, computeRestMpGain } from '../../game/rest-move.js';

function creatureVocabFields(creature = {}, prefix) {
  return {
    [`${prefix}Word`]: creature.name || '',
    [`${prefix}Reading`]: creature.reading || '',
    [`${prefix}Meaning`]: creature.meaning || creature.nameEn || ''
  };
}

function rollMoveDamage(attacker, target, move, _itemBuffs, variance) {
  const stab = move.element !== 'neutral' && move.element === attacker.element;
  const stabMult = stab ? 1.5 : 1.0;
  const elemMult = getElementMultiplier(move.element, target.element);
  let typeMult = elemMult * stabMult;
  const buffs = attacker.itemBuffs || _itemBuffs;
  if (buffs) typeMult = getBuffedElementMultiplier(typeMult, buffs);

  let buffedAttack = buffs ? getBuffedAttack(attacker.attack, buffs, attacker.level) : attacker.attack;
  buffedAttack = Math.floor(buffedAttack * getAttackMultiplier(attacker));

  return calculateCreatureDamage({
    attackerLevel: Math.max(1, attacker.level || 1),
    attack: buffedAttack,
    defenderDefense: Math.floor((target.defense ?? 5) * getDefenseMultiplier(target)),
    power: move.power,
    typeMultiplier: typeMult,
    variance
  });
}

function buildAttackRecord(creature, creatureIndex, move, target, targetIndex, overrides = {}) {
  return {
    attackerIndex: creatureIndex,
    attackerId: creature.id,
    attackerName: creature.nameEn,
    attackerNameJp: creature.name,
    attackerElement: creature.element,
    ...creatureVocabFields(creature, 'attacker'),
    attackerSkillName: move.name,
    attackerSkillReading: move.reading,
    attackerSkillEn: move.nameEn,
    moveId: move.id,
    moveName: move.name,
    moveNameEn: move.nameEn,
    moveElement: move.element,
    category: move.category,
    targetIndex,
    targetId: target.id,
    targetName: target.nameEn,
    targetNameJp: target.name,
    ...creatureVocabFields(target, 'target'),
    targetElement: target.element,
    damage: 0,
    healAmount: 0,
    effectApplied: null,
    critical: false,
    critChance: null,
    dodged: false,
    hitChance: 1,
    dodgeChance: 0,
    stab: false,
    elementMultiplier: 1.0,
    targetDefeated: false,
    ...overrides
  };
}

function resolveTargets(targetType, allies, enemies, targetIndex, caster) {
  switch (targetType) {
    case 'single_enemy': {
      const t = enemies[targetIndex];
      if (t && t.hp > 0) return { targets: [t], indices: [targetIndex] };
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

function tryApplyStatus(move, target, caster, allies, rng = Math.random) {
  if (!move.statusEffect || !move.statusChance) return null;
  if (rng() * 100 >= move.statusChance) return null;

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
    case 'taunt':
      applyTaunt(target, { duration, sourceId });
      return 'taunt';
    case 'cleanse':
      applyCleanse(target);
      return 'cleanse';
    default:
      return null;
  }
}

function tryApplyStatChanges(move, target, rng = Math.random) {
  if (!move.statChanges) return null;
  if (move.statusChance && move.statusChance < 100) {
    if (rng() * 100 >= move.statusChance) return null;
  }
  return applyStatChanges(target, move.statChanges);
}

function isHostileTarget(target, enemies) {
  return Array.isArray(enemies) && enemies.includes(target);
}

function canMoveBeDodged(move, target, enemies) {
  if (!isHostileTarget(target, enemies)) return false;
  return move.category === 'damage' || move.category === 'drain' || move.category === 'debuff';
}

function resolveDodge(attacker, target, move, enemies, rng = Math.random) {
  if (!canMoveBeDodged(move, target, enemies)) {
    return { dodged: false, hitChance: 1, dodgeChance: 0 };
  }
  return rollDodge(attacker, target, rng);
}

function applyCriticalDamage(attacker, move, damage, rng = Math.random) {
  if (move.category !== 'damage' && move.category !== 'drain') {
    return { damage, critical: false, critChance: null };
  }
  const crit = rollCritical(attacker, rng);
  return {
    damage: crit.critical ? Math.floor(damage * 1.5) : damage,
    critical: crit.critical,
    critChance: crit.critChance
  };
}

function applyHpMasterHeal({ target, amount, runPartySkills, rng = Math.random }) {
  const boosted = Math.floor(amount * getHealingMultiplier(runPartySkills));
  const healed = applyHeal(target, boosted);
  if (healed > 0 && getPartySkillLevel(runPartySkills, 'hpMaster') >= 4) {
    const stats = ['atk', 'def', 'dex'];
    const stat = stats[Math.floor(rng() * stats.length)];
    initStatStages(target);
    applyStatChange(target, stat, 1);
  }
  return healed;
}

function maybeAwardKillXp({ creatureParty, target, enemies, enemyIdx, defeatedEnemyIndices, itemBuffs, metaMults, awardKillXp, runPartySkills, rng = Math.random }) {
  if (!creatureParty || typeof awardKillXp !== 'function') return null;
  if (enemyIdx < 0 || defeatedEnemyIndices.has(enemyIdx)) return null;
  defeatedEnemyIndices.add(enemyIdx);
  const xpEvent = awardKillXp(
    creatureParty,
    target.level,
    itemBuffs?.xpMultiplier,
    itemBuffs?.xpBalanceStacks,
    metaMults,
    itemBuffs,
    runPartySkills,
    rng,
  );
  return { enemyId: target.id, enemyIndex: enemyIdx, enemyName: target.nameEn, ...xpEvent };
}

function executeMove(creature, creatureIndex, move, targetIndex, allies, enemies, itemBuffs, creatureParty, defeatedEnemyIndices, metaMults = null, defenderItemBuffs = null, rng = Math.random, awardKillXp = null, runPartySkills = [], xpRng = rng) {
  const attacks = [];
  const xpEvents = [];
  const stab = move.element !== 'neutral' && move.element === creature.element;

  switch (move.category) {
    case 'damage':
    case 'drain': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const dodge = resolveDodge(creature, target, move, enemies, rng);
        if (dodge.dodged) {
          attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
            dodged: true,
            hitChance: dodge.hitChance,
            dodgeChance: dodge.dodgeChance,
            stab,
            elementMultiplier: getElementMultiplier(move.element, target.element)
          }));
          continue;
        }
        const variance = rollVariance(rng);
        let damage = rollMoveDamage(creature, target, move, itemBuffs, variance);
        const crit = applyCriticalDamage(creature, move, damage, rng);
        damage = crit.damage;

        if (defenderItemBuffs) {
          damage = applyDamageReduction(damage, defenderItemBuffs);
        }

        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) breakSleep(target);

        const healAmount = move.category === 'drain'
          ? applyHpMasterHeal({
            target: creature,
            amount: Math.floor(damage * 0.5),
            runPartySkills,
            rng
          })
          : 0;
        const targetDefeated = target.hp <= 0;
        const effectApplied = (!targetDefeated && move.statusEffect) ? tryApplyStatus(move, target, creature, allies, rng) : null;
        const statChangesApplied = targetDefeated ? null : tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          damage,
          healAmount,
          critical: crit.critical,
          critChance: crit.critChance,
          stab,
          elementMultiplier: getElementMultiplier(move.element, target.element),
          targetDefeated,
          effectApplied,
          statChangesApplied
        }));

        if (targetDefeated) {
          const enemyIdx = enemies.indexOf(target);
          const xpEvent = maybeAwardKillXp({
            creatureParty,
            target,
            enemies,
            enemyIdx,
            defeatedEnemyIndices,
            itemBuffs,
            metaMults,
            awardKillXp,
            runPartySkills,
            rng: xpRng,
          });
          if (xpEvent) xpEvents.push(xpEvent);
        }
      }
      break;
    }

    case 'heal': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const variance = rollVariance(rng);
        const healAmount = applyHpMasterHeal({
          target,
          amount: Math.floor((creature.attack / 10) * move.power * variance),
          runPartySkills,
          rng
        });
        const effectApplied = move.statusEffect ? tryApplyStatus(move, target, creature, allies, rng) : null;
        const statChangesApplied = tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          healAmount, effectApplied, statChangesApplied
        }));
      }
      break;
    }

    case 'buff':
    case 'debuff': {
      const { targets, indices } = resolveTargets(move.target, allies, enemies, targetIndex, creature);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const tIdx = indices[i];
        const effectApplied = tryApplyStatus(move, target, creature, allies, rng);
        const statChangesApplied = tryApplyStatChanges(move, target, rng);

        attacks.push(buildAttackRecord(creature, creatureIndex, move, target, tIdx, {
          effectApplied, statChangesApplied
        }));
      }
      break;
    }

    default:
      break;
  }

  return { attacks, xpEvents };
}

function buildRestAttack(creature, creatureIndex, mpGained) {
  return {
    category: 'rest',
    isRest: true,
    attackerId: creature.id,
    attackerIndex: creatureIndex,
    attackerName: creature.nameEn || creature.name || '',
    attackerNameJp: creature.name || '',
    ...creatureVocabFields(creature, 'attacker'),
    attackerElement: creature.element || 'neutral',
    attackerMp: creature.mp,
    attackerMaxMp: creature.maxMp || 0,
    targetSide: 'player',
    targetId: creature.id,
    targetIndex: creatureIndex,
    targetName: creature.nameEn || creature.name || '',
    targetNameJp: creature.name || '',
    ...creatureVocabFields(creature, 'target'),
    targetElement: creature.element || 'neutral',
    moveName: REST_MOVE.name,
    moveNameEn: REST_MOVE.nameEn,
    moveElement: 'neutral',
    attackerSkillName: REST_MOVE.name,
    attackerSkillReading: REST_MOVE.reading,
    attackerSkillEn: REST_MOVE.nameEn,
    damage: 0,
    mpGained,
    elementMultiplier: 1,
  };
}

export function processDefendTurn(allies) {
  const mpRegens = [];
  for (const creature of allies) {
    if (creature.hp <= 0) continue;
    const regen = Math.floor((creature.maxMp || 0) * 0.12);
    creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + regen);
    mpRegens.push({ creatureId: creature.id, mp: creature.mp, maxMp: creature.maxMp, regen });
  }
  return { mpRegens };
}

function getStrongestDamageMove(enemy) {
  if (!enemy.moves?.length) return null;
  const damageMoves = enemy.moves.filter(m => m.category === 'damage' || m.category === 'drain');
  if (damageMoves.length === 0) return null;
  return damageMoves.reduce((best, m) => ((m.power || 0) > (best.power || 0) ? m : best));
}

function getRandomMove(enemy, rng = Math.random) {
  if (!enemy.moves?.length) return null;
  return enemy.moves[Math.floor(rng() * enemy.moves.length)];
}

export function pickEnemyMoveChoice(enemy, allies, enemies, rng = Math.random) {
  if (!enemy.moves?.length) return null;
  const aliveAllies = allies.filter(c => c.hp > 0);
  if (aliveAllies.length === 0) return null;

  const taunter = getTauntTarget(aliveAllies);
  if (taunter) {
    return { move: getStrongestDamageMove(enemy) || getRandomMove(enemy, rng), mode: 'taunted' };
  }

  if (isConfused(enemy)) {
    return { move: getRandomMove(enemy, rng), mode: 'confused' };
  }

  if (rng() < 2 / 3) {
    const strongest = getStrongestDamageMove(enemy);
    if (strongest) return { move: strongest, mode: 'smart' };
  }

  return { move: getRandomMove(enemy, rng), mode: 'random' };
}

export function pickEnemyTarget(enemy, move, mode, allies, enemies, rng = Math.random) {
  const aliveAllies = allies.filter(c => c.hp > 0);

  switch (mode) {
    case 'taunted': {
      const taunter = getTauntTarget(aliveAllies);
      return { target: taunter || aliveAllies[0], targetSide: 'player' };
    }
    case 'confused': {
      const allAlive = [...allies, ...enemies].filter(c => c.hp > 0 && c !== enemy);
      if (allAlive.length === 0) return null;
      const target = allAlive[Math.floor(rng() * allAlive.length)];
      return { target, targetSide: allies.includes(target) ? 'player' : 'enemy' };
    }
    case 'smart': {
      const superEffective = aliveAllies.filter(c => getElementMultiplier(enemy.element, c.element) > 1.0);
      const pool = superEffective.length > 0 ? superEffective : aliveAllies;
      return { target: pool[Math.floor(rng() * pool.length)], targetSide: 'player' };
    }
    case 'random': {
      if (['buff', 'heal'].includes(move.category)) {
        if (move.target === 'self') return { target: enemy, targetSide: 'enemy' };
        const aliveTeam = enemies.filter(c => c.hp > 0);
        return { target: aliveTeam[Math.floor(rng() * aliveTeam.length)] || enemy, targetSide: 'enemy' };
      }
      return { target: aliveAllies[Math.floor(rng() * aliveAllies.length)], targetSide: 'player' };
    }
    default:
      return null;
  }
}

export function buildEnemyActionRecord(enemy, attackerIndex, move, target, targetSide, allies, enemies, defendActive = false, itemBuffs = null, rng = Math.random) {
  if (!enemy || enemy.hp <= 0) return null;
  if (!target || target.hp <= 0) return null;

  const targetIndex = targetSide === 'player' ? allies.indexOf(target) : enemies.indexOf(target);

  const rec = {
    attackerIndex,
    attackerId: enemy.id,
    attackerName: enemy.nameEn,
    attackerNameJp: enemy.name,
    attackerElement: enemy.element,
    ...creatureVocabFields(enemy, 'attacker'),
    attackerSkillName: move.name,
    attackerSkillReading: move.reading,
    attackerSkillEn: move.nameEn,
    moveId: move.id,
    moveName: move.name,
    moveNameEn: move.nameEn,
    moveElement: move.element,
    category: move.category,
    targetIndex,
    targetSide,
    targetId: target.id,
    targetName: target.nameEn,
    targetNameJp: target.name,
    ...creatureVocabFields(target, 'target'),
    targetElement: target.element,
    damage: 0,
    healAmount: 0,
    effectApplied: null,
    statChangesApplied: null,
    elementMultiplier: 1.0,
    targetDefeated: false
  };

  switch (move.category) {
    case 'damage':
    case 'drain': {
      const dodge = resolveDodge(enemy, target, move, targetSide === 'player' ? allies : [], rng);
      if (dodge.dodged) {
        rec.dodged = true;
        rec.hitChance = dodge.hitChance;
        rec.dodgeChance = dodge.dodgeChance;
        rec.elementMultiplier = getElementMultiplier(move.element, target.element);
        break;
      }

      const variance = rollVariance(rng);
      const stab = move.element !== 'neutral' && move.element === enemy.element;
      const stabMult = stab ? 1.5 : 1.0;
      const elemMult = getElementMultiplier(move.element, target.element);
      const typeMult = elemMult * stabMult;
      const buffedAttack = Math.floor(enemy.attack * getAttackMultiplier(enemy));
      let damage = calculateCreatureDamage({
        attackerLevel: Math.max(1, enemy.level || 1),
        attack: buffedAttack,
        defenderDefense: Math.floor((target.defense ?? 5) * getDefenseMultiplier(target)),
        power: move.power,
        typeMultiplier: typeMult,
        variance
      });
      const crit = applyCriticalDamage(enemy, move, damage, rng);
      damage = crit.damage;
      rec.critical = crit.critical;
      rec.critChance = crit.critChance;

      if (defendActive) damage = Math.floor(damage * 0.5);
      if (itemBuffs) damage = applyDamageReduction(damage, itemBuffs);

      target.hp = Math.max(0, target.hp - damage);
      if (damage > 0) breakSleep(target);

      rec.damage = damage;
      rec.elementMultiplier = elemMult;
      rec.targetDefeated = target.hp <= 0;

      if (move.category === 'drain') {
        rec.healAmount = applyHeal(enemy, Math.floor(damage * 0.5));
      }

      if (!rec.targetDefeated) {
        if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
        rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      }
      break;
    }

    case 'heal': {
      const variance = rollVariance(rng);
      rec.healAmount = applyHeal(target, Math.floor((enemy.attack / 10) * move.power * variance));
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
      rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      break;
    }

    case 'buff':
    case 'debuff': {
      if (move.statusEffect) rec.effectApplied = tryApplyStatus(move, target, enemy, enemies, rng);
      rec.statChangesApplied = tryApplyStatChanges(move, target, rng);
      break;
    }

    default:
      break;
  }

  return rec;
}

export function executeSlotMoveTurn(allies, enemies, slotIndex, choices, options = {}) {
  const {
    itemBuffs = null,
    creatureParty = null,
    metaMults = null,
    defeatedIndices = null,
    defenderItemBuffs = null,
    onAttack = null,
    rng = Math.random,
    xpRng = rng,
    awardKillXp = null,
    runPartySkills = [],
  } = options;

  const attacks = [];
  const xpEvents = [];
  const defeated = defeatedIndices || new Set();

  const creature = allies[slotIndex];
  if (!creature || creature.hp <= 0 || isIncapacitated(creature)) {
    return { attacks, xpEvents };
  }
  if (!choices?.length) {
    return { attacks, xpEvents };
  }

  for (const choice of choices) {
    if (choice.action === 'rest') {
      const mpGained = computeRestMpGain(creature);
      creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + mpGained);
      const restAtk = buildRestAttack(creature, choice.creatureIndex ?? slotIndex, mpGained);
      attacks.push(restAtk);
      if (onAttack && onAttack(restAtk) === false) break;
      continue;
    }

    const aliveEnemies = enemies.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;

    const move = (creature.moves || []).find(m => m.id === choice.moveId);
    if (!move) continue;
    if ((creature.mp || 0) < move.mpCost) continue;

    creature.mp = (creature.mp || 0) - move.mpCost;

    let stopped = false;
    const result = executeMove(
      creature,
      choice.creatureIndex,
      move,
      choice.targetIndex,
      allies,
      enemies,
      itemBuffs,
      creatureParty,
      defeated,
      metaMults,
      defenderItemBuffs,
      rng,
      awardKillXp,
      runPartySkills,
      xpRng,
    );
    for (const atk of result.attacks) {
      atk.attackerMp = creature.mp;
      atk.attackerMaxMp = creature.maxMp || 0;
      attacks.push(atk);
      if (onAttack && onAttack(atk) === false) {
        stopped = true;
        break;
      }
    }
    xpEvents.push(...result.xpEvents);
    if (stopped || creature.hp <= 0) break;
  }

  return { attacks, xpEvents };
}

function looksLikePvERoundOptions(value) {
  if (!value || typeof value !== 'object') return false;
  return typeof value.rng === 'function'
    || Object.prototype.hasOwnProperty.call(value, 'runPartySkills')
    || Object.prototype.hasOwnProperty.call(value, 'combat')
    || Object.prototype.hasOwnProperty.call(value, 'creatureParty')
    || Object.prototype.hasOwnProperty.call(value, 'metaMults')
    || Object.prototype.hasOwnProperty.call(value, 'itemBuffs');
}

export function processInterleavedPvERound(
  allies,
  enemies,
  moveChoices,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  options = {}
) {
  if (
    looksLikePvERoundOptions(itemBuffs)
    && creatureParty == null
    && metaMults == null
    && (!options || Object.keys(options).length === 0)
  ) {
    options = itemBuffs;
    itemBuffs = options.itemBuffs ?? null;
    creatureParty = options.creatureParty ?? null;
    metaMults = options.metaMults ?? null;
  }
  options = options || {};
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const xpRng = typeof options.xpRng === 'function' ? options.xpRng : rng;
  const playerAttacks = [];
  const enemyAttacks = [];
  const inlineCounters = [];
  const effectEvents = [];
  const xpEvents = [];
  const defeatedEnemyIndices = new Set();
  const pb = { n: 0 };
  const applyInlinePartySkills = Boolean(options.runPartySkills && options.combat);

  const tagPlayback = (atk, side) => {
    atk.playbackIndex = pb.n++;
    atk.combatSide = side;
  };

  if (applyInlinePartySkills) {
    options.combat.chainHitsThisTurn = 0;
    options.combat.chainSurgeTriggeredThisTurn = false;
  }

  const choicesByAlly = new Map();
  for (const choice of moveChoices || []) {
    if (typeof choice.creatureIndex !== 'number') continue;
    if (!choicesByAlly.has(choice.creatureIndex)) choicesByAlly.set(choice.creatureIndex, []);
    choicesByAlly.get(choice.creatureIndex).push(choice);
  }

  const enemyChoicesMap = new Map();
  for (let ei = 0; ei < enemies.length; ei++) {
    const enemy = enemies[ei];
    if (!enemy || enemy.hp <= 0 || isIncapacitated(enemy)) continue;
    const choice = pickEnemyMoveChoice(enemy, allies, enemies, rng);
    if (!choice) continue;
    const { move, mode } = choice;
    const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies, rng);
    if (!targeting) continue;
    const targetIndex = targeting.targetSide === 'player'
      ? allies.indexOf(targeting.target)
      : enemies.indexOf(targeting.target);
    enemyChoicesMap.set(ei, [{ creatureIndex: ei, moveId: move.id, targetIndex }]);
  }

  const initiative = [];
  for (const [allyIndex] of choicesByAlly) {
    const c = allies[allyIndex];
    if (c && c.hp > 0 && !isIncapacitated(c)) {
      initiative.push({ kind: 'ally', index: allyIndex, level: c.level || 1, dex: getEffectiveDex(c) });
    }
  }
  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei];
    if (e && e.hp > 0 && !isIncapacitated(e) && e.moves?.length > 0) {
      initiative.push({ kind: 'enemy', index: ei, level: e.level || 1, dex: getEffectiveDex(e) });
    }
  }

  initiative.sort((a, b) => {
    const dexDiff = (b.dex || 1) - (a.dex || 1);
    if (dexDiff !== 0) return dexDiff;
    const levelDiff = (b.level || 1) - (a.level || 1);
    if (levelDiff !== 0) return levelDiff;
    return rng() - 0.5;
  });

  for (const slot of initiative) {
    const isAlly = slot.kind === 'ally';
    let selfSabotageApplied = false;
    const result = executeSlotMoveTurn(
      isAlly ? allies : enemies,
      isAlly ? enemies : allies,
      slot.index,
      isAlly ? choicesByAlly.get(slot.index) : enemyChoicesMap.get(slot.index),
      {
        itemBuffs,
        creatureParty: isAlly ? creatureParty : null,
        metaMults: isAlly ? metaMults : null,
        defeatedIndices: defeatedEnemyIndices,
        defenderItemBuffs: isAlly ? null : itemBuffs,
        rng,
        xpRng,
        awardKillXp: options.awardKillXp || null,
        runPartySkills: isAlly ? (options.runPartySkills || []) : [],
        onAttack(atk) {
          tagPlayback(atk, isAlly ? 'player' : 'enemy');
          (isAlly ? playerAttacks : enemyAttacks).push(atk);

          if (!isAlly && options.runPartySkills && options.combat) {
            if (!selfSabotageApplied) {
              selfSabotageApplied = true;
              const sabotage = applyEnemySelfSabotage({
                actingIndex: atk.attackerIndex,
                enemies,
                runPartySkills: options.runPartySkills,
                rng
              });
              if (sabotage) {
                tagPlayback(sabotage, 'enemy');
                effectEvents.push(sabotage);
              }
            }

            const counter = computeInlineCounter(atk, allies, enemies, options.runPartySkills, options.combat, rng);
            if (counter) {
              tagPlayback(counter, 'player');
              playerAttacks.push(counter);
              inlineCounters.push(counter);
            }
          }

          const attacker = isAlly ? allies : enemies;
          return attacker[slot.index]?.hp > 0;
        }
      }
    );
    if (isAlly && applyInlinePartySkills && result.attacks.length > 0) {
      applyPartySkillsAfterPlayerAttacks({
        attacks: result.attacks,
        allies,
        enemies,
        runPartySkills: options.runPartySkills,
        combat: options.combat,
        resetTurnCounters: false,
        rng
      });
    }
    if (isAlly) xpEvents.push(...result.xpEvents);
  }

  if (options.runPartySkills && options.combat && inlineCounters.length > 0) {
    const active = toActivePartySkillIdSet(options.runPartySkills);
    if (active.has('afflictionBurst')) {
      checkAfflictionBurstCounter(enemies, options.combat, inlineCounters);
    }
  }

  const mpRegens = [];
  const enemyMpRegens = [];
  for (const creature of allies) {
    if (creature.hp <= 0) continue;
    const regen = Math.floor((creature.maxMp || 0) * 0.05);
    creature.mp = Math.min(creature.maxMp || 0, (creature.mp || 0) + regen);
    mpRegens.push({ creatureId: creature.id, mp: creature.mp, maxMp: creature.maxMp, regen });
  }
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const regen = Math.floor((enemy.maxMp || 0) * 0.12);
    enemy.mp = Math.min(enemy.maxMp || 0, (enemy.mp || 0) + regen);
    enemyMpRegens.push({ creatureId: enemy.id, mp: enemy.mp, maxMp: enemy.maxMp, regen, side: 'enemy' });
  }

  return {
    attacks: playerAttacks,
    playerAttacks,
    enemyAttacks,
    inlineCounters,
    effectEvents,
    allEnemiesDefeated: enemies.every(e => !e || e.hp <= 0),
    partySkillsAppliedInline: applyInlinePartySkills,
    xpEvents,
    mpRegens,
    enemyMpRegens
  };
}

export function processEnemyTurn(enemies, allies, defendActive = false, itemBuffs = null, rng = Math.random) {
  const attacks = [];
  for (let attackerIndex = 0; attackerIndex < enemies.length; attackerIndex++) {
    const enemy = enemies[attackerIndex];
    if (enemy.hp <= 0) continue;
    if (isIncapacitated(enemy)) continue;

    const aliveAllies = allies.filter(a => a.hp > 0);
    if (aliveAllies.length === 0) break;

    const choice = pickEnemyMoveChoice(enemy, allies, enemies, rng);
    if (!choice) continue;
    const { move, mode } = choice;

    for (let strike = 0; strike < 1; strike++) {
      if (enemy.hp <= 0) break;

      const currentAliveAllies = allies.filter(a => a.hp > 0);
      if (currentAliveAllies.length === 0) break;

      const targeting = pickEnemyTarget(enemy, move, mode, allies, enemies, rng);
      if (!targeting) break;

      const rec = buildEnemyActionRecord(enemy, attackerIndex, move, targeting.target, targeting.targetSide, allies, enemies, defendActive, itemBuffs, rng);
      if (rec) attacks.push(rec);
    }
  }

  const enemyMpRegens = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const regen = Math.floor((enemy.maxMp || 0) * 0.12);
    enemy.mp = Math.min(enemy.maxMp || 0, (enemy.mp || 0) + regen);
    enemyMpRegens.push({ creatureId: enemy.id, mp: enemy.mp, maxMp: enemy.maxMp, regen, side: 'enemy' });
  }

  return { attacks, allAlliesDefeated: allies.every(a => a.hp <= 0), enemyMpRegens };
}

export function resolveActorMiniRound(actor, cursor) {
  if (!actor) {
    return { effectEvents: [], mpRegens: [] };
  }

  const effectEvents = tickEffects(actor).map(event => ({
    ...event,
    targetSide: cursor.side,
    targetIndex: cursor.index
  }));

  const maxMp = actor.maxMp || 0;
  const regenRate = cursor.side === 'enemy' || cursor.side === 'sideB' ? 0.12 : 0.05;
  const regen = actor.hp > 0 ? Math.floor(maxMp * regenRate) : 0;
  if (regen > 0) {
    actor.mp = Math.min(maxMp, (actor.mp || 0) + regen);
  }

  const mpRegens = actor.hp > 0
    ? [{
        creatureId: actor.id,
        mp: actor.mp || 0,
        maxMp,
        regen,
        side: cursor.side,
        index: cursor.index
      }]
    : [];

  return { effectEvents, mpRegens };
}

export function resolveSingleActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  choices = [],
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  runPartySkills = null,
  combat = null,
  playbackStart = 0,
  rng = Math.random,
  xpRng = rng,
  awardKillXp = null
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList[actorIndex];
  const inlineCounters = [];
  let playbackIndex = playbackStart;

  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false
  };

  if (!actor || actor.hp <= 0) {
    segment.skipped = true;
    return { actionSegments: [segment], inlineCounters, xpEvents: [], playbackNext: playbackIndex };
  }

  if (combat && runPartySkills) {
    combat.chainHitsThisTurn = 0;
    combat.chainSurgeTriggeredThisTurn = false;
  }

  let selfSabotageApplied = false;
  const slotResult = executeSlotMoveTurn(actorList, defenderList, actorIndex, choices, {
    itemBuffs: isAlly ? itemBuffs : null,
    creatureParty: isAlly ? creatureParty : null,
    metaMults: isAlly ? metaMults : null,
    defenderItemBuffs: isAlly ? null : itemBuffs,
    defeatedIndices: new Set(),
    rng,
    xpRng,
    awardKillXp,
    runPartySkills: isAlly ? (runPartySkills || []) : [],
    onAttack(atk) {
      atk.playbackIndex = playbackIndex++;
      atk.combatSide = isAlly ? 'player' : 'enemy';
      segment.attacks.push(atk);

      if (!isAlly && runPartySkills && combat) {
        if (!selfSabotageApplied) {
          selfSabotageApplied = true;
          const sabotage = applyEnemySelfSabotage({
            actingIndex: atk.attackerIndex,
            enemies: actorList,
            runPartySkills,
            rng
          });
          if (sabotage) {
            sabotage.playbackIndex = playbackIndex++;
            sabotage.combatSide = 'enemy';
            segment.effectEvents.push(sabotage);
          }
        }

        const counter = computeInlineCounter(atk, allies, enemies, runPartySkills, combat, rng);
        if (counter) {
          counter.playbackIndex = playbackIndex++;
          counter.combatSide = 'player';
          segment.counterAttacks.push(counter);
          inlineCounters.push(counter);
        }
      }

      return actorList[actorIndex]?.hp > 0;
    }
  });

  segment.xpEvents.push(...(slotResult.xpEvents || []));

  if (isAlly && runPartySkills && combat && slotResult.attacks.length > 0) {
    applyPartySkillsAfterPlayerAttacks({
      attacks: slotResult.attacks,
      allies,
      enemies,
      runPartySkills,
      combat,
      resetTurnCounters: false,
      rng
    });
  }

  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);

  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: segment.counterAttacks,
    inlineCounters,
    xpEvents: segment.xpEvents,
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackIndex
  };
}

export function resolveSyntheticActorAction({
  actorSide,
  actorIndex,
  allies,
  enemies,
  syntheticMove,
  targetIndex,
  itemBuffs = null,
  creatureParty = null,
  metaMults = null,
  runPartySkills = [],
  awardKillXp = null,
  playbackStart = 0,
  rng = Math.random,
  xpRng = rng,
}) {
  const isAlly = actorSide === 'ally' || actorSide === 'sideA';
  const actorList = isAlly ? allies : enemies;
  const defenderList = isAlly ? enemies : allies;
  const actor = actorList?.[actorIndex];
  let playbackIndex = playbackStart;
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: false,
    synthetic: true,
  };

  if (!actor || actor.hp <= 0 || isIncapacitated(actor)) {
    segment.skipped = true;
    return { actionSegments: [segment], attacks: [], xpEvents: [], playbackNext: playbackIndex };
  }

  const move = {
    category: 'damage',
    target: 'single_enemy',
    mpCost: 0,
    ...syntheticMove,
  };
  const result = executeMove(
    actor,
    actorIndex,
    move,
    targetIndex,
    actorList,
    defenderList,
    isAlly ? itemBuffs : null,
    isAlly ? creatureParty : null,
    new Set(),
    isAlly ? metaMults : null,
    isAlly ? null : itemBuffs,
    rng,
    awardKillXp,
    isAlly ? (runPartySkills || []) : [],
    xpRng,
  );

  for (const atk of result.attacks) {
    atk.playbackIndex = playbackIndex++;
    atk.combatSide = isAlly ? 'player' : 'enemy';
    atk.synthetic = true;
    segment.attacks.push(atk);
  }
  segment.xpEvents.push(...(result.xpEvents || []));
  const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
  segment.effectEvents.push(...miniRound.effectEvents);
  segment.mpRegens.push(...miniRound.mpRegens);

  return {
    actionSegments: [segment],
    attacks: segment.attacks,
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: segment.xpEvents,
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackIndex,
  };
}

export function resolveNoopActorAction({ actorSide, actorIndex, allies, enemies, playbackStart = 0 }) {
  const actor = actorSide === 'ally' || actorSide === 'sideA'
    ? allies?.[actorIndex]
    : enemies?.[actorIndex];
  const segment = {
    actor: { side: actorSide, index: actorIndex, id: actor?.id || null },
    attacks: [],
    counterAttacks: [],
    effectEvents: [],
    mpRegens: [],
    xpEvents: [],
    skipped: !actor || actor.hp <= 0 || isIncapacitated(actor),
    noop: true,
  };

  if (!segment.skipped) {
    const miniRound = resolveActorMiniRound(actor, { side: actorSide, index: actorIndex });
    segment.effectEvents.push(...miniRound.effectEvents);
    segment.mpRegens.push(...miniRound.mpRegens);
  }

  return {
    actionSegments: [segment],
    attacks: [],
    counterAttacks: [],
    inlineCounters: [],
    xpEvents: [],
    effectEvents: segment.effectEvents,
    mpRegens: segment.mpRegens,
    playbackNext: playbackStart,
  };
}
