/**
 * @file text.js — BitmapText damage numbers and event popups
 *
 * Uses BitmapFont.install() (Pixi v8; plan’s BitmapFont.from maps to this API) to
 * generate fonts at init. Provides showDamageNumber() and showEventPopup() on canvas.
 */

import { BitmapFont, BitmapText } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';

let fontsReady = false;

const DAMAGE_FONT = 'DamageFont';
const POPUP_FONT = 'PopupFont';

/** Digits, heal/damage signs, percent and decimal (design: damage font glyph set) */
const DAMAGE_CHARS = [
  ['0', '9'],
  '+',
  '-',
  '%',
  '.',
];

/** Printable ASCII + newline — buff/debuff English labels, "+N XP", "Level Up! LvN" */
const POPUP_CHARS = [[' ', '~'], '\n'];

/**
 * Initialize bitmap fonts. Call once at battle stage init.
 */
export function initFonts() {
  if (fontsReady) return;

  BitmapFont.install({
    name: DAMAGE_FONT,
    chars: DAMAGE_CHARS,
    style: {
      fontFamily: 'Arial',
      fontSize: 32,
      fontWeight: 'bold',
      fill: '#ffffff',
      stroke: { color: '#000000', width: 4 },
    },
  });

  BitmapFont.install({
    name: POPUP_FONT,
    chars: POPUP_CHARS,
    style: {
      fontFamily: 'Arial',
      fontSize: 18,
      fontWeight: 'bold',
      fill: '#ffffff',
      stroke: { color: '#000000', width: 3 },
    },
  });

  fontsReady = true;
}

/**
 * Show a floating damage number on the canvas.
 * @param {number} amount
 * @param {{ x: number, y: number }} pos - Canvas position
 * @param {{ isCrit?: boolean, isHeal?: boolean, tier?: number }} opts
 */
