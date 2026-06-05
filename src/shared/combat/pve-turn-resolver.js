import { createSeededRng } from '../deterministic-rng.js';
import { createPveTurnSnapshot } from './pve-turn-snapshot.js';
import { tickEffects, resetStatStages } from '../../game/combat/effects.js';
import {
  applyAfterEnemyAttacks,
  applyEnemySelfSabotage,
  applyRoundStartSkills,
} from '../../game/combat/party-skill-engine.js';
import {
  processDefendTurn,
  processEnemyTurn,
  processInterleavedPvERound,
  pickEnemyMoveChoice,
  pickEnemyTarget,
  resolveNoopActorAction,
  resolveSingleActorAction,
  resolveSyntheticActorAction,
} from './pve-turn-core.js';
import {
  cursorMatchesChoice,
  getNextActionCursor,
} from '../../game/combat/action-cursor.js';

function getTurnRng({ rng, seed } = {}) {
  if (typeof rng === 'function') return rng;
  return createSeededRng(seed || 'pve-turn');
}

function createNextCombat(snapshot, allies, enemies) {
  return {
    ...(snapshot.combat || {}),
    allies,
    enemies,
  };
}

function tickAllEffectsForTurn(allies, enemies) {
  const events = [];
  const appendWithIndex = (creature, side, index) => {
    if (!creature || creature.hp <= 0) return;
    const creatureEvents = tickEffects(creature);
    for (const event of creatureEvents) {
      events.push({ ...event, targetSide: side, targetIndex: index });
    }
  };
  (allies || []).forEach((creature, index) => appendWithIndex(creature, 'ally', index));
  (enemies || []).forEach((creature, index) => appendWithIndex(creature, 'enemy', index));
  return events;
}

function checkAllDefeated(creatures = []) {
  return creatures.length === 0 || creatures.every(creature => !creature || creature.hp <= 0 || creature.befriended);
}

function collectEnemySelfSabotageEvents({ enemyAttacks, enemies, runPartySkills, rng }) {
  const events = [];
  for (const atk of enemyAttacks || []) {
    const sabotage = applyEnemySelfSabotage({
      actingIndex: atk.attackerIndex,
      enemies,
      runPartySkills,
      rng
    });
    if (sabotage) events.push(sabotage);
  }
  return events;
}

function resolveCurrentPveCursorAction({ snapshot, cursor, moveChoice, playbackStart, rng }) {
  const allies = snapshot.allies || [];
  const enemies = snapshot.enemies || [];
  const actor = cursor.side === 'ally'
    ? allies[cursor.index]
    : enemies[cursor.index];
  if (!actor) throw new Error('Action cursor actor not found');

  let choices = [];
  if (cursor.side === 'ally') {
    if (!cursorMatchesChoice(cursor, moveChoice)) {
      throw new Error('Submitted move does not match current action cursor');
    }
    choices = [moveChoice];
  } else {
    const choice = pickEnemyMoveChoice(actor, allies, enemies, rng);
    if (choice) {
      const { move, mode } = choice;
      const targeting = pickEnemyTarget(actor, move, mode, allies, enemies, rng);
      if (targeting) {
        const targetIndex = targeting.targetSide === 'player'
          ? allies.indexOf(targeting.target)
          : enemies.indexOf(targeting.target);
        choices = [{ creatureIndex: cursor.index, moveId: move.id, targetIndex }];
      }
    }
  }

  const result = resolveSingleActorAction({
    actorSide: cursor.side,
    actorIndex: cursor.index,
    allies,
    enemies,
    choices,
    itemBuffs: snapshot.itemBuffs || null,
    creatureParty: snapshot.creatureParty || null,
    metaMults: snapshot.metaMults || null,
    runPartySkills: snapshot.runPartySkills || null,
    combat: snapshot.combat || null,
    playbackStart,
    rng,
  });

  const combat = snapshot.combat || {};
  combat.actionCount = (combat.actionCount || 0) + 1;
  combat.turnCount = combat.actionCount;
  combat.openingResolved = combat.openingResolved || cursor.opening === true;
  combat.actionCursor = getNextActionCursor({
    allies,
    enemies,
    previousCursor: cursor,
  });

  return result;
}

