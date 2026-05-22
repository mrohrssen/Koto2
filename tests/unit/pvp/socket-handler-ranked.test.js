import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { setupPvpSockets } from '../../../src/pvp/socket-handler.js';

function fakeIo() {
  return {
    middlewares: [],
    handlers: new Map(),
    sockets: { sockets: new Map() },
    use(fn) {
      this.middlewares.push(fn);
    },
    on(event, fn) {
      this.handlers.set(event, fn);
    },
    to() {
      return { emit: mock.fn() };
    }
  };
}

describe('setupPvpSockets ranked dependencies', () => {
  it('returns ranked queue state for tests and production wiring', () => {
    const io = fakeIo();
    const getManager = mock.fn();
    const saveManager = mock.fn();
    const result = setupPvpSockets(io, { getManager, saveManager, getSettings: () => ({}) });
    assert.ok(result.mm);
    assert.ok(result.rankedQueue);
    assert.strictEqual(io.middlewares.length, 1);
    assert.strictEqual(typeof io.handlers.get('connection'), 'function');
  });

  it('accepts ranked bot fallback dependencies', () => {
    const io = fakeIo();
    const result = setupPvpSockets(io, {
      getManager: mock.fn(),
      saveManager: mock.fn(),
      listRankedBots: () => [],
      getBotTeam: () => null
    });
    assert.ok(result.botTracker);
    assert.ok(result.rankedQueue);
  });

  it('does not gate ranked bot fallback behind server configuration', () => {
    const source = readFileSync(new URL('../../../src/pvp/socket-handler.js', import.meta.url), 'utf8');
    assert.equal(source.includes('rankedBotFallbackEnabled'), false);
    assert.equal(source.includes('RANKED_BOT_FALLBACK_ENABLED'), false);
  });
});
