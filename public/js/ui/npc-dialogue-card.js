import { toRomaji } from './romaji.js';
import { getKnownWords, esc } from './bootstrap-client.js';
import {
  getTokenBaseForm,
  isContentExposureToken,
  resolveExposureMeaning,
} from '../shared/exposure-extractor.js';
import * as dialogueLookup from './dialogue-word-lookup.js';
import { playDialogueAudio } from '../tts.js';
import { translateDialogue } from '../api.js';
import { crystalCostHtml } from './crystals.js';

const DEFAULT_PORTRAIT = '/assets/dialogue/default-headshot.png?v=20260501-headshot';
const MAX_TOKENS_PER_PAGE = 9;
const MAX_TOKENS_PER_LINE = 4;
const ATTACHABLE_PUNCT_RE = /^[\p{P}\p{S}]+$/u;

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

function isAttachablePunctuation(token) {
  const surface = token?.surface || '';
  return !!surface && !isContentExposureToken(token) && ATTACHABLE_PUNCT_RE.test(surface);
}

function dialogueCellsForTokens(tokens = []) {
  const cells = [];
  for (const token of tokens) {
    if (isAttachablePunctuation(token) && cells.length > 0 && !cells[cells.length - 1].standalone) {
      cells[cells.length - 1].trailingPunct += token.surface || '';
      continue;
    }
    cells.push({ token, trailingPunct: '', standalone: !isContentExposureToken(token) });
  }
  return cells;
}

function paginateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length <= MAX_TOKENS_PER_PAGE) return [tokens || []];
  return chunkByCount(tokens, MAX_TOKENS_PER_PAGE);
}

function tokenSurface(token, useKanji) {
  if (!token) return '';
  if (!isContentExposureToken(token)) return token.surface || '';
  if (useKanji) return token.surface || token.reading || token.baseForm || '';
  return token.surface || token.reading || token.baseForm || '';
}

export function getDialogueSourceText(tokens, useKanji = false) {
  return (tokens || []).map(token => tokenSurface(token, useKanji)).join('').trim();
}

function stableEntitySignature(entities = []) {
  return (entities || [])
    .map(entity => `${entity.type}:${entity.id}:${entity.surface}:${entity.displayName}`)
    .sort()
    .join('|');
}

function getDialogueActionKey({ action, options, pageIndex, sourceText, entities }) {
  const scope = options.encounterId || options.dialogueId || options.roomId || options.speaker || 'dialogue';
  return `${action}:${scope}:page-${pageIndex}:${sourceText}:${stableEntitySignature(entities)}`;
}

function cleanEntityValue(value) {
  return String(value || '').trim();
}

export function normalizeTranslationEntity(entity) {
  const id = cleanEntityValue(entity?.id);
  const type = cleanEntityValue(entity?.type) || 'entity';
  const surface = cleanEntityValue(entity?.surface || entity?.name || entity?.baseWord);
  const displayName = cleanEntityValue(entity?.displayName || entity?.nameEn);
  if (!id || !surface || !displayName) return null;
  return { id, type, surface, displayName };
}

