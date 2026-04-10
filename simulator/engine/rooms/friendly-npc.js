/**
 * Handler for friendly NPC rooms.
 * Gets item/equipment offers and picks the first one (everything is free).
 * Selects a target creature: lowest-HP for heals, first active for everything else.
 * Server handles word exposure natively.
 */
export async function handleFriendlyNpc(simCall, room, context, logEvent) {
  logEvent(context.day, context.run, context.roomIndex, 'room_entered', {
    roomType: 'friendlyNpc',
    outcome: 'started'
  });

  // Get the NPC's item offers
  const offersResult = await simCall('POST', '/api/game/friendly-npc-offers', null, 'npc offers');
  if (!offersResult.ok || !offersResult.data?.offered?.length) {
    return { outcome: 'cleared' };
  }

  const offered = offersResult.data.offered;

  const chosen = offered[0];

  // Pick target creature index from current game state
  let targetCreatureIndex = 0;
  const state = offersResult.data?.state;
  const active = state?.run?.creatureParty?.active;
  if (active?.length > 0 && chosen.type === 'heal') {
    // Target the lowest-HP living creature
    let lowestIdx = 0;
    let lowestRatio = Infinity;
    for (let i = 0; i < active.length; i++) {
      const c = active[i];
      if (c && c.hp > 0) {
        const ratio = c.hp / (c.maxHp || c.hp);
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          lowestIdx = i;
        }
      }
    }
    targetCreatureIndex = lowestIdx;
  }

  const chooseResult = await simCall('POST', '/api/game/friendly-npc-choose', {
    itemId: chosen.id,
    targetCreatureIndex
  }, 'npc choose item');

  if (chooseResult.ok) {
    logEvent(context.day, context.run, context.roomIndex, 'item_acquired', {
      itemId: chosen.id,
      itemName: chosen.nameEn || chosen.name,
      category: chosen.category || 'unknown',
      targetCreatureIndex
    });
  }

  return { outcome: 'cleared' };
}
