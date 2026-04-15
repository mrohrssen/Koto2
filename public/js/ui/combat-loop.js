import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { renderJpSentence, renderEnFirst, getKnownWords, entityToToken } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import {
  screenShake, screenFlash, hitStop, recoil as pixiRecoil,
  lunge as pixiLunge, burstParticles, flowParticles,
  ELEMENT_COLORS
} from '../pixi/effects.js';
import { fireElementBlast } from '../pixi/element-blasts.js';
import {
  showDamageNumber as pixiDamageNumber, popupBuff, popupDebuff, popupSkillProc,
  showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup,
  showHealPopup, showPoisonTick
} from '../pixi/text.js';
import { showBanner } from '../pixi/banners.js';
import { playStatusApplied, clearStatusVfx, clearAllStatusVfx } from '../pixi/status-vfx.js';
import { getCreatureSprite, showActiveGlow, clearActiveGlow, hideFormation as pixiHideFormation, animateKO, animateLevelUp, syncPixiStatusLabels, clearAllPixiStatusLabels, showNpcSprite as pixiSlideInNpc, hideNpcSprite as pixiSlideOutNpc } from '../pixi/formation.js';
import { showNpcInDisplay, hideEnemy, showFormation } from './scene.js';
import { setScrollState } from '../pixi/parallax.js';
import { getDamageTier, TIER_EFFECTS, TIER_RECOIL } from '../pixi/combat-effects-util.js';
import { wait } from '../pixi/tween.js';
import { hapticDamageTier } from '../native/index.js';
import { playAttackSound } from './combat-audio.js';
import { replaceWithTextSprite, creatureStaticPath, SPRITE_VERSION } from './sprite-utils.js';
import { toRomaji } from './romaji.js';
import { combatEvents } from './combat-events.js';
import { getHpColor, SC_NAMES, getCreatureStatusKeys } from './combat-ui-utils.js';
import { getTutorialNarration, getBefriendWrongNarration } from './tutorial-copy.js';
import { restoreBefriendQuizEnemyUi } from './befriend-quiz-state.js';

// ============ INTENT LOG HELPER ============
function getLog() { return window.__intentLog; }

// ============ SERVER-PROVIDED BARKS ============
let _currentRoundBarks = [];

/** Get the barks returned by the latest combat cycle response. */
export function getCurrentBarks() { return _currentRoundBarks; }

// ============ PIXI ADAPTER FUNCTIONS ============

function spritePos(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return { x: 0, y: 0 };
  return { x: sprite.x, y: sprite.y };
}

const effectDelay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * PixiJS replacement for the old DOM-based impactEnemyEffect.
 * Fires tiered hit-stop, particles, shake, flash, damage number, and recoil.
 */
