import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { hasCookableRecipe } from './services/cooking-service.js';

// ============ TEST ROOM QUEUE ============
// Only used when NODE_ENV=test for deterministic E2E tests

let testRoomQueue = [];

/**
 * Queue specific room types for testing
 * @param {string[]} rooms - Array of room type strings
 */
export function queueTestRooms(rooms) {
  testRoomQueue = [...rooms];
}

/**
 * Clear the test room queue
 */
export function clearTestRoomQueue() {
  testRoomQueue = [];
}

/**
 * Get next room type from queue, or null if empty
 * @returns {string|null}
 */
export function popTestRoomType() {
  if (testRoomQueue.length === 0) return null;
  return testRoomQueue.shift();
}

// Word discovery configuration
export const WORDS_PER_DISCOVERY = 2;

// ============ AREA SYSTEM ============

const __rooms_dirname = dirname(fileURLToPath(import.meta.url));
export const AREAS = JSON.parse(
  readFileSync(join(__rooms_dirname, '../../data/areas.json'), 'utf8')
);

const AREAS_BY_ID = {};
for (const area of AREAS) {
  AREAS_BY_ID[area.id] = area;
}

/**
 * Get 2 random area options, excluding the current area
 */
export function getAreaSelectionOptions(excludeAreaId = null, highestUnlocked = 1) {
  // Return all unlocked areas (highestUnlocked is 1-based: 1 = area 0 only, 2 = areas 0+1)
  return AREAS.filter((_, i) => i < highestUnlocked)
              .filter(a => a.id !== excludeAreaId);
}

/**
 * Get area by ID
 */
export function getAreaById(areaId) {
  return AREAS_BY_ID[areaId] || null;
}

// Room types (encounters, shrine, quiz, wordDiscovery, dealer)
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  wordDiscovery: 'wordDiscovery',
  dealer: 'dealer',
  skillMaster: 'skillMaster',
  whackAMole: 'whackAMole',
  speedReviewRoom: 'speedReviewRoom',
  boss: 'boss',
  npcBattle: 'npcBattle',
  friendlyNpc: 'friendlyNpc',
  support: 'support',
  randomRoom: 'randomRoom',
  campfire: 'campfire'
};

const STARTING_MEADOW_AREA_ID = 'hajimari-no-hiroba';
const STARTING_MEADOW_TUTORIAL_SEQUENCE = [
  ROOM_TYPES.encounter,
  ROOM_TYPES.friendlyNpc,
  ROOM_TYPES.encounter,
  ROOM_TYPES.npcBattle,
  ROOM_TYPES.whackAMole,
  ROOM_TYPES.friendlyNpc,
  ROOM_TYPES.boss
];

const RANDOM_ROOM_BASE_WEIGHTS = Object.freeze({
  [ROOM_TYPES.encounter]: 45,
  [ROOM_TYPES.friendlyNpc]: 18,
  [ROOM_TYPES.whackAMole]: 14,
  [ROOM_TYPES.shrine]: 10,
  [ROOM_TYPES.campfire]: 13
});

const RANDOM_ROOM_TYPES = Object.freeze(Object.keys(RANDOM_ROOM_BASE_WEIGHTS));
const SUPPORT_RANDOM_ROOM_TYPES = new Set([
  ROOM_TYPES.friendlyNpc,
  ROOM_TYPES.whackAMole,
  ROOM_TYPES.shrine,
  ROOM_TYPES.campfire
]);
const COMBAT_LIKE_ROOM_TYPES = new Set([
  ROOM_TYPES.encounter,
  ROOM_TYPES.npcBattle
]);

export function getRandomRoomBaseWeights() {
  return { ...RANDOM_ROOM_BASE_WEIGHTS };
}

function isRandomRoomType(type) {
  return RANDOM_ROOM_TYPES.includes(type);
}

function normalizeGenerationHistory(history = []) {
  return history.map(entry => {
    if (typeof entry === 'string') {
      return { type: entry, random: isRandomRoomType(entry) };
    }
    return {
      type: entry?.type,
      random: entry?.random === true
    };
  });
}

