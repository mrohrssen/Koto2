/**
 * @file combat-loop.js - Turn-Based Combat Orchestration
 *
 * PURPOSE:
 * Manages the vocab-pause turn-based combat system. Each turn requires the
 * player to review a vocabulary word before attacking. Combat flow:
 * word review -> player attack -> 400ms delay -> enemy attack -> pause -> repeat
 *
 * KEY EXPORTS:
 * - init(callbacks): Setup with game state, UI, and API callbacks
 * - startCombatLoop(): Begin combat, show first flash card
 * - executePlayerAttack(): Process player attack
 * - executeEnemyAttackThenPause(): Enemy attacks then pauses for vocab
 * - resumeCombatAfterVocab(): Continue combat after word review
 * - stopCombatLoop(result): End combat, show narration and victory/defeat
 * - isCombatActive(), isCombatPausedForVocab(): State getters
 * - cleanupCombat(): Reset state without showing results
 *
 * DEPENDENCIES:
 * - ../audio.js: Sound effects (attack, player-hit, victory)
 * - ../api.js: getAuthHeaders for authenticated requests
 * - Callbacks: wordPractice, characterUI, settings, narration modules
 *
 * COMBAT MATH DISPLAY:
 * Shows damage numbers with tiered visual feedback.
 */

import { playSFX } from '../audio.js';
import { getAuthHeaders } from '../api.js';
import { PLATFORM } from '../platform.js';
import { logger } from '../logger.js';
import { renderJpFirst, renderEnFirst, flushExposures } from './bootstrap-client.js';
import { t, tPlain } from './i18n.js';
import {
  impactEnemyEffect,
  delay as effectDelay,
  getDamageTier,
  getTierClassName,
  fireCreatureAttackEffect,
  enemyCreatureAttackEffect,
  showXpPopup,
  showLevelUpPopup,
  poisonTickEffect,
  healEffect,
  spawnParticles,
  flashElement,
  clearFormationTransforms,
  lunge
} from './combat-effects.js';
import { effectiveness, resistedEffectiveness, skillProc, buff, debuff, updateStatusIcons, clearAllStatusIcons } from './event-popup.js';
import { playAttackSound } from './combat-audio.js';
import { replaceWithTextSprite, creatureSpriteHtml, creatureStaticPath, SPRITE_VERSION } from './sprite-utils.js';
import { toRomaji } from './romaji.js';
import { combatEvents } from './combat-events.js';

function npcSpritePath(npcId) {
  return `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`;
}
import { prefetchWord, playWordPair, playDialogueAudio } from '../tts.js';
import { init as initMoveSelect, showMoves, clear as clearMoveSelect, setActiveLabel } from './move-select.js';
import { init as initTargetSelect, showEnemies, showAllies, clear as clearTargetSelect } from './target-select.js';
import { showLearnPrompt } from './move-learn.js';
import { renderButtonsAsync } from './ui-components.js';
import { playNpcSkillAnimation } from './room-transition.js';

// ============ SPLIT ATTACK CARD ============

const ATTACK_CARD_TIMING = {
  ROW_STAGGER: 50,
  ROW_ANIM_DURATION: 100,
  FADE_OUT_DURATION: 100
};

const ELEMENT_THEME = {
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

function wrapWithRuby(word, reading, englishReading) {
  if (!word || !reading) return word || '';
  // Kanji: show hiragana reading
  if (KANJI_RE.test(word) && word !== reading) {
    return `<ruby>${word}<rt>${reading}</rt></ruby>`;
  }
  // Katakana creature names: show English reading if provided
  if (englishReading && KATAKANA_RE.test(word)) {
    return `<ruby>${word}<rt>${englishReading}</rt></ruby>`;
  }
  return word || '';
}

function buildSplitAttackCard(atk, isEnemy) {
  const theme = ELEMENT_THEME[atk.attackerElement] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' };

  const baseWordHtml = renderJpFirst(atk.attackerBaseWord, atk.attackerBaseReading, atk.attackerBaseMeaning);
  const skillNameHtml = renderJpFirst(atk.attackerSkillName, atk.attackerSkillReading, atk.attackerSkillEn);

  // Creature names: use English name as furigana for katakana (not teaching targets)
  const attackerNameJp = atk.attackerNameJp || atk.attackerName;
  const attackerNameHtml = wrapWithRuby(attackerNameJp, attackerNameJp, atk.attackerName);

  let damageSign;
  if (atk.healAmount > 0) damageSign = `+${atk.healAmount}`;
  else if (atk.damage > 0) damageSign = `-${atk.damage}`;
  else if (atk.effectApplied) damageSign = atk.effectApplied;
  else if (atk.statChangesApplied) {
    const SC_NAMES = { atk: 'ATK', def: 'DEF' };
    damageSign = Object.entries(atk.statChangesApplied).map(([s, v]) => `${SC_NAMES[s] || s} ${v > 0 ? '+' : ''}${v}`).join(' ');
  }
  else damageSign = '0';
  const targetDisplayName = atk.targetNameJp || atk.targetName || '';
  const targetNameHtml = wrapWithRuby(targetDisplayName, targetDisplayName, atk.targetName);

  const baseIcon = actionIconPath(atk.attackerBaseMeaning);
  const skillIcon = actionIconPath(atk.attackerSkillEn);

  const cat = atk.category || 'damage';
  const tagLabel = { heal: 'HEAL', buff: 'BUFF', shield: 'DEF', debuff: 'DBF', drain: 'ATK' }[cat] || 'ATK';
  const tagClass = { heal: 'sac-tag-heal', buff: 'sac-tag-buff', shield: 'sac-tag-buff', debuff: 'sac-tag-debuff' }[cat] || 'sac-tag-atk';
  const damageClass = (atk.healAmount > 0) ? 'sac-heal' : 'sac-damage';

  const attackerWord = atk.attackerBaseWord || atk.attackerName || '？';
  const targetWord = atk.targetBaseWord || atk.targetName || '？';

  // Flip target enemy sprite to face left when player attacks
  const targetSpriteClass = isEnemy ? 'sac-creature-sprite' : 'sac-creature-sprite sac-sprite-enemy';

  return `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-bg:${theme.bg};--sac-accent:${theme.accent};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-left">
      ${creatureSpriteHtml(atk.attackerId, attackerWord, atk.attackerElement, 'sac-creature-sprite')}
      <div class="sac-attacker-name">${attackerNameHtml}</div>
    </div>
    <div class="sac-right">
      <div class="sac-row" data-row="0">
        ${baseIcon ? `<img class="sac-action-icon" src="${baseIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${baseWordHtml}</span>
        <span class="sac-meaning">${atk.attackerBaseMeaning || ''}</span>
        <span class="sac-tag sac-tag-base">BASE</span>
      </div>
      <div class="sac-row" data-row="1">
        ${skillIcon ? `<img class="sac-action-icon" src="${skillIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${skillNameHtml}</span>
        <span class="sac-meaning">${atk.attackerSkillEn || ''}</span>
        <span class="sac-tag ${tagClass}">${tagLabel}</span>
      </div>
      <div class="sac-row sac-impact" data-row="2">
        <span class="sac-impact-arrow">\u2192</span>
        ${creatureSpriteHtml(atk.targetId, targetWord, atk.targetElement, targetSpriteClass)}
        <span class="sac-impact-name">${targetNameHtml}</span>
        <span class="${damageClass}">${damageSign}</span>
      </div>
    </div>
    <span class="sac-continue" style="display:none">\u25BC</span>
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

  // Staggered row reveal
  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  // Prefetch and play base word + move name audio with a tiny gap
  const baseWord = atk.attackerBaseWord;
  const skillName = atk.attackerSkillName || atk.moveName;
  if (baseWord) prefetchWord(baseWord);
  if (skillName) prefetchWord(skillName);
  // Play after a brief delay to let prefetch start (cached words resolve near-instantly)
  setTimeout(() => playWordPair(baseWord, skillName), 50);

  return card;
}

/**
 * Build and insert a split attack card for an NPC skill hit.
 * Uses NPC sprite instead of creature sprite.
 */
function insertNpcAttackCard(atk) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return null;

  const theme = ELEMENT_THEME[atk.moveElement] || ELEMENT_THEME['neutral'] || { border: 'rgba(0,0,0,0.1)', bg: '#f5f7fa', accent: '#8b92a0' };
  const spriteUrl = npcSpritePath(atk.attackerId);

  const baseWordHtml = renderJpFirst(atk.attackerBaseWord, atk.attackerBaseReading, atk.attackerBaseMeaning);
  const skillNameHtml = renderJpFirst(atk.attackerSkillName, atk.attackerSkillReading, atk.attackerSkillEn);

  const attackerNameJp = atk.attackerNameJp || atk.attackerName;
  const attackerNameHtml = wrapWithRuby(attackerNameJp, attackerNameJp, atk.attackerName);

  let damageSign;
  if (atk.healAmount > 0) damageSign = `+${atk.healAmount}`;
  else if (atk.damage > 0) damageSign = `-${atk.damage}`;
  else if (atk.effectApplied) damageSign = atk.effectApplied;
  else if (atk.statChangesApplied) {
    const SC_NAMES = { atk: 'ATK', def: 'DEF' };
    damageSign = Object.entries(atk.statChangesApplied).map(([s, v]) => `${SC_NAMES[s] || s} ${v > 0 ? '+' : ''}${v}`).join(' ');
  }
  else damageSign = '0';
  const targetDisplayName = atk.targetNameJp || atk.targetName || '';
  const targetNameHtml = wrapWithRuby(targetDisplayName, targetDisplayName, atk.targetName);

  const baseIcon = actionIconPath(atk.attackerBaseMeaning);
  const skillIcon = actionIconPath(atk.attackerSkillEn);

  const cat = atk.category || 'damage';
  const tagLabel = { heal: 'HEAL', buff: 'BUFF', shield: 'DEF', debuff: 'DBF', drain: 'NPC' }[cat] || 'NPC';
  const tagClass = { heal: 'sac-tag-heal', buff: 'sac-tag-buff', shield: 'sac-tag-buff', debuff: 'sac-tag-debuff' }[cat] || 'sac-tag-atk';
  const damageClass = (atk.healAmount > 0) ? 'sac-heal' : 'sac-damage';

  const targetWord = atk.targetBaseWord || atk.targetName || '？';

  const html = `<div class="split-attack-card" style="--sac-border:${theme.border};--sac-bg:${theme.bg};--sac-accent:${theme.accent};--sac-row-dur:${ATTACK_CARD_TIMING.ROW_ANIM_DURATION}ms">
    <div class="sac-left">
      <img class="sac-sprite" src="${spriteUrl}" alt="">
      <div class="sac-attacker-name">${attackerNameHtml}</div>
    </div>
    <div class="sac-right">
      <div class="sac-row" data-row="0">
        ${baseIcon ? `<img class="sac-action-icon" src="${baseIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${baseWordHtml}</span>
        <span class="sac-meaning">${atk.attackerBaseMeaning || ''}</span>
        <span class="sac-tag sac-tag-base">BASE</span>
      </div>
      <div class="sac-row" data-row="1">
        ${skillIcon ? `<img class="sac-action-icon" src="${skillIcon}" alt="" onerror="this.style.display='none'">` : ''}
        <span class="sac-vocab">${skillNameHtml}</span>
        <span class="sac-meaning">${atk.attackerSkillEn || ''}</span>
        <span class="sac-tag ${tagClass}">${tagLabel}</span>
      </div>
      <div class="sac-row sac-impact" data-row="2">
        <span class="sac-impact-arrow">\u2192</span>
        ${creatureSpriteHtml(atk.targetId, targetWord, atk.targetElement, 'sac-creature-sprite')}
        <span class="sac-impact-name">${targetNameHtml}</span>
        <span class="${damageClass}">${damageSign}</span>
      </div>
    </div>
    <span class="sac-continue" style="display:none">\u25BC</span>
  </div>`;

  actionArea.innerHTML = html;
  const card = actionArea.querySelector('.split-attack-card');
  if (!card) return null;

  // Staggered row reveal (same as regular attack cards)
  const rows = card.querySelectorAll('.sac-row');
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('sac-visible'), i * ATTACK_CARD_TIMING.ROW_STAGGER);
  });

  // TTS for NPC base word + skill name
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

    // Show continue indicator
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

    // Listen on action-area (larger tap target) or card itself
    (actionArea || card).addEventListener('click', onTap);
  });
}

/**
 * Convenience: show card and immediately wait for tap.
 * Use when there are no effects to fire between card display and tap.
 * @param {Object} atk - Attack object from server
 * @param {boolean} isEnemy - Whether this is an enemy attack
 * @returns {Promise<void>}
 */
function showAttackCardAndWait(atk, isEnemy) {
  const card = insertAttackCard(atk, isEnemy);
  return waitForCardTap(card);
}

/**
 * Shared attack display sequence used by both PvE and PvP.
 * Shows: card → sound → effects → damage → STAB → effectiveness → party skill procs → tap.
 *
 * @param {Object} atk - Attack object from server
 * @param {Object} opts
 * @param {boolean} opts.isEnemy - Whether this attack is from the enemy's perspective
 * @param {Element|null} opts.sourceEl - Attacker's formation slot element
 * @param {Element|null} opts.targetEl - Target's formation slot element
 * @param {number} [opts.targetMaxHp=100] - Target's max HP (for tiered impact effects)
 * @returns {Promise<Element|null>} The attack card element
 */
