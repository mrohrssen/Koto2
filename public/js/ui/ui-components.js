import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';

/**
 * Render a vertical stack of tappable buttons.
 * @param {Array<{label: string, onClick: Function, primary?: boolean, disabled?: boolean}>} buttons
 * @param {{container?: HTMLElement}} options
 */
export function renderButtons(buttons, { container } = {}) {
  const el = container || document.getElementById('action-area');
  el.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'ui-btn-list';

  for (const btn of buttons) {
    const button = document.createElement('button');
    button.className = 'ui-btn' +
      (btn.primary ? ' ui-btn--primary' : '') +
      (btn.disabled ? ' ui-btn--disabled' : '');
    button.innerHTML = btn.label;
    if (btn.disabled) button.disabled = true;
    button.addEventListener('click', () => {
      if (btn.disabled) return;
      playSFX('button-tap');
      hapticLight();
      btn.onClick?.();
    });
    list.appendChild(button);
  }

  el.appendChild(list);
}

/**
 * Render buttons and return a Promise that resolves with the selected index.
 * Used for dialogue choices.
 * @param {Array<{label: string, primary?: boolean, disabled?: boolean}>} buttons
 * @param {{container?: HTMLElement}} options
 * @returns {Promise<number>}
 */
export function renderButtonsAsync(buttons, options = {}) {
  return new Promise(resolve => {
    let answered = false;
    const wrappedButtons = buttons.map((btn, i) => ({
      ...btn,
      onClick: () => {
        if (answered) return;
        answered = true;
        resolve(i);
      },
    }));
    renderButtons(wrappedButtons, options);
  });
}
