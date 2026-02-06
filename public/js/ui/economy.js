/**
 * @file economy.js - Chip Shop UI
 *
 * PURPOSE:
 * Manages chip acquisition interfaces: post-combat chip rewards and starting
 * chip selection at run begin. Uses chip-select.js for the actual card UI.
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with game state and API callbacks
 * - renderPostCombatShop(): Show chip reward after combat victory
 * - renderStartingChipShop(items): Show starting chip selection
 *
 * DEPENDENCIES:
 * - ../audio.js: Sound effects (chip-equip)
 * - ../tts.js: Text-to-speech for chip names
 * - ./chip-select.js: Swipeable chip card UI
 * - API callbacks: apiClaimStartingChip, apiPostCombatShopBuy, apiShopSkip
 *
 * FLOW:
 * - Post-combat: Shows chip selection with skip option, updates loadout on pick
 * - Starting chip: Mandatory selection, no skip allowed
 * - Both refresh chip loadout cache after selection
 */

import { playSFX } from '../audio.js';
import { speakText } from '../tts.js';
import * as chipSelect from './chip-select.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let apiClaimStartingChip = null;
let apiStartingChipRefresh = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;
let apiShopRefresh = null;
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;
let apiDealerSell = null;
let apiDealerBuy = null;
let apiDealerLeave = null;
let apiGetDealerState = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiStartingChipRefresh = callbacks.apiStartingChipRefresh;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
  apiShopRefresh = callbacks.apiShopRefresh;
  apiGetChipLoadout = callbacks.apiGetChipLoadout;
  setChipLoadoutCache = callbacks.setChipLoadoutCache;
  apiDealerSell = callbacks.apiDealerSell;
  apiDealerBuy = callbacks.apiDealerBuy;
  apiDealerLeave = callbacks.apiDealerLeave;
  apiGetDealerState = callbacks.apiGetDealerState;
}

/** Render post-combat chip shop (in-scene, not takeover) */
export async function renderPostCombatShop() {
  const gameState = getGameState();
  const shop = gameState.run?.postCombatShop;
  if (!shop?.active || !shop?.items) {
    await handleSkip();
    return;
  }

  const playerCredits = gameState.player?.credits ?? 0;

  // Handle refresh callback
  const handleRefresh = async () => {
    try {
      const result = await apiShopRefresh();
      if (result?.state) {
        updateGameState(result.state);
      }
      // Update chip select with new items
      const newGameState = getGameState();
      const newShop = newGameState.run?.postCombatShop;
      const newCredits = newGameState.player?.credits ?? 0;
      if (newShop?.items) {
        chipSelect.updateChips(newShop.items, {
          playerCredits: newCredits,
          freeRefreshUsed: newShop.freeRefreshUsed
        });
      }
    } catch (error) {
      console.error('Shop refresh failed:', error);
    }
  };

  const chip = await chipSelect.showChipSelect(shop.items, {
    allowSkip: true,
    playerCredits,
    freeRefreshUsed: shop.freeRefreshUsed || false,
    onRefresh: apiShopRefresh ? handleRefresh : null
  });

  // Handle skip
  if (!chip) {
    await handleSkip();
    return;
  }

  const index = shop.items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

  try {
    const result = await apiPostCombatShopBuy(index);
    if (result?.state) {
      updateGameState(result.state);
    }

    playSFX('chip-equip');
    speakText(chip.nameEn || chip.name);

    if (apiGetChipLoadout && setChipLoadoutCache) {
      const loadout = await apiGetChipLoadout();
      setChipLoadoutCache(loadout);
    }
  } catch (error) {
    console.error('Shop purchase failed:', error);
    // If purchase failed (not enough credits, etc), re-show the shop
    await renderPostCombatShop();
    return;
  }

  updateUI();
}

/** Render starting chip selection (in-scene, not takeover) */
export async function renderStartingChipShop() {
  const gameState = getGameState();
  const shop = gameState.run?.startingChipShop;
  if (!shop?.active || !shop?.items) {
    console.error('No starting chip shop available');
    return;
  }

  const playerCredits = gameState.player?.credits ?? 0;

  // Handle refresh callback
  const handleRefresh = async () => {
    try {
      const result = await apiStartingChipRefresh();
      if (result?.state) {
        updateGameState(result.state);
      }
      // Update chip select with new items
      const newGameState = getGameState();
      const newShop = newGameState.run?.startingChipShop;
      const newCredits = newGameState.player?.credits ?? 0;
      if (newShop?.items) {
        chipSelect.updateChips(newShop.items, {
          playerCredits: newCredits,
          freeRefreshUsed: newShop.freeRefreshUsed
        });
      }
    } catch (error) {
      console.error('Starting chip refresh failed:', error);
    }
  };

  const chip = await chipSelect.showChipSelect(shop.items, {
    playerCredits,
    freeRefreshUsed: shop.freeRefreshUsed || false,
    onRefresh: apiStartingChipRefresh ? handleRefresh : null
  });

  const index = shop.items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

  try {
    const result = await apiClaimStartingChip(index);
    if (result?.state) {
      updateGameState(result.state);
    }

    playSFX('chip-equip');
    speakText(chip.nameEn || chip.name);

    if (apiGetChipLoadout && setChipLoadoutCache) {
      const loadout = await apiGetChipLoadout();
      setChipLoadoutCache(loadout);
    }
  } catch (error) {
    console.error('Starting chip purchase failed:', error);
    // If purchase failed, re-show the shop
    await renderStartingChipShop();
    return;
  }

  updateUI();
}

