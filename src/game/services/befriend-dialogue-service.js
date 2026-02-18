/**
 * @file befriend-dialogue-service.js - AI-generated befriend dialogue management
 *
 * Generates, caches, and manages per-user befriend conversation dialogues
 * for each robot. Dialogues are stored in data/befriend-{userId}.json.
 *
 * Each robot's dialogue has 3 rounds with speaker text, 3 options, and a correctIndex.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { DM_PROMPTS } from '../dm.js';

const LOG_PREFIX = '[BefriendDialogue]';

// Default data directory (overridable for testing)
let dataDir = 'data';

// In-memory locks
const generatingUsers = new Set();
const regeneratingRobots = new Set();

// ============================================================================
// FILE I/O (Task 1)
// ============================================================================

/**
 * Set the data directory (for testing).
 * @param {string} dir - Absolute or relative path to data directory
 */
export function _setDataDir(dir) {
  dataDir = dir;
}

/**
 * Reset all in-memory locks (for testing).
 */
export function _resetLocks() {
  generatingUsers.clear();
  regeneratingRobots.clear();
}

function getUserFilePath(userId) {
  return join(dataDir, `befriend-${userId}.json`);
}

/**
 * Load user dialogues from disk.
 * Returns { robots: {} } if the file doesn't exist.
 * @param {string} userId
 * @returns {object} { robots: { [robotId]: { status, rounds } } }
 */
export function loadUserDialogues(userId) {
  const filePath = getUserFilePath(userId);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { robots: {} };
    }
    console.error(`${LOG_PREFIX} Error reading ${filePath}:`, e.message);
    return { robots: {} };
  }
}

/**
 * Save user dialogues atomically (write to tmp, then rename).
 * @param {string} userId
 * @param {object} data - The full dialogues object to save
 */
export function saveUserDialogues(userId, data) {
  const filePath = getUserFilePath(userId);
  const tmpPath = filePath + '.tmp';
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (e) {
    // Clean up tmp file if it exists
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {}
    console.error(`${LOG_PREFIX} Error saving ${filePath}:`, e.message);
    throw e;
  }
}

/**
 * Get dialogue rounds for a specific robot, if ready.
 * @param {string} userId
 * @param {string} robotId
 * @returns {object[]|null} Array of 3 rounds, or null if not ready/missing
 */
export function getDialogueForRobot(userId, robotId) {
  const data = loadUserDialogues(userId);
  const entry = data.robots[robotId];
  if (!entry || entry.status !== 'ready') return null;
  if (!Array.isArray(entry.rounds) || entry.rounds.length !== 3) return null;
  return entry.rounds;
}

// ============================================================================
// VALIDATION (Task 2)
// ============================================================================

/**
 * Validate that parsed rounds have the correct structure.
 * Must be an array of exactly 3 rounds, each with:
 * - speaker: non-empty string
 * - options: array of exactly 3 strings
 * - correctIndex: number 0-2
 * @param {*} parsed
 * @returns {boolean}
 */
function validateRounds(parsed) {
  if (!Array.isArray(parsed) || parsed.length !== 3) return false;
  return parsed.every(r =>
    typeof r.speaker === 'string' && r.speaker.length > 0 &&
    Array.isArray(r.options) && r.options.length === 3 &&
    r.options.every(o => typeof o === 'string') &&
    typeof r.correctIndex === 'number' &&
    r.correctIndex >= 0 && r.correctIndex <= 2
  );
}

// ============================================================================
// SINGLE ROBOT AI GENERATION (Task 2)
// ============================================================================

/**
 * Generate befriend dialogue for a single robot via AI.
 * Calls aiConfig.chat() with the befriend prompt and validates the response.
 * @param {object} robot - Robot object with id, name, nameEn, element
 * @param {string[]} vocabulary - Player's known vocabulary
 * @param {object} aiConfig - { chat, provider, apiKey, openaiModel, openrouterModel, jlptLevel }
 * @returns {object[]|null} Array of 3 validated rounds, or null on failure
 */
