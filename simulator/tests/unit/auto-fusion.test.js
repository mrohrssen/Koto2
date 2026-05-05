import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoFuseAvailableCreatures,
  selectAutoFusionRecipe
} from '../../engine/auto-fusion.js';

function makeSimCall(handlers, calls = []) {
  return async (method, path, body, context) => {
    calls.push({ method, path, body, context });
    const key = `${method} ${path}`;
    const handler = handlers[key];
    if (!handler) return { ok: false, error: `No handler for ${key}` };
    return handler({ method, path, body, context, calls });
  };
}

describe('simulator auto-fusion', () => {
  it('selects an unowned result before an already-owned result', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'owned-first', canFuse: true, resultOwned: 2 },
      { id: 'unowned-second', canFuse: true, resultOwned: 0 },
      { id: 'locked', canFuse: false, resultOwned: 0 }
    ]);

    assert.equal(recipe.id, 'unowned-second');
  });

  it('falls back to response recipe order when all fuseable results are owned', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'first-owned', canFuse: true, resultOwned: 1 },
      { id: 'second-owned', canFuse: true, resultOwned: 4 }
    ]);

    assert.equal(recipe.id, 'first-owned');
  });

  it('treats missing resultOwned as unowned', () => {
    const recipe = selectAutoFusionRecipe([
      { id: 'owned-first', canFuse: true, resultOwned: 1 },
      { id: 'missing-owned-count', canFuse: true }
    ]);

    assert.equal(recipe.id, 'missing-owned-count');
  });

  it('repeats fusion until no recipe can fuse', async () => {
    const calls = [];
    const states = [
      { recipes: [{ id: 'fire-cat', canFuse: true, resultOwned: 0 }] },
      { recipes: [{ id: 'stone-giant', canFuse: true, resultOwned: 0 }] },
      { recipes: [{ id: 'fire-cat', canFuse: false, resultOwned: 1 }] }
    ];
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({ ok: true, data: states.shift() }),
      'POST /api/game/fusion/start': () => ({ ok: true, data: { success: true } })
    }, calls);

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 2,
      stoppedReason: 'no_available_recipe'
    });
    const startCalls = calls.filter(call => call.method === 'POST');
    assert.deepEqual(startCalls.map(call => call.body), [
      { recipeId: 'fire-cat' },
      { recipeId: 'stone-giant' }
    ]);
  });

  it('increments the counter only after successful fusion starts', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({
        ok: true,
        data: { recipes: [{ id: 'fire-cat', canFuse: true, resultOwned: 0 }] }
      }),
      'POST /api/game/fusion/start': () => ({ ok: false, error: 'Not enough fusion cores' })
    });

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 0,
      stoppedReason: 'start_failed'
    });
  });

  it('stops cleanly when fusion state cannot be fetched', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({ ok: false, error: 'server unavailable' })
    });

    const result = await autoFuseAvailableCreatures(simCall);

    assert.deepEqual(result, {
      fusionsPerformed: 0,
      stoppedReason: 'state_failed'
    });
  });

  it('stops at the max fusion cap', async () => {
    const simCall = makeSimCall({
      'GET /api/game/fusion': () => ({
        ok: true,
        data: { recipes: [{ id: 'repeatable', canFuse: true, resultOwned: 1 }] }
      }),
      'POST /api/game/fusion/start': () => ({ ok: true, data: { success: true } })
    });

    const result = await autoFuseAvailableCreatures(simCall, { maxFusions: 3 });

    assert.deepEqual(result, {
      fusionsPerformed: 3,
      stoppedReason: 'max_fusions_reached'
    });
  });
});