async function impactEffect(damage, targetSide, targetIndex, enemyMaxHp, element = 'neutral', effectivenessType = 'normal', onImpact) {
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
async function fireCreatureAttackEffect(attackerIndex, targetIndex, element, damage, enemyMaxHp, effectivenessType = 'normal', onImpact) {
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
async function enemyCreatureAttackEffect(attackerIndex, targetIndex, element, damage, playerMaxHp = 0, effectivenessType = 'normal', onImpact) {
  const attackerSprite = getCreatureSprite('enemy', attackerIndex);
  const fromPos = spritePos('enemy', attackerIndex);
  const toPos = spritePos('player', targetIndex);
  const lungeP = attackerSprite ? pixiLunge(attackerSprite, { distance: -20, duration: 200 }) : Promise.resolve();
  const blastP = fireElementBlast(fromPos, toPos, element, () => {
    impactEffect(damage, 'player', targetIndex, playerMaxHp, element, effectivenessType, onImpact);
  });
  await Promise.all([lungeP, blastP]);
}

import { playDialogueAudio } from '../tts.js';
import { init as initMoveSelect, showMoves, clear as clearMoveSelect, setActiveLabel } from './move-select.js';
import { init as initTargetSelect, showEnemies, showAllies, clear as clearTargetSelect } from './target-select.js';
import { showLearnPrompt } from './move-learn.js';
import { renderButtonsAsync } from './ui-components.js';
import { playNpcSkillAnimation } from './room-transition.js';
import * as befriend from './befriend.js';
import * as kanaCombat from './kana-combat.js';
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
  showAttackCardAndWait, ATTACK_CARD_TIMING, ELEMENT_THEME,
} from './attack-card.js';

// Re-export for barrel compatibility (index.js → combatLoop.insertAttackCard)
export { insertAttackCard, waitForCardTap } from './attack-card.js';

/**
 * Party-skill proc visuals shared by attack-display and inline move-turn playback.
 * Callers supply resolveAllies/resolveEnemies and indices so PvP overrides stay correct.
 */
async function showAttackPartySkillProcs(atk, {
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
 * Shared attack display sequence used by both PvE and PvP.
 * Shows: card → sound → effects → damage → STAB → effectiveness → party skill procs → tap.
 *
 * @param {Object} atk - Attack object from server
 * @param {Object} opts
 * @param {boolean} opts.isEnemy - Whether this attack is from the enemy's perspective
 * @param {Element|null} opts.sourceEl - Attacker's formation slot element
 * @param {Element|null} opts.targetEl - Target's formation slot element
 * @param {number} [opts.targetMaxHp=100] - Target's max HP (for tiered impact effects)
 * @param {Array} [opts.allies] - Override ally list (PvP passes its own state)
 * @param {Array} [opts.enemies] - Override enemy list (PvP passes its own state)
 * @returns {Promise<Element|null>} The attack card element
 */
export async function showAttackDisplay(atk, { isEnemy, sourceEl, targetEl, targetMaxHp = 100, allies: overrideAllies, enemies: overrideEnemies, onImpact }) {
  const attackCard = insertAttackCard(atk, isEnemy);

  playSFX('attack');
  const element = atk.moveElement || atk.attackerElement || 'neutral';

  // Resolve indices for PixiJS effects (DOM elements are kept for legacy callers)
  const attackerIndex = atk.attackerIndex ?? 0;
  const targetIndex = atk.targetIndex ?? 0;
  const sourceSide = isEnemy ? 'enemy' : 'player';
  const targetSide = atk.targetSide || (isEnemy ? 'player' : 'enemy');

  const effectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';

  if (atk.damage > 0 && (sourceEl || getCreatureSprite(sourceSide, attackerIndex))) {
    playAttackSound(element);
    if (isEnemy) {
      await enemyCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    } else {
      await fireCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    }
  }

  // Damage number on the target (already rendered by impactEffect inside the attack effect functions)

  // Type effectiveness popup (STAB has no separate visual; its boost feeds into the tier system)
  if (atk.elementMultiplier > 1) {
    setTimeout(() => showBanner('Super Effective!', 'super', { elementColor: ELEMENT_COLORS[element] || ELEMENT_COLORS.neutral }), 400);
  } else if (atk.elementMultiplier < 1) {
    setTimeout(() => showBanner('Resisted...', 'weak'), 400);
  }

  // Stat stage change popups
  if (atk.statChangesApplied) {

    for (const [stat, change] of Object.entries(atk.statChangesApplied)) {
      if (change === 0) continue;
      const dir = change > 0 ? `+${change}` : `${change}`;
      const text = `${SC_NAMES[stat] || stat} ${dir}`;
      const pos = spritePos(targetSide, targetIndex);
      if (change > 0) popupBuff(text, pos);
      else popupDebuff(text, pos);
    }
  }

  // Party skill procs (bonus damage, heals, haste, shields)
  const resolveAllies = () => overrideAllies || getGameState()?.combat?.allies || getGameState()?.run?.creatureParty?.active || [];
  const resolveEnemies = () => overrideEnemies || getGameState()?.combat?.enemies || [];
  await showAttackPartySkillProcs(atk, {
    sourceSide,
    attackerIndex,
    targetSide,
    targetIndex,
    element,
    resolveAllies,
    resolveEnemies
  });

  // Tap to continue
  if (attackCard) {
    await waitForCardTap(attackCard);
  } else {
    await effectDelay(800);
  }

  return attackCard;
}

// ============ MODULE STATE ============

// Combat state
let combatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
let pendingActionType = null; // 'attack' or 'defend' - set when card selected
let playerAttackTimer = null;
let enemyAttackTimer = null;

// Move-based combat state
let moveChoices = [];
let currentCreatureIndex = 0;
let pendingMove = null;

// Callback references (set during init)
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let settings = null;
let narration = null;
let wordPractice = null;
let characterUI = null;

// Combat UI functions
let showDamageNumber = null;
let showDotDamage = null;
let animateEnemyHurt = null;
let animatePlayerHurt = null;
let animateEnemyDefeat = null;
let updateActionPanel = null;
let playNarrationAudio = null;
let showVictoryModal = null;
let showGameOverModal = null;
let showEnemyDialogue = null;
let getEnemyDialogueActive = null;
let getDialogueDismissPromise = null;
let showFlashCards = null;
let setCombatAnimationActive = null;
let apiCreatureCombatCycle = null;
let showPostCombatShop = null;

let apiStartNpcDialogue = null;
let apiRespondNpcDialogue = null;
let showNpcSprite = null;
let hideNpcSprite = null;
let updateCreatureRowData = null;

// Kana mode state


// Utility
let delay = null;

const API_BASE = PLATFORM.apiBase;

/** Wrap an async combat animation sequence with the animation-active guard. */
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    return await fn();
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
}

/** Get NPC data from current combat state */
function getCombatNpcData() {
  const state = getGameState();
  return state?.combat?.npcData || null;
}

/** Get current enemy creatures for re-rendering after NPC skill animation */
function getCombatEnemies() {
  const state = getGameState();
  return state?.combat?.enemies || [];
}

/**
 * Initialize the combat loop UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  settings = callbacks.settings;
  narration = callbacks.narration;
  wordPractice = callbacks.wordPractice;
  characterUI = callbacks.characterUI;

  // Combat UI functions
  showDamageNumber = callbacks.showDamageNumber;
  showDotDamage = callbacks.showDotDamage;
  animateEnemyHurt = callbacks.animateEnemyHurt;
  animatePlayerHurt = callbacks.animatePlayerHurt;
  animateEnemyDefeat = callbacks.animateEnemyDefeat;
  updateActionPanel = callbacks.updateActionPanel;
  playNarrationAudio = callbacks.playNarrationAudio;
  showVictoryModal = callbacks.showVictoryModal;
  showGameOverModal = callbacks.showGameOverModal;
  showEnemyDialogue = callbacks.showEnemyDialogue;
  getEnemyDialogueActive = callbacks.getEnemyDialogueActive;
  getDialogueDismissPromise = callbacks.getDialogueDismissPromise;
  showFlashCards = callbacks.showFlashCards;

  // Utility
  delay = callbacks.delay;
  setCombatAnimationActive = callbacks.setCombatAnimationActive;
  apiCreatureCombatCycle = callbacks.apiCreatureCombatCycle;
  showPostCombatShop = callbacks.showPostCombatShop;
  apiStartNpcDialogue = callbacks.apiStartNpcDialogue;
  apiRespondNpcDialogue = callbacks.apiRespondNpcDialogue;
  showNpcSprite = callbacks.showNpcSprite;
  hideNpcSprite = callbacks.hideNpcSprite;
  updateCreatureRowData = callbacks.updateCreatureRowData;

  // Initialize extracted befriend module with coordinator deps
  befriend.init({
    getGameState: () => getGameState(),
    updateGameState: (s) => updateGameState(s),
    updateUI: () => updateUI(),
    isCombatActive: () => combatActive,
    setCombatActive: (v) => { combatActive = v; },
    getCurrentCreatureIndex: () => currentCreatureIndex,
    setCurrentCreatureIndex: (i) => { currentCreatureIndex = i; },
    withAnimationActive,
    startMoveSelection,
    promptNextCreature,
    stopCombatLoop,
    narration,
    delay,
    characterUI,
    showGameOverModal,
    updateCreatureRowData,
    syncFinalState,
    showOneEnemyAttackAnimated,
    buildAllyHpMap,
    updateCreatureHpBars,
    spritePos,
    apiBefriendReplace: callbacks.apiBefriendReplace,
    apiGetBefriendConversation: callbacks.apiGetBefriendConversation,
    apiSubmitBefriendAnswer: callbacks.apiSubmitBefriendAnswer,
  });

  kanaCombat.init({
    getGameState: () => getGameState(),
    showFlashCards,
    executeCreatureMovesTurn,
  });
}

/**
 * Initialize move/target selection UI callbacks.
 * Called by game.js after combatLoop.init().
 */
export function initMoveUI() {
  initMoveSelect({
    onMoveSelectCb: handleMoveSelected,
    onItemsOpenCb: () => {
      console.log('[combat] Items button pressed — not yet implemented');
    },
    onMoveHelpCb: (move) => {
      // Remove existing popup
      document.querySelector('.move-help-backdrop')?.remove();
      document.querySelector('.move-help-popup')?.remove();

      const STATUS_LABELS = {
        poison: 'Poison', stun: 'Stun', confuse: 'Confuse',
        shield: 'Shield', team_shield: 'Team Shield',
        haste: 'Haste'
      };
      const CAT_LABELS = {
        damage: 'Attack', drain: 'Drain', heal: 'Heal',
        shield: 'Shield', buff: 'Buff', debuff: 'Debuff'
      };

      const TARGET_LABELS = {
        single_enemy: 'Single Target', all_enemies: 'All Targets',
        self: 'Self', single_ally: 'Single Ally', all_allies: 'All Allies',
        enemy: 'Single Target'
      };

      let statsHtml = '';
      statsHtml += `<span class="mhp-stat">${CAT_LABELS[move.category] || move.category}</span>`;
      if (move.power > 0) statsHtml += `<span class="mhp-stat">Power ${move.power}</span>`;
      statsHtml += `<span class="mhp-stat">${move.mpCost} MP</span>`;
      if (move.element) statsHtml += `<span class="mhp-stat">${move.element}</span>`;
      if (move.statChanges) {
        for (const [stat, amount] of Object.entries(move.statChanges)) {
          const dir = amount > 0 ? `+${amount}` : `${amount}`;
          statsHtml += `<span class="mhp-stat">${SC_NAMES[stat] || stat} ${dir}</span>`;
        }
      }
      if (move.statusEffect) {
        const label = STATUS_LABELS[move.statusEffect] || move.statusEffect;
        const dur = move.statusDuration ? ` ${move.statusDuration}T` : '';
        statsHtml += `<span class="mhp-stat">${label}${dur}</span>`;
      }
      if (move.target && move.target !== 'enemy') {
        statsHtml += `<span class="mhp-stat">${TARGET_LABELS[move.target] || move.target}</span>`;
      }

      const moveNameHtml = renderJpSentence([entityToToken({ name: move.name, reading: move.reading, nameEn: move.meaning })], getKnownWords(), new Map());
      const descHtml = move.descriptionTagged
        ? renderEnFirst(move.descriptionTagged)
        : (move.description || '');

      const backdrop = document.createElement('div');
      backdrop.className = 'move-help-backdrop';

      const popup = document.createElement('div');
      popup.className = 'move-help-popup';
      popup.innerHTML = `
        <div class="mhp-name">${moveNameHtml}</div>
        <div class="mhp-stats">${statsHtml}</div>
        ${descHtml ? `<div class="mhp-desc">${descHtml}</div>` : ''}
      `;

      const dismiss = () => {
        backdrop.remove();
        popup.remove();
      };
      backdrop.addEventListener('click', dismiss);
      popup.addEventListener('click', dismiss);

      document.body.appendChild(backdrop);
      document.body.appendChild(popup);
    }
  });
  initTargetSelect({
    onTargetSelectCb: handleTargetSelected,
    onCancelCb: handleTargetCancelled
  });
}

/**
 * Start move selection for a new turn.
 * Replaces the old pauseForNextVocab flow for creature combat.
 */
export function startMoveSelection() {
  const state = getGameState();
  // Kana combat mode disabled — move-based combat always runs (Task 8.1)
  // if (state.meta?.kanaMode) {
  //   kanaCombat.startRound();
  //   return;
  // }
  moveChoices = [];
  currentCreatureIndex = 0;
  promptNextCreature();
}

export function handleKanaSwipe(direction) {
  kanaCombat.handleSwipe(direction);
}

export function isKanaRoundInProgress() {
  return kanaCombat.isRoundInProgress();
}

function promptNextCreature() {
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];

  // Skip KO'd creatures
  while (currentCreatureIndex < allies.length && (!allies[currentCreatureIndex] || allies[currentCreatureIndex].hp <= 0)) {
    currentCreatureIndex++;
  }

  if (currentCreatureIndex >= allies.length) {
    // All creatures have chosen -- execute the turn
    clearActiveGlow();
    executeCreatureMovesTurn(moveChoices);
    return;
  }

  const creature = allies[currentCreatureIndex];
  clearTargetSelect();
  setActiveLabel(creature);
  showActiveGlow(currentCreatureIndex);
  showMoves(creature, currentCreatureIndex, befriend.getMoveSelectBefriendOpts(currentCreatureIndex));
}

function handleMoveSelected(move, creatureIndex) {
  clearActiveGlow();
  pendingMove = move;
  const state = getGameState();

  if (move.target === 'single_enemy') {
    const enemies = state.combat?.enemies || [];
    const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
    if (alive.length === 0) {
      // No valid targets — skip target selection, auto-advance
      moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
      currentCreatureIndex++;
      promptNextCreature();
      return;
    }
    if (alive.length === 1) {
      // Single target — auto-select, skip UI
      const autoIdx = enemies.indexOf(alive[0]);
      moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: autoIdx });
      currentCreatureIndex++;
      promptNextCreature();
      return;
    }
    showEnemies(enemies, move);
  } else if (move.target === 'single_ally') {
    showAllies(state.combat?.allies || state.run?.creatureParty?.active || [], move);
  } else {
    // AoE or self -- no target needed, targetIndex -1
    moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
    currentCreatureIndex++;
    promptNextCreature();
  }
}