export function getRoomGenerationHistory(rooms = [], beforeRoomNumber = Infinity) {
  return rooms
    .filter(room => room?.roomNumber < beforeRoomNumber)
    .filter(room => room?.type !== ROOM_TYPES.randomRoom)
    .map(room => ({
      type: room?.type,
      random: room?.randomRoomResolved === true
    }));
}

function randomSlotsSinceSeen(randomHistory, type) {
  let slots = 0;
  for (let i = randomHistory.length - 1; i >= 0; i--) {
    if (randomHistory[i].type === type) return slots;
    slots++;
  }
  return slots;
}

function applyPityMultiplier(weight, slotsSinceSeen) {
  if (slotsSinceSeen >= 9) return weight * 2.25;
  if (slotsSinceSeen >= 6) return weight * 1.5;
  return weight;
}

export function applyRoomPacingModifiers(baseWeights, history = []) {
  const weights = { ...baseWeights };
  const normalizedHistory = normalizeGenerationHistory(history);
  const randomHistory = normalizedHistory.filter(entry => entry.random && isRandomRoomType(entry.type));

  const previousRandomType = randomHistory[randomHistory.length - 1]?.type || null;
  const twoRandomSlotsAgoType = randomHistory[randomHistory.length - 2]?.type || null;

  for (const type of SUPPORT_RANDOM_ROOM_TYPES) {
    if (previousRandomType === type) weights[type] = 0;
    else if (twoRandomSlotsAgoType === type) weights[type] *= 0.35;
  }

  const lastThreeRandomTypes = randomHistory.slice(-3).map(entry => entry.type);
  if (
    lastThreeRandomTypes.length === 3 &&
    lastThreeRandomTypes.every(type => SUPPORT_RANDOM_ROOM_TYPES.has(type))
  ) {
    weights[ROOM_TYPES.encounter] *= 2.5;
  }

  const lastFourGeneratedTypes = normalizedHistory.slice(-4).map(entry => entry.type);
  if (
    lastFourGeneratedTypes.length === 4 &&
    lastFourGeneratedTypes.every(type => COMBAT_LIKE_ROOM_TYPES.has(type))
  ) {
    for (const type of SUPPORT_RANDOM_ROOM_TYPES) {
      weights[type] *= 1.75;
    }
  }

  for (const type of RANDOM_ROOM_TYPES) {
    const slotsSinceSeen = randomSlotsSinceSeen(randomHistory, type);
    weights[type] = applyPityMultiplier(weights[type], slotsSinceSeen);
  }

  return weights;
}

export function applyRoomEligibilityFilters(weights, run) {
  const filtered = { ...weights };
  if (!hasCookableRecipe(run?.cooking?.ingredients || {}, { minTotalQuantity: 2 })) {
    filtered[ROOM_TYPES.campfire] = 0;
  }
  return filtered;
}

export function pickWeightedRoomType(weights, rng = Math.random) {
  const entries = RANDOM_ROOM_TYPES
    .map(type => [type, Math.max(0, weights[type] || 0)])
    .filter(([, weight]) => weight > 0);

  if (entries.length === 0) return ROOM_TYPES.encounter;

  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * totalWeight;

  for (const [type, weight] of entries) {
    if (roll < weight) return type;
    roll -= weight;
  }

  return entries[entries.length - 1][0];
}

function pickRandomRoomType(run, room, rng = Math.random) {
  const history = getRoomGenerationHistory(run?.rooms || [], room?.roomNumber || Infinity);
  const paced = applyRoomPacingModifiers(getRandomRoomBaseWeights(), history);
  const eligible = applyRoomEligibilityFilters(paced, run);
  return pickWeightedRoomType(eligible, rng);
}

// ============ ROOM GENERATION ============

/**
 * Check if a room type is a special type (subject to constraints)
 */
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.wordDiscovery ||
         type === ROOM_TYPES.dealer ||
         type === ROOM_TYPES.skillMaster ||
         type === ROOM_TYPES.whackAMole ||
         type === ROOM_TYPES.speedReviewRoom;
}

/**
 * Generate a single room with type constraints
 */
