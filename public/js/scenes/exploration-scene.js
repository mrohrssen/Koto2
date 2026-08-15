import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax, isParallaxMoving, EXPLORATION_SCROLL_SPEED } from '../pixi/parallax.js';
import {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
  destroyAllStatusLabels,
  _updateFormations,
  setFormationTravelOffset,
} from '../pixi/formation.js';
import { setupCreatureRowListeners } from '../ui/creature-row.js';

function createDiscoveryState() {
  return {
    fetched: false,
    words: [],
    wordsLearned: 0,
    roomId: null,
    statusChecked: false,
    atLimit: false,
    todayCount: 0,
    dailyLimit: 10,
  };
}

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
    // exploration.js; keeping them on the scene lets room-transition reset
    // them without rebuilding the player formation sprites.
    this.discoveryState = createDiscoveryState();
    this.shrineInProgress = false;
  }

  async onEnter({ roomId = null, allies = [], parallaxSpeed = EXPLORATION_SCROLL_SPEED } = {}) {
    this.roomId = roomId;
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    // Spawn player formation sprites immediately so HP bars + sprites
    // appear together on room entry (fixes bug #1 and bug #6 — sprites
    // previously only rendered after BattleScene took over).
    await this.syncCreatures({ allies, initial: true });
    // Drive the walking wobble from the parallax motion state instead of
    // pinning it on for the whole scene. The wobble reads as "the creature
    // is walking" — we only want that while the battleground is actually
    // scrolling between rooms (scrollState='scrolling' or 'accelerating',
    // i.e. currentSpeed > 0). Once the player stops to talk to an NPC, hits
    // an encounter, or stands at the door, isParallaxMoving() flips false
    // and the sprite settles. Updater runs every frame, so the toggle is
    // live without any explicit setWalking calls from game code.
    this.addUpdater((dt) => {
      this.formation.walkingEnabled = isParallaxMoving();
      _updateFormations(this.formation, dt);
    });
    setupCreatureRowListeners(this);
  }

  async resetForRoom({ roomId = null, allies = [], parallaxSpeed = EXPLORATION_SCROLL_SPEED } = {}) {
    this._guard('resetForRoom');
    this.roomId = roomId;
    this.discoveryState = createDiscoveryState();
    this.shrineInProgress = false;
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    await this.hideNpcSprite();
    await this.syncCreatures({ allies, initial: true });
  }

  async playRoomTravel({ durationMs, waitFn }) {
    this._guard('playRoomTravel');
    const token = Symbol('roomTravel');
    this._roomTravelToken = token;
    // The room transition should read as movement through background parallax
    // and walking wobble only. Keep sprites anchored to their DOM HP/MP bars.
    setFormationTravelOffset(this.formation, 0);
    this.formation.walkingEnabled = true;

    await waitFn(durationMs);
    if (!this.disposed && !this._exiting && this._roomTravelToken === token) {
      this._roomTravelToken = null;
      setFormationTravelOffset(this.formation, 0);
    }
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
  async syncCreatures({ allies = [], initial = false, isCurrent = () => true } = {}) {
    if (!isCurrent() || this.disposed || this._exiting) return false;
    this._guard('syncCreatures');
    if (!await this._diff('player', allies, initial, isCurrent)) return false;
    return isCurrent() && !this.disposed && !this._exiting;
  }

  async _diff(side, creatures, _initial, isCurrent = () => true) {
    const sceneIsCurrent = () => isCurrent() && !this.disposed && !this._exiting;
    if (!sceneIsCurrent()) return false;
    this._guard('_diff');
    const incomingUids = new Set(creatures.map(c => c.uid));
    const sideMap = this.formation.creatureSprites[side];

    // Remove sprites for uids no longer present.
    for (const uid of [...sideMap.keys()]) {
      if (!sceneIsCurrent()) return false;
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
      if (!sceneIsCurrent()) return false;
      const c = creatures[i];
      const slotI = slotFor(i, total);
      const opts = { slotI, isBoss: false, skipEnter: true, isCurrent: sceneIsCurrent };
      if (sideMap.has(c.uid)) {
        if (!sceneIsCurrent()) return false;
        updateFormationSprite(this.formation, side, c, i, opts);
      } else {
        spawnPromises.push(
          spawnFormationSprite(this.formation, side, c, i, opts)
            .then(sprite => {
              if (!sprite) return;
              if (!sceneIsCurrent()) {
                if (sideMap.get(c.uid) === sprite) removeFormationSprite(this.formation, side, c.uid);
                return;
              }
              this.spritesByUid.set(c.uid, sprite);
            })
            .catch(err => {
              if (sceneIsCurrent()) {
                console.error(`[ExplorationScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err);
              }
            })
        );
      }
    }
    await Promise.all(spawnPromises);
    if (!sceneIsCurrent()) return false;

    this.formation.lastFormationInput[side] = { creatures, opts: { isBoss: false } };
    return true;
  }
}
