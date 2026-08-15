import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGameStateErrorResponse,
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
