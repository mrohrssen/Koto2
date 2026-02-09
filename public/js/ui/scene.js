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
 * - showWordDiscoveryNpc(): Display knowledge spirit NPC (no HP bar)
 * - showDealer(): Display robot dealer NPC (no HP bar)
 * - updateEnemyHP(current, max): Update enemy HP bar fill
 * - showToast(message, durationMs): Show auto-dismissing notification
 * - showDamageNumber(amount, { isCrit, isHeal, tierClass }): Floating damage text
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (sceneBackground, enemySprite, etc.)
 *
 * SPRITE LOADING:
 * - Sprites load from /assets/sprites/enemies/{id}.webp
 * - Falls back to emoji placeholder based on enemy personality if load fails
 */

import { dom } from '../dom.js';

const ELEMENT_ICONS = {
  wood: '\u{1F33F}', fire: '\u{1F525}', earth: '\u26F0\uFE0F', metal: '\u2699\uFE0F', water: '\u{1F4A7}'
};

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3'
};

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

  // Check if this is a robot (has element property)
  const isRobot = !!enemy.element;

  if (isRobot) {
    const icon = ELEMENT_ICONS[enemy.element] || '';
    dom.enemyName.innerHTML = `<span class="enemy-element-icon">${icon}</span> ${enemy.nameEn || enemy.name || 'Enemy'} <span class="enemy-level-badge">Lv${enemy.level || 1}</span>`;
    dom.enemySpriteContainer.style.borderColor = ELEMENT_COLORS[enemy.element] || '';
    dom.enemySpriteContainer.classList.add('robot-enemy');
  } else {
    dom.enemyName.textContent = enemy.nameEn || enemy.name || 'Enemy';
    dom.enemySpriteContainer.style.borderColor = '';
    dom.enemySpriteContainer.classList.remove('robot-enemy');
  }

  dom.enemyInfo.classList.add('visible');
  updateEnemyHP(enemy.hp, enemy.maxHp);

  // Construct sprite path from enemy ID
  const spritePath = enemy.sprite || `/assets/sprites/enemies/${enemy.id}.webp`;
  dom.enemySprite.src = spritePath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    if (isRobot) {
      showRobotPlaceholder(enemy);
    } else {
      showPlaceholder(enemy);
    }
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

function showRobotPlaceholder(enemy) {
  removePlaceholder();
  const el = document.createElement('div');
  el.id = 'enemy-placeholder';
  const color = ELEMENT_COLORS[enemy.element] || '#666';
  el.style.cssText = `width:120px;height:120px;border-radius:50%;background:${color}22;border:3px solid ${color};display:flex;align-items:center;justify-content:center;font-size:48px;z-index:2;position:relative;`;
  el.textContent = ELEMENT_ICONS[enemy.element] || '\u{1F916}';
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

  dom.enemySprite.src = '/assets/sprites/shrine_fox.webp';
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

  dom.enemySprite.src = '/assets/sprites/quiz_master.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Show word discovery NPC (knowledge scholar spirit, no HP bar) */
export function showWordDiscoveryNpc() {
  dom.enemyName.textContent = 'Knowledge Spirit';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/word_discovery_npc.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Show robot dealer NPC (shop merchant, no HP bar) */
export function showDealer() {
  dom.enemyName.textContent = 'Robot Dealer';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/robot_dealer.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Show Chippy companion sprite (no HP bar) */
export function showChippy() {
  dom.enemyName.textContent = 'Chippy';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/chippy.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    removePlaceholder();
    const el = document.createElement('div');
    el.id = 'enemy-placeholder';
    el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
    el.textContent = '\u2728';
    dom.enemySpriteContainer.appendChild(el);
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide Chippy (alias for hideEnemy) */
export function hideChippy() {
  hideEnemy();
}

/** Hide enemy from scene */
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
  dom.enemySpriteContainer.style.borderColor = '';
  dom.enemySpriteContainer.classList.remove('robot-enemy');
  removePlaceholder();
}

/** Update enemy HP bar and text */
export function updateEnemyHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.enemyHpFill.style.width = `${pct}%`;
  dom.enemyHpText.textContent = `${current} / ${max}`;
}

/** Show floating toast message in scene (auto-dismisses) */
export function showToast(message, durationMs = 3000) {
  dom.sceneToast.textContent = message;
  dom.sceneToast.classList.add('visible');
  setTimeout(() => {
    dom.sceneToast.classList.remove('visible');
  }, durationMs);
}

/** Show damage number floating up from enemy
 * @param {number} amount - Damage amount
 * @param {Object} options - Display options
 * @param {boolean} options.isCrit - Is critical hit
 * @param {boolean} options.isHeal - Is healing
 * @param {string} options.tierClass - Tier CSS class (dmg-chip, dmg-normal, dmg-solid, dmg-big, dmg-massive)
 */
export function showDamageNumber(amount, { isCrit = false, isHeal = false, tierClass = '' } = {}) {
  const el = document.createElement('div');

  // Build class list: base + tier + modifiers
  let classes = 'damage-number';
  if (tierClass) classes += ` ${tierClass}`;
  if (isCrit) classes += ' crit';
  if (isHeal) classes += ' heal';
  el.className = classes;

  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near enemy sprite
  const container = dom.enemySpriteContainer;
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  // Tier 4 (massive) stays longer
  const duration = tierClass === 'dmg-massive' ? 1500 : 1000;
  setTimeout(() => el.remove(), duration);
}
