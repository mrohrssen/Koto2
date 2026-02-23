/**
 * @file economy.js - Dealer Room UI
 *
 * PURPOSE:
 * Manages the dealer room interface where players can buy and sell robots.
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with game state and API callbacks
 * - renderDealerRoom(actionsModule): Show dealer room UI
 *
 * DEPENDENCIES:
 * - ./sprite-utils.js: Robot sprite paths
 * - ./narration-box.js: Dealer greeting narration
 */

import { robotSpritePath } from './sprite-utils.js';
import * as narrationBox from './narration-box.js';

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
          <div class="dealer-offer-top">
            <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})"><img src="${robotSpritePath(robot.id)}" alt="${robot.nameEn}" style="width:100%;height:100%;object-fit:contain" /></div>
            <div class="dealer-offer-info">
              <div class="dealer-item-name">${robot.nameEn}</div>
              <div class="shrine-chip-rarity ${robot.rarity || 'common'}">${robot.rarity} \u00B7 ${robot.element} \u00B7 Lv.${robot.level}</div>
              <div class="dealer-offer-desc">HP: ${robot.maxHp} \u00B7 ATK: ${robot.attack}</div>
            </div>
          </div>
          <button class="dealer-buy-btn action-btn action-btn-primary" data-robot-id="${robot.id}" ${btnDisabled}>${robot.buyPrice}cr で仲間に</button>
        </div>
      `;
    }).join('');

    buyHtml = `
      <div class="dealer-section-title">仲間モンスター</div>
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
        <div class="shrine-chip-icon" style="border-color: var(--rarity-${robot.rarity || 'common'})"><img src="${robotSpritePath(robot.id)}" alt="${robot.nameEn}" style="width:100%;height:100%;object-fit:contain" /></div>
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
  }).join('') : '<p style="text-align:center;color:var(--text-secondary)">モンスターがいない</p>';

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
      <button class="dealer-leave-btn action-btn action-btn-secondary">\u7ACB\u3061\u53BB\u308B</button>
    </div>
  `);

  // Show dealer greeting via standard narration system
  narrationBox.show('いらっしゃい！珍しいモンスターが入荷したよ！', { speaker: '行商人' });

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
