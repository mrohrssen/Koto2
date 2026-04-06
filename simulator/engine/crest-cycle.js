/**
 * Crest meta-progression automation for simulator runs.
 *
 * Algorithm:
 * 1) Ensure hub state (forfeit if run is active)
 * 2) Open all affordable chests for each element
 * 3) Equip highest-value crest per element slot
 *
 * Throws on any API failure (fail-hard by design).
 */

const CREST_ELEMENTS = ['fire', 'water', 'earth', 'wood', 'metal'];

function createEmptyCounter() {
  return { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
}

function normalizeCrestState(data) {
  return {
    chestCost: data?.chestCost,
    elementDrops: data?.elementDrops || createEmptyCounter(),
    crests: Array.isArray(data?.crests) ? data.crests : [],
    equippedCrests: data?.equippedCrests || { fire: null, water: null, earth: null, wood: null, metal: null }
  };
}

function getBestCrestByElement(crests, element) {
  const candidates = (crests || []).filter(crest => crest?.element === element && typeof crest.value === 'number');
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0];
}

export async function runCrestCycle(simCall, logEvent, context) {
  const { day, run } = context;
  const room = 0;
  const contextPrefix = `day ${day} run ${run} crest-cycle`;

  try {
    const stateResult = await simCall('GET', '/api/game/state', null, `${contextPrefix} state`);
    if (!stateResult.ok) {
      throw new Error(`Failed to read game state before crest cycle: ${stateResult.error || stateResult.status}`);
    }

    if (stateResult.data?.run) {
      const forfeitResult = await simCall('POST', '/api/game/forfeit', null, `${contextPrefix} forfeit to hub`);
      if (!forfeitResult.ok) {
        throw new Error(`Failed to normalize to hub before crest cycle: ${forfeitResult.error || forfeitResult.status}`);
      }
    }

    const crestStateResult = await simCall('GET', '/api/game/crests', null, `${contextPrefix} get crests`);
    if (!crestStateResult.ok) {
      throw new Error(`Failed to read crest state: ${crestStateResult.error || crestStateResult.status}`);
    }

    let crestState = normalizeCrestState(crestStateResult.data);
    const chestCost = Number(crestState.chestCost);
    if (!Number.isFinite(chestCost) || chestCost <= 0) {
      throw new Error(`Invalid chestCost from /api/game/crests: ${crestState.chestCost}`);
    }

    const dropsBefore = { ...crestState.elementDrops };
    const chestsOpenedByElement = createEmptyCounter();
    const equipsChangedByElement = createEmptyCounter();

    logEvent(day, run, room, 'crest_cycle_started', {
      chestCost,
      dropsBefore
    });

    for (const element of CREST_ELEMENTS) {
      while ((crestState.elementDrops[element] || 0) >= chestCost) {
        const openResult = await simCall(
          'POST',
          '/api/game/crests/open',
          { element },
          `${contextPrefix} open ${element}`
        );
        if (!openResult.ok) {
          throw new Error(`Failed to open ${element} chest: ${openResult.error || openResult.status}`);
        }

        crestState = normalizeCrestState(openResult.data);
        chestsOpenedByElement[element] += 1;

        logEvent(day, run, room, 'crest_chest_opened', {
          element,
          crestId: openResult.data?.crest?.id || null,
          rarity: openResult.data?.crest?.rarity || null,
          value: openResult.data?.crest?.value ?? null
        });
      }
    }

    for (const element of CREST_ELEMENTS) {
      const best = getBestCrestByElement(crestState.crests, element);
      if (!best) continue;

      const currentlyEquipped = crestState.equippedCrests[element] || null;
      if (currentlyEquipped === best.id) continue;

      const equipResult = await simCall(
        'POST',
        '/api/game/crests/equip',
        { crestId: best.id },
        `${contextPrefix} equip ${element}`
      );
      if (!equipResult.ok) {
        throw new Error(`Failed to equip best ${element} crest: ${equipResult.error || equipResult.status}`);
      }

      crestState = normalizeCrestState(equipResult.data);
      equipsChangedByElement[element] += 1;

      logEvent(day, run, room, 'crest_equipped', {
        element,
        oldCrestId: currentlyEquipped,
        newCrestId: best.id,
        value: best.value
      });
    }

    const dropsAfter = { ...crestState.elementDrops };
    const totalChestsOpened = Object.values(chestsOpenedByElement).reduce((sum, count) => sum + count, 0);
    const totalEquipChanges = Object.values(equipsChangedByElement).reduce((sum, count) => sum + count, 0);
    const dropsSpentTotal = Object.values(dropsBefore).reduce((sum, beforeDrops, index) => {
      const element = CREST_ELEMENTS[index];
      const spent = (beforeDrops || 0) - (dropsAfter[element] || 0);
      return sum + Math.max(0, spent);
    }, 0);

    const summary = {
      chestCost,
      dropsBefore,
      dropsAfter,
      chestsOpenedByElement,
      equipsChangedByElement,
      totalChestsOpened,
      totalEquipChanges,
      dropsSpentTotal,
      totalCrestsOwned: crestState.crests.length
    };

    logEvent(day, run, room, 'crest_cycle_summary', summary);
    return summary;
  } catch (error) {
    logEvent(day, run, room, 'crest_cycle_error', {
      message: error.message || String(error)
    });
    throw error;
  }
}

export { CREST_ELEMENTS };
