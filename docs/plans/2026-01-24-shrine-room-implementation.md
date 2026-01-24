# Shrine Room Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Fox Shrine room type that lets players upgrade one equipped chip per visit, replacing the dead healing shrine code.

**Architecture:** Shrine rooms spawn at 20% chance per encounter slot during room generation. When entered, the frontend renders the shrine scene (fox + background) and shows up to 3 equipped chips as upgrade options. Selecting a chip calls a new `/shrine-upgrade` endpoint that increments the chip's level and marks the room interacted, then proceeds to the next room.

**Tech Stack:** Express.js backend, vanilla JS frontend, existing chip level system (`_chipLevels`)

---

### Task 1: Copy Shrine Assets

**Files:**
- Copy: `tmp/quiz-review/shrine_background.png` → `public/assets/backgrounds/shrine_background.png`
- Copy: `tmp/quiz-review/shrine_fox.png` → `public/assets/sprites/shrine_fox.png`

**Step 1: Copy assets to public directories**

```bash
cp /Users/michia/Documents/jrpg/tmp/quiz-review/shrine_background.png /Users/michia/Documents/jrpg/public/assets/backgrounds/shrine_background.png
cp /Users/michia/Documents/jrpg/tmp/quiz-review/shrine_fox.png /Users/michia/Documents/jrpg/public/assets/sprites/shrine_fox.png
```

**Step 2: Verify files exist**

```bash
ls -la /Users/michia/Documents/jrpg/public/assets/backgrounds/shrine_background.png
ls -la /Users/michia/Documents/jrpg/public/assets/sprites/shrine_fox.png
```

**Step 3: Commit**

```bash
git add public/assets/backgrounds/shrine_background.png public/assets/sprites/shrine_fox.png
git commit -m "assets: add shrine background and fox sprite"
```

---

### Task 2: Replace Room Generation - Shrine Spawns at 20%

**Files:**
- Modify: `src/game/rooms.js:224-278` (generateFloorRooms + createRoom)
- Modify: `src/game/rooms.js:285-335` (getRoomEntryNarration + getRoomActions)

**Step 1: Update generateFloorRooms to spawn shrines inline**

Replace the current approach (shrine appended after encounters) with per-encounter 20% shrine chance:

In `src/game/rooms.js`, replace the `generateFloorRooms` function (lines 224-248):

```javascript
export function generateFloorRooms(floor, encountersNeeded = 3) {
  const rooms = [];
  const SHRINE_CHANCE = 0.2; // 20% chance per encounter slot

  // Encounter rooms (each has 20% chance to be a shrine instead)
  for (let i = 0; i < encountersNeeded; i++) {
    const type = Math.random() < SHRINE_CHANCE ? ROOM_TYPES.shrine : ROOM_TYPES.encounter;
    rooms.push(createRoom(type, floor, rooms.length + 1, 0));
  }

  // Boss room (always last)
  rooms.push(createRoom(ROOM_TYPES.boss, floor, rooms.length + 1, 0));

  // Fix totalRooms now that we know the count
  const totalRooms = rooms.length;
  for (const room of rooms) {
    room.totalRooms = totalRooms;
  }

  return rooms;
}
```

**Step 2: Update createRoom to remove old shrine heal data**

Replace the shrine case in the `createRoom` function (lines 265-269):

```javascript
    case ROOM_TYPES.shrine:
      room.shrine = { used: false };
      break;
```

**Step 3: Update ROOM_TYPES comment**

At line 211, change the shrine comment:

```javascript
  shrine: 'shrine',         // Fox shrine (chip upgrade)
```

**Step 4: Update getRoomEntryNarration for shrine**

Replace shrine case at line 294:

```javascript
    case ROOM_TYPES.shrine:
      return `${roomNum}に入った。狐の祠がある。神秘的な力が感じられる...`;
```

**Step 5: Update getRoomActions for shrine**

Replace shrine case (lines 317-321):

```javascript
    case ROOM_TYPES.shrine:
      if (!room.shrine.used) {
        actions.push({ id: 'shrine_upgrade', name: '祈る', description: '狐の祠に祈る' });
      }
      break;
```

**Step 6: Syntax check**

```bash
node --check src/game/rooms.js && echo "OK"
```

