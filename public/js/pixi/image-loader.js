import { Texture } from 'pixi.js';

const _cache = new Map();

/**
 * Load an image via HTMLImageElement + decode() and wrap it in a Pixi Texture.
 *
 * iOS WKWebView rejects Pixi v8's Assets.load() for our bundled webp sprites
 * (ImageIO surfaces err=-50/-39 and Pixi falls back to Texture.WHITE), even
 * though the same bytes decode fine via a plain <img>. Use this helper instead
 * of Assets.load() for single-image textures so sprites render on device.
 */
export function loadImageTexture(url) {
  const existing = _cache.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    return Texture.from(img);
  })();
  promise.catch(() => _cache.delete(url));
  _cache.set(url, promise);
  return promise;
}
