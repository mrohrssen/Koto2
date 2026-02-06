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
  dealer: {
    npc: { x: 0.5, y: 0.25, type: 'dealer' },
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
    console.log('[DEBUG] ExplorationScene preload() called');
    // Load player walk spritesheet (48x64 per frame, 8 cols x 6 rows)
    this.load.spritesheet('player-walk', 'assets/exploration/player/walk.png', {
      frameWidth: 48,
      frameHeight: 64
    });

    // Load room background
    this.load.image('room-background', 'assets/exploration/background.webp');
    // Note: placeholder textures created in create() - graphics can't be made during preload

    // Log load completion
    this.load.on('complete', () => {
      console.log('[DEBUG] ExplorationScene assets loaded');
    });
    this.load.on('loaderror', (file) => {
      console.error('[DEBUG] ExplorationScene load error:', file.key, file.src);
    });
  }

  createAnimations() {
    // 6 directions, 8 frames each
    // Row 0: down (frames 0-7)
    // Row 1: left-down (frames 8-15)
    // Row 2: left-up (frames 16-23)
    // Row 3: right-down (frames 24-31)
    // Row 4: up (frames 32-39) - swapped with row 5
    // Row 5: right-up (frames 40-47) - swapped with row 4

    const directions = [
      { key: 'walk-down', start: 0 },
      { key: 'walk-left-down', start: 8 },
      { key: 'walk-left-up', start: 16 },
      { key: 'walk-right-down', start: 24 },
      { key: 'walk-up', start: 32 },
      { key: 'walk-right-up', start: 40 }
    ];

    directions.forEach(dir => {
      if (!this.anims.exists(dir.key)) {
        this.anims.create({
          key: dir.key,
          frames: this.anims.generateFrameNumbers('player-walk', {
            start: dir.start,
            end: dir.start + 7
          }),
          frameRate: 10,
          repeat: -1
        });
      }

      // Also create idle (single frame) for each direction
      const idleKey = dir.key.replace('walk-', 'idle-');
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: [{ key: 'player-walk', frame: dir.start }],
          frameRate: 1,
          repeat: 0
        });
      }
    });
  }

  createPlaceholderTextures() {
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
    console.log('[DEBUG] ExplorationScene create() called');
    const { width, height } = this.scale;
    console.log('[DEBUG] Canvas size:', width, 'x', height);

    // Create placeholder textures (must be in create, not preload)
    this.createPlaceholderTextures();

    // Create player animations
    this.createAnimations();

    // Background image (scaled to fit canvas)
    const bg = this.add.image(width / 2, height / 2, 'room-background');
    // Scale to cover the canvas (background is 1504x2848, canvas is 400x760)
    const scaleX = width / bg.width;
    const scaleY = height / bg.height;
    const scale = Math.max(scaleX, scaleY); // Cover entire canvas
    bg.setScale(scale);

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
  }

  createPlayer() {
    const { width, height } = this.scale;

    // Use saved position if available, otherwise default spawn point
    const spawnX = this.roomData.playerPosition?.x ?? width / 2;
    const spawnY = this.roomData.playerPosition?.y ?? height * 0.75;

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player-walk');
    this.player.setScale(2); // 2x size for visibility
    this.player.setCollideWorldBounds(true);
    // Collision box smaller than sprite (feet area)
    this.player.body.setSize(24, 16);
    this.player.body.setOffset(12, 48); // Offset to bottom of sprite

    // Start facing down
    this.player.play('idle-down');

    // Store last direction for idle
    this.player.setData('lastDirection', 'down');
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

    // Create NPC/Enemy (show even if interacted, but visually different)
    if (template.npc) {
      this.npc = this.physics.add.sprite(
        width * template.npc.x,
        height * template.npc.y,
        'npc-placeholder'
      );
      this.npc.body.setImmovable(true);
      this.npc.setData('npcType', template.npc.type);
      this.npc.setData('roomType', this.roomData.type);
      this.npc.setData('interacted', this.roomData.interacted);

      // If already interacted, show as defeated (grayed out, no collision for interaction)
      if (this.roomData.interacted) {
        this.npc.setAlpha(0.4);
        this.npc.setTint(0x666666);
      }
    }

    // Create credits only if room not yet interacted
    this.credits = [];
    if (!this.roomData.interacted) {
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
  }

  setupCollisions() {
    // Player near doors
    this.doors.forEach(door => {
      this.physics.add.overlap(this.player, door, () => {
        this.setInteractionTarget(door, 'ENTER');
      });
    });

    // Player near NPC (only if not already interacted/defeated)
    if (this.npc && !this.npc.getData('interacted')) {
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
    // Remove any existing listeners first (scene may restart)
    gameEvents.off('doorEnter');
    gameEvents.off('creditGrab');
    gameEvents.off('npcTalk');
    gameEvents.off('interactionComplete');

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
    // Guard against destroyed or invalid credit objects
    if (!credit || !credit.active) {
      return;
    }
    const amount = credit.getData('amount');
    if (typeof amount !== 'number') {
      return;
    }
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