function generateSingleRoom(areaId, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const SHRINE_CHANCE = 0.10;
  const WORD_DISCOVERY_CHANCE = 0.10;
  const DEALER_CHANCE = 0.10;
  const SKILL_MASTER_CHANCE = 0.05;
  const WHACK_A_MOLE_CHANCE = 0.05;
  const SPEED_REVIEW_ROOM_CHANCE = 0.05;

  const queuedType = popTestRoomType();
  let type;

  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else if (forceRoomType && ROOM_TYPES[forceRoomType]) {
    type = ROOM_TYPES[forceRoomType];
  } else if (encountersOnly) {
    type = ROOM_TYPES.encounter;
  } else {
    let attempts = 0;
    do {
      const roll = Math.random();
      if (roll < SHRINE_CHANCE) {
        type = ROOM_TYPES.shrine;
      } else if (roll < SHRINE_CHANCE + WORD_DISCOVERY_CHANCE) {
        type = ROOM_TYPES.wordDiscovery;
      } else if (roll < SHRINE_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE) {
        type = ROOM_TYPES.dealer;
      } else if (roll < SHRINE_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE + SKILL_MASTER_CHANCE) {
        type = ROOM_TYPES.skillMaster;
      } else if (roll < SHRINE_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE + SKILL_MASTER_CHANCE + WHACK_A_MOLE_CHANCE) {
        type = ROOM_TYPES.whackAMole;
      } else if (roll < SHRINE_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE + SKILL_MASTER_CHANCE + WHACK_A_MOLE_CHANCE + SPEED_REVIEW_ROOM_CHANCE) {
        type = ROOM_TYPES.speedReviewRoom;
      } else {
        type = ROOM_TYPES.encounter;
      }
      attempts++;
    } while (
      excludeSpecialType &&
      isSpecialType(type) &&
      type === excludeSpecialType &&
      attempts < 10
    );
  }

  return createRoom(type, areaId, roomNumber, totalRooms);
}

function createStartingMeadowTutorialRooms(area, subAreas) {
  const totalRooms = STARTING_MEADOW_TUTORIAL_SEQUENCE.length;
  return STARTING_MEADOW_TUTORIAL_SEQUENCE.map((type, index) => {
    const room = createRoom(type, STARTING_MEADOW_AREA_ID, index + 1, totalRooms);
    if (subAreas.length > 0) room.subArea = subAreas[index % subAreas.length];
    if (type === ROOM_TYPES.boss && area?.bossCreatureId) {
      room.boss = { creatureId: area.bossCreatureId, defeated: false };
    }
    return room;
  });
}

/**
 * Generate rooms for an area — Koto2: area-defined room count, defaulting to 30
 * Tutorial-mode Starting Meadow uses a scripted 7-room playtest layout.
 * Other short areas: room 6 = npcBattle; 30-room areas: rooms 6, 12, 18, 24.
 * Boss is always the final room. Remaining slots are unresolved random slots finalized on entry.
 *
 * @param {string} areaId - Area ID to generate rooms for
 * @param {number} [_roomCount] - Ignored (kept for backwards-compat); use area.roomCount instead
 * @param {*} [_lastSpecialType] - Ignored
 * @param {boolean} [_encountersOnly] - Ignored
 * @param {*} [_forceRoomType] - Ignored
 */
