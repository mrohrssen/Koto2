async function globalTeardown() {
  const baseURL = 'http://localhost:3000';

  try {
    // Disable debug mode
    await fetch(`${baseURL}/api/game/debug-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });

    // Reset game state
    await fetch(`${baseURL}/api/game/full-reset`, { method: 'POST' });

    console.log('Global teardown complete');
  } catch (e) {
    // Server may have already stopped
    console.log('Teardown: server not reachable (may have stopped)');
  }
}

export default globalTeardown;
