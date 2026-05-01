import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

function seedSpeedReviewSave(tmpDir, userId) {
  writeFileSync(
    join(tmpDir, `.jrpg-save-${userId}.json`),
    JSON.stringify({
      version: 2,
      player: null,
      meta: {
        lifetimeStats: {
          totalRuns: 0, runsCompleted: 0, runsFailed: 0,
          totalDamageDealt: 0, totalDamageTaken: 0, totalCreditsEarned: 0,
          highestAreasCleared: 0, totalPlayTime: 0,
          firstPlayDate: null, lastPlayDate: null
        },
        unlocks: [],
        achievements: [],
        creatureCollection: ['hi', 'mizu', 'ki'],
        creatureCounts: { hi: 1, mizu: 1, ki: 1 },
        befriendCount: {},
        levels: { highestUnlocked: 1, completed: [], current: null },
        prologueComplete: false,
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
        kanaMode: false,
        pvpTeams: [null, null, null],
        tutorialStep: 7,
        tutorialFireDropsGifted: false,
        itemsDiscovered: []
      },
      run: null,
      combat: null,
      savedAt: new Date().toISOString()
    }, null, 2)
  );
}

/**
 * Boot into exploration and navigate to a speed review room.
 *
 * Uses debug endpoints to set valid creatures, skip the random first room,
 * and force the next room to be a speed review room.
 *
 * Returns the speed review room object from the proceed response.
 */
