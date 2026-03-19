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
 * - showDealer(): Display creature dealer NPC (no HP bar)
 * - updateEnemyHP(current, max): Update enemy HP bar fill
 * - showToast(message, durationMs): Show auto-dismissing notification
 * - showDamageNumber(amount, { isCrit, isHeal, tierClass }): Floating damage text
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (sceneBackground, enemySprite, etc.)
 *
 * SPRITE LOADING:
 * - Enemy sprites load from /assets/sprites/enemies/{id}.webp
 * - Creature sprites load from /assets/sprites/creatures/{id}.webp
 * - Falls back to emoji placeholder based on enemy personality if load fails
 */

import { dom } from '../dom.js';
import { configureCreatureImg, createTextSprite } from './sprite-utils.js';
import { renderJpFirst, esc as escHtml } from './bootstrap-client.js';

const ELEMENT_ICONS = {
  wood: '\u{1F33F}', fire: '\u{1F525}', earth: '\u26F0\uFE0F', metal: '\u2699\uFE0F', water: '\u{1F4A7}'
};

const ELEMENT_COLORS = {
  wood: '#4CAF50', fire: '#F44336', earth: '#8D6E63', metal: '#9E9E9E', water: '#2196F3'
};

function rarityStars(rarity) {
  const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity];
  return n ? `<span style="color:#FFD700">${n}★</span>` : '';
}

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

  // Check if this is a creature (has element property)
  const isCreature = !!enemy.element;

  // Remove any previous compact overlays
  removeCompactOverlays();

  if (isCreature) {
    // Use compact display (same style as multi-enemy) — hide the big info pill
    dom.enemyInfo.classList.remove('visible');
    dom.enemyHpBar.style.display = 'none';
    dom.enemyName.textContent = '';
    dom.enemySpriteContainer.style.borderColor = ELEMENT_COLORS[enemy.element] || '';
    dom.enemySpriteContainer.classList.add('creature-enemy');

    // Add compact name badge, level badge, and hp bar after sprite loads
    const nameBadge = document.createElement('div');
    nameBadge.className = 'enemy-creature-name-badge';
    nameBadge.innerHTML = `${enemy.nameEn || enemy.name || 'Enemy'} ${rarityStars(enemy.rarity)}`;
    dom.enemySpriteContainer.appendChild(nameBadge);

    const levelBadge = document.createElement('span');
    levelBadge.className = 'creature-level-badge-enemy';
    levelBadge.textContent = `Lv${enemy.level || 1}`;
    dom.enemySpriteContainer.appendChild(levelBadge);

    const hpBar = document.createElement('div');
    hpBar.className = 'enemy-compact-hp-bar';
    const hpPct = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
    hpBar.innerHTML = `<div class="enemy-compact-hp-fill" style="width:${hpPct}%"></div>`;
    dom.enemySpriteContainer.appendChild(hpBar);
  } else {
    dom.enemyName.textContent = enemy.nameEn || enemy.name || 'Enemy';
    dom.enemySpriteContainer.style.borderColor = '';
    dom.enemySpriteContainer.classList.remove('creature-enemy');
    dom.enemyInfo.classList.add('visible');
    updateEnemyHP(enemy.hp, enemy.maxHp);
  }

  if (isCreature && !enemy.sprite) {
    // MVP: show text sprite immediately instead of loading an image
    dom.enemySprite.classList.remove('visible');
    showCreaturePlaceholder(enemy);
  } else {
    const spritePath = enemy.sprite || `/assets/sprites/enemies/${enemy.id}.webp`;
    dom.enemySprite.src = spritePath;
    dom.enemySprite.onerror = () => {
      dom.enemySprite.classList.remove('visible');
      showPlaceholder(enemy);
    };
    dom.enemySprite.onload = () => {
      removePlaceholder();
      dom.enemySprite.classList.add('visible');
    };
  }
}

/** Update compact HP bar for single creature enemy */
export function updateCompactEnemyHP(current, max) {
  const fill = dom.enemySpriteContainer.querySelector('.enemy-compact-hp-fill');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    fill.style.width = `${pct}%`;
  }
}

function removeCompactOverlays() {
  dom.enemySpriteContainer.querySelector('.enemy-creature-name-badge')?.remove();
  dom.enemySpriteContainer.querySelector('.creature-level-badge-enemy')?.remove();
  dom.enemySpriteContainer.querySelector('.enemy-compact-hp-bar')?.remove();
}

