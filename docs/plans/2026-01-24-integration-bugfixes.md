# Integration Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 15 bugs/enhancements found during integration testing of the mobile-first UI.

**Architecture:** All fixes are in the frontend (`public/`). Most are CSS or small JS changes in the UI modules. No backend changes needed except possibly verifying API response shapes.

**Tech Stack:** Vanilla JS (ES modules), CSS, HTML

---

### Task 1: Fix backgrounds and enemy sprites not rendering

**Files:**
- Modify: `public/game.css:150-166`
- Modify: `public/js/ui/scene.js:10-16`

**Root Cause:** The `.enemy-sprite-container` has no explicit dimensions (relies on flex content sizing). The sprite inside uses `max-height: 65%` which resolves to 0 when the container has no height. The background `div.scene-background` should work (uses `inset:0`) but may not be rendering if the URL path is wrong or the div has no content to paint.

**Step 1: Fix enemy sprite container to have explicit dimensions**

In `public/game.css`, change `.enemy-sprite-container`:

```css
.enemy-sprite-container {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
```

And change `.enemy-sprite`:

```css
.enemy-sprite {
  max-height: 180px;
  max-width: 60%;
  object-fit: contain;
  display: none;
}
```

**Step 2: Add debug logging to setBackground to verify paths**

In `public/js/ui/scene.js`, add a `console.log` temporarily (or just verify the path works). The real issue may be that the URL needs to be quoted in the CSS value when it contains special chars:

```javascript
export function setBackground(imagePath) {
  if (imagePath) {
    dom.sceneBackground.style.backgroundImage = `url('${imagePath}')`;
  } else {
    dom.sceneBackground.style.backgroundImage = 'none';
  }
}
```

Note the added single quotes inside the `url()` — this prevents issues with paths containing special characters.

**Step 3: Verify by starting server and loading a run**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
pkill -f "node server.js" 2>/dev/null; sleep 1
node server.js &
sleep 2
# Check that background path is correct
curl -s http://localhost:3000/api/game/state | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=JSON.parse(d);console.log('background:',s.run?.background)})"
pkill -f "node server.js"
```

**Step 4: Commit**

```bash
cd /Users/michia/Documents/jrpg-wt-integration
/usr/bin/git add public/game.css public/js/ui/scene.js
/usr/bin/git commit -m "fix: render backgrounds and enemy sprites correctly

- Give enemy-sprite-container explicit 100% width/height
- Use fixed max-height for sprites instead of % of zero-height parent
- Quote URL in backgroundImage to handle special chars"
```

---

### Task 2: Fix chip icons to display PNG images instead of initials

**Files:**
- Modify: `public/js/ui/chip-row.js:46-50`
- Modify: `public/game.css` (`.chip-icon` rules)

**Root Cause:** `chip-row.js:50` sets `icon.textContent = getChipInitial(chip)` (first letter). Should display the actual PNG icon from `/assets/icons/chips/${chip.id}.png`.

**Step 1: Replace text initial with background-image**

In `public/js/ui/chip-row.js`, replace lines 46-50 in the render loop:

```javascript
    // Chip icon
    const icon = document.createElement('div');
    icon.className = `chip-icon${chip ? '' : ' empty'}${isCharged ? ' charged' : ''}`;
    if (chip) {
      icon.style.backgroundImage = `url('/assets/icons/chips/${chip.id}.png')`;
      icon.style.backgroundSize = 'cover';
      icon.style.backgroundPosition = 'center';
    }
```

Remove the `icon.style.background = chipColor` line and the `icon.textContent = getChipInitial(chip)` line.

**Step 2: Update CSS for chip-icon to support background-image**

The `.chip-icon` class already sets `border` by rarity. Keep the border color but remove the solid background fill. Add a subtle fallback background color:

```css
.chip-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 3px solid #95a5a6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  color: white;
  background-color: #ddd;
  background-size: cover;
  background-position: center;
  transition: box-shadow var(--transition-fast);
}
```

**Step 3: Set border color by rarity (move from inline style to data attribute)**

In `chip-row.js`, set the border color based on rarity:

```javascript
    if (chip) {
      icon.style.borderColor = getChipColor(chip);
    }
