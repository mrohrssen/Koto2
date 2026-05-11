import { creatureSpriteHtml } from './sprite-utils.js';
import * as narrationBox from './narration-box.js';
import { t } from './i18n.js';
import { credits as creditsPopup, animateCounter } from './event-popup.js';
import { pop } from './dom-effects.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let apiShopSkip = null;
let apiDealerSell = null;
let apiDealerBuy = null;
let apiDealerLeave = null;
let apiGetDealerState = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  apiShopSkip = callbacks.apiShopSkip;
  apiDealerSell = callbacks.apiDealerSell;
  apiDealerBuy = callbacks.apiDealerBuy;
  apiDealerLeave = callbacks.apiDealerLeave;
  apiGetDealerState = callbacks.apiGetDealerState;
}

/** Render dealer room UI */
export async function renderDealerRoom(actionsModule) {
  const dealerData = await apiGetDealerState();
  if (!dealerData || dealerData.error) {
    console.error('Failed to load dealer state:', dealerData?.error);
    return;
  }

  const { offeredCreatures, partyCreatures, credits, canBuy, sellCount, maxSells } = dealerData;
  const canSellMore = sellCount < maxSells;

  // Buy section
  let buyHtml = '';
  if (canBuy && offeredCreatures.length > 0) {
    const creatureCards = offeredCreatures.map(creature => {
      const affordable = credits >= creature.buyPrice;
      const btnDisabled = !affordable ? 'disabled' : '';
      return `
        <div class="dealer-offer-card" style="margin-bottom:0.5rem">
          <div class="dealer-offer-top">
            <div class="shrine-creature-icon" style="border-color: var(--rarity-${creature.rarity || 'common'})">${creatureSpriteHtml(creature.id, creature.name, creature.element)}</div>
            <div class="dealer-offer-info">
              <div class="dealer-item-name">${creature.nameEn}</div>
              <div class="shrine-creature-rarity ${creature.rarity || 'common'}">${creature.rarity} \u00B7 ${creature.element} \u00B7 Lv.${creature.level}</div>
              <div class="dealer-offer-desc">HP: ${creature.maxHp} \u00B7 ATK: ${creature.attack}</div>
            </div>
          </div>
          <button class="dealer-buy-btn" data-creature-id="${creature.id}" ${btnDisabled}>${t('dealerBuyBtn', creature.buyPrice)}</button>
        </div>
      `;
    }).join('');

    buyHtml = `
      <div class="dealer-section-title">${t('dealerCompanions')}</div>
      ${creatureCards}
    `;
  } else if (!canBuy) {
    buyHtml = `<div class="dealer-section-title" style="opacity:0.5">${t('dealerSoldOut')}</div>`;
  }

  // Sell section
  const sellLabel = canSellMore ? t('dealerSell', sellCount, maxSells) : t('dealerSellLimit', maxSells, maxSells);
  const partyHtml = partyCreatures.length > 0 ? partyCreatures.map(creature => {
    const hpPercent = Math.floor((creature.hp / creature.maxHp) * 100);
    const slotBadge = creature.slot === 'active' ? t('dealerActive') : t('dealerReserve');
    return `
      <div class="dealer-inventory-item" data-creature-id="${creature.id}">
        <div class="shrine-creature-icon" style="border-color: var(--rarity-${creature.rarity || 'common'})">${creatureSpriteHtml(creature.id, creature.name, creature.element)}</div>
        <div class="dealer-item-info">
          <div class="dealer-item-name">${creature.nameEn} Lv.${creature.level}</div>
          <div class="dealer-item-meta">
            <span class="shrine-creature-rarity ${creature.rarity || 'common'}">${creature.rarity}</span>
            <span style="font-size:0.75rem;opacity:0.7">${slotBadge}</span>
          </div>
        </div>
        <button class="dealer-sell-btn" data-creature-id="${creature.id}" data-sell-price="${creature.sellPrice}" ${!canSellMore ? 'disabled' : ''}>
          ${t('dealerSellBtn', creature.sellPrice)}
        </button>
      </div>
    `;
  }).join('') : `<p style="text-align:center;color:var(--text-secondary)">${t('dealerEmpty')}</p>`;

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
      <button class="dealer-leave-btn">${t('dealerLeave')}</button>
    </div>
  `);

  // Show dealer greeting via standard narration system
  narrationBox.show(t('dealerGreeting'), {
    speaker: { name: '行商人', reading: 'ぎょうしょうにん', meaning: 'traveling merchant' },
    html: true
  });

  // Wire buy buttons
  document.querySelectorAll('.dealer-buy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const creatureId = e.target.dataset.creatureId;
        const result = await apiDealerBuy(creatureId);
        if (result?.state) { updateGameState(result.state); }
        if (result?.success) {
          const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
          if (creditsEl && result.creditsSpent) {
            creditsPopup(creditsEl, -result.creditsSpent);
            const prevCredits = (result.creditsRemaining || 0) + result.creditsSpent;
            animateCounter(creditsEl, prevCredits, result.creditsRemaining, 400, { flashColor: '#F44336' });
          }
          const buyBtn = document.querySelector(`.dealer-buy-btn[data-creature-id="${creatureId}"]`);
          const card = buyBtn?.closest('.dealer-offer-card');
          if (card) pop(card, 1.1);
        }
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

    const creatureId = sellBtn.dataset.creatureId;
    sellBtn.disabled = true;
    try {
      const result = await apiDealerSell(creatureId);
      if (result?.state) { updateGameState(result.state); }
      if (result?.success) {
        const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
        if (creditsEl && result.creditsGained) {
          creditsPopup(creditsEl, result.creditsGained);
          const prevCredits = (result.creditsRemaining || 0) - result.creditsGained;
          animateCounter(creditsEl, prevCredits, result.creditsRemaining, 400, { flashColor: '#FFD700' });
        }
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
    if (result?.state) { updateGameState(result.state); }
    updateUI();
  });
}
