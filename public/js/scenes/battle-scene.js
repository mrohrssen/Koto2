import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';

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
  }

  async onEnter({ allies = [], enemies = [], parallaxSpeed = 0 } = {}) {
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    await this.syncCreatures({ allies, enemies, initial: true });
  }

  beforeExit() {
    stopParallax();
    // Layers are tracked containers; registry disposes them after this hook.
    // Map.clear() just drops BattleScene's references — destruction is
    // authoritative via registry.dispose().
    this.spritesByUid.clear();
    this.hpBarsByUid.clear();
    this.pillsByUid.clear();
    this.vfxByUid.clear();
  }

  getSprite(uid) { return this.spritesByUid.get(uid); }

  // Stub — implemented in Task 9 once formation.js is stateless
  async syncCreatures({ allies = [], enemies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    // Filled in by Task 9, Step 6
  }
}
