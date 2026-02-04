# Dual-Card Attack/Defend Combat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single flash card with two-card Attack/Defend selection system

**Architecture:** Add `showDualFlashCards()` to actions.js that renders two vertically stacked cards. Track selected action type through the review flow. Pass action type to backend, which skips player attack and halves enemy damage on defend.

**Tech Stack:** Vanilla JS frontend, Express backend, existing flash card CSS patterns

---

## Task 1: Add CSS for Dual Flash Card Layout

**Files:**
- Modify: `public/game.css`

**Step 1: Add dual card container styles**

Add after `.flash-card.swiping-left` block (around line 495):

```css
/* ===== DUAL FLASH CARDS (Attack/Defend) ===== */
.dual-flash-card-container {
  width: 100%;
  max-width: 320px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
}

.dual-card-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dual-card-label {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  color: var(--text-secondary);
}

.dual-card-label.attack {
  color: #e53935;
}

.dual-card-label.defend {
  color: #1e88e5;
}

.dual-flash-card {
  width: 100%;
  aspect-ratio: 4/3;
  max-height: 120px;
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  user-select: none;
}

.dual-flash-card:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.dual-flash-card:active {
  transform: scale(0.98);
}

.dual-flash-card.attack:hover {
  border-color: #e53935;
}

.dual-flash-card.defend:hover {
  border-color: #1e88e5;
}
```

**Step 2: Verify styles load**

Run: Open browser, check DevTools → Network → game.css loads without errors

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "style: add dual flash card layout CSS"
```

---

## Task 2: Add showDualFlashCards Function to actions.js

**Files:**
- Modify: `public/js/ui/actions.js`

**Step 1: Add module state for tracking selected action**

After line 34 (`let onCardFlip = null;`), add:

```javascript
let onDualCardSelect = null; // (actionType: 'attack'|'defend', word: object) => void
let selectedActionType = null; // Track which card was selected
```

**Step 2: Update init function**

Modify the init function to accept the new callback. Change line 46-56:

```javascript
/** Initialize action area callbacks */
export function init({ equipBots, contextAction, cardSwipe, cardFlip, dualCardSelect }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;
  onDualCardSelect = dualCardSelect;

  // Test hook: allows E2E tests to trigger swipe without mouse/touch gestures
  document.addEventListener('test-swipe', (e) => {
    if (onCardSwipe) onCardSwipe(e.detail);
  });
}
```

**Step 3: Add getSelectedActionType export**

After the `setContent` function (around line 168), add:

```javascript
/**
 * Get the action type selected from dual cards
 * @returns {'attack'|'defend'|null}
 */
export function getSelectedActionType() {
  return selectedActionType;
}

/**
 * Clear the selected action type
 */
export function clearSelectedActionType() {
  selectedActionType = null;
}
```

**Step 4: Add showDualFlashCards function**

After the new getter functions, add:

```javascript
/**
 * Show dual flash cards (combat mode - Attack/Defend selection)
 * @param {Object} attackWord - Word for attack card { word, meanings, reading }
 * @param {Object} defendWord - Word for defend card { word, meanings, reading }
 */
export function showDualFlashCards(attackWord, defendWord) {
  selectedActionType = null;

  dom.actionArea.innerHTML = `
    <div class="dual-flash-card-container" id="dual-flash-card-container">
      <div class="dual-card-wrapper">
        <div class="dual-card-label attack">Attack</div>
        <div class="dual-flash-card attack" id="attack-card" data-action="attack">
          ${escapeHtml(attackWord.word)}
        </div>
      </div>
      <div class="dual-card-wrapper">
        <div class="dual-card-label defend">Defend</div>
        <div class="dual-flash-card defend" id="defend-card" data-action="defend">
          ${escapeHtml(defendWord.word)}
        </div>
      </div>
    </div>
  `;

  const attackCard = document.getElementById('attack-card');
  const defendCard = document.getElementById('defend-card');

  attackCard.addEventListener('click', () => {
    selectedActionType = 'attack';
    playSFX('button-tap');
    // Remove dual card container and show single flash card for review
    const container = document.getElementById('dual-flash-card-container');
    if (container) container.remove();
    if (onDualCardSelect) onDualCardSelect('attack', attackWord);
  });

  defendCard.addEventListener('click', () => {
    selectedActionType = 'defend';
    playSFX('button-tap');
    // Remove dual card container and show single flash card for review
    const container = document.getElementById('dual-flash-card-container');
    if (container) container.remove();
    if (onDualCardSelect) onDualCardSelect('defend', defendWord);
  });
}
```

**Step 5: Export the new functions**

The functions are already exported via the `export` keyword.

**Step 6: Commit**

```bash
git add public/js/ui/actions.js
git commit -m "feat(actions): add showDualFlashCards for attack/defend selection"
```

---

## Task 3: Add Word Queue Functions to word-practice.js

**Files:**
- Modify: `public/js/word-practice.js`

**Step 1: Add getTwoCombatWords function**

After `getNextCombatWord()` function (around line 197), add:

```javascript
/**
 * Get two different words from combat queue for dual flash cards
 * @returns {Object} { attackWord, defendWord } or { attackWord: null, defendWord: null }
 */
