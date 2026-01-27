# Mobile UI Adapter Migration — Implementation Plan

> **Status: IMPLEMENTED** — All tasks complete + additional bugfixes from live testing.

**Goal:** Wire the existing working game logic (combat-loop, word-practice, API endpoints) to the new mobile-first HTML/CSS layout, without reimplementing any server logic.

**Architecture:** Keep `game.js` as the orchestrator with its state management, API calls, and module initialization. Replace its DOM cache and direct DOM manipulation with calls to mobile UI modules (`actions.js`, `scene.js`, `hp-bar.js`, `chip-row.js`, `takeover.js`). Rewrite four UI modules (`character.js`, `exploration.js`, `economy.js`, `modals.js`) to render into mobile DOM targets. Adapt `combat-loop.js` to use flash-card swipe instead of word-card click+type.

**Tech Stack:** Vanilla JS ES modules, Express.js backend (unchanged), mobile-first HTML/CSS (already done)

**Worktree:** `/Users/michia/Documents/jrpg-wt-mobile-ui` (branch: `feature/mobile-first-ui`)

---

## Task 1: Reset worktree to clean committed state

Discard the broken uncommitted changes. The committed state at `c57dec5` has all the good HTML/CSS/component modules.

**Files:**
- Discard: `public/game.js` (uncommitted broken rewrite)
- Discard: `public/js/ui/actions.js` (uncommitted tweaks)
- Discard: `public/js/ui/scene.js` (uncommitted tweaks)
- Discard: `src/routes/game/run.js` (uncommitted tweaks)

**Step 1: Discard uncommitted changes**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git checkout -- .
```

**Step 2: Verify mobile components are intact**

```bash
node --check public/js/dom.js && \
node --check public/js/ui/actions.js && \
node --check public/js/ui/takeover.js && \
node --check public/js/ui/hp-bar.js && \
node --check public/js/ui/chip-row.js && \
node --check public/js/ui/scene.js && \
echo "All mobile components OK"
```

Expected: All pass with "All mobile components OK"

**Step 3: Commit** — No commit needed, this is just cleanup.

---

## Task 2: Restore original game.js and strip DOM cache

Restore the working `game.js` from the commit before the mobile rewrite (`afb78eb^`), then remove its DOM element cache section (references old HTML IDs that no longer exist).

**Files:**
- Restore+Modify: `public/game.js`

**Step 1: Restore pre-rewrite game.js**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
/usr/bin/git show afb78eb^:public/game.js > public/game.js
```

**Step 2: Strip the DOM cache section**

Remove lines 184-278 (the `// ============ DOM ELEMENTS ============` section through the `const floorIndicator` line). These reference old HTML IDs (`narration-panel`, `game-content`, `action-panel`, etc.) that don't exist in mobile layout.

Also remove:
- All `document.getElementById` / `querySelector` calls scattered through helper functions that directly manipulate old DOM
- The `quickStats`, `playerStats`, `equipmentList`, `inventoryList` references
- The VN stage elements (`vnStage`, `vnBackground`, `playerSprite`, etc.)
- The settings modal elements (`settingsModal`, `jpdbApiKeyInput`, etc.)
- The stats/upgrades modal elements

**Step 3: Remove old module imports that no longer exist**

Remove these imports:
```javascript
import * as background from './js/background.js';
import * as narration from './js/narration.js';
```

**Step 4: Add new mobile module imports**

Add after the existing imports:
```javascript
import { dom } from './js/dom.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as hpBar from './js/ui/hp-bar.js';
import * as chipRow from './js/ui/chip-row.js';
import * as scene from './js/ui/scene.js';
```

**Step 5: Simplify `updateUI()` function**

Replace the current `updateUI()` with:
```javascript
function updateUI() {
  updateStatusBar();
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();
}
```

Add these new helper functions:
```javascript
function updateStatusBar() {
  const floor = gameState.run?.floor;
  dom.floorIndicator.textContent = floor ? `F${floor}` : 'Hub';
  dom.essenceDisplay.textContent = gameState.meta?.essence || gameState.player?.essence || 0;
}

function updateScene() {
  if (gameState.phase === 'combat' && gameState.combat?.enemy) {
    scene.showEnemy(gameState.combat.enemy);
  } else {
    scene.hideEnemy();
  }
  // Set background based on run state
  if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  }
}

function updateChipRow() {
  const weapon = gameState.player?.equipment?.weapon;
  const equipped = weapon?.equippedChips || [];
  const charges = gameState.player?._chipCharges || {};
  const levels = gameState.player?._chipLevels || {};

  chipRow.render(equipped, {
    charges: equipped.map(c => charges[c?.id] || 0),
    levels: equipped.map(c => levels[c?.id] || 1),
    maxCharges: 5,
    inCombat: gameState.phase === 'combat',
  });
}

function updatePlayerHP() {
  if (gameState.player) {
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
    hpBar.setVisible(true);
  } else {
    hpBar.setVisible(false);
  }
}
```

**Step 6: Simplify `updateGameContent()`**

