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
  // Update NPC info pill (for non-creature enemies)
  sceneModule.updateEnemyHP(current, max);
  // Also update formation slot (for creature enemies rendered in formation)
  sceneModule.updateEnemyHPAtIndex(0, current, max);
}

/** Update HP bar for a specific enemy in multi-enemy combat */
export function updateEnemyHPAtIndex(index, current, max) {
  sceneModule.updateEnemyHPAtIndex(index, current, max);
}

/** No-op: player HP is now displayed via individual creature HP bars */
export function updatePlayerHPBar(_hp) {
  // Creature HP bars handle health display directly
}
