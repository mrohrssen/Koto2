/**
 * @file effects.js — Canvas combat effects
 *
 * Particle pool, screen shake, screen flash, recoil, hit stop, speed lines.
 * All effects render on the PixiJS effects layer.
 */

import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';

// ============ PARTICLE POOL ============

const MAX_PARTICLES = 200;
let particlePool = [];
let particleContainer = null;

/**
 * Initialize the particle pool. Call once at battle-stage init.
 */
export function initParticles() {
  const { layers } = getStage();
  if (!layers.effects) return;

  particleContainer = new Container();
  layers.effects.addChild(particleContainer);

  // Pre-allocate particle sprites (small white circles)
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = new Sprite(Texture.WHITE);
    p.anchor.set(0.5);
    p.width = 6;
    p.height = 6;
    p.visible = false;
    p.vx = 0;
    p.vy = 0;
    p.life = 0;
    p.maxLife = 0;
    particleContainer.addChild(p);
    particlePool.push(p);
  }
}

/**
 * Burst particles outward from a position.
 * @param {{ x: number, y: number }} pos
 * @param {{ count?: number, color?: number, speed?: number, life?: number }} opts
 */
export function burstParticles(pos, { count = 10, color = 0xffffff, speed = 80, life = 400 } = {}) {
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.5;
    const dist = speed + Math.random() * speed * 0.5;
    p.x = pos.x;
    p.y = pos.y;
    p.vx = Math.cos(angle) * dist;
    p.vy = Math.sin(angle) * dist;
    p.tint = color;
    p.alpha = 1;
    p.visible = true;
    p.life = life + Math.random() * 150;
    p.maxLife = p.life;
    p.scale.set(1);
    spawned++;
  }
}

/**
 * Ticker update for particles.
 * @param {number} deltaMS - Milliseconds since last frame
 */
export function updateParticles(deltaMS) {
  for (const p of particlePool) {
    if (!p.visible) continue;
    const dt = deltaMS / 1000;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= deltaMS;
    const t = Math.max(0, p.life / p.maxLife);
    p.alpha = t;
    p.scale.set(t);
    if (p.life <= 0) {
      p.visible = false;
    }
  }
}

// ============ SCREEN SHAKE ============

const SHAKE_CONFIG = {
  light: { intensity: 2, duration: 100 },
  medium: { intensity: 4, duration: 150 },
  heavy: { intensity: 6, duration: 200 },
};

/**
 * Screen shake by offsetting the stage container.
 * @param {'light'|'medium'|'heavy'} intensity
 */
export async function screenShake(intensity = 'medium') {
  const { app } = getStage();
  if (!app) return;

  const config = SHAKE_CONFIG[intensity] || SHAKE_CONFIG.medium;
  const stage = app.stage;
  const dur = config.duration;
  const px = config.intensity;

  const offsets = [
    { x: -px, y: px / 2 },
    { x: px, y: -px / 2 },
    { x: -px / 2, y: 0 },
    { x: px / 2, y: 0 },
    { x: 0, y: 0 },
  ];
  const frameDur = dur / offsets.length;

  for (const offset of offsets) {
    stage.x = offset.x;
    stage.y = offset.y;
    await wait(frameDur);
  }
  stage.x = 0;
  stage.y = 0;
}

// ============ SCREEN FLASH ============

let flashGraphics = null;

/**
 * Initialize screen flash overlay. Call at battle-stage init.
 */
export function initFlash() {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  flashGraphics = new Graphics();
  flashGraphics.alpha = 0;
  layers.overlay.addChild(flashGraphics);
}

/**
 * Flash the screen a color.
 * @param {{ color?: number, duration?: number, count?: number }} opts
 */
export async function screenFlash({ color = 0xffffff, duration = 100, count = 1 } = {}) {
  const { app } = getStage();
  if (!app || !flashGraphics) return;

  flashGraphics.clear();
  flashGraphics.rect(0, 0, app.screen.width, app.screen.height).fill({ color });

  for (let i = 0; i < count; i++) {
    flashGraphics.alpha = 0.3;
    await tween(flashGraphics, { alpha: 0 }, { duration, ease: 'easeOut' });
  }
}

// ============ HIT STOP ============

let frozen = false;

export function isFrozen() {
  return frozen;
}

/**
 * Freeze all canvas animations briefly.
 * @param {number} ms
 */
export async function hitStop(ms = 60) {
  frozen = true;
  await wait(ms);
  frozen = false;
}

// ============ RECOIL ============

/**
 * Recoil a sprite with elastic snap-back.
 * @param {Sprite} sprite
 * @param {{ distance?: number, duration?: number, direction?: 'left'|'right' }} opts
 */
export async function recoil(sprite, { distance = 6, duration = 300, direction = 'right' } = {}) {
  if (!sprite) return;
  const dx = direction === 'left' ? -distance : distance;
  const originalX = sprite.x;
  sprite.x = originalX + dx;
  await tween(sprite, { x: originalX }, { duration, ease: 'elastic' });
}

/**
 * Lunge a sprite forward and back.
 * @param {Sprite} sprite
 * @param {{ distance?: number, duration?: number }} opts
 */
export async function lunge(sprite, { distance = 20, duration = 200 } = {}) {
  if (!sprite) return;
  const originalX = sprite.x;
  await tween(sprite, { x: originalX + distance }, { duration: duration / 2, ease: 'easeOut' });
  await tween(sprite, { x: originalX }, { duration: duration / 2, ease: 'easeIn' });
}

// ============ ELEMENT COLORS ============

export const ELEMENT_COLORS = {
  fire: 0xef5350,
  water: 0x42a5f5,
  wood: 0x66bb6a,
  earth: 0xbcaaa4,
  metal: 0x90a4ae,
  neutral: 0xffffff,
};
