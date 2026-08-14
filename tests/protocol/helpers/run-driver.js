import { createExploreSession } from '../../../public/js/ui/explore-session.js';
import { getManager } from '../../../src/game/manager-registry.js';
import { createApiClient } from '../../integration/helpers/api-client.js';
import {
  clearQueuedRooms,
  finishExplorationSetup,
  queueRooms,
  setupRunBeforeArea,
} from '../../integration/helpers/game-flow.js';
import { createTestApp } from '../../integration/helpers/test-app.js';
import { createFaultLink } from './fault-link.js';
import { readProtocolOracle } from './oracle.js';
import { createVirtualScheduler } from './virtual-scheduler.js';

function assertOk(response, operation) {
  if (response?.status !== 200) {
    throw new Error(`${operation} failed: ${JSON.stringify(response?.body)}`);
  }
  return response;
}

export async function createExploreProtocolDriver() {
  const testApp = await createTestApp();
  const client = createApiClient(testApp.port);
  const scheduler = createVirtualScheduler();
  const recorded = [];
  const checkpoints = [];
  const checkpointEffects = [];
  const corrections = [];
  const pauses = [];
  let cleanedUp = false;

  try {
    await setupRunBeforeArea(client);
    assertOk(await client.post('/api/game/tutorial-fusion-complete', {}), 'tutorial-fusion-complete');
    assertOk(await client.post('/api/game/debug-mode', { enabled: true }), 'debug-mode');
    await clearQueuedRooms(client);
    await queueRooms(client, ['friendlyNpc', 'friendlyNpc', 'friendlyNpc']);
    await finishExplorationSetup(client);

    const offers = await client.post('/api/game/skill-master-offers', {});
    if (offers.status === 200 && offers.body.offered?.length > 0) {
      assertOk(await client.post('/api/game/skill-master-choose', {
        skillId: offers.body.offered[0].id,
      }), 'skill-master-choose');
    }

    assertOk(await client.post('/api/game/debug-skip-room', {}), 'debug-skip-room');
    const proceeded = assertOk(await client.post('/api/game/proceed', {}), 'initial proceed');
    const initialState = proceeded.body.state;
    const initialRoom = initialState.run?.currentRoom;
    const initialRunway = initialState.run?.exploreRunway;
    if (initialState.room?.type !== 'friendlyNpc' || !initialRunway) {
      throw new Error(`expected friendlyNpc runway fixture, got ${initialState.room?.type}`);
    }

    const authenticatedUser = client.getAuthenticatedUser();
    if (!authenticatedUser?.id) throw new Error('authenticated test user unavailable');
    const manager = getManager(authenticatedUser.id);
    const initialItemsCollected = manager.run?.runSummary?.itemsCollected ?? 0;
    const link = createFaultLink({ client, scheduler });
    const session = createExploreSession({
      syncRequest: payload => link.request(payload),
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
      onCheckpoint: response => {
        checkpoints.push(response);
        checkpointEffects.push({
          response,
          itemsCollected: manager.run?.runSummary?.itemsCollected ?? 0,
        });
      },
      onCorrection: response => { corrections.push(response); },
      onPause: event => { pauses.push(event); },
    });
    session.adoptRunway(initialRunway);

    function record(kind, payload = {}) {
      const result = session.recordRoomAction(kind, payload);
      recorded.push(result);
      return result;
    }

    function recordFriendlyNpcChoice() {
      const room = session.currentPreparedRoom();
      const item = room?.interactionPayload?.offered?.[0];
      if (!item?.id) throw new Error('friendly NPC fixture has no equipment offer');
      return record('friendlyNpc.choose', {
        itemId: item.id,
        targetCreatureIndex: 0,
      });
    }

    const driver = {
      client,
      link,
      scheduler,
      session,
      record,
      recordFriendlyNpcChoice,
      recordProceed: () => record('proceed', {}),
      flush: () => scheduler.runAll(),
      readOracle: () => readProtocolOracle({
        client,
        manager,
        session,
        recorded,
        checkpoints,
        checkpointEffects,
        corrections,
        pauses,
        link,
        initialRoom,
        initialItemsCollected,
      }),
      async cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        session.reset();
        await testApp.cleanup();
      },
    };
    return driver;
  } catch (error) {
    if (!cleanedUp) {
      cleanedUp = true;
      await testApp.cleanup();
    }
    throw error;
  }
}
