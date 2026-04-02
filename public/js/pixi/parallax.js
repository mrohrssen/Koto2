/**
 * @file parallax.js — 4-layer TilingSprite parallax background
 *
 * Fixed layer structure: sky (0.1x), far (0.3x), mid (0.6x), ground (1.0x).
 * Layers auto-scroll during exploration and decelerate/stop for encounters.
 * In 'encounter' state, sky drifts while all other layers are frozen.
 */

import { TilingSprite, Assets } from 'pixi.js';
import { getStage } from './battle-stage.js';

const LAYER_NAMES = ['sky', 'far', 'mid', 'ground'];
const LAYER_SPEEDS = [0.1, 0.3, 0.6, 1.0];
const BASE_SCROLL_SPEED = 60; // pixels per second at 1.0x
const SKY_LAYER_INDEX = 0;

let tilingSprites = [];
let scrollState = 'stopped'; // 'scrolling' | 'decelerating' | 'stopped' | 'accelerating' | 'encounter'
let currentSpeed = 0; // 0 = stopped, 1 = full speed
const ACCEL_RATE = 2.0; // seconds to reach full speed
const DECEL_RATE = 1.5; // seconds to stop
let loadRequestId = 0;

/**
 * Load parallax layers for an area. Falls back to solid color if assets missing.
 * @param {string} areaId - e.g. 'starter_meadow'
 */
export async function loadParallax(areaId) {
  const { app, layers } = getStage();
  if (!app) return;
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
    } catch {
      continue;
    }

    if (requestId !== loadRequestId) {
      return;
    }

    const ts = new TilingSprite({
      texture,
      width: w,
      height: h,
    });
    const scale = h / texture.height;
    ts.tileScale.set(scale, scale);
    ts.layerSpeed = LAYER_SPEEDS[i];
    tilingSprites.push(ts);
    layers.background.addChild(ts);
  }
}

/**
 * Set the scroll state.
 * @param {'scrolling'|'decelerating'|'stopped'|'accelerating'|'encounter'} state
 */
export function setScrollState(state) {
  scrollState = state;
  if (state === 'stopped') currentSpeed = 0;
  if (state === 'scrolling') currentSpeed = 1;
  if (state === 'encounter') currentSpeed = 0;
}

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
    if (currentSpeed <= 0) scrollState = 'encounter';
  }

  // In encounter/stopped, only the sky layer drifts
  if (scrollState === 'encounter' || scrollState === 'stopped') {
    const skyTs = tilingSprites[SKY_LAYER_INDEX];
    if (skyTs) {
      skyTs.tilePosition.x -= BASE_SCROLL_SPEED * dt * skyTs.layerSpeed;
    }
    return;
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
