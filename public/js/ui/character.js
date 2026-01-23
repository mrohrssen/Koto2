/**
 * @fileoverview Character UI Module - VN stage, stats display, and chip management
 * @module public/js/ui/character.js
 *
 * PURPOSE:
 * Handles VN stage rendering with player/enemy sprites, HP bars, player stats display,
 * chip modal management, and character creation stat allocation.
 *
 * KEY EXPORTS:
 * - init(callbacks) - Initialize module with dependencies
 * - Stat allocation: getStatPointCost, calculateDerivedPreview, openCreateCharModal,
 *   updateCreateStatDisplay, handleStatIncrease, handleStatDecrease, resetCreateStats
 * - VN Stage: updateVNStage, updateEnemyHPBar, updatePlayerHPBar
 * - Stats display: updateQuickStats, updatePlayerStats, updateEquipment, updateInventory
 * - Chip modal: openChipModal, closeChipModal, renderChipModal, addChipToSlot,
 *   removeChipFromSlot, toggleChipEquip, getChipEffectText
 *
 * DEPENDENCIES:
 * - narration module for showNarration()
 * - tts module for speakText()
 * - combatUI module for sprite animations
 * - API functions for server communication
 *
 * ARCHITECTURE NOTES:
 * - Uses init() pattern with callbacks for dependency injection
 * - Manages createStats/createStatPoints state for character creation
 * - Manages chipLoadoutCache for chip modal
 */

// ============ MODULE STATE ============
let createStats = { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 };
let createStatPoints = 0;
let currentChipModalSlot = null;
let chipLoadoutCache = null;

// DOM elements (initialized in init)
let createCharModal = null;
let vnStage = null;
let gameContent = null;
let playerNameDisplay = null;
let playerHpValues = null;
let playerHpFill = null;
let playerSprite = null;
let enemySprite = null;
let enemyHpBar = null;
let enemySpriteImg = null;
let enemyNameDisplay = null;
let enemyHpValues = null;
let enemyHpFill = null;
let floorIndicator = null;
let floorDisplay = null;
let roomDisplay = null;
let quickStats = null;
let playerStats = null;
let equipmentList = null;
let inventoryList = null;

// Callbacks injected via init()
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let loadGameState = null;
let narration = null;
let tts = null;
let combatUI = null;
let formatItemStats = null;

// Combat state getters
let isRealtimeCombatActive = null;
let isEnemyDialogueActive = null;
let startRealtimeCombat = null;

// API functions
let apiEquipChip = null;
let apiUnequipChip = null;
let apiGetChipLoadout = null;

// API base
const API_BASE = '';

/**
 * Initialize the character UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  // DOM elements
  createCharModal = document.getElementById('create-char-modal');
  vnStage = document.getElementById('vn-stage');
  gameContent = document.getElementById('game-content');
  playerNameDisplay = document.getElementById('player-name');
  playerHpValues = document.getElementById('player-hp-values');
  playerHpFill = document.getElementById('player-hp-fill');
  playerSprite = document.getElementById('player-sprite');
  enemySprite = document.getElementById('enemy-sprite');
  enemyHpBar = document.getElementById('enemy-hp-bar');
  enemySpriteImg = document.querySelector('#enemy-sprite img');
  enemyNameDisplay = document.getElementById('enemy-name');
  enemyHpValues = document.getElementById('enemy-hp-values');
  enemyHpFill = document.getElementById('enemy-hp-fill');
  floorIndicator = document.getElementById('floor-indicator');
  floorDisplay = document.getElementById('floor-display');
  roomDisplay = document.getElementById('room-display');
  quickStats = document.getElementById('quick-stats');
  playerStats = document.getElementById('player-stats');
  equipmentList = document.getElementById('equipment-list');
  inventoryList = document.getElementById('inventory-list');

  // State callbacks
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  loadGameState = callbacks.loadGameState;

  // Module references
  narration = callbacks.narration;
  tts = callbacks.tts;
  combatUI = callbacks.combatUI;
  formatItemStats = callbacks.formatItemStats;

  // Combat state getters
  isRealtimeCombatActive = callbacks.isRealtimeCombatActive;
  isEnemyDialogueActive = callbacks.isEnemyDialogueActive;
  startRealtimeCombat = callbacks.startRealtimeCombat;

  // API functions
  apiEquipChip = callbacks.apiEquipChip;
  apiUnequipChip = callbacks.apiUnequipChip;
  apiGetChipLoadout = callbacks.apiGetChipLoadout;
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Get create stats state
 * @returns {Object} Current create stats
 */