Replace with phase routing that calls exploration/economy modules:
```javascript
function updateGameContent() {
  switch (gameState.phase) {
    case 'no_save':
      actions.setContent('<button class="action-btn action-btn-primary" id="new-game-btn">New Game</button>');
      document.getElementById('new-game-btn')?.addEventListener('click', createCharacter);
      break;
    case 'hub':
      explorationUI.renderHub();
      break;
    case 'ward_selection':
      explorationUI.renderWardSelection();
      break;
    case 'exploring':
    case 'room':
    case 'room_encounter':
      explorationUI.renderExploring();
      break;
    case 'boss_ready':
      explorationUI.renderBossReady();
      break;
    case 'combat':
      // Combat rendering handled by combat-loop + actions module
      break;
    case 'post_combat_shop':
      economyUI.renderPostCombatShop();
      break;
    case 'floor_complete':
      explorationUI.renderFloorComplete();
      break;
    case 'run_ended':
      explorationUI.renderRunEnded();
      break;
  }
}
```

**Step 7: Remove all functions that reference deleted DOM elements**

Remove these functions entirely (they reference old layout elements):
- `updateQuickStats()`
- `updatePlayerStats()`
- `updateEquipment()`
- `updateInventory()`
- `updateActionPanel()` (old chip display in action panel — replaced by chip-row module)
- `renderCombatChips()`
- `updateVNStage()` (replaced by `updateScene()`)
- `openLogModal()` / `closeLogModal()` (no narration log in mobile)
- `initDebugMode()` / `toggleDebugMode()` (not needed for mobile)
- All stat allocation functions (no character creation UI in mobile v1)
- All narration-related functions (`triggerJpdbParse`, `parseAndWrapText`, etc.)
- All TTS UI functions (`checkTtsStatus`, `testTts`, etc.)
- `updateProviderVisibility`
- `handleKeypress` (keyboard handler — mobile is touch-only)
- `showNoSaveContent`, `showHubContent`, `showWardSelectionContent`, `showExploringContent`, `showRoomContent`, `showBossReadyContent`, `showFloorCompleteContent`, `showCombatContent`, `showRunEndedContent` (replaced by module calls)
- `showPostCombatShopContent` (moved to economy module)
- `openSettings`, `closeSettings`, `saveSettings` (moved to modals module)
- `openUpgradesModal`, `closeUpgradesModal` (out of scope for mobile v1)
- `openGameStatsModal`, `closeGameStatsModal` (out of scope for mobile v1)

**Step 8: Remove the `showEnemyDialogue` / `dismissEnemyDialogue` functions**

Replace with simplified versions that use `scene.showToast()` for now:
```javascript
let enemyDialogueActive = false;
let dialogueDismissResolve = null;
let dialogueDismissPromise = null;

function showEnemyDialogue(text, type = 'possessed') {
  if (!text) return Promise.resolve();
  enemyDialogueActive = true;

  // Show as scene toast (auto-dismiss after delay)
  scene.showToast(text, type === 'liberated' ? 5000 : 3000);

  // Auto-dismiss after toast duration
  dialogueDismissPromise = new Promise(resolve => {
    dialogueDismissResolve = resolve;
    setTimeout(() => {
      enemyDialogueActive = false;
      resolve();
      dialogueDismissResolve = null;
      dialogueDismissPromise = null;
    }, type === 'liberated' ? 5000 : 3000);
  });
  return dialogueDismissPromise;
}
```

**Step 9: Simplify `setupEventListeners()`**

Replace with minimal mobile event wiring:
```javascript
function setupEventListeners() {
  // Settings button
  dom.settingsBtn.addEventListener('click', () => modalsUI.openSettings());

  // Reset run button
  dom.resetRunBtn.addEventListener('click', async () => {
    if (confirm('Forfeit current run?')) {
      await returnToHub();
    }
  });
}
```

**Step 10: Simplify `createCharacter()`**

Mobile v1 skips stat allocation:
```javascript
async function createCharacter() {
  const result = await apiCreatePlayer('Hacker', {}, 0);
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
  }
}
```

**Step 11: Keep game action functions intact**

Keep these unchanged (they just call APIs and update state):
- `startNewRun()` — but remove narration/background calls, replace with `updateUI()`
- `startEncounter()` / `startBossEncounter()` — simplify to: call API, update state, `updateUI()`, `startCombatLoop()`
- `nextFloor()` — call API, update state, `updateUI()`
- `returnToHub()` — call forfeit API, reload state
- `handlePlayerDefeat()` — update state, show gameover takeover

**Step 12: Simplify `startNewRun()`**

```javascript
async function startNewRun() {
  wordPractice.clearWordCache();
  const result = await apiStartRun();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    // Show starting chip selection if available
    if (gameState.run?.startingChipShop?.active) {
      economyUI.renderStartingChipShop(gameState.run.startingChipShop.items);
    }
  }
}
```

**Step 13: Simplify encounter functions**

```javascript
async function startEncounter() {
  const result = await apiStartEncounter();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    const enemy = gameState.combat?.enemy;
    // Show possessed dialogue if available
    if (result?.dialogue || enemy?.dialogue?.possessed) {
      const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
        ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
        : enemy.dialogue.possessed);
      await showEnemyDialogue(text, 'possessed');
    }
    await delay(300);
    startCombatLoop();
  }
}

async function startBossEncounter() {
  const result = await apiStartBoss();
  if (result?.state) {
    updateGameState(result.state);
    updateUI();
    const enemy = gameState.combat?.enemy;
    if (result?.dialogue || enemy?.dialogue?.possessed) {
      const text = result.dialogue || (Array.isArray(enemy.dialogue.possessed)
        ? enemy.dialogue.possessed[Math.floor(Math.random() * enemy.dialogue.possessed.length)]
        : enemy.dialogue.possessed);
      await showEnemyDialogue(text, 'possessed');
    }
    await delay(500);
    startCombatLoop();
  }
}
```