export function generateAreaRooms(areaId, _roomCount, _lastSpecialType, _encountersOnly, _forceRoomType, tutorialMode = false) {
  // Look up sub-areas for this area
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];

  if (tutorialMode && areaId === STARTING_MEADOW_AREA_ID) {
    return createStartingMeadowTutorialRooms(area, subAreas);
  }

  const totalRooms = area?.roomCount || 30;
  const npcBattleIndices = totalRooms <= 10
    ? new Set([5])
    : new Set([5, 11, 17, 23]);
  const bossIndex = totalRooms - 1;

  const rooms = [];

  for (let i = 0; i < totalRooms; i++) {
    let type;

    if (npcBattleIndices.has(i)) {
      type = ROOM_TYPES.npcBattle;
    } else if (i === bossIndex) {
      type = ROOM_TYPES.boss;
    } else {
      type = ROOM_TYPES.randomRoom;
    }

    const room = createRoom(type, areaId, i + 1, totalRooms);

    if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];

    rooms.push(room);
  }

  // Generic tutorial override for non-scripted areas: guaranteed befriend + item shop.
  if (tutorialMode) {
    if (rooms[0]) rooms[0].type = ROOM_TYPES.encounter;
    if (rooms[1]) {
      rooms[1].type = ROOM_TYPES.friendlyNpc;
      if (!rooms[1].friendlyNpc) {
        rooms[1].friendlyNpc = { offerCategory: 'equipment', offered: null, chosenId: null, completed: false };
      }
    }
  }

  // Attach boss creature if area has one
  if (area?.bossCreatureId) {
    rooms[bossIndex].boss = { creatureId: area.bossCreatureId, defeated: false };
  }

  return rooms;
}

/*
 * OLD generateAreaRooms (16-24 rooms, variable special room types) — commented out for Koto2 rework:
 *
 * export function generateAreaRooms_OLD(areaId, roomCount = 10, lastSpecialType = null, encountersOnly = false, forceRoomType = null) {
 *   const rooms = [];
 *   const totalSlots = roomCount;
 *   let prevSpecialType = lastSpecialType;
 *
 *   const area = getAreaById(areaId);
 *   const subAreas = area?.subAreas || [];
 *
 *   for (let i = 0; i < roomCount; i++) {
 *     const room = generateSingleRoom(areaId, i + 1, totalSlots, prevSpecialType, encountersOnly, forceRoomType);
 *     if (room.type !== 'encounter') prevSpecialType = room.type;
 *     if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];
 *     rooms.push(room);
 *   }
 *
 *   if (area?.bossCreatureId) {
 *     const bossRoom = createRoom(ROOM_TYPES.boss, areaId, rooms.length + 1, rooms.length + 1);
 *     bossRoom.boss = { creatureId: area.bossCreatureId };
 *     if (subAreas.length > 0) bossRoom.subArea = subAreas[rooms.length % subAreas.length];
 *     rooms.push(bossRoom);
 *   }
 *
 *   return rooms;
 * }
 */

/**
 * Create a room object
 */
export function createRoom(type, areaId, roomNumber, totalRooms) {
  const room = {
    id: `${areaId}_room${roomNumber}`,
    type,
    roomNumber,
    totalRooms,
    areaId,
    explored: false,
    interacted: false
  };

  switch (type) {
    case ROOM_TYPES.shrine:
      room.shrine = { used: false, completed: false, chosenReward: null, greeting: null };
      break;
    case ROOM_TYPES.quiz:
      room.quiz = { answered: false, rewarded: false };
      break;
    case ROOM_TYPES.wordDiscovery:
      room.wordDiscovery = {
        wordsToLearn: WORDS_PER_DISCOVERY,
        wordsLearned: 0,
        wordIds: [],
        completed: false
      };
      break;
    case ROOM_TYPES.dealer: {
      room.dealer = {
        visited: false,
        offeredCreatures: [],
        soldCreatures: [],
        purchasedCreature: null
      };
      break;
    }
    case ROOM_TYPES.skillMaster:
      room.skillMaster = { offered: null, chosenId: null, completed: false };
      break;
    case ROOM_TYPES.whackAMole:
      room.whackAMole = { score: 0, completed: false };
      break;
    case ROOM_TYPES.speedReviewRoom:
      room.speedReviewRoom = {
        targetCards: 10,
        reviewedCards: 0,
        completed: false,
        snapshotWordKeys: [],
        awardedReviewKeys: [],
        pendingReviewKeys: [],
        settled: true
      };
      break;
    case ROOM_TYPES.boss:
      room.boss = { defeated: false };
      break;
    case ROOM_TYPES.npcBattle:
      room.npcBattle = {};
      break;
    case ROOM_TYPES.friendlyNpc: {
      room.friendlyNpc = { offerCategory: 'equipment', offered: null, chosenId: null, completed: false };
      break;
    }
    case ROOM_TYPES.support:
      room.support = { resolvedType: null };
      break;
    case ROOM_TYPES.randomRoom:
      room.randomRoom = { resolvedType: null };
      break;
    case ROOM_TYPES.campfire:
      room.campfire = { cookedDish: null, consumed: null, fed: false, completed: false };
      break;
  }

  return room;
}

