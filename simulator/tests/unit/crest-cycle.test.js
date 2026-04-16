import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCrestCycle } from '../../engine/crest-cycle.js';

function createFakeCrestGame({
  chestCost = 3,
  runActive = false,
  elementDrops = {},
  crests = [],
  equippedCrests = {},
  failOn = []
} = {}) {
  const state = {
    runActive,
    elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0, ...elementDrops },
    crests: crests.map(crest => ({ ...crest })),
    equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null, ...equippedCrests }
  };

  const failSet = new Set(failOn);
  const calls = [];
  let crestSeq = 1;

  const snapshot = () => ({
    chestCost,
    elementDrops: { ...state.elementDrops },
    crests: state.crests.map(crest => ({ ...crest })),
    equippedCrests: { ...state.equippedCrests }
  });

  const simCall = async (method, path, body, context) => {
    calls.push({ method, path, body, context });
    const key = `${method} ${path}`;
    if (failSet.has(key)) {
      return { ok: false, error: `forced failure for ${key}` };
    }

    if (key === 'GET /api/game/state') {
      return { ok: true, data: { run: state.runActive ? {} : null } };
    }

    if (key === 'POST /api/game/forfeit') {
      if (!state.runActive) return { ok: false, error: 'No active run' };
      state.runActive = false;
      return { ok: true, data: {} };
    }

    if (key === 'GET /api/game/crests') {
      return { ok: true, data: snapshot() };
    }

    if (key === 'POST /api/game/crests/open') {
      const element = body?.element;
      const drops = state.elementDrops[element] || 0;
      if (drops < chestCost) {
        return { ok: false, error: 'Not enough element drops' };
      }
      state.elementDrops[element] -= chestCost;
      const crest = {
        id: `crest_${element}_${crestSeq++}`,
        element,
        rarity: 'common',
        stat: element === 'fire' ? 'attack' : 'hp',
        value: 0.05
      };
      state.crests.push(crest);
      return { ok: true, data: { crest, ...snapshot() } };
    }

    if (key === 'POST /api/game/crests/equip') {
      const crestId = body?.crestId;
      const crest = state.crests.find(item => item.id === crestId);
      if (!crest) return { ok: false, error: 'Crest not found' };
      state.equippedCrests[crest.element] = crest.id;
      return { ok: true, data: snapshot() };
    }

    return { ok: false, error: `Unexpected call: ${key}` };
  };

  return {
    simCall,
    calls,
    getState: snapshot
  };
}

describe('crest-cycle', () => {
  it('opens all affordable chests across elements', async () => {
    const game = createFakeCrestGame({
      elementDrops: { fire: 7, water: 3, earth: 2, wood: 0, metal: 0 }
    });
    const events = [];
    const logEvent = (day, run, room, eventType, data) => {
      events.push({ day, run, room, eventType, data });
    };

    const summary = await runCrestCycle(game.simCall, logEvent, { day: 1, run: 1 });

    assert.equal(summary.totalChestsOpened, 3);
    assert.equal(summary.chestsOpenedByElement.fire, 2);
    assert.equal(summary.chestsOpenedByElement.water, 1);
    assert.equal(summary.chestsOpenedByElement.earth, 0);
    assert.equal(summary.dropsAfter.fire, 1);
    assert.equal(summary.dropsAfter.water, 0);
    assert.equal(summary.dropsSpentTotal, 9);

    const openedEvents = events.filter(entry => entry.eventType === 'crest_chest_opened');
    assert.equal(openedEvents.length, 3);
  });

  it('equips highest-value crest per element', async () => {
    const game = createFakeCrestGame({
      crests: [
        { id: 'crest_fire_low', element: 'fire', rarity: 'common', stat: 'attack', value: 0.05 },
        { id: 'crest_fire_high', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.18 },
        { id: 'crest_water_best', element: 'water', rarity: 'rare', stat: 'mp', value: 0.12 }
      ],
      equippedCrests: {
        fire: 'crest_fire_low',
        water: 'crest_water_best',
        earth: null,
        wood: null,
        metal: null
      }
    });
    const events = [];
    const logEvent = (day, run, room, eventType, data) => {
      events.push({ day, run, room, eventType, data });
    };

    const summary = await runCrestCycle(game.simCall, logEvent, { day: 1, run: 2 });
    const finalState = game.getState();

    assert.equal(summary.totalEquipChanges, 1);
    assert.equal(summary.equipsChangedByElement.fire, 1);
    assert.equal(finalState.equippedCrests.fire, 'crest_fire_high');
    assert.equal(finalState.equippedCrests.water, 'crest_water_best');
  });

  it('is a no-op when no chests are affordable and best crests already equipped', async () => {
    const game = createFakeCrestGame({
      elementDrops: { fire: 2, water: 1, earth: 0, wood: 0, metal: 0 },
      crests: [
        { id: 'crest_fire_best', element: 'fire', rarity: 'rare', stat: 'attack', value: 0.15 }
      ],
      equippedCrests: { fire: 'crest_fire_best' }
    });

    const events = [];
    const logEvent = (day, run, room, eventType, data) => {
      events.push({ day, run, room, eventType, data });
    };

    const summary = await runCrestCycle(game.simCall, logEvent, { day: 3, run: 1 });

    assert.equal(summary.totalChestsOpened, 0);
    assert.equal(summary.totalEquipChanges, 0);
    assert.equal(summary.dropsSpentTotal, 0);
    assert.equal(events.some(entry => entry.eventType === 'crest_cycle_error'), false);
  });

  it('fails hard when crest state endpoint fails', async () => {
    const game = createFakeCrestGame({
      failOn: ['GET /api/game/crests']
    });
    const events = [];
    const logEvent = (day, run, room, eventType, data) => {
      events.push({ day, run, room, eventType, data });
    };

    await assert.rejects(
      runCrestCycle(game.simCall, logEvent, { day: 2, run: 2 }),
      /Failed to read crest state/
    );
    assert.equal(events.some(entry => entry.eventType === 'crest_cycle_error'), true);
  });

  it('fails hard when run cannot be normalized to hub', async () => {
    const game = createFakeCrestGame({
      runActive: true,
      failOn: ['POST /api/game/forfeit']
    });
    const events = [];
    const logEvent = (day, run, room, eventType, data) => {
      events.push({ day, run, room, eventType, data });
    };

    await assert.rejects(
      runCrestCycle(game.simCall, logEvent, { day: 4, run: 1 }),
      /Failed to normalize to hub/
    );
    assert.equal(events.some(entry => entry.eventType === 'crest_cycle_error'), true);
  });
});
