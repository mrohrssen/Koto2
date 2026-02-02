# Phaser Exploration System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Phaser 3 walk-around exploration between encounters with phase-based music integration.

**Architecture:** Phaser handles room exploration (walking, context buttons, doors). HTML/CSS handles combat, menus, dialogue. A bridge module coordinates visibility toggling and event passing. Phase-based music plays appropriate tracks during exploration vs combat.

**Tech Stack:** Phaser 3 (CDN), ES6 modules, existing Express backend, anime.js for HTML effects

**Design Specs:**
- `docs/plans/2026-02-01-phaser-exploration-design.md` - Full exploration design
- `docs/plans/2026-02-01-phase-based-music-design.md` - Music system design

---

## Task 1: Add Phase-Based Music System

**Files:**
- Modify: `public/js/audio.js`
- Modify: `public/game.js`

**Step 1: Add PHASE_TRACKS config to audio.js**

Add after line 26 (after `let bgmPlaying = false;`):

```javascript
// Phase-based BGM mapping
const PHASE_TRACKS = {
  hub: 'main',
  exploration: 'main',
  combat: 'main',
  boss: 'main',
  victory: 'main',
  defeat: 'main',
  floorComplete: 'main',
  runComplete: 'main',
};
```

**Step 2: Add getTrackForPhase function to audio.js**

Add before the `// ============ VOLUME & MUTE ============` section:

```javascript
// ============ PHASE-BASED BGM ============

/**
 * Get the track name for a given game phase.
 * @param {string} phase - Current game phase
 * @param {boolean} isBossRoom - Whether current room is a boss room
 * @returns {string} Track name
 */
export function getTrackForPhase(phase, isBossRoom = false) {
  if (phase === 'combat' && isBossRoom) return PHASE_TRACKS.boss;

  const mapping = {
    hub: 'hub',
    exploring: 'exploration',
    room: 'exploration',
    room_encounter: 'exploration',
    shrine: 'exploration',
    quiz: 'exploration',
    wordDiscovery: 'exploration',
    ward_selection: 'exploration',
    branch_selection: 'exploration',
    combat: 'combat',
    victory: 'victory',
    post_combat_shop: 'victory',
    defeat: 'defeat',
    run_ended: 'defeat',
    floor_complete: 'floorComplete',
    run_complete: 'runComplete',
  };

  return PHASE_TRACKS[mapping[phase]] || PHASE_TRACKS.hub;
}

let currentTrack = null;

/**
 * Update BGM based on current game phase.
 * Only changes track if different from current.
 * @param {string} phase - Current game phase
 * @param {boolean} isBossRoom - Whether current room is a boss room
 */
export function updateBGMForPhase(phase, isBossRoom = false) {
  const track = getTrackForPhase(phase, isBossRoom);
  if (track !== currentTrack) {
    currentTrack = track;
    playBGM(track);
  }
}
```

**Step 3: Hook updateBGMForPhase into game.js updateUI**

Modify `updateUI()` in `public/game.js` (around line 148):

```javascript
function updateUI() {
  updateStatusBar();
  updateScene();
  updateChipRow();
  updatePlayerHP();
  updateGameContent();

  // Update BGM based on phase
  const isBossRoom = gameState.run?.rooms?.[gameState.run?.currentRoom]?.type === 'boss';
  audio.updateBGMForPhase(gameState.phase, isBossRoom);
}
```

**Step 4: Remove manual playBGM calls in game.js**

Remove `audio.playBGM('main');` from:
- Line 334 in `startNewRun()`
- Lines 800-802 in `ensureAudio()` (the if block checking phase)

**Step 5: Verify syntax**

Run: `node --check public/js/audio.js && node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 6: Commit**

```bash
git add public/js/audio.js public/game.js
git commit -m "feat: add phase-based music system

Tracks change automatically based on game phase. All tracks initially
point to main.mp3 and can be replaced individually."
```

---

## Task 2: Add Phaser Script and Canvas Container

**Files:**
- Modify: `public/game.html`

**Step 1: Add Phaser CDN script**

Add before the game.js script tag (before line 210):

```html
  <!-- Phaser 3 for exploration -->
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>

  <script type="module" src="game.js"></script>
```

**Step 2: Add Phaser canvas container**

Add after the scene-area div (after line 46, after `</div>` closing scene-area):

```html
    <!-- Phaser Exploration Canvas (hidden by default) -->
    <div class="phaser-container" id="phaser-container" style="display: none;">
      <div id="phaser-game"></div>
    </div>
