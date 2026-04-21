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
import { setupCreatureRowListeners } from '../ui/creature-row.js';

export class ExplorationScene extends Scene {
  constructor(app) {
    super('ExplorationScene', app);

    // Sub-containers organized by z-order. addContainer(c, app.stage) tracks
    // for disposal AND mounts to the stage in one call. The `npcs` layer
    // satisfies base Scene.showNpcSprite / hideNpcSprite requirements.
    this.layers = {
      world:      this.addContainer(new Container(), app.stage),
      formations: this.addContainer(new Container(), app.stage),
      npcs:       this.addContainer(new Container(), app.stage),
      overlay:    this.addContainer(new Container(), app.stage),
    };

    // Per-uid sprite lookups — mirror BattleScene for parity with combat-loop's
    // scene-facing helpers (getCreatureSpriteForScene, etc.).
    this.spritesByUid = new Map();

    // Formation context — exploration has no enemies, only allies. Created
    // unconditionally so ExplorationScene exposes the same `scene.formation`
    // surface that BattleScene does.
    this.formation = createFormationContext(this);

    this.roomId = null;
    // Word-discovery + shrine state used to live at module scope in
    // exploration.js; moving them onto the scene instance means the state
    // naturally resets when we transition to a new ExplorationScene (new
    // room), which was previously done by comparing a stored roomId.
    this.discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: null,
      statusChecked: false,
      atLimit: false,
      todayCount: 0,
      dailyLimit: 10,
    };
    this.shrineInProgress = false;
  }

  async onEnter({ roomId = null, allies = [], parallaxSpeed = 0.6 } = {}) {
    this.roomId = roomId;
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    // Spawn player formation sprites immediately so HP bars + sprites
    // appear together on room entry (fixes bug #1 and bug #6 — sprites
    // previously only rendered after BattleScene took over).
    await this.syncCreatures({ allies, initial: true });
    // Enable the walking wobble animation for exploration — player sprites
    // subtly bob + rotate as if walking through the room. BattleScene does
    // the same; in combat walking is toggled via setWalking() on the
    // default ctx. Here we keep the wobble on by default.
    this.formation.walkingEnabled = true;
    this.addUpdater((dt) => _updateFormations(this.formation, dt));
    setupCreatureRowListeners(this);
  }

  beforeExit() {
    stopParallax();
    // Tear down status pills — they're parented to the global labels layer,
    // not this scene's tree, so the registry cascade won't reach them.
    destroyAllStatusLabels(this.formation);
    // Layers are tracked containers; registry disposes them after this hook.
    // Map.clear() just drops ExplorationScene's references — destruction is
    // authoritative via registry.dispose(). npcSprite cleanup is handled by
    // the base Scene.exit() setting it to null (layer destroy cascades).
    this.spritesByUid.clear();
  }

  getSprite(uid) { return this.spritesByUid.get(uid); }

  /**
   * Reconcile the scene's player formation against the provided ally array.
   * Spawns new sprites for unseen uids, updates in-place for known uids, and
   * removes sprites whose uid no longer appears. Exploration has no enemy
   * side; callers may pass { enemies: [...] } for API parity with
   * BattleScene.syncCreatures — it's ignored.
   */
  async syncCreatures({ allies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    await this._diff('player', allies, initial);
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
    const slotFor = (i, total) => {
      if (total === 1) return 1;
      if (total === 2) return i === 0 ? 0 : 2;
      return i;
    };

    // Player sprites in exploration never slide in — they're already "there"
    // when the room loads. skipEnter=true mirrors BattleScene's player side.
    const total = creatures.length;
    const spawnPromises = [];
    for (let i = 0; i < total; i++) {
      const c = creatures[i];
      const slotI = slotFor(i, total);
      const opts = { slotI, isBoss: false, skipEnter: true };
      if (sideMap.has(c.uid)) {
        updateFormationSprite(this.formation, side, c, i, opts);
      } else {
        spawnPromises.push(
          spawnFormationSprite(this.formation, side, c, i, opts)
            .then(sprite => { if (sprite) this.spritesByUid.set(c.uid, sprite); })
            .catch(err => { console.error(`[ExplorationScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err); })
        );
      }
    }
    await Promise.all(spawnPromises);

    this.formation.lastFormationInput[side] = { creatures, opts: { isBoss: false } };
  }
}
