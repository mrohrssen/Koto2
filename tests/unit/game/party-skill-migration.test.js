import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePartySkills } from '../../../src/game/party-skills.js';
import { savePvpTeam } from '../../../src/routes/game/pvp.js';

describe('party skill migration integration', () => {
  it('normalizes active run party skills into compact tree entries', () => {
    const run = {
      partySkills: [
        { id: 'arcStrike' },
        { id: 'forkedArc' },
        { id: 'retaliationStrike' },
        { id: 'momentum' },
        { id: 'finisherFeast' }
      ]
    };

    run.partySkills = normalizePartySkills(run.partySkills);

    assert.deepEqual(run.partySkills, [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 },
      { id: 'buffMaster', level: 1 },
      { id: 'expMaster', level: 1 }
    ]);
  });

  it('savePvpTeam stores normalized compact tree skills', () => {
    const gm = {
      run: {
        creatureParty: {
          active: [{ id: 'hi', uid: 'a', hp: 5, maxHp: 10, mp: 1, maxMp: 8, activeEffects: [{ type: 'poison' }] }],
          reserves: [],
          maxTotal: 6
        },
        partySkills: [{ id: 'arcStrike' }, { id: 'forkedArc' }, { id: 'momentum' }],
        itemBuffs: {}
      },
      meta: { pvpTeams: [null, null, null] }
    };

    assert.equal(savePvpTeam(gm, 0), true);
    assert.deepEqual(gm.meta.pvpTeams[0].partySkills, [
      { id: 'arcStrike', level: 2 },
      { id: 'buffMaster', level: 1 }
    ]);
  });
});
