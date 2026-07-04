import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  learnsetBackfillForCreature,
  backfillPartyLearnset,
} from '../../../../src/shared/combat/learnset-backfill.js';

/**
 * Unit contract for the deterministic learnset backfill (restores mid-run move
 * learning that the O2 hash-parity fix removed from the deferred kill-XP path).
 *
 * The function mirrors src/game/creatures.js::addXpToCreature's auto-learn rule:
 * for each learnset entry the creature's CURRENT level qualifies for, if the
 * creature doesn't already know that move, AUTO-ADD it — but only while
 * moves.length < 3 (MAX_CREATURE_MOVES). Full movesets (>= 3) are left untouched
 * (replacement is a player choice, not deterministic). Pure, no RNG.
 *
 * hi's learnset: honoo@1, okoru@7, moeru@12, tobu@18, naku@24.
 */

// A minimal creature carrying only what the backfill reads: id, level, moves.
function hiAt(level, moveIds) {
  return {
    id: 'hi',
    level,
    moves: moveIds.map(id => ({ id })),
  };
}

describe('learnsetBackfillForCreature — deterministic level→moveset backfill', () => {
  it('adds the qualifying move a mid-fight level-up should have learned', () => {
    // hi at L7 knowing only honoo — okoru@7 qualifies and is missing, one slot free.
    const hi = hiAt(7, ['honoo']);
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added.map(m => m.id), ['okoru'], 'okoru is backfilled at L7');
    assert.deepEqual(hi.moves.map(m => m.id), ['honoo', 'okoru'], 'move pushed onto creature');
  });

  it('adds the full move OBJECT (not just an id) so the client can render/resolve it', () => {
    const hi = hiAt(7, ['honoo']);
    const [okoru] = learnsetBackfillForCreature(hi);
    // Full object sourced from data/moves.json (byte-identical to the server's
    // MOVES_BY_ID clone), so fight-2's transcript allies[].moves matches.
    assert.equal(okoru.id, 'okoru');
    assert.equal(okoru.nameEn, 'Rage');
    assert.equal(okoru.element, 'fire');
    assert.equal(typeof okoru.power, 'number');
    assert.equal(typeof okoru.mpCost, 'number');
  });

  it('adds multiple qualifying moves in ascending learnset order across a level jump', () => {
    // hi jumped to L12 knowing only honoo: okoru@7 then moeru@12 both qualify,
    // two free slots — both added, in learnset order.
    const hi = hiAt(12, ['honoo']);
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added.map(m => m.id), ['okoru', 'moeru']);
    assert.deepEqual(hi.moves.map(m => m.id), ['honoo', 'okoru', 'moeru']);
  });

  it('is a no-op at the move cap (>= 3) — replacement is a player choice, not deterministic', () => {
    // hi at L12 already holding 3 moves; moeru@12 qualifies but there is no slot.
    const hi = hiAt(12, ['honoo', 'okoru', 'someOther']);
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added, [], 'nothing added at the cap');
    assert.deepEqual(hi.moves.map(m => m.id), ['honoo', 'okoru', 'someOther'], 'moveset unchanged');
  });

  it('stops adding once the cap is reached mid-backfill (respects the running count)', () => {
    // hi at L18 knowing 2 moves: okoru@7 (missing), moeru@12 (missing), tobu@18
    // (missing) all qualify, but only ONE slot is free → exactly one added, the
    // earliest in learnset order.
    const hi = hiAt(18, ['honoo', 'naku']);
    const added = learnsetBackfillForCreature(hi);
    assert.equal(added.length, 1, 'only one slot was free');
    assert.deepEqual(added.map(m => m.id), ['okoru'], 'earliest qualifying move fills the slot');
    assert.equal(hi.moves.length, 3);
  });

  it('is a no-op when the creature already knows every qualifying move', () => {
    const hi = hiAt(7, ['honoo', 'okoru']);
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added, []);
    assert.deepEqual(hi.moves.map(m => m.id), ['honoo', 'okoru']);
  });

  it('is a no-op when no learnset entry qualifies at the current level', () => {
    // hi at L6: only honoo@1 qualifies and it is already known.
    const hi = hiAt(6, ['honoo']);
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added, []);
  });

  it('is deterministic — same input yields the same output', () => {
    const a = hiAt(12, ['honoo']);
    const b = hiAt(12, ['honoo']);
    const addedA = learnsetBackfillForCreature(a);
    const addedB = learnsetBackfillForCreature(b);
    assert.deepEqual(addedA.map(m => m.id), addedB.map(m => m.id));
    assert.deepEqual(a.moves.map(m => m.id), b.moves.map(m => m.id));
  });

  it('is a no-op for an unknown creature id (no template learnset)', () => {
    const ghost = { id: 'no-such-creature', level: 30, moves: [] };
    const added = learnsetBackfillForCreature(ghost);
    assert.deepEqual(added, []);
    assert.deepEqual(ghost.moves, []);
  });

  it('tolerates a creature with no moves array (initializes it)', () => {
    const hi = { id: 'hi', level: 7 };
    const added = learnsetBackfillForCreature(hi);
    assert.deepEqual(added.map(m => m.id), ['honoo', 'okoru'].slice(-added.length));
    assert.ok(Array.isArray(hi.moves));
  });
});

describe('backfillPartyLearnset — party-wide backfill for combat end', () => {
  it('backfills active and reserve creatures, returning committed {creatureIndex, move} entries', () => {
    const party = {
      active: [hiAt(7, ['honoo']), hiAt(6, ['honoo'])],
      reserves: [hiAt(12, ['honoo'])],
    };
    const backfilled = backfillPartyLearnset(party);
    // active[0] gains okoru; active[1] gains nothing; reserves[0] gains okoru+moeru.
    const active0 = backfilled.filter(b => b.slot === 'active' && b.creatureIndex === 0).map(b => b.move.id);
    const active1 = backfilled.filter(b => b.slot === 'active' && b.creatureIndex === 1).map(b => b.move.id);
    const reserve0 = backfilled.filter(b => b.slot === 'reserves' && b.creatureIndex === 0).map(b => b.move.id);
    assert.deepEqual(active0, ['okoru']);
    assert.deepEqual(active1, []);
    assert.deepEqual(reserve0, ['okoru', 'moeru']);
    // Mutated in place.
    assert.deepEqual(party.active[0].moves.map(m => m.id), ['honoo', 'okoru']);
    assert.deepEqual(party.reserves[0].moves.map(m => m.id), ['honoo', 'okoru', 'moeru']);
  });

  it('returns an empty array and mutates nothing when no creature qualifies', () => {
    const party = { active: [hiAt(6, ['honoo'])], reserves: [] };
    const backfilled = backfillPartyLearnset(party);
    assert.deepEqual(backfilled, []);
  });

  it('tolerates a missing/empty party', () => {
    assert.deepEqual(backfillPartyLearnset(null), []);
    assert.deepEqual(backfillPartyLearnset({}), []);
    assert.deepEqual(backfillPartyLearnset({ active: [], reserves: [] }), []);
  });
});
