/**
 * Combat Loop UI Module - Vocab-pause turn-based combat
 *
 * EXTRACTED FROM: public/game.js (Step 6.5)
 *
 * Combat flow: word review → player attack → 400ms → enemy attack → pause → repeat
 *
 * FUNCTIONS:
 * - startCombatLoop: Initialize combat loop
 * - executePlayerAttack: Handle player attack in combat
 * - executeEnemyAttack: Handle enemy attack in combat
 * - executeEnemyAttackThenPause: Enemy attack followed by vocab pause
 * - resumeCombatAfterVocab: Continue combat after word review
 * - stopCombatLoop: End combat and show results
 */

import { playSFX } from '../audio.js';

// ============ MODULE STATE ============

// Combat state
let combatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
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
let showChipEffect = null;
let animateEnemyHurt = null;
let animatePlayerHurt = null;
let animateEnemyDefeat = null;
let animateChipPipeline = null;
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
  showChipEffect = callbacks.showChipEffect;
  animateEnemyHurt = callbacks.animateEnemyHurt;
  animatePlayerHurt = callbacks.animatePlayerHurt;
  animateEnemyDefeat = callbacks.animateEnemyDefeat;
  animateChipPipeline = callbacks.animateChipPipeline;
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

  // Utility
  delay = callbacks.delay;
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

function showNextFlashCardFromQueue() {
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCard) {
    showFlashCard(word);
  }
}

// ============ COMBAT LOOP FUNCTIONS ============

/**
 * Start the combat loop (vocab-pause turn-based combat)
 */
export async function startCombatLoop() {
  if (combatActive) return;

  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  // Start paused - require vocab review before first attack
  combatPausedForVocab = true;

  // Fetch chip loadout for combat display (always refresh to catch auto-equipped chips)
  fetch(`${API_BASE}/api/game/chip-loadout`)
    .then(r => r.json())
    .then(data => {
      setChipLoadoutCache(data);
      updateActionPanel(); // Re-render with chips
    })
    .catch(err => console.warn('[Combat] Failed to fetch chip loadout:', err));

  // Initialize word practice cards and wait for words to be ready
  await wordPractice.initCombatWords();

  // Show first flash card now that words are loaded
  showNextFlashCardFromQueue();

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

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'player', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Player attack:', result.playerAttack?.damage);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale player attack ignored (combat ended on server)');
        combatActive = false; // Sync client state
        return;
      }
      console.error('Player attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
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
        showDamageNumber(pa.damage, false, pa.critical);
        animateEnemyHurt();
        playSFX('attack');

        // Animate chip pipeline if present
        if (pa.pipelineResult) {
          animateChipPipeline(pa.pipelineResult);
        }

        // Show chip effects that triggered
        if (pa.chipEffects && pa.chipEffects.length > 0) {
          const statusNames = {
            defrag: 'デフラグ!', lag: 'ラグ!', bufferOverflow: 'バッファオーバーフロー!',
            corrupted: '破損!', exposed: '露出!', overheated: 'オーバーヒート!'
          };
          pa.chipEffects.forEach((effect, i) => {
            setTimeout(() => {
              const displayName = statusNames[effect.status] || effect.status;
              showChipEffect(displayName, false);
            }, i * 200); // Stagger multiple effects
          });
        }

        // Show DoT damage from status effects (defrag, overheated, etc.)
        if (pa.dotDamage && pa.dotDamage > 0) {
          setTimeout(() => {
            showDotDamage(pa.dotDamage, false);
          }, 300); // Show after chip effect text
        }
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
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (combatActive) {
      stopCombatLoop({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Execute a single enemy attack and schedule the next one
 */
export async function executeEnemyAttack() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack:', result.enemyAttack?.damage);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
        combatActive = false; // Sync client state
        return;
      }
      console.error('Enemy attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    // If dialogue appeared during fetch, don't process results
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
      stopCombatLoop(result);
      return;
    }

    // Don't reschedule - the vocab pause flow handles attack cycling
    enemyAttackPending = false;

  } catch (error) {
    console.error('Enemy attack error:', error);
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (combatActive) {
      stopCombatLoop({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

    if (result.error) {
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
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
      stopCombatLoop(result);
      return;
    }

    // Pause combat - wait for vocab review before next cycle
    enemyAttackPending = false;
    combatPausedForVocab = true;
    // Show next flash card for the next review
    showNextFlashCardFromQueue();
    console.log('[Combat] Paused for vocab review. Review a word to continue.');

  } catch (error) {
    console.error('Enemy attack error:', error);
    if (combatActive) {
      stopCombatLoop({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Resume combat after vocab review - triggers next attack cycle
 */
export function resumeCombatAfterVocab() {
  if (!combatActive || !combatPausedForVocab) return;

  combatPausedForVocab = false;

  // Trigger player attack, which will chain into enemy attack, then pause again
  executePlayerAttack();
}

/**
 * Stop combat loop and show results
 * @param {Object} result - Combat result data
 */
export async function stopCombatLoop(result) {
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

  // Brief pause before narration (let final damage numbers display)
  await delay(600);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victory: result.victory,
        expGained: result.expGained,
        goldGained: result.goldGained,
        loot: result.loot,
        leveledUp: result.leveledUp,
        newLevel: result.newLevel,
        isBoss: result.isBoss,
        ...apiKeys
      })
    });
    const narrationResult = await response.json();

    // Display narration
    if (narrationResult.narration) {
      narration.showNarration(narrationResult.narration);
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
    } else {
      showGameOverModal(result);
    }

  } catch (error) {
    console.error('Error getting combat end narration:', error);
    // Fallback narration
    if (result.victory) {
      narration.showNarration('市民解放！');
      showVictoryModal(result);
    } else {
      narration.showNarration('敗北...');
      showGameOverModal(result);
    }
  }

  // Refresh full UI state
  updateUI();
}

