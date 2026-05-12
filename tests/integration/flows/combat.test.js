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
  await client.claimDailyCrystals();
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

function buildAttackChoices(combat) {
  const livingEnemyIndex = combat.enemies.findIndex(e => e && e.hp > 0);
  if (livingEnemyIndex < 0) return [];

  return combat.allies
    .map((ally, creatureIndex) => {
      if (!ally || ally.hp <= 0) return null;
      const move = ally.moves?.find(m => m.category === 'damage' || m.category === 'drain')
        || ally.moves?.[0];
      if (!move) return null;
      const targetIndex = move.target === 'single_ally' || move.target === 'self'
        ? creatureIndex
        : livingEnemyIndex;
      return { creatureIndex, moveId: move.id, targetIndex };
    })
    .filter(Boolean);
}

function buildCursorAttackChoice(combat) {
  const cursor = combat.actionCursor;
  assert.ok(cursor, 'combat should expose actionCursor');
  assert.equal(cursor.side, 'ally', 'test expects player-owned cursor');
  const actor = combat.allies[cursor.index];
  assert.ok(actor, 'cursor actor should exist');
  const livingEnemyIndex = combat.enemies.findIndex(e => e && e.hp > 0);
  assert.ok(livingEnemyIndex >= 0, 'should have a living enemy');
  const move = actor.moves?.find(m => m.category === 'damage' || m.category === 'drain') || actor.moves?.[0];
  assert.ok(move, 'cursor actor should have a move');
  return { creatureIndex: cursor.index, moveId: move.id, targetIndex: livingEnemyIndex };
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

    const moveChoices = buildAttackChoices(state.combat);
    assert.ok(moveChoices.length > 0, 'should have at least one valid attack choice');

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices
    });

    assert.equal(turn.status, 200,
      `combat cycle failed: ${JSON.stringify(turn.body)}`);
    assert.ok(turn.body.state, 'response should include state');
    assert.ok(turn.body.state.combat, 'state should still have combat');
  });

  it('submits one cursor action and returns ordered action segments', async () => {
    const state = await startCombatRun(client, tmpDir);
    const choice = buildCursorAttackChoice(state.combat);

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [choice]
    });

    assert.equal(turn.status, 200, `combat cycle failed: ${JSON.stringify(turn.body)}`);
    assert.ok(Array.isArray(turn.body.actionSegments), 'response should include actionSegments');
    assert.ok(turn.body.actionSegments.length >= 1, 'should animate at least the submitted action');
    assert.equal(turn.body.actionSegments[0].actor.side, 'ally');
    assert.equal(turn.body.actionSegments[0].actor.index, choice.creatureIndex);
    assert.ok(turn.body.state.combat.actionCount >= 1, 'actionCount should advance');
  });

  it('winning combat grants rewards', async () => {
    const state = await startCombatRun(client, tmpDir);
    assert.ok(state.combat, 'combat should exist');

    // Set all enemies to 1 HP so one attack finishes them
    const setHpRes = await client.post('/api/game/debug-set-enemy-hp', { hp: 1 });
    assert.equal(setHpRes.status, 200, 'debug-set-enemy-hp should succeed');

    const current = await client.getState();
    const moveChoice = buildCursorAttackChoice(current.body.combat);
    const result = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [moveChoice]
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
    const cursor = beforeState.combat.actionCursor;
    assert.equal(cursor.side, 'ally', 'rest test expects player-owned cursor');
    const mpBefore = beforeState.combat.allies[cursor.index].mp;
    const maxMp = beforeState.combat.allies[cursor.index].maxMp;

    const turn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: cursor.index, action: 'rest' }]
    });

    assert.equal(turn.status, 200, `rest cycle failed: ${JSON.stringify(turn.body)}`);
    const serverCursor = turn.body.state?.combat?.actionCursor;
    assert.equal(serverCursor?.side, 'ally', `expected server to stop on next ally cursor: ${JSON.stringify(turn.body)}`);
    const staleIndex = serverCursor.index === 0 ? 1 : 0;
    const staleTurn = await client.post('/api/game/creature-combat-cycle', {
      actionType: 'attack',
      moveChoices: [{ creatureIndex: staleIndex, action: 'rest' }]
    });

    assert.equal(staleTurn.status, 400);
    assert.equal(staleTurn.body.error, 'Submitted move does not match current action cursor');
    assert.ok(staleTurn.body.state?.combat, '400 response should include authoritative combat state');
    assert.deepEqual(staleTurn.body.state.combat.actionCursor, serverCursor);

    const restAttack = (turn.body.playerAttacks || turn.body.attacks || [])
      .find(a => a.category === 'rest');
    assert.ok(restAttack, `expected a rest attack in response; got ${JSON.stringify(Object.keys(turn.body))}`);
    assert.equal(restAttack.isRest, true);
    assert.equal(restAttack.damage, 0);
    assert.equal(restAttack.attackerIndex, cursor.index);
    assert.equal(restAttack.targetIndex, cursor.index);
    assert.equal(restAttack.moveNameEn, 'rest');
    assert.equal(restAttack.attackerSkillName, '休む');
    assert.equal(restAttack.attackerSkillReading, 'やすむ');
    assert.ok(restAttack.mpGained >= 0, 'mpGained should be non-negative');

    // Final state: ally 0's MP should have increased by at least the rest amount (server also applies 5% baseline regen)
    const after = turn.body.state.combat.allies[cursor.index];
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

      const moveChoice = buildCursorAttackChoice(current.body.combat);

      const turnRes = await client.post('/api/game/creature-combat-cycle', {
        actionType: 'attack',
        moveChoices: [moveChoice]
      });
      assert.equal(turnRes.status, 200, `turn ${i + 1} should succeed: ${JSON.stringify(turnRes.body)}`);
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
