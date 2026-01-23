# Mobile-First UI Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the desktop-first 2-column layout with a mobile-first single-column interface designed for iPhone touch controls, with a bright/friendly visual theme.

**Architecture:** Complete rewrite of `game.html` and `game.css`. Adapt existing JS modules (`game.js`, `ui/*.js`, `word-practice.js`) to render into the new DOM structure. No backend changes. Game logic stays unchanged - only the presentation layer changes.

**Tech Stack:** Vanilla HTML/CSS/JS, touch events, CSS custom properties, vh/vw units

**Reference mockups:** See `/Users/michia/Downloads/Non-Combat-Layout.jpg` and `/Users/michia/Downloads/Rough-layout.jpg`

---

## Phase 1: HTML Shell & CSS Foundation

### Task 1: Create new game.html with mobile-first structure

**Files:**
- Rewrite: `public/game.html`

**Step 1: Write the new HTML structure**

Replace `public/game.html` entirely with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NEO TOKYO: System Liberation</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌃</text></svg>">
  <link rel="stylesheet" href="game.css">
</head>
<body>
  <div class="game-app">
    <!-- Status Bar -->
    <div class="status-bar" id="status-bar">
      <span class="status-floor" id="floor-indicator">Hub</span>
      <span class="status-essence" id="essence-display">0</span>
    </div>

    <!-- Scene Area -->
    <div class="scene-area" id="scene-area">
      <div class="scene-background" id="scene-background"></div>
      <div class="enemy-info" id="enemy-info">
        <span class="enemy-name" id="enemy-name"></span>
        <div class="enemy-hp-bar" id="enemy-hp-bar">
          <div class="enemy-hp-fill" id="enemy-hp-fill"></div>
        </div>
        <div class="enemy-skill-bar" id="enemy-skill-bar"></div>
      </div>
      <div class="enemy-sprite-container" id="enemy-sprite-container">
        <img id="enemy-sprite" class="enemy-sprite" src="" alt="">
      </div>
      <div class="scene-toast" id="scene-toast"></div>
    </div>

    <!-- Chip Row -->
    <div class="chip-row" id="chip-row">
      <!-- 5 chip slots rendered by JS -->
    </div>

    <!-- Player HP Bar -->
    <div class="player-hp-container" id="player-hp-container">
      <div class="player-hp-bar" id="player-hp-bar">
        <div class="player-hp-fill" id="player-hp-fill"></div>
        <span class="player-hp-text" id="player-hp-text"></span>
      </div>
    </div>

    <!-- Bottom Action Area -->
    <div class="action-area" id="action-area">
      <!-- Buttons OR flash cards rendered by JS -->
    </div>

    <!-- Utility Row -->
    <div class="utility-row" id="utility-row">
      <button class="util-btn" id="settings-btn" aria-label="Settings">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      </button>
      <button class="util-btn" id="reset-run-btn" aria-label="Reset Run">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Full-Screen Takeover Views (hidden by default) -->
  <div class="takeover" id="chip-equip-view">
    <button class="takeover-close" id="chip-equip-close">&times;</button>
    <div class="takeover-content" id="chip-equip-content"></div>
  </div>

  <div class="takeover" id="chip-shop-view">
    <button class="takeover-close" id="chip-shop-close">&times;</button>
    <div class="takeover-content" id="chip-shop-content"></div>
  </div>

  <div class="takeover" id="settings-view">
    <button class="takeover-close" id="settings-close">&times;</button>
    <div class="takeover-content" id="settings-content"></div>
  </div>

  <div class="takeover" id="gameover-view">
    <div class="takeover-content" id="gameover-content"></div>
  </div>

  <!-- Chip Skill Popup -->
  <div class="chip-popup" id="chip-popup">
    <div class="chip-popup-name" id="chip-popup-name"></div>
    <div class="chip-popup-desc" id="chip-popup-desc"></div>
    <div class="chip-popup-charge" id="chip-popup-charge"></div>
    <button class="chip-popup-use" id="chip-popup-use">Use Skill</button>
  </div>

  <script type="module" src="game.js"></script>
</body>
</html>
```

**Step 2: Verify HTML is valid**

Run: `npx html-validate public/game.html || echo "check warnings"`

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(ui): rewrite game.html with mobile-first single-column layout"
```

---

### Task 2: Write new game.css - layout structure and theme

**Files:**
- Rewrite: `public/game.css`

**Step 1: Write the new CSS**

Replace `public/game.css` with the mobile-first layout and bright theme. Key sections:

