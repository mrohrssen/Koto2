/**
 * Test user authentication helpers for the simulator.
 * These call the Koto game server's real endpoints.
 */

/**
 * Create a test user via the game server's register endpoint.
 * Username format: s-{prefix}-{timestamp36} (max 20 chars)
 */
export async function createTestUser(baseUrl, profileName, adminSecret) {
  const prefix = profileName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const timestamp = Date.now().toString(36);
  const username = `s-${prefix}-${timestamp}`.slice(0, 20);
  const password = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      inviteCode: 'neo-tokyo-friends'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create test user: ${response.status} ${text}`);
  }

  const data = await response.json();
  return {
    userId: data.user?.id ?? data.id,
    username,
    token: data.token
  };
}

/**
 * Seed starting vocabulary for a test user via admin endpoint.
 */
export async function seedStartingVocab(baseUrl, adminSecret, userId, words) {
  const response = await fetch(`${baseUrl}/api/admin/seed-vocab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ userId, words })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to seed vocab: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Clean up a test user via admin endpoint.
 */
export async function cleanupTestUser(baseUrl, adminSecret, userId) {
  const response = await fetch(`${baseUrl}/api/admin/cleanup-sim-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ userId })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to cleanup test user: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Advance time for a test user via admin endpoint.
 */
export async function advanceTime(baseUrl, adminSecret, userId, days) {
  const response = await fetch(`${baseUrl}/api/admin/advance-time`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ userId, days })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to advance time: ${response.status} ${text}`);
  }

  return response.json();
}