function handleTargetSelected(targetIndex) {
  moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: pendingMove.id, targetIndex });
  pendingMove = null;
  currentCreatureIndex++;
  promptNextCreature();
}

function handleTargetCancelled() {
  // Go back to move selection for this creature
  pendingMove = null;
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];
  const creature = allies[currentCreatureIndex];
  if (creature) {
    clearTargetSelect();
    setActiveLabel(creature);
    showActiveGlow(currentCreatureIndex);
    showMoves(creature, currentCreatureIndex, befriend.getMoveSelectBefriendOpts(currentCreatureIndex));
  }
}

function handleDefendSelected() {
  // Execute defend turn immediately (all creatures defend)
  executeCreatureDefendThenPause();
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Check if combat loop is active
 * @returns {boolean}
 */
export function isCombatActive() {
  return combatActive;
}

/**
 * Check if combat is paused for vocab review
 * @returns {boolean}
 */
export function isCombatPausedForVocab() {
  return combatPausedForVocab;
}

/**
 * Cleanup combat state without showing results (for returnToHub)
 */
export function cleanupCombat() {
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }
  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];
  clearAllPixiStatusLabels();
}

/**
 * Pause combat and show next move selection (for use after external actions like swaps).
 * In move-based combat, this starts the move selection grid instead of flashcards.
 */
export function pauseForNextVocab() {
  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;
  if (isCreatureCombat) {
    startMoveSelection();
  } else {
    combatPausedForVocab = true;
    showNextDualCardsFromQueue();
  }
}

function showNextDualCardsFromQueue() {
  const words = wordPractice.getTwoCombatWords?.();
  if (!words || !words.attackWord) {
    // Fallback: not enough words, use single card flow
    const word = wordPractice.getNextCombatWord?.();
    if (word && showFlashCards) {
      pendingActionType = 'attack'; // Default to attack if single card
      showFlashCards([word]);
    }
    return;
  }

  // Old befriend flash-card path disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // const anyEnemyBefriendable = enemies.some(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5);
  // const befriendAvailable = isCreatureCombat && anyEnemyBefriendable && party && !state.combat?.npcId;
  if (showFlashCards) {
    showFlashCards([words.attackWord, words.defendWord]);
  }
}


/**
 * Find a creature slot element by creature ID (matches against game state).
 * Works for both allied creature slots (attacker) and targeted creature slots.
 * @param {string} creatureId - The creature's ID
 * @returns {Element|null} The .formation-slot DOM element, or null
 */
function findCreatureSlotByAttackerId(creatureId, allyIndex = null) {
  const state = getGameState();
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
 * @param {string} targetId - Enemy template id (fallback when enemyIndex missing)
 * @param {Array} enemies - The enemies array from the result
 * @param {number|null} enemyIndex - Slot in `enemies` (authoritative when duplicate species)
 * @returns {Element} The specific enemy slot element or the container
 */
function findEnemyTargetElement(targetId, enemies, enemyIndex = null) {
  const slot = document.querySelector(`#enemy-formation .formation-slot[data-index="${enemyIndex}"]`);
  if (slot) return slot;
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay && npcDisplay.classList.contains('visible')) return npcDisplay;
  return document.getElementById('enemy-formation');
}

/**
 * Directly update creature HP bar widths in the DOM without triggering full updateUI.
 * This avoids resetting enemy HP bars from stale game state during animations.
 * @param {Array} creatures - The creature party active array (with final HP from server)
 * @param {Object} allyHpMap - Map of creatureId -> { hp, maxHp } with running HP values
 */
