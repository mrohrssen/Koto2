import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMetaProgression } from '../../../src/game/state.js';
import { GameManager } from '../../../src/game/loop.js';
import { getManager, clearManagersForTest } from '../../../src/game/manager-registry.js';
import { setDataDirForTest, resetDataDirForTest } from '../../../src/data-dir.js';

describe('crystal meta state', () => {
  afterEach(() => {
    clearManagersForTest();
    resetDataDirForTest();
  });

  it('createMetaProgression includes crystal defaults', () => {
    const meta = createMetaProgression();

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('GameManager.getState exposes crystal balance', () => {
    const gm = new GameManager();
    gm.initMeta();
    gm.meta.crystals = 125;

    const state = gm.getState();
    assert.equal(state.meta.crystals, 125);
    assert.equal(state.meta.lastCrystalLoginDate, null);
    assert.deepEqual(state.meta.crystalCharges, {});
  });

  it('manager registry migrates old saves missing crystal fields', () => {
    const dir = join(tmpdir(), `koto-crystal-meta-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    setDataDirForTest(dir);

    writeFileSync(join(dir, '.jrpg-save-user-1.json'), JSON.stringify({
      version: 2,
      player: null,
      meta: {
        lifetimeStats: {
          totalRuns: 0,
          runsCompleted: 0,
          runsFailed: 0,
          totalDamageDealt: 0,
          totalDamageTaken: 0,
          totalCreditsEarned: 0,
          highestAreasCleared: 0,
          totalPlayTime: 0,
          firstPlayDate: null,
          lastPlayDate: null
        },
        unlocks: [],
        achievements: [],
        creatureCollection: ['hikaribon', 'hanatchi', 'tsukimochi'],
        creatureCounts: { hikaribon: 1, hanatchi: 1, tsukimochi: 1 },
        befriendCount: {},
        bossesDefeated: [],
        levels: { highestUnlocked: 1, completed: [], current: null },
        npcBonds: {},
        prologueComplete: true,
        kanaMode: false,
        pvpTeams: [null, null, null],
        seenCidScripts: [],
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        fusionCores: 0,
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
        itemsDiscovered: [],
        tutorialStep: 6,
        tutorialFireDropsGifted: false,
        tutorialFusionDataUnlocked: [],
        tutorialFusionCoreAwarded: false,
        tutorialFusionComplete: false
      },
      run: null,
      combat: null
    }, null, 2));

    const gm = getManager('user-1');
    assert.equal(gm.meta.crystals, 0);
    assert.equal(gm.meta.lastCrystalLoginDate, null);
    assert.deepEqual(gm.meta.crystalCharges, {});

    rmSync(dir, { recursive: true, force: true });
  });
});
