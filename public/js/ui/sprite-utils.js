/**
 * sprite-utils.js - Creature sprite path resolution with animated idle support.
 *
 * Convention: if {creatureId}-idle.webp exists, use it everywhere.
 * Falls back to static {creatureId}.webp when idle file 404s.
 */

const BASE = '/assets/sprites/creatures';
const SPRITE_VERSION = '20260228';

const _noIdle = new Set();
const _hasIdle = new Set();

/** Idle path (or static if known to 404). */
export function creatureSpritePath(id) {
  if (_noIdle.has(id)) return `${BASE}/${id}.webp?v=${SPRITE_VERSION}`;
  return `${BASE}/${id}-idle.webp?v=${SPRITE_VERSION}`;
}

/** Static (non-animated) path — always {id}.webp, no idle. */
export function creatureStaticPath(id) {
  return `${BASE}/${id}.webp?v=${SPRITE_VERSION}`;
}

/**
 * Configure an <img> with idle-first loading.
 * src → idle.webp → onerror → static.webp → onerror → finalFallback()
 */
export function configureCreatureImg(img, id, finalFallback) {
  const staticPath = `${BASE}/${id}.webp?v=${SPRITE_VERSION}`;

  if (_noIdle.has(id)) {
    img.src = staticPath;
    if (finalFallback) {
      img.onerror = () => { img.onerror = null; finalFallback(img); };
    }
    return;
  }

  img.src = `${BASE}/${id}-idle.webp?v=${SPRITE_VERSION}`;
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
export function creatureBgUrl(id) {
  if (_hasIdle.has(id)) return `url('${BASE}/${id}-idle.webp?v=${SPRITE_VERSION}')`;
  return `url('${BASE}/${id}.webp?v=${SPRITE_VERSION}')`;
}

/**
 * Probe creature IDs for idle sprite existence (populates cache).
 * Call at startup so creatureBgUrl() returns correct paths.
 */
export function probeIdleSprites(creatureIds) {
  return Promise.all(creatureIds.map(id => {
    if (_hasIdle.has(id) || _noIdle.has(id)) return Promise.resolve();
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { _hasIdle.add(id); resolve(); };
      img.onerror = () => { _noIdle.add(id); resolve(); };
      img.src = `${BASE}/${id}-idle.webp?v=${SPRITE_VERSION}`;
    });
  }));
}
