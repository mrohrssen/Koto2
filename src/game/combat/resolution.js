import { handleCreatureKO } from '../services/creature-combat-service.js';
import { addToCollection } from '../services/creature-collection-service.js';
import { CREATURES_BY_ID } from '../creatures.js';
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

/**
 * Collect element drops from defeated enemies into meta-progression and run summary.
 * No-op if meta is null.
 * @param {object|null} meta
 * @param {object[]} enemies
 * @param {object|null} runSummary
 */
export function collectElementDrops(meta, enemies, runSummary) {
  if (!meta) return;
  if (!meta.elementDrops) {
    meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
  }
  for (const enemy of enemies) {
    if (enemy.hp <= 0 && enemy.element && enemy.element !== 'neutral') {
      meta.elementDrops[enemy.element] = (meta.elementDrops[enemy.element] || 0) + 1;
    }
    if (enemy.hp <= 0 && runSummary) {
      runSummary.creaturesDefeated = (runSummary.creaturesDefeated || 0) + 1;
      if (enemy.element && enemy.element !== 'neutral') {
        if (!runSummary.elementsCollected) runSummary.elementsCollected = {};
        runSummary.elementsCollected[enemy.element] =
          (runSummary.elementsCollected[enemy.element] || 0) + 1;
      }
    }
  }
}

/**
 * Build the elementDropsCollected array for combat result payloads.
 * @param {object[]} enemies
 * @returns {string[]}
 */
export function getElementDropList(enemies) {
  return (enemies || [])
    .filter(e => e.hp <= 0 && e.element && e.element !== 'neutral')
    .map(e => e.element);
}

/**
 * End-of-combat victory cleanup.
 * Marks room interacted, increments encounters, tracks boss defeat.
 * @param {object} combat
 * @param {object} run
 * @param {object} [opts]
 * @param {Function} [opts.narrate] - Narration callback for boss defeat dialogue
 * @param {object} [opts.meta] - Meta-progression state for persistent boss tracking
 */
export function finalizeCombatVictory(combat, run, opts = {}) {
  combat.active = false;
  run.currentAreaEncounters = (run.currentAreaEncounters || 0) + 1;

  // Stat stages + activeEffects intentionally NOT cleared here. The previous
  // implementation zeroed them synchronously at server-side victory, which
  // made the client see buff pills vanish mid-playback (final AoE wave still
  // animating when the buff-cleared state landed). Buffs are now cleared on
  // the server-side room-advance step (exploration-service.js) — they stay
  // visible through victory modal / friendlyNpc reward screen and disappear
  // only when the user physically moves on. Matches the user's rule from
  // 2026-04-18: "All buffs and debuffs should clear on room transitions."

  const currentRoom = run.rooms?.[run.currentRoom];
  if (currentRoom) {
    currentRoom.interacted = true;
  }

  // Boss defeat tracking
  if (combat.isBoss && combat.enemies?.[0]?.id) {
    const bossId = combat.enemies[0].id;
    const bossTemplate = CREATURES_BY_ID[bossId];
    if (bossTemplate?.bossDialogue?.defeat && opts.narrate) {
      opts.narrate(bossTemplate.bossDialogue.defeat);
    }
    if (!run.bossesDefeated) run.bossesDefeated = [];
    if (!run.bossesDefeated.includes(bossId)) {
      run.bossesDefeated.push(bossId);
    }
    if (opts.meta) {
      if (!Array.isArray(opts.meta.bossesDefeated)) opts.meta.bossesDefeated = [];
      if (!opts.meta.bossesDefeated.includes(bossId)) {
        opts.meta.bossesDefeated.push(bossId);
      }
    }
  }
}

/**
 * Save pending captures to collection and end the run on defeat.
 * @param {object} combat
 * @param {object} run
 * @param {object|null} meta
 * @param {object} [opts]
 * @param {Function} [opts.onDefeat] - Called after marking run inactive
 */
export function resolveDefeat(combat, run, meta, opts = {}) {
  const pending = run.creatureParty?.pendingCaptures || [];
  for (const creature of pending) {
    if (meta && !creature.temporary) {
      const result = addToCollection(meta.creatureCollection || [], creature.id);
      if (result.added) {
        meta.creatureCollection = result.collection;
      }
    }
  }
  if (run.creatureParty) {
    run.creatureParty.pendingCaptures = [];
  }

  combat.active = false;
  run.active = false;
  if (opts.onDefeat) opts.onDefeat();
}