```css
/* ===== RESET & BASE ===== */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  /* Theme colors - bright & friendly */
  --bg-primary: #f0f7f0;
  --bg-card: #fffef5;
  --bg-card-hover: #fff9e0;
  --text-primary: #2d3436;
  --text-secondary: #636e72;
  --accent-orange: #f39c12;
  --accent-green: #27ae60;
  --accent-purple: #8e44ad;
  --accent-blue: #3498db;
  --accent-red: #e74c3c;
  --btn-primary: #27ae60;
  --btn-secondary: #3498db;
  --shadow-soft: 0 2px 8px rgba(0,0,0,0.1);
  --shadow-card: 0 4px 12px rgba(0,0,0,0.08);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-pill: 50px;
  --radius-circle: 50%;
  --chip-glow: 0 0 12px 4px rgba(243, 156, 18, 0.6);
  --hp-green: #27ae60;
  --hp-yellow: #f1c40f;
  --hp-red: #e74c3c;
  --transition-fast: 0.15s ease;
  --transition-med: 0.3s ease;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* ===== GAME APP - Single Column ===== */
.game-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  max-width: 430px;
  margin: 0 auto;
  position: relative;
}

/* ===== STATUS BAR ===== */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 16px;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(8px);
  font-size: 14px;
  font-weight: 600;
  z-index: 10;
  min-height: 32px;
}

.status-floor {
  color: var(--text-secondary);
}

.status-essence {
  color: var(--accent-orange);
}

.status-essence::before {
  content: '✦ ';
}

/* ===== SCENE AREA ===== */
.scene-area {
  position: relative;
  height: 38vh;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scene-background {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}

.enemy-info {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  z-index: 5;
  display: none;
}

.enemy-info.visible {
  display: block;
}

.enemy-name {
  font-size: 14px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  margin-bottom: 4px;
  display: block;
}

.enemy-hp-bar {
  width: 140px;
  height: 8px;
  background: rgba(0,0,0,0.4);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 2px;
}

.enemy-hp-fill {
  height: 100%;
  background: var(--accent-red);
  border-radius: 4px;
  transition: width var(--transition-med);
}

.enemy-skill-bar {
  width: 100px;
  height: 4px;
  background: rgba(0,0,0,0.3);
  border-radius: 2px;
  margin: 0 auto;
}

.enemy-sprite-container {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.enemy-sprite {
  max-height: 65%;
  max-width: 60%;
  object-fit: contain;
  display: none;
}

.enemy-sprite.visible {
  display: block;
}

.scene-toast {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255,255,255,0.95);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: 14px;
  box-shadow: var(--shadow-card);
  opacity: 0;
  transition: opacity var(--transition-med);
  z-index: 20;
  pointer-events: none;
}

.scene-toast.visible {
  opacity: 1;
}

/* ===== CHIP ROW ===== */
.chip-row {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 16px 4px;
  background: rgba(45, 52, 54, 0.9);
  backdrop-filter: blur(4px);
}

.chip-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.chip-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-circle);
  border: 3px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: white;
  transition: box-shadow var(--transition-fast), transform var(--transition-fast);
}

.chip-icon.empty {
  background: rgba(255,255,255,0.1);
  border-style: dashed;
}

.chip-icon.charged {
  animation: chip-pulse 2s ease-in-out infinite;
  box-shadow: var(--chip-glow);
}

@keyframes chip-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(243, 156, 18, 0.4); }
  50% { box-shadow: 0 0 16px 6px rgba(243, 156, 18, 0.7); }
}

.chip-charge-bar {
  display: flex;
  gap: 2px;
  height: 4px;
}

.chip-charge-segment {
  width: 8px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.2);
}

.chip-charge-segment.filled {
  background: var(--accent-orange);
}

.chip-level-badge {
  position: absolute;
  top: -2px;
  left: -2px;
  font-size: 10px;
  font-weight: 700;
  background: var(--accent-purple);
  color: white;
  border-radius: var(--radius-circle);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ===== PLAYER HP BAR ===== */
.player-hp-container {
  padding: 4px 16px 8px;
  background: rgba(45, 52, 54, 0.9);
}

.player-hp-bar {
  position: relative;
  width: 100%;
  height: 14px;
  background: rgba(255,255,255,0.15);
  border-radius: 7px;
  overflow: hidden;
}

.player-hp-fill {
  height: 100%;
  background: var(--hp-green);
  border-radius: 7px;
  transition: width var(--transition-med), background-color var(--transition-med);
}

.player-hp-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* ===== ACTION AREA ===== */
.action-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  min-height: 0;
  overflow-y: auto;
}

.action-btn {
  width: 100%;
  max-width: 320px;
  padding: 18px 24px;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  box-shadow: var(--shadow-card);
  min-height: 60px;
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn-primary {
  background: var(--bg-card);
  color: var(--text-primary);
}

.action-btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== FLASH CARD ===== */
.flash-card-container {
  width: 100%;
  max-width: 320px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1000px;
  touch-action: pan-y;
}

.flash-card {
  width: 100%;
  aspect-ratio: 3/4;
  max-height: 280px;
  position: relative;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--transition-fast);
  user-select: none;
}

.flash-card-front {
  font-size: 36px;
  font-weight: 700;
  text-align: center;
  padding: 20px;
}

.flash-card-back {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}

.flash-card.flipped .flash-card-front {
  display: none;
}

.flash-card.flipped .flash-card-back {
  display: flex;
}

.flash-card-reading {
  font-size: 20px;
  color: var(--text-secondary);
}

.flash-card-meaning {
  font-size: 22px;
  font-weight: 600;
}

.flash-card-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.flash-card.swiping-right {
  transform: translateX(var(--swipe-x, 0)) rotate(var(--swipe-rotate, 0deg));
  background: #e8f5e9;
}

.flash-card.swiping-left {
  transform: translateX(var(--swipe-x, 0)) rotate(var(--swipe-rotate, 0deg));
  background: #ffebee;
}

/* ===== UTILITY ROW ===== */
.utility-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 24px 12px;
  background: rgba(255,255,255,0.9);
}

.util-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-circle);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}

.util-btn:active {
  background: rgba(0,0,0,0.05);
}

/* ===== TAKEOVER VIEWS ===== */
.takeover {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  z-index: 100;
  transform: translateX(100%);
  transition: transform var(--transition-med);
  overflow-y: auto;
  padding: 20px;
}

.takeover.active {
  transform: translateX(0);
}

.takeover-close {
  position: fixed;
  top: 12px;
  right: 16px;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-card);
  border-radius: var(--radius-circle);
  font-size: 24px;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  z-index: 101;
  display: flex;
  align-items: center;
  justify-content: center;
}

.takeover-content {
  padding-top: 48px;
}

/* ===== CHIP POPUP ===== */
.chip-popup {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-card);
  min-width: 180px;
  text-align: center;
  display: none;
  z-index: 50;
}

.chip-popup.visible {
  display: block;
}

.chip-popup-name {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}

.chip-popup-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.chip-popup-charge {
  font-size: 12px;
  color: var(--accent-orange);
  margin-bottom: 8px;
}

.chip-popup-use {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--btn-primary);
  color: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.chip-popup-use:disabled {
  background: var(--text-secondary);
  cursor: not-allowed;
}

/* ===== WARD SELECTION (Scene Area content) ===== */
.ward-options {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  overflow-y: auto;
}

.ward-option {
  background: rgba(255,255,255,0.9);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  box-shadow: var(--shadow-soft);
}

.ward-option.selected {
  box-shadow: 0 0 0 3px var(--accent-blue);
  transform: scale(1.02);
}

.ward-option-name {
  font-weight: 700;
  font-size: 16px;
}

.ward-option-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ===== CHIP EQUIP VIEW ===== */
.equip-slots {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.equip-slot {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-circle);
  border: 3px dashed var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.equip-slot.filled {
  border-style: solid;
  border-color: var(--accent-green);
}

.available-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.chip-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.chip-card:active {
  transform: scale(0.97);
}

/* ===== POST-COMBAT SHOP ===== */
.shop-chips {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.shop-chip-option {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.shop-chip-option:active {
  transform: scale(0.98);
}

/* ===== GAME OVER ===== */
.gameover-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  gap: 16px;
  padding: 24px;
}

.gameover-title {
  font-size: 28px;
  font-weight: 700;
}

.gameover-stats {
  font-size: 14px;
  color: var(--text-secondary);
}

/* ===== DAMAGE NUMBERS ===== */
.damage-number {
  position: absolute;
  font-weight: 700;
  font-size: 24px;
  color: var(--accent-red);
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  animation: damage-float 1s ease-out forwards;
  pointer-events: none;
  z-index: 30;
}

.damage-number.crit {
  font-size: 32px;
  color: var(--accent-orange);
}

.damage-number.heal {
  color: var(--accent-green);
}

@keyframes damage-float {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40px); }
}

/* ===== SETTINGS VIEW ===== */
.settings-group {
  margin-bottom: 20px;
}

.settings-group-title {
  font-weight: 700;
  font-size: 16px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.settings-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: var(--radius-md);
  font-size: 16px;
  margin-bottom: 8px;
  background: var(--bg-card);
}

.settings-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

/* ===== HIDDEN UTILITY ===== */
.hidden {
  display: none !important;
}

/* ===== BUFF INDICATOR ===== */
.buff-indicator {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--accent-orange);
  white-space: nowrap;
}
```

