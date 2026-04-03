/**
 * @file scene.js - Scene Area Rendering
 *
 * PURPOSE:
 * Manages the main scene area including background images, enemy/NPC sprites,
 * formation rendering, HP bars, toast notifications, and floating damage numbers.
 * Provides the visual context for combat and exploration phases.
 *
 * KEY EXPORTS:
 * - setBackground(imagePath): Set scene background image
 * - showFormation(side, creatures): DOM slot anchors (HUD/bars) + Pixi creature sprites
 * - showPlayerFormation(creatures): Render player party into player formation
 * - hideFormation(side): Clear a formation container
 * - showEnemy(enemy): Display enemy (creature via formation, NPC via npc-display)
 * - hideEnemy(): Remove enemy from scene
 * - showEnemies(enemies): Display multiple enemy creatures via formation
 * - hideEnemies(): Remove all enemies from scene
 * - showShrineFox(): Display shrine fox NPC (no HP bar)
 * - showQuizMaster(): Display quiz master NPC (no HP bar)
 * - showWordDiscoveryNpc(): Display knowledge spirit NPC (no HP bar)
 * - showDealer(): Display creature dealer NPC (no HP bar)
 * - updateEnemyHP(current, max): Update enemy HP bar fill
 * - showToast(message, durationMs): Show auto-dismissing notification
 * - showDamageNumber(amount, { isCrit, isHeal, tierClass, targetEl }): Floating damage text
 *
 * DEPENDENCIES:
 * - ../dom.js: DOM element references (sceneBackground, enemySprite, etc.)
 *
 * SPRITE LOADING:
 * - NPC sprites load from /assets/sprites/enemies/{id}.webp or /assets/sprites/npcs/{id}.webp
 * - Creature sprites use text-sprite placeholders (baseWord + element color)
 * - Falls back to emoji placeholder based on enemy personality if load fails
 */

import { dom } from '../dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import * as pixiFormation from '../pixi/formation.js';
import { showNpcSprite as pixiShowNpcSprite, hideNpcSprite as pixiHideNpcSprite } from '../pixi/formation.js';
import { renderJpFirst, flushExposures, esc as escHtml } from './bootstrap-client.js';
import { toRomaji } from './romaji.js';

/** Render creature name as hiragana with romaji ruby -- matches creature-slot-name style */
function creatureNameRuby(creature) {
  const reading = creature.baseReading || creature.name || '';
  return `<ruby>${reading}<rt>${toRomaji(reading)}</rt></ruby>`;
}

let _lastBgPath = null;

/** Set scene background image */
export function setBackground(imagePath) {
  if (imagePath === _lastBgPath) return;
  _lastBgPath = imagePath;

  if (imagePath) {
    const sep = imagePath.includes('?') ? '&' : '?';
    dom.sceneBackground.style.backgroundImage = `url('${imagePath}${sep}v=${SPRITE_VERSION}')`;
  } else {
    dom.sceneBackground.style.backgroundImage = 'none';
  }
}

/* ------------------------------------------------------------------ */
/*  Formation rendering                                                */
/* ------------------------------------------------------------------ */

