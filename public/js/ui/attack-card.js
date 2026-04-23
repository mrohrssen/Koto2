/**
 * Attack card rendering and tap affordances — extracted from combat-loop.js (Strangler Fig).
 * Pure presentation: builds card HTML, inserts into DOM, waits for tap, fades out.
 */

import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
import { creatureSpriteHtml, SPRITE_VERSION } from './sprite-utils.js';
import { SC_NAMES } from './combat-ui-utils.js';
import { prefetchWord, playWordPair } from '../tts.js';

/** Map move `category` → tone class used by CSS for color. */
export function resultTone(atk) {
  switch (atk?.category) {
    case 'damage': return 'damage';
    case 'drain':  return 'damage';
    case 'heal':   return 'heal';
    case 'buff':   return 'buff';
    case 'shield': return 'buff';
    case 'debuff': return 'debuff';
    default:       return 'damage';
  }
}

/** Human-readable status labels for effect names used in attack payloads. */
const EFFECT_LABELS = {
  confuse:     'Confused!',
  poison:      'Poisoned!',
  sleep:       'Sleeping!',
  stun:        'Stunned!',
  paralyze:    'Paralyzed!',
  haste:       'Hasted!',
  team_shield: 'Shielded!',
};

/** Format the right-side result string from the attack payload. */
export function formatResultValue(atk) {
  const cat = atk?.category;
  if (cat === 'damage' || cat === 'drain') {
    // Drain: damage on the target only. The self-heal half is rendered separately
    // by buildSplitAttackCard as a secondary line, not by this helper.
    return `-${atk.damage ?? 0} HP`;
  }
  if (cat === 'heal') {
    return `+${atk.healAmount ?? 0} HP`;
  }
  if (cat === 'buff' || cat === 'debuff' || cat === 'shield') {
    const changes = atk.statChangesApplied;
    if (changes) {
      const [stat, value] = Object.entries(changes)[0];
      const name = (SC_NAMES?.[stat] || stat).toUpperCase();
      return `${name} ${value > 0 ? '+' : ''}${value}`;
    }
    if (atk.effectApplied) {
      return EFFECT_LABELS[atk.effectApplied] || (atk.effectApplied.charAt(0).toUpperCase() + atk.effectApplied.slice(1) + '!');
    }
    if (cat === 'shield') return 'Shielded!';
    return '';
  }
  return '';
}

/** Effectiveness line shown under the damage number (damage/drain only). */
export function effectivenessText(atk) {
  if (atk?.category !== 'damage' && atk?.category !== 'drain') return '';
  const mult = atk.elementMultiplier;
  if (mult === undefined || mult === null || mult === 1) return '';
  if (mult === 0) return '(No effect!)';
  if (mult < 1)   return '(Not very effective…)';
  return '(Super effective!)';
}

export const ATTACK_CARD_TIMING = {
  ROW_STAGGER: 50,
  ROW_ANIM_DURATION: 100,
  FADE_OUT_DURATION: 100
};

export const ELEMENT_THEME = {
  water:  { border: 'rgba(33,150,243,0.35)',  bg: '#e8f4fd',  accent: '#1976D2' },
  fire:   { border: 'rgba(244,67,54,0.35)',   bg: '#fdecea',  accent: '#D32F2F' },
  earth:  { border: 'rgba(141,110,99,0.35)',  bg: '#f0ebe8',  accent: '#6D4C41' },
  metal:  { border: 'rgba(158,158,158,0.35)', bg: '#eeeeee',  accent: '#616161' },
  wood:   { border: 'rgba(76,175,80,0.35)',   bg: '#e8f5e9',  accent: '#388E3C' }
};

const KANJI_RE = /[\u4e00-\u9faf\u3400-\u4dbf]/;
const KATAKANA_RE = /[\u30A0-\u30FF]/;

/** Map an English skill/base name to the action icon sprite path. */
function actionIconPath(nameEn) {
  if (!nameEn) return '';
  const slug = nameEn.split(';')[0].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return slug ? `/assets/sprites/actions/${slug}.webp?v=20260322` : '';
}

function escHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWithRuby(word, reading, englishReading) {
  if (!word || !reading) return word || '';
  if (KANJI_RE.test(word) && word !== reading) {
    return `<ruby>${word}<rt>${reading}</rt></ruby>`;
  }
  if (englishReading && KATAKANA_RE.test(word)) {
    return `<ruby>${word}<rt>${englishReading}</rt></ruby>`;
  }
  return word || '';
}

function npcSpritePath(npcId) {
  return `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`;
}

/**
 * @param {Object} atk - Attack payload
 * @param {boolean} isEnemy - Target column sprite flip (enemy attacking player)
 * @param {Object} [options]
 * @param {Object} [options.theme] - Override theme; default ELEMENT_THEME[atk.attackerElement]
 * @param {string} [options.attackerHtml] - Full inner HTML for the attacker row (e.g. NPC sprite + name)
 */
export function buildSplitAttackCard(atk, isEnemy, options = {}) {
  const theme = options.theme != null
    ? options.theme
    : (ELEMENT_THEME[atk.attackerElement] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' });

  const knownWords = getKnownWords();
  const wordDict = new Map();

  const attackerToken = entityToToken({
    word: atk.attackerBaseWord || atk.attackerNameJp || atk.attackerName,
    reading: atk.attackerBaseReading,
    nameEn: atk.attackerBaseMeaning || atk.attackerName,
  });
  const moveToken = entityToToken({
    word: atk.attackerSkillName || atk.moveName,
    reading: atk.attackerSkillReading,
    nameEn: atk.attackerSkillEn || atk.moveNameEn,
  });
  const targetToken = entityToToken({
    word: atk.targetBaseWord || atk.targetNameJp || atk.targetName,
    reading: atk.targetBaseReading,
    nameEn: atk.targetBaseMeaning || atk.targetName,
  });

  const attackerWordHtml = renderJpSentence([attackerToken], knownWords, wordDict);
  const moveWordHtml     = renderJpSentence([moveToken], knownWords, wordDict);
  const targetWordHtml   = renderJpSentence([targetToken], knownWords, wordDict);

  const spriteWord = atk.attackerBaseWord || atk.attackerName || '？';
  const attackerSpriteHtml = creatureSpriteHtml(atk.attackerId, spriteWord, atk.attackerElement, 'sac-sprite');

  const moveIcon = actionIconPath(atk.attackerSkillEn || atk.moveNameEn);
  const moveIconHtml = moveIcon
    ? `<img class="sac-sprite" src="${moveIcon}" alt="" onerror="this.style.display='none'">`
    : '';

  const isSelfTarget = atk.targetId === atk.attackerId && atk.targetIndex === atk.attackerIndex;
  const targetSpriteClass = isSelfTarget ? 'sac-sprite' : (isEnemy ? 'sac-sprite' : 'sac-sprite sac-sprite-enemy');
  const targetSpriteWord = atk.targetBaseWord || atk.targetName || '？';
  const targetSpriteHtml = creatureSpriteHtml(atk.targetId, targetSpriteWord, atk.targetElement, targetSpriteClass);

  const resultValue = formatResultValue(atk);
  const tone = resultTone(atk);
  const effText = effectivenessText(atk);
  const effHtml = effText
    ? `<span class="sac-effectiveness sac-fx-${tone}">${effText}</span>`
    : '';

  // Drain: small secondary "self-heal" line under the damage number
  const drainHealHtml = (atk.category === 'drain' && atk.healAmount > 0)
    ? `<span class="sac-drain-self">+${atk.healAmount} HP self</span>`
    : '';

  const attackerRowInner = options.attackerHtml !== undefined
    ? options.attackerHtml
    : `<div class="sac-sprite-tile">${attackerSpriteHtml}</div>
       <div class="sac-body">${attackerWordHtml}</div>`;

  return `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-bg:${theme.bg};--sac-accent:${theme.accent};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-row" data-row="0">
      ${attackerRowInner}
      <span class="sac-down-arrow">»</span>
    </div>
    <div class="sac-row" data-row="1">
      <div class="sac-sprite-tile">${moveIconHtml}</div>
      <div class="sac-body">${moveWordHtml}</div>
      <span class="sac-down-arrow">»</span>
    </div>
    <div class="sac-row" data-row="2">
      <div class="sac-sprite-tile">${targetSpriteHtml}</div>
      <div class="sac-body">
        ${targetWordHtml}
        <div class="sac-result">
          <span class="sac-result-value sac-tone-${tone}">${resultValue}</span>
          ${effHtml}
          ${drainHealHtml}
        </div>
      </div>
    </div>
    <div class="sac-continue-strip">
      <span class="sac-continue">tap to continue</span>
    </div>
  </div>`;
}

/**
 * Insert the split attack card into the action area and start staggered reveal.
 * @param {Object} atk - Attack object from server
 * @param {boolean} isEnemy - Whether this is an enemy attack
 * @returns {Element|null} The card element, or null if action-area not found
 */
export function insertAttackCard(atk, isEnemy) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return null;

  actionArea.innerHTML = buildSplitAttackCard(atk, isEnemy);

  const card = actionArea.querySelector('.split-attack-card');
  if (!card) return null;

  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  const baseWord = atk.attackerBaseWord;
  const skillName = atk.attackerSkillName || atk.moveName;
  if (baseWord) prefetchWord(baseWord);
  if (skillName) prefetchWord(skillName);
  setTimeout(() => playWordPair(baseWord, skillName), 50);

  return card;
}

