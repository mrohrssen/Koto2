import { animate as anime } from '../lib/anime.esm.min.js';

/**
 * Bounce player formation slots in place.
 * Resolves after the given duration.
 */
export function bouncePlayerParty(duration = 500) {
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  if (!slots.length) return Promise.resolve();

  // Fire-and-forget looping bounce
  anime(slots, {
    translateY: [0, -8, 0],
  }, {
    duration: 300,
    loop: true,
    ease: 'inOutSine',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      // Reset transform (same pattern as screenShake cleanup)
      slots.forEach(s => s.style.transform = '');
      resolve();
    }, duration);
  });
}

/**
 * Slide an element in from off-screen right.
 */
export function slideFromRight(element, duration = 400) {
  if (!element) return Promise.resolve();
  element.style.transform = 'translateX(100vw)';
  element.style.opacity = '1';

  return new Promise(resolve => {
    anime(element, {
      translateX: [window.innerWidth, 0],
    }, {
      duration,
      ease: 'outBack',
      onComplete: () => {
        element.style.transform = '';
        resolve();
      }
    });
  });
}

/**
 * Slide an element out to off-screen right.
 */
export function slideToRight(element, duration = 300) {
  if (!element) return Promise.resolve();

  return new Promise(resolve => {
    anime(element, {
      translateX: [0, window.innerWidth],
    }, {
      duration,
      ease: 'inQuad',
      onComplete: () => {
        element.style.transform = 'translateX(100vw)';
        resolve();
      }
    });
  });
}

/**
 * Fade an element in (opacity 0 → 1).
 */
export function fadeIn(element, duration = 300) {
  if (!element) return Promise.resolve();
  element.style.opacity = '0';

  return new Promise(resolve => {
    anime(element, {
      opacity: [0, 1],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: resolve
    });
  });
}

/**
 * Fade an element out (opacity 1 → 0).
 */
export function fadeOut(element, duration = 300) {
  if (!element) return Promise.resolve();

  return new Promise(resolve => {
    anime(element, {
      opacity: [1, 0],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: resolve
    });
  });
}
