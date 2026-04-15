import { handleCreatureKO } from '../services/creature-combat-service.js';
import { logger } from '../../logger.js';

/**
 * Check if all creatures on a side are defeated (hp <= 0, null, or befriended).
 * @param {object[]} creatures
 * @returns {boolean}
 */
export function checkAllDefeated(creatures) {
  if (creatures.length === 0) return true;
  return creatures.every(c => !c || c.hp <= 0 || c.befriended);
}

/**
 * Process KO'd creatures — swap reserves in or permanently remove.
 * Returns raw data; callers format for their response shape.
 *
 * Compacts nulls IN-PLACE via backward splice (preserves array reference).
 * This is critical for PvP where sideA/sideB are aliased to party.active.
 *
 * @param {object[]} allies - Active creature array (mutated in-place)
 * @param {object} party - creatureParty with active/reserves
 * @returns {{ koSwaps: Array<{index: number, replacement: object}>, koRemovals: Array<{index: number, name: string}> }}
 */
export function processKOSwaps(allies, party) {
  const koSwaps = [];
  const koRemovals = [];

  for (let i = 0; i < allies.length; i++) {
    if (allies[i] && allies[i].hp <= 0) {
      const deadName = allies[i].nameEn || allies[i].name;
      const replacement = handleCreatureKO(party, i);
      if (replacement) {
        koSwaps.push({ index: i, replacement });
        logger.info('[Combat] KO swap: slot', i, '→', replacement.nameEn);
      } else {
        koRemovals.push({ index: i, name: deadName });
        logger.info('[Combat] KO removed: slot', i, deadName, '(no reserves)');
      }
    }
  }

  // Compact nulls in-place via backward splice (preserves array reference)
  for (let i = allies.length - 1; i >= 0; i--) {
    if (allies[i] === null) allies.splice(i, 1);
  }

  return { koSwaps, koRemovals };
}
