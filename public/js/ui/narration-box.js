/**
 * narration-box.js - Visual novel style narration box
 *
 * PURPOSE: Renders a semi-transparent text box at the bottom of the scene area.
 * Exposes a promise-based show(text, options) API that resolves when the user
 * clicks anywhere (or after autoDismiss timeout).
 *
 * USAGE:
 *   import * as narrationBox from './narration-box.js';
 *   await narrationBox.show('The enemy speaks...', { speaker: 'Salaryman' });
 *   await narrationBox.show('Chip acquired!', { autoDismiss: 2000 });
 */

const box = document.getElementById('narration-box');
const textEl = document.getElementById('narration-text');
const speakerEl = document.getElementById('narration-speaker');
const indicatorEl = box?.querySelector('.narration-indicator');

let dismissResolve = null;
let dismissTimer = null;

function hide() {
  if (box) box.classList.remove('visible');
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (dismissResolve) {
    const resolve = dismissResolve;
    dismissResolve = null;
    resolve();
  }
}

function handleClick() {
  document.removeEventListener('click', handleClick, true);
  hide();
}

/**
 * Show text in the narration box.
 * @param {string} text - The text to display
 * @param {Object} [options]
 * @param {string} [options.speaker] - Name label shown above text
 * @param {number} [options.autoDismiss] - Ms to auto-dismiss (no click needed)
 * @param {boolean} [options.persistent] - If true, stays visible until forceHide() is called
 * @returns {Promise<void>} Resolves when dismissed
 */
export function show(text, options = {}) {
  // Dismiss any currently visible narration
  if (dismissResolve) {
    document.removeEventListener('click', handleClick, true);
    hide();
  }

  const { speaker, autoDismiss, persistent } = options;

  if (speakerEl) {
    speakerEl.textContent = speaker || '';
    speakerEl.style.display = speaker ? '' : 'none';
  }
  if (textEl) textEl.textContent = text;
  if (indicatorEl) indicatorEl.style.display = (autoDismiss || persistent) ? 'none' : '';
  if (box) box.classList.add('visible');

  // Persistent mode: show but don't register click handler, resolve immediately
  if (persistent) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    dismissResolve = resolve;

    if (autoDismiss) {
      dismissTimer = setTimeout(() => {
        document.removeEventListener('click', handleClick, true);
        hide();
      }, autoDismiss);
    }

    // Use setTimeout(0) to avoid the current click event from immediately dismissing
    setTimeout(() => {
      document.addEventListener('click', handleClick, true);
    }, 0);
  });
}

/**
 * Immediately hide the narration box without resolving promise.
 * Useful for scene transitions.
 */
export function forceHide() {
  document.removeEventListener('click', handleClick, true);
  if (box) box.classList.remove('visible');
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  if (dismissResolve) {
    const resolve = dismissResolve;
    dismissResolve = null;
    resolve();
  }
}
