import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import { startParallax, stopParallax } from '../pixi/parallax.js';
import { spawnNpcSprite, removeNpcSprite } from '../pixi/formation.js';

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