async function handleSkip() {
  const result = await apiShopSkip();
  if (result?.state) {
    updateGameState(result.state);
  }
  updateUI();
}

/** Render dealer room UI */
export async function renderDealerRoom(actionsModule) {
  const dealerData = await apiGetDealerState();
  if (!dealerData || dealerData.error) {
    console.error('Failed to load dealer state:', dealerData?.error);
    return;
  }

  const { dealer, inventory, credits } = dealerData;

  const offeredChip = dealer.offeredChip;
  const chipPrice = dealer.chipPrice;
  const canAfford = credits >= chipPrice;
  const inventoryFull = inventory.filter(c => !c.isEquipped).length >= 12;

  let offeredChipHtml = '';
  if (!dealer.visited) {
    const buyDisabled = (!canAfford || inventoryFull) ? 'disabled' : '';
    const buyLabel = inventoryFull ? 'インベントリ満杯' : `${chipPrice}cr で購入`;
    offeredChipHtml = `
      <div class="dealer-offered-chip">
        <div class="dealer-section-title">商人のおすすめ</div>
        <div class="dealer-offer-card">
          <div class="shrine-chip-icon" style="background-image:url('/assets/icons/chips/${offeredChip.id}.webp'); border-color: var(--rarity-${offeredChip.rarity || 'common'})"></div>
          <div class="dealer-offer-info">
            <div class="dealer-item-name">${offeredChip.nameEn || offeredChip.name}</div>
            <div class="shrine-chip-rarity ${offeredChip.rarity || 'common'}">${offeredChip.rarity || 'common'}</div>
            <div class="dealer-offer-desc">${offeredChip.descriptionEn || offeredChip.description || ''}</div>
          </div>
        </div>
        <button class="dealer-buy-btn" ${buyDisabled}>${buyLabel}</button>
      </div>
    `;
  }

  const inventoryHtml = inventory.length > 0 ? inventory.map(chip => {
    const equippedBadge = chip.isEquipped ? '<span class="dealer-equipped-badge">装備中</span>' : '';
    const levelText = chip.level > 1 ? ` Lv.${chip.level}` : '';
    return `
      <div class="dealer-inventory-item" data-chip-id="${chip.id}" data-equipped="${chip.isEquipped}">
        <div class="shrine-chip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.webp'); border-color: var(--rarity-${chip.rarity || 'common'})"></div>
        <div class="dealer-item-info">
          <div class="dealer-item-name">${chip.nameEn || chip.name}${levelText}</div>
          <div class="dealer-item-meta">
            <span class="shrine-chip-rarity ${chip.rarity || 'common'}">${chip.rarity || 'common'}</span>
            ${equippedBadge}
          </div>
        </div>
        <button class="dealer-sell-btn" data-chip-id="${chip.id}" data-sell-price="${chip.sellPrice}" data-equipped="${chip.isEquipped}">
          売 ${chip.sellPrice}cr
        </button>
      </div>
    `;
  }).join('') : '<p style="text-align:center;color:var(--text-secondary)">売るチップがない</p>';

  actionsModule.setContent(`
    <div class="dealer-room">
      <div class="dealer-credits">
        <span id="dealer-credits">${credits}</span> cr
      </div>
      ${offeredChipHtml}
      <div class="dealer-section-title">インベントリ</div>
      <div class="dealer-inventory-list">
        ${inventoryHtml}
      </div>
      <button class="dealer-leave-btn">立ち去る</button>
    </div>
  `);

  // Wire buy button
  document.querySelector('.dealer-buy-btn')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const result = await apiDealerBuy();
      if (result?.state) {
        updateGameState(result.state);
      }
      playSFX('chip-equip');
      speakText(offeredChip.nameEn || offeredChip.name);
      if (apiGetChipLoadout && setChipLoadoutCache) {
        const loadout = await apiGetChipLoadout();
        setChipLoadoutCache(loadout);
      }
      updateUI();
      renderDealerRoom(actionsModule);
    } catch (error) {
      console.error('Dealer buy failed:', error);
      e.target.disabled = false;
    }
  });

  // Wire sell buttons (event delegation)
  document.querySelector('.dealer-inventory-list')?.addEventListener('click', async (e) => {
    const sellBtn = e.target.closest('.dealer-sell-btn');
    if (!sellBtn || sellBtn.disabled) return;

    const chipId = sellBtn.dataset.chipId;
    const sellPrice = sellBtn.dataset.sellPrice;
    const isEquipped = sellBtn.dataset.equipped === 'true';

    if (isEquipped) {
      const confirmed = confirm(`このチップは装備中です。${sellPrice}クレジットで売却しますか？`);
      if (!confirmed) return;
    }

    sellBtn.disabled = true;
    try {
      const result = await apiDealerSell(chipId);
      if (result?.state) {
        updateGameState(result.state);
      }
      playSFX('chip-equip');
      if (apiGetChipLoadout && setChipLoadoutCache) {
        const loadout = await apiGetChipLoadout();
        setChipLoadoutCache(loadout);
      }
      updateUI();
      renderDealerRoom(actionsModule);
    } catch (error) {
      console.error('Dealer sell failed:', error);
      sellBtn.disabled = false;
    }
  });

  // Wire leave button
  document.querySelector('.dealer-leave-btn')?.addEventListener('click', async () => {
    const result = await apiDealerLeave();
    if (result?.state) {
      updateGameState(result.state);
    }
    if (apiGetChipLoadout && setChipLoadoutCache) {
      const loadout = await apiGetChipLoadout();
      setChipLoadoutCache(loadout);
    }
    updateUI();
  });
}
