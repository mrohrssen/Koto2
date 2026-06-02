import { createSeededRng } from '../deterministic-rng.js';
import { cloneForPveTurn } from './pve-turn-snapshot.js';
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

export function resolvePveTurn(snapshotInput, { actionType = 'attack', seed, rng } = {}) {
  const snapshot = cloneForPveTurn(snapshotInput || {});
  const turnRng = getTurnRng({ rng, seed });
  const allies = snapshot.allies || [];
  const enemies = snapshot.enemies || [];

  if (actionType === 'defend') {
    const defendResult = processDefendTurn(allies);
    const enemyResult = processEnemyTurn(enemies, allies, true, snapshot.itemBuffs || null, turnRng);
    return {
      transcript: {
        actionType,
        attacks: [],
        playerAttacks: [],
        enemyAttacks: enemyResult.attacks || [],
        inlineCounters: [],
        allAlliesDefeated: enemyResult.allAlliesDefeated,
        mpRegens: defendResult.mpRegens || [],
        xpEvents: [],
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
      runPartySkills: snapshot.runPartySkills || [],
      combat: snapshot.combat || {},
      rng: turnRng,
    },
  );

  return {
    transcript: {
      ...result,
      actionType,
    },
    nextCombat: createNextCombat(snapshot, allies, enemies),
  };
}
