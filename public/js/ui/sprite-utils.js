/**
 * sprite-utils.js - Robot sprite path resolution with animated idle support.
 *
 * Convention: if {robotId}-idle.webp exists, use it everywhere.
 * Falls back to static {robotId}.webp when idle file 404s.
 */

const BASE = '/assets/sprites/robots';

const _noIdle = new Set();
const _hasIdle = new Set();

/** Idle path (or static if known to 404). */
export function robotSpritePath(id) {
  if (_noIdle.has(id)) return `${BASE}/${id}.webp`;
  return `${BASE}/${id}-idle.webp`;
}

/** Always-static path. */
export function robotSpritePathStatic(id) {
  return `${BASE}/${id}.webp`;
}

/**
 * Configure an <img> with idle-first loading.
 * src → idle.webp → onerror → static.webp → onerror → finalFallback()
 */
export function configureRobotImg(img, id, finalFallback) {
  const staticPath = `${BASE}/${id}.webp`;

  if (_noIdle.has(id)) {
    img.src = staticPath;
    if (finalFallback) {
      img.onerror = () => { img.onerror = null; finalFallback(img); };
    }
    return;
  }

  img.src = `${BASE}/${id}-idle.webp`;
  img.onerror = () => {
    _noIdle.add(id);
    img.onerror = finalFallback
      ? () => { img.onerror = null; finalFallback(img); }
      : null;
    img.src = staticPath;
  };
  img.onload = () => { _hasIdle.add(id); };
}

/**
 * CSS background-image url() string.
 * Uses cache — returns idle if known, static otherwise.
 */
export function robotBgUrl(id) {
  if (_hasIdle.has(id)) return `url('${BASE}/${id}-idle.webp')`;
  return `url('${BASE}/${id}.webp')`;
}

/**
 * Probe robot IDs for idle sprite existence (populates cache).
 * Call at startup so robotBgUrl() returns correct paths.
 */
export function probeIdleSprites(robotIds) {
  return Promise.all(robotIds.map(id => {
    if (_hasIdle.has(id) || _noIdle.has(id)) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { _hasIdle.add(id); resolve(); };
      img.onerror = () => { _noIdle.add(id); resolve(); };
      img.src = `${BASE}/${id}-idle.webp`;
    });
  }));
}
