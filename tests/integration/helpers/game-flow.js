/**
 * Deterministic game-flow helpers for integration tests.
 * Built on real API endpoints — no internal imports.
 */

export async function createReadyPlayer(client) {
  await client.loginAsNewUser();
  const createRes = await client.createPlayer();
  if (createRes.status !== 200) throw new Error('create-player failed');
  return createRes;
}

export async function queueRooms(client, rooms) {
  const res = await client.post('/api/game/debug-queue-rooms', { rooms });
  if (res.status !== 200) throw new Error(`debug-queue-rooms failed: ${JSON.stringify(res.body)}`);
}

export async function clearQueuedRooms(client) {
  await client.post('/api/game/debug-clear-room-queue', {});
}

/**
 * Set up a player with valid starters and start a run, but stop
 * BEFORE selectArea. Caller can queue rooms or enable debug mode,
 * then call finishExplorationSetup().
 */
export async function setupRunBeforeArea(client) {
  await createReadyPlayer(client);
  await client.post('/api/game/select-starter', { starterId: 'starter-fire' });
  await client.post('/api/game/select-starter', { starterId: 'starter-water' });
  await client.post('/api/game/select-starter', { starterId: 'starter-wood' });

  const startRes = await client.post('/api/game/start-run', {});
  if (startRes.status !== 200) throw new Error(`start-run failed: ${JSON.stringify(startRes.body)}`);
  return startRes;
}

/**
 * Select area and confirm creatures. Call after setupRunBeforeArea()
 * and any room queuing / debug setup.
 */
export async function finishExplorationSetup(client) {
  const areaOptions = await client.get('/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  const selectRes = await client.post('/api/game/select-area', { areaId });
  if (selectRes.status !== 200) throw new Error(`select-area failed: ${JSON.stringify(selectRes.body)}`);

  const starterIds = ['hi', 'mizu', 'ki'];
  const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds });
  if (confirmRes.status !== 200) throw new Error(`confirm-creatures failed: ${JSON.stringify(confirmRes.body)}`);
  return confirmRes.body.state;
}

/**
 * Full exploration setup: player + starters + run + area + creatures + initial skill pick.
 * Rooms are generated normally (no debug queue).
 */
export async function startExplorationRun(client) {
  await setupRunBeforeArea(client);
  const state = await finishExplorationSetup(client);

  // Complete the initial skill pick if one is pending
  const offersRes = await client.post('/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body.offered?.length > 0) {
    const skillId = offersRes.body.offered[0].id;
    const chooseRes = await client.post('/api/game/skill-master-choose', { skillId });
    if (chooseRes.status !== 200) throw new Error(`skill-master-choose failed: ${JSON.stringify(chooseRes.body)}`);
  }

  return state;
}
