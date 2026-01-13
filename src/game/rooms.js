// Room System - NEO TOKYO: System Liberation
// Exploration through Tokyo wards controlled by SYSTEM

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

// Room types and their distribution
export const ROOM_TYPES = {
  empty: 'empty',           // Nothing of interest
  encounter: 'encounter',   // Combat encounter (possessed citizen)
  trap: 'trap',             // SYSTEM security trap
  body: 'body',             // Offline citizen (was: dead adventurer)
  treasure: 'treasure',     // Vending machine / data cache
  shrine: 'shrine',         // Charging station (was: healing shrine)
  merchant: 'merchant',     // Black market dealer
  blacksmith: 'blacksmith'  // Modder (commented out for now)
};

// Room distribution by floor (weights) - merchant/blacksmith are 0 because we guarantee placement
// No empty rooms - every room has content for tighter gameplay
const ROOM_WEIGHTS = {
  1: { empty: 0, encounter: 30, trap: 20, body: 20, treasure: 18, shrine: 12, merchant: 0, blacksmith: 0 },
  2: { empty: 0, encounter: 32, trap: 22, body: 18, treasure: 16, shrine: 12, merchant: 0, blacksmith: 0 },
  3: { empty: 0, encounter: 34, trap: 24, body: 16, treasure: 15, shrine: 11, merchant: 0, blacksmith: 0 },
  4: { empty: 0, encounter: 36, trap: 24, body: 15, treasure: 15, shrine: 10, merchant: 0, blacksmith: 0 },
  5: { empty: 0, encounter: 38, trap: 24, body: 14, treasure: 14, shrine: 10, merchant: 0, blacksmith: 0 },
  6: { empty: 0, encounter: 40, trap: 24, body: 13, treasure: 13, shrine: 10, merchant: 0, blacksmith: 0 },
  7: { empty: 0, encounter: 42, trap: 26, body: 12, treasure: 12, shrine: 8, merchant: 0, blacksmith: 0 }
};

// Trap types with effects - SYSTEM Security measures
export const TRAP_TYPES = {
  spike: {
    id: 'spike',
    name: 'セキュリティレーザー',
    nameEn: 'Security Laser',
    description: '壁から放射されるレーザーグリッド。',
    damage: { min: 10, max: 25 },
    avoidChance: 0.4,  // 40% chance to avoid with speed check
    disarmChance: 0.3  // 30% base chance to disarm
  },
  poison: {
    id: 'poison',
    name: 'ウイルス散布',
    nameEn: 'Virus Dispenser',
    description: 'SYSTEMウイルスを含むナノマシンが噴出。',
    damage: { min: 8, max: 20 },
    statusEffect: 'overheated',
    avoidChance: 0.3,
    disarmChance: 0.25
  },
  fire: {
    id: 'fire',
    name: 'サーマルオーバーロード',
    nameEn: 'Thermal Overload',
    description: 'サーバールームの冷却システムが暴走。',
    damage: { min: 15, max: 35 },
    avoidChance: 0.35,
    disarmChance: 0.2
  },
  arrow: {
    id: 'arrow',
    name: 'ドローン迎撃',
    nameEn: 'Drone Interception',
    description: '監視ドローンが警告なしに攻撃。',
    damage: { min: 12, max: 28 },
    avoidChance: 0.45,
    disarmChance: 0.35
  },
  pitfall: {
    id: 'pitfall',
    name: 'EMPトラップ',
    nameEn: 'EMP Trap',
    description: '電磁パルスが機器をシャットダウン。',
    damage: { min: 20, max: 40 },
    avoidChance: 0.5,
    disarmChance: 0.15
  }
};

