// Client-side mirror of src/game/rest-move.js REST_MOVE constant.
// Kept in sync manually — if the canonical move shape changes, update both.
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
