import { Sprite, Assets, Container, Texture, Graphics, Text } from 'pixi.js';
import { getApp } from './app.js';
import { tween } from './tween.js';
import { STATUS_ICON_CONFIG } from '../ui/event-popup.js';

const DEPTH_SCALES = [0.9, 0.95, 1.0]; // back, mid, front
const PLAYER_STAGGER_X = [12, 24, 36]; // px offset per row
const ENEMY_STAGGER_X = [-12, -24, -36]; // mirrored

const LABEL_FONT_SIZE = 9;
const LABEL_PADDING_X = 4;
const LABEL_PADDING_Y = 2;
const LABEL_GAP = 3;
const LABEL_SIDE_OFFSET = 50;

const STAT_STAGE_NAMES = { atk: 'ATK', def: 'DEF' };

// --- Context (dual-API core) --------------------------------------------------
//
// Formation state lives in a context object. Legacy exports are thin wrappers
// that forward to ctx-based internal implementations using `_defaultCtx`.
// Scenes use `createFormationContext(scene)` to get their own isolated context.
//
// Storage: `creatureSprites[side]` is Map<uid, Sprite>. Legacy (side, index)
// lookups are bridged via `lastFormationInput[side].creatures[index].uid`.

function _newContext(scene = null) {
  return {
    scene,  // null for legacy _defaultCtx
    playerContainer: null,  // lazily created on first showFormation (legacy)
    enemyContainer: null,
    creatureSprites: { player: new Map(), enemy: new Map() },  // uid -> Sprite
    lastFormationInput: { player: null, enemy: null },         // { creatures, opts } per side
    walkingEnabled: false,
    walkTime: 0,
    activeGlow: null,
    activeGlowTickFn: null,
    loadRequestId: { player: 0, enemy: 0 },
    npcSprite: null,
  };
}

const _defaultCtx = _newContext();

/**
 * Create a per-scene formation context. The scene's `layers.formations`
 * container becomes the parent for both player and enemy sub-containers.
 * @param {import('../scenes/scene.js').Scene} scene
 * @returns {object} a formation context for use with the ctx-based API
 */
