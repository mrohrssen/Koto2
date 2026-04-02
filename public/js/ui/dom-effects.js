/**
 * @file dom-effects.js — DOM-only animation utilities
 *
 * Extracted from combat-effects.js for non-combat modules (exploration, economy, game).
 * Uses anime.js for simple DOM animations. Combat effects have moved to PixiJS.
 */

import { animate as anime } from 'animejs';

/** Pop scale animation */
export function pop(targets, scale = 1.15) {
  const els = targets instanceof NodeList || Array.isArray(targets) ? targets
    : targets instanceof Element ? [targets] : document.querySelectorAll(targets);

  const cleanup = () => {
    els.forEach(el => { if (el?.style) el.style.transform = ''; });
  };
  anime(targets, {
    scale: [1, scale, 1],
  }, {
    duration: 200,
    ease: 'outQuad',
    onComplete: cleanup,
  });
  setTimeout(cleanup, 250);
}

/** Flash brightness */
export function flashElement(targets, count = 1) {
  anime(targets, {
    filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
  }, {
    duration: 100,
    loop: count,
    ease: 'outQuad',
  });
}

/** Recoil animation on a DOM element */
export function recoil(targets, distance = 5, direction = 'right') {
  const sign = direction === 'right' ? 1 : -1;
  const els = targets instanceof NodeList || Array.isArray(targets) ? targets
    : targets instanceof Element ? [targets] : document.querySelectorAll(targets);

  const cleanup = () => {
    els.forEach(el => { if (el?.style) el.style.transform = ''; });
  };
  anime(targets, {
    translateX: [0, sign * distance, 0],
  }, {
    duration: 200,
    ease: 'outElastic(1, 0.5)',
    onComplete: cleanup,
  });
  setTimeout(cleanup, 250);
}

/** Poison apply: add class + purple particles placeholder */
export async function poisonApplyEffect(targetEl) {
  if (targetEl) targetEl.classList.add('poisoned');
}

/** Screen shake — now delegated to PixiJS effects.js */
export { screenShake } from '../pixi/effects.js';
