import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAllDefeated, processKOSwaps } from '../../../src/game/combat/resolution.js';

describe('checkAllDefeated', () => {
  it('returns true for empty array', () => {
    assert.equal(checkAllDefeated([]), true);
  });

  it('returns true when all hp <= 0', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: -5, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });

  it('returns false when any creature alive', () => {
    const creatures = [
      { hp: 0, maxHp: 50 },
      { hp: 10, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), false);
  });

  it('returns true when all null', () => {
    assert.equal(checkAllDefeated([null, null]), true);
  });

  it('treats befriended enemies as defeated', () => {
    const creatures = [
      { hp: 30, maxHp: 50, befriended: true },
      { hp: 0, maxHp: 50 }
    ];
    assert.equal(checkAllDefeated(creatures), true);
  });
});

describe('processKOSwaps', () => {
  function makeParty(active, reserves = []) {
    return { active, reserves };
  }

  it('returns empty arrays when no allies are KO', () => {
    const allies = [{ hp: 50, maxHp: 50, nameEn: 'A' }];
    const party = makeParty(allies);
    const result = processKOSwaps(allies, party);
    assert.deepEqual(result.koSwaps, []);
    assert.deepEqual(result.koRemovals, []);
  });

  it('swaps KO creature with reserve', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'Reserve', name: 'リザーブ' };
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, [reserve]);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 1);
    assert.equal(result.koSwaps[0].index, 0);
    assert.ok(result.koSwaps[0].replacement); // creature object
    assert.equal(result.koRemovals.length, 0);
  });

  it('records removal when no reserves available', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' }
    ];
    const party = makeParty(allies, []);
    const result = processKOSwaps(allies, party);

    assert.equal(result.koSwaps.length, 0);
    assert.equal(result.koRemovals.length, 1);
    assert.equal(result.koRemovals[0].index, 0);
    assert.equal(result.koRemovals[0].name, 'Dead');
  });

  it('compacts null slots from active array in-place', () => {
    const allies = [
      { hp: 0, maxHp: 50, nameEn: 'Dead', name: 'デッド' },
      { hp: 30, maxHp: 50, nameEn: 'Alive', name: 'アライブ' }
    ];
    const party = makeParty(allies, []);
    processKOSwaps(allies, party);
    // Compaction mutates the SAME array (important for PvP aliasing)
    assert.equal(allies.length, 1);
    assert.equal(allies[0].nameEn, 'Alive');
    assert.strictEqual(party.active, allies); // same reference preserved
  });

  it('resetStatStages is called on replacement creature', () => {
    const reserve = { hp: 40, maxHp: 40, nameEn: 'R', name: 'リ', statStages: { atk: 3, def: -2 } };
    const allies = [{ hp: 0, maxHp: 50, nameEn: 'D', name: 'デ' }];
    const party = makeParty(allies, [reserve]);
    processKOSwaps(allies, party);
    // handleCreatureKO calls resetStatStages on the replacement
    assert.deepEqual(reserve.statStages, { atk: 0, def: 0 });
  });
});
