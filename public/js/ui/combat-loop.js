/**
 * @file combat-loop.js - Turn-Based Combat Orchestration
 *
 * PURPOSE:
 * Manages the vocab-pause turn-based combat system. Each turn requires the
 * player to review a vocabulary word before attacking. Combat flow:
 * word review -> player attack -> 400ms delay -> enemy attack -> pause -> repeat
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with game state, UI, and API callbacks
 * - startCombatLoop(): Begin combat, fetch chips, show first flash card
 * - executePlayerAttack(): Process player attack
 * - executeEnemyAttackThenPause(): Enemy attacks then pauses for vocab
 * - resumeCombatAfterVocab(): Continue combat after word review
 * - stopCombatLoop(result): End combat, show narration and victory/defeat
 * - isCombatActive(), isCombatPausedForVocab(): State getters
 * - cleanupCombat(): Reset state without showing results
 *
 * DEPENDENCIES:
 * - ../audio.js: Sound effects (attack, player-hit, victory)
 * - ../api.js: getAuthHeaders for authenticated requests
 * - Callbacks: wordPractice, characterUI, settings, narration modules
 *
 * COMBAT MATH DISPLAY:
 * Shows damage numbers with tiered visual feedback.
 */

import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { logger } from '../logger.js';
import {
  impactEnemyEffect,
  playerHitEffect,
  updateHpCriticalState,
  delay as effectDelay,
  getDamageTier,
  getTierClassName,
  fireRobotAttackEffect,
  enemyRobotAttackEffect,
  showXpPopup,
  showLevelUpPopup,
  playUltimateAnimation,
  poisonTickEffect
} from './combat-effects.js';
import { playAttackSound, playUltimateSound } from './combat-audio.js';
import { configureRobotImg } from './sprite-utils.js';
import { t } from './i18n.js';

// ============ VOCAB ATTACK CARD ============

const ELEMENT_COLORS_VOCAB = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3'
};

const ACTION_ICON_BASE = '/assets/sprites/actions';

/**
 * Build HTML for the vocab attack card shown when a creature attacks.
 * @param {Object} atk - Attack object from server (with vocab fields)
 * @param {boolean} isEnemy - Whether this is an enemy attack
 * @param {string} effectKey - i18n key for damage text
 * @returns {string} HTML string
 */
function buildVocabAttackCard(atk, isEnemy, effectKey) {
  const elementColor = ELEMENT_COLORS_VOCAB[atk.attackerElement] || '#aaa';
  const enemyClass = isEnemy ? ' enemy' : '';

  // Creature sprite (24px mini version)
  const spriteUrl = `/assets/sprites/robots/${atk.attackerId}-idle.webp`;
  const spriteFallback = `/assets/sprites/robots/${atk.attackerId}.webp`;

  // Action icon from skill English name
  const skillSlug = (atk.attackerSkillEn || '').toLowerCase().replace(/\s+/g, '-');
  const actionIconUrl = `${ACTION_ICON_BASE}/${skillSlug}.webp`;

  return `<div class="vocab-attack-card${enemyClass}" style="--vocab-card-element-color: ${elementColor}">
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${spriteUrl}" onerror="this.src='${spriteFallback}'" alt="">
      <span class="vocab-attack-text">${atk.attackerNameJp || atk.attackerName}</span>
    </div>
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${spriteUrl}" onerror="this.src='${spriteFallback}'" alt="">
      <span class="vocab-attack-text">${atk.attackerBaseWord || ''}</span>
    </div>
    <div class="vocab-attack-row">
      <img class="vocab-attack-icon" src="${actionIconUrl}" onerror="this.style.display='none'" alt="">
      <span class="vocab-attack-text">${atk.attackerSkillName || ''}</span>
    </div>
    <div class="combat-damage-line">${t(effectKey, atk.attackerName, atk.damage)}</div>
  </div>`;
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
let apiRobotCombatCycle = null;
let showPostCombatShop = null;
let apiBefriendReplace = null;
let apiGetBefriendConversation = null;
let apiSubmitBefriendAnswer = null;
let apiStartNpcDialogue = null;
let apiRespondNpcDialogue = null;
let showNpcSprite = null;
let hideNpcSprite = null;
let updateRobotRowData = null;

// Utility
let delay = null;

const API_BASE = '';

/** Wrap an async combat animation sequence with the animation-active guard. */
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    return await fn();
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
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
  apiRobotCombatCycle = callbacks.apiRobotCombatCycle;
  showPostCombatShop = callbacks.showPostCombatShop;
  apiBefriendReplace = callbacks.apiBefriendReplace;
  apiGetBefriendConversation = callbacks.apiGetBefriendConversation;
  apiSubmitBefriendAnswer = callbacks.apiSubmitBefriendAnswer;
  apiStartNpcDialogue = callbacks.apiStartNpcDialogue;
  apiRespondNpcDialogue = callbacks.apiRespondNpcDialogue;
  showNpcSprite = callbacks.showNpcSprite;
  hideNpcSprite = callbacks.hideNpcSprite;
  updateRobotRowData = callbacks.updateRobotRowData;
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
}