export function createFormationContext(scene) {
  const ctx = _newContext(scene);
  const formationsLayer = scene?.layers?.formations;
  if (formationsLayer) {
    ctx.playerContainer = scene.addContainer(new Container(), formationsLayer);
    ctx.enemyContainer  = scene.addContainer(new Container(), formationsLayer);
  }
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

function _sideContainer(ctx, side) {
  return side === 'player' ? ctx.playerContainer : ctx.enemyContainer;
}

/** Iterate sprites in a side as an array (for legacy-style loops). */
function _spritesArray(ctx, side) {
  return Array.from(ctx.creatureSprites[side].values());
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

function _clearAllPixiStatusLabels(ctx) {
  for (const side of ['player', 'enemy']) {
    for (const sprite of _spritesArray(ctx, side)) {
      if (!sprite) continue;
      if (sprite.statusLabels) {
        for (const pill of sprite.statusLabels) {
          pill.destroy({ children: true });
        }
      }
      sprite.statusLabels = [];
    }
  }
}

// --- Formation init / show / hide (ctx-based) --------------------------------

function _initFormations(ctx) {
  const { layers } = getApp();
  if (!layers.creatures) return;

  ctx.playerContainer = new Container();
  ctx.enemyContainer = new Container();
  layers.creatures.addChild(ctx.playerContainer);
  layers.creatures.addChild(ctx.enemyContainer);
}

/**
 * Internal showFormation — renders a formation of creatures into a ctx.
 * Legacy callers hit this via the exported showFormation wrapper (with _defaultCtx).
 */
async function _showFormation(ctx, side, creatures, { isBoss = false, skipEnter = false } = {}) {
  const { app } = getApp();
  if (!app) return;

  const container = _sideContainer(ctx, side);
  if (!container) return;
  const normalizedCreatures = Array.isArray(creatures) ? [...creatures] : [];

  if (
    sameFormation(ctx.lastFormationInput[side], normalizedCreatures, isBoss) &&
    ctx.creatureSprites[side].size > 0
  ) {
    // Same creatures by ID — update KO state (alpha/tint) in-place without rebuild.
    // Matches scene.js dedup which updates HP bars in-place.
    for (const sprite of _spritesArray(ctx, side)) {
      const c = sprite.creatureData;
      const match = normalizedCreatures.find(nc => (nc?.id || '') === (c?.id || ''));
      if (match) {
        const hp = match.currentHp ?? match.hp ?? 1;
        if (hp <= 0) {
          sprite.tint = 0x888888;
          // Don't increase alpha — preserve animateKO fade-out (alpha=0)
          if (sprite.alpha > 0.3) sprite.alpha = 0.3;
        } else {
          sprite.alpha = 1;
          sprite.tint = 0xFFFFFF;
        }
        sprite.creatureData = match;
      }
    }
    ctx.lastFormationInput[side] = { creatures: normalizedCreatures, opts: { isBoss, skipEnter } };
    return;
  }

  const requestId = ++ctx.loadRequestId[side];

  ctx.lastFormationInput[side] = {
    creatures: normalizedCreatures,
    opts: { isBoss, skipEnter },
  };

  const hadSprites = ctx.creatureSprites[side].size > 0;

  // Clear existing
  container.removeChildren();
  // Clean up orphaned status labels before discarding sprite references
  for (const sprite of _spritesArray(ctx, side)) {
    if (sprite.statusLabels) {
      for (const pill of sprite.statusLabels) {
        pill.destroy({ children: true });
      }
    }
  }
  ctx.creatureSprites[side].clear();

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

    if (requestId !== ctx.loadRequestId[side]) return;

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
      revealFormationInfo(side, dataIndex);
    }

    // Depth scaling
    sprite.scale.set(DEPTH_SCALES[i] * (spriteSize / texture.width));

    // Flip enemy sprites
    if (side === 'enemy') {
      sprite.scale.x *= -1;
    }

    // Store base position for walking animation
    sprite.baseY = sprite.y;
    sprite.phaseOffset = Math.random() * Math.PI * 2;
    sprite.creatureData = creature;
    sprite._uid = creature.uid;
    sprite._side = side;
    sprite._dataIndex = dataIndex;

    // KO state — fully invisible on rebuild (animateKO already ran)
    if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
      sprite.alpha = 0;
      sprite.tint = 0x888888;
    }

    container.addChild(sprite);
    // Key by uid. When a creature has no uid (e.g. legacy test data), fall back
    // to a synthetic key so multiple uid-less creatures don't collide.
    const key = creature.uid ?? `__idx_${dataIndex}_${creature.id || i}`;
    ctx.creatureSprites[side].set(key, sprite);
    sprite._storageKey = key;
  }
}

function _hideFormation(ctx, side) {
  const container = _sideContainer(ctx, side);
  if (container) container.removeChildren();
  // Clean up status labels for this side
  for (const sprite of _spritesArray(ctx, side)) {
    if (sprite.statusLabels) {
      for (const pill of sprite.statusLabels) {
        pill.destroy({ children: true });
      }
    }
  }
  ctx.creatureSprites[side].clear();
  ctx.lastFormationInput[side] = null;
}

function _setFormationVisible(ctx, side, visible) {
  const container = _sideContainer(ctx, side);
  if (container) container.visible = visible;
  // Also toggle status label pills (they live in layers.labels, not the formation container)
  for (const sprite of _spritesArray(ctx, side) || []) {
    if (!sprite?.statusLabels) continue;
    for (const pill of sprite.statusLabels) {
      pill.visible = visible;
    }
  }
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
  const { app, layers } = getApp();
  if (!sprite || !app) return;

  ctx.activeGlow = new Graphics();
  ctx.activeGlow.circle(0, 0, 38).stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
  ctx.activeGlow.x = sprite.x;
  ctx.activeGlow.y = sprite.y;
  layers.effects.addChild(ctx.activeGlow);

  ctx.activeGlowTickFn = () => {
    const s = _getCreatureSprite(ctx, 'player', index);
    if (s && ctx.activeGlow) {
      ctx.activeGlow.x = s.x;
      ctx.activeGlow.y = s.y;
    }
    if (ctx.activeGlow) {
      ctx.activeGlow.alpha = 0.3 + 0.3 * Math.sin(Date.now() / 400);
    }
  };
  app.ticker.add(ctx.activeGlowTickFn);
}

