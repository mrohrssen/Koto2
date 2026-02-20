import * as npcType from './npc.js';
import * as creatureType from './creature.js';

const REGISTRY = {
  npc: npcType,
  creature: creatureType
};

export function getEntityType(typeName) {
  const type = REGISTRY[typeName];
  if (!type) throw new Error(`Unknown entity type: ${typeName}`);
  return type;
}

export function listEntityTypes() {
  return Object.keys(REGISTRY);
}
