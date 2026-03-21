/**
 * @file dialogue-choices.js - Shared dialogue response button renderer
 *
 * Renders response option buttons in #action-area for any dialogue flow
 * (prologue, NPC post-combat, befriend conversation).
 */

import { renderEnFirst } from './bootstrap-client.js';

/**
 * Show dialogue choice buttons in the action area.
 * @param {Array<string|{text: string}>} options - Choice options
 * @returns {Promise<number>} Selected option index
 */
export function showDialogueChoices(options) {
  return new Promise(resolve => {
    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(0); return; }

    const buttons = options.map((option, idx) => {
      const text = typeof option === 'string' ? option : option.text;
      return `
      <div class="shrine-creature-option befriend-answer-option" data-answer-index="${idx}" style="width:100%">
        <div class="shrine-creature-info" style="padding:1rem; width:100%; text-align:center">
          <div class="shrine-creature-name" style="color:var(--accent-primary)">${renderEnFirst(text)}</div>
        </div>
      </div>
    `;
    }).join('');

    actionArea.innerHTML = `
      <div class="shrine-creature-list befriend-answer-list" style="padding:0 1rem">
        ${buttons}
      </div>
    `;

    const list = actionArea.querySelector('.befriend-answer-list');
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('.befriend-answer-option');
      if (!opt || list.dataset.answered) return;
      list.dataset.answered = '1';
      resolve(parseInt(opt.dataset.answerIndex, 10));
    });
  });
}