function processKOSwapsForTurn(allies, creatureParty) {
  const koSwaps = [];
  const koRemovals = [];
  if (!creatureParty) return { koSwaps, koRemovals };

  creatureParty.active = allies;
  if (!Array.isArray(creatureParty.reserves)) creatureParty.reserves = [];

  for (let i = 0; i < allies.length; i++) {
    const ally = allies[i];
    if (!ally || ally.hp > 0) continue;
    const deadName = ally.nameEn || ally.name;
    ally.activeEffects = [];
    resetStatStages(ally);
    if (creatureParty.reserves.length > 0) {
      const replacement = creatureParty.reserves.shift();
      resetStatStages(replacement);
      allies[i] = replacement;
      koSwaps.push({ slot: i, replacement: replacement.nameEn });
    } else {
      allies[i] = null;
      koRemovals.push({ slot: i, name: deadName });
    }
  }

  for (let i = allies.length - 1; i >= 0; i--) {
    if (allies[i] === null) allies.splice(i, 1);
  }
  creatureParty.active = allies;

  return { koSwaps, koRemovals };
}

function buildStateSummary({ allies, enemies, creatureParty }) {
  return {
    allies: (allies || []).map(creature => creature ? ({
      id: creature.id,
      hp: creature.hp,
      mp: creature.mp,
      level: creature.level,
      xp: creature.xp,
      attack: creature.attack,
      defense: creature.defense,
      dex: creature.dex,
      statStages: creature.statStages || null,
      activeEffects: creature.activeEffects || [],
    }) : null),
    enemies: (enemies || []).map(creature => creature ? ({
      id: creature.id,
      hp: creature.hp,
      mp: creature.mp,
      statStages: creature.statStages || null,
      activeEffects: creature.activeEffects || [],
      befriended: creature.befriended === true,
    }) : null),
    reserves: (creatureParty?.reserves || []).map(creature => creature ? ({
      id: creature.id,
      hp: creature.hp,
      mp: creature.mp,
      level: creature.level,
      xp: creature.xp,
    }) : null),
  };
}

export function resolvePveCursorTurn(snapshotInput, {
  actionType = 'attack',
  seed,
  rng,
  clone = true,
} = {}) {
  if (actionType !== 'attack') {
    throw new Error(`Unsupported cursor action: ${actionType}`);
  }

  const snapshot = createPveTurnSnapshot(snapshotInput || {}, { clone });
  const turnRng = getTurnRng({ rng, seed });
  const allies = snapshot.allies || [];
  const enemies = snapshot.enemies || [];
  const combat = snapshot.combat || {};
  const cursor = combat.actionCursor;
  if (!cursor) throw new Error('No active action cursor');

  const submittedChoice = snapshot.moveChoices?.[0] || null;
  const actionSegments = [];
  let playbackStart = 0;

  const firstResult = resolveCurrentPveCursorAction({
    snapshot,
    cursor,
    moveChoice: submittedChoice,
    playbackStart,
    rng: turnRng,
  });
  actionSegments.push(...firstResult.actionSegments);
  playbackStart = firstResult.playbackNext || actionSegments.length;

  while (
    combat.active &&
    combat.actionCursor?.side === 'enemy' &&
    !checkAllDefeated(enemies) &&
    !checkAllDefeated(allies)
  ) {
    const enemyResult = resolveCurrentPveCursorAction({
      snapshot,
      cursor: combat.actionCursor,
      moveChoice: null,
      playbackStart,
      rng: turnRng,
    });
    actionSegments.push(...enemyResult.actionSegments);
    playbackStart = enemyResult.playbackNext || playbackStart + enemyResult.actionSegments.length;
  }

  const playerAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'ally' ? segment.attacks : segment.counterAttacks || []
  );
  const enemyAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'enemy' ? segment.attacks : []
  );
  const effectEvents = actionSegments.flatMap(segment => segment.effectEvents || []);
  const mpRegens = actionSegments.flatMap(segment => segment.mpRegens || []);
  const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
  const counterAttacks = actionSegments.flatMap(segment => segment.counterAttacks || []);
  const koResult = processKOSwapsForTurn(allies, snapshot.creatureParty);
  if (snapshot.combat && snapshot.creatureParty?.active) {
    snapshot.combat.allies = snapshot.creatureParty.active;
  }

  return {
    transcript: {
      actionType,
      actionSegments,
      playerAttacks,
      enemyAttacks,
      counterAttacks,
      xpEvents,
      mpRegens,
      effectEvents,
      roundStartEvents: [],
      koSwaps: koResult.koSwaps,
      koRemovals: koResult.koRemovals,
      allAlliesDefeated: checkAllDefeated(allies),
      allEnemiesDefeated: checkAllDefeated(enemies),
      combatEnded: false,
      turnCount: combat.turnCount,
      allies: snapshot.combat?.allies || allies,
      enemies,
      creatureParty: snapshot.creatureParty,
      stateSummary: buildStateSummary({
        allies: snapshot.combat?.allies || allies,
        enemies,
        creatureParty: snapshot.creatureParty,
      }),
    },
    nextCombat: createNextCombat(snapshot, snapshot.combat?.allies || allies, enemies),
  };
}