```

**Step 3: Verify HTML syntax**

Run: `head -60 public/game.html | tail -20`
Expected: Shows the new Phaser container

**Step 4: Commit**

```bash
git add public/game.html
git commit -m "feat: add Phaser container and CDN script to game.html"
```

---

## Task 3: Add Phaser Container CSS

**Files:**
- Modify: `public/game.css`

**Step 1: Add Phaser container styles**

Add at the end of the file:

```css
/* ============ PHASER EXPLORATION ============ */

.phaser-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  background: #000;
}

.phaser-container canvas {
  display: block;
  margin: 0 auto;
}

/* Context button at bottom of Phaser view */
.exploration-context-btn {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  left: 50%;
  transform: translateX(-50%);
  padding: 16px 48px;
  font-size: 18px;
  font-weight: bold;
  text-transform: uppercase;
  background: var(--accent-orange, #f39c12);
  color: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
  pointer-events: none;
}

.exploration-context-btn.visible {
  opacity: 1;
  pointer-events: auto;
}

.exploration-context-btn:active {
  transform: translateX(-50%) scale(0.95);
}
```

**Step 2: Verify CSS syntax**

Run: `tail -40 public/game.css`
Expected: Shows the new Phaser styles

**Step 3: Commit**

```bash
git add public/game.css
git commit -m "feat: add Phaser container and context button CSS"
```

---

## Task 4: Create Phaser Bridge Module

**Files:**
- Create: `public/js/phaser/phaser-bridge.js`

**Step 1: Create the phaser directory**

Run: `mkdir -p public/js/phaser`

**Step 2: Write the bridge module**

```javascript
/**
 * @file phaser-bridge.js - Communication between Phaser and HTML UI
 *
 * Handles:
 * - Showing/hiding Phaser canvas vs HTML game UI
 * - Event passing between Phaser scene and game.js
 * - Room data fetching for Phaser scenes
 */

// Event emitter for Phaser <-> HTML communication
class GameEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }
}

// Global event emitter
export const gameEvents = new GameEventEmitter();

// Make available globally for Phaser scene access
window.gameEvents = gameEvents;

// DOM references
let phaserContainer = null;
let htmlGameApp = null;
let phaserGame = null;

/**
 * Initialize the bridge with DOM references.
 */
export function init() {
  phaserContainer = document.getElementById('phaser-container');
  htmlGameApp = document.querySelector('.game-app');
}

/**
 * Show Phaser exploration view, hide HTML UI.
 */
export function showPhaser() {
  if (phaserContainer) {
    phaserContainer.style.display = 'block';
  }
  if (htmlGameApp) {
    // Hide scene area and action area, keep status bar and utility row
    const sceneArea = document.getElementById('scene-area');
    const actionArea = document.getElementById('action-area');
    const chipRow = document.getElementById('chip-row');
    const playerHp = document.getElementById('player-hp-container');
    if (sceneArea) sceneArea.style.display = 'none';
    if (actionArea) actionArea.style.display = 'none';
    if (chipRow) chipRow.style.display = 'none';
    if (playerHp) playerHp.style.display = 'none';
  }
}

/**
 * Hide Phaser, show HTML UI.
 */
export function hidePhaser() {
  if (phaserContainer) {
    phaserContainer.style.display = 'none';
  }
  if (htmlGameApp) {
    const sceneArea = document.getElementById('scene-area');
    const actionArea = document.getElementById('action-area');
    const chipRow = document.getElementById('chip-row');
    const playerHp = document.getElementById('player-hp-container');
    if (sceneArea) sceneArea.style.display = '';
    if (actionArea) actionArea.style.display = '';
    if (chipRow) chipRow.style.display = '';
    if (playerHp) playerHp.style.display = '';
  }
}

/**
 * Check if Phaser view is currently visible.
 */
export function isPhaserVisible() {
  return phaserContainer?.style.display !== 'none';
}

/**
 * Set the Phaser game instance reference.
 */
export function setPhaserGame(game) {
  phaserGame = game;
  window.phaserGame = game;
}

/**
 * Get the Phaser game instance.
 */
export function getPhaserGame() {
  return phaserGame;
}

/**
 * Notify Phaser that an interaction is complete.
 * @param {object} data - Interaction result data
 */
