import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createCombatRoutes from '../../../src/routes/game/combat.js';

const originalConsoleLog = console.log;
const originalCombatTiming = process.env.KOTO_COMBAT_TIMING;

function createCombatTimingApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const combat = { active: true, actionCount: 1, cycleCount: 2 };
    req.gameManager = {
      combat,
      combatCycleService: {
        creatureCombatCycle(actionType, moveChoices) {
          assert.equal(actionType, 'defend');
          assert.deepEqual(moveChoices, []);
          combat.actionCount = 2;
          combat.cycleCount = 3;
          return { ok: true, actionType };
        },
      },
    };
    req.saveGame = () => {};
    req.getEnrichedGameState = () => ({ phase: 'combat' });
    next();
  });
  app.use(createCombatRoutes({}));
  return app;
}

describe('combat route timing logs', () => {
  afterEach(() => {
    console.log = originalConsoleLog;
    if (originalCombatTiming === undefined) {
      delete process.env.KOTO_COMBAT_TIMING;
    } else {
      process.env.KOTO_COMBAT_TIMING = originalCombatTiming;
    }
  });

  it('logs server timing for every combat request', async () => {
    const calls = [];
    console.log = (...args) => calls.push(args);
    delete process.env.KOTO_COMBAT_TIMING;

    await request(createCombatTimingApp())
      .post('/creature-combat-cycle')
      .send({ actionType: 'defend' })
      .expect(200);

    const timingLog = calls.find(args => args[0] === '[Combat Timing] server');
    assert.ok(timingLog);
    assert.equal(timingLog[1].actionType, 'defend');
    assert.equal(timingLog[1].statusCode, 200);
    assert.equal(timingLog[1].actionCountBefore, 1);
    assert.equal(timingLog[1].actionCountAfter, 2);
    assert.equal(timingLog[1].cycleCountBefore, 2);
    assert.equal(timingLog[1].cycleCountAfter, 3);
    assert.equal(typeof timingLog[1].resolveMs, 'number');
    assert.equal(typeof timingLog[1].saveMs, 'number');
    assert.equal(typeof timingLog[1].totalMs, 'number');
  });
});
