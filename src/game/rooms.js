/**
 * @fileoverview Room generation, area system, and exploration mechanics
 * @module src/game/rooms
 *
 * PURPOSE:
 * Manages dungeon exploration through themed areas. Generates room sequences
 * for each area with encounters, optional shrine, quiz, word discovery, and
 * dealer rooms. Areas are loaded from data/new-areas-staging.json and selected
 * randomly (excluding the current area) when the player completes an area.
 *
 * KEY EXPORTS:
 * Area System:
 * - AREAS - All area definitions loaded from JSON
 * - getAreaSelectionOptions(excludeAreaId) - Get 2 random area choices
 * - getAreaById(areaId) - Look up area by ID
 *
 * Room Generation:
 * - generateFloorRooms(areaId, roomCount) - Create room sequence for area
 * - getRoomEntryNarration(room) - Get narrative text for room type
 * - getRoomActions(room) - Get available actions for current room
 * Constants:
 * - ROOM_TYPES - Encounter, shrine, quiz, wordDiscovery, dealer
 *
 * ROOM SEQUENCE:
 * Each area: N rooms (encounters + special rooms). No boss room.
 * Post-combat shop appears after enemy defeats.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  readFileSync(join(__rooms_dirname, '../../data/new-areas-staging.json'), 'utf8')
);

const AREAS_BY_ID = {};
for (const area of AREAS) {
  AREAS_BY_ID[area.id] = area;
}

/**
 * Get 2 random area options, excluding the current area
 */
export function getAreaSelectionOptions(excludeAreaId = null) {
  const pool = AREAS.filter(a => a.id !== excludeAreaId);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
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
  whackAMole: 'whackAMole'
};

// ============ ROOM GENERATION ============

/**
 * Check if a room type is a special type (subject to constraints)
 */
function isSpecialType(type) {
  return type === ROOM_TYPES.shrine ||
         type === ROOM_TYPES.quiz ||
         type === ROOM_TYPES.wordDiscovery ||
         type === ROOM_TYPES.dealer ||
         type === ROOM_TYPES.whackAMole;
}

/**
 * Generate a single room with type constraints
 */
function generateSingleRoom(areaId, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const SHRINE_CHANCE = 0.10;
  const QUIZ_CHANCE = 0.10;
  const WORD_DISCOVERY_CHANCE = 0.10;
  const DEALER_CHANCE = 0.10;
  const WHACK_A_MOLE_CHANCE = 0.05;

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
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
        type = ROOM_TYPES.quiz;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE) {
        type = ROOM_TYPES.wordDiscovery;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE) {
        type = ROOM_TYPES.dealer;
      } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE + WORD_DISCOVERY_CHANCE + DEALER_CHANCE + WHACK_A_MOLE_CHANCE) {
        type = ROOM_TYPES.whackAMole;
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

/**
 * Generate a pair of rooms for a branch choice
 */
function generateBranchPair(areaId, roomNumber, totalRooms, excludeSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const room1 = generateSingleRoom(areaId, roomNumber, totalRooms, excludeSpecialType, encountersOnly, forceRoomType);

  let room2ExcludeType = excludeSpecialType;
  if (isSpecialType(room1.type)) {
    room2ExcludeType = room1.type;
  }

  const room2 = generateSingleRoom(areaId, roomNumber, totalRooms, room2ExcludeType, encountersOnly, forceRoomType);

  return [room1, room2];
}

/**
 * Generate rooms for an area with branching
 * Structure: single first room + branch pairs (no boss)
 */
export function generateFloorRooms(areaId, roomCount = 10, lastSpecialType = null, encountersOnly = false, forceRoomType = null) {
  const rooms = [];
  const totalSlots = roomCount;
  let prevSpecialType = lastSpecialType;

  // Look up sub-areas for this area
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];

  for (let i = 0; i < roomCount; i++) {
    const roomNumber = i + 1;

    if (i === 0) {
      const room = generateSingleRoom(areaId, roomNumber, totalSlots, prevSpecialType, !forceRoomType, forceRoomType);
      if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];
      rooms.push(room);
    } else {
      const pair = generateBranchPair(areaId, roomNumber, totalSlots, prevSpecialType, encountersOnly, forceRoomType);
      if (subAreas.length > 0) {
        const sa = subAreas[i % subAreas.length];
        pair[0].subArea = sa;
        pair[1].subArea = sa;
      }
      rooms.push(pair);
    }
  }

  return rooms;
}

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
        offeredCreatures: [],
        soldCreatures: [],
        purchasedCreature: null
      };
      break;
    }
    case ROOM_TYPES.whackAMole:
      room.whackAMole = { score: 0, completed: false };
      break;
  }

  return room;
}

// ============ ROOM NARRATION ============

/**
 * Get narration for entering a room
 */
export function getRoomEntryNarration(room) {
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
      return `${roomNum}に入った。旅の行商人がいる...「珍しいモンスターがいるよ」`;
    case ROOM_TYPES.whackAMole:
      return `${roomNum}に入った。不思議なゲーム機がある...`;
    default:
      return `${roomNum}に入った。`;
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
  const isUnfinishedWhackAMole = room.type === 'whackAMole' && !room.interacted;
  if (!isUnfinishedEncounter && !isUnfinishedWordDiscovery && !isUnfinishedDealer && !isUnfinishedWhackAMole) {
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
      break;
    case ROOM_TYPES.dealer:
      if (!room.dealer?.visited) {
        actions.push({ id: 'dealer_trade', name: '取引', description: '行商人と取引する' });
      }
      break;
    case ROOM_TYPES.whackAMole:
      if (!room.interacted) {
        actions.push({ id: 'play_whack_a_mole', name: 'プレイ', description: 'ゲームをプレイする' });
      }
      break;
  }

  return actions;
}
