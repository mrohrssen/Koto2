import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';
import { loadDialoguePools } from '../../../src/game/dialogue-loader.js';

const TEST_TEAM = ['hi', 'mizu', 'ki'];

function seedSaveFile(tmpDir, userId, metaOverrides = {}) {
  writeFileSync(
    join(tmpDir, `.jrpg-save-${userId}.json`),
    JSON.stringify({
      version: 2, player: null,
      meta: {
        lifetimeStats: {
          totalRuns: 0, runsCompleted: 0, runsFailed: 0,
          totalDamageDealt: 0, totalDamageTaken: 0, totalCreditsEarned: 0,
          highestAreasCleared: 0, totalPlayTime: 0,
          firstPlayDate: null, lastPlayDate: null
        },
        unlocks: [], achievements: [],
        creatureCollection: TEST_TEAM, befriendCount: {},
        levels: { highestUnlocked: 1, completed: [], current: null },
        prologueComplete: true,
        elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
        crests: [],
        equippedCrests: { fire: null, water: null, earth: null, wood: null, metal: null },
        kanaMode: false, pvpTeams: [null, null, null],
        seenCidScripts: [], npcBonds: {},
        tutorialStep: 7, tutorialFireDropsGifted: false, itemsDiscovered: [],
        ...metaOverrides
      },
      run: null, combat: null, savedAt: new Date().toISOString()
    }, null, 2)
  );
}

async function setupAndEnterCombat(client, tmpDir) {
  const loginRes = await client.loginAsNewUser();
  const userId = loginRes.body?.user?.id;
  seedSaveFile(tmpDir, userId);
  await client.createPlayer();
  await client.post('/api/game/debug-mode', { enabled: true });
  await client.claimDailyCrystals();
  await client.post('/api/game/start-run', {});

  const areaOptions = await client.get('/api/game/area-options');
  await client.post('/api/game/select-area', { areaId: areaOptions.body[0].id });
  await client.post('/api/game/confirm-creatures', { starterIds: TEST_TEAM });

  const offersRes = await client.post('/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
    await client.post('/api/game/skill-master-choose', {
      skillId: offersRes.body.offered[0].id
    });
  }

  // Navigate to first encounter room (may need to skip non-encounter rooms)
  await navigateToEncounterRoom(client);

  const enc = await client.post('/api/game/start-creature-encounter', {});
  assert.equal(enc.status, 200, `start-encounter failed: ${JSON.stringify(enc.body)}`);
  return enc.body.state;
}

/**
 * Walk forward through rooms until we land on an uninteracted encounter room.
 * Non-encounter rooms can be skipped by proceeding with forceRoomType.
 */
async function navigateToEncounterRoom(client) {
  for (let step = 0; step < 15; step++) {
    const stateRes = await client.getState();
    const phase = stateRes.body?.phase;

    if (phase === 'room_encounter') return;

    // At a room that isn't an encounter - proceed, forcing next room to encounter
    if (phase === 'room' || phase === 'exploring' || phase === 'friendlyNpc') {
      await client.post('/api/game/proceed', { forceRoomType: 'encounter' });
      continue;
    }

    // Skill master phase - pick a skill
    if (phase === 'skillMaster') {
      const offers = await client.post('/api/game/skill-master-offers', {});
      if (offers.status === 200 && offers.body?.offered?.length > 0) {
        await client.post('/api/game/skill-master-choose', {
          skillId: offers.body.offered[0].id
        });
      }
      continue;
    }

    break; // Unexpected phase
  }
}

/**
 * Win a single combat by setting enemy HP to 1 once, then looping attacks.
 * Sets HP only once at the start to avoid reviving already-dead enemies.
 * Handles befriend quiz interruptions and multiple enemies.
 */
async function winCombat(client) {
  // Set all enemy HP to 1 exactly once (debug-set-enemy-hp sets ALL enemies,
  // including dead ones, so calling it each round would revive killed enemies)
  await client.post('/api/game/debug-set-enemy-hp', { hp: 1 });

  for (let round = 0; round < 10; round++) {
    const stateRes = await client.getState();
    if (!stateRes.body?.combat?.active) return { combatEnded: true, victory: true };

    const combat = stateRes.body.combat;
    const cursor = combat.actionCursor;
    assert.ok(cursor, 'combat should expose actionCursor');
    assert.equal(cursor.side, 'ally', `combat round ${round} expected ally cursor`);
    const ally = combat.allies[cursor.index];
    if (!ally) return { combatEnded: true };
    const targetIdx = combat.enemies.findIndex(e => e && e.hp > 0);
    if (targetIdx < 0) return { combatEnded: true, victory: true };

    const result = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: cursor.index, moveId: ally.moves[0].id, targetIndex: targetIdx }]
    });
    assert.equal(result.status, 200, `combat round ${round} failed: ${JSON.stringify(result.body)}`);

    if (result.body.befriendQuizTriggered) {
      const quizRes = await client.post('/api/game/befriend-quiz-answer', { action: 'fight' });
      assert.equal(quizRes.status, 200, `quiz fight failed: ${JSON.stringify(quizRes.body)}`);
      if (quizRes.body?.combatEnded) return quizRes.body;
      const postQuiz = await client.getState();
      if (!postQuiz.body?.combat?.active) return { combatEnded: true, victory: true };
      continue;
    }

    if (result.body.combatEnded) return result.body;
  }
  throw new Error('Combat did not end within 10 rounds');
}