**Step 7: Commit**

```bash
git add src/game/rooms.js
git commit -m "feat: shrine room spawns at 20% per encounter slot"
```

---

### Task 3: Add Shrine Upgrade Endpoint (Backend)

**Files:**
- Modify: `src/game/services/exploration-service.js:262-289` (replace useShrine)
- Modify: `src/game/loop.js:616-620` (update useShrine delegate)
- Modify: `src/routes/game/run.js` (add /shrine-upgrade route)
- Modify: `public/js/api.js` (add shrine upgrade API call)
- Modify: `src/game/items/chips.js` (import getChipLevel, setChipLevel are already exported)

**Step 1: Replace useShrine in exploration-service.js**

Replace the `useShrine()` method (lines 262-289) with:

```javascript
  /**
   * Use a shrine to upgrade a chip
   * @param {string} chipId - ID of the chip to upgrade
   * @returns {object} Result with upgraded chip info
   */
  useShrine(chipId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    const player = this.gm.run.player;
    const equippedChips = player.equipment?.weapon?.equippedChips || [];

    if (!equippedChips.includes(chipId)) {
      throw new Error('Chip not equipped');
    }

    // Import is already at top of file or add it
    const { getChipLevel, setChipLevel } = await import('../items/chips.js');
    const currentLevel = getChipLevel(player, chipId);

    if (currentLevel >= 7) {
      throw new Error('Chip already at max level');
    }

    setChipLevel(player, chipId, currentLevel + 1);
    room.shrine.used = true;
    room.interacted = true;

    this.gm.narrate(`狐の祠の力でチップが強化された！ Lv. ${currentLevel + 1}`);
    this.gm.emitState();

    return { type: 'shrine_upgrade', chipId, newLevel: currentLevel + 1 };
  }
```

**IMPORTANT:** The exploration-service.js is NOT an async module - it uses synchronous imports at the top. Check the imports at the top of the file and add the chips import there instead of using dynamic import. Add to the top imports:

```javascript
import { getChipLevel, setChipLevel } from '../items/chips.js';
```

Then the method becomes synchronous (remove `await import`):

```javascript
  useShrine(chipId) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'shrine') {
      throw new Error('No shrine here');
    }

    if (room.shrine.used) {
      throw new Error('Shrine already used');
    }

    const player = this.gm.run.player;
    const equippedChips = player.equipment?.weapon?.equippedChips || [];

    if (!equippedChips.includes(chipId)) {
      throw new Error('Chip not equipped');
    }

    const currentLevel = getChipLevel(player, chipId);

    if (currentLevel >= 7) {
      throw new Error('Chip already at max level');
    }

    setChipLevel(player, chipId, currentLevel + 1);
    room.shrine.used = true;
    room.interacted = true;

    this.gm.narrate(`狐の祠の力でチップが強化された！ Lv. ${currentLevel + 1}`);
    this.gm.emitState();

    return { type: 'shrine_upgrade', chipId, newLevel: currentLevel + 1 };
  }
```

**Step 2: Update GameManager delegate in loop.js**

At line 618, update the `useShrine` method to pass chipId:

```javascript
  useShrine(chipId) {
    return this.explorationService.useShrine(chipId);
  }
```

**Step 3: Add /shrine-upgrade route in run.js**

Add after the `/room-encounter` route (after line 211):

```javascript
  // Upgrade chip at shrine
  router.post('/shrine-upgrade', (req, res) => {
    try {
      const { chipId } = req.body;
      if (!chipId) {
        return res.status(400).json({ error: 'chipId required' });
      }
      const result = gameManager.useShrine(chipId);
      saveGameData();
      res.json({ ...result, state: getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 4: Add API function in public/js/api.js**

Find the `useShrine` function (around line 251) and replace it:

```javascript
/** Upgrade chip at shrine */
async function shrineUpgrade(chipId) {
  return apiCall('/shrine-upgrade', 'POST', { chipId });
}
```

Also update the exports at the bottom of api.js - find `useShrine` in the export list and replace with `shrineUpgrade`. Also add it to the export block.

**Step 5: Syntax check all modified files**

```bash
node --check src/game/services/exploration-service.js && echo "OK"
node --check src/game/loop.js && echo "OK"
node --check src/routes/game/run.js && echo "OK"
node --check public/js/api.js && echo "OK"
```

**Step 6: Commit**

```bash
git add src/game/services/exploration-service.js src/game/loop.js src/routes/game/run.js public/js/api.js
git commit -m "feat: shrine upgrade endpoint for chip leveling"
```

---

### Task 4: Add Shrine Phase to Phase Machine

**Files:**
- Modify: `src/game/phase-machine.js:205-216`

**Step 1: Add shrine detection in derivePhase**

In `derivePhase()`, add shrine room detection before the generic room fallback. After the boss room check (line 208) and before the encounter check (line 211), add:

```javascript
    // Shrine room (not yet used)
    if (currentRoom.type === 'shrine' && !currentRoom.interacted) {
      return 'shrine';
    }