async function enterSpeedReviewRoom(client, tmpDir) {
  const loginRes = await client.loginAsNewUser();
  const userId = loginRes.body?.user?.id;
  if (!userId) throw new Error(`login failed: ${JSON.stringify(loginRes.body)}`);
  seedSpeedReviewSave(tmpDir, userId);

  const createRes = await client.createPlayer();
  if (createRes.status !== 200) throw new Error(`create-player failed: ${JSON.stringify(createRes.body)}`);

  // Enable debug mode (needed for skip-room, set-collection, force room type)
  await client.post('/api/game/debug-mode', { enabled: true });

  // Set valid creature IDs in the collection
  const setCollRes = await client.post('/api/game/debug-set-collection', {
    creatureIds: ['hi', 'mizu', 'ki'],
    creatureCounts: { hi: 1, mizu: 1, ki: 1 }
  });
  if (setCollRes.status !== 200) throw new Error(`debug-set-collection failed: ${JSON.stringify(setCollRes.body)}`);

  // Start bare run
  const startRes = await client.post('/api/game/start-run', {});
  if (startRes.status !== 200) throw new Error(`start-run failed: ${JSON.stringify(startRes.body)}`);

  // Select first available area
  const areaOptions = await client.get('/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  const selectRes = await client.post('/api/game/select-area', { areaId });
  if (selectRes.status !== 200) throw new Error(`select-area failed: ${JSON.stringify(selectRes.body)}`);

  // Confirm creatures
  const confirmRes = await client.post('/api/game/confirm-creatures', {
    starterIds: ['hi', 'mizu', 'ki']
  });
  if (confirmRes.status !== 200) throw new Error(`confirm-creatures failed: ${JSON.stringify(confirmRes.body)}`);

  // Skip whatever random room landed at index 0
  const skipRes = await client.post('/api/game/debug-skip-room', {});
  if (skipRes.status !== 200) throw new Error(`debug-skip-room failed: ${JSON.stringify(skipRes.body)}`);

  // Proceed to next room, forcing it to be a speed review room
  const proceedRes = await client.post('/api/game/proceed', {
    forceRoomType: 'speedReviewRoom'
  });
  if (proceedRes.status !== 200) throw new Error(`proceed failed: ${JSON.stringify(proceedRes.body)}`);

  // proceedToNextRoom returns { room, roomNumber, totalRooms, actions, narration }
  // and the route wraps it: { room: <that result>, state, narration }
  // so the actual room object is at body.room.room
  const room = proceedRes.body.room?.room ?? proceedRes.body.room;
  if (room?.type !== 'speedReviewRoom') {
    throw new Error(`Expected speedReviewRoom, got ${room?.type}`);
  }
  return room;
}

describe('speed review room flow', () => {
  let client, cleanup, tmpDir;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    tmpDir = testApp.tmpDir;
  });

  afterEach(() => cleanup());

  it('start/complete cycle with empty vocab auto-completes the room', async () => {
    const room = await enterSpeedReviewRoom(client, tmpDir);

    // Start the review — empty vocab from mock -> empty snapshot
    const startRes = await client.post('/api/game/speed-review-room/start', {
      roomId: room.id
    });
    assert.equal(startRes.status, 200, `start failed: ${JSON.stringify(startRes.body)}`);
    assert.equal(startRes.body.roomId, room.id);
    assert.deepEqual(startRes.body.snapshotWords, []);
    assert.equal(startRes.body.targetCards, 10);
    // min(targetCards=10, snapshotWords.length=0) = 0
    assert.equal(startRes.body.requiredCards, 0);
    // With 0 required cards, reviewedCards(0) >= completionTarget(0) -> auto-completed
    assert.equal(startRes.body.completed, true);
    assert.equal(startRes.body.interacted, true);
    // First initialisation, not a reuse
    assert.equal(startRes.body.reusedSnapshot, false);

    // Complete — succeeds on an already-completed room
    const completeRes = await client.post('/api/game/speed-review-room/complete', {
      roomId: room.id
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.completed, true);
    assert.equal(completeRes.body.roomId, room.id);
    // Response includes enriched game state
    assert.ok(completeRes.body.state, 'response should include enriched game state');
  });

  it('progress rejects commits when snapshot is empty', async () => {
    const room = await enterSpeedReviewRoom(client, tmpDir);

    // Start review — empty snapshot, completionTarget = 0
    const startRes = await client.post('/api/game/speed-review-room/start', {
      roomId: room.id
    });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.requiredCards, 0);

    // commitIndex 0 is out of bounds when completionTarget is 0
    const progressRes = await client.post('/api/game/speed-review-room/progress', {
      roomId: room.id,
      word: '単語テスト',
      commitIndex: 0
    });
    // 409 — classified as a transition error by the route handler
    assert.equal(progressRes.status, 409);
    assert.ok(progressRes.body.error.includes('outside snapshot bounds'));
  });

  it('start is idempotent — second call returns reusedSnapshot true', async () => {
    const room = await enterSpeedReviewRoom(client, tmpDir);

    const start1 = await client.post('/api/game/speed-review-room/start', {
      roomId: room.id
    });
    assert.equal(start1.status, 200);
    assert.equal(start1.body.reusedSnapshot, false);

    // Second call — snapshot was already initialised
    const start2 = await client.post('/api/game/speed-review-room/start', {
      roomId: room.id
    });
    assert.equal(start2.status, 200);
    assert.equal(start2.body.reusedSnapshot, true);
    assert.deepEqual(start2.body.snapshotWords, start1.body.snapshotWords);
    assert.equal(start2.body.targetCards, start1.body.targetCards);
  });

  it('endpoints validate required fields with 400 status', async () => {
    await client.loginAsNewUser('validator-user', 'test-pass-456');
    await client.createPlayer('Validator');

    // start: missing roomId
    const r1 = await client.post('/api/game/speed-review-room/start', {});
    assert.equal(r1.status, 400);
    assert.ok(r1.body.error.includes('roomId'));

    // complete: missing roomId
    const r2 = await client.post('/api/game/speed-review-room/complete', {});
    assert.equal(r2.status, 400);
    assert.ok(r2.body.error.includes('roomId'));

    // progress: missing roomId
    const r3 = await client.post('/api/game/speed-review-room/progress', {});
    assert.equal(r3.status, 400);
    assert.ok(r3.body.error.includes('roomId'));

    // progress: has roomId but missing word
    const r4 = await client.post('/api/game/speed-review-room/progress', {
      roomId: 'x', commitIndex: 0
    });
    assert.equal(r4.status, 400);
    assert.ok(r4.body.error.includes('word'));

    // progress: negative commitIndex
    const r5 = await client.post('/api/game/speed-review-room/progress', {
      roomId: 'x', word: '単語', commitIndex: -1
    });
    assert.equal(r5.status, 400);
    assert.ok(r5.body.error.includes('commitIndex'));
  });
});
