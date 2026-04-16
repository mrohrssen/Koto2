import { Graphics, Text, Container } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween, wait } from './tween.js';
import { burstParticles, screenFlash, ELEMENT_COLORS } from './effects.js';
import { showEventPopup } from './text.js';
import { getCreatureSprite } from './formation.js';

// ============ STATUS COLORS ============

const STATUS_COLORS = {
  poison:            0x9C27B0,
  sleep:             0x5C6BC0,
  stun:              0xFFEB3B,
  confuse:           0xFF9800,
  haste:             0x29B6F6,
  shield:            0x42A5F5,
  team_shield:       0x42A5F5,
  taunt:             0xEF5350,
  temp_attack_flat:  0xFF8F00,
};

// ============ POPUP LABELS ============

const STATUS_LABELS = {
  poison:            'Poisoned!',
  sleep:             'Sleep!',
  stun:              'Stunned!',
  confuse:           'Confused!',
  haste:             'Haste!',
  shield:            'Shield!',
  team_shield:       'Shield!',
  taunt:             'Taunt!',
  temp_attack_flat:  'ATK+',
};

// ============ ONGOING VFX TRACKING ============

/** @type {Map<import('pixi.js').Sprite, Record<string, { container: Container|null, tickerId: Function|null }>>} */
const ongoingVfx = new Map();

/**
 * Convert a hex color number to a CSS hex string.
 * @param {number} hex
 * @returns {string}
 */
function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Get or create the ongoing entry map for a sprite.
 * @param {import('pixi.js').Sprite} sprite
 * @returns {Record<string, { container: Container|null, tickerId: Function|null }>}
 */
function getOngoingMap(sprite) {
  if (!ongoingVfx.has(sprite)) {
    ongoingVfx.set(sprite, {});
  }
  return ongoingVfx.get(sprite);
}

// ============ APPLIED ANIMATIONS ============

/**
 * Play the one-shot "applied" animation for a status effect, then start the ongoing visual.
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @param {string} effectType
 */
