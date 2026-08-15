import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureGameStateFetchFence,
  isGameStateErrorResponse,
} from '../../../public/js/ui/game-state-adoption.js';
import { FenceSuperseded } from '../../../public/js/async-ownership-fence.js';

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

test('a no-session state fetch becomes stale when a successor Explore session appears', async () => {
  let activeSession = null;
  let releaseFetch;
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const capture = captureGameStateFetchFence(null, () => activeSession);
  const request = capture.fence.step('fetch game state', () => fetchGate);

  activeSession = { id: 'successor-session' };
  releaseFetch({ player: { id: 'player_1' } });

  await assert.rejects(request, FenceSuperseded);
});
