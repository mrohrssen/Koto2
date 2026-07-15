import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureGameStateFetchToken,
  isGameStateErrorResponse,
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
