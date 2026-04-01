/**
 * @file parallax.js — 4-layer TilingSprite parallax background
 *
 * Fixed layer structure: sky (0.1x), far (0.3x), mid (0.6x), ground (1.0x).
 * Layers auto-scroll during exploration and decelerate/stop for encounters.
 */

import { TilingSprite, Assets, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { setWalking } from './formation.js';

const LAYER_NAMES = ['sky', 'far', 'mid', 'ground'];
const LAYER_SPEEDS = [0.1, 0.3, 0.6, 1.0];
const BASE_SCROLL_SPEED = 60; // pixels per second at 1.0x

let tilingSprites = [];
let scrollState = 'stopped'; // 'scrolling' | 'decelerating' | 'stopped' | 'accelerating'
let currentSpeed = 0; // 0 = stopped, 1 = full speed
const ACCEL_RATE = 2.0; // seconds to reach full speed
const DECEL_RATE = 1.5; // seconds to stop

/**
 * Load parallax layers for an area. Falls back to solid color if assets missing.
 * @param {string} areaId - e.g. 'starter_meadow'
 */
export async function loadParallax(areaId) {
  const { app, layers } = getStage();
  if (!app) return;

  // Clear existing layers
  tilingSprites.forEach(ts => ts.destroy());
  tilingSprites = [];
  layers.background.removeChildren();

  const w = app.screen.width;
  const h = app.screen.height;

  for (let i = 0; i < LAYER_NAMES.length; i++) {
    const name = LAYER_NAMES[i];
    const path = `/assets/backgrounds/${areaId}/${name}.webp`;

    let texture;
    try {
      texture = await Assets.load(path);
    } catch {
      // Fallback: skip this layer (sky will show background color)
      continue;
    }

    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    ts.layerSpeed = LAYER_SPEEDS[i];
    tilingSprites.push(ts);
    layers.background.addChild(ts);
  }
}

/**
 * Set the scroll state.
 * @param {'scrolling'|'decelerating'|'stopped'|'accelerating'} state
 */
export function setScrollState(state) {
  scrollState = state;
  if (state === 'stopped') currentSpeed = 0;
  if (state === 'scrolling') currentSpeed = 1;
  // Toggle creature walking animation with scroll
  setWalking(state === 'scrolling' || state === 'accelerating');
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
  }
}
