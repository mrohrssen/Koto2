import { getEffectiveDex } from './effects.js';

const PVE_SIDE_KEYS = new Set(['ally', 'enemy']);
const PVP_SIDE_KEYS = new Set(['sideA', 'sideB']);

function sideArrays({ allies, enemies, sideA, sideB }) {
  return {
    ally: allies || [],
    enemy: enemies || [],
    sideA: sideA || [],
    sideB: sideB || []
  };
}

function actorEntry(side, index, creature) {
  return {
    side,
    index,
    level: creature.level || 1,
    dex: getEffectiveDex(creature),
    creature
  };
}

export function compareActionActors(a, b) {
  const dexDiff = (b.dex || 1) - (a.dex || 1);
  if (dexDiff !== 0) return dexDiff;
  const levelDiff = (b.level || 1) - (a.level || 1);
  if (levelDiff !== 0) return levelDiff;
  if (a.side !== b.side) return a.side.localeCompare(b.side);
  return a.index - b.index;
}

export function buildActionOrder(context) {
  const arrays = sideArrays(context);
  const sides = context.sideA || context.sideB ? ['sideA', 'sideB'] : ['ally', 'enemy'];
  const entries = [];

  for (const side of sides) {
    const list = arrays[side] || [];
    for (let index = 0; index < list.length; index++) {
      const creature = list[index];
      if (!creature || creature.hp <= 0 || creature.befriended) continue;
      entries.push(actorEntry(side, index, creature));
    }
  }

  return entries.sort(compareActionActors);
}

export function createPveOpeningCursor({ allies, enemies }) {
  const order = buildActionOrder({ allies, enemies }).filter(entry => entry.side === 'ally');
  if (order.length === 0) return null;
  return { side: 'ally', index: order[0].index, opening: true };
}

export function createPvpOpeningCursors({ sideA, sideB }) {
  const pick = side => {
    const order = buildActionOrder({ sideA, sideB }).filter(entry => entry.side === side);
    return order.length > 0 ? { side, index: order[0].index, opening: true } : null;
  };

  return { sideA: pick('sideA'), sideB: pick('sideB') };
}

export function getActor(context, cursor) {
  if (!cursor) return null;
  const arrays = sideArrays(context);
  return arrays[cursor.side]?.[cursor.index] || null;
}

export function isCursorActorAlive(context) {
  const actor = getActor(context, context.cursor);
  return !!actor && actor.hp > 0 && !actor.befriended;
}

export function getNextActionCursor({ allies, enemies, sideA, sideB, previousCursor }) {
  const context = sideA || sideB ? { sideA, sideB } : { allies, enemies };
  const order = buildActionOrder(context);
  if (order.length === 0) return null;

  const previousKey = previousCursor ? `${previousCursor.side}:${previousCursor.index}` : null;
  const previousPosition = order.findIndex(entry => `${entry.side}:${entry.index}` === previousKey);
  const nextEntry = previousPosition >= 0
    ? order[(previousPosition + 1) % order.length]
    : order[0];

  return { side: nextEntry.side, index: nextEntry.index, opening: false };
}

export function cursorMatchesChoice(cursor, choice) {
  return !!cursor && !!choice && cursor.index === choice.creatureIndex;
}

export function isPveCursor(cursor) {
  return !!cursor && PVE_SIDE_KEYS.has(cursor.side);
}

export function isPvpCursor(cursor) {
  return !!cursor && PVP_SIDE_KEYS.has(cursor.side);
}
