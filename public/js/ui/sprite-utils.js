/**
 * sprite-utils.js - Robot sprite path resolution.
 *
 * Uses static {robotId}.webp sprites only.
 */

const BASE = '/assets/sprites/robots';

/** Sprite path for a robot. */
export function robotSpritePath(id) {
  return `${BASE}/${id}.webp`;
}

/** Always-static path. */
export function robotSpritePathStatic(id) {
  return `${BASE}/${id}.webp`;
}

/**
 * Configure an <img> for a robot sprite.
 */
export function configureRobotImg(img, id, finalFallback) {
  img.src = `${BASE}/${id}.webp`;
  if (finalFallback) {
    img.onerror = () => { img.onerror = null; finalFallback(img); };
  }
}

/**
 * CSS background-image url() string.
 */
export function robotBgUrl(id) {
  return `url('${BASE}/${id}.webp')`;
}

/**
 * No-op — kept for API compatibility.
 */
export function probeIdleSprites(robotIds) {
  return Promise.resolve();
}
