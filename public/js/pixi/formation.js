/**
 * @file formation.js — Creature sprite positioning + walking animation
 *
 * Renders creature formations (player and enemy) as PixiJS Sprites.
 * Handles diagonal stagger, depth scaling, walking wobble, and state transitions.
 */

import { Sprite, Assets, Container, Texture, Graphics } from 'pixi.js';
import { getStage } from './battle-stage.js';
import { tween } from './tween.js';

const DEPTH_SCALES = [0.9, 0.95, 1.0]; // back, mid, front
const PLAYER_STAGGER_X = [12, 24, 36]; // px offset per row
const ENEMY_STAGGER_X = [-12, -24, -36]; // mirrored

let playerContainer = null;
let enemyContainer = null;
let creatureSprites = { player: [], enemy: [] };
let lastFormationInput = { player: null, enemy: null };
let walkingEnabled = false;
let walkTime = 0;
let activeGlow = null;
let activeGlowTickFn = null;

/** Per-side request counter to invalidate stale async loads. */
let loadRequestId = { player: 0, enemy: 0 };

/** NPC sprite displayed on the creatures layer (non-combat NPCs) */
let npcSprite = null;

function sameFormation(prev, creatures, isBoss) {
  if (!prev || !Array.isArray(prev.creatures)) return false;
  if (!!prev.opts?.isBoss !== !!isBoss) return false;
  if (prev.creatures.length !== creatures.length) return false;
  for (let i = 0; i < creatures.length; i++) {
    const a = prev.creatures[i];
    const b = creatures[i];
    if ((a?.id || '') !== (b?.id || '')) return false;
  }
  return true;
}

/**
 * Initialize formation containers. Called once from battle-stage init.
 */
export function initFormations() {
  const { layers } = getStage();
  if (!layers.creatures) return;

  playerContainer = new Container();
  enemyContainer = new Container();
  layers.creatures.addChild(playerContainer);
  layers.creatures.addChild(enemyContainer);
}

/**
 * Render a formation of creatures.
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 * @param {{ isBoss?: boolean }} opts
 */
