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
import { flattenSystemBlocks } from './prompt-assembler.js';
import { generateDialogue } from './generation.js';
import { enforceDialogueVocab } from './dialogue-repair.js';
import { getEntityType } from './entity-types/index.js';
import { NpcMemory } from './npc-memory.js';
import { TextCache } from './text-cache.js';
import { logger } from '../logger.js';

// Per-user instances, keyed by `${userId}:${entityType}`
const _memories = new Map();
const _caches = new Map();

function getMemory(userId, entityType = 'npc') {
  const key = `${userId}:${entityType}`;
  if (!_memories.has(key)) {
    _memories.set(key, new NpcMemory({ userId, entityType }));
  }
  return _memories.get(key);
}

function getCache(userId, entityType = 'npc') {
  const key = `${userId}:${entityType}`;
  if (!_caches.has(key)) {
    _caches.set(key, new TextCache({ userId, entityType }));
  }
  return _caches.get(key);
}

/**
 * Get pre-generated dialogue from cache. Returns null on miss.
 */
export function getDialogueFromCache(userId, entityId, entityType = 'npc') {
  return getCache(userId, entityType).get(entityId);
}

/**
 * Get the full dialogue cache for a user (all entities of a given type).
 */
export function getAllDialogueCache(userId, entityType = 'npc') {
  return getCache(userId, entityType).getAll();
}

/**
 * Clear all cached dialogues for a user. Next exploration will regenerate them.
 */
export function clearDialogueCache(userId, entityType = 'npc') {
  getCache(userId, entityType).clear();
}

/**
 * Queue generation for all entities that are missing or stale in cache.
 * Fire-and-forget — runs in background with concurrency limit.
 */
export async function queueMissingDialogues(userId, chatFn, aiConfig, vocabContext, entityType = 'npc', ttsOptions = null) {
  const vocab = vocabContext?.words || vocabContext || [];
  const vocabCount = Array.isArray(vocab) ? vocab.length : 0;
  const cards = loadCharacterCards(entityType === 'creature' ? 'creature' : 'npc');
  const entityIds = Object.keys(cards);
  const cache = getCache(userId, entityType);
  const memory = getMemory(userId, entityType);
  const { getMemorySnapshot } = getEntityType(entityType);

  const toGenerate = [];
  for (const id of entityIds) {
    const mem = memory.getMemory(id);
    const memSnap = getMemorySnapshot(mem);
    if (cache.isStale(id, vocabCount, memSnap)) {
      toGenerate.push(id);
    }
  }

  const logTag = entityType === 'npc' ? 'NpcDialogue' : 'CreatureDialogue';

  if (toGenerate.length === 0) {
    logger.info(`[${logTag}] All dialogues up to date`);
    return;
  }

  logger.info(`[${logTag}] Generating ${toGenerate.length} missing/stale dialogues`);

  // Concurrency limit: 3 simultaneous
  const CONCURRENCY = 3;
  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(id => generateAndCache(userId, id, chatFn, aiConfig, vocabContext, entityType, ttsOptions))
    );
  }
}

/**
 * Log an encounter result and update memory.
 */
export function logEncounter(userId, entityId, outcome, summary, entityType = 'npc') {
  getMemory(userId, entityType).logEncounter(entityId, outcome, summary);
}

/**
 * Regenerate dialogue for a single entity after an encounter.
 * Runs in background — returns a promise.
 */
export async function regenerateDialogue(userId, entityId, chatFn, aiConfig, vocabContext, entityType = 'npc', ttsOptions = null) {
  return generateAndCache(userId, entityId, chatFn, aiConfig, vocabContext, entityType, ttsOptions);
}

/**
 * Update memory flags (liberated, befriended, etc.)
 */
export function setMemoryFlag(userId, entityId, flag, value, entityType = 'npc') {
  getMemory(userId, entityType).setFlag(entityId, flag, value);
}

/**
 * Update bond score
 */
export function updateMemoryBond(userId, entityId, delta, entityType = 'npc') {
  getMemory(userId, entityType).updateBond(entityId, delta);
}

/**
 * Set narrative summary (from AI summarization)
 */