// Loot tables for bodies
export const BODY_LOOT = {
  common: [
    { itemId: 'potion', chance: 0.4, quantity: { min: 1, max: 2 } },
    { itemId: 'gold', chance: 0.5, quantity: { min: 5, max: 20 } },
    { itemId: 'antidote', chance: 0.2, quantity: { min: 1, max: 1 } }
  ],
  uncommon: [
    { itemId: 'potion', chance: 0.6, quantity: { min: 1, max: 3 } },
    { itemId: 'ether', chance: 0.3, quantity: { min: 1, max: 2 } },
    { itemId: 'gold', chance: 0.7, quantity: { min: 15, max: 50 } },
    { itemId: 'smokeBomb', chance: 0.15, quantity: { min: 1, max: 1 } }
  ],
  rare: [
    { itemId: 'hiPotion', chance: 0.4, quantity: { min: 1, max: 2 } },
    { itemId: 'ether', chance: 0.5, quantity: { min: 1, max: 3 } },
    { itemId: 'gold', chance: 0.8, quantity: { min: 30, max: 100 } },
    { itemId: 'revive', chance: 0.1, quantity: { min: 1, max: 1 } }
  ]
};

// Treasure chest loot (better than bodies)
export const CHEST_LOOT = {
  common: [
    { itemId: 'potion', chance: 0.7, quantity: { min: 2, max: 4 } },
    { itemId: 'gold', chance: 0.9, quantity: { min: 40, max: 100 } }
  ],
  uncommon: [
    { itemId: 'hiPotion', chance: 0.5, quantity: { min: 1, max: 3 } },
    { itemId: 'ether', chance: 0.6, quantity: { min: 1, max: 3 } },
    { itemId: 'gold', chance: 1.0, quantity: { min: 80, max: 200 } },
    { itemId: 'smokeBomb', chance: 0.3, quantity: { min: 1, max: 2 } }
  ],
  rare: [
    { itemId: 'hiPotion', chance: 0.7, quantity: { min: 2, max: 4 } },
    { itemId: 'elixir', chance: 0.2, quantity: { min: 1, max: 1 } },
    { itemId: 'gold', chance: 1.0, quantity: { min: 160, max: 400 } },
    { itemId: 'revive', chance: 0.3, quantity: { min: 1, max: 1 } }
  ],
  legendary: [
    { itemId: 'elixir', chance: 0.5, quantity: { min: 1, max: 2 } },
    { itemId: 'revive', chance: 0.5, quantity: { min: 1, max: 2 } },
    { itemId: 'gold', chance: 1.0, quantity: { min: 300, max: 800 } }
  ]
};

// Body descriptions - Offline citizens (disconnected from SYSTEM)
const BODY_DESCRIPTIONS = [
  'オフラインの市民が壁にもたれて座っている。何かを握りしめている。',
  'SYSTEM接続が切れた住人がいる。データパッドが落ちている。',
  '最近オフラインになった市民。まだ意識がありそうだ。',
  '古いハッカーの遺体が見つかった。レアなチップを持っているかも。',
  '解放済みの市民が休んでいる。物資を分けてくれるかもしれない。'
];

// Empty room descriptions - Tokyo urban environment
const EMPTY_DESCRIPTIONS = [
  '暗い路地裏。ネオンサインがチカチカと点滅している。',
  '放置された店舗。誰かがここを通った形跡がある。',
  '静かなビルの廊下。監視カメラの赤いLEDが光っている。',
  '壁にグラフィティがある。「SYSTEM反対」と書かれている。',
  'エアコンの室外機が唸っている。蒸し暑い。',
  '床に壊れたスマホが落ちている。何かがあったようだ。',
  '廃墟になったアーケード。ゲーム機の画面がまだ光っている。'
];

// ============ ROOM GENERATION ============

/**
 * Generate rooms for a floor
 * NEW SYSTEM: Every room is an encounter, shop appears after each kill
 * @param {number} floor - Current floor (1-7)
 * @param {number} encountersNeeded - Number of encounters before boss
 * @returns {Array} Array of room objects
 */
export function generateFloorRooms(floor, encountersNeeded = 3) {
  // Fixed number of encounters per floor + boss room
  const totalRooms = encountersNeeded + 1; // encounters + boss
  const rooms = [];

  // Generate encounter rooms
  for (let i = 0; i < totalRooms; i++) {
    // Last room is always boss room
    if (i === totalRooms - 1) {
      rooms.push(createRoom('boss', floor, i + 1, totalRooms));
    } else {
      // All other rooms are encounters
      rooms.push(createRoom(ROOM_TYPES.encounter, floor, i + 1, totalRooms));
    }
  }

  return rooms;
}

