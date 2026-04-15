/**
 * combat-vfx.js — Visual effects, HP helpers, and shared combat animation functions.
 *
 * Extracted from combat-loop.js as part of the strangler-fig decomposition.
 * Pure pixi / DOM functions import their deps directly.  Functions that need
 * coordinator state (getGameState, delay, characterUI, …) read from `ctx`,
 * which is set once via `init(deps)`.
 */

// ── static imports (pixi, audio, DOM helpers) ──────────────────────────
import { playSFX } from '../audio.js';
import {
  screenShake, screenFlash, hitStop, recoil as pixiRecoil,
  lunge as pixiLunge, burstParticles, flowParticles,
  ELEMENT_COLORS
} from '../pixi/effects.js';
import { fireElementBlast } from '../pixi/element-blasts.js';
import {
  showDamageNumber as pixiDamageNumber, popupBuff, popupDebuff, popupSkillProc,
  showHealPopup, showPoisonTick
} from '../pixi/text.js';
import { showBanner } from '../pixi/banners.js';
import { playStatusApplied, clearStatusVfx } from '../pixi/status-vfx.js';
import {
  getCreatureSprite, animateKO, syncPixiStatusLabels
} from '../pixi/formation.js';
import { showFormation } from './scene.js';
import { getDamageTier, TIER_EFFECTS, TIER_RECOIL } from '../pixi/combat-effects-util.js';
import { wait } from '../pixi/tween.js';
import { hapticDamageTier } from '../native/index.js';
import { playAttackSound } from './combat-audio.js';
import { creatureStaticPath } from './sprite-utils.js';
import { t } from './i18n.js';
import { getHpColor, SC_NAMES, getCreatureStatusKeys } from './combat-ui-utils.js';
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
} from './attack-card.js';

// ── coordinator context (set via init) ─────────────────────────────────
let ctx = null;

/**
 * Initialise with coordinator-owned callbacks / state accessors.
 *
 * @param {Object} deps
 * @param {Function} deps.getGameState
 * @param {Function} deps.delay          - async ms sleep
 * @param {Object}  deps.characterUI     - { updateEnemyHPAtIndex, updateEnemyHPBar, … }
 * @param {Function} deps.animatePlayerHurt
 * @param {Function} deps.showDamageNumber
 * @param {Function} deps.showAttackDisplay - passed to break the circular dep
 */
export function init(deps) {
  ctx = deps;
}

// ── constants ──────────────────────────────────────────────────────────

export const BUFF_EFFECTS = new Set(['haste', 'shield', 'team_shield']);
export const DEBUFF_EFFECTS = new Set(['poison', 'sleep', 'stun', 'confuse', 'taunt']);

export const STATUS_EFFECT_LABELS = {
  poison: 'Poisoned!',
  sleep: 'Sleep!',
  stun: 'Stunned!',
  confuse: 'Confused!',
  haste: 'Haste!',
  shield: 'Shield!',
  team_shield: 'Shield!',
  taunt: 'Taunt!'
};

// ── pixi adapter functions (no ctx needed) ─────────────────────────────

export function spritePos(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return { x: 0, y: 0 };
  return { x: sprite.x, y: sprite.y };
}

const effectDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * PixiJS replacement for the old DOM-based impactEnemyEffect.
 * Fires tiered hit-stop, particles, shake, flash, damage number, and recoil.
 */
