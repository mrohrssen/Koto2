function cloneCombatValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function cloneForPveTurn(value) {
  return cloneCombatValue(value);
}

export function createPveTurnSnapshot(input = {}) {
  const combat = input.combat || {};
  const run = input.run || {};
  return cloneForPveTurn({
    allies: input.allies || combat.allies || run.creatureParty?.active || [],
    enemies: input.enemies || combat.enemies || [],
    moveChoices: input.moveChoices || [],
    itemBuffs: input.itemBuffs ?? run.itemBuffs ?? null,
    runPartySkills: input.runPartySkills || run.partySkills || [],
    combat,
    creatureParty: input.creatureParty || run.creatureParty || null,
    metaMults: input.metaMults || run.crestMults || null,
  });
}
