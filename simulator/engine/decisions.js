/**
 * Combat move selection logic for the simulator.
 * Simplified element effectiveness and skill-based decision making.
 */

const ELEMENT_CHART = {
  fire:     { strong: 'nature',   weak: 'water' },
  water:    { strong: 'fire',     weak: 'electric' },
  electric: { strong: 'water',    weak: 'nature' },
  nature:   { strong: 'electric', weak: 'fire' },
  light:    { strong: 'dark',     weak: 'dark' },
  dark:     { strong: 'light',    weak: 'light' }
};

/**
 * Get the effectiveness multiplier for an attacking element vs a defending element.
 * Returns 1.5 (strong), 0.5 (weak), or 1.0 (neutral).
 */
function getElementMultiplier(attackElement, defendElement) {
  if (!attackElement || !defendElement) return 1.0;

  const chart = ELEMENT_CHART[attackElement];
  if (!chart) return 1.0;

  if (chart.strong === defendElement) return 1.5;
  if (chart.weak === defendElement) return 0.5;
  return 1.0;
}

/**
 * Pick the best move for a creature to use against a target.
 *
 * @param {Array} allies - Array of allied creatures with moves and stats
 * @param {number} creatureIndex - Index of the acting creature in allies
 * @param {Array} enemies - Array of enemy creatures
 * @param {number} targetIndex - Index of the target enemy
 * @param {number} combatSkill - 0-1 probability of picking the optimal move
 * @returns {{ creatureIndex: number, moveId: string|null, targetIndex: number }}
 */
export function pickMove(allies, creatureIndex, enemies, targetIndex, combatSkill) {
  const creature = allies[creatureIndex];
  if (!creature || !creature.moves || creature.moves.length === 0) {
    return { creatureIndex, moveId: null, targetIndex };
  }

  const target = enemies[targetIndex];
  if (!target) {
    return { creatureIndex, moveId: null, targetIndex };
  }

  const targetElement = target.element;

  // Score each move
  const scored = creature.moves.map(move => {
    const basePower = move.power ?? move.basePower ?? 0;
    const multiplier = getElementMultiplier(move.element, targetElement);
    return {
      moveId: move.id ?? move.moveId,
      score: basePower * multiplier
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  let chosen;
  if (Math.random() < combatSkill) {
    // Pick the best move
    chosen = scored[0];
  } else {
    // Pick a random move
    chosen = scored[Math.floor(Math.random() * scored.length)];
  }

  return {
    creatureIndex,
    moveId: chosen.moveId,
    targetIndex
  };
}

/**
 * Pick the first alive enemy as target.
 * @param {Array} enemies - Array of enemy creatures with hp
 * @returns {number} Index of first alive enemy, or 0 if none found
 */
export function pickTarget(enemies) {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i] && enemies[i].hp > 0) return i;
  }
  return 0;
}

/**
 * Pick the first alive ally to swap in.
 * @param {Array} allies - Array of allied creatures with hp
 * @returns {number|null} Index of first alive ally, or null if none
 */
export function pickSwap(allies) {
  for (let i = 0; i < allies.length; i++) {
    if (allies[i] && allies[i].hp > 0) return i;
  }
  return null;
}
