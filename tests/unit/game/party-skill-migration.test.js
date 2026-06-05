import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetDataDirForTest, setDataDirForTest } from '../../../src/data-dir.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { savePvpTeam } from '../../../src/routes/game/pvp.js';

describe('party skill migration integration', () => {
  let tempDir = null;

  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it('loads and persists active run and pvp team party skills as compact tree entries', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-party-skill-migration-'));
    setDataDirForTest(tempDir);
    const userId = 'party_skill_migration';
    const saveFile = join(tempDir, `.jrpg-save-${userId}.json`);
    writeFileSync(saveFile, JSON.stringify({
      version: 2,
      player: null,
      meta: {
        lifetimeStats: {},
        achievements: [],
        pvpTeams: [
          { partySkills: [{ id: 'arcStrike' }, { id: 'forkedArc' }, { id: 'momentum' }] },
          null,
          null
        ]
      },
      run: {
        partySkills: [
          { id: 'arcStrike' },
          { id: 'forkedArc' },
          { id: 'retaliationStrike' },
          { id: 'momentum' },
          { id: 'finisherFeast' }
        ]
      },
      combat: null
    }));

    clearManagersForTest();
    const manager = getManager(userId);

    const expectedRunSkills = [
      { id: 'arcStrike', level: 2 },
      { id: 'counterMaster', level: 1 },
      { id: 'buffMaster', level: 1 },
      { id: 'expMaster', level: 1 }
    ];
    const expectedPvpSkills = [
      { id: 'arcStrike', level: 2 },
      { id: 'buffMaster', level: 1 }
    ];

    assert.deepEqual(manager.run.partySkills, expectedRunSkills);
    assert.deepEqual(manager.meta.pvpTeams[0].partySkills, expectedPvpSkills);

    const persisted = JSON.parse(readFileSync(saveFile, 'utf-8'));
    assert.deepEqual(persisted.run.partySkills, expectedRunSkills);
    assert.deepEqual(persisted.meta.pvpTeams[0].partySkills, expectedPvpSkills);
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
