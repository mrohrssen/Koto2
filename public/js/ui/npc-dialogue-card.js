import { toRomaji } from './romaji.js';
import { getKnownWords, esc } from './bootstrap-client.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';
import * as dialogueLookup from './dialogue-word-lookup.js';
import { playDialogueAudio } from '../tts.js';

const DEFAULT_PORTRAIT = '/assets/dialogue/default-headshot.png?v=20260501-headshot';
const MAX_TOKENS_PER_PAGE = 9;
const MAX_TOKENS_PER_LINE = 4;

function tokenBase(token) {
  return getTokenBaseForm(token);
}

function displayReading(token, useKanji) {
  if (!isContentExposureToken(token)) return token.surface || '';
  if (useKanji) return token.surface || token.reading || token.baseForm || '';
  return token.reading || token.surface || token.baseForm || '';
}

function tokenMeaning(token, wordDict, overrides) {
  const meaning = resolveExposureMeaning(token, wordDict, overrides) || '';
  const firstSense = meaning.split('/')[0].trim();
  const parenIdx = firstSense.indexOf('(');
  return parenIdx > 0 ? firstSense.slice(0, parenIdx).trim() : firstSense;
}

function attrsForToken(token, { wordDict, overrides, useKanji }) {
  const base = tokenBase(token);
  const reading = token.reading || token.surface || base;
  const meaning = tokenMeaning(token, wordDict, overrides);
  const pos = token.pos || '';
  const meaningsJson = Array.isArray(token.meanings) ? JSON.stringify(token.meanings) : '';
  let attrs = ` data-base="${esc(base)}" data-reading="${esc(reading)}" data-meaning="${esc(meaning)}" data-pos="${esc(pos)}"`;
  if (overrides?.[base]) attrs += ' data-override="1"';
  if (meaningsJson) attrs += ` data-meanings="${esc(meaningsJson)}"`;
  if (useKanji) attrs += ' data-kanji-mode="1"';
  return attrs;
}

function chunkByCount(items, count) {
  const chunks = [];
  for (let i = 0; i < items.length; i += count) {
    chunks.push(items.slice(i, i + count));
  }
  return chunks;
}

function paginateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length <= MAX_TOKENS_PER_PAGE) return [tokens || []];
  return chunkByCount(tokens, MAX_TOKENS_PER_PAGE);
}

export function renderDialogueTokenRows({
  tokens,
  knownWords = getKnownWords(),
  wordDict = null,
  overrides = {},
  useKanji = false,
} = {}) {
  const lines = chunkByCount(tokens || [], MAX_TOKENS_PER_LINE);
  return lines.map(lineTokens => {
    const romaji = [];
    const jp = [];
    const en = [];

    for (const token of lineTokens) {
      if (!isContentExposureToken(token)) {
        romaji.push('<span class="npc-dialogue-cell npc-dialogue-cell--punct"></span>');
        jp.push(`<span class="npc-dialogue-cell jp-punct">${esc(token.surface || '')}</span>`);
        en.push('<span class="npc-dialogue-cell"></span>');
        continue;
      }

      const base = tokenBase(token);
      const reading = token.reading || token.surface || base;
      const display = displayReading(token, useKanji);
      const isKnown = knownWords?.has?.(base);
      const meaning = isKnown ? '' : tokenMeaning(token, wordDict, overrides);
      const attrs = attrsForToken(token, { wordDict, overrides, useKanji });
      const typeClass = token.entity ? 'jp-entity' : isKnown ? 'jp-known' : 'jp-unknown';

      romaji.push(`<span class="npc-dialogue-cell">${esc(toRomaji(reading))}</span>`);
      jp.push(`<span class="npc-dialogue-cell jp-word ${typeClass}"${attrs}>${esc(display)}</span>`);
      en.push(`<span class="npc-dialogue-cell">${esc(meaning)}</span>`);
    }

    return `
      <div class="npc-dialogue-line-grid" style="--npc-dialogue-cols:${Math.max(1, lineTokens.length)}">
        <div class="npc-dialogue-romaji-row">${romaji.join('')}</div>
        <div class="npc-dialogue-jp-row">${jp.join('')}</div>
        <div class="npc-dialogue-en-row">${en.join('')}</div>
      </div>
    `;
  }).join('');
}