export function notifyInteractionComplete(data) {
  gameEvents.emit('interactionComplete', data);
}
```

**Step 3: Verify syntax**

Run: `node --check public/js/phaser/phaser-bridge.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add public/js/phaser/phaser-bridge.js
git commit -m "feat: add Phaser bridge module for HTML/Phaser communication"
```

---

## Task 5: Create Exploration Controls Module

**Files:**
- Create: `public/js/phaser/exploration-controls.js`

**Step 1: Write the controls module**

```javascript
/**
 * @file exploration-controls.js - Touch and keyboard input for exploration
 *
 * Implements floating touch joystick (touch anywhere, drag to move)
 * and keyboard fallback (WASD/arrows).
 */

export class ExplorationControls {
  constructor(scene) {
    this.scene = scene;
    this.player = null;
    this.moveSpeed = 150;

    // Touch state
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchActive = false;
    this.touchPointerId = null;

    // Movement vector
    this.moveX = 0;
    this.moveY = 0;

    // Keyboard
    this.cursors = null;
    this.wasd = null;
  }

  /**
   * Initialize controls for a player sprite.
   */
  init(player) {
    this.player = player;

    // Keyboard controls
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.wasd = this.scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // Touch controls
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
  }

  onPointerDown(pointer) {
    if (this.touchActive) return;
    this.touchActive = true;
    this.touchPointerId = pointer.id;
    this.touchStartX = pointer.x;
    this.touchStartY = pointer.y;
  }

  onPointerMove(pointer) {
    if (!this.touchActive || pointer.id !== this.touchPointerId) return;

    const dx = pointer.x - this.touchStartX;
    const dy = pointer.y - this.touchStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Deadzone of 10px
    if (distance < 10) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    // Normalize and scale by distance (capped at 50px for max speed)
    const scale = Math.min(distance, 50) / 50;
    this.moveX = (dx / distance) * scale;
    this.moveY = (dy / distance) * scale;
  }

  onPointerUp(pointer) {
    if (pointer.id !== this.touchPointerId) return;
    this.touchActive = false;
    this.touchPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
  }

  /**
   * Update player movement. Call in scene update().
   */
  update() {
    if (!this.player) return;

    let vx = 0;
    let vy = 0;

    // Keyboard input
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = 1;

    if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = 1;

    // Touch input overrides keyboard if active
    if (this.touchActive) {
      vx = this.moveX;
      vy = this.moveY;
    }

    // Apply velocity
    this.player.setVelocity(vx * this.moveSpeed, vy * this.moveSpeed);

    // Update player animation direction
    if (vx !== 0 || vy !== 0) {
      // Determine facing direction (prioritize horizontal)
      if (Math.abs(vx) > Math.abs(vy)) {
        this.player.anims.play(vx > 0 ? 'walk-right' : 'walk-left', true);
      } else {
        this.player.anims.play(vy > 0 ? 'walk-down' : 'walk-up', true);
      }
    } else {
      // Stop animation, show idle frame
      this.player.anims.stop();
    }
  }

