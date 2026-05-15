import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

let importCounter = 0;

async function loadPlatform(windowValue) {
  if (windowValue === undefined) {
    delete global.window;
  } else {
    global.window = windowValue;
  }

  return import(`../../public/js/platform.js?platform-api-base=${importCounter++}`);
}

afterEach(() => {
  delete global.window;
});

test('browser builds use same-origin API paths', async () => {
  const { PLATFORM, apiUrl } = await loadPlatform(undefined);

  assert.equal(PLATFORM.isNative, false);
  assert.equal(PLATFORM.apiBase, '');
  assert.equal(apiUrl('/api/game/state'), '/api/game/state');
});

test('native dev Railway build uses same-origin API paths', async () => {
  const { PLATFORM, apiUrl } = await loadPlatform({
    Capacitor: {},
    location: { origin: 'https://jrpg-dev.up.railway.app' },
  });

  assert.equal(PLATFORM.isNative, true);
  assert.equal(PLATFORM.apiBase, '');
  assert.equal(apiUrl('/api/game/state'), '/api/game/state');
});

test('native production Railway build uses same-origin API paths', async () => {
  const { PLATFORM, apiUrl } = await loadPlatform({
    Capacitor: {},
    location: { origin: 'https://jrpg-production.up.railway.app' },
  });

  assert.equal(PLATFORM.isNative, true);
  assert.equal(PLATFORM.apiBase, '');
  assert.equal(apiUrl('/api/game/state'), '/api/game/state');
});

test('legacy bundled native builds fall back to production API', async () => {
  const { PLATFORM, apiUrl } = await loadPlatform({
    Capacitor: {},
    location: { origin: 'capacitor://localhost' },
  });

  assert.equal(PLATFORM.isNative, true);
  assert.equal(PLATFORM.apiBase, 'https://jrpg-production.up.railway.app');
  assert.equal(
    apiUrl('/api/game/state'),
    'https://jrpg-production.up.railway.app/api/game/state'
  );
});
