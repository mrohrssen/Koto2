/**
 * @fileoverview Room generation, ward system, and exploration mechanics
 * @module src/game/rooms
 *
 * PURPOSE:
 * Manages dungeon exploration through NEO TOKYO wards. Generates room sequences
 * for each floor with encounters, optional shrine, and boss. Implements the ward
 * path system where players choose their route through Tokyo converging on the
 * Imperial Palace (floor 7).
 *
 * KEY EXPORTS:
 * Ward System:
 * - WARD_INFO - All ward definitions (nerima, shibuya, shinjuku, etc.)
 * - WARD_PATHS - Graph of ward connections
 * - STARTING_WARDS - Available starting ward choices
 * - getStartingWardOptions() / getNextWardOptions(currentWard) - Path selection
 * - getWardInfo(wardId) / getWardTier(wardId) - Ward data access
 *
 * Room Generation:
 * - generateFloorRooms(floor, encountersNeeded) - Create room sequence for floor
 * - getRoomEntryNarration(room) - Get narrative text for room type
 * - getRoomActions(room) - Get available actions for current room
 * - generatePostCombatShop(floor, ownedChips) - Post-battle chip shop
 *
 * Constants:
 * - ROOM_TYPES - Encounter, shrine, boss
 * - FLOOR_NAMES - Ward names for each floor
 *
 * DEPENDENCIES:
 * - ./items/chips.js - generateShopChips, getChipDisplayInfo
 *
 * ROOM SEQUENCE:
 * Each floor: N encounters + optional shrine + boss room.
 * Post-combat shop appears after enemy defeats.
 */

import { generateShopChips, getChipDisplayInfo, getChipPrice, generateDealerChip } from './items/chips.js';

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

// Tokyo Ward names (floor -> ward mapping)
export const FLOOR_NAMES = {
  1: { name: '練馬区', nameEn: 'Nerima Ward', theme: 'residential' },
  2: { name: '中野区', nameEn: 'Nakano Ward', theme: 'otaku' },
  3: { name: '新宿区', nameEn: 'Shinjuku Ward', theme: 'nightlife' },
  4: { name: '池袋区', nameEn: 'Ikebukuro Ward', theme: 'shopping' },
  5: { name: '港区', nameEn: 'Minato Ward', theme: 'corporate' },
  6: { name: '千代田区', nameEn: 'Chiyoda Ward', theme: 'government' },
  7: { name: '皇居', nameEn: 'Imperial Palace', theme: 'system' }
};

// ============ WARD PATH SYSTEM ============
// Tokyo ward graph for path selection - converges to Imperial Palace

export const WARD_INFO = {
  nerima: {
    id: 'nerima',
    name: '練馬区',
    nameEn: 'Nerima Ward',
    theme: '住宅街',
    themeEn: 'Residential',
    tier: 1,
    description: '静かな住宅街。多くの市民がここからSYSTEMに取り込まれた。'
  },
  setagaya: {
    id: 'setagaya',
    name: '世田谷区',
    nameEn: 'Setagaya Ward',
    theme: '学園',
    themeEn: 'Academic',
    tier: 1,
    description: '大学と学校が多い。若い市民たちがSYSTEMに洗脳されている。'
  },
  nakano: {
    id: 'nakano',
    name: '中野区',
    nameEn: 'Nakano Ward',
    theme: 'オタク',
    themeEn: 'Otaku',
    tier: 2,
    description: 'マンガやアニメの聖地。サブカルチャーもSYSTEMに制御されている。'
  },
  shibuya: {
    id: 'shibuya',
    name: '渋谷区',
    nameEn: 'Shibuya Ward',
    theme: 'ファッション',
    themeEn: 'Fashion',
    tier: 2,
    description: '若者の街。トレンドセッターたちがSYSTEMの広告塔に。'
  },
  shinjuku: {
    id: 'shinjuku',
    name: '新宿区',
    nameEn: 'Shinjuku Ward',
    theme: '歓楽街',
    themeEn: 'Entertainment',
    tier: 3,
    description: '眠らない街。ネオンの裏でSYSTEMが全てを監視している。'
  },
  ikebukuro: {
    id: 'ikebukuro',
    name: '池袋区',
    nameEn: 'Ikebukuro Ward',
    theme: '商業',
    themeEn: 'Commerce',
    tier: 3,
    description: '巨大デパートが立ち並ぶ。消費もSYSTEMに最適化されている。'
  },
  minato: {
    id: 'minato',
    name: '港区',
    nameEn: 'Minato Ward',
    theme: '企業',
    themeEn: 'Corporate',
    tier: 4,
    description: '高層ビルが立ち並ぶ。SYSTEMの経済基盤がここにある。'
  },
  chiyoda: {
    id: 'chiyoda',
    name: '千代田区',
    nameEn: 'Chiyoda Ward',
    theme: '政府',
    themeEn: 'Government',
    tier: 4,
    description: '官公庁街。SYSTEMは政治すら支配している。'
  },
  palace: {
    id: 'palace',
    name: '皇居',
    nameEn: 'Imperial Palace',
    theme: 'SYSTEM',
    themeEn: 'System Core',
    tier: 5,
    description: 'SYSTEMのコアが眠る場所。ここで全てが決まる。'
  },
  outskirts: {
    id: 'outskirts',
    name: '外縁部',
    nameEn: 'The Outskirts',
    theme: '荒廃',
    themeEn: 'Wasteland',
    tier: 5,
    description: 'SYSTEMの向こう側。制御を離れた荒野が広がる。'
  }
};