export async function playStatusApplied(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  const color = STATUS_COLORS[effectType] || 0xFFFFFF;
  const label = STATUS_LABELS[effectType] || effectType;
  const cssColor = hexToCSS(color);
  const pos = { x: sprite.x + (sprite.parent?.x || 0), y: sprite.y + (sprite.parent?.y || 0) };

  // --- Applied animation per effect type ---

  switch (effectType) {
    case 'poison':
      burstParticles(pos, { count: 12, color, speed: 60, life: 500 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'sleep':
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      // Darken the sprite
      await tween(sprite, { alpha: 0.5 }, { duration: 300, ease: 'easeOut' });
      break;

    case 'stun':
      screenFlash({ color, duration: 120, count: 1 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'confuse':
      // Spiral particles (burst in a tight radius)
      burstParticles(pos, { count: 14, color, speed: 40, life: 600 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'haste':
      burstParticles(pos, { count: 10, color, speed: 70, life: 400 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'shield':
      burstParticles(pos, { count: 10, color, speed: 50, life: 400 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'team_shield':
      burstParticles(pos, { count: 10, color, speed: 50, life: 400 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'taunt':
      burstParticles(pos, { count: 12, color, speed: 60, life: 500 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    case 'temp_attack_flat':
      burstParticles(pos, { count: 10, color, speed: 50, life: 400 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;

    default:
      burstParticles(pos, { count: 8, color, speed: 50, life: 400 });
      showEventPopup(label, pos, { color: cssColor, direction: 'up', duration: 700, size: 18 });
      break;
  }

  // --- Start ongoing visual (if any) ---
  startOngoing(sprite, effectType);
}

// ============ ONGOING VISUALS ============

/**
 * Start the persistent ongoing visual for a status effect.
 * @param {import('pixi.js').Sprite} sprite
 * @param {string} effectType
 */
function startOngoing(sprite, effectType) {
  const { app, layers } = getStage();
  if (!app || !layers.effects) return;

  // Don't double-start
  const map = getOngoingMap(sprite);
  if (map[effectType]) return;

  const entry = { container: null, tickerId: null };

  switch (effectType) {
    case 'sleep':
      startSleepOngoing(sprite, entry, app, layers);
      break;

    case 'stun':
      startStunOngoing(sprite, entry, app, layers);
      break;

    case 'confuse':
      startConfuseOngoing(sprite, entry, app);
      break;

    case 'haste':
      startHasteOngoing(sprite, entry, app);
      break;

    case 'shield':
    case 'team_shield':
      startShieldOngoing(sprite, entry, app, layers);
      break;

    case 'taunt':
      startTauntOngoing(sprite, entry, app, layers);
      break;

    // poison: tick handled separately (showPoisonTick in text.js)
    // temp_attack_flat: no ongoing visual
    default:
      return; // No ongoing for this effect
  }

  map[effectType] = entry;
}

// --- Sleep: floating "Z" particles every 800ms ---

function startSleepOngoing(sprite, entry, app, layers) {
  const container = new Container();
  layers.effects.addChild(container);
  entry.container = container;

  let elapsed = 0;

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    if (elapsed >= 800) {
      elapsed -= 800;
      spawnZParticle(sprite, container);
    }
    // Update existing Z texts — float up and fade
    for (let i = container.children.length - 1; i >= 0; i--) {
      const z = container.children[i];
      z._age += ticker.deltaMS;
      z.y -= ticker.deltaMS * 0.03; // drift up
      z.alpha = Math.max(0, 1 - z._age / 1200);
      if (z._age >= 1200) {
        z.destroy();
      }
    }
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

function spawnZParticle(sprite, container) {
  const parentX = sprite.parent?.x || 0;
  const parentY = sprite.parent?.y || 0;
  const z = new Text({
    text: 'Z',
    style: {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: '#5C6BC0',
      fontWeight: 'bold',
    },
  });
  z.anchor.set(0.5);
  z.x = parentX + sprite.x + (Math.random() - 0.5) * 20;
  z.y = parentY + sprite.y - 25;
  z._age = 0;
  container.addChild(z);
}

// --- Stun: 3 gold stars circling above creature ---

function startStunOngoing(sprite, entry, app, layers) {
  const container = new Container();
  layers.effects.addChild(container);
  entry.container = container;

  const stars = [];
  for (let i = 0; i < 3; i++) {
    const star = new Text({
      text: '\u2605',
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
        fill: '#FFD700',
      },
    });
    star.anchor.set(0.5);
    stars.push(star);
    container.addChild(star);
  }

  let elapsed = 0;
  const RADIUS = 15;
  const SPEED = 0.003; // radians per ms

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    const cx = parentX + sprite.x;
    const cy = parentY + sprite.y - 35; // above the creature

    for (let i = 0; i < stars.length; i++) {
      const angle = elapsed * SPEED + (i * Math.PI * 2) / 3;
      stars[i].x = cx + Math.cos(angle) * RADIUS;
      stars[i].y = cy + Math.sin(angle) * RADIUS * 0.5; // elliptical
    }
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

// --- Confuse: sprite rotation wobbles (sin wave, +/-0.15 rad) ---

function startConfuseOngoing(sprite, entry, app) {
  let elapsed = 0;
  const WOBBLE_SPEED = 0.005; // radians per ms -> ~3Hz

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    sprite.rotation = Math.sin(elapsed * WOBBLE_SPEED) * 0.15;
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

// --- Haste: blue tint shimmer toggling every 200ms ---

function startHasteOngoing(sprite, entry, app) {
  let elapsed = 0;
  let tinted = false;
  // Store original tint to restore
  entry._originalTint = sprite.tint;

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    if (elapsed >= 200) {
      elapsed -= 200;
      tinted = !tinted;
      sprite.tint = tinted ? 0x29B6F6 : (entry._originalTint ?? 0xFFFFFF);
    }
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

// --- Shield / team_shield: blue circle outline pulsing alpha ---

function startShieldOngoing(sprite, entry, app, layers) {
  const container = new Container();
  layers.effects.addChild(container);
  entry.container = container;

  const circle = new Graphics();
  circle.circle(0, 0, 35);
  circle.stroke({ color: 0x42A5F5, width: 2 });
  container.addChild(circle);

  let elapsed = 0;
  const PULSE_SPEED = 0.004; // moderate pulse

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    circle.x = parentX + sprite.x;
    circle.y = parentY + sprite.y;
    circle.alpha = 0.4 + 0.4 * Math.sin(elapsed * PULSE_SPEED);
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

// --- Taunt: red circle outline pulsing alpha (faster than shield) ---

function startTauntOngoing(sprite, entry, app, layers) {
  const container = new Container();
  layers.effects.addChild(container);
  entry.container = container;

  const circle = new Graphics();
  circle.circle(0, 0, 35);
  circle.stroke({ color: 0xEF5350, width: 2 });
  container.addChild(circle);

  let elapsed = 0;
  const PULSE_SPEED = 0.008; // faster than shield

  const onTick = (ticker) => {
    elapsed += ticker.deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    circle.x = parentX + sprite.x;
    circle.y = parentY + sprite.y;
    circle.alpha = 0.4 + 0.4 * Math.sin(elapsed * PULSE_SPEED);
  };

  app.ticker.add(onTick);
  entry.tickerId = onTick;
}

// ============ CLEAR VFX ============

/**
 * Remove ongoing VFX for one effect on one creature.
 * Restores sprite properties (alpha, rotation, tint) as needed.
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @param {string} effectType
 */
export function clearStatusVfx(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  const map = ongoingVfx.get(sprite);
  if (!map || !map[effectType]) return;

  const { app } = getStage();
  const entry = map[effectType];

  // Remove ticker callback
  if (entry.tickerId && app) {
    app.ticker.remove(entry.tickerId);
  }

  // Destroy container and children
  if (entry.container) {
    entry.container.destroy({ children: true });
  }

  // Restore sprite properties per effect type
  switch (effectType) {
    case 'sleep':
      sprite.alpha = 1.0;
      break;
    case 'confuse':
      sprite.rotation = 0;
      break;
    case 'haste':
      sprite.tint = entry._originalTint ?? 0xFFFFFF;
      break;
  }

  delete map[effectType];
}

/**
 * Remove ALL ongoing status VFX across all creatures.
 * Call at combat end to ensure clean state.
 */
export function clearAllStatusVfx() {
  const { app } = getStage();

  for (const [sprite, map] of ongoingVfx) {
    for (const effectType of Object.keys(map)) {
      const entry = map[effectType];

      if (entry.tickerId && app) {
        app.ticker.remove(entry.tickerId);
      }

      if (entry.container) {
        entry.container.destroy({ children: true });
      }

      // Restore sprite properties
      switch (effectType) {
        case 'sleep':
          if (!sprite.destroyed) sprite.alpha = 1.0;
          break;
        case 'confuse':
          if (!sprite.destroyed) sprite.rotation = 0;
          break;
        case 'haste':
          if (!sprite.destroyed) sprite.tint = entry._originalTint ?? 0xFFFFFF;
          break;
      }
    }
  }

  ongoingVfx.clear();
}
