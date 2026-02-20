/**
 * Narration Engine - Public Interface
 *
 * The engine does not know what an "NPC" is. It knows character cards,
 * memories, vocab lists, and generation tasks. Game-layer code maps
 * NPC-specific concepts to this generic interface.
 *
 * Dependencies flow one direction: game/ -> narration-engine/ (never reverse).
 */

import { getCharacterCard, loadCharacterCards } from './character-cards.js';
import { assemblePrompt, flattenSystemBlocks } from './prompt-assembler.js';
import { generateDialogue } from './generation.js';
import { enforceDialogueVocab } from './dialogue-repair.js';
import { NpcMemory } from './npc-memory.js';
import { TextCache } from './text-cache.js';
import { logger } from '../logger.js';

// Per-user instances, keyed by userId
const _memories = new Map();
const _caches = new Map();

function getMemory(userId) {
  if (!_memories.has(userId)) {
    _memories.set(userId, new NpcMemory({ userId }));
  }
  return _memories.get(userId);
}

function getCache(userId) {
  if (!_caches.has(userId)) {
    _caches.set(userId, new TextCache({ userId }));
  }
  return _caches.get(userId);
}

/**
 * Get pre-generated dialogue from cache. Returns null on miss.
 */
export function getDialogueFromCache(userId, entityId) {
  return getCache(userId).get(entityId);
}

/**
 * Get the full dialogue cache for a user (all NPCs).
 */
export function getAllDialogueCache(userId) {
  return getCache(userId).getAll();
}

/**
 * Queue generation for all entities that are missing or stale in cache.
 * Fire-and-forget — runs in background with concurrency limit.
 */
export async function queueMissingDialogues(userId, chatFn, aiConfig, vocabContext) {
  const vocab = vocabContext?.words || vocabContext || [];
  const vocabCount = Array.isArray(vocab) ? vocab.length : 0;
  const cards = loadCharacterCards();
  const entityIds = Object.keys(cards);
  const cache = getCache(userId);
  const memory = getMemory(userId);

  const toGenerate = [];
  for (const id of entityIds) {
    const mem = memory.getMemory(id);
    const memSnap = {
      encounters: mem.counters.encounters,
      bond: mem.bond,
      liberated: mem.flags.liberated
    };
    if (cache.isStale(id, vocabCount, memSnap)) {
      toGenerate.push(id);
    }
  }

  if (toGenerate.length === 0) {
    logger.info('[NpcDialogue] All dialogues up to date');
    return;
  }

  logger.info(`[NpcDialogue] Generating ${toGenerate.length} missing/stale dialogues`);

  // Concurrency limit: 3 simultaneous
  const CONCURRENCY = 3;
  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(id => generateAndCache(userId, id, chatFn, aiConfig, vocabContext))
    );
  }
}

/**
 * Log an encounter result and update memory.
 */
export function logEncounter(userId, entityId, outcome, summary) {
  getMemory(userId).logEncounter(entityId, outcome, summary);
}

/**
 * Regenerate dialogue for a single entity after an encounter.
 * Runs in background — returns a promise.
 */
export async function regenerateDialogue(userId, entityId, chatFn, aiConfig, vocabContext) {
  return generateAndCache(userId, entityId, chatFn, aiConfig, vocabContext);
}

/**
 * Update memory flags (liberated, befriended, etc.)
 */
export function setMemoryFlag(userId, entityId, flag, value) {
  getMemory(userId).setFlag(entityId, flag, value);
}

/**
 * Update bond score
 */
export function updateMemoryBond(userId, entityId, delta) {
  getMemory(userId).updateBond(entityId, delta);
}

/**
 * Record a defeat
 */
export function recordDefeat(userId, entityId) {
  getMemory(userId).incrementDefeat(entityId);
}

/**
 * Set narrative summary (from AI summarization)
 */
export function setNarrative(userId, entityId, narrative) {
  getMemory(userId).setNarrative(entityId, narrative);
}

// --- Internal ---

async function generateAndCache(userId, entityId, chatFn, aiConfig, vocabContext) {
  const card = getCharacterCard(entityId);
  if (!card) {
    logger.warn(`[NpcDialogue] No character card for ${entityId}`);
    return;
  }

  // Unpack vocabContext (backward compatible with plain array)
  const vocab = vocabContext?.words || vocabContext || [];
  const checkViolationsFn = vocabContext?.checkViolationsFn || null;

  const memory = getMemory(userId);
  const cache = getCache(userId);
  const mem = memory.getMemory(entityId);

  // Determine NPC state from memory
  const npcState = mem.flags.liberated ? 'liberated'
    : mem.counters.encounters > 0 ? 'glitching'
    : 'possessed';

  const { systemBlocks, userPrompt } = assemblePrompt({
    characterCard: card,
    vocabWords: vocab,
    jlptLevel: aiConfig.jlptLevel || 'N4',
    memory: mem,
    npcState,
    previousLines: cache.getPreviousLines(entityId)
  });

  const systemPrompt = flattenSystemBlocks(systemBlocks);

  const dialogue = await generateDialogue({
    chatFn,
    systemPrompt,
    systemBlocks,
    userPrompt,
    aiConfig
  });

  if (!dialogue) {
    logger.warn(`[NpcDialogue] Failed to generate dialogue for ${entityId}`);
    return;
  }

  // Vocab repair: validate and fix i+1 violations
  const { dialogue: repairedDialogue, repaired, attempts, violations } =
    await enforceDialogueVocab({
      dialogue,
      checkViolationsFn,
      chatFn,
      systemPrompt,
      systemBlocks,
      userPrompt,
      aiConfig
    });

  if (!repairedDialogue) {
    logger.error(`[NpcDialogue] CRITICAL: Dialogue for ${entityId} failed vocab repair after ${attempts} attempts. ${violations.length} fields still violate i+1. Not caching — static fallback will be used.`);
    return;
  }

  if (repaired) {
    logger.info(`[NpcDialogue] Dialogue for ${entityId} repaired in ${attempts} attempt(s)`);
  }

  cache.set(entityId, {
    ...repairedDialogue,
    npcId: entityId,
    generatedAt: new Date().toISOString(),
    vocabSnapshot: vocab.length,
    memorySnapshot: {
      encounters: mem.counters.encounters,
      bond: mem.bond,
      liberated: mem.flags.liberated
    }
  });
  logger.info(`[NpcDialogue] Cached dialogue for ${entityId}`);
}