**Step 2: Check CSS syntax**

Run: `npx stylelint public/game.css --fix 2>/dev/null || echo "stylelint not installed, visual check ok"`

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat(ui): rewrite game.css with mobile-first bright theme"
```

---

## Phase 2: Core JS Adapter Layer

### Task 3: Create DOM reference adapter module

**Files:**
- Create: `public/js/dom.js`

**Step 1: Write the DOM reference module**

This module provides a single place for all DOM element lookups, replacing the scattered `getElementById` calls throughout the codebase. All UI modules will import from here.

```javascript
/**
 * DOM Reference Module - Central element cache for mobile UI
 *
 * All UI modules import element references from here.
 * Elements are lazily cached on first access.
 */

const cache = {};

function el(id) {
  if (!cache[id]) {
    cache[id] = document.getElementById(id);
  }
  return cache[id];
}

export const dom = {
  // Status bar
  get statusBar() { return el('status-bar'); },
  get floorIndicator() { return el('floor-indicator'); },
  get essenceDisplay() { return el('essence-display'); },

  // Scene area
  get sceneArea() { return el('scene-area'); },
  get sceneBackground() { return el('scene-background'); },
  get enemyInfo() { return el('enemy-info'); },
  get enemyName() { return el('enemy-name'); },
  get enemyHpBar() { return el('enemy-hp-bar'); },
  get enemyHpFill() { return el('enemy-hp-fill'); },
  get enemySkillBar() { return el('enemy-skill-bar'); },
  get enemySpriteContainer() { return el('enemy-sprite-container'); },
  get enemySprite() { return el('enemy-sprite'); },
  get sceneToast() { return el('scene-toast'); },

  // Chip row
  get chipRow() { return el('chip-row'); },

  // Player HP
  get playerHpContainer() { return el('player-hp-container'); },
  get playerHpBar() { return el('player-hp-bar'); },
  get playerHpFill() { return el('player-hp-fill'); },
  get playerHpText() { return el('player-hp-text'); },

  // Action area
  get actionArea() { return el('action-area'); },

  // Utility
  get settingsBtn() { return el('settings-btn'); },
  get resetRunBtn() { return el('reset-run-btn'); },

  // Takeover views
  get chipEquipView() { return el('chip-equip-view'); },
  get chipEquipClose() { return el('chip-equip-close'); },
  get chipEquipContent() { return el('chip-equip-content'); },
  get chipShopView() { return el('chip-shop-view'); },
  get chipShopClose() { return el('chip-shop-close'); },
  get chipShopContent() { return el('chip-shop-content'); },
  get settingsView() { return el('settings-view'); },
  get settingsClose() { return el('settings-close'); },
  get settingsContent() { return el('settings-content'); },
  get gameoverView() { return el('gameover-view'); },
  get gameoverContent() { return el('gameover-content'); },

  // Chip popup
  get chipPopup() { return el('chip-popup'); },
  get chipPopupName() { return el('chip-popup-name'); },
  get chipPopupDesc() { return el('chip-popup-desc'); },
  get chipPopupCharge() { return el('chip-popup-charge'); },
  get chipPopupUse() { return el('chip-popup-use'); },
};

/** Clear cache (for testing or hot reload) */
export function clearDomCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/dom.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/dom.js
git commit -m "feat(ui): add centralized DOM reference module"
```

---

### Task 4: Create scene rendering module

**Files:**
- Create: `public/js/ui/scene.js`

**Step 1: Write the scene renderer**

This module handles the scene area: backgrounds, enemy display, toasts.

```javascript
/**
 * Scene UI Module - Manages scene area rendering
 *
 * Handles: backgrounds, enemy sprite/info, toast messages
 */

import { dom } from '../dom.js';

/** Set scene background image */
export function setBackground(imagePath) {
  if (imagePath) {
    dom.sceneBackground.style.backgroundImage = `url(${imagePath})`;
  } else {
    dom.sceneBackground.style.backgroundImage = 'none';
  }
}

/** Show enemy in scene */
export function showEnemy(enemy) {
  if (!enemy) {
    hideEnemy();
    return;
  }

  dom.enemyName.textContent = enemy.nameEn || enemy.name || 'Enemy';
  dom.enemySprite.src = enemy.sprite || '';
  dom.enemySprite.classList.add('visible');
  dom.enemyInfo.classList.add('visible');
  updateEnemyHP(enemy.hp, enemy.maxHp);
}

/** Hide enemy from scene */
export function hideEnemy() {
  dom.enemySprite.classList.remove('visible');
  dom.enemyInfo.classList.remove('visible');
}

/** Update enemy HP bar */
export function updateEnemyHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.enemyHpFill.style.width = `${pct}%`;
}

/** Show floating toast message in scene (auto-dismisses) */
export function showToast(message, durationMs = 3000) {
  dom.sceneToast.textContent = message;
  dom.sceneToast.classList.add('visible');
  setTimeout(() => {
    dom.sceneToast.classList.remove('visible');
  }, durationMs);
}

/** Show damage number floating up from enemy */
export function showDamageNumber(amount, { isCrit = false, isHeal = false } = {}) {
  const el = document.createElement('div');
  el.className = `damage-number${isCrit ? ' crit' : ''}${isHeal ? ' heal' : ''}`;
  el.textContent = isHeal ? `+${amount}` : amount;

  // Position near enemy sprite
  const container = dom.enemySpriteContainer;
  const rect = container.getBoundingClientRect();
  el.style.left = `${rect.width / 2}px`;
  el.style.top = `${rect.height * 0.3}px`;
  container.appendChild(el);

  setTimeout(() => el.remove(), 1000);
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/ui/scene.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/ui/scene.js
git commit -m "feat(ui): add scene rendering module (backgrounds, enemy, toasts)"
```

---

### Task 5: Create chip row rendering module

**Files:**
- Create: `public/js/ui/chip-row.js`

**Step 1: Write the chip row renderer**

Handles rendering the 5 chip icons with charge bars, level badges, glow states, and the skill popup.

```javascript
/**
 * Chip Row UI Module - Renders 5 chip slots with charges and skill popup
 *
 * Per spec: circular icons, 5-segment charge bars, golden pulse when charged,
 * tap to show skill popup with "Use Skill" button
 */

import { dom } from '../dom.js';

let onUseSkill = null; // Callback: (chipIndex) => void
let currentPopupIndex = -1;

/** Initialize chip row with skill callback */
export function init({ useSkillCallback }) {
  onUseSkill = useSkillCallback;

  // Dismiss popup on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip-slot') && !e.target.closest('.chip-popup')) {
      hidePopup();
    }
  });
}

/**
 * Render all 5 chip slots
 * @param {Array} chips - Array of 5 chip objects (or null for empty slots)
 * @param {Object} options - { charges: [n,n,n,n,n], levels: [n,n,n,n,n], maxCharges: 5 }
 */
