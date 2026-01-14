import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use?.baseURL || 'http://localhost:3000';

  // Wait for server to be ready
  let retries = 30;
  while (retries > 0) {
    try {
      const response = await fetch(`${baseURL}/api/game/state`);
      if (response.ok) break;
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
    retries--;
  }

  if (retries === 0) {
    throw new Error('Server did not start in time');
  }

  // Reset game state
  await fetch(`${baseURL}/api/game/full-reset`, { method: 'POST' });

  // Enable debug mode (disables AI, uses fallback narration for faster tests)
  await fetch(`${baseURL}/api/game/debug-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  });

  console.log('Global setup complete: debug mode enabled, game state reset');
}

export default globalSetup;
