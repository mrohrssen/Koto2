/**
 * @fileoverview API handlers for bootstrap language system
 * @module src/game/bootstrap-api
 */

import { loadWordTracker, saveWordTracker, recordExposures, getPhase } from './word-tracker.js';
import { renderBootstrapNarration } from './bootstrap-renderer.js';
import { getPrologueScene, getPrologueSceneCount } from './bootstrap-narrations.js';

/**
 * GET /api/game/bootstrap/state
 * Returns the player's word tracker state
 */
export async function handleGetBootstrapState(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const tracker = loadWordTracker(userId, trackerDir);
  res.status(200).json({
    phase: getPhase(tracker),
    totalWordsIntroduced: tracker.totalWordsIntroduced,
    words: tracker.words
  });
}

/**
 * GET /api/game/bootstrap/narration?type=prologue&index=0
 * Returns rendered narration HTML with scaffolding
 */
export async function handleGetBootstrapNarration(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { type, index } = req.query;
  const idx = parseInt(index, 10);

  let scene;
  if (type === 'prologue') {
    scene = getPrologueScene(idx);
  }
  // Future: add 'run' type for guided run narrations

  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }

  const tracker = loadWordTracker(userId, trackerDir);
  const { html, exposedWords } = renderBootstrapNarration(
    scene.narration,
    tracker,
    { returnMeta: true }
  );

  res.status(200).json({
    sceneId: scene.id,
    html,
    exposedWords,
    sceneIndex: idx,
    totalScenes: type === 'prologue' ? getPrologueSceneCount() : 0
  });
}

/**
 * POST /api/game/bootstrap/record-exposures
 * Records word exposures after a narration is shown
 * Body: { words: string[], multiplier?: number }
 */
export async function handleRecordExposures(req, res, trackerDir) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { words, multiplier = 1 } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'words array required' });
  }

  const tracker = loadWordTracker(userId, trackerDir);
  recordExposures(tracker, words, multiplier);
  saveWordTracker(tracker, trackerDir);

  res.status(200).json({
    phase: getPhase(tracker),
    totalWordsIntroduced: tracker.totalWordsIntroduced
  });
}

/**
 * Quick phase check for narration flow decisions.
 * Returns 'bootstrap', 'transition', or 'full-japanese'.
 */
export function getBootstrapPhaseForNarration(userId, trackerDir) {
  const tracker = loadWordTracker(userId, trackerDir);
  return getPhase(tracker);
}
