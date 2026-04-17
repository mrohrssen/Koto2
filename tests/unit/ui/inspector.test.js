// tests/unit/ui/inspector.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInspector } from '../../../public/js/inspector.js';

describe('Inspector', () => {
  function mockQueries({
    stateAllies = [], stateEnemies = [],
    domAllyBars = 0, domEnemyBars = 0,
    pixiAllySprites = [], pixiEnemySprites = [],
    phase = 'combat',
  } = {}) {
    return {
      getState: () => ({
        combat: { allies: stateAllies, enemies: stateEnemies },
        run: { active: true },
      }),
      getPhase: () => phase,
      countDomBars: (side) => side === 'player' ? domAllyBars : domEnemyBars,
      getPixiSprites: (side) => side === 'player' ? pixiAllySprites : pixiEnemySprites,
    };
  }

  describe('checkCreatures', () => {
    it('returns ok when all layers match', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }, { hp: 20 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,
        domEnemyBars: 1,
        pixiAllySprites: [{ alpha: 1 }, { alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);
      assert.equal(result.mismatches.length, 0);
    });

    it('detects DOM ghost — extra HP bar', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }],
        domEnemyBars: 2,
        pixiEnemySprites: [{ alpha: 1 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.equal(result.mismatches[0].type, 'DOM_GHOST');
      assert.match(result.mismatches[0].detail, /enemy.*dom.*2.*state.*1/i);
    });

    it('detects Pixi ghost — extra sprite visible', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }],
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 0.8 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.equal(result.mismatches[0].type, 'DOM_GHOST');
      assert.match(result.mismatches[0].detail, /pixi/i);
    });

    it('ignores KO sprites with alpha <= 0.3', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 0 }],
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 0.3 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);
    });

    it('excludes befriended creatures from alive count', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 20, befriended: true }],
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, true);
    });

    it('detects KO sprite not faded', () => {
      const inspector = createInspector(mockQueries({
        stateEnemies: [{ hp: 10 }, { hp: 0 }],
        domEnemyBars: 1,
        pixiEnemySprites: [{ alpha: 1 }, { alpha: 1 }],
      }));
      const result = inspector.checkCreatures();
      assert.equal(result.ok, false);
      assert.match(result.mismatches[0].detail, /KO.*alpha/i);
    });
  });

  describe('checkGameRules', () => {
    it('detects KO creature in attack results', () => {
      const inspector = createInspector(mockQueries({ phase: 'combat', stateEnemies: [{ hp: 0 }] }));
      const result = {
        playerAttacks: [{ attackerSide: 'enemy', attackerIndex: 0, attackerHpBefore: 0, damage: 5 }],
        enemyAttacks: [],
        enemies: [{ hp: 0 }],
        allies: [{ hp: 30 }],
      };
      const check = inspector.checkGameRules(result);
      assert.equal(check.ok, false);
      assert.equal(check.mismatches[0].type, 'LOGIC_BUG');
    });

    it('detects HP below 0', () => {
      const inspector = createInspector(mockQueries({ phase: 'combat' }));
      const result = {
        playerAttacks: [],
        enemyAttacks: [],
        enemies: [{ hp: -5 }],
        allies: [{ hp: 30 }],
      };
      const check = inspector.checkGameRules(result);
      assert.equal(check.ok, false);
      assert.match(check.mismatches[0].detail, /HP.*below.*0/i);
    });

    it('detects expired effect still in activeEffects', () => {
      const inspector = createInspector(mockQueries({ phase: 'combat' }));
      const result = {
        playerAttacks: [],
        enemyAttacks: [],
        enemies: [{ hp: 10, activeEffects: [{ type: 'poison', remainingTurns: 0 }] }],
        allies: [{ hp: 30 }],
      };
      const check = inspector.checkGameRules(result);
      assert.equal(check.ok, false);
      assert.match(check.mismatches[0].detail, /expired.*effect/i);
    });

    it('returns ok when no violations', () => {
      const inspector = createInspector(mockQueries({ phase: 'combat' }));
      const result = {
        playerAttacks: [{ attackerSide: 'player', attackerIndex: 0, attackerHpBefore: 30, damage: 10 }],
        enemyAttacks: [],
        enemies: [{ hp: 5 }],
        allies: [{ hp: 30 }],
      };
      const check = inspector.checkGameRules(result);
      assert.equal(check.ok, true);
    });
  });

  describe('fullScan', () => {
    it('returns structured report with summary', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }, { hp: 20 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,
        domEnemyBars: 1,
        pixiAllySprites: [{ alpha: 1 }, { alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));
      const report = inspector.fullScan();
      assert.equal(report.ok, true);
      assert.deepEqual(report.summary.allies, { state: 2, dom: 2, pixi: 2 });
      assert.deepEqual(report.summary.enemies, { state: 1, dom: 1, pixi: 1 });
    });

    it('returns zeros outside combat', () => {
      const inspector = createInspector(mockQueries({ phase: 'hub' }));
      const report = inspector.fullScan();
      assert.deepEqual(report.summary.allies, { state: 0, dom: 0, pixi: 0 });
      assert.deepEqual(report.summary.enemies, { state: 0, dom: 0, pixi: 0 });
    });

    it('collects all mismatches in report', () => {
      const inspector = createInspector(mockQueries({
        stateAllies: [{ hp: 30 }],
        stateEnemies: [{ hp: 10 }],
        domAllyBars: 2,
        domEnemyBars: 2,
        pixiAllySprites: [{ alpha: 1 }],
        pixiEnemySprites: [{ alpha: 1 }],
      }));
      const report = inspector.fullScan();
      assert.equal(report.ok, false);
      assert.ok(report.mismatches.length >= 2);
    });
  });
});

