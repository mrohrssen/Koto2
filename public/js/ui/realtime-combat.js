/**
 * Realtime Combat UI Module - Handles real-time combat mechanics
 *
 * EXTRACTED FROM: public/game.js (Step 6.5)
 *
 * FUNCTIONS:
 * - startRealtimeCombat: Initialize real-time combat mode
 * - executePlayerAttack: Handle player attack in combat
 * - executeEnemyAttack: Handle enemy attack in combat
 * - executeEnemyAttackThenPause: Enemy attack followed by vocab pause
 * - resumeCombatAfterVocab: Continue combat after word review
 * - stopRealtimeCombat: End combat and show results
 */

// ============ MODULE STATE ============

// Combat state
let realtimeCombatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
let currentPlayerInterval = 2000;
let currentEnemyInterval = 2500;
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

// Utility
let delay = null;

const API_BASE = '';

/**
 * Initialize the realtime combat UI module with callbacks
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

  // Utility
  delay = callbacks.delay;
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Check if realtime combat is active
 * @returns {boolean}
 */
export function isRealtimeCombatActive() {
  return realtimeCombatActive;
}

/**
 * Check if combat is paused for vocab review
 * @returns {boolean}
 */
export function isCombatPausedForVocab() {
  return combatPausedForVocab;
}

/**
 * Set realtime combat active state (for external sync)
 * @param {boolean} active
 */
export function setRealtimeCombatActive(active) {
  realtimeCombatActive = active;
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
  realtimeCombatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
}

// ============ REALTIME COMBAT FUNCTIONS ============

/**
 * Start realtime combat mode
 */
export function startRealtimeCombat() {
  if (realtimeCombatActive) return;

  realtimeCombatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // Fetch chip loadout for combat display (non-blocking)
  if (!getChipLoadoutCache()) {
    fetch(`${API_BASE}/api/game/chip-loadout`)
      .then(r => r.json())
      .then(data => {
        setChipLoadoutCache(data);
        updateActionPanel(); // Re-render with chips
      })
      .catch(err => console.warn('[Combat] Failed to fetch chip loadout:', err));
  }

  // Update action panel to show combat indicator
  updateActionPanel();

  // Initialize word practice cards
  wordPractice.initCombatWords();

  console.log('[Combat] Starting realtime combat with vocab pause mode');

  // Execute first player attack, which will chain into enemy attack, then pause
  executePlayerAttack();
}

/**
 * Execute a single player attack and schedule the next one
 */
export async function executePlayerAttack() {
  if (!realtimeCombatActive || playerAttackPending || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'player', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Player attack:', result.playerAttack?.damage, 'interval:', result.playerInterval);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale player attack ignored (combat ended on server)');
        realtimeCombatActive = false; // Sync client state
        return;
      }
      console.error('Player attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (getEnemyDialogueActive()) {
      playerAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

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
    // Combat pauses until Enter is pressed - don't schedule next attack
    if (result.enemyGlitching && result.glitchingDialogue) {
      showEnemyDialogue(result.glitchingDialogue, 'glitching');
      return; // Timers cleared in showEnemyDialogue, restarted in dismissEnemyDialogue
    }

    // Check if combat ended
    if (result.combatEnded) {
      // Show liberated dialogue on victory
      if (result.victory && result.liberatedDialogue) {
        showEnemyDialogue(result.liberatedDialogue, 'liberated');
      }
      stopRealtimeCombat(result);
      return;
    }

    playerAttackPending = false;

    // Combat pause mode: trigger enemy attack after player, then pause for vocab review
    if (realtimeCombatActive && !getEnemyDialogueActive()) {
      // Small delay before enemy attacks back
      setTimeout(() => {
        executeEnemyAttackThenPause();
      }, 400);
    }

  } catch (error) {
    console.error('Player attack error:', error);
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Execute a single enemy attack and schedule the next one
 */
export async function executeEnemyAttack() {
  if (!realtimeCombatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack:', result.enemyAttack?.damage, 'interval:', result.enemyInterval);

    if (result.error) {
      // "No active combat" means server state is out of sync - don't trigger false game over
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
        realtimeCombatActive = false; // Sync client state
        return;
      }
      console.error('Enemy attack error:', result.error);
      // Only trigger defeat for real errors, not sync issues
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    // If dialogue appeared during fetch, don't process results
    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

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
      }
    }

    // Update HP bars
    characterUI.updateEnemyHPBar(result.enemyHp);
    characterUI.updatePlayerHPBar(result.playerHp);

    // Check if combat ended
    if (result.combatEnded) {
      stopRealtimeCombat(result);
      return;
    }

    // Don't reschedule - the vocab pause flow handles attack cycling
    enemyAttackPending = false;

  } catch (error) {
    console.error('Enemy attack error:', error);
    // Only trigger defeat if combat hasn't already ended (prevents race condition with victory)
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!realtimeCombatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/realtime-attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

    if (result.error) {
      if (result.error === 'No active combat') {
        console.warn('[Combat] Stale enemy attack ignored (combat ended on server)');
        realtimeCombatActive = false;
        return;
      }
      console.error('Enemy attack error:', result.error);
      if (realtimeCombatActive) {
        stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
      }
      return;
    }

    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      return;
    }

    // Update intervals from server
    if (result.playerInterval) currentPlayerInterval = result.playerInterval;
    if (result.enemyInterval) currentEnemyInterval = result.enemyInterval;

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
      }
    }

    // Update HP bars
    characterUI.updateEnemyHPBar(result.enemyHp);
    characterUI.updatePlayerHPBar(result.playerHp);

    // Check if combat ended
    if (result.combatEnded) {
      stopRealtimeCombat(result);
      return;
    }

    // Pause combat - wait for vocab review before next cycle
    enemyAttackPending = false;
    combatPausedForVocab = true;
    console.log('[Combat] Paused for vocab review. Review a word to continue.');

  } catch (error) {
    console.error('Enemy attack error:', error);
    if (realtimeCombatActive) {
      stopRealtimeCombat({ combatEnded: true, victory: false, error: true });
    }
  }
}

/**
 * Resume combat after vocab review - triggers next attack cycle
 */
export function resumeCombatAfterVocab() {
  if (!realtimeCombatActive || !combatPausedForVocab) return;

  combatPausedForVocab = false;
  console.log('[Combat] Resuming after vocab review');

  // Trigger player attack, which will chain into enemy attack, then pause again
  executePlayerAttack();
}

/**
 * Stop realtime combat and show results
 * @param {Object} result - Combat result data
 */
export async function stopRealtimeCombat(result) {
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

  realtimeCombatActive = false;
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

