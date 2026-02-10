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
    none: null,
    light: { intensity: 2, duration: 100 },
    medium: { intensity: 4, duration: 150 },
    heavy: { intensity: 6, duration: 200 }
  },
  // Tier-based effect configuration
  // Tiers: 0=Chip (<10%), 1=Normal (10-20%), 2=Solid (20-35%), 3=Big (35-50%), 4=Massive (50%+)
  tiers: {
    thresholds: [10, 20, 35, 50], // % of enemy HP for tiers 1, 2, 3, 4
    effects: [
      // Tier 0: Chip
      { shake: 'none', hitStop: 0, particles: 4, flash: 'none' },
      // Tier 1: Normal
      { shake: 'light', hitStop: 30, particles: 8, flash: 'none' },
      // Tier 2: Solid
      { shake: 'medium', hitStop: 60, particles: 12, flash: 'element' },
      // Tier 3: Big
      { shake: 'heavy', hitStop: 100, particles: 18, flash: 'both' },
      // Tier 4: Massive
      { shake: 'heavy', hitStop: 150, particles: 25, flash: 'screen2x' }
    ]
  }
};

// ============ UTILITY ============

/**
 * Promise-based delay
 * @param {number} ms - Milliseconds to wait
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate damage tier based on % of enemy max HP
 * @param {number} damage - Damage dealt
 * @param {number} enemyMaxHp - Enemy's maximum HP
 * @returns {number} Tier 0-4 (Chip, Normal, Solid, Big, Massive)
 */
export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1; // Fallback to Normal
  const percent = (damage / enemyMaxHp) * 100;
  const thresholds = CONFIG.tiers.thresholds;
  if (percent >= thresholds[3]) return 4; // Massive (50%+)
  if (percent >= thresholds[2]) return 3; // Big (35-50%)
  if (percent >= thresholds[1]) return 2; // Solid (20-35%)
  if (percent >= thresholds[0]) return 1; // Normal (10-20%)
  return 0; // Chip (<10%)
}

/**
 * Check if damage qualifies as "big hit" (tier 3+)
 * @param {number} damage - Damage dealt
 * @param {number} enemyMaxHp - Enemy's maximum HP
 * @returns {boolean}
 */
export const isBigDamage = (damage, enemyMaxHp) => getDamageTier(damage, enemyMaxHp) >= 3;

/**
 * Get tier name for CSS class
 * @param {number} tier - Tier 0-4
 * @returns {string} CSS class suffix
 */
export function getTierClassName(tier) {
  const names = ['chip', 'normal', 'solid', 'big', 'massive'];
  return names[tier] || 'normal';
}

// ============ PRIMITIVES ============

/**
 * Screen shake effect
 * @param {'light'|'medium'|'heavy'} intensity
 */
export function screenShake(intensity = 'medium') {
  const container = document.querySelector('.game-app');
  if (!container) return;

  const { intensity: px, duration } = CONFIG.shake[intensity] || CONFIG.shake.medium;

  anime(container, {
    translateX: [0, -px, px, -px/2, px/2, 0],
    translateY: [0, px/2, -px/2, 0],
  }, {
    duration,
    ease: 'outQuad',
    onComplete: () => {
      // Remove transform so position:fixed children (e.g. lookup popup)
      // are not trapped in a new containing block created by transform
      container.style.transform = '';
    }
  });

  // Fallback cleanup in case onComplete doesn't fire reliably
  setTimeout(() => {
    container.style.transform = '';
  }, duration + 50);
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
  anime(targets, {
    filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'],
  }, {
    duration: 100,
    loop: count,
    ease: 'outQuad'
  });
}

/**
 * Flash the screen white
 * @param {number} count - Number of flashes
 */
export function flashScreen(count = 1) {
  const overlay = document.getElementById('screen-flash-overlay');
  if (!overlay) return;

  anime(overlay, {
    opacity: [0, 0.3, 0],
  }, {
    duration: 100,
    loop: count,
    ease: 'outQuad'
  });
}

