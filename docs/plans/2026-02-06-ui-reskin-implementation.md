# UI Reskin Implementation Plan: Premium Gacha Aesthetic

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete visual overhaul of all frontend UI to match Korean gacha game aesthetics (Nikke-style), transforming the current mint/cream/dark-bar theme into a pale blue-grey/white/frosted-glass premium look.

**Architecture:** Pure CSS + HTML + minimal JS changes. No backend modifications. All changes in `public/game.css`, `public/game.html`, and `public/js/ui/*.js`. The design follows the reference images in `UI Files/Inspiration/` (Nikke gacha screenshots) and the Behance mood board — soft blue-white palette, clean white panels with subtle shadows, frosted glass overlays on scene art, diamond-shaped nav icons. The existing anime.js combat effects stay intact; we restyle surfaces and chrome around them.

**Tech Stack:** CSS custom properties, backdrop-filter, system fonts, anime.js (existing), ES6 modules

**Reference Material:**
- Design spec: `docs/plans/2026-02-06-ui-reskin-design.md`
- Inspiration images: `UI Files/Inspiration/` (5 Nikke screenshots showing hub, character detail, shop, gacha, collection)
- Behance mood board: `behance-reference-fullpage.png` (color swatches: soft blues #c5d5e4, #8ea8c3, #344966, white, light grey)
- Current game screenshots: `UI Files/Game/` (15 screenshots of current state)

**Key Design Insight from References:** The Nikke UI uses an extremely restrained color scheme — backgrounds are almost white with barely-there blue-grey tint (#e8edf3 to #f5f7fa range). Character art provides ALL the color. UI chrome is white panels, hairline borders, and soft shadows. Accent cyan is used sparingly for interactive elements and speaker names. The Behance mood board confirms: muted blue-grey (#8ea8c3) as accent, off-white surfaces, clean typography.

---

## Pre-flight: Create Worktree

**Step 1: Create isolated worktree**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git worktree add ../jrpg-wt-ui-reskin -b feature/ui-reskin
cd ../jrpg-wt-ui-reskin
```

**Step 2: Verify worktree is clean**

```bash
/usr/bin/git status
/usr/bin/git log --oneline -3
```

Expected: Clean working directory on new branch from master.

---

## Task 1: CSS Foundation — Custom Properties and Base Theme

**Files:**
- Modify: `public/game.css:1-80` (`:root` block and base styles)

**Goal:** Replace all CSS custom properties with the new palette. This single change will cascade through ~60% of the UI automatically since existing components already use `var(--xxx)`.

**Step 1: Replace the `:root` custom properties**

Find the existing `:root { ... }` block (lines ~1-50 of game.css) and replace ALL color variables. The new values come from the design spec and must match the Nikke reference screenshots:

```css
:root {
  /* === NEW PALETTE: Premium Gacha Aesthetic === */

  /* Base surfaces — barely-there blue-grey, white panels */
  --bg-primary: #e8edf3;        /* Page background (was #f0f7f0 mint) */
  --bg-secondary: #f5f7fa;      /* Card/panel surface (was #fffef5 cream) */
  --bg-elevated: #ffffff;        /* Cards that pop, input fields */
  --bg-panel: #f5f7fa;           /* Alias for secondary */

  /* Text hierarchy */
  --text-primary: #2a2e35;       /* Headings, body (was #2d3436) */
  --text-secondary: #8b92a0;     /* Labels, hints (was #666) */
  --text-muted: #b0b8c4;         /* Disabled, placeholder */

  /* Accent colors — from Nikke reference */
  --accent: #4fc3f7;             /* Primary interactive cyan (was #27ae60 green) */
  --accent-cyan: #4fc3f7;        /* Speaker names, links, active icons */
  --accent-lavender: #b39ddb;    /* Secondary highlight */
  --accent-amber: #ffb74d;       /* Gold/credits, warnings */
  --accent-green: #66bb6a;       /* Success, confirmations */

  /* Borders and shadows */
  --border-subtle: rgba(0,0,0,0.06);
  --border-medium: rgba(0,0,0,0.10);
  --shadow-soft: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-elevated: 0 4px 16px rgba(0,0,0,0.10);

  /* HP bar */
  --hp-green: #66bb6a;
  --hp-yellow: #ffd54f;
  --hp-red: #ef5350;

  /* Rarity system — shifted to softer tones from reference */
  --rarity-common: #b0bec5;
  --rarity-uncommon: #66bb6a;
  --rarity-rare: #42a5f5;
  --rarity-epic: #ab47bc;
  --rarity-legendary: #ffd54f;

  /* Attack/Defend tags */
  --attack-color: #ef5350;
  --defend-color: #42a5f5;

  /* Component tokens */
  --card-radius: 12px;
  --card-radius-sm: 8px;
  --chip-size: 52px;
  --toolbar-height: 52px;

  /* Frosted glass (ONLY for overlays on scene art) */
  --glass-bg: rgba(255, 255, 255, 0.82);
  --glass-blur: blur(12px);

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-med: 0.25s ease;
  --transition-slow: 0.3s ease;

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-weight-bold: 700;
  --font-weight-semi: 600;
  --font-weight-regular: 400;
}
```

**Step 2: Update base element styles**

Update `body`, `.game-app`, and base resets to use new variables:

```css
body {
  margin: 0;
  padding: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: var(--font-weight-regular);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  height: 100dvh;
}

.game-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 430px;
  margin: 0 auto;
  background: var(--bg-primary);
  position: relative;
  overflow: hidden;
}
```

**Step 3: Syntax check**

```bash
node -e "const fs = require('fs'); const css = fs.readFileSync('public/game.css','utf8'); console.log('CSS length:', css.length, 'bytes - OK')"
```

**Step 4: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "feat(ui): replace CSS custom properties with premium gacha palette"
```

---

## Task 2: Scene Area and Narration Box Restyle

**Files:**
- Modify: `public/game.css` — `.scene-area`, `#narration-box`, `#enemy-info`, `#enemy-hp-bar` styles
- Modify: `public/game.html` — narration indicator change (▼ → chevron)

**Goal:** Transform the dark semi-transparent narration bar into a white frosted bubble. Restyle enemy info as frosted pill badge. Keep scene area at 38vh initially.

**Step 1: Restyle `.scene-area`**

The scene area container itself stays at 38vh but needs updated overflow and background handling:

```css
.scene-area {
  position: relative;
  height: 38vh;
  min-height: 240px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--bg-primary);
}
```

**Step 2: Restyle `#narration-box`**

Replace the current dark semi-transparent bar (black bg, orange speaker, white text) with a white frosted bubble:

```css
#narration-box {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 16px;
  padding: 12px 16px;
  box-shadow: var(--shadow-elevated);
  opacity: 0;
  transform: translateY(10px);
  transition: opacity var(--transition-med), transform var(--transition-med);
  pointer-events: none;
  z-index: 10;
}

#narration-box.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

#narration-speaker {
  font-size: 12px;
  font-weight: var(--font-weight-semi);
  color: var(--accent-cyan);
  margin-bottom: 4px;
  letter-spacing: 0.02em;
}

#narration-text {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.narration-indicator {
  text-align: right;
  color: var(--text-muted);
  font-size: 10px;
  margin-top: 4px;
  animation: narration-pulse 1.5s ease-in-out infinite;
}

@keyframes narration-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
```

**Step 3: Restyle enemy info as frosted pill**

```css
#enemy-info {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 20px;
  padding: 6px 16px;
  box-shadow: var(--shadow-soft);
  text-align: center;
  z-index: 5;
  opacity: 0;
  transition: opacity var(--transition-med);
}

#enemy-info.visible {
  opacity: 1;
}

#enemy-name {
  font-size: 14px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}

#enemy-hp-bar {
  width: 160px;
  height: 10px;
  background: rgba(0,0,0,0.08);
  border-radius: 5px;
  margin: 4px auto 0;
  overflow: hidden;
  position: relative;
}

#enemy-hp-fill {
  height: 100%;
  background: var(--hp-red);
  border-radius: 5px;
  transition: width 0.3s ease;
}

#enemy-hp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: var(--font-weight-semi);
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
```

**Step 4: Update narration indicator in game.html**

In `public/game.html`, find the narration indicator `▼` and replace with a CSS chevron:

```html
<div class="narration-indicator">&#9660;</div>
```

Change to:

```html
<div class="narration-indicator">&#8964;</div>
```

(Or keep ▼ but with the new muted styling — the CSS change above already handles color.)

**Step 5: Syntax check and commit**

```bash
node --check public/js/ui/narration-box.js && echo "OK"
/usr/bin/git add public/game.css public/game.html
/usr/bin/git commit -m "feat(ui): restyle narration box and enemy info with frosted glass"
```

---

## Task 3: Status Strip — Chip Row and HP Bar

**Files:**
- Modify: `public/game.css` — `#chip-row`, `.chip-slot`, `.chip-icon`, charge indicators, `.player-hp-*` styles
- Modify: `public/js/ui/chip-row.js:~80-180` — Change circle slots to rounded-rect tiles, replace segment charge bar with dots

**Goal:** Transform circular chip slots with segment charge bars into rounded-rectangle tiles with dot charge indicators. Add frosted glass strip background.

**Step 1: Restyle chip row container with frosted glass**

```css
#chip-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
```

**Step 2: Transform chip slots from circles to rounded rectangles**

In `chip-row.js`, find the `render()` function where it generates slot HTML. Currently creates circular icons (56px circles with `border-radius: 50%`).

Change the slot rendering to produce:
- 52x52px rounded rectangles (`border-radius: 8px`)
- 2px rarity-colored border (using new `--rarity-*` variables)
- For empty slots: outlined rectangle with faint "+" icon
- Bot sprite icon centered, `object-fit: cover`

The CSS for chip slots:

```css
.chip-slot {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  cursor: pointer;
}

.chip-icon {
  width: 100%;
  height: 100%;
  border-radius: var(--card-radius-sm);
  border: 2px solid var(--border-subtle);
  background: var(--bg-elevated);
  object-fit: cover;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

/* Rarity borders on chip icons */
.chip-icon.rarity-common { border-color: var(--rarity-common); }
.chip-icon.rarity-uncommon { border-color: var(--rarity-uncommon); }
.chip-icon.rarity-rare { border-color: var(--rarity-rare); }
.chip-icon.rarity-epic { border-color: var(--rarity-epic); }
.chip-icon.rarity-legendary {
  border-color: var(--rarity-legendary);
}

/* Fully charged glow */
.chip-icon.fully-charged {
  animation: chip-glow-pulse 1.5s ease-in-out infinite;
}

@keyframes chip-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 8px 2px var(--rarity-legendary); }
}

/* Empty slot placeholder */
.chip-slot-empty {
  width: 100%;
  height: 100%;
  border-radius: var(--card-radius-sm);
  border: 2px dashed var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 18px;
  background: rgba(255,255,255,0.5);
}
```

**Step 3: Replace charge segment bar with dots**

Currently charge is shown as 5 horizontal segments below each chip. Replace with 5 small dots:

```css
.chip-charge-dots {
  display: flex;
  justify-content: center;
  gap: 3px;
  margin-top: 3px;
}

.chip-charge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-subtle);
  transition: background var(--transition-fast);
}

.chip-charge-dot.filled {
  background: var(--accent-amber);
}
```

**Step 4: Update chip-row.js render function**

In `public/js/ui/chip-row.js`, modify the `render()` function. Find where it builds HTML for each slot and change:
- Icon wrapper: Remove `border-radius: 50%` inline styles, add `rarity-${chip.rarity}` class
- Charge indicator: Replace the 5-segment bar HTML with dot HTML
- Empty slots: Show `<div class="chip-slot-empty">+</div>` instead of dashed circle
- Level badge: Keep but restyle as small pill on top-left

The key rendering change in JS (find the loop that builds slots):

```javascript
// For each slot, generate:
// Filled:
`<div class="chip-slot" data-index="${i}">
  <img class="chip-icon rarity-${chip.rarity}${fullyCharged ? ' fully-charged' : ''}"
    src="/assets/icons/chips/${chip.itemId || chip.id}.webp"
    alt="${chip.nameEn || chip.name}">
  ${level > 1 ? `<div class="chip-level-badge">${level}</div>` : ''}
  <div class="chip-charge-dots">
    ${Array.from({length: maxCharge}, (_, j) =>
      `<div class="chip-charge-dot${j < currentCharge ? ' filled' : ''}"></div>`
    ).join('')}
  </div>
</div>`

// Empty:
`<div class="chip-slot">
  <div class="chip-slot-empty">+</div>
</div>`
```

**Step 5: Restyle player HP bar**

```css
.player-hp-container {
  padding: 0 12px 6px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

#player-hp-bar {
  height: 14px;
  background: rgba(0,0,0,0.06);
  border-radius: 7px;
  overflow: hidden;
  position: relative;
}

#player-hp-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

#player-hp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: var(--font-weight-semi);
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
```

**Step 6: Syntax check and commit**

```bash
node --check public/js/ui/chip-row.js && echo "OK"
node --check public/js/ui/hp-bar.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/chip-row.js public/js/ui/hp-bar.js
/usr/bin/git commit -m "feat(ui): restyle chip row as rounded tiles with charge dots and frosted HP bar"
```

---

## Task 4: Action Area — Buttons and Layout

**Files:**
- Modify: `public/game.css` — `#action-area`, `.action-btn`, button variants
- Modify: `public/js/ui/exploration.js:~40-120` — Hub renders 2 buttons instead of 3
- Modify: `public/js/ui/actions.js:~30-80` — Button generation

**Goal:** Restyle the action area background and all buttons. Hub goes from 3 buttons (速習, ボット装備, 潜入) to 2 buttons (速習, 潜入). Buttons become white rounded-rect cards with soft shadows.

**Step 1: Restyle action area container**

```css
#action-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-primary);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

**Step 2: Restyle buttons as white cards**

```css
.action-btn {
  width: 100%;
  max-width: 340px;
  padding: 14px 0;
  border: none;
  border-radius: var(--card-radius);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: var(--font-weight-semi);
  font-family: var(--font-family);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.action-btn:active {
  transform: scale(0.96);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

/* Primary variant for key CTAs */
.action-btn-primary {
  background: var(--accent-cyan);
  color: white;
}

.action-btn-primary:active {
  background: #39b0e4;
}

/* Danger variant */
.action-btn-danger {
  background: var(--bg-elevated);
  color: var(--hp-red);
}

/* Disabled state */
.action-btn:disabled,
.action-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

**Step 3: Update hub button rendering in exploration.js**

In `public/js/ui/exploration.js`, find `renderHub()`. Currently it renders 3 buttons: 速習, ボット装備, 潜入. Remove ボット装備 (it moves to the toolbar). Keep 速習 and 潜入 only.

Find the innerHTML assignment in renderHub and change to 2 buttons:

```javascript
dom.actionArea.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px;">
    <button class="action-btn" id="hub-speed-review">速習</button>
    <button class="action-btn" id="hub-infiltrate">潜入</button>
  </div>
`;
```

Remove the ボット装備 button and its click handler. The Bots icon in the toolbar (Task 8) will handle that.

**Step 4: Syntax check and commit**

```bash
node --check public/js/ui/exploration.js && echo "OK"
node --check public/js/ui/actions.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/exploration.js public/js/ui/actions.js
/usr/bin/git commit -m "feat(ui): restyle action area buttons as white cards, hub to 2 buttons"
```

---

## Task 5: Combat Flashcards Restyle

**Files:**
- Modify: `public/game.css` — `.flash-card`, `.dual-card`, attack/defend card styles
- Modify: `public/js/ui/actions.js:~150-350` — Dual card rendering

**Goal:** Restyle combat flashcards to white cards with action-label pill tags (ATTACK = soft red, DEFEND = soft blue). Both cards always visible, ~90-100px tall each, stacked vertically with 8px gap.

**Step 1: Restyle dual flashcard layout**

```css
/* Dual card container */
.dual-card-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 340px;
}

/* Individual card */
.flash-card {
  position: relative;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  padding: 12px 16px;
  min-height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.flash-card:active {
  transform: scale(0.98);
}

/* Action label pills */
.flash-card-label {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 11px;
  font-weight: var(--font-weight-semi);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.flash-card-label.attack {
  background: var(--attack-color);
}

.flash-card-label.defend {
  background: var(--defend-color);
}

/* Card front — Japanese word */
.flash-card-front {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

/* Card back — revealed content */
.flash-card-back {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.flash-card-back .reading {
  font-size: 14px;
  color: var(--text-secondary);
}

.flash-card-back .meaning {
  font-size: 14px;
  color: var(--text-primary);
}

.flash-card-back .grade-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Swipe feedback */
.flash-card.swiping-right {
  background: rgba(102, 187, 106, 0.08);
}

.flash-card.swiping-left {
  background: rgba(239, 83, 80, 0.08);
}

/* Selected state — card is being reviewed */
.flash-card.selected {
  box-shadow: var(--shadow-elevated);
  border: 2px solid var(--accent-cyan);
}
```

**Step 2: Update dual card HTML generation in actions.js**

In `public/js/ui/actions.js`, find `showDualFlashCards()`. Update the HTML template to use the new classes. Each card gets a label pill:

```javascript
const html = `
  <div class="dual-card-container">
    <div class="flash-card" id="attack-card" data-action="attack">
      <span class="flash-card-label attack">ATTACK</span>
      <div class="flash-card-front">${attackWord.word}</div>
      <div class="flash-card-back">
        <div class="reading">${attackWord.reading || ''}</div>
        <div class="meaning">${attackWord.meanings?.slice(0,3).join(', ') || ''}</div>
        <div class="grade-hint">← didn't know | knew it →</div>
      </div>
    </div>
    <div class="flash-card" id="defend-card" data-action="defend">
      <span class="flash-card-label defend">DEFEND</span>
      <div class="flash-card-front">${defendWord.word}</div>
      <div class="flash-card-back">
        <div class="reading">${defendWord.reading || ''}</div>
        <div class="meaning">${defendWord.meanings?.slice(0,3).join(', ') || ''}</div>
        <div class="grade-hint">← didn't know | knew it →</div>
      </div>
    </div>
  </div>
`;
```

Keep the tap-to-select and swipe-to-grade interaction logic unchanged — only restyle the HTML/CSS.

**Step 3: Syntax check and commit**

```bash
node --check public/js/ui/actions.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/actions.js
/usr/bin/git commit -m "feat(ui): restyle combat flashcards as white stacked cards with action pills"
```

---

## Task 6: Combat Pipeline and Damage Numbers

**Files:**
- Modify: `public/game.css` — `.pipeline-stats`, `.stat-box`, `.damage-number`, tier classes
- Modify: `public/js/ui/combat-effects.js:~20-40` — Update tier color constants
- Modify: `public/js/ui/scene.js:~180-230` — Player damage number positioning

**Goal:** Restyle pipeline stat boxes and damage numbers to match the new palette. Move enemy-to-player damage to float from HP bar area instead of center of action area.

**Step 1: Restyle pipeline stat boxes**

```css
.pipeline-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 0;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
  padding: 8px 12px;
  border-radius: var(--card-radius-sm);
  background: var(--bg-elevated);
  border: 2px solid var(--accent-cyan);
  box-shadow: var(--shadow-soft);
}

.stat-box.damage {
  border-color: var(--accent-amber);
}

.stat-box-label {
  font-size: 10px;
  font-weight: var(--font-weight-semi);
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.stat-box-value {
  font-size: 24px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pipeline-operator {
  font-size: 16px;
  color: var(--text-secondary);
  font-weight: var(--font-weight-semi);
}

.pipeline-log {
  text-align: left;
  font-size: 12px;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px 16px;
}

.pipeline-log-line {
  padding: 2px 0;
  color: var(--text-primary);
}

.pipeline-log-line.heal { color: var(--accent-green); }
.pipeline-log-line.sacrifice { color: var(--hp-red); }
.pipeline-log-line.no-trigger { color: var(--text-secondary); font-style: italic; }
```

**Step 2: Update damage number tier styles**

```css
.damage-number {
  position: absolute;
  font-weight: var(--font-weight-bold);
  pointer-events: none;
  z-index: 50;
  animation: damage-float 1s ease-out forwards;
}

/* Tier 0: Chip damage */
.damage-number.dmg-chip {
  font-size: 18px;
  color: var(--text-secondary);
}

/* Tier 1: Normal */
.damage-number.dmg-normal {
  font-size: 24px;
  color: var(--hp-red);
}

/* Tier 2: Solid */
.damage-number.dmg-solid {
  font-size: 28px;
  color: var(--accent-cyan);
  text-shadow: 0 0 8px rgba(79, 195, 247, 0.5);
}

/* Tier 3: Big */
.damage-number.dmg-big {
  font-size: 32px;
  color: var(--accent-cyan);
  text-shadow: 0 0 12px rgba(79, 195, 247, 0.7);
  animation: damage-pop 1.2s ease-out forwards;
}

/* Tier 4: Massive */
.damage-number.dmg-massive {
  font-size: 38px;
  color: var(--accent-amber);
  text-shadow: 0 0 16px rgba(255, 183, 77, 0.8), 0 0 32px rgba(255, 183, 77, 0.4);
  animation: damage-massive 1.5s ease-out forwards;
}

.damage-number.heal {
  color: var(--accent-green);
}
```

**Step 3: Relocate player-hit damage to float from HP bar**

In `public/js/ui/scene.js`, find `showDamageNumber()`. When the damage is to the player (check for `isPlayerDamage` option or when called from `playerHitEffect`), position the number near the HP bar instead of scene center.

In `combat-loop.js`, find where enemy damage is displayed to the player. The damage number should be spawned at the HP bar's position and float upward.

**Step 4: Update combat-effects.js tier colors**

In `combat-effects.js`, find the CONFIG object with particle colors. Update:
- Tier 0: `#b0bec5` (grey)
- Tier 1: `#ef5350` (red)
- Tier 2-3: `#4fc3f7` (cyan)
- Tier 4: `#ffb74d` (amber/gold)

**Step 5: Syntax check and commit**

```bash
node --check public/js/ui/combat-effects.js && echo "OK"
node --check public/js/ui/scene.js && echo "OK"
node --check public/js/ui/combat-loop.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/combat-effects.js public/js/ui/scene.js public/js/ui/combat-loop.js
/usr/bin/git commit -m "feat(ui): restyle pipeline stats, damage numbers, and relocate player damage"
```

---

## Task 7: Exploration Screens — Level Select, Wards, Branch, Shrine, Quiz

**Files:**
- Modify: `public/game.css` — Level select cards, ward cards, branch cards, shrine cards, quiz styles
- Modify: `public/js/ui/exploration.js` — Minor HTML template updates for new classes

**Goal:** Restyle all exploration screens (level select, ward choice, branch doors, shrine upgrade, quiz) to use white card styling with the new palette.

**Step 1: Level select cards**

```css
.level-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  margin-bottom: 8px;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.level-card:active {
  transform: scale(0.98);
}

.level-card.level-locked {
  opacity: 0.5;
  pointer-events: none;
}

.level-card.level-completed {
  border-left: 3px solid var(--accent-green);
}

.level-card.level-unlocked {
  border-left: 3px solid var(--accent-cyan);
}

.level-number {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  min-width: 28px;
}

.level-name {
  flex: 1;
}

.level-name-jp {
  font-size: 15px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}

.level-name-en {
  font-size: 12px;
  color: var(--text-secondary);
}

.level-status {
  font-size: 13px;
  font-weight: var(--font-weight-semi);
}

.level-status.completed { color: var(--accent-green); }
.level-status.new { color: var(--accent-cyan); }
.level-status.locked { color: var(--text-muted); }
```

**Step 2: Ward selection cards**

```css
.ward-card {
  padding: 14px 16px;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  margin-bottom: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}

.ward-card:active {
  transform: scale(0.98);
}

.ward-card.selected {
  border-color: var(--accent-cyan);
  box-shadow: var(--shadow-elevated);
}

.ward-card-name {
  font-size: 15px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}

.ward-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

**Step 3: Branch selection (door choice) cards**

```css
.branch-card {
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  text-align: center;
  font-size: 14px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
  transition: transform var(--transition-fast);
}

.branch-card:active {
  transform: scale(0.97);
}
```

**Step 4: Shrine upgrade cards**

```css
.shrine-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  margin-bottom: 8px;
  cursor: pointer;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.shrine-card:active {
  transform: scale(0.98);
}

.shrine-card.disabled {
  opacity: 0.4;
  pointer-events: none;
}

.shrine-level-up {
  font-size: 13px;
  color: var(--accent-amber);
  font-weight: var(--font-weight-semi);
}
```

**Step 5: Quiz answer cards**

```css
.quiz-option {
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
  border: 2px solid transparent;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.quiz-option:active {
  transform: scale(0.98);
}

.quiz-option.correct {
  border-color: var(--accent-green);
  background: rgba(102, 187, 106, 0.08);
}

.quiz-option.incorrect {
  border-color: var(--hp-red);
  background: rgba(239, 83, 80, 0.08);
}

.quiz-option.unchosen {
  opacity: 0.4;
}
```

**Step 6: Update exploration.js HTML templates**

Go through `exploration.js` and update the HTML templates in `renderLevelSelect()`, `renderWardSelection()`, `renderBranchSelection()`, `renderShrine()`, and `renderQuiz()` to use the new class names defined above. The structural changes are minimal — mainly adding the new CSS classes to existing elements.

**Step 7: Syntax check and commit**

```bash
node --check public/js/ui/exploration.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/exploration.js
/usr/bin/git commit -m "feat(ui): restyle all exploration screens with white card styling"
```

---

## Task 8: Toolbar Restructure (6 Icons → 3 + Menu)

**Files:**
- Modify: `public/game.html:~230-247` — Restructure utility row
- Modify: `public/game.css` — New toolbar and slide-up menu styles
- Modify: `public/js/ui/modals.js` — Add menu panel functionality
- Modify: `public/game.js` — Wire up new toolbar event handlers

**Goal:** Replace 6 always-visible icon buttons with 3 icons (Lookup, Bots, Menu). Menu hamburger opens a slide-up sheet containing Settings, Leaderboard, Reset Run, Bug Report, Logout.

**Step 1: Restructure utility row HTML in game.html**

Replace the current 6-button utility row with 3 buttons:

```html
<div class="mini-toolbar" id="mini-toolbar">
  <button class="toolbar-btn" id="lookup-btn" aria-label="Lookup">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  </button>
  <button class="toolbar-btn" id="bots-btn" aria-label="Bots">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  </button>
  <button class="toolbar-btn" id="menu-btn" aria-label="Menu">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
</div>

<!-- Menu slide-up sheet -->
<div class="menu-backdrop" id="menu-backdrop"></div>
<div class="menu-sheet" id="menu-sheet">
  <div class="menu-handle"></div>
  <button class="menu-item" id="menu-settings">
    <span class="menu-icon">⚙</span> Settings
  </button>
  <button class="menu-item" id="menu-leaderboard">
    <span class="menu-icon">🏆</span> Leaderboard
  </button>
  <button class="menu-item" id="menu-reset-run">
    <span class="menu-icon">✕</span> Reset Run
  </button>
  <button class="menu-item" id="menu-bug-report">
    <span class="menu-icon">🐛</span> Bug Report
  </button>
  <button class="menu-item menu-item-danger" id="menu-logout">
    <span class="menu-icon">→</span> Logout
  </button>
</div>
```

**Step 2: Style the new toolbar and menu**

```css
/* Mini toolbar */
.mini-toolbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: var(--toolbar-height);
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-subtle);
  padding-bottom: env(safe-area-inset-bottom);
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 12px;
  transition: color var(--transition-fast), background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.toolbar-btn:active {
  background: rgba(0,0,0,0.04);
}

.toolbar-btn.active {
  color: var(--accent-cyan);
}

/* Menu slide-up sheet */
.menu-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-med);
}

.menu-backdrop.visible {
  opacity: 1;
  pointer-events: auto;
}

.menu-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 430px;
  margin: 0 auto;
  background: var(--bg-elevated);
  border-radius: 16px 16px 0 0;
  box-shadow: var(--shadow-elevated);
  z-index: 101;
  transform: translateY(100%);
  transition: transform var(--transition-med);
  padding: 8px 0 calc(16px + env(safe-area-inset-bottom));
}

.menu-sheet.visible {
  transform: translateY(0);
}

.menu-handle {
  width: 36px;
  height: 4px;
  background: var(--border-medium);
  border-radius: 2px;
  margin: 8px auto 16px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
  font-family: var(--font-family);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.menu-item:active {
  background: rgba(0,0,0,0.04);
}

.menu-item-danger {
  color: var(--hp-red);
}

.menu-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}
```

**Step 3: Add menu open/close logic in modals.js**

Add to `public/js/ui/modals.js`:

```javascript
// Menu sheet management
let menuSheet = null;
let menuBackdrop = null;

export function initMenu() {
  menuSheet = document.getElementById('menu-sheet');
  menuBackdrop = document.getElementById('menu-backdrop');

  menuBackdrop?.addEventListener('click', closeMenu);
  document.getElementById('menu-btn')?.addEventListener('click', toggleMenu);
}

export function toggleMenu() {
  if (menuSheet?.classList.contains('visible')) {
    closeMenu();
  } else {
    openMenu();
  }
}

export function openMenu() {
  menuSheet?.classList.add('visible');
  menuBackdrop?.classList.add('visible');
}

export function closeMenu() {
  menuSheet?.classList.remove('visible');
  menuBackdrop?.classList.remove('visible');
}
```

**Step 4: Wire up menu items in game.js**

In `public/game.js`, find where the utility row click handlers are set up. Update to use the new menu item IDs:
- `#menu-settings` → open settings
- `#menu-leaderboard` → open leaderboard
- `#menu-reset-run` → reset run
- `#menu-bug-report` → open bug report
- `#menu-logout` → logout
- `#bots-btn` → open chip equip (was the ボット装備 hub button)

Each menu item click should also call `modals.closeMenu()` before performing its action.

**Step 5: Remove old utility-row CSS**

Delete or comment out the old `.utility-row` and `#settings-btn`, `#leaderboard-btn`, `#reset-run-btn`, `#logout-btn`, `#bug-report-btn` styles from game.css.

**Step 6: Syntax check and commit**

```bash
node --check public/js/ui/modals.js && echo "OK"
node --check public/game.js && echo "OK"
/usr/bin/git add public/game.css public/game.html public/js/ui/modals.js public/game.js
/usr/bin/git commit -m "feat(ui): restructure toolbar to 3 icons + slide-up menu sheet"
```

---

## Task 9: Chip Select (Shop) and Chip Popup Restyle

**Files:**
- Modify: `public/game.css` — `.chip-select-*`, `#chip-popup` styles
- Modify: `public/js/ui/chip-select.js:~70-170` — Card template update
- Modify: `public/js/ui/chip-row.js:~100-160` — Popup template update

**Goal:** Restyle the post-combat shop card and the in-combat chip popup to match the new palette.

**Step 1: Restyle chip select (shop) card**

```css
.chip-select-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 340px;
}

.chip-select-credits {
  font-size: 13px;
  font-weight: var(--font-weight-semi);
  color: var(--accent-amber);
}

.chip-select-card {
  position: relative;
  width: 100%;
  background: var(--bg-elevated);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-soft);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 180px;
  border: 2px solid var(--border-subtle);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.chip-select-price-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 12px;
  font-weight: var(--font-weight-semi);
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid;
}

.chip-select-price-badge.affordable {
  color: var(--accent-green);
  border-color: var(--accent-green);
  background: rgba(102, 187, 106, 0.08);
}

.chip-select-price-badge.expensive {
  color: var(--hp-red);
  border-color: var(--hp-red);
  background: rgba(239, 83, 80, 0.08);
}

.chip-select-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chip-select-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--card-radius-sm);
  background-size: cover;
  background-position: center;
  border: 2px solid var(--border-subtle);
}

.chip-select-name {
  font-size: 16px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}

.chip-select-rarity {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chip-select-rarity.common { color: var(--rarity-common); }
.chip-select-rarity.uncommon { color: var(--rarity-uncommon); }
.chip-select-rarity.rare { color: var(--rarity-rare); }
.chip-select-rarity.epic { color: var(--rarity-epic); }
.chip-select-rarity.legendary { color: var(--rarity-legendary); }

.chip-stat-row {
  display: flex;
  gap: 8px;
}

.chip-stat-box {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 13px;
  font-weight: var(--font-weight-semi);
}

.chip-stat-box.pwr { border-color: var(--hp-red); color: var(--hp-red); }
.chip-stat-box.bw { border-color: var(--accent-cyan); color: var(--accent-cyan); }
.chip-stat-box.hp { border-color: var(--accent-green); color: var(--accent-green); }

.chip-stat-label {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.7;
}

.chip-select-label {
  font-size: 11px;
  font-weight: var(--font-weight-semi);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chip-select-desc {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.chip-select-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.chip-select-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-subtle);
}

.chip-select-dot.active {
  background: var(--accent-cyan);
}

.chip-select-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.chip-select-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.chip-select-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: var(--font-weight-semi);
  font-family: var(--font-family);
  cursor: pointer;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
  background: var(--accent-cyan);
  color: white;
}

.chip-select-btn:active {
  transform: scale(0.96);
}

.chip-select-btn.chip-select-refresh {
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.chip-select-btn.chip-select-skip {
  background: var(--bg-panel);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}

.chip-select-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

**Step 2: Restyle chip popup (in-combat)**

```css
#chip-popup {
  position: fixed;
  background: var(--bg-elevated);
  border-radius: 16px;
  box-shadow: var(--shadow-elevated);
  padding: 16px;
  z-index: 60;
  min-width: 200px;
  max-width: 280px;
}

.chip-popup-name {
  font-size: 16px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}

.chip-popup-level {
  font-size: 12px;
  color: var(--text-secondary);
}

.chip-popup-stats {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}

.chip-popup-section-label {
  font-size: 11px;
  font-weight: var(--font-weight-semi);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 8px;
}

.chip-popup-desc {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.chip-popup-charge {
  font-size: 12px;
  color: var(--accent-amber);
  font-weight: var(--font-weight-semi);
  margin-top: 4px;
}

.chip-popup-buttons {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.chip-popup-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: var(--font-weight-semi);
  font-family: var(--font-family);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.chip-popup-btn:active {
  transform: scale(0.96);
}

.chip-popup-btn.swap {
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.chip-popup-btn.use-skill {
  background: var(--accent-cyan);
  color: white;
}

.chip-popup-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

**Step 3: Syntax check and commit**

```bash
node --check public/js/ui/chip-select.js && echo "OK"
node --check public/js/ui/chip-row.js && echo "OK"
/usr/bin/git add public/game.css public/js/ui/chip-select.js public/js/ui/chip-row.js
/usr/bin/git commit -m "feat(ui): restyle chip shop and chip popup with new palette"
```

---

## Task 10: Takeover Panels — Slide-Up Instead of Right-Slide

**Files:**
- Modify: `public/game.css` — `.takeover` base styles change direction
- Modify: `public/js/ui/takeover.js` — No JS changes needed (CSS handles animation)

**Goal:** Change all takeover panels from sliding in from the right (`translateX(100%)`) to sliding up from the bottom (`translateY(100%)`). This matches the modern mobile sheet pattern visible in the Nikke reference (shop tabs, character details).

**Step 1: Update takeover CSS**

```css
.takeover {
  position: fixed;
  inset: 0;
  max-width: 430px;
  margin: 0 auto;
  background: var(--bg-primary);
  z-index: 50;
  transform: translateY(100%);
  transition: transform var(--transition-slow);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-top: 20px;
  padding-bottom: env(safe-area-inset-bottom);
}

.takeover.active {
  transform: translateY(0);
}

.takeover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.takeover-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-panel);
  border-radius: 50%;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.takeover-close:active {
  background: var(--border-subtle);
}

.takeover-content {
  padding: 16px;
}
```

**Step 2: Restyle settings form in takeover**

```css
.settings-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: var(--font-weight-semi);
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.settings-input {
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--card-radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-family);
  outline: none;
  transition: border-color var(--transition-fast);
}

.settings-input:focus {
  border-color: var(--accent-cyan);
}

.settings-range {
  width: 100%;
  accent-color: var(--accent-cyan);
}
```

**Step 3: Syntax check and commit**

```bash
node --check public/js/ui/takeover.js && echo "OK"
/usr/bin/git add public/game.css
/usr/bin/git commit -m "feat(ui): change takeover panels to slide-up sheets, restyle settings"
```

---

## Task 11: Chip Equip View — Slide-Up Panel Conversion

**Files:**
- Modify: `public/game.css` — Chip equip grid styles
- Modify: `public/game.html` — Update chip-equip-view structure if needed
- Modify: `public/game.js` — Wire bots-btn to chip equip

**Goal:** The chip equip view (currently slides from right) should now function as a slide-up panel. Restyle the equipped slots as larger tiles (72x72px) with an inventory grid below.

**Step 1: Restyle chip equip content**

```css
.chip-equip-slots {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 16px;
}

.chip-equip-slot {
  width: 72px;
  height: 72px;
  border-radius: var(--card-radius);
  border: 2px solid var(--border-subtle);
  background: var(--bg-panel);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.chip-equip-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: calc(var(--card-radius) - 2px);
}

.chip-equip-slot.empty {
  border-style: dashed;
  color: var(--text-muted);
  font-size: 24px;
}

.chip-inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
  padding: 16px;
}

.chip-inventory-item {
  width: 64px;
  height: 64px;
  border-radius: var(--card-radius-sm);
  border: 2px solid var(--border-subtle);
  background: var(--bg-elevated);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}

.chip-inventory-item:active {
  transform: scale(0.95);
}

.chip-inventory-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

**Step 2: Wire bots toolbar button**

In `public/game.js`, add click handler for `#bots-btn` that opens the chip equip takeover:

```javascript
document.getElementById('bots-btn')?.addEventListener('click', () => {
  ui.modals.closeMenu(); // Close menu if open
  ui.takeover.open('chipEquip');
  // ... render chip equip content (existing logic from ボット装備 button)
});
```

**Step 3: Syntax check and commit**

```bash
node --check public/game.js && echo "OK"
/usr/bin/git add public/game.css public/game.html public/game.js
/usr/bin/git commit -m "feat(ui): convert chip equip to slide-up panel with grid layout"
```

---

## Task 12: Auth Screen, Speed Review, Game Over Restyle

**Files:**
- Modify: `public/game.css` — Auth, speed review, game over styles

**Goal:** Restyle remaining screens (auth login, speed review, game over) to match the new palette.

**Step 1: Auth screen**

```css
.auth-screen {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.auth-container {
  width: 320px;
  max-width: 90%;
  background: var(--bg-elevated);
  border-radius: 16px;
  box-shadow: var(--shadow-elevated);
  padding: 32px 24px;
}

.auth-title {
  font-size: 24px;
  font-weight: var(--font-weight-bold);
  color: var(--accent-cyan);
  text-align: center;
  margin-bottom: 24px;
}

.auth-tabs {
  display: flex;
  gap: 0;
  border: 2px solid var(--accent-cyan);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
}

.auth-tab {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--accent-cyan);
  font-weight: var(--font-weight-semi);
  font-size: 14px;
  font-family: var(--font-family);
  cursor: pointer;
}

.auth-tab.active {
  background: var(--accent-cyan);
  color: white;
}
```

**Step 2: Speed review restyling**

Update speed review header and card colors to use new variables:

```css
.speed-review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
}

.speed-review-count {
  font-size: 14px;
  font-weight: var(--font-weight-semi);
  color: var(--text-primary);
}
```

**Step 3: Game over panel**

```css
.gameover-content {
  text-align: center;
  padding: 32px 16px;
}

.gameover-title {
  font-size: 22px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: 16px;
}

.gameover-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.gameover-stat {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-panel);
  border-radius: var(--card-radius-sm);
}
```

**Step 4: Syntax check and commit**

```bash
node -e "const fs = require('fs'); const css = fs.readFileSync('public/game.css','utf8'); console.log('CSS length:', css.length, 'bytes - OK')"
/usr/bin/git add public/game.css
/usr/bin/git commit -m "feat(ui): restyle auth, speed review, and game over screens"
```

---

## Task 13: CSS Cleanup — Remove Old Styles and Dead Code

**Files:**
- Modify: `public/game.css` — Remove superseded styles

**Goal:** Remove all old styles that have been replaced. Search for and remove any remaining references to the old palette colors (#f0f7f0, #fffef5, #27ae60 as accent, #f39c12 as accent-orange, etc.).

**Step 1: Search for old color references**

```bash
grep -n '#f0f7f0\|#fffef5\|#27ae60\|#f39c12\|mint\|cream' public/game.css
```

Remove or replace any found instances.

**Step 2: Remove old utility-row styles**

Delete CSS rules for `.utility-row`, `#settings-btn`, `#leaderboard-btn`, `#reset-run-btn`, `#logout-btn`, `#bug-report-btn` that are no longer used.

**Step 3: Remove old charge-segment styles**

Delete CSS for `.chip-charge-bar`, `.chip-charge-segment`, `.chip-charge-segment.filled` if they exist.

**Step 4: Verify no duplicate rules**

Look for duplicate selectors in game.css and consolidate.

**Step 5: Commit**

```bash
/usr/bin/git add public/game.css
/usr/bin/git commit -m "refactor(ui): remove old palette colors and dead CSS rules"
```

---

## Task 14: Smoke Test — Visual Verification

**Goal:** Start the dev server, load the game in a browser, and verify each screen renders correctly with the new theme.

**Step 1: Start server**

```bash
cd /Users/michia/Documents/jrpg-wt-ui-reskin
npm start &
sleep 3
```

**Step 2: Syntax check all modified JS files**

```bash
node --check public/js/ui/narration-box.js && \
node --check public/js/ui/chip-row.js && \
node --check public/js/ui/hp-bar.js && \
node --check public/js/ui/exploration.js && \
node --check public/js/ui/actions.js && \
node --check public/js/ui/combat-loop.js && \
node --check public/js/ui/combat-effects.js && \
node --check public/js/ui/scene.js && \
node --check public/js/ui/chip-select.js && \
node --check public/js/ui/takeover.js && \
node --check public/js/ui/modals.js && \
node --check public/game.js && \
echo "ALL JS FILES OK"
```

**Step 3: Run E2E tests**

```bash
./scripts/e2e-test.sh
```

Expected: 60+/66 tests pass (some may need UI selector updates).

**Step 4: Fix any test failures**

If tests fail due to changed selectors (e.g., looking for old `.utility-row` buttons), update the test selectors to match the new HTML structure.

**Step 5: Take screenshots for review**

Navigate through all screens in the browser and take screenshots:
- Hub (home)
- Level select
- Ward selection
- Combat (with enemy, flashcards)
- Combat pipeline breakdown
- Branch selection (door choice)
- Shop (chip select)
- Chip equip panel
- Settings panel
- Menu sheet

Send screenshots to user for visual review.

**Step 6: Commit any test fixes**

```bash
/usr/bin/git add -A
/usr/bin/git commit -m "fix: update e2e test selectors for new UI structure"
```

---

## Task 15: Merge to Master

**Step 1: Final test run**

```bash
./scripts/e2e-test.sh
```

Verify 60+/66 pass.

**Step 2: Merge**

```bash
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git pull origin master
/usr/bin/git merge feature/ui-reskin
```

**Step 3: Cleanup worktree**

```bash
/usr/bin/git worktree remove ../jrpg-wt-ui-reskin
/usr/bin/git branch -d feature/ui-reskin
```

---

## Summary

| Task | Description | Files | Commits |
|------|-------------|-------|---------|
| 1 | CSS custom properties + base theme | game.css | 1 |
| 2 | Scene area + narration box + enemy info | game.css, game.html | 1 |
| 3 | Chip row tiles + charge dots + HP bar | game.css, chip-row.js, hp-bar.js | 1 |
| 4 | Action area buttons (3→2 hub) | game.css, exploration.js, actions.js | 1 |
| 5 | Combat flashcards restyle | game.css, actions.js | 1 |
| 6 | Pipeline stats + damage numbers | game.css, combat-effects.js, scene.js, combat-loop.js | 1 |
| 7 | Exploration screens (level/ward/branch/shrine/quiz) | game.css, exploration.js | 1 |
| 8 | Toolbar restructure (3 icons + menu) | game.html, game.css, modals.js, game.js | 1 |
| 9 | Chip shop + chip popup | game.css, chip-select.js, chip-row.js | 1 |
| 10 | Takeover panels slide-up | game.css | 1 |
| 11 | Chip equip grid layout | game.css, game.html, game.js | 1 |
| 12 | Auth, speed review, game over | game.css | 1 |
| 13 | CSS cleanup | game.css | 1 |
| 14 | Smoke test + screenshots | tests, selectors | 1 |
| 15 | Merge to master | git | 0 |

**Total: ~15 tasks, ~14 commits, touching ~14 files. No backend changes.**