export async function showDamageNumber(amount, pos, { isCrit = false, isHeal = false, tier = 1 } = {}) {
  const { layers } = getStage();
  if (!layers?.effects || !fontsReady) return;

  const display = isHeal ? `+${Math.abs(amount)}` : String(Math.abs(amount));
  const text = new BitmapText({
    text: display,
    style: {
      fontFamily: DAMAGE_FONT,
      fontSize: isCrit ? 38 : 28,
    },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = isHeal ? 0x4caf50 : isCrit ? 0xffb300 : 0xff4444;
  layers.effects.addChild(text);

  const duration = tier >= 4 ? 1500 : 1000;
  await tween(text, { y: pos.y - 50, alpha: 0 }, { duration, ease: 'easeOut' });
  text.destroy();
}

/**
 * Show a floating event popup on the canvas.
 * @param {string} message
 * @param {{ x: number, y: number }} pos - Canvas position
 * @param {{ color?: number, direction?: 'up'|'down', duration?: number, size?: 'small'|'normal'|'large' }} opts
 */
export async function showEventPopup(message, pos, {
  color = 0xffffff,
  direction = 'up',
  duration = 1200,
  size = 'normal',
} = {}) {
  const { layers } = getStage();
  if (!layers?.effects || !fontsReady) return;

  const fontSize = size === 'large' ? 22 : size === 'small' ? 12 : 16;

  const text = new BitmapText({
    text: message,
    style: { fontFamily: POPUP_FONT, fontSize },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = color;
  layers.effects.addChild(text);

  const dy = direction === 'down' ? 45 : -45;
  await tween(text, { y: pos.y + dy, alpha: 0 }, { duration, ease: 'easeOut' });
  text.destroy();
}

// ============ PRESETS ============

/** Buff applied (amber, floats up) */
export const popupBuff = (pos, text) => showEventPopup(text, pos, { color: 0xff8f00, direction: 'up' });

/** Debuff applied (purple, floats down) */
export const popupDebuff = (pos, text) => showEventPopup(text, pos, { color: 0x7b1fa2, direction: 'down' });

/** Skill proc (gold, large) */
export const popupSkillProc = (pos, text) => showEventPopup(text, pos, { color: 0xffd700, size: 'large', duration: 1500 });

/** Type effectiveness (amber, large) */
export const popupEffectiveness = (pos, text) => showEventPopup(text, pos, { color: 0xffb300, size: 'large', duration: 1500 });

/** Resisted (gray, small) */
export const popupResisted = (pos, text) => showEventPopup(text, pos, { color: 0x9e9e9e, size: 'small' });

// ============ Parity helpers (Task 12 step 2b) ============

/**
 * Animated "+XP" floating from a canvas position (Pixi parity for combat-effects showXpPopup).
 * @param {{ x: number, y: number }} pos
 * @param {number} xpAmount
 */
export async function showXpPopup(pos, xpAmount) {
  const { layers } = getStage();
  if (!layers?.effects || !fontsReady || !xpAmount) return;

  const text = new BitmapText({
    text: `+${xpAmount} XP`,
    style: { fontFamily: POPUP_FONT, fontSize: 16 },
  });
  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = 0xffd700;
  layers.effects.addChild(text);

  await Promise.all([
    tween(text, { y: pos.y - 40, alpha: 0 }, { duration: 1200, ease: 'easeOut' }),
    tween(text.scale, { x: 1.2, y: 1.2 }, { duration: 1200, ease: 'easeOut' }),
  ]);
  text.destroy();
}

/**
 * Level-up banner at a canvas position (Pixi parity for combat-effects showLevelUpPopup).
 * @param {{ x: number, y: number }} pos
 * @param {number} newLevel
 * @param {number} [hpGain]
 * @param {number} [attackGain]
 */
export async function showLevelUpPopup(pos, newLevel, hpGain, attackGain) {
  const { layers } = getStage();
  if (!layers?.effects || !fontsReady) return;

  let body = `Level Up! Lv${newLevel}`;
  if (hpGain || attackGain) {
    const parts = [];
    if (hpGain) parts.push(`+${hpGain} HP`);
    if (attackGain) parts.push(`+${attackGain} ATK`);
    body += `\n${parts.join(', ')}`;
  }

  const text = new BitmapText({
    text: body,
    style: { fontFamily: POPUP_FONT, fontSize: 18, align: 'center' },
  });
  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = 0xffeb3b;
  text.scale.set(1.2);
  layers.effects.addChild(text);

  await Promise.all([
    tween(text, { y: pos.y - 50, alpha: 0 }, { duration: 1800, ease: 'easeOut' }),
    tween(text.scale, { x: 1.5, y: 1.5 }, { duration: 1800, ease: 'easeOut' }),
  ]);
  text.destroy();
}

/**
 * Heal number at a canvas position (Pixi parity for heal number display).
 * @param {{ x: number, y: number }} pos
 * @param {number} healAmount
 */
export function showHealPopup(pos, healAmount) {
  return showDamageNumber(healAmount, pos, { isHeal: true, isCrit: false });
}

/**
 * Poison DoT number (purple, negative prefix).
 * @param {{ x: number, y: number }} pos
 * @param {number} damage
 */
export async function showPoisonTick(pos, damage) {
  const { layers } = getStage();
  if (!layers?.effects || !fontsReady) return;

  const text = new BitmapText({
    text: `-${damage}`,
    style: { fontFamily: DAMAGE_FONT, fontSize: 26 },
  });
  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.tint = 0x9c27b0;
  layers.effects.addChild(text);

  await tween(text, { y: pos.y - 45, alpha: 0 }, { duration: 1000, ease: 'easeOut' });
  text.destroy();
}

/**
 * Short label when poison is applied (DOM parity for poisonApplyEffect messaging).
 * @param {{ x: number, y: number }} pos
 */
export function showPoisonApplyPopup(pos) {
  return showEventPopup('Poisoned', pos, {
    color: 0x9c27b0,
    direction: 'down',
    size: 'small',
    duration: 1000,
  });
}