/**
 * Show red vignette (player damage)
 * @param {number} duration - Fade duration
 */
export function showVignette(duration = 300) {
  const overlay = document.getElementById('vignette-overlay');
  if (!overlay) return;

  anime(overlay, {
    opacity: [0.6, 0],
  }, {
    duration,
    ease: 'outQuad'
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

    anime(particle, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1, 0],
      opacity: [1, 0],
    }, {
      duration: 350 + Math.random() * 150,
      ease: 'outQuad',
      onComplete: () => particle.remove()
    });
  }
}

/**
 * Spawn an energy stream from source to target - a bright orb with a trail
 * @param {Element} fromEl - Source element
 * @param {Element} toEl - Target element
 * @param {number} count - Number of energy orbs to send
 * @param {string} color - Energy color (CSS)
 */
export function spawnSpeedLines(fromEl, toEl, count = 3, color = 'rgba(255,255,255,0.9)') {
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  const dx = endX - startX;
  const dy = endY - startY;

  // Extract solid color for particles
  const solidColor = color.includes('rgba')
    ? color.replace(/[\d.]+\)$/, '1)')
    : color;

  const duration = 300;

  for (let i = 0; i < count; i++) {
    // Lead orb - bright and larger
    const orb = document.createElement('div');
    orb.className = 'energy-orb';
    orb.style.left = `${startX}px`;
    orb.style.top = `${startY}px`;
    orb.style.backgroundColor = solidColor;
    orb.style.boxShadow = `0 0 8px ${solidColor}, 0 0 16px ${solidColor}`;
    document.body.appendChild(orb);

    const orbDelay = i * 60;
    anime(orb, {
      translateX: dx,
      translateY: dy,
      scale: [1, 0],
      opacity: [1, 0],
    }, {
      duration,
      delay: orbDelay,
      ease: 'inQuad',
    });

    // Flash target and cleanup with timeout (more reliable than onComplete)
    setTimeout(() => {
      flashElement(toEl);
      orb.remove();
    }, duration + orbDelay);

    // Trail particles - spawn along the path with delays
    const trailCount = 5;
    for (let t = 0; t < trailCount; t++) {
      const trail = document.createElement('div');
      trail.className = 'energy-trail';
      trail.style.left = `${startX}px`;
      trail.style.top = `${startY}px`;
      trail.style.backgroundColor = solidColor;
      trail.style.boxShadow = `0 0 4px ${solidColor}`;
      document.body.appendChild(trail);

      const trailDelay = i * 60 + t * 20;
      anime(trail, {
        translateX: dx,
        translateY: dy,
        scale: [0.8, 0],
        opacity: [0.8, 0],
      }, {
        duration: duration - 50,
        delay: trailDelay,
        ease: 'inQuad',
      });

      // Cleanup with timeout
      setTimeout(() => trail.remove(), duration - 50 + trailDelay + 50);
    }
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

  anime(targets, {
    translateX: [0, sign * distance, 0],
  }, {
    duration: 200,
    ease: 'outElastic(1, 0.5)'
  });
}

/**
 * Pop animation (scale overshoot)
 * @param {string|Element} targets
 * @param {number} scale - Max scale
 */
