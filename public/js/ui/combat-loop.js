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
 * - executePlayerAttack(): Process player attack with chip pipeline
 * - executeEnemyAttack(): Process enemy attack and update HP
 * - executeEnemyAttackThenPause(): Enemy attacks then pauses for vocab
 * - resumeCombatAfterVocab(): Continue combat after word review
 * - stopCombatLoop(result): End combat, show narration and victory/defeat
 * - isCombatActive(), isCombatPausedForVocab(): State getters
 * - cleanupCombat(): Reset state without showing results
 *
 * DEPENDENCIES:
 * - ../audio.js: Sound effects (attack, player-hit, chip-equip, victory)
 * - ../api.js: getAuthHeaders for authenticated requests
 * - Callbacks: wordPractice, characterUI, settings, narration modules
 *
 * COMBAT MATH DISPLAY:
 * Shows dual-pool damage formula: PWR × (1 + BW) = DAMAGE
 * Chip contributions show pool additions/multiplications.
 * Progressive display with tooltips above firing chips.
 */

import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { logger } from '../logger.js';
import {
  fireChipEffect,
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
  playUltimateAnimation
} from './combat-effects.js';
import { playAttackSound, playUltimateSound } from './combat-audio.js';
import { configureRobotImg } from './sprite-utils.js';

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
let getChipLoadoutCache = null;
let setChipLoadoutCache = null;
let getEnemyDialogueActive = null;
let getDialogueDismissPromise = null;
let showFlashCard = null;
let showDualFlashCards = null;
let showTripleFlashCards = null;
let setCombatAnimationActive = null;
let apiRobotCombatCycle = null;
let showPostCombatShop = null;
let apiBefriendReplace = null;
let apiGetBefriendConversation = null;
let apiSubmitBefriendAnswer = null;

// Utility
let delay = null;

const API_BASE = '';

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
  getChipLoadoutCache = callbacks.getChipLoadoutCache;
  setChipLoadoutCache = callbacks.setChipLoadoutCache;
  getEnemyDialogueActive = callbacks.getEnemyDialogueActive;
  getDialogueDismissPromise = callbacks.getDialogueDismissPromise;
  showFlashCard = callbacks.showFlashCard;
  showDualFlashCards = callbacks.showDualFlashCards;
  showTripleFlashCards = callbacks.showTripleFlashCards;

  // Utility
  delay = callbacks.delay;
  setCombatAnimationActive = callbacks.setCombatAnimationActive;
  apiRobotCombatCycle = callbacks.apiRobotCombatCycle;
  showPostCombatShop = callbacks.showPostCombatShop;
  apiBefriendReplace = callbacks.apiBefriendReplace;
  apiGetBefriendConversation = callbacks.apiGetBefriendConversation;
  apiSubmitBefriendAnswer = callbacks.apiSubmitBefriendAnswer;
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
 * Set combat active state (for external sync)
 * @param {boolean} active
 */
export function setCombatActive(active) {
  combatActive = active;
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
    if (word && showFlashCard) {
      pendingActionType = 'attack'; // Default to attack if single card
      showFlashCard(word);
    }
    return;
  }

  // Check if befriend is available (enemy robot <=50% HP; allow even if party full - will prompt release)
  const state = getGameState();
  const isRobotCombat = state.combat?.isRobotCombat;
  const enemies = state.combat?.enemies || [];
  const party = state.run?.robotParty;
  const anyEnemyBefriendable = enemies.some(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5);
  const befriendAvailable = isRobotCombat && anyEnemyBefriendable && party;

  if (befriendAvailable && showTripleFlashCards) {
    // Get a third word for the befriend card
    const thirdWord = wordPractice.getNextCombatWord?.();
    if (thirdWord) {
      showTripleFlashCards(words.attackWord, words.defendWord, thirdWord);
    } else {
      // Not enough words for triple, fall back to dual
      showDualFlashCards(words.attackWord, words.defendWord);
    }
  } else if (showDualFlashCards) {
    showDualFlashCards(words.attackWord, words.defendWord);
  }
}

// Keep old function for backwards compatibility / fallback
function showNextFlashCardFromQueue() {
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCard) {
    showFlashCard(word);
  }
}

// ============ COMBAT MATH DISPLAY ============

/**
 * Show chip activations with animated stat boxes.
 * PWR and BW build up in real-time as each chip fires.
 * @param {Object} pa - playerAttack result object
 */
