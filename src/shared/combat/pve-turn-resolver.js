import { createSeededRng } from '../deterministic-rng.js';
import { createPveTurnSnapshot } from './pve-turn-snapshot.js';
import { tickEffects, resetStatStages } from '../../game/combat/effects.js';
import {
  applyAfterEnemyAttacks,
  applyRoundStartSkills,
} from '../../game/combat/party-skill-engine.js';
import {
  processDefendTurn,
  processEnemyTurn,
  processInterleavedPvERound,
} from './pve-turn-core.js';

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

  return {
    transcript: {
      ...result,
      actionType,
      counterAttacks: result.inlineCounters || [],
      effectEvents,
      roundStartEvents,
      enemyMpRegens: result.enemyMpRegens || [],
      allAlliesDefeated: checkAllDefeated(allies),
      allEnemiesDefeated: result.allEnemiesDefeated || checkAllDefeated(enemies),
      stateSummary: buildStateSummary({ allies, enemies, creatureParty: snapshot.creatureParty }),
    },
    nextCombat: createNextCombat(snapshot, allies, enemies),
  };
}

function createPveTurnInput({ snapshot, moveChoices } = {}) {
  const base = snapshot || {};
  return {
    ...base,
    moveChoices: moveChoices || base.moveChoices || [],
  };
}