export function getTranslationEntities(options = {}, pageTokens = []) {
  const entities = [];
  const seen = new Set();
  const addEntity = entity => {
    const normalized = normalizeTranslationEntity(entity);
    if (!normalized) return;
    const key = `${normalized.type}:${normalized.id}:${normalized.surface}:${normalized.displayName}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push(normalized);
  };

  addEntity(options.speakerEntity);
  for (const token of pageTokens || []) {
    if (token?.entity) addEntity(token);
  }
  return entities;
}

export function renderTranslationWithEntities(translation = '', entities = []) {
  const text = String(translation || '');
  const spans = Array.isArray(entities)
    ? entities
        .filter(span => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= text.length)
        .sort((a, b) => a.start - b.start)
    : [];

  let html = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    html += esc(text.slice(cursor, span.start));
    html += `<span class="npc-dialogue-translation-entity" data-entity-type="${esc(span.type || 'entity')}" data-entity-id="${esc(span.id || '')}">${esc(text.slice(span.start, span.end))}</span>`;
    cursor = span.end;
  }
  html += esc(text.slice(cursor));
  return html;
}

function renderTranslationSourceRows({
  tokens,
  useKanji = false,
} = {}) {
  const lines = chunkByCount(dialogueCellsForTokens(tokens || []), MAX_TOKENS_PER_LINE);
  return lines.map(lineCells => {
    const pronunciation = [];
    const jp = [];

    for (const cell of lineCells) {
      const token = cell.token;
      if (!isContentExposureToken(token)) {
        pronunciation.push('<span class="npc-dialogue-cell npc-dialogue-cell--punct"></span>');
        jp.push(`<span class="npc-dialogue-cell jp-punct">${esc(token.surface || '')}</span>`);
        continue;
      }

      const base = tokenBase(token);
      const reading = token.reading || token.surface || base;
      const display = `${displayReading(token, useKanji)}${cell.trailingPunct || ''}`;
      const pronunciationText = useKanji ? reading : toRomaji(reading);

      pronunciation.push(`<span class="npc-dialogue-cell">${esc(pronunciationText)}</span>`);
      jp.push(`<span class="npc-dialogue-cell jp-word">${esc(display)}</span>`);
    }

    return `
      <div class="npc-dialogue-line-grid" style="--npc-dialogue-cols:${Math.max(1, lineCells.length)}">
        <div class="npc-dialogue-romaji-row">${pronunciation.join('')}</div>
        <div class="npc-dialogue-jp-row">${jp.join('')}</div>
      </div>
    `;
  }).join('');
}

function renderTranslationSheet({ sourceText, sourceHtml = '', state, translation = '', entities = [] }) {
  const body = state === 'loading'
    ? '<div class="npc-dialogue-translation-status">Translating...</div>'
    : state === 'success'
      ? `<p class="npc-dialogue-translation-en">${renderTranslationWithEntities(translation, entities)}</p>`
      : state === 'insufficient'
        ? '<p class="npc-dialogue-translation-error">Not enough crystals. Come back tomorrow for more.</p>'
      : `
        <p class="npc-dialogue-translation-error">Translation is unavailable right now.</p>
        <button class="npc-dialogue-translation-retry" type="button">Try again</button>
      `;

  return `
    <div class="npc-dialogue-translation-backdrop" role="presentation"></div>
    <section class="npc-dialogue-translation-sheet" role="dialog" aria-modal="true" aria-label="Dialogue translation">
      <div class="npc-dialogue-translation-handle" aria-hidden="true"></div>
      <header class="npc-dialogue-translation-header">
        <h3>Translation</h3>
        <button class="npc-dialogue-translation-close" type="button" aria-label="Close translation">Done</button>
      </header>
      <div class="npc-dialogue-translation-source">${sourceHtml || esc(sourceText)}</div>
      ${body}
    </section>
  `;
}

export function renderDialogueTokenRows({
  tokens,
  knownWords = getKnownWords(),
  wordDict = null,
  overrides = {},
  useKanji = false,
} = {}) {
  const lines = chunkByCount(dialogueCellsForTokens(tokens || []), MAX_TOKENS_PER_LINE);
  return lines.map(lineCells => {
    const romaji = [];
    const jp = [];
    const en = [];

    for (const cell of lineCells) {
      const token = cell.token;
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
      jp.push(`<span class="npc-dialogue-cell jp-word ${typeClass}"${attrs}>${esc(display)}${esc(cell.trailingPunct || '')}</span>`);
      en.push(`<span class="npc-dialogue-cell">${esc(meaning)}</span>`);
    }

    return `
      <div class="npc-dialogue-line-grid" style="--npc-dialogue-cols:${Math.max(1, lineCells.length)}">
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
      const sourceText = pageTokens?.length ? getDialogueSourceText(pageTokens, options.useKanji) : '';
      const sourceHtml = pageTokens?.length ? renderTranslationSourceRows({ tokens: pageTokens, useKanji: options.useKanji }) : '';
      const translationEntities = pageTokens?.length ? getTranslationEntities(options, pageTokens) : [];
      const canTranslate = !!sourceText;
      const canLearn = !!sourceText && typeof options.onLearn === 'function';

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
            <button class="npc-dialogue-utility npc-dialogue-translate" type="button" ${canTranslate ? '' : 'disabled'}>
              <span class="npc-dialogue-btn-roman">honyaku suru</span>
              <span class="npc-dialogue-jp-line">${crystalCostHtml(5)}<span class="npc-dialogue-btn-jp">翻訳する</span></span>
              <span class="npc-dialogue-btn-en">Translate</span>
            </button>
            <button class="npc-dialogue-utility npc-dialogue-learn" type="button" ${canLearn ? '' : 'disabled'}>
              <span class="npc-dialogue-btn-roman">manabu</span>
              <span class="npc-dialogue-jp-line">${crystalCostHtml(15)}<span class="npc-dialogue-btn-jp">学ぶ</span></span>
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

      const closeTranslationSheet = () => {
        actionArea.querySelector('.npc-dialogue-translation-backdrop')?.remove();
        actionArea.querySelector('.npc-dialogue-translation-sheet')?.remove();
      };

      const setTranslationSheet = (state, translation = '', entities = []) => {
        closeTranslationSheet();
        actionArea.insertAdjacentHTML(
          'beforeend',
          renderTranslationSheet({ sourceText, sourceHtml, state, translation, entities })
        );
        actionArea.querySelector('.npc-dialogue-translation-close')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-backdrop')?.addEventListener('click', closeTranslationSheet);
        actionArea.querySelector('.npc-dialogue-translation-retry')?.addEventListener('click', requestTranslation);
      };

      const translationKey = getDialogueActionKey({
        action: 'translate',
        options,
        pageIndex,
        sourceText,
        entities: translationEntities
      });
      let translationInFlight = false;
      let translationPaidForPage = false;
      let lastTranslationResult = null;

      const requestTranslation = async () => {
        if (!sourceText || translationInFlight) return;
        if (translationPaidForPage && lastTranslationResult) {
          setTranslationSheet('success', lastTranslationResult.translation, lastTranslationResult.entities || []);
          return;
        }
        translationInFlight = true;
        const translateButton = actionArea.querySelector('.npc-dialogue-translate');
        if (translateButton) translateButton.disabled = true;
        setTranslationSheet('loading');
        const result = await translateDialogue(sourceText, translationEntities, translationKey);
        translationInFlight = false;
        if (translateButton) translateButton.disabled = false;
        if (resolved) return;
        if (result?.ok && result.translation) {
          translationPaidForPage = true;
          lastTranslationResult = result;
          if (translateButton) {
            translateButton.classList.add('npc-dialogue-utility--paid');
            translateButton.querySelector('.crystal-cost')?.remove();
          }
          setTranslationSheet('success', result.translation, result.entities || []);
          options.onCrystalBalanceChange?.(result.crystals?.balance);
          return;
        }
        setTranslationSheet(result?.error === 'insufficient_crystals' ? 'insufficient' : 'unavailable');
      };

      actionArea.querySelector('.npc-dialogue-translate')?.addEventListener('click', requestTranslation);

      const learnKey = getDialogueActionKey({
        action: 'learn',
        options,
        pageIndex,
        sourceText,
        entities: translationEntities
      });
      let learnInFlight = false;
      let learnPaidForPage = false;

      const requestLearn = async () => {
        if (!canLearn || learnInFlight || learnPaidForPage) return;
        learnInFlight = true;
        const learnButton = actionArea.querySelector('.npc-dialogue-learn');
        if (learnButton) learnButton.disabled = true;
        const result = await options.onLearn({
          sourceText,
          entities: translationEntities,
          idempotencyKey: learnKey,
          pageIndex
        });
        learnInFlight = false;
        if (resolved) return;
        if (result?.ok) {
          learnPaidForPage = true;
          if (learnButton) {
            learnButton.disabled = false;
            learnButton.classList.add('npc-dialogue-utility--paid');
            learnButton.querySelector('.crystal-cost')?.remove();
          }
          options.onCrystalBalanceChange?.(result.crystals?.balance);
          return;
        }
        if (learnButton) learnButton.disabled = false;
      };

      actionArea.querySelector('.npc-dialogue-learn')?.addEventListener('click', requestLearn);

      actionArea.querySelector('.npc-dialogue-continue')?.addEventListener('click', () => {
        closeTranslationSheet();
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
