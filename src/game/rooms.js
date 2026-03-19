/**
 * @fileoverview Room generation, area system, and exploration mechanics
 * @module src/game/rooms
 *
 * PURPOSE:
 * Manages dungeon exploration through themed areas. Generates room sequences
 * for each area with encounters, optional shrine, quiz, word discovery, and
 * dealer rooms. Areas are loaded from data/areas.json and selected
 * randomly (excluding the current area) when the player completes an area.
 *
 * KEY EXPORTS:
 * Area System:
 * - AREAS - All area definitions loaded from JSON
 * - getAreaSelectionOptions(excludeAreaId) - Get 2 random area choices
 * - getAreaById(areaId) - Look up area by ID
 *
 * Room Generation:
 * - generateAreaRooms(areaId, roomCount) - Create room sequence for area
 * - getRoomEntryNarration(room) - Get narrative text for room type
 * - getRoomActions(room) - Get available actions for current room
 * Constants:
 * - ROOM_TYPES - Encounter, shrine, quiz, wordDiscovery, dealer, boss
 *
 * ROOM SEQUENCE:
 * Each area: N rooms (encounters + special rooms). Boss room appended if area has bossCreatureId.
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
  readFileSync(join(__rooms_dirname, '../../data/areas.json'), 'utf8')
);

const AREAS_BY_ID = {};
for (const area of AREAS) {
  AREAS_BY_ID[area.id] = area;
}

/**
 * Get 2 random area options, excluding the current area
 */
export function getAreaSelectionOptions(excludeAreaId = null) {
  // TODO: MVP lock — only offer the school area. Remove this to restore full area selection.
  const school = AREAS.find(a => a.id === 'mahouno-gakkou');
  return school ? [school] : [];
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
  friendlyNpc: 'friendlyNpc'
};

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

/**
 * Generate rooms for an area — Koto2: fixed 30-room structure
 * Fixed positions: indices 5, 11, 17, 23 = npcBattle; index 29 = boss
 * Remaining 25 slots: ~50/50 split between encounter and friendlyNpc
 *
 * @param {string} areaId - Area ID to generate rooms for
 * @param {number} [_roomCount] - Ignored (kept for backwards-compat); rooms are always 30
 * @param {*} [_lastSpecialType] - Ignored
 * @param {boolean} [_encountersOnly] - Ignored
 * @param {*} [_forceRoomType] - Ignored
 */
export function generateAreaRooms(areaId, _roomCount, _lastSpecialType, _encountersOnly, _forceRoomType) {
  const TOTAL_ROOMS = 30;
  const NPC_BATTLE_INDICES = new Set([5, 11, 17, 23]);
  const BOSS_INDEX = 29;

  // Look up sub-areas for this area
  const area = getAreaById(areaId);
  const subAreas = area?.subAreas || [];

  const rooms = [];

  for (let i = 0; i < TOTAL_ROOMS; i++) {
    let type;

    if (NPC_BATTLE_INDICES.has(i)) {
      type = ROOM_TYPES.npcBattle;
    } else if (i === BOSS_INDEX) {
      type = ROOM_TYPES.boss;
    } else {
      // ~50/50 split between encounter and friendlyNpc
      type = Math.random() < 0.5 ? ROOM_TYPES.encounter : ROOM_TYPES.friendlyNpc;
    }

    const room = createRoom(type, areaId, i + 1, TOTAL_ROOMS);

    if (subAreas.length > 0) room.subArea = subAreas[i % subAreas.length];

    rooms.push(room);
  }

  // Attach boss creature if area has one
  if (area?.bossCreatureId) {
    rooms[BOSS_INDEX].boss = { creatureId: area.bossCreatureId, defeated: false };
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
      const offerCategory = Math.random() < 0.5 ? 'food' : 'weapon';
      room.friendlyNpc = { offerCategory, offered: null, chosenId: null, completed: false };
      break;
    }
  }

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
  const isUnfinishedBoss = room.type === 'boss' && !room.interacted;
  const isUnfinishedFriendlyNpc = room.type === 'friendlyNpc' && !room.friendlyNpc?.completed;
  const isUnfinishedNpcBattle = room.type === 'npcBattle' && !room.interacted;
  if (!isUnfinishedEncounter && !isUnfinishedWordDiscovery && !isUnfinishedDealer && !isUnfinishedSkillMaster && !isUnfinishedWhackAMole && !isUnfinishedSpeedReviewRoom && !isUnfinishedBoss && !isUnfinishedFriendlyNpc && !isUnfinishedNpcBattle) {
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
    case ROOM_TYPES.speedReviewRoom:
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
