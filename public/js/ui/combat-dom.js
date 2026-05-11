import { dom } from '../dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { toRomaji } from './romaji.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { BATTLEFIELD_COLUMNS, BATTLEFIELD_ROWS, rowForFormationIndex } from '../pixi/battlefield-layout.js';
import { getHpColor } from './combat-ui-utils.js';

/** Render creature name as hiragana with romaji ruby -- matches creature-slot-name style */
function creatureNameRuby(creature) {
  const reading = creature.reading || creature.name || '';
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
  const log = window.__intentLog;
  if (log) {
    const alive = creatures.filter(c => c.hp > 0 && !c.befriended);
    log.act(`Show ${side} formation: ${creatures.length} total, ${alive.length} alive`);
    log.expect(`${side}: ${alive.length} visible sprites, ${alive.length} HP bars`);
  }

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
          hpFill.style.backgroundColor = getHpColor(hpPct, side);
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
      // Pixi formation sprites are owned by the active scene's formation ctx
      // (BattleScene during combat, PvP renders DOM-only after Task 18).
      // DOM-side HP bars were updated above; scene diff picks up state via
      // scene.syncCreatures on the next BattleScene update.
      if (window.__inspector && window.__intentLog) {
        const scan = window.__inspector.checkCreatures();
        window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
      }
      return;
    }
  }

  container.innerHTML = '';
  container.style.opacity = '';
  container.classList.toggle('boss-encounter', isBoss);

  if (!creatures || creatures.length === 0) {
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
    const rowIndex = rowForFormationIndex(dataIndex, creatures.length);
    const row = BATTLEFIELD_ROWS[rowIndex];
    const columnX = BATTLEFIELD_COLUMNS[side];
    const slotEl = document.createElement('div');
    slotEl.className = 'formation-slot';
    slotEl.dataset.index = dataIndex;
    slotEl.dataset.creatureId = creature.id || '';
    slotEl.dataset.hp = String(creature.hp ?? creature.currentHp ?? '');
    slotEl.dataset.row = row.name;
    slotEl.style.left = `${columnX * 100}%`;
    slotEl.style.top = `${row.y * 100}%`;

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
    const reading = creature.reading || creature.name || '';
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
    hpFill.style.backgroundColor = getHpColor(hpPct, side);
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

    // On page refresh / rejoin, dead or befriended enemies must be
    // immediately hidden.  During active combat the .defeated class is
    // applied by updateEnemyHPAtIndex() with a delay for the fade
    // animation, but on a fresh render the creature was already gone —
    // show it at opacity 0 with no animation.
    const isDead = (creature.currentHp ?? creature.hp ?? 1) <= 0;
    if (side === 'enemy' && (isDead || creature.befriended)) {
      slotEl.classList.add(creature.befriended ? 'befriended' : 'defeated');
      slotEl.style.animation = 'none';
      slotEl.style.opacity = '0';
      slotEl.style.pointerEvents = 'none';
    }

    container.appendChild(slotEl);

    // Reveal-on-reuse safety net: if the active scene already has a Pixi
    // sprite for this creature that's past its entrance animation, the
    // DOM-rebuild-then-wait-for-Pixi-entrance reveal protocol won't fire
    // (no entering sprite → no revealFormationInfo). Remove the hidden
    // class explicitly so the quiz flow (Bug #6) sees the HP bar + name.
    if (side === 'enemy') {
      const scene = getSceneManager()?.currentScene;
      // __idx_ fallback is legacy default-ctx path; scene-owned ctxs always
      // carry creature.uid (spawnFormationSprite throws otherwise).
      const uidKey = creature.uid ?? `__idx_${dataIndex}_${creature.id || ''}`;
      const existing = scene?.formation?.creatureSprites?.enemy?.get(uidKey);
      if (existing && !existing._entering) {
        infoBox.classList.remove('formation-info--hidden');
      }
    }
  });

  // Pixi formation sprites are owned by the active scene (BattleScene for
  // combat). PvP currently renders DOM-only — this call intentionally does
  // not spawn Pixi sprites; Task 18 removed the legacy default-ctx path.
  if (window.__inspector && window.__intentLog) {
    const scan = window.__inspector.checkCreatures();
    window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
  }
}

export function showPlayerFormation(creatures) {
  showFormation('player', creatures);
}

export function hideFormation(side) {
  const log = window.__intentLog;
  if (log) {
    log.act(`Hide ${side} formation`);
    log.expect(`${side}: 0 sprites, 0 HP bars after hide`);
  }

  const container = side === 'player' ? dom.playerFormation : dom.enemyFormation;
  container.innerHTML = '';
  container.style.opacity = '';
  // Pixi sprites are removed by BattleScene.syncCreatures when combat ends
  // (see combat-loop.stopCombatLoop); this DOM-side clear only removes the
  // HP-bar/name slot markup.

  if (window.__inspector && window.__intentLog) {
    const scan = window.__inspector.checkCreatures();
    window.__intentLog.check({ ok: scan.ok, tag: scan.mismatches[0]?.type, detail: scan.mismatches[0]?.detail });
  }
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
    dom.npcDisplay.removeAttribute('data-pixi-backed');
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
  slot.dataset.hp = String(current);
  const fill = slot.querySelector('.formation-hp-fill');
  if (fill) {
    const pct = max > 0 ? Math.max(0, current / max * 100) : 0;
    fill.style.width = pct + '%';
    fill.style.backgroundColor = getHpColor(pct, 'enemy');
  }
  // Revive: undo defeated state when HP is restored (befriend target revived to 1 HP)
  if (current > 0 && slot.classList.contains('defeated')) {
    slot.classList.remove('defeated');
    slot.style.animation = '';
    slot.style.opacity = '';
    slot.style.pointerEvents = '';
  }
  // Delay defeated fade so HP bar drain animation (0.3s) completes first
  if (current <= 0 && !slot.classList.contains('defeated')) {
    setTimeout(() => {
      // Guard: HP may have been restored since the timeout was scheduled
      if (parseInt(slot.dataset.hp || '0', 10) <= 0) {
        slot.classList.add('defeated');
      }
    }, 600);
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

/** Hide enemy from scene */
export function hideEnemy() {
  // Route NPC-sprite teardown through the active scene so the registry
  // tracks it (removed in Task 18 — legacy _defaultCtx path is gone).
  const activeScene = getSceneManager()?.currentScene;
  if (activeScene && !activeScene.disposed && !activeScene._exiting && activeScene.npcSprite) {
    activeScene.hideNpcSprite().catch(err => {
      console.warn('[combat-dom] hideNpcSprite failed:', err);
    });
  }
  dom.npcDisplay.classList.remove('visible');
  dom.npcDisplay.removeAttribute('data-pixi-backed');
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
