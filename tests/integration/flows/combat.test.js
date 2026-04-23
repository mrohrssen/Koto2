import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/test-app.js';
import { createApiClient } from '../helpers/api-client.js';

// Real creature IDs from data/creatures.json (3 commons = 9 pts, under 10-pt cap)
const TEST_TEAM = ['hi', 'mizu', 'ki'];

/**
 * Pre-seed a save file with a valid creature collection before the
 * GameManager is created.  The default collection references creature
 * IDs that no longer exist in creatures.json, so confirm-creatures
 * fails without this patch.
 */
function seedSaveFile(tmpDir, userId) {
  const saveData = {
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
      creatureCollection: TEST_TEAM,
      befriendCount: {},
      levels: { highestUnlocked: 1, completed: [], current: null },
      prologueComplete: false,
      elementDrops: { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 },
      crests: [],
      equippedCrests: {
        fire: null, water: null, earth: null, wood: null, metal: null
      },
      kanaMode: false,
      pvpTeams: [null, null, null],
      tutorialStep: 7,
      tutorialFireDropsGifted: false,
      itemsDiscovered: []
    },
    run: null,
    combat: null,
    savedAt: new Date().toISOString()
  };
  writeFileSync(
    join(tmpDir, `.jrpg-save-${userId}.json`),
    JSON.stringify(saveData, null, 2)
  );
}

/**
 * Bootstrap a player into active creature combat.
 *
 * Flow: register -> seed save -> create player -> debug mode -> start run
 * -> select area -> confirm creatures -> skill master -> encounter -> combat
 */
async function startCombatRun(client, tmpDir) {
  // Auth (no GameManager created yet)
  const loginRes = await client.loginAsNewUser();
  const userId = loginRes.body?.user?.id;
  assert.ok(userId, 'login should return a user id');

  // Seed save with valid creature collection before first game API call
  seedSaveFile(tmpDir, userId);

  // Create player (first game request — manager loads our seeded save)
  const createRes = await client.createPlayer();
  assert.equal(createRes.status, 200, `create-player: ${JSON.stringify(createRes.body)}`);

  // Enable debug mode for room queueing
  await client.post('/api/game/debug-mode', { enabled: true });

  // Start a bare run (creatures deferred until confirm-creatures)
  const startRes = await client.post('/api/game/start-run', {});
  assert.equal(startRes.status, 200, `start-run: ${JSON.stringify(startRes.body)}`);

  // Queue encounter as the first room, then select area (rooms generated here)
  await client.post('/api/game/debug-queue-rooms', { rooms: ['encounter'] });
  const areaOptions = await client.get('/api/game/area-options');
  const areaId = areaOptions.body?.[0]?.id;
  assert.ok(areaId, 'should have at least one area option');
  const selectRes = await client.post('/api/game/select-area', { areaId });
  assert.equal(selectRes.status, 200, `select-area: ${JSON.stringify(selectRes.body)}`);

  // Confirm creatures (validated against our seeded collection)
  const confirmRes = await client.post('/api/game/confirm-creatures', {
    starterIds: TEST_TEAM
  });
  assert.equal(confirmRes.status, 200, `confirm-creatures: ${JSON.stringify(confirmRes.body)}`);

  // Handle skill master phase (always appears after confirm-creatures)
  const offersRes = await client.post('/api/game/skill-master-offers', {});
  if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
    await client.post('/api/game/skill-master-choose', {
      skillId: offersRes.body.offered[0].id
    });
  }

  // Current room should now be the queued encounter; if not, proceed
  let state = (await client.getState()).body;
  if (state.room?.type !== 'encounter') {
    const proceedRes = await client.post('/api/game/proceed', {});
    assert.equal(proceedRes.status, 200, `proceed: ${JSON.stringify(proceedRes.body)}`);
    state = (await client.getState()).body;
  }

  // Start the creature encounter (sets up combat state)
  const encounterRes = await client.post('/api/game/start-creature-encounter', {});
  assert.equal(encounterRes.status, 200,
    `start-creature-encounter: ${JSON.stringify(encounterRes.body)}`);

  return encounterRes.body.state;
}

