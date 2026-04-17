import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { renderJpSentence, renderEnFirst, getKnownWords, entityToToken } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import {
  screenShake, screenFlash, hitStop, recoil as pixiRecoil,
  lunge as pixiLunge, burstParticles, flowParticles,
} from '../pixi/effects.js';
import {
  showDamageNumber as pixiDamageNumber, popupBuff, popupDebuff, popupSkillProc,
  showXpPopup as pixiXpPopup, showLevelUpPopup as pixiLevelUpPopup,
  showHealPopup, showPoisonTick
} from '../pixi/text.js';
import { getCreatureSprite, showActiveGlow, clearActiveGlow, hideFormation as pixiHideFormation, animateKO, animateLevelUp, setWalking } from '../pixi/formation.js';
import { showFormation } from './combat-dom.js';
import { setScrollState } from '../pixi/parallax.js';
import { wait } from '../pixi/tween.js';
import { playAttackSound } from './combat-audio.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { BattleScene } from '../scenes/battle-scene.js';
import { ExplorationScene } from '../scenes/exploration-scene.js';

import { toRomaji } from './romaji.js';
import { combatEvents } from './combat-events.js';
import { SC_NAMES } from './combat-ui-utils.js';
import { getTutorialNarration, getBefriendWrongNarration } from './tutorial-copy.js';
import { restoreBefriendQuizEnemyUi } from './befriend-quiz-state.js';

// ============ INTENT LOG HELPER ============
function getLog() { return window.__intentLog; }

// ============ SERVER-PROVIDED BARKS ============
let _currentRoundBarks = [];

/** Get the barks returned by the latest combat cycle response. */
export function getCurrentBarks() { return _currentRoundBarks; }

import { playDialogueAudio } from '../tts.js';
import { init as initMoveSelect, showMoves, clear as clearMoveSelect, setActiveLabel } from './move-select.js';
import { init as initTargetSelect, showEnemies, showAllies, clear as clearTargetSelect } from './target-select.js';
import { showLearnPrompt } from './move-learn.js';
import { renderButtonsAsync } from './ui-components.js';
import { playNpcSkillAnimation } from './room-transition.js';
import * as befriend from './befriend.js';
import * as vfx from './combat-vfx.js';
import * as npcDialogueUI from './npc-dialogue-ui.js';
import {
  insertAttackCard, insertNpcAttackCard, waitForCardTap,
  showAttackCardAndWait, ATTACK_CARD_TIMING, ELEMENT_THEME,
} from './attack-card.js';

// Re-export for barrel compatibility (index.js → combatLoop.insertAttackCard)
export { insertAttackCard, waitForCardTap } from './attack-card.js';

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
      await vfx.enemyCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    } else {
      await vfx.fireCreatureAttackEffect(attackerIndex, targetIndex, element, atk.damage, targetMaxHp, effectivenessType, onImpact);
    }
  }

  // Damage number on the target (already rendered by vfx.impactEffect inside the attack effect functions)

  // Stat stage change popups
  if (atk.statChangesApplied) {

    for (const [stat, change] of Object.entries(atk.statChangesApplied)) {
      if (change === 0) continue;
      const dir = change > 0 ? `+${change}` : `${change}`;
      const text = `${SC_NAMES[stat] || stat} ${dir}`;
      const pos = vfx.spritePos(targetSide, targetIndex);
      if (change > 0) popupBuff(text, pos);
      else popupDebuff(text, pos);
    }
  }

  // Party skill procs (bonus damage, heals, haste, shields)
  const resolveAllies = () => overrideAllies || getGameState()?.combat?.allies || getGameState()?.run?.creatureParty?.active || [];
  const resolveEnemies = () => overrideEnemies || getGameState()?.combat?.enemies || [];
  await vfx.showAttackPartySkillProcs(atk, {
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
    await vfx.effectDelay(800);
  }

  return attackCard;
}

// ============ MODULE STATE ============

// Combat state
let combatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
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
let characterUI = null;

// Combat UI functions
let showDamageNumber = null;
let animateEnemyHurt = null;
let animatePlayerHurt = null;
let animateEnemyDefeat = null;
let updateActionPanel = null;
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
  characterUI = callbacks.characterUI;

  // Combat UI functions
  showDamageNumber = callbacks.showDamageNumber;
  animateEnemyHurt = callbacks.animateEnemyHurt;
  animatePlayerHurt = callbacks.animatePlayerHurt;
  animateEnemyDefeat = callbacks.animateEnemyDefeat;
  updateActionPanel = callbacks.updateActionPanel;
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
    showOneEnemyAttackAnimated: vfx.showOneEnemyAttackAnimated,
    buildAllyHpMap: vfx.buildAllyHpMap,
    updateCreatureHpBars: vfx.updateCreatureHpBars,
    spritePos: vfx.spritePos,
    apiBefriendReplace: callbacks.apiBefriendReplace,
    apiGetBefriendConversation: callbacks.apiGetBefriendConversation,
    apiSubmitBefriendAnswer: callbacks.apiSubmitBefriendAnswer,
  });

  vfx.init({
    getGameState: () => getGameState(),
    delay,
    characterUI,
    animatePlayerHurt,
    showDamageNumber,
  });

  npcDialogueUI.init({
    narration,
    delay,
    showNpcSprite,
    hideNpcSprite,
    updateUI: () => updateUI(),
    updateGameState: (s) => updateGameState(s),
    apiStartNpcDialogue,
    apiRespondNpcDialogue,
  });
}

