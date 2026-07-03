import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { ensureRoomActionSeq } from '../room-reveal-buffer.js';
import { finalizeRandomRoom, resolveSupportRoom, ROOM_TYPES } from '../rooms.js';
import { generateDealerCreatures, getCreatureBuyPrice, getCreatureSellPrice } from '../creatures.js';
import { getDueCards } from '../internal-srs.js';
import { getWordDict, hydrateCards } from '../bootstrap/word-knowledge.js';
import {
  getGameMasterNoFrame,
  getGameMasterYesFrame,
  getShopGreetingFrames,
  getShopPurchaseFrames,
  getShrineGreetingFrames,
  getSkillSelectFrame,
} from '../dialogue-loader.js';
import {
  assembleFrame,
  entityToToken,
  getEligibleFrameTokens,
  selectBestFrame,
} from '../token-format.js';
import {
  getPartySkillOfferDisplay,
  normalizePartySkills,
  rollSkillMasterOffers,
} from '../party-skills.js';
import {
  cloneExploreValue,
  ensureExploreSessionEpoch,
  EXPLORE_RUNWAY_AHEAD,
  predictedEffectsForAction,
  roomDependenciesForType,
} from './explore-session-contract.js';
import {
  COOKING_INGREDIENTS,
  COOKING_RECIPES,
  getCookableRecipeHints,
  getIngredientCount,
  rollRoomIngredientDrops,
} from './cooking-service.js';
import { rollFriendlyNpcOffers } from './friendly-npc-offers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIALOGUE_FRAMES_PATH = join(__dirname, '../../../data/dialogue/frames.json');
let fallbackDialogueFrames = null;

const SHRINE_REWARDS = Object.freeze([
  {
    id: 'heal_all',
    title: 'Heal all creatures',
    description: 'Restore 50% HP to living active and reserve creatures.',
  },
  {
    id: 'restore_mp_all',
    title: 'Restore MP',
    description: 'Restore MP for all active and reserve creatures.',
  },
  {
    id: 'level_up',
    title: 'Level up a creature',
    description: 'Choose one creature to gain a level.',
  },
]);

function inactiveRunway() {
  return {
    sessionEpoch: null,
    roomActionSeq: 0,
    currentRoom: 0,
    preparedAhead: EXPLORE_RUNWAY_AHEAD,
    preparedRooms: [],
  };
}

function currentRoomIndex(run) {
  return Number.isInteger(run?.currentRoom) && run.currentRoom >= 0 ? run.currentRoom : 0;
}

function prepareRoom(gm, index) {
  const fromService = gm?.explorationService?.prepareRoomForReveal?.(index);
  if (fromService) return fromService;

  const room = gm?.run?.rooms?.[index] || null;
  if (!room) return null;
  resolveSupportRoom(room, gm.run);
  finalizeRandomRoom(room, gm.run);
  return gm.run.rooms[index] || room;
}

function buildEntryPayload(gm, room) {
  return {
    background: room?.subArea?.background || gm?.run?.currentArea?.background || gm?.run?.background || null,
    subArea: room?.subArea ? cloneExploreValue(room.subArea) : null,
    ingredientDrops: !room?.entryIngredientDropsAwarded && Array.isArray(room?.entryIngredientDrops)
      ? cloneExploreValue(room.entryIngredientDrops)
      : [],
    narrationFrame: null,
  };
}

function acceptedActionsForRoom(room) {
  switch (room?.type) {
    case ROOM_TYPES.friendlyNpc:
      return ['friendlyNpc.choose'];
    case ROOM_TYPES.shrine:
      return ['shrine.choose'];
    case ROOM_TYPES.skillMaster:
      return ['skillMaster.choose'];
    case ROOM_TYPES.whackAMole:
      return ['whackAMole.complete', 'whackAMole.skip'];
    case ROOM_TYPES.campfire:
      return ['campfire.cook', 'campfire.feed', 'campfire.skip'];
    case ROOM_TYPES.speedReviewRoom:
      return ['speedReview.commit', 'speedReview.complete'];
    case ROOM_TYPES.wordDiscovery:
      return ['wordDiscovery.review', 'wordDiscovery.complete'];
    case ROOM_TYPES.dealer:
      return ['dealer.sell', 'dealer.buy', 'dealer.leave'];
    case ROOM_TYPES.encounter:
    case ROOM_TYPES.npcBattle:
    case ROOM_TYPES.boss:
      return [];
    default:
      return ['proceed'];
  }
}