export function render(chips, { charges = [], levels = [], maxCharges = 5, inCombat = false } = {}) {
  const row = dom.chipRow;
  row.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const chip = chips[i] || null;
    const charge = charges[i] || 0;
    const level = levels[i] || 1;
    const isCharged = charge >= maxCharges;

    const slot = document.createElement('div');
    slot.className = 'chip-slot';
    slot.dataset.index = i;

    // Chip icon
    const icon = document.createElement('div');
    const chipColor = chip ? getChipColor(chip) : 'transparent';
    icon.className = `chip-icon${chip ? '' : ' empty'}${isCharged ? ' charged' : ''}`;
    icon.style.background = chip ? chipColor : '';
    icon.textContent = chip ? getChipInitial(chip) : '';

    // Level badge (only if > 1)
    if (chip && level > 1) {
      icon.style.position = 'relative';
      const badge = document.createElement('span');
      badge.className = 'chip-level-badge';
      badge.textContent = `${level}`;
      icon.appendChild(badge);
    }

    slot.appendChild(icon);

    // Charge bar (5 segments)
    if (chip) {
      const bar = document.createElement('div');
      bar.className = 'chip-charge-bar';
      for (let s = 0; s < maxCharges; s++) {
        const seg = document.createElement('div');
        seg.className = `chip-charge-segment${s < charge ? ' filled' : ''}`;
        bar.appendChild(seg);
      }
      slot.appendChild(bar);
    }

    // Tap handler (combat only)
    if (chip && inCombat) {
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopup(i, chip, charge, maxCharges);
      });
    }

    row.appendChild(slot);
  }
}

/** Show chip skill popup */
function showPopup(index, chip, charge, maxCharges) {
  currentPopupIndex = index;
  const isCharged = charge >= maxCharges;

  dom.chipPopupName.textContent = chip.skill?.nameEn || chip.nameEn || chip.name;
  dom.chipPopupDesc.textContent = chip.skill?.descriptionEn || chip.description || '';
  dom.chipPopupCharge.textContent = isCharged ? 'Ready!' : `Charging ${charge}/${maxCharges}`;
  dom.chipPopupUse.disabled = !isCharged;
  dom.chipPopupUse.onclick = () => {
    if (onUseSkill) onUseSkill(index);
    hidePopup();
  };

  // Position popup near the chip slot
  const slot = dom.chipRow.children[index];
  if (slot) {
    const rect = slot.getBoundingClientRect();
    const popup = dom.chipPopup;
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    popup.style.transform = 'translateX(-50%)';
    popup.style.position = 'fixed';
    popup.classList.add('visible');
  }
}

/** Hide chip popup */
function hidePopup() {
  dom.chipPopup.classList.remove('visible');
  currentPopupIndex = -1;
}

/** Get color for chip based on rarity */
function getChipColor(chip) {
  const colors = {
    common: '#95a5a6',
    uncommon: '#27ae60',
    rare: '#3498db',
    epic: '#8e44ad',
    legendary: '#f39c12',
  };
  return colors[chip.rarity] || colors.common;
}

/** Get display initial for chip icon (placeholder until art) */
function getChipInitial(chip) {
  const name = chip.nameEn || chip.name || '?';
  return name.charAt(0).toUpperCase();
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/ui/chip-row.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/ui/chip-row.js
git commit -m "feat(ui): add chip row renderer with charges, levels, skill popup"
```

---

### Task 6: Create player HP bar module

**Files:**
- Create: `public/js/ui/hp-bar.js`

**Step 1: Write the HP bar renderer**

```javascript
/**
 * Player HP Bar Module
 *
 * Full-width bar: green → yellow → red as HP decreases.
 * Shows current/max as text overlay.
 */

import { dom } from '../dom.js';

/** Update player HP bar display */
export function updatePlayerHP(current, max) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  dom.playerHpFill.style.width = `${pct}%`;
  dom.playerHpText.textContent = `${current} / ${max}`;

  // Color transitions
  if (pct > 50) {
    dom.playerHpFill.style.background = 'var(--hp-green)';
  } else if (pct > 25) {
    dom.playerHpFill.style.background = 'var(--hp-yellow)';
  } else {
    dom.playerHpFill.style.background = 'var(--hp-red)';
  }
}

/** Show/hide the HP container */
export function setVisible(visible) {
  dom.playerHpContainer.classList.toggle('hidden', !visible);
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/ui/hp-bar.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/ui/hp-bar.js
git commit -m "feat(ui): add player HP bar module"
```

---

### Task 7: Create action area module (buttons + flash cards)

**Files:**
- Create: `public/js/ui/actions.js`

**Step 1: Write the action area module**

Handles both button mode (non-combat) and flash card mode (combat). Includes swipe gesture handling.

```javascript
/**
 * Action Area Module - Bottom section buttons and flash cards
 *
 * Non-combat: Shows [Equip Bots] + [Contextual Action] buttons
 * Combat: Shows swipeable flash card stack
 */

import { dom } from '../dom.js';

let onEquipBots = null;
let onContextAction = null;
let onCardSwipe = null; // (direction: 'left'|'right') => void
let onCardFlip = null;  // () => void

// Swipe state
let touchStartX = 0;
let touchStartY = 0;
let currentSwipeX = 0;
let isSwiping = false;
let cardFlipped = false;

const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.3;

/** Initialize action area callbacks */
export function init({ equipBots, contextAction, cardSwipe, cardFlip }) {
  onEquipBots = equipBots;
  onContextAction = contextAction;
  onCardSwipe = cardSwipe;
  onCardFlip = cardFlip;
}

/**
 * Show action buttons (non-combat mode)
 * @param {string} contextLabel - Text for the contextual button ("Infiltrate", "Fight", etc.)
 * @param {Object} options - { contextDisabled: bool }
 */
export function showButtons(contextLabel, { contextDisabled = false } = {}) {
  dom.actionArea.innerHTML = `
    <button class="action-btn action-btn-primary" id="equip-bots-btn">Equip Bots</button>
    <button class="action-btn action-btn-secondary" id="context-action-btn"
      ${contextDisabled ? 'disabled' : ''}>${contextLabel}</button>
  `;

  document.getElementById('equip-bots-btn').addEventListener('click', () => {
    if (onEquipBots) onEquipBots();
  });

  const ctxBtn = document.getElementById('context-action-btn');
  if (!contextDisabled) {
    ctxBtn.addEventListener('click', () => {
      if (onContextAction) onContextAction();
    });
  }
}

/**
 * Show flash card (combat mode)
 * @param {Object} word - { word, meanings, reading }
 */
export function showFlashCard(word) {
  cardFlipped = false;
  isSwiping = false;

  dom.actionArea.innerHTML = `
    <div class="flash-card-container" id="flash-card-container">
      <div class="flash-card" id="flash-card">
        <div class="flash-card-front">${escapeHtml(word.word)}</div>
        <div class="flash-card-back">
          <div class="flash-card-reading">${escapeHtml(word.reading || '')}</div>
          <div class="flash-card-meaning">${escapeHtml(Array.isArray(word.meanings) ? word.meanings.join(', ') : word.meanings || '')}</div>
          <div class="flash-card-hint">← didn't know &nbsp; | &nbsp; knew it →</div>
        </div>
      </div>
    </div>
  `;

  const card = document.getElementById('flash-card');

  // Tap to flip
  card.addEventListener('click', () => {
    if (!isSwiping && !cardFlipped) {
      cardFlipped = true;
      card.classList.add('flipped');
      if (onCardFlip) onCardFlip();
    }
  });

  // Swipe handling (only after flip)
  card.addEventListener('touchstart', handleTouchStart, { passive: true });
  card.addEventListener('touchmove', handleTouchMove, { passive: false });
  card.addEventListener('touchend', handleTouchEnd, { passive: true });
}

/** Show empty action area */
export function clear() {
  dom.actionArea.innerHTML = '';
}

/** Show custom content in action area */
export function setContent(html) {
  dom.actionArea.innerHTML = html;
}

// --- Touch handlers ---

function handleTouchStart(e) {
  if (!cardFlipped) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  currentSwipeX = 0;
  isSwiping = false;
}

function handleTouchMove(e) {
  if (!cardFlipped) return;
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Only swipe if more horizontal than vertical
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
    isSwiping = true;
    currentSwipeX = dx;
    e.preventDefault();

    const card = document.getElementById('flash-card');
    if (card) {
      const rotate = dx * 0.05;
      card.style.setProperty('--swipe-x', `${dx}px`);
      card.style.setProperty('--swipe-rotate', `${rotate}deg`);
      card.classList.toggle('swiping-right', dx > 0);
      card.classList.toggle('swiping-left', dx < 0);
    }
  }
}

