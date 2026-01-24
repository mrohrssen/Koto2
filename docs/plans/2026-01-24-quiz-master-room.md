# Quiz Master Room Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Quiz Master" room type that appears 20% of the time instead of a combat encounter. The Quiz Master asks a trivia question with 3 choices (Yes is always correct). Upon answering correctly, the player picks one of three rewards: Max HP +25, Heal HP +75, or All Chip Skills +3 Charges.

**Architecture:** Mirrors the existing shrine room pattern exactly. New room type `quiz` in the room system, new phase `quiz` in the phase machine, new backend endpoint `/quiz-reward`, new frontend renderer `renderQuiz()`. Assets: `quiz_master.png` sprite and `quiz_master_background.png` background.

**Tech Stack:** Express.js backend, vanilla JS frontend, existing chip charge/HP systems.

---

## Asset Setup

### Task 1: Copy Quiz Master Assets

**Files:**
- Copy: `tmp/quiz-review/quiz_master.png` → `public/assets/sprites/quiz_master.png`
- Copy: `tmp/quiz-review/quiz_master_background.png` → `public/assets/backgrounds/quiz_master_background.png`

**Step 1: Copy sprite and background to asset directories**

Run:
```bash
cp /Users/michia/Documents/jrpg/tmp/quiz-review/quiz_master.png /Users/michia/Documents/jrpg/public/assets/sprites/quiz_master.png
cp /Users/michia/Documents/jrpg/tmp/quiz-review/quiz_master_background.png /Users/michia/Documents/jrpg/public/assets/backgrounds/quiz_master_background.png
```

**Step 2: Commit**

```bash
git add public/assets/sprites/quiz_master.png public/assets/backgrounds/quiz_master_background.png
git commit -m "feat: add quiz master sprite and background assets"
```

---

## Backend: Room System

### Task 2: Add Quiz Room Type to rooms.js

**Files:**
- Modify: `src/game/rooms.js`

**Step 1: Add `quiz` to ROOM_TYPES constant (line ~209)**

```javascript
export const ROOM_TYPES = {
  encounter: 'encounter',
  shrine: 'shrine',
  quiz: 'quiz',
  boss: 'boss'
};
```

**Step 2: Update `generateFloorRooms` to include quiz rooms**

Replace the shrine/encounter logic (lines 226-231) so that encounter slots can become either shrine or quiz. The total "special room" chance stays at 20% each (shrine 20%, quiz 20%, encounter 60%):

```javascript
export function generateFloorRooms(floor, encountersNeeded = 3) {
  const rooms = [];
  const SHRINE_CHANCE = 0.2;
  const QUIZ_CHANCE = 0.2;  // 20% quiz, 20% shrine, 60% encounter

  for (let i = 0; i < encountersNeeded; i++) {
    const roll = Math.random();
    let type;
    if (roll < SHRINE_CHANCE) {
      type = ROOM_TYPES.shrine;
    } else if (roll < SHRINE_CHANCE + QUIZ_CHANCE) {
      type = ROOM_TYPES.quiz;
    } else {
      type = ROOM_TYPES.encounter;
    }
    rooms.push(createRoom(type, floor, rooms.length + 1, 0));
  }

  // Boss room (always last)
  rooms.push(createRoom(ROOM_TYPES.boss, floor, rooms.length + 1, 0));

  const totalRooms = rooms.length;
  for (const room of rooms) {
    room.totalRooms = totalRooms;
  }

  return rooms;
}
```

**Step 3: Add quiz case to `createRoom` switch (line ~258)**

Add after the shrine case:

```javascript
    case ROOM_TYPES.quiz:
      room.quiz = { answered: false, rewarded: false };
      break;
```

**Step 4: Add quiz case to `getRoomEntryNarration` (line ~280)**

Add after the shrine case:

```javascript
    case ROOM_TYPES.quiz:
      return `${roomNum}に入った。不思議な老人がいる...「質問に答えよ」`;
```