export async function showAttackDisplay(atk, { isEnemy, sourceEl, targetEl, targetMaxHp = 100 }) {
  const attackCard = insertAttackCard(atk, isEnemy);

  playSFX('attack');
  const element = atk.moveElement || atk.attackerElement || 'neutral';

  if (atk.damage > 0 && sourceEl && targetEl) {
    playAttackSound(element);
    if (isEnemy) {
      await enemyCreatureAttackEffect(sourceEl, targetEl, element, atk.damage);
    } else {
      await fireCreatureAttackEffect(sourceEl, targetEl, element, atk.damage, targetMaxHp);
    }
  }

  // Damage number on the target
  if (atk.damage > 0 && targetEl) {
    const { showDamageNumber } = await import('./scene.js');
    showDamageNumber(atk.damage, { isCrit: atk.critical, targetEl });
  }

  // STAB indicator — center-screen banner
  if (atk.stab) {
    const banner = document.createElement('div');
    banner.className = 'super-effective-banner';
    banner.textContent = 'Super effective!';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 1100);
  }

  // Type effectiveness popup
  if (atk.elementMultiplier > 1 && targetEl) {
    setTimeout(() => effectiveness(targetEl, 'Super Effective!'), 400);
  } else if (atk.elementMultiplier < 1 && targetEl) {
    setTimeout(() => resistedEffectiveness(targetEl, 'Resisted...'), 400);
  }

  // Stat stage change popups
  if (atk.statChangesApplied && targetEl) {
    const SC_NAMES = { atk: 'ATK', def: 'DEF' };
    for (const [stat, change] of Object.entries(atk.statChangesApplied)) {
      if (change === 0) continue;
      const dir = change > 0 ? `+${change}` : `${change}`;
      const text = `${SC_NAMES[stat] || stat} ${dir}`;
      if (change > 0) buff(targetEl, text);
      else debuff(targetEl, text);
    }
  }

  // Party skill procs (bonus damage, heals, haste, shields)
  if (atk.partySkillProcs?.length) {
    const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
    for (const proc of atk.partySkillProcs) {
      let detail = '';
      if (proc.type === 'bonusDamage') detail = ` +${proc.bonusDamage}`;
      else if (proc.type === 'healAll') detail = ` +${proc.healAmount} HP`;

      if (sourceEl) {
        skillProc(sourceEl, `${proc.skillName}!${detail}`);
        flashElement(sourceEl.querySelector('.formation-sprite'), 1);
      }

      if (proc.type === 'bonusDamage' && targetEl) {
        spawnParticles(targetEl, 6, '#FFB74D');
      } else if (proc.type === 'healAll') {
        allAllySlots.forEach(slot => {
          const sprite = slot.querySelector('.formation-sprite');
          if (sprite && !sprite.classList.contains('ko')) healEffect(slot, proc.healAmount);
        });
      } else if (proc.type === 'haste' && sourceEl) {
        spawnParticles(sourceEl, 8, '#4fc3f7');
      } else if (proc.type === 'teamShield') {
        allAllySlots.forEach(slot => {
          const sprite = slot.querySelector('.formation-sprite');
          if (sprite && !sprite.classList.contains('ko')) spawnParticles(slot, 6, '#42A5F5');
        });
      } else if (proc.type === 'chainHit') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const chainTargetEl = allEnemySlots[proc.targetIndex];
        if (chainTargetEl) {
          spawnParticles(chainTargetEl, 4, proc.isSE ? '#FF6B6B' : '#FFD93D');
          if (showDamageNumber) showDamageNumber(proc.damage, false, false);
        }
      } else if (proc.type === 'stageChange') {
        const SC_NAMES = { atk: 'ATK', def: 'DEF' };
        const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
        const text = `${SC_NAMES[proc.stat] || proc.stat} ${dir}`;
        const slots = proc.targetSide === 'enemy'
          ? document.querySelectorAll('#enemy-formation .formation-slot')
          : document.querySelectorAll('#player-formation .formation-slot');
        const el = slots[proc.targetIndex];
        if (el) {
          if (proc.delta > 0) buff(el, text);
          else debuff(el, text);
        }
      } else if (proc.type === 'spread') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const spreadTargetEl = allEnemySlots[proc.targetIndex];
        if (spreadTargetEl) {
          skillProc(spreadTargetEl, 'SPREAD!');
          spawnParticles(spreadTargetEl, 4, '#9C27B0');
        }
      } else if (proc.type === 'teamBuff') {
        const SC_NAMES = { atk: 'ATK', def: 'DEF' };
        allAllySlots.forEach(slot => {
          buff(slot, `${SC_NAMES[proc.stat] || proc.stat} +${proc.delta}`);
        });
      } else if (proc.type === 'burst') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        const burstTargetEl = allEnemySlots[proc.targetIndex];
        if (burstTargetEl) {
          skillProc(burstTargetEl, 'AFFLICTION BURST!');
          if (showDamageNumber) showDamageNumber(proc.damage, false, false);
          spawnParticles(burstTargetEl, 10, '#E91E63');
        }
      } else if (proc.type === 'pandemic') {
        const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
        allEnemySlots.forEach(slot => {
          skillProc(slot, 'PANDEMIC!');
          spawnParticles(slot, 6, '#9C27B0');
        });
      }

      await effectDelay(600);
    }
  }

  // Tap to continue
  if (attackCard) {
    await waitForCardTap(attackCard);
  } else {
    await effectDelay(800);
  }

  return attackCard;
}

// ============ MODULE STATE ============

// Combat state
let combatActive = false;
let playerAttackPending = false;
let enemyAttackPending = false;
let combatPausedForVocab = false;
let pendingActionType = null; // 'attack' or 'defend' - set when card selected
let playerAttackTimer = null;
let enemyAttackTimer = null;

// Move-based combat state
let moveChoices = [];
let currentCreatureIndex = 0;
let pendingMove = null;

// Callback references (set during init)
let getGameState = null;
let updateGameState = null;
let updateUI = null;
let settings = null;
let narration = null;
let wordPractice = null;
let characterUI = null;

// Combat UI functions
let showDamageNumber = null;
let showDotDamage = null;
let animateEnemyHurt = null;
let animatePlayerHurt = null;
let animateEnemyDefeat = null;
let updateActionPanel = null;
let playNarrationAudio = null;
let showVictoryModal = null;
let showGameOverModal = null;
let showEnemyDialogue = null;
let getEnemyDialogueActive = null;
let getDialogueDismissPromise = null;
let showFlashCards = null;
let setCombatAnimationActive = null;
let apiCreatureCombatCycle = null;
let showPostCombatShop = null;
let apiBefriendReplace = null;
let apiGetBefriendConversation = null;
let apiSubmitBefriendAnswer = null;
let apiStartNpcDialogue = null;
let apiRespondNpcDialogue = null;
let showNpcSprite = null;
let hideNpcSprite = null;
let updateCreatureRowData = null;

// Kana mode state
let kanaSwipeResolve = null;
let kanaSwipeDirection = null;

// Utility
let delay = null;

const API_BASE = PLATFORM.apiBase;

/** Wrap an async combat animation sequence with the animation-active guard. */
async function withAnimationActive(fn) {
  if (setCombatAnimationActive) setCombatAnimationActive(true);
  try {
    return await fn();
  } finally {
    if (setCombatAnimationActive) setCombatAnimationActive(false);
  }
}

/** Get NPC data from current combat state */
function getCombatNpcData() {
  const state = getGameState();
  return state?.combat?.npcData || null;
}

/** Get current enemy creatures for re-rendering after NPC skill animation */
function getCombatEnemies() {
  const state = getGameState();
  return state?.combat?.enemies || [];
}

/**
 * Initialize the combat loop UI module with callbacks
 * @param {Object} callbacks - Dependency injection callbacks
 */
export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  settings = callbacks.settings;
  narration = callbacks.narration;
  wordPractice = callbacks.wordPractice;
  characterUI = callbacks.characterUI;

  // Combat UI functions
  showDamageNumber = callbacks.showDamageNumber;
  showDotDamage = callbacks.showDotDamage;
  animateEnemyHurt = callbacks.animateEnemyHurt;
  animatePlayerHurt = callbacks.animatePlayerHurt;
  animateEnemyDefeat = callbacks.animateEnemyDefeat;
  updateActionPanel = callbacks.updateActionPanel;
  playNarrationAudio = callbacks.playNarrationAudio;
  showVictoryModal = callbacks.showVictoryModal;
  showGameOverModal = callbacks.showGameOverModal;
  showEnemyDialogue = callbacks.showEnemyDialogue;
  getEnemyDialogueActive = callbacks.getEnemyDialogueActive;
  getDialogueDismissPromise = callbacks.getDialogueDismissPromise;
  showFlashCards = callbacks.showFlashCards;

  // Utility
  delay = callbacks.delay;
  setCombatAnimationActive = callbacks.setCombatAnimationActive;
  apiCreatureCombatCycle = callbacks.apiCreatureCombatCycle;
  showPostCombatShop = callbacks.showPostCombatShop;
  apiBefriendReplace = callbacks.apiBefriendReplace;
  apiGetBefriendConversation = callbacks.apiGetBefriendConversation;
  apiSubmitBefriendAnswer = callbacks.apiSubmitBefriendAnswer;
  apiStartNpcDialogue = callbacks.apiStartNpcDialogue;
  apiRespondNpcDialogue = callbacks.apiRespondNpcDialogue;
  showNpcSprite = callbacks.showNpcSprite;
  hideNpcSprite = callbacks.hideNpcSprite;
  updateCreatureRowData = callbacks.updateCreatureRowData;
}

/**
 * Initialize move/target selection UI callbacks.
 * Called by game.js after combatLoop.init().
 */
export function initMoveUI() {
  initMoveSelect({
    onMoveSelectCb: handleMoveSelected,
    onItemsOpenCb: () => {
      console.log('[combat] Items button pressed — not yet implemented');
    },
    onMoveHelpCb: (move) => {
      // Remove existing popup
      document.querySelector('.move-help-backdrop')?.remove();
      document.querySelector('.move-help-popup')?.remove();

      const STATUS_LABELS = {
        poison: 'Poison', stun: 'Stun', confuse: 'Confuse',
        shield: 'Shield', team_shield: 'Team Shield',
        haste: 'Haste'
      };
      const STAT_NAMES = { atk: 'ATK', def: 'DEF' };
      const CAT_LABELS = {
        damage: 'Attack', drain: 'Drain', heal: 'Heal',
        shield: 'Shield', buff: 'Buff', debuff: 'Debuff'
      };

      const TARGET_LABELS = {
        single_enemy: 'Single Target', all_enemies: 'All Targets',
        self: 'Self', single_ally: 'Single Ally', all_allies: 'All Allies',
        enemy: 'Single Target'
      };

      let statsHtml = '';
      statsHtml += `<span class="mhp-stat">${CAT_LABELS[move.category] || move.category}</span>`;
      if (move.power > 0) statsHtml += `<span class="mhp-stat">Power ${move.power}</span>`;
      statsHtml += `<span class="mhp-stat">${move.mpCost} MP</span>`;
      if (move.element) statsHtml += `<span class="mhp-stat">${move.element}</span>`;
      if (move.statChanges) {
        for (const [stat, amount] of Object.entries(move.statChanges)) {
          const dir = amount > 0 ? `+${amount}` : `${amount}`;
          statsHtml += `<span class="mhp-stat">${STAT_NAMES[stat] || stat} ${dir}</span>`;
        }
      }
      if (move.statusEffect) {
        const label = STATUS_LABELS[move.statusEffect] || move.statusEffect;
        const dur = move.statusDuration ? ` ${move.statusDuration}T` : '';
        statsHtml += `<span class="mhp-stat">${label}${dur}</span>`;
      }
      if (move.target && move.target !== 'enemy') {
        statsHtml += `<span class="mhp-stat">${TARGET_LABELS[move.target] || move.target}</span>`;
      }

      const moveNameHtml = renderJpFirst(move.name, move.reading, move.meaning);
      const descHtml = move.descriptionTagged
        ? renderEnFirst(move.descriptionTagged)
        : (move.description || '');

      const backdrop = document.createElement('div');
      backdrop.className = 'move-help-backdrop';

      const popup = document.createElement('div');
      popup.className = 'move-help-popup';
      popup.innerHTML = `
        <div class="mhp-name">${moveNameHtml}</div>
        <div class="mhp-stats">${statsHtml}</div>
        ${descHtml ? `<div class="mhp-desc">${descHtml}</div>` : ''}
      `;

      const dismiss = () => {
        backdrop.remove();
        popup.remove();
      };
      backdrop.addEventListener('click', dismiss);
      popup.addEventListener('click', dismiss);

      document.body.appendChild(backdrop);
      document.body.appendChild(popup);
      flushExposures();
    }
  });
  initTargetSelect({
    onTargetSelectCb: handleTargetSelected,
    onCancelCb: handleTargetCancelled
  });
}

/**
 * Start move selection for a new turn.
 * Replaces the old pauseForNextVocab flow for creature combat.
 */
export function startMoveSelection() {
  const state = getGameState();
  // Kana combat mode disabled — move-based combat always runs (Task 8.1)
  // if (state.meta?.kanaMode) {
  //   startKanaCombatRound();
  //   return;
  // }
  moveChoices = [];
  currentCreatureIndex = 0;
  promptNextCreature();
}

// ============ KANA MODE COMBAT ============

export function handleKanaSwipe(direction) {
  kanaSwipeDirection = direction;
  if (kanaSwipeResolve) {
    kanaSwipeResolve(direction);
    kanaSwipeResolve = null;
  }
}

export function isKanaRoundInProgress() {
  return kanaSwipeResolve !== null;
}

async function startKanaCombatRound() {
  const state = getGameState();
  const party = state.run?.creatureParty?.active || [];
  const enemies = state.combat?.enemies || [];
  const choices = [];

  for (let i = 0; i < party.length; i++) {
    const creature = party[i];
    if (!creature || creature.hp <= 0) continue;

    // Find first living enemy
    const targetIndex = enemies.findIndex(e => e && e.hp > 0);
    if (targetIndex === -1) break;

    // Fetch kana card from server
    const kanaCard = await fetchKanaCard();
    if (!kanaCard) break;

    // Show kana card using existing single-card flash card UI
    const kanaWord = {
      word: kanaCard.char,
      reading: kanaCard.romaji,
      meanings: [kanaCard.romaji]
    };

    // Wait for swipe via Promise resolved by handleKanaSwipe()
    const direction = await new Promise(resolve => {
      kanaSwipeResolve = resolve;
      showFlashCards([kanaWord]);
    });

    // Map swipe direction to FSRS grade
    const grade = (direction === 'right') ? 'good' : 'again';
    submitKanaReview(kanaCard.char, grade);

    // Auto-pick cheapest single-target move
    const move = pickCheapestMove(creature);
    if (move) {
      choices.push({ creatureIndex: i, moveId: move.id, targetIndex });
    }
  }

  if (choices.length > 0) {
    await executeCreatureMovesTurn(choices);
  }
}