function hasUnusedIngredients(run) {
  const ingredients = run?.cooking?.ingredients || {};
  return Object.values(ingredients).some(count => count > 0);
}

export function resolveSupportRoomType(run, rng = Math.random) {
  const canCampfire = hasUnusedIngredients(run);
  const roll = rng();
  if (canCampfire && roll < 0.50) return ROOM_TYPES.campfire;
  if (roll < 0.45) return ROOM_TYPES.whackAMole;
  if (roll < 0.50) return ROOM_TYPES.shrine;
  return ROOM_TYPES.friendlyNpc;
}

export function resolveSupportRoom(room, run, rng = Math.random) {
  if (!room || room.type !== ROOM_TYPES.support) return room;

  const resolvedType = room.support?.resolvedType || resolveSupportRoomType(run, rng);
  const resolved = createRoom(resolvedType, room.areaId, room.roomNumber, room.totalRooms);
  resolved.id = room.id;
  resolved.explored = room.explored;
  resolved.interacted = room.interacted;
  if (room.subArea) resolved.subArea = room.subArea;
  resolved.supportResolved = true;

  Object.keys(room).forEach(key => delete room[key]);
  Object.assign(room, resolved);
  return room;
}

export function finalizeRandomRoom(room, run, rng = Math.random) {
  if (!room || room.type !== ROOM_TYPES.randomRoom) return room;

  const resolvedType = room.randomRoom?.resolvedType || pickRandomRoomType(run, room, rng);
  const resolved = createRoom(resolvedType, room.areaId, room.roomNumber, room.totalRooms);
  resolved.id = room.id;
  resolved.explored = room.explored;
  resolved.interacted = room.interacted;
  resolved.randomRoomResolved = true;
  if (room.subArea) resolved.subArea = room.subArea;

  Object.keys(room).forEach(key => delete room[key]);
  Object.assign(room, resolved);
  return room;
}

// ============ ROOM NARRATION ============

/**
 * Get narration for entering a room
 */
