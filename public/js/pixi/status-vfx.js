import { Graphics, Text, Container } from 'pixi.js';
import { getApp } from './app.js';
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

// ============ ONGOING VFX TRACKING (LEGACY) ============

/**
 * Legacy module-level ongoing-VFX tracking. Keyed by sprite reference so the
 * legacy path (callers that pass side+index) can coexist with the new scene-
 * ctx path that keys by uid on `scene.vfxByUid`. Both paths share the same
 * per-effect tick bodies via `_startOngoingInto` + a pluggable registerUpdater.
 *
 * @type {Map<import('pixi.js').Sprite, Record<string, OngoingEntry>>}
 */
const ongoingVfx = new Map();

/**
 * @typedef {Object} OngoingEntry
 * @property {import('pixi.js').Container|null} container - display container (if any)
 * @property {() => void} cancel - stops the tick and removes any ticker registration
 * @property {number} [_originalTint] - preserved for haste effect restoration
 */

/**
 * Convert a hex color number to a CSS hex string.
 * @param {number} hex
 * @returns {string}
 */
function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * Get or create the legacy ongoing-entry map for a sprite.
 * @param {import('pixi.js').Sprite} sprite
 * @returns {Record<string, OngoingEntry>}
 */
function getOngoingMap(sprite) {
  if (!ongoingVfx.has(sprite)) {
    ongoingVfx.set(sprite, {});
  }
  return ongoingVfx.get(sprite);
}

// ============ APPLIED ONE-SHOTS ============

/**
 * Play the one-shot "applied" animation for a status effect. The one-shots
 * do NOT depend on ticker or layer ownership — they call into pure VFX
 * primitives (burstParticles, showEventPopup, screenFlash, tween). Shared
 * by the legacy and scene-ctx entry points.
 *
 * @param {import('pixi.js').Sprite} sprite
 * @param {string} effectType
 */
async function _playAppliedOneShot(sprite, effectType) {
  const color = STATUS_COLORS[effectType] || 0xFFFFFF;
  const label = STATUS_LABELS[effectType] || effectType;
  const cssColor = hexToCSS(color);
  const pos = { x: sprite.x + (sprite.parent?.x || 0), y: sprite.y + (sprite.parent?.y || 0) };

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
}

// ============ ONGOING VISUALS (SHARED INTERNALS) ============
//
// The six ongoing-visual effects each register a per-frame updater and
// optionally mount a display container into the effects layer. The per-effect
// bodies are parameterized on a `registerUpdater(fnDeltaMS)` callback so the
// legacy path (app.ticker.add) and scene path (scene.addUpdater) both reuse
// them unmodified.
//
// `registerUpdater` is always invoked with a function that takes a single
// `deltaMS` scalar. Returns a `cancel()` that stops the tick.

/**
 * Register an ongoing visual for `effectType` on `sprite`, mounting any
 * display container into `effectsLayer`. Returns null for effects with no
 * ongoing visual (poison, temp_attack_flat, unknown types).
 *
 * @param {import('pixi.js').Sprite} sprite
 * @param {string} effectType
 * @param {import('pixi.js').Container} effectsLayer - parent for display containers
 * @param {(fnDeltaMS: (deltaMS: number) => void) => (() => void)} registerUpdater
 * @returns {OngoingEntry|null}
 */
function _startOngoingInto(sprite, effectType, effectsLayer, registerUpdater) {
  switch (effectType) {
    case 'sleep':
      return _startSleep(sprite, effectsLayer, registerUpdater);
    case 'stun':
      return _startStun(sprite, effectsLayer, registerUpdater);
    case 'confuse':
      return _startConfuse(sprite, registerUpdater);
    case 'haste':
      return _startHaste(sprite, registerUpdater);
    case 'shield':
    case 'team_shield':
      return _startShield(sprite, effectsLayer, registerUpdater);
    case 'taunt':
      return _startTaunt(sprite, effectsLayer, registerUpdater);
    // poison: tick handled separately (showPoisonTick in text.js)
    // temp_attack_flat: no ongoing visual
    default:
      return null;
  }
}

// --- Sleep: floating "Z" particles every 800ms ---

function _startSleep(sprite, effectsLayer, registerUpdater) {
  const container = new Container();
  effectsLayer.addChild(container);

  let elapsed = 0;

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    if (elapsed >= 800) {
      elapsed -= 800;
      spawnZParticle(sprite, container);
    }
    // Update existing Z texts — float up and fade
    for (let i = container.children.length - 1; i >= 0; i--) {
      const z = container.children[i];
      z._age += deltaMS;
      z.y -= deltaMS * 0.03; // drift up
      z.alpha = Math.max(0, 1 - z._age / 1200);
      if (z._age >= 1200) {
        z.destroy();
      }
    }
  });

  return { container, cancel };
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

