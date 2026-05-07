import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SceneManager } from '../../../public/js/scenes/scene-manager.js';

function makeContainer(name) {
  return {
    name,
    children: [],
    addChild(child) {
      if (child.parent && child.parent !== this) child.parent.removeChild(child);
      if (!this.children.includes(child)) this.children.push(child);
      child.parent = this;
    },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
      if (child.parent === this) child.parent = null;
    },
    destroy({ children = false } = {}) {
      this.destroyed = true;
      if (children) {
        for (const child of [...this.children]) {
          if (typeof child.destroy === 'function') child.destroy();
          child.parent = null;
        }
        this.children = [];
      }
    },
  };
}

function makeSprite(name) {
  return {
    name,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeFormationScene() {
  const playerContainer = makeContainer('player');
  const enemyContainer = makeContainer('enemy');
  return {
    disposed: false,
    spritesByUid: new Map(),
    formation: {
      playerContainer,
      enemyContainer,
      creatureSprites: {
        player: new Map(),
        enemy: new Map(),
      },
    },
    exit() {
      this.disposed = true;
      playerContainer.destroy({ children: true });
      enemyContainer.destroy({ children: true });
    },
  };
}

function makeApp() {
  return {
    ticker: {
      add() {},
      remove() {},
    },
  };
}

describe('SceneManager.transition formation handoff', () => {
  it('carries active player sprites into the next scene before enter runs', async () => {
    const mgr = new SceneManager(makeApp());
    mgr.init();

    const source = makeFormationScene();
    const playerSprite = makeSprite('ally');
    const playerShadow = makeSprite('ally-shadow');
    const statusLabel = makeSprite('status-label');
    playerSprite._shadow = playerShadow;
    playerSprite.statusLabels = [statusLabel];
    source.formation.playerContainer.addChild(playerShadow);
    source.formation.playerContainer.addChild(playerSprite);
    source.formation.creatureSprites.player.set('ally-1', playerSprite);
    source.spritesByUid.set('ally-1', playerSprite);

    const enemySprite = makeSprite('enemy');
    source.formation.enemyContainer.addChild(enemySprite);
    source.formation.creatureSprites.enemy.set('enemy-1', enemySprite);

    let enteredScene = null;
    class NextScene {
      constructor() {
        enteredScene = this;
        this.disposed = false;
        this.spritesByUid = new Map();
        this.formation = {
          playerContainer: makeContainer('next-player'),
          enemyContainer: makeContainer('next-enemy'),
          creatureSprites: {
            player: new Map(),
            enemy: new Map(),
          },
        };
      }

      async enter() {
        this.sawPlayerSpriteDuringEnter = this.formation.creatureSprites.player.get('ally-1') === playerSprite;
        this.sawEnemySpriteDuringEnter = this.formation.creatureSprites.enemy.has('enemy-1');
      }

      exit() {
        this.disposed = true;
      }
    }

    mgr.currentScene = source;
    await mgr.transition(NextScene, { allies: [{ uid: 'ally-1' }] });

    assert.equal(enteredScene.sawPlayerSpriteDuringEnter, true);
    assert.equal(enteredScene.sawEnemySpriteDuringEnter, false, 'enemy sprites must not be carried between scenes');
    assert.equal(playerSprite.destroyed, false);
    assert.equal(playerShadow.destroyed, false);
    assert.equal(statusLabel.destroyed, true);
    assert.deepEqual(playerSprite.statusLabels, []);
    assert.equal(enemySprite.destroyed, true);
    assert.equal(playerSprite.parent, enteredScene.formation.playerContainer);
    assert.equal(playerShadow.parent, enteredScene.formation.playerContainer);
    assert.equal(enteredScene.formation.creatureSprites.player.get('ally-1'), playerSprite);
    assert.equal(enteredScene.spritesByUid.get('ally-1'), playerSprite);
  });
});
