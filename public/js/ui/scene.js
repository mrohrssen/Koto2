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
 * - Enemy sprites load from /assets/sprites/enemies/{id}.webp
 * - Robot sprites load from /assets/sprites/robots/{id}.webp
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
  const spritePath = enemy.sprite || (isRobot
    ? `/assets/sprites/robots/${enemy.id}.webp`
    : `/assets/sprites/enemies/${enemy.id}.webp`);
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

/** Show multiple enemy robots in horizontal row */
export function showEnemies(enemies) {
  if (!enemies || enemies.length === 0) {
    hideEnemy();
    return;
  }
  if (enemies.length === 1) {
    showEnemy(enemies[0]);
    return;
  }

  // Clear existing single-enemy display
  dom.enemySprite.classList.remove('visible');
  removePlaceholder();
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  dom.enemyName.textContent = '';

  // Remove any previous multi-enemy container
  dom.enemySpriteContainer.querySelector('.multi-enemy-row')?.remove();

  const row = document.createElement('div');
  row.className = 'multi-enemy-row';

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const icon = ELEMENT_ICONS[enemy.element] || '';
    const color = ELEMENT_COLORS[enemy.element] || '#666';
    const hpPct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);

    const slot = document.createElement('div');
    slot.className = 'enemy-robot-slot';
    slot.dataset.enemyIndex = i;
    slot.dataset.enemyId = enemy.id;
    slot.innerHTML = `
      <div class="enemy-robot-icon">
        <img class="enemy-robot-sprite" src="/assets/sprites/robots/${enemy.id}.webp"
             onerror="this.style.display='none';this.nextElementSibling.style.display=''" alt="">
        <span class="enemy-robot-element" style="display:none">${icon}</span>
        <span class="enemy-robot-level" style="background-color: ${color}">Lv${enemy.level || 1}</span>
      </div>
      <div class="enemy-robot-name">${enemy.nameEn || enemy.name}</div>
      <div class="enemy-robot-hp-bar">
        <div class="enemy-robot-hp-fill" style="width: ${hpPct}%"></div>
      </div>
    `;
    row.appendChild(slot);
  }

  dom.enemySpriteContainer.appendChild(row);
}

/** Update HP bar for a specific enemy by index (multi-enemy) */
export function updateEnemyHPAtIndex(index, current, max) {
  const slot = dom.enemySpriteContainer.querySelector(`.enemy-robot-slot[data-enemy-index="${index}"]`);
  if (!slot) {
    // Fallback to single-enemy update
    updateEnemyHP(current, max);
    return;
  }
  const fill = slot.querySelector('.enemy-robot-hp-fill');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    fill.style.width = `${pct}%`;
  }
  // Mark defeated with transition (CSS handles fade out)
  if (current <= 0 && !slot.classList.contains('defeated')) {
    slot.classList.add('defeated');
  }
}

/** Mark a specific enemy slot as befriended (disappears with upward animation) */
export function markEnemyBefriended(enemyId) {
  // Try by enemy ID first, then fall back to first non-defeated slot
  let slot = dom.enemySpriteContainer.querySelector(`.enemy-robot-slot[data-enemy-id="${enemyId}"]`);
  if (!slot) {
    slot = dom.enemySpriteContainer.querySelector('.enemy-robot-slot:not(.defeated):not(.befriended)');
  }
  if (slot) {
    slot.classList.add('befriended');
  }
}

/** Get the DOM element for a specific enemy slot by index */
export function getEnemySlotElement(index) {
  return dom.enemySpriteContainer.querySelector(`.enemy-robot-slot[data-enemy-index="${index}"]`);
}

/** Hide all enemies (single and multi) */
export function hideEnemies() {
  hideEnemy();
  dom.enemySpriteContainer.querySelector('.multi-enemy-row')?.remove();
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
  el.style.cssText = `width:90px;height:90px;border-radius:50%;background:transparent;border:none;display:flex;align-items:center;justify-content:center;font-size:48px;z-index:2;position:relative;`;
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