  /**
   * Clean up event listeners.
   */
  destroy() {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/phaser/exploration-controls.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/phaser/exploration-controls.js
git commit -m "feat: add exploration touch and keyboard controls"
```

---

## Task 6: Create Exploration UI Module (Context Button)

**Files:**
- Create: `public/js/phaser/exploration-ui.js`

**Step 1: Write the UI module**

```javascript
/**
 * @file exploration-ui.js - Context button and UI overlays for exploration
 *
 * Handles the context-sensitive action button (ENTER/GRAB/TALK)
 * that appears when player is near interactive objects.
 */

import { gameEvents } from './phaser-bridge.js';

let contextButton = null;
let currentContext = null;

/**
 * Initialize the context button DOM element.
 */
export function init() {
  // Create button if it doesn't exist
  if (!contextButton) {
    contextButton = document.createElement('button');
    contextButton.className = 'exploration-context-btn';
    contextButton.textContent = 'INTERACT';
    document.getElementById('phaser-container')?.appendChild(contextButton);

    contextButton.addEventListener('click', onContextButtonClick);
  }
}

/**
 * Show the context button with specified action.
 * @param {string} action - 'ENTER', 'GRAB', or 'TALK'
 * @param {object} target - The object being interacted with
 */
export function showContextButton(action, target) {
  if (!contextButton) return;
  currentContext = { action, target };
  contextButton.textContent = action;
  contextButton.classList.add('visible');
}

/**
 * Hide the context button.
 */
export function hideContextButton() {
  if (!contextButton) return;
  currentContext = null;
  contextButton.classList.remove('visible');
}

/**
 * Handle context button click.
 */
function onContextButtonClick() {
  if (!currentContext) return;

  const { action, target } = currentContext;

  switch (action) {
    case 'ENTER':
      gameEvents.emit('doorEnter', { door: target });
      break;
    case 'GRAB':
      gameEvents.emit('creditGrab', { credit: target });
      break;
    case 'TALK':
      gameEvents.emit('npcTalk', { npc: target });
      break;
  }

  hideContextButton();
}

/**
 * Clean up the context button.
 */
export function destroy() {
  if (contextButton) {
    contextButton.removeEventListener('click', onContextButtonClick);
    contextButton.remove();
    contextButton = null;
  }
  currentContext = null;
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/phaser/exploration-ui.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/phaser/exploration-ui.js
git commit -m "feat: add exploration context button UI"
```

---

## Task 7: Create Exploration Scene

**Files:**
- Create: `public/js/phaser/exploration-scene.js`

**Step 1: Write the main scene**

```javascript
/**
 * @file exploration-scene.js - Main Phaser scene for room exploration
 *
 * Handles room rendering, player movement, object interactions,
 * and door transitions.
 */

import { ExplorationControls } from './exploration-controls.js';
import * as explorationUI from './exploration-ui.js';
import { gameEvents } from './phaser-bridge.js';

// Room template layouts (positions as percentages of canvas)
const ROOM_TEMPLATES = {
  encounter: {
    npc: { x: 0.5, y: 0.25, type: 'enemy' },
    credits: [
      { x: 0.3, y: 0.45 },
      { x: 0.7, y: 0.45 }
    ]
  },
  shrine: {
    npc: { x: 0.5, y: 0.25, type: 'shrine' },
    credits: []
  },
  quiz: {
    npc: { x: 0.5, y: 0.25, type: 'quiz' },
    credits: []
  },
  wordDiscovery: {
    npc: { x: 0.5, y: 0.25, type: 'terminal' },
    credits: []
  },
  boss: {
    npc: { x: 0.5, y: 0.25, type: 'boss' },
    credits: []
  }
};

// Door positions (2 doors, fixed for prototype)
const DOOR_POSITIONS = [
  { x: 0.3, y: 0.08 },
  { x: 0.7, y: 0.08 }
];

export class ExplorationScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ExplorationScene' });
    this.controls = null;
    this.player = null;
    this.npc = null;
    this.doors = [];
    this.credits = [];
    this.roomData = null;
    this.interactionTarget = null;
  }

  init(data) {
    this.roomData = data.roomData || {
      type: 'encounter',
      floor: 1,
      doorDestinations: [0, 1]
    };
  }

  preload() {
    // Load placeholder assets (will be replaced with real assets)
    // For now, create simple colored rectangles as placeholders
    this.createPlaceholderTextures();
  }

  createPlaceholderTextures() {
    // Player placeholder (32x32 cyan square)
    const playerGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    playerGraphics.fillStyle(0x00ffff);
    playerGraphics.fillRect(0, 0, 32, 32);
    playerGraphics.generateTexture('player-placeholder', 32, 32);

    // NPC placeholder (48x48 magenta square)
    const npcGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    npcGraphics.fillStyle(0xff00ff);
    npcGraphics.fillRect(0, 0, 48, 48);
    npcGraphics.generateTexture('npc-placeholder', 48, 48);

    // Door placeholder (60x80 green rectangle)
    const doorGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    doorGraphics.fillStyle(0x00ff00);
    doorGraphics.fillRect(0, 0, 60, 80);
    doorGraphics.generateTexture('door-placeholder', 60, 80);

    // Credit placeholder (24x24 yellow circle)
    const creditGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    creditGraphics.fillStyle(0xffff00);
    creditGraphics.fillCircle(12, 12, 12);
    creditGraphics.generateTexture('credit-placeholder', 24, 24);
  }

  create() {
    const { width, height } = this.scale;

    // Background (simple gradient for now)
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Add floor indicator
    const floorText = this.add.text(width / 2, 30, `Floor ${this.roomData.floor}`, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'sans-serif'
    });
    floorText.setOrigin(0.5);

    // Create doors
    this.createDoors();

    // Create room contents based on type
    this.createRoomContents();

    // Create player
    this.createPlayer();

    // Initialize controls
    this.controls = new ExplorationControls(this);
    this.controls.init(this.player);

    // Initialize UI
    explorationUI.init();

    // Set up event listeners
    this.setupEventListeners();

    // Set up collisions
    this.setupCollisions();

    // Enable lighting (for HD2D effect)
    this.setupLighting();
  }

