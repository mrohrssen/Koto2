import { spawnParticles } from './dom-effects.js';

// ============ CORE POPUP ============

/**
 * Show a floating event popup anchored to the center of targetEl.
 *
 * @param {Element} targetEl - Element to anchor the popup to
 * @param {string} text - Text to display
 * @param {object} [opts]
 * @param {string}  [opts.color='#FFFFFF']   - Text color
 * @param {number}  [opts.particles=0]       - Number of particles to burst
 * @param {string}  [opts.particleColor]     - Particle color (defaults to opts.color)
 * @param {'up'|'down'} [opts.direction='up'] - Float direction
 * @param {string|null} [opts.icon=null]     - Optional icon prepended to text
 * @param {'small'|'normal'|'large'} [opts.size='normal'] - Font size preset
 * @param {number}  [opts.duration=1200]     - Total animation duration in ms
 */
export function showEventPopup(targetEl, text, {
  color = '#FFFFFF',
  particles = 0,
  particleColor,
  direction = 'up',
  icon = null,
  size = 'normal',
  duration = 1200
} = {}) {
  if (!targetEl || typeof document === 'undefined') return;

  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const popup = document.createElement('div');
  popup.className = `event-popup event-popup-${size}`;
  popup.style.color = color;
  popup.style.left = `${cx}px`;
  popup.style.top = `${cy}px`;
  popup.style.setProperty('--ep-direction', direction === 'down' ? '45px' : '-45px');
  popup.style.animationDuration = `${duration}ms`;
  popup.textContent = icon ? `${icon} ${text}` : text;

  document.body.appendChild(popup);

  // Spawn particles if requested
  if (particles > 0) {
    spawnParticles(targetEl, particles, particleColor || color);
  }

  // Auto-remove after animation completes
  setTimeout(() => {
    popup.remove();
  }, duration + 50);
}

// ============ PRESETS ============

/** Buff applied (amber, floats up) */
export const buff = (el, text) => showEventPopup(el, text, {
  color: '#FF8F00',
  particles: 6,
  direction: 'up'
});

/** Debuff applied (purple, floats down) */
export const debuff = (el, text) => showEventPopup(el, text, {
  color: '#7B1FA2',
  particles: 4,
  direction: 'down'
});

/** Heal received (green, floats up) */
export const heal = (el, text) => showEventPopup(el, text, {
  color: '#4CAF50',
  particles: 6,
  direction: 'up'
});

/** Item gained (white, floats up) */
export const itemGained = (el, text) => showEventPopup(el, text, {
  color: '#FFFFFF',
  particles: 4,
  direction: 'up'
});

/**
 * Credits gained/lost.
 * @param {Element} el - Target element
 * @param {number} amount - Positive = gained (gold), negative = lost (red)
 */
export function credits(el, amount) {
  const color = amount >= 0 ? '#FFD700' : '#F44336';
  const sign = amount >= 0 ? '+' : '';
  showEventPopup(el, `${sign}${amount}¤`, {
    color,
    particles: 0,
    direction: 'up'
  });
}

/** Type effectiveness (amber, large, long) */
export const effectiveness = (el, text) => showEventPopup(el, text, {
  color: '#FFB300',
  particles: 0,
  size: 'large',
  duration: 1500
});

/** Resisted type effectiveness (gray, small) */
export const resistedEffectiveness = (el, text) => showEventPopup(el, text, {
  color: '#9E9E9E',
  particles: 0,
  size: 'small'
});

/** Skill proc triggered (gold, large, long) */
export const skillProc = (el, text) => showEventPopup(el, text, {
  color: '#FFD700',
  particles: 6,
  size: 'large',
  duration: 1500
});

// ============ STATUS ICONS ============

export const STATUS_ICON_CONFIG = {
  poison:        { label: 'PSN',  bg: '#9C27B0', text: '#fff' },
  // Stat stage icons (from statStages)
  atk_up:        { label: 'ATK↑', bg: '#FF8F00', text: '#fff' },
  atk_down:      { label: 'ATK↓', bg: '#7B1FA2', text: '#fff' },
  def_up:        { label: 'DEF↑', bg: '#1976D2', text: '#fff' },
  def_down:      { label: 'DEF↓', bg: '#E65100', text: '#fff' },
  // Duration-based effects
  shield:        { label: 'SHD',  bg: '#00ACC1', text: '#fff' },
  team_shield:   { label: 'SHD',  bg: '#00ACC1', text: '#fff' },
  haste:         { label: 'SPD↑', bg: '#29B6F6', text: '#fff' },
  stun:          { label: 'STUN', bg: '#F9A825', text: '#000' },
  sleep:         { label: 'SLP',  bg: '#78909C', text: '#fff' },
  confuse:       { label: 'CONF', bg: '#FDD835', text: '#000' },
  taunt:         { label: 'TAUNT', bg: '#D32F2F', text: '#fff' }
};

// ============ COUNTER ANIMATION ============

/**
 * Animate a numeric counter from one value to another using ease-out-quad.
 *
 * @param {Element} el - Target element whose textContent will be updated
 * @param {number} fromValue - Starting number
 * @param {number} toValue - Ending number
 * @param {number} [duration=400] - Duration in ms
 * @param {object} [opts]
 * @param {string} [opts.flashColor] - Briefly flash el.style.color to this color
 * @param {string} [opts.prefix=''] - Text before the number
 * @param {string} [opts.suffix=''] - Text after the number
 */
export function animateCounter(el, fromValue, toValue, duration = 400, {
  flashColor,
  prefix = '',
  suffix = ''
} = {}) {
  if (!el || typeof requestAnimationFrame === 'undefined') return;

  const startTime = performance.now();
  const delta = toValue - fromValue;
  const originalColor = el.style.color;

  if (flashColor) {
    el.style.color = flashColor;
  }

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out-quad: t * (2 - t)
    const eased = t * (2 - t);
    const current = Math.round(fromValue + delta * eased);
    el.textContent = `${prefix}${current}${suffix}`;

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = `${prefix}${toValue}${suffix}`;
      if (flashColor) {
        // Restore original color after a brief flash
        setTimeout(() => {
          el.style.color = originalColor;
        }, 150);
      }
    }
  }

  requestAnimationFrame(tick);
}