/**
 * Pause combat and show next vocab cards (for use after ultimates/external actions)
 */
export function pauseForNextVocab() {
  combatPausedForVocab = true;
  showNextDualCardsFromQueue();
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

  // Check if befriend is available (enemy robot <=50% HP; allow even if party full - will prompt release)
  const state = getGameState();
  const isRobotCombat = state.combat?.isRobotCombat;
  const enemies = state.combat?.enemies || [];
  const party = state.run?.robotParty;
  const anyEnemyBefriendable = enemies.some(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5);
  const befriendAvailable = isRobotCombat && anyEnemyBefriendable && party && !state.combat?.npcId;

  if (befriendAvailable && showFlashCards) {
    // Get a third word for the befriend card
    const thirdWord = wordPractice.getNextCombatWord?.();
    if (thirdWord) {
      showFlashCards([words.attackWord, words.defendWord, thirdWord]);
    } else {
      // Not enough words for triple, fall back to dual
      showFlashCards([words.attackWord, words.defendWord]);
    }
  } else if (showFlashCards) {
    showFlashCards([words.attackWord, words.defendWord]);
  }
}

// Keep old function for backwards compatibility / fallback
function showNextFlashCardFromQueue() {
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCards) {
    showFlashCards([word]);
  }
}


/**
 * Find a robot slot element by robot ID (matches against game state).
 * Works for both allied robot slots (attacker) and targeted robot slots.
 * @param {string} robotId - The robot's ID
 * @returns {Element|null} The .robot-slot DOM element, or null
 */
function findRobotSlotByAttackerId(robotId) {
  const state = getGameState();
  const activeRobots = state.run?.robotParty?.active;
  if (!activeRobots) return null;

  const index = activeRobots.findIndex(r => r && r.id === robotId);
  if (index < 0) return null;

  const slots = document.querySelectorAll('#chip-row .robot-slot');
  return slots[index] || null;
}

/**
 * Find the enemy slot element for a specific target in multi-enemy combat.
 * Falls back to the whole enemy-sprite-container for single-enemy fights.
 * @param {string} targetId - The enemy robot's ID
 * @param {Array} enemies - The enemies array from the result
 * @returns {Element} The specific enemy slot element or the container
 */
function findEnemyTargetElement(targetId, enemies) {
  if (enemies && enemies.length > 1) {
    const idx = enemies.findIndex(e => e.id === targetId);
    if (idx >= 0) {
      const slot = document.querySelector(`.enemy-robot-slot[data-enemy-index="${idx}"]`);
      // Skip defeated/invisible slots - fall back to first alive enemy slot
      if (slot && !slot.classList.contains('defeated')) return slot;
      // If target is defeated, find first alive enemy slot for animation
      const aliveSlot = document.querySelector('.enemy-robot-slot:not(.defeated):not(.befriended)');
      if (aliveSlot) return aliveSlot;
    }
  }
  return document.getElementById('enemy-sprite-container');
}

/**
 * Directly update robot HP bar widths in the DOM without triggering full updateUI.
 * This avoids resetting enemy HP bars from stale game state during animations.
 * @param {Array} robots - The robot party active array (with final HP from server)
 * @param {Object} allyHpMap - Map of robotId -> { hp, maxHp } with running HP values
 */
