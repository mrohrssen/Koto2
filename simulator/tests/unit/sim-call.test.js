import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSimCaller } from '../../engine/sim-call.js';

describe('simCall', () => {
  it('returns { ok: false } with error message on connection failure (does not throw)', async () => {
    const logs = [];
    const logFn = (entry) => logs.push(entry);
    const call = createSimCaller('http://127.0.0.1:99999', 'fake-token', logFn);

    const result = await call('GET', '/api/test', null, { test: true });

    assert.equal(result.ok, false);
    assert.ok(result.error, 'should have an error message');
    assert.ok(typeof result.error === 'string');
  });

  it('calls logFn with api_error type on connection failure', async () => {
    const logs = [];
    const logFn = (entry) => logs.push(entry);
    const call = createSimCaller('http://127.0.0.1:99999', 'fake-token', logFn);

    await call('POST', '/api/auth/login', { user: 'test' }, { action: 'login' });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].type, 'api_error');
    assert.equal(logs[0].path, '/api/auth/login');
    assert.ok(logs[0].error);
    assert.deepEqual(logs[0].context, { action: 'login' });
  });

  it('works without a logFn (does not crash)', async () => {
    const call = createSimCaller('http://127.0.0.1:99999', 'fake-token', null);
    const result = await call('GET', '/api/test');
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});