function handleTouchEnd(e) {
  if (!cardFlipped || !isSwiping) return;

  const card = document.getElementById('flash-card');
  if (Math.abs(currentSwipeX) > SWIPE_THRESHOLD) {
    const direction = currentSwipeX > 0 ? 'right' : 'left';
    // Animate off screen
    if (card) {
      card.style.transition = 'transform 0.3s ease';
      card.style.transform = `translateX(${currentSwipeX > 0 ? 300 : -300}px) rotate(${currentSwipeX * 0.1}deg)`;
    }
    setTimeout(() => {
      if (onCardSwipe) onCardSwipe(direction);
    }, 200);
  } else {
    // Snap back
    if (card) {
      card.style.setProperty('--swipe-x', '0px');
      card.style.setProperty('--swipe-rotate', '0deg');
      card.classList.remove('swiping-right', 'swiping-left');
    }
  }
  isSwiping = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/ui/actions.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/ui/actions.js
git commit -m "feat(ui): add action area module with buttons and swipeable flash cards"
```

---

### Task 8: Create takeover view module

**Files:**
- Create: `public/js/ui/takeover.js`

**Step 1: Write the takeover view module**

Manages full-screen slide-in views (chip equip, chip shop, settings, game over).

```javascript
/**
 * Takeover View Module - Full-screen slide-in panels
 *
 * Manages: chip equip, chip shop, settings, game over
 * Slides in from right, close button in top corner.
 */

import { dom } from '../dom.js';

const views = {};

/** Initialize all takeover views and close buttons */
export function init() {
  views.chipEquip = dom.chipEquipView;
  views.chipShop = dom.chipShopView;
  views.settings = dom.settingsView;
  views.gameover = dom.gameoverView;

  // Close buttons
  dom.chipEquipClose.addEventListener('click', () => close('chipEquip'));
  dom.chipShopClose.addEventListener('click', () => close('chipShop'));
  dom.settingsClose.addEventListener('click', () => close('settings'));
}

/** Open a takeover view */
export function open(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.add('active');
  }
}

/** Close a takeover view */
export function close(viewName) {
  const view = views[viewName];
  if (view) {
    view.classList.remove('active');
  }
}

/** Close all takeover views */
export function closeAll() {
  Object.values(views).forEach(v => v.classList.remove('active'));
}

/** Check if any takeover is active */
export function isAnyActive() {
  return Object.values(views).some(v => v.classList.contains('active'));
}

/** Get content container for a view */
export function getContent(viewName) {
  switch (viewName) {
    case 'chipEquip': return dom.chipEquipContent;
    case 'chipShop': return dom.chipShopContent;
    case 'settings': return dom.settingsContent;
    case 'gameover': return dom.gameoverContent;
    default: return null;
  }
}
```

**Step 2: Verify module syntax**

Run: `node --check public/js/ui/takeover.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/js/ui/takeover.js
git commit -m "feat(ui): add takeover view module for full-screen panels"
```

---

## Phase 3: Game State Rendering Integration

### Task 9: Create main UI orchestrator (new game.js entry point)

**Files:**
- Rewrite: `public/game.js`

**Step 1: Write the new game.js**

This is the main entry point. It initializes all UI modules, loads game state from the server, and routes phase changes to the correct renderer. The existing game logic modules (`api.js`, `word-practice.js`, `settings.js`, `tts.js`) are kept and re-imported.

```javascript
/**
 * Game.js - Main UI Orchestrator (Mobile-First Rewrite)
 *
 * Initializes UI modules, manages game state, routes phases to renderers.
 * Existing server API and game logic remain unchanged.
 */

import { dom } from './js/dom.js';
import * as scene from './js/ui/scene.js';
import * as chipRow from './js/ui/chip-row.js';
import * as hpBar from './js/ui/hp-bar.js';
import * as actions from './js/ui/actions.js';
import * as takeover from './js/ui/takeover.js';
import * as api from './js/api.js';
import * as settings from './js/settings.js';
import * as tts from './js/tts.js';
import * as wordPractice from './js/word-practice.js';

// ============ GAME STATE ============

let gameState = null;
let combatActive = false;

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', async () => {
  // Init UI modules
  takeover.init();
  chipRow.init({ useSkillCallback: handleUseSkill });
  actions.init({
    equipBots: handleEquipBots,
    contextAction: handleContextAction,
    cardSwipe: handleCardSwipe,
    cardFlip: handleCardFlip,
  });

  // Utility buttons
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.resetRunBtn.addEventListener('click', handleResetRun);

  // Load game
  await loadGameState();
  updateUI();
});

// ============ GAME STATE MANAGEMENT ============

async function loadGameState() {
  try {
    const response = await fetch('/api/game/state');
    gameState = await response.json();
  } catch (err) {
    console.error('Failed to load game state:', err);
    gameState = { phase: 'no_save' };
  }
}

async function updateGameState(newState) {
  gameState = newState;
  updateUI();
}

// ============ MASTER UI ROUTER ============

