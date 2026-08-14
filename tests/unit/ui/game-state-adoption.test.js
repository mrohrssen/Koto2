import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureGameStateFetchToken,
  captureExploreRecoveryToken,
  isGameStateErrorResponse,
  isExploreRecoveryCurrent,
  isGameStateFetchCurrent,
} from '../../../public/js/ui/game-state-adoption.js';

test('rejects HTTP error bodies but accepts explicit fresh-account state', () => {
  assert.equal(isGameStateErrorResponse({ error: 'HTTP 500' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'rate_limited' }), true);
  assert.equal(isGameStateErrorResponse({ error: 'forbidden' }), true);
  assert.equal(isGameStateErrorResponse({
    player: null,
    run: null,
    meta: { prologueComplete: false },
    phase: 'no_save',
  }), false);
});

test('a local action or session replacement makes an in-flight GET stale', () => {
  let revision = 7;
  let pending = 0;
  const session = {
    getLocalRevision: () => revision,
    pendingCount: () => pending,
  };
  const token = captureGameStateFetchToken(session);

  revision = 8;
  assert.equal(isGameStateFetchCurrent(token, session), false);

  revision = 7;
  pending = 1;
  assert.equal(isGameStateFetchCurrent(token, session), false);

  pending = 0;
  const replacementSession = { ...session };
  assert.notEqual(replacementSession, session);
  assert.equal(isGameStateFetchCurrent(token, replacementSession), false);
});

test('recovery currentness retains an exact pending log but rejects any replaced state', () => {
  let revision = 7;
  let generation = 4;
  let runwayRevision = 9;
  let epoch = 'ese_recovery_current';
  let entries = [{ seq: 1, actionId: 'action_1' }];
  const session = {
    getLocalRevision: () => revision,
    getGeneration: () => generation,
    getRunwayRevision: () => runwayRevision,
    getSessionEpoch: () => epoch,
    snapshot: () => entries,
  };
  const token = captureExploreRecoveryToken(session);

  assert.equal(isExploreRecoveryCurrent(token, session), true);

  revision += 1;
  assert.equal(isExploreRecoveryCurrent(token, session), false, 'rejects a local revision change');
  revision -= 1;
  generation += 1;
  assert.equal(isExploreRecoveryCurrent(token, session), false, 'rejects a generation change');
  generation -= 1;
  runwayRevision += 1;
  assert.equal(isExploreRecoveryCurrent(token, session), false, 'rejects a runway replacement');
  runwayRevision -= 1;
  epoch = 'ese_replaced';
  assert.equal(isExploreRecoveryCurrent(token, session), false, 'rejects an epoch replacement');
  epoch = 'ese_recovery_current';
  entries = [{ seq: 1, actionId: 'action_replaced' }];
  assert.equal(isExploreRecoveryCurrent(token, session), false, 'rejects a changed pending log');
});