function actionEffectsForActions(actions) {
  return Object.fromEntries(actions.map(action => [action, predictedEffectsForAction(action)]));
}

function areaIdsForRun(run) {
  return [...new Set([...(run?.areaPath || []), run?.currentArea?.id].filter(Boolean))];
}

function collectionIdsForGm(gm) {
  const collection = gm?.meta?.creatureCollection || gm?.player?.creatureCollection || [];
  return collection
    .map(entry => typeof entry === 'string' ? entry : entry?.id)
    .filter(Boolean);
}

function allPartyCreatures(run) {
  return [
    ...((run?.creatureParty?.active || []).map((creature, slotIndex) => creature ? { ...creature, slot: 'active', slotIndex } : null)),
    ...((run?.creatureParty?.reserves || []).map((creature, slotIndex) => creature ? { ...creature, slot: 'reserves', slotIndex } : null)),
  ].filter(Boolean);
}

function getFallbackDialogueFrames() {
  if (fallbackDialogueFrames) return fallbackDialogueFrames;
  try {
    fallbackDialogueFrames = JSON.parse(readFileSync(DIALOGUE_FRAMES_PATH, 'utf8'));
  } catch (err) {
    fallbackDialogueFrames = [];
  }
  return fallbackDialogueFrames;
}

function shrineGreetingFrames() {
  const loaded = getShrineGreetingFrames();
  if (loaded.length > 0) return loaded;
  return getFallbackDialogueFrames().filter(frame => frame.category === 'shrineGreeting');
}

function shopGreetingFrames() {
  const loaded = getShopGreetingFrames();
  if (loaded.length > 0) return loaded;
  return getFallbackDialogueFrames().filter(frame => frame.category === 'shopGreeting');
}

function shopPurchaseFrames() {
  const loaded = getShopPurchaseFrames();
  if (loaded.length > 0) return loaded;
  return getFallbackDialogueFrames().filter(frame => frame.category === 'shopPurchase');
}

function skillSelectFrame() {
  return getSkillSelectFrame()
    || getFallbackDialogueFrames().find(frame => frame.category === 'skill_select')
    || null;
}

function gameMasterYesFrame() {
  return getGameMasterYesFrame()
    || getFallbackDialogueFrames().find(frame => frame.category === 'gameMaster_yes')
    || null;
}

function gameMasterNoFrame() {
  return getGameMasterNoFrame()
    || getFallbackDialogueFrames().find(frame => frame.category === 'gameMaster_no')
    || null;
}

function ingredientDropsForRoom(room) {
  const ingredientsById = new Map(COOKING_INGREDIENTS.map(ingredient => [ingredient.id, ingredient]));
  return rollRoomIngredientDrops().map(drop => {
    const ingredient = ingredientsById.get(drop.id);
    return { ...drop, ingredient, nameToken: entityToToken(ingredient) };
  });
}

function prepareEntryIngredientDrops(gm, index, currentRoom) {
  const room = gm?.run?.rooms?.[index] || null;
  if (!room || index <= currentRoom) return;
  if (Array.isArray(room.entryIngredientDrops)) return;

  const fromService = gm?.explorationService?.prepareRoomEntryIngredientDrops?.(index);
  if (Array.isArray(fromService)) return;

  room.entryIngredientDrops = ingredientDropsForRoom(room);
}

function knownSetForOpts(opts) {
  return opts?.knownSet instanceof Set ? opts.knownSet : new Set();
}

// Warm the dialogue TTS cache for a prepared greeting frame so audio is ready
// (or in flight) by the time the player reaches the room. Fire-and-forget: a
// synthesis failure must never fail or slow a runway build. The warmed flag
// lives on the persisted room state so rebuilds (state enrichment,
// refreshExploreRunwayAfterProceed) do not re-warm — one attempt per frame.
function warmGreetingTts(frame, state, flagKey, opts) {
  if (!frame || !state || state[flagKey] || typeof opts?.warmTts !== 'function') return;
  state[flagKey] = true;
  try {
    opts.warmTts(frame);
  } catch {
    // Warming is best-effort; VOICEVOX may be down. Swallow to protect the build.
  }
}