/** Show multiple enemy creatures in horizontal row */
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
  // Hide the single-enemy info bar entirely for multi-enemy
  dom.enemyInfo.classList.remove('visible');
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
    slot.className = 'enemy-creature-slot';
    if (enemy.befriended) slot.classList.add('befriended');
    else if (enemy.hp <= 0) slot.classList.add('defeated');
    slot.dataset.enemyIndex = i;
    slot.dataset.enemyId = enemy.id;
    slot.innerHTML = `
      <div class="enemy-creature-icon">
        <img class="enemy-creature-sprite" alt="">
        <span class="enemy-creature-element" style="display:none">${icon}</span>
        <span class="enemy-creature-level" style="background-color: ${color}">Lv${enemy.level || 1}</span>
      </div>
      <div class="enemy-creature-name">${enemy.nameEn || enemy.name} ${rarityStars(enemy.rarity)}</div>
      <div class="enemy-creature-hp-bar">
        <div class="enemy-creature-hp-fill" style="width: ${hpPct}%"></div>
      </div>
    `;
    const spriteImg = slot.querySelector('.enemy-creature-sprite');
    configureCreatureImg(spriteImg, enemy.id, null, enemy);
    row.appendChild(slot);
  }

  dom.enemySpriteContainer.appendChild(row);
}

/** Update HP bar for a specific enemy by index (multi-enemy) */
export function updateEnemyHPAtIndex(index, current, max) {
  const slot = dom.enemySpriteContainer.querySelector(`.enemy-creature-slot[data-enemy-index="${index}"]`);
  if (!slot) {
    console.warn(`[Scene] No enemy slot found at index ${index}, skipping HP update`);
    return;
  }
  const fill = slot.querySelector('.enemy-creature-hp-fill');
  if (fill) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    fill.style.width = `${pct}%`;
  }
  // Delay defeated fade so HP bar drain animation (0.3s) completes first
  if (current <= 0 && !slot.classList.contains('defeated')) {
    setTimeout(() => slot.classList.add('defeated'), 600);
  }
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

function showCreaturePlaceholder(enemy) {
  removePlaceholder();
  const el = createTextSprite(enemy.baseWord || enemy.name, enemy.element);
  el.id = 'enemy-placeholder';
  el.style.width = '90px';
  el.style.height = '90px';
  el.style.fontSize = '2rem';
  el.style.position = 'relative';
  el.style.zIndex = '2';
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

/** Show Cid guide NPC in prologue (no HP bar) */
export function showCid() {
  dom.enemyName.textContent = 'Cid';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/npcs/cid.webp';
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide Cid from scene */
export function hideCid() {
  hideEnemy();
}

/** Show traveling merchant NPC (shop merchant, no HP bar) */
export function showDealer() {
  dom.enemyName.textContent = 'Traveling Merchant';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = '/assets/sprites/traveling_merchant.webp';
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

/** Show NPC trainer in scene (no HP bar) */
export function showNpcTrainer(npcName, npcId, npc) {
  // Clear multi-enemy row from combat
  dom.enemySpriteContainer.querySelector('.multi-enemy-row')?.remove();

  const roleHtml = npc?.role
    ? ' — ' + renderJpFirst(npc.role.word, npc.role.reading, npc.role.meaning)
    : '';
  const npcNameHtml = `${escHtml(npcName)}${roleHtml}`;
  dom.enemyName.innerHTML = npcNameHtml;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';
  dom.enemySpriteContainer.style.borderColor = '';
  dom.enemySpriteContainer.classList.remove('creature-enemy');

  const spritePath = npcId
    ? `/assets/sprites/npcs/${npcId}.webp`
    : '/assets/sprites/enemies/systemExecutive.webp';
  dom.enemySprite.src = spritePath;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide NPC trainer from scene */
export function hideNpcTrainer() {
  hideEnemy();
}

/** Show NPC skill pills in the enemy skill bar */
export function showNpcSkills(skills) {
  if (!dom.enemySkillBar || !skills?.length) return;
  dom.enemySkillBar.innerHTML = '';
  for (const skill of skills) {
    const pill = document.createElement('span');
    pill.className = 'npc-skill-pill';
    pill.innerHTML = renderJpFirst(skill.name, skill.reading, skill.nameEn);
    dom.enemySkillBar.appendChild(pill);
  }
  dom.enemySkillBar.style.display = 'flex';
}

/** Hide enemy from scene */
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
  dom.enemySpriteContainer.style.borderColor = '';
  dom.enemySpriteContainer.classList.remove('creature-enemy');
  removeCompactOverlays();
  removePlaceholder();
}

/** Update enemy HP bar and text */
export function updateEnemyHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.enemyHpFill.style.width = `${pct}%`;
  dom.enemyHpText.textContent = `${current} / ${max}`;
  // Also update compact HP bar if present (single creature enemy)
  const compactFill = dom.enemySpriteContainer.querySelector('.enemy-compact-hp-fill');
  if (compactFill) compactFill.style.width = `${pct}%`;
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
 * @param {string} options.tierClass - Tier CSS class (dmg-light, dmg-normal, dmg-solid, dmg-big, dmg-massive)
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