export async function impactEffect(damage, targetSide, targetIndex, enemyMaxHp, element = 'neutral', effectivenessType = 'normal', onImpact) {
  const tier = getDamageTier(damage, enemyMaxHp);
  const effects = TIER_EFFECTS[tier];
  const pos = spritePos(targetSide, targetIndex);
  const sprite = getCreatureSprite(targetSide, targetIndex);
  const elemColor = ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral;
  hapticDamageTier(tier);

  if (effects.hitStop > 0) await hitStop(effects.hitStop);

  if (effects.shake !== 'none') {
    screenShake(effects.shake);
    if (tier === 4) { await wait(100); screenShake('medium'); }
  }

  if (effects.flash === 'element') {
    screenFlash({ color: elemColor, duration: 100 });
  } else if (effects.flash === 'both') {
    screenFlash({ color: elemColor, duration: 80 });
    await wait(50);
    screenFlash({ color: 0xFFFFFF, duration: 100 });
  } else if (effects.flash === 'screen2x') {
    screenFlash({ color: 0xFFFFFF, duration: 80, count: 2 });
  }

  pixiDamageNumber(damage, pos, { tier, type: effectivenessType });
  if (onImpact) onImpact();

  if (sprite) {
    const recoilDir = targetSide === 'enemy' ? 'right' : 'left';
    pixiRecoil(sprite, { distance: TIER_RECOIL[tier], direction: recoilDir });
  }
}

/**
 * PixiJS replacement for DOM fireCreatureAttackEffect.
 * Lunges the attacker, then impacts the target.
 */
export async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal', onImpact) {
  const attackerSprite = getCreatureSprite('player', attackerIndex);
  const fromPos = spritePos('player', attackerIndex);
  const toPos = spritePos('enemy', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: 20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'enemy', targetIndex, enemyMaxHp, element, effectivenessType, onImpact);
  });
  await Promise.all([lungeP, blastP]);
}

/**
 * PixiJS replacement for DOM enemyCreatureAttackEffect.
 * Lunges the enemy attacker, then impacts the player target.
 */
export async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0, effectivenessType = 'normal', onImpact) {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);
  const fromPos = spritePos('enemy', attackerIndex);
  const toPos = spritePos('player', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: -20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
  });
  await Promise.all([lungeP, blastP]);
}

// ── slot-finding + HP helpers ──────────────────────────────────────────

/**
 * Find a creature slot element by creature ID (matches against game state).
 * @param {string} creatureId - The creature's ID
 * @param {number|null} allyIndex - Optional direct index
 * @returns {Element|null} The .formation-slot DOM element, or null
 */
export function findCreatureSlotByAttackerId(creatureId, allyIndex = null) {
  const state = ctx.getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return null;

  let index = -1;
  if (typeof allyIndex === 'number' && allyIndex >= 0 && allyIndex < activeCreatures.length) {
    index = allyIndex;
  } else if (creatureId) {
    index = activeCreatures.findIndex(r => r && r.id === creatureId);
  }
  if (index < 0) return null;

  const slots = document.querySelectorAll('#player-formation .formation-slot');
  return slots[index] || null;
}

/**
 * Find the enemy slot element for a specific target in formation-based combat.
 * Falls back to npc-display or the whole enemy-formation container.
 */
export function findEnemyTargetElement(targetId, enemies, enemyIndex = null) {
  const slot = document.querySelector(`#enemy-formation .formation-slot[data-index="${enemyIndex}"]`);
  if (slot) return slot;
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay && npcDisplay.classList.contains('visible')) return npcDisplay;
  return document.getElementById('enemy-formation');
}

/**
 * Directly update creature HP bar widths in the DOM without triggering full updateUI.
 * @param {Array} creatures - The creature party active array (with final HP from server)
 * @param {Object} allyHpMap - Map of creatureId -> { hp, maxHp } with running HP values
 */