  createPlayer() {
    const { width, height } = this.scale;
    this.player = this.physics.add.sprite(width / 2, height * 0.75, 'player-placeholder');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(24, 24);
  }

  createDoors() {
    const { width, height } = this.scale;
    this.doors = [];

    DOOR_POSITIONS.forEach((pos, index) => {
      const door = this.physics.add.sprite(
        width * pos.x,
        height * pos.y,
        'door-placeholder'
      );
      door.body.setImmovable(true);
      door.setData('doorIndex', index);
      door.setData('destination', this.roomData.doorDestinations?.[index] ?? index);
      this.doors.push(door);
    });
  }

  createRoomContents() {
    const { width, height } = this.scale;
    const template = ROOM_TEMPLATES[this.roomData.type] || ROOM_TEMPLATES.encounter;

    // Create NPC/Enemy
    if (template.npc) {
      this.npc = this.physics.add.sprite(
        width * template.npc.x,
        height * template.npc.y,
        'npc-placeholder'
      );
      this.npc.body.setImmovable(true);
      this.npc.setData('npcType', template.npc.type);
      this.npc.setData('roomType', this.roomData.type);
    }

    // Create credits
    this.credits = [];
    template.credits.forEach((pos, index) => {
      const credit = this.physics.add.sprite(
        width * pos.x,
        height * pos.y,
        'credit-placeholder'
      );
      credit.setData('creditIndex', index);
      credit.setData('amount', 10);
      this.credits.push(credit);
    });
  }

  setupCollisions() {
    // Player near doors
    this.doors.forEach(door => {
      this.physics.add.overlap(this.player, door, () => {
        this.setInteractionTarget(door, 'ENTER');
      });
    });

    // Player near NPC
    if (this.npc) {
      this.physics.add.overlap(this.player, this.npc, () => {
        this.setInteractionTarget(this.npc, 'TALK');
      });
    }

    // Player near credits
    this.credits.forEach(credit => {
      this.physics.add.overlap(this.player, credit, () => {
        this.setInteractionTarget(credit, 'GRAB');
      });
    });
  }

  setInteractionTarget(target, action) {
    // Only update if this is a new/closer target
    if (this.interactionTarget !== target) {
      this.interactionTarget = target;
      explorationUI.showContextButton(action, target);
    }
  }

  clearInteractionTarget() {
    this.interactionTarget = null;
    explorationUI.hideContextButton();
  }

  setupEventListeners() {
    // Door entered
    gameEvents.on('doorEnter', (data) => {
      this.handleDoorEnter(data.door);
    });

    // Credit grabbed
    gameEvents.on('creditGrab', (data) => {
      this.handleCreditGrab(data.credit);
    });

    // NPC talked to
    gameEvents.on('npcTalk', (data) => {
      this.handleNpcTalk(data.npc);
    });

    // Interaction complete (from HTML UI)
    gameEvents.on('interactionComplete', (data) => {
      this.handleInteractionComplete(data);
    });
  }

  handleDoorEnter(door) {
    const destination = door.getData('destination');
    gameEvents.emit('roomTransition', { destination });
  }

  handleCreditGrab(credit) {
    const amount = credit.getData('amount');
    credit.destroy();
    this.credits = this.credits.filter(c => c !== credit);
    gameEvents.emit('creditsCollected', { amount });
    this.clearInteractionTarget();
  }

  handleNpcTalk(npc) {
    const roomType = npc.getData('roomType');
    const npcType = npc.getData('npcType');
    gameEvents.emit('startInteraction', { type: roomType, npcType });
  }

  handleInteractionComplete(data) {
    // Re-enable doors if interaction allows proceeding
    if (data.canProceed) {
      // Doors are already active
    }
  }

  setupLighting() {
    // Enable light pipeline
    this.lights.enable();
    this.lights.setAmbientColor(0x555555);

    // Add point light at center
    this.lights.addLight(this.scale.width / 2, this.scale.height / 2, 200, 0xffffff, 0.5);
  }

