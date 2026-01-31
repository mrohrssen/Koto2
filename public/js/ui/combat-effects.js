/**
 * @file combat-effects.js - Anime-style Combat Visual Effects
 *
 * PURPOSE:
 * Provides reusable visual effect primitives for combat feedback:
 * screen shake, hit stop, particles, speed lines, and flashes.
 *
 * USAGE:
 * Import individual functions and call during combat events.
 * Effects are designed to layer - call multiple for combined impact.
 */

import { animate as anime } from '../lib/anime.esm.min.js';

// ============ CONFIGURATION ============

const CONFIG = {
  shake: {
    light: { intensity: 2, duration: 100 },
    medium: { intensity: 4, duration: 150 },
    heavy: { intensity: 6, duration: 200 }
  },
  hitStop: {
    normal: 60,
    big: 100
  },
  particles: {
    normal: 10,
    big: 18
  },
  bigDamageThreshold: 150
};

// ============ UTILITY ============

/**
 * Promise-based delay
 * @param {number} ms - Milliseconds to wait
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if damage qualifies as "big hit"
 * @param {number} damage
 * @returns {boolean}
 */
export const isBigDamage = (damage) => damage >= CONFIG.bigDamageThreshold;

// ============ PRIMITIVES ============

/**
 * Screen shake effect
 * @param {'light'|'medium'|'heavy'} intensity
 */
export function screenShake(intensity = 'medium') {
  const container = document.querySelector('.game-app');
  if (!container) return;

  const { intensity: px, duration } = CONFIG.shake[intensity] || CONFIG.shake.medium;

  anime({
    targets: container,
    translateX: [0, -px, px, -px/2, px/2, 0],
    translateY: [0, px/2, -px/2, 0],
    duration,
    easing: 'easeOutQuad'
  });
}

/**
 * Freeze all animations briefly (hit stop)
 * @param {number} ms - Duration of freeze
 */
export async function hitStop(ms = CONFIG.hitStop.normal) {
  document.body.classList.add('hit-stop');
  await delay(ms);
  document.body.classList.remove('hit-stop');
}

/**
 * Flash an element white (or custom filter)
 * @param {string|Element} targets - CSS selector or element
 * @param {number} count - Number of flashes
 */
export function flashElement(targets, count = 1) {
  anime({
    targets,
    filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
}

/**
 * Flash the screen white
 * @param {number} count - Number of flashes
 */
export function flashScreen(count = 1) {
  const overlay = document.getElementById('screen-flash-overlay');
  if (!overlay) return;

  anime({
    targets: overlay,
    opacity: [0, 0.3, 0],
    duration: 100,
    loop: count,
    easing: 'easeOutQuad'
  });
}

/**
 * Show red vignette (player damage)
 * @param {number} duration - Fade duration
 */
export function showVignette(duration = 300) {
  const overlay = document.getElementById('vignette-overlay');
  if (!overlay) return;

  anime({
    targets: overlay,
    opacity: [0.6, 0],
    duration,
    easing: 'easeOutQuad'
  });
}

/**
 * Spawn particles bursting outward from an element
 * @param {Element} sourceEl - Element to burst from
 * @param {number} count - Number of particles
 * @param {string} color - Particle color
 */
export function spawnParticles(sourceEl, count = 10, color = '#fff') {
  if (!sourceEl) return;

  const rect = sourceEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'combat-particle';
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.backgroundColor = color;
    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 40 + Math.random() * 40;

    anime({
      targets: particle,
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1, 0],
      opacity: [1, 0],
      duration: 350 + Math.random() * 150,
      easing: 'easeOutQuad',
      complete: () => particle.remove()
    });
  }
}

/**
 * Spawn speed lines from source toward target
 * @param {Element} fromEl - Source element
 * @param {Element} toEl - Target element
 * @param {number} count - Number of lines
 * @param {string} color - Line color (CSS)
 */
export function spawnSpeedLines(fromEl, toEl, count = 4, color = 'rgba(255,255,255,0.9)') {
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  for (let i = 0; i < count; i++) {
    const line = document.createElement('div');
    line.className = 'speed-line';
    line.style.left = `${startX}px`;
    line.style.top = `${startY + (i - count/2) * 4}px`;
    line.style.transform = `rotate(${angle}deg)`;
    line.style.background = `linear-gradient(90deg, ${color}, transparent)`;
    document.body.appendChild(line);

    anime({
      targets: line,
      translateX: dx,
      translateY: dy,
      opacity: [1, 0],
      duration: 200,
      delay: i * 25,
      easing: 'easeOutQuad',
      complete: () => line.remove()
    });
  }
}