export function setNarrative(userId, entityId, narrative, entityType = 'npc') {
  getMemory(userId, entityType).setNarrative(entityId, narrative);
}

// --- Internal ---

async function generateAndCache(userId, entityId, chatFn, aiConfig, vocabContext, entityType = 'npc', ttsOptions = null) {
  const cardType = entityType === 'creature' ? 'creature' : 'npc';
  const card = getCharacterCard(entityId, cardType);
  if (!card) {
    logger.warn(`[NpcDialogue] No character card for ${entityId}`);
    return;
  }

  const entityTypeDef = getEntityType(entityType);
  const logTag = entityType === 'npc' ? 'NpcDialogue' : 'CreatureDialogue';

  // Unpack vocabContext (backward compatible with plain array)
  const vocab = vocabContext?.words || vocabContext || [];
  const checkViolationsFn = vocabContext?.checkViolationsFn || null;

  const memory = getMemory(userId, entityType);
  const cache = getCache(userId, entityType);
  const mem = memory.getMemory(entityId);

  // Build prompt args — NPC type needs npcState, creature type does not
  const promptArgs = {
    characterCard: card,
    vocabWords: vocab,
    jlptLevel: aiConfig.jlptLevel || 'N4',
    memory: mem,
    previousLines: cache.getPreviousLines(entityId)
  };

  // NPC-specific: determine state from memory
  if (entityType === 'npc') {
    promptArgs.npcState = mem.flags.liberated ? 'liberated'
      : mem.counters.encounters > 0 ? 'glitching'
      : 'possessed';
  }

  const { systemBlocks, userPrompt } = entityTypeDef.assemblePrompt(promptArgs);
  const systemPrompt = flattenSystemBlocks(systemBlocks);

  const dialogue = await generateDialogue({
    chatFn,
    systemPrompt,
    systemBlocks,
    userPrompt,
    aiConfig,
    entityType
  });

  if (!dialogue) {
    logger.warn(`[${logTag}] Failed to generate dialogue for ${entityId}`);
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
      aiConfig,
      entityType
    });

  if (!repairedDialogue) {
    logger.error(`[${logTag}] CRITICAL: Dialogue for ${entityId} failed vocab repair after ${attempts} attempts. ${violations.length} fields still violate i+1. Not caching — static fallback will be used.`);
    return;
  }

  if (repaired) {
    logger.info(`[${logTag}] Dialogue for ${entityId} repaired in ${attempts} attempt(s)`);
  }

  // TTS synthesis (if cache + VOICEVOX available)
  let ttsEnrichedDialogue = repairedDialogue;
  if (ttsOptions?.ttsDialogueCache && ttsOptions?.synthesizeFn) {
    try {
      // Delete old TTS files for this entity
      const oldCached = cache.get(entityId);
      if (oldCached) {
        const oldFiles = ttsOptions.ttsDialogueCache.collectTtsFiles(oldCached, entityType);
        if (oldFiles.length > 0) {
          ttsOptions.ttsDialogueCache.deleteFiles(userId, oldFiles);
        }
      }

      const entitySpeakerId = ttsOptions.getEntitySpeakerId(entityId, entityType);
      const playerSpeakerId = ttsOptions.playerSpeakerId;

      ttsEnrichedDialogue = await ttsOptions.ttsDialogueCache.synthesizeDialogue(
        userId, repairedDialogue, entityType, {
          entitySpeakerId,
          playerSpeakerId,
          synthesizeFn: ttsOptions.synthesizeFn
        }
      );
      logger.info(`[${logTag}] TTS audio generated for ${entityId}`);
    } catch (err) {
      logger.warn(`[${logTag}] TTS synthesis failed for ${entityId}: ${err.message}`);
      // Continue without TTS — dialogue text is still cached
    }
  }

  const memSnap = entityTypeDef.getMemorySnapshot(mem);

  cache.set(entityId, {
    ...ttsEnrichedDialogue,
    npcId: entityId,
    generatedAt: new Date().toISOString(),
    vocabSnapshot: vocab.length,
    memorySnapshot: memSnap
  });
  logger.info(`[${logTag}] Cached dialogue for ${entityId}`);
}