**Step 5: Add quiz case to `getRoomActions` (line ~307)**

Add after the shrine case:

```javascript
    case ROOM_TYPES.quiz:
      if (!room.quiz.rewarded) {
        actions.push({ id: 'quiz_answer', name: '答える', description: 'クイズに答える' });
      }
      break;
```

**Step 6: Commit**

```bash
git add src/game/rooms.js
git commit -m "feat: add quiz room type to room generation system"
```

---

### Task 3: Add Quiz Phase to phase-machine.js

**Files:**
- Modify: `src/game/phase-machine.js`

**Step 1: Add quiz phase detection (after shrine detection, line ~213)**

Add after the shrine block:

```javascript
    // Quiz room (not yet rewarded)
    if (currentRoom.type === 'quiz' && !currentRoom.interacted) {
      return 'quiz';
    }
```

**Step 2: Commit**

```bash
git add src/game/phase-machine.js
git commit -m "feat: add quiz phase detection to phase machine"
```

---

### Task 4: Add Quiz Reward Logic to exploration-service.js

**Files:**
- Modify: `src/game/services/exploration-service.js`

**Step 1: Add `useQuizReward` method to the ExplorationService class**

Add after the `useShrine` method (around line 297):

```javascript
  useQuizReward(rewardType) {
    const room = this.getCurrentRoom();
    if (!room || room.type !== 'quiz') {
      throw new Error('No quiz here');
    }

    if (room.quiz.rewarded) {
      throw new Error('Quiz reward already claimed');
    }

    const player = this.gm.run.player;
    let description;

    switch (rewardType) {
      case 'max_hp':
        player.maxHp += 25;
        player.hp += 25;  // Also heal the added amount
        description = 'Max HP +25!';
        break;

      case 'heal_hp':
        player.hp = Math.min(player.hp + 75, player.maxHp);
        description = 'HP restored +75!';
        break;

      case 'chip_charges': {
        const equippedChips = player.equipment?.weapon?.equippedChips || [];
        if (!player._chipCharges) player._chipCharges = {};
        for (const chipId of equippedChips) {
          player._chipCharges[chipId] = (player._chipCharges[chipId] || 0) + 3;
        }
        description = 'All Chip Skills +3 Charges!';
        break;
      }

      default:
        throw new Error('Invalid reward type');
    }

    room.quiz.rewarded = true;
    room.interacted = true;

    this.gm.narrate(`クイズマスター：「正解！」 ${description}`);
    this.gm.emitState();

    return { type: 'quiz_reward', rewardType, description, player: { hp: player.hp, maxHp: player.maxHp } };
  }
```

**Step 2: Commit**

```bash
git add src/game/services/exploration-service.js
git commit -m "feat: add quiz reward logic to exploration service"
```

---

### Task 5: Add Quiz API Endpoint to run.js

**Files:**
- Modify: `src/routes/game/run.js`

**Step 1: Add POST `/quiz-reward` endpoint (after `/shrine-upgrade`)**

```javascript
router.post('/quiz-reward', (req, res) => {
  try {
    const { rewardType } = req.body;
    if (!rewardType) {
      return res.status(400).json({ error: 'rewardType required' });
    }
    const result = gameManager.useQuizReward(rewardType);
    saveGameData();
    res.json({ ...result, state: getEnrichedGameState() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

**Step 2: Verify `gameManager.useQuizReward` is exposed**

Check if `loop.js` (GameManager) delegates to explorationService. If it uses the same pattern as `useShrine`, add a proxy method to GameManager:

In `src/game/loop.js`, find the `useShrine` method and add below it:

```javascript
  useQuizReward(rewardType) {
    return this.explorationService.useQuizReward(rewardType);
  }
