const BASE = '/assets/sprites/creatures';
export const SPRITE_VERSION = '20260430b';

const _noIdle = new Set();
const _hasIdle = new Set();

/** Kanji shown on text sprites when only element is known (matches starter/base words in data). */
const ELEMENT_DISPLAY_WORD = {
  fire: '火',
  water: '水',
  wood: '木',
  earth: '石',
  metal: '鉄'
};

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
 * Configure a creature display slot — loads real sprite with text-sprite fallback.
 *
 * @param {HTMLImageElement} img - The placeholder <img> to configure
 * @param {string} id - Creature ID
 * @param {Function|null} finalFallback - Called if image fails (optional)
 * @param {Object} [creature] - Optional creature data { baseWord, name, element }
 */
export function configureCreatureImg(img, id, finalFallback, creature) {
  const element = creature?.element || '';
  let word = creature?.baseWord || creature?.name;
  if (!word && element && ELEMENT_DISPLAY_WORD[element]) {
    word = ELEMENT_DISPLAY_WORD[element];
  }
  img.src = creatureStaticPath(id);
  img.alt = word || '';
  img.style.maxWidth = '100%';
  img.style.maxHeight = '100%';
  img.style.objectFit = 'contain';
  img.onerror = () => {
    replaceWithTextSprite(img, word || '？', element);
    if (finalFallback) finalFallback(img);
  };
}

/**
 * Return an HTML string for a creature sprite <img> that falls back to text sprite on error.
 * Use in template literals where you'd previously write a text-sprite <div>.
 * @param {string} id - Creature ID
 * @param {string} [word] - Fallback Japanese word (baseWord or name)
 * @param {string} [element] - Element type for fallback color class
 * @param {string} [extraClass] - Additional CSS class(es) for the <img>
 * @returns {string} HTML string
 */
export function creatureSpriteHtml(id, word, element, extraClass) {
  const src = creatureStaticPath(id);
  const cls = extraClass ? ` class="${extraClass}"` : '';
  const fallbackWord = (word || '？').replace(/"/g, '&quot;');
  const elClass = element || '';
  return `<img${cls} src="${src}" alt="${fallbackWord}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML='<div class=\\'text-sprite ${elClass}\\'>${fallbackWord}</div>'">`;
}

/**
 * Return an HTML string for an item sprite <img> that falls back to text sprite on error.
 * @param {string} id - Item ID (matches filename in /assets/sprites/items/)
 * @param {string} [word] - Fallback Japanese word
 * @returns {string} HTML string
 */
export function itemSpriteHtml(id, word) {
  const src = `/assets/sprites/items/${id}.webp?v=${SPRITE_VERSION}`;
  const fallbackWord = (word || '？').replace(/"/g, '&quot;');
  return `<img class="shop-item-sprite-img" src="${src}" alt="${fallbackWord}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.outerHTML='<div class=\\'text-sprite shop-item-sprite\\'>${fallbackWord}</div>'">`;
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