export function updateCreatureHpBars(creatures, allyHpMap) {
  if (!creatures) return;
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  creatures.forEach((creature, i) => {
    const slot = slots[i];
    if (!slot || !creature) return;
    const currentHp = allyHpMap?.[creature.id] ? allyHpMap[creature.id].hp : creature.hp;
    const hpPct = Math.max(0, (currentHp / creature.maxHp) * 100);
    const fill = slot.querySelector('.formation-hp-fill');
    if (fill) {
      fill.style.width = `${hpPct}%`;
      fill.style.backgroundColor = getHpColor(hpPct);
    }
    // Update KO state (DOM + Pixi)
    const icon = slot.querySelector('.formation-sprite');
    if (icon) {
      if (currentHp <= 0) {
        icon.classList.add('ko');
      } else {
        icon.classList.remove('ko');
      }
    }
    const pixiSprite = getCreatureSprite('player', i);
    if (pixiSprite) {
      if (currentHp <= 0) {
        pixiSprite.alpha = 0.3;
        pixiSprite.tint = 0x888888;
      } else {
        pixiSprite.alpha = 1;
        pixiSprite.tint = 0xFFFFFF;
      }
    }
    // Update MP bar
    const mpFill = slot.querySelector('.formation-mp-fill');
    const mpText = slot.querySelector('.formation-mp-text');
    if (mpFill && creature.maxMp > 0) {
      const curMp = creature.currentMp ?? creature.mp ?? 0;
      const mpPct = Math.max(0, (curMp / creature.maxMp) * 100);
      mpFill.style.width = `${mpPct}%`;
      if (mpText) mpText.textContent = `${curMp}/${creature.maxMp}`;
    }
  });
}

/**
 * Show enemy damage to player in big red text in the action area.
 */
export function showEnemyDamageDisplay(enemyAttack) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  if (enemyAttack.perfectDodge) {
    actionArea.innerHTML = `<div class="combat-enemy-damage dodge">${t('perfectDodge')}</div>`;
  } else if (enemyAttack.dodged) {
    actionArea.innerHTML = `<div class="combat-enemy-damage dodge">${t('dodged')}</div>`;
  } else if (enemyAttack.miss) {
    actionArea.innerHTML = `<div class="combat-enemy-damage miss">${t('miss')}</div>`;
  } else {
    const crit = enemyAttack.critical ? `<div class="combat-enemy-crit">${t('critical')}</div>` : '';
    actionArea.innerHTML = `<div class="combat-enemy-damage">${crit}<span class="enemy-damage-number">-${enemyAttack.damage}</span></div>`;
  }
}

// ── shared creature combat helpers ─────────────────────────────────────

