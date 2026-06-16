import { test, expect } from '@playwright/test';

const DEV_USER = 'devtester';
const DEV_PASS = 'test1234';
const LOCAL_URL = process.env.KOTO_BASE_URL || 'http://localhost:5173';

async function login(page) {
  const loginRes = await page.request.post(`${LOCAL_URL}/api/auth/login`, {
    data: { username: DEV_USER, password: DEV_PASS },
  });
  expect(loginRes.ok(), 'devtester login should succeed').toBeTruthy();
  const loginBody = await loginRes.json();
  expect(loginBody.token, 'login response must include token').toBeTruthy();

  await page.addInitScript(authToken => {
    localStorage.setItem('authToken', authToken);
  }, loginBody.token);
  await page.goto(LOCAL_URL, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => readGameState(page).then(state => state?.phase || ''), {
    timeout: 10000,
  }).not.toEqual('');
}

async function readGameState(page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/api/game/state', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`GET /api/game/state failed with ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  });
}

async function goOfflineForApi(page) {
  await page.route('**/api/game/**', route => route.abort('failed'));
}

async function restoreApi(page) {
  await page.unroute('**/api/game/**');
}

async function tapAndMeasure(page, selector) {
  const started = Date.now();
  await page.locator(selector).first().click();
  await page.waitForTimeout(50);
  return Date.now() - started;
}

test.describe('explore subway runway smoke', () => {
  test('prepared explore rooms acknowledge taps during API outage', async ({ page }) => {
    test.skip(process.env.EXPLORE_SUBWAY_SMOKE !== '1', 'On-demand until explore session cutover is complete');
    await login(page);
    await page.addStyleTag({ path: 'public/dev-safe-area.css' });

    await expect.poll(
      () => readGameState(page).then(state => state?.run?.exploreRunway?.preparedRooms?.length || 0),
      { timeout: 10000 }
    ).toBeGreaterThan(1);

    await goOfflineForApi(page);
    const elapsed = await tapAndMeasure(page, 'button:has-text("進む"), button:has-text("Explore"), button:has-text("Yes")');
    expect(elapsed).toBeLessThan(250);

    const text = await page.locator('body').innerText();
    expect(text).not.toContain('did not save');
    expect(text).not.toContain('Invalid choice');
    expect(await page.locator('#action-area').innerHTML()).not.toEqual('');

    const syncResponse = page.waitForResponse(response => response.url().includes('/api/game/explore/sync'), { timeout: 15000 });
    await restoreApi(page);
    await syncResponse;
  });
});
