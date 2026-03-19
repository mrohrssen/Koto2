/**
 * sprite-utils.js - Creature sprite path resolution with animated idle support.
 *
 * Convention: if {creatureId}-idle.webp exists, use it everywhere.
 * Falls back to static {creatureId}.webp when idle file 404s.
 *
 * MVP mode: createTextSprite / replaceWithTextSprite replace image loading with
 * a styled <div> showing the creature's Japanese base word.
 */

const BASE = '/assets/sprites/creatures';
const SPRITE_VERSION = '20260317';

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
 * Create a text sprite <div> element using the creature's Japanese word.
 * @param {string} word - Japanese text to display (baseWord or name)
 * @param {string} [element] - Element type for color class (fire/water/wood/earth/metal)
 * @returns {HTMLDivElement}
 */
export function createTextSprite(word, element) {
  const div = document.createElement('div');
  div.className = 'text-sprite' + (element ? ` ${element}` : '');
  div.textContent = word || '？';
  return div;
}

/**
 * Replace an <img> element with a text sprite <div> in-place.
 * The img must have a parent. Copies width/height/className onto the div.
 * @param {HTMLImageElement} img
 * @param {string} word
 * @param {string} [element]
 * @returns {HTMLDivElement} the replacement div
 */
export function replaceWithTextSprite(img, word, element) {
  const sprite = createTextSprite(word, element);
  // Transfer any inline sizing so layout isn't broken
  if (img.style.width) sprite.style.width = img.style.width;
  if (img.style.height) sprite.style.height = img.style.height;
  if (img.parentNode) {
    img.parentNode.replaceChild(sprite, img);
  }
  return sprite;
}

/**
 * Configure a creature display slot using a text sprite instead of an image.
 * This is the MVP replacement for configureCreatureImg().
 *
 * Replaces the <img> with a <div class="text-sprite {element}"> containing
 * the creature's Japanese base word. The original img is removed from the DOM.
 *
 * @param {HTMLImageElement} img - The placeholder <img> to replace
 * @param {string} id - Creature ID (unused in MVP, kept for API compatibility)
 * @param {Function|null} finalFallback - Ignored in MVP (no image loading)
 * @param {Object} [creature] - Optional creature data { baseWord, name, element }
 */
export function configureCreatureImg(img, id, finalFallback, creature) {
  const word = creature?.baseWord || creature?.name || '？';
  const element = creature?.element || '';
  replaceWithTextSprite(img, word, element);
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
