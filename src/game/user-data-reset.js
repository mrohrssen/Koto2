import { existsSync, unlinkSync } from 'node:fs';
import { dataPath } from '../data-dir.js';
import { clearSrsData } from './internal-srs.js';
import { clearWordKnowledge } from './bootstrap/word-knowledge.js';
import { clearDiscoveryTracking } from '../word-tracking.js';
import { getSaveFilePath, removeManager } from './manager-registry.js';
import { invalidateNarrationUser } from '../narration-engine/index.js';

const USER_PROGRESS_FILES = [
  'npc-memory',
  'creature-memory',
  'npc-dialogue-cache',
  'creature-dialogue-cache',
];

function deleteFileIfPresent(filePath, deleted) {
  if (!existsSync(filePath)) return;
  unlinkSync(filePath);
  deleted.push(filePath);
}

/**
 * Remove game and learning progress for a user while preserving account data.
 * @param {string} userId
 * @returns {{ success: true, deleted: string[] }}
 */
export function resetUserProgress(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }

  const deleted = [];

  // removeManager first: with write-behind saves, a dirty in-memory manager
  // flushes to disk on removal. Deleting the save file before removing the
  // manager would let that flush resurrect it with stale pre-reset data.
  // Removing first means any flush lands on the file we're about to delete.
  removeManager(userId);
  deleteFileIfPresent(getSaveFilePath(userId), deleted);

  clearSrsData(userId);
  deleteFileIfPresent(dataPath(`srs-${userId}.json`), deleted);

  clearWordKnowledge(userId);
  deleteFileIfPresent(dataPath(`word-knowledge-${userId}.json`), deleted);

  clearDiscoveryTracking(userId);

  for (const prefix of USER_PROGRESS_FILES) {
    deleteFileIfPresent(dataPath(`${prefix}-${userId}.json`), deleted);
  }

  invalidateNarrationUser(userId);

  return { success: true, deleted };
}
