import { loadTexture } from '../assets/asset-loader.js';

/**
 * Load an image via HTMLImageElement + decode() and wrap it in a Pixi Texture.
 *
 * iOS WKWebView rejects Pixi v8's Assets.load() for our bundled webp sprites
 * (ImageIO surfaces err=-50/-39 and Pixi falls back to Texture.WHITE), even
 * though the same bytes decode fine via a plain <img>. Use this helper instead
 * of Assets.load() for single-image textures so sprites render on device.
 */
export function loadImageTexture(url) {
  return loadTexture(url, { consumer: 'pixi' });
}