export function getCreateStats() {
  return { ...createStats };
}

/**
 * Get create stat points
 * @returns {number} Remaining stat points
 */
export function getCreateStatPoints() {
  return createStatPoints;
}

/**
 * Get chip loadout cache
 * @returns {Object|null} Cached chip loadout
 */
export function getChipLoadoutCache() {
  return chipLoadoutCache;
}

/**
 * Set chip loadout cache
 * @param {Object} cache - Chip loadout data
 */
export function setChipLoadoutCache(cache) {
  chipLoadoutCache = cache;
}

// ============ STAT ALLOCATION (CHARACTER CREATION) ============

/**
 * Calculate cost to raise a stat from X to X+1 (iRO formula)
 * @param {number} currentValue - Current stat value
 * @returns {number} Cost in stat points
 */
export function getStatPointCost(currentValue) {
  return Math.floor((currentValue - 1) / 10) + 2;
}

/**
 * Calculate derived stats for preview - SIMPLIFIED
 * Only returns attack and hp (no complex stat formulas)
 * @param {Object} stats - Base stats
 * @param {number} level - Character level
 * @returns {Object} Derived stats preview
 */
export function calculateDerivedPreview(stats, level = 1) {
  return {
    atk: 15,
    def: 0,
    matk: 0,
    mdef: 0,
    hit: 100,
    flee: 0,
    crit: 0,
    hp: 100,
    sp: 50
  };
}

/**
 * Open character creation modal and initialize stats display
 */
export function openCreateCharModal() {
  if (!createCharModal) return;
  createCharModal.classList.remove('hidden');
  updateCreateStatDisplay();
}

/**
 * Update the create character stat display
 */
export function updateCreateStatDisplay() {
  // Update stat values
  Object.keys(createStats).forEach(stat => {
    const valueEl = document.getElementById(`create-${stat}`);
    const costEl = document.getElementById(`create-${stat}-cost`);
    if (valueEl) valueEl.textContent = createStats[stat];
    if (costEl) costEl.textContent = `${getStatPointCost(createStats[stat])} pts`;
  });

  // Update stat points remaining
  const pointsEl = document.getElementById('create-stat-points');
  if (pointsEl) pointsEl.textContent = createStatPoints;

  // Update derived stats preview
  const preview = calculateDerivedPreview(createStats);
  const previewAtk = document.getElementById('preview-atk');
  const previewDef = document.getElementById('preview-def');
  const previewMatk = document.getElementById('preview-matk');
  const previewMdef = document.getElementById('preview-mdef');
  const previewHit = document.getElementById('preview-hit');
  const previewFlee = document.getElementById('preview-flee');
  const previewCrit = document.getElementById('preview-crit');
  const previewHp = document.getElementById('preview-hp');
  const previewSp = document.getElementById('preview-sp');

  if (previewAtk) previewAtk.textContent = preview.atk;
  if (previewDef) previewDef.textContent = preview.def;
  if (previewMatk) previewMatk.textContent = preview.matk;
  if (previewMdef) previewMdef.textContent = preview.mdef;
  if (previewHit) previewHit.textContent = preview.hit;
  if (previewFlee) previewFlee.textContent = preview.flee;
  if (previewCrit) previewCrit.textContent = `${preview.crit}%`;
  if (previewHp) previewHp.textContent = preview.hp;
  if (previewSp) previewSp.textContent = preview.sp;

  // Update button states (disable minus at 1, disable plus if not enough points)
  Object.keys(createStats).forEach(stat => {
    const minusBtn = document.querySelector(`.stat-minus[data-stat="${stat}"]`);
    const plusBtn = document.querySelector(`.stat-plus[data-stat="${stat}"]`);
    if (minusBtn) minusBtn.disabled = createStats[stat] <= 1;
    if (plusBtn) plusBtn.disabled = createStatPoints < getStatPointCost(createStats[stat]) || createStats[stat] >= 99;
  });
}

