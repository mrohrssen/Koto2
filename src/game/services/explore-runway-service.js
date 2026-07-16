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
  acceptedExploreActionsForRoom,
  cloneExploreValue,
  ensureExploreSessionEpoch,
  EXPLORE_RUNWAY_AHEAD,
  predictedEffectsForAction,
  roomDependenciesForType,
} from './explore-session-contract.js';
import {
  ensureTurnSeeds,
  PVE_TURN_SEED_CHAIN_TARGET,
} from './combat-seed-chain.js';
import {
  COOKING_INGREDIENTS,
  COOKING_RECIPES,
  getCookableRecipeHints,
  getIngredientCount,
  rollRoomIngredientDrops,
} from './cooking-service.js';
import { rollFriendlyNpcOffers } from './friendly-npc-offers.js';
import { shouldShowStartingMeadowHinonekoIntro } from './tutorial-service.js';
import { buildWhackAMoleDialogueContent } from './whack-a-mole-content.js';
import { buildWhackAMolePool } from './whack-a-mole-pool.js';

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
    roomId: room.id,
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
    roomId: room.id,
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
    roomId: room.id,
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
    roomId: room.id,
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

async function buildWhackAMolePayload(gm, room, opts) {
  room.whackAMole ||= { score: 0, completed: false };
  const state = room.whackAMole;
  const knownSet = knownSetForOpts(opts);

  const content = buildWhackAMoleDialogueContent(knownSet);
  if (!state.dialogue?.tokens?.length) state.dialogue = content.dialogue;

  const poolBuilder = typeof opts?.buildWhackAMolePool === 'function'
    ? opts.buildWhackAMolePool
    : buildWhackAMolePool;
  const pool = poolBuilder(gm?.run);

  const dialogueAudio = await resolveGreetingAudio(
    state.dialogue,
    state,
    'dialogueAudio',
    opts,
    { speakerKey: 'game-master' },
  );

  return {
    kind: 'whackAMole',
    roomId: room.id,
    dialogue: greetingWithAudio(cloneExploreValue(state.dialogue || null), dialogueAudio),
    yesTokens: content.yesTokens,
    noTokens: content.noTokens,
    pool: cloneExploreValue(pool || []),
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
    roomId: room.id,
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

function sanitizeWordDiscoveryWord(card, dict = getWordDict()) {
  const word = String(card?.word || card?.id || '').trim();
  const entry = word ? dict.get(word) : null;
  const suppliedMeanings = Array.isArray(card?.meanings)
    ? card.meanings
    : (card?.meaning ? [card.meaning] : []);
  const meanings = suppliedMeanings
    .map(meaning => String(meaning || '').trim())
    .filter(Boolean);

  return {
    word,
    reading: String(card?.reading || entry?.reading || '').trim(),
    meanings: meanings.length > 0
      ? meanings
      : (entry?.definitions || []).map(definition => String(definition?.en || '').trim()).filter(Boolean),
  };
}

function validDiscoveryStatus(status) {
  return Number.isInteger(status?.todayCount)
    && status.todayCount >= 0
    && Number.isInteger(status?.dailyLimit)
    && status.dailyLimit >= 0
    && typeof status?.atLimit === 'boolean';
}

async function buildWordDiscoveryPayload(room, opts) {
  if (!room.wordDiscovery) {
    room.wordDiscovery = {
      wordsToLearn: 2,
      wordsLearned: 0,
      wordIds: [],
      completed: false,
    };
  }

  const state = room.wordDiscovery;
  if (state.snapshotInitialized !== true && typeof opts?.getDiscoveryStatus === 'function') {
    try {
      const requestedLimit = Number.isInteger(opts?.dailyWordLimit) && opts.dailyWordLimit >= 0
        ? opts.dailyWordLimit
        : 10;
      const rawStatus = await Promise.resolve(opts.getDiscoveryStatus(requestedLimit));
      if (validDiscoveryStatus(rawStatus)) {
        const dailyLimit = rawStatus.dailyLimit;
        const todayCount = rawStatus.todayCount;
        const atLimit = rawStatus.atLimit === true || dailyLimit === 0 || todayCount >= dailyLimit;
        const remainingAllowance = atLimit ? 0 : Math.max(0, dailyLimit - todayCount);
        const targetWords = Math.max(0, Number(state.wordsToLearn) || 2);
        const snapshotLimit = Math.min(targetWords, remainingAllowance);

        let result = { words: [], available: false };
        if (snapshotLimit > 0 && typeof opts?.getDiscoveryWords === 'function') {
          result = await Promise.resolve(opts.getDiscoveryWords(snapshotLimit)) || result;
        }
        if (snapshotLimit === 0 || typeof opts?.getDiscoveryWords === 'function') {
          const rawWords = Array.isArray(result) ? result : result?.words;
          const snapshotWords = (Array.isArray(rawWords) ? rawWords : [])
            .slice(0, snapshotLimit)
            .map(word => sanitizeWordDiscoveryWord(word));
          const snapshotWordKeys = snapshotWords.map(word => word.word);

          state.snapshotWords = snapshotWords;
          state.snapshotWordKeys = snapshotWordKeys;
          state.wordIds = [...snapshotWordKeys];
          state.wordsLearned = 0;
          state.reviewedWordKeys = [];
          state.todayCount = todayCount;
          state.dailyLimit = dailyLimit;
          state.atLimit = atLimit;
          state.available = snapshotWords.length > 0;
          state.snapshotInitialized = true;
        }
      }
    } catch {
      // Discovery preparation is best-effort. Leave the snapshot uninitialized
      // so the runway advertises explicit missing capability reasons instead of
      // failing the entire enriched-state response.
    }
  }

  return {
    kind: 'wordDiscovery',
    roomId: room.id,
    snapshotInitialized: state.snapshotInitialized === true,
    snapshotWords: cloneExploreValue(state.snapshotWords || []),
    snapshotWordKeys: cloneExploreValue(state.snapshotWordKeys || []),
    todayCount: state.todayCount,
    dailyLimit: state.dailyLimit,
    atLimit: state.atLimit,
    available: state.available,
    wordsLearned: state.wordsLearned,
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

function combatLifecycleForRoom(gm, room, { index, currentRoom }) {
  if (index === currentRoom && gm?.combat?.active) return 'active';
  if (room?.interacted) return 'resolved';
  return 'notStarted';
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
function buildPreparedCombatPayload(gm, room) {
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

function buildActiveCombatPayload(gm, room) {
  const seedChain = ensureTurnSeeds(gm.combat, {
    target: PVE_TURN_SEED_CHAIN_TARGET,
  });
  const optimistic = gm.combat.optimistic;

  return {
    kind: combatKindForRoom(room),
    lifecycle: 'active',
    combatStart: {
      enemy: cloneExploreValue(gm.combat.enemies?.[0] || null),
      enemies: cloneExploreValue(gm.combat.enemies || []),
      allies: cloneExploreValue(gm.run?.creatureParty?.active || []),
      playerGoesFirst: true,
      npc: cloneExploreValue(gm.combat.npcData || null),
      isBoss: gm.combat.isBoss === true,
      isNpcBattle: Boolean(gm.combat.npcId || gm.combat.npcData),
      tutorialBossIntro: null,
      optimistic: {
        combatId: optimistic.combatId,
        stateVersion: optimistic.stateVersion,
        nextTurnSeed: optimistic.nextTurnSeed,
      },
    },
    seedChain: cloneExploreValue(seedChain),
    combatId: optimistic.combatId,
    initialStateVersion: optimistic.stateVersion,
  };
}

function buildResolvedCombatPayload(room) {
  return {
    kind: combatKindForRoom(room),
    lifecycle: 'resolved',
    combatStart: null,
    seedChain: [],
    combatId: null,
    initialStateVersion: 0,
  };
}

function buildResolvedNpcBattleSkillPayload(gm, room, opts) {
  const ensured = gm?.explorationService?.ensureNpcBattleSkillOffers?.(room);
  const offered = Array.isArray(ensured?.offered)
    ? ensured.offered
    : (room?.npcBattle?.offered || [])
      .map(offer => getPartySkillOfferDisplay(offer, gm?.run?.partySkills || []))
      .filter(Boolean);
  return {
    kind: 'npcBattle',
    roomId: room.id,
    lifecycle: 'resolved',
    rewardPending: true,
    offered: cloneExploreValue(offered),
    skillSelectPrompt: getEligibleFrameTokens(
      skillSelectFrame(),
      knownSetForOpts(opts),
      { dict: getWordDict() },
    ),
  };
}

async function buildInteractionPayload(gm, room, opts) {
  if (combatKindForRoom(room)) {
    return buildPreparedCombatPayload(gm, room);
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
    case ROOM_TYPES.wordDiscovery:
      return buildWordDiscoveryPayload(room, opts);
    case ROOM_TYPES.whackAMole:
      return buildWhackAMolePayload(gm, room, opts);
    default:
      return { kind: room?.type || 'room' };
  }
}

function addPayloadIdentityReasons(room, interactionPayload, missing) {
  if (interactionPayload?.kind !== room?.type) missing.push(`${room?.type}.kind`);
  if (interactionPayload?.roomId !== room?.id) missing.push(`${room?.type}.roomId`);
}

function validSkillOffers(offers) {
  return Array.isArray(offers)
    && offers.length > 0
    && offers.every(offer => (
      typeof offer?.id === 'string'
      && offer.id.length > 0
      && typeof (offer.title || offer.name) === 'string'
      && (offer.title || offer.name).length > 0
      && typeof offer?.desc === 'string'
    ));
}

function validFriendlyNpcOffers(offers) {
  return Array.isArray(offers)
    && offers.length > 0
    && offers.every(item => (
      typeof item?.id === 'string'
      && item.id.length > 0
      && typeof item?.word === 'string'
      && item.word.length > 0
      && typeof item?.reading === 'string'
      && item.reading.length > 0
      && Array.isArray(item?.tokens)
      && item.tokens.length > 0
      && Array.isArray(item?.words)
      && item.words.length > 0
    ));
}

export function missingPayloadReasonsFor(room, interactionPayload) {
  const missing = [];
  if (room?.type === ROOM_TYPES.npcBattle && room.interacted === true) {
    if (room.npcBattle?.skillSelectionPending === true) {
      if (interactionPayload?.kind !== 'npcBattle') missing.push('npcBattle.kind');
      if (interactionPayload?.roomId !== room.id) missing.push('npcBattle.roomId');
      if (interactionPayload?.lifecycle !== 'resolved') missing.push('npcBattle.lifecycle');
      if (interactionPayload?.rewardPending !== true) missing.push('npcBattle.rewardPending');
      if (!validSkillOffers(interactionPayload?.offered)) missing.push('npcBattle.offered');
      if (!interactionPayload?.skillSelectPrompt?.tokens?.length) {
        missing.push('npcBattle.skillSelectPrompt');
      }
    }
    return missing;
  }
  // Not-started and active combat payloads need enemies plus a non-empty seed
  // chain. Resolved combat shells bypass this validator in buildExploreRunway.
  if (combatKindForRoom(room)) {
    if (!interactionPayload?.combatStart?.enemies?.length) missing.push(`${interactionPayload?.kind || room.type}.combatStart`);
    if (!Array.isArray(interactionPayload?.seedChain) || interactionPayload.seedChain.length < 1) {
      missing.push(`${interactionPayload?.kind || room.type}.seedChain`);
    }
    return missing;
  }
  if (room?.type === ROOM_TYPES.friendlyNpc) {
    addPayloadIdentityReasons(room, interactionPayload, missing);
    if (!interactionPayload?.npc) missing.push('friendlyNpc.npc');
    if (!validFriendlyNpcOffers(interactionPayload?.offered)) {
      missing.push('friendlyNpc.offered');
    }
    if (!interactionPayload?.greeting?.tokens?.length) missing.push('friendlyNpc.greeting');
  }
  if (room?.type === ROOM_TYPES.shrine) {
    addPayloadIdentityReasons(room, interactionPayload, missing);
    if (
      !Array.isArray(interactionPayload?.rewards)
      || interactionPayload.rewards.length === 0
      || interactionPayload.rewards.some(reward => (
        !reward?.id || !reward?.title || !reward?.description
      ))
    ) {
      missing.push('shrine.rewards');
    }
    if (!interactionPayload?.greeting?.tokens?.length) missing.push('shrine.greeting');
    if (typeof interactionPayload?.completed !== 'boolean') missing.push('shrine.completed');
  }
  if (room?.type === ROOM_TYPES.skillMaster) {
    addPayloadIdentityReasons(room, interactionPayload, missing);
    if (!validSkillOffers(interactionPayload?.offered)) {
      missing.push('skillMaster.offered');
    }
    if (!interactionPayload?.skillSelectPrompt?.tokens?.length) {
      missing.push('skillMaster.skillSelectPrompt');
    }
    if (typeof interactionPayload?.completed !== 'boolean') missing.push('skillMaster.completed');
  }
  if (room?.type === ROOM_TYPES.campfire) {
    addPayloadIdentityReasons(room, interactionPayload, missing);
    if (!interactionPayload?.ingredients || typeof interactionPayload.ingredients !== 'object') {
      missing.push('campfire.ingredients');
    }
    if (!Array.isArray(interactionPayload?.ingredientCatalog)) {
      missing.push('campfire.ingredientCatalog');
    }
    if (!Number.isInteger(interactionPayload?.ingredientCount) || interactionPayload.ingredientCount < 0) {
      missing.push('campfire.ingredientCount');
    }
    if (!Array.isArray(interactionPayload?.discoveredRecipes)) {
      missing.push('campfire.discoveredRecipes');
    }
    if (!Array.isArray(interactionPayload?.cookableRecipeHints)) {
      missing.push('campfire.cookableRecipeHints');
    }
    if (!Array.isArray(interactionPayload?.recipes)) missing.push('campfire.recipes');
    if (
      !interactionPayload?.room
      || typeof interactionPayload.room !== 'object'
      || interactionPayload.room.id !== room.id
      || interactionPayload.room.type !== ROOM_TYPES.campfire
    ) {
      missing.push('campfire.room');
    }
    if (!interactionPayload?.yesTokens?.tokens?.length) missing.push('campfire.yesTokens');
    if (!interactionPayload?.noTokens?.tokens?.length) missing.push('campfire.noTokens');
  }
  if (room?.type === ROOM_TYPES.dealer) {
    addPayloadIdentityReasons(room, interactionPayload, missing);
    if (!interactionPayload?.dealer || typeof interactionPayload.dealer !== 'object') {
      missing.push('dealer.dealer');
    }
    if (!Array.isArray(interactionPayload?.offeredCreatures)) missing.push('dealer.offeredCreatures');
    if (!Array.isArray(interactionPayload?.partyCreatures)) missing.push('dealer.partyCreatures');
    if (!Number.isFinite(interactionPayload?.credits) || interactionPayload.credits < 0) {
      missing.push('dealer.credits');
    }
    if (typeof interactionPayload?.canBuy !== 'boolean') missing.push('dealer.canBuy');
    if (!Number.isInteger(interactionPayload?.sellCount) || interactionPayload.sellCount < 0) {
      missing.push('dealer.sellCount');
    }
    if (!Number.isInteger(interactionPayload?.maxSells) || interactionPayload.maxSells < 0) {
      missing.push('dealer.maxSells');
    }
  }
  if (room?.type === ROOM_TYPES.speedReviewRoom) {
    if (
      interactionPayload?.snapshotInitialized !== true
      || !Array.isArray(interactionPayload?.snapshotWords)
    ) {
      missing.push('speedReviewRoom.snapshotWords');
    }
    if (
      !Array.isArray(interactionPayload?.snapshotWordKeys)
      || interactionPayload.snapshotWordKeys.length !== (interactionPayload?.snapshotWords?.length || 0)
    ) {
      missing.push('speedReviewRoom.snapshotWordKeys');
    }
  }
  if (room?.type === ROOM_TYPES.wordDiscovery) {
    if (!interactionPayload?.roomId || interactionPayload.roomId !== room.id) {
      missing.push('wordDiscovery.roomId');
    }
    const snapshotWords = interactionPayload?.snapshotWords;
    const hasCompleteSnapshot = interactionPayload?.snapshotInitialized === true
      && Array.isArray(snapshotWords)
      && snapshotWords.every(word => (
        typeof word?.word === 'string'
        && word.word.length > 0
        && typeof word?.reading === 'string'
        && word.reading.length > 0
        && Array.isArray(word?.meanings)
        && word.meanings.length > 0
        && word.meanings.every(meaning => typeof meaning === 'string' && meaning.length > 0)
      ));
    if (!hasCompleteSnapshot) missing.push('wordDiscovery.snapshotWords');

    const snapshotWordKeys = interactionPayload?.snapshotWordKeys;
    const hasMatchingKeys = Array.isArray(snapshotWordKeys)
      && Array.isArray(snapshotWords)
      && snapshotWordKeys.length === snapshotWords.length
      && snapshotWordKeys.every((key, index) => key === snapshotWords[index]?.word);
    if (!hasMatchingKeys) missing.push('wordDiscovery.snapshotWordKeys');

    const hasValidStatus = Number.isInteger(interactionPayload?.todayCount)
      && interactionPayload.todayCount >= 0
      && Number.isInteger(interactionPayload?.dailyLimit)
      && interactionPayload.dailyLimit >= 0
      && typeof interactionPayload?.atLimit === 'boolean'
      && typeof interactionPayload?.available === 'boolean'
      && interactionPayload.atLimit === (
        interactionPayload.dailyLimit === 0
        || interactionPayload.todayCount >= interactionPayload.dailyLimit
      )
      && interactionPayload.available === (snapshotWords?.length > 0)
      && (!interactionPayload.atLimit || snapshotWords?.length === 0)
      && (
        interactionPayload.atLimit
        || snapshotWords?.length <= interactionPayload.dailyLimit - interactionPayload.todayCount
      );
    if (!hasValidStatus) missing.push('wordDiscovery.status');

    const wordsLearned = interactionPayload?.wordsLearned;
    if (
      !Number.isInteger(wordsLearned)
      || wordsLearned < 0
      || !Array.isArray(snapshotWords)
      || wordsLearned > snapshotWords.length
    ) {
      missing.push('wordDiscovery.wordsLearned');
    }
  }
  if (room?.type === ROOM_TYPES.whackAMole) {
    if (!interactionPayload?.roomId || interactionPayload.roomId !== room.id) {
      missing.push('whackAMole.roomId');
    }
    if (!interactionPayload?.dialogue?.tokens?.length) missing.push('whackAMole.dialogue');
    if (!interactionPayload?.yesTokens?.tokens?.length) missing.push('whackAMole.yesTokens');
    if (!interactionPayload?.noTokens?.tokens?.length) missing.push('whackAMole.noTokens');
    const pool = interactionPayload?.pool;
    const hasCompletePool = Array.isArray(pool)
      && pool.length >= 9
      && pool.every(entry => (
        entry?.id
        && entry?.type
        && entry?.word
        && entry?.reading
        && entry?.meaning
        && entry?.sprite
      ));
    if (!hasCompletePool) missing.push('whackAMole.pool');
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

    if (
      room.type === ROOM_TYPES.npcBattle
      && room.interacted === true
      && room.npcBattle?.skillSelectionPending === true
    ) {
      gm.explorationService?.ensureNpcBattleSkillOffers?.(room);
    }
    const lifecycle = combatKindForRoom(room)
      ? combatLifecycleForRoom(gm, room, { index, currentRoom })
      : null;
    if (lifecycle === 'active' || lifecycle === 'resolved') {
      delete room.preparedCombat;
    }

    // Pre-roll combat rooms so they can be entered and fought offline. Idempotent
    // per room (persisted on room.preparedCombat) — a responseContext rebuild
    // after replay reuses the existing roll rather than re-rolling. Guarded on the
    // service being present (some rebuild paths carry a lean gm).
    if (
      lifecycle === 'notStarted'
      && !room.preparedCombat
      && gm?.combatCycleService?.prepareCombatStart
    ) {
      gm.combatCycleService.prepareCombatStart(room);
    }

    prepareEntryIngredientDrops(gm, index, currentRoom);
    const entryPayload = buildEntryPayload(gm, room);
    const pendingNpcBattleSkillReward = lifecycle === 'resolved'
      && room.type === ROOM_TYPES.npcBattle
      && room.npcBattle?.skillSelectionPending === true;
    const interactionPayload = lifecycle === 'active'
      ? buildActiveCombatPayload(gm, room)
      : lifecycle === 'resolved'
        ? (pendingNpcBattleSkillReward
            ? buildResolvedNpcBattleSkillPayload(gm, room, payloadOpts)
            : buildResolvedCombatPayload(room))
        : await buildInteractionPayload(gm, room, payloadOpts);
    const acceptedActions = acceptedExploreActionsForRoom(room, {
      combat: gm?.combat,
      isCurrentRoom: index === currentRoom,
      includeProjectedCombatCycle: true,
    });
    const missingPayloadReasons = lifecycle === 'resolved' && !pendingNpcBattleSkillReward
      ? []
      : missingPayloadReasonsFor(room, interactionPayload);

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