  update() {
    // Update controls
    this.controls.update();

    // Check if player moved away from interaction target
    if (this.interactionTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.interactionTarget.x, this.interactionTarget.y
      );
      if (distance > 50) {
        this.clearInteractionTarget();
      }
    }
  }

  shutdown() {
    this.controls?.destroy();
    explorationUI.destroy();
    gameEvents.off('doorEnter');
    gameEvents.off('creditGrab');
    gameEvents.off('npcTalk');
    gameEvents.off('interactionComplete');
  }
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/phaser/exploration-scene.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/phaser/exploration-scene.js
git commit -m "feat: add main exploration Phaser scene with room templates"
```

---

## Task 8: Create Phaser Game Initializer

**Files:**
- Create: `public/js/phaser/index.js`

**Step 1: Write the initializer**

```javascript
/**
 * @file index.js - Phaser game initialization and management
 *
 * Creates the Phaser game instance and provides functions to
 * start/stop exploration mode.
 */

import { ExplorationScene } from './exploration-scene.js';
import * as bridge from './phaser-bridge.js';

let game = null;

/**
 * Initialize the Phaser game instance.
 */
export function initPhaser() {
  if (game) return game;

  bridge.init();

  const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: 400,
    height: 760,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },
    scene: [ExplorationScene]
  };

  game = new Phaser.Game(config);
  bridge.setPhaserGame(game);

  return game;
}

/**
 * Start exploration mode with room data.
 * @param {object} roomData - Room type, floor, door destinations
 */
export function startExploration(roomData) {
  if (!game) {
    initPhaser();
  }

  bridge.showPhaser();

  // Start or restart the exploration scene with new room data
  const scene = game.scene.getScene('ExplorationScene');
  if (scene) {
    scene.scene.restart({ roomData });
  } else {
    game.scene.start('ExplorationScene', { roomData });
  }
}

/**
 * Stop exploration mode and return to HTML UI.
 */
export function stopExploration() {
  bridge.hidePhaser();

  if (game) {
    const scene = game.scene.getScene('ExplorationScene');
    if (scene) {
      scene.scene.pause();
    }
  }
}

/**
 * Get the bridge module for event handling.
 */
export { gameEvents } from './phaser-bridge.js';

/**
 * Check if exploration is currently active.
 */
export function isExplorationActive() {
  return bridge.isPhaserVisible();
}
```

**Step 2: Verify syntax**

Run: `node --check public/js/phaser/index.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add public/js/phaser/index.js
git commit -m "feat: add Phaser game initializer module"
```

---

## Task 9: Add Collect Credits API Endpoint

**Files:**
- Modify: `server.js`

**Step 1: Add the endpoint**

Find the game routes section (search for `/api/game/`) and add this endpoint:

```javascript
// Collect credits during exploration
app.post('/api/game/collect-credits', requireAuth, (req, res) => {
  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const userId = req.user?.id;
  const state = gameManager.getState(userId);

  if (!state.player) {
    return res.status(400).json({ error: 'No active player' });
  }

  // Add credits to player gold
  state.player.gold = (state.player.gold || 0) + amount;
  gameManager.updatePlayer(userId, { gold: state.player.gold });

  res.json({
    success: true,
    amount,
    newTotal: state.player.gold
  });
});
```

**Step 2: Verify syntax**

Run: `node --check server.js && echo "OK"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /api/game/collect-credits endpoint for exploration"
```

---

## Task 10: Integrate Phaser with game.js

**Files:**
- Modify: `public/game.js`

**Step 1: Add Phaser imports**

Add after the existing imports (around line 56):

```javascript
import * as phaser from './js/phaser/index.js';
import { gameEvents } from './js/phaser/phaser-bridge.js';
```

**Step 2: Add Phaser event handlers**

Add after the `// ============ FLASH CARD HANDLERS ============` section (around line 445):

