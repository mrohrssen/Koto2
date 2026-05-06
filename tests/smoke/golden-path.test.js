import { test, expect } from '@playwright/test';
import { authenticatePage } from '../visual/helpers/auth.js';
import { getGameState, getPhase } from '../visual/helpers/dom-assertions.js';

/**
 * Golden-path E2E smoke test.
 *
 * Plays through the core game flow in serial:
 *   register -> login -> create player -> start run ->
 *   select area -> confirm creatures
 *
 * This verifies the happy path works end-to-end in a real browser,
 * from auth through to having an active exploration run.
 */

const TEST_TEAM = ['hi', 'mizu', 'ki'];

test.describe.serial('Golden path', () => {
  /** Shared page across serial tests so we maintain browser state */
  let sharedPage;
  let username;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
    });
    sharedPage = await context.newPage();
    username = `golden-${Date.now()}`;
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  test('register and login', async ({ request }) => {
    // Register a new user via the HTTP API
    const registerRes = await request.post('/api/auth/register', {
      data: {
        username,
        password: 'password123',
        inviteCode: 'neo-tokyo-friends',
        aiDataSharingConsent: true
      }
    });
    expect(registerRes.ok()).toBeTruthy();
    const registerBody = await registerRes.json();
    const token = registerBody.token;
    expect(token).toBeTruthy();

    // Seed the token into the browser's localStorage
    await sharedPage.addInitScript((authToken) => {
      localStorage.setItem('authToken', authToken);
    }, token);

    // Navigate to the game
    await sharedPage.goto('/');
    await sharedPage.waitForLoadState('networkidle');

    // Verify the game loaded (should be at no_save phase since no player yet)
    await sharedPage.waitForFunction(
      () => typeof window.__gamePhase === 'function' && window.__gamePhase() !== 'unknown',
      { timeout: 10000 }
    );

    const phase = await getPhase(sharedPage);
    // With auth but no player, the phase should be no_save or hub
    expect(['no_save', 'hub']).toContain(phase);
  });

  test('create player', async () => {
    // Create a player via API call from within the page
    const result = await sharedPage.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/create-player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: 'GoldenPathHero' })
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    expect(result.status).toBe(200);
    expect(result.body?.state).toBeTruthy();

    // Reload so the frontend picks up the player state
    await sharedPage.reload();
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.waitForFunction(
      () => typeof window.__gamePhase === 'function' && window.__gamePhase() !== 'unknown',
      { timeout: 10000 }
    );

    const phase = await getPhase(sharedPage);
    // With a player but no run, should be at hub
    expect(phase).toBe('hub');
  });

  test('start run', async () => {
    const result = await sharedPage.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/start-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    expect(result.status).toBe(200);
    expect(result.body?.state?.run).toBeTruthy();
  });

  test('select area', async () => {
    // Get available areas
    const areaOptions = await sharedPage.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/area-options', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    expect(areaOptions.status).toBe(200);
    expect(areaOptions.body).toBeTruthy();
    const areaId = Array.isArray(areaOptions.body)
      ? areaOptions.body[0]?.id
      : null;
    expect(areaId).toBeTruthy();

    // Select the first area
    const selectResult = await sharedPage.evaluate(async (areaId) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/select-area', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ areaId })
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, areaId);

    expect(selectResult.status).toBe(200);
  });

  test('confirm creatures and reach exploration', async () => {
    // Confirm creatures
    const confirmResult = await sharedPage.evaluate(async (team) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/confirm-creatures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ starterIds: team })
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, TEST_TEAM);

    expect(confirmResult.status).toBe(200);

    // Handle the initial skill master pick if it appears
    const offersResult = await sharedPage.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/skill-master-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });

    if (offersResult.status === 200 && offersResult.body?.offered?.length > 0) {
      await sharedPage.evaluate(async (skillId) => {
        const token = localStorage.getItem('authToken');
        await fetch('/api/game/skill-master-choose', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ skillId })
        });
      }, offersResult.body.offered[0].id);
    }

    // Reload and verify we reached a running exploration state
    await sharedPage.reload();
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.waitForFunction(
      () => typeof window.__gamePhase === 'function' && window.__gamePhase() !== 'unknown',
      { timeout: 10000 }
    );

    const state = await getGameState(sharedPage);
    expect(state).toBeTruthy();
    expect(state.run).toBeTruthy();
    expect(state.run.active).toBeTruthy();
    expect(state.run.currentArea).toBeTruthy();
    expect(state.run.creatureParty?.active?.length).toBeGreaterThan(0);

    const phase = await getPhase(sharedPage);
    // Should be in some exploration-like phase, not combat or no_save
    expect(phase).not.toBe('no_save');
    expect(phase).not.toBe('combat');
  });

});
