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

export async function startExplorationRun(client) {
  await createReadyPlayer(client);
  const startRes = await client.post('/api/game/start-run', {});
  if (startRes.status !== 200) throw new Error(`start-run failed: ${JSON.stringify(startRes.body)}`);

  const areaOptions = await client.get('/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  const selectRes = await client.post('/api/game/select-area', { areaId });
  if (selectRes.status !== 200) throw new Error(`select-area failed: ${JSON.stringify(selectRes.body)}`);

  const collection = await client.get('/api/game/creature-collection');
  const starterIds = (collection.body?.collection || []).slice(0, 3);
  const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds });
  if (confirmRes.status !== 200) throw new Error(`confirm-creatures failed: ${JSON.stringify(confirmRes.body)}`);

  return confirmRes.body.state;
}
