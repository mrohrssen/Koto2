/**
 * @file character.js - HP Bar Coordinator
 *
 * PURPOSE:
 * Thin wrapper that delegates HP bar updates to scene.js (enemy).
 * Provides a unified interface for combat-loop.js to update HP bars
 * without importing multiple modules.
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with scene module reference
 * - updateEnemyHPBar(hp): Update enemy HP via scene module
 * - updatePlayerHPBar(hp): No-op (player HP now shown via creature HP bars)
 *
 * DEPENDENCIES:
 * - Callbacks injected via init(): getGameState, scene
 *
 * HP FORMAT:
 * Update functions accept either a number (current HP, max from state)
 * or an object { current, max } from combat-cycle API responses.
 */

let getGameState = null;
let sceneModule = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  sceneModule = callbacks.scene;
}

/** Update enemy HP bar via scene module */
export function updateEnemyHPBar(hp) {
  // hp can be a number or { current, max } object from combat-cycle response
  const current = typeof hp === 'object' ? hp.current : hp;
  const max = typeof hp === 'object' ? hp.max : (getGameState().combat?.enemy?.maxHp || 100);
  sceneModule.updateEnemyHP(current, max);
}

/** Update HP bar for a specific enemy in multi-enemy combat */
export function updateEnemyHPAtIndex(index, current, max) {
  sceneModule.updateEnemyHPAtIndex(index, current, max);
}

/** No-op: player HP is now displayed via individual creature HP bars */
export function updatePlayerHPBar(_hp) {
  // Creature HP bars handle health display directly
}
