import { logger } from './logger.js';
export { apiUrl } from './platform.js';
import { apiUrl, PLATFORM } from './platform.js';

// ============ CORE API WRAPPER ============

// Per-endpoint deduplication (replaces global isLoading boolean)
const inFlightRequests = new Set();

// Connection health tracking (used by offline banner)
let consecutiveFailures = 0;
let hasRedirectedFor401 = false;
let connectionCallbacks = { onOffline: null, onOnline: null };

export function setConnectionCallbacks(cbs) {
  connectionCallbacks = cbs;
}

function onApiSuccess() {
  if (consecutiveFailures > 0) {
    consecutiveFailures = 0;
    connectionCallbacks.onOnline?.();
  }
}

function onApiFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= 2) {
    connectionCallbacks.onOffline?.();
  }
}

/**
 * Get auth headers with JWT token
 * @returns {object} Headers object with Content-Type and Authorization
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

/**
 * Generic API call wrapper
 * Includes JWT Authorization header from localStorage in every request
 *
 * @param {string} endpoint - API endpoint (relative to /api/game)
 * @param {string} method - HTTP method (default: POST)
 * @param {object|null} body - Request body
 * @param {function} onError - Error handler callback (receives error message)
 * @returns {Promise<object|null>} Response data or null on error
 */
async function apiCall(endpoint, method = 'POST', body = null, onError = null, opts = {}) {
  logger.debug('[API] Request:', { endpoint, method });
  const bypassGate = opts.bypassLoadingGate === true;

  // Per-endpoint dedup: block duplicate requests to the same endpoint
  if (!bypassGate && inFlightRequests.has(endpoint)) {
    logger.warn('[API] Request deduped - in flight:', { endpoint });
    return null;
  }

  // GETs always retry; POSTs only if caller opts in
  const maxAttempts = (method === 'GET' || opts.retryable) ? 3 : 1;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const baseDelay = 500 * Math.pow(2, attempt - 1);
      const jitter = baseDelay * (0.8 + Math.random() * 0.4);
      await new Promise(r => setTimeout(r, jitter));
      logger.debug('[API] Retry:', { endpoint, attempt });
    }

    if (!bypassGate) inFlightRequests.add(endpoint);
    const startedAt = performance.now();

    try {
      const options = { method, headers: getAuthHeaders() };
      if (method !== 'GET' && body) options.body = JSON.stringify(body);

      const response = await fetch(`${PLATFORM.apiBase}/api/game${endpoint}`, options);

      // 401 handled specifically — don't retry auth errors
      if (response.status === 401) {
        if (!hasRedirectedFor401) {
          hasRedirectedFor401 = true;
          localStorage.removeItem('authToken');
          sessionStorage.setItem('sessionExpiredMsg', 'Session expired, please log in again');
          window.location.href = '/';
        }
        onApiSuccess(); // Server responded — connection is fine
        throw new Error('Session expired');
      }

      const data = await response.json();

      // Any HTTP response (even 4xx/5xx) proves the server is reachable
      onApiSuccess();

      if (!response.ok) {
        if (opts.returnErrorBody) {
          return { error: data.error || `HTTP ${response.status}` };
        }
        throw new Error(data.error || 'API call failed');
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      console.log(`[API Timing] ${method} /api/game${endpoint} -> ${response.status} in ${elapsedMs}ms`);

      return data;
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      console.log(`[API Timing] ${method} /api/game${endpoint} -> error in ${elapsedMs}ms`);
      lastError = error;

      // Don't retry auth errors
      if (error.message === 'Session expired') break;

      // Only count as connection failure if fetch itself threw (network error),
      // not if the server returned an error HTTP status
      if (error instanceof TypeError) onApiFailure();
    } finally {
      inFlightRequests.delete(endpoint);
    }
  }

  logger.error('[API] Request failed:', { endpoint, error: lastError?.message });
  if (onError) onError(lastError?.message);
  return null;
}

/**
 * Check if an API call is currently in progress
 */
function isApiLoading() {
  return inFlightRequests.size > 0;
}

// ============ GAME STATE ENDPOINTS ============

/**
 * Get current game state from server
 * @returns {Promise<object>} Game state with player, run, combat, phase
 */
