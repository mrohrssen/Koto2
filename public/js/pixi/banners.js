import { Text } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';
import { screenShake, screenFlash } from './effects.js';

// ============ BANNER STYLE CONFIG ============

const BANNER_STYLES = {
  super: { fontSize: 32, fill: '#FFB300', shake: 'heavy', holdTime: 800 },
  weak: { fontSize: 22, fill: '#9E9E9E', shake: null, holdTime: 600 },
  levelUp: { fontSize: 28, fill: '#FFD700', shake: null, holdTime: 1000 },
};

// ============ BANNER DISPLAY ============

/**
 * Show a center-screen banner that slams in from above.
 * @param {string} message - Banner text
 * @param {'super'|'weak'|'levelUp'} style - Banner style preset
 * @param {{ elementColor?: number }} opts
 *   elementColor: hex color for screenFlash (used with 'super' style)
 */
export async function showBanner(message, style = 'super', { elementColor = 0xFFFFFF } = {}) {
  const { app, layers } = getStage();
  if (!app || !layers.overlay) return;

  const config = BANNER_STYLES[style] || BANNER_STYLES.super;

  const text = new Text({
    text: message,
    style: {
      fontFamily: 'monospace',
      fontSize: config.fontSize,
      fill: config.fill,
      fontWeight: 'bold',
      stroke: { color: '#000000', width: 4 },
      dropShadow: {
        alpha: 0.6,
        angle: Math.PI / 4,
        blur: 4,
        distance: 2,
      },
    },
  });

  text.anchor.set(0.5);
  const centerX = app.screen.width / 2;
  const centerY = app.screen.height / 2;

  text.x = centerX;
  text.y = -50; // Start above the screen
  text.alpha = 1;

  layers.overlay.addChild(text);

  // Slam in: overshoot then settle
  await tween(text, { y: centerY - 8 }, { duration: 150, ease: 'easeOut' });
  await tween(text, { y: centerY }, { duration: 80, ease: 'easeInOut' });

  // Fire effects for 'super' style
  if (config.shake) {
    // Run shake and flash concurrently, don't await them blocking the hold
    screenShake(config.shake);
    screenFlash({ color: elementColor, duration: 150 });
  }

  // Hold in place
  await wait(config.holdTime);

  // Fade out
  await tween(text, { alpha: 0 }, { duration: 300, ease: 'easeOut' });

  text.destroy();
}
