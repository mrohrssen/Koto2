import { loadImageTexture } from './image-loader.js';

export function frameRectForIndex(index, { frameWidth, frameHeight, columns }) {
  return {
    x: (index % columns) * frameWidth,
    y: Math.floor(index / columns) * frameHeight,
    width: frameWidth,
    height: frameHeight,
  };
}

export function nextAnimationFrame(state, deltaMS) {
  const frameDuration = 1000 / state.fps;
  state.elapsedMs = (state.elapsedMs || 0) + deltaMS;
  while (state.elapsedMs >= frameDuration) {
    state.elapsedMs -= frameDuration;
    state.frameIndex = (state.frameIndex + 1) % state.frames;
  }
  return state.frameIndex;
}

export function chooseAnimationKind(entry, walkingEnabled) {
  if (walkingEnabled && entry?.walk) return 'walk';
  if (entry?.idle) return 'idle';
  if (entry?.walk) return 'walk';
  return null;
}

async function textureFrameFromSheet(sheetTexture, index, entry) {
  const { Rectangle, Texture } = await import('pixi.js');
  const rect = frameRectForIndex(index, entry);
  return new Texture({
    source: sheetTexture.source,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  });
}

export async function createAnimatedCreatureState(entry) {
  const textures = {};
  for (const kind of ['idle', 'walk']) {
    if (!entry[kind]) continue;
    const sheetTexture = await loadImageTexture(entry[kind]);
    textures[kind] = await Promise.all(
      Array.from({ length: entry.frames }, (_, index) => (
        textureFrameFromSheet(sheetTexture, index, entry)
      ))
    );
  }

  return {
    entry,
    textures,
    kind: null,
    frameIndex: 0,
    elapsedMs: 0,
    fps: entry.fps,
    frames: entry.frames,
  };
}

export function applyAnimationKind(sprite, state, kind) {
  if (!kind || state.kind === kind || !state.textures[kind]?.length) return;
  state.kind = kind;
  state.frameIndex = 0;
  state.elapsedMs = 0;
  sprite.texture = state.textures[kind][0];
}

export function tickAnimatedCreatureSprite(sprite, state, deltaMS, walkingEnabled) {
  const kind = chooseAnimationKind(state.entry, walkingEnabled);
  applyAnimationKind(sprite, state, kind);
  if (!state.kind) return;
  const frameIndex = nextAnimationFrame(state, deltaMS);
  sprite.texture = state.textures[state.kind][frameIndex];
}