/**
 * Render creatures into a formation container (player or enemy side).
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 */
export async function showFormation(side, creatures, { isBoss = false, force = false } = {}) {
  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;

  // Skip redundant rebuilds: if the same creatures are already rendered,
  // don't tear down and recreate the DOM. Prevents flickering during rapid updateUI() calls.
  if (!force && creatures?.length) {
    const slots = container.querySelectorAll('.formation-slot');
    const renderedCreatureIds = Array.from(slots).map(s => s.dataset.creatureId);
    const newCreatureIds = creatures.map(c => c?.id || '');
    if (renderedCreatureIds.length === newCreatureIds.length && renderedCreatureIds.every((id, i) => id === newCreatureIds[i])) {
      // Same creatures — update HP/MP bars in-place (no full DOM rebuild, no Pixi teardown)
      slots.forEach((slot, i) => {
        const creature = creatures[i];
        if (!creature) return;
        const curHp = creature.currentHp ?? creature.hp ?? 0;
        const maxHp = creature.maxHp ?? 1;
        const hpPct = maxHp > 0 ? Math.max(0, curHp / maxHp * 100) : 0;
        const hpFill = slot.querySelector('.formation-hp-fill');
        if (hpFill) {
          hpFill.style.width = hpPct + '%';
          hpFill.style.backgroundColor = hpPct > 50 ? 'var(--hp-green)' : hpPct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
        }
        const mpFill = slot.querySelector('.formation-mp-fill');
        if (mpFill) {
          const curMp = creature.currentMp ?? creature.mp ?? 0;
          const mpMax = creature.maxMp ?? 1;
          const mpPct = mpMax > 0 ? Math.max(0, curMp / mpMax * 100) : 0;
          mpFill.style.width = mpPct + '%';
        }
        const spriteEl = slot.querySelector('.formation-sprite');
        if (spriteEl) spriteEl.classList.toggle('ko', (curHp <= 0));
        slot.dataset.hp = String(curHp);
      });
      await pixiFormation.showFormation(side, creatures, { isBoss, skipEnter: true }).catch((err) => {
        console.warn('[Scene] Pixi showFormation failed:', err);
      });
      return;
    }
  }

  container.innerHTML = '';
  container.style.opacity = '';
  container.classList.toggle('boss-encounter', isBoss);

  if (!creatures || creatures.length === 0) {
    pixiFormation.hideFormation(side);
    return;
  }

  // Slot placement: 1->middle, 2->top+bottom, 3->all three
  let slots;
  if (creatures.length === 1) {
    slots = [null, creatures[0], null];
  } else if (creatures.length === 2) {
    slots = [creatures[0], null, creatures[1]];
  } else {
    slots = [creatures[0], creatures[1], creatures[2]];
  }

  slots.forEach((creature, visualIndex) => {
    if (!creature) return;

    const dataIndex = creatures.indexOf(creature);
    const slotEl = document.createElement('div');
    slotEl.className = 'formation-slot';
    slotEl.dataset.index = dataIndex;
    slotEl.dataset.creatureId = creature.id || '';
    slotEl.dataset.hp = String(creature.hp ?? creature.currentHp ?? '');

    // Layout anchor only — creature artwork is drawn on the Pixi battle stage
    const spriteEl = document.createElement('div');
    spriteEl.className = 'formation-sprite formation-sprite--pixi-anchor';
    spriteEl.setAttribute('aria-hidden', 'true');
    if (creature.currentHp <= 0 || creature.hp <= 0) spriteEl.classList.add('ko');
    slotEl.appendChild(spriteEl);

    // Info box: name (romaji + hiragana) + bars
    // Hidden initially for enemy side — revealed after Pixi entrance animation completes
    const infoBox = document.createElement('div');
    infoBox.className = 'formation-info' + (side === 'enemy' ? ' formation-info--hidden' : '');

    // Name column: romaji on top, hiragana below
    const nameCol = document.createElement('div');
    nameCol.className = 'formation-name-col';
    const reading = creature.baseReading || creature.name || '';
    const romajiEl = document.createElement('div');
    romajiEl.className = 'formation-romaji';
    romajiEl.textContent = toRomaji(reading);
    const hiraEl = document.createElement('div');
    hiraEl.className = 'formation-hira';
    hiraEl.textContent = reading;
    nameCol.appendChild(romajiEl);
    nameCol.appendChild(hiraEl);
    infoBox.appendChild(nameCol);

    // Bars container
    const barsEl = document.createElement('div');
    barsEl.className = 'formation-bars';

    // HP bar row
    const hpRow = document.createElement('div');
    hpRow.className = 'formation-bar-row';
    const hpLabel = document.createElement('span');
    hpLabel.className = 'formation-bar-label';
    hpLabel.textContent = 'HP';
    hpRow.appendChild(hpLabel);
    const hpBar = document.createElement('div');
    hpBar.className = 'formation-hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = 'formation-hp-fill';
    const curHp = creature.currentHp ?? creature.hp ?? 0;
    const maxHp = creature.maxHp ?? 1;
    const hpPct = maxHp > 0 ? Math.max(0, curHp / maxHp * 100) : 0;
    hpFill.style.width = hpPct + '%';
    hpFill.style.backgroundColor = hpPct > 50 ? 'var(--hp-green)' : hpPct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    barsEl.appendChild(hpRow);

    // MP bar row (player creatures only)
    if (side === 'player' && creature.maxMp > 0) {
      const mpRow = document.createElement('div');
      mpRow.className = 'formation-bar-row';
      const mpLabel = document.createElement('span');
      mpLabel.className = 'formation-bar-label';
      mpLabel.textContent = 'MP';
      mpRow.appendChild(mpLabel);
      const mpBar = document.createElement('div');
      mpBar.className = 'formation-mp-bar';
      const mpFill = document.createElement('div');
      mpFill.className = 'formation-mp-fill';
      const curMp = creature.currentMp ?? creature.mp ?? 0;
      const mpMax = creature.maxMp ?? 1;
      const mpPct = mpMax > 0 ? Math.max(0, curMp / mpMax * 100) : 0;
      mpFill.style.width = mpPct + '%';
      mpBar.appendChild(mpFill);
      mpRow.appendChild(mpBar);
      barsEl.appendChild(mpRow);
    }

    infoBox.appendChild(barsEl);
    slotEl.appendChild(infoBox);

    container.appendChild(slotEl);
  });

  await pixiFormation.showFormation(side, creatures, { isBoss }).catch((err) => {
    console.warn('[Scene] Pixi showFormation failed:', err);
  });
}