function updateCreatureHpBars(creatures, allyHpMap) {
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
 * Show enemy damage to player in big red text in the action area
 * @param {Object} enemyAttack - The enemy attack result
 */
function showEnemyDamageDisplay(enemyAttack) {
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

// ============ XP EVENT HANDLING ============

/**
 * Process xpEvents from the backend and show animated XP popups over creature slots.
 * Also handles level-up popups and updates the level badge in the DOM.
 * @param {Array} xpEvents - Array of { xpGrants: [...], levelUps: [...] }
 */
function showXpEvents(xpEvents) {
  const pendingMoveLearn = [];
  if (!xpEvents || xpEvents.length === 0) return pendingMoveLearn;

  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return pendingMoveLearn;

  const slots = document.querySelectorAll('#player-formation .formation-slot');

  for (const event of xpEvents) {
    // Show XP popups for each creature that gained XP
    if (event.xpGrants) {
      for (const grant of event.xpGrants) {
        const index = activeCreatures.findIndex(r => r && r.id === grant.creatureId);
        if (index >= 0 && slots[index]) {
          pixiXpPopup(grant.xp, spritePos('player', index));
        }
      }
    }

    // Show level-up popups
    if (event.levelUps) {
      for (const lu of event.levelUps) {
        const index = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
        if (index >= 0 && slots[index]) {
          // Slight delay so it appears after XP popup
          setTimeout(() => pixiLevelUpPopup(lu.newLevel, spritePos('player', index)), 400);
          // PixiJS level-up burst + flash
          setTimeout(() => animateLevelUp('player', index), 400);
        }
        // Collect move learns for later processing
        if (lu.newMove) {
          const creature = activeCreatures.find(r => r && r.id === lu.creatureId);
          if (creature) {
            const creatureIdx = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
            pendingMoveLearn.push({ creature, creatureIndex: creatureIdx, newMove: lu.newMove });
          }
        }
      }
    }
  }

  return pendingMoveLearn;
}

/**
 * Process pending move-learn prompts after combat state sync.
 * For each pending item, checks if the move was auto-learned (already in moves array)
 * or needs replacement (creature has 4 moves). Shows UI prompt and calls backend API.
 * @param {Array} pendingList - Array of { creature, creatureIndex, newMove }
 */
async function processPendingMoveLearn(pendingList) {
  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return;

  for (const item of pendingList) {
    // Re-read creature from synced state (may have been updated by syncFinalState)
    const creature = activeCreatures.find(r => r && r.id === item.creature.id);
    if (!creature) continue;
    const creatureIndex = activeCreatures.findIndex(r => r && r.id === item.creature.id);

    // Check if move was auto-learned (already in creature's moves after state sync)
    const alreadyLearned = creature.moves?.some(m => m.id === item.newMove.id);

    // Pass alreadyLearned flag so the prompt shows the right UI
    // (after syncFinalState, auto-added moves make creature.moves.length == 3)
    const result = await showLearnPrompt(creature, creatureIndex, item.newMove, alreadyLearned);

    if (result.action === 'skip') {
      continue;
    }

    if (result.action === 'replace') {
      // Call backend to replace the move
      const response = await fetch(`${API_BASE}/api/game/learn-move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          creatureIndex: creatureIndex,
          newMoveId: item.newMove.id,
          replaceIndex: result.replaceIndex
        })
      });
      const data = await response.json();
      if (data.state) {
        updateGameState(data.state);
      }
    }
  }
}

// ============ COMBAT LOOP FUNCTIONS ============

/**
 * Start the combat loop (vocab-pause turn-based combat)
 */
export async function startCombatLoop(opts = {}) {
  if (combatActive) return;

  logger.info('[CombatLoop] Combat started', opts.recovery ? '(recovery)' : '');
  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];

  // On recovery (page reload), re-render the scene before showing moves.
  // updateScene() already rendered enemy sprites, just need the move UI.
  if (opts.recovery && updateUI) {
    updateUI();
  }

  // Start move selection for the first turn
  startMoveSelection();
}

/**
 * Execute a single player attack and schedule the next one
 */
export async function executePlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'player', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Player attack:', { damage: result.playerAttack?.damage, critical: result.playerAttack?.critical });

      if (result.error) {
        // "No active combat" means server state is out of sync - don't trigger false game over
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false; // Sync client state
          return;
        }
        console.error('Player attack error:', result.error);
        // Don't trigger defeat for errors - let player retry
        playerAttackPending = false;
        return;
      }

      // If dialogue appeared during fetch, don't process results
      if (getEnemyDialogueActive()) {
        playerAttackPending = false;
        return;
      }


      // Show player's attack result
      if (result.playerAttack) {
        const pa = result.playerAttack;
        if (pa.perfectDodge) {
          showDamageNumber(0, false, false, false, false, 'perfect');
        } else if (pa.dodged) {
          showDamageNumber(0, false, false, false, false, 'dodge');
        } else if (pa.miss) {
          showDamageNumber(0, false, false, false, false, 'miss');
        } else {
          // Play attack sound immediately
          playSFX('attack');

          // Calculate damage tier for visual feedback
          const state = getGameState();
          const enemyMaxHp = state.combat?.enemy?.maxHp || 100;

          animateEnemyHurt();
          const enemySlot = document.querySelector('#enemy-formation .formation-slot');
          if (enemySlot) combatEvents.emit('creatureHit', { slotEl: enemySlot, side: 'enemy' });

          // Visual effects for enemy damage (PixiJS impact with tier-based effects)
          await impactEffect(pa.damage, 'enemy', 0, enemyMaxHp, undefined, undefined, () => {
            characterUI.updateEnemyHPBar(result.enemyHp);
          });
        }
      }

      // Sync HP bars for dodge/miss (no impactEffect fires, but server state may have changed)
      if (!result.playerAttack?.damage) {
        characterUI.updateEnemyHPBar(result.enemyHp);
      }
      // Update player HP bar (player doesn't take damage during their own attack animation)
      characterUI.updatePlayerHPBar(result.playerHp);

      // Show glitching dialogue when enemy HP drops below 30%
      // Combat pauses until dialogue dismisses, then enemy attacks
      if (result.enemyGlitching && result.glitchingDialogue) {
        playerAttackPending = false;
        showEnemyDialogue(result.glitchingDialogue, 'glitching');
        return;
      }

      // Check if combat ended
      if (result.combatEnded) {
        // Show liberated dialogue on victory
        if (result.victory && result.liberatedDialogue) {
          showEnemyDialogue(result.liberatedDialogue, 'liberated');
        }
        // Let HP bar drain animation (300ms CSS transition) be visible before stopping
        if (result.victory) {
          await delay(500);
        }
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Combat pause mode: trigger enemy attack after player, then pause for vocab review
      if (combatActive && !getEnemyDialogueActive()) {
        // Small delay before enemy attacks back
        setTimeout(() => {
          executeEnemyAttackThenPause();
        }, 400);
      }

    } catch (error) {
      console.error('Player attack error:', error);
      // Don't trigger defeat for errors - recover by showing next flashcard
      playerAttackPending = false;

      // Recovery: pause for vocab and show dual cards so player can continue
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from player attack error, showing dual cards');
      }
    }
  });
}

// ============ SHARED CREATURE COMBAT HELPERS ============

/** Show a floating text label above a target element (for status effects) */
function showFloatingText(targetEl, text) {
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
 * Handles poison ticks with damage animation AND all other status effects
 * (confuse, stun, sleep, buffs, shields) with floating text labels.
 * Used by both attack and defend paths.
 * @param {Object} result - Combat cycle result from server
 */
async function showEffectEvents(result) {
  if (!result.effectEvents?.length) return;
  const affectedCreatures = new Set();
  for (const event of result.effectEvents) {
    // Resolve side and index for PixiJS positioning
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
      await delay(400);
    }
  }
  // Only sync pills for creatures that had effect events (avoid premature sync from final state)
  for (const key of affectedCreatures) {
    const [side, idx] = key.split(':');
    syncStatusForCreature(result, side, Number(idx));
  }
}

// getCreatureStatusKeys imported from combat-ui-utils.js

function syncStatusIconsFromResult(result) {
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

const BUFF_EFFECTS = new Set(['haste', 'shield', 'team_shield']);
const DEBUFF_EFFECTS = new Set(['poison', 'sleep', 'stun', 'confuse', 'taunt']);

/**
 * Show VFX + popup + pill sync when a move applies an effect or stat changes.
 * Called after each individual attack animation so indicators appear in real time.
 */
async function showMoveEffectsApplied(atk, targetSide, targetIndex, result) {
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
    await delay(300);
  }
}

const STATUS_EFFECT_LABELS = {
  poison: 'Poisoned!',
  sleep: 'Sleep!',
  stun: 'Stunned!',
  confuse: 'Confused!',
  haste: 'Haste!',
  shield: 'Shield!',
  team_shield: 'Shield!',
  taunt: 'Taunt!'
};

/**
 * Show party skill proc visuals inline after a player attack.
 * @param {Object} atk - The attack record with optional partySkillProcs array
 */
async function showPartySkillProcs(atk) {
  const state = getGameState();
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
 * These fire at the start of each round before any actions.
 * @param {Object} result - Combat cycle result from server
 */
async function showRoundStartEvents(result) {
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
 * @param {Object} counter - Counter attack record from server
 * @param {Object} enemyHpMap - Mutable HP map keyed by enemy slot index
 * @param {Array} enemies - Enemy list for pandemic proc targeting
 */
async function showOneCounterAttackAnimated(counter, enemyHpMap, enemies) {
  const defenderPos = spritePos('player', counter.defenderIndex);
  popupSkillProc('COUNTER!', defenderPos);

  if (counter.damage > 0) {
    const targetMaxHp = enemyHpMap?.[counter.targetIndex]?.maxHp || 100;
    await fireCreatureAttackEffect(counter.defenderIndex, counter.targetIndex, 'neutral', counter.damage, targetMaxHp, 'normal', () => {
      if (enemyHpMap?.[counter.targetIndex]) {
        enemyHpMap[counter.targetIndex].hp = Math.max(0, enemyHpMap[counter.targetIndex].hp - counter.damage);
        const entry = enemyHpMap[counter.targetIndex];
        if (Object.keys(enemyHpMap).length > 1) {
          characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
        } else {
          characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
        }
      }
    });
  }

  if (counter.procs?.length) {
    const enemyList = enemies || getCombatEnemies() || [];
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
 * @param {Object} result - Combat cycle result from server
 * @param {Object} enemyHpMap - Mutable HP map keyed by enemy slot index
 */
async function showCounterAttacks(result, enemyHpMap) {
  if (!result.counterAttacks?.length) return;
  for (const counter of result.counterAttacks) {
    await showOneCounterAttackAnimated(counter, enemyHpMap, result.enemies);
  }
}

/**
 * Build a map of ally HP before enemy attacks for progressive DOM updates.
 * Reconstructs pre-enemy-attack HP by adding back damage dealt to each ally.
 * @param {Object} result - Combat cycle result from server
 * @returns {Object} Map of creatureId -> { hp, maxHp }
 */
function buildAllyHpMap(result) {
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
function buildEnemyHpMapForPlayerAttacks(result) {
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
function buildMergedInitiativeAttacks(result) {
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
async function showOneEnemyAttackAnimated(result, atk, allyHpMap, halved) {
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
    animatePlayerHurt();
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
    await delay(400);
  }
}

/**
 * Animate enemy attacks against player creatures with real-time HP bar updates.
 * @param {Object} result - Combat cycle result from server
 * @param {Object} allyHpMap - Running ally HP map (mutated in place)
 * @param {boolean} halved - If true, show "halved" damage text (defend mode)
 */
async function showEnemyAttacksAnimated(result, allyHpMap, halved) {
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
async function showNpcSkillAttacksAnimated(result, allyHpMap) {
  if (!result.npcSkillAttacks?.length) return;

  for (const atk of result.npcSkillAttacks) {
    let attackCard = null;

    attackCard = insertNpcAttackCard(atk);

    // Sound + visual effects for damage
    if (atk.damage > 0) {
      playSFX('player-hit');
      showDamageNumber(atk.damage, true, false);
      animatePlayerHurt();
    }

    // Update ally HP after NPC damage
    if (atk.damage > 0 && allyHpMap && allyHpMap[atk.targetId]) {
      allyHpMap[atk.targetId].hp = Math.max(0, allyHpMap[atk.targetId].hp - atk.damage);
      updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
    }

    if (attackCard) {
      await waitForCardTap(attackCard);
    } else {
      await delay(800);
    }
  }
}

/**
 * Show KO swap messages with death/swap-in animations (Bug F).
 * @param {Object} result - Combat cycle result from server
 */
async function showKoSwapAnimations(result) {
  if (!result.koSwaps?.length && !result.koRemovals?.length) return;

  // Swaps: dead creature replaced by reserve
  for (const swap of (result.koSwaps || [])) {
    // Animate the KO'd creature dying
    const koIndex = swap.slot ?? -1;
    if (koIndex >= 0) {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const dyingSlot = slots[koIndex];
      if (dyingSlot) {
        dyingSlot.classList.add('creature-dying');
      }
      // PixiJS KO animation (runs alongside CSS animation)
      animateKO('player', koIndex);
      await delay(600);
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
    await delay(800);
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
      await delay(800);
    }

    // Re-render formation with surviving creatures
    if (result.creatureParty?.active) {
      await showFormation('player', result.creatureParty.active, { force: true });
    }
  }
}

/**
 * Sync final combat state with server-authoritative values.
 * Updates game state, creature row popup data, enemy HP bars, and ally HP bars.
 * Avoids full updateUI to prevent DOM rebuild flicker.
 * @param {Object} result - Combat cycle result from server
 */
function syncFinalState(result) {
  if (!result.creatureParty && !result.enemies) return;

  const gs = getGameState();
  const updates = { ...gs };
  if (result.creatureParty) {
    updates.run = { ...gs.run, creatureParty: result.creatureParty };
  }
  if (result.enemies && gs.combat) {
    updates.combat = {
      ...gs.combat,
      enemies: result.enemies,
      allies: result.allies || gs.combat.allies,
      turnCount: result.turnCount ?? gs.combat.turnCount
    };
  }
  updateGameState(updates);

  // Keep formation popup data in sync with latest HP
  if (result.creatureParty?.active && updateCreatureRowData) {
    updateCreatureRowData(result.creatureParty.active);
  }
  // Set final HP bars without full DOM rebuild
  if (result.enemies?.length > 1) {
    result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
  } else if (result.enemies?.[0]) {
    characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
  }
  updateCreatureHpBars(result.creatureParty?.active, null);

  // No-op: PixiJS sprites don't leave stale inline transforms
}

// ============ CREATURE COMBAT ORCHESTRATORS ============

/**
 * One player-side attack line (move turn) — effects, HP, party skills, card tap.
 */
async function playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn) {
  let attackCard = null;
  {
    const adaptedAtk = {
      ...atk,
      attackerSkillName: atk.moveName || atk.attackerSkillName,
      attackerSkillEn: atk.moveNameEn || atk.attackerSkillEn,
      attackerSkillReading: atk.moveReading || atk.attackerSkillReading || '',
      attackerElement: atk.moveElement || atk.attackerElement
    };
    attackCard = insertAttackCard(adaptedAtk, false);
  }

  playSFX('attack');
  const creatureSlotEl = findCreatureSlotByAttackerId(atk.attackerId);
  const enemyEl = findEnemyTargetElement(atk.targetId, result.enemies, atk.targetIndex);

  const atkElement = atk.moveElement || atk.attackerElement || 'neutral';
  const atkState = getGameState();
  const atkActiveCreatures = atkState.run?.creatureParty?.active || [];
  const atkAttackerIdx = atk.attackerId ? atkActiveCreatures.findIndex(r => r && r.id === atk.attackerId) : 0;
  const atkTargetIdx = typeof atk.targetIndex === 'number' ? atk.targetIndex : 0;

  const atkEffectivenessType = atk.elementMultiplier > 1 ? 'superEffective' : atk.elementMultiplier < 1 ? 'resisted' : 'normal';
  if (atk.damage > 0 && (creatureSlotEl || getCreatureSprite('player', Math.max(0, atkAttackerIdx)))) {
    playAttackSound(atkElement);
    const tIdx = atk.targetIndex;
    const targetMaxHp = (typeof tIdx === 'number' && enemyHpMap[tIdx]?.maxHp)
      ? enemyHpMap[tIdx].maxHp
      : (result.enemies?.[0]?.maxHp ?? 100);
    await fireCreatureAttackEffect(Math.max(0, atkAttackerIdx), atkTargetIdx, atkElement, atk.damage, targetMaxHp, atkEffectivenessType, () => {
      if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
        enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
        const entry = enemyHpMap[tIdx];
        if (result.enemies.length > 1) {
          characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
        } else {
          characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
        }
      }
    });
    if (enemyEl) combatEvents.emit('creatureHit', { slotEl: enemyEl, side: 'enemy' });
  } else if (atk.damage > 0) {
    animateEnemyHurt();
    const tIdx = atk.targetIndex;
    if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
      enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
      const entry = enemyHpMap[tIdx];
      if (result.enemies.length > 1) {
        characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
      } else {
        characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
      }
    }
  }

  if (atk.healAmount > 0) {
    const drainTargetPos = spritePos('enemy', atkTargetIdx);
    const drainAttackerPos = spritePos('player', Math.max(0, atkAttackerIdx));
    flowParticles(drainTargetPos, drainAttackerPos, { count: 8, color: 0x4CAF50, duration: 600 });
    await wait(600);
    showHealPopup(atk.healAmount, drainAttackerPos);
  }

  const killKey = typeof atk.targetIndex === 'number' ? `idx:${atk.targetIndex}` : `id:${atk.targetId}`;
  if (atk.targetDefeated && !killedEnemies.has(killKey)) {
    killedEnemies.add(killKey);
    // Skip KO animation if this creature is the befriend quiz target (it survived at 1 HP)
    const isBefriendTarget = result.befriendQuizTriggered
      && typeof result.befriendQuiz?.targetIndex === 'number'
      && result.befriendQuiz.targetIndex === atk.targetIndex;
    if (!isBefriendTarget) {
      animateKO('enemy', typeof atk.targetIndex === 'number' ? atk.targetIndex : 0);
    }
    if (result.xpEvents) {
      const xpEvent = result.xpEvents.find(ev =>
        (typeof atk.targetIndex === 'number' && ev.enemyIndex === atk.targetIndex)
        || (typeof atk.targetIndex !== 'number' && ev.enemyId === atk.targetId)
      );
      if (xpEvent) {
        const pending = showXpEvents([xpEvent]);
        if (pending?.length) allPendingMoveLearn.push(...pending);
      }
    }
  }

  if (atk.elementMultiplier > 1) {
    setTimeout(() => showBanner('Super Effective!', 'super', { elementColor: ELEMENT_COLORS[atkElement] || ELEMENT_COLORS.neutral }), 400);
  } else if (atk.elementMultiplier < 1) {
    setTimeout(() => showBanner('Resisted...', 'weak'), 400);
  }

  // Real-time buff/debuff indicators — show immediately when a move applies effects
  if (atk.effectApplied || atk.statChangesApplied) {
    const targetSide = (atk.category === 'buff' || atk.category === 'shield') ? 'player' : 'enemy';
    await showMoveEffectsApplied(atk, targetSide, atkTargetIdx, result);
  }

  await showPartySkillProcs(atk);

  if (attackCard) {
    await waitForCardTap(attackCard);
  } else {
    await delay(800);
  }
}

/**
 * Execute a full turn of creature moves — calls /creature-combat-cycle with 'attack' + moveChoices.
 * @param {Array} choices - Array of { creatureIndex, moveId, targetIndex }
 */
async function executeCreatureMovesTurn(choices) {
  if (!combatActive || playerAttackPending || getEnemyDialogueActive()) return;
  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      // --- Intent Log: record the action about to be taken ---
      const _log = getLog();
      if (_log) {
        const gs = getGameState();
        const allies = gs?.combat?.allies || gs?.run?.creatureParty?.active || [];
        const enemies = gs?.combat?.enemies || [];
        const moveDesc = choices.map(c => {
          const creature = allies[c.creatureIndex];
          const moveName = creature?.moves?.find(m => m.id === c.moveId)?.nameEn || '?';
          const target = c.targetIndex >= 0 ? (enemies[c.targetIndex]?.nameEn || '?') : 'AoE/Self';
          return `${creature?.nameEn || '?'}→${moveName}→${target}`;
        }).join(', ');
        _log.act(`Attack: ${moveDesc}`);
      }

      const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'attack', moveChoices: choices })
      });
      const result = await response.json();

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Move turn error:', result.error);
        playerAttackPending = false;
        return;
      }

      // --- Intent Log: record expected outcome from server response ---
      if (_log) {
        const aliveEnemies = (result.enemies || []).filter(e => e.hp > 0 && !e.befriended).length;
        const aliveAllies = (result.allies || []).filter(a => a.hp > 0).length;
        _log.expect(`Enemies alive: ${aliveEnemies}/${(result.enemies || []).length}. Allies alive: ${aliveAllies}/${(result.allies || []).length}`);

        for (const atk of [...(result.playerAttacks || []), ...(result.enemyAttacks || [])]) {
          if (atk.targetDefeated) {
            const side = result.playerAttacks?.includes(atk) ? 'enemy' : 'ally';
            _log.expect(`KO: ${side}[${atk.targetIndex}] — sprite fade, HP bar zero`);
          }
        }
      }

      // --- Game Rule Validation: check server result for logic invariants ---
      if (window.__inspector?.checkGameRules) {
        const ruleCheck = window.__inspector.checkGameRules(result);
        if (!ruleCheck.ok) {
          const log = getLog();
          for (const m of ruleCheck.mismatches) {
            if (log) log.expect(`RULE VIOLATION: ${m.detail}`);
            console.warn(`[RULE] ${m.type}: ${m.detail}`);
          }
        }
      }

      // Store server-provided barks for speech bubbles
      _currentRoundBarks = result.barks || [];

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await showRoundStartEvents(result);

      // Track enemy HP for progressive updates (slot index — duplicate species share id)
      const enemyHpMap = buildEnemyHpMapForPlayerAttacks(result);
      const allyHpMap = buildAllyHpMap(result);
      const merged = buildMergedInitiativeAttacks(result);
      const allPendingMoveLearn = [];
      const killedEnemies = new Set();

      if (merged.length > 0) {
        for (const { side, atk } of merged) {
          if (side === 'player' && atk.type === 'counter') {
            await showOneCounterAttackAnimated(atk, enemyHpMap, result.enemies);
          } else if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn);
          } else {
            await showOneEnemyAttackAnimated(result, atk, allyHpMap, false);
          }
        }
      }
      syncStatusIconsFromResult(result);

      // === BEFRIEND NAME QUIZ CHECK ===
      // If the killing blow triggered the befriend quiz, show it instead of continuing combat
      if (result.befriendQuizTriggered && result.befriendQuiz) {
        syncFinalState(result);
        playerAttackPending = false;
        await befriend.renderBefriendQuiz(result.befriendQuiz, result);
        return;
      }

      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcData = getCombatNpcData();
        if (npcData) {
          await playNpcSkillAnimation(npcData, showNpcSprite, hideNpcSprite, async () => {
            await showNpcSkillAttacksAnimated(result, allyHpMap);
          }, result.enemies);
        } else {
          await delay(400);
          await showNpcSkillAttacksAnimated(result, allyHpMap);
        }
      }

      // Enemy attacks (only if not already shown in initiative merge)
      const enemyShownInMerge = merged.some(e => e.side === 'enemy');
      if (!enemyShownInMerge && result.enemyAttacks?.length > 0) {
        await delay(400);
        await showEnemyAttacksAnimated(result, allyHpMap, false);
      }

      // Counter attack animations — only if not already shown in initiative merge
      const countersShownInMerge = merged.some(e => e.side === 'player' && e.atk.type === 'counter');
      if (!countersShownInMerge) {
        await showCounterAttacks(result, enemyHpMap);
      }

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync state
      syncFinalState(result);

      // Handle pending move learns (after state sync so creature data is current)
      if (allPendingMoveLearn.length > 0) {
        await processPendingMoveLearn(allPendingMoveLearn);
      }

      // --- Intent Log: check UI consistency after all animations ---
      if (window.__inspector) {
        const scanResult = window.__inspector.checkCreatures();
        const __log = getLog();
        if (__log) {
          if (scanResult.ok) {
            __log.check({ ok: true });
          } else {
            const first = scanResult.mismatches[0];
            __log.check({ ok: false, tag: first.type, detail: first.detail });
            for (const m of scanResult.mismatches.slice(1)) {
              console.warn(`[CHK] additional: ${m.type}: ${m.detail}`);
            }
          }
        }
      }

      if (result.combatEnded) {
        // --- Intent Log: combat ended ---
        const __logEnd = getLog();
        if (__logEnd) {
          __logEnd.act(`Combat ended: ${result.victory ? 'VICTORY' : 'DEFEAT'}`);
          __logEnd.expect('All combat sprites cleared. Combat UI removed.');
        }
        if (result.victory) await delay(500);
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Start next turn's move selection
      await delay(600);
      startMoveSelection();

    } catch (error) {
      console.error('Move turn error:', error);
      playerAttackPending = false;
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

/**
 * Execute creature defend — calls /creature-combat-cycle with 'defend'
 * Defend: all creatures regen MP, enemies attack with 50% damage
 */
async function executeCreatureDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      // --- Intent Log: record the defend action ---
      const log = getLog();
      if (log) {
        log.act('Defend: all creatures defend this turn');
        log.expect('Enemy attacks only. No ally attacks this turn.');
      }

      const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'defend' })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Creature defend result:', { enemyAttacks: result.enemyAttacks?.length });

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Creature defend error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      // --- Game Rule Validation: check server result for logic invariants ---
      if (window.__inspector?.checkGameRules) {
        const ruleCheck = window.__inspector.checkGameRules(result);
        if (!ruleCheck.ok) {
          const log = getLog();
          for (const m of ruleCheck.mismatches) {
            if (log) log.expect(`RULE VIOLATION: ${m.detail}`);
            console.warn(`[RULE] ${m.type}: ${m.detail}`);
          }
        }
      }

      // Store server-provided barks for speech bubbles
      _currentRoundBarks = result.barks || [];

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await showRoundStartEvents(result);

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defending')}</div>`;
      }

      // Update charge bars immediately for defend (BUG A fix)
      if (result.creatureParty?.active) {
        updateCreatureHpBars(result.creatureParty.active, null);
      }
      await delay(600);

      // Enemy attacks phase (50% damage already applied server-side)
      const allyHpMap = buildAllyHpMap(result);
      await showEnemyAttacksAnimated(result, allyHpMap, true);

      // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
      const enemyHpMap = {};
      (result.enemies || []).forEach((e, i) => {
        if (e) enemyHpMap[i] = { hp: e.hp, maxHp: e.maxHp, index: i };
      });
      await showCounterAttacks(result, enemyHpMap);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync authoritative state from server
      syncFinalState(result);

      // --- Intent Log: check UI consistency after defend animations ---
      if (window.__inspector) {
        const scanResult = window.__inspector.checkCreatures();
        const log = getLog();
        if (log) {
          if (scanResult.ok) {
            log.check({ ok: true });
          } else {
            const first = scanResult.mismatches[0];
            log.check({ ok: false, tag: first.type, detail: first.detail });
          }
        }
      }

      // Check combat end
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;

      // Start next turn's move selection
      await delay(600);
      startMoveSelection();

    } catch (error) {
      console.error('Creature defend error:', error);
      enemyAttackPending = false;
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
      });
      const result = await response.json();
      console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }


      // Show enemy's attack result
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        // Show enemy damage in action area (big red text)
        showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      // Pause combat - wait for vocab review before next cycle
      enemyAttackPending = false;
      combatPausedForVocab = true;
      // Delay before showing dual cards so player can see the damage
      await delay(1440);
      // Show next dual cards for the next review
      showNextDualCardsFromQueue();
      console.log('[Combat] Paused for vocab review. Review a word to continue.');

    } catch (error) {
      console.error('Enemy attack error:', error);
      // Don't trigger defeat for errors - recover by showing dual cards
      enemyAttackPending = false;

      // Recovery: pause for vocab and show dual cards so player can continue
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from enemy attack error, showing dual cards');
      }
    }
  });
}