function _startStun(sprite, effectsLayer, registerUpdater) {
  const container = new Container();
  effectsLayer.addChild(container);

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

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    const cx = parentX + sprite.x;
    const cy = parentY + sprite.y - 35; // above the creature

    for (let i = 0; i < stars.length; i++) {
      const angle = elapsed * SPEED + (i * Math.PI * 2) / 3;
      stars[i].x = cx + Math.cos(angle) * RADIUS;
      stars[i].y = cy + Math.sin(angle) * RADIUS * 0.5; // elliptical
    }
  });

  return { container, cancel };
}

// --- Confuse: sprite rotation wobbles (sin wave, +/-0.15 rad) ---

function _startConfuse(sprite, registerUpdater) {
  let elapsed = 0;
  const WOBBLE_SPEED = 0.005; // radians per ms -> ~3Hz

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    sprite.rotation = Math.sin(elapsed * WOBBLE_SPEED) * 0.15;
  });

  return { container: null, cancel };
}

// --- Haste: blue tint shimmer toggling every 200ms ---

function _startHaste(sprite, registerUpdater) {
  let elapsed = 0;
  let tinted = false;
  // Store original tint to restore
  const originalTint = sprite.tint;

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    if (elapsed >= 200) {
      elapsed -= 200;
      tinted = !tinted;
      sprite.tint = tinted ? 0x29B6F6 : (originalTint ?? 0xFFFFFF);
    }
  });

  return { container: null, cancel, _originalTint: originalTint };
}

// --- Shield / team_shield: blue circle outline pulsing alpha ---

function _startShield(sprite, effectsLayer, registerUpdater) {
  const container = new Container();
  effectsLayer.addChild(container);

  const circle = new Graphics();
  circle.circle(0, 0, 35);
  circle.stroke({ color: 0x42A5F5, width: 2 });
  container.addChild(circle);

  let elapsed = 0;
  const PULSE_SPEED = 0.004; // moderate pulse

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    circle.x = parentX + sprite.x;
    circle.y = parentY + sprite.y;
    circle.alpha = 0.4 + 0.4 * Math.sin(elapsed * PULSE_SPEED);
  });

  return { container, cancel };
}

// --- Taunt: red circle outline pulsing alpha (faster than shield) ---

function _startTaunt(sprite, effectsLayer, registerUpdater) {
  const container = new Container();
  effectsLayer.addChild(container);

  const circle = new Graphics();
  circle.circle(0, 0, 35);
  circle.stroke({ color: 0xEF5350, width: 2 });
  container.addChild(circle);

  let elapsed = 0;
  const PULSE_SPEED = 0.008; // faster than shield

  const cancel = registerUpdater((deltaMS) => {
    elapsed += deltaMS;
    const parentX = sprite.parent?.x || 0;
    const parentY = sprite.parent?.y || 0;
    circle.x = parentX + sprite.x;
    circle.y = parentY + sprite.y;
    circle.alpha = 0.4 + 0.4 * Math.sin(elapsed * PULSE_SPEED);
  });

  return { container, cancel };
}

// --- Shared teardown helpers ----------------------------------------------

/**
 * Restore mutated sprite properties after an ongoing effect ends. Safe to
 * call with a destroyed sprite — the sprite guard skips any writes. Called
 * from both the legacy and scene-ctx clear paths.
 *
 * @param {import('pixi.js').Sprite} sprite
 * @param {string} effectType
 * @param {OngoingEntry} entry
 */
function _restoreSpriteForEffect(sprite, effectType, entry) {
  if (!sprite || sprite.destroyed) return;
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
}

/**
 * Tear down a single ongoing entry: cancel the tick, destroy the container,
 * and restore sprite properties. Shared by both clear paths.
 *
 * @param {import('pixi.js').Sprite} sprite
 * @param {string} effectType
 * @param {OngoingEntry} entry
 */
function _teardownEntry(sprite, effectType, entry) {
  try { entry.cancel?.(); } catch (e) { console.error('[status-vfx] cancel threw:', e); }
  if (entry.container) {
    try { entry.container.destroy({ children: true }); } catch { /* already destroyed */ }
  }
  _restoreSpriteForEffect(sprite, effectType, entry);
}

// ============ LEGACY EXPORTS (unchanged signatures) =========================
//
// Legacy callers (combat-loop.js, combat-vfx.js) still call these with
// (side, index, effectType). They resolve the sprite via getCreatureSprite
// and record entries in the module-level ongoingVfx Map. Ticker registration
// goes through app.ticker.add; tests (tier 1) don't exercise any of this.

/**
 * registerUpdater implementation for the legacy path — routes through the
 * live PIXI app ticker. `fnDeltaMS` is called with a scalar deltaMS every
 * frame until the returned cancel() runs.
 *
 * @param {(deltaMS: number) => void} fnDeltaMS
 * @returns {() => void}
 */
