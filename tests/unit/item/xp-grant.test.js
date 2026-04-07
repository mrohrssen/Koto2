import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyItem } from '../../../src/game/services/item-service.js';
import { instantiateCreature } from '../../../src/game/creatures.js';

describe('Candy xpGrant:killEquivalent', () => {
  function makeParty() {
    const c1 = instantiateCreature('hi');
    c1.hp = c1.maxHp;
    const c2 = instantiateCreature('mizu');
    c2.hp = c2.maxHp;
    return { active: [c1, c2], reserves: [] };
  }

  it('grants XP to all alive creatures when xpGrant is killEquivalent', () => {
    const party = makeParty();
    const xpBefore = [party.active[0].xp, party.active[1].xp];
    const item = { type: 'xpGrant', effect: { xpGrant: 'killEquivalent' } };

    const result = applyItem(item, party, null, null, { enemyLevel: 3 });

    assert.strictEqual(result.applied, true);
    assert.ok(party.active[0].xp > xpBefore[0], 'creature 1 should gain XP');
    assert.ok(party.active[1].xp > xpBefore[1], 'creature 2 should gain XP');
  });

  it('returns applied:false without context', () => {
    const party = makeParty();
    const item = { type: 'xpGrant', effect: { xpGrant: 'killEquivalent' } };

    const result = applyItem(item, party, null, null);
    assert.strictEqual(result.applied, false);
  });
});
