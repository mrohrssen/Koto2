// src/game/rest-move.js
/**
 * Synthetic "Rest" pseudo-move. Always appended to a creature's move-select
 * grid. Never stored on a creature, never in data/moves.json. Server recognises
 * it via moveChoices entries with { action: 'rest' }.
 */
export const REST_MOVE = Object.freeze({
  id: 'rest',
  name: '休む',
  reading: 'やすむ',
  nameEn: 'rest',
  element: 'neutral',
  category: 'heal',
  target: 'self',
  mpCost: 0,
  power: 0,
  isRest: true,
});

/** Fractional maxMp restored per rest action (20%). */
export const REST_MP_FRACTION = 0.20;

/** Compute the MP gained if `creature` rests. Clamped by current MP headroom. */
export function computeRestMpGain(creature) {
  const maxMp = creature.maxMp || 0;
  const currentMp = creature.mp || 0;
  const headroom = Math.max(0, maxMp - currentMp);
  return Math.min(headroom, Math.ceil(maxMp * REST_MP_FRACTION));
}
