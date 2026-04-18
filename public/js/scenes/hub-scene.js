import { Scene } from './scene.js';
import { Container } from 'pixi.js';
import {
  createFormationContext,
  spawnFormationSprite,
  removeFormationSprite,
  updateFormationSprite,
  destroyAllStatusLabels,
  _updateFormations,
} from '../pixi/formation.js';
import { setupCreatureRowListeners } from '../ui/creature-row.js';

/**
 * Lightweight scene mounted for phases that have no dedicated scene of their
 * own: boot / no_save / prologue / hub / area_selection / skillMaster.
 *
 * Exists to satisfy the PR-#2 invariant "there is always an active scene."
 * Provides the same layer surface as BattleScene / ExplorationScene so
 * showNpcSprite() and syncCreatures() calls route somewhere real instead of
 * bailing silently.
 *
 * Exploration-style player formation (wobble animation on) so the skillMaster
 * tutorial sees the fire creature sprite render next to its HP bar.
 */
export class HubScene extends Scene {
  constructor(app) {
    super('HubScene', app);

    this.layers = {
      background: this.addContainer(new Container(), app.stage),
      formations: this.addContainer(new Container(), app.stage),
      npcs:       this.addContainer(new Container(), app.stage),
      labels:     this.addContainer(new Container(), app.stage),
    };

    this.spritesByUid = new Map();
    this.formation = createFormationContext(this);
  }

  async onEnter({ allies = [] } = {}) {
    await this.syncCreatures({ allies, initial: true });
    this.formation.walkingEnabled = true;
    this.addUpdater((dt) => _updateFormations(this.formation, dt));
    setupCreatureRowListeners(this);
  }

  beforeExit() {
    // Status pills live on the global labels layer — see destroyAllStatusLabels.
    destroyAllStatusLabels(this.formation);
    this.spritesByUid.clear();
  }

  getSprite(uid) { return this.spritesByUid.get(uid); }

  async syncCreatures({ allies = [], initial = false } = {}) {
    this._guard('syncCreatures');
    await this._diff('player', allies, initial);
  }

  async _diff(side, creatures, _initial) {
    this._guard('_diff');
    const incomingUids = new Set(creatures.map(c => c.uid));
    const sideMap = this.formation.creatureSprites[side];

    for (const uid of [...sideMap.keys()]) {
      if (!incomingUids.has(uid)) {
        removeFormationSprite(this.formation, side, uid);
        this.spritesByUid.delete(uid);
      }
    }

    const slotFor = (i, total) => {
      if (total === 1) return 1;
      if (total === 2) return i === 0 ? 0 : 2;
      return i;
    };

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
            .catch(err => { console.error(`[HubScene] spawn failed for ${side}[${i}] uid=${c.uid}:`, err); })
        );
      }
    }
    await Promise.all(spawnPromises);

    this.formation.lastFormationInput[side] = { creatures, opts: { isBoss: false } };
  }
}
