/**
 * @fileoverview Meta progression shop UI
 *
 * Full-screen panel showing 3 upgrades with buy buttons.
 * Opened from hub "Upgrades" button.
 */

let getGameState = null;
let updateGameState = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
}

/**
 * Show the meta shop panel
 */
export async function show() {
  // Remove existing panel if any
  document.getElementById('meta-shop-panel')?.remove();

  let shopData;
  try {
    const res = await fetch('/api/game/meta-shop');
    shopData = await res.json();
  } catch (e) {
    console.error('Failed to fetch meta shop:', e);
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'meta-shop-panel';
  panel.className = 'meta-shop-panel';
  panel.innerHTML = `
    <div class="meta-shop-header">
      <button class="meta-shop-close" id="meta-shop-close-btn">&times;</button>
      <h2>Upgrades</h2>
      <div class="meta-shop-tokens">${shopData.progressionTokens} Token${shopData.progressionTokens !== 1 ? 's' : ''}</div>
    </div>
    <div class="meta-shop-upgrades">
      ${shopData.upgrades.map(u => renderUpgradeCard(u, shopData.progressionTokens)).join('')}
    </div>
  `;

  document.body.appendChild(panel);

  // Close button
  document.getElementById('meta-shop-close-btn')?.addEventListener('click', () => {
    panel.remove();
  });

  // Buy buttons
  panel.querySelectorAll('.meta-shop-buy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const upgradeId = btn.dataset.upgradeId;
      try {
        const res = await fetch('/api/game/meta-shop/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upgradeId })
        });
        if (res.ok) {
          // Re-render with updated data
          show();
        }
      } catch (e) {
        console.error('Failed to buy upgrade:', e);
      }
    });
  });
}

function renderUpgradeCard(upgrade, tokens) {
  const isMaxed = upgrade.currentLevel >= upgrade.maxLevel;
  const canAfford = !isMaxed && tokens >= upgrade.nextCost;

  // Level pips
  const pips = Array.from({ length: upgrade.maxLevel }, (_, i) =>
    `<span class="meta-shop-pip ${i < upgrade.currentLevel ? 'filled' : ''}"></span>`
  ).join('');

  const statusText = isMaxed
    ? '<span class="meta-shop-maxed">MAX</span>'
    : `<span class="meta-shop-next">Next: +${upgrade.nextValue}% \u2014 ${upgrade.nextCost} token${upgrade.nextCost !== 1 ? 's' : ''}</span>`;

  const currentText = upgrade.currentValue > 0
    ? `<span class="meta-shop-current">+${upgrade.currentValue}%</span>`
    : '';

  return `
    <div class="meta-shop-card ${isMaxed ? 'maxed' : ''}">
      <div class="meta-shop-card-header">
        <strong>${upgrade.nameEn}</strong>
        ${currentText}
      </div>
      <div class="meta-shop-card-desc">${upgrade.description}</div>
      <div class="meta-shop-pips">${pips}</div>
      <div class="meta-shop-card-footer">
        ${statusText}
        ${!isMaxed ? `<button class="meta-shop-buy-btn ${canAfford ? '' : 'disabled'}" data-upgrade-id="${upgrade.id}" ${canAfford ? '' : 'disabled'}>Buy</button>` : ''}
      </div>
    </div>
  `;
}
