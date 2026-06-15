import { createPveOpeningCursor } from '../../../src/game/combat/action-cursor.js';

export function isKanjiKombatWaveDead(state) {
  const enemies = state?.combat?.enemies;
  return Array.isArray(enemies)
    && enemies.length > 0
    && !enemies.some(enemy => enemy && enemy.hp > 0 && enemy.befriended !== true);
}

export function applyLocalKanjiKombatWaveTransition(state) {
  const kk = state?.run?.kanjiKombat;
  const queue = Array.isArray(kk?.pendingNextWaves) ? kk.pendingNextWaves : [];
  const pending = queue[0] || null;
  if (!pending || !state.combat) return null;

  kk.wave = pending.wave;
  kk.pendingNextWaves = queue.slice(1);
  state.combat = {
    ...state.combat,
    active: true,
    enemies: pending.enemies,
    isBoss: pending.isMiniboss === true,
    optimistic: { ...pending.combat },
    actionCount: 0,
    cycleCount: 0,
    openingResolved: false,
    turnCount: 1,
    actionCursor: createPveOpeningCursor({
      allies: state.combat.allies || state.run?.creatureParty?.active || [],
      enemies: pending.enemies,
    }),
  };
  return pending;
}
