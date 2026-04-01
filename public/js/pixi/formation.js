/**
 * @file formation.js — Creature sprite positioning + walking animation
 *
 * Renders creature formations (player and enemy) as PixiJS Sprites.
 * Handles diagonal stagger, depth scaling, walking wobble, and state transitions.
 */

import { Sprite, Assets, Container, Texture, Graphics } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';

const DEPTH_SCALES = [0.9, 0.95, 1.0]; // back, mid, front
const PLAYER_STAGGER_X = [12, 24, 36]; // px offset per row
const ENEMY_STAGGER_X = [-12, -24, -36]; // mirrored

let playerContainer = null;
let enemyContainer = null;
let creatureSprites = { player: [], enemy: [] };
let lastFormationInput = { player: null, enemy: null };
let walkingEnabled = false;
let walkTime = 0;
let activeGlow = null;
let activeGlowTickFn = null;

/**
 * Initialize formation containers. Called once from battle-stage init.
 */
export function initFormations() {
  const { layers } = getStage();
  if (!layers.creatures) return;

  playerContainer = new Container();
  enemyContainer = new Container();
  layers.creatures.addChild(playerContainer);
  layers.creatures.addChild(enemyContainer);
}

/**
 * Render a formation of creatures.
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 * @param {{ isBoss?: boolean }} opts
 */
export async function showFormation(side, creatures, { isBoss = false } = {}) {
  const { app } = getStage();
  if (!app) return;

  const container = side === 'player' ? playerContainer : enemyContainer;
  const sprites = creatureSprites[side];
  lastFormationInput[side] = {
    creatures: creatures ? [...creatures] : [],
    opts: { isBoss },
  };

  // Clear existing
  container.removeChildren();
  sprites.length = 0;

  if (!creatures || creatures.length === 0) return;

  // Slot placement: 1->middle, 2->top+bottom, 3->all three
  let slots;
  if (creatures.length === 1) {
    slots = [null, creatures[0], null];
  } else if (creatures.length === 2) {
    slots = [creatures[0], null, creatures[1]];
  } else {
    slots = [creatures[0], creatures[1], creatures[2]];
  }

  const staggerX = side === 'player' ? PLAYER_STAGGER_X : ENEMY_STAGGER_X;
  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const spriteSize = isBoss ? 120 : 60;

  // Base X position: player on left third, enemy on right third
  const baseX = side === 'player' ? screenW * 0.25 : screenW * 0.75;

  for (let i = 0; i < slots.length; i++) {
    const creature = slots[i];
    if (!creature) continue;

    // Load sprite texture
    const spritePath = creature.spriteImg || `/assets/sprites/creatures/${creature.id}.webp`;
    let texture;
    try {
      texture = await Assets.load(spritePath);
    } catch {
      texture = Texture.WHITE; // Fallback — will show as white square
    }

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = spriteSize;
    sprite.height = spriteSize;

    // Position: staggered diagonally
    const rowY = (screenH * 0.3) + (i * screenH * 0.2); // spread vertically
    sprite.x = baseX + staggerX[i];
    sprite.y = rowY;

    // Depth scaling
    sprite.scale.set(DEPTH_SCALES[i] * (spriteSize / texture.width));

    // Flip enemy sprites
    if (side === 'enemy') {
      sprite.scale.x *= -1;
    }

    // Store base position for walking animation
    sprite.baseX = sprite.x;
    sprite.baseY = sprite.y;
    sprite.phaseOffset = Math.random() * Math.PI * 2; // Random phase so they don't sync
    sprite.creatureData = creature;

    // KO state
    if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
      sprite.alpha = 0.3;
      sprite.tint = 0x888888;
    }

    container.addChild(sprite);
    sprites.push(sprite);
  }
}

/**
 * Hide a formation.
 * @param {'player'|'enemy'} side
 */
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
}

/**
 * Enable/disable walking wobble.
 */
