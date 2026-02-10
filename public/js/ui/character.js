/**
 * @file character.js - HP Bar Coordinator
 *
 * PURPOSE:
 * Thin wrapper that delegates HP bar updates to scene.js (enemy) and hp-bar.js
 * (player). Provides a unified interface for combat-loop.js to update both
 * HP bars without importing multiple modules.
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with scene and hp-bar module references
 * - updateEnemyHPBar(hp): Update enemy HP via scene module
 * - updatePlayerHPBar(hp): Update player HP via hp-bar module
 *
 * DEPENDENCIES:
 * - Callbacks injected via init(): getGameState, hpBar, scene
 *
 * HP FORMAT:
 * Both update functions accept either a number (current HP, max from state)
 * or an object { current, max } from combat-cycle API responses.
 */

let getGameState = null;
let hpBar = null;
let sceneModule = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  hpBar = callbacks.hpBar;
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

/** Update player HP bar via hp-bar module */
export function updatePlayerHPBar(hp) {
  // hp can be a number or { current, max } object from combat-cycle response
  const current = typeof hp === 'object' ? hp.current : hp;
  const max = typeof hp === 'object' ? hp.max : (getGameState().player?.maxHp || 100);
  hpBar.updatePlayerHP(current, max);
}
