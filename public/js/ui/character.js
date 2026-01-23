/**
 * Character UI Module (Mobile) - Minimal HP management
 *
 * Delegates all rendering to scene.js and hp-bar.js modules.
 * Keeps the same export signatures so combat-loop can call updateEnemyHPBar/updatePlayerHPBar.
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
  const gameState = getGameState();
  const maxHp = gameState.combat?.enemy?.maxHp || 100;
  sceneModule.updateEnemyHP(hp, maxHp);
}

/** Update player HP bar via hp-bar module */
export function updatePlayerHPBar(hp) {
  const gameState = getGameState();
  const maxHp = gameState.player?.maxHp || 100;
  hpBar.updatePlayerHP(hp, maxHp);
}