export async function generateOneRobotDialogue(robot, vocabulary, aiConfig) {
  if (!aiConfig.chat || !aiConfig.apiKey) {
    console.error(`${LOG_PREFIX} Missing chat function or apiKey for robot ${robot.id}`);
    return null;
  }

  try {
    const prompt = DM_PROMPTS.befriendConversation({ robot });
    const response = await aiConfig.chat({
      provider: aiConfig.provider || 'anthropic',
      apiKey: aiConfig.apiKey,
      messages: [{ role: 'user', content: prompt }],
      vocabulary,
      jlptLevel: aiConfig.jlptLevel || 'N4',
      personaName: robot.name || robot.nameEn,
      openaiModel: aiConfig.openaiModel,
      openrouterModel: aiConfig.openrouterModel,
      purpose: 'other'
    });

    // Try to extract JSON from response (may have markdown fences)
    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];

    const parsed = JSON.parse(jsonStr.trim());
    if (validateRounds(parsed)) {
      return parsed;
    }
    console.error(`${LOG_PREFIX} Validation failed for robot ${robot.id}: structure invalid`);
    return null;
  } catch (e) {
    console.error(`${LOG_PREFIX} Generation failed for robot ${robot.id}:`, e.message);
    return null;
  }
}

// ============================================================================
// RETRY LOGIC (Task 3)
// ============================================================================

/**
 * Generate dialogue with retry and exponential backoff.
 * @param {object} robot - Robot object
 * @param {string[]} vocabulary - Player's vocabulary
 * @param {object} aiConfig - AI configuration
 * @param {object} opts - { maxRetries: 3, baseDelayMs: 2000 }
 * @returns {object[]|null} Validated rounds or null after all retries
 */
