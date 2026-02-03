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
   * Determine animation direction from velocity.
   * Sprite has 6 directions: down, up, left-down, left-up, right-down, right-up
   */
  getDirectionFromVelocity(vx, vy) {
    const threshold = 0.3; // Threshold to consider movement in a direction

    const movingLeft = vx < -threshold;
    const movingRight = vx > threshold;
    const movingUp = vy < -threshold;
    const movingDown = vy > threshold;

    // Determine direction (6-way)
    if (movingDown && movingLeft) return 'left-down';
    if (movingDown && movingRight) return 'right-down';
    if (movingUp && movingLeft) return 'left-up';
    if (movingUp && movingRight) return 'right-up';
    if (movingDown) return 'down';
    if (movingUp) return 'up';
    // Pure left/right - use diagonal variants
    if (movingLeft) return 'left-down';
    if (movingRight) return 'right-down';

    return null; // Not moving
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

    // Handle animation
    const direction = this.getDirectionFromVelocity(vx, vy);
    const lastDirection = this.player.getData('lastDirection') || 'down';

    if (direction) {
      // Moving - play walk animation
      const animKey = `walk-${direction}`;
      if (this.player.anims.currentAnim?.key !== animKey) {
        this.player.play(animKey);
      }
      this.player.setData('lastDirection', direction);
    } else {
      // Stopped - play idle animation facing last direction
      const idleKey = `idle-${lastDirection}`;
      if (this.player.anims.currentAnim?.key !== idleKey) {
        this.player.play(idleKey);
      }
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