// Re-export NPC dialogue for barrel compatibility
export const showNpcGreeting = (...args) => npcDialogueUI.showNpcGreeting(...args);
export const isNpcDialogueActive = () => npcDialogueUI.isNpcDialogueActive();
export const runNpcDialogue = (...args) => npcDialogueUI.runNpcDialogue(...args);

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
  moveChoices = [];
  currentCreatureIndex = 0;
  promptNextCreature();
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
  // PIXI status label cleanup is handled by BattleScene.beforeExit via
  // registry disposal when we transition to ExplorationScene.
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
  }
}

/**
 * Find a creature slot element by creature ID (matches against game state).
 * Works for both allied creature slots (attacker) and targeted creature slots.
 * @param {string} creatureId - The creature's ID
 * @returns {Element|null} The .formation-slot DOM element, or null
 */
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
          pixiXpPopup(grant.xp, vfx.spritePos('player', index));
        }
      }
    }

    // Show level-up popups
    if (event.levelUps) {
      for (const lu of event.levelUps) {
        const index = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
        if (index >= 0 && slots[index]) {
          // Slight delay so it appears after XP popup
          setTimeout(() => pixiLevelUpPopup(lu.newLevel, vfx.spritePos('player', index)), 400);
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

  // Transition to BattleScene so PIXI sprites/status-vfx/formation ticker are
  // owned by the scene registry. parallaxSpeed=0: during combat,
  // syncBattleStageParallax sets setScrollState('encounter') which halts
  // layer scrolling (currentSpeed=0); BattleScene's scene-level parallax gate
  // likewise stays off (only the sky drift path runs via legacy updateParallax,
  // which is already gated off while no scene has startParallax()'d).
  const mgr = getSceneManager();
  const gs = getGameState();
  try {
    await mgr.transition(BattleScene, {
      allies:  gs.combat?.allies  ?? [],
      enemies: gs.combat?.enemies ?? [],
      parallaxSpeed: 0,
    });
  } catch (err) {
    combatActive = false;
    console.error('[CombatLoop] BattleScene transition failed, aborting combat start', err);
    return;
  }

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
          await vfx.impactEffect(pa.damage, 'enemy', 0, enemyMaxHp, undefined, undefined, () => {
            characterUI.updateEnemyHPBar(result.enemyHp);
          });
        }
      }

      // Sync HP bars for dodge/miss (no vfx.impactEffect fires, but server state may have changed)
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

      // Recovery: restart move selection so player can continue
      if (combatActive) {
        logger.warn('[CombatLoop] Recovered from player attack error, restarting move selection');
      }
    }
  });
}

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
  vfx.updateCreatureHpBars(result.creatureParty?.active, null);

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
  const creatureSlotEl = vfx.findCreatureSlotByAttackerId(atk.attackerId);
  const enemyEl = vfx.findEnemyTargetElement(atk.targetId, result.enemies, atk.targetIndex);

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
    await vfx.fireCreatureAttackEffect(Math.max(0, atkAttackerIdx), atkTargetIdx, atkElement, atk.damage, targetMaxHp, atkEffectivenessType, () => {
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
    const drainTargetPos = vfx.spritePos('enemy', atkTargetIdx);
    const drainAttackerPos = vfx.spritePos('player', Math.max(0, atkAttackerIdx));
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

  // Real-time buff/debuff indicators — show immediately when a move applies effects
  if (atk.effectApplied || atk.statChangesApplied) {
    const targetSide = (atk.category === 'buff' || atk.category === 'shield') ? 'player' : 'enemy';
    await vfx.showMoveEffectsApplied(atk, targetSide, atkTargetIdx, result);
  }

  await vfx.showPartySkillProcs(atk, enemyHpMap);

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
      await vfx.showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await vfx.showRoundStartEvents(result);

      // Track enemy HP for progressive updates (slot index — duplicate species share id)
      const enemyHpMap = vfx.buildEnemyHpMapForPlayerAttacks(result);
      const allyHpMap = vfx.buildAllyHpMap(result);
      const merged = vfx.buildMergedInitiativeAttacks(result);
      const allPendingMoveLearn = [];
      const killedEnemies = new Set();

      if (merged.length > 0) {
        for (const { side, atk } of merged) {
          if (side === 'player' && atk.type === 'counter') {
            await vfx.showOneCounterAttackAnimated(atk, enemyHpMap, result.enemies);
          } else if (side === 'player') {
            await playOnePlayerAttackInMoveTurn(result, atk, enemyHpMap, killedEnemies, allPendingMoveLearn);
          } else {
            await vfx.showOneEnemyAttackAnimated(result, atk, allyHpMap, false);
          }
        }
      }

      // Catch-all KO: ensure all dead enemies get their KO animation, even if killed
      // by party skill chain damage (e.g. Arc Strike) that doesn't set targetDefeated.
      if (result.enemies) {
        for (let i = 0; i < result.enemies.length; i++) {
          const e = result.enemies[i];
          if (e && e.hp <= 0 && !e.befriended && !killedEnemies.has(`idx:${i}`)) {
            killedEnemies.add(`idx:${i}`);
            animateKO('enemy', i);
          }
        }
      }

      vfx.syncStatusIconsFromResult(result);

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
            await vfx.showNpcSkillAttacksAnimated(result, allyHpMap);
          }, result.enemies);
        } else {
          await delay(400);
          await vfx.showNpcSkillAttacksAnimated(result, allyHpMap);
        }
      }

      // Enemy attacks (only if not already shown in initiative merge)
      const enemyShownInMerge = merged.some(e => e.side === 'enemy');
      if (!enemyShownInMerge && result.enemyAttacks?.length > 0) {
        await delay(400);
        await vfx.showEnemyAttacksAnimated(result, allyHpMap, false);
      }

      // Counter attack animations — only if not already shown in initiative merge
      const countersShownInMerge = merged.some(e => e.side === 'player' && e.atk.type === 'counter');
      if (!countersShownInMerge) {
        await vfx.showCounterAttacks(result, enemyHpMap);
      }

      // KO swap animations
      await vfx.showKoSwapAnimations(result);

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
      await vfx.showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await vfx.showRoundStartEvents(result);

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defending')}</div>`;
      }

      // Update charge bars immediately for defend (BUG A fix)
      if (result.creatureParty?.active) {
        vfx.updateCreatureHpBars(result.creatureParty.active, null);
      }
      await delay(600);

      // Enemy attacks phase (50% damage already applied server-side)
      const allyHpMap = vfx.buildAllyHpMap(result);
      await vfx.showEnemyAttacksAnimated(result, allyHpMap, true);

      // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
      const enemyHpMap = {};
      (result.enemies || []).forEach((e, i) => {
        if (e) enemyHpMap[i] = { hp: e.hp, maxHp: e.maxHp, index: i };
      });
      await vfx.showCounterAttacks(result, enemyHpMap);

      // KO swap animations
      await vfx.showKoSwapAnimations(result);

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
        vfx.showEnemyDamageDisplay(ea);
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

    } catch (error) {
      console.error('Enemy attack error:', error);
      enemyAttackPending = false;
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
        vfx.showEnemyDamageDisplay(ea);
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

    } catch (error) {
      console.error('Defend action error:', error);
      enemyAttackPending = false;
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

  // PIXI status VFX + canvas status label cleanup is now handled by
  // BattleScene.beforeExit via registry disposal when we transition to
  // ExplorationScene below (end of this function).

  // Resume parallax scroll and hide defeated enemy PixiJS sprites.
  // Player sprites are kept alive — they should remain visible through the
  // victory screen and into the next room. Destroying them here creates a
  // 1500ms+ gap where DOM info boxes (name/HP bars) float with no creature
  // image underneath (the "ghost formation" effect).
  setScrollState('accelerating');
  setWalking(true);
  pixiHideFormation('enemy');

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
      await npcDialogueUI.runNpcDialogue();
    }
    if (isCreatureCombat && showPostCombatShop) {
      await showPostCombatShop();
    }
    showVictoryModal(result);
  } else {
    showGameOverModal(result);
  }

  // Transition to ExplorationScene so BattleScene.beforeExit disposes of all
  // scene-owned PIXI resources (formation sprites, status VFX, HP pills,
  // formation ticker, creature-row listeners) via the registry. The
  // showVictoryModal/showGameOverModal calls above kick off async work that
  // loads the next phase's game state and calls updateUI() — by that point
  // the active scene is ExplorationScene.
  // Note: roomId here is the index into run.rooms (the client state's
  // property is `currentRoom`). Task 17 will wire ExplorationScene to render
  // the room; for now the scene simply stores it.
  const roomId = getGameState()?.run?.currentRoom ?? null;
  try {
    await getSceneManager().transition(ExplorationScene, { roomId });
  } catch (err) {
    console.error('[CombatLoop] ExplorationScene transition failed — reload to recover', err);
  }

  // updateUI() removed: the phase is still 'combat' here, so updateScene()
  // would re-render defeated enemies as live sprites (ghost bug).
  // showVictoryModal's timer calls loadGameState() + updateUI() with
  // the correct new phase; showGameOverModal handles its own UI.
}

/**
 * Show NPC greeting before combat
 */
