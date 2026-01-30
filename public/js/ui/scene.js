/**
 * @file scene.js - Scene Area Rendering
 *
 * PURPOSE:
 * Manages the main scene area including background images, enemy/NPC sprites,
 * HP bars, toast notifications, and floating damage numbers. Provides the
 * visual context for combat and exploration phases.
 *
 * KEY EXPORTS:
 * - setBackground(imagePath): Set scene background image
 * - showEnemy(enemy): Display enemy sprite and HP bar
 * - hideEnemy(): Remove enemy from scene
 * - showShrineFox(): Display shrine fox NPC (no HP bar)
 * - showQuizMaster(): Display quiz master NPC (no HP bar)
 * - updateEnemyHP(current, max): Update enemy HP bar fill
 * - showToast(message, durationMs): Show auto-dismissing notification
 * - showDamageNumber(amount, { isCrit, isHeal }): Floating damage text
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (sceneBackground, enemySprite, etc.)
 *
 * SPRITE LOADING:
 * - Sprites load from /assets/sprites/enemies/{id}.png
 * - Falls back to emoji placeholder based on enemy personality if load fails
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

/** Show shrine fox in scene (no HP bar) */
export function showShrineFox() {
  dom.enemyName.textContent = 'Shrine Fox';
  dom.enemyInfo.classList.add('visible');
  // Hide HP bar and skill bar
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/shrine_fox.png';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Show quiz master in scene (no HP bar) */
export function showQuizMaster() {
  dom.enemyName.textContent = 'Quiz Master';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/quiz_master.png';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide enemy from scene */
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
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