async function showChipActivationSequence(pa) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const pipelineResult = pa.pipelineResult;
  const sequence = pipelineResult?.sequence || [];

  // Edge case: no chips or no sequence
  if (!pipelineResult || !sequence.length) {
    actionArea.innerHTML = `
      <div class="combat-math">
        <div class="pipeline-stats">
          <div class="stat-box">
            <span class="stat-box-label">PWR</span>
            <span class="stat-box-value">0</span>
          </div>
          <span class="stat-box-operator">×</span>
          <div class="stat-box">
            <span class="stat-box-label">BW</span>
            <span class="stat-box-value">1</span>
          </div>
          <span class="stat-box-operator">=</span>
          <div class="stat-box damage">
            <span class="stat-box-label">DMG</span>
            <span class="stat-box-value">${pa.damage || 0}</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Track current values for animation
  let currentPwr = 0;
  let currentBw = 1; // Effective multiplier (internal 0 + 1)

  // Show critical hit first
  if (pa.critical) {
    actionArea.innerHTML = `<div class="combat-math"><span class="math-crit">CRITICAL HIT!</span></div>`;
    await delay(360);
  }

  // Build initial HTML with stat boxes
  const buildDisplay = (showDamage = false) => {
    const bwDisplay = formatBw(currentBw);
    const damageBox = showDamage
      ? `<span class="stat-box-operator">=</span>
         <div class="stat-box damage">
           <span class="stat-box-label">DMG</span>
           <span class="stat-box-value">${formatNum(pa.damage)}</span>
         </div>`
      : '';

    return `
      <div class="combat-math">
        ${pa.critical ? '<span class="math-crit">CRITICAL HIT!</span><br>' : ''}
        <div class="pipeline-stats">
          <div class="stat-box" id="pwr-box" data-pool="power">
            <span class="stat-box-label">PWR</span>
            <span class="stat-box-value" id="pwr-value">${formatNum(currentPwr)}</span>
          </div>
          <span class="stat-box-operator">×</span>
          <div class="stat-box" id="bw-box" data-pool="bandwidth">
            <span class="stat-box-label">BW</span>
            <span class="stat-box-value" id="bw-value">${bwDisplay}</span>
          </div>
          ${damageBox}
        </div>
        <div class="pipeline-log" id="pipeline-log"></div>
      </div>
    `;
  };

  // Render initial state
  actionArea.innerHTML = buildDisplay(false);
  await delay(300);

  // Process sequence events
  for (const event of sequence) {
    const chipSlot = findChipSlotIndex(event.chipId);

    switch (event.type) {
      case 'activate':
        // Chip slot glows, SFX plays
        if (chipSlot !== null) {
          animateChipActivation(chipSlot);
          playSFX('chip-equip');
        }
        await delay(200);
        break;

      case 'buff':
        // PRE_PIPELINE buff adds to power (e.g., Battery Bot's Full Charge +8)
        if (event.powerAdd) {
          currentPwr += event.powerAdd;
          updateStatValue('pwr-value', formatNum(currentPwr));
          addLogLine(`• Skill Buff: +${formatNum(event.powerAdd)} PWR`);
          await delay(200);
        }
        break;

      case 'base':
        // Base stats added - fire speed lines to pools
        if (event.power) {
          currentPwr += event.power;
          updateStatValue('pwr-value', formatNum(currentPwr));
          addLogLine(`• ${event.chipName}: +${formatNum(event.power)} PWR`);
          // Fire energy to PWR pool
          if (chipSlot !== null) {
            const slot = document.querySelector(`.chip-slot[data-index="${chipSlot}"]`);
            const pwrPool = document.querySelector('[data-pool="power"]');
            if (slot && pwrPool) {
              fireChipEffect(slot, { stats: { power: event.power } }, { power: pwrPool });
            }
          }
          await delay(200);
        }
        if (event.bandwidth) {
          currentBw += event.bandwidth;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: +${formatNum(event.bandwidth)} BW`);
          // Fire energy to BW pool
          if (chipSlot !== null) {
            const slot = document.querySelector(`.chip-slot[data-index="${chipSlot}"]`);
            const bwPool = document.querySelector('[data-pool="bandwidth"]');
            if (slot && bwPool) {
              fireChipEffect(slot, { stats: { bandwidth: event.bandwidth } }, { bandwidth: bwPool });
            }
          }
          await delay(200);
        }
        break;

      case 'effect':
        // Passive effect modifies pools
        if (event.powerAdd) {
          currentPwr += event.powerAdd;
          updateStatValue('pwr-value', formatNum(currentPwr));
          addLogLine(`• ${event.chipName}: +${formatNum(event.powerAdd)} PWR`);
          await delay(200);
        }
        if (event.bandwidthAdd) {
          currentBw += event.bandwidthAdd;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: +${formatNum(event.bandwidthAdd)} BW`);
          await delay(200);
        }
        if (event.powerMult) {
          currentPwr = Math.floor(currentPwr * event.powerMult);
          updateStatValue('pwr-value', formatNum(currentPwr));
          addLogLine(`• ${event.chipName}: ×${formatNum(event.powerMult)} PWR`);
          await delay(200);
        }
        if (event.bandwidthMult) {
          currentBw *= event.bandwidthMult;
          updateStatValue('bw-value', formatBw(currentBw));
          addLogLine(`• ${event.chipName}: ×${formatNum(event.bandwidthMult)} BW`);
          await delay(200);
        }
        break;

      case 'heal':
        addLogLine(`• ${event.chipName}: +${formatNum(event.hp)} HP`, 'heal');
        await delay(200);
        break;

      case 'sacrifice':
        addLogLine(`• ${event.chipName}: SACRIFICED`, 'sacrifice');
        await delay(200);
        break;

      case 'noTrigger':
        addLogLine(`• ${event.chipName}: (no trigger)`, 'no-trigger');
        await delay(200);
        break;
    }
  }

  // Final reveal: add damage box without destroying log
  await delay(300);
  const statsContainer = document.querySelector('.pipeline-stats');
  if (statsContainer) {
    const damageHTML = `
      <span class="stat-box-operator">=</span>
      <div class="stat-box damage">
        <span class="stat-box-label">DMG</span>
        <span class="stat-box-value">${formatNum(pa.damage)}</span>
      </div>
    `;
    statsContainer.insertAdjacentHTML('beforeend', damageHTML);
  }

  // Show cascade if triggered
  if (pa.cascadeTriggered && pa.cascadeDamage) {
    await delay(600);
    addLogLine(`Cascade: +${formatNum(pa.cascadeDamage)}`);
  }

  // Show DoT damage
  if (pa.dotDamage && pa.dotDamage > 0) {
    await delay(480);
    showDotDamage(pa.dotDamage, false);
  }
}

/**
 * Update a stat box value with pulse animation
 */
function updateStatValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = value;
  el.classList.remove('pulse');
  void el.offsetWidth; // Force reflow
  el.classList.add('pulse');
}

/**
 * Format a number for display in combat log (max 2 decimal places, no trailing zeros)
 */
function formatNum(n) {
  if (Number.isInteger(n)) return String(n);
  // Round to 2 decimal places, then remove trailing zeros
  return Number(n.toFixed(2)).toString();
}

/**
 * Format bandwidth as effective multiplier
 */
function formatBw(bw) {
  if (bw === 1) return '1';
  return formatNum(bw);
}

/**
 * Add a line to the pipeline log
 */
function addLogLine(text, className = '') {
  const log = document.getElementById('pipeline-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `pipeline-log-line ${className}`;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

/**
 * Find the chip slot index from the loadout cache by chipId
 */
function findChipSlotIndex(chipId) {
  const cache = getChipLoadoutCache?.();
  const chips = cache?.equipment?.weapon?.equippedChips;
  if (!chips) return null;
  const index = chips.findIndex(c => c && (c.id === chipId || c === chipId));
  return index >= 0 ? index : null;
}

/**
 * Show a small tooltip above a chip slot that auto-dismisses
 * @param {number} chipIndex - Index of the chip slot
 * @param {string} text - Tooltip text
 */
function showChipTooltip(chipIndex, text) {
  // Remove any existing tooltip
  const existing = document.querySelector('.chip-tooltip');
  if (existing) existing.remove();

  const slot = document.querySelector(`.chip-slot[data-index="${chipIndex}"]`);
  if (!slot) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'chip-tooltip';
  tooltip.textContent = text;
  slot.appendChild(tooltip);

  // Auto-dismiss after animation
  setTimeout(() => tooltip.remove(), 1500);
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
      if (slot) return slot;
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
    actionArea.innerHTML = '<div class="combat-enemy-damage dodge">PERFECT DODGE!</div>';
  } else if (enemyAttack.dodged) {
    actionArea.innerHTML = '<div class="combat-enemy-damage dodge">DODGED!</div>';
  } else if (enemyAttack.miss) {
    actionArea.innerHTML = '<div class="combat-enemy-damage miss">MISS!</div>';
  } else {
    const crit = enemyAttack.critical ? '<div class="combat-enemy-crit">CRITICAL!</div>' : '';
    actionArea.innerHTML = `<div class="combat-enemy-damage">${crit}<span class="enemy-damage-number">-${enemyAttack.damage}</span></div>`;
  }
}

/**
 * Animate a chip circle when its effect activates
 * @param {number} chipIndex - Index of the chip slot to animate
 * @param {Object} chipData - Chip data with stats (optional)
 */
function animateChipActivation(chipIndex, chipData = null) {
  const slot = document.querySelector(`.chip-slot[data-index="${chipIndex}"]`);
  if (slot) {
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      icon.classList.add('chip-activating');
      setTimeout(() => icon.classList.remove('chip-activating'), 600);
    }

    // Fire visual effects (non-blocking, wrapped in try-catch for resilience)
    try {
      const poolEls = {
        power: document.querySelector('[data-pool="power"]'),
        bandwidth: document.querySelector('[data-pool="bandwidth"]')
      };
      fireChipEffect(slot, chipData, poolEls);
    } catch (e) {
      console.warn('[Combat] Chip effect failed:', e.message);
    }
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

  // Fetch chip loadout for combat display (always refresh to catch auto-equipped chips)
  fetch(`${API_BASE}/api/game/chip-loadout`, { headers: getAuthHeaders() })
    .then(r => r.json())
    .then(data => {
      setChipLoadoutCache(data);
      updateActionPanel(); // Re-render with chips
    })
    .catch(err => console.warn('[Combat] Failed to fetch chip loadout:', err));

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
  if (setCombatAnimationActive) setCombatAnimationActive(true);

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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Player attack error:', result.error);
      // Don't trigger defeat for errors - let player retry
      playerAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (getEnemyDialogueActive()) {
      playerAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
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

        // Sequential chip activation with progressive math display
        await showChipActivationSequence(pa);

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
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      showEnemyDialogue(result.glitchingDialogue, 'glitching');
      return;
    }

    // Check if combat ended
    if (result.combatEnded) {
      // Show liberated dialogue on victory
      if (result.victory && result.liberatedDialogue) {
        showEnemyDialogue(result.liberatedDialogue, 'liberated');
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

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
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Recovery: pause for vocab and show dual cards so player can continue
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
      logger.warn('[CombatLoop] Recovered from player attack error, showing dual cards');
    }
  }
}

/**
 * Execute robot player attack — calls /robot-combat-cycle with 'attack'
 * The backend processes both player and enemy phases in one call.
 */
async function executeRobotPlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Robot attack error:', result.error);
      playerAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Track each enemy's HP for progressive updates
    const gs = getGameState();
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
      // Track which enemies have been defeated for XP popups
      const killedEnemies = new Set();

      for (let atkIdx = 0; atkIdx < result.playerAttacks.length; atkIdx++) {
        const atk = result.playerAttacks[atkIdx];
        const effectiveness = atk.elementMultiplier > 1 ? ' (super effective!)' :
                              atk.elementMultiplier < 1 ? ' (not very effective...)' : '';
        const actionArea = document.getElementById('action-area');
        if (actionArea) {
          actionArea.innerHTML = `<div class="combat-robot-attack">${atk.attackerName} deals <strong>${atk.damage}</strong> damage${effectiveness}</div>`;
        }
        playSFX('attack');

        // Find the robot slot element for this attacker and specific enemy target
        const robotSlotEl = findRobotSlotByAttackerId(atk.attackerId);
        const enemyEl = findEnemyTargetElement(atk.targetId, result.enemies);

        // Update charge bar for this attacker immediately after its attack
        // Find slot by matching attackerId against result.robotParty (not stale gameState)
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

    // Build a map of ally HP before enemy attacks for progressive updates
    const allyHpMap = {};
    if (result.allies) {
      for (const ally of result.allies) {
        // Reconstruct pre-enemy-attack HP by adding back enemy damage dealt to this ally
        const dmgToThisAlly = (result.enemyAttacks || [])
          .filter(a => a.targetId === ally.id)
          .reduce((sum, a) => sum + a.damage, 0);
        allyHpMap[ally.id] = { hp: ally.hp + dmgToThisAlly, maxHp: ally.maxHp };
      }
    }

    // Show enemy robot attacks with real-time ally HP updates
    if (result.enemyAttacks?.length > 0) {
      await delay(400);
      for (const atk of result.enemyAttacks) {
        const effectiveness = atk.elementMultiplier > 1 ? ' (super effective!)' :
                              atk.elementMultiplier < 1 ? ' (not very effective...)' : '';
        const actionArea = document.getElementById('action-area');
        if (actionArea) {
          actionArea.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong>${effectiveness}</div>`;
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

    // Show KO swap messages with death/swap-in animations (Bug F)
    if (result.koSwaps?.length > 0) {
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
          actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${swap.replacement} swaps in!</div>`;
        }

        // Re-render the robot row with updated party, then animate new robot in
        if (result.robotParty?.active) {
          const robotRow = document.getElementById('chip-row');
          if (robotRow) {
            // Temporarily update the display inline
            const slots = robotRow.querySelectorAll('.robot-slot');
            const swapSlot = slots[koIndex];
            if (swapSlot) {
              swapSlot.classList.remove('robot-dying');
              swapSlot.classList.add('robot-swapping-in');
              // Update sprite and HP for the new robot
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
        }
        await delay(800);
      }
    }

    // Final state update with server-authoritative values (no updateUI to avoid DOM rebuild flicker)
    if (result.robotParty || result.enemies) {
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
      // Set final HP bars without full DOM rebuild
      if (result.enemies?.length > 1) {
        result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
      } else if (result.enemies?.[0]) {
        characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
      }
      updateRobotHpBars(result.robotParty?.active, null);
    }

    // Update chip charges (increment each cycle in robot combat too)
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check combat end
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Pause for next vocab review
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();

  } catch (error) {
    console.error('Robot attack error:', error);
    playerAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
    }
  }
}

/**
 * Execute robot defend — calls /robot-combat-cycle with 'defend'
 * Defend: all robots gain +1 ultimate charge, enemies attack with 50% damage
 */
async function executeRobotDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Robot defend error:', result.error);
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Show defend indicator
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = '<div class="combat-defend-indicator">DEFENDING \u2014 50% damage, +1 charge</div>';
    }

    // Update charge bars immediately for defend (BUG A fix)
    if (result.robotParty?.active) {
      updateRobotHpBars(result.robotParty.active, null);
    }
    await delay(600);

    // Build ally HP map for progressive updates during enemy attacks
    const gs = getGameState();
    const allyHpMap = {};
    if (result.allies) {
      for (const ally of result.allies) {
        const dmgToThisAlly = (result.enemyAttacks || [])
          .filter(a => a.targetId === ally.id)
          .reduce((sum, a) => sum + a.damage, 0);
        allyHpMap[ally.id] = { hp: ally.hp + dmgToThisAlly, maxHp: ally.maxHp };
      }
    }

    // Show enemy attacks (50% damage already applied server-side) with real-time HP
    if (result.enemyAttacks?.length > 0) {
      for (const atk of result.enemyAttacks) {
        const actionArea2 = document.getElementById('action-area');
        if (actionArea2) {
          actionArea2.innerHTML = `<div class="combat-robot-attack enemy">${atk.attackerName} deals <strong>${atk.damage}</strong> (halved)</div>`;
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

    // Update enemy HP (all enemies in multi-enemy combat)
    if (result.enemies?.length > 1) {
      result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
    } else if (result.enemies?.[0]) {
      const enemy = result.enemies[0];
      characterUI.updateEnemyHPBar({ current: enemy.hp, max: enemy.maxHp });
    }

    // Show KO swap messages with death/swap-in animations (Bug F)
    if (result.koSwaps?.length > 0) {
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

        const actionArea2 = document.getElementById('action-area');
        if (actionArea2) {
          actionArea2.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${swap.replacement} swaps in!</div>`;
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
              if (icon) icon.src = `/assets/sprites/robots/${newRobot.id}.webp`;
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

    // Final state update with server-authoritative values (no updateUI to avoid DOM rebuild flicker)
    if (result.robotParty || result.enemies) {
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
      // Set final robot HP bars without full DOM rebuild
      updateRobotHpBars(result.robotParty?.active, null);
    }

    // Update chip charges
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check combat end
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();

  } catch (error) {
    console.error('Robot defend error:', error);
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
    }
  }
}