// Ward paths - which wards connect to which
export const WARD_PATHS = {
  // Starting wards (outer Tokyo)
  nerima: { next: ['nakano', 'shibuya'], tier: 1 },
  setagaya: { next: ['nakano', 'shibuya'], tier: 1 },

  // Mid wards
  nakano: { next: ['shinjuku', 'ikebukuro'], tier: 2 },
  shibuya: { next: ['shinjuku', 'ikebukuro'], tier: 2 },

  // Inner wards
  shinjuku: { next: ['minato', 'chiyoda'], tier: 3 },
  ikebukuro: { next: ['minato', 'chiyoda'], tier: 3 },

  // Core wards
  minato: { next: ['palace'], tier: 4 },
  chiyoda: { next: ['palace'], tier: 4 },

  // Final
  palace: { next: ['outskirts'], tier: 5, isFinal: true },

  // Endless
  outskirts: { next: ['outskirts'], tier: 5 }
};

// Starting ward options
export const STARTING_WARDS = ['nerima', 'setagaya'];

/**
 * Get starting ward options for run start
 * @returns {Array} Array of ward info objects
 */
export function getStartingWardOptions() {
  return STARTING_WARDS.map(id => ({
    ...WARD_INFO[id],
    paths: WARD_PATHS[id]
  }));
}

/**
 * Get next ward options after clearing current ward
 * @param {string} currentWard - Current ward ID
 * @returns {Array} Array of ward info objects (or empty if at palace)
 */
export function getNextWardOptions(currentWard) {
  const paths = WARD_PATHS[currentWard];
  if (!paths || paths.next.length === 0) {
    return [];
  }

  return paths.next.map(id => ({
    ...WARD_INFO[id],
    paths: WARD_PATHS[id]
  }));
}

/**
 * Get ward tier (difficulty level)
 * @param {string} wardId - Ward ID
 * @returns {number} Tier (1-5)
 */
export function getWardTier(wardId) {
  return WARD_PATHS[wardId]?.tier || 1;
}

/**
 * Get ward info by ID
 * @param {string} wardId - Ward ID
 * @returns {object} Ward info or null
 */
export function getWardInfo(wardId) {
  return WARD_INFO[wardId] || null;
}

// Room types (simplified: encounters, shrine, boss)
export const ROOM_TYPES = {
  encounter: 'encounter',       // Combat encounter (possessed citizen)
  shrine: 'shrine',             // Fox shrine (chip upgrade)
  quiz: 'quiz',                 // Quiz master (reward room)
  wordDiscovery: 'wordDiscovery', // Learn new vocabulary
  dealer: 'dealer',              // Robot dealer (sell chips, buy uncommon+)
  boss: 'boss'                  // Floor boss
};

// ============ ROOM GENERATION ============

