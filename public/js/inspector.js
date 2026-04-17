export function createInspector({ getState, getPhase, countDomBars, getPixiSprites, getNpcSprites, isNpcDisplayVisible } = {}) {

  // Safe defaults so call sites that haven't wired the new queries yet don't
  // regress to throwing. When a query is missing, that layer is skipped.
  getNpcSprites       = getNpcSprites       || (() => []);
  isNpcDisplayVisible = isNpcDisplayVisible || (() => false);

  function getAliveCount(creatures) {
    if (!creatures) return 0;
    return creatures.filter(c => c.hp > 0 && !c.befriended).length;
  }

  function getVisiblePixiCount(sprites) {
    if (!sprites) return 0;
    return sprites.filter(s => s.alpha > 0.3).length;
  }

  function sideAliveFromState(state, phase, side) {
    if (phase === 'combat' && state?.combat) {
      return side === 'player' ? state.combat.allies : state.combat.enemies;
    }
    // Non-combat: the "enemy" side isn't meaningful; "player" tracks the run's
    // active party (e.g. skillMaster, exploration, hub-with-party).
    if (side === 'player') return state?.run?.creatureParty?.active;
    return null;
  }

  function checkCreatures() {
    const mismatches = [];
    const phase = getPhase();
    const state = getState();
    const inCombat = state?.combat && phase === 'combat';

    // Formation checks — combat has both sides; non-combat has player only.
    const sidesToCheck = inCombat ? ['player', 'enemy'] : ['player'];
    for (const side of sidesToCheck) {
      const creatures = sideAliveFromState(state, phase, side);
      if (!creatures) continue;
      const aliveCount = getAliveCount(creatures);
      const domCount = countDomBars(side);
      const pixiSprites = getPixiSprites(side);
      const pixiVisibleCount = getVisiblePixiCount(pixiSprites);

      if (inCombat && creatures && pixiSprites) {
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

    // NPC layer — every phase that shows an NPC display should have one
    // matching Pixi sprite on the npcs layer. Silent when the DOM pill isn't
    // visible; catches "Cid narration showing but no Pixi Cid" on first frame.
    if (isNpcDisplayVisible()) {
      const npcs = getNpcSprites();
      const npcPixiCount = getVisiblePixiCount(npcs);
      if (npcPixiCount === 0) {
        mismatches.push({
          type: 'DOM_GHOST',
          detail: 'npc display visible but 0 NPC pixi sprites — scene.showNpcSprite may have silently bailed',
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
      allies:  { state: 0, dom: 0, pixi: 0 },
      enemies: { state: 0, dom: 0, pixi: 0 },
      npcs:    { dom: 0, pixi: 0 },
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
    } else {
      const activeParty = state?.run?.creatureParty?.active;
      if (activeParty) {
        summary.allies = {
          state: getAliveCount(activeParty),
          dom: countDomBars('player'),
          pixi: getVisiblePixiCount(getPixiSprites('player')),
        };
      }
    }

    summary.npcs = {
      dom: isNpcDisplayVisible() ? 1 : 0,
      pixi: getVisiblePixiCount(getNpcSprites()),
    };

    return { ok: creatureResult.ok, mismatches: creatureResult.mismatches, summary, phase };
  }

  function checkGameRules(result) {
    const mismatches = [];
    if (!result) return { ok: true, mismatches };

    for (const atk of [...(result.playerAttacks || []), ...(result.enemyAttacks || [])]) {
      if (atk.attackerHpBefore !== undefined && atk.attackerHpBefore <= 0) {
        mismatches.push({
          type: 'LOGIC_BUG',
          detail: `KO creature attacked: ${atk.attackerSide}[${atk.attackerIndex}] had HP=${atk.attackerHpBefore}`,
        });
      }
    }

    for (const creatures of [result.allies || [], result.enemies || []]) {
      for (const c of creatures) {
        if (c.hp < 0) {
          mismatches.push({ type: 'LOGIC_BUG', detail: `HP below 0: creature has hp=${c.hp}` });
        }
      }
    }

    for (const creatures of [result.allies || [], result.enemies || []]) {
      for (const c of creatures) {
        for (const eff of (c.activeEffects || [])) {
          if (eff.remainingTurns !== undefined && eff.remainingTurns <= 0) {
            mismatches.push({
              type: 'LOGIC_BUG',
              detail: `Expired effect still active: ${eff.type} with remainingTurns=${eff.remainingTurns}`,
            });
          }
        }
      }
    }

    return { ok: mismatches.length === 0, mismatches };
  }

  return { checkCreatures, fullScan, checkGameRules };
}