async function fetchKanaCard() {
  try {
    const response = await fetch(`${API_BASE}/api/game/kana-card`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('[KanaMode] Failed to fetch kana card:', e);
    return null;
  }
}

async function submitKanaReview(char, grade) {
  try {
    await fetch(`${API_BASE}/api/game/kana-review`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ char, grade })
    });
  } catch (e) {
    console.error('[KanaMode] Failed to submit kana review:', e);
  }
}

function pickCheapestMove(creature) {
  if (!creature.moves?.length) return null;
  return creature.moves
    .filter(m => m.target === 'single_enemy' && creature.mp >= m.mpCost)
    .sort((a, b) => a.mpCost - b.mpCost)[0] || null;
}

// ============ END KANA MODE COMBAT ============

function isBefriendSlotBlocked(slot) {
  return !!(getGameState().combat?.befriendAttemptedSlots?.[slot]);
}

/** Per-creature: はなす available if this slot has not already spent their action on befriend this round. */
function isBefriendAvailableForSlot(slot) {
  const state = getGameState();
  if (!state.combat?.isCreatureCombat || state.combat?.npcId) return false;
  if (isBefriendSlotBlocked(slot)) return false;
  const enemies = state.combat.enemies || [];
  const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
  if (alive.length !== 1) return false;
  return (alive[0].hp / alive[0].maxHp) <= 0.5;
}

function getMoveSelectBefriendOpts(slot) {
  // Old befriend button disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // const befriendAvailable = isBefriendAvailableForSlot(slot);
  return {
    befriendAvailable: false,
    onBefriend: undefined
  };
}

function mergeBefriendSlotsFromTalkResponse(result) {
  if (!result?.befriendAttemptedSlots || !getGameState().combat) return;
  const gs = getGameState();
  updateGameState({
    ...gs,
    combat: {
      ...gs.combat,
      befriendAttemptedSlots: { ...result.befriendAttemptedSlots }
    }
  });
}

/** After はなす uses a creature's turn (any outcome), continue move picks for the rest of the party. */
function resumeMoveSelectionAfterBefriendSpend(actingSlot) {
  if (actingSlot == null || typeof actingSlot !== 'number') {
    startMoveSelection();
    return;
  }
  currentCreatureIndex = actingSlot + 1;
  promptNextCreature();
}

/** Handle the player tapping the はなす (Talk) button during move selection. */
async function handleBefriendTalk() {
  if (!combatActive) return;
  const actingSlot = currentCreatureIndex;

  return withAnimationActive(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/game/befriend-talk`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatureIndex: actingSlot })
      });
      if (!resp.ok) {
        let msg = tPlain('befriendTalkBlocked');
        try {
          const err = await resp.json();
          if (err?.error) msg = `${msg} (${String(err.error)})`;
        } catch { /* ignore */ }
        console.error('[CombatLoop] Befriend talk HTTP error:', resp.status);
        if (narration?.showNarration) narration.showNarration(msg, { persistent: false });
        const gs = getGameState();
        const allies = gs.combat?.allies || gs.run?.creatureParty?.active || [];
        const creature = allies[actingSlot];
        if (creature) {
          clearTargetSelect();
          setActiveLabel(creature);
          showMoves(creature, actingSlot, getMoveSelectBefriendOpts(actingSlot));
        } else {
          startMoveSelection();
        }
        return;
      }
      const result = await resp.json();
      mergeBefriendSlotsFromTalkResponse(result);

      if (!result.accepted) {
        // Creature refused — show rejection + enemy attack
        const state = getGameState();
        const enemies = state.combat?.enemies || [];
        const alive = enemies.filter(e => e.hp > 0);
        const creatureName = alive[0]?.nameEn || alive[0]?.name || 'Creature';

        narration.showNarration(`${creatureName} refused to talk!`, { persistent: false });
        if (delay) await delay(600);

        // Show enemy counter-attacks as split attack cards
        if (result.enemyAttacks?.length) {
          for (const atk of result.enemyAttacks) {
            const card = insertAttackCard(atk, true);
            if (atk.damage > 0) {
              playSFX('player-hit');
              if (animatePlayerHurt) animatePlayerHurt(atk.targetIndex ?? 0);
              if (showDamageNumber) showDamageNumber(atk.damage, true, false);
            }
            if (card) {
              await waitForCardTap(card);
            } else {
              if (delay) await delay(400);
            }
          }
        }

        // Update state with new HP values
        if (result.allies || result.enemies) {
          updateGameState({
            ...state,
            combat: {
              ...state.combat,
              allies: result.allies || state.combat.allies,
              enemies: result.enemies || state.combat.enemies
            }
          });
          updateUI();
          if (updateCreatureRowData) {
            const updated = getGameState();
            updateCreatureRowData(updated.run?.creatureParty, updated.combat);
          }
        }

        if (result.combatEnded) {
          combatActive = false;
          if (showGameOverModal) showGameOverModal();
          return;
        }

        resumeMoveSelectionAfterBefriendSpend(actingSlot);
        return;
      }

      // Accepted — launch the existing befriend conversation flow
      await executeBefriendAction(actingSlot);

    } catch (err) {
      console.error('[CombatLoop] Befriend talk error:', err);
      resumeMoveSelectionAfterBefriendSpend(actingSlot);
    }
  });
}

function promptNextCreature() {
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];

  // Skip KO'd creatures
  while (currentCreatureIndex < allies.length && (!allies[currentCreatureIndex] || allies[currentCreatureIndex].hp <= 0)) {
    currentCreatureIndex++;
  }

  if (currentCreatureIndex >= allies.length) {
    // All creatures have chosen -- execute the turn
    executeCreatureMovesTurn(moveChoices);
    return;
  }

  const creature = allies[currentCreatureIndex];
  clearTargetSelect();
  setActiveLabel(creature);
  showMoves(creature, currentCreatureIndex, getMoveSelectBefriendOpts(currentCreatureIndex));
}

function handleMoveSelected(move, creatureIndex) {
  pendingMove = move;
  const state = getGameState();

  if (move.target === 'single_enemy') {
    const enemies = state.combat?.enemies || [];
    const alive = enemies.filter(e => e.hp > 0 && !e.befriended);
    if (alive.length === 0) {
      // No valid targets — skip target selection, auto-advance
      moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
      currentCreatureIndex++;
      promptNextCreature();
      return;
    }
    if (alive.length === 1) {
      // Single target — auto-select, skip UI
      const autoIdx = enemies.indexOf(alive[0]);
      moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: autoIdx });
      currentCreatureIndex++;
      promptNextCreature();
      return;
    }
    showEnemies(enemies, move);
  } else if (move.target === 'single_ally') {
    showAllies(state.combat?.allies || state.run?.creatureParty?.active || [], move);
  } else {
    // AoE or self -- no target needed, targetIndex -1
    moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: move.id, targetIndex: -1 });
    currentCreatureIndex++;
    promptNextCreature();
  }
}

function handleTargetSelected(targetIndex) {
  moveChoices.push({ creatureIndex: currentCreatureIndex, moveId: pendingMove.id, targetIndex });
  pendingMove = null;
  currentCreatureIndex++;
  promptNextCreature();
}

function handleTargetCancelled() {
  // Go back to move selection for this creature
  pendingMove = null;
  const state = getGameState();
  const allies = state.combat?.allies || state.run?.creatureParty?.active || [];
  const creature = allies[currentCreatureIndex];
  if (creature) {
    clearTargetSelect();
    setActiveLabel(creature);
    showMoves(creature, currentCreatureIndex, getMoveSelectBefriendOpts(currentCreatureIndex));
  }
}

function handleDefendSelected() {
  // Execute defend turn immediately (all creatures defend)
  executeCreatureDefendThenPause();
}

// ============ STATE GETTERS/SETTERS ============

/**
 * Check if combat loop is active
 * @returns {boolean}
 */
export function isCombatActive() {
  return combatActive;
}

/**
 * Check if combat is paused for vocab review
 * @returns {boolean}
 */
export function isCombatPausedForVocab() {
  return combatPausedForVocab;
}

/**
 * Cleanup combat state without showing results (for returnToHub)
 */
export function cleanupCombat() {
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }
  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;
  clearAllStatusIcons();
}

/**
 * Pause combat and show next move selection (for use after external actions like swaps).
 * In move-based combat, this starts the move selection grid instead of flashcards.
 */
export function pauseForNextVocab() {
  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;
  if (isCreatureCombat) {
    startMoveSelection();
  } else {
    combatPausedForVocab = true;
    showNextDualCardsFromQueue();
  }
}

function showNextDualCardsFromQueue() {
  const words = wordPractice.getTwoCombatWords?.();
  if (!words || !words.attackWord) {
    // Fallback: not enough words, use single card flow
    const word = wordPractice.getNextCombatWord?.();
    if (word && showFlashCards) {
      pendingActionType = 'attack'; // Default to attack if single card
      showFlashCards([word]);
    }
    return;
  }

  // Old befriend flash-card path disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // const anyEnemyBefriendable = enemies.some(e => e.hp > 0 && (e.hp / e.maxHp) <= 0.5);
  // const befriendAvailable = isCreatureCombat && anyEnemyBefriendable && party && !state.combat?.npcId;
  if (showFlashCards) {
    showFlashCards([words.attackWord, words.defendWord]);
  }
}

// Keep old function for backwards compatibility / fallback
function showNextFlashCardFromQueue() {
  const word = wordPractice.getNextCombatWord?.();
  if (word && showFlashCards) {
    showFlashCards([word]);
  }
}


/**
 * Find a creature slot element by creature ID (matches against game state).
 * Works for both allied creature slots (attacker) and targeted creature slots.
 * @param {string} creatureId - The creature's ID
 * @returns {Element|null} The .formation-slot DOM element, or null
 */
function findCreatureSlotByAttackerId(creatureId, allyIndex = null) {
  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return null;

  let index = -1;
  if (typeof allyIndex === 'number' && allyIndex >= 0 && allyIndex < activeCreatures.length) {
    index = allyIndex;
  } else if (creatureId) {
    index = activeCreatures.findIndex(r => r && r.id === creatureId);
  }
  if (index < 0) return null;

  const slots = document.querySelectorAll('#player-formation .formation-slot');
  return slots[index] || null;
}

/**
 * Find the enemy slot element for a specific target in formation-based combat.
 * Falls back to npc-display or the whole enemy-formation container.
 * @param {string} targetId - Enemy template id (fallback when enemyIndex missing)
 * @param {Array} enemies - The enemies array from the result
 * @param {number|null} enemyIndex - Slot in `enemies` (authoritative when duplicate species)
 * @returns {Element} The specific enemy slot element or the container
 */
function findEnemyTargetElement(targetId, enemies, enemyIndex = null) {
  const slot = document.querySelector(`#enemy-formation .formation-slot[data-index="${enemyIndex}"]`);
  if (slot) return slot;
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay && npcDisplay.classList.contains('visible')) return npcDisplay;
  return document.getElementById('enemy-formation');
}

/**
 * Directly update creature HP bar widths in the DOM without triggering full updateUI.
 * This avoids resetting enemy HP bars from stale game state during animations.
 * @param {Array} creatures - The creature party active array (with final HP from server)
 * @param {Object} allyHpMap - Map of creatureId -> { hp, maxHp } with running HP values
 */