```

This gives shrine rooms their own phase so the frontend knows to render shrine UI.

**Step 2: Syntax check**

```bash
node --check src/game/phase-machine.js && echo "OK"
```

**Step 3: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat: shrine phase in phase machine"
```

---

### Task 5: Frontend - Shrine Room Rendering

**Files:**
- Modify: `public/game.js` (updateScene, updateGameContent, add shrine handler)
- Modify: `public/js/ui/exploration.js` (add renderShrine function)
- Modify: `public/js/api.js` (import shrineUpgrade in game.js)

**Step 1: Add shrine phase handling in updateGameContent**

In `public/game.js`, in the `updateGameContent()` function (around line 143), add a case for the shrine phase. After the `case 'boss_ready':` block and before the `case 'combat':` block:

```javascript
    case 'shrine':
      explorationUI.renderShrine();
      break;
```

**Step 2: Update updateScene to show shrine fox**

In the `updateScene()` function (lines 107-116), update the phase check to also handle shrine:

```javascript
function updateScene() {
  if (gameState.phase === 'combat' && gameState.combat?.enemy) {
    scene.showEnemy(gameState.combat.enemy);
  } else if (gameState.phase === 'shrine') {
    scene.showShrineFox();
  } else {
    scene.hideEnemy();
  }
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.png');
  } else if (gameState.run?.background) {
    scene.setBackground(`/assets/backgrounds/${gameState.run.background}`);
  }
}
```

**Step 3: Add showShrineFox to scene.js**

In `public/js/ui/scene.js`, add a new export function:

```javascript
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
```

Also update `hideEnemy()` to restore HP bar visibility:

```javascript
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = '';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = '';
  removePlaceholder();
}
```

**Step 4: Add renderShrine to exploration.js**

In `public/js/ui/exploration.js`, add a new API import and render function.

First, add to the module-level variables (around line 24):

```javascript
let apiShrineUpgrade = null;
let apiGetChipLoadout = null;
let setChipLoadoutCache = null;
```

Update the `init` function to receive these callbacks:

```javascript
  apiShrineUpgrade = callbacks.apiShrineUpgrade;
  apiGetChipLoadout = callbacks.apiGetChipLoadout;
  setChipLoadoutCache = callbacks.setChipLoadoutCache;
```

Add the render function:

