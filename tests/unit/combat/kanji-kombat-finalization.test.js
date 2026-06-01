import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { clearSrsCache, configureSrs } from '../../../src/game/internal-srs.js';
import { ensureScriptDeckSeeded } from '../../../src/game/script-srs.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { KanjiKombatService } from '../../../src/game/services/kanji-kombat-service.js';

function creature(id, hp = 20) {
  return {
    id,
    uid: `${id}-uid`,
    name: id,
    nameEn: id,
    element: 'fire',
    level: 1,
    hp,
    maxHp: 20,
    mp: 10,
    maxMp: 10,
    attack: 5,
    defense: 5,
    dex: 5,
    moves: [],
  };
}

function buildGm() {
  const allyA = creature('ally-a', 0);
  const allyB = creature('ally-b', 20);
  const gm = {
    run: {
      mode: 'kanjiKombat',
      active: true,
      creatureParty: {
        active: [allyA, allyB],
        reserves: [],
        maxTotal: 3,
      },
      kanjiKombat: {
        report: {
          wavesCleared: 0,
          minibossesDefeated: 0,
          correctAnswers: 0,
          wrongAnswers: 0,
          cardsReviewed: 0,
          newCardsIntroduced: 0,
        },
      },
    },
    combat: {
      active: true,
      allies: [allyA, allyB],
      enemies: [creature('enemy', 20)],
    },
    emitState() {},
    kanjiKombatService: {
      finalizeDefeat(args) {
        return { actionType: 'kanjiKombat', combatEnded: true, victory: false, ...args };
      },
      completeWaveAndMaybeStartNext(args) {
        return { actionType: 'kanjiKombat', nextWave: true, ...args };
      },
    },
  };
  gm.combatCycleService = new CombatCycleService(gm);
  return gm;
}

describe('Kanji Kombat combat finalization', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'koto-kk-finalization-'));
    configureSrs({ dataDir: tempDir });
    clearSrsCache('wave-snapshot-user');
    ensureScriptDeckSeeded('wave-snapshot-user');
  });

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('removes KO allies using shared KO processing before continuing', () => {
    const gm = buildGm();
    const result = gm.combatCycleService._finalizeKanjiKombatActionResult({
      actionSegments: [],
    });

    assert.equal(result.combatEnded, false);
    assert.deepEqual(gm.run.creatureParty.active.map(c => c.id), ['ally-b']);
    assert.deepEqual(gm.combat.allies.map(c => c.id), ['ally-b']);
    assert.deepEqual(result.koRemovals, [{ slot: 0, name: 'ally-a' }]);
  });

  it('returns defeated wave enemies for playback while state advances to next wave', () => {
    const oldEnemy = creature('old-enemy', 0);
    const newEnemy = creature('new-enemy', 20);
    const gm = {
      userId: 'wave-snapshot-user',
      run: {
        mode: 'kanjiKombat',
        active: true,
        creatureParty: { active: [creature('ally', 20)], reserves: [], maxTotal: 3 },
        kanjiKombat: {
          wave: 1,
          currentWaveIsMiniboss: false,
          localDate: '2026-05-31',
          reviewsSinceIntro: 0,
          nextIntroAfter: 3,
          report: {
            wavesCleared: 0,
            minibossesDefeated: 0,
            correctAnswers: 1,
            wrongAnswers: 0,
            cardsReviewed: 1,
            newCardsIntroduced: 0,
            completedDaily: false,
          },
        },
      },
      combat: {
        active: true,
        allies: [],
        enemies: [oldEnemy],
      },
      emitState() {},
    };
    const service = new KanjiKombatService(gm);
    service.spawnNextWave = () => {
      gm.combat.enemies = [newEnemy];
      gm.combat.allies = gm.run.creatureParty.active;
    };

    const result = service.completeWaveAndMaybeStartNext({
      actionSegments: [],
      flatPlayerAttacks: [],
      flatEnemyAttacks: [],
      xpEvents: [],
    });

    assert.deepEqual(result.enemies.map(e => e.id), ['old-enemy']);
    assert.deepEqual(result.nextWaveEnemies.map(e => e.id), ['new-enemy']);
  });
});
