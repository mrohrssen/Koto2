/**
 * Regression tests for intentional behavior fixes in the loop.js breakup.
 *
 * These test the resolution helpers directly to lock in correct behavior
 * that was previously inconsistent in some GameManager code paths:
 *
 * 1. resolveDefeat always flushes pending captures to collection
 * 2. processKOSwaps always tracks koRemovals and compacts null slots
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processKOSwaps, resolveDefeat } from '../../../src/game/combat/resolution.js';

describe('NPC-skill KO defeat: pending captures flushed to collection', () => {
  it('resolveDefeat saves pending captures before ending run', () => {
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: {
        active: [],
        reserves: [],
        pendingCaptures: [
          { id: 'captured_creature_1', temporary: false },
          { id: 'captured_creature_2', temporary: false }
        ]
      }
    };
    const meta = { creatureCollection: ['existing_creature'] };

    resolveDefeat(combat, run, meta);

    // Both captures should be in collection
    assert.ok(meta.creatureCollection.includes('captured_creature_1'),
      'First pending capture should be saved to collection');
    assert.ok(meta.creatureCollection.includes('captured_creature_2'),
      'Second pending capture should be saved to collection');
    // Original collection entry preserved
    assert.ok(meta.creatureCollection.includes('existing_creature'),
      'Existing collection entries should be preserved');
    // Pending captures cleared
    assert.equal(run.creatureParty.pendingCaptures.length, 0,
      'Pending captures should be cleared after saving');
    // Run and combat ended
    assert.equal(combat.active, false);
    assert.equal(run.active, false);
  });

  it('resolveDefeat skips temporary creatures in collection save', () => {
    const combat = { active: true };
    const run = {
      active: true,
      creatureParty: {
        active: [],
        reserves: [],
        pendingCaptures: [
          { id: 'temp_creature', temporary: true },
          { id: 'real_creature', temporary: false }
        ]
      }
    };
    const meta = { creatureCollection: [] };

    resolveDefeat(combat, run, meta);

    assert.ok(!meta.creatureCollection.includes('temp_creature'),
      'Temporary creatures should not be added to collection');
    assert.ok(meta.creatureCollection.includes('real_creature'),
      'Non-temporary creatures should be added to collection');
  });
});

describe('Befriend quiz wrong-answer: koRemovals surfaced and nulls compacted', () => {
  it('processKOSwaps returns koRemovals when no reserves exist', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'KOCreature', name: 'テスト' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = { active: allies, reserves: [] };

    const result = processKOSwaps(allies, party);

    assert.equal(result.koRemovals.length, 1,
      'Should report 1 KO removal');
    assert.equal(result.koRemovals[0].name, 'KOCreature',
      'KO removal should include creature name');
    assert.equal(result.koRemovals[0].index, 0,
      'KO removal should include original slot index');
  });

  it('processKOSwaps compacts null slots from active array in-place', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead1', name: 'デッド1' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' },
      { hp: 0, maxHp: 50, nameEn: 'Dead2', name: 'デッド2' }
    ];
    const party = { active: allies, reserves: [] };

    processKOSwaps(allies, party);

    // All null slots compacted — only alive creature remains
    assert.equal(allies.length, 1, 'Null slots should be compacted');
    assert.equal(allies[0].nameEn, 'Alive', 'Only alive creature should remain');
    // Array reference preserved (critical for aliasing)
    assert.strictEqual(party.active, allies,
      'Array reference must be preserved for party.active aliasing');
  });
});
