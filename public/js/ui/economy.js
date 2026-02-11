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
import { robotBgUrl, robotSpritePathStatic } from './sprite-utils.js';

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

  const { offeredRobots, partyRobots, credits, canBuy, sellCount, maxSells } = dealerData;
  const canSellMore = sellCount < maxSells;

  // Buy section
  let buyHtml = '';
  if (canBuy && offeredRobots.length > 0) {
    const robotCards = offeredRobots.map(robot => {
      const affordable = credits >= robot.buyPrice;
      const btnDisabled = !affordable ? 'disabled' : '';
      return `
        <div class="dealer-offer-card" style="margin-bottom:0.5rem">
          <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})"><img src="${robotSpritePathStatic(robot.id)}" alt="${robot.nameEn}" style="width:100%;height:100%;object-fit:contain" /></div>
          <div class="dealer-offer-info">
            <div class="dealer-item-name">${robot.nameEn}</div>
            <div class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity} \u00B7 ${robot.element} \u00B7 Lv.${robot.level}</div>
            <div class="dealer-offer-desc">HP: ${robot.maxHp} \u00B7 ATK: ${robot.attack}</div>
          </div>
          <button class="dealer-buy-btn" data-robot-id="${robot.id}" ${btnDisabled}>${robot.buyPrice}cr \u3067\u96C7\u3046</button>
        </div>
      `;
    }).join('');

    buyHtml = `
      <div class="dealer-section-title">\u50AD\u5175\u30ED\u30DC\u30C3\u30C8</div>
      ${robotCards}
    `;
  } else if (!canBuy) {
    buyHtml = '<div class="dealer-section-title" style="opacity:0.5">\u8CFC\u5165\u6E08\u307F</div>';
  }

  // Sell section
  const sellLabel = canSellMore ? `\u58F2\u5374 (${sellCount}/${maxSells})` : `\u58F2\u5374\u4E0A\u9650 (${maxSells}/${maxSells})`;
  const partyHtml = partyRobots.length > 0 ? partyRobots.map(robot => {
    const hpPercent = Math.floor((robot.hp / robot.maxHp) * 100);
    const slotBadge = robot.slot === 'active' ? '\u30A2\u30AF\u30C6\u30A3\u30D6' : '\u30EA\u30B6\u30FC\u30D6';
    return `
      <div class="dealer-inventory-item" data-robot-id="${robot.id}">
        <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})"><img src="${robotSpritePathStatic(robot.id)}" alt="${robot.nameEn}" style="width:100%;height:100%;object-fit:contain" /></div>
        <div class="dealer-item-info">
          <div class="dealer-item-name">${robot.nameEn} Lv.${robot.level}</div>
          <div class="dealer-item-meta">
            <span class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity}</span>
            <span style="font-size:0.75rem;opacity:0.7">${slotBadge}</span>
          </div>
        </div>
        <button class="dealer-sell-btn" data-robot-id="${robot.id}" data-sell-price="${robot.sellPrice}" ${!canSellMore ? 'disabled' : ''}>
          \u58F2 ${robot.sellPrice}cr
        </button>
      </div>
    `;
  }).join('') : '<p style="text-align:center;color:var(--text-secondary)">\u30ED\u30DC\u30C3\u30C8\u304C\u3044\u306A\u3044</p>';

  actionsModule.setContent(`
    <div class="dealer-room">
      <div class="dealer-credits">
        <span id="dealer-credits">${credits}</span> cr
      </div>
      ${buyHtml}
      <div class="dealer-section-title">${sellLabel}</div>
      <div class="dealer-inventory-list">
        ${partyHtml}
      </div>
      <button class="dealer-leave-btn">\u7ACB\u3061\u53BB\u308B</button>
    </div>
  `);

  // Wire buy buttons
  document.querySelectorAll('.dealer-buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const robotId = e.target.dataset.robotId;
        const result = await apiDealerBuy(robotId);
        if (result?.state) { updateGameState(result.state); }
        updateUI();
        renderDealerRoom(actionsModule);
      } catch (error) {
        console.error('Dealer buy failed:', error);
        e.target.disabled = false;
      }
    });
  });

  // Wire sell buttons (event delegation)
  document.querySelector('.dealer-inventory-list')?.addEventListener('click', async (e) => {
    const sellBtn = e.target.closest('.dealer-sell-btn');
    if (!sellBtn || sellBtn.disabled) return;

    const robotId = sellBtn.dataset.robotId;
    sellBtn.disabled = true;
    try {
      const result = await apiDealerSell(robotId);
      if (result?.state) { updateGameState(result.state); }
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
    if (result?.state) { updateGameState(result.state); }
    updateUI();
  });
}