/**
 * Resume combat after vocab review - triggers next attack cycle
 * @param {number} grade - Review grade (1-5)
 * @param {string} actionType - 'attack' or 'defend'
 */
export function resumeCombatAfterVocab(grade, actionType = 'attack') {
  if (!combatActive || !combatPausedForVocab) return;

  logger.info('[CombatLoop] Word reviewed, continuing:', { grade, actionType });
  combatPausedForVocab = false;
  pendingActionType = actionType;

  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;

  // Old befriend action handler disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // if (actionType === 'befriend') {
  //   befriend.executeBefriendAction();
  // } else
  if (isCreatureCombat) {
    // Creature combat: use creature-specific functions
    if (actionType === 'defend') {
      executeCreatureDefendThenPause();
    } else {
      executeCreatureMovesTurn([]);
    }
  } else {
    // Legacy combat: use original functions
    if (actionType === 'defend') {
      executeDefendThenPause();
    } else {
      executePlayerAttack();
    }
  }
}

/**
 * Execute defend action: skip player attack, enemy attacks with reduced damage
 */
async function executeDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', actionType: 'defend', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[Combat] Defend - Enemy attack (50% damage):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defendingCreature')}</div>`;
      }
      await delay(600);

      // Show enemy's attack result (damage already halved by backend)
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;
      combatPausedForVocab = true;
      await delay(1440);
      showNextDualCardsFromQueue();
      logger.info('[Combat] Defend complete. Paused for vocab review.');

    } catch (error) {
      console.error('Defend action error:', error);
      enemyAttackPending = false;

      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from defend error, showing dual cards');
      }
    }
  });
}


/**
 * Stop combat loop and show results
 * @param {Object} result - Combat result data
 */
export async function stopCombatLoop(result) {
  logger.info('[CombatLoop] Combat ended:', { victory: result?.victory });
  const gameState = getGameState();

  // Clear both attack timers
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }

  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  _currentRoundBarks = [];

  // Fix A: Immediately mark combat inactive on the client so derivePhase()
  // stops returning 'combat'. Any stray updateUI() during the victory window
  // will now hit the non-combat branch and call hideEnemies() instead of
  // re-rendering defeated enemies as live sprites.
  const gs = getGameState();
  if (gs.combat) {
    updateGameState({ ...gs, combat: { ...gs.combat, active: false } });
  }

  if (result?.victory) combatEvents.emit('victory');

  // Final cleanup: clear PixiJS status VFX and canvas status labels
  clearAllStatusVfx();
  clearAllPixiStatusLabels();

  // Resume parallax scroll and hide defeated enemy PixiJS sprites.
  // Player sprites are kept alive — they should remain visible through the
  // victory screen and into the next room. Destroying them here creates a
  // 1500ms+ gap where DOM info boxes (name/HP bars) float with no creature
  // image underneath (the "ghost formation" effect).
  setScrollState('accelerating');
  pixiHideFormation('enemy');

  // Hide word practice cards and close modal
  wordPractice.hideWordCards();
  wordPractice.closeWordInputModal();

  // Post-combat refresh: update cache with fresh states for reviewed words
  const reviewedWords = wordPractice.getReviewedWordsThisCombat();
  if (reviewedWords.length > 0) {
    const apiKeys = settings.getApiKeys();
    fetch(`${API_BASE}/api/game/post-combat-refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        words: reviewedWords,
        jpdbApiKey: apiKeys.jpdbApiKey
      })
    }).then(r => r.json()).then(data => {
      console.log(`[Combat] Post-combat refresh: ${data.refreshed} words updated`);
    }).catch(err => {
      console.warn('[Combat] Post-combat refresh failed:', err);
    });
    wordPractice.clearReviewedWordsThisCombat();
  }

  // Brief pause before narration (let final damage numbers display)
  await delay(720);

  // Fix C: Clear stale DOM enemy formation slots. Pixi sprites were already
  // removed at pixiHideFormation('enemy') above; this closes the window where
  // leftover DOM slots could trigger the showFormation() dedup path to
  // recreate Pixi sprites. The 720ms delay above lets damage numbers finish.
  const enemyFormationEl = document.getElementById('enemy-formation');
  if (enemyFormationEl) enemyFormationEl.innerHTML = '';

  // --- Intent Log: post-combat cleanup check ---
  if (window.__inspector) {
    const postScan = window.__inspector.checkCreatures();
    const postLog = getLog();
    if (postLog) {
      if (postScan.ok) {
        postLog.check({ ok: true });
      } else {
        const first = postScan.mismatches[0];
        postLog.check({ ok: false, tag: first.type, detail: first.detail });
        for (const m of postScan.mismatches.slice(1)) {
          console.warn(`[CHK] post-combat: ${m.type}: ${m.detail}`);
        }
      }
    }
  }

  // Wait for enemy dialogue to be dismissed (e.g., liberated dialogue on victory)
  const dialogueDismissPromise = getDialogueDismissPromise();
  if (dialogueDismissPromise) {
    await dialogueDismissPromise;
  }

  // Kana graduation check disabled — kana combat mode disabled (Task 8.1)
  // if (result?.victory) {
  //   const currentState = getGameState();
  //   if (currentState.meta?.kanaMode) {
  //     try {
  //       const statsResp = await fetch(`${API_BASE}/api/game/kana-stats`, {
  //         headers: getAuthHeaders()
  //       });
  //       const stats = await statsResp.json();
  //       if (stats.graduated) {
  //         await fetch(`${API_BASE}/api/game/kana-mode`, {
  //           method: 'POST',
  //           headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  //           body: JSON.stringify({ enabled: false })
  //         });
  //         const current = getGameState();
  //         updateGameState({ ...current, meta: { ...current.meta, kanaMode: false } });
  //         await narration.showNarration(
  //           "Incredible progress! You've learned the entire Hiragana alphabet. " +
  //           "I've upgraded your Translator — from now on, you'll be able to command " +
  //           "your creatures directly using Japanese vocabulary!",
  //           { speaker: 'Cid' }
  //         );
  //       }
  //     } catch (e) {
  //       console.error('[KanaMode] Graduation check failed:', e);
  //     }
  //   }
  // }

  // Animate enemy defeat
  if (result.victory) {
    animateEnemyDefeat();
    playSFX('enemy-defeat');
  }

  // Show victory or defeat modal
  if (result.victory) {
    playSFX('victory');
    const gs = getGameState();
    const isCreatureCombat = gs?.combat?.isCreatureCombat;
    if (isCreatureCombat && gs?.combat?.npcId) {
      await runNpcDialogue();
    }
    if (isCreatureCombat && showPostCombatShop) {
      await showPostCombatShop();
    }
    showVictoryModal(result);
    wordPractice.prefetchCombatWords();
  } else {
    showGameOverModal(result);
  }

  // updateUI() removed: the phase is still 'combat' here, so updateScene()
  // would re-render defeated enemies as live sprites (ghost bug).
  // showVictoryModal's timer calls loadGameState() + updateUI() with
  // the correct new phase; showGameOverModal handles its own UI.
}

