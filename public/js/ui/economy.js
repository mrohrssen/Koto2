/**
 * @fileoverview Economy UI Module - Shop, Blacksmith, and Chip Upgrade functions
 * @module public/js/ui/economy.js
 *
 * PURPOSE:
 * Handles all economy-related UI rendering including shop display, blacksmith
 * refinement interface, chip upgrade (modder) modal, and post-combat shop.
 *
 * KEY EXPORTS:
 * - init(callbacks) - Initialize module with dependencies
 * - formatItemStats(item) - Format item stats for display in Japanese
 * - openShop() - Open merchant shop modal
 * - buyItem(itemId) - Purchase item from regular shop
 * - closeShop() - Close shop modal
 * - openBlacksmith() - Open blacksmith refinement modal
 * - refineItemHandler(slot) - Attempt to refine equipment
 * - closeBlacksmith() - Close blacksmith modal
 * - openChipUpgradeModal() - Open chip modder modal
 * - performChipUpgrade(chipId) - Attempt to upgrade chip rarity
 * - closeChipUpgradeModal() - Close chip upgrade modal
 * - showBossReadyContent() - Display boss ready screen
 * - showFloorCompleteContent() - Display floor complete screen
 * - showPostCombatShopContent() - Display post-combat shop in modal
 * - claimStartingChipHandler(itemIndex) - Claim free starting chip
 * - buyFromShop(itemIndex) - Buy from post-combat shop
 * - skipShop() - Skip post-combat shop
 * - refreshShop() - Refresh post-combat shop items
 * - selectShopItem(index) - Select shop item for keyboard navigation
 * - showRunEndedContent() - Display run ended screen
 * - resetShopModal() - Reset shop modal to default state
 * - getSelectedShopIndex() - Get current shop selection index
 * - setSelectedShopIndex(index) - Set current shop selection index
 *
 * DEPENDENCIES:
 * - narration module for showNarration()
 * - tts module for speakText()
 * - API functions for server communication
 *
 * ARCHITECTURE NOTES:
 * - Uses init() pattern with callbacks for dependency injection
 * - All functions check for required state before executing
 * - Window globals set for onclick handlers
 */

// ============ MODULE STATE ============
let shopInventory = [];
let selectedShopIndex = -1;

// DOM elements (initialized in init)
let gameContent = null;
let shopModal = null;

// Callbacks injected via init()
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let delay = null;
let triggerJpdbParse = null;
let narration = null;
let tts = null;

// API functions injected via init()
let apiGetRefinePreview = null;
let apiRefineItem = null;
let apiClaimStartingChip = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;
let apiPostCombatShopRefresh = null;

// API base constant
const API_BASE = '';

// Rarity names constant
const RARITY_NAMES = {
  common: 'ノーマル',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー'
};

/**
 * Initialize the economy UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  // DOM elements
  gameContent = document.getElementById('game-content');
  shopModal = document.getElementById('shop-modal');

  // State callbacks
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  delay = callbacks.delay;
  triggerJpdbParse = callbacks.triggerJpdbParse;

  // Module references
  narration = callbacks.narration;
  tts = callbacks.tts;

  // API functions
  apiGetRefinePreview = callbacks.apiGetRefinePreview;
  apiRefineItem = callbacks.apiRefineItem;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
  apiPostCombatShopRefresh = callbacks.apiPostCombatShopRefresh;
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Get current shop selection index
 * @returns {number} Selected shop index
 */
export function getSelectedShopIndex() {
  return selectedShopIndex;
}

/**
 * Set current shop selection index
 * @param {number} index - New selection index
 */
export function setSelectedShopIndex(index) {
  selectedShopIndex = index;
}

// ============ SHOP FUNCTIONS ============

/**
 * Format item stats for display in Japanese
 * @param {Object} item - Item to format stats for
 * @returns {string} Formatted stats string
 */
