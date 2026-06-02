function cloneCombatValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function cloneForPveTurn(value) {
  return cloneCombatValue(value);
}

function buildPveTurnSnapshot(input = {}) {
  const combat = input.combat || {};
  const run = input.run || {};
  return {
    allies: input.allies || combat.allies || run.creatureParty?.active || [],
    enemies: input.enemies || combat.enemies || [],
    moveChoices: input.moveChoices || [],
    itemBuffs: input.itemBuffs ?? run.itemBuffs ?? null,
    runPartySkills: input.runPartySkills || run.partySkills || [],
    combat,
    creatureParty: input.creatureParty || run.creatureParty || null,
    metaMults: input.metaMults || run.crestMults || null,
    effectEvents: input.effectEvents,
    roundStartEvents: input.roundStartEvents,
  };
}

export function createPveTurnSnapshot(input = {}, { clone = true } = {}) {
  const snapshot = clone ? cloneForPveTurn(buildPveTurnSnapshot(input)) : buildPveTurnSnapshot(input);
  if (snapshot.creatureParty) {
    snapshot.creatureParty.active = snapshot.allies;
  }
  if (snapshot.combat) {
    snapshot.combat.allies = snapshot.allies;
    snapshot.combat.enemies = snapshot.enemies;
  }
  return snapshot;
}
