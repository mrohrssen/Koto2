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

import { generateShopChips, getChipDisplayInfo } from './items/chips.js';

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
  palace: { next: [], tier: 5, isFinal: true }
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
  encounter: 'encounter',   // Combat encounter (possessed citizen)
  shrine: 'shrine',         // Charging station (healing)
  boss: 'boss'              // Floor boss
};

// ============ ROOM GENERATION ============

/**
 * Generate rooms for a floor
 * Structure: N encounters + optional shrine + boss
 * @param {number} floor - Current floor (1-7)
 * @param {number} encountersNeeded - Number of encounters before boss
 * @returns {Array} Array of room objects
 */
export function generateFloorRooms(floor, encountersNeeded = 3) {
  const rooms = [];
  const SHRINE_CHANCE = 0.4; // 40% chance for a shrine room

  // Encounter rooms
  for (let i = 0; i < encountersNeeded; i++) {
    rooms.push(createRoom(ROOM_TYPES.encounter, floor, rooms.length + 1, 0));
  }

  // Optional shrine room (placed before boss)
  if (Math.random() < SHRINE_CHANCE) {
    rooms.push(createRoom(ROOM_TYPES.shrine, floor, rooms.length + 1, 0));
  }

  // Boss room (always last)
  rooms.push(createRoom(ROOM_TYPES.boss, floor, rooms.length + 1, 0));

  // Fix totalRooms now that we know the count
  const totalRooms = rooms.length;
  for (const room of rooms) {
    room.totalRooms = totalRooms;
  }

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
      room.shrine = {
        used: false,
        healPercent: 0.3 + Math.random() * 0.2  // 30-50% heal
      };
      break;

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
      return `${roomNum}に入った。充電ステーションがある。エネルギーが満ちている。`;

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

  // All rooms have "proceed" except boss room and unfinished encounter rooms
  const isUnfinishedEncounter = room.type === 'encounter' && !room.interacted;
  if (!room.isBossRoom && !isUnfinishedEncounter) {
    actions.push({ id: 'proceed', name: '進む', description: '次のエリアへ進む' });
  }

  switch (room.type) {
    case ROOM_TYPES.shrine:
      if (!room.shrine.used) {
        actions.push({ id: 'pray', name: '充電', description: '充電ステーションを使う' });
      }
      break;

    case ROOM_TYPES.encounter:
      if (!room.interacted) {
        actions.push({ id: 'fight', name: '解放', description: '市民を解放する' });
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
 * @returns {Array} Array of 3 chip items with id, name, price, type, effects
 */
export function generatePostCombatShop(floor, ownedChipIds = []) {
  // Only show pipeline chips in post-combat shop
  const chips = generateShopChips(floor, ownedChipIds, 3, 'pipeline');

  // Transform to shop item format (chips are free post-combat rewards)
  return chips.map(chip => {
    const displayInfo = getChipDisplayInfo(chip);
    return {
      itemId: chip.id,
      baseId: chip.baseId,  // Base chip ID for icon lookup
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      price: 0,
      type: 'chip',
      category: chip.category,
      rarity: chip.rarity,
      rarityColor: displayInfo.rarityInfo.color,
      rarityName: displayInfo.rarityInfo.name,
      effectText: displayInfo.effectText,
      effects: chip.effects,
      quantity: 1
    };
  });
}
