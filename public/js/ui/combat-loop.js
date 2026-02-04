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
  getTierClassName
} from './combat-effects.js';

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
let setCombatAnimationActive = null;

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

  // Utility
  delay = callbacks.delay;
  setCombatAnimationActive = callbacks.setCombatAnimationActive;
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

  if (showDualFlashCards) {
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

  if (actionType === 'defend') {
    // Defend: skip player attack, go straight to enemy attack with damage reduction
    executeDefendThenPause();
  } else {
    // Attack: normal flow - player attacks, then enemy attacks
    executePlayerAttack();
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

