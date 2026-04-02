/**
 * @file parallax.js — 4-layer TilingSprite parallax background
 *
 * Fixed layer structure: sky (0.1x), far (0.3x), mid (0.6x), ground (1.0x).
 * Layers auto-scroll during exploration and decelerate/stop for encounters.
 */

import { TilingSprite, Assets } from 'pixi.js';
import { getStage } from './battle-stage.js';

const LAYER_NAMES = ['sky', 'far', 'mid', 'ground'];
const LAYER_SPEEDS = [0.1, 0.3, 0.6, 1.0];
const BASE_SCROLL_SPEED = 60; // pixels per second at 1.0x

let tilingSprites = [];
let scrollState = 'stopped'; // 'scrolling' | 'decelerating' | 'stopped' | 'accelerating'
let currentSpeed = 0; // 0 = stopped, 1 = full speed
const ACCEL_RATE = 2.0; // seconds to reach full speed
const DECEL_RATE = 1.5; // seconds to stop
let loadRequestId = 0;

/**
 * Load parallax layers for an area. Falls back to solid color if assets missing.
 * Pass null/undefined to clear layers (hub / no run) — extension for game.js wiring.
 * @param {string|null|undefined} areaId - e.g. 'starter_meadow'
 */
export async function loadParallax(areaId) {
  console.log('[Parallax] loadParallax called with:', areaId);
  const { app, layers } = getStage();
  if (!app) {
    console.warn('[Parallax] No pixi app, skipping');
    return;
  }
  const requestId = ++loadRequestId;

  // Clear existing layers
  tilingSprites.forEach(ts => ts.destroy());
  tilingSprites = [];
  layers.background.removeChildren();

  // Toggle DOM static background: hide when parallax active, show when cleared.
  const domBg = document.querySelector('.scene-background');
  if (domBg) domBg.style.display = (areaId == null || areaId === '') ? '' : 'none';

  if (areaId == null || areaId === '') {
    return;
  }

  const w = app.screen.width;
  const h = app.screen.height;

  for (let i = 0; i < LAYER_NAMES.length; i++) {
    const name = LAYER_NAMES[i];
    const path = `/assets/backgrounds/${areaId}/${name}.webp`;

    let texture;
    try {
      texture = await Assets.load(path);
    } catch (err) {
      console.warn('[Parallax] Failed to load', path, err);
      continue;
    }
    if (requestId !== loadRequestId) {
      // A newer loadParallax call superseded this one.
      return;
    }

    const scale = h / texture.height;
    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    ts.tileScale.set(scale, scale);
    ts.layerSpeed = LAYER_SPEEDS[i];
    tilingSprites.push(ts);
    layers.background.addChild(ts);
  }
  console.log('[Parallax] Loaded', tilingSprites.length, 'layers for', areaId);
}

/**
 * Set the scroll state.
 * @param {'scrolling'|'decelerating'|'stopped'|'accelerating'} state
 */
export function setScrollState(state) {
  scrollState = state;
  if (state === 'stopped') currentSpeed = 0;
  if (state === 'scrolling') currentSpeed = 1;
}

/**
 * True while parallax offset is changing (scrolling, accelerating, or decelerating).
 * Used to sync formation walking wobble with actual layer motion.
 */
export function isParallaxMoving() {
  return currentSpeed > 0;
}

/**
 * Ticker update — call every frame. Scrolls layers based on current state.
 * @param {number} delta - Frame delta time from PixiJS ticker (in frames at 60fps)
 */
export function updateParallax(delta) {
  const dt = delta / 60; // convert to seconds

  // Update speed based on state
  if (scrollState === 'accelerating') {
    currentSpeed = Math.min(1, currentSpeed + dt / ACCEL_RATE);
    if (currentSpeed >= 1) scrollState = 'scrolling';
  } else if (scrollState === 'decelerating') {
    currentSpeed = Math.max(0, currentSpeed - dt / DECEL_RATE);
    if (currentSpeed <= 0) scrollState = 'stopped';
  }

  if (currentSpeed <= 0) return;

  const pxPerFrame = BASE_SCROLL_SPEED * dt * currentSpeed;

  for (const ts of tilingSprites) {
    ts.tilePosition.x -= pxPerFrame * ts.layerSpeed;
  }
}

/**
 * Resize all tiling sprites to match new canvas dimensions.
 * Called by battle-stage ResizeObserver.
 */
export function resizeParallax(width, height) {
  for (const ts of tilingSprites) {
    ts.width = width;
    ts.height = height;
    const scale = height / ts.texture.height;
    ts.tileScale.set(scale, scale);
  }
}