export function getTwoCombatWords() {
  // Need at least 2 words in combatWords or available pool
  const allWords = [...combatWords, ...availableWords];

  if (allWords.length < 2) {
    // Not enough words - return what we have or null
    return {
      attackWord: allWords[0] || null,
      defendWord: allWords[1] || null
    };
  }

  // Pick two different words
  const attackWord = combatWords[0] || availableWords[0];
  const defendWord = combatWords[1] || availableWords[0] || combatWords[0];

  return { attackWord, defendWord };
}
```

**Step 2: Add returnWordToPool function**

After `getTwoCombatWords()`, add:

```javascript
/**
 * Return an unchosen word back to the available pool
 * @param {Object} word - Word object to return to pool
 */
export function returnWordToPool(word) {
  if (!word) return;

  // Don't add duplicates
  const existsInCombat = combatWords.some(w => w.word === word.word);
  const existsInAvailable = availableWords.some(w => w.word === word.word);

  if (!existsInCombat && !existsInAvailable) {
    availableWords.push(word);
    console.log(`[WordPractice] Returned word to pool: ${word.word}`);
  }
}
```

**Step 3: Add removeWordFromCombatQueue function**

After `returnWordToPool()`, add:

```javascript
/**
 * Remove a specific word from the combat queue (after selection)
 * @param {Object} word - Word object to remove
 */
export function removeWordFromCombatQueue(word) {
  if (!word) return;

  const combatIndex = combatWords.findIndex(w => w.word === word.word);
  if (combatIndex !== -1) {
    combatWords.splice(combatIndex, 1);
  }

  const availIndex = availableWords.findIndex(w => w.word === word.word);
  if (availIndex !== -1) {
    availableWords.splice(availIndex, 1);
  }
}
```

**Step 4: Commit**

```bash
git add public/js/word-practice.js
git commit -m "feat(word-practice): add dual card word queue functions"
```

---

## Task 4: Update combat-loop.js to Use Dual Cards

**Files:**
- Modify: `public/js/ui/combat-loop.js`

**Step 1: Add module state for selected action**

After line 51 (`let combatPausedForVocab = false;`), add:

```javascript
let pendingActionType = null; // 'attack' or 'defend' - set when card selected
```

**Step 2: Add showDualFlashCards callback reference**

After line 78 (`let showFlashCard = null;`), add:

```javascript
let showDualFlashCards = null;
```

**Step 3: Update init to receive showDualFlashCards**

In the init function, after line 114 (`showFlashCard = callbacks.showFlashCard;`), add:

```javascript
  showDualFlashCards = callbacks.showDualFlashCards;
```

**Step 4: Replace showNextFlashCardFromQueue with showNextDualCardsFromQueue**

Replace the `showNextFlashCardFromQueue` function (lines 165-170) with:

```javascript
function showNextDualCardsFromQueue() {
  const words = wordPractice.getTwoCombatWords?.();
  if (!words || !words.attackWord) {
    // Fallback: not enough words, use single card flow
    const word = wordPractice.getNextCombatWord?.();
    if (word && showFlashCard) {
      pendingActionType = 'attack'; // Default to attack if single card
      showFlashCard(word);
    }
    return;
  }

  if (showDualFlashCards) {
    showDualFlashCards(words.attackWord, words.defendWord);
  }
}

// Keep old function for backwards compatibility / fallback
function showNextFlashCardFromQueue() {
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCard) {
    showFlashCard(word);
  }
}
```

**Step 5: Update startCombatLoop to use dual cards**

In `startCombatLoop()`, change line 534:
```javascript
  showNextFlashCardFromQueue();
```
to:
```javascript
  showNextDualCardsFromQueue();