function _clearActiveGlow(ctx) {
  if (ctx.activeGlow) {
    ctx.activeGlow.destroy();
    ctx.activeGlow = null;
  }
  if (ctx.activeGlowTickFn) {
    const { app } = getApp();
    app?.ticker.remove(ctx.activeGlowTickFn);
    ctx.activeGlowTickFn = null;
  }
}

// --- NPC sprite (ctx-based) ---------------------------------------------------

async function _showNpcSprite(ctx, spritePath, { slideIn = false } = {}) {
  const { app, layers } = getApp();
  if (!app) return;
  // Add NPC to the top-level creatures layer (not enemyContainer)
  // so it stays visible when enemyContainer is hidden during skill animations
  const container = layers?.creatures || ctx.enemyContainer;
  if (!container) return;

  await _hideNpcSprite(ctx);

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
  sprite.width = 170;
  sprite.height = 170;
  sprite.scale.x *= -1; // Face left (same as enemy creatures)
  sprite.y = screenH * 0.5;

  if (slideIn) {
    sprite.x = screenW + 170;
    container.addChild(sprite);
    ctx.npcSprite = sprite;
    await tween(sprite, { x: screenW * 0.7 }, { duration: 400, ease: 'easeOut' });
  } else {
    sprite.x = screenW * 0.7;
    container.addChild(sprite);
    ctx.npcSprite = sprite;
  }
}

async function _hideNpcSprite(ctx, { slideOut = false } = {}) {
  if (!ctx.npcSprite) return;
  if (slideOut) {
    const { app } = getApp();
    const screenW = app?.screen.width || 400;
    await tween(ctx.npcSprite, { x: screenW + 170 }, { duration: 300, ease: 'easeIn' });
  }
  if (ctx.npcSprite) {
    ctx.npcSprite.destroy();
    ctx.npcSprite = null;
  }
}

function _hasNpcSprite(ctx) {
  return ctx.npcSprite != null;
}

// --- Walking + per-frame update (ctx-based) ----------------------------------

function _setWalking(ctx, enabled) {
  ctx.walkingEnabled = enabled;
}

/**
 * Tick walking wobble / enter-slide animations for a ctx.
 * Legacy default ctx is intentionally unticked (the old app.ticker hook was
 * removed in Task 6; Task 16 will wire scene.addUpdater to call this for the
 * scene ctx). This function remains exported so imports don't break.
 */