```javascript
/** Shrine phase - show equipped chips for upgrade */
export async function renderShrine() {
  const gameState = getGameState();
  const equippedChips = gameState.run?.player?.equipment?.weapon?.equippedChips || [];

  if (equippedChips.length === 0) {
    // No chips to upgrade - just show proceed
    actions.setContent(`
      <p style="text-align:center;color:var(--text-secondary)">No chips equipped to upgrade</p>
      <button class="action-btn action-btn-primary" id="shrine-skip-btn">Continue</button>
    `);
    document.getElementById('shrine-skip-btn')?.addEventListener('click', async () => {
      const result = await apiProceed();
      if (result?.state) {
        updateGameState(result.state);
        updateUI();
      }
    });
    return;
  }

  // Pick up to 3 random equipped chips
  const shuffled = [...equippedChips].sort(() => Math.random() - 0.5);
  const offerings = shuffled.slice(0, 3);

  // We need chip display info - fetch from loadout cache or state
  // The loadout has enriched chip objects with name, rarity, description
  let loadout = null;
  if (apiGetChipLoadout) {
    loadout = await apiGetChipLoadout();
  }
  const enrichedChips = loadout?.equipment?.weapon?.equippedChips || [];
  const chipLevels = gameState.run?.player?._chipLevels || {};

  const chipCards = offerings.map(chipId => {
    const chipInfo = enrichedChips.find(c => c?.id === chipId) || { id: chipId, nameEn: chipId };
    const level = chipLevels[chipId] || 1;
    return `
      <div class="shrine-chip-option" data-chip-id="${chipId}">
        <div class="shrine-chip-icon" style="background-image:url('/assets/icons/chips/${chipId}.png'); border-color: ${chipInfo.rarityInfo?.color || '#95a5a6'}"></div>
        <div class="shrine-chip-info">
          <div class="shrine-chip-name">${chipInfo.nameEn || chipInfo.name || chipId} Lv. ${level}</div>
          <div class="shrine-chip-rarity ${chipInfo.rarity || 'common'}">${chipInfo.rarity || 'common'}</div>
          <div class="shrine-chip-desc">${chipInfo.descriptionEn || chipInfo.description || ''}</div>
          <div class="shrine-chip-upgrade">→ Lv. ${Math.min(level + 1, 7)}</div>
        </div>
      </div>
    `;
  }).join('');

  actions.setContent(`
    <h3 class="shrine-title">Choose a chip to upgrade</h3>
    <div class="shrine-chip-list">${chipCards}</div>
  `);

  document.querySelectorAll('.shrine-chip-option').forEach(el => {
    el.addEventListener('click', async () => {
      const chipId = el.dataset.chipId;
      const result = await apiShrineUpgrade(chipId);
      if (result?.state) {
        updateGameState(result.state);
      }
      // Refresh loadout cache
      if (apiGetChipLoadout && setChipLoadoutCache) {
        const newLoadout = await apiGetChipLoadout();
        setChipLoadoutCache(newLoadout);
      }
      sceneModule.showToast(`Chip upgraded to Lv. ${result?.newLevel || '?'}!`, 2000);
      // Proceed to next room
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
    });
  });
}
```

**Step 5: Wire up callbacks in game.js init**

Find where `explorationUI.init()` is called in `public/game.js` and add the new callbacks. Search for `explorationUI.init` and add:

```javascript
  apiShrineUpgrade: shrineUpgrade,
  apiGetChipLoadout: apiGetChipLoadout,
  setChipLoadoutCache: (cache) => { chipLoadoutCache = cache; },
```

Also add the import for `shrineUpgrade` from `./js/api.js` in the API imports block at the top of game.js (around line 20-41). Add `shrineUpgrade` to the import list from `'./js/api.js'`.

**Step 6: Syntax check all modified files**

```bash
node --check public/game.js && echo "OK"
node --check public/js/ui/exploration.js && echo "OK"
node --check public/js/ui/scene.js && echo "OK"
```

**Step 7: Commit**

```bash
git add public/game.js public/js/ui/exploration.js public/js/ui/scene.js
git commit -m "feat: shrine room frontend rendering with chip upgrade UI"
```

---

### Task 6: Add Shrine CSS Styles

**Files:**
- Modify: `public/game.css`

**Step 1: Add shrine chip card styles**

Add after the existing `.shop-chip-*` styles (around line 712):

```css
/* Shrine chip upgrade cards */
.shrine-title {
  text-align: center;
  margin: 8px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.shrine-chip-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px;
}

.shrine-chip-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.shrine-chip-option:active {
  background: rgba(255, 255, 255, 0.12);
}

.shrine-chip-icon {
  width: 40px;
  height: 40px;
  min-width: 40px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  border: 2px solid #95a5a6;
}

.shrine-chip-info {
  flex: 1;
  min-width: 0;
}

.shrine-chip-name {
  font-size: 13px;
  font-weight: bold;
  color: var(--text-primary);
}

.shrine-chip-rarity {
  font-size: 11px;
  text-transform: capitalize;
}

.shrine-chip-rarity.common { color: #95a5a6; }
.shrine-chip-rarity.uncommon { color: #27ae60; }
.shrine-chip-rarity.rare { color: #3498db; }
.shrine-chip-rarity.epic { color: #8e44ad; }
.shrine-chip-rarity.legendary { color: #f39c12; }

.shrine-chip-desc {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shrine-chip-upgrade {
  font-size: 12px;
  color: #f39c12;
  font-weight: bold;
  margin-top: 2px;
}
```

