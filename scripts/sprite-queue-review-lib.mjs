/**
 * Review Queue Manager — library
 *
 * Testable functions for building review queue entries from Gate 1 + Gate 2
 * results and merging them into the persistent review queue.
 *
 * Used by sprite-queue-review.mjs (CLI) and tested by tests/unit/sprites/queue.test.js.
 */

// ---------------------------------------------------------------------------
// buildQueueEntry
// ---------------------------------------------------------------------------

/**
 * Build a single review queue entry from Gate 1 + Gate 2 results for one sprite.
 *
 * @param {Object} opts
 * @param {string} opts.id - Sprite identifier (e.g. 'dash')
 * @param {string} opts.type - Sprite type (e.g. 'action', 'creature')
 * @param {string} opts.word - Japanese word
 * @param {string} opts.wordEn - English word
 * @param {Array} opts.gate1Results - Array of gate1 result objects for this sprite's variants
 * @param {Array} opts.gate2Results - Array of gate2 result objects for this sprite's variants
 * @returns {Object} Queue entry with candidates, rejected, and metadata
 */
export function buildQueueEntry({ id, type, word, wordEn, gate1Results, gate2Results }) {
  const candidates = [];
  const rejected = [];

  for (const g1 of gate1Results) {
    if (!g1.passed) {
      // Find the first failing check for the reason string
      const failingCheck = g1.checks.find(c => !c.passed);
      const reason = failingCheck
        ? `Gate 1: ${failingCheck.name} — ${failingCheck.detail}`
        : 'Gate 1: unknown failure';
      rejected.push({
        file: g1.file,
        gate: 'gate1',
        reason,
      });
      continue;
    }

    // Gate 1 passed — look for matching gate2 result
    const g2 = gate2Results.find(r => r.file === g1.file);

    if (!g2 || !g2.passed) {
      if (!g2) {
        rejected.push({
          file: g1.file,
          gate: 'gate2',
          reason: 'Gate 2: not evaluated',
        });
      } else {
        const scores = `scores: concept=${g2.concept}, style=${g2.style}, readability=${g2.readability}`;
        rejected.push({
          file: g1.file,
          gate: 'gate2',
          reason: `Gate 2: ${g2.reasoning} (${scores})`,
        });
      }
      continue;
    }

    // Both gates passed
    candidates.push({
      file: g1.file,
      gate1: 'pass',
      gate2: {
        concept: g2.concept,
        style: g2.style,
        readability: g2.readability,
      },
      total: g2.total,
      reasoning: g2.reasoning,
    });
  }

  // Sort candidates by total score descending (best first)
  candidates.sort((a, b) => b.total - a.total);

  return {
    id,
    type,
    word,
    wordEn,
    candidates,
    rejected,
    generatedAt: new Date().toISOString(),
    attempt: 1,
  };
}

// ---------------------------------------------------------------------------
// mergeIntoQueue
// ---------------------------------------------------------------------------

/**
 * Merge new entries into an existing review queue.
 * If an entry with the same `id` AND `type` already exists, replace it.
 * Otherwise append.
 *
 * @param {Object} existingQueue - Existing queue object with `pending` array
 * @param {Array} newEntries - Array of new queue entries to merge
 * @returns {Object} Merged queue object with `pending` array
 */
export function mergeIntoQueue(existingQueue, newEntries) {
  const pending = [...existingQueue.pending];

  for (const entry of newEntries) {
    const existingIdx = pending.findIndex(
      e => e.id === entry.id && e.type === entry.type
    );

    if (existingIdx !== -1) {
      // Replace existing entry
      pending[existingIdx] = entry;
    } else {
      // Append new entry
      pending.push(entry);
    }
  }

  return { pending };
}