/**
 * Select room type based on weights
 */
function selectRoomType(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * total;

  for (const [type, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return type;
    }
  }

  return ROOM_TYPES.empty;
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

  // Add type-specific data
  switch (type) {
    case ROOM_TYPES.trap:
      const trapTypes = Object.keys(TRAP_TYPES);
      const trapId = trapTypes[Math.floor(Math.random() * trapTypes.length)];
      room.trap = { ...TRAP_TYPES[trapId] };
      room.trap.triggered = false;
      room.trap.disarmed = false;
      break;

    case ROOM_TYPES.body:
      room.body = {
        description: BODY_DESCRIPTIONS[Math.floor(Math.random() * BODY_DESCRIPTIONS.length)],
        lootTier: selectLootTier(floor),
        looted: false,
        trapped: Math.random() < (0.15 + floor * 0.03)  // 15-36% chance based on floor
      };
      if (room.body.trapped) {
        const trapTypes = Object.keys(TRAP_TYPES);
        room.body.trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];
      }
      break;

    case ROOM_TYPES.treasure:
      room.treasure = {
        tier: selectTreasureTier(floor),
        opened: false,
        trapped: Math.random() < (0.2 + floor * 0.05)  // 20-55% chance based on floor
      };
      if (room.treasure.trapped) {
        const trapTypes = Object.keys(TRAP_TYPES);
        room.treasure.trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];
      }
      break;

    case ROOM_TYPES.shrine:
      room.shrine = {
        used: false,
        healPercent: 0.3 + Math.random() * 0.2  // 30-50% heal
      };
      break;

    case ROOM_TYPES.merchant:
      room.merchant = {
        interacted: false,
        inventory: generateMerchantInventory(floor)
      };
      break;

    case ROOM_TYPES.blacksmith:
      room.blacksmith = {
        interacted: false,
        successBonus: floor * 0.02  // Higher floors = slightly better odds
      };
      break;

    case ROOM_TYPES.empty:
      room.description = EMPTY_DESCRIPTIONS[Math.floor(Math.random() * EMPTY_DESCRIPTIONS.length)];
      break;

    case 'boss':
      room.isBossRoom = true;
      break;
  }

  return room;
}

/**
 * Select loot tier based on floor
 */
function selectLootTier(floor) {
  const rand = Math.random();
  if (floor >= 5) {
    if (rand < 0.3) return 'rare';
    if (rand < 0.7) return 'uncommon';
    return 'common';
  } else if (floor >= 3) {
    if (rand < 0.15) return 'rare';
    if (rand < 0.5) return 'uncommon';
    return 'common';
  } else {
    if (rand < 0.1) return 'uncommon';
    return 'common';
  }
}

/**
 * Select treasure tier based on floor
 */
function selectTreasureTier(floor) {
  const rand = Math.random();
  if (floor >= 6) {
    if (rand < 0.15) return 'legendary';
    if (rand < 0.45) return 'rare';
    if (rand < 0.8) return 'uncommon';
    return 'common';
  } else if (floor >= 4) {
    if (rand < 0.2) return 'rare';
    if (rand < 0.6) return 'uncommon';
    return 'common';
  } else {
    if (rand < 0.1) return 'rare';
    if (rand < 0.4) return 'uncommon';
    return 'common';
  }
}

/**
 * Generate merchant inventory based on floor
 * Higher floors have better items but fewer basic supplies
 */