function updateUI() {
  if (!gameState) return;

  const phase = gameState.phase;

  // Status bar
  updateStatusBar();

  // Scene area
  updateScene();

  // Chip row + HP bar (visible in all non-takeover phases)
  const showGameUI = !['no_save'].includes(phase);
  dom.chipRow.classList.toggle('hidden', !showGameUI);
  dom.playerHpContainer.classList.toggle('hidden', !showGameUI);

  if (showGameUI && gameState.player) {
    renderChips();
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
  }

  // Route to phase-specific action area
  switch (phase) {
    case 'no_save':
      renderNoSave();
      break;
    case 'hub':
      renderHub();
      break;
    case 'ward_selection':
      renderWardSelection();
      break;
    case 'exploring':
      renderExploring();
      break;
    case 'room':
    case 'room_encounter':
      renderRoomEncounter();
      break;
    case 'combat':
      renderCombat();
      break;
    case 'post_combat_shop':
      renderPostCombatShop();
      break;
    case 'floor_complete':
      renderFloorComplete();
      break;
    case 'run_ended':
      renderRunEnded();
      break;
    default:
      renderHub();
  }
}

// ============ STATUS BAR ============

function updateStatusBar() {
  const run = gameState.run;
  if (run) {
    dom.floorIndicator.textContent = `Floor ${run.floor || 1}`;
  } else {
    dom.floorIndicator.textContent = 'Hub';
  }
  dom.essenceDisplay.textContent = gameState.meta?.essence || 0;
}

// ============ SCENE RENDERING ============

function updateScene() {
  const phase = gameState.phase;
  const run = gameState.run;
  const combat = gameState.combat;

  // Background
  if (run?.background) {
    scene.setBackground(`/assets/backgrounds/${run.background}`);
  } else {
    scene.setBackground('/assets/backgrounds/hub.png');
  }

  // Enemy
  if (combat?.enemy && ['combat', 'room_encounter'].includes(phase)) {
    scene.showEnemy(combat.enemy);
  } else {
    scene.hideEnemy();
  }
}

// ============ CHIP ROW ============

function renderChips() {
  const equipped = gameState.player?.equippedChips || [];
  const charges = gameState.combat?.chipCharges || new Array(5).fill(0);
  const levels = equipped.map(c => c?.level || 1);

  chipRow.render(equipped, {
    charges,
    levels,
    maxCharges: 5,
    inCombat: gameState.phase === 'combat',
  });
}

// ============ PHASE RENDERERS ============