export function pop(targets, scale = 1.3) {
  anime(targets, {
    scale: [1, scale, 1],
  }, {
    duration: 300,
    ease: 'outBack'
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
 * Moment 2: Enemy takes damage with tiered feedback
 * @param {number} damage - Damage dealt
 * @param {Element} enemyEl - Enemy sprite element
 * @param {number} enemyMaxHp - Enemy's maximum HP (for tier calculation)
 */
export async function impactEnemyEffect(damage, enemyEl, enemyMaxHp = 0) {
  const tier = getDamageTier(damage, enemyMaxHp);
  const effects = CONFIG.tiers.effects[tier];

  // 1. Hit stop (scaled by tier)
  if (effects.hitStop > 0) {
    await hitStop(effects.hitStop);
  }

  // 2. Flash enemy (tier 2+)
  if (enemyEl && effects.flash !== 'none') {
    flashElement(enemyEl);
  }

  // 3. Screen shake (tier 1+)
  if (effects.shake !== 'none') {
    screenShake(effects.shake);
    // Tier 4: Extra shake after brief delay
    if (tier === 4) {
      await delay(100);
      screenShake('medium');
    }
  }

  // 4. Particles burst from enemy
  if (enemyEl) {
    // Higher tier = brighter particle color
    const colors = ['#b0bec5', '#ef5350', '#4fc3f7', '#4fc3f7', '#ffb74d'];
    spawnParticles(enemyEl, effects.particles, colors[tier]);
  }

  // 5. Enemy recoils (scaled by tier)
  if (enemyEl) {
    const recoilDistance = [2, 4, 6, 8, 12][tier];
    recoil(enemyEl, recoilDistance, 'right');
  }

  // 6. Screen flash based on tier
  if (effects.flash === 'both') {
    await delay(50);
    flashScreen(1);
  } else if (effects.flash === 'screen2x') {
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
    anime(chipRowEl.querySelectorAll('.chip-slot'), {
      translateX: [-2, 2, -1, 0],
    }, {
      duration: 150,
      ease: 'outQuad'
    });
  }

  // 5. HP bar flash before drain
  if (hpBarEl) {
    flashElement(hpBarEl);
  }
}

// ============ ROBOT COMBAT EFFECTS ============

/** Element color mapping for robot attack orbs */
const ELEMENT_COLORS = {
  wood: '#4CAF50',
  fire: '#F44336',
  earth: '#8D6E63',
  metal: '#9E9E9E',
  water: '#2196F3'
};

/**
 * Fire element-colored energy orbs from an allied robot to the enemy.
 * Reuses spawnSpeedLines for the projectile, plus pop and particle burst.
 * @param {Element} robotSlotEl - The .robot-slot element that is attacking
 * @param {Element} enemyEl - The enemy sprite element
 * @param {string} element - Robot element ('fire', 'water', 'wood', 'earth', 'metal')
 * @param {number} damage - Damage dealt (for tier-based impact)
 * @param {number} enemyMaxHp - Enemy max HP (for tier calculation)
 */
export async function fireRobotAttackEffect(robotSlotEl, enemyEl, element, damage = 0, enemyMaxHp = 0) {
  if (!robotSlotEl || !enemyEl) return;

  const color = ELEMENT_COLORS[element] || '#fff';

  // 1. Robot icon pops
  const icon = robotSlotEl.querySelector('.robot-icon');
  if (icon) pop(icon, 1.4);

  // 2. Fire element-colored orbs from robot to enemy
  spawnSpeedLines(robotSlotEl, enemyEl, 3, color);

  // 3. Particles burst from robot in element color
  spawnParticles(robotSlotEl, 4, color);

  // 4. Wait for orbs to arrive, then impact
  await delay(350);

  // 5. Enemy impact effects (tiered by damage)
  await impactEnemyEffect(damage, enemyEl, enemyMaxHp);
}

/**
 * Fire element-colored energy orbs from the enemy to a targeted allied robot.
 * @param {Element} enemyEl - The enemy sprite element
 * @param {Element} robotSlotEl - The targeted .robot-slot element
 * @param {string} element - Enemy robot element
 * @param {number} damage - Damage dealt
 */
export async function enemyRobotAttackEffect(enemyEl, robotSlotEl, element, damage = 0) {
  if (!enemyEl || !robotSlotEl) return;

  const color = ELEMENT_COLORS[element] || '#fff';

  // 1. Fire element-colored orbs from enemy to robot
  spawnSpeedLines(enemyEl, robotSlotEl, 2, color);

  // 2. Particles burst from enemy in element color
  spawnParticles(enemyEl, 3, color);

  // 3. Wait for orbs to arrive
  await delay(300);

  // 4. Flash the targeted robot
  const icon = robotSlotEl.querySelector('.robot-icon');
  if (icon) flashElement(icon);

  // 5. Screen shake + vignette
  screenShake('medium');
  showVignette(200);
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