function _legacyRegisterUpdater(fnDeltaMS) {
  const { app } = getApp();
  if (!app) return () => {};
  const wrapped = (ticker) => fnDeltaMS(ticker.deltaMS);
  app.ticker.add(wrapped);
  return () => app.ticker.remove(wrapped);
}

/**
 * Play the one-shot "applied" animation for a status effect, then start the
 * ongoing visual. Legacy API — resolves sprite via getCreatureSprite and
 * stores state in the module-level `ongoingVfx` Map.
 *
 * @deprecated Legacy export retained for combat-loop.js / combat-vfx.js
 *   compatibility. Scheduled for removal in Task 18 after Task 16 migrates
 *   combat-loop to the scene-ctx API (createStatusVfxContext +
 *   playStatusAppliedForScene / clearStatusVfxForScene).
 *
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @param {string} effectType
 */
export async function playStatusApplied(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  // --- Start ongoing visual (if any) BEFORE the one-shot ---
  // Register the ongoing first so a sync clearStatusVfx called right after
  // this function (see combat-vfx.js apply-then-remainingTurns===0 pattern)
  // finds the entry. Awaiting _playAppliedOneShot first would introduce a
  // microtask yield even for synchronous effect bodies, letting the sync
  // clear run before the ongoing was registered — leaking the VFX.
  const { layers } = getApp();
  if (!layers?.effects) return;

  // Don't double-start
  const map = getOngoingMap(sprite);
  if (map[effectType]) return;

  const entry = _startOngoingInto(sprite, effectType, layers.effects, _legacyRegisterUpdater);
  if (entry) {
    map[effectType] = entry;
  }

  // Fire-and-forget the one-shot visual burst — caller doesn't await, and
  // awaiting internally would re-introduce the microtask-yield race described
  // above. Catch to avoid unhandled-rejection warnings.
  _playAppliedOneShot(sprite, effectType).catch(err => {
    console.error(`[status-vfx] _playAppliedOneShot threw for ${effectType}:`, err);
  });
}

/**
 * Remove ongoing VFX for one effect on one creature. Restores sprite
 * properties (alpha, rotation, tint) as needed.
 *
 * @deprecated Legacy export retained for combat-loop.js / combat-vfx.js
 *   compatibility. Scheduled for removal in Task 18 after Task 16 migrates
 *   combat-loop to the scene-ctx API (createStatusVfxContext +
 *   playStatusAppliedForScene / clearStatusVfxForScene).
 *
 * @param {'player'|'enemy'} side
 * @param {number} index
 * @param {string} effectType
 */
export function clearStatusVfx(side, index, effectType) {
  const sprite = getCreatureSprite(side, index);
  if (!sprite) return;

  const map = ongoingVfx.get(sprite);
  if (!map || !map[effectType]) return;

  const entry = map[effectType];
  _teardownEntry(sprite, effectType, entry);
  delete map[effectType];
  if (Object.keys(map).length === 0) ongoingVfx.delete(sprite);
}

/**
 * Remove ALL ongoing status VFX across all creatures (legacy bulk-clear).
 * Called at combat end by combat-loop.js to ensure a clean state. Scene-ctx
 * callers do NOT need this — scene.exit() drops all addUpdater registrations
 * via registry.dispose(), and the vfxByUid Map is cleared in beforeExit().
 *
 * @deprecated Legacy export retained for combat-loop.js / combat-vfx.js
 *   compatibility. Scheduled for removal in Task 18 after Task 16 migrates
 *   combat-loop to the scene-ctx API (createStatusVfxContext +
 *   playStatusAppliedForScene / clearStatusVfxForScene).
 */
export function clearAllStatusVfx() {
  for (const [sprite, map] of ongoingVfx) {
    for (const effectType of Object.keys(map)) {
      _teardownEntry(sprite, effectType, map[effectType]);
    }
  }
  ongoingVfx.clear();
}

// ============ SCENE-CTX API =================================================
//
// Stateless-ish entry points for BattleScene. State lives on the scene:
// per-effect entries are stored in `scene.vfxByUid` as Map<uid, Record<string,
// OngoingEntry>>. Per-frame updaters are registered via `scene.addUpdater` so
// `scene.exit()` auto-drops them through `registry.dispose()`. Display
// containers mount into `scene.layers.effects`.
//
// Task 16 will flip combat-loop callers over to these. Until then, these are
// defined but not invoked (except in unit tests).

/**
 * Allocate a status-VFX context that shares the scene's `vfxByUid` Map.
 * Mirrors the formation ctx shape so call sites can keep a stable field on
 * the scene (e.g. `this.statusVfx`).
 *
 * @param {import('../scenes/scene.js').Scene} scene
 * @returns {{ scene: import('../scenes/scene.js').Scene, vfxByUid: Map<string, Record<string, OngoingEntry>> }}
 */
