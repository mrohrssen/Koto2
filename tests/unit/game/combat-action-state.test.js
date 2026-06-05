import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState } from '../../../src/game/state.js';
import { instantiateCreature } from '../../../src/game/creatures.js';
import { GameManager } from '../../../src/game/loop.js';
import { CombatCycleService } from '../../../src/game/services/combat-cycle-service.js';
import { buildActionEnvelope } from '../../../src/shared/action-protocol.js';
import {
  resolvePveCursorTurn,
  resolvePveTurn,
} from '../../../src/shared/combat/pve-turn-resolver.js';
import { buildOptimisticCombatTurn } from '../../../public/js/ui/optimistic-combat-turn.js';

describe('combat action state', () => {
  it('initializes action cursor fields', () => {
    const combat = createCombatState({ id: 'enemy', hp: 10, maxHp: 10 });

    assert.equal(combat.actionCursor, null);
    assert.equal(combat.actionCount, 0);
    assert.equal(combat.cycleCount, 0);
    assert.equal(combat.openingResolved, false);
    assert.equal(combat.optimistic, null);
  });

  it('exposes optimistic metadata in game state for browser combat prediction', () => {
    const gm = new GameManager();
    const ally = instantiateCreature('hi');
    const enemy = instantiateCreature('mizu');
    gm.run = {
      active: true,
      rooms: [{ type: 'combat' }],
      currentRoom: 0,
      creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
      partySkills: [],
      itemBuffs: null,
    };
    gm.combat = createCombatState(enemy);
    gm.combat.allies = [ally];
    gm.combat.enemies = [enemy];
    gm.combat.optimistic = {
      combatId: 'cmb_visible',
      stateVersion: 2,
      nextTurnSeed: 'seed_visible',
      acceptedActionIds: { act_done: { status: 'accepted' } },
    };

    const state = gm.getState();

    assert.deepEqual(state.combat.optimistic, {
      combatId: 'cmb_visible',
      stateVersion: 2,
      nextTurnSeed: 'seed_visible',
    });
  });

  it('accepts matching optimistic combat prediction and advances seed/version', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = service.previewCreatureCombatCycle({ actionType: 'attack', moveChoices, seed });

    const result = service.verifyAndCommitCreatureCombatCycle({
      actionId: 'act_test_1',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { moveChoices },
      predictedHash: predicted.predictedHash,
    });

    assert.equal(result.status, 'accepted');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
    assert.notEqual(gm.combat.optimistic.nextTurnSeed, seed);
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
  });

  it('accepts browser shared-core optimistic combat predictions when explicitly requested', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_core',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
  });

  it('accepts browser shared-core optimistic predictions for PvE action-cursor attacks', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveCursorTurn(
      { combat: gm.combat, run: gm.run, moveChoices },
      { actionType: 'attack', seed },
    );
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_cursor',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });
    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.actionSegments, predicted.transcript.actionSegments);
    assert.equal(result.actionSegments[0].actor.side, 'ally');
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
    assert.equal(gm.combat.actionCursor.side, 'ally');
  });

  it('accepts browser action-cursor predictions when committed Exp Master XP is server-owned', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.run.partySkills = [{ id: 'expMaster', level: 4 }];
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    gm.combat.isBoss = true;
    gm.combat.enemies[0].level = 5;
    gm.combat.enemies[0].hp = 1;
    const service = new CombatCycleService(gm);
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = buildOptimisticCombatTurn({
      state: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      actionId: 'act_browser_cursor_exp',
    });

    const result = service.verifyAndCommitCreatureCombatCycle(predicted.envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.xpEvents[0].xpGrants[0].xp, 500);
  });

  it('accepts browser shared-core optimistic predictions for NPC PvE action-cursor attacks', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    gm.combat.npcId = 'kodomo';
    gm.combat.npcData = { id: 'kodomo', nameEn: 'Child' };
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveCursorTurn(
      { combat: gm.combat, run: gm.run, moveChoices },
      { actionType: 'attack', seed },
    );
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_npc_cursor',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.deepEqual(result.actionSegments, predicted.transcript.actionSegments);
    assert.equal(result.stateVersion, stateVersion + 1);
    assert.equal(result.nextSeed, gm.combat.optimistic.nextTurnSeed);
  });

  it('accepts browser shared-core optimistic defend predictions when action cursor is active', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'defend',
      moveChoices: [],
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_cursor_defend',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.defend',
      payload: { actionType: 'defend', moveChoices: [], predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.actionType, 'defend');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
  });

  it('resolves befriend turns with the injected action rng', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.isBoss = false;
    const service = new CombatCycleService(gm);

    const result = service.creatureCombatCycle('befriend', [], { rng: () => 0.99 });

    assert.equal(result.actionType, 'befriend');
    assert.equal(result.combatEnded, false);
  });

  it('accepts shared-core predictions with visual-safe KO feedback and commits', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.enemies[0].hp = 1;
    const secondEnemy = instantiateCreature('mizu');
    secondEnemy.moves = gm.combat.enemies[0].moves;
    secondEnemy.hp = secondEnemy.maxHp = 100;
    secondEnemy.mp = secondEnemy.maxMp = 100;
    gm.combat.enemies.push(secondEnemy);
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const hpBefore = gm.combat.enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_ko',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.playerAttacks[0].targetDefeated, true);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
    assert.notEqual(gm.combat.enemies[0].hp, hpBefore);
  });

  it('accepts action-cursor predictions with visual-safe terminal KO feedback and commits', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.actionCursor = { side: 'ally', index: 0, opening: false };
    gm.combat.enemies[0].hp = 1;
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const hpBefore = gm.combat.enemies[0].hp;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveCursorTurn(
      { combat: gm.combat, run: gm.run, moveChoices },
      { actionType: 'attack', seed },
    );
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_cursor_ko',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'accepted');
    assert.equal(result.combatEnded, true);
    assert.equal(result.victory, true);
    assert.equal(result.actionSegments[0].attacks[0].targetDefeated, true);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
    assert.notEqual(gm.combat.enemies[0].hp, hpBefore);
  });

  it('rejects befriend-eligible terminal shared-core attacks before committing', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    gm.combat.isBoss = false;
    gm.combat.enemies[0].hp = 1;
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const enemyHpBefore = gm.combat.enemies[0].hp;
    const nextTurnSeedBefore = gm.combat.optimistic.nextTurnSeed;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_befriend_terminal',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'server_only_feedback_unsupported');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion);
    assert.equal(gm.combat.optimistic.nextTurnSeed, nextTurnSeedBefore);
    assert.equal(gm.combat.enemies[0].hp, enemyHpBefore);
    assert.equal(gm.combat.befriendQuiz, undefined);
  });

  it('rejects shared-core predictions with unsafe KO swap feedback without committing', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const reserve = instantiateCreature('kaze');
    reserve.hp = reserve.maxHp = 100;
    reserve.mp = reserve.maxMp = 100;
    gm.run.creatureParty.reserves = [reserve];
    gm.combat.allies[0].hp = 1;
    gm.combat.enemies[0].attack = 200;
    gm.combat.enemies[0].moves = [{
      id: 'slam',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 200,
      mpCost: 0,
      accuracy: 100,
      statusEffect: null,
      statusChance: 0,
      statusDuration: 0,
    }];
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const hpBefore = gm.combat.allies[0].hp;
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'defend',
      moveChoices: [],
      seed,
      processKoSwaps: true,
    });
    assert.ok(predicted.transcript.koSwaps?.length > 0);
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_ko_swap',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.defend',
      payload: { actionType: 'defend', moveChoices: [], predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'server_only_feedback_unsupported');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion);
    assert.equal(gm.combat.allies[0].hp, hpBefore);
  });

  it('rejects attack-turn shared-core predictions with unsafe KO swap feedback before committing', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const activeBefore = gm.run.creatureParty.active[0];
    const reserve = instantiateCreature('kaze');
    reserve.hp = reserve.maxHp = 100;
    reserve.mp = reserve.maxMp = 100;
    gm.run.creatureParty.reserves = [reserve];
    gm.combat.allies[0].hp = 1;
    gm.combat.enemies[0].attack = 200;
    gm.combat.enemies[0].moves = [{
      id: 'slam',
      name: '打つ',
      nameEn: 'Hit',
      reading: 'うつ',
      element: 'neutral',
      category: 'damage',
      target: 'single_enemy',
      power: 200,
      mpCost: 0,
      accuracy: 100,
      statusEffect: null,
      statusChance: 0,
      statusDuration: 0,
    }];
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const nextTurnSeedBefore = gm.combat.optimistic.nextTurnSeed;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_attack_ko_swap',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'server_only_feedback_unsupported');
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion);
    assert.equal(gm.combat.optimistic.nextTurnSeed, nextTurnSeedBefore);
    assert.equal(gm.run.creatureParty.active[0], activeBefore);
    assert.deepEqual(gm.run.creatureParty.reserves, [reserve]);
    assert.equal(gm.combat.allies[0], activeBefore);
    assert.equal(gm.combat.allies[0].hp, 1);
  });

  it('rejects shared-core optimistic combat hash mismatches before committing', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const nextTurnSeed = gm.combat.optimistic.nextTurnSeed;
    const enemyHpBefore = gm.combat.enemies[0].hp;
    const combatEnemyHpBefore = gm.combat.enemy.hp;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = resolvePveTurn({
      snapshot: { combat: gm.combat, run: gm.run },
      actionType: 'attack',
      moveChoices,
      seed,
      processKoSwaps: true,
    });
    const envelope = buildActionEnvelope({
      actionId: 'act_browser_bad_hash',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'combat.attack',
      payload: { actionType: 'attack', moveChoices, predictionMode: 'shared-pve-turn-v1' },
      predictedTranscript: predicted.transcript,
    });
    envelope.predictedHash = 'intentionally-incorrect';

    const result = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'transcript_mismatch');
    assert.equal(result.stateVersion, stateVersion);
    assert.equal(result.nextSeed, nextTurnSeed);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion);
    assert.equal(gm.combat.optimistic.nextTurnSeed, nextTurnSeed);
    assert.equal(gm.combat.enemies[0].hp, enemyHpBefore);
    assert.equal(gm.combat.enemy.hp, combatEnemyHpBefore);
    assert.equal(result.authoritativeState, null);
    assert.deepEqual(result.authoritativeTranscript, predicted.transcript);
  });

  it('returns corrected state when optimistic combat hash mismatches', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;

    const result = service.verifyAndCommitCreatureCombatCycle({
      actionId: 'act_bad_hash',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'attack',
      payload: { moveChoices: [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }] },
      predictedHash: 'incorrect',
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'transcript_mismatch');
    assert.ok(result.authoritativeTranscript);
    assert.equal(result.authoritativeState, null);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
  });

  it('rejects stale optimistic combat envelopes without committing a turn', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const hpBefore = gm.combat.enemies[0].hp;

    const result = service.verifyAndCommitCreatureCombatCycle({
      actionId: 'act_stale',
      combatId: gm.combat.optimistic.combatId,
      stateVersion: 99,
      seed,
      actionType: 'attack',
      payload: { moveChoices: [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }] },
      predictedHash: 'irrelevant',
    });

    assert.equal(result.status, 'corrected');
    assert.equal(result.reason, 'state_version_mismatch');
    assert.equal(gm.combat.optimistic.stateVersion, 0);
    assert.equal(gm.combat.enemies[0].hp, hpBefore);
  });

  it('returns the same optimistic response for duplicate action ids', () => {
    const gm = createTestGameManagerWithCreatureCombat();
    const service = new CombatCycleService(gm);
    const seed = gm.combat.optimistic.nextTurnSeed;
    const stateVersion = gm.combat.optimistic.stateVersion;
    const moveChoices = [{ creatureIndex: 0, moveId: gm.combat.allies[0].moves[0].id, targetIndex: 0 }];
    const predicted = service.previewCreatureCombatCycle({ actionType: 'attack', moveChoices, seed });

    const envelope = {
      actionId: 'act_duplicate',
      combatId: gm.combat.optimistic.combatId,
      stateVersion,
      seed,
      actionType: 'attack',
      payload: { moveChoices },
      predictedHash: predicted.predictedHash,
    };
    const first = service.verifyAndCommitCreatureCombatCycle(envelope);
    const hpAfterFirst = gm.combat.enemies[0].hp;
    const second = service.verifyAndCommitCreatureCombatCycle(envelope);

    assert.deepEqual(second, first);
    assert.equal(gm.combat.enemies[0].hp, hpAfterFirst);
    assert.equal(gm.combat.optimistic.stateVersion, stateVersion + 1);
  });
});

