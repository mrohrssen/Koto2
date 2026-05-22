import { pickEnemyMoveChoice, pickEnemyTarget } from '../game/services/creature-combat-service.js';

export function chooseBotPvpAction({ botSide, cursor, sideA, sideB }) {
  if (!cursor || cursor.side !== botSide) return null;
  const botAllies = botSide === 'sideA' ? sideA : sideB;
  const enemies = botSide === 'sideA' ? sideB : sideA;
  const actor = botAllies[cursor.index];
  if (!actor || actor.hp <= 0) return null;

  const choice = pickEnemyMoveChoice(actor, enemies, botAllies);
  if (!choice?.move) return { creatureIndex: cursor.index, action: 'rest', targetIndex: cursor.index };

  const targeting = pickEnemyTarget(actor, choice.move, choice.mode, enemies, botAllies);
  if (!targeting?.target) return { creatureIndex: cursor.index, action: 'rest', targetIndex: cursor.index };

  const targetIndex = targeting.targetSide === 'player'
    ? enemies.indexOf(targeting.target)
    : botAllies.indexOf(targeting.target);

  return {
    creatureIndex: cursor.index,
    moveId: choice.move.id,
    targetIndex: Math.max(0, targetIndex)
  };
}
