/**
 * Economy UI Module (Mobile) - Chip shops via takeover views
 *
 * Handles: post-combat chip shop, starting chip selection
 */

import { playSFX } from '../audio.js';
import { speakText } from '../tts.js';
import * as chipSelect from './chip-select.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let takeover = null;
let sceneModule = null;
let apiClaimStartingChip = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
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
  speakText(chip.name || chip.nameEn);

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

  speakText(chip.name || chip.nameEn);

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
  takeover.close('chipShop');
  updateUI();
}