/**
 * Animate element recoil (shift and spring back)
 * @param {string|Element} targets
 * @param {number} distance - Pixels to recoil
 * @param {'left'|'right'} direction
 */
export function recoil(targets, distance = 5, direction = 'right') {
  const sign = direction === 'right' ? 1 : -1;

  anime({
    targets,
    translateX: [0, sign * distance, 0],
    duration: 200,
    easing: 'easeOutElastic(1, 0.5)'
  });
}

/**
 * Pop animation (scale overshoot)
 * @param {string|Element} targets
 * @param {number} scale - Max scale
 */
export function pop(targets, scale = 1.3) {
  anime({
    targets,
    scale: [1, scale, 1],
    duration: 300,
    easing: 'easeOutBack'
  });
}

// ============ COMBAT MOMENTS ============

/**
 * Moment 1: Chip firing with effects
 * Called for each chip in the activation sequence
 * @param {Element} chipEl - The chip slot element
 * @param {Object} chipData - Chip data with stats.power and stats.bandwidth
 * @param {Object} poolEls - { power: Element, bandwidth: Element } pool display elements
 */
export async function fireChipEffect(chipEl, chipData, poolEls = {}) {
  if (!chipEl) return;

  // 1. Chip pops
  pop(chipEl.querySelector('.chip-icon') || chipEl, 1.4);

  // 2. Enhanced glow
  const icon = chipEl.querySelector('.chip-icon');
  if (icon) {
    icon.classList.add('chip-firing-enhanced');
    setTimeout(() => icon.classList.remove('chip-firing-enhanced'), 300);
  }

  // 3. Speed lines to pools (if pool elements exist)
  const stats = chipData?.stats || {};
  if (stats.power > 0 && poolEls.power) {
    spawnSpeedLines(chipEl, poolEls.power, 3, 'rgba(231, 76, 60, 0.9)');
    setTimeout(() => flashElement(poolEls.power), 150);
  }
  if (stats.bandwidth > 0 && poolEls.bandwidth) {
    spawnSpeedLines(chipEl, poolEls.bandwidth, 3, 'rgba(52, 152, 219, 0.9)');
    setTimeout(() => flashElement(poolEls.bandwidth), 150);
  }

  // 4. Particles from chip
  spawnParticles(chipEl, 5, '#3498db');

  // 5. Subtle screen pulse
  flashScreen();
}

/**
 * Moment 2: Enemy takes damage
 * @param {number} damage - Damage dealt
 * @param {Element} enemyEl - Enemy sprite element
 */
export async function impactEnemyEffect(damage, enemyEl) {
  const big = isBigDamage(damage);

  // 1. Hit stop
  await hitStop(big ? CONFIG.hitStop.big : CONFIG.hitStop.normal);

  // 2. Flash enemy
  if (enemyEl) {
    flashElement(enemyEl);
  }

  // 3. Screen shake
  screenShake(big ? 'heavy' : 'medium');

  // 4. Particles burst from enemy
  if (enemyEl) {
    spawnParticles(enemyEl, big ? CONFIG.particles.big : CONFIG.particles.normal, '#e74c3c');
  }

  // 5. Enemy recoils
  if (enemyEl) {
    recoil(enemyEl, big ? 10 : 5, 'right');
  }

  // 6. Big damage: double flash
  if (big) {
    await delay(50);
    flashScreen(2);
  }
}

/**
 * Moment 3: Player takes damage
 * @param {number} damage - Damage taken
 * @param {Element} hpBarEl - Player HP bar element
 * @param {Element} chipRowEl - Chip row element
 */
export async function playerHitEffect(damage, hpBarEl, chipRowEl) {
  // 1. Hit stop (shorter than enemy)
  await hitStop(50);

  // 2. Heavy screen shake
  screenShake('heavy');

  // 3. Red vignette
  showVignette(300);

  // 4. Chip row shudders
  if (chipRowEl) {
    anime({
      targets: chipRowEl.querySelectorAll('.chip-slot'),
      translateX: [-2, 2, -1, 0],
      duration: 150,
      easing: 'easeOutQuad'
    });
  }

  // 5. HP bar flash before drain
  if (hpBarEl) {
    flashElement(hpBarEl);
  }
}

/**
 * Check if HP is critical and add pulse effect
 * @param {Element} hpBarEl - HP bar fill element
 * @param {number} currentHp
 * @param {number} maxHp
 */
export function updateHpCriticalState(hpBarEl, currentHp, maxHp) {
  if (!hpBarEl) return;

  const percent = currentHp / maxHp;
  if (percent < 0.25) {
    hpBarEl.classList.add('hp-critical-pulse');
  } else {
    hpBarEl.classList.remove('hp-critical-pulse');
  }
}