function getHpColor(pct) {
  if (pct > 60) return 'var(--hp-green)';
  if (pct > 30) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

function updateCreatureHpBars(creatures, allyHpMap) {
  if (!creatures) return;
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  creatures.forEach((creature, i) => {
    const slot = slots[i];
    if (!slot || !creature) return;
    const currentHp = allyHpMap?.[creature.id] ? allyHpMap[creature.id].hp : creature.hp;
    const hpPct = Math.max(0, (currentHp / creature.maxHp) * 100);
    const fill = slot.querySelector('.formation-hp-fill');
    if (fill) {
      fill.style.width = `${hpPct}%`;
      fill.style.backgroundColor = getHpColor(hpPct);
    }
    // Update KO state
    const icon = slot.querySelector('.formation-sprite');
    if (icon) {
      if (currentHp <= 0) {
        icon.classList.add('ko');
      } else {
        icon.classList.remove('ko');
      }
    }
    // Update MP bar
    const mpFill = slot.querySelector('.formation-mp-fill');
    const mpText = slot.querySelector('.formation-mp-text');
    if (mpFill && creature.maxMp > 0) {
      const curMp = creature.currentMp ?? creature.mp ?? 0;
      const mpPct = Math.max(0, (curMp / creature.maxMp) * 100);
      mpFill.style.width = `${mpPct}%`;
      if (mpText) mpText.textContent = `${curMp}/${creature.maxMp}`;
    }
  });
}

/**
 * Show enemy damage to player in big red text in the action area
 * @param {Object} enemyAttack - The enemy attack result
 */
function showEnemyDamageDisplay(enemyAttack) {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  if (enemyAttack.perfectDodge) {
    actionArea.innerHTML = `<div class="combat-enemy-damage dodge">${t('perfectDodge')}</div>`;
  } else if (enemyAttack.dodged) {
    actionArea.innerHTML = `<div class="combat-enemy-damage dodge">${t('dodged')}</div>`;
  } else if (enemyAttack.miss) {
    actionArea.innerHTML = `<div class="combat-enemy-damage miss">${t('miss')}</div>`;
  } else {
    const crit = enemyAttack.critical ? `<div class="combat-enemy-crit">${t('critical')}</div>` : '';
    actionArea.innerHTML = `<div class="combat-enemy-damage">${crit}<span class="enemy-damage-number">-${enemyAttack.damage}</span></div>`;
  }
}

// ============ XP EVENT HANDLING ============

/**
 * Process xpEvents from the backend and show animated XP popups over creature slots.
 * Also handles level-up popups and updates the level badge in the DOM.
 * @param {Array} xpEvents - Array of { xpGrants: [...], levelUps: [...] }
 */
function showXpEvents(xpEvents) {
  const pendingMoveLearn = [];
  if (!xpEvents || xpEvents.length === 0) return pendingMoveLearn;

  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return pendingMoveLearn;

  const slots = document.querySelectorAll('#player-formation .formation-slot');

  for (const event of xpEvents) {
    // Show XP popups for each creature that gained XP
    if (event.xpGrants) {
      for (const grant of event.xpGrants) {
        const index = activeCreatures.findIndex(r => r && r.id === grant.creatureId);
        if (index >= 0 && slots[index]) {
          showXpPopup(slots[index], grant.xp);
        }
      }
    }

    // Show level-up popups
    if (event.levelUps) {
      for (const lu of event.levelUps) {
        const index = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
        if (index >= 0 && slots[index]) {
          // Slight delay so it appears after XP popup
          setTimeout(() => showLevelUpPopup(slots[index], lu.newLevel, lu.hpGain), 400);
        }
        // Collect move learns for later processing
        if (lu.newMove) {
          const creature = activeCreatures.find(r => r && r.id === lu.creatureId);
          if (creature) {
            const creatureIdx = activeCreatures.findIndex(r => r && r.id === lu.creatureId);
            pendingMoveLearn.push({ creature, creatureIndex: creatureIdx, newMove: lu.newMove });
          }
        }
      }
    }
  }

  return pendingMoveLearn;
}

/**
 * Process pending move-learn prompts after combat state sync.
 * For each pending item, checks if the move was auto-learned (already in moves array)
 * or needs replacement (creature has 4 moves). Shows UI prompt and calls backend API.
 * @param {Array} pendingList - Array of { creature, creatureIndex, newMove }
 */
async function processPendingMoveLearn(pendingList) {
  const state = getGameState();
  const activeCreatures = state.run?.creatureParty?.active;
  if (!activeCreatures) return;

  for (const item of pendingList) {
    // Re-read creature from synced state (may have been updated by syncFinalState)
    const creature = activeCreatures.find(r => r && r.id === item.creature.id);
    if (!creature) continue;
    const creatureIndex = activeCreatures.findIndex(r => r && r.id === item.creature.id);

    // Check if move was auto-learned (already in creature's moves after state sync)
    const alreadyLearned = creature.moves?.some(m => m.id === item.newMove.id);

    // Pass alreadyLearned flag so the prompt shows the right UI
    // (after syncFinalState, auto-added moves make creature.moves.length == 3)
    const result = await showLearnPrompt(creature, creatureIndex, item.newMove, alreadyLearned);

    if (result.action === 'skip') {
      continue;
    }

    if (result.action === 'replace') {
      // Call backend to replace the move
      const response = await fetch(`${API_BASE}/api/game/learn-move`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          creatureIndex: creatureIndex,
          newMoveId: item.newMove.id,
          replaceIndex: result.replaceIndex
        })
      });
      const data = await response.json();
      if (data.state) {
        updateGameState(data.state);
      }
    }
  }
}

// ============ COMBAT LOOP FUNCTIONS ============

/**
 * Start the combat loop (vocab-pause turn-based combat)
 */
export async function startCombatLoop() {
  if (combatActive) return;

  logger.info('[CombatLoop] Combat started');
  combatActive = true;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  // Start move selection for the first turn
  startMoveSelection();
}

/**
 * Execute a single player attack and schedule the next one
 */
export async function executePlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'player', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Player attack:', { damage: result.playerAttack?.damage, critical: result.playerAttack?.critical });

      if (result.error) {
        // "No active combat" means server state is out of sync - don't trigger false game over
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false; // Sync client state
          return;
        }
        console.error('Player attack error:', result.error);
        // Don't trigger defeat for errors - let player retry
        playerAttackPending = false;
        return;
      }

      // If dialogue appeared during fetch, don't process results
      if (getEnemyDialogueActive()) {
        playerAttackPending = false;
        return;
      }


      // Show player's attack result
      if (result.playerAttack) {
        const pa = result.playerAttack;
        if (pa.perfectDodge) {
          showDamageNumber(0, false, false, false, false, 'perfect');
        } else if (pa.dodged) {
          showDamageNumber(0, false, false, false, false, 'dodge');
        } else if (pa.miss) {
          showDamageNumber(0, false, false, false, false, 'miss');
        } else {
          // Play attack sound immediately
          playSFX('attack');

          // Calculate damage tier for visual feedback
          const state = getGameState();
          const enemyMaxHp = state.combat?.enemy?.maxHp || 100;
          const tier = getDamageTier(pa.damage, enemyMaxHp);
          const tierClass = `dmg-${getTierClassName(tier)}`;

          // Show damage at same time as final damage reveal
          showDamageNumber(pa.damage, false, pa.critical, false, false, null, tierClass);
          animateEnemyHurt();
          const enemySlot = document.querySelector('#enemy-formation .formation-slot');
          if (enemySlot) combatEvents.emit('creatureHit', { slotEl: enemySlot, side: 'enemy' });

          // Visual effects for enemy damage (pass enemyMaxHp for tier-based effects)
          const enemySprite = document.getElementById('enemy-sprite');
          await impactEnemyEffect(pa.damage, enemySprite, enemyMaxHp);
        }
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);

      // Show glitching dialogue when enemy HP drops below 30%
      // Combat pauses until dialogue dismisses, then enemy attacks
      if (result.enemyGlitching && result.glitchingDialogue) {
        playerAttackPending = false;
        showEnemyDialogue(result.glitchingDialogue, 'glitching');
        return;
      }

      // Check if combat ended
      if (result.combatEnded) {
        // Show liberated dialogue on victory
        if (result.victory && result.liberatedDialogue) {
          showEnemyDialogue(result.liberatedDialogue, 'liberated');
        }
        // Let HP bar drain animation (300ms CSS transition) be visible before stopping
        if (result.victory) {
          await delay(500);
        }
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Combat pause mode: trigger enemy attack after player, then pause for vocab review
      if (combatActive && !getEnemyDialogueActive()) {
        // Small delay before enemy attacks back
        setTimeout(() => {
          executeEnemyAttackThenPause();
        }, 400);
      }

    } catch (error) {
      console.error('Player attack error:', error);
      // Don't trigger defeat for errors - recover by showing next flashcard
      playerAttackPending = false;

      // Recovery: pause for vocab and show dual cards so player can continue
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from player attack error, showing dual cards');
      }
    }
  });
}

// ============ SHARED CREATURE COMBAT HELPERS ============

/** Show a floating text label above a target element (for status effects) */
function showFloatingText(targetEl, text) {
  const rect = targetEl.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'floating-effect-text';
  popup.innerHTML = text;
  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top}px`;
  document.body.appendChild(popup);
  popup.addEventListener('animationend', () => popup.remove());
}

/**
 * Show status effect events from start-of-round effect processing.
 * Handles poison ticks with damage animation AND all other status effects
 * (confuse, stun, sleep, buffs, shields) with floating text labels.
 * Used by both attack and defend paths.
 * @param {Object} result - Combat cycle result from server
 */
async function showEffectEvents(result) {
  if (!result.effectEvents?.length) return;
  for (const event of result.effectEvents) {
    if (event.type === 'poison' && event.damage > 0) {
      // Find target element — could be ally or enemy (use slot index when duplicate ids)
      let targetEl = null;
      if (event.targetSide === 'ally' && typeof event.targetIndex === 'number') {
        targetEl = findCreatureSlotByAttackerId(event.targetId, event.targetIndex);
      } else if (event.targetSide === 'enemy' && typeof event.targetIndex === 'number') {
        targetEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${event.targetIndex}"]`);
      }
      if (!targetEl) targetEl = findCreatureSlotByAttackerId(event.targetId);
      if (!targetEl) {
        targetEl = findEnemyTargetElement(event.targetId, result.enemies, event.targetIndex);
      }
      if (targetEl) {
        await poisonTickEffect(targetEl, event.damage);
      }
    } else if (event.type !== 'poison') {
      const EFFECT_LABELS = {
        confuse: t('effectConfuse'),
        stun: t('effectStun'),
        sleep: t('effectSleep'),
        haste: t('effectHaste'),
        shield: t('effectShield'),
        team_shield: t('effectShield'),
        taunt: 'Taunt'
      };
      const baseType = event.type.replace(/_tick$/, '');
      const label = EFFECT_LABELS[baseType] || event.type;
      let targetEl = null;
      if (event.targetSide === 'ally' && typeof event.targetIndex === 'number') {
        targetEl = findCreatureSlotByAttackerId(event.targetId, event.targetIndex);
      } else if (event.targetSide === 'enemy' && typeof event.targetIndex === 'number') {
        targetEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${event.targetIndex}"]`);
      }
      if (!targetEl) targetEl = findCreatureSlotByAttackerId(event.targetId);
      if (!targetEl) {
        targetEl = findEnemyTargetElement(event.targetId, result.enemies, event.targetIndex);
      }
      if (targetEl) {
        // Determine if this is a positive or negative effect
        const BUFF_TYPES = new Set(['haste', 'shield', 'team_shield']);
        const DEBUFF_TYPES = new Set(['confuse', 'stun', 'sleep', 'taunt']);
        if (DEBUFF_TYPES.has(baseType)) {
          debuff(targetEl, label);
        } else if (BUFF_TYPES.has(baseType)) {
          buff(targetEl, label);
        } else {
          showFloatingText(targetEl, label);
        }
        await delay(400);
      }
    }
  }
  syncStatusIconsFromResult(result);
}

/** Derive status icon keys from a creature's activeEffects + statStages. */
function getCreatureStatusKeys(creature) {
  const keys = [];
  if (creature.activeEffects) {
    for (const e of creature.activeEffects) {
      if (!keys.includes(e.type)) keys.push(e.type);
    }
  }
  if (creature.statStages) {
    for (const [stat, stage] of Object.entries(creature.statStages)) {
      if (stage > 0) keys.push(`${stat}_up`);
      else if (stage < 0) keys.push(`${stat}_down`);
    }
  }
  return keys;
}

function syncStatusIconsFromResult(result) {
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const slotEl = document.querySelector(`#player-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, getCreatureStatusKeys(ally));
    });
  }
  if (result.enemies) {
    result.enemies.forEach((enemy, i) => {
      if (!enemy) return;
      const slotEl = document.querySelector(`#enemy-formation .formation-slot[data-index="${i}"]`);
      if (slotEl) updateStatusIcons(slotEl, getCreatureStatusKeys(enemy));
    });
  }
}

/**
 * Show party skill proc visuals inline after a player attack.
 * @param {Object} atk - The attack record with optional partySkillProcs array
 */
async function showPartySkillProcs(atk) {
  if (!atk.partySkillProcs?.length) return;
  const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');

  for (const proc of atk.partySkillProcs) {
    const attackerSlot = findCreatureSlotByAttackerId(atk.attackerId);
    let detail = '';
    if (proc.type === 'bonusDamage') {
      detail = ` +${proc.bonusDamage}`;
    } else if (proc.type === 'healAll') {
      detail = ` +${proc.healAmount} HP`;
    }

    if (attackerSlot) {
      skillProc(attackerSlot, `${proc.skillName}!${detail}`);
      flashElement(attackerSlot.querySelector('.formation-sprite'), 1);
    }

    if (proc.type === 'bonusDamage') {
      const enemyEl = findEnemyTargetElement(atk.targetId, null, atk.targetIndex);
      if (enemyEl) spawnParticles(enemyEl, 6, '#FFB74D');
    } else if (proc.type === 'healAll') {
      allAllySlots.forEach(slot => {
        const sprite = slot.querySelector('.formation-sprite');
        if (sprite && !sprite.classList.contains('ko')) {
          healEffect(slot, proc.healAmount);
        }
      });
    } else if (proc.type === 'haste') {
      if (attackerSlot) spawnParticles(attackerSlot, 8, '#4fc3f7');
    } else if (proc.type === 'teamShield') {
      allAllySlots.forEach(slot => {
        const sprite = slot.querySelector('.formation-sprite');
        if (sprite && !sprite.classList.contains('ko')) {
          spawnParticles(slot, 6, '#42A5F5');
        }
      });
    } else if (proc.type === 'chainHit') {
      const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
      const chainTargetEl = allEnemySlots[proc.targetIndex];
      if (chainTargetEl) {
        spawnParticles(chainTargetEl, 4, proc.isSE ? '#FF6B6B' : '#FFD93D');
        if (showDamageNumber) showDamageNumber(proc.damage, false, false);
      }
    } else if (proc.type === 'stageChange') {
      const SC_NAMES = { atk: 'ATK', def: 'DEF' };
      const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
      const text = `${SC_NAMES[proc.stat] || proc.stat} ${dir}`;
      const slots = proc.targetSide === 'enemy'
        ? document.querySelectorAll('#enemy-formation .formation-slot')
        : document.querySelectorAll('#player-formation .formation-slot');
      const el = slots[proc.targetIndex];
      if (el) {
        if (proc.delta > 0) buff(el, text);
        else debuff(el, text);
      }
    } else if (proc.type === 'spread') {
      const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
      const spreadTargetEl = allEnemySlots[proc.targetIndex];
      if (spreadTargetEl) {
        skillProc(spreadTargetEl, 'SPREAD!');
        spawnParticles(spreadTargetEl, 4, '#9C27B0');
      }
    } else if (proc.type === 'teamBuff') {
      const SC_NAMES = { atk: 'ATK', def: 'DEF' };
      allAllySlots.forEach(slot => {
        buff(slot, `${SC_NAMES[proc.stat] || proc.stat} +${proc.delta}`);
      });
    } else if (proc.type === 'burst') {
      const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
      const burstTargetEl = allEnemySlots[proc.targetIndex];
      if (burstTargetEl) {
        skillProc(burstTargetEl, 'AFFLICTION BURST!');
        if (showDamageNumber) showDamageNumber(proc.damage, false, false);
        spawnParticles(burstTargetEl, 10, '#E91E63');
      }
    } else if (proc.type === 'pandemic') {
      const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
      allEnemySlots.forEach(slot => {
        skillProc(slot, 'PANDEMIC!');
        spawnParticles(slot, 6, '#9C27B0');
      });
    }

    await effectDelay(600);
  }
}