async function getGameState() {
  try {
    const response = await fetch(apiUrl('/api/game/state'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch game state:', error.message);
    return { phase: 'no_save' };
  }
}


/**
 * Get server settings
 * @returns {Promise<object>} Settings object
 */
async function getSettings() {
  try {
    const response = await fetch(apiUrl('/api/settings'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch settings:', error.message);
    return {};
  }
}

// ============ PLAYER MANAGEMENT ENDPOINTS ============

/**
 * Create a new player character
 * @param {string} name - Character name
 * @param {object} stats - Initial stat allocation {str, agi, vit, int, dex, luk}
 * @param {number} statPoints - Remaining stat points
 * @returns {Promise<object>} Result with state and narration
 */
async function createPlayer(name, stats, statPoints) {
  return apiCall('/create-player', 'POST', { name, stats, statPoints });
}


// ============ RUN MANAGEMENT ENDPOINTS ============

/**
 * Start a new dungeon run
 * @returns {Promise<object>} Result with state and narration
 */
async function startRun(body = null) {
  return apiCall('/start-run', 'POST', body, null, { retryable: true });
}

/**
 * Confirm creature selection after area is chosen
 * @param {string[]} starterIds - Selected creature IDs
 * @returns {Promise<object>} Result with state
 */
async function confirmCreatures(starterIds) {
  return apiCall('/confirm-creatures', 'POST', { starterIds });
}

/**
 * Forfeit the current run
 * @returns {Promise<object>} Result
 */
async function forfeitRun(isVictory = false) {
  return apiCall('/forfeit', 'POST', { isVictory });
}

/**
 * Get area options for selection
 * @returns {Promise<Array>} Array of area options
 */
async function getAreaOptions() {
  try {
    const response = await fetch(apiUrl('/api/game/area-options'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to fetch area options:', error.message);
    return [];
  }
}

/**
 * Select an area
 * @param {string} areaId - Area identifier
 * @returns {Promise<object>} Result with state
 */
async function selectArea(areaId) {
  try {
    const response = await fetch(apiUrl('/api/game/select-area'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ areaId, forceRoomType: getForceRoomType() })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to select area:', error.message);
    return { error: 'Network error' };
  }
}


function getForceRoomType() {
  return localStorage.getItem('jrpg_forceRoomType') || null;
}

// ============ ROOM EXPLORATION ENDPOINTS ============

/** Proceed to next room */
async function proceed() {
  return apiCall('/proceed', 'POST', { forceRoomType: getForceRoomType() }, null, { retryable: true });
}

/** Start room encounter */
async function roomEncounter() {
  return apiCall('/room-encounter', 'POST');
}

/** Upgrade creature at shrine */
async function shrineUpgrade(creatureId) {
  return apiCall('/shrine-upgrade', 'POST', { creatureId });
}

/** Claim quiz reward */
async function quizReward(rewardType, creatureId = null) {
  return apiCall('/quiz-reward', 'POST', { rewardType, creatureId });
}

/** Get a quiz question (may be from Bunpro or static) */
async function getQuizQuestion() {
  try {
    const response = await fetch(apiUrl('/api/game/quiz-question'), {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await response.json();

    // Store Bunpro metadata for answer submission
    if (data._bunpro) {
      data._bunproMeta = data._bunpro;
      delete data._bunpro; // Don't expose to UI
    }

    console.log('[API] Quiz question:', { id: data.id, type: data.type, hasBunpro: !!data._bunproMeta });
    return data;
  } catch (error) {
    logger.error('[API] Failed to get quiz question:', error.message);
    return { error: 'Network error' };
  }
}

/** Submit quiz answer for validation */
async function submitQuizAnswer(questionId, selectedIndex, bunproMeta = null) {
  try {
    const response = await fetch(apiUrl('/api/game/quiz-answer'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        questionId,
        selectedIndex,
        ...(bunproMeta ? { _bunpro: bunproMeta } : {})
      })
    });
    const data = await response.json();
    console.log('[API] Quiz answer result:', { correct: data.correct });
    return data;
  } catch (error) {
    logger.error('[API] Failed to submit quiz answer:', error.message);
    return { error: 'Network error' };
  }
}

// ============ COMBAT ENDPOINTS ============

/** Start a regular enemy encounter */
async function startEncounter() {
  return apiCall('/start-encounter', 'POST');
}

// ============ SHOP/ECONOMY ENDPOINTS ============

/** Skip the current shop */
async function shopSkip() {
  return apiCall('/shop-skip', 'POST');
}

/** Get dealer room state (inventory with sell prices, offered creature) */
async function getDealerState() {
  return apiCall('/dealer-state', 'GET');
}

/** Sell a creature to the dealer */
async function dealerSell(creatureId) {
  return apiCall('/dealer-sell', 'POST', { creatureId });
}

/** Buy a creature from the dealer */
async function dealerBuy(creatureId) {
  return apiCall('/dealer-buy', 'POST', { creatureId });
}

/** Leave the dealer room */
async function dealerLeave() {
  return apiCall('/dealer-leave', 'POST');
}

// ============ WHACK-A-MOLE ENDPOINTS ============

/** Get the vocab pool for whack-a-mole mini-game */
async function getWhackAMolePool() {
  return apiCall('/whack-a-mole-pool', 'GET');
}

/** Submit whack-a-mole completion with score */
async function completeWhackAMole(score) {
  return apiCall('/whack-a-mole-complete', 'POST', { score });
}

/** Get GM dialogue tokens for whack-a-mole room */
async function getWhackAMoleDialogue() {
  return apiCall('/whack-a-mole-dialogue', 'GET');
}

/** Skip whack-a-mole room (player declined) */
async function skipWhackAMole() {
  return apiCall('/whack-a-mole-skip', 'POST');
}

// ============ VOCAB/JPDB ENDPOINTS ============

/** Send JPDB review
 * @param {number} vid - Vocabulary ID
 * @param {number} sid - Sense ID
 * @param {number} grade - Review grade (1-5)
 * @param {string} [wordText] - The Japanese word text (for bootstrap word-knowledge tracking)
 * @param {boolean} isDiscovery - Whether this is a discovery room review
 */
async function sendJpdbReview(vid, sid, grade, wordText = null, isDiscovery = false) {
  console.log('[JPDB Review API] sendJpdbReview called:', { vid, sid, grade, isDiscovery });
  try {
    const response = await fetch(apiUrl('/api/jpdb/review'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vid, sid, grade, isDiscovery, wordText })
    });
    const result = await response.json();
    console.log('[JPDB Review API] Response:', result);
    return result;
  } catch (error) {
    logger.error('[API] Failed to send JPDB review:', error.message);
    return { error: 'Network error' };
  }
}

/** Parse text into clickable tokens via Sudachi + local dictionary
 * @param {string} text - Text to parse
 */
async function parseLocalText(text) {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/parse-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ text })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to parse text:', error.message);
    return { error: 'Network error' };
  }
}

/** Lookup word meaning from local dictionary
 * @param {string} word - Dictionary form of the word
 */
async function lookupLocalWord(word) {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/lookup-word'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ word })
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to lookup word:', error.message);
    return { error: 'Network error' };
  }
}