export function setWalking(enabled) {
  walkingEnabled = enabled;
}

/**
 * Get a creature sprite by side and index (for targeting effects).
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @returns {Sprite|null}
 */
export function getCreatureSprite(side, index) {
  return creatureSprites[side]?.[index] || null;
}

/**
 * Show a pulsing glow outline on the active player creature during move selection.
 * @param {number} index - creature index in the player formation
 */
export function showActiveGlow(index) {
  clearActiveGlow();
  const sprite = getCreatureSprite('player', index);
  const { app, layers } = getStage();
  if (!sprite || !app) return;

  activeGlow = new Graphics();
  activeGlow.circle(0, 0, 38).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
  activeGlow.x = sprite.x;
  activeGlow.y = sprite.y;
  layers.effects.addChild(activeGlow);

  activeGlowTickFn = () => {
    const sprite = getCreatureSprite('player', index);
    if (sprite && activeGlow) {
      activeGlow.x = sprite.x;
      activeGlow.y = sprite.y;
    }
    activeGlow.alpha = 0.3 + 0.3 * Math.sin(Date.now() / 400);
  };
  app.ticker.add(activeGlowTickFn);
}

/**
 * Remove the active creature glow.
 */
export function clearActiveGlow() {
  if (activeGlow) {
    activeGlow.destroy();
    activeGlow = null;
  }
  if (activeGlowTickFn) {
    const { app } = getStage();
    app?.ticker.remove(activeGlowTickFn);
    activeGlowTickFn = null;
  }
}

/**
 * Ticker update — walking wobble animation.
 * @param {number} delta - PixiJS ticker deltaTime
 */
export function updateFormations(delta) {
  walkTime += delta * 0.05;

  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (sprite._entering) {
        sprite.x += (sprite._enterTarget - sprite.x) * 0.1;
        if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
          sprite.x = sprite._enterTarget;
          sprite.baseX = sprite._enterTarget;
          sprite._entering = false;
        }
        continue;
      }
      if (!walkingEnabled) continue;
      const t = walkTime + sprite.phaseOffset;
      // Bounce: 2px amplitude
      sprite.y = sprite.baseY + Math.sin(t * 3) * 2;
      // Rotation wobble: ~4.5 degrees
      sprite.rotation = Math.sin(t * 2.5) * 0.08;
    }
  }
}

/**
 * Animate a creature being knocked out.
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateKO(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  // Lazy import to avoid circular dependency (formation <- effects <- battle-stage <- formation)
  const { burstParticles } = await import('./effects.js');

  sprite.tint = 0x888888;
  const targetScaleX = sprite.scale.x * 0.5;
  const targetScaleY = sprite.scale.y * 0.5;
  await Promise.all([
    tween(sprite, { alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(sprite.scale, { x: targetScaleX, y: targetScaleY }, { duration: 600, ease: 'easeIn' }),
  ]);

  burstParticles(pos, { count: 8, color: 0xFFFFFF, speed: 60, life: 500, element: 'neutral' });
}

/**
 * Animate a creature leveling up.
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateLevelUp(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  const { burstParticles, screenFlash } = await import('./effects.js');

  burstParticles({ x: pos.x, y: pos.y + 10 }, { count: 15, color: 0xFFD700, speed: 100, life: 800, element: 'fire' });
  screenFlash({ color: 0xFFD700, duration: 150 });
}

/**
 * Reposition formations after resize.
 */
export async function resizeFormations(width, height) {
  // Re-render active formations so iOS Safari address-bar resize/orientation
  // keeps sprite coordinates aligned with the new viewport.
  if (lastFormationInput.player) {
    await showFormation('player', lastFormationInput.player.creatures, lastFormationInput.player.opts);
  }
  if (lastFormationInput.enemy) {
    await showFormation('enemy', lastFormationInput.enemy.creatures, lastFormationInput.enemy.opts);
  }
}