/**
 * Show round-start skill events (Erosion, Momentum, Overflow Vitality).
 * These fire at the start of each round before any actions.
 * @param {Object} result - Combat cycle result from server
 */
async function showRoundStartEvents(result) {
  if (!result.roundStartEvents?.length) return;
  const SC_NAMES = { atk: 'ATK', def: 'DEF' };

  for (const event of result.roundStartEvents) {
    if (event.type === 'erosion') {
      const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
      const el = allEnemySlots[event.targetIndex];
      if (el) {
        const text = `${SC_NAMES[event.stat] || event.stat} ${event.delta}`;
        debuff(el, text);
        spawnParticles(el, 3, '#FF5722');
      }
    } else if (event.type === 'momentum') {
      const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
      const el = allAllySlots[event.targetIndex];
      if (el) {
        const text = `${SC_NAMES[event.stat] || event.stat} +${event.delta}`;
        buff(el, text);
        spawnParticles(el, 3, '#4CAF50');
      }
    } else if (event.type === 'overflowVitality') {
      const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
      const el = allAllySlots[event.targetIndex];
      if (el) {
        healEffect(el, event.healAmount);
      }
    }
    await effectDelay(400);
  }
}

/**
 * Show counter attack animations after enemy attacks.
 * @param {Object} result - Combat cycle result from server
 */
async function showCounterAttacks(result) {
  if (!result.counterAttacks?.length) return;

  for (const counter of result.counterAttacks) {
    const allAllySlots = document.querySelectorAll('#player-formation .formation-slot');
    const defenderEl = allAllySlots[counter.defenderIndex];
    const allEnemySlots = document.querySelectorAll('#enemy-formation .formation-slot');
    const targetEl = allEnemySlots[counter.targetIndex];

    if (defenderEl) {
      skillProc(defenderEl, 'COUNTER!');
      // Lunge toward enemy (positive X = right = toward enemy side)
      const sprite = defenderEl.querySelector('.formation-sprite');
      if (sprite) await lunge(sprite, 40, 300);
      flashElement(sprite, 1);
    }

    if (targetEl && counter.damage > 0) {
      spawnParticles(targetEl, 6, '#FF7043');
      if (showDamageNumber) showDamageNumber(counter.damage, false, false);
    }

    // Show Vengeful Mark and other counter procs
    if (counter.procs?.length) {
      for (const proc of counter.procs) {
        if (proc.type === 'stageChange') {
          const SC_NAMES2 = { atk: 'ATK', def: 'DEF' };
          const dir = proc.delta > 0 ? `+${proc.delta}` : `${proc.delta}`;
          const text = `${SC_NAMES2[proc.stat] || proc.stat} ${dir}`;
          const slots = proc.targetSide === 'enemy'
            ? document.querySelectorAll('#enemy-formation .formation-slot')
            : document.querySelectorAll('#player-formation .formation-slot');
          const el = slots[proc.targetIndex];
          if (el) {
            if (proc.delta > 0) buff(el, text);
            else debuff(el, text);
          }
        } else if (proc.type === 'spread') {
          const spreadSlots = document.querySelectorAll('#enemy-formation .formation-slot');
          const spreadEl = spreadSlots[proc.targetIndex];
          if (spreadEl) {
            skillProc(spreadEl, 'SPREAD!');
            spawnParticles(spreadEl, 4, '#9C27B0');
          }
        } else if (proc.type === 'pandemic') {
          const pandemicSlots = document.querySelectorAll('#enemy-formation .formation-slot');
          pandemicSlots.forEach(slot => {
            skillProc(slot, 'PANDEMIC!');
            spawnParticles(slot, 6, '#9C27B0');
          });
        } else if (proc.type === 'burst') {
          const burstSlots = document.querySelectorAll('#enemy-formation .formation-slot');
          const burstEl = burstSlots[proc.targetIndex];
          if (burstEl) {
            skillProc(burstEl, 'AFFLICTION BURST!');
            if (showDamageNumber) showDamageNumber(proc.damage, false, false);
            spawnParticles(burstEl, 10, '#E91E63');
          }
        }
      }
    }

    await effectDelay(600);
  }
}

/**
 * Build a map of ally HP before enemy attacks for progressive DOM updates.
 * Reconstructs pre-enemy-attack HP by adding back damage dealt to each ally.
 * @param {Object} result - Combat cycle result from server
 * @returns {Object} Map of creatureId -> { hp, maxHp }
 */
function buildAllyHpMap(result) {
  const allyHpMap = {};
  if (result.allies) {
    result.allies.forEach((ally, i) => {
      if (!ally) return;
      const dmgToThisAlly = (result.enemyAttacks || [])
        .filter(a => (typeof a.targetIndex === 'number' ? a.targetIndex === i : a.targetId === ally.id))
        .reduce((sum, a) => sum + a.damage, 0);
      allyHpMap[ally.id] = { hp: ally.hp + dmgToThisAlly, maxHp: ally.maxHp };
    });
  }
  return allyHpMap;
}

/** Pre-player-attack enemy HP for animating bars — keyed by enemy slot index (not template id). */
function buildEnemyHpMapForPlayerAttacks(result) {
  const map = {};
  const enemies = result.enemies || [];
  const attacks = result.playerAttacks || [];
  enemies.forEach((enemy, i) => {
    if (!enemy) return;
    const dmgToThisEnemy = attacks
      .filter(a => (typeof a.targetIndex === 'number' ? a.targetIndex === i : a.targetId === enemy.id))
      .reduce((sum, a) => sum + (a.damage || 0), 0);
    map[i] = {
      hp: Math.min(enemy.hp + dmgToThisEnemy, enemy.maxHp),
      maxHp: enemy.maxHp,
      index: i
    };
  });
  return map;
}

/**
 * Animate enemy attacks against player creatures with real-time HP bar updates.
 * @param {Object} result - Combat cycle result from server
 * @param {Object} allyHpMap - Running ally HP map (mutated in place)
 * @param {boolean} halved - If true, show "halved" damage text (defend mode)
 */
async function showEnemyAttacksAnimated(result, allyHpMap, halved) {
  if (!result.enemyAttacks?.length) return;
  for (const atk of result.enemyAttacks) {
    // Pick i18n key: halved for defend, element-based for attack
    const effectKey = halved ? 'dealsHalved' :
      atk.elementMultiplier > 1 ? 'dealsStrong' :
      atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
    // Insert attack card (if JP name available) or fallback text
    let attackCard = null;
    if (atk.attackerNameJp) {
      attackCard = insertAttackCard(atk, true);
    } else {
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-creature-attack enemy">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
      }
    }

    // Fire effects while card is showing
    showDamageNumber(atk.damage, true, false);
    playSFX('player-hit');

    // Fire element-colored orb from specific attacking enemy to targeted creature
    const enemyEl = findEnemyTargetElement(atk.attackerId, result.enemies, atk.attackerIndex);
    const targetSlotEl = findCreatureSlotByAttackerId(atk.targetId, atk.targetIndex);
    if (enemyEl && targetSlotEl && atk.attackerElement) {
      playAttackSound(atk.attackerElement);
      await enemyCreatureAttackEffect(enemyEl, targetSlotEl, atk.attackerElement, atk.damage);
    } else {
      animatePlayerHurt();
    }

    // Update targeted ally's running HP in the DOM directly (avoid full updateUI)
    const damagedAlly = typeof atk.targetIndex === 'number' ? result.allies?.[atk.targetIndex] : null;
    const hpMapKey = damagedAlly?.id ?? atk.targetId;
    if (hpMapKey && allyHpMap[hpMapKey]) {
      allyHpMap[hpMapKey].hp = Math.max(0, allyHpMap[hpMapKey].hp - atk.damage);
    }
    updateCreatureHpBars(result.creatureParty?.active, allyHpMap);

    // Type effectiveness popup for enemy attacks
    if (atk.elementMultiplier > 1 && targetSlotEl) {
      setTimeout(() => effectiveness(targetSlotEl, 'Super Effective!'), 400);
    } else if (atk.elementMultiplier < 1 && targetSlotEl) {
      setTimeout(() => resistedEffectiveness(targetSlotEl, 'Resisted...'), 400);
    }

    // Wait for tap (attack card) or fixed delay (fallback)
    if (attackCard) {
      await waitForCardTap(attackCard);
    } else {
      await delay(400);
    }
  }
  syncStatusIconsFromResult(result);
}

/**
 * Show NPC skill attack cards sequentially (one per target).
 * Each card is a vocab review opportunity showing NPC base word + skill name + target.
 */
async function showNpcSkillAttacksAnimated(result, allyHpMap) {
  if (!result.npcSkillAttacks?.length) return;

  for (const atk of result.npcSkillAttacks) {
    let attackCard = null;

    attackCard = insertNpcAttackCard(atk);

    // Sound + visual effects for damage
    if (atk.damage > 0) {
      playSFX('player-hit');
      showDamageNumber(atk.damage, true, false);
      animatePlayerHurt();
    }

    // Update ally HP after NPC damage
    if (atk.damage > 0 && allyHpMap && allyHpMap[atk.targetId]) {
      allyHpMap[atk.targetId].hp = Math.max(0, allyHpMap[atk.targetId].hp - atk.damage);
      updateCreatureHpBars(result.creatureParty?.active, allyHpMap);
    }

    if (attackCard) {
      await waitForCardTap(attackCard);
    } else {
      await delay(800);
    }
  }
}

/**
 * Show KO swap messages with death/swap-in animations (Bug F).
 * @param {Object} result - Combat cycle result from server
 */
async function showKoSwapAnimations(result) {
  if (!result.koSwaps?.length) return;
  for (const swap of result.koSwaps) {
    // Animate the KO'd creature dying
    const koIndex = swap.slot ?? -1;
    if (koIndex >= 0) {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const dyingSlot = slots[koIndex];
      if (dyingSlot) {
        dyingSlot.classList.add('creature-dying');
        await delay(600);
      }
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4fc3f7;">${t('swapsIn', swap.replacement)}</div>`;
    }

    // Update sprite and HP for the new creature with swap-in animation
    if (result.creatureParty?.active && koIndex >= 0) {
      const slots = document.querySelectorAll('#player-formation .formation-slot');
      const swapSlot = slots[koIndex];
      if (swapSlot) {
        swapSlot.classList.remove('creature-dying');
        swapSlot.classList.add('creature-swapping-in');
        const newCreature = result.creatureParty.active[koIndex];
        if (newCreature) {
          const icon = swapSlot.querySelector('.formation-sprite img');
          if (icon) {
            icon.src = creatureStaticPath(newCreature.id);
            icon.alt = newCreature.baseWord || newCreature.name || '';
          }
          const hpFill = swapSlot.querySelector('.formation-hp-fill');
          if (hpFill) {
            const pct = Math.max(0, (newCreature.hp / newCreature.maxHp) * 100);
            hpFill.style.width = `${pct}%`;
            hpFill.style.backgroundColor = pct > 60 ? 'var(--hp-green)' : pct > 30 ? 'var(--hp-yellow)' : 'var(--hp-red)';
          }
          const koIcon = swapSlot.querySelector('.formation-sprite');
          if (koIcon) koIcon.classList.remove('ko');
        }
        setTimeout(() => swapSlot.classList.remove('creature-swapping-in'), 500);
      }
    }
    await delay(800);
  }
}

/**
 * Sync final combat state with server-authoritative values.
 * Updates game state, creature row popup data, enemy HP bars, and ally HP bars.
 * Avoids full updateUI to prevent DOM rebuild flicker.
 * @param {Object} result - Combat cycle result from server
 */
function syncFinalState(result) {
  if (!result.creatureParty && !result.enemies) return;

  const gs = getGameState();
  const updates = { ...gs };
  if (result.creatureParty) {
    updates.run = { ...gs.run, creatureParty: result.creatureParty };
  }
  if (result.enemies && gs.combat) {
    updates.combat = {
      ...gs.combat,
      enemies: result.enemies,
      allies: result.allies || gs.combat.allies,
      turnCount: result.turnCount ?? gs.combat.turnCount
    };
  }
  updateGameState(updates);

  // Keep formation popup data in sync with latest HP
  if (result.creatureParty?.active && updateCreatureRowData) {
    updateCreatureRowData(result.creatureParty.active);
  }
  // Set final HP bars without full DOM rebuild
  if (result.enemies?.length > 1) {
    result.enemies.forEach((e, i) => characterUI.updateEnemyHPAtIndex(i, e.hp, e.maxHp));
  } else if (result.enemies?.[0]) {
    characterUI.updateEnemyHPBar({ current: result.enemies[0].hp, max: result.enemies[0].maxHp });
  }
  updateCreatureHpBars(result.creatureParty?.active, null);

  // Clear any stale inline transforms left by interrupted anime.js animations
  clearFormationTransforms();
}

// ============ CREATURE COMBAT ORCHESTRATORS ============

/**
 * Execute a full turn of creature moves — calls /creature-combat-cycle with 'attack' + moveChoices.
 * Replaces the old executeCreaturePlayerAttack() for move-based flow.
 * @param {Array} choices - Array of { creatureIndex, moveId, targetIndex }
 */