**Step 14: Keep combat-loop delegation functions**

Keep these thin wrappers:
```javascript
function startCombatLoop() { combatLoopUI.startCombatLoop(); }
function resumeCombatAfterVocab(isPass) { combatLoopUI.resumeCombatAfterVocab(); }
```

**Step 15: Simplify victory/gameover handlers**

```javascript
function showVictoryModal(result) {
  scene.showToast('Victory!', 2000);
  // Reload state to get post-combat shop or next phase
  setTimeout(async () => {
    await loadGameState();
    updateUI();
  }, 1500);
}

function showGameOverModal(result) {
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  content.innerHTML = `
    <h2 style="text-align:center;margin-top:40%">Defeated</h2>
    <p style="text-align:center">Your run has ended.</p>
    <button class="action-btn action-btn-primary" id="gameover-hub-btn">Return to Hub</button>
  `;
  document.getElementById('gameover-hub-btn')?.addEventListener('click', async () => {
    takeover.close('gameover');
    await returnToHub();
  });
}
```

**Step 16: Add DOMContentLoaded initialization**

Replace the old `DOMContentLoaded` handler:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize takeover close buttons
  takeover.init();

  // Initialize actions module with callbacks
  actions.init({
    equipBots: () => openChipEquipView(),
    contextAction: null, // Set per-phase by exploration module
    cardSwipe: handleCardSwipe,
    cardFlip: handleCardFlip,
  });

  // Initialize chip row with skill callback
  chipRow.init({
    useSkillCallback: handleUseChipSkill,
  });

  // Initialize word practice module
  wordPractice.init({
    apiBase: API_BASE,
    getGameState: () => gameState,
    showToast: (msg) => scene.showToast(msg),
    escapeHtml: escapeHtml,
    updatePlayerHPBar: (hp) => {
      if (gameState.player) {
        gameState.player.hp = hp;
        hpBar.updatePlayerHP(hp, gameState.player.maxHp);
      }
    },
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
    resumeCombatAfterVocab: () => resumeCombatAfterVocab(),
    isCombatActive: () => combatLoopUI.isCombatActive(),
    isEnemyDialogueActive: () => enemyDialogueActive,
    shuffleArray: shuffleArray,
    sendJpdbReview: apiSendJpdbReview,
  });

  // Initialize exploration UI
  explorationUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    actions,
    scene,
    startEncounter,
    startBossEncounter,
    nextFloor,
    startNewRun,
    apiGetStartingWards,
    apiSelectStartingWard,
    apiGetNextWardOptions,
    apiSelectNextWard,
    apiProceed,
    apiRoomEncounter,
  });

  // Initialize economy UI
  economyUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    takeover,
    scene,
    apiClaimStartingChip,
    apiPostCombatShopBuy,
    apiShopSkip,
  });

  // Initialize modals UI (settings only for mobile)
  modalsUI.init({
    takeover,
    scene,
    settings,
  });

  // Initialize character UI (minimal for mobile — just HP updates)
  characterUI.init({
    getGameState: () => gameState,
    hpBar,
    scene,
  });

  // Initialize combat loop UI
  combatLoopUI.init({
    getGameState: () => gameState,
    updateGameState,
    updateUI,
    settings,
    narration: null, // No narration in mobile
    wordPractice,
    characterUI,
    showDamageNumber: (dmg, isPlayer, isCrit) => scene.showDamageNumber(dmg, { isCrit }),
    showDotDamage: (dmg) => scene.showDamageNumber(dmg, { isCrit: false }),
    showChipEffect: (name) => scene.showToast(name, 1500),
    animateEnemyHurt: () => {},  // TODO: add shake animation
    animatePlayerHurt: () => {}, // TODO: add shake animation
    animateEnemyDefeat: () => scene.hideEnemy(),
    animateChipPipeline: () => Promise.resolve(),
    updateActionPanel: () => {}, // Chip row handles this now
    playNarrationAudio: () => {},
    showVictoryModal,
    showGameOverModal,
    showEnemyDialogue,
    getChipLoadoutCache: () => chipLoadoutCache,
    setChipLoadoutCache: (data) => { chipLoadoutCache = data; updateChipRow(); },
    getEnemyDialogueActive: () => enemyDialogueActive,
    getDialogueDismissPromise: () => dialogueDismissPromise,
    delay,
  });

  setupEventListeners();
  await loadGameState();
  updateUI();

  // Resume combat if page reloaded during battle
  if (gameState.phase === 'combat' && gameState.combat?.enemy?.hp > 0) {
    startCombatLoop();
  }
});
```

**Step 17: Add flash-card swipe handlers**

```javascript
function handleCardSwipe(direction) {
  // direction: 'left' = didn't know (grade 1), 'right' = knew it (grade 5)
  const grade = direction === 'right' ? 5 : 1;
  const word = currentFlashCardWord;
  if (!word) return;

  // Send JPDB review
  if (word.vid && word.sid) {
    apiSendJpdbReview(word.vid, word.sid, grade);
  }

  // Mark word as reviewed and get replacement
  wordPractice.fetchReplacementWord(word.vid);

  // Resume combat
  resumeCombatAfterVocab(direction === 'right');
}

