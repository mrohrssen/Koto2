/**
 * Deterministic level→moveset backfill, applied at COMBAT END on both the client
 * and the server.
 *
 * WHY THIS EXISTS
 * ---------------
 * The explore-session PvE path defers kill-XP and — for client/server hash parity
 * — routes it through the browser-safe applyKillXpToParty (kanji-kombat-xp.js),
 * which does NOT learn moves on level-up (the browser has no MOVES_BY_ID lookup,
 * and the per-turn transcript embeds full creature objects incl. `moves`). That
 * fix (O2) restored hash parity but silently removed mid-run move learning: a
 * creature that levels past a learnset threshold mid-fight no longer picks up its
 * new move for the rest of the run.
 *
 * This module restores that move — and the learn-prompt moment — WITHOUT
 * reintroducing hash divergence, by running AFTER a fight's terminal turn hash is
 * computed. Because it is a pure, deterministic function of (creature level,
 * template learnset, current moves), applying the SAME function at the SAME
 * logical point on both sides keeps the NEXT fight's turn-1 transcript identical
 * even when the client finishes fight 1 and starts fight 2 entirely offline (no
 * server round-trip in between).
 *
 * BROWSER-SAFE: this module does NOT import src/game/creatures.js (which uses
 * readFileSync). It imports the raw learnset + move data directly via ESM JSON
 * imports, which both Node (>=20) and Vite bundle. Move objects are sourced from
 * data/moves.json so a backfilled move is byte-identical to the server's
 * MOVES_BY_ID clone (addXpToCreature pushes `{ ...MOVES_BY_ID[id] }`).
 *
 * MOVES-FULL BOUNDARY: when a creature already holds MAX_CREATURE_MOVES (3), the
 * backfill is a NO-OP. Replacing a move is a player choice (which of the 3 to
 * forget) and is therefore NOT deterministic — auto-replacing would desync the
 * two sides. The existing 'learn / replace' prompt flow still governs the
 * full-moveset case exactly as before.
 */
import CREATURE_DATA from '../../../data/creatures.json' with { type: 'json' };
import MOVES_DATA from '../../../data/moves.json' with { type: 'json' };

// Mirror of MAX_CREATURE_MOVES in src/game/creatures.js. Kept as a local literal
// to preserve this module's browser-safety (no import from creatures.js).
export const MAX_CREATURE_MOVES = 3;

const LEARNSET_BY_ID = new Map();
for (const template of CREATURE_DATA) {
  // Ascending by level so the backfill fills slots in the same order
  // addXpToCreature would learn them across a multi-level jump.
  const learnset = (template.learnset || []).slice().sort((a, b) => a.level - b.level);
  LEARNSET_BY_ID.set(template.id, learnset);
}

const MOVE_BY_ID = new Map();
for (const move of MOVES_DATA) {
  MOVE_BY_ID.set(move.id, move);
}

/**
 * Compute and apply the moves a single creature's CURRENT level qualifies it for
 * that it doesn't yet know, auto-adding only while moves.length < MAX_CREATURE_MOVES
 * — mirroring addXpToCreature's auto-learn rule (same ordering, same cap).
 *
 * Mutates `creature.moves` in place. Returns the array of newly-added move
 * objects (empty when nothing was added).
 *
 * @param {object} creature - A creature with `id`, `level`, and `moves`.
 * @returns {Array<object>} newly-added move objects (shallow clones from data/moves.json).
 */
export function learnsetBackfillForCreature(creature) {
  if (!creature || typeof creature.id !== 'string') return [];
  const learnset = LEARNSET_BY_ID.get(creature.id);
  if (!learnset || learnset.length === 0) return [];
  if (!Array.isArray(creature.moves)) creature.moves = [];

  const level = Number(creature.level) || 1;
  const added = [];
  for (const entry of learnset) {
    if (entry.level > level) continue; // not yet qualified
    if (creature.moves.length >= MAX_CREATURE_MOVES) break; // cap: leave to player choice
    if (creature.moves.some(m => m && m.id === entry.moveId)) continue; // already known
    const moveData = MOVE_BY_ID.get(entry.moveId);
    if (!moveData) continue;
    const move = { ...moveData };
    creature.moves.push(move);
    added.push(move);
  }
  return added;
}

/**
 * Apply the learnset backfill across a run party's active + reserve creatures.
 *
 * Returns a flat list of committed backfill descriptors, one per added move:
 *   { slot: 'active'|'reserves', creatureIndex, creatureId, move }
 * The server emits this on the committed combat-end result (result.learnsetBackfill)
 * so the client's checkpoint-driven finish can surface the learn-prompt moment;
 * the client applies the same function to its local draft so an offline fight-2
 * agrees on hashes.
 *
 * Mutates each creature's `moves` in place. Pending captures are intentionally
 * excluded — they are not part of the fighting party and never enter a combat
 * transcript.
 *
 * @param {object} party - { active: [], reserves: [] }
 * @returns {Array<{slot:string, creatureIndex:number, creatureId:string, move:object}>}
 */
export function backfillPartyLearnset(party) {
  if (!party) return [];
  const results = [];
  for (const slot of ['active', 'reserves']) {
    const list = Array.isArray(party[slot]) ? party[slot] : [];
    for (let creatureIndex = 0; creatureIndex < list.length; creatureIndex++) {
      const creature = list[creatureIndex];
      if (!creature) continue;
      const added = learnsetBackfillForCreature(creature);
      for (const move of added) {
        results.push({ slot, creatureIndex, creatureId: creature.id, move });
      }
    }
  }
  return results;
}
