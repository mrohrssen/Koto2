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
import { playStatusAppliedForScene, clearStatusVfxForScene } from '../pixi/status-vfx.js';
import {
  getCreatureSpriteForScene, animateKOForScene, syncPixiStatusLabelsForScene
} from '../pixi/formation.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { SceneDisposedError } from '../scenes/scene-errors.js';
import { showFormation } from './combat-dom.js';
import { getDamageTier, TIER_EFFECTS, TIER_RECOIL } from '../pixi/combat-effects-util.js';
import { wait } from '../pixi/tween.js';
import { hapticDamageTier } from '../native/index.js';
import { playAttackSound } from './combat-audio.js';
import { t, tPlain } from './i18n.js';
import { getHpColor, SC_NAMES, getCreatureStatusKeys } from './combat-ui-utils.js';
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
  createAttackCardContinueControl,
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
  const sprite = getCreatureSpriteForScene(getSceneManager().currentScene, side, index);
  if (!sprite) return { x: 0, y: 0 };
  return { x: sprite.x, y: sprite.y };
}

const effectDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatPercent(value) {
  return Math.round(Number(value || 0) * 100);
}

const STREAK_REWARD_STAT_NAMES = {
  atk: 'Attack',
  def: 'Defense',
  dex: 'Dexterity',
};

function formatStatLabel(stat) {
  return STREAK_REWARD_STAT_NAMES[stat] || String(stat || 'Stat');
}

function formatKanjiKombatStreakReward(reward) {
  if (!reward || !Number.isFinite(Number(reward.streak))) return null;
  const prefix = `${reward.streak} In A Row!`;

  if (reward.type === 'teamHeal') {
    return `${prefix}\nTeam Healed +${formatPercent(reward.healPercent)}%`;
  }
  if (reward.type === 'statUp') {
    const allyName = reward.allyName || 'Ally';
    return `${prefix}\n${allyName} ${formatStatLabel(reward.stat)} Up!`;
  }
  if (reward.type === 'allyJoined') {
    const allyName = reward.allyName || 'An ally';
    return `${prefix}\n${allyName} Joined!`;
  }
  if (reward.type === 'fullHeal') {
    return `${prefix}\nTeam Fully Healed!`;
  }
  if (reward.type === 'partyLevelUp') {
    return `${prefix}\nParty Leveled Up!`;
  }

  return null;
}

export function showKanjiKombatAnswerBanner(correct, streakReward = null) {
  if (correct === true) {
    const rewardMessage = formatKanjiKombatStreakReward(streakReward);
    if (rewardMessage) {
      return showBanner(rewardMessage, 'streak', { elementColor: 0x4CAF50 });
    }
    return showBanner('Correct!', 'super', { elementColor: 0x4CAF50 });
  }
  if (correct === false) {
    return showBanner('Wrong!', 'weak');
  }
  return undefined;
}

/**
 * PixiJS replacement for the old DOM-based impactEnemyEffect.
 * Fires tiered hit-stop, particles, shake, flash, damage number, and recoil.
 */
export async function impactEffect(damage, targetSide, targetIndex, enemyMaxHp, element = 'neutral', effectivenessType = 'normal', onImpact) {
  const tier = getDamageTier(damage, enemyMaxHp);
  const effects = TIER_EFFECTS[tier];
  const pos = spritePos(targetSide, targetIndex);
  const sprite = getCreatureSpriteForScene(getSceneManager().currentScene, targetSide, targetIndex);
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
  if (effectivenessType === 'superEffective') {
    const elemColor = ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral;
    setTimeout(() => showBanner('Super Effective!', 'super', { elementColor: elemColor }), 50);
  } else if (effectivenessType === 'resisted') {
    setTimeout(() => showBanner('Resisted...', 'weak'), 50);
  }
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
  const attackerSprite = getCreatureSpriteForScene(getSceneManager().currentScene, 'player', attackerIndex);
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
  const attackerSprite = getCreatureSpriteForScene(getSceneManager().currentScene, 'enemy', attackerIndex);
  const fromPos = spritePos('enemy', attackerIndex);
  const toPos = spritePos('player', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: -20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
  });
  await Promise.all([lungeP, blastP]);
}

