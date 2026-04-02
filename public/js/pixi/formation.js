/**
 * @file formation.js — Creature sprite positioning + walking animation
 *
 * Renders creature formations (player and enemy) as PixiJS Sprites.
 * Handles diagonal stagger, depth scaling, walking wobble, and state transitions.
 * Enter-from-right: set sprite._entering = true and sprite._enterTarget to target x;
 * the ticker eases sprite.x toward _enterTarget, then clears _entering and updates baseX.
 */

import { Sprite, Assets, Container, Texture } from 'pixi.js';
import { getStage } from './battle-stage.js';

const DEPTH_SCALES = [0.9, 0.95, 1.0]; // back, mid, front
const PLAYER_STAGGER_X = [12, 24, 36]; // px offset per row
const ENEMY_STAGGER_X = [-12, -24, -36]; // mirrored

let playerContainer = null;
let enemyContainer = null;
/** @type {{ player: import('pixi.js').Sprite[], enemy: import('pixi.js').Sprite[] }} */
let creatureSprites = { player: [], enemy: [] };
/** Last showFormation args per side — used by resizeFormations to re-layout */
let lastFormationInput = { player: null, enemy: null };

let walkingEnabled = false;
let walkTime = 0;
/** Per-side request counter to invalidate stale async loads. */
let loadRequestId = { player: 0, enemy: 0 };

function sameFormation(prev, creatures, isBoss) {
  if (!prev || !Array.isArray(prev.creatures)) return false;
  if (!!prev.opts?.isBoss !== !!isBoss) return false;
  if (prev.creatures.length !== creatures.length) return false;
  for (let i = 0; i < creatures.length; i++) {
    const a = prev.creatures[i];
    const b = creatures[i];
    if ((a?.id || '') !== (b?.id || '')) return false;
    const aHp = a?.currentHp ?? a?.hp ?? null;
    const bHp = b?.currentHp ?? b?.hp ?? null;
    if (aHp !== bHp) return false;
  }
  return true;
}

/**
 * Initialize formation containers. Called once from battle-stage init.
 */
export function initFormations() {
  const { layers } = getStage();
  if (!layers.creatures) return;
  if (playerContainer && playerContainer.parent) return;

  playerContainer = new Container();
  enemyContainer = new Container();
  layers.creatures.addChild(playerContainer);
  layers.creatures.addChild(enemyContainer);
}

/**
 * Render a formation of creatures.
 * @param {'player'|'enemy'} side
 * @param {Array} creatures - array of 1-3 creature objects
 * @param {{ isBoss?: boolean, skipEnter?: boolean }} opts
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
    return;
  }

  // Bump request counter to invalidate any in-flight async loads for this side.
  const requestId = ++loadRequestId[side];

  lastFormationInput[side] = {
    creatures: normalizedCreatures,
    opts: { isBoss, skipEnter },
  };

  const sprites = creatureSprites[side];

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

  // Base X position: player on left third, enemy on right third
  const baseX = side === 'player' ? screenW * 0.25 : screenW * 0.75;

  for (let i = 0; i < slots.length; i++) {
    const creature = slots[i];
    if (!creature) continue;

    const spritePath =
      creature.spriteImg || `/assets/sprites/creatures/${creature.id}.webp`;
    let texture;
    try {
      texture = await Assets.load(spritePath);
    } catch {
      texture = Texture.WHITE;
    }

    // A newer showFormation call for this side superseded us — bail out.
    if (requestId !== loadRequestId[side]) return;

    const tw = texture.width || 1;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = spriteSize;
    sprite.height = spriteSize;

    // Position: staggered diagonally
    const rowY = screenH * 0.3 + i * screenH * 0.2;
    const targetX = baseX + staggerX[i];
    sprite.y = rowY;

    // Depth scaling (matches plan: uniform scale from spriteSize / texture.width × row depth)
    sprite.scale.set(DEPTH_SCALES[i] * (spriteSize / tw));
    if (side === 'enemy') {
      sprite.scale.x *= -1;
    }

    // Enemy: enter from offscreen right (resize replays use skipEnter to snap)
    if (side === 'enemy' && !skipEnter) {
      sprite._enterTarget = targetX;
      sprite._entering = true;
      sprite.x = screenW + spriteSize * 2;
      sprite.baseX = targetX;
    } else {
      sprite.x = targetX;
      sprite.baseX = targetX;
      sprite._entering = false;
    }

    // Store base position for walking animation
    sprite.baseY = sprite.y;
    sprite.phaseOffset = Math.random() * Math.PI * 2;
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
  // Keep resize replay from resurrecting a side that was explicitly hidden.
  lastFormationInput[side] = null;
}

/**
 * Enable/disable walking wobble.
 * @param {boolean} enabled
 */
export function setWalking(enabled) {
  walkingEnabled = !!enabled;
}

/**
 * Get a creature sprite by side and dense display order index (0..n-1).
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @returns {Sprite|null}
 */
export function getCreatureSprite(side, index) {
  return creatureSprites[side]?.[index] || null;
}

/**
 * Ticker update — enter animation and walking wobble.
 * @param {number} delta - PixiJS ticker deltaTime
 */
export function updateFormations(delta) {
  walkTime += delta * 0.05;

  for (const side of ['player', 'enemy']) {
    for (const sprite of creatureSprites[side]) {
      if (sprite._entering) {
        const target = sprite._enterTarget ?? sprite.baseX;
        sprite.x += (target - sprite.x) * 0.1;
        if (Math.abs(sprite.x - target) < 1) {
          sprite.x = target;
          sprite.baseX = target;
          sprite._entering = false;
        }
        continue;
      }

      if (!walkingEnabled) continue;

      const t = walkTime + sprite.phaseOffset;
      sprite.y = sprite.baseY + Math.sin(t * 3) * 2;
      sprite.rotation = Math.sin(t * 2.5) * 0.08;
    }
  }
}

/**
 * Reposition formations after resize (uses lastFormationInput).
 * @param {number} [_width]
 * @param {number} [_height]
 */
export async function resizeFormations(_width, _height) {
  if (lastFormationInput.player) {
    await showFormation(
      'player',
      lastFormationInput.player.creatures,
      { ...lastFormationInput.player.opts, skipEnter: true },
    );
  }
  if (lastFormationInput.enemy) {
    await showFormation(
      'enemy',
      lastFormationInput.enemy.creatures,
      { ...lastFormationInput.enemy.opts, skipEnter: true },
    );
  }
}
