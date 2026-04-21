import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';
import {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
  destroyAllStatusLabels,
  _updateFormations,
} from '../pixi/formation.js';
import { createStatusVfxContext } from '../pixi/status-vfx.js';
import { releaseAllInFlight as releaseAllParticles } from '../pixi/effects.js';
import { setupCreatureRowListeners } from '../ui/creature-row.js';

export class BattleScene extends Scene {
  constructor(app) {
    super('BattleScene', app);

    // Sub-containers organized by z-order. addContainer(c, app.stage) tracks
    // for disposal AND mounts to the stage in one call.
    this.layers = {
      formations: this.addContainer(new Container(), app.stage),
      effects:    this.addContainer(new Container(), app.stage),
      // NPC sprites live above formations/effects so mid-combat NPC intros
      // (e.g. playNpcSkillAnimation) render on top of creatures. Kept BELOW
      // labels so HP/status pill labels stay visible when an NPC is shown
      // while enemy creatures remain on screen. Base Scene owns the
      // showNpcSprite/hideNpcSprite API that targets this layer.
      npcs:       this.addContainer(new Container(), app.stage),
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

  async onEnter({ allies = [], enemies = [], parallaxSpeed = 0, isBoss = false } = {}) {
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    this._isBoss = !!isBoss;
    await this.syncCreatures({ allies, enemies, initial: true });
    this.addUpdater((dt) => _updateFormations(this.formation, dt));
    setupCreatureRowListeners(this);
  }

  beforeExit() {
    stopParallax();
    releaseAllParticles();
    // Pills are parented to the *global* labels layer (pixi/app.js), not to
    // this scene's container tree — registry.dispose() cascade won't reach
    // them. Tear them down explicitly here before the sprites that reference
    // them get destroyed below.
    destroyAllStatusLabels(this.formation);
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

    // 3-slot visual layout: 1 creature → middle, 2 → top+bottom, 3 → all.
    // Mirrors combat-dom::showFormation and the legacy _showFormation logic.
    const slotFor = (i, total) => {
      if (total === 1) return 1;
      if (total === 2) return i === 0 ? 0 : 2;
      return i;
    };

    // Boss sizing only applies to the enemy side when the encounter is a boss.
    // Player sprites stay at the normal size even in boss fights.
    const isBoss = !!this._isBoss && side === 'enemy';

    // Player sprites never slide in. Enemy sprites slide in on the initial
    // formation render; mid-combat additions (rare) are treated as already
    // in place. `_initial` mirrors the onEnter bootstrap vs. a later resync.
    const skipEnter = side === 'player' ? true : !_initial;

    // Spawn or update — spawns are async; run in parallel.
    // Each spawn is isolated via .catch so a single failure doesn't abort siblings.
    const total = creatures.length;
    const spawnPromises = [];
    for (let i = 0; i < total; i++) {
      const c = creatures[i];
      const slotI = slotFor(i, total);
      const opts = { slotI, isBoss, skipEnter };
      if (sideMap.has(c.uid)) {
        updateFormationSprite(this.formation, side, c, i, opts);
      } else {
        spawnPromises.push(
          spawnFormationSprite(this.formation, side, c, i, opts)
            .then(sprite => { if (sprite) this.spritesByUid.set(c.uid, sprite); })
            .catch(err => { console.error(`[BattleScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err); })
        );
      }
    }
    await Promise.all(spawnPromises);

    // Track the last input so legacy-style (side, index) lookups via scene ctx
    // continue to work. Mirrors the default-ctx shape { creatures, opts }.
    this.formation.lastFormationInput[side] = { creatures, opts: { isBoss } };
  }
}