export function getRoomEntryNarration(room) {
  const locationLabel = room.subArea
    ? `${room.subArea.name} — ${room.roomNumber}/${room.totalRooms}`
    : `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.encounter:
      return `${locationLabel}に入った。SYSTEM接続された市民がいる！`;
    case ROOM_TYPES.shrine:
      return `${locationLabel}に入った。狐の祠がある。神秘的な力が感じられる...`;
    case ROOM_TYPES.quiz:
      return `${locationLabel}に入った。不思議な老人がいる...「質問に答えよ」`;
    case ROOM_TYPES.wordDiscovery:
      return `${locationLabel}に入った。知識の泉がある...新しい言葉を発見できそうだ。`;
    case ROOM_TYPES.dealer:
      return `${locationLabel}に入った。旅の行商人がいる...「珍しいモンスターがいるよ」`;
    case ROOM_TYPES.skillMaster:
      return `Skill Master — Room ${room.roomNumber}/${room.totalRooms}`;
    case ROOM_TYPES.whackAMole:
      return `${locationLabel}に入った。不思議なゲーム機がある...`;
    case ROOM_TYPES.speedReviewRoom:
      return `${locationLabel}に入った。記憶の装置がある...復習を始めよう。`;
    case ROOM_TYPES.campfire:
      return `${locationLabel}に入った。焚き火がある。料理ができそうだ。`;
    case ROOM_TYPES.support:
      return `${locationLabel}に入った。`;
    case ROOM_TYPES.boss:
      return `${locationLabel}に入った。巨大な影が現れた...`;
    case ROOM_TYPES.friendlyNpc:
      return `${locationLabel}に入った。A friendly face greets you.`;
    case ROOM_TYPES.npcBattle:
      return `${locationLabel}に入った。A challenger blocks your path!`;
    default:
      return `${locationLabel}に入った。`;
  }
}

/**
 * Get available actions for a room
 */
export function getRoomActions(room) {
  const actions = [];

  const isUnfinishedEncounter = room.type === 'encounter' && !room.interacted;
  const isUnfinishedWordDiscovery = room.type === 'wordDiscovery' && !room.interacted;
  const isUnfinishedDealer = room.type === 'dealer' && !room.interacted;
  const isUnfinishedSkillMaster = room.type === 'skillMaster' && room.skillMaster?.completed !== true;
  const isUnfinishedWhackAMole = room.type === 'whackAMole' && !room.interacted;
  const isUnfinishedSpeedReviewRoom = room.type === 'speedReviewRoom' && !room.interacted;
  const isUnfinishedCampfire = room.type === ROOM_TYPES.campfire && room.campfire?.completed !== true;
  const isUnfinishedBoss = room.type === 'boss' && !room.interacted;
  const isUnfinishedShrine = room.type === ROOM_TYPES.shrine
    && !room.interacted
    && room.shrine?.completed !== true
    && room.shrine?.used !== true;
  const isUnfinishedFriendlyNpc = room.type === 'friendlyNpc' && !room.friendlyNpc?.completed;
  const isUnfinishedNpcBattle = room.type === 'npcBattle' && !room.interacted;
  if (!isUnfinishedEncounter && !isUnfinishedShrine && !isUnfinishedWordDiscovery && !isUnfinishedDealer && !isUnfinishedSkillMaster && !isUnfinishedWhackAMole && !isUnfinishedSpeedReviewRoom && !isUnfinishedCampfire && !isUnfinishedBoss && !isUnfinishedFriendlyNpc && !isUnfinishedNpcBattle) {
    actions.push({ id: 'proceed', name: '進む', description: '次のエリアへ進む' });
  }

  switch (room.type) {
    case ROOM_TYPES.shrine:
      if (isUnfinishedShrine) {
        actions.push({ id: 'shrine_reward', name: '祈る', description: '狐の祠に祈る' });
      }
      break;
    case ROOM_TYPES.quiz:
      if (!room.quiz.rewarded) {
        actions.push({ id: 'quiz_answer', name: '答える', description: 'クイズに答える' });
      }
      break;
    case ROOM_TYPES.encounter:
      if (!room.interacted) {
        actions.push({ id: 'fight', name: '解放', description: '市民を解放する' });
      }
      break;
    case ROOM_TYPES.wordDiscovery:
      break;
    case ROOM_TYPES.speedReviewRoom:
      break;
    case ROOM_TYPES.campfire:
      if (isUnfinishedCampfire) {
        actions.push({ id: 'campfire_cook', name: '料理する', description: '焚き火で料理する' });
      }
      break;
    case ROOM_TYPES.dealer:
      if (!room.dealer?.visited) {
        actions.push({ id: 'dealer_trade', name: '取引', description: '行商人と取引する' });
      }
      break;
    case ROOM_TYPES.skillMaster:
      if (!room.interacted && !room.skillMaster?.completed) {
        actions.push({ id: 'skill_master_choose', name: 'Skills', description: 'Choose 1 of 3 party skills' });
      }
      break;
    case ROOM_TYPES.whackAMole:
      if (!room.interacted) {
        actions.push({ id: 'play_whack_a_mole', name: 'プレイ', description: 'ゲームをプレイする' });
      }
      break;
    case ROOM_TYPES.boss:
      if (!room.interacted) {
        actions.push({ id: 'fight', name: 'ボス戦', description: 'ボスに挑む' });
      }
      break;
    case ROOM_TYPES.friendlyNpc:
      if (!room.friendlyNpc?.completed) {
        actions.push({ id: 'friendly_npc_interact', name: '話す', description: 'フレンドリーなNPCと話す' });
      }
      break;
    case ROOM_TYPES.npcBattle:
      if (!room.interacted) {
        actions.push({ id: 'start_encounter', name: '戦う', description: '挑戦者と戦う' });
      }
      break;
  }

  return actions;
}