async function executeCreatureMovesTurn(choices) {
  if (!combatActive || playerAttackPending || getEnemyDialogueActive()) return;
  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'attack', moveChoices: choices })
      });
      const result = await response.json();

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Move turn error:', result.error);
        playerAttackPending = false;
        return;
      }

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await showRoundStartEvents(result);

      // Track enemy HP for progressive updates (slot index — duplicate species share id)
      const enemyHpMap = buildEnemyHpMapForPlayerAttacks(result);

      // Show each attack result sequentially
      const allPendingMoveLearn = [];
      if (result.playerAttacks?.length > 0) {
        const killedEnemies = new Set();
        for (const atk of result.playerAttacks) {
          let attackCard = null;
          const actionArea = document.getElementById('action-area');

          {
            const adaptedAtk = {
              ...atk,
              attackerSkillName: atk.moveName || atk.attackerSkillName,
              attackerSkillEn: atk.moveNameEn || atk.attackerSkillEn,
              // Server uses attackerSkillReading; moveReading is rarely set — don't wipe furigana
              attackerSkillReading: atk.moveReading || atk.attackerSkillReading || '',
              attackerElement: atk.moveElement || atk.attackerElement,
            };
            attackCard = insertAttackCard(adaptedAtk, false);
          }

          // Fire visual effects
          playSFX('attack');
          const creatureSlotEl = findCreatureSlotByAttackerId(atk.attackerId);
          const enemyEl = findEnemyTargetElement(atk.targetId, result.enemies, atk.targetIndex);

          if (atk.damage > 0 && creatureSlotEl && enemyEl) {
            playAttackSound(atk.moveElement || atk.attackerElement || 'neutral');
            const tIdx = atk.targetIndex;
            const targetMaxHp = (typeof tIdx === 'number' && enemyHpMap[tIdx]?.maxHp)
              ? enemyHpMap[tIdx].maxHp
              : (result.enemies?.[0]?.maxHp ?? 100);
            await fireCreatureAttackEffect(creatureSlotEl, enemyEl, atk.moveElement || 'neutral', atk.damage, targetMaxHp);
            if (enemyEl) combatEvents.emit('creatureHit', { slotEl: enemyEl, side: 'enemy' });
          } else if (atk.damage > 0) {
            animateEnemyHurt();
          }

          // Show damage number for damage/drain
          if (atk.damage > 0) {
            showDamageNumber(atk.damage, false, false);
          }

          // Update enemy HP after each hit
          if (atk.damage > 0) {
            const tIdx = atk.targetIndex;
            if (typeof tIdx === 'number' && enemyHpMap[tIdx]) {
              enemyHpMap[tIdx].hp = Math.max(0, enemyHpMap[tIdx].hp - atk.damage);
              const entry = enemyHpMap[tIdx];
              if (result.enemies.length > 1) {
                characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
              } else {
                characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
              }
            }
          }

          // XP popups on kill — collect pending move learns
          const killKey = typeof atk.targetIndex === 'number' ? `idx:${atk.targetIndex}` : `id:${atk.targetId}`;
          if (atk.targetDefeated && !killedEnemies.has(killKey) && result.xpEvents) {
            killedEnemies.add(killKey);
            const xpEvent = result.xpEvents.find(ev =>
              (typeof atk.targetIndex === 'number' && ev.enemyIndex === atk.targetIndex)
              || (typeof atk.targetIndex !== 'number' && ev.enemyId === atk.targetId)
            );
            if (xpEvent) {
              const pending = showXpEvents([xpEvent]);
              if (pending?.length) allPendingMoveLearn.push(...pending);
            }
          }

          // STAB indicator — center-screen banner
          if (atk.stab) {
            const banner = document.createElement('div');
            banner.className = 'super-effective-banner';
            banner.textContent = 'Super effective!';
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 1100);
          }

          // Type effectiveness popup
          if (atk.elementMultiplier > 1 && enemyEl) {
            setTimeout(() => effectiveness(enemyEl, 'Super Effective!'), 400);
          } else if (atk.elementMultiplier < 1 && enemyEl) {
            setTimeout(() => resistedEffectiveness(enemyEl, 'Resisted...'), 400);
          }

          // Show party skill procs inline after this attack
          await showPartySkillProcs(atk);

          // Wait for tap or fixed delay
          if (attackCard) {
            await waitForCardTap(attackCard);
          } else {
            await delay(800);
          }
        }
      }
      syncStatusIconsFromResult(result);

      // === BEFRIEND NAME QUIZ CHECK ===
      // If the killing blow triggered the befriend quiz, show it instead of continuing combat
      if (result.befriendQuizTriggered && result.befriendQuiz) {
        syncFinalState(result);
        playerAttackPending = false;
        await renderBefriendQuiz(result.befriendQuiz, result);
        return;
      }

      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcAllyHpMap = buildAllyHpMap(result);
        const npcData = getCombatNpcData();
        if (npcData) {
          await playNpcSkillAnimation(npcData, showNpcSprite, hideNpcSprite, async () => {
            await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
          }, getCombatEnemies());
        } else {
          await delay(400);
          await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
        }
      }

      // Enemy attacks phase (reuse existing code)
      const allyHpMap = buildAllyHpMap(result);
      if (result.enemyAttacks?.length > 0) {
        await delay(400);
      }
      await showEnemyAttacksAnimated(result, allyHpMap, false);

      // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
      await showCounterAttacks(result);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync state
      syncFinalState(result);

      // Handle pending move learns (after state sync so creature data is current)
      if (allPendingMoveLearn.length > 0) {
        await processPendingMoveLearn(allPendingMoveLearn);
      }

      if (result.combatEnded) {
        if (result.victory) await delay(500);
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Start next turn's move selection
      await delay(600);
      startMoveSelection();

    } catch (error) {
      console.error('Move turn error:', error);
      playerAttackPending = false;
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

/**
 * Execute creature player attack — calls /creature-combat-cycle with 'attack'
 * The backend processes both player and enemy phases in one call.
 * @deprecated Use executeCreatureMovesTurn instead for move-based combat
 */
async function executeCreaturePlayerAttack() {
  if (!combatActive || playerAttackPending || combatPausedForVocab || getEnemyDialogueActive()) return;

  playerAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'attack' })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Creature attack result:', { attacks: result.playerAttacks?.length });

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Creature attack error:', result.error);
        playerAttackPending = false;
        return;
      }

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await showRoundStartEvents(result);

      const enemyHpMap = buildEnemyHpMapForPlayerAttacks(result);

      // Show each allied creature's attack result sequentially with real-time HP
      const allPendingMoveLearn2 = [];
      if (result.playerAttacks?.length > 0) {
        const killedEnemies = new Set();

        for (let atkIdx = 0; atkIdx < result.playerAttacks.length; atkIdx++) {
          const atk = result.playerAttacks[atkIdx];
          const effectKey = atk.elementMultiplier > 1 ? 'dealsStrong' :
                            atk.elementMultiplier < 1 ? 'dealsWeak' : 'dealsDamage';
          // Insert attack card (if JP name available) or fallback text
          let attackCard = null;
          if (atk.attackerNameJp) {
            attackCard = insertAttackCard(atk, false);
          } else {
            const actionArea = document.getElementById('action-area');
            if (actionArea) {
              actionArea.innerHTML = `<div class="combat-creature-attack">${t(effectKey, atk.attackerName, atk.damage)}</div>`;
            }
          }

          // Fire effects while card is showing
          playSFX('attack');

          const creatureSlotEl = findCreatureSlotByAttackerId(atk.attackerId);
          const enemyEl = findEnemyTargetElement(atk.targetId, result.enemies, atk.targetIndex);

          // Fire element-colored orb from creature to enemy with impact effects
          if (creatureSlotEl && enemyEl && atk.attackerElement) {
            playAttackSound(atk.attackerElement);
            const tIdx = atk.targetIndex;
            const targetMaxHp = (typeof tIdx === 'number' && enemyHpMap[tIdx]?.maxHp)
              ? enemyHpMap[tIdx].maxHp
              : (result.enemies?.[0]?.maxHp ?? 100);
            await fireCreatureAttackEffect(creatureSlotEl, enemyEl, atk.attackerElement, atk.damage, targetMaxHp);
            if (enemyEl) combatEvents.emit('creatureHit', { slotEl: enemyEl, side: 'enemy' });
          } else {
            animateEnemyHurt();
          }

          showDamageNumber(atk.damage, false, false);
          // Update enemy HP bar after each hit
          if (typeof atk.targetIndex === 'number' && enemyHpMap[atk.targetIndex]) {
            const entry = enemyHpMap[atk.targetIndex];
            entry.hp = Math.max(0, entry.hp - atk.damage);
            if (result.enemies.length > 1) {
              characterUI.updateEnemyHPAtIndex(entry.index, entry.hp, entry.maxHp);
            } else {
              characterUI.updateEnemyHPBar({ current: entry.hp, max: entry.maxHp });
            }
          }

          // Show XP popups when an enemy is killed (BUG B + C) — collect pending move learns
          const killKey2 = typeof atk.targetIndex === 'number' ? `idx:${atk.targetIndex}` : `id:${atk.targetId}`;
          if (atk.targetDefeated && !killedEnemies.has(killKey2) && result.xpEvents) {
            killedEnemies.add(killKey2);
            const xpEvent = result.xpEvents.find(ev =>
              (typeof atk.targetIndex === 'number' && ev.enemyIndex === atk.targetIndex)
              || (typeof atk.targetIndex !== 'number' && ev.enemyId === atk.targetId)
            );
            if (xpEvent) {
              const pending = showXpEvents([xpEvent]);
              if (pending?.length) allPendingMoveLearn2.push(...pending);
            }
          }

          // Show party skill procs inline after this attack
          await showPartySkillProcs(atk);

          // Wait for tap (attack card) or fixed delay (fallback)
          if (attackCard) {
            await waitForCardTap(attackCard);
          } else {
            await delay(400);
          }
        }
      }

      // === NPC Skill Phase ===
      if (result.npcSkillAttacks?.length > 0) {
        const npcAllyHpMap = buildAllyHpMap(result);
        const npcData = getCombatNpcData();
        if (npcData) {
          await playNpcSkillAnimation(npcData, showNpcSprite, hideNpcSprite, async () => {
            await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
          }, getCombatEnemies());
        } else {
          await delay(400);
          await showNpcSkillAttacksAnimated(result, npcAllyHpMap);
        }
      }

      // Enemy attacks phase
      const allyHpMap = buildAllyHpMap(result);
      if (result.enemyAttacks?.length > 0) {
        await delay(400); // Brief pause between player and enemy attack phases
      }
      await showEnemyAttacksAnimated(result, allyHpMap, false);

      // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
      await showCounterAttacks(result);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync authoritative state from server
      syncFinalState(result);

      // Handle pending move learns (after state sync so creature data is current)
      if (allPendingMoveLearn2.length > 0) {
        await processPendingMoveLearn(allPendingMoveLearn2);
      }

      // Check combat end
      if (result.combatEnded) {
        if (result.victory) await delay(500); // Let HP bar drain animation be visible
        stopCombatLoop(result);
        return;
      }

      playerAttackPending = false;

      // Pause for next vocab review
      combatPausedForVocab = true;
      await delay(1440);
      showNextDualCardsFromQueue();

    } catch (error) {
      console.error('Creature attack error:', error);
      playerAttackPending = false;
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
      }
    }
  });
}

/**
 * Execute creature defend — calls /creature-combat-cycle with 'defend'
 * Defend: all creatures regen MP, enemies attack with 50% damage
 */
async function executeCreatureDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/game/creature-combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ actionType: 'defend' })
      });
      const result = await response.json();
      logger.info('[CombatLoop] Creature defend result:', { enemyAttacks: result.enemyAttacks?.length });

      if (result.error) {
        if (result.error === 'No active combat') {
          combatActive = false;
          return;
        }
        console.error('Creature defend error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      // Show poison/effect ticks
      await showEffectEvents(result);

      // Show round-start skill events (Erosion, Momentum, Overflow Vitality)
      await showRoundStartEvents(result);

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defending')}</div>`;
      }

      // Update charge bars immediately for defend (BUG A fix)
      if (result.creatureParty?.active) {
        updateCreatureHpBars(result.creatureParty.active, null);
      }
      await delay(600);

      // Enemy attacks phase (50% damage already applied server-side)
      const allyHpMap = buildAllyHpMap(result);
      await showEnemyAttacksAnimated(result, allyHpMap, true);

      // Counter attack animations (Retaliation Strike, Vengeful Mark, etc.)
      await showCounterAttacks(result);

      // KO swap animations
      await showKoSwapAnimations(result);

      // Sync authoritative state from server
      syncFinalState(result);

      // Check combat end
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;

      // Start next turn's move selection
      await delay(600);
      startMoveSelection();

    } catch (error) {
      console.error('Creature defend error:', error);
      enemyAttackPending = false;
      if (combatActive) {
        startMoveSelection();
      }
    }
  });
}

/**
 * Execute enemy attack and then pause combat for vocab review
 */
export async function executeEnemyAttackThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', ...apiKeys })
      });
      const result = await response.json();
      console.log('[Combat] Enemy attack (then pause):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }


      // Show enemy's attack result
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        // Show enemy damage in action area (big red text)
        showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      // Pause combat - wait for vocab review before next cycle
      enemyAttackPending = false;
      combatPausedForVocab = true;
      // Delay before showing dual cards so player can see the damage
      await delay(1440);
      // Show next dual cards for the next review
      showNextDualCardsFromQueue();
      console.log('[Combat] Paused for vocab review. Review a word to continue.');

    } catch (error) {
      console.error('Enemy attack error:', error);
      // Don't trigger defeat for errors - recover by showing dual cards
      enemyAttackPending = false;

      // Recovery: pause for vocab and show dual cards so player can continue
      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from enemy attack error, showing dual cards');
      }
    }
  });
}