function hydrateFriendlyNpcOfferFrames(item, knownSet) {
  if (!item?.word) return;
  if (!item.tokens?.length || !item.words?.length) {
    const candidates = shopPurchaseFrames()
      .map(frame => assembleFrame(frame, { item }, { dict: getWordDict() }));
    const best = selectBestFrame(candidates, knownSet, { dict: getWordDict() });
    if (best) {
      item.tokens = best.tokens || [];
      item.words = best.words || [];
    }
  }
  if (!item.nameToken) {
    item.nameToken = entityToToken(item);
  }
}

function buildFriendlyNpcPayload(gm, room, opts) {
  if (!room.friendlyNpc) {
    room.friendlyNpc = { offerCategory: 'equipment', offered: null, chosenId: null, completed: false };
  }

  const hasConsumableOffer = (room.friendlyNpc.offered || []).some(item => item?.category !== 'equipment');
  if (!Array.isArray(room.friendlyNpc.offered) || hasConsumableOffer) {
    room.friendlyNpc.offerCategory = 'equipment';
    room.friendlyNpc.offered = rollFriendlyNpcOffers('equipment', areaIdsForRun(gm?.run));
  }

  const knownSet = knownSetForOpts(opts);
  for (const item of room.friendlyNpc.offered || []) {
    hydrateFriendlyNpcOfferFrames(item, knownSet);
  }

  if (!room.friendlyNpc.greeting) {
    const greetingCandidates = shopGreetingFrames()
      .map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
    room.friendlyNpc.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
  }

  warmGreetingTts(room.friendlyNpc.greeting, room.friendlyNpc, 'greetingTtsWarmed', opts);

  return {
    kind: 'friendlyNpc',
    npc: room.npc || null,
    offered: cloneExploreValue(room.friendlyNpc.offered || []),
    greeting: room.friendlyNpc.greeting || null,
  };
}

function buildShrinePayload(room, opts) {
  if (!room.shrine) {
    room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
  }

  if (!room.shrine.greeting) {
    const knownSet = knownSetForOpts(opts);
    const greetingCandidates = shrineGreetingFrames()
      .map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
    room.shrine.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
  }

  warmGreetingTts(room.shrine.greeting, room.shrine, 'greetingTtsWarmed', opts);

  return {
    kind: 'shrine',
    rewards: cloneExploreValue(SHRINE_REWARDS),
    greeting: cloneExploreValue(room.shrine.greeting || null),
    completed: room.shrine.completed === true || room.shrine.used === true,
  };
}

function buildSkillMasterPayload(gm, room, opts) {
  if (!room.skillMaster) {
    room.skillMaster = { offered: null, chosenId: null, completed: false };
  }

  if (!Array.isArray(room.skillMaster.offered)) {
    gm.run.partySkills = normalizePartySkills(gm.run?.partySkills || []);
    room.skillMaster.offered = rollSkillMasterOffers({ ownedSkillIds: gm.run.partySkills, count: 3 })
      .map(({ id, level }) => ({ id, level }));
  }

  const offered = (room.skillMaster.offered || [])
    .map(offer => getPartySkillOfferDisplay(offer, gm.run?.partySkills || []))
    .filter(Boolean);
  const skillSelectPrompt = getEligibleFrameTokens(skillSelectFrame(), knownSetForOpts(opts), { dict: getWordDict() });

  return {
    kind: 'skillMaster',
    offered,
    skillSelectPrompt,
    completed: room.skillMaster.completed === true,
    chosenId: room.skillMaster.chosenId || null,
  };
}