```javascript
// ============ PHASER EXPLORATION HANDLERS ============

function setupPhaserEventListeners() {
  // Room transition via door
  gameEvents.on('roomTransition', async (data) => {
    phaser.stopExploration();
    // Use existing room advance API
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      // If still in exploration phase, restart Phaser with new room
      if (gameState.phase === 'exploring' || gameState.phase === 'room') {
        const roomData = getRoomDataForPhaser();
        phaser.startExploration(roomData);
      } else {
        updateUI();
      }
    }
  });

  // Credits collected
  gameEvents.on('creditsCollected', async (data) => {
    try {
      const response = await fetch('/api/game/collect-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ amount: data.amount })
      });
      const result = await response.json();
      if (result.success) {
        scene.showToast(`+${data.amount} credits`, 1500);
        // Update local state
        if (gameState.player) {
          gameState.player.gold = result.newTotal;
        }
      }
    } catch (e) {
      console.error('Failed to collect credits:', e);
    }
  });

  // Start interaction (NPC talk, combat, etc.)
  gameEvents.on('startInteraction', async (data) => {
    phaser.stopExploration();

    switch (data.type) {
      case 'encounter':
      case 'boss':
        await startEncounter();
        break;
      case 'shrine':
        // Load shrine state and render
        await loadGameState();
        updateUI();
        break;
      case 'quiz':
        await loadGameState();
        updateUI();
        break;
      case 'wordDiscovery':
        await loadGameState();
        updateUI();
        break;
      default:
        updateUI();
    }
  });
}

/**
 * Get room data formatted for Phaser scene.
 */
function getRoomDataForPhaser() {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  return {
    type: room?.type || 'encounter',
    floor: gameState.run?.floor || 1,
    doorDestinations: [0, 1] // Fixed 2 doors for prototype
  };
}

/**
 * Check if current phase should use Phaser exploration.
 */
function shouldUsePhaser() {
  // For now, disabled - enable when ready to test
  return false;
  // Future: return ['exploring', 'room'].includes(gameState.phase);
}
```

**Step 3: Call setupPhaserEventListeners in initGame**

Add to `initGame()` function, after `setupEventListeners();` (around line 764):

```javascript
  setupEventListeners();
  setupPhaserEventListeners();
```

**Step 4: Verify syntax**

Run: `node --check public/game.js && echo "OK"`
Expected: `OK`

**Step 5: Commit**

```bash
git add public/game.js
git commit -m "feat: integrate Phaser exploration with main game coordinator"
```

---

## Task 11: Add Placeholder Assets Directory

**Files:**
- Create: `public/assets/exploration/.gitkeep`

**Step 1: Create the directory**

Run: `mkdir -p public/assets/exploration && touch public/assets/exploration/.gitkeep`

**Step 2: Commit**

```bash
git add public/assets/exploration/.gitkeep
git commit -m "chore: add exploration assets directory placeholder"
```

---

## Task 12: Manual Integration Test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Open browser and verify**

1. Open http://localhost:3000
2. Login and start a run
3. Open browser console
4. Manually test Phaser initialization:
   ```javascript
   import('/js/phaser/index.js').then(p => {
     p.startExploration({ type: 'encounter', floor: 1, doorDestinations: [0, 1] });
   });
   ```
5. Verify:
   - Phaser canvas appears
   - Player sprite visible (cyan square placeholder)
   - Doors visible (green rectangles)
   - Touch/drag moves player
   - Context button appears near doors/NPC
6. Stop exploration:
   ```javascript
   import('/js/phaser/index.js').then(p => p.stopExploration());
   ```

**Step 3: Run E2E tests**

Run: `./scripts/e2e-test.sh`
Expected: 60+/66 tests pass (Phaser disabled by default, shouldn't break existing tests)

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify Phaser exploration integration

Manual test confirms:
- Phaser initializes and renders
- Player movement works
- Context buttons appear
- HTML/Phaser toggling works
- Existing E2E tests still pass"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Phase-based music system | audio.js, game.js |
| 2 | Phaser script/container in HTML | game.html |
| 3 | Phaser CSS styles | game.css |
| 4 | Phaser bridge module | phaser-bridge.js |
| 5 | Exploration controls | exploration-controls.js |
| 6 | Context button UI | exploration-ui.js |
| 7 | Main exploration scene | exploration-scene.js |
| 8 | Phaser initializer | phaser/index.js |
| 9 | Collect credits API | server.js |
| 10 | Game.js integration | game.js |
| 11 | Assets directory | exploration/.gitkeep |
| 12 | Manual integration test | - |

**Total: 12 tasks, ~12 commits**

**After implementation:**
- Phaser loads but is disabled by default (`shouldUsePhaser()` returns false)
- Phase-based music works immediately
- To enable Phaser: change `shouldUsePhaser()` to return `true` for exploring phases
- Real assets can replace placeholders later
