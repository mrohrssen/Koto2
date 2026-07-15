import { createCombatState } from '../../game/state.js';
import { createPveOpeningCursor } from '../../game/combat/action-cursor.js';
import { resetStatStages } from '../../game/combat/effects.js';

// Build the local combat state from a runway-prepared combatStart payload,
// exactly shaped like the state after a live /start-creature-encounter (allies,
// enemies, opening action cursor, optimistic head + full pre-committed seed
// chain). Mirrors combat-cycle-service.startCreatureEncounter's combat object so
// the client can run offline turns and the server replay converges.
//
// Shared (node-importable, no DOM) so both public/game.js and the hash-parity
// regression test consume ONE source of truth.
export function buildLocalCombatFromStart(
  combatStart,
  seedChain,
  { allies = null, fallbackAllies = [] } = {},
) {
  const enemies = combatStart.enemies || (combatStart.enemy ? [combatStart.enemy] : []);
  const resolvedAllies = Array.isArray(allies)
    ? allies
    : (combatStart.allies || fallbackAllies);
  const combat = createCombatState(enemies[0] || null);
  combat.allies = resolvedAllies;
  combat.enemies = enemies;
  combat.actionCursor = createPveOpeningCursor({ allies: resolvedAllies, enemies });
  combat.actionCount = 0;
  combat.cycleCount = 0;
  combat.openingResolved = false;
  combat.isCreatureCombat = true;
  combat.isBoss = combatStart.isBoss === true;
  combat.swapPhase = true;
  // Reset stat stages for all combatants at battle start, mirroring the server's
  // startCreatureEncounter (combat-cycle-service.js). Without this, fresh creatures
  // serialize statStages as null while the server serializes {atk:0,def:0,dex:0},
  // forcing a transcript_mismatch correction on turn 1 of every offline-started fight.
  for (const c of [...combat.allies, ...combat.enemies]) {
    if (c) resetStatStages(c);
  }
  combat.optimistic = {
    combatId: combatStart.optimistic?.combatId ?? null,
    stateVersion: combatStart.optimistic?.stateVersion ?? 0,
    nextTurnSeed: combatStart.optimistic?.nextTurnSeed ?? (seedChain?.[0] || null),
    turnSeeds: Array.isArray(seedChain) ? [...seedChain] : [],
    acceptedActionIds: {},
  };
  if (combatStart.npc) {
    combat.npcId = combatStart.npc.id;
    combat.npcData = combatStart.npc;
  }
  return combat;
}
