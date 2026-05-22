import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { setupPvpSockets } from '../../../src/pvp/socket-handler.js';
import { createDefaultRankedState } from '../../../src/pvp/ranked-rating.js';

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

function fakeSocket({ id = 'socket-human', userId = 'human', username = 'Human' } = {}) {
  const handlers = new Map();
  return {
    id,
    userId,
    username,
    emitted: [],
    joined: [],
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, data) {
      this.emitted.push({ event, data });
    },
    join(code) {
      this.joined.push(code);
    },
    trigger(event, data) {
      handlers.get(event)?.(data);
    }
  };
}

function fakeManager() {
  const meta = {
    pvpTeams: [{ creatureParty: { active: [], reserves: [] }, partySkills: [], itemBuffs: {} }],
    pvpRanked: createDefaultRankedState()
  };
  return {
    meta,
    getMeta() {
      return meta;
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

  it('creates a generated bot match when no persisted bot users are available', async () => {
    const io = fakeIo();
    const socket = fakeSocket();
    io.sockets.sockets.set(socket.id, socket);

    const result = setupPvpSockets(io, {
      getManager: () => fakeManager(),
      saveManager: mock.fn(),
      listRankedBots: () => [],
      getBotTeam: () => null
    });
    io.handlers.get('connection')(socket);

    socket.trigger('pvp:ranked-enqueue');
    for (const entry of result.rankedQueue.entries.values()) {
      entry.botFallbackAt = Date.now() - 1;
    }

    await new Promise(resolve => setTimeout(resolve, 1100));

    const found = socket.emitted.find(e => e.event === 'pvp:ranked-match-found');
    assert.ok(found);
    assert.equal(result.rankedQueue.size, 0);
    assert.ok(found.data.opponentName);
  });
});
