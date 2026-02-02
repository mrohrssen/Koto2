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
let apiPostCombatShopBuy = null;
let apiShopSkip = null;
let apiShopRefresh = null;
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
  apiShopRefresh = callbacks.apiShopRefresh;
  apiGetChipLoadout = callbacks.apiGetChipLoadout;
  setChipLoadoutCache = callbacks.setChipLoadoutCache;
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
export async function renderStartingChipShop(items) {
  const chip = await chipSelect.showChipSelect(items);
  const index = items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

  const result = await apiClaimStartingChip(index);
  if (result?.state) {
    updateGameState(result.state);
  }

  speakText(chip.nameEn || chip.name);

  if (apiGetChipLoadout && setChipLoadoutCache) {
    const loadout = await apiGetChipLoadout();
    setChipLoadoutCache(loadout);
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
