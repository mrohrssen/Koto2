// public/js/inspector.js

/**
 * Inspector — cross-checks game state vs DOM vs PixiJS.
 *
 * Accepts query functions as dependencies for testability:
 *   getState()          → { combat: { allies, enemies }, run, ... }
 *   getPhase()          → string (current phase name)
 *   countDomBars(side)  → number of visible HP bars for 'player'|'enemy'
 *   getPixiSprites(side)→ array of { alpha } objects for each sprite slot
 */

export function createInspector({ getState, getPhase, countDomBars, getPixiSprites } = {}) {

  function getAliveCount(creatures) {
    if (!creatures) return 0;
    return creatures.filter(c => c.hp > 0 && !c.befriended).length;
  }

  function getVisiblePixiCount(sprites) {
    if (!sprites) return 0;
    return sprites.filter(s => s.alpha > 0.3).length;
  }

  function checkCreatures() {
    const mismatches = [];
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';

    if (!inCombat) {
      return { ok: true, mismatches };
    }

    for (const side of ['player', 'enemy']) {
      const creatures = side === 'player' ? state.combat.allies : state.combat.enemies;
      const aliveCount = getAliveCount(creatures);
      const domCount = countDomBars(side);
      const pixiSprites = getPixiSprites(side);
      const pixiVisibleCount = getVisiblePixiCount(pixiSprites);

      // Per-creature KO checks first so they appear before aggregate count mismatches.
      if (creatures && pixiSprites) {
        for (let i = 0; i < creatures.length; i++) {
          const c = creatures[i];
          const s = pixiSprites[i];
          if (c && s && c.hp <= 0 && !c.befriended && s.alpha > 0.3) {
            mismatches.push({
              type: 'DOM_GHOST',
              detail: `${side}[${i}] KO (hp=${c.hp}) but sprite alpha=${s.alpha} — should be ≤0.3`,
            });
          }
        }
      }

      if (domCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} dom=${domCount} but state=${aliveCount} alive`,
        });
      }

      if (pixiVisibleCount !== aliveCount) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: `${side} pixi=${pixiVisibleCount} visible but state=${aliveCount} alive`,
        });
      }
    }

    return { ok: mismatches.length === 0, mismatches };
  }

  function fullScan() {
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';
    const creatureResult = checkCreatures();

    const summary = {
      allies: { state: 0, dom: 0, pixi: 0 },
      enemies: { state: 0, dom: 0, pixi: 0 },
    };

    if (inCombat) {
      summary.allies = {
        state: getAliveCount(state.combat.allies),
        dom: countDomBars('player'),
        pixi: getVisiblePixiCount(getPixiSprites('player')),
      };
      summary.enemies = {
        state: getAliveCount(state.combat.enemies),
        dom: countDomBars('enemy'),
        pixi: getVisiblePixiCount(getPixiSprites('enemy')),
      };
    }

    return { ok: creatureResult.ok, mismatches: creatureResult.mismatches, summary, phase };
  }

  return { checkCreatures, fullScan };
}