/**
 * Check if a room type is a special type (subject to constraints)
 * @param {string} type - Room type
 * @returns {boolean}
 */
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.quiz ||
         type === ROOM_TYPES.wordDiscovery ||
         type === ROOM_TYPES.dealer;
}

/**
 * Generate a single room with type constraints
 * @param {number} floor - Current floor (1-7)
 * @param {number} roomNumber - Room number in sequence
 * @param {number} totalRooms - Total rooms in floor
 * @param {string|null} excludeSpecialType - Special type to exclude (for back-to-back constraint)
 * @returns {object} Room object
 */
function generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false) {
  const SHRINE_CHANCE = 0.10;          // 10% chance for shrine
  const QUIZ_CHANCE = 0.10;            // 10% chance for quiz
  const WORD_DISCOVERY_CHANCE = 0.10;  // 10% chance for word discovery
  const DEALER_CHANCE = 0.10;          // 10% chance for dealer

  // Check test queue first (for deterministic E2E tests)
  const queuedType = popTestRoomType();
  let type;

  if (queuedType && ROOM_TYPES[queuedType]) {
    type = ROOM_TYPES[queuedType];
  } else if (encountersOnly) {
    type = ROOM_TYPES.encounter;
  } else {
    // Generate with constraints
    let attempts = 0;
    do {
      const roll = Math.random();
      if (roll < SHRINE_CHANCE) {
        type = ROOM_TYPES.shrine;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
        type = ROOM_TYPES.quiz;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE) {
        type = ROOM_TYPES.wordDiscovery;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE) {
        type = ROOM_TYPES.dealer;
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

  return createRoom(type, floor, roomNumber, totalRooms);
}

/**
 * Generate a pair of rooms for a branch choice
 * Constraints: no duplicate special types in pair, no back-to-back same special
 * @param {number} floor - Current floor (1-7)
 * @param {number} roomNumber - Room number in sequence
 * @param {number} totalRooms - Total rooms in floor
 * @param {string|null} excludeSpecialType - Special type to exclude (for back-to-back constraint)
 * @returns {Array} Array of 2 room objects
 */
function generateBranchPair(floor, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false) {
  const room1 = generateSingleRoom(floor, roomNumber, totalRooms, excludeSpecialType, encountersOnly);

  // For room2, also exclude room1's type if it's special
  let room2ExcludeType = excludeSpecialType;
  if (isSpecialType(room1.type)) {
    room2ExcludeType = room1.type;
  }

  const room2 = generateSingleRoom(floor, roomNumber, totalRooms, room2ExcludeType, encountersOnly);

  return [room1, room2];
}

/**
 * Generate rooms for a floor with branching
 * Structure: single first room + branch pairs + single boss
 * @param {number} floor - Current floor (1-7)
 * @param {number} encountersNeeded - Number of room slots before boss
 * @param {string|null} lastSpecialType - Last special room type completed (for back-to-back constraint)
 * @param {boolean} encountersOnly - If true, all rooms are encounters (robot combat MVP)
 * @returns {Array} Array of room objects (singles) or pairs (arrays of 2)
 */
export function generateFloorRooms(floor, encountersNeeded = 3, lastSpecialType = null, encountersOnly = false) {
  const rooms = [];
  const totalSlots = encountersNeeded + 1; // +1 for boss
  let prevSpecialType = lastSpecialType;

  for (let i = 0; i < encountersNeeded; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      // First room: single (auto-entered)
      const room = generateSingleRoom(floor, roomNumber, totalSlots, prevSpecialType, encountersOnly);
      if (isSpecialType(room.type)) {
        prevSpecialType = room.type;
      }
      rooms.push(room);
    } else {
      // Middle rooms: branch pairs
      const pair = generateBranchPair(floor, roomNumber, totalSlots, prevSpecialType, encountersOnly);
      rooms.push(pair);
      // Note: prevSpecialType updates when player makes selection (in selectBranch)
    }
  }

  // Boss room (always last, single)
  rooms.push(createRoom(ROOM_TYPES.boss, floor, totalSlots, totalSlots));

  return rooms;
}

/**
 * Create a room object
 */
function createRoom(type, floor, roomNumber, totalRooms) {
  const room = {
    id: `floor${floor}_room${roomNumber}`,
    type,
    roomNumber,
    totalRooms,
    floor,
    explored: false,
    interacted: false
  };

  switch (type) {
    case ROOM_TYPES.shrine:
      room.shrine = { used: false };
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
        offeredRobots: [],  // populated lazily when player enters room
        soldRobots: [],
        purchasedRobot: null
      };
      break;
    }

    case ROOM_TYPES.boss:
      room.isBossRoom = true;
      break;
  }

  return room;
}