export async function showFormation(side, creatures, { isBoss = false, skipEnter = false } = {}) {
  const { app } = getStage();
  if (!app) return;

  const container = side === 'player' ? playerContainer : enemyContainer;
  if (!container) return;
  const normalizedCreatures = Array.isArray(creatures) ? [...creatures] : [];

  if (
    sameFormation(lastFormationInput[side], normalizedCreatures, isBoss) &&
    creatureSprites[side].length > 0
  ) {
    // Same creatures by ID — update KO state (alpha/tint) in-place without rebuild.
    // Matches scene.js dedup which updates HP bars in-place.
    for (const sprite of creatureSprites[side]) {
      const c = sprite.creatureData;
      const match = normalizedCreatures.find(nc => (nc?.id || '') === (c?.id || ''));
      if (match) {
        const hp = match.currentHp ?? match.hp ?? 1;
        if (hp <= 0) {
          sprite.alpha = 0.3;
          sprite.tint = 0x888888;
        } else {
          sprite.alpha = 1;
          sprite.tint = 0xFFFFFF;
        }
        sprite.creatureData = match;
      }
    }
    lastFormationInput[side] = { creatures: normalizedCreatures, opts: { isBoss, skipEnter } };
    return;
  }

  const requestId = ++loadRequestId[side];

  lastFormationInput[side] = {
    creatures: normalizedCreatures,
    opts: { isBoss, skipEnter },
  };

  const sprites = creatureSprites[side];
  const hadSprites = sprites.length > 0;

  // Clear existing
  container.removeChildren();
  sprites.length = 0;

  if (!creatures || creatures.length === 0) return;

  // Slot placement: 1->middle, 2->top+bottom, 3->all three
  let slots;
  if (creatures.length === 1) {
    slots = [null, creatures[0], null];
  } else if (creatures.length === 2) {
    slots = [creatures[0], null, creatures[1]];
  } else {
    slots = [creatures[0], creatures[1], creatures[2]];
  }

  const staggerX = side === 'player' ? PLAYER_STAGGER_X : ENEMY_STAGGER_X;
  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const spriteSize = isBoss ? 120 : 60;

  // Read DOM anchor positions so Pixi sprites align with their HUD name bars
  const sceneArea = document.getElementById('scene-area');
  const sceneRect = sceneArea?.getBoundingClientRect();
  const formationSel = side === 'player' ? '.player-formation' : '.enemy-formation';

  // Fallback base X (only used if DOM anchors are missing)
  const baseX = side === 'player' ? screenW * 0.25 : screenW * 0.75;

  for (let i = 0; i < slots.length; i++) {
    const creature = slots[i];
    if (!creature) continue;

    const dataIndex = creatures.indexOf(creature);

    // Load sprite texture
    const spritePath = creature.spriteImg || `/assets/sprites/creatures/${creature.id}.webp`;
    let texture;
    try {
      texture = await Assets.load(spritePath);
    } catch {
      texture = Texture.WHITE; // Fallback — will show as white square
    }

    if (requestId !== loadRequestId[side]) return;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = spriteSize;
    sprite.height = spriteSize;

    // Position from DOM anchor (centered above name bar), fallback to percentage
    let targetX, targetY;
    const anchorEl = sceneRect && document.querySelector(
      `${formationSel} .formation-slot[data-index="${dataIndex}"] .formation-sprite--pixi-anchor`
    );

    if (anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect();
      targetX = anchorRect.left + anchorRect.width / 2 - sceneRect.left;
      targetY = anchorRect.top + anchorRect.height / 2 - sceneRect.top;
    } else {
      targetX = baseX + staggerX[i];
      targetY = (screenH * 0.3) + (i * screenH * 0.2);
    }

    sprite.y = targetY;

    if (side === 'enemy' && !skipEnter && !hadSprites) {
      sprite._enterTarget = targetX;
      sprite._entering = true;
      sprite.x = screenW + spriteSize * 2;
      sprite.baseX = targetX;
    } else {
      sprite.x = targetX;
      sprite.baseX = targetX;
      sprite._entering = false;
    }

    // Depth scaling
    sprite.scale.set(DEPTH_SCALES[i] * (spriteSize / texture.width));

    // Flip enemy sprites
    if (side === 'enemy') {
      sprite.scale.x *= -1;
    }

    // Store base position for walking animation
    sprite.baseY = sprite.y;
    sprite.phaseOffset = Math.random() * Math.PI * 2; // Random phase so they don't sync
    sprite.creatureData = creature;

    // KO state
    if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
      sprite.alpha = 0.3;
      sprite.tint = 0x888888;
    }

    container.addChild(sprite);
    sprites.push(sprite);
  }
}

/**
 * Hide a formation.
 * @param {'player'|'enemy'} side
 */
export function hideFormation(side) {
  const container = side === 'player' ? playerContainer : enemyContainer;
  if (container) container.removeChildren();
  creatureSprites[side].length = 0;
  lastFormationInput[side] = null;
}

/**
 * Enable/disable walking wobble.
 */
export function setWalking(enabled) {
  walkingEnabled = enabled;
}

/**
 * Get a creature sprite by side and index (for targeting effects).
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @returns {Sprite|null}
 */
export function getCreatureSprite(side, index) {
  return creatureSprites[side]?.[index] || null;
}

/**
 * Show a pulsing glow outline on the active player creature during move selection.
 * @param {number} index - creature index in the player formation
 */
export function showActiveGlow(index) {
  clearActiveGlow();
  const sprite = getCreatureSprite('player', index);
  const { app, layers } = getStage();
  if (!sprite || !app) return;

  activeGlow = new Graphics();
  activeGlow.circle(0, 0, 38).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
  activeGlow.x = sprite.x;
  activeGlow.y = sprite.y;
  layers.effects.addChild(activeGlow);

  activeGlowTickFn = () => {
    const sprite = getCreatureSprite('player', index);
    if (sprite && activeGlow) {
      activeGlow.x = sprite.x;
      activeGlow.y = sprite.y;
    }
    activeGlow.alpha = 0.3 + 0.3 * Math.sin(Date.now() / 400);
  };
  app.ticker.add(activeGlowTickFn);
}

/**
 * Remove the active creature glow.
 */
export function clearActiveGlow() {
  if (activeGlow) {
    activeGlow.destroy();
    activeGlow = null;
  }
  if (activeGlowTickFn) {
    const { app } = getStage();
    app?.ticker.remove(activeGlowTickFn);
    activeGlowTickFn = null;
  }
}