/** Get discovery words for the word discovery room
 * @param {number} limit - Number of words to fetch (default: 2)
 * @returns {Promise<Object>} Discovery words data
 */
async function getDiscoveryWords(limit = 2) {
  try {
    const response = await fetch(`${PLATFORM.apiBase}/api/game/discovery-words?limit=${limit}`, {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get discovery words:', error.message);
    return { words: [] };
  }
}

/** Get discovery status (daily limit tracking)
 * @returns {Promise<Object>} { todayCount, dailyLimit, atLimit }
 */
async function getDiscoveryStatus() {
  try {
    const response = await fetch(apiUrl('/api/game/discovery-status'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    logger.error('[API] Failed to get discovery status:', error.message);
    return { todayCount: 0, dailyLimit: 10, atLimit: false };
  }
}

/**
 * Get due words for speed review
 * @param {Array} reviewedWords - Array of { vid, sid } objects for words just reviewed
 * @returns {Promise<Object>} { words: Array, error?: string }
 */
export async function getDueWords(reviewedWords = []) {
  try {
    const response = await fetch(apiUrl('/api/vocab/due-words'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ reviewedWords })
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get due words:', error);
    return { words: [], error: error.message };
  }
}

/**
 * Get due vocab words from internal FSRS (not JPDB).
 * @returns {Promise<Object>} { words: Array }
 */
export async function getVocabDueWords() {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/due-words'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get vocab due words:', error);
    return { words: [] };
  }
}

/**
 * Get count of due vocab words from internal FSRS.
 * @returns {Promise<Object>} { count: number }
 */
export async function getVocabDueCount() {
  try {
    const response = await fetch(apiUrl('/api/game/known-words/due-count'), {
      headers: getAuthHeaders()
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to get vocab due count:', error);
    return { count: 0 };
  }
}

/**
 * Review a vocab word via internal FSRS.
 * @param {string} word - The word to review
 * @param {string} grade - 'good' or 'again'
 * @returns {Promise<Object>} { ok, mastered, card }
 */
export async function reviewVocabWord(word, grade, isDiscovery = false) {
  try {
    const body = { word, grade };
    if (isDiscovery) body.isDiscovery = true;
    const response = await fetch(apiUrl('/api/game/known-words/review'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    console.error('[API] Failed to review vocab word:', error);
    return null;
  }
}

/** Mark word discovery room as complete
 * @returns {Promise<Object>} Result with updated state
 */
async function completeDiscovery() {
  return apiCall('/complete-discovery', 'POST');
}

/** Initialize speed review room snapshot for current room */
async function startSpeedReviewRoom(roomId) {
  return apiCall('/speed-review-room/start', 'POST', { roomId });
}

/** Record one committed review card in speed review room */
async function progressSpeedReviewRoom(roomId, word, commitIndex) {
  return apiCall(
    '/speed-review-room/progress',
    'POST',
    { roomId, word, commitIndex },
    null,
    { bypassLoadingGate: true }
  );
}

/** Mark speed review room as complete/reconciled */
async function completeSpeedReviewRoom(roomId) {
  return apiCall('/speed-review-room/complete', 'POST', { roomId });
}

// ============ CREATURE COMBAT ============

async function startCreatureEncounter() {
  return apiCall('/start-creature-encounter', 'POST');
}

async function creatureCombatCycle(actionType, moveChoices = []) {
  return apiCall('/creature-combat-cycle', 'POST', { actionType, moveChoices }, null, { retryable: true });
}

async function getCreatureCollection() {
  return apiCall('/creature-collection', 'GET');
}

async function rollPostCombatShop() {
  return apiCall('/creature-shop-roll', 'POST');
}

async function selectShopItem(itemIndex, targetIndex = 0) {
  return apiCall('/creature-shop-select', 'POST', { itemIndex, targetIndex });
}

async function swapCreature(activeIndex, reserveIndex) {
  return apiCall('/swap-creature', 'POST', { activeIndex, reserveIndex });
}

async function rearrangeCreatures(indexA, indexB) {
  return apiCall('/rearrange-creatures', 'POST', { indexA, indexB });
}

async function learnMove(creatureIndex, newMoveId, replaceIndex) {
  return apiCall('/learn-move', 'POST', { creatureIndex, newMoveId, replaceIndex });
}

async function swapCreatureEquip(activeIndex, reserveIndex) {
  return apiCall('/swap-creature-equip', 'POST', { activeIndex, reserveIndex });
}

async function befriendReplace(releaseCreatureId) {
  return apiCall('/befriend-replace', 'POST', { releaseCreatureId });
}

/** Get the current befriend quiz options */
async function getBefriendQuiz() {
  return apiCall('/befriend-quiz', 'POST');
}

/** Answer a befriend quiz (action: 'fight' or 'talk', answerId for talk) */
async function answerBefriendQuiz(action, answerId = null) {
  return apiCall('/befriend-quiz-answer', 'POST', { action, answerId });
}

async function getBefriendConversation(enemyIndex) {
  return apiCall('/befriend-conversation', 'POST',
    typeof enemyIndex === 'number' ? { enemyIndex } : {}, null,
    { bypassLoadingGate: true, returnErrorBody: true });
}

async function submitBefriendAnswer(roundIndex, selectedIndex) {
  return apiCall('/befriend-answer', 'POST', { roundIndex, selectedIndex }, null,
    { bypassLoadingGate: true });
}

// ============ NPC DIALOGUE ENDPOINTS ============

async function startNpcDialogue() {
  return apiCall('/npc-dialogue-start', 'POST');
}

async function respondNpcDialogue(roundIndex, selectedIndex) {
  return apiCall('/npc-dialogue-respond', 'POST', { roundIndex, selectedIndex });
}

// ============ SKILL MASTER ENDPOINTS ============

/** Get 3 skill offers for the Skill Master room */
async function skillMasterOffers() {
  return apiCall('/skill-master-offers', 'POST');
}

/** Choose a skill offer in the Skill Master room */
async function skillMasterChoose(skillId) {
  return apiCall('/skill-master-choose', 'POST', { skillId });
}

// ============ FRIENDLY NPC ENDPOINTS ============

/** Get 3 item offers from a friendly NPC (idempotent per room) */
async function getFriendlyNpcOffers() {
  return apiCall('/friendly-npc-offers', 'POST');
}

/** Choose one item from the friendly NPC's offers */
async function chooseFriendlyNpcItem(itemId, targetCreatureIndex = null) {
  const body = { itemId };
  if (targetCreatureIndex !== null) body.targetCreatureIndex = targetCreatureIndex;
  return apiCall('/friendly-npc-choose', 'POST', body);
}

// ============ NPC BATTLE SKILL REWARD ENDPOINTS ============

/** Get 3 skill offers for the NPC battle post-victory reward (idempotent per room) */
async function npcBattleSkillOffers() {
  return apiCall('/npc-battle-skill-offers', 'POST');
}

/** Choose a skill from the NPC battle reward */
async function npcBattleSkillChoose(skillId) {
  return apiCall('/npc-battle-skill-choose', 'POST', { skillId });
}

// ============ PVP TEAM ENDPOINTS ============

/**
 * Save the current run's team to a PvP slot
 * @param {number} slotIndex - Slot index 0-2
 * @returns {Promise<object>} { ok, pvpTeams }
 */
export async function savePvpTeam(slotIndex) {
  return apiCall('/pvp/save-pvp-team', 'POST', { slotIndex });
}

/**
 * Get all saved PvP team slots
 * @returns {Promise<object>} { pvpTeams }
 */
export async function getPvpTeams() {
  return apiCall('/pvp/pvp-teams', 'GET');
}

export {
  apiCall,
  isApiLoading,
  // Game state endpoints
  getGameState,
  getSettings,
  // Player management endpoints
  createPlayer,
  // Run management endpoints
  startRun,
  confirmCreatures,
  forfeitRun,
  getAreaOptions,
  selectArea,
  // Room exploration endpoints
  proceed,
  roomEncounter,
  shrineUpgrade,
  quizReward,
  getQuizQuestion,
  submitQuizAnswer,
  // Combat endpoints
  startEncounter,
  startCreatureEncounter,
  creatureCombatCycle,
  getCreatureCollection,
  rollPostCombatShop,
  selectShopItem,
  swapCreature,
  rearrangeCreatures,
  learnMove,
  swapCreatureEquip,
  befriendReplace,
  getBefriendQuiz,
  answerBefriendQuiz,
  getBefriendConversation,
  submitBefriendAnswer,
  // NPC dialogue endpoints
  startNpcDialogue,
  respondNpcDialogue,
  // Shop/economy endpoints
  shopSkip,
  getDealerState,
  dealerSell,
  dealerBuy,
  dealerLeave,
  // Whack-a-mole endpoints
  getWhackAMolePool,
  completeWhackAMole,
  getWhackAMoleDialogue,
  skipWhackAMole,
  // Vocab/JPDB endpoints
  sendJpdbReview,
  parseLocalText,
  lookupLocalWord,
  getDiscoveryWords,
  getDiscoveryStatus,
  completeDiscovery,
  startSpeedReviewRoom,
  progressSpeedReviewRoom,
  completeSpeedReviewRoom,
  // Skill master endpoints
  skillMasterOffers,
  skillMasterChoose,
  // Friendly NPC endpoints
  getFriendlyNpcOffers,
  chooseFriendlyNpcItem,
  // NPC battle skill reward endpoints
  npcBattleSkillOffers,
  npcBattleSkillChoose
  // Note: getDueWords is exported inline
};