function buildCampfirePayload(gm, room, opts) {
  const ingredients = gm?.run?.cooking?.ingredients || {};
  const knownSet = knownSetForOpts(opts);
  return {
    kind: 'campfire',
    ingredients: cloneExploreValue(ingredients),
    ingredientCatalog: cloneExploreValue(COOKING_INGREDIENTS),
    ingredientCount: getIngredientCount(ingredients),
    discoveredRecipes: cloneExploreValue(gm?.meta?.cookingRecipesDiscovered || []),
    cookableRecipeHints: getCookableRecipeHints(ingredients),
    recipes: cloneExploreValue(COOKING_RECIPES),
    room: cloneExploreValue(room),
    yesTokens: getEligibleFrameTokens(gameMasterYesFrame(), knownSet, { dict: getWordDict() }),
    noTokens: getEligibleFrameTokens(gameMasterNoFrame(), knownSet, { dict: getWordDict() }),
  };
}

function buildDealerPayload(gm, room) {
  if (!room.dealer) {
    room.dealer = {
      visited: false,
      offeredCreatures: [],
      soldCreatures: [],
      purchasedCreature: null,
    };
  }

  if (!Array.isArray(room.dealer.offeredCreatures) || room.dealer.offeredCreatures.length === 0) {
    room.dealer.offeredCreatures = generateDealerCreatures(collectionIdsForGm(gm));
  }

  const offeredCreatures = room.dealer.purchasedCreature
    ? []
    : (room.dealer.offeredCreatures || []).map(creature => ({
        ...cloneExploreValue(creature),
        buyPrice: getCreatureBuyPrice(creature?.rarity),
      }));

  const partyCreatures = allPartyCreatures(gm?.run).map(creature => ({
    ...cloneExploreValue(creature),
    sellPrice: getCreatureSellPrice(creature.rarity, creature.level || 1),
  }));

  return {
    kind: 'dealer',
    dealer: cloneExploreValue(room.dealer),
    offeredCreatures,
    partyCreatures,
    credits: gm?.run?.player?.credits || 0,
    canBuy: !room.dealer.purchasedCreature,
    sellCount: room.dealer.soldCreatures?.length || 0,
    maxSells: 2,
  };
}

function sanitizeSpeedReviewWord(card) {
  return {
    word: card?.word || card?.id || '',
    reading: card?.reading || null,
    meanings: Array.isArray(card?.meanings) ? card.meanings : (card?.meaning ? [card.meaning] : []),
  };
}

function buildSpeedReviewPayload(userId, room) {
  if (!room.speedReviewRoom) {
    room.speedReviewRoom = {
      targetCards: 10,
      reviewedCards: 0,
      completed: false,
      snapshotWords: [],
      snapshotWordKeys: [],
      awardedReviewKeys: [],
      pendingReviewKeys: [],
      settled: true,
    };
  }

  const state = room.speedReviewRoom;
  if (!state.snapshotInitialized && userId) {
    const targetCards = Math.max(0, Number(state.targetCards) || 10);
    const snapshotWords = hydrateCards(getDueCards(userId, 'vocab'))
      .slice(0, targetCards)
      .map(sanitizeSpeedReviewWord);
    state.snapshotWords = snapshotWords;
    state.snapshotWordKeys = snapshotWords.map(word => String(word.word));
    state.snapshotInitialized = true;
  }

  return {
    kind: 'speedReviewRoom',
    roomId: room.id,
    targetCards: state.targetCards,
    reviewedCards: state.reviewedCards || 0,
    completed: state.completed === true,
    snapshotWords: cloneExploreValue(state.snapshotWords || []),
    snapshotWordKeys: cloneExploreValue(state.snapshotWordKeys || []),
    awardedReviewKeys: cloneExploreValue(state.awardedReviewKeys || []),
    pendingReviewKeys: cloneExploreValue(state.pendingReviewKeys || []),
    settled: state.settled !== false,
    snapshotInitialized: state.snapshotInitialized === true,
  };
}

function buildInteractionPayload(gm, room, opts) {
  switch (room?.type) {
    case ROOM_TYPES.friendlyNpc:
      return buildFriendlyNpcPayload(gm, room, opts);
    case ROOM_TYPES.shrine:
      return buildShrinePayload(room, opts);
    case ROOM_TYPES.skillMaster:
      return buildSkillMasterPayload(gm, room, opts);
    case ROOM_TYPES.campfire:
      return buildCampfirePayload(gm, room, opts);
    case ROOM_TYPES.dealer:
      return buildDealerPayload(gm, room);
    case ROOM_TYPES.speedReviewRoom:
      return buildSpeedReviewPayload(opts?.userId, room);
    default:
      return { kind: room?.type || 'room' };
  }
}