describe('meta-progression after combat', () => {
  let client, cleanup, tmpDir;

  before(() => {
    // Load dialogue data so the befriend quiz (25% chance on kill) does not crash.
    // Without this, getBefriendFrames() returns {} and selectBestFrame crashes.
    loadDialoguePools(join(process.cwd(), 'data'));
  });

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    tmpDir = testApp.tmpDir;
  });

  afterEach(() => cleanup());

  it('rejects starter selection for discovered creatures with zero owned copies', async () => {
    const loginRes = await client.loginAsNewUser();
    const userId = loginRes.body?.user?.id;
    seedSaveFile(tmpDir, userId, {
      creatureCounts: { hi: 1, mizu: 0, ki: 1 }
    });
    await client.createPlayer();
    await client.post('/api/game/debug-mode', { enabled: true });
    await client.claimDailyCrystals();
    await client.post('/api/game/start-run', {});

    const areaOptions = await client.get('/api/game/area-options');
    await client.post('/api/game/select-area', { areaId: areaOptions.body[0].id });
    const confirmRes = await client.post('/api/game/confirm-creatures', { starterIds: ['mizu'] });

    assert.equal(confirmRes.status, 400);
    assert.match(confirmRes.body?.error || '', /mizu has no owned copies/);
  });

  it('meta state persists after combat victory', async () => {
    const combatState = await setupAndEnterCombat(client, tmpDir);
    const preXp = combatState.combat.allies.reduce((s, a) => s + (a.xp || 0), 0);
    const preLevels = combatState.combat.allies.reduce((s, a) => s + (a.level || 1), 0);

    const result = await winCombat(client);
    assert.ok(result.combatEnded, 'combat should end');

    const post = await client.getState();
    assert.equal(post.status, 200);
    assert.ok(post.body.run, 'run should persist after victory');
    assert.ok(post.body.meta, 'meta should persist');
    assert.ok(post.body.meta.lifetimeStats, 'lifetimeStats should exist');
    assert.ok(post.body.meta.elementDrops, 'elementDrops should exist');

    // Verify XP/level progression
    const postAllies = post.body.run?.creatureParty?.active || [];
    const postXp = postAllies.reduce((s, a) => s + (a.xp || 0), 0);
    const postLevels = postAllies.reduce((s, a) => s + (a.level || 1), 0);
    assert.ok(postXp > preXp || postLevels > preLevels,
      `party should gain XP (${preXp}->${postXp}) or levels (${preLevels}->${postLevels})`);

    // Verify encounter counter incremented
    assert.ok(post.body.run.currentAreaEncounters >= 1,
      'currentAreaEncounters should be at least 1');
  });

  it('repeated victories accumulate progression', async () => {
    await setupAndEnterCombat(client, tmpDir);

    // Win first combat
    const result1 = await winCombat(client);
    assert.ok(result1.combatEnded, 'first combat should end');

    const afterFirst = await client.getState();
    assert.equal(afterFirst.status, 200);
    const firstEncounters = afterFirst.body.run?.currentAreaEncounters ?? 0;
    const firstCredits = afterFirst.body.run?.player?.credits
      ?? afterFirst.body.player?.credits ?? 0;
    const firstXp = (afterFirst.body.run?.creatureParty?.active || [])
      .reduce((s, a) => s + (a.xp || 0), 0);
    const firstLevels = (afterFirst.body.run?.creatureParty?.active || [])
      .reduce((s, a) => s + (a.level || 1), 0);

    assert.ok(firstEncounters >= 1, 'first encounter should be recorded');

    // Skip post-combat shop if active
    const midState = await client.getState();
    if (midState.body?.phase === 'post_combat_shop') {
      await client.post('/api/game/shop-skip', {});
    }

    // Navigate to next encounter and start it
    await navigateToEncounterRoom(client);
    const enc2 = await client.post('/api/game/start-creature-encounter', {});
    assert.equal(enc2.status, 200, `second encounter failed: ${JSON.stringify(enc2.body)}`);

    // Win second combat
    const result2 = await winCombat(client);
    assert.ok(result2.combatEnded, 'second combat should end');

    const afterSecond = await client.getState();
    assert.equal(afterSecond.status, 200);
    const secondEncounters = afterSecond.body.run?.currentAreaEncounters ?? 0;
    const secondCredits = afterSecond.body.run?.player?.credits
      ?? afterSecond.body.player?.credits ?? 0;
    const secondXp = (afterSecond.body.run?.creatureParty?.active || [])
      .reduce((s, a) => s + (a.xp || 0), 0);
    const secondLevels = (afterSecond.body.run?.creatureParty?.active || [])
      .reduce((s, a) => s + (a.level || 1), 0);

    // Verify encounters accumulated
    assert.ok(secondEncounters > firstEncounters,
      `encounters should accumulate (${firstEncounters} -> ${secondEncounters})`);

    // Verify credits did not decrease
    assert.ok(secondCredits >= firstCredits,
      `credits should not decrease (${firstCredits} -> ${secondCredits})`);

    // Verify XP or levels accumulated
    assert.ok(secondXp > firstXp || secondLevels > firstLevels,
      `XP or levels should accumulate (xp: ${firstXp}->${secondXp}, levels: ${firstLevels}->${secondLevels})`);

    // Verify meta structure intact after multiple combats
    const meta = afterSecond.body.meta;
    assert.ok(meta, 'meta should exist after repeated combats');
    assert.ok(meta.elementDrops, 'elementDrops should persist');
    assert.ok(meta.lifetimeStats, 'lifetimeStats should persist');
  });
});