export async function generateWithRetry(robot, vocabulary, aiConfig, opts = {}) {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 2000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`${LOG_PREFIX} Attempt ${attempt + 1}/${maxRetries} for robot ${robot.id}`);
    const result = await generateOneRobotDialogue(robot, vocabulary, aiConfig);
    if (result) return result;

    // Wait with exponential backoff (except after last attempt)
    if (attempt < maxRetries - 1) {
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`${LOG_PREFIX} Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error(`${LOG_PREFIX} All ${maxRetries} attempts failed for robot ${robot.id}`);
  return null;
}

// ============================================================================
// BULK GENERATION (Task 3)
// ============================================================================

/**
 * Generate missing dialogues for all robots a user doesn't have yet.
 * Uses per-user locking to prevent duplicate concurrent runs.
 * Aborts the entire batch if any robot fails all retries.
 * @param {string} userId
 * @param {object} aiConfig - AI configuration
 * @param {string[]} vocabulary - Player's vocabulary
 * @param {object[]} robotList - Array of robot objects (overrides loading robots.json)
 * @param {object} opts - { cooldownMs: 1000, retryOpts: { maxRetries, baseDelayMs } }
 * @returns {object} { generated: number, skipped: number, aborted: boolean }
 */
export async function generateMissingDialogues(userId, aiConfig, vocabulary, robotList, opts = {}) {
  // Per-user lock
  if (generatingUsers.has(userId)) {
    console.log(`${LOG_PREFIX} Generation already in progress for user ${userId}, skipping`);
    return { generated: 0, skipped: 0, aborted: false, locked: true };
  }

  generatingUsers.add(userId);
  const cooldownMs = opts.cooldownMs ?? 1000;
  const retryOpts = opts.retryOpts || {};

  try {
    // Load existing dialogues
    const data = loadUserDialogues(userId);
    let generated = 0;
    let skipped = 0;

    // Load robot list from file if not provided
    let robots = robotList;
    if (!robots) {
      robots = JSON.parse(readFileSync('data/creatures.json', 'utf-8'));
    }

    for (let i = 0; i < robots.length; i++) {
      const robot = robots[i];
      const existing = data.robots[robot.id];
      if (existing && existing.status === 'ready') {
        skipped++;
        continue;
      }

      console.log(`${LOG_PREFIX} Generating dialogue for robot ${robot.id} (user: ${userId})`);

      // Save previous entry for rollback on abort
      const previousEntry = data.robots[robot.id] || null;

      // Mark as pending
      data.robots[robot.id] = { status: 'pending', rounds: null };
      saveUserDialogues(userId, data);

      const rounds = await generateWithRetry(robot, vocabulary, aiConfig, retryOpts);

      if (!rounds) {
        console.error(`${LOG_PREFIX} ABORTING batch: robot ${robot.id} failed all retries`);
        // Revert failed robot before aborting
        if (previousEntry) {
          data.robots[robot.id] = previousEntry;
        } else {
          delete data.robots[robot.id];
        }
        saveUserDialogues(userId, data);
        return { generated, skipped, aborted: true };
      }

      // Save immediately on success
      data.robots[robot.id] = { status: 'ready', rounds, generatedAt: new Date().toISOString() };
      saveUserDialogues(userId, data);
      generated++;
      console.log(`${LOG_PREFIX} Saved dialogue for robot ${robot.id}`);

      // Cooldown between robots (skip after last)
      if (cooldownMs > 0 && i < robots.length - 1) {
        await new Promise(resolve => setTimeout(resolve, cooldownMs));
      }
    }

    console.log(`${LOG_PREFIX} Batch complete for user ${userId}: ${generated} generated, ${skipped} skipped`);
    return { generated, skipped, aborted: false };
  } finally {
    generatingUsers.delete(userId);
  }
}

// ============================================================================
// SINGLE ROBOT REGENERATION (Task 3)
// ============================================================================

/**
 * Regenerate dialogue for a single robot (e.g., after player requests new dialogue).
 * Uses per-robot locking to prevent concurrent regeneration of the same robot.
 * On failure, reverts to old dialogue.
 * @param {string} userId
 * @param {object} robot - Robot object with id, name, element, etc.
 * @param {object} aiConfig - AI configuration
 * @param {string[]} vocabulary - Player's vocabulary
 * @param {object} opts - { retryOpts: { maxRetries, baseDelayMs } }
 * @returns {object} { success: boolean, rounds: object[]|null }
 */
export async function regenerateRobotDialogue(userId, robot, aiConfig, vocabulary, opts = {}) {
  const lockKey = `${userId}:${robot.id}`;

  if (regeneratingRobots.has(lockKey)) {
    console.log(`${LOG_PREFIX} Regeneration already in progress for ${lockKey}, skipping`);
    return { success: false, rounds: null, locked: true };
  }

  regeneratingRobots.add(lockKey);
  const retryOpts = opts.retryOpts || {};

  try {
    const data = loadUserDialogues(userId);
    const oldEntry = data.robots[robot.id];
    const oldRounds = oldEntry?.rounds || null;

    // Mark as pending
    data.robots[robot.id] = { status: 'pending', rounds: null };
    saveUserDialogues(userId, data);

    console.log(`${LOG_PREFIX} Regenerating dialogue for robot ${robot.id} (user: ${userId})`);
    const rounds = await generateWithRetry(robot, vocabulary, aiConfig, retryOpts);

    if (rounds) {
      // Reload from disk before writing to avoid overwriting concurrent changes
      const freshData = loadUserDialogues(userId);
      freshData.robots[robot.id] = { status: 'ready', rounds };
      saveUserDialogues(userId, freshData);
      console.log(`${LOG_PREFIX} Regeneration successful for robot ${robot.id}`);
      return { success: true, rounds };
    }

    // Revert to old dialogue on failure — reload from disk first
    console.error(`${LOG_PREFIX} Regeneration failed for robot ${robot.id}, reverting to old dialogue`);
    const freshData = loadUserDialogues(userId);
    freshData.robots[robot.id] = { status: 'ready', rounds: oldRounds };
    saveUserDialogues(userId, freshData);
    return { success: false, rounds: oldRounds };
  } catch (e) {
    // Crash recovery: try to revert robot status back to ready
    console.error(`${LOG_PREFIX} Unexpected error during regeneration for robot ${robot.id}:`, e.message);
    try {
      const recoveryData = loadUserDialogues(userId);
      if (recoveryData.robots[robot.id]) {
        recoveryData.robots[robot.id].status = 'ready';
        saveUserDialogues(userId, recoveryData);
      }
    } catch (recoveryErr) {
      console.error(`${LOG_PREFIX} Recovery save failed:`, recoveryErr.message);
    }
    return { success: false, rounds: null };
  } finally {
    regeneratingRobots.delete(lockKey);
  }
}