```

**Step 3: Commit**

```bash
git add src/routes/game/run.js src/game/loop.js
git commit -m "feat: add quiz-reward API endpoint"
```

---

## Frontend

### Task 6: Add Quiz Master API Client Function

**Files:**
- Modify: `public/js/api.js`

**Step 1: Add `quizReward` function alongside `shrineUpgrade`**

```javascript
async function quizReward(rewardType) {
  return apiCall('/quiz-reward', 'POST', { rewardType });
}
```

**Step 2: Export `quizReward` in the module exports object**

Add `quizReward` to the exports (find the exports block, add alongside `shrineUpgrade`).

**Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: add quiz reward API client function"
```

---

### Task 7: Add Quiz Master Scene Function

**Files:**
- Modify: `public/js/ui/scene.js`

**Step 1: Add `showQuizMaster` function (after `showShrineFox`)**

```javascript
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
```

**Step 2: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat: add quiz master scene rendering"
```

---

### Task 8: Add Quiz Master UI Renderer

**Files:**
- Modify: `public/js/ui/exploration.js`

**Step 1: Add `renderQuiz` function after `renderShrine`**

The quiz has two stages: (1) question with 3 answer options, (2) reward selection with 3 reward options.

```javascript
/** Quiz phase - question then reward selection */
export function renderQuiz() {
  const gameState = getGameState();

  // Stage tracking: use gameState._quizStage (undefined = question, 'reward' = pick reward)
  if (gameState._quizStage === 'reward') {
    renderQuizRewards();
    return;
  }

  actions.setContent(`
    <h3 class="shrine-title">Quiz Master asks:</h3>
    <p style="text-align:center; color:var(--text-primary); margin:0.5rem 0 1rem; font-size:1.1rem">"Is the sky blue?"</p>
    <div class="shrine-chip-list">
      <div class="shrine-chip-option quiz-answer-option" data-answer="yes">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">Yes</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-answer-option" data-answer="no">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">No</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-answer-option" data-answer="maybe">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name" style="color:var(--accent-primary)">Maybe</div>
        </div>
      </div>
    </div>
  `);

  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', (e) => {
      const option = e.target.closest('.quiz-answer-option');
      if (!option || list.dataset.used) return;
      list.dataset.used = '1';

      const answer = option.dataset.answer;

      // Disable all options
      document.querySelectorAll('.quiz-answer-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      if (answer === 'yes') {
        // Correct! Show reward selection
        sceneModule.showToast('Correct!', 1500);
        setTimeout(() => {
          gameState._quizStage = 'reward';
          updateUI();
        }, 1000);
      } else {
        // Wrong answer - still let them try again after a moment
        sceneModule.showToast('Wrong! Try again...', 1500);
        setTimeout(() => {
          list.dataset.used = '';
          document.querySelectorAll('.quiz-answer-option').forEach(o => {
            o.style.opacity = '1';
            o.style.pointerEvents = 'auto';
          });
        }, 1500);
      }
    });
  }
}

