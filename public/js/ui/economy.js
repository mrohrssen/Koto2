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
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
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

  const chip = await chipSelect.showChipSelect(shop.items, { allowSkip: true });

  // Handle skip
  if (!chip) {
    await handleSkip();
    return;
  }

  const index = shop.items.findIndex(c => (c.itemId || c.id) === (chip.itemId || chip.id));

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
