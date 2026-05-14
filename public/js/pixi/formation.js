import { Sprite, Container, Texture, Graphics, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { getApp } from './app.js';
import { loadImageTexture } from './image-loader.js';
import { tween } from './tween.js';
import { STATUS_ICON_CONFIG } from '../ui/event-popup.js';
import { creatureIdleUrl, creatureStaticUrl } from '../assets/asset-urls.js';
import {
  getAnimatedCreatureEntry,
  getCreatureAnimationManifestSnapshot,
  loadCreatureAnimationManifest,
} from './creature-animation-manifest.js';
import {
  getAnimatedNpcEntry,
  loadNpcAnimationManifest,
} from './npc-animation-manifest.js';
import {
  applyAnimationKind,
  createAnimatedCreatureState,
  tickAnimatedCreatureSprite,
} from './animated-creature-sprite.js';
import {
  getBattlefieldSlot,
  getBattlefieldSpriteScale,
  getBattlefieldShadowSpec,
} from './battlefield-layout.js';

const BATTLEFIELD_SLOT_COUNT = 3;
const FORMATION_SPRITE_SIZE = 60;
const BOSS_BATTLE_SCALE = 1.5;

const LABEL_FONT_SIZE = 9;
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 2;
const LABEL_GAP = 3;
const LABEL_SIDE_OFFSET = 50;
const NPC_BASE_SPRITE_SIZE = 170;
const NPC_BATTLEFIELD_ROW_INDEX = 1;

const STAT_STAGE_NAMES = { atk: 'ATK', def: 'DEF' };

// Active-creature glow (spec: 2026-04-23-active-creature-golden-glow-design.md)
const GLOW_COLOR = 0xFFC94A;
const GLOW_DISTANCE = 14;
const GLOW_MIN_STRENGTH = 2.4;
const GLOW_MAX_STRENGTH = 5.6;
const GLOW_QUALITY = 0.2;
const GLOW_PERIOD_MS = 2000;

// --- Context (scene-owned only) ----------------------------------------------
//
// Formation state lives in a per-scene context. Task 18 removed the legacy
// `_defaultCtx` singleton and its thin-wrapper exports — all rendering now
// goes through scene-aware APIs (spawn/update/removeFormationSprite,
// *ForScene wrappers, spawn/removeNpcSprite). Scenes allocate a ctx via
// `createFormationContext(scene)`; there is no module-scoped fallback.
//
// Storage: `creatureSprites[side]` is Map<uid, Sprite>. BattleScene._diff
// provides uids for every creature it spawns.

function _newContext(scene) {
  return {
    scene,
    playerContainer: null,
    enemyContainer: null,
    creatureSprites: { player: new Map(), enemy: new Map() },  // uid -> Sprite
    lastFormationInput: { player: null, enemy: null },         // { creatures, opts } per side
    walkingEnabled: false,
    walkTime: 0,
    travelOffsetX: 0,
    activeGlow: null,
    activeGlowTickFn: null,
    loadRequestId: { player: 0, enemy: 0 },
    npcSprite: null,
  };
}

/**
 * Create a per-scene formation context. The scene's `layers.formations`
 * container becomes the parent for both player and enemy sub-containers.
 * @param {import('../scenes/scene.js').Scene} scene
 * @returns {object} a formation context for use with the ctx-based API
 */
export function createFormationContext(scene) {
  if (!scene) {
    throw new Error('createFormationContext: scene is required');
  }
  if (!scene.layers?.formations) {
    throw new Error('createFormationContext: scene.layers.formations is required');
  }
  const ctx = _newContext(scene);
  ctx.playerContainer = scene.addContainer(new Container(), scene.layers.formations);
  ctx.enemyContainer  = scene.addContainer(new Container(), scene.layers.formations);
  return ctx;
}

// --- Utility helpers ----------------------------------------------------------

function createPill(label, bg, textColor) {
  const container = new Container();

  const text = new Text({
    text: label,
    style: {
      fontFamily: 'monospace',
      fontSize: LABEL_FONT_SIZE,
      fill: textColor,
      fontWeight: 'bold',
    },
  });
  text.anchor.set(0.5);

  const w = text.width + LABEL_PADDING_X * 2;
  const h = text.height + LABEL_PADDING_Y * 2;

  const bgGfx = new Graphics();
  bgGfx.roundRect(-w / 2, -h / 2, w, h, 4);
  bgGfx.fill(bg);

  container.addChild(bgGfx);
  container.addChild(text);

  return container;
}

/** Remove the hidden class from a formation info box so it fades in. */
function revealFormationInfo(side, dataIndex) {
  const sel = side === 'player' ? '.player-formation' : '.enemy-formation';
  const info = document.querySelector(
    `${sel} .formation-slot[data-index="${dataIndex}"] .formation-info`
  );
  if (info) info.classList.remove('formation-info--hidden');
}

function _sideContainer(ctx, side) {
  return side === 'player' ? ctx.playerContainer : ctx.enemyContainer;
}

/** Iterate sprites in a side as an array (for legacy-style loops). */
function _spritesArray(ctx, side) {
  return Array.from(ctx.creatureSprites[side].values());
}

function _clampSlotIndex(slotI) {
  return Math.min(Math.max(slotI, 0), BATTLEFIELD_SLOT_COUNT - 1);
}

function _destroyShadow(sprite) {
  if (!sprite?._shadow) return;
  if (sprite._shadow.parent) sprite._shadow.parent.removeChild(sprite._shadow);
  sprite._shadow.destroy({ children: true });
  sprite._shadow = null;
}

function _drawShadow(shadow, shadowSpec) {
  if (shadow.ellipse) {
    shadow.ellipse(0, 0, shadowSpec.width / 2, shadowSpec.height / 2);
  } else {
    shadow.circle(0, 0, shadowSpec.width / 2);
    if (shadow.scale) shadow.scale.y = shadowSpec.height / shadowSpec.width;
  }
  shadow.fill({ color: 0x000000, alpha: shadowSpec.alpha });
}

function _scaledShadowSpec(shadowSpec, scale = 1) {
  return {
    ...shadowSpec,
    width: shadowSpec.width * scale,
    height: shadowSpec.height * scale,
  };
}

const ANIMATED_SHADOW_Y_OFFSET_BY_SLOT = [23, 19, 28];

function _shadowYForSprite(sprite, fallbackSpriteSize) {
  const textureHeight = sprite?._animatedCreature?.entry?.frameHeight || sprite?.texture?.height || fallbackSpriteSize;
  const scaledHeight = textureHeight * Math.abs(sprite?.scale?.y || 1);
  const offsetRatio = sprite?._slotI === 1 ? 0.38 : 0.5;
  const animatedOffset = sprite?._animatedCreature
    ? (ANIMATED_SHADOW_Y_OFFSET_BY_SLOT[sprite?._slotI] || 0)
    : 0;
  return sprite.baseY + scaledHeight * offsetRatio - animatedOffset;
}

function _spriteTextureWidth(sprite) {
  return sprite?._animatedCreature?.entry?.frameWidth || sprite?.texture?.width || 0;
}

function _npcIdFromSpritePath(spritePath) {
  if (!spritePath || typeof spritePath !== 'string') return null;
  let pathname = spritePath;
  try {
    pathname = new URL(spritePath, 'https://koto.local').pathname;
  } catch {
    pathname = spritePath.split('?')[0].split('#')[0];
  }
  const fileName = pathname.split('/').filter(Boolean).pop();
  if (!fileName) return null;
  return decodeURIComponent(fileName).replace(/\.(webp|png|jpg|jpeg)$/i, '');
}

// --- Status label rendering (ctx-based) --------------------------------------

function _syncPixiStatusLabels(ctx, side, index, keys, statStages) {
  const { layers } = getApp();
  if (!layers.labels) return;

  const sprite = _getCreatureSprite(ctx, side, index);
  if (!sprite) return;

  // Clear existing labels for this sprite
  if (sprite.statusLabels) {
    for (const pill of sprite.statusLabels) {
      pill.destroy({ children: true });
    }
  }
  sprite.statusLabels = [];

  if (!keys || keys.length === 0) return;

  // Build pills from keys
  const pills = [];
  for (const key of keys) {
    const config = STATUS_ICON_CONFIG[key];
    if (!config) continue;

    let label;
    if (key === 'atk_up' || key === 'atk_down') {
      const val = statStages?.atk || 0;
      label = `${STAT_STAGE_NAMES.atk} ${val > 0 ? '+' : ''}${val}`;
    } else if (key === 'def_up' || key === 'def_down') {
      const val = statStages?.def || 0;
      label = `${STAT_STAGE_NAMES.def} ${val > 0 ? '+' : ''}${val}`;
    } else {
      label = config.label;
    }

    const pill = createPill(label, config.bg, config.text);
    pills.push(pill);
    layers.labels.addChild(pill);
  }

  if (pills.length === 0) return;

  // Position pills stacked vertically beside the sprite
  const pillHeight = pills[0].height;
  const totalHeight = pills.length * pillHeight + LABEL_GAP * (pills.length - 1);
  const startY = sprite.baseY - totalHeight / 2;
  const xOffset = side === 'player' ? -LABEL_SIDE_OFFSET : LABEL_SIDE_OFFSET;

  for (let i = 0; i < pills.length; i++) {
    pills[i].x = sprite.baseX + xOffset;
    pills[i].y = startY + i * (pillHeight + LABEL_GAP);
  }

  sprite.statusLabels = pills;
}

// --- Sprite lookup / active glow (ctx-based) ---------------------------------

/**
 * Resolve a (side, index) pair to a sprite via lastFormationInput bridge.
 * The creatures array submitted to showFormation is retained on the ctx so
 * uid-keyed storage can still answer legacy index-based queries.
 */
function _getCreatureSprite(ctx, side, index) {
  const input = ctx.lastFormationInput[side];
  const creatures = input?.creatures;
  if (!creatures || !creatures[index]) return null;
  const c = creatures[index];
  const key = c.uid ?? `__idx_${index}_${c.id || ''}`;
  return ctx.creatureSprites[side].get(key) || null;
}

function _showActiveGlow(ctx, index) {
  _clearActiveGlow(ctx);
  const sprite = _getCreatureSprite(ctx, 'player', index);
  const { app } = getApp();
  if (!sprite || !app) return;

  const filter = new GlowFilter({
    distance: GLOW_DISTANCE,
    color: GLOW_COLOR,
    outerStrength: GLOW_MIN_STRENGTH,
    innerStrength: 0,
    quality: GLOW_QUALITY,
    alpha: 1,
  });
  sprite.filters = [filter];

  ctx.activeGlow = { sprite, filter };

  ctx.activeGlowTickFn = () => {
    if (!sprite || sprite.destroyed) return;
    const t = 0.5 + 0.5 * Math.sin((Date.now() / GLOW_PERIOD_MS) * 2 * Math.PI);
    filter.outerStrength =
      GLOW_MIN_STRENGTH + t * (GLOW_MAX_STRENGTH - GLOW_MIN_STRENGTH);
  };
  app.ticker.add(ctx.activeGlowTickFn);
}

function _clearActiveGlow(ctx) {
  const g = ctx.activeGlow;
  if (g?.sprite && !g.sprite.destroyed) {
    g.sprite.filters = [];
  }
  if (g?.filter) {
    g.filter.destroy();
  }
  ctx.activeGlow = null;
  if (ctx.activeGlowTickFn) {
    const { app } = getApp();
    app?.ticker.remove(ctx.activeGlowTickFn);
    ctx.activeGlowTickFn = null;
  }
}

// --- Walking + per-frame update (ctx-based) ----------------------------------

export function setFormationTravelOffset(ctx, offsetX = 0) {
  if (!ctx?.creatureSprites?.player) return;
  ctx.travelOffsetX = offsetX;

  for (const sprite of _spritesArray(ctx, 'player')) {
    if (!sprite || sprite._entering) continue;
    const previousOffset = sprite._travelOffsetX || 0;
    const delta = offsetX - previousOffset;
    sprite.x = sprite.baseX + offsetX;
    if (sprite._shadow) sprite._shadow.x += delta;
    if (Array.isArray(sprite.statusLabels)) {
      for (const label of sprite.statusLabels) {
        label.x += delta;
      }
    }
    sprite._travelOffsetX = offsetX;
  }
}

/**
 * Tick walking wobble / enter-slide animations for a ctx. Exported so
 * BattleScene / ExplorationScene can register it as a per-frame updater via
 * scene.addUpdater. Scenes flip `ctx.walkingEnabled` directly.
 */
export function _updateFormations(ctx, delta) {
  ctx.walkTime += delta * 0.05;
  const deltaMS = typeof delta === 'number' ? delta * 16.6667 : 16.6667;

  for (const side of ['player', 'enemy']) {
    for (const sprite of _spritesArray(ctx, side)) {
      if (sprite._entering) {
        if (sprite._animatedCreature) {
          tickAnimatedCreatureSprite(sprite, sprite._animatedCreature, deltaMS, true);
        }
        sprite.x += (sprite._enterTarget - sprite.x) * 0.1;
        if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
          sprite.x = sprite._enterTarget;
          sprite.baseX = sprite._enterTarget;
          sprite._entering = false;
          revealFormationInfo(sprite._side, sprite._dataIndex);
        }
        continue;
      }
      if (sprite._animatedCreature) {
        tickAnimatedCreatureSprite(sprite, sprite._animatedCreature, deltaMS, !!ctx.walkingEnabled);
        sprite.y = sprite.baseY;
        sprite.rotation = 0;
        continue;
      }
      if (!ctx.walkingEnabled) continue;
      const t = ctx.walkTime + sprite.phaseOffset;
      // Bounce: 2px amplitude
      sprite.y = sprite.baseY + Math.sin(t * 3) * 2;
      // Rotation wobble: ~4.5 degrees
      sprite.rotation = Math.sin(t * 2.5) * 0.08;
    }
  }
}

