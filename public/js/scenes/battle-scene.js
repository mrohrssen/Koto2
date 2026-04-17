import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';

export class BattleScene extends Scene {
  constructor(app) {
    super('BattleScene', app);

    // Sub-containers organized by z-order
    this.layers = {
      formations: this.addContainer(new Container()),
      effects:    this.addContainer(new Container()),
      labels:     this.addContainer(new Container()),
      overlay:    this.addContainer(new Container()),
    };
    // Mount layers under app.stage so they actually render
    app.stage.addChild(this.layers.formations);
    app.stage.addChild(this.layers.effects);
    app.stage.addChild(this.layers.labels);
    app.stage.addChild(this.layers.overlay);

    // Per-uid lookups
    this.spritesByUid = new Map();   // uid -> PIXI.Sprite
    this.hpBarsByUid  = new Map();   // uid -> DOM element
    this.pillsByUid   = new Map();   // uid -> PIXI.Container
    this.vfxByUid     = new Map();   // uid -> { stun?: handle, sleep?: ... }
  }

  async enter({ allies = [], enemies = [], parallaxSpeed = 0 } = {}) {
    super.enter();
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    await this.syncCreatures({ allies, enemies, initial: true });
  }

  beforeExit = () => {
    stopParallax();
    // Layers will be destroyed by the registry (they are tracked containers).
    // Lookup maps just go out of scope along with `this`.
    this.spritesByUid.clear();
    this.hpBarsByUid.clear();
    this.pillsByUid.clear();
    this.vfxByUid.clear();
  };

  getSprite(uid) { return this.spritesByUid.get(uid); }

  // Stub — implemented in Task 9 once formation.js is stateless
  async syncCreatures({ allies = [], enemies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    // Filled in by Task 9, Step 6
  }
}