export function resolveKanjiKombatAnswerTurn(snapshotInput, options = {}) {
  const {
    answerCorrect = snapshotInput?.answerCorrect,
    targetIndex = snapshotInput?.targetIndex ?? 0,
    seed,
    rng,
    clone = true,
  } = options;
  const snapshot = createPveTurnSnapshot(snapshotInput || {}, { clone });
  const turnRng = getTurnRng({ rng, seed });
  const allies = snapshot.allies || [];
  const enemies = snapshot.enemies || [];
  const combat = snapshot.combat || {};
  const cursor = combat.actionCursor;
  if (!cursor) throw new Error('No active action cursor');
  if (cursor.side !== 'ally') throw new Error('Kanji Kombat answers require an ally action cursor');

  const actor = allies[cursor.index];
  const actionSegments = [];
  let playbackStart = 0;
  const firstResult = answerCorrect
    ? resolveSyntheticActorAction({
        actorSide: 'ally',
        actorIndex: cursor.index,
        allies,
        enemies,
        syntheticMove: {
          id: 'kanji-kombat-strike',
          name: 'Kanji Kombat Strike',
          nameEn: 'Kanji Kombat Strike',
          element: actor?.element || 'neutral',
          category: 'damage',
          target: 'single_enemy',
          power: 15,
          mpCost: 0,
        },
        targetIndex,
        itemBuffs: snapshot.itemBuffs || null,
        creatureParty: snapshot.creatureParty || null,
        metaMults: snapshot.metaMults || null,
        playbackStart,
        rng: turnRng,
      })
    : resolveNoopActorAction({
        actorSide: 'ally',
        actorIndex: cursor.index,
        allies,
        enemies,
        playbackStart,
      });

  actionSegments.push(...firstResult.actionSegments);
  playbackStart = firstResult.playbackNext || actionSegments.length;
  combat.actionCount = (combat.actionCount || 0) + 1;
  combat.turnCount = combat.actionCount;
  combat.openingResolved = combat.openingResolved || cursor.opening === true;
  combat.actionCursor = getNextActionCursor({
    allies,
    enemies,
    previousCursor: cursor,
  });

  while (
    combat.active &&
    combat.actionCursor?.side === 'enemy' &&
    !checkAllDefeated(enemies) &&
    !checkAllDefeated(allies)
  ) {
    const enemyResult = resolveCurrentPveCursorAction({
      snapshot,
      cursor: combat.actionCursor,
      moveChoice: null,
      playbackStart,
      rng: turnRng,
    });
    actionSegments.push(...enemyResult.actionSegments);
    playbackStart = enemyResult.playbackNext || playbackStart + enemyResult.actionSegments.length;
  }

  const playerAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'ally' ? segment.attacks : segment.counterAttacks || []
  );
  const enemyAttacks = actionSegments.flatMap(segment =>
    segment.actor.side === 'enemy' ? segment.attacks : []
  );
  const effectEvents = actionSegments.flatMap(segment => segment.effectEvents || []);
  const mpRegens = actionSegments.flatMap(segment => segment.mpRegens || []);
  const xpEvents = actionSegments.flatMap(segment => segment.xpEvents || []);
  const counterAttacks = actionSegments.flatMap(segment => segment.counterAttacks || []);
  const koResult = processKOSwapsForTurn(allies, snapshot.creatureParty);
  if (snapshot.combat && snapshot.creatureParty?.active) {
    snapshot.combat.allies = snapshot.creatureParty.active;
  }

  return {
    transcript: {
      actionType: 'kanjiKombat',
      kanjiAnswerCorrect: answerCorrect === true,
      actionSegments,
      playerAttacks,
      enemyAttacks,
      counterAttacks,
      xpEvents,
      mpRegens,
      effectEvents,
      roundStartEvents: [],
      koSwaps: koResult.koSwaps,
      koRemovals: koResult.koRemovals,
      allAlliesDefeated: checkAllDefeated(allies),
      allEnemiesDefeated: checkAllDefeated(enemies),
      combatEnded: false,
      turnCount: combat.turnCount,
      allies: snapshot.combat?.allies || allies,
      enemies,
      creatureParty: snapshot.creatureParty,
      stateSummary: buildStateSummary({
        allies: snapshot.combat?.allies || allies,
        enemies,
        creatureParty: snapshot.creatureParty,
      }),
    },
    nextCombat: createNextCombat(snapshot, snapshot.combat?.allies || allies, enemies),
  };
}

