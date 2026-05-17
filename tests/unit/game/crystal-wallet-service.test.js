import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  awardDailyLoginCrystals,
  createUtcDateString,
  ensureCrystalMeta,
  getCrystalBalance,
  prepareCrystalSpend,
  recordCrystalSpend,
  withCrystalActionInFlight
} from '../../../src/game/services/crystal-wallet-service.js';

describe('crystal wallet service', () => {
  it('backfills missing crystal meta fields', () => {
    const meta = {};
    ensureCrystalMeta(meta);

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('normalizes invalid crystal meta fields', () => {
    const meta = { crystals: -10, lastCrystalLoginDate: 42, crystalCharges: [] };
    ensureCrystalMeta(meta);

    assert.equal(meta.crystals, 0);
    assert.equal(meta.lastCrystalLoginDate, null);
    assert.deepEqual(meta.crystalCharges, {});
  });

  it('formats UTC dates as YYYY-MM-DD', () => {
    assert.equal(createUtcDateString(new Date('2026-05-06T23:59:59.000Z')), '2026-05-06');
  });

  it('awards daily crystals once per UTC date', () => {
    const meta = { crystals: 25 };

    const first = awardDailyLoginCrystals(meta, new Date('2026-05-06T01:00:00.000Z'));
    const second = awardDailyLoginCrystals(meta, new Date('2026-05-06T22:00:00.000Z'));
    const third = awardDailyLoginCrystals(meta, new Date('2026-05-07T00:00:00.000Z'));

    assert.deepEqual(first, { awarded: true, amount: 500, balance: 525, today: '2026-05-06' });
    assert.deepEqual(second, { awarded: false, amount: 0, balance: 525, today: '2026-05-06' });
    assert.deepEqual(third, { awarded: true, amount: 500, balance: 1025, today: '2026-05-07' });
  });

  it('returns insufficient_crystals without mutating balance', () => {
    const meta = { crystals: 10 };
    const result = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.startRun,
      key: 'run:start',
      cost: CRYSTAL_COSTS.startRun
    });

    assert.deepEqual(result, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 25,
      balance: 10
    });
    assert.equal(meta.crystals, 10);
  });

  it('records a successful spend once for an idempotency key', () => {
    const meta = { crystals: 50 };
    const first = recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate,
      now: new Date('2026-05-06T01:00:00.000Z')
    });
    const second = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate
    });

    assert.equal(first.ok, true);
    assert.equal(first.crystals.charged, true);
    assert.equal(first.crystals.balance, 45);
    assert.equal(second.ok, true);
    assert.equal(second.crystals.charged, false);
    assert.equal(second.crystals.alreadyCharged, true);
    assert.equal(getCrystalBalance(meta), 45);
  });

  it('keeps translation and learn charges separate for the same key', () => {
    const meta = { crystals: 50 };
    recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.translate
    });
    recordCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.learn,
      key: 'dialogue:1',
      cost: CRYSTAL_COSTS.learn
    });

    assert.equal(meta.crystals, 30);
    assert.equal(Object.keys(meta.crystalCharges).length, 2);
  });

  it('joins duplicate in-flight actions for the same user/reason/key', async () => {
    let calls = 0;
    const run = () => withCrystalActionInFlight({
      userId: 'user-1',
      reason: CRYSTAL_REASONS.translate,
      key: 'dialogue:1',
      action: async () => {
        calls += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return { ok: true, value: calls };
      }
    });

    const [first, second] = await Promise.all([run(), run()]);
    assert.deepEqual(first, { ok: true, value: 1 });
    assert.deepEqual(second, { ok: true, value: 1 });
    assert.equal(calls, 1);
  });

  it('prunes old charge records after the cap', () => {
    const meta = { crystals: 500 };
    for (let i = 0; i < 105; i += 1) {
      recordCrystalSpend(meta, {
        reason: CRYSTAL_REASONS.translate,
        key: `dialogue:${i}`,
        cost: 1,
        now: new Date(2026, 0, 1, 0, 0, i)
      });
    }

    assert.equal(Object.keys(meta.crystalCharges).length, 100);
    assert.equal(meta.crystalCharges['translate:dialogue:0'], undefined);
    assert.ok(meta.crystalCharges['translate:dialogue:104']);
  });
});