function createTestGameManagerWithCreatureCombat() {
  const weakMove = {
    id: 'poke',
    name: '突く',
    nameEn: 'Poke',
    reading: 'つく',
    element: 'neutral',
    category: 'damage',
    target: 'single_enemy',
    power: 1,
    mpCost: 0,
    accuracy: 100,
    statusEffect: null,
    statusChance: 0,
    statusDuration: 0,
  };
  const ally = instantiateCreature('hi');
  ally.moves = [weakMove];
  ally.hp = ally.maxHp = 100;
  ally.mp = ally.maxMp = 100;
  const enemy = instantiateCreature('mizu');
  enemy.moves = [weakMove];
  enemy.hp = enemy.maxHp = 100;
  enemy.mp = enemy.maxMp = 100;
  const combat = createCombatState(enemy);
  combat.allies = [ally];
  combat.enemies = [enemy];
  combat.isCreatureCombat = true;
  combat.isBoss = true;
  combat.optimistic = {
    combatId: 'cmb_test',
    stateVersion: 0,
    nextTurnSeed: 'seed_1',
    acceptedActionIds: {},
  };

  return {
    combat,
    run: {
      active: true,
      player: { credits: 0 },
      creatureParty: { active: [ally], reserves: [], maxTotal: 6, pendingCaptures: [] },
      partySkills: [],
      itemBuffs: {
        attackMult: 1,
        hpMult: 1,
        elementEdge: 0,
        flatDamageReduction: 0,
        xpMultiplier: 1,
        xpBalanceStacks: 0,
        baseAttackBonus: 0,
        baseHpBonus: 0,
        baseMpBonus: 0,
      },
      crestMults: { hpMult: 1, atkMult: 1, mpMult: 1, defMult: 1, xpMult: 1 },
      rooms: [],
      currentRoom: 0,
      runSummary: {},
    },
    meta: null,
    userId: null,
    emitState() {},
    narrate() {},
  };
}