function handleCardFlip() {
  // TTS: speak the word when card is flipped
  if (currentFlashCardWord?.word) {
    tts.speakWord(currentFlashCardWord.word);
  }
}

let currentFlashCardWord = null;
```

**Step 18: Add chip equip view handler**

```javascript
let chipLoadoutCache = null;

async function openChipEquipView() {
  takeover.open('chipEquip');
  const content = takeover.getContent('chipEquip');
  content.innerHTML = '<p style="text-align:center;padding:20px">Loading...</p>';

  const data = await apiGetChipLoadout();
  chipLoadoutCache = data;

  const equipped = data.equipped || [];
  const inventory = data.inventory || [];

  content.innerHTML = `
    <h3 style="margin:16px">Equipped Chips</h3>
    <div class="chip-equip-slots">
      ${equipped.map((chip, i) => chip ? `
        <div class="chip-equip-slot filled" data-action="unequip" data-index="${i}">
          <span class="chip-equip-name">${chip.nameEn || chip.name}</span>
          <span class="chip-equip-rarity ${chip.rarity}">${chip.rarity}</span>
        </div>
      ` : `
        <div class="chip-equip-slot empty" data-index="${i}">Empty</div>
      `).join('')}
    </div>
    <h3 style="margin:16px">Inventory</h3>
    <div class="chip-inventory-list">
      ${inventory.map((chip, i) => `
        <div class="chip-inventory-item" data-action="equip" data-chip-id="${chip.id}">
          <span class="chip-equip-name">${chip.nameEn || chip.name}</span>
          <span class="chip-equip-rarity ${chip.rarity}">${chip.rarity}</span>
        </div>
      `).join('')}
      ${inventory.length === 0 ? '<p style="padding:16px;opacity:0.6">No chips in inventory</p>' : ''}
    </div>
  `;

  // Wire equip/unequip handlers
  content.querySelectorAll('[data-action="unequip"]').forEach(el => {
    el.addEventListener('click', async () => {
      const chip = equipped[parseInt(el.dataset.index)];
      if (chip) {
        await apiUnequipChip(chip.id, 'weapon');
        await openChipEquipView(); // Refresh
      }
    });
  });

  content.querySelectorAll('[data-action="equip"]').forEach(el => {
    el.addEventListener('click', async () => {
      await apiEquipChip(el.dataset.chipId, 'weapon');
      await openChipEquipView(); // Refresh
    });
  });
}
```

**Step 19: Add chip skill handler**

```javascript
async function handleUseChipSkill(chipIndex) {
  const weapon = gameState.player?.equipment?.weapon;
  const chip = weapon?.equippedChips?.[chipIndex];
  if (!chip) return;

  try {
    const response = await fetch(`${API_BASE}/api/game/use-chip-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId: chip.id }),
    });
    const result = await response.json();
    if (result.error) {
      scene.showToast(result.error, 2000);
      return;
    }
    // Update state with skill result
    if (result.state) {
      updateGameState(result.state);
    }
    scene.showToast(result.message || `${chip.nameEn} activated!`, 2000);
    updateUI();
  } catch (e) {
    console.error('Chip skill error:', e);
  }
}
```

**Step 20: Add utility functions that are still needed**

```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showToast(msg, type) {
  scene.showToast(msg, 3000);
}
```

**Step 21: Verify syntax**

```bash
node --check public/game.js && echo "OK"
```

Expected: "OK"

**Step 22: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "feat: rewrite game.js as mobile UI orchestrator

Strip DOM cache and old layout references. Import mobile component
modules. Simplify updateUI to route through actions/scene/chip-row.
Wire flash-card swipe to combat loop. Keep all server API integration."
```

---

## Task 3: Rewrite character.js for mobile

The old `character.js` (875 lines) renders into old VN-stage, stats panels, character creation UI. Mobile needs only HP bar updates and enemy display (delegated to scene module).

**Files:**
- Rewrite: `public/js/ui/character.js`

**Step 1: Write minimal character.js**

```javascript
/**
 * Character UI Module (Mobile) - Minimal HP management
 *
 * Delegates all rendering to scene.js and hp-bar.js modules.
 * Keeps the same export signatures so combat-loop can call updateEnemyHPBar/updatePlayerHPBar.
 */

let getGameState = null;
let hpBar = null;
let sceneModule = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  hpBar = callbacks.hpBar;
  sceneModule = callbacks.scene;
}

/** Update enemy HP bar via scene module */
export function updateEnemyHPBar(hp) {
  const gameState = getGameState();
  const maxHp = gameState.combat?.enemy?.maxHp || 100;
  sceneModule.updateEnemyHP(hp, maxHp);
}

/** Update player HP bar via hp-bar module */
export function updatePlayerHPBar(hp) {
  const gameState = getGameState();
  const maxHp = gameState.player?.maxHp || 100;
  hpBar.updatePlayerHP(hp, maxHp);
}
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/character.js && echo "OK"
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/character.js
/usr/bin/git commit -m "feat: rewrite character.js for mobile (minimal HP delegation)"
```

---

## Task 4: Rewrite exploration.js for mobile

The old `exploration.js` (431 lines) renders into a left panel. Mobile uses action-area buttons and scene-area overlays.

**Files:**
- Rewrite: `public/js/ui/exploration.js`

**Step 1: Write mobile exploration.js**

```javascript
/**
 * Exploration UI Module (Mobile) - Navigation through hub, wards, rooms
 *
 * Renders action buttons and scene overlays for non-combat phases.
 */

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startBossEncounter = null;
let nextFloor = null;
let startNewRun = null;

// API functions
let apiGetStartingWards = null;
let apiSelectStartingWard = null;
let apiGetNextWardOptions = null;
let apiSelectNextWard = null;
let apiProceed = null;
let apiRoomEncounter = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startBossEncounter = callbacks.startBossEncounter;
  nextFloor = callbacks.nextFloor;
  startNewRun = callbacks.startNewRun;
  apiGetStartingWards = callbacks.apiGetStartingWards;
  apiSelectStartingWard = callbacks.apiSelectStartingWard;
  apiGetNextWardOptions = callbacks.apiGetNextWardOptions;
  apiSelectNextWard = callbacks.apiSelectNextWard;
  apiProceed = callbacks.apiProceed;
  apiRoomEncounter = callbacks.apiRoomEncounter;
}

/** Hub phase — show Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.showButtons('Infiltrate');
  // Override the context action for this phase
  const btn = document.getElementById('context-action-btn');
  if (btn) {
    btn.onclick = () => startNewRun();
  }
}

/** Ward selection — show ward cards in scene, proceed button in actions */
export async function renderWardSelection() {
  const gameState = getGameState();
  // Determine if this is starting ward or next ward selection
  let wards;
  if (!gameState.run?.currentWard) {
    wards = await apiGetStartingWards();
  } else {
    wards = await apiGetNextWardOptions();
  }

  if (!wards || !wards.wards) {
    actions.setContent('<p style="text-align:center">No wards available</p>');
    return;
  }

  let selectedWardId = null;

  // Render ward options as cards in action area
  const wardHtml = wards.wards.map(w => `
    <div class="ward-option" data-ward-id="${w.id}">
      <strong>${w.nameEn || w.name}</strong>
      <small>${w.description || ''}</small>
    </div>
  `).join('');

  actions.setContent(`
    <div class="ward-selection-list">${wardHtml}</div>
    <button class="action-btn action-btn-primary" id="ward-proceed-btn" disabled>Proceed</button>
  `);

  // Selection handlers
  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedWardId = el.dataset.wardId;
      const btn = document.getElementById('ward-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('ward-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedWardId) return;
    const result = gameState.run?.currentWard
      ? await apiSelectNextWard(selectedWardId)
      : await apiSelectStartingWard(selectedWardId);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Exploring phase — show Proceed button */
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  // If there's a room encounter pending, show Fight button
  if (room?.encounter || gameState.phase === 'room_encounter') {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="fight-btn">Fight</button>
    `);
    document.getElementById('fight-btn')?.addEventListener('click', () => {
      startEncounter();
    });
    return;
  }

  actions.setContent(`
    <button class="action-btn action-btn-primary" id="proceed-btn">Proceed</button>
  `);
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
      // If we hit a room encounter, trigger it
      if (result.state.phase === 'room_encounter' || result.encounter) {
        // Show encounter UI
        renderExploring();
      }
    }
  });
}

/** Boss ready phase */
export function renderBossReady() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="boss-fight-btn">Fight Boss</button>
  `);
  document.getElementById('boss-fight-btn')?.addEventListener('click', () => {
    startBossEncounter();
  });
}

/** Floor complete — show Continue button */
export function renderFloorComplete() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="next-floor-btn">Continue</button>
  `);
  document.getElementById('next-floor-btn')?.addEventListener('click', () => {
    nextFloor();
  });
}

/** Run ended — show Return to Hub */
export function renderRunEnded() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="return-hub-btn">Return to Hub</button>
  `);
  document.getElementById('return-hub-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/exploration.js && echo "OK"
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/exploration.js
/usr/bin/git commit -m "feat: rewrite exploration.js for mobile action-area buttons"
```

---

## Task 5: Rewrite economy.js for mobile

The old `economy.js` (538 lines) renders shop modals. Mobile uses takeover views.

**Files:**
- Rewrite: `public/js/ui/economy.js`

**Step 1: Write mobile economy.js**

```javascript
/**
 * Economy UI Module (Mobile) - Chip shops via takeover views
 *
 * Handles: post-combat chip shop, starting chip selection
 */

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let takeover = null;
let sceneModule = null;
let apiClaimStartingChip = null;
let apiPostCombatShopBuy = null;
let apiShopSkip = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  apiClaimStartingChip = callbacks.apiClaimStartingChip;
  apiPostCombatShopBuy = callbacks.apiPostCombatShopBuy;
  apiShopSkip = callbacks.apiShopSkip;
}