```

**Step 4: Also show chip icons in the chip shop (economy.js)**

In `public/js/ui/economy.js`, in the `renderChipShopContent` function, add an icon element to each shop card:

```html
<div class="shop-chip-icon" style="background-image:url('/assets/icons/chips/${chip.id}.png')"></div>
```

Add CSS for `.shop-chip-icon`:
```css
.shop-chip-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  margin: 0 auto 8px;
}
```

**Step 5: Also show chip icons in the equip modal (game.js)**

In `game.js`'s `openChipEquipView()`, add icon to each equipped/inventory chip item.

**Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/chip-row.js public/game.css public/js/ui/economy.js public/game.js
/usr/bin/git commit -m "feat: display chip PNG icons in chip row, shop, and equip modal

- Replace text initials with background-image from /assets/icons/chips/
- Add icon to chip shop cards and equip modal items
- Keep rarity border color on chip circles"
```

---

### Task 3: Fix chip circle sizing — fill 80% of screen width

**Files:**
- Modify: `public/game.css` (`.chip-row`, `.chip-icon`)

**Step 1: Update chip-row container to be 80% width**

```css
.chip-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
  width: 80%;
  margin: 0 auto;
}
```

**Step 2: Make chip icons flex to fill available space**

```css
.chip-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chip-icon {
  width: 100%;
  aspect-ratio: 1;
  max-width: 56px;
  border-radius: 50%;
  /* ... rest of existing styles */
}
```

**Step 3: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "style: enlarge chip circles to fill 80% of screen width"
```

---

### Task 4: Fix chip modal spacing

**Files:**
- Modify: `public/game.css`

**Step 1: Add vertical spacing to chip equip slots and inventory items**

```css
.chip-equip-slot,
.chip-inventory-item {
  padding: 12px 16px;
  margin: 8px 0;
}
```

**Step 2: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "style: add vertical spacing to chip equip modal items"
```

---

### Task 5: Fix chip description overflow

**Files:**
- Modify: `public/game.css`

**Step 1: Add line-clamp to chip description elements**

```css
.chip-popup-desc,
.shop-chip-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
```