export function showPlayerFormation(creatures) {
  showFormation('player', creatures);
}

export function hideFormation(side) {
  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;
  container.innerHTML = '';
  container.style.opacity = '';
  pixiFormation.hideFormation(side);
}

/* ------------------------------------------------------------------ */
/*  Enemy display                                                      */
/* ------------------------------------------------------------------ */

/** Show enemy in scene - creatures use formation, NPCs use npc-display */
export function showEnemy(enemy, { isBoss = false } = {}) {
  if (!enemy) {
    hideEnemy();
    return;
  }

  // Check if this is a creature (has element property)
  const isCreature = !!enemy.element;

  if (isCreature) {
    // Use formation display -- hide the NPC display and info pill
    dom.npcDisplay.classList.remove('visible');
    dom.enemySprite.src = '';
    dom.enemySprite.classList.remove('visible');
    dom.enemyInfo.classList.remove('visible');
    dom.enemyHpBar.style.display = 'none';
    dom.enemyName.textContent = '';
    showFormation('enemy', [enemy], { isBoss });
  } else {
    // NPC enemy -- show in npc-display with info pill
    hideFormation('enemy');
    dom.npcDisplay.classList.add('visible');
    dom.enemyName.textContent = enemy.nameEn || enemy.name || 'Enemy';
    dom.enemyInfo.classList.add('visible');
    updateEnemyHP(enemy.hp, enemy.maxHp);

    const spritePath = enemy.sprite || `/assets/sprites/enemies/${enemy.id}.webp?v=${SPRITE_VERSION}`;
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

/** Show multiple enemy creatures via formation */
export function showEnemies(enemies, { isBoss = false } = {}) {
  if (!enemies || enemies.length === 0) return;
  dom.npcDisplay.classList.remove('visible');
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = 'none';
  dom.enemyName.textContent = '';
  showFormation('enemy', enemies, { isBoss });
}

/** Update HP bar for a specific enemy by index (formation slots) */
export function updateEnemyHPAtIndex(index, current, max) {
  const slot = dom.enemyFormation.querySelector(`.formation-slot[data-index="${index}"]`);
  if (!slot) {
    console.warn(`[Scene] No enemy slot found at index ${index}, skipping HP update`);
    return;
  }
  const fill = slot.querySelector('.formation-hp-fill');
  if (fill) {
    const pct = max > 0 ? Math.max(0, current / max * 100) : 0;
    fill.style.width = pct + '%';
    fill.style.backgroundColor = pct > 50 ? 'var(--hp-green)' : pct > 25 ? 'var(--hp-yellow)' : 'var(--hp-red)';
  }
  // Delay defeated fade so HP bar drain animation (0.3s) completes first
  if (current <= 0 && !slot.classList.contains('defeated')) {
    setTimeout(() => slot.classList.add('defeated'), 600);
  }
}

/** Hide all enemies (single and multi) */
export function hideEnemies() {
  hideEnemy();
  hideFormation('enemy');
}

/* ------------------------------------------------------------------ */
/*  Placeholders (NPC fallback sprites)                                */
/* ------------------------------------------------------------------ */

function showPlaceholder(enemy) {
  removePlaceholder();
  const el = document.createElement('div');
  el.id = 'enemy-placeholder';
  el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
  const emojiMap = { stressed: '\u{1F630}', aggressive: '\u{1F621}', calm: '\u{1F610}', shy: '\u{1F633}', cheerful: '\u{1F60A}', mysterious: '\u{1F3AD}', arrogant: '\u{1F624}', kind: '\u{1F97A}', rushed: '\u{1F624}' };
  el.textContent = emojiMap[enemy.personality] || '\u{1F464}';
  dom.npcDisplay.appendChild(el);
}

function removePlaceholder() {
  document.getElementById('enemy-placeholder')?.remove();
}

/* ------------------------------------------------------------------ */
/*  NPC display functions                                              */
/* ------------------------------------------------------------------ */

/** Helper: show an NPC sprite in the npc-display area (no HP bar) */
export function showNpcInDisplay(name, spritePath, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = name;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) pixiShowNpcSprite(spritePath);
}

/** Show shrine fox in scene (no HP bar) */
export function showShrineFox() {
  showNpcInDisplay('Shrine Fox', `/assets/sprites/shrine_fox.webp?v=${SPRITE_VERSION}`);
}

/** Show quiz master in scene (no HP bar) */
export function showQuizMaster() {
  showNpcInDisplay('Quiz Master', `/assets/sprites/quiz_master.webp?v=${SPRITE_VERSION}`);
}

/** Show word discovery NPC (knowledge scholar spirit, no HP bar) */
export function showWordDiscoveryNpc() {
  showNpcInDisplay('Knowledge Spirit', `/assets/sprites/word_discovery_npc.webp?v=${SPRITE_VERSION}`);
}

/** Show Cid guide NPC in prologue (no HP bar) */
export function showCid() {
  showNpcInDisplay('Cid', `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`);
}

/** Hide Cid from scene */
export function hideCid() {
  hideEnemy();
}

/** Show traveling merchant NPC (shop merchant, no HP bar) */
export function showDealer({ skipPixi = false } = {}) {
  showNpcInDisplay('Traveling Merchant', `/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { skipPixi });
}

/** Show Chippy companion sprite (no HP bar) */
export function showChippy() {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = 'Chippy';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = `/assets/sprites/chippy.webp?v=${SPRITE_VERSION}`;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    removePlaceholder();
    const el = document.createElement('div');
    el.id = 'enemy-placeholder';
    el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
    el.textContent = '\u2728';
    dom.npcDisplay.appendChild(el);
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
export function showNpcTrainer(npcName, npcId, npc, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');

  const roleHtml = npc?.role
    ? ' \u2014 ' + renderJpFirst(npc.role.word, npc.role.reading, npc.role.meaning)
    : '';
  const npcNameHtml = `${escHtml(npcName)}${roleHtml}`;
  dom.enemyName.innerHTML = npcNameHtml;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';
  flushExposures();

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) {
    const spritePath = npcId
      ? `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    pixiShowNpcSprite(spritePath);
  }
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
  flushExposures();
}

/** Hide enemy from scene */
export function hideEnemy() {
  pixiHideNpcSprite();
  dom.npcDisplay.classList.remove('visible');
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) {
    dom.enemySkillBar.innerHTML = '';
    dom.enemySkillBar.style.display = '';
  }
  hideFormation('enemy');
  removePlaceholder();
}

/** Update enemy HP bar and text (NPC boss fights with info pill) */
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
 * @param {string} options.tierClass - Tier CSS class (dmg-light, dmg-normal, dmg-solid, dmg-big, dmg-massive)
 * @param {HTMLElement} options.targetEl - Optional target element to position damage near
 */
export function showDamageNumber(amount, { isCrit = false, isHeal = false, tierClass = '', targetEl } = {}) {
  const el = document.createElement('div');

  // Build class list: base + tier + modifiers
  let classes = 'damage-number';
  if (tierClass) classes += ` ${tierClass}`;
  if (isCrit) classes += ' crit';
  if (isHeal) classes += ' heal';
  el.className = classes;

  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near target: explicit target > enemy formation slot > npc display > enemy formation container
  const container = targetEl
    || dom.enemyFormation.querySelector('.formation-slot')
    || (dom.npcDisplay.classList.contains('visible') ? dom.npcDisplay : dom.enemyFormation);
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  // Tier 4 (massive) stays longer
  const duration = tierClass === 'dmg-massive' ? 1500 : 1000;
  setTimeout(() => el.remove(), duration);
}