export function formatItemStats(item) {
  const stats = [];

  // Chip category display
  if (item.type === 'chip' || item.category) {
    const categoryNames = {
      stat: 'ステータス',
      onHit: 'オンヒット',
      onEffect: 'オンエフェクト',
      counter: 'カウンター'
    };
    if (item.category && categoryNames[item.category]) {
      stats.push(`[${categoryNames[item.category]}]`);
    }

    // Handle chip effects
    if (item.effects) {
      // STAT chips
      if (item.effects.stats) {
        const statNames = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK' };
        for (const [stat, value] of Object.entries(item.effects.stats)) {
          if (value && statNames[stat]) {
            stats.push(`${statNames[stat]}+${value}`);
          }
        }
      }

      // ON_HIT chips
      if (item.effects.onHit) {
        const effect = item.effects.onHit;
        const statusNames = {
          defrag: 'デフラグ', lag: 'ラグ', bufferOverflow: 'バッファオーバーフロー',
          corrupted: '破損', exposed: '露出', overheated: 'オーバーヒート'
        };
        const statusName = statusNames[effect.status] || effect.status;
        stats.push(`${Math.round(effect.chance * 100)}%${statusName}(${effect.duration}秒)`);
        if (effect.bonusDamage) stats.push(`+${effect.bonusDamage}ダメージ`);
      }

      // ON_EFFECT chips (onKill, onDamage, onDodge, onCrit, onHeal, onLowHp, onRoomEnter, onStatusInflict)
      if (item.effects.onKill) {
        const effect = item.effects.onKill;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.aspdBoost) effectParts.push(`攻速+${Math.round(effect.aspdBoost * 100)}%`);
        if (effect.doubleCredits) effectParts.push('2x金');
        if (effect.aoeExplosion) effectParts.push('爆発');
        if (effectParts.length > 0) {
          stats.push(`撃破時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onDamage) {
        const effect = item.effects.onDamage;
        if (effect.damageReduction) {
          stats.push(`被弾時${Math.round(effect.chance * 100)}%:${Math.round(effect.damageReduction * 100)}%軽減`);
        }
        if (effect.heal) {
          stats.push(`被弾時${Math.round(effect.chance * 100)}%:HP+${effect.heal}`);
        }
      }
      if (item.effects.onDodge) {
        const effect = item.effects.onDodge;
        const effectParts = [];
        if (effect.buff === 'speed') effectParts.push(`加速+${Math.round(effect.value * 100)}%`);
        if (effect.counterAttack) effectParts.push('反撃');
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effectParts.length > 0) {
          stats.push(`回避時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onCrit) {
        const effect = item.effects.onCrit;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.healPercent) effectParts.push(`HP+${Math.round(effect.healPercent * 100)}%`);
        if (effect.bonusDamage) effectParts.push(`+${effect.bonusDamage}ダメ`);
        if (effect.damageBonus) effectParts.push(`ダメ+${Math.round(effect.damageBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`クリ時${Math.round(effect.chance * 100)}%:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onHeal) {
        const effect = item.effects.onHeal;
        const effectParts = [];
        if (effect.bonusHeal) effectParts.push(`+${effect.bonusHeal}回復`);
        if (effect.healBonus) effectParts.push(`回復+${Math.round(effect.healBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`回復時:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onLowHp) {
        const effect = item.effects.onLowHp;
        const effectParts = [];
        if (effect.damageBonus) effectParts.push(`ダメ+${Math.round(effect.damageBonus * 100)}%`);
        if (effect.defenseBonus) effectParts.push(`防御+${Math.round(effect.defenseBonus * 100)}%`);
        if (effectParts.length > 0) {
          const threshold = effect.threshold ? Math.round(effect.threshold * 100) : 30;
          stats.push(`HP${threshold}%以下:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onRoomEnter) {
        const effect = item.effects.onRoomEnter;
        const effectParts = [];
        if (effect.heal) effectParts.push(`HP+${effect.heal}`);
        if (effect.goldBonus) effectParts.push(`金+${Math.round(effect.goldBonus * 100)}%`);
        if (effect.xpBonus) effectParts.push(`経験+${Math.round(effect.xpBonus * 100)}%`);
        if (effectParts.length > 0) {
          stats.push(`部屋移動時:${effectParts.join(',')}`);
        }
      }
      if (item.effects.onStatusInflict) {
        const effect = item.effects.onStatusInflict;
        const effectParts = [];
        if (effect.bonusDamage) effectParts.push(`+${effect.bonusDamage}ダメ`);
        if (effect.extendDuration) effectParts.push(`時間+${effect.extendDuration}`);
        if (effectParts.length > 0) {
          stats.push(`状態異常付与時:${effectParts.join(',')}`);
        }
      }

      // COUNTER chips
      if (item.effects.counter) {
        const counter = item.effects.counter;
        const triggerNames = {
          onKill: '撃破', onCrit: 'クリティカル', onRoomEnter: '部屋移動',
          onStatusInflict: '状態異常', onChipCount: 'チップ数'
        };
        const bonusNames = {
          damagePercent: 'ダメージ', statusDuration: '状態時間',
          critDamage: 'クリダメ', aspd: '攻速', allStats: '全能力'
        };
        const triggerName = triggerNames[counter.trigger] || counter.trigger;
        const bonusName = bonusNames[counter.bonus] || counter.bonus;
        stats.push(`${triggerName}毎+${counter.perStack}%${bonusName}(最大${counter.maxStacks})`);
      }
    }

    return stats.join(' ');
  }

  // Slot type (for equipment)
  const slotNames = { weapon: '武器', body: '体', shield: '盾', accessory: 'アクセ' };
  if (item.slot) {
    stats.push(`[${slotNames[item.slot] || item.slot}]`);
  }

  // Primary combat stats
  if (item.atk) stats.push(`攻撃+${item.atk}`);
  if (item.def) stats.push(`防御+${item.def}`);
  if (item.matk) stats.push(`魔攻+${item.matk}`);
  if (item.mdef) stats.push(`魔防+${item.mdef}`);
  if (item.hit) stats.push(`命中+${item.hit}`);
  if (item.flee) stats.push(`回避+${item.flee}`);
  if (item.crit) stats.push(`会心+${item.crit}`);

  // Base stats
  if (item.str) stats.push(`STR+${item.str}`);
  if (item.agi) stats.push(`AGI+${item.agi}`);
  if (item.vit) stats.push(`VIT+${item.vit}`);
  if (item.int) stats.push(`INT+${item.int}`);
  if (item.dex) stats.push(`DEX+${item.dex}`);
  if (item.luk) stats.push(`LUK+${item.luk}`);

  // Special effects
  if (item.doubleStrike) stats.push(`二連撃${item.doubleStrike}%`);
  if (item.armorPen) stats.push(`貫通${Math.round(item.armorPen * 100)}%`);
  if (item.onKillHp) stats.push(`撃破HP+${item.onKillHp}`);
  if (item.onKillSp) stats.push(`撃破SP+${item.onKillSp}`);
  if (item.healingBonus) stats.push(`回復+${Math.round(item.healingBonus * 100)}%`);
  if (item.goldFind) stats.push(`金運+${Math.round(item.goldFind * 100)}%`);
  if (item.statusInflict) stats.push(`${item.statusInflict.status}付与${item.statusInflict.chance}%`);
  if (item.setId) stats.push(`【${item.setId}】`);

  return stats.join(' ');
}

/**
 * Open merchant shop modal
 */
export async function openShop() {
  try {
    const response = await fetch('/api/game/shop');
    if (!response.ok) {
      throw new Error('Failed to load shop');
    }
    const data = await response.json();
    shopInventory = data.inventory;

    const shopModalEl = document.getElementById('shop-modal');
    const shopGold = document.getElementById('shop-player-gold');
    const shopItems = document.getElementById('shop-items');

    // Reset to normal merchant mode
    const shopTitle = document.getElementById('shop-title');
    const shopGreeting = document.getElementById('shop-greeting');
    const closeBtn = document.getElementById('shop-close-btn');
    const skipBtn = document.getElementById('shop-skip-btn');
    const closeX = document.getElementById('close-shop');
    if (shopTitle) shopTitle.textContent = 'Merchant';
    if (shopGreeting) shopGreeting.textContent = '「いらっしゃい、冒険者よ。何が欲しい？」';
    if (closeBtn) closeBtn.classList.remove('hidden');
    if (skipBtn) skipBtn.classList.add('hidden');
    if (closeX) closeX.classList.remove('hidden');

    // Update gold display
    shopGold.textContent = data.playerGold;

    // Render items
    if (shopInventory.length === 0) {
      shopItems.innerHTML = '<p class="shop-empty">「もう売り切れだ」</p>';
    } else {
      shopItems.innerHTML = shopInventory.map(item => {
        const canAfford = data.playerGold >= item.price;
        const outOfStock = item.quantity <= 0;
        let itemClass = `shop-item rarity-${item.rarity || 'common'}`;
        if (outOfStock) itemClass += ' out-of-stock';
        else if (!canAfford) itemClass += ' cannot-afford';

        // Build stats string in Japanese
        const statsStr = formatItemStats(item);

        const rarityLabel = {
          common: 'コモン - 効果1.0x',
          uncommon: 'アンコモン - 効果1.5x',
          rare: 'レア - 効果2.0x',
          epic: 'エピック - 効果2.5x',
          legendary: 'レジェンド - 効果3.0x'
        }[item.rarity] || '';

        const iconId = item.baseId || item.itemId.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
        return `
          <div class="${itemClass}" data-item-id="${item.itemId}">
            <img class="shop-item-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
            <div class="shop-item-info">
              <div class="shop-item-name">
                ${item.name}
                ${rarityLabel ? `<span class="shop-item-rarity rarity-${item.rarity}">[${rarityLabel}]</span>` : ''}
              </div>
              <div class="shop-item-desc">${item.description}</div>
              ${statsStr ? `<div class="shop-item-stats">${statsStr}</div>` : ''}
            </div>
            <div class="shop-item-meta">
              <span class="shop-item-stock">x${item.quantity}</span>
              <span class="shop-item-price">¥${item.price}</span>
              <button class="shop-item-buy"
                      onclick="buyItem('${item.itemId}')"
                      ${!canAfford || outOfStock ? 'disabled' : ''}>
                Buy
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    shopModalEl.classList.remove('hidden');
  } catch (error) {
    console.error('Shop error:', error);
    narration.showNarration('商人との取引に失敗した。');
  }
}

/**
 * Purchase item from regular shop
 * @param {string} itemId - ID of item to purchase
 */
export async function buyItem(itemId) {
  try {
    const response = await fetch('/api/game/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, quantity: 1 })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Purchase failed');
    }

    const result = await response.json();

    // Update game state
    if (result.state) {
      updateGameState(result.state);
    }

    // Show narration
    if (result.narration) {
      narration.showNarration(result.narration);
      triggerJpdbParse();
    }

    // Refresh shop display
    await openShop();
    updateUI();
  } catch (error) {
    console.error('Buy error:', error);
    narration.showNarration(`購入に失敗した: ${error.message}`);
  }
}

/**
 * Close shop modal
 */
export function closeShop() {
  document.getElementById('shop-modal').classList.add('hidden');
}

// ============ BLACKSMITH FUNCTIONS ============

/**
 * Open blacksmith refinement modal
 */
export async function openBlacksmith() {
  try {
    const data = await apiGetRefinePreview();
    if (data.error) {
      throw new Error(data.error);
    }

    const blacksmithModal = document.getElementById('blacksmith-modal');
    const blacksmithGold = document.getElementById('blacksmith-player-gold');
    const blacksmithItems = document.getElementById('blacksmith-items');

    // Update gold display
    blacksmithGold.textContent = data.playerGold;

    // Render equipment items for refinement
    const previews = data.previews || {};
    const slots = ['weapon', 'body', 'shield', 'accessory'];
    const slotNames = { weapon: '武器', body: '体', shield: '盾', accessory: 'アクセサリー' };

    if (Object.keys(previews).length === 0) {
      blacksmithItems.innerHTML = '<p class="blacksmith-empty">「装備がないな...何も鍛えられない」</p>';
    } else {
      blacksmithItems.innerHTML = slots.map(slot => {
        const preview = previews[slot];
        if (!preview) return '';

        const canAfford = data.playerGold >= (preview.cost || 0);
        const isMaxed = preview.maxed;
        const breakChance = preview.breakChance || 0;
        const isRisky = breakChance > 0;

        let itemClass = 'blacksmith-item';
        if (isMaxed) itemClass += ' maxed';
        else if (!canAfford) itemClass += ' cannot-afford';

        const currentLevel = preview.currentLevel || 0;
        const displayName = currentLevel > 0 ? `${preview.itemName} +${currentLevel}` : preview.itemName;

        if (isMaxed) {
          return `
            <div class="${itemClass}">
              <div class="blacksmith-item-info">
                <div class="blacksmith-slot-name">${slotNames[slot]}</div>
                <div class="blacksmith-item-name">${displayName}</div>
                <div class="blacksmith-item-status">MAX +10</div>
              </div>
            </div>
          `;
        }

        return `
          <div class="${itemClass}" data-slot="${slot}">
            <div class="blacksmith-item-info">
              <div class="blacksmith-slot-name">${slotNames[slot]}</div>
              <div class="blacksmith-item-name">${displayName} → +${preview.targetLevel}</div>
              <div class="blacksmith-item-meta">
                <span class="blacksmith-cost">${preview.cost}G</span>
                ${isRisky ? `<span class="blacksmith-risk ${breakChance >= 30 ? 'high-risk' : ''}">${breakChance}% 破壊</span>` : '<span class="blacksmith-safe">安全</span>'}
                ${preview.indestructible ? '<span class="blacksmith-protected">破壊不可</span>' : ''}
              </div>
            </div>
            <button class="blacksmith-refine-btn"
                    onclick="refineItem('${slot}')"
                    ${!canAfford ? 'disabled' : ''}>
              ${isRisky ? '精錬!' : '精錬'}
            </button>
          </div>
        `;
      }).join('');
    }

    blacksmithModal.classList.remove('hidden');
  } catch (error) {
    console.error('Blacksmith error:', error);
    narration.showNarration('鍛冶屋との会話に失敗した。');
  }
}

/**
 * Attempt to refine equipment
 * @param {string} slot - Equipment slot to refine
 */
export async function refineItemHandler(slot) {
  try {
    // Close modal during refinement
    closeBlacksmith();

    const result = await apiRefineItem(slot);
    if (result.error) {
      throw new Error(result.error);
    }

    // Update game state
    if (result.state) {
      updateGameState(result.state);
    }

    // Show narration
    if (result.narration) {
      narration.showNarration(result.narration);
      triggerJpdbParse();
    }

    updateUI();

    // Reopen blacksmith after a delay
    await delay(500);
    await openBlacksmith();
  } catch (error) {
    console.error('Refine error:', error);
    narration.showNarration(`精錬に失敗した: ${error.message}`);
  }
}

/**
 * Close blacksmith modal
 */
export function closeBlacksmith() {
  document.getElementById('blacksmith-modal').classList.add('hidden');
}

// ============ CHIP UPGRADE (MODDER) FUNCTIONS ============

/**
 * Open chip upgrade (modder) modal
 */
export async function openChipUpgradeModal() {
  console.log('[openChipUpgradeModal] Called');
  try {
    console.log('[openChipUpgradeModal] Fetching preview...');
    const response = await fetch(`${API_BASE}/api/game/chip-upgrade-preview`);
    console.log('[openChipUpgradeModal] Response status:', response.status);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[openChipUpgradeModal] Error response:', errorData);
      throw new Error(errorData.error || 'Failed to load chip upgrade preview');
    }
    const data = await response.json();
    console.log('[openChipUpgradeModal] Data:', data);

    const modal = document.getElementById('chip-upgrade-modal');
    const goldDisplay = document.getElementById('chip-upgrade-gold');
    const greetingDisplay = document.getElementById('chip-upgrade-greeting');
    const itemsContainer = document.getElementById('chip-upgrade-items');

    // Update gold display
    goldDisplay.textContent = data.playerGold;

    // Show greeting
    if (greetingDisplay && data.greeting) {
      greetingDisplay.textContent = data.greeting;
    }

    // Render chips
    const chips = data.chips || [];
    if (chips.length === 0) {
      itemsContainer.innerHTML = '<p class="chip-upgrade-empty">「強化できるチップがないな...」</p>';
    } else {
      itemsContainer.innerHTML = chips.map(chip => {
        const canAfford = data.playerGold >= chip.upgradeCost;
        const failurePercent = Math.round(chip.failureChance * 100);

        // Determine risk level for styling
        let riskClass = 'low';
        if (failurePercent >= 20) riskClass = 'high';
        else if (failurePercent >= 10) riskClass = 'medium';

        // Get icon path (strip rarity suffix for icon lookup)
        const baseId = chip.baseId || chip.id.split('_')[0];
        const iconPath = `/assets/icons/chips/${baseId}.png`;

        const chipName = chip.name || chip.nameEn || baseId;
        const currentRarityName = RARITY_NAMES[chip.rarity] || chip.rarity;
        const nextRarityName = RARITY_NAMES[chip.nextRarity] || chip.nextRarity;

        return `
          <div class="chip-upgrade-item rarity-${chip.rarity} ${!canAfford ? 'cannot-afford' : ''}" data-chip-id="${chip.id}">
            <img class="chip-upgrade-item-icon" src="${iconPath}" alt="${chipName}" onerror="this.src='/assets/icons/chips/default.png'">
            <div class="chip-upgrade-item-info">
              <div class="chip-upgrade-item-name">${chipName}</div>
              <div class="chip-upgrade-item-rarity">
                <span class="chip-upgrade-rarity-current rarity-${chip.rarity}">${currentRarityName}</span>
                <span class="chip-upgrade-rarity-arrow">→</span>
                <span class="chip-upgrade-rarity-next rarity-${chip.nextRarity}">${nextRarityName}</span>
              </div>
            </div>
            <div class="chip-upgrade-item-meta">
              <span class="chip-upgrade-cost">${chip.upgradeCost}G</span>
              <span class="chip-upgrade-risk ${riskClass}">${failurePercent}% 失敗</span>
              <button class="chip-upgrade-btn"
                      onclick="performChipUpgrade('${chip.id}')"
                      ${!canAfford ? 'disabled' : ''}>
                強化
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    console.log('[openChipUpgradeModal] Modal opened successfully');

    // Update game state if provided
    if (data.state) {
      updateGameState(data.state);
    }
  } catch (error) {
    console.error('[openChipUpgradeModal] Error:', error);
    narration.showNarration('改造屋との会話に失敗した。');
  }
}

/**
 * Attempt to upgrade chip rarity
 * @param {string} chipId - ID of chip to upgrade
 */
export async function performChipUpgrade(chipId) {
  try {
    // Close modal during upgrade
    closeChipUpgradeModal();

    const response = await fetch(`${API_BASE}/api/game/chip-upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Upgrade failed');
    }

    const result = await response.json();

    // Update game state
    if (result.state) {
      updateGameState(result.state);
    }

    // Show result narration
    if (result.message) {
      narration.showNarration(result.message);
      triggerJpdbParse();
    }

    updateUI();
  } catch (error) {
    console.error('Chip upgrade error:', error);
    narration.showNarration(`強化に失敗した: ${error.message}`);
    updateUI();
  }
}

/**
 * Close chip upgrade modal
 */
export function closeChipUpgradeModal() {
  document.getElementById('chip-upgrade-modal').classList.add('hidden');
}

// ============ CONTENT DISPLAY FUNCTIONS ============

/**
 * Display boss ready screen
 */
export function showBossReadyContent() {
  const gameState = getGameState();
  if (!gameState) return;

  const run = gameState.run;
  if (!run) return;

  gameContent.innerHTML = `
    <div class="floor-display boss-ready">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="floor-status boss-status">BOSS AHEAD</span>
      </div>
      <div class="boss-warning">
        <span class="skull-icon">&#x1F480;</span>
        <p>The floor guardian awaits...</p>
      </div>
    </div>
  `;
}

/**
 * Display floor complete screen
 */
export function showFloorCompleteContent() {
  const gameState = getGameState();
  if (!gameState) return;

  const run = gameState.run;
  if (!run) return;

  const isComplete = run.floor >= 7;

  gameContent.innerHTML = `
    <div class="floor-display floor-complete">
      <div class="floor-header">
        <span class="floor-number">Ward ${run.floor}</span>
        <span class="floor-status complete-status">${isComplete ? 'DUNGEON CLEARED!' : 'CLEARED!'}</span>
      </div>
      <div class="complete-message">
        <span class="victory-icon">${isComplete ? '&#x1F451;' : '&#x2B06;'}</span>
        <p>${isComplete ? 'You have conquered the Shadow Gate!' : 'A stairway descends into darkness...'}</p>
      </div>
    </div>
  `;
}

/**
 * Display post-combat shop in modal
 */
export function showPostCombatShopContent() {
  const gameState = getGameState();
  if (!gameState) return;

  const run = gameState.run;
  if (!run || !run.postCombatShop) return;

  const shop = run.postCombatShop;
  const player = run.player || gameState.player;
  const gold = player?.gold || 0;
  const isStartingChips = shop.isStartingChips;

  // Update title and greeting
  const shopTitle = document.getElementById('shop-title');
  const shopGreeting = document.getElementById('shop-greeting');
  if (isStartingChips) {
    if (shopTitle) shopTitle.textContent = 'チップを選択';
    if (shopGreeting) shopGreeting.textContent = '「冒険の始まりに、一つチップをあげよう。選びな」';
  } else {
    if (shopTitle) shopTitle.textContent = 'チップを獲得！';
    if (shopGreeting) shopGreeting.textContent = '「戦いの成果だ。一つ選びな」';
  }

  // Update gold display
  const goldDisplay = document.getElementById('shop-player-gold');
  if (goldDisplay) goldDisplay.textContent = gold;

  // Show skip and refresh buttons, hide close button for post-combat shop
  const closeBtn = document.getElementById('shop-close-btn');
  const skipBtn = document.getElementById('shop-skip-btn');
  const refreshBtn = document.getElementById('shop-refresh-btn');
  const closeX = document.getElementById('close-shop');
  if (closeBtn) closeBtn.classList.add('hidden');
  if (skipBtn) skipBtn.classList.remove('hidden');
  if (refreshBtn) refreshBtn.classList.remove('hidden');
  if (closeX) closeX.classList.add('hidden');

  // Generate shop items HTML using same format as regular shop
  const shopItemsContainer = document.getElementById('shop-items');
  if (shopItemsContainer) {
    const itemsHtml = shop.items.map((item, index) => {
      let itemClass = `shop-item rarity-${item.rarity || 'common'}`;

      // Build stats string
      const statsStr = formatItemStats(item);

      const rarityLabel = {
        common: 'コモン - 効果1.0x',
        uncommon: 'アンコモン - 効果1.5x',
        rare: 'レア - 効果2.0x',
        epic: 'エピック - 効果2.5x',
        legendary: 'レジェンド - 効果3.0x'
      }[item.rarity] || '';

      const iconId = item.baseId || item.itemId.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      const priceDisplay = 'FREE';
      const buyAction = isStartingChips ? `claimStartingChip(${index})` : `buyFromShop(${index})`;
      const buyLabel = '選択';

      return `
        <div class="${itemClass}" data-item-index="${index}" onclick="selectShopItem(${index})">
          <img class="shop-item-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <div class="shop-item-info">
            <div class="shop-item-name">
              ${item.name}
              ${rarityLabel ? `<span class="shop-item-rarity rarity-${item.rarity}">[${rarityLabel}]</span>` : ''}
            </div>
            <div class="shop-item-desc">${item.description || ''}</div>
            ${statsStr ? `<div class="shop-item-stats">${statsStr}</div>` : ''}
          </div>
          <div class="shop-item-meta">
            <span class="shop-item-price free-chip">${priceDisplay}</span>
            <button class="shop-item-buy"
                    onclick="event.stopPropagation(); ${buyAction}">
              ${buyLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');
    shopItemsContainer.innerHTML = itemsHtml;
  }

  // Reset shop selection and show the modal
  selectedShopIndex = -1;
  if (shopModal) shopModal.classList.remove('hidden');
}

/**
 * Claim free starting chip
 * @param {number} itemIndex - Index of chip to claim
 */
export async function claimStartingChipHandler(itemIndex) {
  const result = await apiClaimStartingChip(itemIndex);
  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Clear the starting chip shop flag
    const gameState = getGameState();
    if (gameState.run) {
      gameState.run.startingChipShop = { active: false };
      gameState.run.postCombatShop = { active: false };
    }
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    narration.showNarration(result.chip?.name ? result.chip.name + 'を獲得した！' : 'チップを獲得！');
  }
}

/**
 * Reset shop modal to default state
 */
export function resetShopModal() {
  // Reset shop selection
  selectedShopIndex = -1;
  // Reset shop modal back to default state
  const shopTitle = document.getElementById('shop-title');
  const shopGreeting = document.getElementById('shop-greeting');
  const closeBtn = document.getElementById('shop-close-btn');
  const skipBtn = document.getElementById('shop-skip-btn');
  const refreshBtn = document.getElementById('shop-refresh-btn');
  const closeX = document.getElementById('close-shop');
  if (shopTitle) shopTitle.textContent = 'Merchant';
  if (shopGreeting) shopGreeting.textContent = '「いらっしゃい、冒険者よ。何が欲しい？」';
  if (closeBtn) closeBtn.classList.remove('hidden');
  if (skipBtn) skipBtn.classList.add('hidden');
  if (refreshBtn) refreshBtn.classList.add('hidden');
  if (closeX) closeX.classList.remove('hidden');
}

/**
 * Claim chip from post-combat reward
 * @param {number} itemIndex - Index of chip to claim
 */
export async function buyFromShop(itemIndex) {
  const gameState = getGameState();
  const result = await apiPostCombatShopBuy(itemIndex);

  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Update state from server
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    narration.showNarration(result.item?.name ? result.item.name + 'を獲得した！' : '獲得完了！');
  }
}

/**
 * Skip post-combat shop
 */
export async function skipShop() {
  const result = await apiShopSkip();
  if (result) {
    // Hide shop modal and reset state
    if (shopModal) shopModal.classList.add('hidden');
    resetShopModal();
    // Update state from server
    const gameState = getGameState();
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
  }
}

/**
 * Refresh post-combat shop items
 */
export async function refreshShop() {
  const result = await apiPostCombatShopRefresh();
  if (result) {
    // Update state from server
    const gameState = getGameState();
    if (result.state) {
      updateGameState({ ...gameState, ...result.state });
    }
    // Re-render the shop with new items
    showPostCombatShopContent();
    narration.showNarration('商人が新しい品を出してきた！');
  }
}

/**
 * Display run ended screen
 */
export function showRunEndedContent() {
  gameContent.innerHTML = `
    <div class="content-center">
      <h2>Run Ended</h2>
      <p>Return to the guild to recover and try again.</p>
    </div>
  `;
}

/**
 * Select shop item for keyboard navigation
 * @param {number} index - Index of item to select
 */
export function selectShopItem(index) {
  const shopItems = shopModal?.querySelectorAll('.shop-item');
  if (!shopItems || index < 0 || index >= shopItems.length) return;

  // Remove selection from all items
  shopItems.forEach(item => item.classList.remove('keyboard-selected'));

  // Select the clicked item
  selectedShopIndex = index;
  shopItems[index].classList.add('keyboard-selected');

  // Speak the chip name
  const chipName = shopItems[index].querySelector('.shop-item-name')?.childNodes[0]?.textContent?.trim();
  if (chipName) {
    tts.speakText(chipName);
  }
}

// ============ WINDOW EXPORTS ============
// Make functions available globally for onclick handlers
window.buyItem = buyItem;
window.refineItem = refineItemHandler;
window.performChipUpgrade = performChipUpgrade;
window.closeChipUpgradeModal = closeChipUpgradeModal;
window.claimStartingChip = claimStartingChipHandler;
window.buyFromShop = buyFromShop;
window.skipShop = skipShop;
window.refreshShop = refreshShop;
window.selectShopItem = selectShopItem;