describe('Inspector — non-combat phases', () => {
  function mockQueries({
    stateAllies = [],
    domAllyBars = 0,
    pixiAllySprites = [],
    phase = 'hub',
    npcDisplayVisible = false,
    npcPixiCount = 0,
  } = {}) {
    return {
      getState: () => ({ run: { creatureParty: { active: stateAllies } } }),
      getPhase: () => phase,
      countDomBars: (side) => side === 'player' ? domAllyBars : 0,
      getPixiSprites: (side) => side === 'player' ? pixiAllySprites : [],
      getNpcSprites: () => {
        const sprites = [];
        for (let i = 0; i < npcPixiCount; i++) sprites.push({ alpha: 1 });
        return sprites;
      },
      isNpcDisplayVisible: () => npcDisplayVisible,
    };
  }

  it('skillMaster phase: detects "formation shown but 0 pixi sprites"', () => {
    const inspector = createInspector(mockQueries({
      phase: 'skillMaster',
      stateAllies: [{ hp: 30 }],
      domAllyBars: 1,
      pixiAllySprites: [],
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, false, 'should flag missing Pixi sprite');
    assert.match(result.mismatches[0].detail, /pixi.*0.*state.*1|missing/i);
  });

  it('hub phase: detects NPC display visible but zero NPC pixi sprites', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 0,
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, false);
    assert.match(result.mismatches[0].detail, /npc|sprite/i);
  });

  it('hub phase: passes when NPC display visible with one NPC pixi sprite', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 1,
    }));
    const result = inspector.checkCreatures();
    assert.equal(result.ok, true);
  });

  it('fullScan in hub phase returns npc counts in summary', () => {
    const inspector = createInspector(mockQueries({
      phase: 'hub',
      npcDisplayVisible: true,
      npcPixiCount: 1,
    }));
    const report = inspector.fullScan();
    assert.ok(report.summary.npcs, 'summary.npcs present');
    assert.strictEqual(report.summary.npcs.pixi, 1);
    assert.strictEqual(report.summary.npcs.dom, 1);
  });
});