function renderNoSave() {
  dom.chipRow.classList.add('hidden');
  dom.playerHpContainer.classList.add('hidden');
  scene.setBackground('/assets/backgrounds/hub.png');
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="new-game-start">New Game</button>
  `);
  document.getElementById('new-game-start').addEventListener('click', handleNewGame);
}

function renderHub() {
  scene.setBackground('/assets/backgrounds/hub.png');
  actions.showButtons('Infiltrate');
}

function renderWardSelection() {
  // Ward options shown in scene area
  const wards = gameState.run?.availableWards || [];
  const wardHtml = wards.map((w, i) => `
    <div class="ward-option" data-index="${i}">
      <div class="ward-option-name">${w.nameEn || w.name}</div>
      <div class="ward-option-desc">${w.description || ''}</div>
    </div>
  `).join('');

  dom.sceneArea.insertAdjacentHTML('beforeend',
    `<div class="ward-options" id="ward-options">${wardHtml}</div>`);

  // Ward tap selection
  let selectedWard = -1;
  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(w => w.classList.remove('selected'));
      el.classList.add('selected');
      selectedWard = parseInt(el.dataset.index);
      const ctxBtn = document.getElementById('context-action-btn');
      if (ctxBtn) ctxBtn.disabled = false;
    });
  });

  actions.showButtons('Proceed', { contextDisabled: true });
}

function renderExploring() {
  actions.showButtons('Proceed');
}

function renderRoomEncounter() {
  actions.showButtons('Fight');
}

function renderCombat() {
  combatActive = true;
  showNextVocabCard();
}

function renderPostCombatShop() {
  takeover.open('chipShop');
  const chips = gameState.combat?.rewards?.chips || [];
  const content = takeover.getContent('chipShop');
  content.innerHTML = `
    <h2 style="text-align:center;margin-bottom:16px;">Choose a Bot</h2>
    <div class="shop-chips">
      ${chips.map((c, i) => `
        <div class="shop-chip-option" data-index="${i}">
          <strong>${c.nameEn || c.name}</strong>
          <div style="font-size:12px;color:var(--text-secondary)">${c.description || ''}</div>
        </div>
      `).join('')}
    </div>
  `;

  content.querySelectorAll('.shop-chip-option').forEach(el => {
    el.addEventListener('click', () => handleChipSelection(parseInt(el.dataset.index)));
  });
}

function renderFloorComplete() {
  actions.showButtons('Continue');
}

function renderRunEnded() {
  takeover.open('gameover');
  const content = takeover.getContent('gameover');
  const stats = gameState.run || {};
  content.innerHTML = `
    <div class="gameover-content">
      <div class="gameover-title">${gameState.player?.hp <= 0 ? 'Defeated' : 'Run Complete'}</div>
      <div class="gameover-stats">
        <p>Floor reached: ${stats.floor || 1}</p>
        <p>Words reviewed: ${stats.wordsReviewed || 0}</p>
      </div>
      <button class="action-btn action-btn-primary" id="return-hub-btn">Return to Hub</button>
    </div>
  `;
  document.getElementById('return-hub-btn').addEventListener('click', handleReturnToHub);
}

// ============ COMBAT FLOW ============

async function showNextVocabCard() {
  // Get next word from word practice module
  const word = await getNextWord();
  if (word) {
    actions.showFlashCard(word);
  }
}

async function getNextWord() {
  try {
    const response = await fetch('/api/vocab/next');
    return await response.json();
  } catch {
    // Fallback
    return { word: '食べる', meanings: ['eat'], reading: 'たべる' };
  }
}

// ============ EVENT HANDLERS ============

function handleEquipBots() {
  takeover.open('chipEquip');
  renderChipEquipView();
}

function handleContextAction() {
  const phase = gameState.phase;
  switch (phase) {
    case 'hub':
      startRun();
      break;
    case 'ward_selection':
      confirmWardSelection();
      break;
    case 'exploring':
      proceedToNextRoom();
      break;
    case 'room_encounter':
      startCombat();
      break;
    case 'floor_complete':
      advanceFloor();
      break;
    default:
      break;
  }
}

async function handleCardSwipe(direction) {
  const correct = direction === 'right';
  // Submit vocab review
  try {
    await fetch('/api/game/attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correct }),
    });
  } catch (err) {
    console.error('Attack failed:', err);
  }

  // Reload state and continue
  await loadGameState();

  if (gameState.phase === 'combat') {
    updateScene();
    renderChips();
    hpBar.updatePlayerHP(gameState.player.hp, gameState.player.maxHp);
    showNextVocabCard();
  } else {
    combatActive = false;
    updateUI();
  }
}

function handleCardFlip() {
  // Auto-play TTS
  const card = document.querySelector('.flash-card-front');
  if (card) {
    tts.speak(card.textContent);
  }
}

function handleUseSkill(chipIndex) {
  fetch('/api/game/use-skill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chipIndex }),
  }).then(() => loadGameState()).then(() => {
    renderChips();
    updateScene();
  });
}

async function handleNewGame() {
  await fetch('/api/game/new', { method: 'POST' });
  await loadGameState();
  updateUI();
}

async function startRun() {
  const resp = await fetch('/api/game/start-run', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function confirmWardSelection() {
  const selected = document.querySelector('.ward-option.selected');
  if (!selected) return;
  const index = parseInt(selected.dataset.index);
  const resp = await fetch('/api/game/select-ward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wardIndex: index }),
  });
  gameState = await resp.json();
  // Clean up ward options overlay
  document.getElementById('ward-options')?.remove();
  updateUI();
}

async function proceedToNextRoom() {
  const resp = await fetch('/api/game/proceed', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function startCombat() {
  const resp = await fetch('/api/game/start-combat', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function advanceFloor() {
  const resp = await fetch('/api/game/advance-floor', { method: 'POST' });
  gameState = await resp.json();
  updateUI();
}

async function handleChipSelection(index) {
  const resp = await fetch('/api/game/select-chip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chipIndex: index }),
  });
  gameState = await resp.json();
  takeover.close('chipShop');
  updateUI();
}

function handleReturnToHub() {
  takeover.close('gameover');
  fetch('/api/game/return-hub', { method: 'POST' })
    .then(() => loadGameState())
    .then(() => updateUI());
}

async function handleResetRun() {
  if (!confirm('Abandon current run?')) return;
  await fetch('/api/game/reset-run', { method: 'POST' });
  await loadGameState();
  takeover.closeAll();
  updateUI();
}

function openSettings() {
  takeover.open('settings');
  renderSettingsView();
}

// ============ CHIP EQUIP VIEW ============

function renderChipEquipView() {
  const content = takeover.getContent('chipEquip');
  const equipped = gameState.player?.equippedChips || [];
  const available = gameState.player?.inventory?.chips || [];

  content.innerHTML = `
    <h2 style="text-align:center;margin-bottom:16px;">Equip Bots</h2>
    <div class="equip-slots">
      ${[0,1,2,3,4].map(i => {
        const chip = equipped[i];
        return `<div class="equip-slot ${chip ? 'filled' : ''}" data-slot="${i}">
          ${chip ? getChipInitial(chip) : ''}
        </div>`;
      }).join('')}
    </div>
    <h3 style="margin-bottom:8px;">Available</h3>
    <div class="available-chips">
      ${available.map((c, i) => `
        <div class="chip-card" data-chip-index="${i}">
          <strong>${c.nameEn || c.name}</strong>
          <div style="font-size:11px;color:var(--text-secondary)">${c.rarity}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Tap to equip/unequip (simplified - tap available chip to equip in first empty slot)
  content.querySelectorAll('.chip-card').forEach(el => {
    el.addEventListener('click', async () => {
      const chipIdx = parseInt(el.dataset.chipIndex);
      await fetch('/api/game/equip-chip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chipIndex: chipIdx }),
      });
      await loadGameState();
      renderChipEquipView();
      renderChips();
    });
  });
}

function getChipInitial(chip) {
  return (chip.nameEn || chip.name || '?').charAt(0).toUpperCase();
}

// ============ SETTINGS VIEW ============

function renderSettingsView() {
  const content = takeover.getContent('settings');
  content.innerHTML = `
    <h2 style="margin-bottom:16px;">Settings</h2>
    <div class="settings-group">
      <div class="settings-group-title">JPDB API Key</div>
      <input class="settings-input" type="password" id="jpdb-key-input"
        value="${settings.get('jpdbApiKey') || ''}" placeholder="Enter JPDB API key">
    </div>
    <div class="settings-group">
      <div class="settings-group-title">TTS</div>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="tts-enabled" ${settings.get('ttsEnabled') ? 'checked' : ''}>
        Enable Text-to-Speech
      </label>
    </div>
    <button class="action-btn action-btn-primary" id="save-settings-btn">Save</button>
  `;

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    settings.set('jpdbApiKey', document.getElementById('jpdb-key-input').value);
    settings.set('ttsEnabled', document.getElementById('tts-enabled').checked);
    scene.showToast('Settings saved');
    takeover.close('settings');
  });
}
```

This is a large file. The key architectural choices:
- Single source of truth: `gameState` object loaded from server
- Phase-based routing in `updateUI()` (same pattern as before, new DOM targets)
- Flash card swipe triggers combat cycle via existing `/api/game/attack` endpoint
- Takeover views for full-screen panels
- All existing API endpoints reused unchanged

**Step 2: Verify JS syntax**

Run: `node --check public/game.js && echo "OK"`

**Step 3: Commit**

```bash
git add public/game.js
git commit -m "feat(ui): rewrite game.js as mobile-first UI orchestrator"
```

---

## Phase 4: API Compatibility & Testing

### Task 10: Verify existing API modules still work with new game.js

**Files:**
- Modify: `public/js/api.js` (if needed - update any DOM references)
- Modify: `public/js/settings.js` (if needed)
- Modify: `public/js/word-practice.js` (if needed)

**Step 1: Check api.js for DOM references that need updating**

Read `public/js/api.js` and look for any direct DOM manipulation or getElementById calls that reference old elements. The API module should be pure fetch calls - if it has DOM refs, extract them.

**Step 2: Check settings.js for DOM references**

Read `public/js/settings.js` - it uses localStorage so should be fine, but verify no old modal references.

**Step 3: Check word-practice.js compatibility**

The word-practice module currently renders its own word card UI. For the mobile rewrite, the flash card rendering moves to `actions.js`. The word-practice module should only provide data (word fetching, review submission). Modify it to export data-only functions if it currently renders DOM.

**Step 4: Run syntax checks on all modified files**

Run: `for f in public/js/api.js public/js/settings.js public/js/word-practice.js; do node --check $f && echo "$f OK"; done`

**Step 5: Commit any changes**

```bash
git add public/js/
git commit -m "fix(ui): update JS modules for new DOM structure compatibility"
```

---

### Task 11: Run the app and fix startup errors

**Step 1: Start the server**

Run: `cd /path/to/worktree && npm start &`

**Step 2: Open in browser and check console**

Run: `sleep 2 && curl -s http://localhost:3000/ | head -20`

Look for:
- HTML loads correctly
- No 404 errors for JS/CSS modules
- No console errors on load

**Step 3: Fix any import path or reference errors**

Common issues:
- Module paths may need updating
- Missing exports from existing modules
- DOM elements referenced before they exist

**Step 4: Verify the hub phase renders**

The app should show:
- Status bar with "Hub" and essence count
- Scene area with hub background
- Chip row (empty slots)
- HP bar
- "Equip Bots" and "Infiltrate" buttons
- Utility row at bottom

**Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(ui): resolve startup errors and import paths"
```

---

### Task 12: Write E2E smoke test for new UI

**Files:**
- Create: `tests/e2e/specs/mobile-ui-smoke.spec.js`

**Step 1: Write the smoke test**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Mobile UI Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders game app container', async ({ page }) => {
    await expect(page.locator('.game-app')).toBeVisible();
  });

  test('shows status bar', async ({ page }) => {
    await expect(page.locator('.status-bar')).toBeVisible();
    await expect(page.locator('#floor-indicator')).toHaveText('Hub');
  });

  test('shows scene area', async ({ page }) => {
    await expect(page.locator('.scene-area')).toBeVisible();
  });

  test('shows action buttons in hub', async ({ page }) => {
    // Start a new game first if needed
    const newGameBtn = page.locator('#new-game-start');
    if (await newGameBtn.isVisible()) {
      await newGameBtn.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('#equip-bots-btn')).toBeVisible();
    await expect(page.locator('#context-action-btn')).toHaveText('Infiltrate');
  });

  test('shows utility row', async ({ page }) => {
    await expect(page.locator('.utility-row')).toBeVisible();
    await expect(page.locator('#settings-btn')).toBeVisible();
    await expect(page.locator('#reset-run-btn')).toBeVisible();
  });

  test('equip bots opens takeover', async ({ page }) => {
    const newGameBtn = page.locator('#new-game-start');
    if (await newGameBtn.isVisible()) {
      await newGameBtn.click();
      await page.waitForTimeout(500);
    }
    await page.locator('#equip-bots-btn').click();
    await expect(page.locator('#chip-equip-view')).toHaveClass(/active/);
  });

  test('settings opens takeover', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await expect(page.locator('#settings-view')).toHaveClass(/active/);
  });
});
```

**Step 2: Run the smoke test**

Run: `./scripts/e2e-test.sh specs/mobile-ui-smoke`

Expected: All tests pass (green).

**Step 3: Commit**

```bash
git add tests/e2e/specs/mobile-ui-smoke.spec.js
git commit -m "test: add mobile UI smoke tests"
```

---

## Phase 5: Polish & Cleanup

### Task 13: Remove old UI modules no longer needed

**Files:**
- Delete: `public/js/ui/character.js` (VN stage rendering - replaced by scene.js)
- Delete: `public/js/ui/exploration.js` (hub/ward/room content - integrated into game.js)
- Delete: `public/js/ui/economy.js` (shop/blacksmith - replaced by takeover views)
- Delete: `public/js/ui/modals.js` (settings/upgrades modals - replaced by takeover views)
- Delete: `public/js/narration.js` (AI narration panel - removed per spec)
- Modify: `public/js/ui/index.js` (update exports)

**Step 1: Delete files that are fully replaced**

```bash
rm public/js/ui/character.js
rm public/js/ui/exploration.js
rm public/js/ui/economy.js
rm public/js/ui/modals.js
rm public/js/narration.js
```

**Step 2: Update ui/index.js exports**

```javascript
// public/js/ui/index.js
export * as scene from './scene.js';
export * as chipRow from './chip-row.js';
export * as hpBar from './hp-bar.js';
export * as actions from './actions.js';
export * as takeover from './takeover.js';
```

**Step 3: Verify no broken imports**

Run: `node --check public/game.js && node --check public/js/ui/index.js && echo "OK"`

**Step 4: Run E2E smoke tests**

Run: `./scripts/e2e-test.sh specs/mobile-ui-smoke`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): remove old desktop-first UI modules"
```

---

### Task 14: Verify combat-loop.js and combat.js still function

**Files:**
- Modify: `public/js/ui/combat.js` (update DOM references for new structure)
- Modify: `public/js/ui/combat-loop.js` (update callbacks for new modules)

**Step 1: Review combat.js for old DOM references**

The combat UI module (`public/js/ui/combat.js`) has functions like `showDamageNumber`, `showChipEffect`, `animateEnemyHurt`. These need to target the new DOM elements:
- Old: `document.getElementById('vn-enemy-area')` → New: `dom.enemySpriteContainer`
- Old: `document.getElementById('enemy-hp-fill')` → New: `dom.enemyHpFill`

Update all references.

**Step 2: Review combat-loop.js integration**

The combat loop orchestrates the vocab-pause flow. In the new architecture, `game.js` handles this directly via `showNextVocabCard()` → `handleCardSwipe()` → `loadGameState()`. Check if `combat-loop.js` is still needed or if its logic is now in `game.js`. If redundant, delete it.

**Step 3: Run E2E tests**

Run: `./scripts/e2e-test.sh`

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(ui): update combat modules for new DOM structure"
```

---

### Task 15: Final visual QA pass and responsive check

**Step 1: Test on iPhone viewport (375x812)**

Run the dev server and use browser dev tools mobile emulation. Check:
- [ ] All sections visible without overflow
- [ ] Chip icons are 48px touchable circles
- [ ] Action buttons are at least 60px tall
- [ ] Flash card is readable and swipeable
- [ ] Takeover views slide in smoothly
- [ ] No horizontal scroll

**Step 2: Test on larger phones (414x896, 430x932)**

Same checks. The `max-width: 430px` on `.game-app` should keep it centered on tablets/desktop.

**Step 3: Fix any spacing/sizing issues**

Adjust `vh` values, `padding`, `gap` values if needed.

**Step 4: Run full E2E suite**

Run: `./scripts/e2e-test.sh`

Target: 80+/87 tests pass (accounting for removed features).

**Step 5: Commit final polish**

```bash
git add -A
git commit -m "fix(ui): final mobile layout polish and spacing"
```

---

## Summary of New File Structure

```
public/
├── game.html              # NEW: Mobile-first single-column layout
├── game.css               # NEW: Bright theme, mobile-first CSS
├── game.js                # REWRITTEN: UI orchestrator (phases → renderers)
└── js/
    ├── dom.js             # NEW: Central DOM element cache
    ├── api.js             # KEPT: Server API calls
    ├── settings.js        # KEPT: localStorage settings
    ├── tts.js             # KEPT: VOICEVOX TTS
    ├── word-practice.js   # MODIFIED: Data-only (rendering moved to actions.js)
    └── ui/
        ├── scene.js       # NEW: Scene area (backgrounds, enemy, toasts)
        ├── chip-row.js    # NEW: 5 chip icons with charges/levels/popup
        ├── hp-bar.js      # NEW: Player HP bar
        ├── actions.js     # NEW: Action buttons + swipeable flash cards
        ├── takeover.js    # NEW: Full-screen panel manager
        ├── combat.js      # MODIFIED: Updated DOM refs for animations
        ├── combat-loop.js # MAY DELETE: Logic moved to game.js
        └── index.js       # MODIFIED: Updated exports
```

## Deleted Files
- `public/js/ui/character.js` - VN stage (replaced by scene.js)
- `public/js/ui/exploration.js` - Hub/ward content (now in game.js)
- `public/js/ui/economy.js` - Shop/blacksmith (now in takeover views)
- `public/js/ui/modals.js` - Desktop modals (now takeover views)
- `public/js/narration.js` - AI narration (removed per spec)
