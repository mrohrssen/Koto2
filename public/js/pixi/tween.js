import { getApp } from './app.js';

const EASING = {
  linear: t => t,
  easeOut: t => 1 - (1 - t) ** 2,
  easeIn: t => t * t,
  easeInOut: t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  elastic: t => {
    if (t === 0 || t === 1) return t;
    return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3));
  },
};

/**
 * Tween properties on a target object.
 *
 * Optional `signal` param is a plain `{ cancelled: boolean }` object that the
 * caller may flip to `true` to cancel the tween mid-flight. When cancelled,
 * the ticker is removed and the promise resolves early without mutating the
 * target further (the last applied values remain). The returned Promise ALWAYS
 * resolves — never rejects — so callers do not need try/catch around cancellation.
 *
 * @param {object} target - Object with numeric properties (e.g., PixiJS Sprite)
 * @param {object} props - Target values, e.g. { x: 100, alpha: 0 }
 * @param {{ duration?: number, ease?: string, delay?: number, signal?: { cancelled: boolean } }} opts
 * @returns {Promise<void>}
 */
export function tween(target, props, { duration = 300, ease = 'easeOut', delay: delayMs = 0, signal } = {}) {
  return new Promise(resolve => {
    const { app } = getApp();
    if (!app) { resolve(); return; }
    // Early-exit if already cancelled before we even register the ticker.
    if (signal?.cancelled) { resolve(); return; }

    const easeFn = EASING[ease] || EASING.easeOut;
    const startValues = {};
    for (const key of Object.keys(props)) {
      startValues[key] = target[key];
    }

    let elapsed = -delayMs;

    const onTick = (ticker) => {
      // Check cancel first — caller may have flipped signal.cancelled mid-flight.
      // When cancelled, we stop mutating the target and resolve — the current
      // (partial) values remain as the final state.
      if (signal?.cancelled) {
        app.ticker.remove(onTick);
        resolve();
        return;
      }
      elapsed += ticker.deltaMS;
      if (elapsed < 0) return; // still in delay

      const t = Math.min(elapsed / duration, 1);
      const eased = easeFn(t);

      for (const key of Object.keys(props)) {
        target[key] = startValues[key] + (props[key] - startValues[key]) * eased;
      }

      if (t >= 1) {
        app.ticker.remove(onTick);
        resolve();
      }
    };

    app.ticker.add(onTick);
  });
}

/**
 * Wait for a duration (like delay() but tied to the PixiJS ticker).
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function wait(ms) {
  return new Promise(resolve => {
    const { app } = getApp();
    if (!app) { resolve(); return; }
    let elapsed = 0;
    const onTick = (ticker) => {
      elapsed += ticker.deltaMS;
      if (elapsed >= ms) {
        app.ticker.remove(onTick);
        resolve();
      }
    };
    app.ticker.add(onTick);
  });
}
