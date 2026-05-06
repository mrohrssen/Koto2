import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { clearManagersForTest, getManager } from '../../../src/game/manager-registry.js';
import { resetDataDirForTest } from '../../../src/data-dir.js';

describe('crystal game routes', { concurrency: false }, () => {
  let dataDir;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'koto-crystal-routes-'));
    clearManagersForTest();
    process.env.CRYSTAL_TEST_NOW = '2026-05-06T01:00:00.000Z';
  });

  afterEach(() => {
    delete process.env.CRYSTAL_TEST_NOW;
    clearManagersForTest();
    resetDataDirForTest();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('awards daily login crystals once per UTC date', async () => {
    const app = createApp({ authBypass: true, dataDir });

    const first = await request(app)
      .post('/api/game/crystals/daily-login')
      .send({})
      .expect(200);
    const second = await request(app)
      .post('/api/game/crystals/daily-login')
      .send({})
      .expect(200);

    assert.deepEqual(first.body, {
      ok: true,
      awarded: true,
      amount: 100,
      balance: 100,
      today: '2026-05-06'
    });
    assert.deepEqual(second.body, {
      ok: true,
      awarded: false,
      amount: 0,
      balance: 100,
      today: '2026-05-06'
    });
  });

  it('charges 25 crystals to start a run', async () => {
    const app = createApp({ authBypass: true, dataDir });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 50;
    gm.createPlayer('Tester');

    const res = await request(app)
      .post('/api/game/start-run')
      .send({})
      .expect(200);

    assert.equal(res.body.state.meta.crystals, 25);
    assert.equal(gm.meta.crystals, 25);
    assert.equal(!!gm.run, true);
  });

  it('rejects start-run when balance is too low without creating a run', async () => {
    const app = createApp({ authBypass: true, dataDir });
    const gm = getManager('test-user');
    gm.initMeta();
    gm.meta.crystals = 10;
    gm.createPlayer('Tester');

    const res = await request(app)
      .post('/api/game/start-run')
      .send({})
      .expect(402);

    assert.deepEqual(res.body, {
      ok: false,
      error: 'insufficient_crystals',
      cost: 25,
      balance: 10
    });
    assert.equal(gm.meta.crystals, 10);
    assert.equal(gm.run, null);
  });
});