// --- KO / level-up animations (ctx-based) ------------------------------------

async function _animateKO(ctx, side, index) {
  const sprite = _getCreatureSprite(ctx, side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  // Lazy import to avoid circular dependency (formation <- effects <- battle-stage <- formation)
  const { burstParticles } = await import('./effects.js');

  sprite.tint = 0x888888;
  const targetScaleX = sprite.scale.x * 0.5;
  const targetScaleY = sprite.scale.y * 0.5;
  const tweens = [
    tween(sprite, { alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(sprite.scale, { x: targetScaleX, y: targetScaleY }, { duration: 600, ease: 'easeIn' }),
  ];
  if (sprite._shadow) {
    tweens.push(tween(sprite._shadow, { alpha: 0 }, { duration: 600, ease: 'easeOut' }));
  }
  await Promise.all(tweens);

  burstParticles(pos, { count: 8, color: 0xFFFFFF, speed: 60, life: 500, element: 'neutral' });
}

async function _animateLevelUp(ctx, side, index) {
  const sprite = _getCreatureSprite(ctx, side, index);
  if (!sprite) return;
  const pos = { x: sprite.x, y: sprite.y };

  const { burstParticles, screenFlash } = await import('./effects.js');

  burstParticles({ x: pos.x, y: pos.y + 10 }, { count: 15, color: 0xFFD700, speed: 100, life: 800, element: 'fire' });
  screenFlash({ color: 0xFFD700, duration: 150 });
}

// --- New scene-oriented API --------------------------------------------------

async function loadCreatureBaseTexture(creature) {
  try {
    return await loadImageTexture(creature.spriteImg || creatureIdleUrl(creature.id));
  } catch {
    try {
      return await loadImageTexture(creatureStaticUrl(creature.id));
    } catch {
      return Texture.WHITE;
    }
  }
}

/**
 * Spawn a single creature sprite into `ctx` and register it by uid.
 *
 * Exported for scene-based callers (BattleScene.syncCreatures).
 *
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {object} creature - must have .uid and either .spriteImg or .id
 * @param {number} index - creature's data-array index (used for DOM anchor
 *   lookup and revealFormationInfo). Also the default slot position.
 * @param {object} [opts]
 * @param {number} [opts.slotI] - 3-slot visual position (0..2). Caller maps
 *   (1→mid, 2→top+bot, 3→all) via slotFor() in BattleScene._diff. Defaults
 *   to `index` so legacy-style callers continue to work.
 * @param {boolean} [opts.isBoss=false] - boss sprites render at 1.5x normal
 *   battle size.
 * @param {boolean} [opts.skipEnter=false] - skip the enemy slide-in enter
 *   animation. Player sprites always skip enter.
 * @returns {Promise<Sprite|null>} the mounted sprite, or null if no app/container
 */
export async function spawnFormationSprite(ctx, side, creature, index, opts = {}) {
  if (ctx.scene && !creature?.uid) {
    throw new Error(
      `spawnFormationSprite: creature.uid is required when ctx is scene-owned (got ${JSON.stringify({ side, index, id: creature?.id })})`
    );
  }
  const { app } = getApp();
  if (!app) return null;
  const container = _sideContainer(ctx, side);
  if (!container) return null;

  const { isBoss = false, skipEnter = false } = opts;
  const slotIRaw = opts.slotI ?? index;
  const slotI = _clampSlotIndex(slotIRaw);
  const hadSprites = ctx.creatureSprites[side].size > 0;

  // NOTE: this function intentionally does NOT use `ctx.loadRequestId` to
  // self-cancel. BattleScene._diff calls us
  // in Promise.all over N creatures; a per-call counter would make N-1
  // of those calls bail out because the last increment wins. Storage by
  // uid is idempotent — if a caller kicks off two spawns for the same
  // uid we defensively remove the prior sprite below.
  const shouldEnterWithWalk = side === 'enemy' && !skipEnter && !hadSprites;
  const manifestSnapshot = getCreatureAnimationManifestSnapshot();
  const manifestEntry = getAnimatedCreatureEntry(manifestSnapshot, creature.id);
  let animatedState = null;
  let texture = null;

  try {
    if (manifestEntry) {
      animatedState = await createAnimatedCreatureState(manifestEntry);
      texture = (shouldEnterWithWalk ? animatedState.textures.walk?.[0] : null)
        || animatedState.textures.idle?.[0]
        || animatedState.textures.walk?.[0]
        || null;
    }
  } catch (err) {
    console.warn('[formation] animated creature setup failed; using static sprite', creature.id, err);
    animatedState = null;
    texture = null;
  }

  if (!texture) {
    texture = await loadCreatureBaseTexture(creature);
  }

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  if (animatedState) {
    sprite._animatedCreature = animatedState;
    sprite._animatedRenderScale = manifestEntry.renderScale || 1;
  }
  const spriteSize = FORMATION_SPRITE_SIZE * (isBoss ? BOSS_BATTLE_SCALE : 1);
  if (!sprite._animatedCreature) {
    sprite.width = spriteSize;
    sprite.height = spriteSize;
  }

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const slot = getBattlefieldSlot(side, slotI, screenW, screenH);
  const targetX = slot.x;
  const targetY = slot.y;

  sprite.y = targetY;

  // Enemy slide-in: kick off off-screen, let _updateFormations tween it in.
  // Only fires on first-appearance (no prior sprites on this side) when the
  // caller hasn't opted out via skipEnter. Player sprites never slide in.
  if (side === 'enemy' && !skipEnter && !hadSprites) {
    sprite._enterTarget = targetX;
    sprite._entering = true;
    sprite.x = screenW + spriteSize * 2;
    sprite.baseX = targetX;
  } else {
    sprite.x = targetX;
    sprite.baseX = targetX;
    sprite._entering = false;
    revealFormationInfo(side, index);
  }

  sprite.baseY = targetY;
  const animationScale = sprite._animatedRenderScale || 1;
  const textureWidth = _spriteTextureWidth(sprite);
  sprite.scale.set(getBattlefieldSpriteScale(slotI) * animationScale * (spriteSize / textureWidth));
  if (side === 'enemy') sprite.scale.x *= -1;
  sprite.phaseOffset = Math.random() * Math.PI * 2;
  sprite.creatureData = creature;
  sprite._uid = creature.uid;
  sprite._side = side;
  sprite._dataIndex = index;
  sprite._slotI = slotI;
  sprite._rowName = slot.rowName;

  if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
    sprite.alpha = 0;
    sprite.tint = 0x888888;
  }

  const shadowSpec = _scaledShadowSpec(
    getBattlefieldShadowSpec(slotI),
    isBoss ? BOSS_BATTLE_SCALE : 1
  );
  const shadow = new Graphics();
  _drawShadow(shadow, shadowSpec);
  shadow.x = targetX;
  shadow.y = _shadowYForSprite(sprite, spriteSize);
  container.addChild(shadow);
  sprite._shadow = shadow;

  container.addChild(sprite);
  const key = creature.uid ?? `__idx_${index}_${creature.id || ''}`;
  sprite._storageKey = key;
  // Defensive: if a caller re-spawns the same uid (duplicate or reset), the
  // previous PIXI sprite still lives on the container. Remove it explicitly
  // so we don't leak a visible double.
  const prior = ctx.creatureSprites[side].get(key);
  if (prior) {
    _destroyShadow(prior);
    if (prior.parent) prior.parent.removeChild(prior);
    prior.destroy({ children: true, texture: false });
  }
  ctx.creatureSprites[side].set(key, sprite);
  if (!manifestSnapshot) {
    loadCreatureAnimationManifest().then(async manifest => {
      if (!sprite.parent) return;
      const entry = getAnimatedCreatureEntry(manifest, creature.id);
      if (!entry || sprite._animatedCreature) return;
      const state = await createAnimatedCreatureState(entry);
      if (!sprite.parent) return;
      const initialTexture = state.textures.idle?.[0] || state.textures.walk?.[0];
      if (initialTexture) {
        sprite.texture = initialTexture;
        sprite._animatedCreature = state;
        sprite._animatedRenderScale = entry.renderScale || 1;
      }
    }).catch(() => {});
  }
  return sprite;
}

/**
 * Remove a creature sprite from a context by uid.
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {string} uid
 */
export function removeFormationSprite(ctx, side, uid) {
  if (ctx.scene && !uid) {
    throw new Error('removeFormationSprite: uid is required when ctx is scene-owned');
  }
  const sprite = ctx.creatureSprites[side].get(uid);
  if (!sprite) return;
  ctx.creatureSprites[side].delete(uid);
  if (sprite.statusLabels) {
    for (const pill of sprite.statusLabels) {
      pill.destroy({ children: true });
    }
  }
  _destroyShadow(sprite);
  if (sprite.parent) sprite.parent.removeChild(sprite);
  sprite.destroy({ children: true, texture: false });
}

/**
 * Update a creature sprite in place. Refreshes data (creatureData, dataIndex,
 * alpha/tint from HP) and repositions the sprite to match its new slot when
 * the caller's slot-mapping has shifted (e.g. an ally KO rearrangement).
 *
 * Does NOT re-run the enter animation — rearranges are instantaneous.
 *
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {object} creature
 * @param {number} index - creature's data-array index (DOM anchor lookup)
 * @param {object} [opts]
 * @param {number} [opts.slotI] - target 3-slot visual position (0..2).
 *   Defaults to `index` for backcompat.
 * @param {boolean} [opts.isBoss=false]
 */
export function updateFormationSprite(ctx, side, creature, index, opts = {}) {
  if (ctx.scene && !creature?.uid) {
    throw new Error('updateFormationSprite: creature.uid is required when ctx is scene-owned');
  }
  const sprite = ctx.creatureSprites[side].get(creature.uid);
  if (!sprite) return;

  const { isBoss = false } = opts;
  const slotIRaw = opts.slotI ?? index;
  const slotI = _clampSlotIndex(slotIRaw);

  sprite.creatureData = creature;
  sprite._dataIndex = index;

  // Reposition to the (possibly new) slot. Skip if:
  //   - the sprite is still mid slide-in (enter animation owns x)
  //   - the slot hasn't changed (leaves _animateKO's scale shrink + any
  //     ongoing tweens untouched; only slot rearranges need to re-layout)
  const prevSlot = sprite._slotI;
  sprite._slotI = slotI;
  const slotChanged = prevSlot == null || prevSlot !== slotI;
  const { app } = getApp();
  if (app && !sprite._entering && slotChanged) {
    const spriteSize = FORMATION_SPRITE_SIZE * (isBoss ? BOSS_BATTLE_SCALE : 1);
    const screenW = app.screen.width;
    const screenH = app.screen.height;
    const slot = getBattlefieldSlot(side, slotI, screenW, screenH);
    const targetX = slot.x;
    const targetY = slot.y;

    sprite.x = targetX;
    sprite.y = targetY;
    sprite.baseX = targetX;
    sprite.baseY = targetY;
    sprite._rowName = slot.rowName;

    if (sprite._shadow) {
      sprite._shadow.x = targetX;
    }

    const textureWidth = _spriteTextureWidth(sprite);
    if (textureWidth) {
      const sign = (side === 'enemy') ? -1 : 1;
      const animationScale = sprite._animatedRenderScale || 1;
      const depth = getBattlefieldSpriteScale(slotI) * animationScale * (spriteSize / textureWidth);
      sprite.scale.set(depth);
      sprite.scale.x *= sign;
    }
    if (sprite._shadow) {
      sprite._shadow.y = _shadowYForSprite(sprite, spriteSize);
    }
  }

  const hp = creature.currentHp ?? creature.hp ?? 1;
  if (hp <= 0) {
    // Dead creatures must be fully hidden. The fade-out tween from
    // _animateKO drives alpha to 0, but chain-skill kills (Arc Strike, etc.)
    // can update the sprite before the tween resolves — or if the KO animation
    // ran fire-and-forget, a later syncCreatures shouldn't accidentally keep
    // a ghost sprite visible. Force alpha to 0 so the corpse never renders.
    sprite.alpha = 0;
    sprite.tint = 0x888888;
    if (sprite._shadow) sprite._shadow.alpha = 0;
  } else {
    sprite.alpha = 1;
    sprite.tint = 0xFFFFFF;
    if (sprite._shadow) sprite._shadow.alpha = 1;
  }
}

// --- Scene-facing sprite lookup + per-sprite animations ---------------------

/**
 * Scene-facing sprite lookup. Wraps _getCreatureSprite with the scene's
 * formation ctx. Returns null when scene or scene.formation is absent
 * (e.g. during boot, between transitions, or when called outside a battle).
 *
 * @param {Scene|null} scene - BattleScene-like scene with a `formation` ctx
 * @param {'player'|'enemy'} side
 * @param {number} index - data-array index (uid is looked up via
 *   scene.formation.lastFormationInput[side].creatures[index])
 * @returns {Sprite|null}
 */
export function getCreatureSpriteForScene(scene, side, index) {
  if (!scene?.formation) return null;
  return _getCreatureSprite(scene.formation, side, index);
}

/**
 * Scene-facing KO animation. No-op when the scene has no formation ctx.
 *
 * @param {Scene|null} scene
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateKOForScene(scene, side, index) {
  if (!scene?.formation) return;
  return _animateKO(scene.formation, side, index);
}

/**
 * Scene-facing level-up animation. No-op when the scene has no formation ctx.
 *
 * @param {Scene|null} scene
 * @param {'player'|'enemy'} side
 * @param {number} index
 */
export async function animateLevelUpForScene(scene, side, index) {
  if (!scene?.formation) return;
  return _animateLevelUp(scene.formation, side, index);
}

/**
 * Scene-facing active-creature glow. No-op when the scene has no formation ctx.
 *
 * @param {Scene|null} scene
 * @param {number} index - player-side creature index
 */
export function showActiveGlowForScene(scene, index) {
  if (!scene?.formation) return;
  return _showActiveGlow(scene.formation, index);
}

/**
 * Scene-facing clear-glow. No-op when the scene has no formation ctx.
 *
 * @param {Scene|null} scene
 */
export function clearActiveGlowForScene(scene) {
  if (!scene?.formation) return;
  return _clearActiveGlow(scene.formation);
}

/**
 * Scene-facing status label sync. Rebuilds the stat-stage and status pills
 * attached to a creature sprite. No-op when the scene has no formation ctx.
 *
 * @param {Scene|null} scene
 * @param {'player'|'enemy'} side
 * @param {number} index - data-array index
 * @param {string[]} keys - ordered list of status keys (e.g. ['atk_up','poison'])
 * @param {Object} [statStages] - { atk, def } stage deltas for atk/def pills
 */
export function syncPixiStatusLabelsForScene(scene, side, index, keys, statStages) {
  if (!scene?.formation) return;
  return _syncPixiStatusLabels(scene.formation, side, index, keys, statStages);
}

/**
 * Destroy every status pill container attached to sprites owned by a
 * formation context. Status pills are parented to the *global* layers.labels
 * (see pixi/app.js), NOT to any scene-owned container — so the scene's
 * registry.dispose() cascade cannot reach them. Without this, pills from a
 * prior combat leak onto the next scene when the global labels layer
 * survives the transition.
 *
 * Idempotent + defensive: handles missing ctx, already-destroyed pills, and
 * side maps without statusLabels entries.
 *
 * @param {object|null} ctx - formation context (from scene.formation)
 */
export function destroyAllStatusLabels(ctx) {
  if (!ctx?.creatureSprites) return;
  for (const side of ['player', 'enemy']) {
    const sideMap = ctx.creatureSprites[side];
    if (!sideMap) continue;
    for (const sprite of sideMap.values()) {
      if (!sprite?.statusLabels?.length) continue;
      for (const pill of sprite.statusLabels) {
        try { pill.destroy({ children: true }); } catch { /* already gone */ }
      }
      sprite.statusLabels = [];
    }
  }
}

/**
 * Scene-aware NPC sprite spawner. Creates a sprite, adds it to
 * scene.layers.npcs, optionally animates a slide-in via scene.tween
 * (registry-tracked, auto-cancels on scene exit). Returns the sprite so
 * the caller can track it; the caller owns teardown via removeNpcSprite.
 *
 * @param {Scene} scene - ExplorationScene-like scene with layers.npcs
 * @param {string} spritePath - URL to load
 * @param {{ slideIn?: boolean }} [opts]
 * @returns {Promise<Sprite|null>} spawned sprite, or null if app is unavailable
 */
export async function spawnNpcSprite(scene, spritePath, { slideIn = false } = {}) {
  if (!scene) throw new Error('spawnNpcSprite: scene is required');
  if (!scene.layers?.npcs) {
    throw new Error('spawnNpcSprite: scene.layers.npcs is required');
  }

  const { app } = getApp();
  if (!app) return null;

  let texture;
  try {
    texture = await loadImageTexture(spritePath);
  } catch {
    texture = Texture.WHITE;
  }

  // Scene may have exited during the texture load. Drop the work rather
  // than mounting a sprite onto a destroyed layer.
  if (scene.disposed) return null;

  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const npcId = _npcIdFromSpritePath(spritePath);
  try {
    const manifest = await loadNpcAnimationManifest();
    const entry = getAnimatedNpcEntry(manifest, npcId);
    if (entry) {
      const animatedState = await createAnimatedCreatureState(entry);
      if (scene.disposed) return null;
      const initialKind = (slideIn && animatedState.textures.walk?.length)
        ? 'walk'
        : (animatedState.textures.idle?.length ? 'idle' : 'walk');
      applyAnimationKind(sprite, animatedState, initialKind);
      sprite._animatedNpc = animatedState;
      sprite._npcWalking = slideIn && initialKind === 'walk';
      if (typeof scene.addUpdater === 'function') {
        sprite._cancelNpcAnimationUpdater = scene.addUpdater((dt, deltaMS) => {
          const frameDeltaMS = typeof deltaMS === 'number'
            ? deltaMS
            : (typeof dt === 'number' ? dt * 16.6667 : 16.6667);
          tickAnimatedCreatureSprite(sprite, animatedState, frameDeltaMS, !!sprite._npcWalking);
        });
      }
    }
  } catch (err) {
    console.warn('[formation] animated NPC setup failed; using static sprite', npcId, err);
  }
  if (scene.disposed) return null;
  const npcDisplaySize = NPC_BASE_SPRITE_SIZE * (sprite._animatedNpc?.entry?.renderScale || 1);
  sprite.width = npcDisplaySize;
  sprite.height = npcDisplaySize;
  sprite.y = getBattlefieldSlot('enemy', NPC_BATTLEFIELD_ROW_INDEX, screenW, screenH).y;

  scene.layers.npcs.addChild(sprite);

  if (slideIn) {
    sprite.x = screenW + npcDisplaySize;
    try {
      await scene.tween(sprite, { x: screenW * 0.7 }, { duration: 400, ease: 'easeOut' });
      sprite._npcWalking = false;
      if (sprite._animatedNpc?.textures?.idle?.length) {
        applyAnimationKind(sprite, sprite._animatedNpc, 'idle');
      }
    } catch (e) {
      // Tween rejected (e.g., scene disposed mid-slide). Clean up our
      // orphan sprite so it doesn't linger in the layer while the caller's
      // `this.npcSprite = await ...` assignment never happens.
      if (typeof sprite._cancelNpcAnimationUpdater === 'function') {
        sprite._cancelNpcAnimationUpdater();
      }
      if (sprite.parent) sprite.parent.removeChild(sprite);
      sprite.destroy({ children: true });
      throw e;
    }
  } else {
    sprite.x = screenW * 0.7;
  }

  return sprite;
}

/**
 * Scene-aware NPC sprite teardown. Removes from parent and destroys the
 * PIXI sprite. Synchronous — use Scene.hideNpcSprite({ slideOut: true })
 * for the animated variant (base Scene class owns the slide-out tween).
 *
 * @param {Scene} scene - ExplorationScene-like scene (taken for API consistency;
 *   currently unused but reserved for a future tween-based slide-out).
 * @param {Sprite} sprite - The sprite previously returned by spawnNpcSprite
 */
export function removeNpcSprite(scene, sprite) {
  if (!sprite) return;
  if (typeof sprite._cancelNpcAnimationUpdater === 'function') {
    sprite._cancelNpcAnimationUpdater();
  }
  if (sprite.parent) sprite.parent.removeChild(sprite);
  sprite.destroy({ children: true });
}
