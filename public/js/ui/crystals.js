import { esc } from './bootstrap-client.js';

export function crystalCostHtml(cost) {
  const safeCost = Number.isFinite(Number(cost)) ? Math.max(0, Math.floor(Number(cost))) : 0;
  return `<span class="crystal-cost" aria-label="${safeCost} crystals"><span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-cost-number">${safeCost}</span></span>`;
}

export function updateCrystalBalance(el, balance) {
  if (!el) return;
  const safeBalance = Number.isFinite(Number(balance)) ? Math.max(0, Math.floor(Number(balance))) : 0;
  el.className = 'hud-chip crystal-balance';
  el.innerHTML = `<span class="crystal-icon" aria-hidden="true">◆</span><span class="crystal-balance-number">${safeBalance}</span>`;
  el.setAttribute?.('aria-label', `${safeBalance} crystals`);
}

export function showDailyCrystalBonusModal({ amount, balance, documentRef = document } = {}) {
  const doc = documentRef;
  const modal = doc.createElement('div');
  modal.className = 'crystal-daily-modal-backdrop';
  modal.innerHTML = `
    <section class="crystal-daily-modal" role="dialog" aria-modal="true" aria-label="Daily login bonus">
      <div class="crystal-daily-icon" aria-hidden="true">◆</div>
      <h2>Daily Login Bonus</h2>
      <p class="crystal-daily-award">+${esc(String(amount || 0))} Crystals</p>
      <p class="crystal-daily-balance">Balance: ${esc(String(balance || 0))}</p>
      <button class="crystal-daily-dismiss" type="button">Nice!</button>
    </section>
  `;
  doc.body.appendChild(modal);
  modal.querySelector?.('.crystal-daily-dismiss')?.addEventListener('click', () => removeDailyCrystalBonusModal(modal));
  return modal;
}

export function removeDailyCrystalBonusModal(modal) {
  modal?.remove?.();
}