function missingPayloadReasonsFor(room, interactionPayload) {
  const missing = [];
  if (room?.type === ROOM_TYPES.friendlyNpc) {
    if (!interactionPayload?.npc) missing.push('friendlyNpc.npc');
    if (!Array.isArray(interactionPayload?.offered) || interactionPayload.offered.length === 0) {
      missing.push('friendlyNpc.offered');
    }
    if ((interactionPayload?.offered || []).some(item =>
      item?.word && (!item.tokens?.length || !item.words?.length)
    )) {
      missing.push('friendlyNpc.offeredTokens');
    }
    if (!interactionPayload?.greeting?.tokens?.length) missing.push('friendlyNpc.greeting');
  }
  if (room?.type === ROOM_TYPES.skillMaster) {
    if (!Array.isArray(interactionPayload?.offered) || interactionPayload.offered.length === 0) {
      missing.push('skillMaster.offered');
    }
    if (!interactionPayload?.skillSelectPrompt?.tokens?.length) {
      missing.push('skillMaster.skillSelectPrompt');
    }
  }
  if (room?.type === ROOM_TYPES.campfire) {
    if (!interactionPayload?.yesTokens?.tokens?.length) missing.push('campfire.yesTokens');
    if (!interactionPayload?.noTokens?.tokens?.length) missing.push('campfire.noTokens');
  }
  if (room?.type === ROOM_TYPES.speedReviewRoom) {
    if (!Array.isArray(interactionPayload?.snapshotWords) || interactionPayload.snapshotWords.length === 0) {
      missing.push('speedReviewRoom.snapshotWords');
    }
  }
  return missing;
}

async function resolveKnownSet(opts) {
  const knownWords = await Promise.resolve(opts?.getKnownWords?.() || []);
  if (knownWords instanceof Set) return knownWords;
  if (Array.isArray(knownWords)) return new Set(knownWords);
  if (knownWords && typeof knownWords[Symbol.iterator] === 'function') {
    return new Set(Array.from(knownWords));
  }
  return new Set();
}

export async function buildExploreRunway(gm, opts = {}) {
  const run = gm?.run;
  if (!run?.active || !Array.isArray(run.rooms) || run.rooms.length === 0) {
    return inactiveRunway();
  }

  const payloadOpts = { ...opts, knownSet: await resolveKnownSet(opts) };
  const sessionEpoch = ensureExploreSessionEpoch(run);
  const roomActionSeq = ensureRoomActionSeq(run);
  const currentRoom = currentRoomIndex(run);
  const lastIndex = Math.min(run.rooms.length - 1, currentRoom + EXPLORE_RUNWAY_AHEAD);
  const preparedRooms = [];

  for (let index = currentRoom; index <= lastIndex; index += 1) {
    const room = prepareRoom(gm, index);
    if (!room) continue;

    prepareEntryIngredientDrops(gm, index, currentRoom);
    const entryPayload = buildEntryPayload(gm, room);
    const interactionPayload = buildInteractionPayload(gm, room, payloadOpts);
    const acceptedActions = acceptedActionsForRoom(room);
    const missingPayloadReasons = missingPayloadReasonsFor(room, interactionPayload);

    preparedRooms.push({
      index,
      roomId: room.id,
      actionSeq: roomActionSeq + (index - currentRoom),
      room: cloneExploreValue(room),
      entryPayload,
      interactionPayload,
      dependencies: roomDependenciesForType(room.type),
      acceptedActions,
      actionEffects: actionEffectsForActions(acceptedActions),
      offlineReady: missingPayloadReasons.length === 0,
      missingPayloadReasons,
    });
  }

  return {
    sessionEpoch,
    roomActionSeq,
    currentRoom,
    preparedAhead: EXPLORE_RUNWAY_AHEAD,
    preparedRooms,
  };
}
