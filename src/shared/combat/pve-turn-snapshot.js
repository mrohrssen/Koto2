function cloneCombatValue(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function cloneForPveTurn(value) {
  return cloneCombatValue(value);
}

export function createPveTurnSnapshot({
  allies = [],
  enemies = [],
  moveChoices = [],
  itemBuffs = null,
  runPartySkills = [],
  combat = {},
  creatureParty = null,
  metaMults = null,
} = {}) {
  return cloneForPveTurn({
    allies,
    enemies,
    moveChoices,
    itemBuffs,
    runPartySkills,
    combat,
    creatureParty,
    metaMults,
  });
}