/**
 * Show an NPC sprite on the enemy side of the canvas.
 * @param {string} spritePath - Path to the NPC sprite image
 * @param {{ slideIn?: boolean }} opts
 */
export async function showNpcSprite(spritePath, { slideIn = false } = {}) {
  const { app } = getStage();
  if (!app) return;
  const container = enemyContainer;
  if (!container) return;

  hideNpcSprite();

  let texture;
  try {
    texture = await Assets.load(spritePath);
  } catch {
    texture = Texture.WHITE;
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = 80;
  sprite.height = 80;
  sprite.scale.x *= -1; // Face left (same as enemy creatures)
  sprite.y = screenH * 0.5;

  if (slideIn) {
    sprite.x = screenW + 80;
    container.addChild(sprite);
    npcSprite = sprite;
    await tween(sprite, { x: screenW * 0.7 }, { duration: 400, ease: 'easeOut' });
  } else {
    sprite.x = screenW * 0.7;
    container.addChild(sprite);
    npcSprite = sprite;
  }
}

/**
 * Hide the NPC sprite, optionally sliding it out to the right.
 * @param {{ slideOut?: boolean }} opts
 */
export async function hideNpcSprite({ slideOut = false } = {}) {
  if (!npcSprite) return;
  if (slideOut) {
    const { app } = getStage();
    const screenW = app?.screen.width || 400;
    await tween(npcSprite, { x: screenW + 80 }, { duration: 300, ease: 'easeIn' });
  }
  if (npcSprite) {
    npcSprite.destroy();
    npcSprite = null;
  }
}

/**
 * Ticker update — walking wobble animation.
 * @param {number} delta - PixiJS ticker deltaTime
 */
export function updateFormations(delta) {
  walkTime += delta * 0.05;

  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (sprite._entering) {
        sprite.x += (sprite._enterTarget - sprite.x) * 0.1;
        if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
          sprite.x = sprite._enterTarget;
          sprite.baseX = sprite._enterTarget;
          sprite._entering = false;
        }
        continue;
      }
      if (!walkingEnabled) continue;
      const t = walkTime + sprite.phaseOffset;
      // Bounce: 2px amplitude
      sprite.y = sprite.baseY + Math.sin(t * 3) * 2;
      // Rotation wobble: ~4.5 degrees
      sprite.rotation = Math.sin(t * 2.5) * 0.08;
    }
  }
}

/**
 * Animate a creature being knocked out.
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateKO(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  // Lazy import to avoid circular dependency (formation <- effects <- battle-stage <- formation)
  const { burstParticles } = await import('./effects.js');

  sprite.tint = 0x888888;
  const targetScaleX = sprite.scale.x * 0.5;
  const targetScaleY = sprite.scale.y * 0.5;
  await Promise.all([
    tween(sprite, { alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(sprite.scale, { x: targetScaleX, y: targetScaleY }, { duration: 600, ease: 'easeIn' }),
  ]);

  burstParticles(pos, { count: 8, color: 0xFFFFFF, speed: 60, life: 500, element: 'neutral' });
}

/**
 * Animate a creature leveling up.
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateLevelUp(side, index) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  const { burstParticles, screenFlash } = await import('./effects.js');

  burstParticles({ x: pos.x, y: pos.y + 10 }, { count: 15, color: 0xFFD700, speed: 100, life: 800, element: 'fire' });
  screenFlash({ color: 0xFFD700, duration: 150 });
}

/**
 * Reposition formations after resize.
 */
export async function resizeFormations(width, height) {
  // Re-render active formations so iOS Safari address-bar resize/orientation
  // keeps sprite coordinates aligned with the new viewport.
  const playerInput = lastFormationInput.player;
  const enemyInput = lastFormationInput.enemy;
  // Clear cache so sameFormation() doesn't skip the re-render
  lastFormationInput.player = null;
  lastFormationInput.enemy = null;
  if (playerInput) {
    await showFormation('player', playerInput.creatures, { ...playerInput.opts, skipEnter: true });
  }
  if (enemyInput) {
    await showFormation('enemy', enemyInput.creatures, { ...enemyInput.opts, skipEnter: true });
  }
}