**Step 2: Syntax check (CSS doesn't need node --check, just verify no obvious issues)**

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: shrine chip upgrade card styles"
```

---

### Task 7: Add Chip Level Display to Skill Modal

**Files:**
- Modify: `public/js/ui/chip-row.js:93` (showPopup function)

**Step 1: Add level display to popup name**

In the `showPopup` function at line 93, change the name line to include level:

```javascript
function showPopup(index, chip, charge, maxCharges, inCombat = false) {
  currentPopupIndex = index;
  const isCharged = charge >= maxCharges;
  const level = chip._level || 1;

  dom.chipPopupName.textContent = `${chip.nameEn || chip.name} Lv. ${level}`;
```

**Note:** The `chip` object passed here comes from `chipLoadoutCache`. We need to ensure the level is available on the chip object. Check how `updateChipRow()` in `game.js` passes data - it already passes `levels` array. We need to thread the level into the popup call.

Update the `render` function to pass level into the click handler (line 78-81):

```javascript
    if (chip) {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup(i, { ...chip, _level: level }, charge, maxCharges, inCombat);
      });
    }
```

Then in `showPopup` (line 93):

```javascript
  const chipLevel = chip._level || 1;
  dom.chipPopupName.textContent = `${chip.nameEn || chip.name} Lv. ${chipLevel}`;
```

**Step 2: Syntax check**

```bash
node --check public/js/ui/chip-row.js && echo "OK"
```

**Step 3: Commit**

```bash
git add public/js/ui/chip-row.js
git commit -m "feat: show chip level in skill popup modal"
```

---

### Task 8: Include Chip Levels in Loadout API Response

**Files:**
- Modify: `src/game/items/chips.js:975-1004` (getChipLoadout function)
- Modify: `src/routes/game/run.js` (chip-loadout route to include levels)

**Step 1: Add chipLevels to loadout response**

Check if the chip-loadout endpoint already returns levels. Look for the route that calls `getChipLoadout`:

In `src/routes/game/run.js`, find the chip-loadout route. It likely returns the loadout directly. We need to also return `chipLevels` and `chipCharges`.

Find the chip-loadout route and update it to include:

```javascript
  router.get('/chip-loadout', (req, res) => {
    try {
      const loadout = getChipLoadout(gameManager.run?.player || gameManager.player);
      const player = gameManager.run?.player || gameManager.player;
      res.json({
        ...loadout,
        chipLevels: player._chipLevels || {},
        chipCharges: player._chipCharges || {}
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 2: Syntax check**

```bash
node --check src/routes/game/run.js && echo "OK"
```

**Step 3: Commit**

```bash
git add src/routes/game/run.js
git commit -m "feat: include chip levels in loadout API response"
```

---

### Task 9: End-to-End Verification

**Step 1: Start the server and manually test**

```bash
cd /Users/michia/Documents/jrpg
npm start &
sleep 3
```

**Step 2: Verify shrine assets load**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assets/backgrounds/shrine_background.png
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assets/sprites/shrine_fox.png
```

Expected: 200 for both

**Step 3: Run e2e tests**

```bash
./scripts/e2e-test.sh
```

Expected: 80+/87 tests pass (existing tests should not break)

**Step 4: Stop test server**

```bash
pkill -f "node server.js"
```

**Step 5: Final commit if any fixes needed**

---

### Task 10: Final Integration Commit

**Step 1: Ensure all changes are committed**

```bash
git status
```

If any unstaged changes remain, stage and commit them.

**Step 2: Verify the full feature works together**

Checklist:
- [ ] Shrine rooms appear ~20% of the time in dungeon
- [ ] Shrine shows fox sprite + background + "Shrine Fox" name
- [ ] No HP bar shown for fox
- [ ] Up to 3 equipped chips shown as upgrade options
- [ ] Tapping a chip upgrades it and proceeds to next room
- [ ] Chip level shows in skill popup modal as "Lv. X"
- [ ] Chip level persists across rooms (stored in _chipLevels)
