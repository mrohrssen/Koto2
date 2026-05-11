import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createStore } from '../../db/store.js';
import { runSimulation } from '../../engine/runner.js';

const opened = [];

function createEmptyDrops() {
  return { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
}

async function withFakeCrystalServer(fn) {
  const app = express();
  app.use(express.json());

  const state = {
    crystals: 0,
    dailyLoginCalled: false,
    startRunSucceeded: false,
    runActive: false
  };

  app.post('/api/auth/register', (_req, res) => {
    res.json({ user: { id: 'u-sim' }, token: 'token' });
  });
  app.post('/api/game/create-player', (_req, res) => res.json({ ok: true }));
  app.post('/api/game/select-starter', (_req, res) => res.json({ ok: true }));
  app.post('/api/game/prologue-complete', (_req, res) => res.json({ ok: true }));
  app.get('/api/game/known-words', (_req, res) => res.json({ words: [] }));
  app.get('/api/game/creature-collection', (_req, res) => res.json({ catalog: [] }));
  app.post('/api/game/crystals/daily-login', (_req, res) => {
    state.dailyLoginCalled = true;
    state.crystals += 100;
    res.json({ ok: true, awarded: true, amount: 100, balance: state.crystals });
  });
  app.post('/api/game/start-run', (_req, res) => {
    if (state.crystals < 25) {
      return res.status(402).json({ ok: false, error: 'insufficient_crystals', cost: 25, balance: state.crystals });
    }
    state.crystals -= 25;
    state.startRunSucceeded = true;
    state.runActive = true;
    res.json({ ok: true });
  });
  app.post('/api/game/skill-master-offers', (_req, res) => res.json({ offered: [] }));
  app.get('/api/game/area-options', (_req, res) => res.json({ areas: [] }));
  app.get('/api/game/state', (_req, res) => res.json({ run: state.runActive ? { rooms: [] } : null }));
  app.post('/api/game/forfeit', (_req, res) => {
    state.runActive = false;
    res.json({ runSummary: { wordsImmersed: 0 } });
  });
  app.get('/api/game/known-words/due-words', (_req, res) => res.json({ words: [] }));
  app.get('/api/game/fusion', (_req, res) => res.json({ recipes: [] }));
  app.get('/api/game/crests', (_req, res) => {
    res.json({ chestCost: 10, elementDrops: createEmptyDrops(), crests: [], equippedCrests: createEmptyDrops() });
  });
  app.post('/api/admin/advance-time', (_req, res) => res.json({ ok: true }));

  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  opened.push(server);

  try {
    const { port } = server.address();
    await fn({ baseUrl: `http://127.0.0.1:${port}`, state });
  } finally {
    await new Promise(resolve => server.close(resolve));
    opened.pop();
  }
}

describe('runSimulation crystals', () => {
  afterEach(async () => {
    while (opened.length > 0) {
      const server = opened.pop();
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('claims daily crystals before starting a paid run', async () => {
    await withFakeCrystalServer(async ({ baseUrl, state }) => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'sim-crystals-'));
      const store = createStore(join(tmpDir, 'test.db'));
      try {
        const profileId = store.createProfile('Crystal test', {
          durationDays: 1,
          runsPerDay: 1,
          dailyPlayMinutes: 20,
          aiDialogueMode: 'skip'
        });
        const simId = store.createSimulation(profileId);

        await runSimulation(store.getProfile(profileId).config, store, simId, baseUrl, 'secret');

        const apiErrors = store.getEvents(simId, { event_type: 'api_error' });
        assert.equal(state.dailyLoginCalled, true);
        assert.equal(state.startRunSucceeded, true);
        assert.equal(apiErrors.length, 0);
      } finally {
        store.close();
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
