import { Sprite, TilingSprite } from 'pixi.js';
import { getApp } from './app.js';
import { loadImageTexture } from './image-loader.js';

const SKY_DRIFT_PX_PER_SECOND = 10;
const BATTLEFIELD_ASSET_VERSION = '20260503-run007';

let requestId = 0;
let sky = null;
let scenery = null;
let battleground = null;
let driftEnabled = false;
let driftSpeed = 0;

function battlefieldAssetPath(battlefieldId, layerName) {
  return `/assets/backgrounds/${battlefieldId}/${layerName}.webp?v=${BATTLEFIELD_ASSET_VERSION}`;
}

function destroyLayer(layer) {
  if (layer?.parent?.removeChild) layer.parent.removeChild(layer);
  if (layer?.destroy) layer.destroy({ children: true, texture: false });
}

function fitLayer(layer, width, height) {
  if (!layer) return;
  layer.width = width;
  layer.height = height;
  if (layer.texture?.height && layer.tileScale?.set) {
    const scale = height / layer.texture.height;
    layer.tileScale.set(scale, scale);
  }
}

function resetBattlefieldBackground() {
  destroyLayer(sky);
  destroyLayer(scenery);
  destroyLayer(battleground);
  sky = null;
  scenery = null;
  battleground = null;
  driftEnabled = false;
  driftSpeed = 0;
}

export function clearBattlefieldBackground() {
  requestId += 1;
  resetBattlefieldBackground();
}

export async function loadBattlefieldBackground(battlefieldId) {
  const { app, layers } = getApp();
  if (!app || !layers?.background) return;
  const id = ++requestId;
  resetBattlefieldBackground();
  if (!battlefieldId) return;

  const [skyTexture, sceneryTexture, battlegroundTexture] = await Promise.all([
    loadImageTexture(battlefieldAssetPath(battlefieldId, 'sky')),
    loadImageTexture(battlefieldAssetPath(battlefieldId, 'background')),
    loadImageTexture(battlefieldAssetPath(battlefieldId, 'battleground')),
  ]);

  if (id !== requestId) return;

  sky = new TilingSprite({ texture: skyTexture, width: app.screen.width, height: app.screen.height });
  scenery = new Sprite({ texture: sceneryTexture });
  battleground = new Sprite({ texture: battlegroundTexture });

  layers.background.addChild(sky);
  layers.background.addChild(scenery);
  layers.background.addChild(battleground);
  resizeBattlefieldBackground(app.screen.width, app.screen.height);
}

export function resizeBattlefieldBackground(width, height) {
  fitLayer(sky, width, height);
  fitLayer(scenery, width, height);
  fitLayer(battleground, width, height);
}

export function startSkyDrift(speed = 1) {
  driftEnabled = true;
  driftSpeed = speed;
}

export function stopSkyDrift() {
  driftEnabled = false;
  driftSpeed = 0;
}

export function updateBattlefieldBackground(delta) {
  if (!driftEnabled || !sky) return;
  const dt = delta / 60;
  sky.tilePosition.x -= SKY_DRIFT_PX_PER_SECOND * driftSpeed * dt;
}

export function _getBattlefieldBackgroundState() {
  return { sky, scenery, battleground, driftEnabled, driftSpeed };
}