/**
 * Show NPC greeting before combat
 */
export async function showNpcGreeting(npcData) {
  if (!npcData?.greeting) return;
  const npcName = npcData.nameEn || npcData.name;
  if (showNpcSprite) showNpcSprite(npcName, npcData.id, npcData);
  // Play greeting audio if available (fire-and-forget, don't block narration)
  if (npcData.greetingTts && npcData.userId) {
    playDialogueAudio(npcData.userId, npcData.greetingTts);
  }
  await narration.showNarration(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  if (hideNpcSprite) hideNpcSprite();
  // Re-render combat scene — hideNpcSprite clears the enemy sprite area
  if (updateUI) updateUI();
}

let npcDialogueActive = false;
export function isNpcDialogueActive() { return npcDialogueActive; }

/**
 * Run the full NPC post-combat dialogue flow.
 * Called from combat victory and also from updateScene() on page reload recovery.
 */
export async function runNpcDialogue() {
  if (npcDialogueActive) return;
  if (!apiStartNpcDialogue) return;
  npcDialogueActive = true;

  try {
    const dialogueData = await apiStartNpcDialogue();
    if (!dialogueData) return;

    if (dialogueData.mode === 'defeat_line') {
      // v1: single i+1 defeat line — show in narration, tap to dismiss
      const { npc, line } = dialogueData;
      const npcName = npc.nameEn || npc.name;

      if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);

      // Render tokenized defeat line (same as all other NPC dialogue)
      const html = renderJpSentence(line.tokens, getKnownWords(), new Map(), line.overrides || {}, dialogueData.useKanji || false);
      await narration.showNarration(html, { speaker: npcName, html: true });

      // Keep NPC sprite visible — skill selection phase will show it,
      // and it slides out after the player picks a skill.
    } else {
      // Future: quiz mode — original flow preserved here
      const { npc, freed, rounds, userId, greetingTts, freedTts } = dialogueData;
      const npcName = npc.nameEn || npc.name;

      if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);

      if (freedTts && userId) {
        playDialogueAudio(userId, freedTts);
      }
      await narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true });

      let totalDelta = 0;

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];

        if (round.npcLineTts && userId) {
          playDialogueAudio(userId, round.npcLineTts);
        }
        await narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true });

        const selectedIndex = await renderButtonsAsync(
          round.options.map(o => ({
            label: renderEnFirst(typeof o === 'string' ? o : o.text),
          }))
        );

        if (round.options[selectedIndex]?.tts && userId) {
          playDialogueAudio(userId, round.options[selectedIndex].tts);
        }

        if (narration.forceHideNarration) narration.forceHideNarration();

        const result = await apiRespondNpcDialogue(i, selectedIndex);
        if (!result) break;

        if (result.dialogueComplete) {
          totalDelta = result.totalDelta;
          if (result.state) {
            updateGameState(result.state);
          }
          break;
        }
      }

      if (hideNpcSprite) hideNpcSprite();

      showBondSummary(npcName, totalDelta);
      await delay(2200);
      document.querySelector('.bond-summary')?.remove();
    }
  } finally {
    npcDialogueActive = false;
  }
}

function showBondFeedback(tone, delta) {
  const existing = document.querySelector('.bond-feedback');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `bond-feedback ${tone}`;

  const heart = tone === 'positive' ? '\u2764\uFE0F' : tone === 'negative' ? '\uD83D\uDC94' : '\uD83E\uDD0D';
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '';

  el.innerHTML = `${heart}${deltaText ? `<span class="bond-delta">${deltaText}</span>` : ''}`;

  const sceneArea = document.getElementById('scene-area') || document.querySelector('.scene-area');
  if (sceneArea) {
    sceneArea.appendChild(el);
  }
}

function showBondSummary(npcName, totalDelta) {
  const el = document.createElement('div');
  el.className = 'bond-summary';

  const sign = totalDelta > 0 ? '+' : '';
  const cls = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';

  el.innerHTML = `${npcName}\u3068\u306E\u7D46 <span class="bond-value ${cls}">${sign}${totalDelta}</span>`;
  document.body.appendChild(el);
}

