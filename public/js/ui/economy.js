import { creatureSpriteHtml } from './sprite-utils.js';
import * as narrationBox from './narration-box.js';
import { t } from './i18n.js';
import { credits as creditsPopup, animateCounter } from './event-popup.js';
import { pop } from './dom-effects.js';

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let getExploreSession = null;
let apiGetDealerState = null;

function recordDealerAction(kind, payload = {}) {
  const session = getExploreSession?.();
  let result = null;
  if (kind === 'dealer.sell') {
    result = session?.recordRoomAction('dealer.sell', payload);
  } else if (kind === 'dealer.buy') {
    result = session?.recordRoomAction('dealer.buy', payload);
  } else if (kind === 'dealer.leave') {
    result = session?.recordRoomAction('dealer.leave', payload);
  }
  return result?.accepted ? result : null;
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function uniqueObjects(values) {
  return values.filter((value, index, list) => (
    value && list.findIndex(candidate => candidate === value) === index
  ));
}

function currentPreparedRoomDraft(draft) {
  const currentRoom = draft?.run?.currentRoom;
  if (!Number.isInteger(currentRoom)) return null;
  const preparedRooms = draft?.run?.exploreRunway?.preparedRooms;
  if (!Array.isArray(preparedRooms)) return null;
  return preparedRooms.find(preparedRoom => preparedRoom?.index === currentRoom) || null;
}

function activeRoomDrafts(draft) {
  const run = draft?.run;
  const currentRoom = run?.currentRoom;
  const preparedRoom = currentPreparedRoomDraft(draft);
  return uniqueObjects([
    draft?.room,
    Number.isInteger(currentRoom)
      ? run?.revealedRooms?.find(entry => entry?.index === currentRoom)?.room
      : null,
    Number.isInteger(currentRoom) && Array.isArray(run?.rooms)
      ? run.rooms[currentRoom]
      : null,
    preparedRoom?.room,
  ]);
}

function updateDealerRoomState(mutator, { phase = null, payloadMutator = null } = {}) {
  const currentState = getGameState?.();
  if (!currentState) return null;
  const draft = cloneValue(currentState);
  activeRoomDrafts(draft).forEach(room => mutator(room, draft));
  const preparedRoom = currentPreparedRoomDraft(draft);
  if (payloadMutator && preparedRoom?.interactionPayload) {
    const payload = cloneValue(preparedRoom.interactionPayload);
    payloadMutator(payload, draft);
    preparedRoom.interactionPayload = payload;
  }
  if (phase) draft.phase = phase;
  updateGameState(draft);
  getExploreSession?.()?.adoptRunway?.(draft.run?.exploreRunway || null);
  return draft;
}

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  getExploreSession = callbacks.getExploreSession;
  apiGetDealerState = callbacks.apiGetDealerState;
}

/** Render dealer room UI */
export async function renderDealerRoom(actionsModule) {
  getExploreSession?.()?.adoptRunway?.(getGameState?.()?.run?.exploreRunway || null);
  const prepared = getExploreSession?.()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  const dealerData = payload || await apiGetDealerState();
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
      const creatureId = e.target.dataset.creatureId;
      const queued = recordDealerAction('dealer.buy', { creatureId });
      if (!queued) {
        e.target.disabled = false;
        return;
      }
      const creature = offeredCreatures.find(candidate => candidate.id === creatureId);
      updateDealerRoomState((room, draft) => {
        room.dealer ||= {};
        room.dealer.purchasedCreature = creatureId;
        if (draft.run?.player && creature?.buyPrice) {
          draft.run.player.credits = Math.max(0, (draft.run.player.credits || 0) - creature.buyPrice);
        }
      }, {
        payloadMutator: payload => {
          payload.offeredCreatures = (payload.offeredCreatures || [])
            .filter(candidate => candidate?.id !== creatureId);
          payload.canBuy = false;
          if (creature?.buyPrice) payload.credits = Math.max(0, (payload.credits || 0) - creature.buyPrice);
        },
      });
      const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
      if (creditsEl && creature?.buyPrice) {
        creditsPopup(creditsEl, -creature.buyPrice);
        const remaining = Math.max(0, credits - creature.buyPrice);
        animateCounter(creditsEl, credits, remaining, 400, { flashColor: '#F44336' });
      }
      const card = e.target.closest('.dealer-offer-card');
      if (card) {
        pop(card, 1.1);
        card.remove();
      }
    });
  });

  // Wire sell buttons (event delegation)
  document.querySelector('.dealer-inventory-list')?.addEventListener('click', async (e) => {
    const sellBtn = e.target.closest('.dealer-sell-btn');
    if (!sellBtn || sellBtn.disabled) return;

    const creatureId = sellBtn.dataset.creatureId;
    sellBtn.disabled = true;
    const queued = recordDealerAction('dealer.sell', { creatureId });
    if (!queued) {
      sellBtn.disabled = false;
      return;
    }
    const sellPrice = Number(sellBtn.dataset.sellPrice) || 0;
    updateDealerRoomState((room, draft) => {
      room.dealer ||= {};
      room.dealer.soldCreatures ||= [];
      if (!room.dealer.soldCreatures.includes(creatureId)) {
        room.dealer.soldCreatures.push(creatureId);
      }
      if (draft.run?.player && sellPrice) {
        draft.run.player.credits = (draft.run.player.credits || 0) + sellPrice;
      }
    }, {
      payloadMutator: payload => {
        payload.partyCreatures = (payload.partyCreatures || [])
          .filter(creature => creature?.id !== creatureId);
        payload.sellCount = Math.min(payload.maxSells || 0, (payload.sellCount || 0) + 1);
        if (sellPrice) payload.credits = (payload.credits || 0) + sellPrice;
      },
    });
    const creditsEl = document.querySelector('.dealer-credits') || document.querySelector('.credits-display');
    if (creditsEl && sellPrice) {
      creditsPopup(creditsEl, sellPrice);
      animateCounter(creditsEl, credits, credits + sellPrice, 400, { flashColor: '#FFD700' });
    }
    sellBtn.closest('.dealer-inventory-item')?.remove();
  });

  // Wire leave button
  document.querySelector('.dealer-leave-btn')?.addEventListener('click', async () => {
    const queued = recordDealerAction('dealer.leave', {});
    if (queued) {
      updateDealerRoomState(room => {
        room.dealer ||= {};
        room.dealer.visited = true;
        room.interacted = true;
      }, { phase: 'room' });
      updateUI();
    }
  });
}
