import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';
import { spawnNpcSprite, removeNpcSprite } from '../pixi/formation.js';
import { setupCreatureRowListeners } from '../ui/creature-row.js';

export class ExplorationScene extends Scene {
  constructor(app) {
    super('ExplorationScene', app);

    this.layers = {
      world:   this.addContainer(new Container(), app.stage),
      npcs:    this.addContainer(new Container(), app.stage),
      overlay: this.addContainer(new Container(), app.stage),
    };

    this.roomId = null;
    this.discoveryState = {
      fetched: false,
      words: [],
      wordsLearned: 0,
      roomId: null,
    };
    this.shrineInProgress = false;
    this.npcSprite = null;
  }

  async onEnter({ roomId, parallaxSpeed = 0.6 } = {}) {
    this.roomId = roomId;
    if (parallaxSpeed > 0) startParallax(parallaxSpeed);
    setupCreatureRowListeners(this);
  }

  beforeExit() {
    stopParallax();
    if (this.npcSprite) {
      removeNpcSprite(this, this.npcSprite);
      this.npcSprite = null;
    }
  }

  async showNpcSprite(spritePath, opts = {}) {
    this._guard('showNpcSprite');
    // Remove any prior sprite before spawning a new one — matches legacy
    // _showNpcSprite behavior and prevents visible stacking if callers
    // invoke showNpcSprite twice without hideNpcSprite in between.
    if (this.npcSprite) {
      removeNpcSprite(this, this.npcSprite);
      this.npcSprite = null;
    }
    this.npcSprite = await spawnNpcSprite(this, spritePath, opts);
    return this.npcSprite;
  }

  hideNpcSprite() {
    this._guard('hideNpcSprite');
    if (this.npcSprite) {
      removeNpcSprite(this, this.npcSprite);
      this.npcSprite = null;
    }
  }
}
