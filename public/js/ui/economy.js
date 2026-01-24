/**
 * Economy UI Module (Mobile) - Chip shops via takeover views
 *
 * Handles: post-combat chip shop, starting chip selection
 */

import { playSFX } from '../audio.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let takeover = null;
let sceneModule = null;
let apiClaimStartingChip = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
}

/** Render post-combat chip shop as takeover */
export function renderPostCombatShop() {
  const gameState = getGameState();
  const shop = gameState.run?.postCombatShop;
  if (!shop?.active || !shop?.items) {
    handleSkip();
    return;
  }
  renderChipShopContent(shop.items, false);
}

/** Render starting chip selection as takeover */
export function renderStartingChipShop(items) {
  renderChipShopContent(items, true);
}

function renderChipShopContent(items, isStarting) {
  takeover.open('chipShop');
  const content = takeover.getContent('chipShop');

  const chipCards = items.map((chip, i) => `
    <div class="shop-chip-option" data-index="${i}">
      <div class="shop-chip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.png')"></div>
      <div class="shop-chip-name">${chip.nameEn || chip.name}</div>
      <div class="shop-chip-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="shop-chip-desc">${chip.description || chip.skill?.descriptionEn || ''}</div>
    </div>
  `).join('');

  content.innerHTML = `
    <h3 style="margin:16px;text-align:center">${isStarting ? 'Choose Starting Chip' : 'Choose a Chip'}</h3>
    <div class="shop-chip-list">${chipCards}</div>
    ${!isStarting ? '<button class="action-btn" id="shop-skip-btn" style="margin:16px auto;display:block">Skip</button>' : ''}
  `;

  content.querySelectorAll('.shop-chip-option').forEach(el => {
    el.addEventListener('click', async () => {
      const index = parseInt(el.dataset.index);
      const result = isStarting
        ? await apiClaimStartingChip(index)
        : await apiPostCombatShopBuy(index);

      if (result?.state) {
        updateGameState(result.state);
      }
      takeover.close('chipShop');
      playSFX('chip-equip');
      sceneModule.showToast('Chip acquired!', 2000);
      updateUI();
    });
  });

  document.getElementById('shop-skip-btn')?.addEventListener('click', () => handleSkip());
}

async function handleSkip() {
  const result = await apiShopSkip();
  if (result?.state) {
    updateGameState(result.state);
  }
  takeover.close('chipShop');
  updateUI();
}
