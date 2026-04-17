import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import { getApp } from './app.js';
import { tween, wait } from './tween.js';

// ============ ELEMENT COLORS ============

export const ELEMENT_COLORS = {
  fire: 0xEF5350,
  water: 0x42A5F5,
  wood: 0x66BB6A,
  earth: 0xBCAAA4,
  metal: 0x90A4AE,
  neutral: 0xFFFFFF,
};

// ============ PARTICLE POOL ============

const MAX_PARTICLES = 200;
const PARTICLE_BASE_SIZE = 10; // Texture.WHITE is 1x1 in PixiJS v8; scale must match desired px size
let particlePool = [];
let particleContainer = null;

// ============ ELEMENT BEHAVIOR CONFIG ============

const ELEMENT_BEHAVIORS = {
  fire:    { gravity: -80, spread: 0.8, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.0, flickerSpeed: 12 },
  water:   { gravity: 120, spread: 1.4, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.2, flickerSpeed: 0 },
  wood:    { gravity: 30,  spread: 1.0, wobbleFreq: 5, wobbleAmp: 15, fadeRate: 0.8, flickerSpeed: 0 },
  earth:   { gravity: 200, spread: 0.6, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 2.0, flickerSpeed: 0 },
  metal:   { gravity: 0,   spread: 0.4, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.5, flickerSpeed: 20 },
  neutral: { gravity: 0,   spread: 1.0, wobbleFreq: 0, wobbleAmp: 0, fadeRate: 1.0, flickerSpeed: 0 },
};

/**
 * Initialize the particle pool. Call once at battle-stage init.
 */
export function initParticles() {
  const { layers } = getApp();
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
    p._behavior = ELEMENT_BEHAVIORS.neutral;
    p._age = 0;
    particleContainer.addChild(p);
    particlePool.push(p);
  }
}

/**
 * Burst particles outward from a position.
 * @param {{ x: number, y: number }} pos
 * @param {{ count?: number, color?: number, speed?: number, life?: number, element?: string }} opts
 */
export function burstParticles(pos, { count = 10, color = 0xFFFFFF, speed = 80, life = 400, element = 'neutral' } = {}) {
  const behavior = ELEMENT_BEHAVIORS[element] || ELEMENT_BEHAVIORS.neutral;
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.5;
    const dist = (speed + Math.random() * speed * 0.5) * behavior.spread;
    p.x = pos.x;
    p.y = pos.y;
    p.vx = Math.cos(angle) * dist;
    p.vy = Math.sin(angle) * dist;
    p.tint = color;
    p.alpha = 1;
    p.visible = true;
    p.life = life + Math.random() * 150;
    p.maxLife = p.life;
    p.scale.set(PARTICLE_BASE_SIZE);
    p._behavior = behavior;
    p._age = 0;
    spawned++;
  }
}

/**
 * Flow particles from one position toward another (for drain moves).
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {{ count?: number, color?: number, speed?: number, life?: number, element?: string, spread?: number }} opts
 */
export function flowParticles(from, to, { count = 12, color = 0xFFFFFF, speed = 120, life = 600, element = 'neutral', spread = 30 } = {}) {
  const behavior = ELEMENT_BEHAVIORS[element] || ELEMENT_BEHAVIORS.neutral;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const baseAngle = Math.atan2(dy, dx);
  let spawned = 0;
  for (const p of particlePool) {
    if (p.visible || spawned >= count) continue;
    const angleOffset = (Math.random() - 0.5) * (spread * Math.PI / 180);
    const angle = baseAngle + angleOffset;
    const dist = speed + Math.random() * speed * 0.3;
    p.x = from.x + (Math.random() - 0.5) * 20;
    p.y = from.y + (Math.random() - 0.5) * 20;
    p.vx = Math.cos(angle) * dist;
    p.vy = Math.sin(angle) * dist;
    p.tint = color;
    p.alpha = 1;
    p.visible = true;
    p.life = life + Math.random() * 150;
    p.maxLife = p.life;
    p.scale.set(PARTICLE_BASE_SIZE);
    p._behavior = behavior;
    p._age = 0;
    spawned++;
  }
}

/**
 * Ticker update for particles. Applies element-specific physics.
 * @param {number} deltaMS - Milliseconds since last frame
 */