/** Render post-combat chip shop as takeover */
export function renderPostCombatShop() {
  const gameState = getGameState();
  const shop = gameState.run?.postCombatShop;
  if (!shop?.active || !shop?.items) {
    // No shop, just skip
    handleSkip();
    return;
  }

  renderChipShopContent(shop.items, false);
}

/** Render starting chip selection as takeover */
export function renderStartingChipShop(items) {
  renderChipShopContent(items, true);
}

function renderChipShopContent(items, isStarting) {
  takeover.open('chipShop');
  const content = takeover.getContent('chipShop');

  const chipCards = items.map((chip, i) => `
    <div class="shop-chip-option" data-index="${i}">
      <div class="shop-chip-name">${chip.nameEn || chip.name}</div>
      <div class="shop-chip-rarity ${chip.rarity}">${chip.rarity}</div>
      <div class="shop-chip-desc">${chip.description || chip.skill?.descriptionEn || ''}</div>
    </div>
  `).join('');

  content.innerHTML = `
    <h3 style="margin:16px;text-align:center">${isStarting ? 'Choose Starting Chip' : 'Choose a Chip'}</h3>
    <div class="shop-chip-list">${chipCards}</div>
    ${!isStarting ? '<button class="action-btn" id="shop-skip-btn" style="margin:16px auto;display:block">Skip</button>' : ''}
  `;

  // Wire chip selection
  content.querySelectorAll('.shop-chip-option').forEach(el => {
    el.addEventListener('click', async () => {
      const index = parseInt(el.dataset.index);
      const result = isStarting
        ? await apiClaimStartingChip(index)
        : await apiPostCombatShopBuy(index);

      if (result?.state) {
        updateGameState(result.state);
      }
      takeover.close('chipShop');
      sceneModule.showToast('Chip acquired!', 2000);
      updateUI();
    });
  });

  // Wire skip button
  document.getElementById('shop-skip-btn')?.addEventListener('click', () => handleSkip());
}

