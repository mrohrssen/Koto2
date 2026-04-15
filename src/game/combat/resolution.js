/**
 * Check if all creatures on a side are defeated (hp <= 0, null, or befriended).
 * @param {object[]} creatures
 * @returns {boolean}
 */
export function checkAllDefeated(creatures) {
  if (creatures.length === 0) return true;
  return creatures.every(c => !c || c.hp <= 0 || c.befriended);
}