export function createStatusVfxContext(scene) {
  if (!scene) throw new Error('createStatusVfxContext: scene is required');
  if (!scene.vfxByUid) throw new Error('createStatusVfxContext: scene.vfxByUid is required');
  return {
    scene,
    // Share the same Map instance so reads via ctx.vfxByUid and
    // scene.vfxByUid see the same entries.
    vfxByUid: scene.vfxByUid,
  };
}

/**
 * registerUpdater for the scene-ctx path — routes through scene.addUpdater
 * so scene.exit() drops the tick automatically. Returns the cancel function
 * returned by addUpdater. Callers see the same contract as the legacy
 * registerUpdater.
 *
 * Adapts PIXI's (dt, deltaMS) scene updater signature down to the
 * single-deltaMS scalar that the shared per-effect bodies expect.
 *
 * @param {import('../scenes/scene.js').Scene} scene
 */
function _sceneRegisterUpdaterFor(scene) {
  return (fnDeltaMS) => scene.addUpdater((_dt, deltaMS) => fnDeltaMS(deltaMS));
}

/**
 * Play the applied one-shot and start the ongoing visual on the scene's
 * uid-keyed sprite. Errors if `uid` is missing — scene callers always own a
 * uid for each creature; a missing uid indicates a wiring bug, not a fallback
 * case.
 *
 * @param {{ scene: import('../scenes/scene.js').Scene, vfxByUid: Map<string, Record<string, OngoingEntry>> }} ctx
 * @param {'player'|'enemy'} side - retained for parity with the legacy API
 *   even though uid alone identifies the sprite. Scene callers can and should
 *   pass the real side for clarity / future routing decisions.
 * @param {string} uid
 * @param {string} effectType
 * @returns {Promise<OngoingEntry|null>}
 */
export async function playStatusAppliedForScene(ctx, side, uid, effectType) {
  if (!uid) throw new Error('playStatusAppliedForScene: uid is required');
  // Guard: caller may have exited the scene between the event dispatch and
  // our invocation. addUpdater / addContainer would throw SceneDisposedError
  // post-exit; surface a null return instead to mirror the "sprite missing"
  // path.
  if (ctx.scene.disposed) return null;

  const sprite = ctx.scene.getSprite(uid);
  if (!sprite) return null;

  const effectsLayer = ctx.scene.layers?.effects;
  if (!effectsLayer) return null;

  // Don't double-start — align with legacy: return null, not the existing
  // entry. Callers only use the return value to distinguish "registered new
  // entry" from "nothing happened".
  let map = ctx.vfxByUid.get(uid);
  if (map && map[effectType]) return null;
  if (!map) {
    map = {};
    ctx.vfxByUid.set(uid, map);
  }

  // Register the ongoing BEFORE the one-shot to avoid the microtask-yield
  // race described on the legacy playStatusApplied above: a sync
  // clearStatusVfxForScene called after us must find the entry.
  const entry = _startOngoingInto(
    sprite,
    effectType,
    effectsLayer,
    _sceneRegisterUpdaterFor(ctx.scene),
  );
  if (entry) {
    map[effectType] = entry;
  }

  // Fire-and-forget the one-shot visual burst. Awaiting it would re-introduce
  // the microtask yield this reordering was meant to close. Catch to avoid
  // unhandled-rejection warnings.
  _playAppliedOneShot(sprite, effectType).catch(err => {
    console.error(`[status-vfx] _playAppliedOneShot threw for ${effectType}:`, err);
  });

  return entry;
}

/**
 * Remove ongoing VFX for one effect on one scene-tracked creature.
 * Errors if `uid` is missing — the scene path does not support side/index
 * fallbacks.
 *
 * @param {{ scene: import('../scenes/scene.js').Scene, vfxByUid: Map<string, Record<string, OngoingEntry>> }} ctx
 * @param {'player'|'enemy'} side - retained for parity; currently unused
 * @param {string} uid
 * @param {string} effectType
 */
// eslint-disable-next-line no-unused-vars
export function clearStatusVfxForScene(ctx, side, uid, effectType) {
  if (!uid) throw new Error('clearStatusVfxForScene: uid is required');
  // A disposed scene has already torn down its registry (cancelling ticker
  // updaters) and cleared vfxByUid in beforeExit. Nothing to do.
  if (ctx.scene.disposed) return;

  const map = ctx.vfxByUid.get(uid);
  if (!map || !map[effectType]) return;

  const entry = map[effectType];
  const sprite = ctx.scene.getSprite(uid);
  _teardownEntry(sprite, effectType, entry);

  delete map[effectType];
  if (Object.keys(map).length === 0) ctx.vfxByUid.delete(uid);
}