/**
 * Build and insert a split attack card for an NPC skill hit.
 */
export function insertNpcAttackCard(atk) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return null;

  const theme = ELEMENT_THEME[atk.moveElement] || ELEMENT_THEME['neutral'] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' };
  const spriteUrl = npcSpritePath(atk.attackerId);
  const attackerNameJp = atk.attackerNameJp || atk.attackerName;
  const attackerNameHtml = wrapWithRuby(attackerNameJp, attackerNameJp, atk.attackerName);
  const leftHtml = `<img class="sac-sprite" src="${escHtml(spriteUrl)}" alt=""><div class="sac-attacker-name">${attackerNameHtml}</div>`;

  actionArea.innerHTML = buildSplitAttackCard(atk, true, {
    theme,
    leftHtml,
    tagLabelsByCategory: { drain: 'NPC' },
    defaultCategoryTagLabel: 'NPC',
  });

  const card = actionArea.querySelector('.split-attack-card');
  if (!card) return null;

  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  const baseWord = atk.attackerBaseWord;
  const skillName = atk.attackerSkillName || atk.moveName;
  if (baseWord) prefetchWord(baseWord);
  if (skillName) prefetchWord(skillName);
  setTimeout(() => playWordPair(baseWord, skillName), 50);

  return card;
}

/**
 * Wait for the player to tap the attack card to continue.
 * Shows the continue indicator, resolves on click, fades out card.
 * @param {Element} card - The .split-attack-card element
 * @returns {Promise<void>}
 */
export function waitForCardTap(card) {
  return new Promise((resolve) => {
    if (!card) { resolve(); return; }

    const actionArea = card.closest('#action-area') || card.parentElement;

    const indicator = card.querySelector('.sac-continue');
    if (indicator) indicator.style.display = '';

    let resolved = false;
    const onTap = () => {
      if (resolved) return;
      resolved = true;
      if (actionArea) actionArea.removeEventListener('click', onTap);

      card.classList.add('sac-fading-out');
      setTimeout(() => resolve(), ATTACK_CARD_TIMING.FADE_OUT_DURATION);
    };

    (actionArea || card).addEventListener('click', onTap);
  });
}

/**
 * Convenience: show card and immediately wait for tap.
 */
export function showAttackCardAndWait(atk, isEnemy) {
  const card = insertAttackCard(atk, isEnemy);
  return waitForCardTap(card);
}
