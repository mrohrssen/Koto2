import { Texture } from 'pixi.js';
import { recordAssetEvent } from './asset-diagnostics.js';

const imagePromises = new Map();
const texturePromises = new Map();

export function loadImageElement(url, { consumer = 'image' } = {}) {
  const existing = imagePromises.get(url);
  if (existing) return existing;

  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = now();
  const promise = (async () => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const endedAt = now();
    recordAssetEvent({ url, consumer, durationMs: endedAt - startedAt, cache: 'loaded' });
    return img;
  })();

  promise.catch(() => {
    imagePromises.delete(url);
    texturePromises.delete(url);
  });
  imagePromises.set(url, promise);
  return promise;
}

export function preloadImage(url, options = {}) {
  return loadImageElement(url, { ...options, consumer: options.consumer || 'dom-warmup' });
}

export function loadTexture(url, options = {}) {
  const existing = texturePromises.get(url);
  if (existing) return existing;

  const promise = loadImageElement(url, { ...options, consumer: options.consumer || 'pixi' })
    .then(img => Texture.from(img));
  promise.catch(() => texturePromises.delete(url));
  texturePromises.set(url, promise);
  return promise;
}

export function resetAssetLoaderForTests() {
  imagePromises.clear();
  texturePromises.clear();
}
