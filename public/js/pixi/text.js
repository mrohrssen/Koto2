import { Text } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';
import { TIER_FONT_SIZES } from './combat-effects-util.js';

// ============ DAMAGE NUMBER COLORS ============

const DAMAGE_COLORS = {
  normal: '#FF4444',
  super: '#FFB300',
  resisted: '#9E9E9E',
  heal: '#4CAF50',
  poison: '#9C27B0',
};

// ============ DAMAGE NUMBERS ============

/**
 * Show a floating damage number that pops from the target and floats upward.
 * @param {number} amount - Damage or heal amount to display
 * @param {{ x: number, y: number }} pos - Origin position on the canvas
 * @param {{ tier?: number, type?: string }} opts
 *   tier: 0-4 index into TIER_FONT_SIZES (default 1)
 *   type: 'normal'|'super'|'resisted'|'heal'|'poison' (default 'normal')
 */
export async function showDamageNumber(amount, pos, { tier = 1, type = 'normal' } = {}) {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  const clampedTier = Math.max(0, Math.min(4, tier));
  const fontSize = TIER_FONT_SIZES[clampedTier];
  const fill = DAMAGE_COLORS[type] || DAMAGE_COLORS.normal;

  const text = new Text({
    text: type === 'heal' ? `+${amount}` : `${amount}`,
    style: {
      fontFamily: 'monospace',
      fontSize,
      fill,
      fontWeight: 'bold',
      stroke: { color: '#000000', width: 3 },
      dropShadow: {
        alpha: 0.5,
        angle: Math.PI / 4,
        blur: 2,
        distance: 1,
      },
    },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;

  // Pop effect: start slightly oversized
  text.scale.set(1.3);

  layers.overlay.addChild(text);

  // Float up and fade out simultaneously
  await Promise.all([
    tween(text, { y: pos.y - 40, alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(text.scale, { x: 1, y: 1 }, { duration: 200, ease: 'easeOut' }),
  ]);

  text.destroy();
}

// ============ GENERIC EVENT POPUP ============

/**
 * Show a generic floating text popup.
 * @param {string} message - Text to display
 * @param {{ x: number, y: number }} pos - Origin position
 * @param {{ color?: string, direction?: 'up'|'down', duration?: number, size?: number }} opts
 */
export async function showEventPopup(message, pos, { color = '#FFFFFF', direction = 'up', duration = 800, size = 18 } = {}) {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  const text = new Text({
    text: message,
    style: {
      fontFamily: 'monospace',
      fontSize: size,
      fill: color,
      fontWeight: 'bold',
      stroke: { color: '#000000', width: 2 },
    },
  });

  text.anchor.set(0.5);
  text.x = pos.x;
  text.y = pos.y;
  text.alpha = 1;

  layers.overlay.addChild(text);

  const dy = direction === 'down' ? 30 : -30;

  await tween(text, { y: pos.y + dy, alpha: 0 }, { duration, ease: 'easeOut' });

  text.destroy();
}

// ============ POPUP PRESETS ============

/**
 * Buff popup — green, floats up.
 * @param {string} message
 * @param {{ x: number, y: number }} pos
 */
export function popupBuff(message, pos) {
  return showEventPopup(message, pos, { color: '#4CAF50', direction: 'up', duration: 700, size: 16 });
}

/**
 * Debuff popup — red-orange, floats down.
 * @param {string} message
 * @param {{ x: number, y: number }} pos
 */
export function popupDebuff(message, pos) {
  return showEventPopup(message, pos, { color: '#FF7043', direction: 'down', duration: 700, size: 16 });
}

/**
 * Skill proc popup — cyan, floats up.
 * @param {string} message
 * @param {{ x: number, y: number }} pos
 */
export function popupSkillProc(message, pos) {
  return showEventPopup(message, pos, { color: '#00E5FF', direction: 'up', duration: 600, size: 16 });
}

/**
 * XP gain popup — gold, floats up.
 * @param {number} amount
 * @param {{ x: number, y: number }} pos
 */
export function showXpPopup(amount, pos) {
  return showEventPopup(`+${amount} XP`, pos, { color: '#FFD700', direction: 'up', duration: 900, size: 20 });
}

/**
 * Level up popup — large gold text, floats up.
 * @param {number} level
 * @param {{ x: number, y: number }} pos
 */
export function showLevelUpPopup(level, pos) {
  return showEventPopup(`Level ${level}!`, pos, { color: '#FFD700', direction: 'up', duration: 1200, size: 28 });
}

/**
 * Heal popup — green damage number.
 * @param {number} amount
 * @param {{ x: number, y: number }} pos
 * @param {{ tier?: number }} opts
 */
export function showHealPopup(amount, pos, { tier = 1 } = {}) {
  return showDamageNumber(amount, pos, { tier, type: 'heal' });
}

/**
 * Poison tick popup — purple damage number.
 * @param {number} amount
 * @param {{ x: number, y: number }} pos
 * @param {{ tier?: number }} opts
 */
export function showPoisonTick(amount, pos, { tier = 0 } = {}) {
  return showDamageNumber(amount, pos, { tier, type: 'poison' });
}