function generateMerchantInventory(floor) {
  const items = [];

  // ============ CONSUMABLES ============

  // Basic items - always available
  items.push({ itemId: 'potion', price: 50, quantity: Math.max(1, 6 - floor) });
  items.push({ itemId: 'antidote', price: 30, quantity: 3 });

  // Mid-tier items - floor 2+
  if (floor >= 2) {
    items.push({ itemId: 'highPotion', price: 150, quantity: 3 });
    items.push({ itemId: 'ether', price: 80, quantity: 3 });
  }

  // Better items - floor 3+
  if (floor >= 3) {
    items.push({ itemId: 'smokeBomb', price: 100, quantity: 2 });
    items.push({ itemId: 'highEther', price: 200, quantity: 2 });
    // Rare: Ariadne Thread (escape dungeon)
    if (Math.random() < 0.5) {
      items.push({ itemId: 'ariadneThread', price: 500, quantity: 1 });
    }
  }

  // Rare consumables - floor 4+
  if (floor >= 4) {
    items.push({ itemId: 'fullPotion', price: 500, quantity: 2 });
    // Rare: Phoenix Down
    if (Math.random() < 0.4) {
      items.push({ itemId: 'phoenixDown', price: 800, quantity: 1 });
    }
    // Rare: Warp Stone
    if (Math.random() < 0.3) {
      items.push({ itemId: 'warpStone', price: 600, quantity: 1 });
    }
  }

  // Elite items - floor 5+
  if (floor >= 5) {
    items.push({ itemId: 'elixir', price: 1000, quantity: 1 });
    // Elemental scrolls
    const scrolls = ['fireScroll', 'iceScroll', 'thunderScroll'];
    const randomScroll = scrolls[Math.floor(Math.random() * scrolls.length)];
    items.push({ itemId: randomScroll, price: 120, quantity: 3 });
  }

  // Premium items - floor 6+
  if (floor >= 6) {
    // Mega Elixir (very rare)
    if (Math.random() < 0.25) {
      items.push({ itemId: 'megaElixir', price: 2000, quantity: 1 });
    }
  }

  // Floor 7 special: chance for stat boosters (extremely rare, very expensive)
  if (floor >= 7) {
    const statBoosters = ['strManual', 'agiManual', 'vitManual', 'intManual', 'dexManual', 'lukManual'];
    if (Math.random() < 0.15) {
      const booster = statBoosters[Math.floor(Math.random() * statBoosters.length)];
      items.push({ itemId: booster, price: 5000, quantity: 1 });
    }
  }

  // NOTE: Equipment removed - players use fixed Hacker class equipment
  // Shops now only sell consumables and chips (chips sold via post-combat shop)

  return items;
}

// ============ ROOM INTERACTIONS ============

/**
 * Generate loot from a body
 */
export function generateBodyLoot(tier) {
  const lootTable = BODY_LOOT[tier] || BODY_LOOT.common;
  const loot = [];

  for (const item of lootTable) {
    if (Math.random() < item.chance) {
      const quantity = item.quantity.min + Math.floor(Math.random() * (item.quantity.max - item.quantity.min + 1));
      loot.push({ itemId: item.itemId, quantity });
    }
  }

  return loot;
}

/**
 * Generate loot from a treasure chest
 */
export function generateChestLoot(tier) {
  const lootTable = CHEST_LOOT[tier] || CHEST_LOOT.common;
  const loot = [];

  for (const item of lootTable) {
    if (Math.random() < item.chance) {
      const quantity = item.quantity.min + Math.floor(Math.random() * (item.quantity.max - item.quantity.min + 1));
      loot.push({ itemId: item.itemId, quantity });
    }
  }

  return loot;
}

/**
 * Calculate trap damage
 */
export function calculateTrapDamage(trap) {
  return trap.damage.min + Math.floor(Math.random() * (trap.damage.max - trap.damage.min + 1));
}

/**
 * Attempt to disarm a trap
 * @param {object} trap - The trap object
 * @param {object} player - Player stats
 * @returns {object} { success, damage (if failed) }
 */
export function attemptDisarm(trap, player) {
  // Luck adds to disarm chance
  const luckBonus = (player.luck || 5) / 100;
  const disarmChance = trap.disarmChance + luckBonus;

  if (Math.random() < disarmChance) {
    return { success: true, xpReward: 10 + Math.floor(Math.random() * 10) };
  }

  // Failed disarm triggers trap at half damage
  const damage = Math.floor(calculateTrapDamage(trap) * 0.5);
  return { success: false, damage };
}

/**
 * Attempt to avoid/dodge a trap
 * @param {object} trap - The trap object
 * @param {object} player - Player stats
 * @returns {object} { avoided, damage (if not avoided) }
 */
export function attemptAvoid(trap, player) {
  // Speed adds to avoid chance
  const speedBonus = (player.speed || 7) / 50;
  const avoidChance = trap.avoidChance + speedBonus;

  if (Math.random() < avoidChance) {
    return { avoided: true };
  }

  const damage = calculateTrapDamage(trap);
  return { avoided: false, damage };
}