/**
 * Execute a single enemy attack and schedule the next one
 */
export async function executeEnemyAttack() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack:', result.enemyAttack?.damage);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        logger.warn('[CombatLoop] Stale attack detected');
        combatActive = false; // Sync client state
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Enemy attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
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
    }

    // Update HP bars
    characterUI.updateEnemyHPBar(result.enemyHp);
    characterUI.updatePlayerHPBar(result.playerHp);

    // Update chip charges after enemy turn (charges incremented on backend)
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check if combat ended
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    // Don't reschedule - the vocab pause flow handles attack cycling
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

  } catch (error) {
    console.error('Enemy attack error:', error);
    // Don't trigger defeat for errors - recover by showing next flashcard
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Recovery: pause for vocab and show dual cards so player can continue
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
      logger.warn('[CombatLoop] Recovered from enemy attack error, showing dual cards');
    }
  }
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Enemy attack error:', result.error);
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
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

    // Update chip charges after enemy turn (charges incremented on backend)
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check if combat ended
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    // Pause combat - wait for vocab review before next cycle
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
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
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    // Recovery: pause for vocab and show dual cards so player can continue
    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
      logger.warn('[CombatLoop] Recovered from enemy attack error, showing dual cards');
    }
  }
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
    // Chip combat: use original functions
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
  if (setCombatAnimationActive) setCombatAnimationActive(true);

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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Enemy attack error:', result.error);
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Show defend indicator
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = '<div class="combat-defend-indicator">DEFENDING - 50% damage</div>';
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

    // Update chip charges (still increment on defend)
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check if combat ended
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();
    logger.info('[Combat] Defend complete. Paused for vocab review.');

  } catch (error) {
    console.error('Defend action error:', error);
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
      logger.warn('[CombatLoop] Recovered from defend error, showing dual cards');
    }
  }
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
        <div class="befriend-release-title">Party Full! Choose a robot to release:</div>
        <div class="befriend-release-list">
          ${allRobots.map(r => `
            <button class="befriend-release-btn" data-robot-id="${r.id}">
              ${ELEM_ICONS[r.element] || ''} ${r.nameEn} (Lv${r.level}) - ${r.slot === 'active' ? 'Equipped' : 'Reserve'}
            </button>
          `).join('')}
        </div>
        <button class="befriend-release-skip-btn">Let it go (skip)</button>
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
      persistent: true,
      skipRewrite: true
    });

    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(0); return; }

    const roundLabel = `Round ${roundNumber + 1}/3`;
    const buttons = round.options.map((opt, idx) => `
      <div class="shrine-chip-option befriend-answer-option" data-answer-index="${idx}" style="width:100%">
        <div class="shrine-chip-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">${opt}</div>
        </div>
      </div>
    `).join('');

    actionArea.innerHTML = `
      <div class="shrine-chip-list befriend-answer-list" style="padding:0 1rem">
        <div style="text-align:center; color:var(--text-secondary); margin-bottom:0.5rem; font-size:12px">${roundLabel}</div>
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
  if (setCombatAnimationActive) setCombatAnimationActive(true);

  try {
    const state = getGameState();
    const enemies = state.combat?.enemies || [];

    // Target selection (auto if only one eligible)
    const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
    let enemyIndex;
    if (eligible.length > 1) {
      enemyIndex = await showBefriendTargetSelect(enemies);
      if (enemyIndex < 0) {
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }
    }

    // Fetch conversation from server
    const convoResult = await apiGetBefriendConversation(enemyIndex);
    if (convoResult.error) {
      console.error('Befriend conversation error:', convoResult.error);
      if (setCombatAnimationActive) setCombatAnimationActive(false);
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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
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
          speaker: robotName, autoDismiss: 1000, skipRewrite: true
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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }

      // --- CORRECT ---
      if (answerResult.conversationComplete) {
        // All 3 rounds correct!
        narration.showNarration('\u3058\u3083\u3042\u3001\u53cb\u9054\u306b\u306a\u308d\u3046\uff01', {
          speaker: robotName, autoDismiss: 1500, skipRewrite: true
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
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">BEFRIENDED ${replaceResult.captured.nameEn}!</div>`;
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
              actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #9E9E9E;">Let it go...</div>`;
            }
            await delay(800);
          }
        } else {
          // Normal success
          const actionArea = document.getElementById('action-area');
          if (actionArea && captured) {
            actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">BEFRIENDED ${captured.nameEn}!</div>`;
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
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        return;
      }

      // Correct but not complete — brief pause then show next round
      await delay(300);
    }

  } catch (error) {
    console.error('Befriend conversation error:', error);
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
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
      const gs = getGameState();
      const isRobotCombat = gs?.combat?.isRobotCombat;
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

