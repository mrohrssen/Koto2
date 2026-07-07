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
import { shouldShowStartingMeadowHinonekoIntro } from './tutorial-service.js';

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

// Combat rooms accept their prepared start plus the per-turn cycle action. Every
// SUPPORT room also accepts 'proceed' so a completed support room can advance
// through the session log offline instead of pausing at the legacy proceed route
// (Task 5 finding: 'proceed' was previously granted only to the default type, so
// offline chains stalled at every support-room exit). Server-side proceed
// validation is unchanged — applyExploreProceed → proceedToNextRoom still gates
// encounter (interacted) and skillMaster (completed) before advancing.
function acceptedActionsForRoom(room) {
  switch (room?.type) {
    case ROOM_TYPES.friendlyNpc:
      return ['friendlyNpc.choose', 'proceed'];
    case ROOM_TYPES.shrine:
      return ['shrine.choose', 'proceed'];
    case ROOM_TYPES.skillMaster:
      return ['skillMaster.choose', 'proceed'];
    case ROOM_TYPES.whackAMole:
      return ['whackAMole.complete', 'whackAMole.skip', 'proceed'];
    case ROOM_TYPES.campfire:
      return ['campfire.cook', 'campfire.feed', 'campfire.skip', 'proceed'];
    case ROOM_TYPES.speedReviewRoom:
      return ['speedReview.commit', 'speedReview.complete', 'proceed'];
    case ROOM_TYPES.wordDiscovery:
      return ['wordDiscovery.review', 'wordDiscovery.complete', 'proceed'];
    case ROOM_TYPES.dealer:
      return ['dealer.sell', 'dealer.buy', 'dealer.leave', 'proceed'];
    case ROOM_TYPES.encounter:
      return ['encounter.start', 'combat.cycle'];
    case ROOM_TYPES.npcBattle:
      // 'npcBattleSkill.choose' lets the explore session accept the post-victory
      // skill reward selection; without it the session rejects the choice
      // ('actionNotAccepted') and soft-pauses the player on the reward screen.
      return ['npcBattle.start', 'combat.cycle', 'npcBattleSkill.choose'];
    case ROOM_TYPES.boss:
      return ['boss.start', 'combat.cycle'];
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

// Resolve a dialogue TTS descriptor for a prepared greeting frame and attach it
// so the client can play (cache hit) or request (cache miss) audio the moment
// the player reaches the room. The descriptor's key is derived the same way the
// client's on-demand request derives it (MD5 of speakerId:text in
// tts-dialogue-cache), so a pre-warmed WAV is a guaranteed hit.
//
// getDialogueCardAudio with waitForSynthesis:false fires background synthesis
// AND returns the cache descriptor, so this both warms and attaches in one call.
// It is guarded (try/catch + the resolver swallows its own async rejection), so
// a VOICEVOX failure returns null and the greeting is emitted WITHOUT audio —
// the client renders a disabled ♪ and degrades silently.
//
// The resolved descriptor is persisted on the room state (`stateKey`) so rebuilds
// across both build paths (state enrichment, refreshExploreRunwayAfterProceed)
// reuse it without recompute — exactly-once, no retry storms.
async function resolveGreetingAudio(frame, state, stateKey, opts, speaker) {
  if (!frame || !state) return null;
  if (state[stateKey]) return state[stateKey];
  if (typeof opts?.getDialogueCardAudio !== 'function') return null;
  try {
    const audio = await opts.getDialogueCardAudio({
      userId: opts.userId,
      speakerKey: speaker?.speakerKey,
      speakerId: speaker?.speakerId,
      line: frame,
      waitForSynthesis: false,
    });
    if (audio) {
      state[stateKey] = audio;
      return audio;
    }
  } catch {
    // Best-effort; VOICEVOX may be down. Swallow to protect the build. The
    // greeting is still emitted without audio and the client degrades.
  }
  return null;
}

function greetingWithAudio(greeting, audio) {
  if (!greeting) return greeting;
  return audio ? { ...greeting, audio } : greeting;
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

async function buildFriendlyNpcPayload(gm, room, opts) {
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

  const greetingAudio = await resolveGreetingAudio(
    room.friendlyNpc.greeting,
    room.friendlyNpc,
    'greetingAudio',
    opts,
    { speakerKey: room.npc?.id || 'game-master', speakerId: room.npc?.speakerId },
  );

  return {
    kind: 'friendlyNpc',
    npc: room.npc || null,
    offered: cloneExploreValue(room.friendlyNpc.offered || []),
    greeting: greetingWithAudio(room.friendlyNpc.greeting || null, greetingAudio),
  };
}

async function buildShrinePayload(room, opts) {
  if (!room.shrine) {
    room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
  }

  if (!room.shrine.greeting) {
    const knownSet = knownSetForOpts(opts);
    const greetingCandidates = shrineGreetingFrames()
      .map(frame => assembleFrame(frame, {}, { dict: getWordDict() }));
    room.shrine.greeting = selectBestFrame(greetingCandidates, knownSet, { dict: getWordDict() });
  }

  const greetingAudio = await resolveGreetingAudio(
    room.shrine.greeting,
    room.shrine,
    'greetingAudio',
    opts,
    { speakerKey: 'shrine_fox' },
  );

  return {
    kind: 'shrine',
    rewards: cloneExploreValue(SHRINE_REWARDS),
    greeting: greetingWithAudio(cloneExploreValue(room.shrine.greeting || null), greetingAudio),
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

// Combat kind for a room type. Combat rooms carry a prepared start payload so
// they can be entered and fought offline (encounter/boss/npcBattle).
function combatKindForRoom(room) {
  switch (room?.type) {
    case ROOM_TYPES.encounter: return 'encounter';
    case ROOM_TYPES.npcBattle: return 'npcBattle';
    case ROOM_TYPES.boss: return 'boss';
    default: return null;
  }
}

// Shape a prepared combat room into the runway interaction payload. `combatStart`
// is the client-facing form of what startCreatureEncounter returns (enemies/npc/
// flags + the optimistic head), minus server-internal cursor/state. The seed
// chain and combatId are pre-committed by prepareCombatStart so the client can
// run optimistic turns offline and the server replay matches on reconnect.
//
// Trade-off (spec-accepted, same class as Kanji Kombat's pre-rolled wave): enemy
// stat blocks are delivered up to EXPLORE_RUNWAY_AHEAD rooms early. Rewards/XP
// stay server-owned and are only granted when the combat actually resolves.
function buildCombatPayload(gm, room) {
  const kind = combatKindForRoom(room);
  const prepared = room?.preparedCombat || null;
  if (!prepared) {
    // No prepared roll (e.g. combatCycleService unavailable in a rebuild). Emit a
    // shell so the client still knows the room kind; offlineReady stays false.
    return { kind, combatStart: null, seedChain: [], combatId: null, initialStateVersion: 0 };
  }

  const tutorialBossIntro = shouldShowStartingMeadowHinonekoIntro(gm?.meta, gm?.run)
    ? {
        speaker: 'Cid',
        lines: [
          'Careful! This creature is stronger than normal.',
          "You can't befriend this creature, but defeat it and our scientists can collect data.",
          'With enough data, our fusion scientists can add it to your team.',
        ],
      }
    : null;

  const combatStart = {
    enemy: cloneExploreValue(prepared.enemies[0] || null),
    enemies: cloneExploreValue(prepared.enemies || []),
    allies: cloneExploreValue(gm?.run?.creatureParty?.active || []),
    playerGoesFirst: true,
    npc: cloneExploreValue(prepared.npcData || null),
    isBoss: prepared.isBoss === true,
    isNpcBattle: prepared.isNpcBattle === true,
    tutorialBossIntro,
    optimistic: {
      combatId: prepared.combatId,
      stateVersion: 0,
      nextTurnSeed: prepared.turnSeeds[0] || null,
    },
  };

  return {
    kind,
    combatStart,
    seedChain: cloneExploreValue(prepared.turnSeeds || []),
    combatId: prepared.combatId,
    initialStateVersion: 0,
  };
}

async function buildInteractionPayload(gm, room, opts) {
  if (combatKindForRoom(room)) {
    return buildCombatPayload(gm, room);
  }
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
  // Combat rooms are offline-ready only when a prepared start with a non-empty
  // seed chain is attached (offlineReady === preparedCombat present).
  if (combatKindForRoom(room)) {
    if (!interactionPayload?.combatStart?.enemies?.length) missing.push(`${interactionPayload?.kind || room.type}.combatStart`);
    if (!Array.isArray(interactionPayload?.seedChain) || interactionPayload.seedChain.length < 1) {
      missing.push(`${interactionPayload?.kind || room.type}.seedChain`);
    }
    return missing;
  }
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

    // Pre-roll combat rooms so they can be entered and fought offline. Idempotent
    // per room (persisted on room.preparedCombat) — a responseContext rebuild
    // after replay reuses the existing roll rather than re-rolling. Guarded on the
    // service being present (some rebuild paths carry a lean gm).
    if (combatKindForRoom(room) && !room.preparedCombat && gm?.combatCycleService?.prepareCombatStart) {
      gm.combatCycleService.prepareCombatStart(room);
    }

    prepareEntryIngredientDrops(gm, index, currentRoom);
    const entryPayload = buildEntryPayload(gm, room);
    const interactionPayload = await buildInteractionPayload(gm, room, payloadOpts);
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
