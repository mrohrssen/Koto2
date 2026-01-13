// Fixed Class Equipment - Hacker Class
// Players start with fixed equipment that defines their class identity
// Equipment cannot be changed, only upgraded (future feature: chip slots)

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
    chipSlots: 2,  // Future: slots for equipping chips
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
    chipSlots: 2,
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
    chipSlots: 2,
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
    chipSlots: 2,
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
  if (className === 'hacker') {
    return {
      weapon: { id: HACKER_EQUIPMENT.tool.id },
      body: { id: HACKER_EQUIPMENT.outfit.id },
      shield: { id: HACKER_EQUIPMENT.device.id },
      accessory: { id: HACKER_EQUIPMENT.bag.id }
    };
  }

  // Default fallback (shouldn't happen)
  return {
    weapon: { id: 'modifiedUmbrella' },
    body: { id: 'hackerHoodie' },
    shield: { id: 'brokenSmartwatch' },
    accessory: { id: 'messengerBag' }
  };
}