**Step 2: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "style: clamp chip descriptions to 3 lines to prevent overflow"
```

---

### Task 6: Fix chip skill "chipId required" error

**Files:**
- Modify: `public/game.js:389-398`

**Root Cause:** `handleUseChipSkill(chipIndex)` reads `gameState.player.equipment.weapon.equippedChips[chipIndex]`. In the raw game state, `equippedChips` may contain string IDs rather than objects. When it's a string, `chip.id` is undefined.

**Step 1: Handle both string IDs and chip objects**

```javascript
async function handleUseChipSkill(chipIndex) {
  const weapon = gameState.player?.equipment?.weapon;
  const chipEntry = weapon?.equippedChips?.[chipIndex];
  if (!chipEntry) return;

  // equippedChips may contain string IDs or objects with .id
  const chipId = typeof chipEntry === 'string' ? chipEntry : chipEntry.id;
  if (!chipId) return;

  try {
    const response = await fetch(`${API_BASE}/api/game/use-chip-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chipId }),
    });
    // ... rest unchanged
```

**Step 2: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "fix: handle string chip IDs in use-chip-skill handler"
```

---

### Task 7: Fix chip purchase not refreshing chip row

**Files:**
- Modify: `public/js/ui/economy.js`

**Root Cause:** After chip purchase, `economy.js` calls `updateUI()` but the chip row render depends on `chipLoadoutCache` which wasn't refreshed. The newly purchased chip is auto-equipped on the backend but the frontend cache is stale.

**Step 1: Refresh chipLoadoutCache after purchase**

In `economy.js`, after a successful chip purchase, fetch the updated loadout. The economy module needs access to the `apiGetChipLoadout` function. Add it to the init params:

In `game.js` economy init:
```javascript
economyUI.init({
  // ... existing params
  apiGetChipLoadout,
});
```

In `economy.js`, after purchase success:
```javascript
// Refresh chip loadout cache so chip row updates immediately
const loadout = await apiGetChipLoadout();
setChipLoadoutCache(loadout);
updateUI();
```

The economy module also needs `setChipLoadoutCache` and `apiGetChipLoadout` passed in via init.

**Step 2: Commit**

```bash
/usr/bin/git add public/js/ui/economy.js public/game.js
/usr/bin/git commit -m "fix: refresh chip row immediately after chip purchase"
```

---

### Task 8: Fix chip row persisting after death

**Files:**
- Modify: `public/game.js:303-317`

**Root Cause:** `showGameOverModal()` doesn't clear the chip loadout cache or re-render the chip row.

**Step 1: Clear chip cache and re-render on game over**

```javascript
function showGameOverModal(result) {
  audio.stopBGM();
  audio.playSFX('defeat');
  chipLoadoutCache = null;
  updateChipRow(); // Re-renders with empty chips
  // ... rest unchanged
```

**Step 2: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "fix: clear chip row display on death/game-over"
```

---

### Task 9: Fix chip popup to show both base ability and skill

**Files:**
- Modify: `public/js/ui/chip-row.js:88-112`
- Modify: `public/game.css` (popup styles)

**Root Cause:** The popup only shows skill info. Should show two sections: base (passive pipeline effect) and skill (active ability).

**Step 1: Update showPopup to render both sections**

```javascript
function showPopup(index, chip, charge, maxCharges) {
  currentPopupIndex = index;
  const isCharged = charge >= maxCharges;

  // Base ability section
  const baseEffect = chip.effects?.pipeline;
  let baseText = '';
  if (baseEffect) {
    if (baseEffect.type === 'flatAdd') baseText = `+${baseEffect.value} damage`;
    else if (baseEffect.type === 'multiply') baseText = `${baseEffect.displayText || baseEffect.value + '×'} damage (${Math.round((baseEffect.triggerChance || 1) * 100)}%)`;
    else if (baseEffect.type === 'rampingMultiply') baseText = `Ramping ${baseEffect.displayText || ''} damage`;
    else baseText = baseEffect.displayText || JSON.stringify(baseEffect);
  }

  dom.chipPopupName.textContent = chip.nameEn || chip.name;
  dom.chipPopupDesc.innerHTML = `
    <div class="chip-popup-section">
      <div class="chip-popup-section-label">Passive</div>
      <div>${baseText || 'No passive effect'}</div>
    </div>
    <div class="chip-popup-section">
      <div class="chip-popup-section-label">Skill: ${chip.skill?.nameEn || chip.skill?.name || 'None'}</div>
      <div>${chip.skill?.descriptionEn || chip.skill?.description || 'No skill'}</div>
    </div>
  `;
  dom.chipPopupCharge.textContent = isCharged ? 'Ready!' : `Charging ${charge}/${maxCharges}`;
  dom.chipPopupUse.disabled = !isCharged;
  // ... positioning unchanged
```

**Step 2: Add CSS for popup sections**

```css
.chip-popup-section {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.chip-popup-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.chip-popup-section-label {
  font-size: 11px;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 2px;
}
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/chip-row.js public/game.css
/usr/bin/git commit -m "feat: show both passive ability and skill in chip popup"
```

---

### Task 10: Fix swipe animation sticking at edges

**Files:**
- Modify: `public/js/ui/actions.js:152-176` (touch), `212-235` (mouse)

**Root Cause:** After the card animates to ±300px, it stays there for 200ms (the setTimeout before calling onCardSwipe). The card element is never explicitly removed or hidden. When dialogue interrupts, the next flash card can't render because the old card is still in the DOM mid-animation.

**Step 1: Increase exit distance and add opacity fade**

In both `handleTouchEnd` and `handleMouseUp`, change the commit animation:

```javascript
    if (card) {
      card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      card.style.transform = `translateX(${currentSwipeX > 0 ? 500 : -500}px) rotate(${currentSwipeX * 0.1}deg)`;
      card.style.opacity = '0';
    }
```

Change 300px → 500px (far enough off-screen) and add opacity fade to 0.

**Step 2: Clear the action area after swipe completes**

After the `setTimeout` that calls `onCardSwipe`, also clear the card container:

```javascript
    setTimeout(() => {
      if (onCardSwipe) onCardSwipe(direction);
      // Clear swiped card from DOM so dialogue can use the space
      const container = document.getElementById('flash-card-container');
      if (container) container.remove();
    }, 200);
```

**Step 3: Commit**

```bash
/usr/bin/git add public/js/ui/actions.js
/usr/bin/git commit -m "fix: swipe cards fully off-screen with opacity fade, remove from DOM after"
```

---

### Task 11: Fix flashcard — show original word with furigana on back

**Files:**
- Modify: `public/js/ui/actions.js:72-83`
- Modify: `public/game.css` (ruby styling)

**Root Cause:** `showFlashCard()` puts the word on the front only. The back shows reading + meaning but loses the original kanji.

**Step 1: Add the original word (with ruby/furigana) to the card back**

```javascript
  const wordWithFurigana = word.reading && word.reading !== word.word
    ? `<ruby>${escapeHtml(word.word)}<rt>${escapeHtml(word.reading)}</rt></ruby>`
    : escapeHtml(word.word);

  dom.actionArea.innerHTML = `
    <div class="flash-card-container" id="flash-card-container">
      <div class="flash-card" id="flash-card">
        <div class="flash-card-front">${escapeHtml(word.word)}</div>
        <div class="flash-card-back">
          <div class="flash-card-word">${wordWithFurigana}</div>
          <div class="flash-card-meaning">${escapeHtml(Array.isArray(word.meanings) ? word.meanings.join(', ') : word.meanings || '')}</div>
          <div class="flash-card-hint">&larr; didn't know &nbsp; | &nbsp; knew it &rarr;</div>
        </div>
      </div>
    </div>
  `;
```

**Step 2: Add CSS for the word-with-furigana on the back**

```css
.flash-card-word {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
}

.flash-card-word ruby rt {
  font-size: 14px;
  font-weight: 400;
  color: #666;
}
```

**Step 3: Remove the old `.flash-card-reading` div (replaced by ruby)**

The separate reading div is no longer needed since we show it as furigana above the kanji.

**Step 4: Commit**

```bash
/usr/bin/git add public/js/ui/actions.js public/game.css
/usr/bin/git commit -m "feat: show original word with furigana on flashcard back"
```

---

### Task 12: Fix settings icon to look like a gear

**Files:**
- Modify: `public/game.html:55-58`

**Root Cause:** The SVG is a sun/asterisk pattern (circle + radiating lines). Replace with a proper gear SVG.

**Step 1: Replace settings button SVG**

```html
      <button class="util-btn" id="settings-btn" aria-label="Settings">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
```

This is the Lucide "settings" gear icon — a proper cog shape with a center circle.

**Step 2: Commit**

```bash
/usr/bin/git add public/game.html
/usr/bin/git commit -m "style: replace settings icon with proper gear SVG"
```

---

### Task 13: Fix audio system not working

**Files:**
- Modify: `public/js/audio.js`
- Modify: `public/js/ui/modals.js`
- Modify: `public/game.js`

**Root Cause:** Multiple potential issues:
1. `initAudio()` uses `{ once: true }` on both click and touchstart — on mobile, touchstart fires BEFORE click, so the click listener gets removed by `{ once: true }` before `initAudio` completes.
2. The `audio` module's `initAudio()` may not be resolving correctly if called before user interaction.
3. Settings modal renders audio controls but may not be reading current values on open.

**Step 1: Fix audio initialization race condition**

In `public/game.js`, the current code:
```javascript
  document.addEventListener('click', ensureAudio, { once: true });
  document.addEventListener('touchstart', ensureAudio, { once: true });
```

The issue is that both fire `once` independently. On mobile, touchstart fires first and removes itself, but click also fires (from the same tap) and calls `ensureAudio` again. Fix by using a flag:

```javascript
  let audioInitialized = false;
  async function ensureAudio() {
    if (audioInitialized) return;
    audioInitialized = true;
    await audio.initAudio();
    document.removeEventListener('click', ensureAudio);
    document.removeEventListener('touchstart', ensureAudio);
  }
  document.addEventListener('click', ensureAudio);
  document.addEventListener('touchstart', ensureAudio);
```

Remove `{ once: true }` and use the flag instead.

**Step 2: Verify modals.js reads current audio values on open**

In `modals.js`'s `openSettings()`, after rendering the form, populate the current values:

```javascript
  document.getElementById('settings-bgm-volume').value = audio.getVolume('bgm') * 100;
  document.getElementById('settings-sfx-volume').value = audio.getVolume('sfx') * 100;
  document.getElementById('settings-audio-muted').checked = audio.isMuted();
```

This should already be happening — verify it's present.

**Step 3: Verify audio.js initAudio creates AudioContext**

Check that `initAudio()` in `audio.js`:
- Creates `AudioContext`
- Calls `audioCtx.resume()` (needed for some browsers)
- Preloads SFX buffers
- Sets initial volumes from localStorage

**Step 4: Run syntax check and test**

```bash
node --check public/js/audio.js && echo OK
node --check public/game.js && echo OK
```

**Step 5: Commit**

```bash
/usr/bin/git add public/game.js public/js/audio.js public/js/ui/modals.js
/usr/bin/git commit -m "fix: audio initialization race condition and settings population"
```

---

### Task 14: Add combat math display with chip activation effects

**Files:**
- Modify: `public/js/ui/combat-loop.js`
- Modify: `public/js/ui/actions.js`
- Modify: `public/game.css`

**Root Cause:** The combat loop shows damage numbers as floating text but doesn't display the calculation breakdown or individual chip activations. The action area (where the flash card was) is empty during the attack cycle.

**Step 1: Create a combat math display function**

In `combat-loop.js`, after executing player attack, render the math breakdown in the action area:

```javascript
function showCombatMath(result) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const lines = [];
  if (result.playerAttack) {
    const atk = result.playerAttack;
    lines.push(`Base ATK: ${atk.baseDamage || '?'}`);
    if (atk.chipEffects?.length) {
      for (const effect of atk.chipEffects) {
        lines.push(`<span class="math-chip">${effect.chipName}: ${effect.display || effect.value}</span>`);
      }
    }
    if (atk.isCrit) lines.push(`<span class="math-crit">CRITICAL!</span>`);
    lines.push(`<strong>Total: ${atk.damage}</strong>`);
  }

  actionArea.innerHTML = `
    <div class="combat-math">
      ${lines.join('<br>')}
    </div>
  `;
}
```

**Step 2: Call showCombatMath after player attack result**

In `executePlayerAttack()`, after showing damage numbers:

```javascript
  showCombatMath(result);
```

**Step 3: Show chip activations with staggered animation**

The combat-loop already shows chip effects with `showChipEffect(name)` staggered by 200ms. Enhance this to also highlight the corresponding chip circle:

```javascript
// In the chip effects display loop:
const slot = document.querySelector(`.chip-slot[data-index="${i}"]`);
if (slot) {
  slot.classList.add('chip-activating');
  setTimeout(() => slot.classList.remove('chip-activating'), 600);
}
```

**Step 4: Add CSS for combat math and chip activation**

```css
.combat-math {
  padding: 16px;
  font-size: 14px;
  line-height: 1.8;
  text-align: center;
  color: var(--text-primary);
}

.math-chip {
  color: var(--accent-blue);
  font-weight: 600;
}

.math-crit {
  color: var(--accent-orange);
  font-weight: 700;
  font-size: 16px;
}

.chip-activating {
  animation: chip-activate 0.6s ease;
}

@keyframes chip-activate {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); box-shadow: 0 0 12px var(--accent-blue); }
  100% { transform: scale(1); }
}
```

**Step 5: Verify the API response includes chip breakdown**

Check that `/api/game/combat-cycle` response includes `chipEffects` in the attack result. If not, this display will be empty and we'll need to add it server-side.

**Step 6: Commit**

```bash
/usr/bin/git add public/js/ui/combat-loop.js public/game.css
/usr/bin/git commit -m "feat: show combat math breakdown and chip activation effects in action area"
```

---

### Task 15: Add TTS to enemy narration

**Files:**
- Modify: `public/game.js:182-202`
- Check: `public/js/tts.js` (already imported as `tts`)

**Root Cause:** The mobile-ui rewrite deleted `narration.js` which had TTS calls. The new `showEnemyDialogue()` in game.js shows text via `scene.showToast()` but doesn't trigger TTS.

**Step 1: Add TTS call to showEnemyDialogue**

```javascript
function showEnemyDialogue(text, type = 'possessed') {
  if (!text) return Promise.resolve();
  enemyDialogueActive = true;

  // Speak dialogue via TTS if enabled
  if (settings.isTtsEnabled() && text) {
    tts.speakText(text);
  }

  const duration = type === 'liberated' ? 5000 : 3000;
  scene.showToast(text, duration);
  // ... rest unchanged
```

**Step 2: Verify tts module is imported and has speakText**

The import `import * as tts from './js/tts.js'` is already at line 3. Verify `tts.speakText()` exists.

**Step 3: Commit**

```bash
/usr/bin/git add public/game.js
/usr/bin/git commit -m "feat: restore TTS playback for enemy narration dialogue"
```

---

## Task Execution Order

Tasks are mostly independent. Suggested grouping:

1. **Critical visual fixes** (Tasks 1, 2, 3): backgrounds, icons, sizing
2. **Chip interaction fixes** (Tasks 6, 7, 8, 9): skill API, refresh, death, popup
3. **CSS polish** (Tasks 4, 5, 12): spacing, overflow, gear icon
4. **Card/swipe fixes** (Tasks 10, 11): animation, furigana
5. **Audio fix** (Task 13): initialization race
6. **Feature additions** (Tasks 14, 15): combat math, TTS

## Post-Fix Testing

After all fixes:
```bash
cd /Users/michia/Documents/jrpg-wt-integration
node --check public/game.js
node --check public/js/ui/chip-row.js
node --check public/js/ui/actions.js
node --check public/js/ui/combat-loop.js
node --check public/js/ui/economy.js
node --check public/js/audio.js
npm run test:unit  # 104 tests
# Manual: start server, play through a run, verify all fixes
```