export function resolvePveTurn(snapshotInput, {
  actionType = 'attack',
  seed,
  rng,
  clone = true,
  awardKillXp = null,
  processKoSwaps = null,
} = {}) {
  if (snapshotInput && typeof snapshotInput === 'object' && Object.prototype.hasOwnProperty.call(snapshotInput, 'snapshot')) {
    const envelope = snapshotInput;
    const resolvedActionType = envelope.actionType || actionType;
    return resolvePveTurn(
      createPveTurnInput(envelope),
      {
        actionType: resolvedActionType,
        seed: envelope.seed ?? seed,
        rng: envelope.rng ?? rng,
        clone: envelope.clone ?? clone,
        awardKillXp: envelope.awardKillXp ?? awardKillXp,
        processKoSwaps: envelope.processKoSwaps ?? processKoSwaps,
      },
    );
  }

  const snapshot = createPveTurnSnapshot(snapshotInput || {}, { clone });
  const turnRng = getTurnRng({ rng, seed });
  const allies = snapshot.allies || [];
  const enemies = snapshot.enemies || [];
  const shouldProcessKoSwaps = processKoSwaps ?? actionType === 'defend';
  const combat = snapshot.combat || {};
  const runPartySkills = snapshot.runPartySkills || [];
  const effectEvents = Array.isArray(snapshot.effectEvents)
    ? snapshot.effectEvents
    : tickAllEffectsForTurn(allies, enemies);
  const roundStartEvents = Array.isArray(snapshot.roundStartEvents)
    ? snapshot.roundStartEvents
    : applyRoundStartSkills({
        allies,
        enemies,
        runPartySkills,
        combat,
        rng: turnRng,
      });

  if (checkAllDefeated(allies) || checkAllDefeated(enemies)) {
    return {
      transcript: {
        actionType,
        attacks: [],
        playerAttacks: [],
        enemyAttacks: [],
        inlineCounters: [],
        counterAttacks: [],
        allAlliesDefeated: checkAllDefeated(allies),
        allEnemiesDefeated: checkAllDefeated(enemies),
        effectEvents,
        roundStartEvents,
        mpRegens: [],
        enemyMpRegens: [],
        xpEvents: [],
        stateSummary: buildStateSummary({ allies, enemies, creatureParty: snapshot.creatureParty }),
      },
      nextCombat: createNextCombat(snapshot, allies, enemies),
    };
  }

  if (actionType === 'defend') {
    const defendResult = processDefendTurn(allies);
    const enemyResult = processEnemyTurn(enemies, allies, true, snapshot.itemBuffs || null, turnRng);
    const sabotageEvents = collectEnemySelfSabotageEvents({
      enemyAttacks: enemyResult.attacks || [],
      enemies,
      runPartySkills,
      rng: turnRng,
    });
    effectEvents.push(...sabotageEvents);
    const counterAttacks = applyAfterEnemyAttacks({
      enemyAttacks: enemyResult.attacks || [],
      allies,
      enemies,
      runPartySkills,
      combat,
      rng: turnRng,
    }) || [];
    const koResult = shouldProcessKoSwaps ? processKOSwapsForTurn(allies, snapshot.creatureParty) : { koSwaps: [], koRemovals: [] };
    return {
      transcript: {
        actionType,
        attacks: [],
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        inlineCounters: [],
        counterAttacks,
        allAlliesDefeated: checkAllDefeated(allies),
        allEnemiesDefeated: checkAllDefeated(enemies),
        mpRegens: defendResult.mpRegens || [],
        enemyMpRegens: enemyResult.enemyMpRegens || [],
        effectEvents,
        roundStartEvents,
        xpEvents: [],
        koSwaps: koResult.koSwaps,
        koRemovals: koResult.koRemovals,
        stateSummary: buildStateSummary({ allies, enemies, creatureParty: snapshot.creatureParty }),
      },
      nextCombat: createNextCombat(snapshot, allies, enemies),
    };
  }

  const result = processInterleavedPvERound(
    allies,
    enemies,
    snapshot.moveChoices || [],
    {
      itemBuffs: snapshot.itemBuffs || null,
      creatureParty: snapshot.creatureParty || null,
      metaMults: snapshot.metaMults || null,
      runPartySkills,
      combat,
      rng: turnRng,
      awardKillXp,
    },
  );
  if (Array.isArray(result.effectEvents) && result.effectEvents.length > 0) {
    effectEvents.push(...result.effectEvents);
  }
  const koResult = shouldProcessKoSwaps
    ? processKOSwapsForTurn(allies, snapshot.creatureParty)
    : { koSwaps: [], koRemovals: [] };
  const koTranscript = shouldProcessKoSwaps
    ? { koSwaps: koResult.koSwaps, koRemovals: koResult.koRemovals }
    : {};
  if (snapshot.combat && snapshot.creatureParty?.active) {
    snapshot.combat.allies = snapshot.creatureParty.active;
  }

  return {
    transcript: {
      ...result,
      actionType,
      counterAttacks: result.inlineCounters || [],
      effectEvents,
      roundStartEvents,
      enemyMpRegens: result.enemyMpRegens || [],
      ...koTranscript,
      allAlliesDefeated: checkAllDefeated(allies),
      allEnemiesDefeated: result.allEnemiesDefeated || checkAllDefeated(enemies),
      stateSummary: buildStateSummary({ allies, enemies, creatureParty: snapshot.creatureParty }),
    },
    nextCombat: createNextCombat(snapshot, snapshot.combat?.allies || allies, enemies),
  };
}

function createPveTurnInput({ snapshot, moveChoices } = {}) {
  const base = snapshot || {};
  return {
    ...base,
    moveChoices: moveChoices || base.moveChoices || [],
  };
}
