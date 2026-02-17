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
  // Tiers: 0=Light (<10%), 1=Normal (10-20%), 2=Solid (20-35%), 3=Big (35-50%), 4=Massive (50%+)
  tiers: {
    thresholds: [10, 20, 35, 50], // % of enemy HP for tiers 1, 2, 3, 4
    effects: [
      // Tier 0: Light
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
 * @returns {number} Tier 0-4 (Light, Normal, Solid, Big, Massive)
 */
export function getDamageTier(damage, enemyMaxHp) {
  if (!enemyMaxHp || enemyMaxHp <= 0) return 1; // Fallback to Normal
  const percent = (damage / enemyMaxHp) * 100;
  const thresholds = CONFIG.tiers.thresholds;
  if (percent >= thresholds[3]) return 4; // Massive (50%+)
  if (percent >= thresholds[2]) return 3; // Big (35-50%)
  if (percent >= thresholds[1]) return 2; // Solid (20-35%)
  if (percent >= thresholds[0]) return 1; // Normal (10-20%)
  return 0; // Light (<10%)
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
  const names = ['light', 'normal', 'solid', 'big', 'massive'];
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
 * Enemy takes damage with tiered feedback
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
 * Player takes damage
 * @param {number} damage - Damage taken
 * @param {Element} hpBarEl - Player HP bar element
 * @param {Element} robotRowEl - Robot row element (#chip-row)
 */
export async function playerHitEffect(damage, hpBarEl, robotRowEl) {
  // 1. Hit stop (shorter than enemy)
  await hitStop(50);

  // 2. Heavy screen shake
  screenShake('heavy');

  // 3. Red vignette
  showVignette(300);

  // 4. Robot row shudders
  if (robotRowEl) {
    anime(robotRowEl.querySelectorAll('.robot-slot'), {
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

// ============ POISON EFFECTS ============

/**
 * Visual effect for poison being applied to a target.
 * Adds a 'poisoned' class for persistent HP bar tint and spawns purple particles.
 * @param {Element} targetEl - The enemy slot or robot slot element being poisoned
 */
export async function poisonApplyEffect(targetEl) {
  targetEl.classList.add('poisoned');
  spawnParticles(targetEl, 6, '#9C27B0');
  await delay(400);
}

/**
 * Visual effect for poison damage tick.
 * Shows a purple damage number and a brief purple pulse.
 * @param {Element} targetEl - The enemy slot or robot slot element taking poison damage
 * @param {number} damage - Poison damage dealt
 */
export async function poisonTickEffect(targetEl, damage) {
  const popup = document.createElement('div');
  popup.className = 'poison-tick-number';
  popup.textContent = `-${damage}`;
  targetEl.style.position = 'relative';
  targetEl.appendChild(popup);

  targetEl.classList.add('poison-pulse');
  await delay(600);
  targetEl.classList.remove('poison-pulse');
  popup.remove();
}

// ============ HEAL EFFECTS ============

/**
 * Show green heal number floating up from a robot slot.
 * Flashes the robot icon and spawns green particles.
 * @param {Element} robotSlotEl - The .robot-slot element being healed
 * @param {number} healAmount - Amount of HP healed
 */
export async function healEffect(robotSlotEl, healAmount) {
  const popup = document.createElement('div');
  popup.className = 'heal-number';
  popup.textContent = `+${healAmount}`;
  robotSlotEl.style.position = 'relative';
  robotSlotEl.appendChild(popup);

  flashElement(robotSlotEl.querySelector('.robot-icon'), 1);
  spawnParticles(robotSlotEl, 8, '#4CAF50');

  await delay(1200);
  popup.remove();
}

// ============ XP POPUP EFFECTS ============

/**
 * Show animated "+XP" text floating up from a robot slot element.
 * @param {Element} robotSlotEl - The .robot-slot element to show the popup over
 * @param {number} xpAmount - Amount of XP gained
 */
export function showXpPopup(robotSlotEl, xpAmount) {
  if (!robotSlotEl || !xpAmount) return;

  const popup = document.createElement('div');
  popup.className = 'robot-xp-popup';
  popup.textContent = `+${xpAmount} XP`;
  robotSlotEl.style.position = 'relative';
  robotSlotEl.appendChild(popup);

  anime(popup, {
    translateY: [0, -40],
    opacity: [1, 0],
    scale: [1, 1.2],
  }, {
    duration: 1200,
    ease: 'outQuad',
    onComplete: () => popup.remove()
  });
}

/**
 * Show animated "Level Up!" text floating up from a robot slot element.
 * @param {Element} robotSlotEl - The .robot-slot element
 * @param {number} newLevel - The new level reached
 */
export function showLevelUpPopup(robotSlotEl, newLevel) {
  if (!robotSlotEl) return;

  const popup = document.createElement('div');
  popup.className = 'robot-levelup-popup';
  popup.textContent = `Level Up! Lv${newLevel}`;
  robotSlotEl.style.position = 'relative';
  robotSlotEl.appendChild(popup);

  // Flash the robot icon gold
  const icon = robotSlotEl.querySelector('.robot-icon');
  if (icon) {
    flashElement(icon, 2);
  }

  anime(popup, {
    translateY: [0, -50],
    opacity: [1, 0],
    scale: [1.2, 1.5],
  }, {
    duration: 1800,
    ease: 'outQuad',
    onComplete: () => popup.remove()
  });

  // Update the level badge immediately
  const badge = robotSlotEl.querySelector('.robot-level-badge');
  if (badge) {
    badge.textContent = `Lv${newLevel}`;
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

// ============ ULTIMATE ANIMATIONS ============

/** Element color configurations for ultimate effects */
const ULTIMATE_ELEMENT_CONFIG = {
  fire: {
    colors: ['#F44336', '#FF9800', '#FFEB3B', '#FF5722'],
    tintColor: 'rgba(255, 87, 34, 0.25)',
    shakeIntensity: 'heavy',
    particleCount: 35
  },
  water: {
    colors: ['#2196F3', '#03A9F4', '#00BCD4', '#B3E5FC'],
    tintColor: 'rgba(33, 150, 243, 0.2)',
    shakeIntensity: 'medium',
    particleCount: 30
  },
  earth: {
    colors: ['#8D6E63', '#795548', '#A1887F', '#D7CCC8'],
    tintColor: 'rgba(121, 85, 72, 0.2)',
    shakeIntensity: 'heavy',
    particleCount: 30
  },
  metal: {
    colors: ['#9E9E9E', '#E0E0E0', '#BDBDBD', '#F5F5F5'],
    tintColor: 'rgba(224, 224, 224, 0.3)',
    shakeIntensity: 'heavy',
    particleCount: 28
  },
  wood: {
    colors: ['#4CAF50', '#8BC34A', '#CDDC39', '#2E7D32'],
    tintColor: 'rgba(76, 175, 80, 0.2)',
    shakeIntensity: 'medium',
    particleCount: 30
  }
};

/**
 * Play the full ultimate visual effect for a given element.
 * Creates overlay particles, screen tint, and heavy shake.
 * @param {string} element - 'fire', 'water', 'earth', 'metal', 'wood'
 * @param {Element} sourceEl - Robot slot element (source of effect)
 * @param {Element[]} targetEls - Array of enemy elements to hit
 * @returns {Promise<void>} Resolves when animation is mostly complete
 */
export async function playUltimateAnimation(element, sourceEl, targetEls = []) {
  const config = ULTIMATE_ELEMENT_CONFIG[element] || ULTIMATE_ELEMENT_CONFIG.fire;

  // 1. Screen tint overlay
  const tint = document.createElement('div');
  tint.className = 'ultimate-tint-overlay';
  tint.style.backgroundColor = config.tintColor;
  document.body.appendChild(tint);
  anime(tint, {
    opacity: [0, 1, 1, 0],
  }, {
    duration: 1200,
    ease: 'linear',
    onComplete: () => tint.remove()
  });

  // 2. Screen flash (bright)
  flashScreen(2);

  // 3. Heavy screen shake (repeated)
  screenShake(config.shakeIntensity);
  setTimeout(() => screenShake('medium'), 300);
  setTimeout(() => screenShake(config.shakeIntensity), 600);

  // 4. Element-specific particle burst from source
  if (sourceEl) {
    _spawnUltimateParticles(sourceEl, config, element);
  }

  // 5. Delay, then fire energy streams to all targets
  await delay(200);

  for (const targetEl of targetEls) {
    if (sourceEl && targetEl) {
      spawnSpeedLines(sourceEl, targetEl, 5, config.colors[0]);
    }
  }

  // 6. Element-specific screen effect
  _spawnElementOverlayEffect(element, config);

  // 7. Wait for orbs to arrive, then impact targets
  await delay(400);

  for (const targetEl of targetEls) {
    if (targetEl) {
      spawnParticles(targetEl, 15, config.colors[0]);
      flashElement(targetEl, 2);
    }
  }

  // 8. Final flash
  await delay(200);
  flashScreen(1);

  // Total duration ~1200ms for overlays to finish
  await delay(400);
}

/**
 * Spawn a large burst of element-themed particles radiating from the source.
 * Particles are bigger and more numerous than normal attack particles.
 */
function _spawnUltimateParticles(sourceEl, config, element) {
  if (!sourceEl) return;

  const rect = sourceEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  for (let i = 0; i < config.particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'ultimate-particle';
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    particle.style.backgroundColor = color;
    particle.style.boxShadow = `0 0 6px ${color}, 0 0 12px ${color}`;

    // Vary size for visual interest
    const size = 4 + Math.random() * 6;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / config.particleCount + (Math.random() - 0.5) * 0.6;
    const distance = 80 + Math.random() * 120;

    anime(particle, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      scale: [1.5, 0],
      opacity: [1, 0],
    }, {
      duration: 600 + Math.random() * 400,
      ease: 'outQuad',
      onComplete: () => particle.remove()
    });
  }
}

/**
 * Spawn an element-specific full-screen overlay effect.
 * Each element has a unique visual treatment.
 */
function _spawnElementOverlayEffect(element, config) {
  switch (element) {
    case 'fire':
      _fireOverlayEffect(config);
      break;
    case 'water':
      _waterOverlayEffect(config);
      break;
    case 'earth':
      _earthOverlayEffect(config);
      break;
    case 'metal':
      _metalOverlayEffect(config);
      break;
    case 'wood':
      _woodOverlayEffect(config);
      break;
  }
}

/** Fire: flame columns rising from bottom */
function _fireOverlayEffect(config) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const flame = document.createElement('div');
    flame.className = 'ultimate-flame';
    flame.style.left = `${(i / count) * 100 + Math.random() * 10}%`;
    flame.style.bottom = '0';
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    flame.style.background = `linear-gradient(to top, ${color}, transparent)`;
    document.body.appendChild(flame);

    anime(flame, {
      translateY: [0, -(150 + Math.random() * 200)],
      opacity: [0.8, 0],
      scaleX: [0.8 + Math.random() * 0.4, 0.2],
      scaleY: [1, 2],
    }, {
      duration: 800 + Math.random() * 400,
      delay: Math.random() * 200,
      ease: 'outQuad',
      onComplete: () => flame.remove()
    });
  }
}

/** Water: wave sweep from left to right */
function _waterOverlayEffect(config) {
  const wave = document.createElement('div');
  wave.className = 'ultimate-wave';
  wave.style.background = `linear-gradient(to right, transparent, ${config.colors[0]}80, ${config.colors[2]}60, transparent)`;
  document.body.appendChild(wave);

  anime(wave, {
    translateX: ['-100%', '100%'],
    opacity: [0, 0.7, 0],
  }, {
    duration: 900,
    ease: 'inOutQuad',
    onComplete: () => wave.remove()
  });

  // Droplet particles falling
  for (let i = 0; i < 12; i++) {
    const drop = document.createElement('div');
    drop.className = 'ultimate-droplet';
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.top = `${Math.random() * 60}%`;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    drop.style.backgroundColor = color;
    document.body.appendChild(drop);

    anime(drop, {
      translateY: [0, 80 + Math.random() * 60],
      opacity: [0.8, 0],
      scale: [1, 0.3],
    }, {
      duration: 500 + Math.random() * 400,
      delay: Math.random() * 300,
      ease: 'inQuad',
      onComplete: () => drop.remove()
    });
  }
}

/** Earth: ground crack lines + rising debris */
function _earthOverlayEffect(config) {
  // Crack lines from center bottom
  for (let i = 0; i < 5; i++) {
    const crack = document.createElement('div');
    crack.className = 'ultimate-crack';
    const startX = 30 + Math.random() * 40;
    crack.style.left = `${startX}%`;
    crack.style.bottom = '0';
    crack.style.backgroundColor = config.colors[Math.floor(Math.random() * 2)];
    document.body.appendChild(crack);

    anime(crack, {
      scaleY: [0, 1],
      opacity: [1, 0.6, 0],
    }, {
      duration: 600 + Math.random() * 300,
      delay: i * 80,
      ease: 'outQuad',
      onComplete: () => crack.remove()
    });
  }

  // Rising debris particles
  for (let i = 0; i < 15; i++) {
    const debris = document.createElement('div');
    debris.className = 'ultimate-debris';
    debris.style.left = `${10 + Math.random() * 80}%`;
    debris.style.bottom = '0';
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    debris.style.backgroundColor = color;
    const size = 3 + Math.random() * 5;
    debris.style.width = `${size}px`;
    debris.style.height = `${size}px`;
    document.body.appendChild(debris);

    anime(debris, {
      translateY: [0, -(100 + Math.random() * 150)],
      translateX: (Math.random() - 0.5) * 60,
      rotate: Math.random() * 360,
      opacity: [1, 0],
      scale: [1, 0.3],
    }, {
      duration: 700 + Math.random() * 400,
      delay: Math.random() * 200,
      ease: 'outQuad',
      onComplete: () => debris.remove()
    });
  }
}

/** Metal: shards flying outward with flash */
function _metalOverlayEffect(config) {
  // Central flash
  const flash = document.createElement('div');
  flash.className = 'ultimate-metal-flash';
  document.body.appendChild(flash);

  anime(flash, {
    opacity: [0, 0.8, 0],
    scale: [0.5, 1.5],
  }, {
    duration: 400,
    ease: 'outQuad',
    onComplete: () => flash.remove()
  });

  // Metal shards radiating from center
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 16; i++) {
    const shard = document.createElement('div');
    shard.className = 'ultimate-shard';
    shard.style.left = `${cx}px`;
    shard.style.top = `${cy}px`;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    shard.style.backgroundColor = color;
    document.body.appendChild(shard);

    const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.3;
    const distance = 100 + Math.random() * 150;

    anime(shard, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      rotate: Math.random() * 720,
      opacity: [1, 0],
      scale: [1, 0.2],
    }, {
      duration: 500 + Math.random() * 300,
      delay: Math.random() * 100,
      ease: 'outQuad',
      onComplete: () => shard.remove()
    });
  }
}

/** Wood: vine/leaf burst expanding outward */
function _woodOverlayEffect(config) {
  // Vine tendrils expanding from center
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  for (let i = 0; i < 6; i++) {
    const vine = document.createElement('div');
    vine.className = 'ultimate-vine';
    vine.style.left = `${cx}px`;
    vine.style.top = `${cy}px`;
    vine.style.backgroundColor = config.colors[3]; // Dark green
    const angle = (Math.PI * 2 * i) / 6;
    vine.style.transform = `rotate(${angle * (180 / Math.PI)}deg)`;
    document.body.appendChild(vine);

    anime(vine, {
      scaleX: [0, 1],
      opacity: [0.8, 0],
    }, {
      duration: 800,
      delay: i * 60,
      ease: 'outQuad',
      onComplete: () => vine.remove()
    });
  }

  // Leaf particles
  for (let i = 0; i < 20; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'ultimate-leaf';
    leaf.style.left = `${cx + (Math.random() - 0.5) * 100}px`;
    leaf.style.top = `${cy + (Math.random() - 0.5) * 100}px`;
    const color = config.colors[Math.floor(Math.random() * config.colors.length)];
    leaf.style.backgroundColor = color;
    document.body.appendChild(leaf);

    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 140;

    anime(leaf, {
      translateX: Math.cos(angle) * distance,
      translateY: Math.sin(angle) * distance,
      rotate: Math.random() * 540,
      opacity: [0.9, 0],
      scale: [1, 0.3],
    }, {
      duration: 700 + Math.random() * 400,
      delay: Math.random() * 200,
      ease: 'outQuad',
      onComplete: () => leaf.remove()
    });
  }
}