/**
 * Handle stat increase
 * @param {string} stat - Stat key to increase
 */
export function handleStatIncrease(stat) {
  const cost = getStatPointCost(createStats[stat]);
  if (createStatPoints >= cost && createStats[stat] < 99) {
    createStatPoints -= cost;
    createStats[stat]++;
    updateCreateStatDisplay();
  }
}

/**
 * Handle stat decrease
 * @param {string} stat - Stat key to decrease
 */
export function handleStatDecrease(stat) {
  if (createStats[stat] > 1) {
    createStats[stat]--;
    const refund = getStatPointCost(createStats[stat]);
    createStatPoints += refund;
    updateCreateStatDisplay();
  }
}

/**
 * Reset stats to initial values
 */
export function resetCreateStats() {
  createStats = { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5 };
  createStatPoints = 0;
  updateCreateStatDisplay();
}

// ============ VN STAGE UPDATES ============

/**
 * Update VN stage display (sprites, HP bars, floor indicator)
 */
export function updateVNStage() {
  if (!vnStage) return;

  const gameState = getGameState();
  if (!gameState) return;

  const phase = gameState.phase;
  const isInDungeon = ['room', 'room_encounter', 'combat', 'shrine', 'floor_complete', 'boss', 'post_combat_shop'].includes(phase);
  const isInCombat = phase === 'combat';

  // Show/hide VN stage based on phase
  if (isInDungeon) {
    vnStage.classList.remove('hub-mode');
    gameContent.classList.remove('hub-mode');
    gameContent.classList.add('hidden');
  } else {
    vnStage.classList.add('hub-mode');
    gameContent.classList.add('hub-mode');
    gameContent.classList.remove('hidden');
  }

  // Update player HP bar
  const p = gameState.run?.player || gameState.player;
  if (p) {
    const hp = p.hp || 0;
    const maxHp = p.maxHp || 100;
    const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    if (playerNameDisplay) playerNameDisplay.textContent = p.name || 'Hunter';
    if (playerHpValues) playerHpValues.textContent = `${hp}/${maxHp}`;
    if (playerHpFill) playerHpFill.style.width = `${hpPercent}%`;

    // HP color classes
    if (playerHpFill) {
      playerHpFill.classList.remove('low', 'critical');
      if (hpPercent <= 25) {
        playerHpFill.classList.add('critical');
      } else if (hpPercent <= 50) {
        playerHpFill.classList.add('low');
      }
    }

    // Add idle animation to player
    if (playerSprite) playerSprite.classList.add('idle');
  }

  // Update ward/area indicator
  if (gameState.run) {
    if (floorDisplay) floorDisplay.textContent = `Ward ${gameState.run.floor || 1}`;
    if (roomDisplay) roomDisplay.textContent = `Area ${gameState.run.currentRoom || 0}/${gameState.run.totalRooms || '?'}`;
    if (floorIndicator) floorIndicator.classList.remove('hidden');
  } else {
    if (floorIndicator) floorIndicator.classList.add('hidden');
  }

  // Update enemy visibility and stats
  const enemy = gameState.combat?.enemy;
  if (isInCombat && enemy && enemy.hp > 0) {
    // NOTE: Combat is started by startEncounter/startBossEncounter, not here
    // Auto-starting here caused race conditions with dialogue handling

    // Remove defeated class and show enemy
    if (enemySprite) enemySprite.classList.remove('hidden', 'defeated');
    if (enemyHpBar) enemyHpBar.classList.remove('hidden');

    const enemyHpPercent = (enemy.hp / enemy.maxHp) * 100;
    if (enemyNameDisplay) enemyNameDisplay.textContent = enemy.name || 'Enemy';
    if (enemyHpValues) enemyHpValues.textContent = `${enemy.hp}/${enemy.maxHp}`;
    if (enemyHpFill) enemyHpFill.style.width = `${enemyHpPercent}%`;

    // Set enemy sprite image
    const spriteId = enemy.id || 'enemy';
    const newSpritePath = `assets/sprites/enemies/${spriteId}.png`;
    if (enemySpriteImg && !enemySpriteImg.src.endsWith(newSpritePath)) {
      enemySpriteImg.onerror = () => {
        if (!enemySpriteImg.src.endsWith('enemy.png')) {
          enemySpriteImg.src = 'assets/sprites/enemies/enemy.png';
        }
      };
      enemySpriteImg.src = newSpritePath;
      enemySpriteImg.alt = enemy.name || 'Enemy';
    }

    // Add idle animation
    if (enemySprite) enemySprite.classList.add('idle');
  } else {
    if (enemySprite) enemySprite.classList.add('hidden');
    if (enemyHpBar) enemyHpBar.classList.add('hidden');
  }
}