export function updateParticles(deltaMS) {
  for (const p of particlePool) {
    if (!p.visible) continue;
    const dt = deltaMS / 1000;
    const b = p._behavior;

    // Apply gravity
    p.vy += b.gravity * dt;

    // Apply wobble (wood element sway)
    if (b.wobbleFreq > 0 && b.wobbleAmp > 0) {
      p.x += Math.sin(p._age * b.wobbleFreq) * b.wobbleAmp * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= deltaMS;
    p._age += dt;

    const t = Math.max(0, p.life / p.maxLife);
    p.alpha = t * b.fadeRate;
    if (p.alpha > 1) p.alpha = 1;
    p.scale.set(t * PARTICLE_BASE_SIZE);

    // Flicker (fire/metal sparkle)
    if (b.flickerSpeed > 0) {
      p.alpha *= 0.5 + 0.5 * Math.sin(p._age * b.flickerSpeed);
    }

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
  const { app } = getApp();
  if (!app) return;

  const config = SHAKE_CONFIG[intensity] || SHAKE_CONFIG.medium;
  const stage = app.stage;
  const dur = config.duration;
  const px = config.intensity;

  const frames = 6;
  const frameDur = dur / frames;
  const offsets = [
    { x: -px, y: px / 2 },
    { x: px, y: -px / 2 },
    { x: -px / 2, y: 0 },
    { x: px / 2, y: 0 },
    { x: 0, y: 0 },
  ];

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
  const { app, layers } = getApp();
  if (!app || !layers.overlay) return;

  flashGraphics = new Graphics();
  flashGraphics.alpha = 0;
  layers.overlay.addChild(flashGraphics);
}

/**
 * Flash the screen a color.
 * @param {{ color?: number, duration?: number, count?: number }} opts
 */
export async function screenFlash({ color = 0xFFFFFF, duration = 100, count = 1 } = {}) {
  const { app } = getApp();
  if (!app || !flashGraphics) return;

  flashGraphics.clear();
  flashGraphics.rect(0, 0, app.screen.width, app.screen.height);
  flashGraphics.fill(color);

  for (let i = 0; i < count; i++) {
    flashGraphics.alpha = 0.3;
    await tween(flashGraphics, { alpha: 0 }, { duration, ease: 'easeOut' });
  }
}

// ============ HIT STOP ============

let frozen = false;

export function isFrozen() { return frozen; }

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

// ============ VIGNETTE OVERLAY ============

let vignetteGraphics = null;

/**
 * Initialize vignette overlay for player damage feedback.
 * Call once at battle-stage init.
 */
export function initVignette() {
  const { app, layers } = getApp();
  if (!app || !layers.overlay) return;

  vignetteGraphics = new Graphics();
  vignetteGraphics.alpha = 0;
  layers.overlay.addChild(vignetteGraphics);
}

/**
 * Show a red vignette on screen edges (player damage feedback).
 * @param {number} duration - Fade-out duration in ms
 */
export async function showVignette(duration = 400) {
  const { app } = getApp();
  if (!app || !vignetteGraphics) return;

  const w = app.screen.width;
  const h = app.screen.height;
  const edgeSize = Math.min(w, h) * 0.15;

  vignetteGraphics.clear();

  // Draw red semi-transparent rectangles on each edge
  const redColor = 0xFF0000;
  // Top edge
  vignetteGraphics.rect(0, 0, w, edgeSize);
  vignetteGraphics.fill({ color: redColor, alpha: 0.4 });
  // Bottom edge
  vignetteGraphics.rect(0, h - edgeSize, w, edgeSize);
  vignetteGraphics.fill({ color: redColor, alpha: 0.4 });
  // Left edge
  vignetteGraphics.rect(0, 0, edgeSize, h);
  vignetteGraphics.fill({ color: redColor, alpha: 0.3 });
  // Right edge
  vignetteGraphics.rect(w - edgeSize, 0, edgeSize, h);
  vignetteGraphics.fill({ color: redColor, alpha: 0.3 });

  vignetteGraphics.alpha = 1;
  await tween(vignetteGraphics, { alpha: 0 }, { duration, ease: 'easeOut' });
}