function renderQuizRewards() {
  actions.setContent(`
    <h3 class="shrine-title">Choose your reward:</h3>
    <div class="shrine-chip-list">
      <div class="shrine-chip-option quiz-reward-option" data-reward="max_hp">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name">Max HP +25</div>
          <div class="shrine-chip-desc">Permanently increase maximum HP</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="heal_hp">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name">Heal HP +75</div>
          <div class="shrine-chip-desc">Restore 75 HP immediately</div>
        </div>
      </div>
      <div class="shrine-chip-option quiz-reward-option" data-reward="chip_charges">
        <div class="shrine-chip-info" style="padding:0.75rem">
          <div class="shrine-chip-name">All Chips +3 Charges</div>
          <div class="shrine-chip-desc">Add 3 charges to all equipped chip skills</div>
        </div>
      </div>
    </div>
  `);

  const list = document.querySelector('.shrine-chip-list');
  if (list) {
    list.addEventListener('click', async (e) => {
      const option = e.target.closest('.quiz-reward-option');
      if (!option || list.dataset.used) return;
      list.dataset.used = '1';

      // Disable all options
      document.querySelectorAll('.quiz-reward-option').forEach(o => {
        o.style.opacity = '0.5';
        o.style.pointerEvents = 'none';
      });

      const rewardType = option.dataset.reward;
      const result = await apiQuizReward(rewardType);
      if (result?.state) {
        updateGameState(result.state);
      }
      sceneModule.showToast(result?.description || 'Reward claimed!', 2000);

      // Refresh chip loadout if charges changed
      if (rewardType === 'chip_charges' && apiGetChipLoadout && setChipLoadoutCache) {
        const newLoadout = await apiGetChipLoadout();
        setChipLoadoutCache(newLoadout);
      }

      delete getGameState()._quizStage;
      const proceedResult = await apiProceed();
      if (proceedResult?.state) {
        updateGameState(proceedResult.state);
        updateUI();
      }
    });
  }
}
```

**Step 2: Add `apiQuizReward` to the imports at the top of exploration.js**

Find the import from `'../api.js'` and add `quizReward as apiQuizReward` alongside the existing imports.

**Step 3: Export `renderQuiz` from the module**

Add `renderQuiz` to the module's export list.

**Step 4: Commit**

```bash
git add public/js/ui/exploration.js
git commit -m "feat: add quiz master UI renderer with question and reward stages"
```

---

### Task 9: Wire Quiz Phase into game.js

**Files:**
- Modify: `public/game.js`

**Step 1: Add quiz phase to `updateScene` (after shrine, line ~113)**

```javascript
  } else if (gameState.phase === 'quiz') {
    scene.showQuizMaster();
  }
```

And for the background (after shrine background, line ~118):

```javascript
  if (gameState.phase === 'shrine') {
    scene.setBackground('/assets/backgrounds/shrine_background.png');
  } else if (gameState.phase === 'quiz') {
    scene.setBackground('/assets/backgrounds/quiz_master_background.png');
  } else if (gameState.run?.background) {
```

**Step 2: Add quiz case to `updateGameContent` switch (after shrine, line ~170)**

```javascript
    case 'quiz':
      explorationUI.renderQuiz();
      break;
```

**Step 3: Import `renderQuiz` from exploration.js if not already part of `explorationUI` object**

Check how explorationUI is imported. If it's a namespace import, add `renderQuiz` to the exported members of `exploration.js`.

**Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat: wire quiz phase into main game loop"
```

---

## Testing

### Task 10: Syntax Check and Manual Verification

**Step 1: Syntax check all modified JS files**

```bash
node --check public/game.js && \
node --check public/js/api.js && \
node --check public/js/ui/exploration.js && \
node --check public/js/ui/scene.js && \
node --check src/game/rooms.js && \
node --check src/game/phase-machine.js && \
node --check src/game/services/exploration-service.js && \
node --check src/routes/game/run.js && \
node --check src/game/loop.js && \
echo "All syntax OK"
```

Expected: "All syntax OK"

**Step 2: Run unit tests**

```bash
cd /Users/michia/Documents/jrpg && npm run test:unit
```

Expected: All pass (49 tests).

**Step 3: Run e2e tests**

```bash
cd /Users/michia/Documents/jrpg && ./scripts/e2e-test.sh
```

Expected: 80+/87 pass.

**Step 4: Commit any fixes if needed**

---

## Summary of Changes

| File | Change |
|------|--------|
| `public/assets/sprites/quiz_master.png` | New sprite |
| `public/assets/backgrounds/quiz_master_background.png` | New background |
| `src/game/rooms.js` | Add `quiz` room type, generation, narration, actions |
| `src/game/phase-machine.js` | Add quiz phase detection |
| `src/game/services/exploration-service.js` | Add `useQuizReward()` method |
| `src/game/loop.js` | Add `useQuizReward()` proxy |
| `src/routes/game/run.js` | Add `POST /quiz-reward` endpoint |
| `public/js/api.js` | Add `quizReward()` client function |
| `public/js/ui/scene.js` | Add `showQuizMaster()` |
| `public/js/ui/exploration.js` | Add `renderQuiz()` + `renderQuizRewards()` |
| `public/game.js` | Wire quiz phase (scene + content routing) |