function _updateFormations(ctx, delta) {
  ctx.walkTime += delta * 0.05;

  for (const side of ['player', 'enemy']) {
    for (const sprite of _spritesArray(ctx, side)) {
      if (sprite._entering) {
        sprite.x += (sprite._enterTarget - sprite.x) * 0.1;
        if (Math.abs(sprite.x - sprite._enterTarget) < 1) {
          sprite.x = sprite._enterTarget;
          sprite.baseX = sprite._enterTarget;
          sprite._entering = false;
          revealFormationInfo(sprite._side, sprite._dataIndex);
        }
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
  await Promise.all([
    tween(sprite, { alpha: 0 }, { duration: 600, ease: 'easeOut' }),
    tween(sprite.scale, { x: targetScaleX, y: targetScaleY }, { duration: 600, ease: 'easeIn' }),
  ]);

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

// --- Resize (ctx-based) ------------------------------------------------------

async function _resizeFormations(ctx, /* width */ _w, /* height */ _h) {
  const { app } = getApp();
  if (!app) return;

  const sceneArea = document.getElementById('scene-area');
  const sceneRect = sceneArea?.getBoundingClientRect();

  for (const side of ['player', 'enemy']) {
    const sprites = _spritesArray(ctx, side);
    if (!sprites.length) continue;

    const formationSel = side === 'player' ? '.player-formation' : '.enemy-formation';
    const input = ctx.lastFormationInput[side];
    const creatures = input?.creatures || [];

    for (const sprite of sprites) {
      const c = sprite.creatureData;
      if (!c) continue;
      const dataIndex = creatures.indexOf(c);
      if (dataIndex < 0) continue;

      const anchorEl = sceneRect && document.querySelector(
        `${formationSel} .formation-slot[data-index="${dataIndex}"] .formation-sprite--pixi-anchor`
      );
      if (anchorEl) {
        const anchorRect = anchorEl.getBoundingClientRect();
        sprite.x = anchorRect.left + anchorRect.width / 2 - sceneRect.left;
        sprite.y = anchorRect.top + anchorRect.height / 2 - sceneRect.top;
        sprite.baseX = sprite.x;
        sprite.baseY = sprite.y;
      }
    }
  }

  // Reposition status labels to match new sprite base positions
  for (const side of ['player', 'enemy']) {
    for (const sprite of _spritesArray(ctx, side)) {
      if (!sprite.statusLabels?.length) continue;
      const pills = sprite.statusLabels;
      const pillHeight = pills[0].height;
      const totalHeight = pills.length * pillHeight + LABEL_GAP * (pills.length - 1);
      const startY = sprite.baseY - totalHeight / 2;
      const xOffset = side === 'player' ? -LABEL_SIDE_OFFSET : LABEL_SIDE_OFFSET;

      for (let i = 0; i < pills.length; i++) {
        pills[i].x = sprite.baseX + xOffset;
        pills[i].y = startY + i * (pillHeight + LABEL_GAP);
      }
    }
  }
}

// --- New scene-oriented API --------------------------------------------------

/**
 * Spawn a single creature sprite into a formation context and position it by
 * slot index within a 1/2/3-wide formation layout.
 *
 * Exported for scene-based callers (BattleScene.syncCreatures). Legacy callers
 * should continue to use showFormation.
 *
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {object} creature - must have .uid and either .spriteImg or .id
 * @param {number} index - slot index within the new formation (0..2)
 * @returns {Promise<Sprite|null>} the mounted sprite, or null if no app/container
 */
export async function spawnFormationSprite(ctx, side, creature, index) {
  const { app } = getApp();
  if (!app) return null;
  const container = _sideContainer(ctx, side);
  if (!container) return null;

  const requestId = ++ctx.loadRequestId[side];

  const spritePath = creature.spriteImg || `/assets/sprites/creatures/${creature.id}.webp`;
  let texture;
  try {
    texture = await Assets.load(spritePath);
  } catch {
    texture = Texture.WHITE;
  }
  if (requestId !== ctx.loadRequestId[side]) return null;

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const spriteSize = 60;
  sprite.width = spriteSize;
  sprite.height = spriteSize;

  // Position: use DOM anchor if available, fall back to percentages
  const sceneArea = document.getElementById('scene-area');
  const sceneRect = sceneArea?.getBoundingClientRect();
  const formationSel = side === 'player' ? '.player-formation' : '.enemy-formation';
  const staggerX = side === 'player' ? PLAYER_STAGGER_X : ENEMY_STAGGER_X;
  const screenW = app.screen.width;
  const screenH = app.screen.height;
  const baseX = side === 'player' ? screenW * 0.25 : screenW * 0.75;

  // dataIndex positions sprite within the 3-slot layout (1→mid, 2→top+bot, 3→all).
  // spawnFormationSprite receives the "creature index" — we keep it as the
  // canonical slot index and use it directly; callers that need the formal
  // 3-slot mapping should use showFormation.
  const slotI = Math.min(Math.max(index, 0), DEPTH_SCALES.length - 1);

  let targetX, targetY;
  const anchorEl = sceneRect && document.querySelector(
    `${formationSel} .formation-slot[data-index="${index}"] .formation-sprite--pixi-anchor`
  );
  if (anchorEl) {
    const anchorRect = anchorEl.getBoundingClientRect();
    targetX = anchorRect.left + anchorRect.width / 2 - sceneRect.left;
    targetY = anchorRect.top + anchorRect.height / 2 - sceneRect.top;
  } else {
    targetX = baseX + staggerX[slotI];
    targetY = (screenH * 0.3) + (slotI * screenH * 0.2);
  }

  sprite.x = targetX;
  sprite.y = targetY;
  sprite.baseX = targetX;
  sprite.baseY = targetY;
  sprite.scale.set(DEPTH_SCALES[slotI] * (spriteSize / texture.width));
  if (side === 'enemy') sprite.scale.x *= -1;
  sprite.phaseOffset = Math.random() * Math.PI * 2;
  sprite.creatureData = creature;
  sprite._uid = creature.uid;
  sprite._side = side;
  sprite._dataIndex = index;
  sprite._entering = false;

  if ((creature.currentHp ?? creature.hp ?? 1) <= 0) {
    sprite.alpha = 0;
    sprite.tint = 0x888888;
  }

  container.addChild(sprite);
  const key = creature.uid ?? `__idx_${index}_${creature.id || ''}`;
  sprite._storageKey = key;
  ctx.creatureSprites[side].set(key, sprite);
  return sprite;
}

/**
 * Remove a creature sprite from a context by uid.
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {string} uid
 */
export function removeFormationSprite(ctx, side, uid) {
  const sprite = ctx.creatureSprites[side].get(uid);
  if (!sprite) return;
  ctx.creatureSprites[side].delete(uid);
  if (sprite.statusLabels) {
    for (const pill of sprite.statusLabels) {
      pill.destroy({ children: true });
    }
  }
  if (sprite.parent) sprite.parent.removeChild(sprite);
  sprite.destroy({ children: true, texture: false });
}

/**
 * Update a creature sprite in-place (data refresh + slot reposition).
 * @param {object} ctx
 * @param {'player'|'enemy'} side
 * @param {object} creature
 * @param {number} index
 */
export function updateFormationSprite(ctx, side, creature, index) {
  const sprite = ctx.creatureSprites[side].get(creature.uid);
  if (!sprite) return;

  sprite.creatureData = creature;
  sprite._dataIndex = index;

  const hp = creature.currentHp ?? creature.hp ?? 1;
  if (hp <= 0) {
    sprite.tint = 0x888888;
    if (sprite.alpha > 0.3) sprite.alpha = 0.3;
  } else {
    sprite.alpha = 1;
    sprite.tint = 0xFFFFFF;
  }
}

// --- Legacy exports (thin wrappers around _defaultCtx) -----------------------

export function syncPixiStatusLabels(side, index, keys, statStages) {
  return _syncPixiStatusLabels(_defaultCtx, side, index, keys, statStages);
}

export function clearAllPixiStatusLabels() {
  return _clearAllPixiStatusLabels(_defaultCtx);
}

export function initFormations() {
  return _initFormations(_defaultCtx);
}

export async function showFormation(side, creatures, opts = {}) {
  return _showFormation(_defaultCtx, side, creatures, opts);
}

export function hideFormation(side) {
  return _hideFormation(_defaultCtx, side);
}

export function setFormationVisible(side, visible) {
  return _setFormationVisible(_defaultCtx, side, visible);
}

export function setWalking(enabled) {
  return _setWalking(_defaultCtx, enabled);
}

export function getCreatureSprite(side, index) {
  return _getCreatureSprite(_defaultCtx, side, index);
}

export function showActiveGlow(index) {
  return _showActiveGlow(_defaultCtx, index);
}

export function clearActiveGlow() {
  return _clearActiveGlow(_defaultCtx);
}

export async function showNpcSprite(spritePath, opts = {}) {
  return _showNpcSprite(_defaultCtx, spritePath, opts);
}

export async function hideNpcSprite(opts = {}) {
  return _hideNpcSprite(_defaultCtx, opts);
}

export function hasNpcSprite() {
  return _hasNpcSprite(_defaultCtx);
}

export function updateFormations(delta) {
  return _updateFormations(_defaultCtx, delta);
}

export async function animateKO(side, index) {
  return _animateKO(_defaultCtx, side, index);
}

export async function animateLevelUp(side, index) {
  return _animateLevelUp(_defaultCtx, side, index);
}

export async function resizeFormations(width, height) {
  return _resizeFormations(_defaultCtx, width, height);
}
