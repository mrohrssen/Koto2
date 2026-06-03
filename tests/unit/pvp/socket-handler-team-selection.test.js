import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSavedPvpTeamSelection } from '../../../src/pvp/socket-handler.js';

function savedTeam(id) {
  return {
    creatureParty: {
      active: [{ id, hp: 10, maxHp: 10, level: 3 }],
      reserves: [],
    },
    partySkills: ['momentum'],
    itemBuffs: {},
  };
}

describe('resolveSavedPvpTeamSelection', () => {
  it('returns a deep clone of the saved team for a valid slot', () => {
    const gm = { meta: { pvpTeams: [savedTeam('hikaribon'), null, null] } };
    const selected = resolveSavedPvpTeamSelection(gm, 0);

    assert.equal(selected.creatureParty.active[0].id, 'hikaribon');
    selected.creatureParty.active[0].id = 'tampered';
    assert.equal(gm.meta.pvpTeams[0].creatureParty.active[0].id, 'hikaribon');
  });

  it('returns null for invalid or empty slots', () => {
    const gm = { meta: { pvpTeams: [savedTeam('hikaribon'), null, null] } };

    assert.equal(resolveSavedPvpTeamSelection(gm, 1), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, 3), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, -1), null);
    assert.equal(resolveSavedPvpTeamSelection(gm, '0'), null);
    assert.equal(resolveSavedPvpTeamSelection(null, 0), null);
  });
});
