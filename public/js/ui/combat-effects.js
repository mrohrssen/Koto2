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

import { animate as anime } from 'animejs';
import { hapticDamageTier } from '../native/index.js';

/**
 * Run an anime.js animation with guaranteed cleanup.
 * Uses anime v4's `finished` promise instead of setTimeout fallbacks.
 * @param {Element|NodeList} targets - Animation targets
 * @param {object} properties - anime.js property keyframes
 * @param {object} options - anime.js options
 * @param {function} [cleanup] - Called after animation finishes or is interrupted
 * @returns {Promise<void>}
 */
export async function safeAnimate(targets, properties, options, cleanup) {
  const anim = anime(targets, properties, options);
  try {
    await anim.finished;
  } catch {
    // Animation was interrupted (element removed, page nav, etc.)
  }
  if (cleanup) cleanup();
}

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
 * Clear any stale inline transforms left by anime.js on formation slots.
 * Anime.js sets style.transform during animations, overriding CSS depth-scaling
 * (scale(0.9), scale(0.95)). If onComplete doesn't fire (e.g. animation interrupted),
 * the inline style persists and creatures appear shifted.
 */
export function clearFormationTransforms() {
  const pf = document.getElementById('player-formation');
  if (pf) pf.querySelectorAll('.formation-slot').forEach(s => { s.style.transform = ''; });
  const ef = document.getElementById('enemy-formation');
  if (ef) ef.querySelectorAll('.formation-slot').forEach(s => { s.style.transform = ''; });
}

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
  const els = targets instanceof NodeList || Array.isArray(targets) ? targets
    : targets instanceof Element ? [targets] : document.querySelectorAll(targets);

  const cleanup = () => {
    els.forEach(el => { if (el?.style) el.style.transform = ''; });
  };
  anime(targets, {
    translateX: [0, sign * distance, 0],
  }, {
    duration: 200,
    ease: 'outElastic(1, 0.5)',
    onComplete: cleanup
  });
  // Fallback cleanup in case onComplete doesn't fire (animation interrupted)
  setTimeout(cleanup, 250);
}

/**
 * Lunge animation — creature moves forward toward a target then returns.
 * Used for counter-attacks.
 * @param {Element} el - The element to lunge
 * @param {number} distance - Pixels to move forward (positive = right, negative = left)
 * @param {number} duration - Total duration in ms
 */
export function lunge(el, distance = 30, duration = 300) {
  if (!el) return Promise.resolve();
  return new Promise(resolve => {
    const cleanup = () => {
      if (el?.style) el.style.transform = '';
      resolve();
    };
    anime(el, {
      translateX: [0, distance, 0],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: cleanup
    });
    setTimeout(cleanup, duration + 50);
  });
}

/**
 * Pop animation (scale overshoot)
 * @param {string|Element} targets
 * @param {number} scale - Max scale
 */
