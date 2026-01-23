/**
 * @fileoverview Economy UI Module - Post-combat chip selection and content displays
 * @module public/js/ui/economy.js
 *
 * PURPOSE:
 * Handles post-combat chip reward selection, boss ready/floor complete screens,
 * and chip stats formatting.
 *
 * KEY EXPORTS:
 * - init(callbacks) - Initialize module with dependencies
 * - formatItemStats(item) - Format chip stats for display in Japanese
 * - showBossReadyContent() - Display boss ready screen
 * - showFloorCompleteContent() - Display floor complete screen
 * - showPostCombatShopContent() - Display post-combat chip selection in modal
 * - claimStartingChipHandler(itemIndex) - Claim free starting chip
 * - buyFromShop(itemIndex) - Claim post-combat chip reward
 * - skipShop() - Skip post-combat chip selection
 * - refreshShop() - Refresh post-combat chip options
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
let selectedShopIndex = -1;

// DOM elements (initialized in init)
let gameContent = null;
let shopModal = null;

// Callbacks injected via init()
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let narration = null;
let tts = null;

// API functions injected via init()
let apiClaimStartingChip = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;
let apiPostCombatShopRefresh = null;

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

  // Module references
  narration = callbacks.narration;
  tts = callbacks.tts;

  // API functions
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

// ============ CHIP STATS ============

/**
 * Format chip stats for display in Japanese
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

  return stats.join(' ');
}

/**
 * Close shop modal
 */
export function closeShop() {
  document.getElementById('shop-modal').classList.add('hidden');
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
window.claimStartingChip = claimStartingChipHandler;
window.buyFromShop = buyFromShop;
window.skipShop = skipShop;
window.refreshShop = refreshShop;
window.selectShopItem = selectShopItem;
