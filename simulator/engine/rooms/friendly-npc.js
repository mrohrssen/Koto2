/**
 * Handler for friendly NPC rooms.
 * Gets item/equipment offers and picks the first one (everything is free).
 * Selects a target creature: lowest-HP for heals, first active for everything else.
 * Tracks all offered item words as exposures (mirrors frontend behavior).
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

  // Track word exposures for ALL offered items (player sees all 3)
  const exposedWords = [];
  for (const item of offered) {
    if (item.word) {
      logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
        word: item.word,
        reading: item.reading || '',
        meaning: item.nameEn || '',
        source: 'npc_shop_item'
      });
      exposedWords.push({ word: item.word, meaning: item.nameEn || '' });
    }
  }

  // Track NPC name as word exposure
  const npc = offersResult.data.state?.room?.npc;
  if (npc?.name && npc?.nameEn) {
    logEvent(context.day, context.run, context.roomIndex, 'word_exposure', {
      word: npc.name,
      reading: '',
      meaning: npc.nameEn,
      source: 'npc_name'
    });
    exposedWords.push({ word: npc.name, meaning: npc.nameEn });
  }

  // Feed exposed words to the game server's SRS
  if (exposedWords.length > 0) {
    await simCall('POST', '/api/game/known-words/expose', {
      words: exposedWords
    }, `expose ${exposedWords.length} shop words`);
  }

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