async function handleSkip() {
  const result = await apiShopSkip();
  if (result?.state) {
    updateGameState(result.state);
  }
  takeover.close('chipShop');
  updateUI();
}
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/economy.js && echo "OK"
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/economy.js
/usr/bin/git commit -m "feat: rewrite economy.js for mobile chip shop takeover views"
```

---

## Task 6: Rewrite modals.js for mobile

The old `modals.js` (982 lines) handles settings, upgrades, stats. Mobile v1 only needs a settings takeover.

**Files:**
- Rewrite: `public/js/ui/modals.js`

**Step 1: Write mobile modals.js**

```javascript
/**
 * Modals UI Module (Mobile) - Settings takeover only
 *
 * Strips upgrades, stats, and liberation tracker (future work).
 */

let takeover = null;
let sceneModule = null;
let settingsModule = null;

export function init(callbacks) {
  takeover = callbacks.takeover;
  sceneModule = callbacks.scene;
  settingsModule = callbacks.settings;
}

/** Open settings takeover */
export function openSettings() {
  takeover.open('settings');
  const content = takeover.getContent('settings');

  const apiKeys = settingsModule.getApiKeys();

  content.innerHTML = `
    <h3 style="margin:16px">Settings</h3>
    <div style="padding:0 16px">
      <label class="settings-label">
        JPDB API Key
        <input type="password" id="settings-jpdb-key" class="settings-input"
          value="${apiKeys.jpdbApiKey || ''}" placeholder="Enter JPDB API key">
      </label>
      <label class="settings-label" style="margin-top:12px">
        <input type="checkbox" id="settings-tts-enabled"
          ${settingsModule.isTtsEnabled?.() ? 'checked' : ''}>
        Enable TTS
      </label>
      <button class="action-btn action-btn-primary" id="settings-save-btn"
        style="margin-top:20px;width:100%">Save</button>
    </div>
  `;

  document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    const jpdbKey = document.getElementById('settings-jpdb-key')?.value?.trim();
    const ttsEnabled = document.getElementById('settings-tts-enabled')?.checked;

    settingsModule.saveApiKey('jpdbApiKey', jpdbKey);
    if (settingsModule.setTtsEnabled) {
      settingsModule.setTtsEnabled(ttsEnabled);
    }

    sceneModule.showToast('Settings saved', 2000);
    takeover.close('settings');
  });
}

/** Close settings */
export function closeSettings() {
  takeover.close('settings');
}
```

**Step 2: Verify syntax**

```bash
node --check public/js/ui/modals.js && echo "OK"
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/modals.js
/usr/bin/git commit -m "feat: rewrite modals.js for mobile settings takeover"
```

---

## Task 7: Adapt combat-loop.js for flash-card flow

The combat-loop calls `wordPractice.initCombatWords()` which renders word cards into old DOM. Adapt it to instead trigger the flash-card via actions module.

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add flash-card rendering to word practice flow**

The existing `wordPractice.initCombatWords()` fetches words and calls `renderWordCards()` + `showWordCards()`. Those functions reference `document.getElementById('word-cards')` which doesn't exist in mobile layout.

Add an `actions` callback and a `showNextFlashCard` callback to combat-loop's init:

In the `init()` function, add:
```javascript
showFlashCard = callbacks.showFlashCard; // (word) => void — renders flash card
```

**Step 2: Override the word practice card display**

After `wordPractice.initCombatWords()` in `startCombatLoop()`, show first flash card:
```javascript
// After initCombatWords fetches words, show first flash card
setTimeout(() => {
  showNextFlashCardFromQueue();
}, 300);
```

Add helper function:
```javascript
function showNextFlashCardFromQueue() {
  // Get a word from word practice's combat word queue
  // combatWords is internal to word-practice, so we call its getter
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCard) {
    showFlashCard(word);
  }
}
```

**Step 3: Add `getNextCombatWord()` export to word-practice.js**

In `public/js/word-practice.js`, add a new export:
```javascript
/**
 * Get the next word from combat queue for flash card display
 * @returns {Object|null} Word object { word, meanings, reading, vid, sid }
 */
