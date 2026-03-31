import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PARTY_SKILLS_CATALOG,
  rollSkillMasterOffers,
  getPartySkillDisplay
} from '../../../src/game/party-skills.js';

describe('party-skills', () => {
  it('rollSkillMasterOffers returns distinct IDs and excludes owned', () => {
    const allIds = Object.keys(PARTY_SKILLS_CATALOG);
    assert.ok(allIds.length >= 3, 'catalog should have at least 3 skills for offers');

    const owned = [allIds[0]];
    const offers = rollSkillMasterOffers({ ownedSkillIds: owned, count: 3 });

    assert.ok(Array.isArray(offers));
    assert.ok(!offers.includes(allIds[0]), 'offers should exclude owned');
    assert.strictEqual(new Set(offers).size, offers.length, 'offers should be distinct');
    assert.ok(offers.length <= 3, 'offers should not exceed requested count');
  });

  it('rollSkillMasterOffers clamps to eligible size and returns [] when none eligible', () => {
    const allIds = Object.keys(PARTY_SKILLS_CATALOG);
    const offers = rollSkillMasterOffers({ ownedSkillIds: allIds, count: 3 });
    assert.deepStrictEqual(offers, []);
  });

  it('getPartySkillDisplay returns display object for known IDs', () => {
    const id = Object.keys(PARTY_SKILLS_CATALOG)[0];
    const display = getPartySkillDisplay(id);
    assert.deepStrictEqual(display, {
      id,
      name: PARTY_SKILLS_CATALOG[id].name,
      desc: PARTY_SKILLS_CATALOG[id].desc,
      loop: PARTY_SKILLS_CATALOG[id].loop,
      params: PARTY_SKILLS_CATALOG[id].params
    });
  });
});