function renderFallbackText({ html, text }) {
  if (html) return String(html);
  return esc(text || '');
}

function resolvePortraitSrc() {
  return DEFAULT_PORTRAIT;
}

function renderPageContent(options, pageTokens) {
  if (pageTokens?.length) {
    return renderDialogueTokenRows({ ...options, tokens: pageTokens });
  }
  return renderFallbackText(options);
}

export function showNpcDialogueCard(options = {}) {
  const actionArea = options.container || document.getElementById('action-area');
  if (!actionArea) return Promise.resolve();

  const pages = options.tokens?.length ? paginateTokens(options.tokens) : [null];
  let pageIndex = 0;
  let resolved = false;

  return new Promise(resolve => {
    const finish = () => {
      if (resolved) return;
      resolved = true;
      dialogueLookup.hidePopup?.();
      actionArea.innerHTML = '';
      resolve();
    };

    const render = () => {
      const pageTokens = pages[pageIndex];
      const portraitSrc = resolvePortraitSrc(options);
      const portraitKindClass = '';
      const hasAudio = !!options.audio?.userId && !!options.audio?.key;
      const content = renderPageContent(options, pageTokens);
      const continueLabel = pageIndex < pages.length - 1 ? 'Next' : 'Continue';

      actionArea.innerHTML = `
        <div class="npc-dialogue-shell">
          <article class="npc-dialogue-card">
            <div class="npc-dialogue-portrait${portraitKindClass}">
              <img src="${esc(portraitSrc)}" alt="" onerror="this.style.display='none'">
            </div>
            <div class="npc-dialogue-copy">
              <header class="npc-dialogue-header">
                <div class="npc-dialogue-speaker">
                  ${options.speakerReading ? `<span class="npc-dialogue-speaker-reading">${esc(options.speakerReading)}</span>` : ''}
                  <span class="npc-dialogue-speaker-name">${esc(options.speaker || '')}</span>
                </div>
                <div class="npc-dialogue-tools">
                  <button class="npc-dialogue-tool npc-dialogue-audio" type="button" ${hasAudio ? '' : 'disabled'} aria-label="Play audio">♪</button>
                  <button class="npc-dialogue-tool npc-dialogue-log" type="button" disabled aria-label="Dialogue log">▣</button>
                </div>
              </header>
              <div class="npc-dialogue-text">${content}</div>
            </div>
          </article>
          <div class="npc-dialogue-utility-row">
            <button class="npc-dialogue-utility npc-dialogue-translate" type="button" disabled>
              <span class="npc-dialogue-book-icon" aria-hidden="true"></span>
              <span class="npc-dialogue-btn-roman">honyaku suru</span>
              <span class="npc-dialogue-btn-jp">翻訳する</span>
              <span class="npc-dialogue-btn-en">Translate</span>
            </button>
            <button class="npc-dialogue-utility npc-dialogue-learn" type="button" disabled>
              <span class="npc-dialogue-learn-icon" aria-hidden="true"></span>
              <span class="npc-dialogue-btn-roman">manabu</span>
              <span class="npc-dialogue-btn-jp">学ぶ</span>
              <span class="npc-dialogue-btn-en">Learn</span>
            </button>
          </div>
          <button class="npc-dialogue-continue" type="button">
            <span class="npc-dialogue-btn-roman">${pageIndex < pages.length - 1 ? 'tsugi' : 'tsugi e susumu'}</span>
            <span class="npc-dialogue-btn-jp">${pageIndex < pages.length - 1 ? '次' : '次へ進む'}</span>
            <span class="npc-dialogue-btn-en">${continueLabel}</span>
            <span class="npc-dialogue-continue-arrow" aria-hidden="true">▶</span>
          </button>
        </div>
      `;

      const textEl = actionArea.querySelector('.npc-dialogue-text');
      if (pageTokens?.length && textEl) {
        dialogueLookup.attachWordClickHandlers(textEl);
      }

      actionArea.querySelector('.npc-dialogue-audio')?.addEventListener('click', () => {
        if (hasAudio) playDialogueAudio(options.audio.userId, options.audio.key);
      });

      actionArea.querySelector('.npc-dialogue-continue')?.addEventListener('click', () => {
        if (pageIndex < pages.length - 1) {
          pageIndex += 1;
          render();
          return;
        }
        finish();
      });
    };

    render();
  });
}
