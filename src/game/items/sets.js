/**
 * Equipment Sets and Bonuses
 * Set bonuses for equipment combinations
 */

// ============ SET BONUSES ============
// Equipment sets that provide bonuses when multiple pieces are equipped
// 10 sets based on RateMyServer Ragnarok Online item database
export const ITEM_SETS = {
  // Set 1: Valkyrie Set (Legendary) - Divine warriors, balanced offense/defense
  VALKYRIE: {
    id: 'valkyrie',
    name: 'ヴァルキリーセット',
    nameEn: 'Valkyrie Set',
    pieces: ['balmung', 'brynhild', 'valkyrieShield'],
    bonuses: {
      2: { mdef: 20, healingBonus: 0.10 },
      3: { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 },
      4: { damageBonus: 0.15, statusImmune: ['stun', 'silence'] }
    }
  },

  // Set 2: Berserker Set (Legendary) - Unstoppable offense, high risk high reward
  BERSERKER: {
    id: 'berserker',
    name: 'バーサーカーセット',
    nameEn: 'Berserker Set',
    pieces: ['executioner', 'titanArmor', 'aegis', 'megingjard'],
    bonuses: {
      2: { atk: 30, str: 10 },
      3: { doubleStrike: 15 },
      4: { doubleStrike: 25, vsBossDamage: 0.20 }
    }
  },

  // Set 3: Phantom Set (Legendary) - Evasion and critical strikes
  PHANTOM: {
    id: 'phantom',
    name: 'ファントムセット',
    nameEn: 'Phantom Set',
    pieces: ['inverseScale', 'glitteringJacket', 'phantomShield', 'assassinsGlove'],
    bonuses: {
      2: { flee: 30, crit: 10 },
      3: { perfectDodge: 10 },
      4: { doubleStrike: 25, damageReduction: 0.20 }
    }
  },

  // Set 4: Dark Mage Set (Legendary) - Magic damage and SP sustain
  DARK_MAGE: {
    id: 'darkMage',
    name: 'ダークメイジセット',
    nameEn: 'Dark Mage Set',
    pieces: ['diabolusRobe', 'darkBarrier', 'magesSoul'],
    bonuses: {
      2: { matk: 20, maxSp: 150 },
      3: { damageBonus: 0.15 },
      4: { onKillSp: 50, vsBossDamage: 0.25 }
    }
  },

  // Set 5: Reaper Set (Legendary) - On-kill effects, snowball victories
  REAPER: {
    id: 'reaper',
    name: 'リーパーセット',
    nameEn: 'Reaper Set',
    pieces: ['crescentScythe', 'soulEaterShield', 'soulRing'],
    bonuses: {
      2: { onKillHp: 200 },
      3: { onKillSp: 100, atk: 30 },
      4: { instantKillChance: 0.15 }
    }
  },

  // Set 6: Divine Set (Legendary) - Ultimate defense, status immunity
  DIVINE: {
    id: 'divine',
    name: 'ディバインセット',
    nameEn: 'Divine Set',
    pieces: ['ahuraMazdah', 'brisingamen'],
    bonuses: {
      2: { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5, mdef: 20 },
      3: { healingBonus: 0.20 },
      4: { statusImmune: ['bleed', 'stun', 'blind', 'silence', 'poison', 'sleep'], damageBonus: 0.20 }
    }
  },

  // Set 7: Holy Knight Set (Rare-Epic) - Healing and sustain, anti-magic
  HOLY_KNIGHT: {
    id: 'holyKnight',
    name: 'ホーリーナイトセット',
    nameEn: 'Holy Knight Set',
    pieces: ['excalibur', 'croceStaff', 'blessedHolyRobe', 'exorcismBible', 'angelicRing'],
    bonuses: {
      2: { healingBonus: 0.15, mdef: 10 },
      3: { hpRegen: 0.03 },
      4: { healingBonus: 0.25, statusImmune: ['blind', 'silence'] }
    }
  },

  // Set 8: Chaos Set (Rare-Epic) - Status effects and randomness
  CHAOS: {
    id: 'chaos',
    name: 'カオスセット',
    nameEn: 'Chaos Set',
    pieces: ['edge', 'iceFalchion', 'morningStar', 'bonePlate', 'flameShield', 'counterRing'],
    bonuses: {
      2: { statusInflictBonus: 0.10 },
      3: { counterAttack: 0.10 },
      4: { statusInflictBonus: 0.20 }
    }
  },

  // Set 9: Treasure Hunter Set (Rare-Epic) - Gold and drops
  TREASURE_HUNTER: {
    id: 'treasureHunter',
    name: 'トレジャーハンターセット',
    nameEn: 'Treasure Hunter Set',
    pieces: ['cleaver', 'luckyCharm', 'thiefsGlove'],
    bonuses: {
      2: { goldFind: 0.20 },
      3: { dropRate: 0.15, xpGain: 0.10 },
      4: { goldFind: 0.50, dropRate: 0.25 }
    }
  },

  // Set 10: Speed Demon Set (Rare-Epic) - Double Strike and evasion
  SPEED_DEMON: {
    id: 'speedDemon',
    name: 'スピードデーモンセット',
    nameEn: 'Speed Demon Set',
    pieces: ['assassinDagger', 'katar', 'airBossSuit', 'blackLeatherBoots', 'phantomShield', 'matyrsLeash'],
    bonuses: {
      2: { doubleStrike: 10, agi: 5 },
      3: { flee: 20 },
      4: { doubleStrike: 30, firstStrike: 0.10 }
    }
  }
};

/**
 * Get active set bonuses based on equipped items
 * @param {object} player - Player object with equipment
 * @returns {object} Combined set bonuses
 */
export function getEquippedSetBonuses(player) {
  const bonuses = {};
  const equippedIds = [];

  // Collect all equipped item IDs
  for (const slot of ['weapon', 'body', 'shield', 'accessory']) {
    const equipped = player.equipment?.[slot];
    if (equipped) {
      const id = equipped.id || equipped;
      if (id) equippedIds.push(id);
    }
  }

  // Check each set
  for (const set of Object.values(ITEM_SETS)) {
    // Count how many pieces of this set are equipped
    const equippedPieces = set.pieces.filter(pieceId => equippedIds.includes(pieceId)).length;

    // Apply bonuses for each tier reached
    for (const [threshold, tierBonuses] of Object.entries(set.bonuses)) {
      if (equippedPieces >= parseInt(threshold)) {
        // Merge bonuses
        for (const [stat, value] of Object.entries(tierBonuses)) {
          if (stat === 'statusImmune') {
            // Combine arrays
            bonuses.statusImmune = [...(bonuses.statusImmune || []), ...value];
          } else if (typeof value === 'number') {
            bonuses[stat] = (bonuses[stat] || 0) + value;
          }
        }
      }
    }
  }

  return bonuses;
}