async function lungeEnemyCreature(attackerIndex) {
  const attackerSprite = getCreatureSpriteForScene(getSceneManager().currentScene, 'enemy', attackerIndex);
  if (attackerSprite) {
    await pixiLunge(attackerSprite, { distance: -20, duration: 200 });
  }
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
  const scene = getSceneManager().currentScene;
  // When allyHpMap is provided (mid-animation), iterate slots and look up by creature ID.
  // This avoids index mismatches when the creatures array has been compacted (dead removed).
  if (allyHpMap) {
    slots.forEach((slot, i) => {
      const creatureId = slot.dataset.creatureId;
      if (!creatureId) return;
      const entry = allyHpMap[creatureId];
      if (!entry) return;
      const hpPct = Math.max(0, (entry.hp / entry.maxHp) * 100);
      const fill = slot.querySelector('.formation-hp-fill');
      if (fill) {
        fill.style.width = `${hpPct}%`;
        fill.style.backgroundColor = getHpColor(hpPct);
      }
      const icon = slot.querySelector('.formation-sprite');
      if (icon) {
        if (entry.hp <= 0) icon.classList.add('ko');
        else icon.classList.remove('ko');
      }
      const pixiSprite = getCreatureSpriteForScene(scene, 'player', i);
      if (pixiSprite) {
        if (entry.hp <= 0) {
          pixiSprite.alpha = 0.3;
          pixiSprite.tint = 0x888888;
        } else {
          pixiSprite.alpha = 1;
          pixiSprite.tint = 0xFFFFFF;
        }
      }
    });
    return;
  }
  // Final sync (no allyHpMap): match creatures to their DOM slot by ID
  creatures.forEach((creature) => {
    if (!creature) return;
    const slot = Array.from(slots).find(s => s.dataset.creatureId === creature.id);
    if (!slot) return;
    const slotIndex = Array.from(slots).indexOf(slot);
    const hpPct = Math.max(0, (creature.hp / creature.maxHp) * 100);
    const fill = slot.querySelector('.formation-hp-fill');
    if (fill) {
      fill.style.width = `${hpPct}%`;
      fill.style.backgroundColor = getHpColor(hpPct);
    }
    const icon = slot.querySelector('.formation-sprite');
    if (icon) {
      if (creature.hp <= 0) icon.classList.add('ko');
      else icon.classList.remove('ko');
    }
    const pixiSprite = getCreatureSpriteForScene(scene, 'player', slotIndex);
    if (pixiSprite) {
      if (creature.hp <= 0) {
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
  const scene = getSceneManager().currentScene;
  const affectedCreatures = new Set();
  for (const event of result.effectEvents) {
    const side = event.targetSide === 'ally' ? 'player' : 'enemy';
    const index = typeof event.targetIndex === 'number' ? event.targetIndex : 0;
    const sideCreatures = side === 'player' ? result.allies : result.enemies;
    const uid = sideCreatures?.[index]?.uid;
    affectedCreatures.add(`${side}:${index}`);

    if (event.type === 'poison' && event.damage > 0) {
      const pos = spritePos(side, index);
      burstParticles(pos, { count: 4, color: 0x9C27B0, speed: 40, life: 300, element: 'neutral' });
      showPoisonTick(event.damage, pos);
      if (scene?.statusVfx && uid) {
        await playStatusAppliedForScene(scene.statusVfx, side, uid, 'poison');
      }
      if (event.remainingTurns === 0) {
        if (scene?.statusVfx && uid) {
          clearStatusVfxForScene(scene.statusVfx, side, uid, 'poison');
        }
      }
    } else if (event.type !== 'poison') {
      const EFFECT_LABELS = {
        confuse: tPlain('effectConfuse'),
        stun: tPlain('effectStun'),
        sleep: tPlain('effectSleep'),
        haste: tPlain('effectHaste'),
        shield: tPlain('effectShield'),
        team_shield: tPlain('effectShield'),
        taunt: 'Taunt'
      };
      const baseType = event.type.replace(/_tick$/, '');
      const label = EFFECT_LABELS[baseType] || event.type;
      const pos = spritePos(side, index);
      const BUFF_TYPES = new Set(['haste', 'shield', 'team_shield']);
      const DEBUFF_TYPES = new Set(['confuse', 'stun', 'sleep', 'taunt']);
      if (DEBUFF_TYPES.has(baseType)) {
        popupDebuff(label, pos);
        if (scene?.statusVfx && uid) {
          await playStatusAppliedForScene(scene.statusVfx, side, uid, baseType);
        }
      } else if (BUFF_TYPES.has(baseType)) {
        popupBuff(label, pos);
        if (scene?.statusVfx && uid) {
          await playStatusAppliedForScene(scene.statusVfx, side, uid, baseType);
        }
      } else {
        showFloatingText(document.body, label);
      }
      if (event.remainingTurns === 0) {
        if (scene?.statusVfx && uid) {
          clearStatusVfxForScene(scene.statusVfx, side, uid, baseType);
        }
      }
      await ctx.delay(400);
    }
  }
  // Only sync pills for creatures that had effect events
  for (const key of affectedCreatures) {
    const [side, idx] = key.split(':');
    syncStatusForCreature(scene, result, side, Number(idx));
  }
}

export function syncStatusIconsFromResult(result) {
  const scene = getSceneManager().currentScene;
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const keys = getCreatureStatusKeys(ally);
      syncPixiStatusLabelsForScene(scene, 'player', i, keys, ally.statStages);
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const keys = getCreatureStatusKeys(enemy);
      syncPixiStatusLabelsForScene(scene, 'enemy', i, keys, enemy.statStages);
    });
  }
}

function syncStatusForCreature(scene, result, side, index) {
  const creatures = side === 'player' ? result.allies : result.enemies;
  const creature = creatures?.[index];
  if (!creature) return;
  const keys = getCreatureStatusKeys(creature);
  syncPixiStatusLabelsForScene(scene, side, index, keys, creature.statStages);
}

/**
 * Show VFX + popup + pill sync when a move applies an effect or stat changes.
 * Called after each individual attack animation so indicators appear in real time.
 */
export async function showMoveEffectsApplied(atk, targetSide, targetIndex, result) {
  const pos = spritePos(targetSide, targetIndex);
  const scene = getSceneManager().currentScene;
  const targetCreatures = targetSide === 'player' ? result.allies : result.enemies;
  const uid = targetCreatures?.[targetIndex]?.uid;
  let shown = false;

  if (atk.effectApplied) {
    const effect = atk.effectApplied;
    if (DEBUFF_EFFECTS.has(effect)) {
      popupDebuff(STATUS_EFFECT_LABELS[effect] || effect, pos);
      if (scene?.statusVfx && uid) {
        await playStatusAppliedForScene(scene.statusVfx, targetSide, uid, effect);
      }
    } else if (BUFF_EFFECTS.has(effect)) {
      popupBuff(STATUS_EFFECT_LABELS[effect] || effect, pos);
      if (scene?.statusVfx && uid) {
        await playStatusAppliedForScene(scene.statusVfx, targetSide, uid, effect);
      }
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
    syncStatusForCreature(scene, result, targetSide, targetIndex);
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
  resolveEnemies,
  enemyHpMap
}) {
  const koTargetIndices = [];
  if (!atk.partySkillProcs?.length) return koTargetIndices;

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
      let chainKilledIndex = null;
      await fireElementBlast(chainFrom, chainTo, chainElement, () => {
        pixiDamageNumber(proc.damage, chainTo, { tier: 1 });
        screenShake('light');
        // Update enemy HP bar for chain damage (Arc Strike, Forked Arc)
        if (enemyHpMap && typeof proc.targetIndex === 'number' && enemyHpMap[proc.targetIndex]) {
          const wasAlive = enemyHpMap[proc.targetIndex].hp > 0;
          enemyHpMap[proc.targetIndex].hp = Math.max(0, enemyHpMap[proc.targetIndex].hp - proc.damage);
          const entry = enemyHpMap[proc.targetIndex];
          if (Object.keys(enemyHpMap).length > 1) {
            ctx.characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
          } else {
            ctx.characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
          }
          if (wasAlive && entry.hp <= 0) {
            chainKilledIndex = entry.index;
          }
        }
      });
      if (chainKilledIndex !== null) {
        await animateKOForScene(getSceneManager().currentScene, 'enemy', chainKilledIndex);
        koTargetIndices.push(chainKilledIndex);
      }
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

  return koTargetIndices;
}

/**
 * Show party skill proc visuals inline after a player attack.
 */
export async function showPartySkillProcs(atk, enemyHpMap) {
  const state = ctx.getGameState();
  const activeCreatures = state.run?.creatureParty?.active || [];
  const attackerIndex = atk.attackerId
    ? activeCreatures.findIndex(r => r && r.id === atk.attackerId)
    : 0;
  const safeAttackerIndex = Math.max(0, attackerIndex);
  const targetIndex = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;

  return await showAttackPartySkillProcs(atk, {
    sourceSide: 'player',
    attackerIndex: safeAttackerIndex,
    targetSide: 'enemy',
    targetIndex,
    element: 'neutral',
    resolveAllies: () => state.combat?.allies || activeCreatures,
    resolveEnemies: () => state.combat?.enemies || [],
    enemyHpMap
  });
}

/**
 * Show round-start skill events (Erosion, Momentum, Overflow Vitality).
 */
export async function showRoundStartEvents(result) {
  if (!result.roundStartEvents?.length) return;
  const scene = getSceneManager().currentScene;

  for (const event of result.roundStartEvents) {
    if (event.type === 'erosion') {
      const pos = spritePos('enemy', event.targetIndex);
      const text = `${SC_NAMES[event.stat] || event.stat} ${event.delta}`;
      popupDebuff(text, pos);
      burstParticles(pos, { count: 3, color: 0xFF5722 });
      syncStatusForCreature(scene, result, 'enemy', event.targetIndex);
    } else if (event.type === 'momentum') {
      const pos = spritePos('player', event.targetIndex);
      const text = `${SC_NAMES[event.stat] || event.stat} +${event.delta}`;
      popupBuff(text, pos);
      burstParticles(pos, { count: 3, color: 0x4CAF50 });
      syncStatusForCreature(scene, result, 'player', event.targetIndex);
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
    result.allies.forEach((ally) => {
      if (!ally) return;
      // Match by creature ID, not array index — the allies array may have been
      // compacted (dead creatures removed) but attack targetIndex still references
      // the pre-compaction positions.
      const dmgToThisAlly = (result.enemyAttacks || [])
        .filter(a => a.targetId === ally.id)
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
    const primaryDmgToThisEnemy = attacks
      .filter(a => (typeof a.targetIndex === 'number' ? a.targetIndex === i : a.targetId === enemy.id))
      .reduce((sum, a) => sum + (a.damage || 0), 0);
    const partySkillDmgToThisEnemy = attacks
      .flatMap(a => a.partySkillProcs || [])
      .filter(proc => ['chainHit', 'burst'].includes(proc.type) && proc.targetIndex === i)
      .reduce((sum, proc) => sum + (proc.damage || 0), 0);
    const dmgToThisEnemy = primaryDmgToThisEnemy + partySkillDmgToThisEnemy;
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
export async function showOneEnemyAttackAnimated(result, atk, allyHpMap, halved, options = {}) {
  const { skipAttackCards = false } = options;
  const effectKey = halved ? 'dealsHalved' :
    atk.elementMultiplier > 1 ? 'dealsStrong' :
    atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
  let attackCard = null;
  let continueControl = null;
  if (atk.attackerNameJp && !skipAttackCards) {
    attackCard = insertAttackCard(atk, true);
    continueControl = attackCard ? createAttackCardContinueControl(attackCard) : null;
  } else if (!skipAttackCards) {
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-creature-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
    }
  }

  playSFX('player-hit');

  const attackerIdx = typeof atk.attackerIndex === 'number' ? atk.attackerIndex : 0;
  const targetIdx = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;
  const targetMaxHp = (atk.targetId && allyHpMap?.[atk.targetId]?.maxHp) || result.allies?.[targetIdx]?.maxHp || 100;
  const enemyEffectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';
  const hpUpdate = () => {
    // Use targetId (stable creature ID) instead of targetIndex — the allies array
    // may have been compacted so index-based lookup gets the wrong creature.
    const hpMapKey = atk.targetId;
    if (hpMapKey && allyHpMap[hpMapKey]) {
      allyHpMap[hpMapKey].hp = Math.max(0, allyHpMap[hpMapKey].hp - atk.damage);
    }
    updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
  };
  const atkElement = atk.moveElement || atk.attackerElement;
  const dealsDamage = (atk.damage || 0) > 0;
  if (dealsDamage && atkElement) {
    playAttackSound(atkElement);
    await enemyCreatureAttackEffect(attackerIdx, targetIdx, atkElement, atk.damage, targetMaxHp, enemyEffectivenessType, hpUpdate);
  } else if (dealsDamage) {
    ctx.animatePlayerHurt();
    hpUpdate();
  } else if (atk.category === 'buff') {
    await lungeEnemyCreature(attackerIdx);
  }

  // Real-time buff/debuff indicators for enemy-applied effects
  if (atk.effectApplied || atk.statChangesApplied) {
    await showMoveEffectsApplied(atk, atk.targetSide || 'player', targetIdx, result);
  }

  if (continueControl) {
    await continueControl.wait();
  } else if (!skipAttackCards) {
    await ctx.delay(400);
  }
}

/**
 * Animate enemy attacks against player creatures with real-time HP bar updates.
 */
export async function showEnemyAttacksAnimated(result, allyHpMap, halved, options = {}) {
  if (!result.enemyAttacks?.length) return;
  for (const atk of result.enemyAttacks) {
    await showOneEnemyAttackAnimated(result, atk, allyHpMap, halved, options);
  }
  syncStatusIconsFromResult(result);
}

/**
 * Show NPC skill attack cards sequentially (one per target).
 * Each card is a vocab review opportunity showing NPC name + skill name + target.
 */
export async function showNpcSkillAttacksAnimated(result, allyHpMap) {
  if (!result.npcSkillAttacks?.length) return;

  for (const atk of result.npcSkillAttacks) {
    let attackCard = null;
    let continueControl = null;

    attackCard = insertNpcAttackCard(atk);
    continueControl = attackCard ? createAttackCardContinueControl(attackCard) : null;

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

    if (continueControl) {
      await continueControl.wait();
    } else {
      await ctx.delay(800);
    }
  }
}

/**
 * Show KO swap messages with death/swap-in animations.
 */
async function syncPlayerFormationFromKoResult(result) {
  if (!result.creatureParty?.active) return;

  await showFormation('player', result.creatureParty.active, { force: true });
  const mgr = getSceneManager();
  const scene = mgr.currentScene;
  if (!mgr.transitioning && scene && !scene.disposed && !scene._exiting && typeof scene.syncCreatures === 'function') {
    const currentEnemies = result.enemies ?? scene.formation?.lastFormationInput?.enemy?.creatures ?? [];
    try {
      await scene.syncCreatures({
        allies: result.creatureParty.active,
        enemies: currentEnemies,
      });
    } catch (err) {
      // Scene disposed mid-sync: destination scene's onEnter will handle
      // the next sync with the post-KO roster.
      if (!(err instanceof SceneDisposedError)) throw err;
    }
  }
}

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
      animateKOForScene(getSceneManager().currentScene, 'player', koIndex);
      await ctx.delay(600);
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${t('swapsIn', swap.replacement)}</div>`;
    }

    // Rebuild the DOM name/HP bars and sync the Pixi sprite roster for the
    // replacement. The current formation DOM only has Pixi anchors, not <img>s.
    if (result.creatureParty?.active && koIndex >= 0) {
      await syncPlayerFormationFromKoResult(result);
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const swapSlot = slots[koIndex];
      if (swapSlot) {
        swapSlot.classList.add('creature-swapping-in');
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
        animateKOForScene(getSceneManager().currentScene, 'player', koIndex);
      }

      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #ff5252;">${t('wasDefeated', removal.name)}</div>`;
      }
      await ctx.delay(800);
    }

    // Re-render formation with surviving creatures (DOM + Pixi). The DOM rebuild
    // alone leaves the dead creature's Pixi sprite (shrunk by animateKOForScene)
    // on stage, and the surviving creature's sprite stays at its old slot so its
    // HP-bar label in the freshly-rebuilt DOM no longer lines up. Syncing the
    // scene prunes the dead sprite by uid and repositions the survivor.
    await syncPlayerFormationFromKoResult(result);
  }
}
