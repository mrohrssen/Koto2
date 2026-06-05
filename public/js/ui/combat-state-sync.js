export function mergeAuthoritativeCombatState(currentState, result) {
  if (!result) return currentState;

  const authoritative = result.state || null;
  const hasAuthoritativeCombat = !!authoritative
    && Object.prototype.hasOwnProperty.call(authoritative, 'combat');
  const next = authoritative
    ? { ...(currentState || {}), ...authoritative }
    : { ...(currentState || {}) };

  if (authoritative?.run && currentState?.run) {
    next.run = { ...currentState.run, ...authoritative.run };
  }

  if (authoritative?.combat && currentState?.combat) {
    next.combat = { ...currentState.combat, ...authoritative.combat };
  }

  if (result.creatureParty) {
    next.run = { ...(next.run || {}), creatureParty: result.creatureParty };
  }

  const responseAllies = result.allies || result.creatureParty?.active || null;
  if (!hasAuthoritativeCombat && currentState?.combat && (result.enemies || responseAllies)) {
    next.combat = {
      ...currentState.combat,
      enemies: result.enemies || currentState.combat.enemies,
      allies: responseAllies || currentState.combat.allies,
      turnCount: result.turnCount ?? currentState.combat.turnCount,
      actionCursor: currentState.combat.actionCursor,
      actionCount: currentState.combat.actionCount,
      cycleCount: currentState.combat.cycleCount,
      openingResolved: currentState.combat.openingResolved
    };
  }

  return next;
}