```

**Step 6: Update executeEnemyAttackThenPause to use dual cards**

In `executeEnemyAttackThenPause()`, change line 863:
```javascript
    showNextFlashCardFromQueue();
```
to:
```javascript
    showNextDualCardsFromQueue();
```

Also change line 875 (in the catch block):
```javascript
      showNextFlashCardFromQueue();
```
to:
```javascript
      showNextDualCardsFromQueue();
```

**Step 7: Update error recovery in executePlayerAttack**

In `executePlayerAttack()`, change line 659 (in the catch block):
```javascript
      showNextFlashCardFromQueue();
```
to:
```javascript
      showNextDualCardsFromQueue();
```

**Step 8: Update resumeCombatAfterVocab to accept and use actionType**

Replace `resumeCombatAfterVocab` function (lines 884-892) with:

```javascript
/**
 * Resume combat after vocab review - triggers next attack cycle
 * @param {number} grade - Review grade (1-5)
 * @param {string} actionType - 'attack' or 'defend'
 */
export function resumeCombatAfterVocab(grade, actionType = 'attack') {
  if (!combatActive || !combatPausedForVocab) return;

  logger.info('[CombatLoop] Word reviewed, continuing:', { grade, actionType });
  combatPausedForVocab = false;
  pendingActionType = actionType;

  if (actionType === 'defend') {
    // Defend: skip player attack, go straight to enemy attack with damage reduction
    executeDefendThenPause();
  } else {
    // Attack: normal flow - player attacks, then enemy attacks
    executePlayerAttack();
  }
}
```

**Step 9: Add executeDefendThenPause function**

After `resumeCombatAfterVocab`, add:

```javascript
/**
 * Execute defend action: skip player attack, enemy attacks with reduced damage
 */