// ============ ROOM NARRATION ============

/**
 * Get narration for entering a room
 */
export function getRoomEntryNarration(room) {
  const wardInfo = FLOOR_NAMES[room.floor] || { name: '不明なエリア' };
  const roomNum = `エリア${room.roomNumber}/${room.totalRooms}`;

  switch (room.type) {
    case ROOM_TYPES.empty:
      return `${roomNum}に入った。${room.description || '静かなエリアだ。'}`;

    case ROOM_TYPES.encounter:
      return `${roomNum}に入った。SYSTEM接続された市民がいる！`;

    case ROOM_TYPES.trap:
      return `${roomNum}に入った。セキュリティシステムが作動している...罠かもしれない。`;

    case ROOM_TYPES.body:
      return `${roomNum}に入った。${room.body.description}`;

    case ROOM_TYPES.treasure:
      return `${roomNum}に入った。自販機がある！${room.treasure.trapped ? '...セキュリティ付きだ。' : ''}`;

    case ROOM_TYPES.shrine:
      return `${roomNum}に入った。充電ステーションがある。エネルギーが満ちている。`;

    case ROOM_TYPES.merchant:
      return `${roomNum}に入った。「おい、ハッカー。いいモノあるぜ。」闇商人がいる！`;

    case ROOM_TYPES.blacksmith:
      return `${roomNum}に入った。「改造が必要か？」改造屋がいる！`;

    case 'boss':
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
    case ROOM_TYPES.trap:
      if (!room.trap.triggered && !room.trap.disarmed) {
        actions.push({ id: 'disarm', name: 'ハック', description: 'セキュリティをハックする' });
        actions.push({ id: 'trigger', name: '回避', description: 'トラップを回避する' });
      }
      break;

    case ROOM_TYPES.body:
      if (!room.body.looted && !room.body.skipped) {
        actions.push({ id: 'loot', name: '調べる', description: '市民を調べる（罠の可能性あり）' });
        actions.push({ id: 'ignore_body', name: '無視', description: '市民を無視して進む' });
      }
      break;

    case ROOM_TYPES.treasure:
      if (!room.treasure.opened && !room.treasure.skipped) {
        actions.push({ id: 'open', name: 'アクセス', description: '自販機にアクセス（セキュリティ注意）' });
        actions.push({ id: 'ignore_treasure', name: '無視', description: '自販機を無視して進む' });
      }
      break;

    case ROOM_TYPES.shrine:
      if (!room.shrine.used) {
        actions.push({ id: 'pray', name: '充電', description: '充電ステーションを使う' });
      }
      break;

    case ROOM_TYPES.merchant:
      actions.push({ id: 'shop', name: '取引', description: '闇商人と取引する' });
      break;

    case ROOM_TYPES.blacksmith:
      actions.push({ id: 'refine', name: '改造', description: '装備を改造する' });
      break;

    case ROOM_TYPES.encounter:
      // Only show fight action if encounter not completed
      if (!room.interacted) {
        actions.push({ id: 'fight', name: '解放', description: '市民を解放する' });
      }
      break;

    case 'boss':
      actions.push({ id: 'boss_fight', name: 'ボス戦', description: 'エリアボスに挑む' });
      break;
  }

  return actions;
}

// ============ POST-COMBAT CHIP SHOP ============

/**
 * Generate 3 random chips for post-combat shop
 * Chips are passive augmentations that provide various bonuses
 * @param {number} floor - Current floor (1-7)
 * @param {array} ownedChipIds - IDs of chips player already owns (unique only)
 * @returns {Array} Array of 3 chip items with id, name, price, type, effects
 */
export function generatePostCombatShop(floor, ownedChipIds = []) {
  const chips = generateShopChips(floor, ownedChipIds, 3);

  // Transform to shop item format
  return chips.map(chip => {
    const displayInfo = getChipDisplayInfo(chip);
    return {
      itemId: chip.id,
      name: chip.name,
      nameEn: chip.nameEn,
      description: chip.description,
      price: displayInfo.price,
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
