import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';
import {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
} from '../pixi/formation.js';
import { createStatusVfxContext } from '../pixi/status-vfx.js';
import { releaseAllInFlight as releaseAllParticles } from '../pixi/effects.js';

export class BattleScene extends Scene {
  constructor(app) {
    super('BattleScene', app);

    // Sub-containers organized by z-order. addContainer(c, app.stage) tracks
    // for disposal AND mounts to the stage in one call.
    this.layers = {
      formations: this.addContainer(new Container(), app.stage),
      effects:    this.addContainer(new Container(), app.stage),
      labels:     this.addContainer(new Container(), app.stage),
      overlay:    this.addContainer(new Container(), app.stage),
    };

    // Per-uid lookups
    this.spritesByUid = new Map();
    this.hpBarsByUid  = new Map();
    this.pillsByUid   = new Map();
    this.vfxByUid     = new Map();

    // Formation context — uid-keyed sprite storage + per-scene state. The
    // scene's formation tick is intentionally left unwired; Task 16 will
    // migrate combat-loop callers off the default ctx to this one atomically.
    this.formation = createFormationContext(this);

    // Status-VFX context — shares `this.vfxByUid` with the scene so scene-
    // facing callers (wired in Task 16) can tear down ongoing effects by uid.
    // No callers invoke this.statusVfx yet; the module's legacy exports still
    // back combat-loop/combat-vfx while the migration lands incrementally.
    this.statusVfx = createStatusVfxContext(this);
  }

  async onEnter({ allies = [], enemies = [], parallaxSpeed = 0 } = {}) {
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    await this.syncCreatures({ allies, enemies, initial: true });
  }

  beforeExit() {
    stopParallax();
    releaseAllParticles();
    // Layers are tracked containers; registry disposes them after this hook.
    // Map.clear() just drops BattleScene's references — destruction is
    // authoritative via registry.dispose().
    this.spritesByUid.clear();
    this.hpBarsByUid.clear();
    this.pillsByUid.clear();
    this.vfxByUid.clear();
  }

  getSprite(uid) { return this.spritesByUid.get(uid); }

  /**
   * Reconcile the scene's formation sprites against the provided creature
   * arrays. Spawns new sprites for unseen uids, updates in-place for known
   * uids, and removes sprites whose uid no longer appears.
   */
  async syncCreatures({ allies = [], enemies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    await this._diff('player', allies, initial);
    await this._diff('enemy', enemies, initial);
  }

  async _diff(side, creatures, _initial) {
    this._guard('_diff');
    const incomingUids = new Set(creatures.map(c => c.uid));
    const sideMap = this.formation.creatureSprites[side];

    // Remove sprites for uids no longer present.
    for (const uid of [...sideMap.keys()]) {
      if (!incomingUids.has(uid)) {
        removeFormationSprite(this.formation, side, uid);
        this.spritesByUid.delete(uid);
      }
    }

    // Spawn or update — spawns are async; run in parallel.
    // Each spawn is isolated via .catch so a single failure doesn't abort siblings.
    const spawnPromises = [];
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (sideMap.has(c.uid)) {
        updateFormationSprite(this.formation, side, c, i);
      } else {
        spawnPromises.push(
          spawnFormationSprite(this.formation, side, c, i)
            .then(sprite => { if (sprite) this.spritesByUid.set(c.uid, sprite); })
            .catch(err => { console.error(`[BattleScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err); })
        );
      }
    }
    await Promise.all(spawnPromises);

    // Track the last input so legacy-style (side, index) lookups via scene ctx
    // continue to work. Mirrors the default-ctx shape { creatures, opts }.
    this.formation.lastFormationInput[side] = { creatures, opts: {} };
  }
}