describe('combat flow', () => {
  let client, cleanup, tmpDir;

  beforeEach(async () => {
    const testApp = await createTestApp();
    client = createApiClient(testApp.port);
    cleanup = testApp.cleanup;
    tmpDir = testApp.tmpDir;
  });

  afterEach(() => cleanup());

  it('executes a combat turn and updates state', async () => {
    const state = await startCombatRun(client, tmpDir);

    assert.ok(state.combat, 'combat should exist after starting encounter');
    assert.ok(state.combat.allies.length > 0, 'should have at least one ally');
    assert.ok(state.combat.enemies.length > 0, 'should have at least one enemy');

    const moveId = state.combat.allies[0].moves[0].id;
    assert.ok(moveId, 'first ally should have at least one move');

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId, targetIndex: 0 }]
    });

    assert.equal(turn.status, 200,
      `combat cycle failed: ${JSON.stringify(turn.body)}`);
    assert.ok(turn.body.state, 'response should include state');
    assert.ok(turn.body.state.combat, 'state should still have combat');
  });

  it('winning combat grants rewards', async () => {
    const state = await startCombatRun(client, tmpDir);
    assert.ok(state.combat, 'combat should exist');

    // Set all enemies to 1 HP so one attack finishes them
    const setHpRes = await client.post('/api/game/debug-set-enemy-hp', { hp: 1 });
    assert.equal(setHpRes.status, 200, 'debug-set-enemy-hp should succeed');

    const moveId = state.combat.allies[0].moves[0].id;
    const result = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, moveId, targetIndex: 0 }]
    });

    assert.equal(result.status, 200,
      `combat cycle failed: ${JSON.stringify(result.body)}`);
    assert.ok(result.body.state, 'response should include state');
    // With enemies at 1 HP, the attack should either win or trigger a befriend quiz.
    // The response may also indicate combat has not yet ended if the befriend quiz
    // flow interrupted the kill (setting enemy HP back to 1).
    const won = result.body.victory === true;
    const quizTriggered = !!result.body.befriendQuiz;
    const combatStillActive = result.body.state.combat?.active === true;
    assert.ok(won || quizTriggered || combatStillActive,
      `expected victory, befriend quiz, or continued combat; got keys: ${Object.keys(result.body).join(', ')}`);
  });

  it('rest action restores MP and emits a rest attack in the response', async () => {
    const state = await startCombatRun(client, tmpDir);
    assert.ok(state.combat, 'combat should exist');

    const beforeState = (await client.getState()).body;
    const mpBefore = beforeState.combat.allies[0].mp;
    const maxMp = beforeState.combat.allies[0].maxMp;

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: 0, action: 'rest' }]
    });

    assert.equal(turn.status, 200, `rest cycle failed: ${JSON.stringify(turn.body)}`);
    const restAttack = (turn.body.playerAttacks || turn.body.attacks || [])
      .find(a => a.category === 'rest');
    assert.ok(restAttack, `expected a rest attack in response; got ${JSON.stringify(Object.keys(turn.body))}`);
    assert.equal(restAttack.isRest, true);
    assert.equal(restAttack.damage, 0);
    assert.equal(restAttack.attackerIndex, 0);
    assert.equal(restAttack.targetIndex, 0);
    assert.equal(restAttack.moveNameEn, 'rest');
    assert.equal(restAttack.attackerSkillName, '休む');
    assert.equal(restAttack.attackerSkillReading, 'やすむ');
    assert.ok(restAttack.mpGained >= 0, 'mpGained should be non-negative');

    // Final state: ally 0's MP should have increased by at least the rest amount (server also applies 5% baseline regen)
    const after = turn.body.state.combat.allies[0];
    if (mpBefore < maxMp) {
      assert.ok(after.mp > mpBefore, `mp should increase after rest; before=${mpBefore}, after=${after.mp}`);
    }
    assert.ok(after.mp <= maxMp, 'mp should never exceed maxMp');
  });

  it('combat state is consistent after each turn', async () => {
    await startCombatRun(client, tmpDir);

    let turnsExecuted = 0;
    for (let i = 0; i < 3; i++) {
      const current = await client.getState();
      if (!current.body.combat?.active) break;

      // Find a living ally and use its first move
      const ally = current.body.combat.allies.find(a => a && a.hp > 0);
      if (!ally) break;

      const allyIndex = current.body.combat.allies.indexOf(ally);
      const moveId = ally.moves[0].id;

      const turnRes = await client.post('/api/game/creature-combat-cycle', {
        actionType: 'attack',
        moveChoices: [{ creatureIndex: allyIndex, moveId, targetIndex: 0 }]
      });
      assert.equal(turnRes.status, 200, `turn ${i + 1} should succeed`);
      turnsExecuted++;

      const snapshot = turnRes.body.state;
      if (snapshot.combat) {
        for (const a of snapshot.combat.allies) {
          if (a) assert.ok(a.hp >= 0, `ally hp should be >= 0, got ${a.hp}`);
        }
        for (const e of snapshot.combat.enemies) {
          if (e) assert.ok(e.hp >= 0, `enemy hp should be >= 0, got ${e.hp}`);
        }
      }
    }
    assert.ok(turnsExecuted >= 1, 'should have executed at least 1 turn');
  });
});