async function executeDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;
  if (setCombatAnimationActive) setCombatAnimationActive(true);

  try {
    const apiKeys = settings.getApiKeys();
    const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ attackerType: 'enemy', actionType: 'defend', ...apiKeys })
    });
    const result = await response.json();
    console.log('[Combat] Defend - Enemy attack (50% damage):', result.enemyAttack?.damage);

    if (result.error) {
      if (result.error === 'No active combat') {
        logger.warn('[CombatLoop] Stale attack detected');
        combatActive = false;
        if (setCombatAnimationActive) setCombatAnimationActive(false);
        return;
      }
      console.error('Enemy attack error:', result.error);
      if (combatActive) {
        stopCombatLoop({ combatEnded: true, victory: false, error: true });
      }
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    if (getEnemyDialogueActive()) {
      enemyAttackPending = false;
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      return;
    }

    // Show defend indicator
    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = '<div class="combat-defend-indicator">DEFENDING - 50% damage</div>';
    }
    await delay(600);

    // Show enemy's attack result (damage already halved by backend)
    if (result.enemyAttack) {
      const ea = result.enemyAttack;
      if (ea.perfectDodge) {
        showDamageNumber(0, true, false, false, false, 'perfect');
      } else if (ea.dodged) {
        showDamageNumber(0, true, false, false, false, 'dodge');
      } else if (ea.miss) {
        showDamageNumber(0, true, false, false, false, 'miss');
      } else {
        showDamageNumber(ea.damage, true, ea.critical);
        animatePlayerHurt();
        playSFX('player-hit');
      }
      showEnemyDamageDisplay(ea);

      const playerHpBar = document.getElementById('player-hp-fill');
      const chipRow = document.getElementById('chip-row');
      await playerHitEffect(result.enemyAttack.damage, playerHpBar, chipRow);

      const gameState = getGameState();
      if (gameState?.player) {
        updateHpCriticalState(playerHpBar, gameState.player.hp, gameState.player.maxHp);
      }
    }

    // Update HP bars
    characterUI.updateEnemyHPBar(result.enemyHp);
    characterUI.updatePlayerHPBar(result.playerHp);

    // Update chip charges (still increment on defend)
    if (result.chipCharges) {
      const cache = getChipLoadoutCache();
      if (cache) {
        cache.chipCharges = result.chipCharges;
        setChipLoadoutCache(cache);
        updateActionPanel();
      }
    }

    // Check if combat ended
    if (result.combatEnded) {
      if (setCombatAnimationActive) setCombatAnimationActive(false);
      stopCombatLoop(result);
      return;
    }

    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);
    combatPausedForVocab = true;
    await delay(1440);
    showNextDualCardsFromQueue();
    console.log('[Combat] Defend complete. Paused for vocab review.');

  } catch (error) {
    console.error('Defend action error:', error);
    enemyAttackPending = false;
    if (setCombatAnimationActive) setCombatAnimationActive(false);

    if (combatActive) {
      combatPausedForVocab = true;
      showNextDualCardsFromQueue();
      logger.warn('[CombatLoop] Recovered from defend error, showing dual cards');
    }
  }
}
```

**Step 10: Add defend indicator CSS**

In `public/game.css`, after the dual flash card styles, add:

```css
.combat-defend-indicator {
  font-size: 18px;
  font-weight: 700;
  color: #1e88e5;
  text-align: center;
  padding: 12px;
  background: rgba(30, 136, 229, 0.1);
  border-radius: 8px;
  border: 2px solid #1e88e5;
}
```

**Step 11: Commit**

```bash
git add public/js/ui/combat-loop.js public/game.css
git commit -m "feat(combat-loop): implement dual card flow with defend action"
```

---

## Task 5: Wire Up Callbacks in game.js

**Files:**
- Modify: `public/js/game.js`

**Step 1: Find where actions.init is called and add dualCardSelect callback**

Search for `actions.init` in game.js and update to include the new callback. The callback should:
1. Show the selected word as a single flash card for review
2. Return the unchosen word to the pool
3. Track which action was selected

Add after the existing cardSwipe callback setup:

```javascript
dualCardSelect: (actionType, selectedWord) => {
  // Store the action type for when review completes
  window._pendingCombatAction = actionType;

  // Get both words to return the unchosen one
  const words = wordPractice.getTwoCombatWords();
  const unchosenWord = actionType === 'attack' ? words.defendWord : words.attackWord;

  // Return unchosen word to pool
  wordPractice.returnWordToPool(unchosenWord);

  // Remove selected word from queue
  wordPractice.removeWordFromCombatQueue(selectedWord);

  // Show selected word as regular flash card for review
  actions.showFlashCard(selectedWord);
}
```

**Step 2: Update the cardSwipe callback to pass actionType**

Find the cardSwipe callback and update it to pass the pending action type:

```javascript
cardSwipe: (direction) => {
  const grade = direction === 'right' ? 4 : 1;
  const actionType = window._pendingCombatAction || 'attack';
  window._pendingCombatAction = null; // Clear after use
  combatLoop.resumeCombatAfterVocab(grade, actionType);
}
```

**Step 3: Pass showDualFlashCards to combat-loop init**

Find where combatLoop.init is called and add:

```javascript
showDualFlashCards: actions.showDualFlashCards,
```

**Step 4: Commit**

```bash
git add public/js/game.js
git commit -m "feat(game): wire up dual card callbacks and action type tracking"
```

---

## Task 6: Update Backend to Handle Defend Action

**Files:**
- Modify: `src/routes/game/combat.js`
- Modify: `src/game/services/combat-service.js`

**Step 1: Update combat route to accept actionType**

In `src/routes/game/combat.js`, update the combat-cycle route (lines 21-31):

```javascript
  // Combat cycle (vocab-pause turn-based)
  router.post('/combat-cycle', (req, res) => {
    const gameManager = req.gameManager;
    const { attackerType, actionType } = req.body;
    try {
      const result = gameManager.combatCycle(attackerType || 'player', actionType);
      req.saveGame();
      res.json({ ...result, state: req.getEnrichedGameState() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
```

**Step 2: Update GameManager.combatCycle to pass actionType**

Find where `combatCycle` is defined in `src/game/loop.js` and update it to pass actionType to the combat service:

```javascript
combatCycle(attackerType = 'player', actionType = 'attack') {
  return this.combatService.executeCombatCycle(attackerType, actionType);
}
```

**Step 3: Update CombatService.executeCombatCycle to handle defend**

In `src/game/services/combat-service.js`, update the method signature (line 143):

```javascript
  executeCombatCycle(attackerType = 'player', actionType = 'attack') {
```

**Step 4: Apply 50% damage reduction on defend**

In the enemy attack section (around line 369), after getting the enemy result but before updating player HP, add damage reduction:

```javascript
    } else if (attackerType === 'enemy') {
      // Enemy attack
      const enemyResult = executeEnemyTurn(this.gm.combat.enemy, this.gm.run.player, { id: 'attack', damageMultiplier: 1.0 });

      // Apply defend damage reduction
      if (actionType === 'defend' && enemyResult.damage > 0) {
        enemyResult.damage = Math.floor(enemyResult.damage * 0.5);
        logger.info('[Combat] Defend active - damage halved:', { originalDamage: enemyResult.damage * 2, reducedDamage: enemyResult.damage });
      }

      logger.info('[Combat] Enemy attacked:', { damage: enemyResult.damage, playerHp: this.gm.run.player.hp });
```

Wait - the damage is applied in executeEnemyTurn. We need to apply the reduction after the function returns but before we report. Let me check the actual flow:

Actually, looking at the code more carefully, `executeEnemyTurn` applies damage internally. We need to:
1. Either modify executeEnemyTurn to accept a damage multiplier
2. Or heal back half the damage after the fact

The cleaner approach is to add a damage multiplier parameter. But for simplicity, let's just halve the damage after calculation but before it's applied. Let me trace through `executeEnemyTurn`:

We should modify the approach: pass a damage reduction flag to `executeEnemyTurn`, or apply the reduction in the combat service before calling.

**Better approach:** Modify the damage multiplier passed to executeEnemyTurn:

```javascript
    } else if (attackerType === 'enemy') {
      // Enemy attack - apply defend reduction via damage multiplier
      const damageMultiplier = actionType === 'defend' ? 0.5 : 1.0;
      const enemyResult = executeEnemyTurn(this.gm.combat.enemy, this.gm.run.player, { id: 'attack', damageMultiplier });
      logger.info('[Combat] Enemy attacked:', { damage: enemyResult.damage, playerHp: this.gm.run.player.hp, defending: actionType === 'defend' });
```

**Step 5: Increment chip charges on defend**

The chip charges are already incremented in the player attack section. For defend, we need to add charge increment since player attack is skipped.

At the end of the enemy attack section (before returning result), add:

```javascript
      // On defend, still increment chip charges (skill charging is core mechanic)
      if (actionType === 'defend') {
        incrementAllEquippedCharges(this.gm.run.player);
      }
```

Make sure to import `incrementAllEquippedCharges` at the top of the file if not already imported:

```javascript
import { resetChipCharge, incrementAllEquippedCharges } from '../items/chips.js';
```

**Step 6: Commit**

```bash
git add src/routes/game/combat.js src/game/services/combat-service.js src/game/loop.js
git commit -m "feat(backend): handle defend action with 50% damage reduction"
```

---

## Task 7: Manual Testing

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test dual card display**

1. Start a new run
2. Enter an encounter
3. Verify two cards appear vertically with "Attack" and "Defend" labels
4. Verify subtle gap between cards

**Step 3: Test attack flow**

1. Tap the Attack card
2. Verify single flash card appears for review
3. Swipe to grade
4. Verify player attack executes (chips fire, damage shown)
5. Verify enemy attacks back
6. Verify chip charges increment by 1
7. Verify two new cards appear

**Step 4: Test defend flow**

1. Tap the Defend card
2. Verify single flash card appears for review
3. Swipe to grade
4. Verify "DEFENDING - 50% damage" indicator shows
5. Verify NO player attack (no chip pipeline animation)
6. Verify enemy attacks with reduced damage (check console logs)
7. Verify chip charges still increment by 1
8. Verify two new cards appear

**Step 5: Test skill charging via defend**

1. Note current chip charge levels
2. Defend for 3 turns
3. Verify charges increased by 3
4. Attack with charged skill
5. Verify skill activates correctly

**Step 6: Commit all changes**

```bash
git add -A
git commit -m "test: verify dual card combat system working"
```

---

## Summary of Files Modified

| File | Changes |
|------|---------|
| `public/game.css` | Dual card container, label, card styles, defend indicator |
| `public/js/ui/actions.js` | `showDualFlashCards()`, `getSelectedActionType()`, `clearSelectedActionType()`, updated `init()` |
| `public/js/word-practice.js` | `getTwoCombatWords()`, `returnWordToPool()`, `removeWordFromCombatQueue()` |
| `public/js/ui/combat-loop.js` | `showNextDualCardsFromQueue()`, `executeDefendThenPause()`, updated `resumeCombatAfterVocab()` |
| `public/js/game.js` | Wire up `dualCardSelect` callback, pass `actionType` to combat loop |
| `src/routes/game/combat.js` | Accept `actionType` parameter |
| `src/game/loop.js` | Pass `actionType` to combat service |
| `src/game/services/combat-service.js` | Handle defend with 50% damage, increment charges on defend |