function getHpColor(pct) {
  if (pct > 60) return 'var(--hp-green)';
  if (pct > 30) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

function updateRobotHpBars(robots, allyHpMap) {
  if (!robots) return;
  const slots = document.querySelectorAll('#chip-row .robot-slot');
  robots.forEach((robot, i) => {
    const slot = slots[i];
    if (!slot || !robot) return;
    const currentHp = allyHpMap?.[robot.id] ? allyHpMap[robot.id].hp : robot.hp;
    const hpPct = Math.max(0, (currentHp / robot.maxHp) * 100);
    const fill = slot.querySelector('.robot-hp-fill');
    if (fill) {
      fill.style.width = `${hpPct}%`;
      fill.style.backgroundColor = getHpColor(hpPct);
    }
    // Update KO state and charged glow
    const icon = slot.querySelector('.robot-icon');
    if (icon) {
      if (currentHp <= 0) {
        icon.classList.add('ko');
      } else {
        icon.classList.remove('ko');
      }
      const isCharged = robot.ultimate.charges >= robot.ultimate.chargesRequired;
      if (isCharged) {
        icon.classList.add('charged');
      } else {
        icon.classList.remove('charged');
      }
    }
    // Update charge bar segments
    const chargeBar = slot.querySelector('.robot-charge-bar');
    if (chargeBar) {
      const segments = chargeBar.querySelectorAll('.charge-segment');
      segments.forEach((seg, s) => {
        if (s < robot.ultimate.charges) {
          seg.classList.add('filled');
        } else {
          seg.classList.remove('filled');
        }
      });
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
 * Process xpEvents from the backend and show animated XP popups over robot slots.
 * Also handles level-up popups and updates the level badge in the DOM.
 * @param {Array} xpEvents - Array of { xpGrants: [...], levelUps: [...] }
 */
function showXpEvents(xpEvents) {
  if (!xpEvents || xpEvents.length === 0) return;

  const state = getGameState();
  const activeRobots = state.run?.robotParty?.active;
  if (!activeRobots) return;

  const slots = document.querySelectorAll('#chip-row .robot-slot');

  for (const event of xpEvents) {
    // Show XP popups for each robot that gained XP
    if (event.xpGrants) {
      for (const grant of event.xpGrants) {
        const index = activeRobots.findIndex(r => r && r.id === grant.robotId);
        if (index >= 0 && slots[index]) {
          showXpPopup(slots[index], grant.xp);
        }
      }
    }

    // Show level-up popups
    if (event.levelUps) {
      for (const lu of event.levelUps) {
        const index = activeRobots.findIndex(r => r && r.id === lu.robotId);
        if (index >= 0 && slots[index]) {
          // Slight delay so it appears after XP popup
          setTimeout(() => showLevelUpPopup(slots[index], lu.newLevel), 400);
        }
      }
    }
  }
}

// ============ COMBAT LOOP FUNCTIONS ============

/**
 * Start the combat loop (vocab-pause turn-based combat)
 */
export async function startCombatLoop() {
  if (combatActive) return;

  logger.info('[CombatLoop] Combat started');
  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  // Start paused - require vocab review before first attack
  combatPausedForVocab = true;

  // Initialize word practice cards and wait for words to be ready
  await wordPractice.initCombatWords();

  // Show first dual flash cards now that words are loaded
  showNextDualCardsFromQueue();

  console.log('[Combat] Started paused - review a word to begin attacking');
  // Combat starts paused, player must review a vocab word to earn first attack
  // resumeCombatAfterVocab() will trigger the first executePlayerAttack()
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
          const tier = getDamageTier(pa.damage, enemyMaxHp);
          const tierClass = `dmg-${getTierClassName(tier)}`;

          // Show damage at same time as final damage reveal
          showDamageNumber(pa.damage, false, pa.critical, false, false, null, tierClass);
          animateEnemyHurt();

          // Visual effects for enemy damage (pass enemyMaxHp for tier-based effects)
          const enemySprite = document.getElementById('enemy-sprite');
          await impactEnemyEffect(pa.damage, enemySprite, enemyMaxHp);
        }
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
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

// ============ SHARED ROBOT COMBAT HELPERS ============

/**
 * Show poison tick effects from start-of-round effect processing.
 * Used by both attack and defend paths.
 * @param {Object} result - Combat cycle result from server
 */
async function showEffectEvents(result) {
  if (!result.effectEvents?.length) return;
  for (const event of result.effectEvents) {
    if (event.type === 'poison' && event.damage > 0) {
      // Find target element — could be ally or enemy
      let targetEl = findRobotSlotByAttackerId(event.targetId);
      if (!targetEl) {
        targetEl = findEnemyTargetElement(event.targetId, result.enemies);
      }
      if (targetEl) {
        await poisonTickEffect(targetEl, event.damage);
      }
    }
  }
}

/**
 * Build a map of ally HP before enemy attacks for progressive DOM updates.
 * Reconstructs pre-enemy-attack HP by adding back damage dealt to each ally.
 * @param {Object} result - Combat cycle result from server
 * @returns {Object} Map of robotId -> { hp, maxHp }
 */
function buildAllyHpMap(result) {
  const allyHpMap = {};
  if (result.allies) {
    for (const ally of result.allies) {
      const dmgToThisAlly = (result.enemyAttacks || [])
        .filter(a => a.targetId === ally.id)
        .reduce((sum, a) => sum + a.damage, 0);
      allyHpMap[ally.id] = { hp: ally.hp + dmgToThisAlly, maxHp: ally.maxHp };
    }
  }
  return allyHpMap;
}

/**
 * Animate enemy attacks against player robots with real-time HP bar updates.
 * @param {Object} result - Combat cycle result from server
 * @param {Object} allyHpMap - Running ally HP map (mutated in place)
 * @param {boolean} halved - If true, show "halved" damage text (defend mode)
 */
async function showEnemyAttacksAnimated(result, allyHpMap, halved) {
  if (!result.enemyAttacks?.length) return;
  for (const atk of result.enemyAttacks) {
    // Pick i18n key: halved for defend, element-based for attack
    const effectKey = halved ? 'dealsHalved' :
      atk.elementMultiplier > 1 ? 'dealsStrong' :
      atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = atk.attackerNameJp
        ? buildVocabAttackCard(atk, true, effectKey)
        : `<div class="combat-robot-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
    }
    showDamageNumber(atk.damage, true, false);
    playSFX('player-hit');

    // Fire element-colored orb from specific attacking enemy to targeted robot
    const enemyEl = findEnemyTargetElement(atk.attackerId, result.enemies);
    const targetSlotEl = findRobotSlotByAttackerId(atk.targetId);
    if (enemyEl && targetSlotEl && atk.attackerElement) {
      playAttackSound(atk.attackerElement);
      await enemyRobotAttackEffect(enemyEl, targetSlotEl, atk.attackerElement, atk.damage);
    } else {
      animatePlayerHurt();
    }

    // Update targeted ally's running HP in the DOM directly (avoid full updateUI)
    if (allyHpMap[atk.targetId]) {
      allyHpMap[atk.targetId].hp = Math.max(0, allyHpMap[atk.targetId].hp - atk.damage);
    }
    updateRobotHpBars(result.robotParty?.active, allyHpMap);
    await delay(400);
  }
}

/**
 * Show KO swap messages with death/swap-in animations (Bug F).
 * @param {Object} result - Combat cycle result from server
 */
async function showKoSwapAnimations(result) {
  if (!result.koSwaps?.length) return;
  for (const swap of result.koSwaps) {
    // Animate the KO'd robot dying
    const koIndex = swap.slot ?? -1;
    if (koIndex >= 0) {
      const slots = document.querySelectorAll('#chip-row .robot-slot');
      const dyingSlot = slots[koIndex];
      if (dyingSlot) {
        dyingSlot.classList.add('robot-dying');
        await delay(600);
      }
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${t('swapsIn', swap.replacement)}</div>`;
    }

    // Update sprite and HP for the new robot with swap-in animation
    if (result.robotParty?.active && koIndex >= 0) {
      const slots = document.querySelectorAll('#chip-row .robot-slot');
      const swapSlot = slots[koIndex];
      if (swapSlot) {
        swapSlot.classList.remove('robot-dying');
        swapSlot.classList.add('robot-swapping-in');
        const newRobot = result.robotParty.active[koIndex];
        if (newRobot) {
          const icon = swapSlot.querySelector('.robot-sprite-icon');
          if (icon) configureRobotImg(icon, newRobot.id, el => {
            el.style.display = 'none';
            const fallback = el.nextElementSibling;
            if (fallback) fallback.style.display = '';
          });
          const hpFill = swapSlot.querySelector('.robot-hp-fill');
          if (hpFill) {
            const pct = Math.max(0, (newRobot.hp / newRobot.maxHp) * 100);
            hpFill.style.width = `${pct}%`;
            hpFill.style.backgroundColor = pct > 60 ? 'var(--hp-green)' : pct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';
          }
          const koIcon = swapSlot.querySelector('.robot-icon');
          if (koIcon) koIcon.classList.remove('ko');
        }
        setTimeout(() => swapSlot.classList.remove('robot-swapping-in'), 500);
      }
    }
    await delay(800);
  }
}

/**
 * Sync final combat state with server-authoritative values.
 * Updates game state, robot row popup data, enemy HP bars, and ally HP bars.
 * Avoids full updateUI to prevent DOM rebuild flicker.
 * @param {Object} result - Combat cycle result from server
 */
function syncFinalState(result) {
  if (!result.robotParty && !result.enemies) return;

  const gs = getGameState();
  const updates = { ...gs };
  if (result.robotParty) {
    updates.run = { ...gs.run, robotParty: result.robotParty };
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

  // Keep robot-row popup data in sync with latest charges/HP
  if (result.robotParty?.active && updateRobotRowData) {
    updateRobotRowData(result.robotParty.active);
  }
  // Set final HP bars without full DOM rebuild
  if (result.enemies?.length > 1) {
    result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
  } else if (result.enemies?.[0]) {
    characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
  }
  updateRobotHpBars(result.robotParty?.active, null);
}

// ============ ROBOT COMBAT ORCHESTRATORS ============

/**
 * Execute robot player attack — calls /robot-combat-cycle with 'attack'
 * The backend processes both player and enemy phases in one call.
 */
async function executeRobotPlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/game/robot-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'attack' })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Robot attack result:', { attacks: result.playerAttacks?.length });

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Robot attack error:', result.error);
        playerAttackPending = false;
        return;
      }

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Track each enemy's HP for progressive updates during player attacks
      const enemyHpMap = {};
      if (result.enemies) {
        for (const enemy of result.enemies) {
          const dmgToThisEnemy = (result.playerAttacks || [])
            .filter(a => a.targetId === enemy.id)
            .reduce((sum, a) => sum + a.damage, 0);
          enemyHpMap[enemy.id] = { hp: enemy.hp + dmgToThisEnemy, maxHp: enemy.maxHp, index: result.enemies.indexOf(enemy) };
        }
      }

      // Show each allied robot's attack result sequentially with real-time HP
      if (result.playerAttacks?.length > 0) {
        const killedEnemies = new Set();

        for (let atkIdx = 0; atkIdx < result.playerAttacks.length; atkIdx++) {
          const atk = result.playerAttacks[atkIdx];
          const effectKey = atk.elementMultiplier > 1 ? 'dealsStrong' :
                            atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
          const actionArea = document.getElementById('action-area');
          if (actionArea) {
            actionArea.innerHTML = atk.attackerNameJp
              ? buildVocabAttackCard(atk, false, effectKey)
              : `<div class="combat-robot-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
          }
          playSFX('attack');

          const robotSlotEl = findRobotSlotByAttackerId(atk.attackerId);
          const enemyEl = findEnemyTargetElement(atk.targetId, result.enemies);

          // Update charge bar for this attacker immediately after its attack
          const attackerSlotIdx = (result.robotParty?.active || []).findIndex(r => r && r.id === atk.attackerId);
          const attackerSlot = attackerSlotIdx >= 0 ? document.querySelectorAll('#chip-row .robot-slot')[attackerSlotIdx] : null;
          if (attackerSlot && atk.attackerCharges != null) {
            const chargeBar = attackerSlot.querySelector('.robot-charge-bar');
            if (chargeBar) {
              const segments = chargeBar.querySelectorAll('.charge-segment');
              segments.forEach((seg, s) => {
                if (s < atk.attackerCharges) {
                  seg.classList.add('filled');
                } else {
                  seg.classList.remove('filled');
                }
              });
            }
            const icon = attackerSlot.querySelector('.robot-icon');
            if (icon) {
              if (atk.attackerCharges >= atk.attackerChargesRequired) {
                icon.classList.add('charged');
              } else {
                icon.classList.remove('charged');
              }
            }
          }

          // Fire element-colored orb from robot to enemy with impact effects
          if (robotSlotEl && enemyEl && atk.attackerElement) {
            playAttackSound(atk.attackerElement);
            const targetMaxHp = enemyHpMap[atk.targetId]?.maxHp || 100;
            await fireRobotAttackEffect(robotSlotEl, enemyEl, atk.attackerElement, atk.damage, targetMaxHp);
          } else {
            animateEnemyHurt();
          }

          showDamageNumber(atk.damage, false, false);
          // Update enemy HP bar after each hit
          if (enemyHpMap[atk.targetId]) {
            enemyHpMap[atk.targetId].hp = Math.max(0, enemyHpMap[atk.targetId].hp - atk.damage);
            const entry = enemyHpMap[atk.targetId];
            if (result.enemies.length > 1) {
              characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
            } else {
              characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
            }
          }

          // Show XP popups when an enemy is killed (BUG B + C)
          if (atk.targetDefeated && !killedEnemies.has(atk.targetId) && result.xpEvents) {
            killedEnemies.add(atk.targetId);
            const xpEvent = result.xpEvents.find(ev => ev.enemyId === atk.targetId);
            if (xpEvent) {
              showXpEvents([xpEvent]);
            }
          }

          await delay(400);
        }
      }

      // Enemy attacks phase
      const allyHpMap = buildAllyHpMap(result);
      if (result.enemyAttacks?.length > 0) {
        await delay(400); // Brief pause between player and enemy attack phases
      }
      await showEnemyAttacksAnimated(result, allyHpMap, false);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync authoritative state from server
      syncFinalState(result);

      // Check combat end
      if (result.combatEnded) {
        if (result.victory) await delay(500); // Let HP bar drain animation be visible
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Pause for next vocab review
      combatPausedForVocab = true;
      await delay(1440);
      showNextDualCardsFromQueue();

    } catch (error) {
      console.error('Robot attack error:', error);
      playerAttackPending = false;
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
      }
    }
  });
}

/**
 * Execute robot defend — calls /robot-combat-cycle with 'defend'
 * Defend: all robots gain +1 ultimate charge, enemies attack with 50% damage
 */
async function executeRobotDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/game/robot-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'defend' })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Robot defend result:', { enemyAttacks: result.enemyAttacks?.length });

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Robot defend error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defending')}</div>`;
      }

      // Update charge bars immediately for defend (BUG A fix)
      if (result.robotParty?.active) {
        updateRobotHpBars(result.robotParty.active, null);
      }
      await delay(600);

      // Enemy attacks phase (50% damage already applied server-side)
      const allyHpMap = buildAllyHpMap(result);
      await showEnemyAttacksAnimated(result, allyHpMap, true);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync authoritative state from server
      syncFinalState(result);

      // Check combat end
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;
      combatPausedForVocab = true;
      await delay(1440);
      showNextDualCardsFromQueue();

    } catch (error) {
      console.error('Robot defend error:', error);
      enemyAttackPending = false;
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
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

        // Visual effects for player damage
        const playerHpBar = document.getElementById('player-hp-fill');
        const chipRow = document.getElementById('chip-row');
        await playerHitEffect(result.enemyAttack.damage, playerHpBar, chipRow);

        // Check for critical HP state
        const gameState = getGameState();
        if (gameState?.player) {
          updateHpCriticalState(playerHpBar, gameState.player.hp, gameState.player.maxHp);
        }
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
  const isRobotCombat = state.combat?.isRobotCombat;

  if (actionType === 'befriend') {
    executeBefriendAction();
  } else if (isRobotCombat) {
    // Robot combat: use robot-specific functions
    if (actionType === 'defend') {
      executeRobotDefendThenPause();
    } else {
      executeRobotPlayerAttack();
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
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defendingChip')}</div>`;
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

        const playerHpBar = document.getElementById('player-hp-fill');
        const chipRow = document.getElementById('chip-row');
        await playerHitEffect(result.enemyAttack.damage, playerHpBar, chipRow);

        const gameState = getGameState();
        if (gameState?.player) {
          updateHpCriticalState(playerHpBar, gameState.player.hp, gameState.player.maxHp);
        }
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
 * Show a prompt for the player to choose which robot to release (or skip).
 * Returns the robot ID to release, or null if the player chose to let the befriended one go.
 */
function showBefriendReleasePrompt() {
  return new Promise((resolve) => {
    const state = getGameState();
    const party = state.run?.robotParty;
    if (!party) { resolve(null); return; }

    const allRobots = [
      ...party.active.map((r, i) => ({ ...r, slot: 'active', index: i })),
      ...party.reserves.map((r, i) => ({ ...r, slot: 'reserve', index: i }))
    ].filter(r => r && r.id);

    const ELEM_ICONS = { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };

    const overlay = document.createElement('div');
    overlay.className = 'befriend-release-overlay';
    overlay.innerHTML = `
      <div class="befriend-release-panel">
        <div class="befriend-release-title">${t('partyFullTitle')}</div>
        <div class="befriend-release-list">
          ${allRobots.map(r => `
            <button class="befriend-release-btn" data-robot-id="${r.id}">
              ${ELEM_ICONS[r.element] || ''} ${r.nameEn} (Lv${r.level}) - ${r.slot === 'active' ? t('equipped') : t('reserve')}
            </button>
          `).join('')}
        </div>
        <button class="befriend-release-skip-btn">${t('letItGoBtn')}</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.befriend-release-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(btn.dataset.robotId);
      });
    });

    overlay.querySelector('.befriend-release-skip-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

/**
 * Show target selection UI when multiple enemies are befriendable.
 */
function showBefriendTargetSelect(enemies) {
  return new Promise((resolve) => {
    const eligible = enemies
      .map((e, i) => ({ ...e, index: i }))
      .filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);

    if (eligible.length <= 1) {
      resolve(eligible.length === 1 ? eligible[0].index : -1);
      return;
    }

    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(-1); return; }

    const buttons = eligible.map(e => `
      <div class="shrine-chip-option befriend-target-option" data-enemy-index="${e.index}" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-chip-name" style="color:#4CAF50">${e.nameEn || e.name} (HP: ${Math.round(e.hp / e.maxHp * 100)}%)</div>
        </div>
      </div>
    `).join('');

    actionArea.innerHTML = `
      <div class="shrine-chip-list" style="padding:0 1rem">
        <div style="text-align:center; color:var(--text-secondary); margin-bottom:0.5rem">Who do you want to talk to?</div>
        ${buttons}
      </div>
    `;

    actionArea.addEventListener('click', (e) => {
      const opt = e.target.closest('.befriend-target-option');
      if (!opt) return;
      resolve(parseInt(opt.dataset.enemyIndex, 10));
    });
  });
}

/**
 * Show one round of befriend conversation.
 * Returns the selected option index.
 */
function showConversationRound(round, roundNumber, robotName) {
  return new Promise((resolve) => {
    // Show robot's line in narration box
    narration.showNarration(round.speaker, {
      speaker: robotName,
      persistent: true
    });

    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(0); return; }

    const buttons = round.options.map((opt, idx) => `
      <div class="shrine-chip-option befriend-answer-option" data-answer-index="${idx}" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">${opt}</div>
        </div>
      </div>
    `).join('');

    actionArea.innerHTML = `
      <div class="shrine-chip-list befriend-answer-list" style="padding:0 1rem">
        ${buttons}
      </div>
    `;

    const list = actionArea.querySelector('.befriend-answer-list');
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.befriend-answer-option');
      if (!opt || list.dataset.answered) return;
      list.dataset.answered = '1';
      resolve(parseInt(opt.dataset.answerIndex, 10));
    });
  });
}

/**
 * Show green/red feedback on answer options.
 */
function showAnswerFeedback(selectedIndex, correctIndex, correct) {
  document.querySelectorAll('.befriend-answer-option').forEach((o, idx) => {
    o.style.pointerEvents = 'none';
    if (idx === correctIndex) {
      o.style.borderColor = 'var(--success-color, #4ade80)';
      o.style.boxShadow = '0 0 10px var(--success-color, #4ade80)';
    } else if (idx === selectedIndex && !correct) {
      o.style.borderColor = 'var(--danger-color, #ef4444)';
      o.style.boxShadow = '0 0 10px var(--danger-color, #ef4444)';
    } else {
      o.style.opacity = '0.5';
    }
  });
}

/**
 * Execute befriend action: 3-round conversation to capture low-HP enemy robot
 */
async function executeBefriendAction() {
  if (!combatActive) return;

  return withAnimationActive(async () => {
    try {
      const state = getGameState();
      const enemies = state.combat?.enemies || [];

      // Target selection (auto if only one eligible)
      const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
      let enemyIndex;
      if (eligible.length > 1) {
        enemyIndex = await showBefriendTargetSelect(enemies);
        if (enemyIndex < 0) {
          combatPausedForVocab = true;
          showNextDualCardsFromQueue();
          return;
        }
      }

      // Fetch conversation from server
      const convoResult = await apiGetBefriendConversation(enemyIndex);
      if (!convoResult || convoResult.error) {
        console.error('Befriend conversation error:', convoResult?.error || 'request failed');
        showNextDualCardsFromQueue();
        return;
      }

    const { rounds, targetEnemy, targetEnemyIndex } = convoResult;
    const robotName = targetEnemy?.nameEn || targetEnemy?.name || 'Robot';

    // 3-round conversation loop
    for (let i = 0; i < rounds.length; i++) {
      const selectedIndex = await showConversationRound(rounds[i], i, robotName);
      const answerResult = await apiSubmitBefriendAnswer(i, selectedIndex);

      if (!answerResult) {
        // API error - recover gracefully by resuming normal combat
        logger.error("[CombatLoop] Befriend answer API returned null, resuming combat");
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }

      showAnswerFeedback(selectedIndex, answerResult.correctIndex, answerResult.correct);
      await delay(800);
      if (narration.forceHideNarration) narration.forceHideNarration();

      if (!answerResult.correct) {
        // --- FAILURE ---
        narration.showNarration('？？？', {
          speaker: robotName, autoDismiss: 1000
        });

        // Shake target enemy
        const slots = document.querySelectorAll('.enemy-robot-slot');
        const targetSlot = slots[targetEnemyIndex];
        if (targetSlot) {
          targetSlot.classList.add('shake-animation');
          setTimeout(() => targetSlot.classList.remove('shake-animation'), 500);
        }

        // Show enemy attack damage
        if (answerResult.enemyAttacks?.length > 0) {
          for (const atk of answerResult.enemyAttacks) {
            if (atk.damage > 0) {
              showDamageNumber(atk.damage, true, false);
              animatePlayerHurt();
              playSFX('player-hit');
              await delay(400);
            }
          }
        }

        // Update game state with post-attack HP
        if (answerResult.allies || answerResult.enemies) {
          const gs = getGameState();
          if (gs.combat) {
            updateGameState({
              ...gs,
              combat: {
                ...gs.combat,
                ...(answerResult.allies && { allies: answerResult.allies }),
                ...(answerResult.enemies && { enemies: answerResult.enemies })
              }
            });
            updateUI();
          }
        }

        if (answerResult.combatEnded) {
          stopCombatLoop({ combatEnded: true, victory: false });
          return;
        }

        // Resume normal combat
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }

      // --- CORRECT ---
      if (answerResult.conversationComplete) {
        // All 3 rounds correct!
        narration.showNarration('\u3058\u3083\u3042\u3001\u53cb\u9054\u306b\u306a\u308d\u3046\uff01', {
          speaker: robotName, autoDismiss: 1500
        });
        playSFX('chip-skill');

        // Mark enemy as befriended visually
        const captured = answerResult.befriend?.captured;
        if (captured?.id) {
          const slot = document.querySelector(`.enemy-robot-slot[data-enemy-id="${captured.id}"]`);
          if (slot) slot.classList.add('befriended');
        }

        if (answerResult.befriend?.reason === 'Party full') {
          // Party full — prompt release
          const releaseChoice = await showBefriendReleasePrompt();
          if (releaseChoice && apiBefriendReplace) {
            const replaceResult = await apiBefriendReplace(releaseChoice);
            if (replaceResult?.success) {
              const actionArea = document.getElementById('action-area');
              if (actionArea) {
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
              }
              playSFX('chip-skill');

              const capturedId = replaceResult.captured?.id;
              if (capturedId) {
                const slot = document.querySelector(`.enemy-robot-slot[data-enemy-id="${capturedId}"]`);
                if (slot) slot.classList.add('befriended');
              }
              await delay(1200);

              if (replaceResult.combatEnded) {
                stopCombatLoop({ combatEnded: true, victory: replaceResult.victory });
                return;
              }

              // Update state from replace result
              const gs = getGameState();
              if (replaceResult.state) {
                updateGameState(replaceResult.state);
              } else if (gs.combat && replaceResult.enemies) {
                updateGameState({
                  ...gs,
                  combat: { ...gs.combat, enemies: replaceResult.enemies },
                  run: { ...gs.run, robotParty: replaceResult.robotParty }
                });
              }
            }
          } else {
            // Let it go
            const actionArea = document.getElementById('action-area');
            if (actionArea) {
              actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #9E9E9E;">${t('letItGo')}</div>`;
            }
            await delay(800);
          }
        } else {
          // Normal success
          const actionArea = document.getElementById('action-area');
          if (actionArea && captured) {
            actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', captured.nameEn)}</div>`;
          }
          await delay(1200);

          // Update state
          if (answerResult.state) {
            updateGameState(answerResult.state);
          } else {
            const gs = getGameState();
            if (gs.combat && answerResult.enemies) {
              updateGameState({
                ...gs,
                combat: { ...gs.combat, enemies: answerResult.enemies },
                ...(answerResult.robotParty && {
                  run: { ...gs.run, robotParty: answerResult.robotParty }
                })
              });
            }
          }
        }

        if (answerResult.combatEnded) {
          stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
          return;
        }

        // Continue combat
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }

      // Correct but not complete — brief pause then show next round
      await delay(300);
    }

    } catch (error) {
      console.error('Befriend conversation error:', error);
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

  // Wait for enemy dialogue to be dismissed (e.g., liberated dialogue on victory)
  const dialogueDismissPromise = getDialogueDismissPromise();
  if (dialogueDismissPromise) {
    await dialogueDismissPromise;
  }

  // Animate victory or defeat
  if (result.victory) {
    animateEnemyDefeat();
    playSFX('enemy-defeat');
  }

  // Request narration from server
  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-end-narration`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        victory: result.victory,
        expGained: result.expGained,
        creditsGained: result.creditsGained,
        loot: result.loot,
        leveledUp: result.leveledUp,
        newLevel: result.newLevel,
        isBoss: result.isBoss,
        ...apiKeys
      })
    });
    const narrationResult = await response.json();

    // Display narration (click-to-continue)
    if (narrationResult.narration) {
      await narration.showNarration(narrationResult.narration);
    }

    // Update game state from server
    if (narrationResult.state) {
      updateGameState({ ...gameState, ...narrationResult.state });
    }

    // Play TTS if available
    if (narrationResult.audio) {
      playNarrationAudio(narrationResult.audio);
    }

    // Show victory or defeat modal
    if (result.victory) {
      playSFX('victory');
      const gs = getGameState();
      const isRobotCombat = gs?.combat?.isRobotCombat;
      if (isRobotCombat && gs?.combat?.npcId) {
        await runNpcDialogue();
      }
      if (isRobotCombat && showPostCombatShop) {
        await showPostCombatShop();
      }
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
    } else {
      showGameOverModal(result);
    }

  } catch (error) {
    console.error('Error getting combat end narration:', error);
    // Fallback narration
    if (result.victory) {
      await narration.showNarration('市民解放！');
      const gs2 = getGameState();
      if (gs2?.combat?.npcId) {
        await runNpcDialogue();
      }
      const isRobotCombat = gs2?.combat?.isRobotCombat;
      if (isRobotCombat && showPostCombatShop) {
        await showPostCombatShop();
      }
      showVictoryModal(result);
      wordPractice.prefetchCombatWords();
    } else {
      await narration.showNarration('敗北...');
      showGameOverModal(result);
    }
  }

  // Refresh full UI state
  updateUI();
}

/**
 * Show NPC greeting before combat
 */
export async function showNpcGreeting(npcData) {
  if (!npcData?.greeting) return;
  await narration.showNarration(npcData.greeting, { speaker: npcData.name || npcData.nameEn });
}

/**
 * Run the full NPC post-combat dialogue flow
 */
export async function runNpcDialogue() {
  if (!apiStartNpcDialogue || !apiRespondNpcDialogue) return;

  const dialogueData = await apiStartNpcDialogue();
  if (!dialogueData) return;

  const { npc, freed, rounds } = dialogueData;
  const npcName = npc.name || npc.nameEn;

  // Show NPC sprite in scene area
  if (showNpcSprite) showNpcSprite(npcName, npc.id);

  // Show freed narration (click to dismiss)
  await narration.showNarration(freed, { speaker: npcName });

  let totalDelta = 0;

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];

    // Show NPC line (persistent so player can read while choosing)
    await narration.showNarration(round.npcLine, { speaker: npcName, persistent: true });

    // Show 3 response buttons (reuses befriend dialogue styling)
    const selectedIndex = await showNpcResponseOptions(round.options, i);

    // Hide narration
    if (narration.forceHideNarration) narration.forceHideNarration();

    // Submit to server
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

  // Hide NPC sprite
  if (hideNpcSprite) hideNpcSprite();

  // Show bond summary toast (server clamps to +1/0/-1)
  showBondSummary(npcName, totalDelta);
  await delay(2200);
  document.querySelector('.bond-summary')?.remove();
}

function showNpcResponseOptions(options, roundNumber) {
  return new Promise(resolve => {
    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(0); return; }

    const buttons = options.map((option, idx) => `
      <div class="shrine-chip-option befriend-answer-option" data-answer-index="${idx}" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">${option.text}</div>
        </div>
      </div>
    `).join('');

    actionArea.innerHTML = `
      <div class="shrine-chip-list befriend-answer-list" style="padding:0 1rem">
        ${buttons}
      </div>
    `;

    const list = actionArea.querySelector('.befriend-answer-list');
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.befriend-answer-option');
      if (!opt || list.dataset.answered) return;
      list.dataset.answered = '1';
      resolve(parseInt(opt.dataset.answerIndex, 10));
    });
  });
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