/** Show a floating text label above a target element (for status effects). */
export function showFloatingText(targetEl, text) {
  const rect = targetEl.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'floating-effect-text';
  popup.innerHTML = text;
  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top}px`;
  document.body.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove());
}

/**
 * Show status effect events from start-of-round effect processing.
 * Handles poison ticks with damage animation AND all other status effects.
 */
export async function showEffectEvents(result) {
  if (!result.effectEvents?.length) return;
  const affectedCreatures = new Set();
  for (const event of result.effectEvents) {
    const side = event.targetSide === 'ally' ? 'player' : 'enemy';
    const index = typeof event.targetIndex === 'number' ? event.targetIndex : 0;
    affectedCreatures.add(`${side}:${index}`);

    if (event.type === 'poison' && event.damage > 0) {
      const pos = spritePos(side, index);
      burstParticles(pos, { count: 4, color: 0x9C27B0, speed: 40, life: 300, element: 'neutral' });
      showPoisonTick(event.damage, pos);
      playStatusApplied(side, index, 'poison');
      if (event.remainingTurns === 0) {
        clearStatusVfx(side, index, 'poison');
      }
    } else if (event.type !== 'poison') {
      const EFFECT_LABELS = {
        confuse: t('effectConfuse'),
        stun: t('effectStun'),
        sleep: t('effectSleep'),
        haste: t('effectHaste'),
        shield: t('effectShield'),
        team_shield: t('effectShield'),
        taunt: 'Taunt'
      };
      const baseType = event.type.replace(/_tick$/, '');
      const label = EFFECT_LABELS[baseType] || event.type;
      const pos = spritePos(side, index);
      const BUFF_TYPES = new Set(['haste', 'shield', 'team_shield']);
      const DEBUFF_TYPES = new Set(['confuse', 'stun', 'sleep', 'taunt']);
      if (DEBUFF_TYPES.has(baseType)) {
        popupDebuff(label, pos);
        playStatusApplied(side, index, baseType);
      } else if (BUFF_TYPES.has(baseType)) {
        popupBuff(label, pos);
        playStatusApplied(side, index, baseType);
      } else {
        showFloatingText(document.body, label);
      }
      if (event.remainingTurns === 0) {
        clearStatusVfx(side, index, baseType);
      }
      await ctx.delay(400);
    }
  }
  // Only sync pills for creatures that had effect events
  for (const key of affectedCreatures) {
    const [side, idx] = key.split(':');
    syncStatusForCreature(result, side, Number(idx));
  }
}

export function syncStatusIconsFromResult(result) {
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const keys = getCreatureStatusKeys(ally);
      syncPixiStatusLabels('player', i, keys, ally.statStages);
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const keys = getCreatureStatusKeys(enemy);
      syncPixiStatusLabels('enemy', i, keys, enemy.statStages);
    });
  }
}

function syncStatusForCreature(result, side, index) {
  const creatures = side === 'player' ? result.allies : result.enemies;
  const creature = creatures?.[index];
  if (!creature) return;
  const keys = getCreatureStatusKeys(creature);
  syncPixiStatusLabels(side, index, keys, creature.statStages);
}

/**
 * Show VFX + popup + pill sync when a move applies an effect or stat changes.
 * Called after each individual attack animation so indicators appear in real time.
 */
export async function showMoveEffectsApplied(atk, targetSide, targetIndex, result) {
  const pos = spritePos(targetSide, targetIndex);
  let shown = false;

  if (atk.effectApplied) {
    const effect = atk.effectApplied;
    if (DEBUFF_EFFECTS.has(effect)) {
      popupDebuff(STATUS_EFFECT_LABELS[effect] || effect, pos);
      playStatusApplied(targetSide, targetIndex, effect);
    } else if (BUFF_EFFECTS.has(effect)) {
      popupBuff(STATUS_EFFECT_LABELS[effect] || effect, pos);
      playStatusApplied(targetSide, targetIndex, effect);
    }
    shown = true;
  }

  if (atk.statChangesApplied) {
    for (const [stat, change] of Object.entries(atk.statChangesApplied)) {
      if (change === 0) continue;
      const dir = change > 0 ? `+${change}` : `${change}`;
      const text = `${SC_NAMES[stat] || stat} ${dir}`;
      if (change > 0) popupBuff(text, pos);
      else popupDebuff(text, pos);
    }
    shown = true;
  }

  if (shown) {
    syncStatusForCreature(result, targetSide, targetIndex);
    await ctx.delay(300);
  }
}

/**
 * Party-skill proc visuals shared by attack-display and inline move-turn playback.
 * Callers supply resolveAllies/resolveEnemies and indices so PvP overrides stay correct.
 */
export async function showAttackPartySkillProcs(atk, {
  sourceSide,
  attackerIndex,
  targetSide,
  targetIndex,
  element,
  resolveAllies,
  resolveEnemies
}) {
  if (!atk.partySkillProcs?.length) return;

  for (const proc of atk.partySkillProcs) {
    let detail = '';
    if (proc.type === 'bonusDamage') detail = ` +${proc.bonusDamage}`;
    else if (proc.type === 'healAll') detail = ` +${proc.healAmount} HP`;

    const attackerPos = spritePos(sourceSide, attackerIndex);
    popupSkillProc(`${proc.skillName}!${detail}`, attackerPos);

    if (proc.type === 'bonusDamage') {
      burstParticles(spritePos(targetSide, targetIndex), { count: 6, color: 0xFFB74D });
    } else if (proc.type === 'healAll') {
      resolveAllies().forEach((ally, i) => {
        if (ally && ally.hp > 0) {
          const pos = spritePos('player', i);
          burstParticles(pos, { count: 6, color: 0x4CAF50, speed: 50, life: 400, element: 'wood' });
          showHealPopup(proc.healAmount, pos);
        }
      });
    } else if (proc.type === 'haste') {
      burstParticles(attackerPos, { count: 8, color: 0x4FC3F7 });
    } else if (proc.type === 'teamShield') {
      resolveAllies().forEach((ally, i) => {
        if (ally && ally.hp > 0) {
          burstParticles(spritePos('player', i), { count: 6, color: 0x42A5F5 });
        }
      });
    } else if (proc.type === 'chainHit') {
      const chainFrom = spritePos('enemy', proc.sourceIndex ?? atk.targetIndex);
      const chainTo = spritePos('enemy', proc.targetIndex);
      const chainElement = proc.element || element;
      await fireElementBlast(chainFrom, chainTo, chainElement, () => {
        pixiDamageNumber(proc.damage, chainTo, { tier: 1 });
        screenShake('light');
      });
    } else if (proc.type === 'stageChange') {
      const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
      const text = `${SC_NAMES[proc.stat] || proc.stat} ${dir}`;
      const pos = spritePos(proc.targetSide === 'enemy' ? 'enemy' : 'player', proc.targetIndex);
      if (proc.delta > 0) popupBuff(text, pos);
      else popupDebuff(text, pos);
    } else if (proc.type === 'spread') {
      const pos = spritePos('enemy', proc.targetIndex);
      popupSkillProc('SPREAD!', pos);
      burstParticles(pos, { count: 4, color: 0x9C27B0 });
    } else if (proc.type === 'teamBuff') {
      resolveAllies().forEach((ally, i) => {
        if (ally) popupBuff(`${SC_NAMES[proc.stat] || proc.stat} +${proc.delta}`, spritePos('player', i));
      });
    } else if (proc.type === 'burst') {
      const pos = spritePos('enemy', proc.targetIndex);
      popupSkillProc('AFFLICTION BURST!', pos);
      pixiDamageNumber(proc.damage, pos, { tier: 1 });
      burstParticles(pos, { count: 10, color: 0xE91E63 });
    } else if (proc.type === 'pandemic') {
      resolveEnemies().forEach((enemy, i) => {
        if (enemy && enemy.hp > 0) {
          const pos = spritePos('enemy', i);
          popupSkillProc('PANDEMIC!', pos);
          burstParticles(pos, { count: 6, color: 0x9C27B0 });
        }
      });
    }

    await effectDelay(600);
  }
}

/**
 * Show party skill proc visuals inline after a player attack.
 */
export async function showPartySkillProcs(atk) {
  const state = ctx.getGameState();
  const activeCreatures = state.run?.creatureParty?.active || [];
  const attackerIndex = atk.attackerId
    ? activeCreatures.findIndex(r => r && r.id === atk.attackerId)
    : 0;
  const safeAttackerIndex = Math.max(0, attackerIndex);
  const targetIndex = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;

  await showAttackPartySkillProcs(atk, {
    sourceSide: 'player',
    attackerIndex: safeAttackerIndex,
    targetSide: 'enemy',
    targetIndex,
    element: 'neutral',
    resolveAllies: () => state.combat?.allies || activeCreatures,
    resolveEnemies: () => state.combat?.enemies || []
  });
}

/**
 * Show round-start skill events (Erosion, Momentum, Overflow Vitality).
 */
export async function showRoundStartEvents(result) {
  if (!result.roundStartEvents?.length) return;

  for (const event of result.roundStartEvents) {
    if (event.type === 'erosion') {
      const pos = spritePos('enemy', event.targetIndex);
      const text = `${SC_NAMES[event.stat] || event.stat} ${event.delta}`;
      popupDebuff(text, pos);
      burstParticles(pos, { count: 3, color: 0xFF5722 });
      syncStatusForCreature(result, 'enemy', event.targetIndex);
    } else if (event.type === 'momentum') {
      const pos = spritePos('player', event.targetIndex);
      const text = `${SC_NAMES[event.stat] || event.stat} +${event.delta}`;
      popupBuff(text, pos);
      burstParticles(pos, { count: 3, color: 0x4CAF50 });
      syncStatusForCreature(result, 'player', event.targetIndex);
    } else if (event.type === 'overflowVitality') {
      const pos = spritePos('player', event.targetIndex);
      burstParticles(pos, { count: 6, color: 0x4CAF50, speed: 50, life: 400, element: 'wood' });
      showHealPopup(event.healAmount, pos);
    }
    await effectDelay(400);
  }
}

/**
 * Show a single counter attack animation (used inline in initiative playback).
 */
export async function showOneCounterAttackAnimated(counter, enemyHpMap, enemies) {
  const defenderPos = spritePos('player', counter.defenderIndex);
  popupSkillProc('COUNTER!', defenderPos);

  if (counter.damage > 0) {
    const targetMaxHp = enemyHpMap?.[counter.targetIndex]?.maxHp || 100;
    await fireCreatureAttackEffect(counter.defenderIndex, counter.targetIndex, 'neutral', counter.damage, targetMaxHp, 'normal', () => {
      if (enemyHpMap?.[counter.targetIndex]) {
        enemyHpMap[counter.targetIndex].hp = Math.max(0, enemyHpMap[counter.targetIndex].hp - counter.damage);
        const entry = enemyHpMap[counter.targetIndex];
        if (Object.keys(enemyHpMap).length > 1) {
          ctx.characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
        } else {
          ctx.characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
        }
      }
    });
  }

  if (counter.procs?.length) {
    const combatState = ctx.getGameState();
    const enemyList = enemies || combatState?.combat?.enemies || [];
    for (const proc of counter.procs) {
      if (proc.type === 'stageChange') {
        const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
        const text = `${SC_NAMES[proc.stat] || proc.stat} ${dir}`;
        const side = proc.targetSide === 'enemy' ? 'enemy' : 'player';
        const pos = spritePos(side, proc.targetIndex);
        if (proc.delta > 0) popupBuff(text, pos);
        else popupDebuff(text, pos);
      } else if (proc.type === 'spread') {
        const pos = spritePos('enemy', proc.targetIndex);
        popupSkillProc('SPREAD!', pos);
        burstParticles(pos, { count: 4, color: 0x9C27B0 });
      } else if (proc.type === 'pandemic') {
        enemyList.forEach((enemy, i) => {
          if (enemy && enemy.hp > 0) {
            const pos = spritePos('enemy', i);
            popupSkillProc('PANDEMIC!', pos);
            burstParticles(pos, { count: 6, color: 0x9C27B0 });
          }
        });
      } else if (proc.type === 'burst') {
        const pos = spritePos('enemy', proc.targetIndex);
        popupSkillProc('AFFLICTION BURST!', pos);
        pixiDamageNumber(proc.damage, pos, { tier: 1 });
        burstParticles(pos, { count: 10, color: 0xE91E63 });
      }
    }
  }

  await effectDelay(600);
}

/**
 * Show counter attack animations after enemy attacks.
 */
export async function showCounterAttacks(result, enemyHpMap) {
  if (!result.counterAttacks?.length) return;
  for (const counter of result.counterAttacks) {
    await showOneCounterAttackAnimated(counter, enemyHpMap, result.enemies);
  }
}

/**
 * Build a map of ally HP before enemy attacks for progressive DOM updates.
 * Reconstructs pre-enemy-attack HP by adding back damage dealt to each ally.
 */
export function buildAllyHpMap(result) {
  const allyHpMap = {};
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const dmgToThisAlly = (result.enemyAttacks || [])
        .filter(a => (typeof a.targetIndex === 'number' ? a.targetIndex === i : a.targetId === ally.id))
        .reduce((sum, a) => sum + a.damage, 0);
      allyHpMap[ally.id] = { hp: ally.hp + dmgToThisAlly, maxHp: ally.maxHp };
    });
  }
  return allyHpMap;
}

/** Pre-player-attack enemy HP for animating bars — keyed by enemy slot index (not template id). */
export function buildEnemyHpMapForPlayerAttacks(result) {
  const map = {};
  const enemies = result.enemies || [];
  const attacks = result.playerAttacks || [];
  enemies.forEach((enemy, i) => {
    if (!enemy) return;
    const dmgToThisEnemy = attacks
      .filter(a => (typeof a.targetIndex === 'number' ? a.targetIndex === i : a.targetId === enemy.id))
      .reduce((sum, a) => sum + (a.damage || 0), 0);
    map[i] = {
      hp: Math.min(enemy.hp + dmgToThisEnemy, enemy.maxHp),
      maxHp: enemy.maxHp,
      index: i
    };
  });
  return map;
}

/**
 * Player + enemy attacks in server initiative order (playbackIndex). If absent, player phase then enemy.
 * @returns {Array<{ side: 'player'|'enemy', atk: object }>}
 */
export function buildMergedInitiativeAttacks(result) {
  const player = (result.playerAttacks || []).map(atk => ({ side: 'player', atk }));
  const enemy = (result.enemyAttacks || []).map(atk => ({ side: 'enemy', atk }));
  const combined = [...player, ...enemy];
  if (combined.length === 0) return [];
  if (combined.some(x => typeof x.atk.playbackIndex === 'number')) {
    combined.sort((a, b) => (a.atk.playbackIndex ?? 0) - (b.atk.playbackIndex ?? 0));
  }
  return combined;
}

/**
 * One enemy strike animation (used by full enemy phase and initiative merge).
 */
export async function showOneEnemyAttackAnimated(result, atk, allyHpMap, halved) {
  const effectKey = halved ? 'dealsHalved' :
    atk.elementMultiplier > 1 ? 'dealsStrong' :
    atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
  let attackCard = null;
  if (atk.attackerNameJp) {
    attackCard = insertAttackCard(atk, true);
  } else {
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-creature-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
    }
  }

  playSFX('player-hit');

  const attackerIdx = typeof atk.attackerIndex === 'number' ? atk.attackerIndex : 0;
  const targetIdx = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;
  const targetMaxHp = result.allies?.[targetIdx]?.maxHp || 100;
  const enemyEffectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';
  const hpUpdate = () => {
    const damagedAlly = typeof atk.targetIndex === 'number' ? result.allies?.[atk.targetIndex] : null;
    const hpMapKey = damagedAlly?.id ?? atk.targetId;
    if (hpMapKey && allyHpMap[hpMapKey]) {
      allyHpMap[hpMapKey].hp = Math.max(0, allyHpMap[hpMapKey].hp - atk.damage);
    }
    updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
  };
  if (atk.attackerElement) {
    playAttackSound(atk.attackerElement);
    await enemyCreatureAttackEffect(attackerIdx, targetIdx, atk.attackerElement, atk.damage, targetMaxHp, enemyEffectivenessType, hpUpdate);
  } else {
    ctx.animatePlayerHurt();
    hpUpdate();
  }

  const element = atk.attackerElement || atk.moveElement || 'neutral';
  if (atk.elementMultiplier > 1) {
    setTimeout(() => showBanner('Super Effective!', 'super', { elementColor: ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral }), 400);
  } else if (atk.elementMultiplier < 1) {
    setTimeout(() => showBanner('Resisted...', 'weak'), 400);
  }

  // Real-time buff/debuff indicators for enemy-applied effects
  if (atk.effectApplied || atk.statChangesApplied) {
    await showMoveEffectsApplied(atk, 'player', targetIdx, result);
  }

  if (attackCard) {
    await waitForCardTap(attackCard);
  } else {
    await ctx.delay(400);
  }
}

/**
 * Animate enemy attacks against player creatures with real-time HP bar updates.
 */
export async function showEnemyAttacksAnimated(result, allyHpMap, halved) {
  if (!result.enemyAttacks?.length) return;
  for (const atk of result.enemyAttacks) {
    await showOneEnemyAttackAnimated(result, atk, allyHpMap, halved);
  }
  syncStatusIconsFromResult(result);
}

/**
 * Show NPC skill attack cards sequentially (one per target).
 * Each card is a vocab review opportunity showing NPC base word + skill name + target.
 */
export async function showNpcSkillAttacksAnimated(result, allyHpMap) {
  if (!result.npcSkillAttacks?.length) return;

  for (const atk of result.npcSkillAttacks) {
    let attackCard = null;

    attackCard = insertNpcAttackCard(atk);

    // Sound + visual effects for damage
    if (atk.damage > 0) {
      playSFX('player-hit');
      ctx.showDamageNumber(atk.damage, true, false);
      ctx.animatePlayerHurt();
    }

    // Update ally HP after NPC damage
    if (atk.damage > 0 && allyHpMap && allyHpMap[atk.targetId]) {
      allyHpMap[atk.targetId].hp = Math.max(0, allyHpMap[atk.targetId].hp - atk.damage);
      updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
    }

    if (attackCard) {
      await waitForCardTap(attackCard);
    } else {
      await ctx.delay(800);
    }
  }
}

/**
 * Show KO swap messages with death/swap-in animations.
 */
export async function showKoSwapAnimations(result) {
  if (!result.koSwaps?.length && !result.koRemovals?.length) return;

  // Swaps: dead creature replaced by reserve
  for (const swap of (result.koSwaps || [])) {
    const koIndex = swap.slot ?? -1;
    if (koIndex >= 0) {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const dyingSlot = slots[koIndex];
      if (dyingSlot) {
        dyingSlot.classList.add('creature-dying');
      }
      animateKO('player', koIndex);
      await ctx.delay(600);
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${t('swapsIn', swap.replacement)}</div>`;
    }

    // Update sprite and HP for the new creature with swap-in animation
    if (result.creatureParty?.active && koIndex >= 0) {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const swapSlot = slots[koIndex];
      if (swapSlot) {
        swapSlot.classList.remove('creature-dying');
        swapSlot.classList.add('creature-swapping-in');
        const newCreature = result.creatureParty.active[koIndex];
        if (newCreature) {
          const icon = swapSlot.querySelector('.formation-sprite img');
          if (icon) {
            icon.src = creatureStaticPath(newCreature.id);
            icon.alt = newCreature.baseWord || newCreature.name || '';
          }
          const hpFill = swapSlot.querySelector('.formation-hp-fill');
          if (hpFill) {
            const pct = Math.max(0, (newCreature.hp / newCreature.maxHp) * 100);
            hpFill.style.width = `${pct}%`;
            hpFill.style.backgroundColor = getHpColor(pct);
          }
          const koIcon = swapSlot.querySelector('.formation-sprite');
          if (koIcon) koIcon.classList.remove('ko');
        }
        setTimeout(() => swapSlot.classList.remove('creature-swapping-in'), 500);
      }
    }
    await ctx.delay(800);
  }

  // Removals: dead creature with no reserve — permanently gone
  if (result.koRemovals?.length) {
    for (const removal of result.koRemovals) {
      const koIndex = removal.slot ?? -1;
      if (koIndex >= 0) {
        const slots = document.querySelectorAll('#player-formation .formation-slot');
        const dyingSlot = slots[koIndex];
        if (dyingSlot) {
          dyingSlot.classList.add('creature-dying');
        }
        animateKO('player', koIndex);
      }

      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #ff5252;">${t('wasDefeated', removal.name)}</div>`;
      }
      await ctx.delay(800);
    }

    // Re-render formation with surviving creatures
    if (result.creatureParty?.active) {
      await showFormation('player', result.creatureParty.active, { force: true });
    }
  }
}