export function getNextCombatWord() {
  if (combatWords.length === 0) return null;
  // Return current selected word
  return combatWords[selectedWordIndex] || combatWords[0];
}
```

**Step 4: Modify `resumeCombatAfterVocab` to show next card after attack cycle**

After the enemy attack + pause, when `combatPausedForVocab` is set to true again (in `executeEnemyAttackThenPause`), show the next flash card:

At the end of `executeEnemyAttackThenPause()`, after setting `combatPausedForVocab = true`:
```javascript
// Show next flash card for the next review
showNextFlashCardFromQueue();
```

**Step 5: Wire `showFlashCard` in game.js combatLoopUI init**

In game.js's `combatLoopUI.init()` callbacks, add:
```javascript
showFlashCard: (word) => {
  currentFlashCardWord = word;
  actions.showFlashCard(word);
},
```

**Step 6: Verify syntax**

```bash
node --check public/js/ui/combat-loop.js && \
node --check public/js/word-practice.js && \
echo "OK"
```

**Step 7: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js public/js/word-practice.js
/usr/bin/git commit -m "feat: wire combat-loop to flash-card swipe via actions module"
```

---

## Task 8: Delete old unused files and fix imports

Remove modules that the mobile layout doesn't use.

**Files:**
- Delete: `public/js/narration.js`
- Delete: `public/js/background.js`
- Delete: `public/js/ui/combat.js` (old combat UI with VN-stage animations)

**Step 1: Delete files**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
rm -f public/js/narration.js public/js/background.js public/js/ui/combat.js
```

**Step 2: Verify no remaining imports reference them**

```bash
grep -r "narration\|background\|combat\.js" public/js/ --include="*.js" | grep -v node_modules || echo "No stale refs"
```

Fix any remaining references found.

**Step 3: Verify all JS files parse correctly**

```bash
for f in public/game.js public/js/dom.js public/js/store.js public/js/settings.js public/js/tts.js public/js/api.js public/js/word-practice.js public/js/ui/actions.js public/js/ui/takeover.js public/js/ui/hp-bar.js public/js/ui/chip-row.js public/js/ui/scene.js public/js/ui/character.js public/js/ui/exploration.js public/js/ui/economy.js public/js/ui/modals.js public/js/ui/combat-loop.js; do
  node --check "$f" || echo "FAIL: $f"
done
echo "Done"
```

**Step 4: Commit**

```bash
/usr/bin/git add -A
/usr/bin/git commit -m "chore: delete narration.js, background.js, combat.js (not used in mobile)"
```

---

## Task 9: Fix settings.js and api.js compatibility

The settings and API modules are shared from main repo. Verify they work without old DOM references.

**Files:**
- Verify: `public/js/settings.js`
- Verify: `public/js/api.js`

**Step 1: Check settings.js doesn't reference missing DOM**

```bash
grep -n "document\.\|getElementById\|querySelector" public/js/settings.js || echo "No DOM refs - OK"
```

If it has DOM references, wrap them in null checks.

**Step 2: Check api.js is self-contained**

```bash
grep -n "document\.\|getElementById\|querySelector" public/js/api.js || echo "No DOM refs - OK"
```

**Step 3: Verify both parse**

```bash
node --check public/js/settings.js && node --check public/js/api.js && echo "OK"
```

**Step 4: Commit (if changes made)**

```bash
/usr/bin/git add public/js/settings.js public/js/api.js
/usr/bin/git diff --cached --quiet || /usr/bin/git commit -m "fix: settings.js and api.js compatibility with mobile layout"
```

---

## Task 10: Smoke test the full flow

Start the server and manually verify each phase.

**Step 1: Start server**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
npm start &
sleep 3
echo "Server running on http://localhost:3000"
```

**Step 2: Open in browser and verify**

Check each phase works by navigating the game:
1. **No save** → "New Game" button appears in action area
2. **Hub** → "Equip Bots" and "Infiltrate" buttons
3. **Ward selection** → Ward cards appear, tap to select, proceed
4. **Exploring** → "Proceed" button advances rooms
5. **Combat** → Flash card appears, tap to flip, swipe to answer
6. **Post-combat shop** → Takeover slides in with chip options
7. **Floor complete** → "Continue" button

**Step 3: Fix runtime errors**

Open browser console, fix any errors found. Common issues:
- Missing exports from modules
- Null DOM element references (check dom.js IDs match game.html IDs)
- API response shape mismatches

**Step 4: Stop server and commit fixes**

```bash
pkill -f "node server.js"
/usr/bin/git add -A
/usr/bin/git diff --cached --quiet || /usr/bin/git commit -m "fix: runtime errors found during smoke test"
```

---

## Task 11: Run unit and integration tests

Server-side tests should pass since we didn't change any backend code.

