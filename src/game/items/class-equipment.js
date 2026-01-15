// Fixed Class Equipment - Class Definitions
// Players start with fixed equipment that defines their class identity
// Equipment cannot be changed, only upgraded
// Each equipment has chip slots for passive augmentations

// ============ CLASS CONFIGURATION ============
export const CLASS_CONFIG = {
  hacker: {
    id: 'hacker',
    name: 'ハッカー',
    nameEn: 'Hacker',
    description: 'Tech-focused class. Auto-distributes stat points on level up.',
    autoAllocateStats: true,  // Auto-distributes stat points on level up
    statPriority: ['vit', 'str', 'agi', 'dex', 'int', 'luk']  // Balanced round-robin
  }
};

// ============ HACKER EQUIPMENT ============
export const HACKER_EQUIPMENT = {
  tool: {
    id: 'modifiedUmbrella',
    name: '改造キャッチー傘',
    nameEn: 'Modified Umbrella',
    description: 'Standard Tokyo umbrella rewired for combat. Hidden taser in the tip.',
    type: 'weapon',
    slot: 'weapon',
    rarity: 'uncommon',
    atk: 25,
    dex: 2,
    maxChipSlots: 5,  // 5 chip slots per equipment piece
    buyPrice: 0,
    sellPrice: 0
  },

  outfit: {
    id: 'hackerHoodie',
    name: 'ハッカーパーカー',
    nameEn: 'Hacker Hoodie',
    description: 'Oversized hoodie with hidden pockets and signal-blocking lining.',
    type: 'armor',
    slot: 'body',
    rarity: 'uncommon',
    def: 8,
    mdef: 5,
    int: 1,
    maxChipSlots: 5,
    buyPrice: 0,
    sellPrice: 0
  },

  bag: {
    id: 'messengerBag',
    name: 'メッセンジャーバッグ',
    nameEn: 'Messenger Bag',
    description: 'Worn crossbody for quick access. Contains hacking tools and snacks.',
    type: 'accessory',
    slot: 'accessory',
    rarity: 'uncommon',
    maxHp: 20,
    luk: 2,
    maxChipSlots: 5,
    buyPrice: 0,
    sellPrice: 0
  },

  device: {
    id: 'brokenSmartwatch',
    name: '壊れたスマートウォッチ',
    nameEn: 'Broken Smartwatch',
    description: 'Displays glitched SYSTEM data. Sometimes shows useful information.',
    type: 'accessory',
    slot: 'shield',  // Using shield slot as secondary accessory
    rarity: 'uncommon',
    int: 2,
    maxSp: 15,
    maxChipSlots: 5,
    buyPrice: 0,
    sellPrice: 0
  }
};

/**
 * Get starting equipment for a class
 * @param {string} className - Class name (currently only 'hacker')
 * @returns {object} Equipment object for player.equipment
 */
export function getClassStartingEquipment(className = 'hacker') {
  return {
    weapon: { id: HACKER_EQUIPMENT.tool.id, equippedChips: [] },
    body: { id: HACKER_EQUIPMENT.outfit.id, equippedChips: [] },
    shield: { id: HACKER_EQUIPMENT.device.id, equippedChips: [] },
    accessory: { id: HACKER_EQUIPMENT.bag.id, equippedChips: [] }
  };
}

/**
 * Get max chip slots for an equipment piece
 * @param {string} equipmentId - Equipment item ID
 * @returns {number} Max chip slots (default 5)
 */
export function getMaxChipSlots(equipmentId) {
  const equipment = Object.values(HACKER_EQUIPMENT).find(e => e.id === equipmentId);
  return equipment?.maxChipSlots || 5;
}
