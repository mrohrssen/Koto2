import {
  getPostCombatRecoveryMultiplier,
  syncPartySkillHpBonuses,
} from './party-skills.js';
import { applyHeal, resetStatStages } from './combat/effects.js';

export const ROOM_ENTRY_HEAL_PERCENT = 0.05;

export function applyRoomEntryPartyRecovery(run) {
  const party = run?.creatureParty;
  if (!party) return null;

  syncPartySkillHpBonuses(party, run.partySkills || []);
  const multiplier = getPostCombatRecoveryMultiplier(run.partySkills || []);
  const creatures = [...(party.active || []), ...(party.reserves || [])].filter(Boolean);

  for (const creature of creatures) {
    if (
      typeof creature.hp === 'number'
      && creature.hp > 0
      && typeof creature.maxHp === 'number'
    ) {
      applyHeal(
        creature,
        Math.floor(creature.maxHp * ROOM_ENTRY_HEAL_PERCENT * multiplier),
      );
    }
    resetStatStages(creature);
    creature.activeEffects = [];
  }

  return party;
}