**Step 1: Run unit tests**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
npm run test:unit
```

Expected: 49/49 pass (or close — these test server logic, not UI)

**Step 2: Run integration tests**

```bash
npm run test:integration
```

Expected: 10-11/11 pass

**Step 3: Fix any failures**

If tests fail due to missing module imports in test files, fix the import paths.

**Step 4: Commit**

```bash
/usr/bin/git add -A
/usr/bin/git diff --cached --quiet || /usr/bin/git commit -m "fix: test compatibility with mobile UI modules"
```

---

## Task 12: Run E2E tests (best-effort)

E2E tests reference old DOM structure, so many will fail. Focus on server health.

**Step 1: Run E2E**

```bash
cd /Users/michia/Documents/jrpg-wt-mobile-ui
./scripts/e2e-test.sh 2>&1 | tail -30
```

**Step 2: Assess results**

- If server starts and tests can connect → good
- UI-specific test failures (element not found) are expected
- Note which tests pass for regression tracking

**Step 3: Document failures**

No fix needed — E2E test updates are out of scope for this migration.

---

## Out of Scope (Future Work)

- Character creation stat allocation UI
- Liberation tracker / game stats views
- Upgrades/meta-progression modal
- Desktop responsive breakpoint
- Keyboard shortcuts
- AI narration panel
- E2E test updates for new DOM structure
- Enemy hurt/player hurt shake animations
- TTS speaker selection UI

---

## Post-Implementation Fixes (Live Testing)

After Tasks 1-12 were completed, the following bugs were discovered during live gameplay testing and fixed in commit `745ef40`:

### Fix 1: Game stuck in `run_ended` phase after forfeit

**Root cause:** `forfeitRun()` in `loop.js` set `run.active = false` but never nulled `this.run`, so `derivePhase()` kept returning `run_ended`.

**Fix:** Null `this.run` after processing, with a guard against double-awarding essence (combat defeat already awards it):
```javascript
forfeitRun() {
  if (this.run) {
    if (this.run.active) { /* award stats */ }
    this.combat = null;
    this.run = null;
  }
}
```

### Fix 2: "No wards available" error

**Root cause:** Ward API endpoints return arrays directly, but `renderWardSelection()` checked `wards.wards`.

**Fix:** Changed to `wards.length` and `wards.map()`.

### Fix 3: Fight button randomly changes enemy

**Root cause:** Three-part issue:
1. Stale "Fight" button remaining after combat starts (no `actions.clear()`)
2. `initCombatWords()` not awaited (flash card not shown)
3. Wrong API endpoint (`/start-encounter` instead of `/room-encounter`)

**Fix:**
- Combat phase clears stale buttons via `actions.clear()`
- `startCombatLoop()` made async, awaits `initCombatWords()`
- Added `/room-encounter` route to `run.js`, game.js uses correct endpoint based on phase

### Fix 4: `tts.speakWord is not a function`

**Root cause:** Mobile `tts.js` exports `speakText()` not `speakWord()`.

**Fix:** Changed to `tts.speakText()`. Added TTS init and review type loading from server settings.

### Fix 5: HP showing "object/100"

**Root cause:** Combat-cycle returns `playerHp: { current, max }` object, not a number. `character.js` passed the object directly.

**Fix:** Both `updatePlayerHPBar` and `updateEnemyHPBar` now handle both number and `{ current, max }` formats.

### Fix 6: Word not cycling after review

**Root cause:** `handleCardSwipe` reimplemented word cycling instead of using existing `submitSelfGradeReview(grade)`.

**Fix:** Simplified to just `wordPractice.submitSelfGradeReview(grade)`.

### Fix 7: Grade 5 should be grade 4

**Fix:** Swipe right sends grade 4 ("Okay"), swipe left sends grade 1 ("Nothing").

### Fix 8: Combat freezes during enemy dialogue

**Root cause:** Dialogue dismiss handler didn't resume combat. Also, glitching dialogue branch didn't reset `playerAttackPending`.

**Fix:** After dialogue dismisses, call `executeEnemyAttackThenPause()` to resume combat. Reset `playerAttackPending` in glitching branch.

### Fix 9: `closeWordInputModal` / `closeSelfGradeModal` crashes

**Root cause:** Mobile layout doesn't have these DOM elements; `stopCombatLoop` calls them unconditionally.

**Fix:** Optional chaining on all `getElementById().classList` calls.

### Fix 10: `narration.showNarration` is null on combat end

**Root cause:** `narration: null` was explicitly passed to combat-loop init. Both success and catch paths in `stopCombatLoop` called `narration.showNarration()`.

**Fix:** Pass `narration: { showNarration: (text) => scene.showToast(text, 3000) }`.

### Fix 11: Chip skills don't show in popup / chips don't charge

**Root cause:** Two issues:
1. `updateChipRow()` read `gameState.player.equipment.weapon.equippedChips` which is an array of **ID strings** (not enriched objects with name/rarity/skill data)
2. Charges read from `gameState.player._chipCharges` which is stale (never updated during combat)

**Fix:** `updateChipRow()` now reads from `chipLoadoutCache` (enriched chip objects fetched at combat start, updated after each enemy turn).

### Additional: Mouse swipe for desktop testing

Added mouse event handlers to `actions.js` so flash cards can be swiped with mouse drag (for desktop browser testing).

### Additional: Enemy sprite fallback

`scene.js` now constructs sprite path from enemy ID, handles missing sprites with emoji placeholder based on personality.
