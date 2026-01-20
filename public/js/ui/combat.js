/**
 * Combat UI Module - Combat rendering, animations, and display functions
 *
 * Handles:
 * - Combat screen rendering (enemy display, HP bars)
 * - Combat animations (attack, hurt, defeat)
 * - Damage numbers and chip effects
 * - Combat chip pipeline visualization
 */

// Module state
let gameContent = null;
let playerSprite = null;
let enemySprite = null;
let getGameState = null;
let showDamageNumberFn = null;
let delay = null;
let chipLoadoutCache = null;

/**
 * Initialize the combat UI module
 * @param {Object} config Configuration object
 */
export function init(config) {
  gameContent = config.gameContent;
  playerSprite = config.playerSprite;
  enemySprite = config.enemySprite;
  getGameState = config.getGameState;
  delay = config.delay;
}

/**
 * Set chip loadout cache for combat display
 */
export function setChipLoadoutCache(cache) {
  chipLoadoutCache = cache;
}

/**
 * Get chip loadout cache
 */
export function getChipLoadoutCache() {
  return chipLoadoutCache;
}

// ============ COMBAT DISPLAY ============

/**
 * Show combat content in game area
 */
export function showCombatContent() {
  const gameState = getGameState();
  const combat = gameState.combat;
  if (!combat) return;

  const enemy = combat.enemy;
  const player = gameState.run?.player;

  const enemyHpPercent = (enemy.hp / enemy.maxHp) * 100;
  const playerHpPercent = player ? (player.hp / player.maxHp) * 100 : 100;
  const playerMpPercent = player ? (player.mp / player.maxMp) * 100 : 100;

  const isBoss = enemy.isBoss;
  const enemyClass = isBoss ? 'enemy-display boss-enemy' : 'enemy-display';

  gameContent.innerHTML = `
    <div class="combat-view">
      <div class="${enemyClass}">
        <div class="enemy-sprite ${isBoss ? 'boss-sprite' : ''}">${getEnemyEmoji(enemy)}</div>
        <div class="enemy-info">
          <div class="enemy-name">${enemy.name} <span class="enemy-name-en">(${enemy.nameEn})</span></div>
          <div class="enemy-hp-bar">
            <div class="hp-fill" style="width: ${enemyHpPercent}%"></div>
            <span class="hp-text">${enemy.hp}/${enemy.maxHp}</span>
          </div>
        </div>
      </div>

      <div class="combat-divider">
        <span class="vs-text">VS</span>
      </div>

      <div class="player-combat-display">
        <div class="player-bars">
          <div class="bar-group">
            <span class="bar-label">HP</span>
            <div class="hp-bar">
              <div class="hp-fill player-hp" style="width: ${playerHpPercent}%"></div>
              <span class="hp-text">${player?.hp || 0}/${player?.maxHp || 100}</span>
            </div>
          </div>
          <div class="bar-group">
            <span class="bar-label">MP</span>
            <div class="mp-bar">
              <div class="mp-fill" style="width: ${playerMpPercent}%"></div>
              <span class="mp-text">${player?.mp || 0}/${player?.maxMp || 50}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Close combat submenu
 */
export function closeCombatSubmenu() {
  const submenu = document.getElementById('combat-submenu');
  if (submenu) submenu.classList.add('hidden');
}

/**
 * Get emoji representation of enemy
 */
export function getEnemyEmoji(enemy) {
  const emojiMap = {
    'slime': '&#x1F7E2;',
    'goblin': '&#x1F47A;',
    'wolf': '&#x1F43A;',
    'skeleton': '&#x1F480;',
    'orc': '&#x1F479;',
    'mage': '&#x1F9D9;',
    'knight': '&#x2694;',
    'demon': '&#x1F608;',
    'golem': '&#x1FAA8;',
    'shadow': '&#x1F47B;',
    'dragon': '&#x1F409;',
    'boss_goblin_king': '&#x1F451;',
    'boss_wolf_alpha': '&#x1F43A;',
    'boss_lich': '&#x1F9DF;',
    'boss_ogre': '&#x1F479;',
    'boss_demon_lord': '&#x1F608;',
    'boss_dragon_elder': '&#x1F432;',
    'boss_shadow_monarch': '&#x1F👑'
  };

  return emojiMap[enemy.id] || '&#x1F47E;';
}

/**
 * Disable combat action buttons
 */
export function disableCombatActions() {
  document.querySelectorAll('.combat-btn').forEach(btn => btn.disabled = true);
}

/**
 * Enable combat action buttons
 */
export function enableCombatActions() {
  document.querySelectorAll('.combat-btn').forEach(btn => {
    btn.disabled = false;
  });
}

// ============ COMBAT ANIMATIONS ============

/**
 * Animate player attack
 */
export function animatePlayerAttack() {
  if (!playerSprite) return;
  playerSprite.classList.remove('idle');
  playerSprite.classList.add('attacking');
  setTimeout(() => {
    playerSprite.classList.remove('attacking');
    playerSprite.classList.add('idle');
  }, 500);
}

/**
 * Animate enemy attack
 */
export function animateEnemyAttack() {
  if (!enemySprite) return;
  enemySprite.classList.remove('idle');
  enemySprite.classList.add('attacking');
  setTimeout(() => {
    enemySprite.classList.remove('attacking');
    enemySprite.classList.add('idle');
  }, 500);
}

/**
 * Animate player hurt
 */
export function animatePlayerHurt() {
  if (!playerSprite) return;
  playerSprite.classList.add('hurt');
  setTimeout(() => {
    playerSprite.classList.remove('hurt');
  }, 400);
}

/**
 * Animate enemy hurt
 */
export function animateEnemyHurt() {
  if (!enemySprite) return;
  enemySprite.classList.add('hurt');
  setTimeout(() => {
    enemySprite.classList.remove('hurt');
  }, 400);
}

/**
 * Show critical hit splash effect on enemy
 */
export function showCriticalSplash() {
  const enemyArea = document.querySelector('.vn-enemy-area');
  if (!enemyArea) return;

  const splash = document.createElement('div');
  splash.className = 'critical-splash';
  splash.innerHTML = `
    <div class="critical-splash-inner">
      <div class="critical-flash"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-spike"></div>
      <div class="critical-ring"></div>
      <div class="critical-text">CRITICAL!</div>
    </div>
  `;

  enemyArea.appendChild(splash);

  // Remove after animation completes
  setTimeout(() => splash.remove(), 700);
}

/**
 * Animate enemy defeat
 */
export function animateEnemyDefeat() {
  if (!enemySprite) return;
  enemySprite.classList.remove('idle', 'hurt');
  enemySprite.classList.add('defeated');
}

/**
 * Show chip effect text
 */
export function showChipEffect(effectName, isPlayer = false, type = 'buff') {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const effectEl = document.createElement('div');
  effectEl.className = `chip-effect ${type}`;
  effectEl.textContent = effectName;

  // Position below the damage number
  effectEl.style.left = `${50 + (Math.random() - 0.5) * 30}%`;
  effectEl.style.top = `${55 + Math.random() * 10}%`;

  targetArea.appendChild(effectEl);
  setTimeout(() => effectEl.remove(), 1500);
}

/**
 * Show DoT damage number
 */
export function showDotDamage(damage, isPlayer = false) {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number dot-damage';
  damageEl.textContent = `-${damage}`;

  // Position offset from regular damage
  damageEl.style.left = `${60 + (Math.random() - 0.5) * 20}%`;
  damageEl.style.top = `${40 + Math.random() * 15}%`;

  targetArea.appendChild(damageEl);
  setTimeout(() => damageEl.remove(), 1000);
}

/**
 * Show damage number on target
 */
export function showDamageNumber(damage, isPlayer, isCritical = false, isHeal = false, isMiss = false, outcomeType = null) {
  const targetArea = isPlayer ? document.querySelector('.vn-player-area') : document.querySelector('.vn-enemy-area');
  if (!targetArea) return;

  const damageEl = document.createElement('div');
  damageEl.className = 'damage-number';

  // Handle outcome types: 'miss', 'dodge', 'perfect'
  if (outcomeType) {
    damageEl.classList.add(outcomeType);
    switch (outcomeType) {
      case 'miss':
        damageEl.textContent = 'MISS';
        break;
      case 'dodge':
        damageEl.textContent = 'DODGE';
        break;
      case 'perfect':
        damageEl.textContent = 'PERFECT!';
        break;
    }
  } else if (isMiss) {
    damageEl.classList.add('miss');
    damageEl.textContent = 'MISS';
  } else if (isHeal) {
    damageEl.classList.add('heal');
    damageEl.textContent = `+${damage}`;
  } else {
    if (isCritical) damageEl.classList.add('critical');
    damageEl.textContent = `-${damage}`;

    // Show critical splash effect on enemy (not on player)
    if (isCritical && !isPlayer) {
      showCriticalSplash();
    }
  }

  // Position randomly around the sprite
  damageEl.style.left = `${50 + (Math.random() - 0.5) * 40}%`;
  damageEl.style.top = `${30 + Math.random() * 20}%`;

  targetArea.appendChild(damageEl);

  // Remove after animation
  setTimeout(() => damageEl.remove(), 1000);
}

/**
 * Process and display chip effects from attack result
 */
export function displayChipEffects(attackData, isPlayerAttack = true) {
  // On-crit effects (player attacking)
  if (isPlayerAttack && attackData.anyCritical) {
    if (attackData.onCritHeal > 0) {
      setTimeout(() => showChipEffect(`CHIP +${attackData.onCritHeal} HP`, true, 'heal'), 200);
    }
    if (attackData.doubleCritDamage) {
      setTimeout(() => showChipEffect('DOUBLE CRIT!', false, 'special'), 300);
    }
    if (attackData.onCritBuffs?.length > 0) {
      setTimeout(() => showChipEffect('BUFF!', true, 'buff'), 400);
    }
  }

  // On-dodge effects (player dodging enemy attack)
  if (!isPlayerAttack && (attackData.dodge || attackData.perfectDodge)) {
    if (attackData.onDodgeBuffs?.length > 0) {
      setTimeout(() => showChipEffect('SPEED UP!', true, 'buff'), 300);
    }
    if (attackData.onDodgeCounterAttack) {
      setTimeout(() => showChipEffect('COUNTER!', true, 'special'), 400);
    }
  }

  // On-damage effects (player taking damage)
  if (!isPlayerAttack && attackData.damage > 0) {
    if (attackData.onDamageHeal > 0) {
      setTimeout(() => showChipEffect(`CHIP +${attackData.onDamageHeal} HP`, true, 'heal'), 300);
    }
    if (attackData.damageNegated) {
      setTimeout(() => showChipEffect('NEGATED!', true, 'special'), 200);
    }
    if (attackData.chipDamageReduction?.length > 0) {
      setTimeout(() => showChipEffect('REDUCED!', true, 'buff'), 300);
    }
  }

  // On-low-hp effects (player surviving lethal)
  if (!isPlayerAttack) {
    if (attackData.survivedWithOneHp) {
      setTimeout(() => showChipEffect('SURVIVE!', true, 'survive'), 100);
    }
    if (attackData.shieldAbsorbed > 0) {
      setTimeout(() => showChipEffect(`SHIELD -${attackData.shieldAbsorbed}`, true, 'buff'), 200);
    }
  }

  // Chip status effects applied to enemy
  if (isPlayerAttack && attackData.chipEffects?.length > 0) {
    for (let i = 0; i < attackData.chipEffects.length; i++) {
      const effect = attackData.chipEffects[i];
      if (effect.status) {
        setTimeout(() => showChipEffect(effect.status.toUpperCase(), false, 'special'), 400 + i * 150);
      }
    }
  }
}

// ============ COMBAT CHIP RENDERING ============

// Cache for the latest pipeline result (for UI updates)
let lastPipelineResult = null;

/**
 * Render combat chips display
 */
export function renderCombatChips(pipelineResult = null) {
  if (!chipLoadoutCache?.equipment?.weapon) return '';

  const weaponChips = chipLoadoutCache.equipment.weapon.equippedChips || [];
  let html = '';

  for (let i = 0; i < 5; i++) {
    const chip = weaponChips[i];
    if (chip) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');

      // Get pipeline fire state for this chip
      const fireState = pipelineResult?.firedChips?.[i];
      let stateClass = '';
      if (fireState && !fireState.skipped && !fireState.notPipeline) {
        stateClass = fireState.triggered ? 'triggered' : 'failed';
      }

      html += `
        <div class="chip-slot filled ${rarityClass} ${stateClass}" title="${chip.name}" data-index="${i}">
          <img class="chip-slot-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          ${fireState?.triggered ? `<span class="chip-effect-text">${fireState.displayText}</span>` : ''}
        </div>
      `;
    } else {
      html += `<div class="chip-slot empty" data-index="${i}"></div>`;
    }
  }
  return html;
}

/**
 * Animate the chip pipeline firing sequentially
 * @param {object} pipelineResult - Result from executeChipPipeline
 */
export async function animateChipPipeline(pipelineResult) {
  if (!pipelineResult?.firedChips || !delay) return;

  lastPipelineResult = pipelineResult;

  const slots = document.querySelectorAll('.combat-chips-display .chip-slot');
  if (slots.length === 0) return;

  // Reset all slots first
  slots.forEach(slot => {
    slot.classList.remove('firing', 'triggered', 'failed');
    const effectText = slot.querySelector('.chip-effect-text');
    if (effectText) effectText.remove();
  });

  // Animate each chip sequentially
  for (let i = 0; i < pipelineResult.firedChips.length; i++) {
    const result = pipelineResult.firedChips[i];
    const slot = slots[i];
    if (!slot || result.skipped || result.notPipeline) continue;

    // Add firing class briefly
    slot.classList.add('firing');
    await delay(120);
    slot.classList.remove('firing');

    // Add final state
    slot.classList.add(result.triggered ? 'triggered' : 'failed');

    // Show effect text for triggered chips
    if (result.triggered && result.displayText) {
      const effectSpan = document.createElement('span');
      effectSpan.className = 'chip-effect-text';
      effectSpan.textContent = result.displayText;
      slot.appendChild(effectSpan);
    }

    // Show heal number for chips that heal (like Siphon)
    if (result.triggered && result.healPlayer > 0) {
      showDamageNumber(result.healPlayer, true, false, true); // isPlayer=true, isHeal=true
    }

    await delay(80);
  }
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category) {
  const labels = {
    stat: 'STAT',
    onHit: 'ON HIT',
    onEffect: 'ON EFFECT',
    counter: 'COUNTER',
    pipeline: 'PIPELINE'
  };
  return labels[category] || category?.toUpperCase() || '???';
}