/**
 * Resume combat after vocab review - triggers next attack cycle
 * @param {number} grade - Review grade (1-5)
 * @param {string} actionType - 'attack' or 'defend'
 */
export function resumeCombatAfterVocab(grade, actionType = 'attack') {
  if (!combatActive || !combatPausedForVocab) return;

  logger.info('[CombatLoop] Word reviewed, continuing:', { grade, actionType });
  combatPausedForVocab = false;
  pendingActionType = actionType;

  const state = getGameState();
  const isCreatureCombat = state.combat?.isCreatureCombat;

  // Old befriend action handler disabled — befriend now triggers via 10% kill roll (Task 8.2)
  // if (actionType === 'befriend') {
  //   executeBefriendAction();
  // } else
  if (isCreatureCombat) {
    // Creature combat: use creature-specific functions
    if (actionType === 'defend') {
      executeCreatureDefendThenPause();
    } else {
      executeCreaturePlayerAttack();
    }
  } else {
    // Legacy combat: use original functions
    if (actionType === 'defend') {
      executeDefendThenPause();
    } else {
      executePlayerAttack();
    }
  }
}

/**
 * Execute defend action: skip player attack, enemy attacks with reduced damage
 */
async function executeDefendThenPause() {
  if (!combatActive || enemyAttackPending || getEnemyDialogueActive()) return;

  enemyAttackPending = true;

  return withAnimationActive(async () => {
    try {
      const apiKeys = settings.getApiKeys();
      const response = await fetch(`${API_BASE}/api/game/combat-cycle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ attackerType: 'enemy', actionType: 'defend', ...apiKeys })
      });
      const result = await response.json();
      logger.info('[Combat] Defend - Enemy attack (50% damage):', result.enemyAttack?.damage);

      if (result.error) {
        if (result.error === 'No active combat') {
          logger.warn('[CombatLoop] Stale attack detected');
          combatActive = false;
          return;
        }
        console.error('Enemy attack error:', result.error);
        if (combatActive) {
          stopCombatLoop({ combatEnded: true, victory: false, error: true });
        }
        return;
      }

      if (getEnemyDialogueActive()) {
        enemyAttackPending = false;
        return;
      }

      // Show defend indicator
      const actionArea = document.getElementById('action-area');
      if (actionArea) {
        actionArea.innerHTML = `<div class="combat-defend-indicator">${t('defendingCreature')}</div>`;
      }
      await delay(600);

      // Show enemy's attack result (damage already halved by backend)
      if (result.enemyAttack) {
        const ea = result.enemyAttack;
        if (ea.perfectDodge) {
          showDamageNumber(0, true, false, false, false, 'perfect');
        } else if (ea.dodged) {
          showDamageNumber(0, true, false, false, false, 'dodge');
        } else if (ea.miss) {
          showDamageNumber(0, true, false, false, false, 'miss');
        } else {
          showDamageNumber(ea.damage, true, ea.critical);
          animatePlayerHurt();
          playSFX('player-hit');
        }
        showEnemyDamageDisplay(ea);
      }

      // Update HP bars
      characterUI.updateEnemyHPBar(result.enemyHp);
      characterUI.updatePlayerHPBar(result.playerHp);


      // Check if combat ended
      if (result.combatEnded) {
        stopCombatLoop(result);
        return;
      }

      enemyAttackPending = false;
      combatPausedForVocab = true;
      await delay(1440);
      showNextDualCardsFromQueue();
      logger.info('[Combat] Defend complete. Paused for vocab review.');

    } catch (error) {
      console.error('Defend action error:', error);
      enemyAttackPending = false;

      if (combatActive) {
        combatPausedForVocab = true;
        showNextDualCardsFromQueue();
        logger.warn('[CombatLoop] Recovered from defend error, showing dual cards');
      }
    }
  });
}

// ============ BEFRIEND NAME QUIZ UI (Koto2) ============

/**
 * Show the befriend name quiz UI.
 * The creature says "まって!!" (wait!!), player chooses Fight or Talk.
 * If Talk, creature asks "なまえは？" and shows 3 English name buttons.
 * @param {Object} quizData - { creatureId, creatureName, creatureNameEn, options: [{id, name}] }
 * @param {Object} result - The combat cycle result (for state sync)
 * @returns {Promise<void>}
 */
async function renderBefriendQuiz(quizData, result) {
  const reading = quizData.creatureBaseReading || quizData.creatureName || '';
  const creatureSpeaker = { name: reading, reading: toRomaji(reading), meaning: '' };

  // Show "まって!!" narration
  await narration.showNarration('まって！！', { speaker: creatureSpeaker });

  // Show Fight / Talk choice
  const choiceIdx = await renderButtonsAsync([
    { label: 'たたかう (Fight)' },
    { label: 'はなす (Talk)' },
  ]);
  // 0 = Fight, 1 = Talk

  if (choiceIdx === 0) {
    // Kill the creature — call fight endpoint
    const fightResult = await fetch(`${API_BASE}/api/game/befriend-quiz-answer`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fight' })
    }).then(r => r.json());

    if (fightResult.state) {
      updateGameState(fightResult.state);
    }

    // Sync final state
    syncFinalState(fightResult);

    if (fightResult.combatEnded) {
      stopCombatLoop(fightResult);
    }
    return;
  }

  // Talk path — show "なまえは？" in narration, then name options as plain buttons
  await narration.showNarration('なまえは？', { speaker: creatureSpeaker });

  const selectedIdx = await renderButtonsAsync(
    quizData.options.map(opt => ({ label: opt.name }))
  );

  const selectedId = quizData.options[selectedIdx]?.id ?? null;

  if (!selectedId) return;

  // Submit answer
  const answerResult = await fetch(`${API_BASE}/api/game/befriend-quiz-answer`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'talk', answerId: selectedId })
  }).then(r => r.json());

  if (answerResult.correct) {
    // Befriended!
    playSFX('creature-skill');
    await narration.showNarration('じゃあ、友達になろう！', { speaker: creatureSpeaker });

    const capturedId = answerResult.capturedId;
    const capturedIdx = answerResult.capturedIndex;
    if (capturedId != null || capturedIdx != null) {
      const slot = (typeof capturedIdx === 'number'
        ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIdx}"]`)
        : null) || (capturedId
        ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
        : null);
      if (slot) slot.classList.add('befriended');
    }

    const actionArea = document.getElementById('action-area');
    if (actionArea) {
      actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', answerResult.capturedName || creatureName)}</div>`;
    }
    await delay(1200);

    if (answerResult.state) {
      updateGameState(answerResult.state);
    }
    syncFinalState(answerResult);

    const newAllySlotQuiz = document.querySelector('#player-formation .formation-slot:last-child');
    if (newAllySlotQuiz) {
      setTimeout(() => {
        buff(newAllySlotQuiz, 'New Ally!');
        spawnParticles(newAllySlotQuiz, 8, '#4CAF50');
      }, 500);
    }

    if (answerResult.combatEnded) {
      stopCombatLoop({ ...answerResult, victory: true });
    }
    return;
  }

  // Wrong answer — creature fights back
  await narration.showNarration('ちがう！', { speaker: creatureSpeaker });

  // Show counter-attack
  if (answerResult.counterAttack?.length > 0) {
    for (const atk of answerResult.counterAttack) {
      const card = insertAttackCard(atk, true);
      if (atk.damage > 0) {
        playSFX('player-hit');
        if (animatePlayerHurt) animatePlayerHurt(atk.targetIndex ?? 0);
        if (showDamageNumber) showDamageNumber(atk.damage, true, false);
      }
      if (card) {
        await waitForCardTap(card);
      } else {
        if (delay) await delay(400);
      }
    }
  }

  // Update state after counter-attack
  if (answerResult.allies || answerResult.enemies) {
    const gs = getGameState();
    if (gs.combat) {
      updateGameState({
        ...gs,
        combat: {
          ...gs.combat,
          ...(answerResult.allies && { allies: answerResult.allies }),
          ...(answerResult.enemies && { enemies: answerResult.enemies })
        },
        ...(answerResult.creatureParty && {
          run: { ...gs.run, creatureParty: answerResult.creatureParty }
        })
      });
      updateUI();
      if (updateCreatureRowData) {
        const updated = getGameState();
        updateCreatureRowData(updated.run?.creatureParty, updated.combat);
      }
    }
  }

  if (answerResult.combatEnded) {
    combatActive = false;
    if (answerResult.victory === false) {
      if (showGameOverModal) showGameOverModal();
    }
    return;
  }

  // Combat resumes — start next move selection
  await delay(600);
  startMoveSelection();
}

/**
 * Show a prompt for the player to choose which creature to release (or skip).
 * Returns the creature ID to release, or null if the player chose to let the befriended one go.
 */
