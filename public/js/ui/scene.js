/**
 * Scene UI Module - Manages scene area rendering
 *
 * Handles: backgrounds, enemy sprite/info, toast messages
 */

import { dom } from '../dom.js';

/** Set scene background image */
export function setBackground(imagePath) {
  if (imagePath) {
    dom.sceneBackground.style.backgroundImage = `url('${imagePath}')`;
  } else {
    dom.sceneBackground.style.backgroundImage = 'none';
  }
}

/** Show enemy in scene */
export function showEnemy(enemy) {
  if (!enemy) {
    hideEnemy();
    return;
  }

  dom.enemyName.textContent = enemy.nameEn || enemy.name || 'Enemy';
  dom.enemyInfo.classList.add('visible');
  updateEnemyHP(enemy.hp, enemy.maxHp);

  // Construct sprite path from enemy ID
  const spritePath = enemy.sprite || `/assets/sprites/enemies/${enemy.id}.png`;
  dom.enemySprite.src = spritePath;
  dom.enemySprite.onerror = () => {
    // Hide broken img, show emoji placeholder instead
    dom.enemySprite.classList.remove('visible');
    showPlaceholder(enemy);
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

function showPlaceholder(enemy) {
  removePlaceholder();
  const el = document.createElement('div');
  el.id = 'enemy-placeholder';
  el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
  const emojiMap = { stressed: '😰', aggressive: '😡', calm: '😐', shy: '😳', cheerful: '😊', mysterious: '🎭', arrogant: '😤', kind: '🥺', rushed: '😤' };
  el.textContent = emojiMap[enemy.personality] || '👤';
  dom.enemySpriteContainer.appendChild(el);
}

function removePlaceholder() {
  document.getElementById('enemy-placeholder')?.remove();
}

/** Hide enemy from scene */
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  removePlaceholder();
}

/** Update enemy HP bar */
export function updateEnemyHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.enemyHpFill.style.width = `${pct}%`;
}

/** Show floating toast message in scene (auto-dismisses) */
export function showToast(message, durationMs = 3000) {
  dom.sceneToast.textContent = message;
  dom.sceneToast.classList.add('visible');
  setTimeout(() => {
    dom.sceneToast.classList.remove('visible');
  }, durationMs);
}

/** Show damage number floating up from enemy */
export function showDamageNumber(amount, { isCrit = false, isHeal = false } = {}) {
  const el = document.createElement('div');
  el.className = `damage-number${isCrit ? ' crit' : ''}${isHeal ? ' heal' : ''}`;
  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near enemy sprite
  const container = dom.enemySpriteContainer;
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  setTimeout(() => el.remove(), 1000);
}
