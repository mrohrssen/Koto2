import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunSummaryEventData,
  createRunCombatMetrics,
  recordCombatResult,
  selectLatestAreaOption,
  summarizeRunCombatMetrics
} from '../../engine/run-metrics.js';

describe('run metrics helpers', () => {
  it('selects the last area from a wrapped area-options response', () => {
    const area = selectLatestAreaOption({
      areas: [
        { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' },
        { id: 'wild-plains', nameEn: 'Wild Plains' }
      ]
    });

    assert.deepEqual(area, { id: 'wild-plains', nameEn: 'Wild Plains' });
  });

  it('selects the last area from a raw area-options array', () => {
    const area = selectLatestAreaOption([
      { areaId: 'one', nameEn: 'One' },
      { areaId: 'two', nameEn: 'Two' }
    ]);

    assert.deepEqual(area, { areaId: 'two', nameEn: 'Two' });
  });

  it('returns null when no area options are available', () => {
    assert.equal(selectLatestAreaOption({ areas: [] }), null);
    assert.equal(selectLatestAreaOption({ areas: null }), null);
    assert.equal(selectLatestAreaOption(null), null);
  });

  it('skips the school area so wild-plains is the final progression target', () => {
    const area = selectLatestAreaOption({
      areas: [
        { id: 'hajimari-no-hiroba', nameEn: 'Starting Meadow' },
        { id: 'wild-plains', nameEn: 'Wild Plains' },
        { id: 'school', nameEn: 'School' }
      ]
    });

    assert.deepEqual(area, { id: 'wild-plains', nameEn: 'Wild Plains' });
  });

  it('returns null when only excluded areas are available', () => {
    assert.equal(
      selectLatestAreaOption({ areas: [{ id: 'school', nameEn: 'School' }] }),
      null
    );
  });

  it('summarizes regular combat separately from boss combat', () => {
    const metrics = createRunCombatMetrics();

    recordCombatResult(metrics, 'encounter', { combat: { rounds: 2 } });
    recordCombatResult(metrics, 'npcBattle', { combat: { rounds: 5 } });
    recordCombatResult(metrics, 'boss', { combat: { rounds: 9 } });
    recordCombatResult(metrics, 'friendlyNpc', { outcome: 'cleared' });

    assert.deepEqual(summarizeRunCombatMetrics(metrics), {
      combatCount: 2,
      avgCombatRounds: 3.5,
      maxCombatRounds: 5,
      bossCombatRounds: 9
    });
  });

  it('uses zero regular metrics and null boss rounds when no combat is recorded', () => {
    assert.deepEqual(summarizeRunCombatMetrics(createRunCombatMetrics()), {
      combatCount: 0,
      avgCombatRounds: 0,
      maxCombatRounds: 0,
      bossCombatRounds: null
    });
  });

  it('builds the enriched run_summary event payload', () => {
    const metrics = createRunCombatMetrics();
    recordCombatResult(metrics, 'encounter', { combat: { rounds: 4 } });
    recordCombatResult(metrics, 'boss', { combat: { rounds: 8 } });

    const payload = buildRunSummaryEventData({
      wordsImmersed: 6,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      creaturesDefeated: 3,
      creaturesBefriended: 1,
      itemsCollected: 2
    }, {
      areaId: 'wild-plains',
      name: '野原',
      nameEn: 'Wild Plains'
    }, metrics, true, 10);

    assert.deepEqual(payload, {
      areaId: 'wild-plains',
      areaName: 'Wild Plains',
      areaNameJa: '野原',
      wiped: true,
      completed: false,
      wordsImmersed: 6,
      wordsMastered: [{ word: '猫', meaning: 'cat', exposures: 4 }],
      creaturesDefeated: 3,
      creaturesBefriended: 1,
      itemsCollected: 2,
      combatCount: 1,
      avgCombatRounds: 4,
      maxCombatRounds: 4,
      bossCombatRounds: 8,
      furthestRoomReached: 10
    });
  });

  it('builds area summary fields from either id shape', () => {
    const payload = buildRunSummaryEventData({}, {
      areaId: 'school',
      nameEn: 'School',
      name: '学校'
    }, createRunCombatMetrics(), false);

    assert.equal(payload.areaId, 'school');
    assert.equal(payload.areaName, 'School');
    assert.equal(payload.areaNameJa, '学校');
  });
});