/**
 * Update enemy HP bar display
 * @param {Object} hp - HP object with current and max
 */
export function updateEnemyHPBar(hp) {
  const hpFill = document.getElementById('enemy-hp-fill');
  const hpText = document.getElementById('enemy-hp-values');

  if (hpFill) {
    const percent = Math.max(0, (hp.current / hp.max) * 100);
    hpFill.style.width = `${percent}%`;
  }

  if (hpText) {
    hpText.textContent = `${hp.current}/${hp.max}`;
  }
}

/**
 * Update player HP bar display
 * @param {Object} hp - HP object with current and max
 */
export function updatePlayerHPBar(hp) {
  const hpFill = document.getElementById('player-hp-fill');
  const hpText = document.getElementById('player-hp-values');

  const current = hp.current || 0;
  const max = hp.max || 100;
  const percent = Math.max(0, Math.min(100, (current / max) * 100));

  if (hpFill) {
    hpFill.style.width = `${percent}%`;
    hpFill.classList.remove('low', 'critical');
    if (percent <= 25) {
      hpFill.classList.add('critical');
    } else if (percent <= 50) {
      hpFill.classList.add('low');
    }
  }

  if (hpText) {
    hpText.textContent = `${current}/${max}`;
  }

  // Also update the gameState for consistency
  const gameState = getGameState();
  if (gameState.run?.player) {
    gameState.run.player.hp = current;
    gameState.run.player.maxHp = max;
  }
  if (gameState.player) {
    gameState.player.hp = current;
    gameState.player.maxHp = max;
  }
}

// ============ PLAYER STATS DISPLAY ============

/**
 * Update quick stats display
 */
