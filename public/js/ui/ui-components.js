import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';

/**
 * Render a vertical stack of tappable buttons.
 * @param {Array<{label: string, onClick: Function, primary?: boolean, disabled?: boolean}>} buttons
 * @param {{container?: HTMLElement}} options
 */
export function renderButtons(buttons, { container, append } = {}) {
  const el = container || document.getElementById('action-area');
  if (!append) el.innerHTML = '';

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

/**
 * Render a list of tappable choice cards with a unified card template.
 * Callers can add a short heading when the action area itself needs context.
 *
 * @param {object} options
 * @param {string} [options.heading] - Optional heading rendered above the choices
 * @param {Array<{sprite?: string, title: string, subtitle?: string, pills?: string, badge?: {text: string, color: string}, helpBtn?: Function}>} options.cards
 * @param {Function} options.onSelect - Called with selected card index
 * @param {boolean} [options.disableAfterSelect=true] - Grey out all cards after selection
 * @param {HTMLElement} [options.container] - Target element (defaults to #action-area)
 */
export function renderChoices({ heading, cards, onSelect, disableAfterSelect = true, container } = {}) {
  const el = container || document.getElementById('action-area');
  el.innerHTML = '';

  if (heading) {
    const headingEl = document.createElement('div');
    headingEl.className = 'ui-choice-heading';
    headingEl.textContent = heading;
    el.appendChild(headingEl);
  }

  const list = document.createElement('div');
  list.className = 'ui-choice-list';

  let selected = false;

  cards.forEach((card, i) => {
    const btn = document.createElement('div');
    btn.className = 'ui-choice';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;

    let html = '';

    if (card.badge) {
      html += `<span class="ui-choice__badge" style="background:${card.badge.color}">${card.badge.text}</span>`;
    }

    if (card.helpBtn) {
      html += `<button class="ui-choice__help" data-help-index="${i}">?</button>`;
    }

    if (card.sprite) {
      html += `<div class="ui-choice__sprite">${card.sprite}</div>`;
    }

    html += '<div class="ui-choice__info">';
    html += `<div class="ui-choice__title">${card.title}</div>`;
    if (card.subtitle) html += `<div class="ui-choice__subtitle">${card.subtitle}</div>`;
    if (card.pills) html += `<div class="ui-choice__pills">${card.pills}</div>`;
    html += '</div>';

    if (card.suffix) html += card.suffix;

    btn.innerHTML = html;

    btn.addEventListener('click', (e) => {
      if (e.target.closest('.ui-choice__help')) return;
      if (selected && disableAfterSelect) return;
      selected = true;
      playSFX('button-tap');
      hapticLight();
      btn.classList.add('ui-choice--selected');
      if (disableAfterSelect) {
        list.querySelectorAll('.ui-choice').forEach(c => {
          c.classList.add('ui-choice--disabled');
          c.style.pointerEvents = 'none';
        });
        btn.style.opacity = '1';
      }
      onSelect(i);
    });

    if (card.helpBtn) {
      const helpEl = btn.querySelector('.ui-choice__help');
      helpEl?.addEventListener('click', (e) => {
        e.stopPropagation();
        card.helpBtn();
      });
    }

    list.appendChild(btn);
  });

  el.appendChild(list);
}