export function pop(targets, scale = 1.15) {
  const els = targets instanceof NodeList || Array.isArray(targets) ? targets
    : targets instanceof Element ? [targets] : document.querySelectorAll(targets);

  const cleanup = () => {
    els.forEach(el => { if (el?.style) el.style.transform = ''; });
  };
  anime(targets, {
    scale: [1, scale, 1],
  }, {
    duration: 300,
    ease: 'outBack',
    onComplete: cleanup
  });
  // Fallback cleanup in case onComplete doesn't fire (animation interrupted)
  setTimeout(cleanup, 350);
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

  // Haptic feedback (no-op on web)
  hapticDamageTier(tier);

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
    const recoilDistance = [2, 4, 6, 7, 8][tier];
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
 * @param {Element} creatureRowEl - Creature row element (#creature-row)
 */
export async function playerHitEffect(damage, hpBarEl, creatureRowEl) {
  // 1. Hit stop (shorter than enemy)
  await hitStop(50);

  // 2. Heavy screen shake
  screenShake('heavy');

  // 3. Red vignette
  showVignette(300);

  // 4. Creature row shudders
  const playerFormation = document.getElementById('player-formation');
  if (playerFormation) {
    const slots = playerFormation.querySelectorAll('.formation-slot');
    const cleanup = () => {
      slots.forEach(s => { s.style.transform = ''; });
    };
    anime(slots, {
      translateX: [-2, 2, -1, 0],
    }, {
      duration: 150,
      ease: 'outQuad',
      onComplete: cleanup
    });
    // Fallback cleanup in case onComplete doesn't fire (animation interrupted)
    setTimeout(cleanup, 200);
  }

  // 5. HP bar flash before drain
  if (hpBarEl) {
    flashElement(hpBarEl);
  }
}

// ============ CREATURE COMBAT EFFECTS ============

/** Element color mapping for creature attack orbs */
const ELEMENT_COLORS = {
  wood: '#4CAF50',
  fire: '#F44336',
  earth: '#8D6E63',
  metal: '#9E9E9E',
  water: '#2196F3'
};

/**
 * Fire element-colored energy orbs from an allied creature to the enemy.
 * Reuses spawnSpeedLines for the projectile, plus pop and particle burst.
 * @param {Element} creatureSlotEl - The .creature-slot element that is attacking
 * @param {Element} enemyEl - The enemy sprite element
 * @param {string} element - Creature element ('fire', 'water', 'wood', 'earth', 'metal')
 * @param {number} damage - Damage dealt (for tier-based impact)
 * @param {number} enemyMaxHp - Enemy max HP (for tier calculation)
 */
export async function fireCreatureAttackEffect(creatureSlotEl, enemyEl, element, damage = 0, enemyMaxHp = 0) {
  if (!creatureSlotEl || !enemyEl) return;

  const color = ELEMENT_COLORS[element] || '#fff';

  // 1. Creature icon pops
  const icon = creatureSlotEl.querySelector('.formation-sprite');
  if (icon) pop(icon, 1.2);

  // 2. Fire element-colored orbs from creature to enemy
  spawnSpeedLines(creatureSlotEl, enemyEl, 3, color);

  // 3. Particles burst from creature in element color
  spawnParticles(creatureSlotEl, 4, color);

  // 4. Wait for orbs to arrive, then impact
  await delay(350);

  // 5. Enemy impact effects (tiered by damage)
  await impactEnemyEffect(damage, enemyEl, enemyMaxHp);
}

/**
 * Fire element-colored energy orbs from the enemy to a targeted allied creature.
 * @param {Element} enemyEl - The enemy sprite element
 * @param {Element} creatureSlotEl - The targeted .creature-slot element
 * @param {string} element - Enemy creature element
 * @param {number} damage - Damage dealt
 */
export async function enemyCreatureAttackEffect(enemyEl, creatureSlotEl, element, damage = 0) {
  if (!enemyEl || !creatureSlotEl) return;

  const color = ELEMENT_COLORS[element] || '#fff';

  // 1. Fire element-colored orbs from enemy to creature
  spawnSpeedLines(enemyEl, creatureSlotEl, 2, color);

  // 2. Particles burst from enemy in element color
  spawnParticles(enemyEl, 3, color);

  // 3. Wait for orbs to arrive
  await delay(300);

  // 4. Flash the targeted creature
  const icon = creatureSlotEl.querySelector('.formation-sprite');
  if (icon) flashElement(icon);

  // 5. Recoil the targeted creature left
  recoil(creatureSlotEl, 4, 'left');

  // 6. Screen shake + vignette
  screenShake('medium');
  showVignette(200);
}

// ============ POISON EFFECTS ============

/**
 * Visual effect for poison being applied to a target.
 * Adds a 'poisoned' class for persistent HP bar tint and spawns purple particles.
 * @param {Element} targetEl - The enemy slot or creature slot element being poisoned
 */
export async function poisonApplyEffect(targetEl) {
  targetEl.classList.add('poisoned');
  spawnParticles(targetEl, 6, '#9C27B0');
  await delay(400);
}

/**
 * Visual effect for poison damage tick.
 * Shows a purple damage number and a brief purple pulse.
 * @param {Element} targetEl - The enemy slot or creature slot element taking poison damage
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
 * Show green heal number floating up from a creature slot.
 * Flashes the creature icon and spawns green particles.
 * @param {Element} creatureSlotEl - The .creature-slot element being healed
 * @param {number} healAmount - Amount of HP healed
 */
export async function healEffect(creatureSlotEl, healAmount) {
  const popup = document.createElement('div');
  popup.className = 'heal-number';
  popup.textContent = `+${healAmount}`;
  creatureSlotEl.style.position = 'relative';
  creatureSlotEl.appendChild(popup);

  flashElement(creatureSlotEl.querySelector('.formation-sprite'), 1);
  spawnParticles(creatureSlotEl, 8, '#4CAF50');

  await delay(1200);
  popup.remove();
}

// ============ XP POPUP EFFECTS ============

/**
 * Show animated "+XP" text floating up from a creature slot element.
 * @param {Element} creatureSlotEl - The .creature-slot element to show the popup over
 * @param {number} xpAmount - Amount of XP gained
 */
export function showXpPopup(creatureSlotEl, xpAmount) {
  if (!creatureSlotEl || !xpAmount) return;

  const popup = document.createElement('div');
  popup.className = 'creature-xp-popup';
  popup.textContent = `+${xpAmount} XP`;
  creatureSlotEl.appendChild(popup);

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
 * Show animated "Level Up!" text floating up from a creature slot element.
 * @param {Element} creatureSlotEl - The .creature-slot element
 * @param {number} newLevel - The new level reached
 * @param {number} [hpGain] - HP gained from this level-up
 * @param {number} [attackGain] - ATK gained from this level-up
 */
export function showLevelUpPopup(creatureSlotEl, newLevel, hpGain, attackGain) {
  if (!creatureSlotEl) return;

  const popup = document.createElement('div');
  popup.className = 'creature-levelup-popup';
  let text = `Level Up! Lv${newLevel}`;
  if (hpGain || attackGain) {
    const parts = [];
    if (hpGain) parts.push(`+${hpGain} HP`);
    if (attackGain) parts.push(`+${attackGain} ATK`);
    text += `\n${parts.join(', ')}`;
  }
  popup.textContent = text;
  popup.style.whiteSpace = 'pre-line';
  creatureSlotEl.appendChild(popup);

  // Flash the creature icon with a neon glow
  const icon = creatureSlotEl.querySelector('.formation-sprite');
  if (icon) {
    icon.classList.add('level-up-glow');
    setTimeout(() => icon.classList.remove('level-up-glow'), 1500);
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