function showBefriendReleasePrompt() {
  return new Promise((resolve) => {
    const state = getGameState();
    const party = state.run?.creatureParty;
    if (!party) { resolve(null); return; }

    const allCreatures = [
      ...party.active.map((r, i) => ({ ...r, slot: 'active', index: i })),
      ...party.reserves.map((r, i) => ({ ...r, slot: 'reserve', index: i }))
    ].filter(r => r && r.id);

    const ELEM_ICONS = { wood: '🌿', fire: '🔥', earth: '⛰️', metal: '⚙️', water: '💧' };

    const overlay = document.createElement('div');
    overlay.className = 'befriend-release-overlay';
    overlay.innerHTML = `
      <div class="befriend-release-panel">
        <div class="befriend-release-title">${t('partyFullTitle')}</div>
        <div class="befriend-release-list">
          ${allCreatures.map(r => `
            <button class="befriend-release-btn" data-creature-id="${r.id}">
              ${ELEM_ICONS[r.element] || ''} ${r.nameEn} (Lv${r.level}) - ${r.slot === 'active' ? t('equipped') : t('reserve')}
            </button>
          `).join('')}
        </div>
        <button class="befriend-release-skip-btn">${t('letItGoBtn')}</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.befriend-release-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.remove();
        resolve(btn.dataset.creatureId);
      });
    });

    overlay.querySelector('.befriend-release-skip-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

/**
 * Show target selection UI when multiple enemies are befriendable.
 */
function showBefriendTargetSelect(enemies) {
  return new Promise((resolve) => {
    const eligible = enemies
      .map((e, i) => ({ ...e, index: i }))
      .filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);

    if (eligible.length <= 1) {
      resolve(eligible.length === 1 ? eligible[0].index : -1);
      return;
    }

    const actionArea = document.getElementById('action-area');
    if (!actionArea) { resolve(-1); return; }

    renderButtonsAsync(
      eligible.map(e => ({
        label: `${e.nameEn || e.name} (HP: ${Math.round(e.hp / e.maxHp * 100)}%)`,
      })),
      { container: actionArea }
    ).then(idx => resolve(eligible[idx].index));
  });
}

/**
 * Show one round of befriend conversation.
 * Returns the selected option index.
 */
function showConversationRound(round, creatureName) {
  // Show creature's line in narration box
  narration.showNarration(round.speaker, {
    speaker: creatureName,
    persistent: true
  });

  return renderButtonsAsync(
    round.options.map(o => ({
      label: renderEnFirst(typeof o === 'string' ? o : o.text),
    }))
  );
}

/**
 * Show green/red feedback on answer options.
 */
function showAnswerFeedback(selectedIndex, correctIndex, correct) {
  document.querySelectorAll('#action-area .ui-btn').forEach((o, idx) => {
    o.style.pointerEvents = 'none';
    if (idx === correctIndex) {
      o.style.borderColor = 'var(--success-color, #4ade80)';
      o.style.boxShadow = '0 0 10px var(--success-color, #4ade80)';
    } else if (idx === selectedIndex && !correct) {
      o.style.borderColor = 'var(--danger-color, #ef4444)';
      o.style.boxShadow = '0 0 10px var(--danger-color, #ef4444)';
    } else {
      o.style.opacity = '0.5';
    }
  });
}

/**
 * Execute befriend action: 3-round conversation to capture low-HP enemy creature.
 * @param {number|null} actingCreatureSlot - Party index that spent their turn on はなす; null = flash-card path.
 */
async function executeBefriendAction(actingCreatureSlot = null) {
  if (!combatActive) return;

  return withAnimationActive(async () => {
    try {
      const state = getGameState();
      const enemies = state.combat?.enemies || [];

      // Target selection (auto if only one eligible)
      const eligible = enemies.filter(e => e.hp > 0 && !e.befriended && (e.hp / e.maxHp) <= 0.5);
      let enemyIndex;
      if (eligible.length > 1) {
        enemyIndex = await showBefriendTargetSelect(enemies);
        if (enemyIndex < 0) {
          resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
          return;
        }
      }

      // Fetch conversation from server
      const convoResult = await apiGetBefriendConversation(enemyIndex);
      if (!convoResult || convoResult.error) {
        const errMsg = convoResult?.error || 'request failed';
        console.error('Befriend conversation error:', errMsg);
        if (narration?.showNarration) {
          const detail = String(errMsg);
          const fromApi = convoResult?.error && detail.length > 0;
          narration.showNarration(
            fromApi ? detail : (/generation|failed|load/i.test(detail) ? tPlain('befriendDialogueUnavailable') : tPlain('befriendFailedGeneric')),
            { persistent: false }
          );
        }
        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

    const { rounds, targetEnemy, targetEnemyIndex, userId: convoUserId } = convoResult;
    const creatureName = targetEnemy?.nameEn || targetEnemy?.name || 'Creature';

    // 3-round conversation loop
    for (let i = 0; i < rounds.length; i++) {
      // Play creature speaker line audio if available (fire-and-forget)
      if (rounds[i].speakerTts && convoUserId) {
        playDialogueAudio(convoUserId, rounds[i].speakerTts);
      }
      const selectedIndex = await showConversationRound(rounds[i], creatureName);
      // Play selected option audio if available (fire-and-forget)
      if (rounds[i].optionsTts?.[selectedIndex] && convoUserId) {
        playDialogueAudio(convoUserId, rounds[i].optionsTts[selectedIndex]);
      }
      const answerResult = await apiSubmitBefriendAnswer(i, selectedIndex);

      if (!answerResult) {
        logger.error("[CombatLoop] Befriend answer API returned null, resuming combat");
        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

      showAnswerFeedback(selectedIndex, answerResult.correctIndex, answerResult.correct);
      await delay(800);
      if (narration.forceHideNarration) narration.forceHideNarration();

      if (!answerResult.correct) {
        // --- FAILURE ---
        // Click-to-continue (no auto-dismiss) so players can read it.
        await narration.showNarration('？？？', { speaker: creatureSpeaker });

        // Shake target enemy
        const slots = document.querySelectorAll('#enemy-formation .formation-slot');
        const targetSlot = slots[targetEnemyIndex];
        if (targetSlot) {
          targetSlot.classList.add('shake-animation');
          setTimeout(() => targetSlot.classList.remove('shake-animation'), 500);
        }

        // Show enemy attack damage
        if (answerResult.enemyAttacks?.length > 0) {
          for (const atk of answerResult.enemyAttacks) {
            if (atk.damage > 0) {
              showDamageNumber(atk.damage, true, false);
              animatePlayerHurt();
              playSFX('player-hit');
              await delay(400);
            }
          }
        }

        // Update game state with post-attack HP
        if (answerResult.allies || answerResult.enemies) {
          const gs = getGameState();
          if (gs.combat) {
            updateGameState({
              ...gs,
              combat: {
                ...gs.combat,
                ...(answerResult.allies && { allies: answerResult.allies }),
                ...(answerResult.enemies && { enemies: answerResult.enemies })
              }
            });
            updateUI();
          }
        }

        if (answerResult.combatEnded) {
          stopCombatLoop({ combatEnded: true, victory: false });
          return;
        }

        resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
        return;
      }

      // --- CORRECT ---
      if (answerResult.conversationComplete) {
        const br = answerResult.befriend;
        const captured = br?.captured;

        if (br?.reason === 'Party full') {
          narration.showNarration(tPlain('befriendPartyFullLine', creatureName), { persistent: false });
          await delay(600);
          const releaseChoice = await showBefriendReleasePrompt();
          if (releaseChoice && apiBefriendReplace) {
            const replaceResult = await apiBefriendReplace(releaseChoice);
            if (replaceResult?.success) {
              const actionArea = document.getElementById('action-area');
              if (actionArea) {
                actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', replaceResult.captured.nameEn)}</div>`;
              }
              playSFX('creature-skill');

              const capturedId = replaceResult.captured?.id;
              const capturedIdx = replaceResult.capturedIndex;
              if (capturedId != null || capturedIdx != null) {
                const slot = (typeof capturedIdx === 'number'
                  ? document.querySelector(`#enemy-formation .formation-slot[data-index="${capturedIdx}"]`)
                  : null) || (capturedId
                  ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${capturedId}"]`)
                  : null);
                if (slot) slot.classList.add('befriended');
              }
              await delay(1200);

              if (replaceResult.combatEnded) {
                stopCombatLoop({ combatEnded: true, victory: replaceResult.victory });
                return;
              }

              const gs = getGameState();
              if (replaceResult.state) {
                updateGameState(replaceResult.state);
              } else if (gs.combat && replaceResult.enemies) {
                updateGameState({
                  ...gs,
                  combat: { ...gs.combat, enemies: replaceResult.enemies },
                  run: { ...gs.run, creatureParty: replaceResult.creatureParty }
                });
              }
            } else if (narration?.showNarration) {
              narration.showNarration(tPlain('befriendSwapFailed'), { persistent: false });
              await delay(1200);
            }
          } else {
            const actionArea = document.getElementById('action-area');
            if (actionArea) {
              actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #9E9E9E;">${t('letItGo')}</div>`;
            }
            await delay(800);
          }

          if (answerResult.combatEnded) {
            stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
            return;
          }
          startMoveSelection();
          return;
        }

        if (br && !br.success) {
          if (br.reason === 'boss_first_defeat' && narration?.showNarration) {
            narration.showNarration(tPlain('befriendBossFirst'), { persistent: false });
          } else if (narration?.showNarration) {
            narration.showNarration(tPlain('befriendFailedGeneric'), { persistent: false });
          }
          await delay(1400);
          resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
          return;
        }

        playSFX('creature-skill');
        // Click-to-continue (no auto-dismiss) so players can read it.
        await narration.showNarration('\u3058\u3083\u3042\u3001\u53cb\u9054\u306b\u306a\u308d\u3046\uff01', { speaker: creatureSpeaker });

        if (captured?.id || typeof targetEnemyIndex === 'number') {
          const slot = (typeof targetEnemyIndex === 'number'
            ? document.querySelector(`#enemy-formation .formation-slot[data-index="${targetEnemyIndex}"]`)
            : null) || (captured?.id
            ? document.querySelector(`#enemy-formation .formation-slot[data-creature-id="${captured.id}"]`)
            : null);
          if (slot) slot.classList.add('befriended');
        }

        const actionArea = document.getElementById('action-area');
        if (actionArea && captured) {
          actionArea.innerHTML = `<div class="combat-defend-indicator" style="color: #4CAF50;">${t('befriended', captured.nameEn)}</div>`;
        }
        await delay(1200);

        if (answerResult.state) {
          updateGameState(answerResult.state);
        } else {
          const gs = getGameState();
          if (gs.combat && answerResult.enemies) {
            updateGameState({
              ...gs,
              combat: { ...gs.combat, enemies: answerResult.enemies },
              ...(answerResult.creatureParty && {
                run: { ...gs.run, creatureParty: answerResult.creatureParty }
              })
            });
          }
        }

        const newAllySlot = document.querySelector('#player-formation .formation-slot:last-child');
        if (newAllySlot) {
          setTimeout(() => {
            buff(newAllySlot, 'New Ally!');
            spawnParticles(newAllySlot, 8, '#4CAF50');
          }, 500);
        }

        if (answerResult.combatEnded) {
          stopCombatLoop({ combatEnded: true, victory: answerResult.victory || false });
          return;
        }

        startMoveSelection();
        return;
      }

      // Correct but not complete — brief pause then show next round
      await delay(300);
    }

    } catch (error) {
      console.error('Befriend conversation error:', error);
      if (narration?.showNarration) {
        narration.showNarration(tPlain('befriendFailedGeneric'), { persistent: false });
      }
      resumeMoveSelectionAfterBefriendSpend(actingCreatureSlot);
    }
  });
}

/**
 * Stop combat loop and show results
 * @param {Object} result - Combat result data
 */
export async function stopCombatLoop(result) {
  logger.info('[CombatLoop] Combat ended:', { victory: result?.victory });
  const gameState = getGameState();

  // Clear both attack timers
  if (playerAttackTimer) {
    clearTimeout(playerAttackTimer);
    playerAttackTimer = null;
  }
  if (enemyAttackTimer) {
    clearTimeout(enemyAttackTimer);
    enemyAttackTimer = null;
  }

  combatActive = false;
  playerAttackPending = false;
  enemyAttackPending = false;
  combatPausedForVocab = false;

  if (result?.victory) combatEvents.emit('victory');

  // Final cleanup: clear any stale inline transforms on formation slots
  clearFormationTransforms();
  clearAllStatusIcons();

  // Hide word practice cards and close modal
  wordPractice.hideWordCards();
  wordPractice.closeWordInputModal();

  // Post-combat refresh: update cache with fresh states for reviewed words
  const reviewedWords = wordPractice.getReviewedWordsThisCombat();
  if (reviewedWords.length > 0) {
    const apiKeys = settings.getApiKeys();
    fetch(`${API_BASE}/api/game/post-combat-refresh`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        words: reviewedWords,
        jpdbApiKey: apiKeys.jpdbApiKey
      })
    }).then(r => r.json()).then(data => {
      console.log(`[Combat] Post-combat refresh: ${data.refreshed} words updated`);
    }).catch(err => {
      console.warn('[Combat] Post-combat refresh failed:', err);
    });
    wordPractice.clearReviewedWordsThisCombat();
  }

  // Brief pause before narration (let final damage numbers display)
  await delay(720);

  // Wait for enemy dialogue to be dismissed (e.g., liberated dialogue on victory)
  const dialogueDismissPromise = getDialogueDismissPromise();
  if (dialogueDismissPromise) {
    await dialogueDismissPromise;
  }

  // Kana graduation check disabled — kana combat mode disabled (Task 8.1)
  // if (result?.victory) {
  //   const currentState = getGameState();
  //   if (currentState.meta?.kanaMode) {
  //     try {
  //       const statsResp = await fetch(`${API_BASE}/api/game/kana-stats`, {
  //         headers: getAuthHeaders()
  //       });
  //       const stats = await statsResp.json();
  //       if (stats.graduated) {
  //         await fetch(`${API_BASE}/api/game/kana-mode`, {
  //           method: 'POST',
  //           headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  //           body: JSON.stringify({ enabled: false })
  //         });
  //         const current = getGameState();
  //         updateGameState({ ...current, meta: { ...current.meta, kanaMode: false } });
  //         await narration.showNarration(
  //           "Incredible progress! You've learned the entire Hiragana alphabet. " +
  //           "I've upgraded your Translator — from now on, you'll be able to command " +
  //           "your creatures directly using Japanese vocabulary!",
  //           { speaker: 'Cid' }
  //         );
  //       }
  //     } catch (e) {
  //       console.error('[KanaMode] Graduation check failed:', e);
  //     }
  //   }
  // }

  // Animate enemy defeat
  if (result.victory) {
    animateEnemyDefeat();
    playSFX('enemy-defeat');
  }

  // Show victory or defeat modal
  if (result.victory) {
    playSFX('victory');
    const gs = getGameState();
    const isCreatureCombat = gs?.combat?.isCreatureCombat;
    if (isCreatureCombat && gs?.combat?.npcId) {
      await runNpcDialogue();
    }
    if (isCreatureCombat && showPostCombatShop) {
      await showPostCombatShop();
    }
    showVictoryModal(result);
    wordPractice.prefetchCombatWords();
  } else {
    showGameOverModal(result);
  }

  // Refresh full UI state
  updateUI();
}

/**
 * Show NPC greeting before combat
 */
export async function showNpcGreeting(npcData) {
  if (!npcData?.greeting) return;
  const npcName = npcData.nameEn || npcData.name;
  if (showNpcSprite) showNpcSprite(npcName, npcData.id, npcData);
  // Play greeting audio if available (fire-and-forget, don't block narration)
  if (npcData.greetingTts && npcData.userId) {
    playDialogueAudio(npcData.userId, npcData.greetingTts);
  }
  await narration.showNarration(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  if (hideNpcSprite) hideNpcSprite();
  // Re-render combat scene — hideNpcSprite clears the enemy sprite area
  if (updateUI) updateUI();
}

/**
 * Run the full NPC post-combat dialogue flow
 */
export async function runNpcDialogue() {
  if (!apiStartNpcDialogue || !apiRespondNpcDialogue) return;

  const dialogueData = await apiStartNpcDialogue();
  if (!dialogueData) return;

  const { npc, freed, rounds, userId, greetingTts, freedTts } = dialogueData;
  const npcName = npc.nameEn || npc.name;

  // Show NPC sprite in scene area
  if (showNpcSprite) showNpcSprite(npcName, npc.id, npc);

  // Play freed narration audio if available (fire-and-forget)
  if (freedTts && userId) {
    playDialogueAudio(userId, freedTts);
  }
  // Show freed narration (click to dismiss)
  await narration.showNarration(renderEnFirst(freed), { speaker: npcName, html: true });

  let totalDelta = 0;

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];

    // Play NPC line audio if available (fire-and-forget)
    if (round.npcLineTts && userId) {
      playDialogueAudio(userId, round.npcLineTts);
    }
    // Show NPC line (persistent so player can read while choosing)
    await narration.showNarration(renderEnFirst(round.npcLine), { speaker: npcName, persistent: true, html: true });

    // Show 3 response buttons (reuses befriend dialogue styling)
    const selectedIndex = await renderButtonsAsync(
      round.options.map(o => ({
        label: renderEnFirst(typeof o === 'string' ? o : o.text),
      }))
    );

    // Play selected option audio if available (fire-and-forget)
    if (round.options[selectedIndex]?.tts && userId) {
      playDialogueAudio(userId, round.options[selectedIndex].tts);
    }

    // Hide narration
    if (narration.forceHideNarration) narration.forceHideNarration();

    // Submit to server
    const result = await apiRespondNpcDialogue(i, selectedIndex);
    if (!result) break;

    if (result.dialogueComplete) {
      totalDelta = result.totalDelta;
      if (result.state) {
        updateGameState(result.state);
      }
      break;
    }
  }

  // Hide NPC sprite
  if (hideNpcSprite) hideNpcSprite();

  // Show bond summary toast (server clamps to +1/0/-1)
  showBondSummary(npcName, totalDelta);
  await delay(2200);
  document.querySelector('.bond-summary')?.remove();
}

function showBondFeedback(tone, delta) {
  const existing = document.querySelector('.bond-feedback');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `bond-feedback ${tone}`;

  const heart = tone === 'positive' ? '\u2764\uFE0F' : tone === 'negative' ? '\uD83D\uDC94' : '\uD83E\uDD0D';
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '';

  el.innerHTML = `${heart}${deltaText ? `<span class="bond-delta">${deltaText}</span>` : ''}`;

  const sceneArea = document.getElementById('scene-area') || document.querySelector('.scene-area');
  if (sceneArea) {
    sceneArea.appendChild(el);
  }
}

function showBondSummary(npcName, totalDelta) {
  const el = document.createElement('div');
  el.className = 'bond-summary';

  const sign = totalDelta > 0 ? '+' : '';
  const cls = totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral';

  el.innerHTML = `${npcName}\u3068\u306E\u7D46 <span class="bond-value ${cls}">${sign}${totalDelta}</span>`;
  document.body.appendChild(el);
}