export function updateQuickStats() {
  const gameState = getGameState();
  if (!gameState?.player) {
    if (quickStats) quickStats.innerHTML = '';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const floorText = gameState.run ? `Ward ${gameState.run.floor}/7` : '';

  if (quickStats) {
    quickStats.innerHTML = `
      ${floorText ? `<div class="quick-stat"><span class="floor">${floorText}</span></div>` : ''}
    `;
  }
}

/**
 * Update player stats panel
 */
export function updatePlayerStats() {
  const gameState = getGameState();
  if (!gameState?.player) {
    if (playerStats) playerStats.innerHTML = '<p class="no-save-msg">No character yet</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const hpPercent = (p.hp / p.maxHp) * 100;

  if (playerStats) {
    playerStats.innerHTML = `
      <div class="stat-row">
        <span class="label">Name</span>
        <span class="value">${escapeHtml(p.name)}</span>
      </div>
      <div class="hp-mp-bars">
        <div class="bar-row">
          <div class="bar-label-row">
            <span>HP</span>
            <span class="value hp">${p.hp}/${p.maxHp}</span>
          </div>
          <div class="bar-container">
            <div class="bar-fill hp" style="width: ${hpPercent}%"></div>
          </div>
        </div>
      </div>
      <div class="stats-grid">
        <div class="derived-stats">
          <div class="stat-row mini"><span class="label">ATK</span><span class="value">${p.attack ?? 15}</span></div>
        </div>
      </div>
      <div class="stat-row">
        <span class="label">Credits</span>
        <span class="value" style="color: #00ff88">¥${p.gold}</span>
      </div>
    `;
  }
}

/**
 * Update equipment display (weapon chip holder only)
 */
export function updateEquipment() {
  const gameState = getGameState();
  if (!gameState?.player) {
    if (equipmentList) equipmentList.innerHTML = '<p class="empty-msg">None</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  const weapon = p.equipment?.weapon;
  const chipsEquipped = weapon?.equippedChips?.length || 0;

  if (equipmentList) {
    equipmentList.innerHTML = `
      <div class="equipment-slot equipped">
        <span class="slot-name">Weapon</span>
        <div class="equipment-actions">
          <button class="modify-btn" onclick="openChipModal('weapon')" title="Modify Chips">
            <span class="chip-count">${chipsEquipped}/5</span> Modify
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * Update inventory display
 */
export function updateInventory() {
  const gameState = getGameState();
  if (!gameState?.player) {
    if (inventoryList) inventoryList.innerHTML = '<p class="empty-msg">Empty</p>';
    return;
  }

  const p = gameState.run?.player || gameState.player;
  let html = '';

  // Show chips section
  if (p.chips && p.chips.length > 0) {
    const categoryNames = {
      stat: 'ステータス',
      onHit: 'オンヒット',
      onEffect: 'オンエフェクト',
      counter: 'カウンター'
    };

    html += '<div class="inventory-section"><h4>チップ (Chips)</h4>';
    html += p.chips.map(chip => {
      const rarityClass = chip.rarity ? `rarity-${chip.rarity}` : '';
      const categoryBadge = categoryNames[chip.category] || '';
      return `
        <div class="inventory-item chip-item ${rarityClass}" title="${formatItemStats(chip)}">
          <span class="chip-category">[${categoryBadge}]</span>
          <span class="item-name">${chip.name}</span>
        </div>
      `;
    }).join('');
    html += '</div>';
  }

  if (!html) {
    html = '<p class="empty-msg">Empty</p>';
  }

  if (inventoryList) {
    inventoryList.innerHTML = html;
  }
}

// ============ CHIP MODAL ============

/**
 * Open chip modal for equipment slot
 * @param {string} equipmentSlot - Slot to modify chips for
 */
export async function openChipModal(equipmentSlot) {
  currentChipModalSlot = equipmentSlot;

  try {
    const response = await fetch('/api/game/chip-loadout');
    chipLoadoutCache = await response.json();
  } catch (error) {
    console.error('Failed to fetch chip loadout:', error);
    narration.showNarration('チップ情報の取得に失敗しました');
    return;
  }

  const modal = document.getElementById('chip-modal');
  if (!modal) {
    console.error('Chip modal not found');
    return;
  }

  renderChipModal();
  modal.classList.remove('hidden');
}

/**
 * Close the chip modal
 */
export function closeChipModal() {
  const modal = document.getElementById('chip-modal');
  modal?.classList.add('hidden');
  currentChipModalSlot = null;
}

/**
 * Render the chip modal content
 */
export function renderChipModal() {
  if (!chipLoadoutCache || !currentChipModalSlot) return;

  const gameState = getGameState();
  const slotData = chipLoadoutCache.equipment[currentChipModalSlot] || {
    equippedChips: [],
    slotsUsed: 0,
    maxSlots: 5
  };
  const inventory = chipLoadoutCache.inventory || [];
  const p = gameState.run?.player || gameState.player;
  const equipmentItem = p?.equipment?.[currentChipModalSlot];

  const slotNames = {
    weapon: 'Weapon',
    body: 'Body',
    shield: 'Shield',
    accessory: 'Accessory'
  };

  // Build slot grid (5 slots)
  let slotsHtml = '';
  for (let i = 0; i < 5; i++) {
    const chip = slotData.equippedChips[i];
    if (chip) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      slotsHtml += `
        <div class="chip-slot filled ${rarityClass}" onclick="removeChipFromSlot('${chip.id}')" title="Click to remove">
          <img class="chip-slot-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <span class="chip-name">${chip.name}</span>
          <span class="chip-category">${getCategoryLabel(chip.category)}</span>
        </div>
      `;
    } else {
      slotsHtml += `
        <div class="chip-slot empty">
          <span class="slot-label">Empty</span>
        </div>
      `;
    }
  }

  // Build inventory chips
  let inventoryHtml = '';
  if (inventory.length === 0) {
    inventoryHtml = '<p class="empty-msg">No chips available. Defeat enemies to collect chips!</p>';
  } else {
    for (const chip of inventory) {
      const rarityClass = `rarity-${chip.rarity || 'common'}`;
      const slotCost = chip.rarity === 'legendary' ? 3 : chip.rarity === 'epic' ? 2 : 1;
      const iconId = chip.baseId || chip.id.replace(/_(common|uncommon|rare|epic|legendary)$/, '');
      inventoryHtml += `
        <div class="inventory-chip ${rarityClass}" onclick="addChipToSlot('${chip.id}')" title="Click to equip">
          <img class="inventory-chip-icon" src="/assets/icons/chips/${iconId}.png" alt="" onerror="this.style.display='none'">
          <div class="inventory-chip-content">
            <span class="chip-name">${chip.name}</span>
            <span class="chip-info">
              <span class="chip-category">${getCategoryLabel(chip.category)}</span>
              <span class="chip-cost">${slotCost} slot${slotCost > 1 ? 's' : ''}</span>
            </span>
            <span class="chip-effect">${getChipEffectText(chip)}</span>
          </div>
        </div>
      `;
    }
  }

  const modalBody = document.querySelector('#chip-modal .modal-body');
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="chip-modal-equipment">
        <h3>${equipmentItem?.name || slotNames[currentChipModalSlot]}</h3>
        <p class="slots-used">${slotData.slotsUsed}/${slotData.maxSlots} slots used</p>
      </div>
      <div class="chip-slots-grid">
        ${slotsHtml}
      </div>
      <div class="chip-inventory-section">
        <h4>Available Chips</h4>
        <div class="chip-inventory-list">
          ${inventoryHtml}
        </div>
      </div>
    `;
  }
}

/**
 * Get category label for chip
 * @param {string} category - Chip category
 * @returns {string} Category label
 */
export function getCategoryLabel(category) {
  if (combatUI && combatUI.getCategoryLabel) {
    return combatUI.getCategoryLabel(category);
  }
  const labels = {
    stat: 'STAT',
    onHit: 'ON_HIT',
    onEffect: 'ON_EFFECT',
    counter: 'COUNTER'
  };
  return labels[category] || category || '';
}

/**
 * Get chip effect text for display
 * @param {Object} chip - Chip object
 * @returns {string} Effect description
 */
export function getChipEffectText(chip) {
  if (!chip.effects) return '';

  if (chip.effects.stats) {
    const stats = Object.entries(chip.effects.stats)
      .map(([stat, val]) => `+${val} ${stat.toUpperCase()}`)
      .join(', ');
    return stats;
  }

  if (chip.effects.onHit) {
    const hit = chip.effects.onHit;
    return `${Math.round(hit.chance * 100)}% ${hit.status}`;
  }

  if (chip.effects.counter) {
    const c = chip.effects.counter;
    return `+${c.perStack} ${c.stat} per ${c.trigger}`;
  }

  if (chip.effects.onKill) {
    const e = chip.effects.onKill;
    const parts = [];
    if (e.heal) parts.push(`回復${e.heal}HP`);
    if (e.aspdBoost) parts.push(`ASPD+${Math.round(e.aspdBoost * 100)}%`);
    if (e.doubleCredits) parts.push('報酬2倍');
    if (e.aoeExplosion) parts.push(`爆発${e.aoeDamage}dmg`);
    return `${Math.round((e.chance || 1) * 100)}% ${parts.join(', ') || '撃破時効果'}`;
  }

  if (chip.effects.onDamage) {
    const e = chip.effects.onDamage;
    return `${Math.round((e.chance || 1) * 100)}% ダメージ${Math.round((e.damageReduction || 0) * 100)}%軽減`;
  }

  if (chip.effects.onDodge) return '回避時効果';
  if (chip.effects.onCrit) return 'クリティカル時効果';
  if (chip.effects.onLowHp) return 'HP低下時効果';

  return '';
}

/**
 * Add a chip from inventory to the current equipment slot
 * @param {string} chipId - Chip ID to equip
 */
export async function addChipToSlot(chipId) {
  if (!currentChipModalSlot) return;

  const result = await apiEquipChip(currentChipModalSlot, chipId);

  if (result.error) {
    narration.showNarration(`装着失敗: ${result.error}`);
    return;
  }

  if (result.chipName) {
    tts.speakText(`${result.chipName}を装備`);
  }

  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();
  await loadGameState();
  updateUI();
}

/**
 * Remove a chip from the current equipment slot
 * @param {string} chipId - Chip ID to remove
 */
export async function removeChipFromSlot(chipId) {
  if (!currentChipModalSlot) return;

  const result = await apiUnequipChip(currentChipModalSlot);

  if (result.error) {
    narration.showNarration(`取り外し失敗: ${result.error}`);
    return;
  }

  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();
  await loadGameState();
  updateUI();
}

/**
 * Toggle chip equip - unequip from one slot and equip to current
 * @param {string} chipId - Chip ID
 * @param {string} fromSlot - Slot to unequip from
 */
export async function toggleChipEquip(chipId, fromSlot) {
  const unequipResult = await apiUnequipChip(fromSlot);
  if (unequipResult.error) {
    narration.showNarration(`取り外し失敗: ${unequipResult.error}`);
    return;
  }

  if (currentChipModalSlot) {
    const equipResult = await apiEquipChip(currentChipModalSlot, chipId);
    if (equipResult.error) {
      narration.showNarration(`装着失敗: ${equipResult.error}`);
    }
  }

  chipLoadoutCache = await apiGetChipLoadout();
  renderChipModal();
  await loadGameState();
  updateUI();
}

// ============ UTILITY FUNCTIONS ============

/**
 * Escape HTML for safe display
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show toast notification (uses window.showToast if available)
 * @param {string} message - Message to show
 * @param {string} type - Toast type
 */
function showToast(message, type) {
  if (window.showToast) {
    window.showToast(message, type);
  } else {
    console.log(`[${type}] ${message}`);
  }
}

// ============ WINDOW EXPORTS ============
window.openChipModal = openChipModal;
window.closeChipModal = closeChipModal;
window.addChipToSlot = addChipToSlot;
window.removeChipFromSlot = removeChipFromSlot;
window.toggleChipEquip = toggleChipEquip;
window.handleStatIncrease = handleStatIncrease;
window.handleStatDecrease = handleStatDecrease;
window.resetCreateStats = resetCreateStats;
window.openCreateCharModal = openCreateCharModal;