// ============ ROOM NARRATION ============

/**
 * Get narration for entering a room
 */
export function getRoomEntryNarration(room) {
  const wardInfo = FLOOR_NAMES[room.floor] || { name: '不明なエリア' };
  const roomNum = `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.encounter:
      return `${roomNum}に入った。SYSTEM接続された市民がいる！`;

    case ROOM_TYPES.shrine:
      return `${roomNum}に入った。狐の祠がある。神秘的な力が感じられる...`;

    case ROOM_TYPES.quiz:
      return `${roomNum}に入った。不思議な老人がいる...「質問に答えよ」`;

    case ROOM_TYPES.wordDiscovery:
      return `${roomNum}に入った。知識の泉がある...新しい言葉を発見できそうだ。`;

    case ROOM_TYPES.dealer:
      return `${roomNum}に入った。怪しいロボット商人がいる...「良いボットがあるよ」`;

    case ROOM_TYPES.boss:
      return `${wardInfo.name}の中心部に入った。強力なSYSTEM反応がある...ボスがいる！`;

    default:
      return `${roomNum}に入った。`;
  }
}

/**
 * Get available actions for a room
 */
export function getRoomActions(room) {
  const actions = [];

  // All rooms have "proceed" except boss room, unfinished encounter rooms, and unfinished wordDiscovery rooms
  const isUnfinishedEncounter = room.type === 'encounter' && !room.interacted;
  const isUnfinishedWordDiscovery = room.type === 'wordDiscovery' && !room.interacted;
  const isUnfinishedDealer = room.type === 'dealer' && !room.interacted;
  if (!room.isBossRoom && !isUnfinishedEncounter && !isUnfinishedWordDiscovery && !isUnfinishedDealer) {
    actions.push({ id: 'proceed', name: '進む', description: '次のエリアへ進む' });
  }

  switch (room.type) {
    case ROOM_TYPES.shrine:
      if (!room.shrine.used) {
        actions.push({ id: 'shrine_upgrade', name: '祈る', description: '狐の祠に祈る' });
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
      // No action buttons - flash cards appear automatically
      break;

    case ROOM_TYPES.dealer:
      if (!room.dealer?.visited) {
        actions.push({ id: 'dealer_trade', name: '取引', description: 'ロボット商人と取引する' });
      }
      break;

    case ROOM_TYPES.boss:
      actions.push({ id: 'boss_fight', name: 'ボス戦', description: 'エリアボスに挑む' });
      break;
  }

  return actions;
}

// ============ POST-COMBAT CHIP SHOP ============

/**
 * Generate 3 random pipeline chips for post-combat shop
 * Pipeline chips provide sequential damage modification during attacks
 * @param {number} floor - Current floor (1-7)
 * @param {array} ownedChipIds - IDs of chips player already owns (unique only)
 * @param {string} rarity - Optional rarity filter (e.g., 'common')
 * @returns {Array} Array of 3 chip items with id, name, price, type, effects
 */
export function generatePostCombatShop(floor, ownedChipIds = [], rarity = null) {
  // Only show pipeline chips in post-combat shop
  const chips = generateShopChips(floor, ownedChipIds, 3, 'pipeline', rarity);

  // Transform to shop item format (chips are free post-combat rewards)
  return chips.map(chip => {
    const displayInfo = getChipDisplayInfo(chip);
    return {
      itemId: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      descriptionEn: chip.descriptionEn,
      price: getChipPrice(chip.id),
      type: 'chip',
      category: chip.category,
      rarity: chip.rarity,
      rarityColor: displayInfo.rarityInfo.color,
      rarityName: displayInfo.rarityInfo.name,
      effectText: displayInfo.effectText,
      effects: chip.effects,
      skill: chip.skill,
      stats: chip.stats,
      quantity: 1
    };
  });
}
